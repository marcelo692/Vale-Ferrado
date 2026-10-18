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
      R.res = RESOURCES.filter(r => r.region === R.id);
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
          this.obstacles.push({ R, dc: d1 - thick / 2 - 0.5, t: thick, len: w * 0.72, h, type: R.obstacle });
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
    // remove pontos de spawn dentro de obstáculos
    for (const s of this.subs) s.spawnPts = s.spawnPts.filter(pt => !this.obstacles.some(o => o.R === s.R && Math.abs(pt.d - o.dc) < o.t / 2 + 2.5 && Math.abs(pt.p) < o.len / 2 + 2));
    for (const s of this.subs) for (let i = 0; i < s.maxNodes; i++) this.spawn(s);
  },

  weights(sub) {
    return sub.R.res.map(r => {
      let w = Math.exp(-Math.abs(r.ideal - sub.level) / 2);
      if (this.veio && this.veio.res === r.id) w *= 5;
      return w;
    });
  },

  spawn(sub) {
    const free = sub.spawnPts.filter(p => !p.used);
    if (!free.length) return;
    const pt = free[Math.floor(Math.random() * free.length)];
    const ws = this.weights(sub);
    let tot = ws.reduce((a, b) => a + b, 0), roll = Math.random() * tot, res = sub.R.res[0];
    for (let i = 0; i < ws.length; i++) { roll -= ws[i]; if (roll <= 0) { res = sub.R.res[i]; break; } }
    const sr = Math.random();
    const size = sr < 0.3 ? 0.5 : sr < 0.85 ? 1 : 2;
    const rr = Math.random();
    const rare = rr < 0.005 ? 10 : rr < 0.035 ? 3 : 1;
    const hp = res.hard * size;
    pt.used = true;
    const node = { x: pt.x, y: pt.y, pt, sub, res, size, rare, hp, maxHp: hp, r: 0.9 + size * 0.7, seed: Math.random() * 1000, hitT: 0 };
    sub.nodes.push(node); this.nodes.push(node);
  },

  breakNode(node) {
    node.dead = true;
    node.pt.used = false;
    node.sub.nodes.splice(node.sub.nodes.indexOf(node), 1);
    this.nodes.splice(this.nodes.indexOf(node), 1);
    const sub = node.sub;
    sub.harvest += 1;
    const deplete = 1 + Math.min(0.5, sub.harvest * 0.05);
    const delay = (15 + Math.random() * 45) * deplete;
    Game.timers.push({ t: delay, fn: () => this.spawn(sub) });
  },

  update(dt) {
    for (const s of this.subs) s.harvest = Math.max(0, s.harvest - dt / 20);
    // veio aflorado
    if (this.veio) {
      this.veio.t -= dt;
      if (this.veio.t <= 0) { this.veio = null; this.veioTimer = 300 + Math.random() * 300; }
    } else {
      this.veioTimer -= dt;
      if (this.veioTimer <= 0) {
        const maxEra = Math.min(6, eraOf(Game.S.hammer) + 1);
        const cands = RESOURCES.filter(r => REGIONS[r.region].era <= maxEra);
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
    return h * amp * flat * flat;
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
