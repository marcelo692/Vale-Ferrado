// =============================================================
// Vale Ferrado — lógica do jogo, economia e salvamento
// =============================================================
'use strict';

const SAVE_KEY = 'valeferrado_save_v1';
const GRAV = 20; // m/s²
const CLICK_COST = 0.08;  // fôlego gasto por golpe de clique
const CLICK_CD = 0.35;    // clique pode golpear a cada 35% do intervalo normal (quase 3x mais rápido)
const SWING_ANIM = 0.16;  // duração da animação do golpe rápido

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
    gear: { detector: 0, ride: 0, light: 0 }, // equipamentos comprados no Bazar
    riding: false, lightOn: true, detOn: true, detRes: null, detAuto: true, sound: true,
    clock: 0.3,       // hora do dia (0 = meia-noite, 0.5 = meio-dia)
    showInv: true,    // tabela lateral de evoluções e materiais
  };
}

const Game = {
  S: null,
  P: { x: 0, y: 6, z: 0, vz: 0, face: 0, swing: 0, moving: false, walkT: 0, yaw: 0, pitch: -0.08, stamina: 1, tired: false, sprint: false },
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
  canClear(o) { return this.jumpH() >= o.h * 0.9; },
  isNight() { const c = this.S.clock; return c < 0.23 || c > 0.77; },
  reach() { return 2.4 + Math.min(2.5, this.S.hammer * 0.04); },

  // ---------- entrada ----------
  bindInput() {
    const cv = document.getElementById('game');
    this.locked = () => document.pointerLockElement === cv;
    addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (UI.open) { if (k === 'escape' || k === 'e') UI.close(); return; }
      if (k === ' ' || k === 'tab') e.preventDefault();
      this.keys[k] = true;
      if (k === ' ') this.jump();
      if (k === 'e') this.interact();
      if (k === 'v') Render.toggleView();
      if (k === 'b') { this.S.showBadges = this.S.showBadges === false; UI.toast(this.S.showBadges === false ? 'Etiquetas dos recursos escondidas (B mostra)' : 'Etiquetas dos recursos visíveis'); }
      if (k === 'i') { this.S.showInv = !this.S.showInv; Snd.toggle(this.S.showInv); }
      if (k === 'r') this.toggleRide();
      if (k === 'l') this.toggleLight();
      if (k === 'g') this.toggleDetector();
      if (k === 't') this.cycleDetector(e.shiftKey ? -1 : 1);
      if (k === 'k' && e.ctrlKey === false) { Backup.manual(); }
      if (k === 'm') { const on = Snd.toggleMute(); UI.toast(on ? 'Som ligado' : 'Som desligado'); }
      if (k === '1') this.activate('tonico');
      if (k === '2') this.activate('cafe');
      if (k === '3') this.activate('elixir');
    });
    addEventListener('keyup', e => { this.keys[e.key.toLowerCase()] = false; });
    addEventListener('blur', () => { this.keys = {}; this.mouse.down = false; });
    addEventListener('mousemove', e => {
      if (!this.locked()) return;
      let dx = e.movementX || 0, dy = e.movementY || 0;
      // o Chrome às vezes manda saltos gigantes no movimento do mouse (principalmente logo depois de prender o cursor)
      if (this.lookSkip > 0) { this.lookSkip--; return; }
      const mag = Math.hypot(dx, dy), avg = this.lookAvg || 8;
      if (mag > 180 && mag > avg * 6) return;          // salto anormal: descarta
      this.lookAvg = avg * 0.85 + Math.min(mag, 150) * 0.15;
      const k = 0.0022 * (this.S.sens || 1);
      this.P.yaw -= dx * k;
      this.P.pitch = Math.max(-1.45, Math.min(1.45, this.P.pitch - dy * k));
    });
    cv.addEventListener('mousedown', e => {
      if (UI.open) return;
      Snd.start();
      if (!this.locked()) { Game.lock(); return; }
      if (e.button === 0) { this.mouse.down = true; this.mouse.holdT = 0; this.clickStrike(); }
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.mouse.down = false; });
    document.addEventListener('pointerlockchange', () => { this.lookSkip = 3; this.lookAvg = 8; UI.lockHint(!this.locked() && !UI.open); if (!this.locked()) { this.mouse.down = false; this.keys = {}; } });
    cv.addEventListener('contextmenu', e => e.preventDefault());
  },

  // prende o mouse usando movimento "cru" (sem aceleração do sistema), que evita giros bruscos
  lock() {
    const cv = document.getElementById('game');
    try {
      const p = cv.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { cv.requestPointerLock(); } catch (e) {} });
    } catch (e) { try { cv.requestPointerLock(); } catch (e2) {} }
  },
  jump() {
    if (this.onGround()) { this.P.vz = Math.sqrt(2 * GRAV * this.jumpH()) * 1.04; this.P.z += 0.001; this.P.peak = this.P.z; Snd.jump(); }
  },

  // golpe por clique: mais rápido, mas gasta fôlego
  clickStrike() {
    const P = this.P, n = this.target;
    if (UI.open || !n || !this.onGround()) return;
    if (this.clickCD > 0) return;
    if (P.tired || P.stamina < CLICK_COST) {
      if (!this.noBreathT || this.S.time - this.noBreathT > 3) { this.noBreathT = this.S.time; UI.toast('Sem fôlego para golpes rápidos. Segure o clique para minerar sem cansar.', 'warn'); Snd.denied(); }
      return;
    }
    P.stamina -= CLICK_COST; this.lastClickT = this.S.time;
    if (P.stamina <= 0) { P.stamina = 0; P.tired = true; Snd.tired(); }
    this.clickCD = this.interval() * CLICK_CD;
    this.swingAnim = SWING_ANIM;
    this.mineT = 0;
    Snd.swing(true);
    this.hit(n);
  },

  npcNear() {
    let best = null, bd = 4;
    for (const n of NPCS) { const d = Math.hypot(n.x - this.P.x, n.y - this.P.y); if (d < bd) { bd = d; best = n; } }
    return best;
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
    Snd.power(id);
    UI.toast(`${POWERUPS[id].name} ${ROMAN[p.tier]} ativado! +${Math.round(powerBonus(id, p.tier) * 100)}%`, 'power');
  },

  // ---------- economia ----------
  // próximos equipamentos do Bazar que pedem recurso raro (só quando a região dele já está ao seu alcance)
  gadgetUps() {
    const out = [];
    for (const type in GADGETS) {
      const lv = this.S.gear[type] + 1, G = GADGETS[type].levels[lv];
      if (!G || !G.mats) continue;
      if (G.mats.every(m => eraOf(this.S.hammer) >= REGIONS[RES[m.id].region].era)) out.push({ label: G.n, c: { money: G.price, mats: G.mats } });
    }
    return out;
  },
  needs() {
    const need = {};
    const add = c => c.mats.forEach(m => { need[m.id] = (need[m.id] || 0) + m.qty; });
    if (this.S.hammer < MAX_LEVEL) add(hammerCost(this.S.hammer + 1));
    for (const k in ATTRS) if (this.S.attrs[k] < MAX_LEVEL) add(attrCost(k, this.S.attrs[k] + 1));
    for (const g of this.gadgetUps()) add(g.c);
    return need;
  },
  // quais evoluções usam cada material (para explicar ao jogador)
  needsBy() {
    const by = {};
    const add = (label, c) => c.mats.forEach(m => { (by[m.id] = by[m.id] || []).push(label); });
    if (this.S.hammer < MAX_LEVEL) add('Martelo nv ' + (this.S.hammer + 1), hammerCost(this.S.hammer + 1));
    for (const k in ATTRS) if (this.S.attrs[k] < MAX_LEVEL) add(ATTRS[k].short + ' nv ' + (this.S.attrs[k] + 1), attrCost(k, this.S.attrs[k] + 1));
    for (const g of this.gadgetUps()) add(g.label, g.c);
    return by;
  },
  unload() {
    const ids = Object.keys(this.S.bag);
    if (!ids.length) return;
    const need = this.needs(), by = this.needsBy();
    let earned = 0, kept = 0, sold = 0;
    const lines = [];
    for (const id of ids) {
      const q = this.S.bag[id];
      const want = Math.max(0, (need[id] || 0) - (this.S.stock[id] || 0));
      const cap = RES[id].special ? q : Math.floor(q * 0.6); // recurso raro: guarda tudo que for preciso
      const k = Math.min(want, cap); // vende sempre pelo menos 40% de cada carga
      if (k > 0) { this.S.stock[id] = (this.S.stock[id] || 0) + k; kept += k; }
      const sq = q - k, money = sq * RES[id].value;
      if (sq > 0) { earned += money; sold += sq; }
      let why;
      if (!need[id]) why = 'nenhuma evolução próxima usa';
      else if (want === 0) why = 'o depósito já tem o suficiente';
      else if (k < want) why = `guardei 60% da carga; faltam ${fmt(want - k)}`;
      else why = 'guardei tudo que faltava';
      lines.push({ id, q, k, sq, money, why, for: by[id] || [] });
    }
    this.S.bag = {};
    this.S.money += earned; this.S.earned += earned;
    const r = { lines, earned, kept, sold, t: Date.now() };
    this.S.receipts = [r, ...(this.S.receipts || [])].slice(0, 5);
    UI.showReceipt(r);
    if (earned) Snd.coins(earned); else if (kept) Snd.pickup();
    if (earned) this.floats.push({ x: this.P.x, y: this.P.y - 2, txt: '+' + fmt(earned) + ' moedas', c: '#ffd34d', t: 1.6 });
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
    this.pay(c); this.S.hammer = L; Snd.forge();
    UI.toast(`Seu Bento forjou: ${HAMMERS[L].n}! Força ${fmt(HAMMERS[L].f)}.`, 'level');
    this.fxBurst(this.P.x, this.P.y, '#ffb347', 30);
    if (STORY[L] && !this.S.seen[L]) setTimeout(() => UI.story(L), 400);
    this.save();
  },
  buyAttr(key) {
    const L = this.S.attrs[key] + 1; if (L > MAX_LEVEL) return;
    const c = attrCost(key, L); if (!this.canPay(c)) return;
    this.pay(c); this.S.attrs[key] = L; Snd.levelUp();
    UI.toast(`Dona Cida melhorou ${ATTRS[key].short}: nível ${L} (${attrLabel(key, L)}).`, 'level');
    this.fxBurst(this.P.x, this.P.y, '#7fd36a', 20);
    this.save();
  },
  buyPower(id) {
    const price = powerPrice(id, this.S.hammer);
    if (this.S.money < price) return;
    if (this.free() < POWERUPS[id].slots) { UI.toast('Sem espaço na mochila para esse power-up.'); return; }
    this.S.money -= price; Snd.buy();
    this.S.pw.push({ id, tier: eraOf(this.S.hammer) });
    this.save();
  },

  // ---------- equipamentos ----------
  buyGadget(type, lvl) {
    const G = GADGETS[type].levels[lvl], c = { money: G.price, mats: G.mats || [] };
    if (this.S.gear[type] >= lvl || !this.canPay(c)) return;
    this.pay(c); this.S.gear[type] = lvl; Snd.levelUp();
    if (type === 'ride') this.S.riding = true;
    if (type === 'light') this.S.lightOn = true;
    if (type === 'detector') { this.S.detOn = true; if (!this.S.detRes) this.S.detRes = this.defaultDetRes(); }
    UI.toast(`Você comprou: ${G.n}! (tecla ${GADGETS[type].key})`, 'level');
    this.save();
  },
  ride() { return this.S.riding && this.S.gear.ride ? GADGETS.ride.levels[this.S.gear.ride] : null; },
  toggleRide() {
    if (!this.S.gear.ride) { UI.toast('Você ainda não tem transporte. Veja o Tonho do Bazar.'); return; }
    this.S.riding = !this.S.riding; Snd.toggle(this.S.riding);
    UI.toast(this.S.riding ? `Em cima do ${GADGETS.ride.levels[this.S.gear.ride].n}` : 'A pé');
  },
  toggleLight() {
    if (!this.S.gear.light) { UI.toast('Você ainda não tem lanterna. Veja o Tonho do Bazar.'); return; }
    this.S.lightOn = !this.S.lightOn; Snd.toggle(this.S.lightOn); UI.toast(this.S.lightOn ? 'Luz ligada' : 'Luz desligada');
  },
  toggleDetector() {
    if (!this.S.gear.detector) { UI.toast('Você ainda não tem detector. Veja o Tonho do Bazar.'); return; }
    this.S.detOn = !this.S.detOn; Snd.toggle(this.S.detOn); UI.toast(this.S.detOn ? 'Detector ligado' : 'Detector desligado');
  },
  defaultDetRes() {
    const L = Math.min(MAX_LEVEL, this.S.hammer + 1);
    return HAMMERS[L].mat[0] || resourceForLevel(this.S.hammer).id;
  },
  // materiais que ainda faltam (descontando depósito e mochila), na ordem: martelo, mineração, mochila, movimento, pulo
  missingList() {
    const S = this.S, need = this.needs(), seen = new Set(), list = [];
    const ups = [];
    if (S.hammer < MAX_LEVEL) ups.push(hammerCost(S.hammer + 1));
    for (const k of ['mine', 'bag', 'move', 'jump']) if (S.attrs[k] < MAX_LEVEL) ups.push(attrCost(k, S.attrs[k] + 1));
    for (const g of this.gadgetUps()) ups.push(g.c);
    for (const c of ups) for (const m of c.mats) {
      if (seen.has(m.id)) continue; seen.add(m.id);
      const falta = need[m.id] - (S.stock[m.id] || 0) - (S.bag[m.id] || 0);
      if (falta > 0) list.push({ id: m.id, falta });
    }
    return list;
  },
  cycleDetector(dir) {
    if (!this.S.gear.detector) return;
    if (dir < 0) { this.S.detAuto = true; this.detT = 0; UI.toast('Detector no automático: procura o que falta para suas evoluções'); return; }
    const cur = this.S.detRes || this.defaultDetRes();
    const i = RESOURCES.findIndex(r => r.id === cur);
    this.S.detRes = this.S.detAuto ? cur : RESOURCES[(i + 1) % RESOURCES.length].id;
    this.S.detAuto = false; this.detT = 0;
    UI.toast('Detector manual: ' + RES[this.S.detRes].name + ' (T troca · Shift+T volta ao automático)');
  },
  nearestOf(id) {
    const P = this.P; let best = null, bd = Infinity;
    for (const n of World.nodes) { if (n.res.id !== id) continue; const d = Math.hypot(n.x - P.x, n.y - P.y); if (d < bd) { bd = d; best = n; } }
    return { best, bd };
  },
  updateDetector(dt) {
    this.detT = (this.detT || 0) - dt;
    if (this.detT > 0) return; this.detT = 0.25;
    const S = this.S, lv = S.gear.detector;
    if (!lv || !S.detOn) { this.det = null; return; }
    const G = GADGETS.detector.levels[lv];
    let target = null, missing = null, pos = 0;
    if (S.detAuto) {
      missing = this.missingList();
      if (!missing.length) { this.det = { auto: true, done: true }; return; }
      // o primeiro que falta; se ele não estiver no alcance, pula para o próximo que estiver
      for (let i = 0; i < missing.length; i++) { const f = this.nearestOf(missing[i].id); if (f.best && f.bd <= G.range) { target = { id: missing[i].id, falta: missing[i].falta, ...f }; pos = i; break; } }
      if (!target) { this.det = { auto: true, res: missing[0].id, falta: missing[0].falta, none: true, count: missing.length }; return; }
      if (S.detRes !== target.id && this.lastDet && this.lastDet !== target.id) Snd.toggle(true);
      S.detRes = target.id;
    } else {
      if (!S.detRes) S.detRes = this.defaultDetRes();
      const f = this.nearestOf(S.detRes);
      if (!f.best || f.bd > G.range) { this.det = { res: S.detRes, none: true }; return; }
      target = { id: S.detRes, ...f };
    }
    this.lastDet = target.id;
    const best = target.best, bd = target.bd;
    // direção aproximada: o erro diminui quando você chega perto
    const err = G.err * Math.min(1, bd / G.range + 0.15) * Math.sin(S.time * 0.7 + best.seed);
    const bearing = Math.atan2(best.y - this.P.y, best.x - this.P.x) + err;
    this.det = { res: target.id, dist: bd, bearing, strength: 1 - bd / G.range, lv, auto: S.detAuto, falta: target.falta, count: missing ? missing.length : 0, pos };
  },

  // ---------- loop ----------
  update(dt) {
    const S = this.S, P = this.P;
    S.time += dt;
    // timers
    for (let i = this.timers.length - 1; i >= 0; i--) { const t = this.timers[i]; t.t -= dt; if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); } }
    World.update(dt);
    const wasNight = this.isNight();
    S.clock = (S.clock + dt / DAY_LEN) % 1;
    if (!wasNight && this.isNight()) UI.toast(S.gear.light ? 'Anoiteceu. Aperte L para ligar sua luz.' : 'Anoiteceu! O Tonho do Bazar vende lanternas.', 'veio');
    if (wasNight && !this.isNight()) UI.toast('Amanheceu em Vale Ferrado.');
    this.updateDetector(dt);
    for (let i = S.active.length - 1; i >= 0; i--) { S.active[i].left -= dt; if (S.active[i].left <= 0) { UI.toast(`${POWERUPS[S.active[i].id].name} acabou.`); S.active.splice(i, 1); } }


    if (!UI.open) {
      // movimento relativo à câmera (W A S D)
      let fw = 0, st = 0;
      if (this.keys['w'] || this.keys['arrowup']) fw += 1;
      if (this.keys['s'] || this.keys['arrowdown']) fw -= 1;
      if (this.keys['d'] || this.keys['arrowright']) st += 1;
      if (this.keys['a'] || this.keys['arrowleft']) st -= 1;
      const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
      let mx = -sy * fw + cy * st, my = -cy * fw - sy * st;
      const len = Math.hypot(mx, my);
      P.moving = len > 0;
      // corrida com cansaço
      const ride = this.ride();
      // montanha: subir é lento e o Shift não funciona na subida
      let climb = 1; P.climbing = false;
      const mtn = World.mountainAt(P.x, P.y);
      if (len && mtn) {
        const lx = mx / len, ly = my / len, h0 = World.height(P.x, P.y), h1 = World.height(P.x + lx * 0.6, P.y + ly * 0.6);
        const slope = (h1 - h0) / 0.6;
        if (slope > 0.08) { P.climbing = true; climb = Math.max(0.2, 1 - slope * 1.4); if (ride && ride.free) climb = Math.max(climb, 0.55); }
        else if (slope < -0.25) climb = 1.1;
      }
      if (mtn && !mtn.seen) { mtn.seen = true; UI.toast(mtn.special ? `⛰ Montanha! Perto do topo tem ${mtn.special.name}, recurso raro que só existe aqui. Na subida o Shift não funciona e você anda devagar.` : '⛰ Morro: subir é devagar e o Shift não funciona na subida.', 'veio'); }
      const wantSprint = this.keys['shift'] && P.moving && fw > 0 && !(ride && ride.free) && !P.climbing;
      P.sprint = wantSprint && !P.tired && P.stamina > 0;
      if (P.sprint) { P.stamina -= dt / 6; if (P.stamina <= 0) { P.stamina = 0; P.tired = true; UI.toast('Você está cansado! Espere o fôlego voltar.', 'warn'); Snd.tired(); } }
      else if (this.S.time - (this.lastClickT || -9) > 1.2) { P.stamina = Math.min(1, P.stamina + dt / (P.moving ? 10 : 5)); if (P.tired && P.stamina > 0.35) P.tired = false; }
      if (len) {
        mx /= len; my /= len;
        const sp = this.speed() * (ride ? ride.mult : 1) * (P.sprint ? 1.75 : 1) * (P.tired && !ride ? 0.8 : 1) * climb;
        // passos pequenos para não atravessar obstáculos em alta velocidade
        const steps = Math.max(1, Math.ceil(sp * dt / 0.4));
        for (let i = 0; i < steps; i++) { this.moveBy(mx * sp * dt / steps, 0); this.moveBy(0, my * sp * dt / steps); }
        P.face = Math.atan2(my, mx);
        P.walkT += dt * sp;
        // passos
        if (this.onGround() && (!ride || this.S.gear.ride === 1)) {
          this.stepAcc = (this.stepAcc || 0) + sp * dt;
          const stride = ride ? 2.4 : P.sprint ? 1.9 : 1.5;
          if (this.stepAcc >= stride) { this.stepAcc = 0; Snd.step(this.surface(), P.sprint); }
        }
      }
      // limite do mundo
      const R = Math.hypot(P.x, P.y), LIM = 4300;
      if (R > LIM) { P.x *= LIM / R; P.y *= LIM / R; if (!this.limT || S.time - this.limT > 5) { this.limT = S.time; UI.toast('Daqui pra frente só há montanhas. Volte para o vale.'); } }
    } else { P.moving = false; P.sprint = false; }

    // pulo
    // pulo e queda: dá para subir em cima de troncos, muros e pedras e andar por cima deles
    const support = this.supportAt(P.x, P.y);
    if (P.z > support + 0.001 || P.vz > 0) {
      P.vz -= GRAV * dt; P.z += P.vz * dt; P.peak = Math.max(P.peak || 0, P.z);
      if (P.z <= support && P.vz <= 0) { const fall = (P.peak || 0) - support; P.z = support; P.vz = 0; this.fxBurst(P.x, P.y, '#b8a888', 5, 0.4); Snd.land(Math.max(0, fall)); }
    } else { P.z = support; P.vz = 0; }

    // cidade e venda automática
    this.inCity = Math.hypot(P.x, P.y) < CITY_R;
    if (this.inCity && !this.wasInCity) this.unload();
    if (this.inCity && Object.keys(S.bag).length) this.unload();
    this.wasInCity = this.inCity;

    // mineração
    this.target = UI.open ? null : Render.pickTarget(this.reach());
    // segurar = velocidade normal sem gastar fôlego; clicar = golpes rápidos que gastam fôlego (clickStrike)
    this.clickCD = Math.max(0, (this.clickCD || 0) - dt);
    this.swingAnim = Math.max(0, (this.swingAnim || 0) - dt);
    if (this.mouse.down) this.mouse.holdT = (this.mouse.holdT || 0) + dt;
    const holding = (this.mouse.down && this.mouse.holdT >= 0.3) || this.keys['f'] || (this.keys['e'] && !this.npcNear());
    const mining = !UI.open && this.target && holding && this.onGround();
    if (mining) {
      this.mineT += dt;
      const iv = this.interval();
      P.swing = Math.min(1, this.mineT / iv);
      while (this.mineT >= iv && this.target) { this.mineT -= iv; Snd.swing(false); this.hit(this.target); }
    } else if (this.swingAnim > 0) {
      P.swing = 1 - this.swingAnim / SWING_ANIM;
    } else { this.mineT = Math.min(this.mineT, this.interval() * 0.6); P.swing = Math.max(0, P.swing - dt * 4); }

    // som ambiente e música
    this.sndState = { dist: Math.hypot(P.x, P.y), night: this.isNight(), speed: P.moving ? this.speed() * ((this.ride() || {}).mult || 1) : 0, moving: P.moving, ride: this.ride() ? S.gear.ride : 0, river: this.riverNear() };
    Snd.update(dt, this.sndState);

    // efeitos
    for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.t -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.vz -= 18 * dt; if (f.z < 0) { f.z = 0; f.vz *= -0.3; f.vx *= 0.6; f.vy *= 0.6; } if (f.t <= 0) this.fx.splice(i, 1); }
    for (let i = this.floats.length - 1; i >= 0; i--) { const f = this.floats[i]; f.t -= dt; f.y -= dt * 1.2; if (f.t <= 0) this.floats.splice(i, 1); }
    for (const n of World.nodes) n.hitT = Math.max(0, n.hitT - dt);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.fullWarnT = Math.max(0, this.fullWarnT - dt);

    S.x = P.x; S.y = P.y;
    this.saveT += dt; if (this.saveT > 5) { this.saveT = 0; this.save(); }
  },

  surface() {
    if (this.inCity) return 'stone';
    const sub = World.subAt(this.P.x, this.P.y);
    if (!sub) return 'grass';
    return ['grass', 'grass', 'dirt', 'dirt', 'stone', 'crystal'][sub.R.id];
  },
  riverNear() {
    const R = REGIONS[1]; if (!R.ux) return 0;
    const { d, p } = World.local(R, this.P.x, this.P.y);
    if (d < R.dMin - 30 || d > R.dMax + 30) return 0;
    const rp = Math.sin(d / 37) * 30 + Math.sin(d / 13) * 6;
    return Math.max(0, 1 - Math.abs(p - rp) / 28);
  },

  hit(n) {
    if (this.free() <= 0) {
      if (this.fullWarnT <= 0) { UI.toast('Mochila cheia! Volte à cidade para vender.', 'warn'); this.fullWarnT = 4; Snd.warn(); }
      this.mineT = 0; return;
    }
    const dmg = this.force();
    n.hp -= dmg; n.hitT = 0.15;
    Snd.hit(n.res.kind, this.S.hammer, n.rare > 1);
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
      Snd.breakNode(n.res.kind, n.rare); Snd.pickup();
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
  inObstacle(o, x, y, m = 0.4) { const { d, p } = World.local(o.R, x, y); return Math.abs(d - o.dc) < o.t / 2 + m && Math.abs(p) < o.len / 2 + m; },
  // altura do chão sob o jogador (topo de um obstáculo, se estiver em cima dele)
  supportAt(x, y) {
    let h = 0;
    for (const o of World.obstacles) if (o.h > h && this.P.z >= o.h * 0.9 - 0.05 && this.inObstacle(o, x, y, 0.45)) h = o.h;
    return h;
  },
  onGround() { return this.P.vz <= 0 && this.P.z <= this.supportAt(this.P.x, this.P.y) + 0.01; },
  moveBy(dx, dy) {
    const P = this.P;
    const nx = P.x + dx, ny = P.y + dy;
    for (const o of World.obstacles) {
      if (P.z >= o.h * 0.9) continue; // está acima do obstáculo: pode passar (ou andar por cima)
      if (this.inObstacle(o, nx, ny)) return; // bloqueado
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
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.hammer) { const n = Object.assign(newState(), s); n.gear = Object.assign({ detector: 0, ride: 0, light: 0 }, s.gear || {}); return n; } } catch (e) {}
    return null;
  },
  reset() { localStorage.removeItem(SAVE_KEY); location.reload(); },
};
