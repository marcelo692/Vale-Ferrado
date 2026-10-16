// =============================================================
// Vale Ferrado — lógica do jogo, economia e salvamento
// =============================================================
'use strict';

const SAVE_KEY = 'valeferrado_save_v1';
const GRAV = 20; // m/s²

function newState() {
  return {
    money: 0, earned: 0, hammer: 1,
    attrs: { mine: 1, bag: 1, move: 1, jump: 1 },
    bag: {},          // recursos na mochila {id: qtd}
    pw: [],           // power-ups na mochila [{id, tier}]
    stock: {},        // depósito na cidade (reserva para evoluções)
    active: [],       // power-ups ativos [{id, tier, left}]
    seen: {},         // marcos de história vistos
    time: 0, x: 0, y: 3,
  };
}

const Game = {
  S: null,
  P: { x: 0, y: 3, z: 0, vz: 0, face: 0, swing: 0, moving: false, walkT: 0 },
  keys: {}, mouse: { x: 0, y: 0, down: false, wx: 0, wy: 0 },
  timers: [], fx: [], floats: [],
  target: null, mineT: 0, inCity: true, wasInCity: true, saveT: 0, fullWarnT: 0,
  shake: 0, paused: false,

  init() {
    this.S = this.load() || newState();
    this.P.x = this.S.x; this.P.y = this.S.y;
    World.build();
    this.inCity = this.wasInCity = Math.hypot(this.P.x, this.P.y) < CITY_R;
    this.bindInput();
  },

  // ---------- atributos derivados ----------
  force() { return HAMMERS[this.S.hammer].f * this.mult('force'); },
  interval() { return attrValue('mine', this.S.attrs.mine) / this.mult('speed'); },
  capacity() { return attrValue('bag', this.S.attrs.bag); },
  speed() { return attrValue('move', this.S.attrs.move); },
  jumpH() { return attrValue('jump', this.S.attrs.jump); },
  used() {
    let n = 0; for (const k in this.S.bag) n += this.S.bag[k];
    for (const p of this.S.pw) n += POWERUPS[p.id].slots;
    return n;
  },
  free() { return this.capacity() - this.used(); },
  mult(kind) {
    let m = 1;
    for (const a of this.S.active) {
      const b = powerBonus(a.id, a.tier);
      if (kind === 'force' && (a.id === 'tonico' || a.id === 'elixir')) m *= 1 + b;
      if (kind === 'speed' && (a.id === 'cafe' || a.id === 'elixir')) m *= 1 + b;
    }
    return m;
  },
  reach() { return 2.4 + Math.min(2.5, this.S.hammer * 0.04); },

  // ---------- entrada ----------
  bindInput() {
    addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (UI.open) { if (k === 'escape' || k === 'e') UI.close(); return; }
      this.keys[k] = true;
      if (k === ' ') { e.preventDefault(); this.jump(); }
      if (k === 'e') this.interact();
      if (k === '1') this.activate('tonico');
      if (k === '2') this.activate('cafe');
      if (k === '3') this.activate('elixir');
    });
    addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    addEventListener('blur', () => { this.keys = {}; this.mouse.down = false; });
    const cv = document.getElementById('game');
    cv.addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    cv.addEventListener('mousedown', e => {
      if (UI.open) return;
      this.mouse.down = true;
      const npc = this.npcUnderMouse();
      if (npc) { this.mouse.down = false; if (this.npcNear() === npc) UI.openNpc(npc.id); else UI.toast('Chegue mais perto para falar com ' + npc.name.split(',')[0] + '.'); }
    });
    addEventListener('mouseup', () => { this.mouse.down = false; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
  },

  jump() {
    if (this.P.z <= 0.001) { this.P.vz = Math.sqrt(2 * GRAV * this.jumpH()); this.P.z = 0.001; }
  },

  npcNear() {
    let best = null, bd = 4;
    for (const n of NPCS) { const d = Math.hypot(n.x - this.P.x, n.y - this.P.y); if (d < bd) { bd = d; best = n; } }
    return best;
  },
  npcUnderMouse() {
    for (const n of NPCS) if (Math.hypot(n.x - this.mouse.wx, n.y - this.mouse.wy) < 1.6) return n;
    return null;
  },
  interact() {
    const n = this.npcNear();
    if (n) UI.openNpc(n.id);
  },

  // ---------- power-ups ----------
  activate(id) {
    const i = this.S.pw.findIndex(p => p.id === id);
    if (i < 0) { UI.toast(`Você não tem ${POWERUPS[id].name} na mochila. Compre no Zé da Botica.`); return; }
    // usa o de maior nível
    let best = i; this.S.pw.forEach((p, j) => { if (p.id === id && p.tier > this.S.pw[best].tier) best = j; });
    const p = this.S.pw.splice(best, 1)[0];
    const cur = this.S.active.find(a => a.id === id);
    if (cur) { cur.left += POWERUPS[id].dur; cur.tier = Math.max(cur.tier, p.tier); }
    else this.S.active.push({ id, tier: p.tier, left: POWERUPS[id].dur });
    UI.toast(`${POWERUPS[id].name} ${ROMAN[p.tier]} ativado! +${Math.round(powerBonus(id, p.tier) * 100)}%`, 'power');
  },

  // ---------- economia ----------
  needs() {
    const need = {};
    const add = c => c.mats.forEach(m => { need[m.id] = (need[m.id] || 0) + m.qty; });
    if (this.S.hammer < MAX_LEVEL) add(hammerCost(this.S.hammer + 1));
    for (const k in ATTRS) if (this.S.attrs[k] < MAX_LEVEL) add(attrCost(k, this.S.attrs[k] + 1));
    return need;
  },
  unload() {
    const ids = Object.keys(this.S.bag);
    if (!ids.length) return;
    const need = this.needs();
    let earned = 0, kept = 0, sold = 0;
    for (const id of ids) {
      const q = this.S.bag[id];
      const want = Math.max(0, (need[id] || 0) - (this.S.stock[id] || 0));
      const k = Math.min(want, Math.floor(q * 0.6)); // vende sempre pelo menos 40% de cada carga
      if (k > 0) { this.S.stock[id] = (this.S.stock[id] || 0) + k; kept += k; }
      const s = q - k;
      if (s > 0) { earned += s * RES[id].value; sold += s; }
    }
    this.S.bag = {};
    this.S.money += earned; this.S.earned += earned;
    let msg = `Seu Lauro comprou ${fmt(sold)} itens por ${fmt(earned)} moedas.`;
    if (kept) msg += ` ${fmt(kept)} guardados no depósito para suas evoluções.`;
    UI.toast(msg, 'money');
    if (earned) this.floats.push({ x: this.P.x, y: this.P.y - 2, txt: '+' + fmt(earned) + ' 🪙', c: '#ffd34d', t: 1.6 });
    this.save();
  },
  canPay(c) {
    if (this.S.money < c.money) return false;
    return c.mats.every(m => (this.S.stock[m.id] || 0) >= m.qty);
  },
  pay(c) {
    this.S.money -= c.money;
    c.mats.forEach(m => { this.S.stock[m.id] -= m.qty; });
  },
  buyHammer() {
    const L = this.S.hammer + 1; if (L > MAX_LEVEL) return;
    const c = hammerCost(L); if (!this.canPay(c)) return;
    this.pay(c); this.S.hammer = L;
    UI.toast(`Seu Bento forjou: ${HAMMERS[L].n}! Força ${fmt(HAMMERS[L].f)}.`, 'level');
    this.fxBurst(this.P.x, this.P.y, '#ffb347', 30);
    if (STORY[L] && !this.S.seen[L]) setTimeout(() => UI.story(L), 400);
    this.save();
  },
  buyAttr(key) {
    const L = this.S.attrs[key] + 1; if (L > MAX_LEVEL) return;
    const c = attrCost(key, L); if (!this.canPay(c)) return;
    this.pay(c); this.S.attrs[key] = L;
    UI.toast(`Dona Cida melhorou ${ATTRS[key].short}: nível ${L} (${attrLabel(key, L)}).`, 'level');
    this.fxBurst(this.P.x, this.P.y, '#7fd36a', 20);
    this.save();
  },
  buyPower(id) {
    const price = powerPrice(id, this.S.hammer);
    if (this.S.money < price) return;
    if (this.free() < POWERUPS[id].slots) { UI.toast('Sem espaço na mochila para esse power-up.'); return; }
    this.S.money -= price;
    this.S.pw.push({ id, tier: eraOf(this.S.hammer) });
    this.save();
  },

  // ---------- loop ----------
  update(dt) {
    const S = this.S, P = this.P;
    S.time += dt;
    // timers
    for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); } }
    World.update(dt);
    for (let i = S.active.length - 1; i >= 0; i--) { S.active[i].left -= dt; if (S.active[i].left <= 0) { UI.toast(`${POWERUPS[S.active[i].id].name} acabou.`); S.active.splice(i, 1); } }

    // mouse no mundo
    const cam = Render.cam;
    this.mouse.wx = (this.mouse.x - innerWidth / 2) / (PX * cam.zoom) + cam.x;
    this.mouse.wy = (this.mouse.y - innerHeight / 2) / (PX * cam.zoom) + cam.y;

    if (!UI.open) {
      // movimento
      let mx = 0, my = 0;
      if (this.keys['w'] || this.keys['arrowup']) my -= 1;
      if (this.keys['s'] || this.keys['arrowdown']) my += 1;
      if (this.keys['a'] || this.keys['arrowleft']) mx -= 1;
      if (this.keys['d'] || this.keys['arrowright']) mx += 1;
      const len = Math.hypot(mx, my);
      P.moving = len > 0;
      if (len) {
        mx /= len; my /= len;
        const sp = this.speed();
        this.moveBy(mx * sp * dt, 0); this.moveBy(0, my * sp * dt);
        P.face = Math.atan2(my, mx);
        P.walkT += dt * sp;
      }
    } else P.moving = false;

    // pulo
    if (P.z > 0) {
      P.vz -= GRAV * dt; P.z += P.vz * dt;
      if (P.z <= 0) { P.z = 0; P.vz = 0; this.pushOut(); this.fxBurst(P.x, P.y, '#b8a888', 5, 0.4); }
    }

    // cidade e venda automática
    this.inCity = Math.hypot(P.x, P.y) < CITY_R;
    if (this.inCity && !this.wasInCity) this.unload();
    if (this.inCity && Object.keys(S.bag).length) this.unload();
    this.wasInCity = this.inCity;

    // mineração
    this.pickTarget();
    const mining = !UI.open && this.target && (this.mouse.down || this.keys['e'] || this.keys['f']) && P.z === 0;
    if (mining) {
      P.face = Math.atan2(this.target.y - P.y, this.target.x - P.x);
      this.mineT += dt;
      const iv = this.interval();
      P.swing = Math.min(1, this.mineT / iv);
      while (this.mineT >= iv && this.target) { this.mineT -= iv; this.hit(this.target); }
    } else { this.mineT = Math.min(this.mineT, this.interval() * 0.6); P.swing = Math.max(0, P.swing - dt * 4); }

    // efeitos
    for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.t -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.vz -= 18 * dt; if (f.z < 0) { f.z = 0; f.vz *= -0.3; f.vx *= 0.6; f.vy *= 0.6; } if (f.t <= 0) this.fx.splice(i, 1); }
    for (let i = this.floats.length - 1; i >= 0; i--) { const f = this.floats[i]; f.t -= dt; f.y -= dt * 1.2; if (f.t <= 0) this.floats.splice(i, 1); }
    for (const n of World.nodes) n.hitT = Math.max(0, n.hitT - dt);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.fullWarnT = Math.max(0, this.fullWarnT - dt);

    S.x = P.x; S.y = P.y;
    this.saveT += dt; if (this.saveT > 5) { this.saveT = 0; this.save(); }
  },

  pickTarget() {
    const P = this.P, reach = this.reach();
    let best = null, bd = Infinity;
    // prioridade: nó sob o mouse
    for (const n of World.nodes) {
      const dm = Math.hypot(n.x - this.mouse.wx, n.y - this.mouse.wy);
      const dp = Math.hypot(n.x - P.x, n.y - P.y);
      if (dm < n.r + 0.4 && dp < reach + n.r) { this.target = n; return; }
      if (dp < reach + n.r && dp < bd) { bd = dp; best = n; }
    }
    this.target = best;
  },

  hit(n) {
    if (this.free() <= 0) {
      if (this.fullWarnT <= 0) { UI.toast('Mochila cheia! Volte à cidade para vender.', 'warn'); this.fullWarnT = 4; }
      this.mineT = 0; return;
    }
    const dmg = this.force();
    n.hp -= dmg; n.hitT = 0.15;
    this.shake = Math.min(1, this.shake + 0.15 + Math.min(0.4, this.S.hammer / 120));
    this.fxBurst(n.x, n.y, n.res.c2, 4 + Math.min(10, Math.floor(this.S.hammer / 6)), 0.8);
    if (this.mult('force') > 1) this.fxBurst(n.x, n.y, '#ff8a3d', 3, 0.6);
    if (n.hp <= 0) {
      const units = Math.max(1, Math.round(2 * n.size)) * n.rare;
      const got = Math.min(units, this.free());
      this.S.bag[n.res.id] = (this.S.bag[n.res.id] || 0) + got;
      let txt = `+${got} ${n.res.name}`;
      if (n.rare === 10) txt = '💎 CRISTALIZADO! ' + txt; else if (n.rare === 3) txt = '✨ Veio rico! ' + txt;
      this.floats.push({ x: n.x, y: n.y - 1, txt, c: n.rare > 1 ? '#ffe27a' : '#fff', t: 1.4 });
      if (got < units) UI.toast(`Mochila cheia: ${units - got} ${n.res.name} ficaram no chão.`, 'warn');
      this.fxBurst(n.x, n.y, n.res.c, 14, 1.4);
      World.breakNode(n);
      if (this.target === n) this.target = null;
    }
  },

  fxBurst(x, y, c, n, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (1 + Math.random() * 3) * power;
      this.fx.push({ x, y, z: 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 2 + Math.random() * 4 * power, c, t: 0.5 + Math.random() * 0.5, s: 0.1 + Math.random() * 0.15 });
    }
  },

  // ---------- colisão com obstáculos ----------
  moveBy(dx, dy) {
    const P = this.P;
    const nx = P.x + dx, ny = P.y + dy;
    for (const o of World.obstacles) {
      if (P.z >= o.h) continue;
      const { d, p } = World.local(o.R, nx, ny);
      if (Math.abs(d - o.dc) < o.t / 2 + 0.4 && Math.abs(p) < o.len / 2 + 0.4) return; // bloqueado
    }
    P.x = nx; P.y = ny;
  },
  pushOut() { // caiu em cima de um obstáculo: desliza para fora
    const P = this.P;
    for (const o of World.obstacles) {
      const { d, p } = World.local(o.R, P.x, P.y);
      if (Math.abs(d - o.dc) < o.t / 2 + 0.4 && Math.abs(p) < o.len / 2 + 0.4) {
        const nd = d < o.dc ? o.dc - o.t / 2 - 0.5 : o.dc + o.t / 2 + 0.5;
        P.x = o.R.ux * nd + o.R.vx * p; P.y = o.R.uy * nd + o.R.vy * p;
      }
    }
  },

  // ---------- salvamento ----------
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.S)); } catch (e) {} },
  load() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.hammer) return Object.assign(newState(), s); } catch (e) {}
    return null;
  },
  reset() { localStorage.removeItem(SAVE_KEY); location.reload(); },
};
