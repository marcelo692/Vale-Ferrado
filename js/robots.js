// =============================================================
// Vale Ferrado — robôs auto-mineradores (comprados no Tonho do Bazar)
// Cada robô sai da cidade, anda até um recurso que falta para as suas
// evoluções, minera devagar, volta e entrega no depósito do Seu Lauro.
// =============================================================
'use strict';

const ROBOT_MAX = 10;
const ROBOT_NAMES = ['Zico', 'Tuca', 'Bolota', 'Faísca', 'Pipoca', 'Rebite', 'Chiclete', 'Parafuso', 'Toquinho', 'Biscoito'];
// preço do robô número n+1: o primeiro é barato (sai nos primeiros minutos); a equipe é que fica cara
function robotPrice(n) { return n === 0 ? ROBOT_FIRST : Math.round(ROBOT_FIRST * 12 * Math.pow(3, n - 1)); }
const ROBOT_FIRST = 120;
// evoluções da equipe (valem para todos os robôs)
const ROBOT_UPS = {
  arm:   { name: tt("Braço"),   icon: '💪', desc: tt("bate mais forte"),   max: 15, base: 90,  grow: 2.15, eff: l => 1 + 0.4 * (l - 1) },
  wheel: { name: tt("Rodas"),   icon: '🛞', desc: tt("anda mais rápido"),  max: 15, base: 70,  grow: 2.05, eff: l => 1 + 0.15 * (l - 1) },
  cart:  { name: tt("Caçamba"), icon: '🧺', desc: tt("carrega mais"),      max: 15, base: 80,  grow: 2.1,  eff: l => 1 + 0.3 * (l - 1) },
};
function robotUpCost(k, lvl) { const U = ROBOT_UPS[k]; return Math.round(U.base * Math.pow(U.grow, lvl - 2)); } // custo para chegar ao nível lvl

const Robots = {
  list: [], claimed: new Set(), report: null, reportT: 0,

  lvl(k) { return (Game.S.robotUp && Game.S.robotUp[k]) || 1; },
  // atributos dos robôs: crescem com a era do seu martelo e com as evoluções da oficina
  era() { return eraOf(Game.S.hammer); },
  force() { return Math.max(1, HAMMERS[Game.S.hammer].f * 0.3) * ROBOT_UPS.arm.eff(this.lvl('arm')); },
  interval() { return 1.5; },
  speed() { return (4 + this.era() * 3) * ROBOT_UPS.wheel.eff(this.lvl('wheel')); },
  cap() { return Math.round((6 + this.era() * 4) * ROBOT_UPS.cart.eff(this.lvl('cart'))); },
  buyUp(k) {
    const S = Game.S, l = this.lvl(k), U = ROBOT_UPS[k]; if (l >= U.max) return;
    const c = robotUpCost(k, l + 1); if (S.money < c) return;
    S.money -= c; S.robotUp = Object.assign({}, S.robotUp, { [k]: l + 1 });
    Snd.levelUp(); this.chirp(); UI.toast(tt("🔧 {0} dos robôs agora no nível {1}!", U.name, l + 1), 'level'); Game.save();
  },
  // moedas por minuto da equipe (últimos 10 minutos de entregas)
  rate() {
    const S = Game.S, h = S.robotHist || []; if (!h.length) return 0;
    const span = Math.max(60, S.time - h[0][0]); let v = 0; for (const e of h) v += e[1];
    return v / span * 60;
  },

  sync() {
    const want = Math.min(ROBOT_MAX, Game.S.robots || 0);
    while (this.list.length < want) {
      const i = this.list.length, a = i / ROBOT_MAX * Math.PI * 2 + 0.3;
      this.list.push({ i, name: ROBOT_NAMES[i], x: Math.cos(a) * 6, y: Math.sin(a) * 6, z: 0, yaw: a, st: 'idle', t: 1 + i * 0.7, node: null, carry: {}, n: 0, walkT: 0, swing: 0, moving: false, lift: 0, res: null });
    }
    while (this.list.length > want) this.list.pop();
  },

  buy() {
    const S = Game.S, n = S.robots || 0;
    if (n >= ROBOT_MAX) return;
    const price = robotPrice(n);
    if (S.money < price) return;
    S.money -= price; S.robots = n + 1; Game.mark('robo' + (n + 1));
    this.sync();
    Snd.levelUp(); this.chirp();
    UI.toast(tt("🤖 {0} entrou para a equipe! Ele vai minerar o que falta para suas evoluções.", ROBOT_NAMES[n]), 'level');
    Game.save();
  },
  chirp() { [880, 1320, 990].forEach((f, i) => Snd.tone(f, 0.07, { vol: 0.06, type: 'square', filter: { f: 3000 }, at: i * 0.07 })); },

  // o que os robôs procuram: materiais que faltam (que o martelo atual já quebra bem); senão, o mais valioso do seu nível
  wanted() {
    const S = Game.S, lvl = S.hammer, mode = S.robotMode || 'auto';
    const best = resourceForLevel(lvl).id; // o mais valioso que o martelo quebra
    if (mode === 'res' && S.robotRes && RES[S.robotRes] && RES[S.robotRes].ideal <= lvl) return { ids: [S.robotRes], fallback: null };
    if (mode === 'valor') return { ids: [], fallback: best };
    const ids = [];
    for (const m of Game.missingList()) { const r = RES[m.id]; if (!r.special && r.ideal <= lvl) ids.push(m.id); }
    // desconta o que os robôs já carregam
    const carried = {}; for (const r of this.list) for (const id in r.carry) carried[id] = (carried[id] || 0) + r.carry[id];
    const miss = Game.missingList(), out = ids.filter(id => { const m = miss.find(x => x.id === id); return m && m.falta - (carried[id] || 0) > 0; });
    return { ids: out, fallback: out.length ? null : best };
  },

  pick(r) {
    const w = this.wanted(), set = new Set(w.ids.length ? w.ids : [w.fallback]);
    let best = null, bd = Infinity;
    for (const n of World.nodes) {
      if (!set.has(n.res.id) || n.dead || this.claimed.has(n) || n === Game.target || n.res.special) continue;
      const d = Math.hypot(n.x - r.x, n.y - r.y); if (d < bd) { bd = d; best = n; }
    }
    return best;
  },

  release(r) { if (r.node) this.claimed.delete(r.node); r.node = null; },

  update(dt) {
    if (!Game.S || !(Game.S.robots > 0)) { this.list.length = 0; return; }
    this.sync();
    Game.S.robotTime = (Game.S.robotTime || 0) + dt;
    for (const r of this.list) this.step(r, dt);
    // aviso das entregas (agrupado, para não encher a tela)
    this.reportT -= dt;
    if (this.report && this.reportT <= 0) {
      const R = this.report; this.report = null; this.reportT = 8;
      const parts = Object.keys(R.items).map(id => `${fmt(R.items[id])} ${RES[id].name}`);
      let txt = tt("🤖 Robôs entregaram {0}", parts.join(', '));
      if (R.kept) txt += tt(" · {0} no depósito", fmt(R.kept));
      if (R.money) txt += tt(" · +{0} moedas", fmt(R.money));
      UI.toast(txt);
      if (R.money) Snd.coins(R.money); else Snd.pickup();
    }
  },

  walkTo(r, tx, ty, dt) {
    const dx = tx - r.x, dy = ty - r.y, d = Math.hypot(dx, dy);
    const sp = this.speed() * (World.mountainAt(r.x, r.y) ? 0.6 : 1);
    const s = Math.min(d, sp * dt);
    if (d > 0.01) { r.x += dx / d * s; r.y += dy / d * s; r.yaw = Math.atan2(dx, dy); }
    r.moving = d > 0.05; r.walkT += dt * (2 + sp * 0.6);
    // obstáculo no caminho: a hélice levanta o robô por cima
    let h = 0;
    for (const o of World.obstacles) if (o.h > h && Game.inObstacle(o, r.x, r.y, 0.6)) h = o.h;
    r.lift = h > 0 ? h + 0.3 : 0;
    return d;
  },

  step(r, dt) {
    r.z += ((r.lift || 0) - r.z) * Math.min(1, dt * 4);
    r.swing = Math.max(0, r.swing - dt * 3);
    if (r.node && r.node.dead) this.release(r);
    switch (r.st) {
      case 'idle': {
        r.moving = false; r.t -= dt; r.res = null;
        if (r.t > 0) break;
        r.t = 2;
        const n = this.pick(r);
        if (n) { r.node = n; this.claimed.add(n); r.st = 'go'; r.res = n.res.id; }
        else if (r.n > 0) r.st = 'home';
        break;
      }
      case 'go': {
        if (!r.node) { r.st = r.n >= this.cap() ? 'home' : 'idle'; r.t = 0.3; break; }
        if (r.node === Game.target) { this.release(r); r.st = 'idle'; r.t = 0.5; break; }
        const d = this.walkTo(r, r.node.x, r.node.y, dt);
        if (d < r.node.r * oreMul(r.node).W + 0.9) { r.st = 'mine'; r.t = 0.6; r.moving = false; }
        break;
      }
      case 'mine': {
        const n = r.node;
        if (!n) { r.st = r.n >= this.cap() ? 'home' : 'idle'; r.t = 0.3; break; }
        r.yaw = Math.atan2(n.x - r.x, n.y - r.y); r.moving = false;
        r.t -= dt;
        if (r.t > 0) break;
        r.t = this.interval(); r.swing = 1;
        const rule = levelRule(n.res.ideal, Game.S.hammer, n.res);
        if (rule.blocked) { this.release(r); r.st = 'idle'; r.t = 0.5; break; }
        n.hp -= this.force() / rule.mult; n.hitT = 0.15; // mesma curva de golpes do jogador
        const near = Math.hypot(n.x - Game.P.x, n.y - Game.P.y);
        if (near < 22) { Game.fxBurst(n.x, n.y, n.res.c2, 3, 0.6); if (near < 14) Snd.hit(n.res.kind, 1, false); }
        if (n.hp <= 0) {
          const units = Math.max(1, Math.round(2 * n.size)) * n.rare;
          r.carry[n.res.id] = (r.carry[n.res.id] || 0) + units; r.n += units;
          if (Math.random() < cintChance(Game.S.olho) / 2) { Game.S.cint = (Game.S.cint || 0) + 1; if (near < 40) Game.floats.push({ x: n.x, y: n.y - 1.6, txt: tt("🤖 ✦ +1 Cintilha"), c: '#9ff3ff', t: 1.6 }); }
          if (near < 40) { Game.fxBurst(n.x, n.y, n.res.c, 10, 1.1); Game.floats.push({ x: n.x, y: n.y - 1, txt: `🤖 +${units} ${n.res.name}`, c: '#9fe8ff', t: 1.4 }); if (near < 20) Snd.breakNode(n.res.kind, n.rare); }
          if (Game.target === n) Game.target = null;
          this.claimed.delete(n); r.node = null;
          World.breakNode(n);
          r.st = r.n >= this.cap() || !this.stillWanted(r) ? 'home' : 'idle'; r.t = 0.4;
        }
        break;
      }
      case 'home': {
        r.res = null;
        const a = r.i / ROBOT_MAX * Math.PI * 2 + 0.3;
        const d = this.walkTo(r, Math.cos(a) * 7, Math.sin(a) * 7, dt);
        if (d < 0.6) { this.deliver(r); r.st = 'idle'; r.t = 1.5; }
        break;
      }
    }
  },
  // ainda vale a pena procurar mais? (se não falta mais nada, volta para entregar)
  stillWanted(r) {
    const w = this.wanted();
    if (w.ids.length) return true;
    return Object.keys(r.carry).every(id => id === w.fallback);
  },

  // entrega no depósito: tudo que as evoluções precisam vai para o estoque; o resto o Seu Lauro vende
  deliver(r) {
    if (!r.n) return;
    const S = Game.S, need = Game.needs();
    const R = this.report || (this.report = { items: {}, kept: 0, money: 0 });
    for (const id in r.carry) {
      const q = r.carry[id], want = Math.max(0, (need[id] || 0) - (S.stock[id] || 0));
      const k = Math.min(want, q), sq = q - k, money = sq * RES[id].value;
      if (k) { S.stock[id] = (S.stock[id] || 0) + k; R.kept += k; }
      if (sq) { S.money += money; S.earned += money; R.money += money; }
      R.items[id] = (R.items[id] || 0) + q; S.robotValue = (S.robotValue || 0) + q * RES[id].value;
    }
    S.robotTotal = (S.robotTotal || 0) + r.n;
    let val = 0; for (const id in r.carry) val += r.carry[id] * RES[id].value;
    S.robotHist = (S.robotHist || []).filter(e => S.time - e[0] < 600); S.robotHist.push([S.time, val]);
    r.carry = {}; r.n = 0;
    if (this.reportT < 1.5) this.reportT = 1.5;
    Game.save();
  },

  statusOf(r) {
    if (r.st === 'go' && r.res) return tt("indo buscar {0}", RES[r.res].name);
    if (r.st === 'mine' && r.res) return tt("minerando {0}", RES[r.res].name);
    if (r.st === 'home') return tt("voltando com {0}", fmt(r.n));
    return tt("procurando trabalho");
  },
};
