// =============================================================
// Vale Ferrado — interface: HUD, lojas dos NPCs, avisos e história
// =============================================================
'use strict';

const $ = id => document.getElementById(id);

document.addEventListener('DOMContentLoaded', () => { const p = document.getElementById('panel'); if (p) new MutationObserver(() => UI.fixGrids()).observe(p, { childList: true, subtree: false }); });
const UI = {
  open: null, hudT: 0,

  toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind; el.textContent = msg;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4800);
    while ($('toasts').children.length > 5) $('toasts').firstChild.remove();
  },

  matLine(m) {
    const have = Game.S.stock[m.id] || 0, inBag = Game.S.bag[m.id] || 0;
    const ok = have >= m.qty;
    return `<li class="${ok ? 'ok' : 'no'}"><span class="dot" style="background:${RES[m.id].c2}"></span>${RES[m.id].name}: <b>${fmt(Math.min(have, m.qty))}/${fmt(m.qty)}</b>${inBag ? tt(" <i>(+{0} na mochila)</i>", inBag) : ''}</li>`;
  },
  costHtml(c) {
    const okM = Game.S.money >= c.money;
    return tt("<ul class=\"cost\"><li class=\"{0}\"><i class=\"coin\"></i>Moedas: <b>{1}</b></li>{2}</ul>", okM ? 'ok' : 'no', fmt(c.money), c.mats.map(m => this.matLine(m)).join(''));
  },

  freeMouse() { if (document.pointerLockElement) document.exitPointerLock(); },
  lockHint(show) {
    const el = $('lockhint'), want = show && started ? 'flex' : 'none';
    if (want === 'flex') { const st = $('savest'); if (st) st.textContent = Backup.statusText(); }
    if (want === 'flex') Updater.pauseBox(el.style.display !== 'flex');
    if (el.style.display !== want && want === 'flex') { const v = Math.round((Game.S.sens || 1) * 100), sl = $('sens'); if (sl) { sl.value = v; sl.nextElementSibling.textContent = v + '%'; } }
    el.style.display = want;
  },
  resume() { Snd.start(); Game.lock(); },
  pics(kind, a, both) {
    try {
      if (!both) return `<div class="pics one"><figure><img src="${Render.itemImg(kind, a)}" alt=""></figure></div>`;
      return tt("<div class=\"pics\"><figure><img src=\"{0}\" alt=\"\"><figcaption>Item</figcaption></figure><figure><img src=\"{1}\" alt=\"\"><figcaption>Em você</figcaption></figure></div>", Render.itemImg(kind, a), Render.charImg(kind, a));
    } catch (e) { return ''; }
  },
  openNpc(id) {
    this.freeMouse(); Snd.open();
    this.open = id;
    $('panel').classList.remove('hidden');
    this.renderPanel();
  },
  close(noLock) { if (this.open) Snd.close(); this.open = null; $('panel').classList.add('hidden'); if (!noLock) Game.lock(); },

  renderPanel() {
    const S = Game.S, id = this.open;
    if (!id || !NPCS.some(n => n.id === id)) return;
    const npc = NPCS.find(n => n.id === id);
    let h = `<div class="win"><div class="ph" style="--npc:${npc ? npc.color : '#888'}"><div class="avatar"></div><div><h2>${npc ? npc.name : ''}</h2><p>${npc ? npc.role : ''}</p></div><button class="x" onclick="UI.close()">✕</button></div><div class="pb">`;

    if (id === 'ferreiro') {
      const L = S.hammer;
      h += tt("<div class=\"cur\"><span class=\"lv\">Nível {0}</span><h3>{1}</h3><p>Força {2}</p></div>", L, HAMMERS[L].n, fmt(HAMMERS[L].f));
      if (L < MAX_LEVEL) {
        const c = hammerCost(L + 1);
        h += tt("<div class=\"card big\">{0}<span class=\"lv\">Próximo · nível {1}</span><h3>{2}</h3><p>Força {3} → <b>{4}</b></p>{5}{6}\n          <button class=\"buy\" {7} onclick=\"Game.buyHammer();UI.renderPanel()\">Forjar</button></div>", this.pics('hammer', L + 1, true), L + 1, HAMMERS[L + 1].n, fmt(HAMMERS[L].f), fmt(HAMMERS[L + 1].f), this.costHtml(c), SPECIAL_AT[L + 1] ? tt("<p class=\"rare\">⛰ {0} só existe perto do topo das montanhas da região {1}</p>", RES[SPECIAL_AT[L + 1]].name, REGIONS[RES[SPECIAL_AT[L + 1]].region].name) : '', Game.canPay(c) ? '' : 'disabled');
        h += tt("<h4>Pela frente</h4><ol class=\"road\" start=\"{0}\">", L + 2);
        for (let i = L + 2; i <= Math.min(MAX_LEVEL, L + 4); i++) h += tt("<li>{0} <i>força {1}</i></li>", HAMMERS[i].n, fmt(HAMMERS[i].f));
        h += `</ol>`;
      } else h += tt("<p class=\"done\">Você tem o Martelo do Vale. Não existe nada mais forte.</p>");
      h += tt("<p class=\"hint\">Os materiais saem do depósito.</p>");
    }

    if (id === 'tropeira') {
      h += `<div class="grid">`;
      for (const k in ATTRS) {
        const L = S.attrs[k];
        h += tt("<div class=\"card\">{0}<span class=\"lv\">{1} · nível {2}</span><h3>{3}</h3>", this.pics(k, Math.min(MAX_LEVEL, L + 1)), ATTRS[k].part, L, ATTRS[k].name);
        if (L < MAX_LEVEL) {
          const c = attrCost(k, L + 1);
          h += tt("<p>{0} → <b>{1}</b></p>{2}<button class=\"buy\" {3} onclick=\"Game.buyAttr('{4}');UI.renderPanel()\">Melhorar</button>", attrLabel(k, L), attrLabel(k, L + 1), this.costHtml(c), Game.canPay(c) ? '' : 'disabled', k);
        } else h += tt("<p class=\"done\">{0} (máximo)</p>", attrLabel(k, L));
        h += `</div>`;
      }
      h += `</div>`;
    }

    if (id === 'botica') {
      const tier = eraOf(S.hammer);
      h += tt("<p class=\"free\">Espaço livre na mochila: <b>{0}</b> de {1} · ✦ Cintilhas: <b>{2}</b></p><div class=\"grid\">", fmt(Game.free()), fmt(Game.capacity()), fmt(S.cint || 0));
      for (const pid in POWERUPS) {
        const P = POWERUPS[pid], price = powerPrice(pid, S.hammer);
        const owned = S.pw.filter(p => p.id === pid).length;
        const ci = powerCint(pid, S.hammer), ok = S.money >= price && (S.cint || 0) >= ci && Game.free() >= P.slots;
        h += tt("<div class=\"card\">{0}<span class=\"lv\" style=\"color:{1}\">Tecla {2} · na mochila: {3}</span><h3>{4} {5}</h3>\n          <p>+{6}% {7} por {8} min · ocupa {9} espaços</p>\n          <ul class=\"cost\"><li class=\"{10}\"><i class=\"coin\"></i>Moedas: <b>{11}</b></li><li class=\"{12}\">✦ Cintilhas: <b>{13}</b></li></ul>\n          <button class=\"buy\" {14} onclick=\"Game.buyPower('{15}');UI.renderPanel()\">Comprar</button></div>", this.pics('pw', pid), P.color, P.key, owned, P.name, ROMAN[tier], Math.round(powerBonus(pid, tier) * 100), P.desc, P.dur / 60, P.slots, S.money >= price ? 'ok' : 'no', fmt(price), (S.cint || 0) >= ci ? 'ok' : 'no', ci, ok ? '' : 'disabled', pid);
      }
      const oL = S.olho || 0, oN = oL + 1;
      h += tt("<div class=\"card\"><span class=\"lv\">Nível {0} de {1}</span><h3>👁 Olho de Garimpeiro</h3><p>Chance de achar Cintilha nas pedras: <b>{2}%</b>{3}</p>\n        {4}</div>", oL, OLHO.length - 1, (cintChance(oL) * 100).toFixed(1).replace('.', DEC), oN < OLHO.length ? ` → <b>${(cintChance(oN) * 100).toFixed(1).replace('.', DEC)}%</b>` : '', oN < OLHO.length ? tt("<ul class=\"cost\"><li class=\"{0}\"><i class=\"coin\"></i>Moedas: <b>{1}</b></li></ul><button class=\"buy\" {2} onclick=\"Game.buyOlho();UI.renderPanel()\">Melhorar</button>", S.money >= OLHO[oN] ? 'ok' : 'no', fmt(OLHO[oN]), S.money >= OLHO[oN] ? '' : 'disabled') : tt("<button class=\"buy\" disabled>Nível máximo</button>"));
      h += tt("</div><p class=\"hint\">Cintilhas saem das pedras, dos robôs e dos Veios de Cintilha. Teclas 1, 2 e 3 ativam; os efeitos se somam.</p>");
    }

    if (id === 'bazar') {
      h += tt("<p class=\"free\">Seu dinheiro: <b><i class=\"coin\"></i>{0}</b></p>", fmt(S.money));
      for (const type in GADGETS) {
        const T = GADGETS[type], have = S.gear[type];
        h += `<h4>${T.title} <span class="kbd">${T.key}</span></h4><p class="hint" style="margin:0 0 8px">${T.desc}</p><div class="grid">`;
        for (let lv = Math.max(1, have || 1); lv < T.levels.length; lv++) {
          const G = T.levels[lv], owned = have >= lv, ok = !owned && Game.canPay({ money: G.price, mats: G.mats || [] });
          h += tt("<div class=\"card {0}\">{1}<span class=\"lv\">Nível {2}</span><h3>{3}</h3><p>{4}</p>\n            {5}{6}\n            {7}</div>", have === lv ? 'eq' : '', this.pics(type, lv), lv, G.n, G.info, owned ? tt("<ul class=\"cost\"><li class=\"ok\"><i class=\"coin\"></i>Moedas: <b>{0}</b></li></ul>", fmt(G.price)) : this.costHtml({ money: G.price, mats: G.mats || [] }), G.mats ? tt("<p class=\"rare\">⛰ Recurso raro das montanhas</p>") : '', have === lv ? tt("<button class=\"buy\" disabled>Equipado</button>") : owned ? tt("<button class=\"buy\" disabled>Você tem</button>") : tt("<button class=\"buy\" {0} onclick=\"Game.buyGadget('{1}',{2});UI.renderPanel()\">Comprar</button>", ok ? '' : 'disabled', type, lv));
        }
        h += `</div>`;
        if (type === 'detector' && have) h += tt("<div class=\"row\" style=\"margin-top:10px\"><button class=\"buy alt\" onclick=\"UI.detectorPanel()\">🧭 Escolher o que a seta procura</button></div>");
      }
      // robôs auto-mineradores
      const nR = S.robots || 0;
      h += tt("<h4>🤖 Robôs auto-mineradores</h4><p class=\"hint\" style=\"margin:0 0 8px\">Mineram sozinhos o que falta para suas evoluções e entregam no depósito. Evoluem com o seu martelo.</p><div class=\"grid\">");
      let pr = '';
      try { pr = tt("<div class=\"pics\"><figure><img src=\"{0}\" alt=\"\"><figcaption>Robô</figcaption></figure><figure><img src=\"{1}\" alt=\"\"><figcaption>Sua equipe</figcaption></figure></div>", Render.robotImg(1), Render.robotImg(Math.min(ROBOT_MAX, nR + 1))); } catch (e) {}
      if (nR < ROBOT_MAX) {
        const price = robotPrice(nR), ok = S.money >= price;
        h += tt("<div class=\"card\">{0}<span class=\"lv\">Robô {1} de {2}</span><h3>{3}</h3><p>Força {4} por golpe · {5} m/s · carrega {6}</p>{7}<button class=\"buy\" {8} onclick=\"Robots.buy();UI.renderPanel()\">Comprar</button></div>", pr, nR + 1, ROBOT_MAX, ROBOT_NAMES[nR], fmt(Robots.force()), fmt(Robots.speed()), fmt(Robots.cap()), this.costHtml({ money: price, mats: [] }), ok ? '' : 'disabled');
      } else h += tt("<div class=\"card eq\">{0}<span class=\"lv\">Equipe completa</span><h3>{1} robôs</h3><p>Você tem todos os robôs.</p></div>", pr, ROBOT_MAX);
      h += `</div>`;
      if (nR) {
        Robots.sync();
        h += tt("<p class=\"free\" style=\"margin-top:10px\">Sua equipe: {0} · já trouxeram {1} recursos</p>", Robots.list.map(r => `<b>${r.name}</b>`).join(', '), fmt(S.robotTotal || 0));
      }
    }

    if (id === 'armazem') {
      const ids = Object.keys(S.stock).filter(k => S.stock[k] > 0);
      const mode = Game.sellMode();
      h += tt("<p>Ao chegar na vila, as missões pegam o que precisam. O resto:</p><div class=\"row\" style=\"flex-wrap:wrap\">{0}</div><p class=\"hint\" style=\"text-align:center\">Tecla N troca o modo em qualquer lugar.</p>", Object.keys(SELL_MODES).map(m => `<button class="buy ${m === mode ? '' : 'alt'}" onclick="Game.S.sellMode='${m}';Game.save();UI.renderPanel()">${{ sobra: tt("🏠 Guardar o que falta"), guardar: tt("📦 Guardar tudo"), vender: tt("💰 Vender tudo") }[m]}</button>`).join(''));
      const sv = Object.keys(S.stock).reduce((a, k) => a + (S.stock[k] || 0) * RES[k].value, 0);
      if (sv) h += tt("<div class=\"row\"><button class=\"buy\" onclick=\"Game.sellAllStock();UI.renderPanel()\">💰 Vender o depósito ({0})</button></div>", fmt(sv));

      if ((S.receipts || []).length) h += tt("<h4>Última entrega</h4><div class=\"receipt-in\">{0}</div>", this.receiptHtml(S.receipts[0]));
      if (ids.length) {
        h += tt("<h4>Depósito</h4><ul class=\"stock\">{0}</ul>\n          <button class=\"buy alt\" onclick=\"UI.sellStock()\">Vender só o que sobra</button>", ids.map(k => `<li><span class="dot" style="background:${RES[k].c2}"></span>${RES[k].name}<b>${fmt(S.stock[k])}</b><i>${fmt(RES[k].value)} cada</i></li>`).join(''));
      } else h += tt("<p class=\"hint\">Depósito vazio.</p>");
    }
    h += `</div></div>`;
    $('panel').innerHTML = h;
  },

  sellStock() { // vende o que não é mais necessário
    const need = Game.needs(), sneed = Game.specialNeed(); let earned = 0;
    for (const k in Game.S.stock) {
      const extra = Game.S.stock[k] - (RES[k].special ? Math.max(need[k] || 0, sneed[k] || 0) : (need[k] || 0));
      if (extra > 0) { earned += extra * RES[k].value; Game.S.stock[k] -= extra; }
    }
    Game.S.money += earned; Game.S.earned += earned;
    this.toast(earned ? tt("Excedente vendido por {0} moedas.", fmt(earned)) : tt("Nada sobrando: tudo no depósito ainda vai ser usado."), 'money');
    Game.save(); this.renderPanel();
  },

  story(L) {
    const st = STORY[L]; if (!st) return;
    Game.S.seen[L] = true; Game.save();
    this.freeMouse(); Snd.story();
    this.open = 'story';
    $('panel').classList.remove('hidden');
    $('panel').innerHTML = tt("<div class=\"story\"><span class=\"lv\">{0}</span><h2>{1}</h2><p>{2}</p><button class=\"buy\" onclick=\"UI.close()\">Continuar</button></div>", L === 1 ? tt("Prólogo") : tt("Marco · nível ") + L, st.t, st.s);
  },

  soundPanel() {
    this.freeMouse(); Snd.start();
    this.open = 'sound';
    $('panel').classList.remove('hidden');
    const row = (k, label) => `<label class="vol"><span>${label}</span><input type="range" min="0" max="100" value="${Math.round(Snd.vol[k] * 100)}" oninput="Snd.set('${k}', this.value/100); this.nextElementSibling.textContent=this.value+'%'"><b>${Math.round(Snd.vol[k] * 100)}%</b></label>`;
    $('panel').innerHTML = tt("<div class=\"story\"><h2>Som</h2>\n      {0}{1}{2}{3}\n      <label class=\"vol mute\"><input type=\"checkbox\" {4} onchange=\"Snd.muted=this.checked;Snd.apply();Snd.saveCfg()\"> <span>Silenciar tudo (tecla M)</span></label>\n      <div class=\"row\"><button class=\"buy alt\" onclick=\"Snd.hit('ore', Game.S.hammer); Snd.coins(500)\">Testar efeitos</button><button class=\"buy\" onclick=\"UI.close()\">Voltar ao jogo</button></div></div>", row('master', tt("Volume geral")), row('music', tt("Música")), row('sfx', tt("Efeitos (martelo, passos, moedas)")), row('amb', tt("Ambiente (vento, pássaros, grilos)")), Snd.muted ? 'checked' : '');
  },
  offlinePanel() {
    const o = Game.offline; if (!o) return; Game.offline = null;
    this.freeMouse(); this.open = 'offline'; Snd.coins(o.gain);
    $('panel').innerHTML = tt("<div class=\"story\"><h2>🤖 Bem-vindo de volta!</h2><p>Enquanto você estava fora ({0}), {1}.</p><p style=\"font-size:22px\">+<i class=\"coin\"></i><b>{2}</b> moedas</p><p class=\"hint\">Com o jogo fechado eles rendem metade do normal, por até 8 horas.</p><div class=\"row\"><button class=\"buy\" onclick=\"UI.close();Game.lock()\">Continuar</button></div></div>", fmtTime(o.away), o.robots === 1 ? tt("seu robô continuou trabalhando") : tt("seus {0} robôs continuaram trabalhando", o.robots), fmt(o.gain));
    $('panel').classList.remove('hidden');
  },
  // menu do detector (segurar G): até 3 coisas para a seta procurar
  detectorPanel() {
    const S = Game.S; this.freeMouse(); this.open = 'detector'; Snd.open();
    if (!S.gear.detector) { $('panel').innerHTML = tt("<div class=\"story\"><h2>🧭 Detector</h2><p>Você ainda não tem detector. Sem ele a seta não aparece. O Tonho do Bazar vende (barraca ITENS).</p><div class=\"row\"><button class=\"buy\" onclick=\"UI.close()\">Fechar</button></div></div>"); $('panel').classList.remove('hidden'); return; }
    const sel = S.detSel || (S.detSel = DET_DEFAULT.slice()), G = GADGETS.detector.levels[S.gear.detector];
    let h = tt("<div class=\"story\"><h2>🧭 O que a seta procura</h2><p class=\"hint\">{0} · alcance {1} m. Marque até 3. Ela aponta para o primeiro que encontrar, nesta ordem. Com a mochila cheia ela sempre aponta para a vila.</p><div class=\"detopts\">", G.n, fmt(G.range));
    for (const o of DET_ORDER) {
      const on = sel.includes(o), dis = !on && sel.length >= 3;
      h += `<label class="${dis ? 'dis' : ''}"><input type="checkbox" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''} onchange="UI.detToggle('${o}', this.checked)"> ${DET_OPTIONS[o]}</label>`;
      if (o === 'recurso' && on) h += `<select onchange="Game.S.detRes=this.value;Game.save()" style="margin:0 0 6px 28px">${RESOURCES.filter(r => !levelRule(r.ideal, S.hammer).blocked || r.special).map(r => tt("<option value=\"{0}\" {1}>{2} (nível {3})</option>", r.id, r.id === S.detRes ? 'selected' : '', r.name, r.ideal)).join('')}</select>`;
    }
    h += tt("</div><div class=\"row\"><button class=\"buy alt\" onclick=\"Game.toggleDetector();UI.detectorPanel()\">{0}</button><button class=\"buy\" onclick=\"UI.close()\">Pronto</button></div><p class=\"hint\">Toque em G para ligar/desligar · segure G (ou T) para abrir este menu</p></div>", S.detOn ? tt("Desligar a seta") : tt("Ligar a seta"));
    $('panel').innerHTML = h; $('panel').classList.remove('hidden');
  },
  detToggle(o, on) {
    const S = Game.S, sel = S.detSel || (S.detSel = DET_DEFAULT.slice());
    if (on && !sel.includes(o) && sel.length < 3) sel.push(o);
    if (!on) S.detSel = sel.filter(x => x !== o);
    if (o === 'recurso' && on && !S.detRes) S.detRes = resourceForLevel(S.hammer).id;
    Game.save(); this.detectorPanel();
  },
  bagPanel() {
    const S = Game.S; this.freeMouse(); this.open = 'bag'; Snd.open();
    const need = Game.needs(), sneed = Game.specialNeed(), by = Game.needsBy(), ids = Object.keys(S.bag);
    let h = tt("<div class=\"story\"><h2>🎒 Mochila</h2><p class=\"hint\">{0} de {1} espaços usados.</p>", fmt(Game.used()), fmt(Game.capacity()));
    if (ids.length) {
      const bv = Game.bagValue();
      h += tt("<table class=\"bagt\"><tr><th>Recurso</th><th>Qtd</th><th>Cada</th><th>Vai pro depósito</th></tr>");
      for (const id of ids) { const q = S.bag[id], k = Math.min(Game.keepWant(id, need, sneed), Game.keepCap(id, q)); h += `<tr><td><span class="dot" style="background:${RES[id].c2}"></span> ${RES[id].name}${by[id] ? `<br><small style="opacity:.6">${by[id].join(', ')}</small>` : ''}</td><td>${fmt(q)}</td><td>${fmt(RES[id].value)}</td><td>${k ? fmt(k) : '—'}</td></tr>`; }
      h += tt("</table><p>Ao entrar na vila você recebe <b><i class=\"coin\"></i>{0}</b>{1}.</p>", fmt(bv.money), bv.kept ? tt(" e {0} vão para o depósito", fmt(bv.kept)) : '');
    } else h += tt("<p>A mochila está vazia. Saia da vila e minere!</p>");
    if (S.pw.length) { const c = {}; S.pw.forEach(p => c[p.id] = (c[p.id] || 0) + 1); h += tt("<h4>Power-ups</h4><p>{0}</p>", Object.keys(c).map(id => tt("{0} ×{1} (tecla {2})", POWERUPS[id].name, c[id], POWERUPS[id].key)).join(' · ')); }
    h += tt("<h4>Atributos</h4><div class=\"mst\">{0}<span>Clique rápido</span><b>×{1}</b></div>", Object.keys(ATTRS).map(k => tt("<span>{0} (nível {1})</span><b>{2}</b>", ATTRS[k].name, S.attrs[k], k === 'bag' ? fmt(Game.capacity()) + tt(" espaços") : attrLabel(k, S.attrs[k]))).join(''), Game.clickMult());
    h += tt("<div class=\"row\"><button class=\"buy\" onclick=\"UI.close()\">Fechar</button></div></div>");
    $('panel').innerHTML = h; $('panel').classList.remove('hidden');
  },
  help() {
    this.freeMouse();
    this.open = 'help';
    $('panel').classList.remove('hidden');
    $('panel').innerHTML = tt("<div class=\"story\"><h2>Como jogar</h2>\n      <ul class=\"help\">\n        <li><b>W A S D</b> andar · <b>Shift</b> correr (gasta fôlego) · <b>Espaço</b> pular · <b>V</b> câmera</li>\n        <li><b>Segurar o botão esquerdo</b> numa pedra: minerar · <b>clicar várias vezes</b>: golpes mais rápidos (gasta fôlego)</li>\n        <li><b>E</b> perto de um NPC: abrir a loja · <b>J</b> missões · <b>Tab</b> mochila</li>\n        <li><b>1 2 3</b> power-ups · <b>R</b> transporte · <b>L</b> luz · <b>G</b> seta do detector (segure para escolher)</li>\n        <li><b>H</b> voltar à cidade voando (martelo 20+) · <b>N</b> o que fazer ao chegar na vila · <b>U</b> vender o depósito</li>\n        <li><b>Q Z X</b> gancho, escada, cama elástica · <b>Espaço no ar</b> jetpack (itens de escalada do Tonho)</li>\n        <li><b>M</b> som · <b>Esc</b> soltar o mouse e abrir o menu</li>\n      </ul>\n      <p>Saia da cidade, encha a mochila e volte. Seu Lauro compra o que sobra. Gaste no Ferreiro (martelo), na Tropeira (melhorias) e na Botica (power-ups).</p>\n      <p>A informação embaixo da mira mostra o tempo de cada pedra: <b style=\"color:#7fd36a\">verde</b> vale a pena, <b style=\"color:#ffd34d\">amarelo</b> é lento, <b style=\"color:#ff6a5a\">vermelho</b> não compensa.</p>\n      {0}\n      <h4>Progresso</h4><p class=\"hint\" style=\"margin-top:0\">Salva sozinho. {1}</p>\n      <div class=\"row\" style=\"flex-wrap:wrap\"><button class=\"buy alt\" onclick=\"Backup.manual()\">💾 Salvar agora</button><button class=\"buy alt\" onclick=\"UI.exportSave()\">Exportar</button><button class=\"buy alt\" onclick=\"document.getElementById('impfile').click()\">Importar</button><button class=\"buy alt\" onclick=\"Backup.restoreFromFile()\">📂 Da pasta</button><input type=\"file\" id=\"impfile\" accept=\".json\" style=\"display:none\" onchange=\"UI.importSave(this.files[0])\"></div>\n      <div class=\"row\" style=\"margin-top:12px\"><button class=\"buy\" onclick=\"UI.close()\">Voltar ao jogo</button><button class=\"buy alt\" onclick=\"if(confirm('Apagar todo o progresso e recomeçar?'))Game.reset()\">Recomeçar do zero</button></div><p class=\"hint\" style=\"text-align:center\">Vale Ferrado v{2}</p></div>", Object.keys(Game.S.ms || {}).length ? tt("<h4>Seus tempos</h4><div class=\"mst\">{0}</div>", Object.entries(Game.S.ms).sort((a, b) => a[1] - b[1]).map(([k, t]) => `<span>${k.replace(/^martelo/, tt("Martelo ")).replace(/^missao/, tt("Missão ")).replace(/^robo/, tt("Robô ")).replace('venda1', tt("Primeira venda"))}</span><b>${fmtTime(t)}</b>`).join('')) : '', Backup.statusText(), GAME_VERSION);
  },
  exportSave() {
    Game.save();
    const blob = new Blob([JSON.stringify(Game.S)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `vale-ferrado-progresso-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  importSave(file) {
    if (!file) return;
    file.text().then(t => {
      const d = JSON.parse(t);
      if (!d || !d.hammer) throw new Error();
      if (!confirm(tt("Carregar progresso com martelo nível {0} e {1} moedas? O progresso atual será substituído.", d.hammer, fmt(d.money || 0)))) return;
      localStorage.setItem(SAVE_KEY, JSON.stringify(d)); location.reload();
    }).catch(() => this.toast(tt("Arquivo de progresso inválido."), 'warn'));
  },

  // ---------- tabela lateral: próximas evoluções e materiais guardados ----------
  // grades de cards: escolhe 2, 3 ou 4 colunas para nenhuma linha ficar com um card sozinho
  fixGrids() {
    for (const g of document.querySelectorAll('#panel .grid')) {
      const n = g.children.length; g.classList.remove('c2', 'c3', 'c4'); if (n < 2) continue;
      const pick = [3, 4, 2].find(c => n % c === 0) || [3, 4, 2].sort((a, b) => (n % b || b) - (n % a || a))[0];
      g.classList.add('c' + Math.min(pick, n));
    }
  },
  // miniatura do material (foto); se não der para gerar, uma bolinha na cor dele
  ico(id, px = 18) { const u = Render.resIcon(id); return u ? `<img class="ri" src="${u}" width="${px}" height="${px}" alt="">` : `<i class="rd" style="background:${RES[id].c2};width:${px * 0.5}px;height:${px * 0.5}px"></i>`; },
  // painel da direita: sempre mostra a missão do jogo e a missão de evolução (I mostra/esconde os detalhes)
  updateInvHud() {
    const el = $('inv'), S = Game.S;
    if (UI.open) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    let html = '';
    const c = Missions.current();
    if (c) html += `<div class="ih">📜 ${c.n ? tt("Missão {0}/{1}", c.n, c.of) : tt("Missão")}${c.reward ? `<small class="rw"><i class="coin"></i>+${fmt(c.reward)}</small>` : ''}</div><div class="mt">${c.t}</div>${c.max > 1 ? `<i class="mpb"><em style="width:${c.cur / c.max * 100}%"></em></i><div class="mc">${fmt(c.cur)} / ${fmt(c.max)}</div>` : ''}`;
    const E = Game.evoNeeds();
    if (E.tier.length) {
      const sum = E.tier.reduce((a, e) => a + e.miss, 0);
      html += `<div class="ih">${tt("⚒ Evolução")}<small>${tt("faltam {0}", fmt(sum))}</small></div>`;
      for (const e of E.tier.slice(0, 3)) {
        const st = e.have + e.bag >= e.total ? 1 : 0;
        html += `<div class="nr s${st}">${this.ico(e.id, 26)}<b>${RES[e.id].name.split(' (')[0]}</b><span>${fmt(e.have)}/${fmt(e.total)}${e.bag ? ` <em>+${fmt(e.bag)}🎒</em>` : ''}</span><small>${e.f.slice(0, 3).join(', ')}${e.f.length > 3 ? ' +' + (e.f.length - 3) : ''}</small></div>`;
      }
      if (E.tier.every(e => e.have + e.bag >= e.total)) html += tt("<div class=\"leg\"><span class=\"s1\">● Falta só entregar: volte à cidade</span></div>");
    }
    if (S.showInv) {
      const rest = E.list.filter(e => !E.tier.includes(e));
      if (rest.length) html += `<div class="ih sm">${tt("Depois")}</div><div class="nx">` + rest.slice(0, 8).map(e => `<span title="${RES[e.id].name}">${this.ico(e.id, 20)}${fmt(e.miss)}</span>`).join('') + (rest.length > 8 ? `<span>+${rest.length - 8}</span>` : '') + '</div>';
      const bv = Game.bagValue();
      if (Object.keys(S.bag).length) html += tt("<div class=\"bagv\"><span>🎒 Mochila vale</span><b><i class=\"coin\"></i>{0}</b>{1}</div>", fmt(bv.money), bv.mission ? tt("<small>📜 {0} para a missão</small>", fmt(bv.mission)) : '');
      if (Robots.list.length) { const carrying = Robots.list.reduce((a, r) => a + r.n, 0); html += tt("<div class=\"bagv\"><span>{0}</span>{1}</div>", Robots.list.length > 1 ? tt("🤖 {0} robôs minerando", Robots.list.length) : tt("🤖 1 robô minerando"), carrying ? tt("<small>trazendo {0}</small>", fmt(carrying)) : ''); }
    }
    if (E.ready) html += tt("<div class=\"leg\"><span class=\"s2\">{0}</span></div>", E.ready > 1 ? tt("✔ {0} melhorias prontas para comprar", E.ready) : tt("✔ 1 melhoria pronta para comprar"));
    html += `<div class="leg ft"><span><kbd>J</kbd> ${tt("todas as missões")}</span><span><kbd>I</kbd> ${S.showInv ? tt("menos") : tt("mais")}</span></div>`;
    if (html !== this.invHtml) { el.innerHTML = html; this.invHtml = html; }
  },
  // ---------- recibo do Seu Lauro (o que foi guardado e o que foi vendido) ----------
  receiptHtml(r, full) {
    let h = tt("<table><tr><th>Material</th><th>Trouxe</th><th>🏠 Guardou</th><th>Vendeu</th></tr>");
    for (const l of r.lines) {
      h += `<tr><td><i style="background:${RES[l.id].c2}"></i>${RES[l.id].name.split(' (')[0]}</td><td>${fmt(l.q)}</td><td class="${l.k ? 'k' : ''}">${l.k ? fmt(l.k) : '—'}</td><td class="${l.sq ? 'v' : ''}">${l.sq ? fmt(l.sq) + ' <small>= ' + fmt(l.money) + '</small>' : '—'}</td></tr>`;
    }
    const took = r.took ? Object.keys(r.took) : [];
    h += tt("</table>{0}<div class=\"tot\"><span>🏠 {1} guardados</span><span><i class=\"coin\"></i>+{2} moedas</span></div>", took.length ? tt("<div class=\"tot\"><span>📜 Missão: {0}</span></div>", took.map(id => fmt(r.took[id]) + ' ' + RES[id].name).join(', ')) : '', fmt(r.kept), fmt(r.earned));
    return h;
  },
  showReceipt(r) {
    const el = $('receipt');
    el.innerHTML = tt("<div class=\"rh\">Entrega no Armazém</div>{0}", this.receiptHtml(r));
    el.classList.add('on');
    clearTimeout(this.rcT); this.rcT = setTimeout(() => el.classList.remove('on'), 9000 + r.lines.length * 1200);
  },
  updateDetectorHud() {
    const el = $('det'), d = Game.det;
    el.style.display = 'none'; return; // a bússola virou a seta do detector
    if (!d) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    if (d.done) { el.innerHTML = tt("<div class=\"dial off\"><i></i></div><div><b>AUTO · tudo pronto</b><span>Nada faltando para as próximas evoluções</span></div>"); return; }
    const R = RES[d.res], tag = d.auto ? tt("<em class=\"auto\">AUTO</em>") : tt("<em class=\"man\">MANUAL</em>");
    const falta = d.auto && d.falta ? tt(" · faltam {0}", fmt(d.falta)) : '';
    if (d.none) { el.innerHTML = tt("<div class=\"dial off\"><i></i></div><div><b>{0}{1}</b><span>Sem sinal{2}{3}</span></div>", tag, R.name.split(' (')[0], falta, d.auto ? tt(" · fora do alcance") : tt(" · <kbd>T</kbd> troca")); return; }
    const P = Game.P, fx = -Math.sin(P.yaw), fy = -Math.cos(P.yaw), rx = Math.cos(P.yaw), ry = -Math.sin(P.yaw);
    const dx = Math.cos(d.bearing), dy = Math.sin(d.bearing);
    const ang = Math.atan2(dx * rx + dy * ry, dx * fx + dy * fy) * 180 / Math.PI;
    const bars = Math.max(1, Math.ceil(d.strength * 5));
    const dist = d.dist < 15 ? tt("aqui perto!") : d.lv === 1 ? (d.dist < 40 ? 'perto' : tt("um pouco longe")) : '~' + fmt(Math.round(d.dist / (d.lv === 2 ? 25 : 50)) * (d.lv === 2 ? 25 : 50)) + ' m';
    const more = d.auto && d.count > 1 ? tt(" · +{0} na lista", d.count - 1) : '';
    el.innerHTML = `<div class="dial" style="--s:${d.strength}"><i style="transform:rotate(${ang}deg)"></i></div><div><b>${tag}${R.name.split(' (')[0]}</b><span>${dist} · ${'▮'.repeat(bars)}${'▯'.repeat(5 - bars)}${falta}${more}</span></div>`;
    // bipe que acelera conforme você se aproxima
    this.beepT = (this.beepT || 0) - 0.1;
    if (this.beepT <= 0 && started && !this.open && Game.locked()) { Snd.beep(500 + d.strength * 700); this.beepT = 0.25 + (1 - d.strength) * 1.6; }
  },
  beep(freq) {
    try {
      this.ac = this.ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = this.ac.createOscillator(), g = this.ac.createGain();
      o.frequency.value = freq; o.type = 'sine'; g.gain.setValueAtTime(0.04, this.ac.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, this.ac.currentTime + 0.12);
      o.connect(g); g.connect(this.ac.destination); o.start(); o.stop(this.ac.currentTime + 0.13);
    } catch (e) {}
  },
  updateHud(dt) {
    // menu de pausa sempre que o mouse estiver solto e nenhuma janela aberta
    this.lockHint(!Game.locked() && !this.open);
    this.hudT -= dt; if (this.hudT > 0) return; this.hudT = 0.1;
    const S = Game.S, G = Game;
    $('money').textContent = fmt(S.money);
    $('cint').textContent = (S.cint || 0) === 1 ? tt("✦ {0} Cintilha", fmt(S.cint || 0)) : tt("✦ {0} Cintilhas", fmt(S.cint || 0));
    $('hname').textContent = HAMMERS[S.hammer].n;
    $('hlv').textContent = tt("Martelo nv {0} · força ", S.hammer) + fmt(G.force()) + (G.mult('force') > 1 ? ' ⚡' : '');
    const used = G.used(), cap = G.capacity();
    const st = $('stam'); st.style.width = (G.P.stamina * 100) + '%'; st.className = G.P.tired ? 'tired' : G.P.sprint ? 'run' : '';
    $('fuelwrap').style.display = (S.gear.climb || 0) >= 5 && (G.fuel !== undefined && G.fuel < 0.999 || G.jetting) ? 'block' : 'none'; if (G.fuel !== undefined) $('fuel').style.width = G.fuel * 100 + '%';
    $('stamwrap').style.opacity = G.P.stamina < 0.999 || G.P.sprint ? 1 : 0.35;
    $('bagtxt').textContent = tt("Mochila {0} / {1}", fmt(used), fmt(cap));
    $('bagfill').style.width = Math.min(100, used / cap * 100) + '%';
    $('bagfill').className = used >= cap ? 'full' : used / cap > 0.8 ? 'warn' : '';
    // local
    const sub = World.subAt(G.P.x, G.P.y);
    let loc;
    if (G.inCity) loc = tt("<b>Vale Ferrado</b>");
    else if (sub) loc = tt("<b>{0}</b> · <i>martelo {1}</i>", sub.R.name, sub.level);
    else loc = tt("<b>Campos de Vale Ferrado</b> · {0} m", Math.round(Math.hypot(G.P.x, G.P.y)));
    if (World.veio) loc += tt("<br><span class=\"veio\">⛏ Veio de {0} aflorado: {1} s</span>", RES[World.veio.res].name, Math.ceil(World.veio.t));
    $('loc').innerHTML = loc;
    // power-ups
    let pw = '';
    for (const id in POWERUPS) {
      const n = S.pw.filter(p => p.id === id).length;
      const act = S.active.find(a => a.id === id);
      if (!n && !act) continue;
      pw += `<div class="pw ${n ? '' : 'empty'} ${act ? 'on' : ''}" style="--c:${POWERUPS[id].color}"><kbd>${POWERUPS[id].key}</kbd><span>${POWERUPS[id].name}</span><b>${n}</b>${act ? `<em>${Math.ceil(act.left)}s</em>` : ''}</div>`;
    }
    $('pws').innerHTML = pw; $('pws').style.display = pw ? 'flex' : 'none';
    // dica NPC
    const npc = G.npcNear();
    const pk = !npc && G.pickNear(), hint = npc ? tt("[E] Falar com {0}", npc.name) : pk ? (S.hammer >= 60 ? tt("[E] Pegar a Picareta 61") : tt("[E] Tocar a Picareta 61 (lacrada)")) : '';
    $('npchint').textContent = hint && !this.open ? hint : '';
    $('npchint').style.display = hint && !this.open ? 'block' : 'none';
    // atualiza só as lojas dos NPCs (as outras janelas não são lojas)
    if (['ferreiro', 'tropeira', 'botica', 'armazem'].includes(this.open) && Math.random() < 0.05) this.renderPanel();
    // relógio
    const c = S.clock, hh = Math.floor(c * 24), mm = Math.floor((c * 24 - hh) * 60);
    $('clock').textContent = `${G.isNight() ? '🌙' : '☀️'} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    // equipamentos ativos
    const eq = [];
    if (S.gear.ride) eq.push(`<span class="${S.riding ? 'on' : ''}"><kbd>R</kbd>${GADGETS.ride.levels[S.gear.ride].n}</span>`);
    if (S.gear.detector) eq.push(`<span class="${S.detOn ? 'on' : ''}"><kbd>G</kbd>${GADGETS.detector.levels[S.gear.detector].n}</span>`);
    $('equip').innerHTML = eq.join('');
    this.updateDetectorHud();
    this.updateInvHud();
    Missions.hud();
    { const mb = $('missbtn'); if (mb && !mb.dataset.t) { mb.dataset.t = 1; mb.innerHTML = tt("📜 Missões e evoluções") + ' <kbd>J</kbd>'; } if (mb) mb.style.display = !document.pointerLockElement && !this.open && typeof started !== 'undefined' && started ? 'block' : 'none'; }
    { const rb = $('recall'), ok = S.hammer >= RECALL_LVL && !G.inCity && !G.travel && !this.open;
      rb.style.display = ok ? 'inline-flex' : 'none';
      if (ok) { const c = G.recallCost(); $('recallc').innerHTML = `<i class="coin"></i>${fmt(c)}`; rb.classList.toggle('off', S.money < c); }
      $('travelbar').style.display = G.travel ? 'block' : 'none';
      if (G.travel) $('travelp').style.width = Math.min(100, G.travel.t / G.travel.dur * 100) + '%'; }
    { const sm = $('sellmode'); sm.style.display = G.inCity || Object.keys(S.bag).length ? '' : 'none'; sm.innerHTML = tt("{0} Na vila: {1} <kbd>N</kbd>", { sobra: '🏠', guardar: '📦', vender: '💰' }[G.sellMode()], SELL_MODES[G.sellMode()]);
      const cb = $('citybar'), sv = G.inCity && !this.open ? Object.keys(S.stock).reduce((a, k) => a + (S.stock[k] || 0) * RES[k].value, 0) : 0;
      if (G.unloadT !== undefined && !this.open) { cb.style.display = 'block'; cb.innerHTML = tt("Entregando a mochila…"); }
      else if (sv) { cb.style.display = 'block'; cb.innerHTML = tt("<button onclick=\"Game.sellAllStock()\">💰 Vender o depósito · {0} <kbd>U</kbd></button>", fmt(sv)); }
      else cb.style.display = 'none'; }
    $('climb').style.display = Game.P.climbing && Game.P.moving && !this.open ? 'block' : 'none';
  },
};
