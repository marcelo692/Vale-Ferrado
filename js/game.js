// =============================================================
// Vale Ferrado — lógica do jogo, economia e salvamento
// =============================================================
'use strict';

const SAVE_KEY = 'valeferrado_save_v1';
const GRAV = 20; // m/s²
const CLICK_COST = 0.08;  // fôlego gasto por golpe de clique
const CLICK_CD = 0.35;    // clique pode golpear a cada 35% do intervalo normal (quase 3x mais rápido)
const SWING_ANIM = 0.16;  // duração da animação do golpe rápido
const STEP_UP = 0.45;     // altura máxima que dá para subir andando (degrau baixinho)
const ROOF_T = 3;         // espessura da laje do teto da Mina Velha (topo = teto + 3)
const RECALL_LVL = 20;    // nível do martelo que libera o Voltar à cidade

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
    gear: { detector: 0, ride: 0, light: 0, climb: 0 }, // equipamentos comprados no Bazar
    ladders: [], tramps: [], // escadas e camas elásticas colocadas no mapa
    riding: false, lightOn: true, detOn: true, detRes: null, detAuto: true, sound: true,
    clock: 0.3,       // hora do dia (0 = meia-noite, 0.5 = meio-dia)
    showInv: true,    // tabela lateral de evoluções e materiais
    robots: 0,        // robôs auto-mineradores comprados
    cint: 3, olho: 0, // Cintilhas e nível do Olho de Garimpeiro
  };
}

// tecla pela POSIÇÃO no teclado (não pela letra): no AZERTY francês o lugar do W continua andando para frente
function keyOf(e) {
  const c = e.code || '';
  if (/^Key[A-Z]$/.test(c)) return c.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(c)) return c.slice(5);
  if (/^Numpad[0-9]$/.test(c)) return c.slice(6);
  if (c === 'Space') return ' ';
  return String(e.key || '').toLowerCase();
}

// save estragado ou de versão antiga: campo nulo, do tipo errado ou número inválido volta ao padrão
function sanitizeSave(s) {
  const d = newState(), n = Object.assign({}, d);
  for (const k in s) {
    const v = s[k], dv = d[k];
    if (v === null || v === undefined) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    if (dv !== undefined && dv !== null) {
      if (Array.isArray(dv) !== Array.isArray(v) || typeof dv !== typeof v) continue;
      if (typeof dv === 'object' && !Array.isArray(dv)) { n[k] = Object.assign({}, dv, v); for (const kk in n[k]) if (typeof dv[kk] === 'number' && !Number.isFinite(n[k][kk])) n[k][kk] = dv[kk]; continue; }
    }
    n[k] = v;
  }
  n.hammer = Math.max(1, Math.min(61, Math.floor(n.hammer) || 1));
  n.money = Math.max(0, n.money);
  for (const box of ['bag', 'stock']) for (const id in n[box]) if (!RES[id] || !(n[box][id] > 0)) delete n[box][id];
  return n;
}

const Game = {
  S: null,
  P: { x: 0, y: 6, z: 0, vz: 0, face: 0, swing: 0, moving: false, walkT: 0, yaw: 0, pitch: -0.08, stamina: 1, tired: false, sprint: false, vx: 0, vy: 0, bobAmp: 0 },
  keys: {}, mouse: { x: 0, y: 0, down: false, wx: 0, wy: 0 },
  timers: [], fx: [], floats: [],
  target: null, mineT: 0, inCity: true, wasInCity: true, saveT: 0, fullWarnT: 0,
  shake: 0, paused: false,

  init() {
    this.S = this.load() || newState();
    const lastSeen = this.S.lastSeen; // lido antes de qualquer salvamento
    this.P.x = this.S.x; this.P.y = this.S.y;
    World.build();
    this.fixSoldSpecials();
    Missions.init();
    Vendors.init();
    if (this.S.world) World.restore(this.S.world);
    World.setupSeal();
    // lanternas e drones saíram do jogo (v3.6): devolve o que o jogador pagou
    if (this.S.gear.light > 0) {
      const paid = [0, 150, 6000, 400000, 12000000].slice(1, this.S.gear.light + 1).reduce((a, b) => a + b, 0);
      this.S.money += paid; this.S.gear.light = 0; this.lightRefund = paid;
      setTimeout(() => UI.toast(tt("Lanternas e drones saíram do jogo. Devolvemos {0} moedas para você.", fmt(paid)), 'level'), 2500);
    }
    // robôs trabalhando com o jogo fechado (metade do ritmo, até 8 horas)
    const S = this.S;
    if ((S.robots || 0) > 0 && lastSeen && (S.robotTime || 0) > 60 && S.robotValue > 0) {
      const away = Math.min(8 * 3600, (Date.now() - lastSeen) / 1000);
      if (away > 120) { const perSec = Robots.rate() > 0 ? Robots.rate() / 60 : S.robotValue / S.robotTime, gain = Math.round(perSec * away * 0.5); if (gain > 0) { S.money += gain; S.earned += gain; this.offline = { gain, away, robots: S.robots }; } }
    }
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
  // cada clique rápido vale por vários golpes: sobe +1 a cada 5 níveis do martelo
  clickMult() { return 1 + Math.floor(this.S.hammer / 5); },
  reach() { return 2.4 + Math.min(2.5, this.S.hammer * 0.04); },

  // ---------- entrada ----------
  bindInput() {
    const cv = document.getElementById('game');
    this.locked = () => document.pointerLockElement === cv;
    addEventListener('keydown', e => {
      const k = keyOf(e);
      if (UI.open) { if (k === 'escape' || k === 'e' || (k === 'j' && UI.open === 'missions') || (k === 'tab' && UI.open === 'bag') || (k === 't' && UI.open === 'detector')) { e.preventDefault(); UI.close(k === 'escape'); } return; }
      if (k === ' ' || k === 'tab') e.preventDefault();
      if (Cine.busy()) { if (k !== 'escape') Cine.skip(); return; }
      this.keys[k] = true;
      if (k === 'h') this.recall();
      if (k === 'q') this.useHook();
      if (k === 'z') this.placeLadder();
      if (k === 'x') this.placeTramp();
      if (k === 'j') { Missions.panel(); return; }
      if (k === 'tab') { UI.bagPanel(); return; }
      if (this.travel) return; // voltando à cidade: controles travados
      if (k === ' ') this.jump();
      if (k === 'e') this.interact();
      if (k === 'v') Render.toggleView();
      if (k === 'b') { this.S.showBadges = this.S.showBadges === false; UI.toast(this.S.showBadges === false ? tt("Etiquetas dos recursos escondidas (B mostra)") : tt("Etiquetas dos recursos visíveis")); }
      if (k === 'i') { this.S.showInv = !this.S.showInv; Snd.toggle(this.S.showInv); }
      if (k === 'r') this.toggleRide();
      if (k === 'g' && !e.repeat) { this.gHold = setTimeout(() => { this.gHold = null; this.gMenu = true; UI.detectorPanel(); }, 400); }
      if (k === 't') UI.detectorPanel();
      if (k === 'n') this.cycleSellMode();
      if (k === 'u' && this.inCity) this.sellAllStock();
      if (k === 'k' && e.ctrlKey === false) { Backup.manual(); }
      if (k === 'm') { const on = Snd.toggleMute(); UI.toast(on ? tt("Som ligado") : tt("Som desligado")); }
      if (k === '1') this.activate('tonico');
      if (k === '2') this.activate('cafe');
      if (k === '3') this.activate('elixir');
    });
    addEventListener('keyup', e => { const k = keyOf(e); this.keys[k] = false; if (k === 'g') { if (this.gHold) { clearTimeout(this.gHold); this.gHold = null; if (!UI.open) this.toggleDetector(); } this.gMenu = false; } });
    addEventListener('blur', () => { this.keys = {}; this.mouse.down = false; });
    addEventListener('mousemove', e => {
      if (!this.locked() || this.travel || Cine.busy()) return;
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
      if (Cine.busy()) { Cine.skip(); return; }
      if (e.button === 0) { this.mouse.down = true; this.mouse.holdT = 0; this.clickStrike(); }
    });
    addEventListener('mouseup', e => { if (e.button === 0) this.mouse.down = false; });
    document.addEventListener('pointerlockchange', () => { this.lookSkip = 3; this.lookAvg = 8; UI.lockHint(!this.locked() && !UI.open); if (!this.locked()) { this.mouse.down = false; this.keys = {}; } });
    cv.addEventListener('contextmenu', e => e.preventDefault());
  },

  // prende o mouse usando movimento "cru" (sem aceleração do sistema), que evita giros bruscos
  lock() {
    const cv = document.getElementById('game');
    // o navegador só deixa prender o mouse depois de um clique/tecla do jogador; se recusar, o clique na tela prende depois
    const plain = () => { try { const q = cv.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) {} };
    try {
      const p = cv.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(plain);
    } catch (e) { plain(); }
  },
  jump() {
    if (this.ladder) { this.ladder = null; this.P.vz = 4; this.P.z += 0.01; return; }
    if (this.onGround() || (this.coyote > 0 && this.P.vz <= 0 && !this.travel && !this.hook)) { this.P.vz = Math.sqrt(2 * GRAV * this.jumpH()) * 1.012; this.P.z += 0.001; this.P.peak = this.P.z; this.coyote = 0; this.jumpBuf = 0; Snd.jump(); }
    else if (!this.travel) this.jumpBuf = 0.12;
  },

  // golpe por clique: mais rápido, mas gasta fôlego
  clickStrike() {
    const P = this.P, n = this.target;
    if (UI.open || !n || !this.onGround() || this.travel) return;
    if (this.clickCD > 0) return;
    if (P.tired || P.stamina < CLICK_COST) {
      if (!this.noBreathT || this.S.time - this.noBreathT > 3) { this.noBreathT = this.S.time; UI.toast(tt("Sem fôlego para golpes rápidos. Segure o clique para minerar sem cansar."), 'warn'); Snd.denied(); }
      return;
    }
    P.stamina -= CLICK_COST; this.lastClickT = this.S.time; this.S.stats.clicks++;
    if (P.stamina <= 0) { P.stamina = 0; P.tired = true; Snd.tired(); }
    this.clickCD = this.interval() * CLICK_CD;
    this.swingAnim = SWING_ANIM;
    this.mineT = 0;
    Snd.swing(true);
    const m = this.clickMult();
    if (m > 1 && !n.dead) this.floats.push({ x: n.x + (Math.random() - 0.5), y: n.y - 0.5, txt: '×' + m, c: '#ffb347', t: 0.6 });
    // o golpe acerta quando o martelo desce (animação rápida de ~0,07 s)
    Render.clickSwing();
    this.timers.push({ t: 0.07, fn: () => { if (!n.dead) this.hit(n, m, true); } });
  },

  npcNear() {
    let best = null, bd = 4;
    for (const n of NPCS) { if (!Vendors.isOpen(n.id)) continue; const d = Math.hypot(n.x - this.P.x, n.y - this.P.y); if (d < bd) { bd = d; best = n; } }
    return best;
  },
  interact() {
    const n = this.npcNear();
    if (n) UI.openNpc(n.id); else if (Daily.near()) Daily.open(); else if (this.pickNear()) this.takePick61();
  },

  // ---------- power-ups ----------
  activate(id) {
    const i = this.S.pw.findIndex(p => p.id === id);
    if (i < 0) { UI.toast(tt("Você não tem {0} na mochila. Compre no Zé da Botica.", POWERUPS[id].name)); return; }
    // usa o de maior nível
    let best = i; this.S.pw.forEach((p, j) => { if (p.id === id && p.tier > this.S.pw[best].tier) best = j; });
    const p = this.S.pw.splice(best, 1)[0]; this.S.stats.powers++;
    const cur = this.S.active.find(a => a.id === id);
    if (cur) { cur.left += POWERUPS[id].dur; cur.tier = Math.max(cur.tier, p.tier); }
    else this.S.active.push({ id, tier: p.tier, left: POWERUPS[id].dur });
    Snd.power(id);
    UI.toast(tt("{0} {1} ativado! +{2}%", POWERUPS[id].name, ROMAN[p.tier], Math.round(powerBonus(id, p.tier) * 100)), 'power');
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
  // recursos raros: quanto ainda vai ser usado em TODAS as evoluções futuras (martelos e equipamentos de qualquer nível)
  specialNeed() {
    const out = {};
    for (let L = this.S.hammer + 1; L <= MAX_LEVEL; L++) if (SPECIAL_AT[L]) out[SPECIAL_AT[L]] = (out[SPECIAL_AT[L]] || 0) + 5;
    for (const type in GADGETS) GADGETS[type].levels.forEach((G, lv) => { if (G && G.mats && lv > this.S.gear[type]) G.mats.forEach(m => { out[m.id] = (out[m.id] || 0) + m.qty; }); });
    return out;
  },
  // quanto guardar de cada material: comum = o que falta para a próxima evolução; raro = tudo que ainda vai ser usado
  keepWant(id, need, sneed) {
    if (RES[id].special) return Math.max(0, (sneed[id] || 0) - (this.S.stock[id] || 0));
    return Math.max(0, (need[id] || 0) - (this.S.stock[id] || 0));
  },
  // modo de entrega na vila: 'sobra' guarda o que as evoluções precisam e vende o resto; 'guardar' guarda tudo; 'vender' vende tudo
  sellMode() { return this.S.sellMode || 'sobra'; },
  keepCap(id, q) { const m = this.sellMode(); return m === 'guardar' ? q : m === 'vender' ? 0 : RES[id].special || this.S.hammer < 6 ? q : Math.floor(q * 0.6); }, // 'sobra': até 60% (para sempre entrar dinheiro)
  cycleSellMode() {
    const order = ['sobra', 'guardar', 'vender'], m = order[(order.indexOf(this.sellMode()) + 1) % 3];
    this.S.sellMode = m; Snd.toggle(true); if (this.unloadT !== undefined) this.unloadT = Math.max(this.unloadT, 1.2);
    UI.toast(tt("Na vila: ") + SELL_MODES[m]); this.save();
  },
  // vende todo o depósito de uma vez (ex.: depois de guardar e tomar um power-up)
  sellAllStock() {
    const S = this.S, need = this.needs(); let money = 0, n = 0, reserved = 0;
    for (const id in S.stock) { const q = S.stock[id]; if (!q) continue; money += q * RES[id].value; n += q; reserved += Math.min(q, need[id] || 0); delete S.stock[id]; }
    if (!n) { UI.toast(tt("O depósito está vazio.")); return; }
    S.money += money; S.earned += money; Snd.coins(money);
    UI.toast(tt("💰 Vendeu tudo do depósito: {0} recursos por {1} moedas.{2}", fmt(n), fmt(money), reserved ? tt(" ({0} deles iam para as evoluções)", fmt(reserved)) : ''), 'money');
    this.save();
  },
  mark(key) { const S = this.S; if (!S.ms) S.ms = {}; if (S.ms[key] === undefined) S.ms[key] = Math.round(S.time); },
  // quais evoluções usam cada material (para explicar ao jogador)
  needsBy() {
    const by = {};
    const add = (label, c) => c.mats.forEach(m => { (by[m.id] = by[m.id] || []).push(label); });
    if (this.S.hammer < MAX_LEVEL) add(tt("Martelo nv {0}", this.S.hammer + 1), hammerCost(this.S.hammer + 1));
    for (const k in ATTRS) if (this.S.attrs[k] < MAX_LEVEL) add(ATTRS[k].short + tt(" nv ") + (this.S.attrs[k] + 1), attrCost(k, this.S.attrs[k] + 1));
    for (const g of this.gadgetUps()) add(g.label, g.c);
    return by;
  },
  // prévia da venda: quanto o Seu Lauro pagaria pela mochila agora (mesma regra do unload)
  bagValue() {
    const need = this.needs(), sneed = this.specialNeed(); let money = 0, all = 0, kept = 0;
    const bag = Object.assign({}, this.S.bag), mission = Missions.consume(bag, true);
    const missionN = Object.values(mission).reduce((a, b) => a + b, 0);
    for (const id in bag) {
      const q = bag[id], want = this.sellMode() === 'guardar' ? q : this.keepWant(id, need, sneed);
      const k = Math.min(want, this.keepCap(id, q)), ord = Orders.take(id, q - k, true);
      money += (q - k - ord) * RES[id].value; all += q * RES[id].value; kept += k;
    }
    return { money, all, kept, mission: missionN };
  },
  unload() {
    if (!Object.keys(this.S.bag).length) return;
    const took = Missions.consume(this.S.bag); // missões pegam primeiro
    const ids = Object.keys(this.S.bag);
    if (!ids.length) { this.S.stats.sales++; this.mark('venda1'); Snd.pickup(); this.save(); return; }
    const mode = this.sellMode();
    const need = this.needs(), by = this.needsBy(), sneed = this.specialNeed();
    let earned = 0, kept = 0, sold = 0;
    const lines = [];
    for (const id of ids) {
      const q = this.S.bag[id];
      const want = mode === 'guardar' ? q : this.keepWant(id, need, sneed);
      const k = Math.min(want, this.keepCap(id, q));
      if (k > 0) { this.S.stock[id] = (this.S.stock[id] || 0) + k; kept += k; }
      const ord = Orders.take(id, q - k), sq = q - k - ord, money = sq * RES[id].value; // encomendas pegam do que ia ser vendido
      if (sq > 0) { earned += money; sold += sq; }
      let why;
      if (mode === 'guardar') why = tt("modo guardar tudo");
      else if (mode === 'vender') why = tt("modo vender tudo");
      else if (RES[id].special && sneed[id] && k > 0) why = tt("recurso raro: guardei para martelos e equipamentos futuros");
      else if (!need[id] && !(RES[id].special && sneed[id])) why = tt("nenhuma evolução próxima usa");
      else if (want === 0) why = tt("o depósito já tem o suficiente");
      else if (k < want) why = tt("guardei {0}; faltam {1}", this.S.hammer < 6 ? tt("o que veio") : tt("60% da carga, para sempre entrar dinheiro"), fmt(want - k));
      else why = tt("guardei tudo que faltava");
      lines.push({ id, q, k, sq, money, why, for: by[id] || [] });
    }
    this.S.bag = {};
    this.S.money += earned; this.S.earned += earned;
    if (lines.length) { this.S.stats.sales++; this.mark('venda1'); }
    const r = { lines, earned, kept, sold, t: Date.now(), mode, took };
    this.S.receipts = [r, ...(this.S.receipts || [])].slice(0, 5);
    UI.showReceipt(r);
    if (earned) Snd.coins(earned); else if (kept) Snd.pickup();
    if (earned) this.floats.push({ x: this.P.x, y: this.P.y - 2, txt: '+' + fmt(earned) + tt(" moedas"), c: '#ffd34d', t: 1.6 });
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
    this.pay(c); this.S.hammer = L; Snd.forge(); this.mark('martelo' + L);
    if ({ 20: 1, 40: 1, 50: 1, 60: 1 }[L]) setTimeout(() => UI.toast(L === 60 ? tt("🥚 O ovo de dragão está pronto para chocar! (o dragão chega numa próxima grande atualização)") : tt("🥚 Crack! O ovo de dragão da praça rachou mais um pouco…"), 'veio'), 2500);
    UI.toast(tt("Seu Bento forjou: {0}! Força {1}.", HAMMERS[L].n, fmt(HAMMERS[L].f)), 'level');
    this.fxBurst(this.P.x, this.P.y, '#ffb347', 30);
    if (L === RECALL_LVL) setTimeout(() => UI.toast(tt("🏠 Novo: botão Voltar à cidade (tecla H). Te leva de volta voando rapidinho, por uma taxa pequena."), 'level'), 1500);
    if (L % 10 === 0) Platform.happy();
    if (STORY[L] && !this.S.seen[L]) setTimeout(() => UI.story(L), 400);
    this.save();
  },
  buyAttr(key) {
    const L = this.S.attrs[key] + 1; if (L > MAX_LEVEL) return;
    const c = attrCost(key, L); if (!this.canPay(c)) return;
    this.pay(c); this.S.attrs[key] = L; Snd.levelUp();
    UI.toast(tt("Dona Cida melhorou {0}: nível {1} ({2}).", ATTRS[key].short, L, attrLabel(key, L)), 'level');
    this.fxBurst(this.P.x, this.P.y, '#7fd36a', 20);
    this.save();
  },
  buyPower(id) {
    const price = powerPrice(id, this.S.hammer), ci = powerCint(id, this.S.hammer);
    if (this.S.money < price) return;
    if ((this.S.cint || 0) < ci) { UI.toast(tt("Faltam Cintilhas: {0} custa {1} ✦.", POWERUPS[id].name, ci), 'warn'); return; }
    if (this.free() < POWERUPS[id].slots) { UI.toast(tt("Sem espaço na mochila para esse power-up.")); return; }
    this.S.money -= price; this.S.cint -= ci; Snd.buy();
    this.S.pw.push({ id, tier: eraOf(this.S.hammer) });
    this.save();
  },

  // ---------- voltar à cidade (a partir do martelo 20) ----------
  recallCost() { return Math.max(20, Math.round(hammerCost(Math.min(MAX_LEVEL, this.S.hammer)).money * 0.03)); },
  recall() {
    const P = this.P, S = this.S;
    if (this.travel || UI.open) return;
    if (S.hammer < RECALL_LVL) { UI.toast(tt("Voltar à cidade libera no martelo nível {0}.", RECALL_LVL)); return; }
    const d = Math.hypot(P.x, P.y);
    if (d < CITY_R + 2) { UI.toast(tt("Você já está na cidade.")); return; }
    const cost = this.recallCost();
    if (S.money < cost) { UI.toast(tt("Falta dinheiro para voltar: a taxa é {0} moedas.", fmt(cost)), 'warn'); Snd.denied(); return; }
    S.money -= cost;
    const ux = P.x / d, uy = P.y / d, ex = ux * 6, ey = uy * 6;
    this.travel = { sx: P.x, sy: P.y, ex, ey, t: 0, dur: Math.min(7, Math.max(2.2, d / 140)), yaw0: P.yaw, pitch0: P.pitch, yaw1: Math.atan2(ux, uy), dustT: 0 };
    this.mouse.down = false; this.target = null; P.vz = 0;
    Snd.recall(this.travel.dur);
    this.travel.cost = cost;
  },
  updateTravel(dt) {
    const T = this.travel, P = this.P;
    T.t += dt;
    const u = Math.min(1, T.t / T.dur), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; // acelera e freia
    const px = P.x, py = P.y;
    P.x = T.sx + (T.ex - T.sx) * e; P.y = T.sy + (T.ey - T.sy) * e;
    // câmera presa olhando para a cidade
    const k = Math.min(1, T.t / 0.35);
    let dy = T.yaw1 - T.yaw0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    P.yaw = T.yaw0 + dy * k; P.pitch = T.pitch0 + (-0.06 - T.pitch0) * k;
    // passa por cima dos obstáculos num arco baixo
    let top = 0; for (const o of World.obstacles) if (o.h > top && this.inObstacle(o, P.x, P.y, 1.2)) top = o.h;
    const want = top + Math.sin(u * Math.PI) * 1.4;
    P.z += (want - P.z) * Math.min(1, dt * 12); P.vz = 0;
    const v = Math.hypot(P.x - px, P.y - py) / Math.max(dt, 1e-4);
    P.moving = v > 0.5; P.sprint = v > 0.5; P.walkT += dt * Math.min(30, v * 0.3); P.speedNow = v;
    T.dustT -= dt; if (T.dustT <= 0 && v > 5) { T.dustT = 0.05; this.fxBurst(P.x, P.y, '#cdbb98', 3, 0.7); }
    if (u >= 1) {
      this.travel = null; P.z = 0; P.sprint = false; P.speedNow = 0;
      Snd.land(1.5); UI.toast(tt("Chegou na cidade!"));
    }
  },

  // ---------- equipamentos ----------
  buyGadget(type, lvl) {
    if (!GADGETS[type] || !GADGETS[type].levels[lvl]) return;
    const G = GADGETS[type].levels[lvl], c = { money: G.price, mats: G.mats || [] };
    if (this.S.gear[type] >= lvl || !this.canPay(c)) return;
    this.pay(c); this.S.gear[type] = lvl; Snd.levelUp();
    if (type === 'ride') this.S.riding = true;
    if (type === 'light') this.S.lightOn = true;
    if (type === 'detector') { this.S.detOn = true; if (!this.S.detRes) this.S.detRes = this.defaultDetRes(); }
    UI.toast(tt("Você comprou: {0}! (tecla {1})", G.n, GADGETS[type].key), 'level');
    this.save();
  },
  ride() { return this.S.riding && this.S.gear.ride ? GADGETS.ride.levels[this.S.gear.ride] : null; },
  toggleRide() {
    if (!this.S.gear.ride) { UI.toast(tt("Você ainda não tem transporte. Veja o Tonho do Bazar.")); return; }
    this.S.riding = !this.S.riding; Snd.toggle(this.S.riding);
    UI.toast(this.S.riding ? tt("Em cima do {0}", GADGETS.ride.levels[this.S.gear.ride].n) : tt("A pé"));
  },
  toggleLight() {
    if (!this.S.gear.light) { UI.toast(tt("Você ainda não tem lanterna. Veja o Tonho do Bazar.")); return; }
    this.S.lightOn = !this.S.lightOn; Snd.toggle(this.S.lightOn); UI.toast(this.S.lightOn ? tt("Luz ligada") : tt("Luz desligada"));
  },
  toggleDetector() {
    if (!this.S.gear.detector) { UI.toast(tt("Você ainda não tem detector. Sem ele a seta não aparece: veja o Tonho do Bazar.")); return; }
    this.S.detOn = !this.S.detOn; Snd.toggle(this.S.detOn); UI.toast(this.S.detOn ? tt("Detector ligado: a seta volta a guiar (segure G para escolher o que ela procura)") : tt("Detector desligado: a seta some"));
  },
  defaultDetRes() {
    const L = Math.min(MAX_LEVEL, this.S.hammer + 1);
    return HAMMERS[L].mat[0] || resourceForLevel(this.S.hammer).id;
  },
  // materiais que ainda faltam (descontando depósito e mochila), na ordem: martelo, mineração, mochila, movimento, pulo
  // tudo que as próximas evoluções pedem (martelo, atributos, itens) e o que falta de cada material
  // total = soma do que cada evolução consome (cada compra gasta o seu), menos o que já está guardado
  evoNeeds() {
    const S = this.S, ups = [];
    if (S.hammer < MAX_LEVEL) ups.push({ label: tt("Martelo"), kind: 'hammer', c: hammerCost(S.hammer + 1) });
    if (Vendors.isOpen('tropeira')) for (const k in ATTRS) if (S.attrs[k] < MAX_LEVEL) ups.push({ label: ATTRS[k].short, kind: k, c: attrCost(k, S.attrs[k] + 1) });
    if (Vendors.isOpen('bazar')) for (const g of this.gadgetUps()) ups.push({ label: g.label, kind: 'gadget', c: g.c });
    const need = new Map();
    for (const u of ups) {
      u.ok = S.money >= u.c.money && u.c.mats.every(m => (S.stock[m.id] || 0) >= m.qty);
      for (const m of u.c.mats) { const e = need.get(m.id) || { id: m.id, total: 0, f: [] }; e.total += m.qty; if (!e.f.includes(u.label)) e.f.push(u.label); need.set(m.id, e); }
    }
    const list = [];
    for (const e of need.values()) { e.have = S.stock[e.id] || 0; e.bag = S.bag[e.id] || 0; e.miss = Math.max(0, e.total - e.have); e.ideal = RES[e.id].ideal || 0; if (e.miss > 0) list.push(e); }
    list.sort((a, b) => a.ideal - b.ideal || b.miss - a.miss);
    // a "missão de evolução": o material mais barato (de nível mais baixo) que ainda falta; os do mesmo nível vão juntos
    const tier = list.length ? list.filter(e => e.ideal === list[0].ideal) : [];
    return { ups, list, tier, ready: ups.filter(u => u.ok).length };
  },
  missingList() {
    const S = this.S, need = this.needs(), seen = new Set(), list = [];
    const ups = [];
    if (S.hammer < MAX_LEVEL) ups.push(hammerCost(S.hammer + 1));
    for (const k of ['mine', 'bag', 'move', 'jump']) if (S.attrs[k] < MAX_LEVEL) ups.push(attrCost(k, S.attrs[k] + 1));
    if (Vendors.isOpen('bazar')) for (const g of this.gadgetUps()) ups.push(g.c);
    for (const c of ups) for (const m of c.mats) {
      if (seen.has(m.id)) continue; seen.add(m.id);
      const falta = need[m.id] - (S.stock[m.id] || 0) - (S.bag[m.id] || 0);
      if (falta > 0) list.push({ id: m.id, falta });
    }
    return list;
  },
  cycleDetector(dir) {
    if (!this.S.gear.detector) return;
    if (dir < 0) { this.S.detAuto = true; this.detT = 0; UI.toast(tt("Detector no automático: procura o que falta para suas evoluções")); return; }
    const cur = this.S.detRes || this.defaultDetRes();
    const i = RESOURCES.findIndex(r => r.id === cur);
    this.S.detRes = this.S.detAuto ? cur : RESOURCES[(i + 1) % RESOURCES.length].id;
    this.S.detAuto = false; this.detT = 0;
    UI.toast(tt("Detector manual: ") + RES[this.S.detRes].name + tt(" (T troca · Shift+T volta ao automático)"));
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
    Cine.update(dt); Vendors.update();
    Robots.update(dt);
    Missions.update(dt);
    const wasNight = this.isNight();
    S.clock = (S.clock + dt / DAY_LEN) % 1;
    if (!wasNight && this.isNight()) UI.toast(tt("Anoiteceu. Os minérios brilham mais no escuro."), 'veio');
    if (wasNight && !this.isNight()) UI.toast(tt("Amanheceu em Vale Ferrado."));
    for (let i = S.active.length - 1; i >= 0; i--) { S.active[i].left -= dt; if (S.active[i].left <= 0) { UI.toast(tt("{0} acabou.", POWERUPS[S.active[i].id].name)); S.active.splice(i, 1); } }


    const climbing = !this.travel && this.updateClimb(dt);
    this.updateJet(dt);
    if (this.travel) { this.updateTravel(dt); }
    else if (climbing) { /* gancho ou escada */ }
    else if (!UI.open) {
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
      if (mtn && !mtn.seen) { mtn.seen = true; UI.toast(mtn.special ? tt("⛰ Montanha! Perto do topo tem {0}, recurso raro que só existe aqui. Na subida o Shift não funciona e você anda devagar.", mtn.special.name) : tt("⛰ Morro: subir é devagar e o Shift não funciona na subida."), 'veio'); }
      const wantSprint = this.keys['shift'] && P.moving && fw > 0 && !(ride && ride.free) && !P.climbing;
      P.sprint = wantSprint && !P.tired && P.stamina > 0;
      if (P.sprint) { P.stamina -= dt / 6; if (P.stamina <= 0) { P.stamina = 0; P.tired = true; UI.toast(tt("Você está cansado! Espere o fôlego voltar."), 'warn'); Snd.tired(); } }
      else if (this.S.time - (this.lastClickT || -9) > 1.2) { P.stamina = Math.min(1, P.stamina + dt / (P.moving ? 10 : 5)); if (P.tired && P.stamina > 0.35) P.tired = false; }
      // aceleração suave: arranca e para em ~0,1 s (sem "liga/desliga" seco); no ar o controle é mais mole
      let sp = 0;
      if (len) { mx /= len; my /= len; sp = this.speed() * (ride ? ride.mult : 1) * (P.sprint ? 1.75 : 1) * (P.tired && !ride ? 0.8 : 1) * climb; }
      const tau = (len ? 0.075 : 0.055) * (this.onGround() ? 1 : 2.4), kv = 1 - Math.exp(-dt / tau);
      P.vx += (mx * sp - P.vx) * kv; P.vy += (my * sp - P.vy) * kv;
      const vs = Math.hypot(P.vx, P.vy);
      if (vs > 0.03) {
        // passos pequenos para não atravessar obstáculos em alta velocidade
        const steps = Math.max(1, Math.ceil(vs * dt / 0.4));
        for (let i = 0; i < steps; i++) { this.moveBy(P.vx * dt / steps, 0); this.moveBy(0, P.vy * dt / steps); }
        if (len) P.face = Math.atan2(my, mx);
        P.walkT += dt * vs;
        // passos
        if (len && this.onGround() && (!ride || this.S.gear.ride === 1)) {
          this.stepAcc = (this.stepAcc || 0) + vs * dt;
          const stride = ride ? 2.4 : P.sprint ? 1.9 : 1.5;
          if (this.stepAcc >= stride) { this.stepAcc = 0; Snd.step(this.surface(), P.sprint); }
        }
      } else { P.vx = P.vy = 0; }
      // limite do mundo
      const R = Math.hypot(P.x, P.y), LIM = 4300;
      if (R > LIM) { P.x *= LIM / R; P.y *= LIM / R; if (!this.limT || S.time - this.limT > 5) { this.limT = S.time; UI.toast(tt("Daqui pra frente só há montanhas. Volte para o vale.")); } }
    } else { P.moving = false; P.sprint = false; P.vx = P.vy = 0; }
    P.bobAmp += ((P.moving ? 1 : 0) - P.bobAmp) * Math.min(1, dt * 9);

    // pulo
    // pulo e queda: dá para subir em cima de troncos, muros e pedras e andar por cima deles
    const support = this.supportAt(P.x, P.y);
    if (support > 0 && !this.onObs) { this.onObs = true; this.S.stats.hops++; } else if (support <= 0) this.onObs = false;
    if (this.travel || this.hook || this.ladder) { /* voando de volta ou escalando */ }
    else if (P.z > support + 0.001 || P.vz > 0) {
      const g = GRAV * (P.vz < 0 ? 1.25 : 1); P.z += P.vz * dt - 0.5 * g * dt * dt; P.vz -= g * dt; // conta exata: o pulo tem a mesma altura em 30, 60, 144 ou 165 quadros por segundo P.peak = Math.max(P.peak || 0, P.z);
      if (P.z <= support && P.vz <= 0) { const fall = (P.peak || 0) - support; P.z = support; P.vz = 0; this.fxBurst(P.x, P.y, '#b8a888', 5, 0.4); Snd.land(Math.max(0, fall)); if (fall > 0.35) this.landDip = Math.min(0.3, 0.04 + fall * 0.045); }
    } else { P.z = support; P.vz = 0; }
    // teto da caverna: não deixa a cabeça atravessar a rocha (pulo, jetpack, cama elástica)
    { const ceil = World.ceilingAt(P.x, P.y); if (ceil !== null) { const g0 = World.height(P.x, P.y), maxZ = ceil - 1.85 - g0; if (maxZ > 0 && P.z > maxZ && g0 + P.z < ceil - 0.5) { P.z = maxZ; if (P.vz > 0) P.vz = 0; } } }

    this.landDip = (this.landDip || 0) * Math.exp(-dt * 9);
    // pulo mais perdoador: 0,1 s de tolerância ao sair de uma borda e 0,12 s de pulo antecipado
    this.coyote = this.onGround() ? 0.1 : Math.max(0, (this.coyote || 0) - dt);
    this.jumpBuf = Math.max(0, (this.jumpBuf || 0) - dt);
    if (this.jumpBuf > 0 && this.onGround() && !this.travel) { this.jumpBuf = 0; this.jump(); }

    // cidade e venda automática
    this.inCity = Math.hypot(P.x, P.y) < CITY_R;
    // entrega na vila: espera um instante (dá tempo de trocar o modo com N) e entrega conforme o modo
    if (this.inCity && Object.keys(S.bag).length && !this.travel) { if (this.unloadT === undefined) this.unloadT = 2.2; this.unloadT -= dt; if (this.unloadT <= 0) { this.unloadT = undefined; this.unload(); } }
    else this.unloadT = undefined;
    this.wasInCity = this.inCity;

    // mineração
    this.target = UI.open || this.travel ? null : Render.pickTarget(this.reach());
    // segurar = velocidade normal sem gastar fôlego; clicar = golpes rápidos que gastam fôlego (clickStrike)
    this.clickCD = Math.max(0, (this.clickCD || 0) - dt);
    this.swingAnim = Math.max(0, (this.swingAnim || 0) - dt);
    if (this.mouse.down) this.mouse.holdT = (this.mouse.holdT || 0) + dt;
    const holding = (this.mouse.down && this.mouse.holdT >= 0.3) || this.keys['f'] || (this.keys['e'] && !this.npcNear() && !this.pickNear());
    const mining = !UI.open && !this.travel && this.target && holding && this.onGround();
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

  hit(n, mult = 1, click = false) {
    // regra do nível: pedra muito acima do martelo não quebra; até 10 acima, demora mais
    if (n.res.sealed && this.S.hammer < 61) {
      if (!this.lockT || this.S.time - this.lockT > 2.5) { this.lockT = this.S.time; UI.toast(tt("🔒 A Pedra Selada só quebra com o Martelo 61."), 'warn'); }
      Snd.denied(); Snd.hit('scrap', 1, false); this.shake = Math.min(1, this.shake + 0.1); this.mineT = 0; return;
    }
    const rule = n.res.wild || n.res.sealed ? { mult: 1, blocked: false } : levelRule(n.res.ideal, this.S.hammer, n.res);
    if (rule.blocked) {
      if (!this.lockT || this.S.time - this.lockT > 2.5) { this.lockT = this.S.time; UI.toast(tt("🔒 {0} é nível {1}: precisa do Martelo {2} ou melhor.", n.res.name, n.res.ideal, n.res.ideal - LEVEL_LOCK), 'warn'); }
      Snd.denied(); Snd.hit('scrap', 1, false); this.shake = Math.min(1, this.shake + 0.1); this.mineT = 0; return;
    }
    if (n.res.id === 'geodo' && (this.S.cint || 0) < 1) {
      if (!this.lockT || this.S.time - this.lockT > 2.5) { this.lockT = this.S.time; UI.toast(tt("O Geodo de Poção abre com 1 Cintilha. Minere pedras para achar Cintilhas."), 'warn'); }
      Snd.denied(); this.mineT = 0; return;
    }
    if (this.free() <= 0 && !n.res.wild && !n.res.sealed) {
      if (this.fullWarnT <= 0) { UI.toast(tt("Mochila cheia! Volte à cidade para vender."), 'warn'); this.fullWarnT = 4; Snd.warn(); }
      this.mineT = 0; return;
    }
    const dmg = this.force() * mult / rule.mult;
    n.hp -= dmg; n.hitT = 0.15;
    Render.hitFx(n, { dmg, click, broke: n.hp <= 0 });
    Snd.hit(n.res.sealed ? 'crystal' : n.res.kind, Math.min(60, this.S.hammer), n.rare > 1);
    this.shake = Math.min(1, this.shake + 0.15 + Math.min(0.4, this.S.hammer / 120));
    this.fxBurst(n.x, n.y, n.res.c2, 4 + Math.min(10, Math.floor(this.S.hammer / 6)), 0.8);
    if (this.mult('force') > 1) this.fxBurst(n.x, n.y, '#ff8a3d', 3, 0.6);
    if (n.hp <= 0 && n.res.sealed) { this.breakSeal(n); return; }
    if (n.hp <= 0 && n.res.wild) { this.breakWild(n); return; }
    if (n.hp <= 0) {
      // chance de achar uma Cintilha dentro da pedra
      if (Math.random() < cintChance(this.S.olho) * (n.size >= 2 ? 1.5 : 1) * (n.rare > 1 ? 3 : 1)) this.gotCint(n.x, n.y, 1);
      const units = Math.max(1, Math.round(2 * n.size)) * n.rare;
      const got = Math.min(units, this.free());
      this.S.bag[n.res.id] = (this.S.bag[n.res.id] || 0) + got;
      this.S.stats.mined[n.res.id] = (this.S.stats.mined[n.res.id] || 0) + got; if (n.rare > 1) this.S.stats.veios++;
      let txt = `+${got} ${n.res.name}`;
      if (n.rare === 10) txt = tt("💎 CRISTALIZADO! ") + txt; else if (n.rare === 3) txt = tt("✨ Veio rico! ") + txt;
      this.floats.push({ x: n.x, y: n.y - 1, txt, c: n.rare > 1 ? '#ffe27a' : '#fff', t: 1.4 });
      if (got < units) UI.toast(tt("Mochila cheia: {0} {1} ficaram no chão.", units - got, n.res.name), 'warn');
      this.fxBurst(n.x, n.y, n.res.c, 14, 1.4);
      Snd.breakNode(n.res.kind, n.rare); Snd.pickup();
      World.breakNode(n);
      if (this.target === n) this.target = null;
    }
  },

  gotCint(x, y, q) {
    this.S.cint = (this.S.cint || 0) + q; this.S.stats.cint = (this.S.stats.cint || 0) + q;
    this.floats.push({ x, y: y - 0.6, txt: (q > 1 ? tt("✦ +{0} Cintilhas", q) : tt("✦ +{0} Cintilha", q)), c: '#9ff3ff', t: 1.8 });
    this.fxBurst(x, y, '#9ff3ff', 16, 1.2);
    [1568, 2093, 2637].forEach((f, i) => Snd.tone(f, 0.25, { vol: 0.07, type: 'triangle', at: i * 0.06 }));
  },
  breakWild(n) {
    const S = this.S;
    this.fxBurst(n.x, n.y, n.res.c, 30, 1.6); Snd.breakNode('crystal', 3);
    if (n.res.id === 'veiocint') this.gotCint(n.x, n.y, 3 + Math.floor(Math.random() * 4));
    else {
      S.cint -= 1;
      const ids = Object.keys(POWERUPS), id = ids[Math.floor(Math.random() * ids.length)], tier = eraOf(S.hammer);
      if (this.free() >= POWERUPS[id].slots) { S.pw.push({ id, tier }); UI.toast(tt("✦ O geodo tinha {0} {1}! Está na mochila (tecla {2}).", POWERUPS[id].name, ROMAN[tier], POWERUPS[id].key), 'level'); }
      else { S.active.push({ id, tier, left: POWERUPS[id].dur }); UI.toast(tt("✦ O geodo tinha {0}! Sem espaço na mochila: ativado na hora.", POWERUPS[id].name), 'level'); }
      Snd.power(id);
    }
    S.stats.wilds = (S.stats.wilds || 0) + 1;
    World.breakNode(n); if (this.target === n) this.target = null;
    this.save();
  },
  // a Pedra Selada da Zona 7 quebrou: a porta do dragão se abre uma fresta (segredo do jogo)
  breakSeal(n) {
    const S = this.S;
    this.fxBurst(n.x, n.y, '#ffd34d', 60, 2.2); this.fxBurst(n.x, n.y, '#c06af0', 40, 2.6); Snd.breakNode('crystal', 3);
    S.seal = 1; S.stats.seal = 1; this.gotCint(n.x, n.y, 30); this.shake = 1;
    World.breakNode(n); if (this.target === n) this.target = null;
    Render.openSeal(true);
    setTimeout(() => { UI.toast(tt("🐉 A porta se entreabriu… do outro lado, algo respira bem devagar. O dragão ainda dorme. Volte quando o ovo chocar."), 'level'); Snd.levelUp(); }, 900);
    Platform.happy(); this.save();
  },
  // Picareta 61 no pedestal da vila: só quem completou o Martelo 60 pode pegar
  pickNear() {
    const g = Render.pick61; if (!g || !g.visible || !this.inCity) return false;
    return Math.hypot(g.position.x - this.P.x, g.position.z - this.P.y) < 3.6;
  },
  takePick61() {
    const S = this.S;
    if (S.hammer < 60) { UI.toast(tt("🔒 A Picareta 61 está lacrada. Só quem completar o Martelo do Vale (nível 60) consegue tocá-la."), 'warn'); Snd.denied(); return; }
    if (S.hammer > 60) return;
    S.hammer = 61; Snd.forge(); Snd.levelUp(); this.mark('martelo61'); this.shake = 1;
    this.fxBurst(this.P.x, this.P.y, '#ffe27a', 50, 1.8);
    Render.pick61.visible = false; Render.pedestalLit = true;
    UI.toast(tt("✦ Você pegou a Picareta 61! Uma coluna de luz acendeu no Sudeste. Siga-a até a Zona 7."), 'level');
    if (!S.seen[61]) setTimeout(() => UI.story(61), 500);
    this.save();
  },
  buyOlho() {
    const L = (this.S.olho || 0) + 1; if (L >= OLHO.length || this.S.money < OLHO[L]) return;
    this.S.money -= OLHO[L]; this.S.olho = L; Snd.levelUp();
    UI.toast(tt("Olho de Garimpeiro nível {0}: {1}% de chance de Cintilha por pedra.", L, Math.round(cintChance(L) * 100 * 10) / 10), 'level'); this.save();
  },
  fxBurst(x, y, c, n, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (1 + Math.random() * 3) * power;
      this.fx.push({ x, y, z: 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 2 + Math.random() * 4 * power, c, t: 0.5 + Math.random() * 0.5, s: 0.1 + Math.random() * 0.15 });
    }
  },

  // ---------- colisão com obstáculos ----------
  inObstacle(o, x, y, m = 0.4) { const { d, p } = World.local(o.R, x, y); return Math.abs(d - o.dc) < o.t / 2 + m && Math.abs(p - o.pc) < o.len / 2 + m; },
  // altura do chão sob o jogador (topo de um obstáculo, se estiver em cima dele)
  supportAt(x, y, feet) {
    let h = 0;
    for (const o of World.obstacles) if (o.h > h && this.P.z >= o.h * 0.9 - 0.05 && this.inObstacle(o, x, y, 0.45)) h = o.h;
    // teto da caverna visto de fora: a laje é chão firme por cima (não dá para cair através dela)
    const c = World.ceilingAt(x, y);
    if (c !== null) { const g = World.height(x, y); if ((feet === undefined ? g + this.P.z : feet) >= c - 1) h = Math.max(h, c + ROOF_T - g); }
    return h;
  },
  onGround() { return this.P.vz <= 0 && this.P.z <= this.supportAt(this.P.x, this.P.y) + 0.01; },
  moveBy(dx, dy) {
    const P = this.P;
    const nx = P.x + dx, ny = P.y + dy;
    for (const o of World.solids) if (!(o.chest && !Daily.unlocked()) && Math.hypot(nx - o.x, ny - o.y) < o.r + 0.4) return;
    for (const o of World.obstacles) {
      if (P.z >= o.h * 0.9) continue; // está acima do obstáculo: pode passar (ou andar por cima)
      if (this.inObstacle(o, nx, ny)) return; // bloqueado
    }
    // degraus e paredes dos valões: subir andando só o que for baixinho; o resto é pulo, escada, gancho...
    const h0 = World.height(P.x, P.y), h1 = World.height(nx, ny), feet = h0 + P.z;
    const run = Math.hypot(dx, dy) || 0.01, rise = h1 - feet;
    { const c = World.ceilingAt(nx, ny); if (c !== null && feet > c - 1.85 && feet < c + ROOF_T - STEP_UP) { this.wallT = this.S.time; return; } } // lateral da laje do teto: parede
    if (rise > STEP_UP || (rise > 0.004 && rise / run > 1.1)) { this.wallT = this.S.time; return; } // parede: mais de ~48° não sobe andando
    // o corpo tem largura: não deixa encostar a cara na parede (senão a câmera entra nela)
    const px = nx + dx / run * 0.6, py = ny + dy / run * 0.6, hp = World.height(px, py);
    if (hp - feet > STEP_UP || (hp - feet > 0.05 && (hp - Math.max(h1, feet)) / 0.6 > 1.1)) { this.wallT = this.S.time; return; }
    const grounded = P.vz <= 0 && P.z <= this.supportAt(P.x, P.y) + 0.01;
    P.x = nx; P.y = ny;
    // em cima de tronco/muro: continua apoiado nele; fora dele, desce rampas e morros grudado no chão
    const sup = this.supportAt(nx, ny, feet);
    let z = feet - h1;
    if (z < sup) z = sup; else if (grounded && z - sup < 0.6) z = sup;
    if (z < 0) z = 0;
    P.z = z;
  },
  // ---------- escalada: gancho, escadas, cama elástica e jetpack ----------
  climbLv() { return this.S.gear.climb || 0; },
  // procura uma parede à frente e o topo dela (onde pisar)
  findLedge(maxDist, maxUp) {
    const P = this.P, fx = -Math.sin(P.yaw), fy = -Math.cos(P.yaw), feet = World.height(P.x, P.y) + P.z;
    let wall = -1;
    for (let d = 0.6; d <= maxDist; d += 0.3) { if (World.height(P.x + fx * d, P.y + fy * d) - feet > 0.6) { wall = d; break; } }
    if (wall < 0) return null;
    let e = wall, h = World.height(P.x + fx * e, P.y + fy * e);
    for (let i = 0; i < 60; i++) { const h2 = World.height(P.x + fx * (e + 0.3), P.y + fy * (e + 0.3)); if (h2 - h < 0.08) break; e += 0.3; h = h2; }
    const lx = P.x + fx * (e + 1), ly = P.y + fy * (e + 1), top = World.height(lx, ly);
    { const c = World.ceilingAt(lx, ly); if (c !== null && top > c - 1.85) return null; } // na Mina Velha a beirada fica embaixo do teto de rocha: não sobe por dentro dele
    if (top - feet > maxUp) return { tooHigh: true, rise: top - feet };
    return { wx: P.x + fx * Math.max(0.3, wall - 0.5), wy: P.y + fy * Math.max(0.3, wall - 0.5), lx, ly, top, base: World.height(P.x, P.y), rise: top - feet, yaw: P.yaw };
  },
  useHook() {
    if (this.climbLv() < 1) { UI.toast(tt("Você ainda não tem a corda com gancho. Veja o Tonho do Bazar (ITENS).")); return; }
    if (this.hook || this.travel || this.ladder || (this.hookCD || 0) > this.S.time) return;
    const L = this.findLedge(4, 6.2);
    if (!L) { UI.toast(tt("Nenhuma beirada à sua frente para o gancho.")); Snd.denied(); return; }
    if (L.tooHigh) { UI.toast(tt("Alto demais para o gancho ({0} m; ele alcança 6 m). Use escada, cama elástica ou jetpack.", L.rise.toFixed(1).replace('.', DEC)), 'warn'); Snd.denied(); return; }
    const P = this.P, feet = World.height(P.x, P.y) + P.z;
    this.hook = { sx: P.x, sy: P.y, sz: feet, tx: L.lx, ty: L.ly, tz: L.top, t: 0, dur: 0.5 + L.rise * 0.08 };
    this.hookCD = this.S.time + 1;
    Snd.noise(0.25, { vol: 0.12, f: 1200, fEnd: 3000, q: 0.8 }); Snd.tone(220, 0.2, { vol: 0.08, type: 'triangle', slide: 2, at: 0.2 });
  },
  placeLadder() {
    const lv = this.climbLv();
    if (lv < 2) { UI.toast(lv ? tt("Escadas são do Tonho do Bazar: Escada de cordas.") : tt("Você ainda não tem escada. Veja o Tonho do Bazar (ITENS).")); return; }
    const L = this.findLedge(2.5, 60);
    if (!L || L.tooHigh || L.rise < 1) { UI.toast(tt("Chegue de frente para uma parede para pendurar a escada.")); Snd.denied(); return; }
    const metal = lv >= 3, cap = metal ? 6 : 3, S = this.S;
    S.ladders.push({ x: L.wx, y: L.wy, yaw: L.yaw, h0: L.base, h1: L.top, tx: L.lx, ty: L.ly, metal });
    while (S.ladders.length > cap) S.ladders.shift();
    Snd.forge(); UI.toast(tt("{0} pendurada ({1}/{2}). Ande de frente para ela para subir.", metal ? tt("Escada de metal") : tt("Escada de cordas"), S.ladders.length, cap));
    this.save();
  },
  placeTramp() {
    if (this.climbLv() < 4) { UI.toast(tt("A cama elástica é do Tonho do Bazar (Escalada nível 4).")); return; }
    const P = this.P, fx = -Math.sin(P.yaw), fy = -Math.cos(P.yaw), x = P.x + fx * 1.6, y = P.y + fy * 1.6;
    if (Math.abs(World.height(x, y) - World.height(P.x, P.y)) > 0.8) { UI.toast(tt("Coloque a cama elástica num chão plano.")); Snd.denied(); return; }
    const S = this.S; S.tramps.push({ x, y }); while (S.tramps.length > 3) S.tramps.shift();
    Snd.buy(); UI.toast(tt("Cama elástica colocada ({0}/3). Pule nela!", S.tramps.length)); this.save();
  },
  updateClimb(dt) {
    const P = this.P, S = this.S;
    // gancho puxando
    if (this.hook) {
      const H = this.hook; H.t += dt; const u = Math.min(1, H.t / H.dur), e = u * u * (3 - 2 * u);
      P.x = H.sx + (H.tx - H.sx) * e; P.y = H.sy + (H.ty - H.sy) * e;
      const feet = H.sz + (H.tz - H.sz) * Math.min(1, e * 1.3) + Math.sin(u * Math.PI) * 0.8;
      P.z = Math.max(0, feet - World.height(P.x, P.y)); P.vz = 0; P.moving = false;
      if (u >= 1) { this.hook = null; P.z = 0; Snd.land(0.5); S.stats.climbs = (S.stats.climbs || 0) + 1; }
      return true;
    }
    // subindo escada
    if (this.ladder) {
      const L = this.ladder, sp = L.metal ? 4.5 : 1.6;
      let feet = World.height(P.x, P.y) + P.z;
      if (this.keys['w'] || this.keys['arrowup']) feet += sp * dt;
      if (this.keys['s'] || this.keys['arrowdown']) feet -= sp * dt;
      P.vz = 0; P.moving = this.keys['w'] || this.keys['s']; P.walkT += dt * 3;
      if (P.moving && (this.ladStepT = (this.ladStepT || 0) - dt) <= 0) { this.ladStepT = L.metal ? 0.18 : 0.35; Snd.tone(L.metal ? 900 : 300, 0.05, { vol: 0.05, type: L.metal ? 'square' : 'triangle', filter: { f: 2000 } }); }
      if (feet >= L.h1 + 0.05) { P.x = L.tx; P.y = L.ty; P.z = 0; this.ladder = null; S.stats.climbs = (S.stats.climbs || 0) + 1; return true; }
      if (feet <= World.height(P.x, P.y) && (this.keys['s'] || this.keys['arrowdown'])) { this.ladder = null; P.z = 0; return true; }
      P.z = Math.max(0, feet - World.height(P.x, P.y));
      return true;
    }
    // entra na escada andando de frente para ela
    if ((this.keys['w'] || this.keys['arrowup']) && S.ladders.length) {
      for (const L of S.ladders) {
        if (Math.hypot(L.x - P.x, L.y - P.y) < 1.1 && Math.cos(P.yaw - L.yaw) > 0.4 && Math.abs(World.height(P.x, P.y) + P.z - L.h0) < 1.5) { this.ladder = L; P.x = L.x; P.y = L.y; return true; }
      }
    }
    return false;
  },
  updateJet(dt) {
    const P = this.P, S = this.S;
    if (this.fuel === undefined) this.fuel = 1;
    const ground = this.onGround();
    this.jetting = false;
    if (this.climbLv() >= 5 && this.keys[' '] && !ground && !this.hook && !this.ladder && !this.travel && this.fuel > 0) {
      this.jetting = true; this.fuel = Math.max(0, this.fuel - dt / 6);
      P.vz = Math.min(9, P.vz + 34 * dt);
      this.jetFxT = (this.jetFxT || 0) - dt;
      if (this.jetFxT <= 0) { this.jetFxT = 0.05; for (let i = 0; i < 3; i++) this.fx.push({ x: P.x + (Math.random() - 0.5) * 0.3, y: P.y + (Math.random() - 0.5) * 0.3, z: P.z + 0.6, vx: (Math.random() - 0.5), vy: (Math.random() - 0.5), vz: -6 - Math.random() * 3, c: Math.random() < 0.5 ? '#ffb347' : '#ff6a2a', t: 0.35, s: 0.1 }); Snd.noise(0.08, { vol: 0.06, f: 500, q: 0.6, type: 'lowpass' }); }
      if (this.fuel <= 0) UI.toast(tt("Jetpack sem combustível! Ele recarrega no chão."), 'warn');
    } else if (ground) this.fuel = Math.min(1, this.fuel + dt / 3);
    // cama elástica
    for (const T of S.tramps) {
      if (Math.hypot(T.x - P.x, T.y - P.y) < 1 && P.z <= this.supportAt(P.x, P.y) + 0.35 && P.vz <= 0 && (this.trampCD || 0) < S.time) {
        const H = Math.max(8, this.jumpH() * 3);
        P.vz = Math.sqrt(2 * GRAV * H); P.z += 0.05; P.peak = P.z; this.trampCD = S.time + 0.4;
        Snd.tone(180, 0.35, { vol: 0.14, type: 'triangle', slide: 3 }); Snd.tone(360, 0.3, { vol: 0.08, type: 'sine', slide: 2.5, at: 0.05 });
        S.stats.bounces = (S.stats.bounces || 0) + 1;
      }
    }
  },
  pushOut() { // caiu em cima de um obstáculo: desliza para fora
    const P = this.P;
    for (const o of World.obstacles) {
      const { d, p } = World.local(o.R, P.x, P.y);
      if (Math.abs(d - o.dc) < o.t / 2 + 0.4 && Math.abs(p - o.pc) < o.len / 2 + 0.4) {
        const nd = d < o.dc ? o.dc - o.t / 2 - 0.5 : o.dc + o.t / 2 + 0.5;
        P.x = o.R.ux * nd + o.R.vx * p; P.y = o.R.uy * nd + o.R.vy * p;
      }
    }
  },

  // ---------- salvamento ----------
  save() { if (this.resetting) return; try { this.S.lastSeen = Date.now(); this.S.world = World.serialize(); localStorage.setItem(SAVE_KEY, JSON.stringify(this.S)); } catch (e) {} },
  load() {
    try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && typeof s === 'object' && s.hammer) return sanitizeSave(s); } catch (e) {}
    return null;
  },
  // correção (v2.5): versões antigas vendiam recurso raro quando a próxima evolução ainda não pedia; devolve o que foi vendido nas últimas entregas
  fixSoldSpecials() {
    const S = this.S; if (S.fixSpecial1) return; S.fixSpecial1 = true;
    const sneed = this.specialNeed(), back = {};
    for (const r of S.receipts || []) for (const l of r.lines || []) if (RES[l.id] && RES[l.id].special && l.sq > 0) back[l.id] = (back[l.id] || 0) + l.sq;
    const got = [];
    for (const id in back) {
      const q = Math.min(back[id], Math.max(0, (sneed[id] || 0) - (S.stock[id] || 0))); if (!q) continue;
      S.stock[id] = (S.stock[id] || 0) + q; S.money = Math.max(0, S.money - q * RES[id].value); got.push(`${q} ${RES[id].name}`);
    }
    if (got.length) setTimeout(() => UI.toast(tt("Seu Lauro devolveu ao depósito o recurso raro que tinha vendido por engano: {0}.", got.join(', ')), 'level'), 2500);
    this.save();
  },
  async reset() { // apaga tudo (navegador e cópia de segurança) e recomeça
    this.resetting = true;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    try { if (Backup.idbPut) await Backup.idbPut({ reset: Date.now() }); } catch (e) {}
    setTimeout(() => location.reload(), 400);
  },
};
