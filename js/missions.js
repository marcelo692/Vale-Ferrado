// =============================================================
// Vale Ferrado — missões (guiadas no começo, depois rotativas),
// seta de objetivo e registro de tempos de cada marco
// =============================================================
'use strict';

// lugares
function npcPos(id) { const n = NPCS.find(x => x.id === id); return n ? { x: n.x * 0.75, y: n.y * 0.75, label: n.name } : null; }
function nearestNode(id) {
  const P = Game.P; let best = null, bd = Infinity;
  for (const n of World.nodes) { if (n.res.id !== id) continue; const d = Math.hypot(n.x - P.x, n.y - P.y); if (d < bd) { bd = d; best = n; } }
  return best ? { x: best.x, y: best.y, label: best.res.name } : null;
}
function nearestObstacle() {
  const P = Game.P; let best = null, bd = Infinity;
  for (const o of World.obstacles) {
    const x = o.R.ux * o.dc + o.R.vx * o.pc, y = o.R.uy * o.dc + o.R.vy * o.pc, d = Math.hypot(x - P.x, y - P.y);
    if (Game.canClear(o) && d < bd) { bd = d; best = { x, y, label: tt("Obstáculo") }; }
  }
  return best;
}
const CITY = () => (Game.inCity ? null : { x: 0, y: 0, label: tt("Vila") });
const st = k => (Game.S.stats[k] || 0);
const mined = id => (Game.S.stats.mined[id] || 0);
// missão de trazer recurso: aponta para a pedra; se a mochila já tem o bastante, aponta para a vila
const collectTarget = (id, falta) => ((Game.S.bag[id] || 0) >= falta ? CITY() : nearestNode(id));

// ---------- missões guiadas (primeiros minutos) ----------
const MISSION_CHAIN = [
  { id: 'noz', lvl: 1,      t: tt("Traga 3 Nozes e castanhas para a vila"), d: tt("Minere nozes logo ali fora (mire e segure o botão do mouse) e volte. As missões sempre pegam primeiro o que você traz."), collect: 'noz', max: 3, cur: () => Game.S.mdel || 0, target: () => collectTarget('noz', 3 - (Game.S.mdel || 0)), reward: 10, gift: 'detector' },
  { id: 'm2', lvl: 1,       t: tt("Forje o Martelo 2 com o Seu Bento"),   d: tt("A barraca MARTELOS. Aperte E perto dele."), max: 1, cur: () => (Game.S.hammer >= 2 ? 1 : 0), target: () => npcPos('ferreiro'), reward: 10 },
  { id: 'graveto', lvl: 2,  t: tt("Traga 4 Gravetos para a vila"),        d: tt("Gravetos guardados no depósito também valem."), collect: 'graveto', max: 4, cur: () => Game.S.mdel || 0, target: () => collectTarget('graveto', 4 - (Game.S.mdel || 0)), reward: 10 },
  { id: 'cida', lvl: 2,     t: tt("Melhore algo com a Dona Cida"),        d: tt("Barraca MELHORIAS: mineração, mochila, movimento ou pulo."), max: 1, base: () => Object.values(Game.S.attrs).reduce((a, b) => a + b, 0), cur: b => Object.values(Game.S.attrs).reduce((a, b) => a + b, 0) - b, target: () => npcPos('tropeira'), reward: 15 },
  { id: 'clique', lvl: 2,   t: tt("Dê 10 cliques rápidos numa pedra"),    d: tt("Clicar várias vezes bate bem mais rápido, mas gasta fôlego."), max: 10, base: () => st('clicks'), cur: b => st('clicks') - b, target: () => nearestNode(resourceForLevel(Game.S.hammer).id), reward: 15 },
  { id: 'm3', lvl: 2,       t: tt("Chegue ao Martelo 3"),                 d: tt("Junte o material e as moedas e volte ao Seu Bento."), max: 1, cur: () => (Game.S.hammer >= 3 ? 1 : 0), target: () => npcPos('ferreiro'), reward: 20 },
  { id: 'pulo', lvl: 3,     t: tt("Suba em cima de um tronco"),           d: tt("Pule (Espaço) num tronco baixo. Os obstáculos são atalhos para quem pula alto."), max: 1, base: () => st('hops'), cur: b => st('hops') - b, target: nearestObstacle, reward: 20 },
  { id: 'moedas', lvl: 3,   t: tt("Ganhe 150 moedas vendendo"),           d: tt("Tudo o que sobra na mochila vira moeda na vila."), max: 150, base: () => Game.S.earned, cur: b => Game.S.earned - b, target: () => null, reward: 25 },
  { id: 'm5', lvl: 4,       t: tt("Chegue ao Martelo 5"),                 d: tt("No Martelo 5 cada clique rápido passa a valer por 2 golpes."), max: 1, cur: () => (Game.S.hammer >= 5 ? 1 : 0), target: () => npcPos('ferreiro'), reward: 40 },
  { id: 'pocao', lvl: 5,    t: tt("Use um power-up do Zé da Botica"),     d: tt("Barraca POWER-UPS. Compre e ative com 1, 2 ou 3."), max: 1, base: () => st('powers'), cur: b => st('powers') - b, target: () => npcPos('botica'), reward: 40 },
  { id: 'bazar', lvl: 5,    t: tt("Compre um item do Tonho do Bazar"),    d: tt("Lanterna, detector ou patins: barraca ITENS."), max: 1, cur: () => (Game.S.gear.light + Game.S.gear.detector + Game.S.gear.ride > 0 ? 1 : 0), target: () => npcPos('bazar'), reward: 60 },
  { id: 'm8', lvl: 7,       t: tt("Chegue ao Martelo 8"),                 d: tt("Cada martelo novo quebra pedras mais valiosas."), max: 1, cur: () => (Game.S.hammer >= 8 ? 1 : 0), target: () => npcPos('ferreiro'), reward: 120 },
  { id: 'robo', lvl: 8,     t: tt("Compre seu primeiro robô"),            d: tt("Os robôs do Tonho mineram sozinhos o que falta para você."), max: 1, cur: () => ((Game.S.robots || 0) >= 1 ? 1 : 0), target: () => npcPos('bazar'), reward: 300 },
  { id: 'm10', lvl: 9,      t: tt("Chegue ao Martelo 10"),                d: tt("O ovo de dragão da praça está esquentando…"), max: 1, cur: () => (Game.S.hammer >= 10 ? 1 : 0), target: () => npcPos('ferreiro'), reward: 400 },
  { id: 'regiao2', lvl: 10,  t: tt("Visite o Riacho das Pedras"),          d: tt("A segunda região fica a leste. Lá as pedras valem bem mais."), max: 1, cur: () => (st('far') >= 150 ? 1 : 0), target: () => { const R = REGIONS[1]; return { x: R.ux * (R.dMin + 5), y: R.uy * (R.dMin + 5), label: R.name }; }, reward: 500 },
];

// ---------- missões rotativas (depois das guiadas) ----------
const ROT_TYPES = {
  mine:   { gen: () => { const miss = Game.missingList().filter(m => !RES[m.id].special && RES[m.id].ideal <= Game.S.hammer + 2); const id = miss.length ? miss[0].id : resourceForLevel(Game.S.hammer).id; return { res: id, max: 8 + Math.floor(Game.S.hammer / 2) }; },
            t: m => tt("Traga {0} {1} para a vila", m.max, RES[m.res].name), collect: m => m.res, base: () => 0, cur: m => m.got || 0, target: m => collectTarget(m.res, m.max - (m.got || 0)) },
  money:  { gen: () => ({ max: Math.max(100, Math.round(hammerCost(Math.min(MAX_LEVEL, Game.S.hammer + 1)).money * 0.6)) }), t: m => tt("Ganhe {0} moedas vendendo", fmt(m.max)), base: () => Game.S.earned, cur: (m, b) => Game.S.earned - b },
  veio:   { gen: () => ({ max: 1 }), t: () => tt("Quebre um veio rico (✨)"), base: () => st('veios'), cur: (m, b) => st('veios') - b },
  clicks: { gen: () => ({ max: 40 }), t: m => tt("Dê {0} cliques rápidos", m.max), base: () => st('clicks'), cur: (m, b) => st('clicks') - b },
  hops:   { gen: () => ({ max: 3 }), t: m => tt("Passe por cima de {0} obstáculos", m.max), base: () => st('hops'), cur: (m, b) => st('hops') - b, target: () => nearestObstacle() },
  peak:   { gen: () => ({ max: 1 }), t: () => tt("Chegue perto do topo de uma montanha"), base: () => st('peaks'), cur: (m, b) => st('peaks') - b, target: () => { const P = Game.P; let best = null, bd = Infinity; for (const mt of World.mountains) { const d = Math.hypot(mt.x - P.x, mt.y - P.y); if (d < bd) { bd = d; best = { x: mt.x, y: mt.y, label: tt("Montanha") }; } } return best; } },
  robots: { gen: () => ({ max: 20 + Game.S.hammer }), ok: () => (Game.S.robots || 0) > 0, t: m => tt("Seus robôs entregam {0} recursos", m.max), base: () => Game.S.robotTotal || 0, cur: (m, b) => (Game.S.robotTotal || 0) - b },
};

// o que a seta do detector procura (até 3 marcados), na ordem de prioridade
const DET_OPTIONS = {
  missao:  tt("Missão atual"),
  achados: tt("Achados brilhando (Veio de Cintilha e Geodo)"),
  falta:   tt("Materiais que faltam para as evoluções"),
  recurso: tt("Um recurso que eu escolher"),
  veios:   tt("Veios ricos (✨) e cristalizados (💎)"),
  raros:   tt("Recursos raros das montanhas"),
};
const DET_ORDER = ['achados', 'missao', 'falta', 'recurso', 'veios', 'raros'];
const DET_DEFAULT = ['missao', 'achados', 'falta'];

const Missions = {
  init() {
    const S = Game.S;
    S.stats = Object.assign({ mined: {}, clicks: 0, sales: 0, hops: 0, powers: 0, veios: 0, peaks: 0, far: 0 }, S.stats || {});
    S.stats.mined = S.stats.mined || {};
    S.ms = S.ms || {};
    // quem já jogava antes das missões começa a corrente onde faz sentido
    if (S.mi === undefined) {
      S.mi = 0;
      if (S.hammer > 1 || S.earned > 0) { while (S.mi < MISSION_CHAIN.length && (S.hammer > MISSION_CHAIN[S.mi].lvl || this.chainDone(MISSION_CHAIN[S.mi]))) S.mi++; }
      this.startChain();
    }
    if (!S.rot) S.rot = [];
    this.fill();
  },
  chainDone(m) { const b = m.base ? m.base() : 0; return m.base ? false : m.cur(b) >= m.max; },
  startChain() { const S = Game.S, m = MISSION_CHAIN[S.mi]; S.mdel = 0; if (m) S.mb = m.base ? m.base() : 0; this.consume(S.stock, true); },
  // missões pegam primeiro: do que chega na vila e do que já estava guardado no depósito
  consume(src, quiet) {
    const S = Game.S, took = {};
    const take = (id, falta, add) => { const q = Math.min(falta, src[id] || 0); if (q <= 0) return; src[id] -= q; if (!src[id]) delete src[id]; add(q); took[id] = (took[id] || 0) + q; };
    if (S.mi < MISSION_CHAIN.length) { const m = MISSION_CHAIN[S.mi]; if (m.collect) take(m.collect, m.max - (S.mdel || 0), q => { S.mdel = (S.mdel || 0) + q; }); }
    else for (const m of S.rot) { const T = ROT_TYPES[m.type]; if (T.collect) take(T.collect(m), m.max - (m.got || 0), q => { m.got = (m.got || 0) + q; }); }
    const ids = Object.keys(took);
    if (ids.length && !quiet) UI.toast(tt("📜 A missão pegou ") + ids.map(id => `${fmt(took[id])} ${RES[id].name}`).join(', '));
    return took;
  },
  rewardRot() { return Math.max(20, Math.round(hammerCost(Math.min(MAX_LEVEL, Game.S.hammer + 1)).money * 0.35)); },
  fill() {
    const S = Game.S; if (S.mi < MISSION_CHAIN.length) return;
    const used = new Set(S.rot.map(m => m.type));
    const types = Object.keys(ROT_TYPES).filter(t => !used.has(t) && (!ROT_TYPES[t].ok || ROT_TYPES[t].ok()));
    while (S.rot.length < 3 && types.length) {
      const type = types.splice(Math.floor(Math.random() * types.length), 1)[0], T = ROT_TYPES[type];
      const m = Object.assign({ type }, T.gen()); m.base = T.base(m); m.reward = this.rewardRot(); S.rot.push(m);
    }
    this.consume(S.stock, true);
  },
  // missão em destaque (mostrada no HUD e usada pela seta)
  current() {
    const S = Game.S;
    if (S.mi < MISSION_CHAIN.length) { const m = MISSION_CHAIN[S.mi]; return { n: S.mi + 1, of: MISSION_CHAIN.length, t: m.t, d: m.d, cur: Math.max(0, Math.min(m.max, m.cur(S.mb))), max: m.max, reward: m.reward, target: m.target() }; }
    const m = S.rot[0]; if (!m) return null;
    const T = ROT_TYPES[m.type];
    return { t: T.t(m), cur: Math.max(0, Math.min(m.max, T.cur(m, m.base))), max: m.max, reward: m.reward, target: T.target ? T.target(m) : null };
  },
  give(money, txt) {
    const S = Game.S; S.money += money;
    UI.toast(tt("📜 Missão cumprida: {0}! +{1} moedas", txt, fmt(money)), 'level'); Snd.levelUp();
  },
  checkT: 0,
  update(dt) {
    const S = Game.S, P = Game.P;
    // estatísticas que não vêm de eventos
    const d = Math.hypot(P.x, P.y); if (d > st('far')) S.stats.far = Math.round(d);
    const mt = World.mountainAt(P.x, P.y); if (mt && World.mountainH(P.x, P.y) > mt.H * 0.7 && !this.onPeak) { this.onPeak = true; S.stats.peaks++; } else if (!mt) this.onPeak = false;
    this.checkT -= dt; if (this.checkT > 0) return; this.checkT = 0.4;
    this.consume(S.stock, true); // o que for guardado depois também conta
    if (S.mi < MISSION_CHAIN.length) {
      const m = MISSION_CHAIN[S.mi];
      if (m.cur(S.mb) >= m.max) {
        this.give(m.reward, m.t); Game.mark('missao' + (S.mi + 1));
        if (m.gift === 'detector' && !S.gear.detector) { S.gear.detector = 1; S.detOn = true; setTimeout(() => UI.toast(tt("🧭 O Seu Lauro te deu um Detector de bolso! A seta no alto da tela agora te guia. Segure G para escolher o que ela procura."), 'level'), 1800); }
        S.mi++; this.startChain();
        if (S.mi >= MISSION_CHAIN.length) { UI.toast(tt("📜 Você terminou as missões guiadas! Agora sempre há 3 missões novas (tecla J)."), 'level'); this.fill(); }
        Game.save();
      }
    } else {
      for (let i = S.rot.length - 1; i >= 0; i--) {
        const m = S.rot[i], T = ROT_TYPES[m.type];
        if (T.cur(m, m.base) >= m.max) { this.give(m.reward, T.t(m)); S.rot.splice(i, 1); S.stats.rotDone = (S.stats.rotDone || 0) + 1; this.fill(); Game.save(); }
      }
    }
  },
  // painel com todas as missões (tecla J)
  panel() {
    UI.freeMouse(); UI.open = 'missions'; Snd.open();
    const S = Game.S;
    let h = tt("<div class=\"story\"><h2>📜 Missões</h2>");
    if (S.mi < MISSION_CHAIN.length) {
      h += tt("<p class=\"hint\">Missão {0} de {1}. A seta no alto da tela mostra o caminho.</p><ul class=\"mlist\">", S.mi + 1, MISSION_CHAIN.length);
      MISSION_CHAIN.forEach((m, i) => {
        const done = i < S.mi, cur = i === S.mi;
        if (i < S.mi - 1 || i > S.mi) return; // só a última feita e a atual
        const c = cur ? Math.max(0, Math.min(m.max, m.cur(S.mb))) : 0;
        h += `<li class="${done ? 'done' : cur ? 'cur' : 'lock'}"><b>${done ? '✔' : cur ? '▶' : '🔒'}</b><div><span>${cur || done ? m.t : '???'}</span>${cur ? `<small>${m.d}</small><i class="mpb"><em style="width:${c / m.max * 100}%"></em></i><small>${fmt(c)} / ${fmt(m.max)}</small>` : ''}</div><strong>+${fmt(m.reward)}</strong></li>`;
      });
      h += `</ul>`;
    } else {
      h += tt("<p class=\"hint\">3 missões ativas · cumpridas: {0}</p><ul class=\"mlist\">", S.stats.rotDone || 0);
      for (const m of S.rot) { const T = ROT_TYPES[m.type], c = Math.max(0, Math.min(m.max, T.cur(m, m.base))); h += `<li class="cur"><b>▶</b><div><span>${T.t(m)}</span><i class="mpb"><em style="width:${c / m.max * 100}%"></em></i><small>${fmt(c)} / ${fmt(m.max)}</small></div><strong>+${fmt(m.reward)}</strong></li>`; }
      h += `</ul>`;
    }
    h += tt("<div class=\"row\"><button class=\"buy\" onclick=\"UI.close()\">Continuar</button></div></div>");
    $('panel').innerHTML = h; $('panel').classList.remove('hidden');
  },
  // HUD da missão atual
  hud() {
    const el = $('mission'); if (!el) return;
    const c = this.current();
    if (!c || UI.open) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.innerHTML = `<div class="mh">📜 ${c.n ? tt("Missão {0}/{1}", c.n, c.of) : tt("Missão")} <kbd>J</kbd><span>+${fmt(c.reward)}</span></div><div class="mt">${c.t}</div>${c.max > 1 ? `<i class="mpb"><em style="width:${c.cur / c.max * 100}%"></em></i><small>${fmt(c.cur)} / ${fmt(c.max)}</small>` : ''}`;
  },
  // para onde a seta aponta
  // a seta é o detector: sem detector (ou desligado) não aparece; só acha recursos dentro do alcance dele
  arrowTarget() {
    const S = Game.S, lv = S.gear.detector;
    if (!lv || !S.detOn) return null;
    const range = GADGETS.detector.levels[lv].range, P = Game.P, sel = S.detSel || DET_DEFAULT;
    const inRange = t => t && Math.hypot(t.x - P.x, t.y - P.y) <= range ? t : null;
    const near = test => { let best = null, bd = range; for (const n of World.nodes) { if (!test(n)) continue; const d = Math.hypot(n.x - P.x, n.y - P.y); if (d < bd) { bd = d; best = n; } } return best; };
    if (!Game.inCity && Game.free() <= 0) return { x: 0, y: 0, label: tt("Mochila cheia: volte à vila") };
    for (const o of DET_ORDER) {
      if (!sel.includes(o)) continue;
      let t = null;
      if (o === 'achados') { const w = near(n => n.res.wild && (n.res.id === 'veiocint' || (S.cint || 0) >= 1)); if (w) t = { x: w.x, y: w.y, label: '✦ ' + w.res.name }; }
      else if (o === 'missao') { const c = this.current(); t = c && c.target; if (t && t.label !== tt('Vila') && !NPCS.some(n => n.name === t.label)) t = inRange(t); }
      else if (o === 'falta') { const miss = Game.missingList().filter(m => !levelRule(RES[m.id].ideal, S.hammer).blocked).map(m => m.id); const n = near(n => miss.includes(n.res.id)); if (n) t = { x: n.x, y: n.y, label: n.res.name + tt(" (falta)") }; }
      else if (o === 'recurso' && S.detRes) { const n = near(n => n.res.id === S.detRes); if (n) t = { x: n.x, y: n.y, label: n.res.name }; }
      else if (o === 'veios') { const n = near(n => n.rare > 1 && !levelRule(n.res.ideal, S.hammer).blocked); if (n) t = { x: n.x, y: n.y, label: (n.rare === 10 ? '💎 ' : '✨ ') + n.res.name }; }
      else if (o === 'raros') { const n = near(n => n.res.special); if (n) t = { x: n.x, y: n.y, label: '⛰ ' + n.res.name }; }
      if (t) return t;
    }
    return null;
  },
};
