// =============================================================
// Vale Ferrado — mundo: regiões, trechos, obstáculos, nós e respawn
// =============================================================
'use strict';

const CITY_R = 22; // raio da cidade em metros
const NPCS = [
  { id: 'ferreiro', name: 'Seu Bento, o Ferreiro', role: 'Evolui o martelo',              x: -9, y: -5, color: '#c0502a' },
  { id: 'tropeira', name: 'Dona Cida, a Tropeira', role: 'Mineração, mochila, movimento e pulo', x: 9,  y: -5, color: '#3f7a4a' },
  { id: 'botica',   name: 'Zé da Botica',          role: 'Vende power-ups',               x: -9, y: 8,  color: '#7a3fa0' },
  { id: 'armazem',  name: 'Seu Lauro, do Armazém', role: 'Compra tudo automaticamente',   x: 9,  y: 8,  color: '#a07a2a' },
  { id: 'bazar',    name: 'Tonho do Bazar',        role: 'Detector, transporte e lanternas', x: 15, y: 1.5, color: '#2a7a9a' },
];

function rng(seed) { // gerador determinístico
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash2(x, y) { let h = (x * 374761393 + y * 668265263) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

const World = {
  subs: [],       // trechos (60 no total)
  obstacles: [],
  nodes: [],
  veio: null,     // evento de veio aflorado
  veioTimer: 300,

  build() {
    const rand = rng(20261016);
    this.subs = []; this.obstacles = []; this.nodes = [];
    for (const R of REGIONS) {
      const a = R.ang * Math.PI / 180;
      R.ux = Math.cos(a); R.uy = Math.sin(a);       // direção
      R.vx = -R.uy; R.vy = R.ux;                    // perpendicular
      R.res = RESOURCES.filter(r => r.region === R.id && !r.special);
      for (let k = 0; k < 10; k++) {
        const d0 = R.dMin + (R.dMax - R.dMin) * k / 10;
        const d1 = R.dMin + (R.dMax - R.dMin) * (k + 1) / 10;
        const w = 40 + d1 * 0.12;
        const level = (R.era - 1) * 10 + k + 1;
        const sub = { R, k, d0, d1, w, level, nodes: [], harvest: 0, spawnPts: [] };
        // obstáculo no fim dos trechos ímpares (atalho por cima com pulo)
        if (k % 2 === 1) {
          const idx = (k - 1) / 2; // 0..4
          const h = R.jMin + (R.jMax - R.jMin) * idx / 4;
          const thick = R.obstacle === 'penhasco' ? 4 : R.obstacle === 'bancada' ? 3 : 1.6;
          this.obstacles.push({ R, dc: d1 - thick / 2 - 0.5, t: thick, len: w * 0.72, pc: 0, h, type: R.obstacle });
        }
        const count = Math.max(8, Math.min(80, Math.round((d1 - d0) * w / 250)));
        sub.maxNodes = count;
        for (let i = 0; i < count * 3; i++) {
          const d = d0 + 2 + rand() * (d1 - d0 - 5);
          const p = (rand() - 0.5) * (w - 6);
          sub.spawnPts.push({ x: R.ux * d + R.vx * p, y: R.uy * d + R.vy * p, d, p, used: false });
        }
        this.subs.push(sub);
      }
    }
    this.buildMountains(rand);
    this.fitObstacles();
    // remove pontos de spawn dentro de obstáculos e nas montanhas (montanha só tem recurso raro)
    for (const s of this.subs) if (!s.mountain) s.spawnPts = s.spawnPts.filter(pt => !this.obstacles.some(o => o.R === s.R && Math.abs(pt.d - o.dc) < o.t / 2 + 2.5 && Math.abs(pt.p - o.pc) < o.len / 2 + 2) && this.mountainH(pt.x, pt.y) < 2);
    for (const s of this.subs) for (let i = 0; i < s.maxNodes; i++) this.spawn(s);
  },

  // ---------- montanhas ----------
  mountains: [],
  buildMountains(rand) {
    this.mountains = [];
    // [região, trecho (k), lado, altura, raio]
    const spec = [[0, 5, 1, 16, 42], [1, 2, -1, 30, 55], [1, 7, 1, 34, 58], [2, 3, 1, 38, 66], [2, 8, -1, 42, 70],
      [3, 2, -1, 48, 76], [3, 7, 1, 52, 80], [4, 3, 1, 60, 88], [4, 8, -1, 66, 92], [5, 2, -1, 78, 105], [5, 7, 1, 88, 115]];
    for (const [rid, k, side, H, r0] of spec) {
      const r = Math.max(r0, H * 2.4); // encosta no máximo ~32° para dar para subir andando
      const R = REGIONS[rid], d = R.dMin + (R.dMax - R.dMin) * (k + 0.5) / 10, w = 40 + d * 0.12;
      const p = side * (w / 2 + r * 0.15);
      const m = { R, x: R.ux * d + R.vx * p, y: R.uy * d + R.vy * p, H, r, seed: rand() * 100, special: rid >= 1 ? SPECIALS[rid - 1] : null, seen: false };
      this.mountains.push(m);
      if (!m.special) continue;
      // trecho especial da montanha: pontos de recurso perto do topo
      const sub = { R, k: -1, d0: 0, d1: 0, w: 0, level: m.special.ideal, nodes: [], harvest: 0, spawnPts: [], mountain: m, maxNodes: 3 };
      for (let i = 0; i < 14; i++) {
        const a = rand() * Math.PI * 2, rr = r * (0.06 + rand() * 0.32);
        const x = m.x + Math.cos(a) * rr, y = m.y + Math.sin(a) * rr, l = this.local(R, x, y);
        sub.spawnPts.push({ x, y, d: l.d, p: l.p, used: false });
      }
      m.sub = sub; this.subs.push(sub);
    }
  },
  // obstáculos não entram nas montanhas: fica só o maior trecho reto fora delas
  fitObstacles() {
    this.obstacles = this.obstacles.filter(o => {
      const half = o.len / 2, ok = [];
      for (let p = -half; p <= half; p += 0.5) {
        let free = true;
        for (const dd of [-o.t / 2, 0, o.t / 2]) { const x = o.R.ux * (o.dc + dd) + o.R.vx * p, y = o.R.uy * (o.dc + dd) + o.R.vy * p; if (this.mountainH(x, y) > 1.2) { free = false; break; } }
        ok.push(free);
      }
      let best = [0, -1], i = 0;
      while (i < ok.length) { if (!ok[i]) { i++; continue; } let j = i; while (j + 1 < ok.length && ok[j + 1]) j++; if (j - i > best[1] - best[0]) best = [i, j]; i = j + 1; }
      const a = -half + best[0] * 0.5, b = -half + best[1] * 0.5;
      if (b - a < 6) return false; // sobrou pouco: remove
      o.pc = (a + b) / 2; o.len = b - a;
      return true;
    });
  },
  // altura que a montanha soma ao terreno
  mountainH(x, y) {
    let h = 0;
    for (const m of this.mountains) {
      const dx = x - m.x, dy = y - m.y, d2 = dx * dx + dy * dy;
      if (d2 > m.r * m.r * 1.2) continue;
      const a = Math.atan2(dy, dx), wob = 1 + Math.sin(a * 3 + m.seed) * 0.12 + Math.sin(a * 7 + m.seed * 2) * 0.06;
      const t = Math.max(0, 1 - Math.sqrt(d2) / (m.r * wob));
      h = Math.max(h, m.H * t * t * (3 - 2 * t) * (0.96 + Math.sin(dx * 0.045 + m.seed) * Math.cos(dy * 0.04) * 0.04));
    }
    return h;
  },
  mountainAt(x, y) { for (const m of this.mountains) if (Math.hypot(x - m.x, y - m.y) < m.r * 0.95) return m; return null; },

  weights(sub) {
    return sub.R.res.map(r => {
      let w = Math.exp(-Math.abs(r.ideal - sub.level) / 2);
      if (this.veio && this.veio.res === r.id) w *= 5;
      return w;
    });
  },

  spawn(sub, forceRes) {
    const free = sub.spawnPts.filter(p => !p.used);
    if (!free.length) return false;
    const pt = free[Math.floor(Math.random() * free.length)];
    let res = forceRes || (sub.mountain && sub.mountain.special);
    if (!res) {
      const ws = this.weights(sub);
      let tot = ws.reduce((a, b) => a + b, 0), roll = Math.random() * tot; res = sub.R.res[0];
      for (let i = 0; i < ws.length; i++) { roll -= ws[i]; if (roll <= 0) { res = sub.R.res[i]; break; } }
    }
    const sr = Math.random();
    const size = sr < 0.3 ? 0.5 : sr < 0.85 ? 1 : 2;
    const rr = Math.random();
    const rare = rr < 0.005 ? 10 : rr < 0.035 ? 3 : 1;
    const hp = res.hard * size;
    pt.used = true;
    const node = { x: pt.x, y: pt.y, pt, sub, res, size, rare, hp, maxHp: hp, r: 0.9 + size * 0.7, seed: Math.random() * 1000, hitT: 0 };
    sub.nodes.push(node); this.nodes.push(node);
    return true;
  },
  // quantos nós de um recurso existem na região dele
  countRes(res) { let n = 0; for (const x of this.nodes) if (x.res === res) n++; return n; },
  // trecho da região com espaço livre e nível mais perto do ideal do recurso
  subFor(res) {
    let best = null, bd = Infinity;
    for (const s of this.subs) {
      if (s.mountain || s.R.id !== res.region || !s.spawnPts.some(p => !p.used)) continue;
      const d = Math.abs(s.level - res.ideal); if (d < bd) { bd = d; best = s; }
    }
    return best;
  },

  breakNode(node) {
    node.dead = true;
    node.pt.used = false;
    node.sub.nodes.splice(node.sub.nodes.indexOf(node), 1);
    this.nodes.splice(this.nodes.indexOf(node), 1);
    const sub = node.sub;
    sub.harvest += 1;
    if (sub.mountain) { Game.timers.push({ t: 90 + Math.random() * 60, fn: () => this.spawn(sub) }); return; } // recurso raro: renasce devagar
    const deplete = 1 + Math.min(0.5, sub.harvest * 0.05);
    // recurso acabando: renasce bem mais rápido e do mesmo tipo
    const left = node.res.special ? 1 : this.countRes(node.res);
    if (left === 0) { this.rescue[node.res.id] = true; Game.timers.push({ t: 3 + Math.random() * 3, fn: () => { delete this.rescue[node.res.id]; this.spawn(sub, node.res) || this.spawnRescue(node.res); } }); return; }
    if (left <= 2) { const force = Math.random() < 0.6 ? node.res : null; Game.timers.push({ t: (6 + Math.random() * 10), fn: () => this.spawn(sub, force) }); return; }
    const delay = (15 + Math.random() * 45) * deplete;
    Game.timers.push({ t: delay, fn: () => this.spawn(sub) });
  },

  rescue: {},
  spawnRescue(res) { const s = this.subFor(res); return s ? this.spawn(s, res) : false; },
  update(dt) {
    for (const s of this.subs) s.harvest = Math.max(0, s.harvest - dt / 20);
    // a cada 3 s: se algum recurso sumiu do mapa, agenda um renascimento rápido dele
    this.checkT = (this.checkT || 0) - dt;
    if (this.checkT <= 0) {
      this.checkT = 3;
      const count = {}; for (const x of this.nodes) count[x.res.id] = (count[x.res.id] || 0) + 1;
      for (const r of RESOURCES) if (!r.special && !count[r.id] && !this.rescue[r.id]) {
        this.rescue[r.id] = true;
        Game.timers.push({ t: 2 + Math.random() * 3, fn: () => { delete this.rescue[r.id]; this.spawnRescue(r); } });
      }
    }
    // veio aflorado
    if (this.veio) {
      this.veio.t -= dt;
      if (this.veio.t <= 0) { this.veio = null; this.veioTimer = 300 + Math.random() * 300; }
    } else {
      this.veioTimer -= dt;
      if (this.veioTimer <= 0) {
        const maxEra = Math.min(6, eraOf(Game.S.hammer) + 1);
        const cands = RESOURCES.filter(r => !r.special && REGIONS[r.region].era <= maxEra);
        const res = cands[Math.floor(Math.random() * cands.length)];
        const R = REGIONS[res.region];
        this.veio = { res: res.id, t: 120 };
        Snd.veio();
        UI.toast(`⛏ Veio de ${res.name} aflorou no ${R.dir} (${R.name})! Abundante por 2 min.`, 'veio');
        // troca alguns nós da região por esse recurso
        for (const s of this.subs) if (s.R === R) for (const n of s.nodes) if (Math.random() < 0.35 && n.hp === n.maxHp) { n.res = res; n.hp = n.maxHp = res.hard * n.size; }
      }
    }
  },

  // posição local (d = ao longo da direção, p = perpendicular) numa região
  local(R, x, y) { return { d: x * R.ux + y * R.uy, p: x * R.vx + y * R.vy }; },

  subAt(x, y) {
    for (const s of this.subs) {
      if (s.mountain) continue;
      const { d, p } = this.local(s.R, x, y);
      if (d >= s.d0 && d < s.d1 && Math.abs(p) <= s.w / 2) return s;
    }
    return null;
  },

  // relevo suave do terreno (plano na cidade)
  height(x, y) {
    const d = Math.hypot(x, y);
    const flat = Math.min(1, Math.max(0, (d - CITY_R - 4) / 30));
    if (flat <= 0) return 0;
    const amp = Math.min(5, 1.2 + d / 700);
    const h = Math.sin(x * 0.021 + 1.3) * Math.cos(y * 0.017 - 0.7) * 0.9
            + Math.sin(x * 0.0063 - y * 0.0051) * 1.4
            + Math.sin((x + y) * 0.047) * 0.25;
    // pequenos relevos e depressões
    const bumps = Math.sin(x * 0.11 + Math.sin(y * 0.07) * 2) * Math.cos(y * 0.095 + Math.sin(x * 0.05)) * 0.55
                + Math.sin(x * 0.23 - y * 0.19) * 0.18;
    const dip = Math.max(0, Math.sin(x * 0.031 + 2.1) * Math.sin(y * 0.027 - 0.4) - 0.55) * -4.5; // buracos rasos espalhados
    return (h * amp + bumps + dip) * flat * flat + this.mountainH(x, y);
  },

    // cor do chão (biome)
  groundAt(x, y) {
    const dist = Math.hypot(x, y);
    if (dist < CITY_R) return null; // cidade é desenhada à parte
    for (const R of REGIONS) {
      const { d, p } = this.local(R, x, y);
      const w = 40 + Math.min(d, R.dMax) * 0.12;
      if (d > R.dMin - 8 && d < R.dMax + 10 && Math.abs(p) < w / 2 + 6) {
        const edge = Math.abs(p) > w / 2 ? 0.5 : 1;
        return { R, edge };
      }
    }
    return null;
  },
};
