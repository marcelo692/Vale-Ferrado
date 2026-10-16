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
    return `<ul class="cost"><li class="${okM ? 'ok' : 'no'}">🪙 Moedas: <b>${fmt(c.money)}</b></li>${c.mats.map(m => this.matLine(m)).join('')}</ul>`;
  },

  openNpc(id) {
    this.open = id;
    $('panel').classList.remove('hidden');
    this.renderPanel();
  },
  close() { this.open = null; $('panel').classList.add('hidden'); },

  renderPanel() {
    const S = Game.S, id = this.open;
    if (!id) return;
    const npc = NPCS.find(n => n.id === id);
    let h = `<div class="win"><div class="ph" style="--npc:${npc ? npc.color : '#888'}"><div class="avatar"></div><div><h2>${npc ? npc.name : ''}</h2><p>${npc ? npc.role : ''}</p></div><button class="x" onclick="UI.close()">✕</button></div><div class="pb">`;

    if (id === 'ferreiro') {
      const L = S.hammer;
      h += `<div class="cur"><span class="lv">Nível ${L}</span><h3>${HAMMERS[L].n}</h3><p>Força ${fmt(HAMMERS[L].f)}</p></div>`;
      if (L < MAX_LEVEL) {
        const c = hammerCost(L + 1);
        h += `<div class="card big"><span class="lv">Próximo · nível ${L + 1}</span><h3>${HAMMERS[L + 1].n}</h3><p>Força ${fmt(HAMMERS[L].f)} → <b>${fmt(HAMMERS[L + 1].f)}</b></p>${this.costHtml(c)}
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
        h += `<div class="card"><span class="lv">${ATTRS[k].part} · nível ${L}</span><h3>${ATTRS[k].name}</h3>`;
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
        h += `<div class="card"><span class="lv" style="color:${P.color}">Tecla ${P.key} · na mochila: ${owned}</span><h3>${P.name} ${ROMAN[tier]}</h3>
          <p>+${Math.round(powerBonus(pid, tier) * 100)}% ${P.desc} por ${P.dur / 60} min</p><p>Ocupa <b>${P.slots} espaços</b> na mochila</p>
          <ul class="cost"><li class="${S.money >= price ? 'ok' : 'no'}">🪙 Moedas: <b>${fmt(price)}</b></li></ul>
          <button class="buy" ${ok ? '' : 'disabled'} onclick="Game.buyPower('${pid}');UI.renderPanel()">Comprar</button></div>`;
      }
      h += `</div><p class="hint">Ative com as teclas 1, 2 e 3. Dá para ativar vários ao mesmo tempo: os efeitos se multiplicam. Ao ativar, o espaço volta a ficar livre.</p>`;
    }

    if (id === 'armazem') {
      const ids = Object.keys(S.stock).filter(k => S.stock[k] > 0);
      h += `<p>Tudo o que você traz na mochila é vendido automaticamente quando entra na cidade. O que for necessário para a próxima evolução fica guardado aqui.</p>`;
      h += `<p class="free">Total ganho até hoje: <b>${fmt(S.earned)}</b> moedas</p>`;
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
    this.open = 'story';
    $('panel').classList.remove('hidden');
    $('panel').innerHTML = `<div class="story"><span class="lv">${L === 1 ? 'Prólogo' : 'Marco · nível ' + L}</span><h2>${st.t}</h2><p>${st.s}</p><button class="buy" onclick="UI.close()">Continuar</button></div>`;
  },

  help() {
    this.open = 'help';
    $('panel').classList.remove('hidden');
    $('panel').innerHTML = `<div class="story"><h2>Como jogar</h2>
      <ul class="help">
        <li><b>W A S D</b> ou setas: andar</li>
        <li><b>Espaço</b>: pular (pule por cima de troncos, muros e penhascos para cortar caminho)</li>
        <li><b>Segurar o mouse</b> ou <b>E</b> perto de uma pedra: minerar</li>
        <li><b>E</b> perto de um NPC ou clique nele: abrir a loja</li>
        <li><b>1, 2, 3</b>: ativar power-ups da mochila</li>
      </ul>
      <p>Saia da cidade, encha a mochila e volte. Seu Lauro compra tudo sozinho. Use o dinheiro no Ferreiro (martelo), na Tropeira (atributos) e na Botica (power-ups).</p>
      <p>Qualquer martelo quebra qualquer pedra, mas a barra em cima da pedra mostra quanto tempo vai levar: <b style="color:#7fd36a">verde</b> vale a pena, <b style="color:#ffd34d">amarelo</b> é lento, <b style="color:#ff6a5a">vermelho</b> não compensa.</p>
      <p>O jogo salva sozinho no seu computador.</p>
      <div class="row"><button class="buy" onclick="UI.close()">Voltar ao jogo</button><button class="buy alt" onclick="if(confirm('Apagar todo o progresso e recomeçar?'))Game.reset()">Recomeçar do zero</button></div></div>`;
  },

  updateHud(dt) {
    this.hudT -= dt; if (this.hudT > 0) return; this.hudT = 0.1;
    const S = Game.S, G = Game;
    $('money').textContent = fmt(S.money);
    $('hname').textContent = HAMMERS[S.hammer].n;
    $('hlv').textContent = 'Martelo nível ' + S.hammer + ' / 60';
    $('hforce').textContent = 'Força ' + fmt(G.force()) + (G.mult('force') > 1 ? ' ⚡' : '');
    const used = G.used(), cap = G.capacity();
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
    if (this.open && this.open !== 'story' && this.open !== 'help' && Math.random() < 0.05) this.renderPanel();
  },
};
