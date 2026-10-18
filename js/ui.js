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
    if (el.style.display !== want && want === 'flex') { const v = Math.round((Game.S.sens || 1) * 100), sl = $('sens'); if (sl) { sl.value = v; sl.nextElementSibling.textContent = v + '%'; } }
    el.style.display = want;
  },
  resume() { Snd.start(); Game.lock(); },
  pics(kind, a) {
    try {
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
        h += `<div class="card big">${this.pics('hammer', L + 1)}<span class="lv">Próximo · nível ${L + 1}</span><h3>${HAMMERS[L + 1].n}</h3><p>Força ${fmt(HAMMERS[L].f)} → <b>${fmt(HAMMERS[L + 1].f)}</b></p>${this.costHtml(c)}${SPECIAL_AT[L + 1] ? `<p class="rare">⛰ ${RES[SPECIAL_AT[L + 1]].name} só existe perto do topo das montanhas da região ${REGIONS[RES[SPECIAL_AT[L + 1]].region].name}</p>` : ''}
          <button class="buy" ${Game.canPay(c) ? '' : 'disabled'} onclick="Game.buyHammer();UI.renderPanel()">Forjar</button></div>`;
        h += `<h4>Pela frente</h4><ol class="road" start="${L + 2}">`;
        for (let i = L + 2; i <= Math.min(MAX_LEVEL, L + 6); i++) h += `<li>${HAMMERS[i].n} <i>força ${fmt(HAMMERS[i].f)}</i></li>`;
        h += `</ol>`;
      } else h += `<p class="done">Você tem o Martelo do Vale. Não existe nada mais forte.</p>`;
      h += `<p class="hint">Materiais vêm do depósito. Quando você entra na cidade, o que é preciso para a próxima forja fica guardado automaticamente.</p>`;
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
      h += `</div><p class="hint">Cada melhoria muda seu visual: luvas, mochila, calçados e pernas.</p>`;
    }

    if (id === 'botica') {
      const tier = eraOf(S.hammer);
      h += `<p class="free">Espaço livre na mochila: <b>${fmt(Game.free())}</b> de ${fmt(Game.capacity())}</p><div class="grid">`;
      for (const pid in POWERUPS) {
        const P = POWERUPS[pid], price = powerPrice(pid, S.hammer);
        const owned = S.pw.filter(p => p.id === pid).length;
        const ok = S.money >= price && Game.free() >= P.slots;
        h += `<div class="card">${this.pics('pw', pid)}<span class="lv" style="color:${P.color}">Tecla ${P.key} · na mochila: ${owned}</span><h3>${P.name} ${ROMAN[tier]}</h3>
          <p>+${Math.round(powerBonus(pid, tier) * 100)}% ${P.desc} por ${P.dur / 60} min</p><p>Ocupa <b>${P.slots} espaços</b> na mochila</p>
          <ul class="cost"><li class="${S.money >= price ? 'ok' : 'no'}"><i class="coin"></i>Moedas: <b>${fmt(price)}</b></li></ul>
          <button class="buy" ${ok ? '' : 'disabled'} onclick="Game.buyPower('${pid}');UI.renderPanel()">Comprar</button></div>`;
      }
      h += `</div><p class="hint">Ative com as teclas 1, 2 e 3. Dá para ativar vários ao mesmo tempo: os efeitos se multiplicam. Ao ativar, o espaço volta a ficar livre.</p>`;
    }

    if (id === 'bazar') {
      h += `<p class="free">Seu dinheiro: <b><i class="coin"></i>${fmt(S.money)}</b></p>`;
      for (const type in GADGETS) {
        const T = GADGETS[type], have = S.gear[type];
        h += `<h4>${T.title} <span class="kbd">${T.key}</span></h4><p class="hint" style="margin:0 0 8px">${T.desc}</p><div class="grid">`;
        for (let lv = 1; lv < T.levels.length; lv++) {
          const G = T.levels[lv], owned = have >= lv, ok = !owned && Game.canPay({ money: G.price, mats: G.mats || [] });
          h += `<div class="card ${have === lv ? 'eq' : ''}">${this.pics(type, lv)}<span class="lv">Nível ${lv}</span><h3>${G.n}</h3><p>${G.info}</p>
            ${owned ? `<ul class="cost"><li class="ok"><i class="coin"></i>Moedas: <b>${fmt(G.price)}</b></li></ul>` : this.costHtml({ money: G.price, mats: G.mats || [] })}${G.mats ? '<p class="rare">⛰ Precisa de recurso raro das montanhas</p>' : ''}
            ${have === lv ? '<button class="buy" disabled>Equipado</button>' : owned ? '<button class="buy" disabled>Você já tem melhor</button>' : `<button class="buy" ${ok ? '' : 'disabled'} onclick="Game.buyGadget('${type}',${lv});UI.renderPanel()">Comprar</button>`}</div>`;
        }
        h += `</div>`;
        if (type === 'detector' && have) {
          h += `<p class="free" style="margin-top:10px">Minério procurado: <select onchange="if(this.value==='auto'){Game.S.detAuto=true}else{Game.S.detAuto=false;Game.S.detRes=this.value}Game.detT=0;Game.save()"><option value="auto" ${S.detAuto ? 'selected' : ''}>Automático: o que falta para as evoluções</option>${RESOURCES.map(r => `<option value="${r.id}" ${!S.detAuto && r.id === (S.detRes || Game.defaultDetRes()) ? 'selected' : ''}>${r.name} (região ${REGIONS[r.region].era})</option>`).join('')}</select></p>`;
        }
      }
    }

    if (id === 'armazem') {
      const ids = Object.keys(S.stock).filter(k => S.stock[k] > 0);
      h += `<p>Tudo o que você traz na mochila é vendido automaticamente quando entra na cidade. O que for necessário para a próxima evolução fica guardado aqui.</p>`;
      h += `<p class="free">Total ganho até hoje: <b>${fmt(S.earned)}</b> moedas</p>`;
      h += `<p class="hint" style="margin-top:0">Regra: ao entrar na cidade eu guardo no depósito só o que falta para a próxima evolução do martelo e de cada atributo (no máximo 60% de cada material que você traz, para sempre entrar dinheiro). Todo o resto eu compro na hora.</p>`;
      if ((S.receipts || []).length) h += `<h4>Última entrega</h4><div class="receipt-in">${this.receiptHtml(S.receipts[0])}</div>`;
      if (ids.length) {
        h += `<h4>Depósito</h4><ul class="stock">${ids.map(k => `<li><span class="dot" style="background:${RES[k].c2}"></span>${RES[k].name}<b>${fmt(S.stock[k])}</b><i>${fmt(RES[k].value)} cada</i></li>`).join('')}</ul>
          <button class="buy alt" onclick="UI.sellStock()">Vender o excedente do depósito</button>`;
      } else h += `<p class="hint">Depósito vazio.</p>`;
    }
    h += `</div></div>`;
    $('panel').innerHTML = h;
  },

  sellStock() { // vende o que não é mais necessário
    const need = Game.needs(); let earned = 0;
    for (const k in Game.S.stock) {
      const extra = Game.S.stock[k] - (need[k] || 0);
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
  help() {
    this.freeMouse();
    this.open = 'help';
    $('panel').classList.remove('hidden');
    $('panel').innerHTML = `<div class="story"><h2>Como jogar</h2>
      <ul class="help">
        <li><b>Mouse</b>: olhar em volta</li>
        <li><b>W A S D</b>: andar</li>
        <li><b>Shift</b>: correr (gasta fôlego; se zerar, você cansa e fica mais lento)</li>
        <li><b>Montanhas</b> (triângulos no minimapa): subir é lento e o Shift não funciona na subida; perto do topo ficam os recursos raros</li>
        <li><b>Espaço</b>: pular (passe por cima de troncos, muros e penhascos para cortar caminho)</li>
        <li><b>Segurar o botão esquerdo</b> mirando uma pedra: minera na velocidade normal, sem cansar</li>
        <li><b>Clicar várias vezes</b>: golpes bem mais rápidos, mas cada clique gasta fôlego</li>
        <li><b>E</b> perto de um NPC: abrir a loja</li>
        <li><b>1, 2, 3</b>: ativar power-ups da mochila</li>
        <li><b>V</b>: alternar primeira e terceira pessoa</li>
        <li><b>R</b>: subir/descer do transporte · <b>L</b>: ligar a luz · <b>G</b>: ligar o detector · <b>T</b>: escolher o minério do detector na mão · <b>Shift+T</b>: voltar ao automático</li>
        <li><b>M</b>: ligar/desligar som (volumes no botão 🔊 Som)</li>
        <li><b>Esc</b>: soltar o mouse</li>
      </ul>
      <p>Saia da cidade, encha a mochila e volte. Seu Lauro compra tudo sozinho. Use o dinheiro no Ferreiro (martelo), na Tropeira (atributos) e na Botica (power-ups).</p>
      <p>Qualquer martelo quebra qualquer pedra, mas a informação embaixo da mira mostra quanto tempo vai levar: <b style="color:#7fd36a">verde</b> vale a pena, <b style="color:#ffd34d">amarelo</b> é lento, <b style="color:#ff6a5a">vermelho</b> não compensa.</p>
      <p>O jogo salva sozinho no seu computador.</p>
      <h4>Seu progresso</h4><p class="hint" style="margin-top:0">O jogo salva sozinho a cada 30 segundos e sempre que você sai da janela, troca de aba ou fecha o jogo: no navegador e no arquivo <b>save/progresso.json</b> dentro da pasta do jogo (Chrome/Edge, depois de liberar a pasta em <b>💾 Salvar agora</b>). ${Backup.statusText()}</p>
      <div class="row"><button class="buy alt" onclick="Backup.manual()">💾 Salvar agora</button><button class="buy alt" onclick="Backup.restoreFromFile()">📂 Carregar do arquivo da pasta</button></div>
      <div class="row"><button class="buy alt" onclick="UI.exportSave()">Salvar cópia do progresso</button><button class="buy alt" onclick="document.getElementById('impfile').click()">Carregar progresso</button><input type="file" id="impfile" accept=".json" style="display:none" onchange="UI.importSave(this.files[0])"></div>
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
    const ups = [];
    if (S.hammer < MAX_LEVEL) ups.push({ ic: '⚒', name: 'Martelo', lv: S.hammer + 1, c: hammerCost(S.hammer + 1), npc: 'Seu Bento' });
    for (const k in ATTRS) if (S.attrs[k] < MAX_LEVEL) ups.push({ ic: { mine: '✊', bag: '🎒', move: '👟', jump: '⤒' }[k], name: ATTRS[k].short, lv: S.attrs[k] + 1, c: attrCost(k, S.attrs[k] + 1), npc: 'Dona Cida' });
    for (const g of Game.gadgetUps()) ups.push({ ic: '🛒', name: g.label, lv: '', c: g.c });
    let html = `<div class="ih">Próximas evoluções <kbd>I</kbd></div>`;
    for (const u of ups) {
      const okMoney = S.money >= u.c.money;
      let st = okMoney ? 2 : 0, mats = '';
      for (const m of u.c.mats) {
        const have = S.stock[m.id] || 0, bag = S.bag[m.id] || 0;
        const ms = have >= m.qty ? 2 : have + bag >= m.qty ? 1 : 0;
        st = Math.min(st, ms);
        mats += `<span class="m s${ms}"><i style="background:${RES[m.id].c2}"></i>${RES[m.id].name.split(' (')[0]} ${fmt(Math.min(have, m.qty))}/${fmt(m.qty)}${bag && ms < 2 ? ` <em>+${fmt(bag)}🎒</em>` : ''}</span>`;
      }
      const sign = ['✖', '●', '✔'][st], cls = 's' + st;
      html += `<div class="up ${cls}"><b>${sign}</b><div><div class="un">${u.ic} ${u.name} ${u.lv ? `<small>nv ${u.lv}</small>` : ''}</div>${mats}<span class="m ${okMoney ? 's2' : 's0'}"><i class="coin"></i>${fmt(u.c.money)}</span></div></div>`;
    }
    // materiais guardados e na mochila
    const need = Game.needs();
    const ids = new Set([...Object.keys(S.stock).filter(k => S.stock[k] > 0), ...Object.keys(S.bag), ...Object.keys(need)]);
    if (ids.size) {
      html += `<div class="ih">Materiais <small>🏠 guardado · 🎒 mochila · precisa</small></div><table>`;
      [...ids].sort((a, b) => RESOURCES.indexOf(RES[a]) - RESOURCES.indexOf(RES[b])).forEach(id => {
        const have = S.stock[id] || 0, bag = S.bag[id] || 0, n = need[id] || 0;
        const ms = !n ? 3 : have >= n ? 2 : have + bag >= n ? 1 : 0;
        html += `<tr class="s${ms}"><td><i style="background:${RES[id].c2}"></i>${RES[id].name.split(' (')[0]}</td><td>${fmt(have)}</td><td>${bag ? fmt(bag) : ''}</td><td>${n ? fmt(n) + ' ' + ['✖', '●', '✔'][ms] : '—'}</td></tr>`;
      });
      html += `</table>`;
    }
    html += `<div class="leg"><span class="s2">✔ pronto</span> <span class="s1">● está na mochila, volte à cidade</span> <span class="s0">✖ falta</span></div>`;
    if (html !== this.invHtml) { el.innerHTML = html; this.invHtml = html; }
  },
  // ---------- recibo do Seu Lauro (o que foi guardado e o que foi vendido) ----------
  receiptHtml(r, full) {
    let h = `<table><tr><th>Material</th><th>Trouxe</th><th>🏠 Guardou</th><th>Vendeu</th></tr>`;
    for (const l of r.lines) {
      h += `<tr><td><i style="background:${RES[l.id].c2}"></i>${RES[l.id].name.split(' (')[0]}</td><td>${fmt(l.q)}</td><td class="${l.k ? 'k' : ''}">${l.k ? fmt(l.k) : '—'}</td><td class="${l.sq ? 'v' : ''}">${l.sq ? fmt(l.sq) + ' <small>= ' + fmt(l.money) + '</small>' : '—'}</td></tr>`;
      h += `<tr class="why"><td colspan="4">${l.k && l.for.length ? 'Para: ' + l.for.join(', ') + ' · ' : ''}${l.why}</td></tr>`;
    }
    h += `</table><div class="tot"><span>🏠 ${fmt(r.kept)} guardados</span><span><i class="coin"></i>+${fmt(r.earned)} moedas</span></div>`;
    return h;
  },
  showReceipt(r) {
    const el = $('receipt');
    el.innerHTML = `<div class="rh">Seu Lauro, do Armazém</div><p class="rule">Guardo no depósito só o que falta para a <b>próxima</b> evolução (até 60% de cada material que você traz) e vendo o resto.</p>${this.receiptHtml(r)}<p class="rule dim">Veja de novo no Armazém · some em instantes</p>`;
    el.classList.add('on');
    clearTimeout(this.rcT); this.rcT = setTimeout(() => el.classList.remove('on'), 9000 + r.lines.length * 1200);
  },
  updateDetectorHud() {
    const el = $('det'), d = Game.det;
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
    if (this.beepT <= 0 && started && !this.open) { Snd.beep(500 + d.strength * 700); this.beepT = 0.25 + (1 - d.strength) * 1.6; }
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
    $('hname').textContent = HAMMERS[S.hammer].n;
    $('hlv').textContent = 'Martelo nível ' + S.hammer + ' / 60';
    $('hforce').textContent = 'Força ' + fmt(G.force()) + (G.mult('force') > 1 ? ' ⚡' : '');
    const used = G.used(), cap = G.capacity();
    const st = $('stam'); st.style.width = (G.P.stamina * 100) + '%'; st.className = G.P.tired ? 'tired' : G.P.sprint ? 'run' : '';
    $('stamwrap').style.opacity = G.P.stamina < 0.999 || G.P.sprint ? 1 : 0.35;
    $('bagtxt').textContent = `Mochila ${fmt(used)} / ${fmt(cap)}`;
    $('bagfill').style.width = Math.min(100, used / cap * 100) + '%';
    $('bagfill').className = used >= cap ? 'full' : used / cap > 0.8 ? 'warn' : '';
    // local
    const sub = World.subAt(G.P.x, G.P.y);
    let loc;
    if (G.inCity) loc = '<b>Vale Ferrado</b> · cidade';
    else if (sub) loc = `<b>${sub.R.name}</b> · ${sub.R.dir} · trecho ${sub.k + 1} <i>(nível sugerido ${sub.level})</i>`;
    else loc = `<b>Campos de Vale Ferrado</b> · ${Math.round(Math.hypot(G.P.x, G.P.y))} m da cidade`;
    if (World.veio) loc += `<br><span class="veio">⛏ Veio de ${RES[World.veio.res].name} aflorado: ${Math.ceil(World.veio.t)} s</span>`;
    $('loc').innerHTML = loc;
    // atributos
    $('attrs').innerHTML = Object.keys(ATTRS).map(k => `<div><span>${ATTRS[k].short}</span><b>${S.attrs[k]}</b><i>${k === 'bag' ? '' : attrLabel(k, S.attrs[k])}</i></div>`).join('');
    // power-ups
    let pw = '';
    for (const id in POWERUPS) {
      const n = S.pw.filter(p => p.id === id).length;
      const act = S.active.find(a => a.id === id);
      pw += `<div class="pw ${n ? '' : 'empty'} ${act ? 'on' : ''}" style="--c:${POWERUPS[id].color}"><kbd>${POWERUPS[id].key}</kbd><span>${POWERUPS[id].name}</span><b>${n}</b>${act ? `<em>${Math.ceil(act.left)}s</em>` : ''}</div>`;
    }
    $('pws').innerHTML = pw;
    // conteúdo da mochila
    const items = Object.keys(S.bag).map(k => `<span><i style="background:${RES[k].c2}"></i>${S.bag[k]}</span>`).join('');
    $('bagitems').innerHTML = items;
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
    $('climb').style.display = Game.P.climbing && Game.P.moving && !this.open ? 'block' : 'none';
  },
};
