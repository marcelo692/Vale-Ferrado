// =============================================================
// Vale Ferrado — interface: HUD, lojas dos NPCs, avisos e história
// =============================================================
'use strict';

const $ = id => document.getElementById(id);

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
    return `<li class="${ok ? 'ok' : 'no'}"><span class="dot" style="background:${RES[m.id].c2}"></span>${RES[m.id].name}: <b>${fmt(Math.min(have, m.qty))}/${fmt(m.qty)}</b>${inBag ? ` <i>(+${inBag} na mochila)</i>` : ''}</li>`;
  },
  costHtml(c) {
    const okM = Game.S.money >= c.money;
    return `<ul class="cost"><li class="${okM ? 'ok' : 'no'}"><i class="coin"></i>Moedas: <b>${fmt(c.money)}</b></li>${c.mats.map(m => this.matLine(m)).join('')}</ul>`;
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
      return `<div class="pics"><figure><img src="${Render.itemImg(kind, a)}" alt=""><figcaption>Item</figcaption></figure><figure><img src="${Render.charImg(kind, a)}" alt=""><figcaption>Em você</figcaption></figure></div>`;
    } catch (e) { return ''; }
  },
  openNpc(id) {
    this.freeMouse(); Snd.open();
    this.open = id;
    $('panel').classList.remove('hidden');
    this.renderPanel();
  },
  close() { if (this.open) Snd.close(); this.open = null; $('panel').classList.add('hidden'); Game.lock(); },

  renderPanel() {
    const S = Game.S, id = this.open;
    if (!id || !NPCS.some(n => n.id === id)) return;
    const npc = NPCS.find(n => n.id === id);
    let h = `<div class="win"><div class="ph" style="--npc:${npc ? npc.color : '#888'}"><div class="avatar"></div><div><h2>${npc ? npc.name : ''}</h2><p>${npc ? npc.role : ''}</p></div><button class="x" onclick="UI.close()">✕</button></div><div class="pb">`;

    if (id === 'ferreiro') {
      const L = S.hammer;
      h += `<div class="cur"><span class="lv">Nível ${L}</span><h3>${HAMMERS[L].n}</h3><p>Força ${fmt(HAMMERS[L].f)}</p></div>`;
      if (L < MAX_LEVEL) {
        const c = hammerCost(L + 1);
        h += `<div class="card big">${this.pics('hammer', L + 1, true)}<span class="lv">Próximo · nível ${L + 1}</span><h3>${HAMMERS[L + 1].n}</h3><p>Força ${fmt(HAMMERS[L].f)} → <b>${fmt(HAMMERS[L + 1].f)}</b></p>${this.costHtml(c)}${SPECIAL_AT[L + 1] ? `<p class="rare">⛰ ${RES[SPECIAL_AT[L + 1]].name} só existe perto do topo das montanhas da região ${REGIONS[RES[SPECIAL_AT[L + 1]].region].name}</p>` : ''}
          <button class="buy" ${Game.canPay(c) ? '' : 'disabled'} onclick="Game.buyHammer();UI.renderPanel()">Forjar</button></div>`;
        h += `<h4>Pela frente</h4><ol class="road" start="${L + 2}">`;
        for (let i = L + 2; i <= Math.min(MAX_LEVEL, L + 4); i++) h += `<li>${HAMMERS[i].n} <i>força ${fmt(HAMMERS[i].f)}</i></li>`;
        h += `</ol>`;
      } else h += `<p class="done">Você tem o Martelo do Vale. Não existe nada mais forte.</p>`;
      h += `<p class="hint">Os materiais saem do depósito.</p>`;
    }

    if (id === 'tropeira') {
      h += `<div class="grid">`;
      for (const k in ATTRS) {
        const L = S.attrs[k];
        h += `<div class="card">${this.pics(k, Math.min(MAX_LEVEL, L + 1))}<span class="lv">${ATTRS[k].part} · nível ${L}</span><h3>${ATTRS[k].name}</h3>`;
        if (L < MAX_LEVEL) {
          const c = attrCost(k, L + 1);
          h += `<p>${attrLabel(k, L)} → <b>${attrLabel(k, L + 1)}</b></p>${this.costHtml(c)}<button class="buy" ${Game.canPay(c) ? '' : 'disabled'} onclick="Game.buyAttr('${k}');UI.renderPanel()">Melhorar</button>`;
        } else h += `<p class="done">${attrLabel(k, L)} (máximo)</p>`;
        h += `</div>`;
      }
      h += `</div>`;
    }

    if (id === 'botica') {
      const tier = eraOf(S.hammer);
      h += `<p class="free">Espaço livre na mochila: <b>${fmt(Game.free())}</b> de ${fmt(Game.capacity())} · ✦ Cintilhas: <b>${fmt(S.cint || 0)}</b></p><div class="grid">`;
      for (const pid in POWERUPS) {
        const P = POWERUPS[pid], price = powerPrice(pid, S.hammer);
        const owned = S.pw.filter(p => p.id === pid).length;
        const ci = powerCint(pid, S.hammer), ok = S.money >= price && (S.cint || 0) >= ci && Game.free() >= P.slots;
        h += `<div class="card">${this.pics('pw', pid)}<span class="lv" style="color:${P.color}">Tecla ${P.key} · na mochila: ${owned}</span><h3>${P.name} ${ROMAN[tier]}</h3>
          <p>+${Math.round(powerBonus(pid, tier) * 100)}% ${P.desc} por ${P.dur / 60} min · ocupa ${P.slots} espaços</p>
          <ul class="cost"><li class="${S.money >= price ? 'ok' : 'no'}"><i class="coin"></i>Moedas: <b>${fmt(price)}</b></li><li class="${(S.cint || 0) >= ci ? 'ok' : 'no'}">✦ Cintilhas: <b>${ci}</b></li></ul>
          <button class="buy" ${ok ? '' : 'disabled'} onclick="Game.buyPower('${pid}');UI.renderPanel()">Comprar</button></div>`;
      }
      const oL = S.olho || 0, oN = oL + 1;
      h += `<div class="card"><span class="lv">Nível ${oL} de ${OLHO.length - 1}</span><h3>👁 Olho de Garimpeiro</h3><p>Chance de achar Cintilha nas pedras: <b>${(cintChance(oL) * 100).toFixed(1).replace('.', ',')}%</b>${oN < OLHO.length ? ` → <b>${(cintChance(oN) * 100).toFixed(1).replace('.', ',')}%</b>` : ''}</p>
        ${oN < OLHO.length ? `<ul class="cost"><li class="${S.money >= OLHO[oN] ? 'ok' : 'no'}"><i class="coin"></i>Moedas: <b>${fmt(OLHO[oN])}</b></li></ul><button class="buy" ${S.money >= OLHO[oN] ? '' : 'disabled'} onclick="Game.buyOlho();UI.renderPanel()">Melhorar</button>` : '<button class="buy" disabled>Nível máximo</button>'}</div>`;
      h += `</div><p class="hint">Cintilhas saem das pedras, dos robôs e dos Veios de Cintilha. Teclas 1, 2 e 3 ativam; os efeitos se somam.</p>`;
    }

    if (id === 'bazar') {
      h += `<p class="free">Seu dinheiro: <b><i class="coin"></i>${fmt(S.money)}</b></p>`;
      for (const type in GADGETS) {
        const T = GADGETS[type], have = S.gear[type];
        h += `<h4>${T.title} <span class="kbd">${T.key}</span></h4><p class="hint" style="margin:0 0 8px">${T.desc}</p><div class="grid">`;
        for (let lv = Math.max(1, have || 1); lv < T.levels.length; lv++) {
          const G = T.levels[lv], owned = have >= lv, ok = !owned && Game.canPay({ money: G.price, mats: G.mats || [] });
          h += `<div class="card ${have === lv ? 'eq' : ''}">${this.pics(type, lv)}<span class="lv">Nível ${lv}</span><h3>${G.n}</h3><p>${G.info}</p>
            ${owned ? `<ul class="cost"><li class="ok"><i class="coin"></i>Moedas: <b>${fmt(G.price)}</b></li></ul>` : this.costHtml({ money: G.price, mats: G.mats || [] })}${G.mats ? '<p class="rare">⛰ Recurso raro das montanhas</p>' : ''}
            ${have === lv ? '<button class="buy" disabled>Equipado</button>' : owned ? '<button class="buy" disabled>Você tem</button>' : `<button class="buy" ${ok ? '' : 'disabled'} onclick="Game.buyGadget('${type}',${lv});UI.renderPanel()">Comprar</button>`}</div>`;
        }
        h += `</div>`;
        if (type === 'detector' && have) h += `<div class="row" style="margin-top:10px"><button class="buy alt" onclick="UI.detectorPanel()">🧭 Escolher o que a seta procura</button></div>`;
      }
      // robôs auto-mineradores
      const nR = S.robots || 0;
      h += `<h4>🤖 Robôs auto-mineradores</h4><p class="hint" style="margin:0 0 8px">Mineram sozinhos o que falta para suas evoluções e entregam no depósito. Evoluem com o seu martelo.</p><div class="grid">`;
      let pr = '';
      try { pr = `<div class="pics"><figure><img src="${Render.robotImg(1)}" alt=""><figcaption>Robô</figcaption></figure><figure><img src="${Render.robotImg(Math.min(ROBOT_MAX, nR + 1))}" alt=""><figcaption>Sua equipe</figcaption></figure></div>`; } catch (e) {}
      if (nR < ROBOT_MAX) {
        const price = robotPrice(nR), ok = S.money >= price;
        h += `<div class="card">${pr}<span class="lv">Robô ${nR + 1} de ${ROBOT_MAX}</span><h3>${ROBOT_NAMES[nR]}</h3><p>Força ${fmt(Robots.force())} por golpe · ${fmt(Robots.speed())} m/s · carrega ${fmt(Robots.cap())}</p>${this.costHtml({ money: price, mats: [] })}<button class="buy" ${ok ? '' : 'disabled'} onclick="Robots.buy();UI.renderPanel()">Comprar</button></div>`;
      } else h += `<div class="card eq">${pr}<span class="lv">Equipe completa</span><h3>${ROBOT_MAX} robôs</h3><p>Você tem todos os robôs.</p></div>`;
      h += `</div>`;
      if (nR) {
        Robots.sync();
        h += `<p class="free" style="margin-top:10px">Sua equipe: ${Robots.list.map(r => `<b>${r.name}</b>`).join(', ')} · já trouxeram ${fmt(S.robotTotal || 0)} recursos</p>`;
      }
    }

    if (id === 'armazem') {
      const ids = Object.keys(S.stock).filter(k => S.stock[k] > 0);
      const mode = Game.sellMode();
      h += `<p>Ao chegar na vila, as missões pegam o que precisam. O resto:</p><div class="row" style="flex-wrap:wrap">${Object.keys(SELL_MODES).map(m => `<button class="buy ${m === mode ? '' : 'alt'}" onclick="Game.S.sellMode='${m}';Game.save();UI.renderPanel()">${{ sobra: '🏠 Guardar o que falta', guardar: '📦 Guardar tudo', vender: '💰 Vender tudo' }[m]}</button>`).join('')}</div><p class="hint" style="text-align:center">Tecla N troca o modo em qualquer lugar.</p>`;
      const sv = Object.keys(S.stock).reduce((a, k) => a + (S.stock[k] || 0) * RES[k].value, 0);
      if (sv) h += `<div class="row"><button class="buy" onclick="Game.sellAllStock();UI.renderPanel()">💰 Vender o depósito (${fmt(sv)})</button></div>`;

      if ((S.receipts || []).length) h += `<h4>Última entrega</h4><div class="receipt-in">${this.receiptHtml(S.receipts[0])}</div>`;
      if (ids.length) {
        h += `<h4>Depósito</h4><ul class="stock">${ids.map(k => `<li><span class="dot" style="background:${RES[k].c2}"></span>${RES[k].name}<b>${fmt(S.stock[k])}</b><i>${fmt(RES[k].value)} cada</i></li>`).join('')}</ul>
          <button class="buy alt" onclick="UI.sellStock()">Vender só o que sobra</button>`;
      } else h += `<p class="hint">Depósito vazio.</p>`;
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
    this.toast(earned ? `Excedente vendido por ${fmt(earned)} moedas.` : 'Nada sobrando: tudo no depósito ainda vai ser usado.', 'money');
    Game.save(); this.renderPanel();
  },

  story(L) {
    const st = STORY[L]; if (!st) return;
    Game.S.seen[L] = true; Game.save();
    this.freeMouse(); Snd.story();
    this.open = 'story';
    $('panel').classList.remove('hidden');
    $('panel').innerHTML = `<div class="story"><span class="lv">${L === 1 ? 'Prólogo' : 'Marco · nível ' + L}</span><h2>${st.t}</h2><p>${st.s}</p><button class="buy" onclick="UI.close()">Continuar</button></div>`;
  },

  soundPanel() {
    this.freeMouse(); Snd.start();
    this.open = 'sound';
    $('panel').classList.remove('hidden');
    const row = (k, label) => `<label class="vol"><span>${label}</span><input type="range" min="0" max="100" value="${Math.round(Snd.vol[k] * 100)}" oninput="Snd.set('${k}', this.value/100); this.nextElementSibling.textContent=this.value+'%'"><b>${Math.round(Snd.vol[k] * 100)}%</b></label>`;
    $('panel').innerHTML = `<div class="story"><h2>Som</h2>
      ${row('master', 'Volume geral')}${row('music', 'Música')}${row('sfx', 'Efeitos (martelo, passos, moedas)')}${row('amb', 'Ambiente (vento, pássaros, grilos)')}
      <label class="vol mute"><input type="checkbox" ${Snd.muted ? 'checked' : ''} onchange="Snd.muted=this.checked;Snd.apply();Snd.saveCfg()"> <span>Silenciar tudo (tecla M)</span></label>
      <div class="row"><button class="buy alt" onclick="Snd.hit('ore', Game.S.hammer); Snd.coins(500)">Testar efeitos</button><button class="buy" onclick="UI.close()">Voltar ao jogo</button></div></div>`;
  },
  offlinePanel() {
    const o = Game.offline; if (!o) return; Game.offline = null;
    this.freeMouse(); this.open = 'offline'; Snd.coins(o.gain);
    $('panel').innerHTML = `<div class="story"><h2>🤖 Bem-vindo de volta!</h2><p>Enquanto você estava fora (${fmtTime(o.away)}), ${o.robots === 1 ? 'seu robô continuou' : `seus ${o.robots} robôs continuaram`} trabalhando.</p><p style="font-size:22px">+<i class="coin"></i><b>${fmt(o.gain)}</b> moedas</p><p class="hint">Com o jogo fechado eles rendem metade do normal, por até 8 horas.</p><div class="row"><button class="buy" onclick="UI.close();Game.lock()">Continuar</button></div></div>`;
    $('panel').classList.remove('hidden');
  },
  // menu do detector (segurar G): até 3 coisas para a seta procurar
  detectorPanel() {
    const S = Game.S; this.freeMouse(); this.open = 'detector'; Snd.open();
    if (!S.gear.detector) { $('panel').innerHTML = `<div class="story"><h2>🧭 Detector</h2><p>Você ainda não tem detector. Sem ele a seta não aparece. O Tonho do Bazar vende (barraca ITENS).</p><div class="row"><button class="buy" onclick="UI.close()">Fechar</button></div></div>`; $('panel').classList.remove('hidden'); return; }
    const sel = S.detSel || (S.detSel = DET_DEFAULT.slice()), G = GADGETS.detector.levels[S.gear.detector];
    let h = `<div class="story"><h2>🧭 O que a seta procura</h2><p class="hint">${G.n} · alcance ${fmt(G.range)} m. Marque até 3. Ela aponta para o primeiro que encontrar, nesta ordem. Com a mochila cheia ela sempre aponta para a vila.</p><div class="detopts">`;
    for (const o of DET_ORDER) {
      const on = sel.includes(o), dis = !on && sel.length >= 3;
      h += `<label class="${dis ? 'dis' : ''}"><input type="checkbox" ${on ? 'checked' : ''} ${dis ? 'disabled' : ''} onchange="UI.detToggle('${o}', this.checked)"> ${DET_OPTIONS[o]}</label>`;
      if (o === 'recurso' && on) h += `<select onchange="Game.S.detRes=this.value;Game.save()" style="margin:0 0 6px 28px">${RESOURCES.filter(r => !levelRule(r.ideal, S.hammer).blocked || r.special).map(r => `<option value="${r.id}" ${r.id === S.detRes ? 'selected' : ''}>${r.name} (nível ${r.ideal})</option>`).join('')}</select>`;
    }
    h += `</div><div class="row"><button class="buy alt" onclick="Game.toggleDetector();UI.detectorPanel()">${S.detOn ? 'Desligar a seta' : 'Ligar a seta'}</button><button class="buy" onclick="UI.close()">Pronto</button></div><p class="hint">Toque em G para ligar/desligar · segure G (ou T) para abrir este menu</p></div>`;
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
    let h = `<div class="story"><h2>🎒 Mochila</h2><p class="hint">${fmt(Game.used())} de ${fmt(Game.capacity())} espaços usados.</p>`;
    if (ids.length) {
      const bv = Game.bagValue();
      h += `<table class="bagt"><tr><th>Recurso</th><th>Qtd</th><th>Cada</th><th>Vai pro depósito</th></tr>`;
      for (const id of ids) { const q = S.bag[id], k = Math.min(Game.keepWant(id, need, sneed), Game.keepCap(id, q)); h += `<tr><td><span class="dot" style="background:${RES[id].c2}"></span> ${RES[id].name}${by[id] ? `<br><small style="opacity:.6">${by[id].join(', ')}</small>` : ''}</td><td>${fmt(q)}</td><td>${fmt(RES[id].value)}</td><td>${k ? fmt(k) : '—'}</td></tr>`; }
      h += `</table><p>Ao entrar na vila você recebe <b><i class="coin"></i>${fmt(bv.money)}</b>${bv.kept ? ` e ${fmt(bv.kept)} vão para o depósito` : ''}.</p>`;
    } else h += `<p>A mochila está vazia. Saia da vila e minere!</p>`;
    if (S.pw.length) { const c = {}; S.pw.forEach(p => c[p.id] = (c[p.id] || 0) + 1); h += `<h4>Power-ups</h4><p>${Object.keys(c).map(id => `${POWERUPS[id].name} ×${c[id]} (tecla ${POWERUPS[id].key})`).join(' · ')}</p>`; }
    h += `<h4>Atributos</h4><div class="mst">${Object.keys(ATTRS).map(k => `<span>${ATTRS[k].name} (nível ${S.attrs[k]})</span><b>${k === 'bag' ? fmt(Game.capacity()) + ' espaços' : attrLabel(k, S.attrs[k])}</b>`).join('')}<span>Clique rápido</span><b>×${Game.clickMult()}</b></div>`;
    h += `<div class="row"><button class="buy" onclick="UI.close()">Fechar</button></div></div>`;
    $('panel').innerHTML = h; $('panel').classList.remove('hidden');
  },
  help() {
    this.freeMouse();
    this.open = 'help';
    $('panel').classList.remove('hidden');
    $('panel').innerHTML = `<div class="story"><h2>Como jogar</h2>
      <ul class="help">
        <li><b>W A S D</b> andar · <b>Shift</b> correr (gasta fôlego) · <b>Espaço</b> pular · <b>V</b> câmera</li>
        <li><b>Segurar o botão esquerdo</b> numa pedra: minerar · <b>clicar várias vezes</b>: golpes mais rápidos (gasta fôlego)</li>
        <li><b>E</b> perto de um NPC: abrir a loja · <b>J</b> missões · <b>Tab</b> mochila</li>
        <li><b>1 2 3</b> power-ups · <b>R</b> transporte · <b>L</b> luz · <b>G</b> seta do detector (segure para escolher)</li>
        <li><b>H</b> voltar à cidade voando (martelo 20+) · <b>N</b> o que fazer ao chegar na vila · <b>U</b> vender o depósito</li>
        <li><b>Q Z X</b> gancho, escada, cama elástica · <b>Espaço no ar</b> jetpack (itens de escalada do Tonho)</li>
        <li><b>M</b> som · <b>Esc</b> soltar o mouse e abrir o menu</li>
      </ul>
      <p>Saia da cidade, encha a mochila e volte. Seu Lauro compra o que sobra. Gaste no Ferreiro (martelo), na Tropeira (melhorias) e na Botica (power-ups).</p>
      <p>A informação embaixo da mira mostra o tempo de cada pedra: <b style="color:#7fd36a">verde</b> vale a pena, <b style="color:#ffd34d">amarelo</b> é lento, <b style="color:#ff6a5a">vermelho</b> não compensa.</p>
      ${Object.keys(Game.S.ms || {}).length ? `<h4>Seus tempos</h4><div class="mst">${Object.entries(Game.S.ms).sort((a, b) => a[1] - b[1]).map(([k, t]) => `<span>${k.replace(/^martelo/, 'Martelo ').replace(/^missao/, 'Missão ').replace(/^robo/, 'Robô ').replace('venda1', 'Primeira venda')}</span><b>${fmtTime(t)}</b>`).join('')}</div>` : ''}
      <h4>Progresso</h4><p class="hint" style="margin-top:0">Salva sozinho. ${Backup.statusText()}</p>
      <div class="row" style="flex-wrap:wrap"><button class="buy alt" onclick="Backup.manual()">💾 Salvar agora</button><button class="buy alt" onclick="UI.exportSave()">Exportar</button><button class="buy alt" onclick="document.getElementById('impfile').click()">Importar</button><button class="buy alt" onclick="Backup.restoreFromFile()">📂 Da pasta</button><input type="file" id="impfile" accept=".json" style="display:none" onchange="UI.importSave(this.files[0])"></div>
      <div class="row" style="margin-top:12px"><button class="buy" onclick="UI.close()">Voltar ao jogo</button><button class="buy alt" onclick="if(confirm('Apagar todo o progresso e recomeçar?'))Game.reset()">Recomeçar do zero</button></div><p class="hint" style="text-align:center">Vale Ferrado v${GAME_VERSION}</p></div>`;
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
      if (!confirm(`Carregar progresso com martelo nível ${d.hammer} e ${fmt(d.money || 0)} moedas? O progresso atual será substituído.`)) return;
      localStorage.setItem(SAVE_KEY, JSON.stringify(d)); location.reload();
    }).catch(() => this.toast('Arquivo de progresso inválido.', 'warn'));
  },

  // ---------- tabela lateral: próximas evoluções e materiais guardados ----------
  updateInvHud() {
    const el = $('inv'), S = Game.S;
    if (!S.showInv) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const rows = [];
    const bv = Game.bagValue();
    let html = Object.keys(S.bag).length ? `<div class="bagv"><span>🎒 Mochila vale</span><b><i class="coin"></i>${fmt(bv.money)}</b>${bv.mission ? `<small>📜 ${fmt(bv.mission)} para a missão</small>` : ''}</div>` : '';
    if (Robots.list.length) {
      const carrying = Robots.list.reduce((a, r) => a + r.n, 0);
      html += `<div class="bagv"><span>🤖 ${Robots.list.length} robô${Robots.list.length > 1 ? 's' : ''} minerando</span>${carrying ? `<small>trazendo ${fmt(carrying)}</small>` : ''}</div>`;
    }
    // só a próxima forja; as outras melhorias aparecem como aviso quando dá para comprar
    const okOf = c => { let st = S.money >= c.money ? 2 : 0; for (const m of c.mats) { const have = S.stock[m.id] || 0, bag = S.bag[m.id] || 0; st = Math.min(st, have >= m.qty ? 2 : have + bag >= m.qty ? 1 : 0); } return st; };
    if (S.hammer < MAX_LEVEL) {
      const c = hammerCost(S.hammer + 1), st = okOf(c);
      let mats = '';
      for (const m of c.mats) {
        const have = S.stock[m.id] || 0, bag = S.bag[m.id] || 0, ms = have >= m.qty ? 2 : have + bag >= m.qty ? 1 : 0;
        mats += `<span class="m s${ms}"><i style="background:${RES[m.id].c2}"></i>${RES[m.id].name.split(' (')[0]} ${fmt(Math.min(have, m.qty))}/${fmt(m.qty)}${bag && ms < 2 ? ` <em>+${fmt(bag)}🎒</em>` : ''}</span>`;
      }
      html += `<div class="ih">Próximo martelo <kbd>I</kbd></div><div class="up s${st}"><b>${['✖', '●', '✔'][st]}</b><div><div class="un">⚒ ${HAMMERS[S.hammer + 1].n} <small>nv ${S.hammer + 1}</small></div>${mats}<span class="m ${S.money >= c.money ? 's2' : 's0'}"><i class="coin"></i>${fmt(c.money)}</span></div></div>`;
      if (st === 1) html += `<div class="leg"><span class="s1">● Falta só entregar: volte à cidade</span></div>`;
    }
    let ready = 0;
    for (const k in ATTRS) if (S.attrs[k] < MAX_LEVEL && okOf(attrCost(k, S.attrs[k] + 1)) === 2) ready++;
    ready += Game.gadgetUps().filter(g => okOf(g.c) === 2).length;
    if (ready) html += `<div class="leg"><span class="s2">✔ ${ready} melhoria${ready > 1 ? 's' : ''} pronta${ready > 1 ? 's' : ''} para comprar</span></div>`;
    if (html !== this.invHtml) { el.innerHTML = html; this.invHtml = html; }
  },
  // ---------- recibo do Seu Lauro (o que foi guardado e o que foi vendido) ----------
  receiptHtml(r, full) {
    let h = `<table><tr><th>Material</th><th>Trouxe</th><th>🏠 Guardou</th><th>Vendeu</th></tr>`;
    for (const l of r.lines) {
      h += `<tr><td><i style="background:${RES[l.id].c2}"></i>${RES[l.id].name.split(' (')[0]}</td><td>${fmt(l.q)}</td><td class="${l.k ? 'k' : ''}">${l.k ? fmt(l.k) : '—'}</td><td class="${l.sq ? 'v' : ''}">${l.sq ? fmt(l.sq) + ' <small>= ' + fmt(l.money) + '</small>' : '—'}</td></tr>`;
    }
    const took = r.took ? Object.keys(r.took) : [];
    h += `</table>${took.length ? `<div class="tot"><span>📜 Missão: ${took.map(id => fmt(r.took[id]) + ' ' + RES[id].name).join(', ')}</span></div>` : ''}<div class="tot"><span>🏠 ${fmt(r.kept)} guardados</span><span><i class="coin"></i>+${fmt(r.earned)} moedas</span></div>`;
    return h;
  },
  showReceipt(r) {
    const el = $('receipt');
    el.innerHTML = `<div class="rh">Entrega no Armazém</div>${this.receiptHtml(r)}`;
    el.classList.add('on');
    clearTimeout(this.rcT); this.rcT = setTimeout(() => el.classList.remove('on'), 9000 + r.lines.length * 1200);
  },
  updateDetectorHud() {
    const el = $('det'), d = Game.det;
    el.style.display = 'none'; return; // a bússola virou a seta do detector
    if (!d) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    if (d.done) { el.innerHTML = `<div class="dial off"><i></i></div><div><b>AUTO · tudo pronto</b><span>Nada faltando para as próximas evoluções</span></div>`; return; }
    const R = RES[d.res], tag = d.auto ? `<em class="auto">AUTO</em>` : `<em class="man">MANUAL</em>`;
    const falta = d.auto && d.falta ? ` · faltam ${fmt(d.falta)}` : '';
    if (d.none) { el.innerHTML = `<div class="dial off"><i></i></div><div><b>${tag}${R.name.split(' (')[0]}</b><span>Sem sinal${falta}${d.auto ? ' · fora do alcance' : ' · <kbd>T</kbd> troca'}</span></div>`; return; }
    const P = Game.P, fx = -Math.sin(P.yaw), fy = -Math.cos(P.yaw), rx = Math.cos(P.yaw), ry = -Math.sin(P.yaw);
    const dx = Math.cos(d.bearing), dy = Math.sin(d.bearing);
    const ang = Math.atan2(dx * rx + dy * ry, dx * fx + dy * fy) * 180 / Math.PI;
    const bars = Math.max(1, Math.ceil(d.strength * 5));
    const dist = d.dist < 15 ? 'aqui perto!' : d.lv === 1 ? (d.dist < 40 ? 'perto' : 'um pouco longe') : '~' + fmt(Math.round(d.dist / (d.lv === 2 ? 25 : 50)) * (d.lv === 2 ? 25 : 50)) + ' m';
    const more = d.auto && d.count > 1 ? ` · +${d.count - 1} na lista` : '';
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
    $('cint').textContent = '✦ ' + fmt(S.cint || 0) + ' Cintilha' + ((S.cint || 0) === 1 ? '' : 's');
    $('hname').textContent = HAMMERS[S.hammer].n;
    $('hlv').textContent = 'Martelo nv ' + S.hammer + ' · força ' + fmt(G.force()) + (G.mult('force') > 1 ? ' ⚡' : '');
    const used = G.used(), cap = G.capacity();
    const st = $('stam'); st.style.width = (G.P.stamina * 100) + '%'; st.className = G.P.tired ? 'tired' : G.P.sprint ? 'run' : '';
    $('fuelwrap').style.display = (S.gear.climb || 0) >= 5 && (G.fuel !== undefined && G.fuel < 0.999 || G.jetting) ? 'block' : 'none'; if (G.fuel !== undefined) $('fuel').style.width = G.fuel * 100 + '%';
    $('stamwrap').style.opacity = G.P.stamina < 0.999 || G.P.sprint ? 1 : 0.35;
    $('bagtxt').textContent = `Mochila ${fmt(used)} / ${fmt(cap)}`;
    $('bagfill').style.width = Math.min(100, used / cap * 100) + '%';
    $('bagfill').className = used >= cap ? 'full' : used / cap > 0.8 ? 'warn' : '';
    // local
    const sub = World.subAt(G.P.x, G.P.y);
    let loc;
    if (G.inCity) loc = '<b>Vale Ferrado</b>';
    else if (sub) loc = `<b>${sub.R.name}</b> · <i>martelo ${sub.level}</i>`;
    else loc = `<b>Campos de Vale Ferrado</b> · ${Math.round(Math.hypot(G.P.x, G.P.y))} m`;
    if (World.veio) loc += `<br><span class="veio">⛏ Veio de ${RES[World.veio.res].name} aflorado: ${Math.ceil(World.veio.t)} s</span>`;
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
    $('npchint').textContent = npc && !this.open ? `[E] Falar com ${npc.name}` : '';
    $('npchint').style.display = npc && !this.open ? 'block' : 'none';
    // atualiza só as lojas dos NPCs (as outras janelas não são lojas)
    if (['ferreiro', 'tropeira', 'botica', 'armazem'].includes(this.open) && Math.random() < 0.05) this.renderPanel();
    // relógio
    const c = S.clock, hh = Math.floor(c * 24), mm = Math.floor((c * 24 - hh) * 60);
    $('clock').textContent = `${G.isNight() ? '🌙' : '☀️'} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    // equipamentos ativos
    const eq = [];
    if (S.gear.ride) eq.push(`<span class="${S.riding ? 'on' : ''}"><kbd>R</kbd>${GADGETS.ride.levels[S.gear.ride].n}</span>`);
    if (S.gear.light) eq.push(`<span class="${S.lightOn ? 'on' : ''}"><kbd>L</kbd>${GADGETS.light.levels[S.gear.light].n}</span>`);
    if (S.gear.detector) eq.push(`<span class="${S.detOn ? 'on' : ''}"><kbd>G</kbd>${GADGETS.detector.levels[S.gear.detector].n}</span>`);
    $('equip').innerHTML = eq.join('');
    this.updateDetectorHud();
    this.updateInvHud();
    Missions.hud();
    { const rb = $('recall'), ok = S.hammer >= RECALL_LVL && !G.inCity && !G.travel && !this.open;
      rb.style.display = ok ? 'inline-flex' : 'none';
      if (ok) { const c = G.recallCost(); $('recallc').innerHTML = `<i class="coin"></i>${fmt(c)}`; rb.classList.toggle('off', S.money < c); }
      $('travelbar').style.display = G.travel ? 'block' : 'none';
      if (G.travel) $('travelp').style.width = Math.min(100, G.travel.t / G.travel.dur * 100) + '%'; }
    { const sm = $('sellmode'); sm.style.display = G.inCity || Object.keys(S.bag).length ? '' : 'none'; sm.innerHTML = `${{ sobra: '🏠', guardar: '📦', vender: '💰' }[G.sellMode()]} Na vila: ${SELL_MODES[G.sellMode()]} <kbd>N</kbd>`;
      const cb = $('citybar'), sv = G.inCity && !this.open ? Object.keys(S.stock).reduce((a, k) => a + (S.stock[k] || 0) * RES[k].value, 0) : 0;
      if (G.unloadT !== undefined && !this.open) { cb.style.display = 'block'; cb.innerHTML = `Entregando a mochila…`; }
      else if (sv) { cb.style.display = 'block'; cb.innerHTML = `<button onclick="Game.sellAllStock()">💰 Vender o depósito · ${fmt(sv)} <kbd>U</kbd></button>`; }
      else cb.style.display = 'none'; }
    $('climb').style.display = Game.P.climbing && Game.P.moving && !this.open ? 'block' : 'none';
  },
};
