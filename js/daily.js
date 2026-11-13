// =============================================================
// Vale Ferrado — motivos para voltar: baú diário na fonte e encomendas do dia
// =============================================================
'use strict';

const CHEST_POS = { x: 3.2, y: 6.6 };     // ao lado da fonte, virado para ela
const DAILY_FROM = 3;                       // o baú aparece a partir do Martelo 3
const ORDERS_FROM = 4;                      // encomendas a partir do Martelo 4
// prêmio de cada dia da sequência (fração do preço do próximo martelo + extras)
const DAILY_DAYS = [
  { k: 0.35, cint: 0 },
  { k: 0.45, cint: 1 },
  { k: 0.55, cint: 1, pw: 'tonico' },
  { k: 0.65, cint: 2 },
  { k: 0.8,  cint: 2, pw: 'cafe' },
  { k: 1,    cint: 3 },
  { k: 1.6,  cint: 5, pw: 'elixir' },
];

function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function yesterdayKey() { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); }

const Daily = {
  today() { return this.fake || dayKey(); },
  state() { const S = Game.S; if (!S.daily) S.daily = { last: null, streak: 0 }; return S.daily; },
  unlocked() { return Game.S.hammer >= DAILY_FROM; },
  available() { return this.unlocked() && this.state().last !== this.today(); },
  // qual dia da sequência o baú de hoje vale (1 a 7)
  nextDay() { const st = this.state(); const cont = st.last === yesterdayKey() || (this.fake && st.last && st.last !== this.today()); return cont ? (st.streak % 7) + 1 : 1; },
  reward(day) {
    const D = DAILY_DAYS[day - 1], L = Math.min(MAX_LEVEL, Game.S.hammer + 1);
    return { money: Math.max(20, Math.round(hammerCost(L).money * D.k)), cint: D.cint, pw: D.pw || null };
  },
  near() { const P = Game.P; return this.unlocked() && Math.hypot(P.x - CHEST_POS.x, P.y - CHEST_POS.y) < 2.6; },
  open() { // abre o painel do baú
    if (!this.unlocked()) return;
    UI.freeMouse(); UI.open = 'daily'; Snd.open(); this.render(); $('panel').classList.remove('hidden');
  },
  render() {
    const st = this.state(), avail = this.available(), day = avail ? this.nextDay() : st.streak, got = this.lastGot;
    let track = '<div class="days">';
    for (let i = 1; i <= 7; i++) {
      const R = this.reward(i), cls = i < day || (!avail && i === day) ? 'done' : i === day ? 'now' : '';
      track += `<div class="d ${cls}"><span>${tt("Dia {0}", i)}</span><b><i class="coin"></i>${fmt(R.money)}</b>${R.cint ? `<em>✦${R.cint}</em>` : ''}${R.pw ? `<em>🧪 ${POWERUPS[R.pw].name.split(' ')[0]}</em>` : ''}</div>`;
    }
    track += '</div>';
    let body;
    if (avail) body = `<button class="buy" onclick="Daily.claim()">${tt("Abrir o baú do dia {0}", day)}</button>`;
    else if (got && !got.doubled) body = `<p>${tt("Você ganhou {0} moedas{1}.", fmt(got.money), got.cint ? tt(" e {0} Cintilhas", got.cint) : '')}</p><button class="buy adbtn" onclick="Daily.double()">${tt("Dobrar as moedas (ver anúncio)")}</button>`;
    else body = `<p>${tt("Volte amanhã para o dia {0}. Se pular um dia, a sequência recomeça.", (st.streak % 7) + 1)}</p>`;
    $('panel').innerHTML = `<div class="story daily"><h2>${tt("🎁 Baú diário")}</h2><p class="hint">${tt("Um baú por dia. Quanto mais dias seguidos, melhor o prêmio; o dia 7 é o grande.")}</p>${track}<div class="row">${body}<button class="buy alt" onclick="UI.close()">${tt("Fechar")}</button></div></div>`;
  },
  claim() {
    if (!this.available()) return;
    const S = Game.S, st = this.state(), day = this.nextDay(), R = this.reward(day);
    st.last = this.today(); st.streak = day;
    S.money += R.money; S.earned += R.money;
    if (R.cint) S.cint = (S.cint || 0) + R.cint;
    if (R.pw) { if (Game.free() >= POWERUPS[R.pw].slots) S.pw.push({ id: R.pw, tier: Math.max(1, eraOf(S.hammer)) }); else { const m = powerPrice(R.pw, S.hammer); S.money += m; R.money += m; } }
    this.lastGot = { money: R.money, cint: R.cint, doubled: false };
    Snd.coins(R.money); Snd.levelUp(); Game.fxBurst(CHEST_POS.x, CHEST_POS.y, '#ffd76a', 34, 1.6);
    UI.toast(tt("🎁 Baú do dia {0}: +{1} moedas", day, fmt(R.money)) + (R.cint ? ' · ✦' + R.cint : ''), 'level');
    Game.save(); if (UI.open === 'daily') this.render();
  },
  double() {
    const g = this.lastGot; if (!g || g.doubled) return;
    Platform.rewarded(() => { const S = Game.S; S.money += g.money; S.earned += g.money; g.doubled = true; Snd.coins(g.money); Game.save(); if (UI.open === 'daily') this.render(); });
  },
};

// ---------- encomendas do dia: três pedidos dos vendedores, renovados todo dia ----------
const Orders = {
  unlocked() { return Game.S.hammer >= ORDERS_FROM; },
  list() {
    const S = Game.S;
    if (!this.unlocked()) return [];
    if (!S.orders || S.orders.day !== Daily.today()) this.generate();
    return S.orders.list;
  },
  generate() {
    const S = Game.S, L = S.hammer, mine = RESOURCES.filter(r => !r.special && r.ideal <= L);
    const pick = gap => { let best = mine[0]; for (const r of mine) if (r.ideal <= L - gap) best = r; return best; };
    const who = ['ferreiro', 'tropeira', 'botica', 'bazar', 'armazem'].filter(id => Vendors.isOpen(id));
    const spec = [ // fácil (muito, pedra bem abaixo) · médio · difícil (pedra do seu nível)
      { r: pick(2), qty: 30 + L, mul: 2.2, cint: 1 },
      { r: pick(1), qty: 14 + Math.floor(L / 2), mul: 2.6, cint: 1 },
      { r: pick(0), qty: 6 + Math.floor(L / 4), mul: 3.2, cint: 2 },
    ];
    // se dois pedidos caírem no mesmo recurso (começo do jogo), junta num só
    const seen = new Set(), list = [];
    spec.forEach((o, i) => { if (seen.has(o.r.id)) return; seen.add(o.r.id); list.push({ npc: who[(i + (L % who.length)) % who.length] || 'armazem', res: o.r.id, qty: o.qty, got: 0, reward: Math.round(o.r.value * o.qty * o.mul), cint: o.cint, done: false }); });
    S.orders = { day: Daily.today(), list };
  },
  // na chegada à vila: as encomendas pegam do que IA SER VENDIDO (nunca do que falta para suas evoluções)
  take(id, qty, quiet) {
    const S = Game.S; let left = qty;
    for (const o of this.list()) {
      if (o.done || o.res !== id || left <= 0) continue;
      const k = Math.min(left, o.qty - o.got); if (!k) continue;
      left -= k; if (quiet) continue;
      o.got += k;
      if (o.got >= o.qty) {
        o.done = true; S.money += o.reward; S.earned += o.reward; S.cint = (S.cint || 0) + o.cint;
        const n = NPCS.find(v => v.id === o.npc);
        UI.toast(tt("📦 Encomenda entregue para {0}: +{1} moedas · ✦{2}", n ? n.name.split(',')[0] : '', fmt(o.reward), o.cint), 'level'); Snd.coins(o.reward);
      } else UI.toast(tt("📦 Encomenda: {0}/{1} {2}", o.got, o.qty, RES[o.res].name));
    }
    return qty - left;
  },
};
