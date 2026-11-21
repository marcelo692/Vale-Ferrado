// =============================================================
// Vale Ferrado — MODO DEV (só na versão do PC; a versão da CrazyGames não leva este arquivo)
// Esc → 🛠 Modo dev. Voo livre sem colisão (P liga/desliga, Espaço sobe, C desce, Shift turbo,
// rodinha do mouse muda a velocidade) e um painel para trocar martelo, dinheiro, itens etc.
// =============================================================
'use strict';

const Dev = {
  on: false, fly: false, speed: 60, oneHit: false, noCost: false,
  load() { try { const d = JSON.parse(localStorage.getItem('vf_dev') || '{}'); this.on = !!d.on; this.speed = d.speed || 60; this.oneHit = !!d.oneHit; } catch (e) {} },
  store() { try { localStorage.setItem('vf_dev', JSON.stringify({ on: this.on, speed: this.speed, oneHit: this.oneHit })); } catch (e) {} },
  init() {
    this.load();
    addEventListener('keydown', e => {
      if (!this.on || UI.open || !Game.locked()) return;
      if (e.code === 'KeyP') this.toggleFly();
    });
    addEventListener('wheel', e => {
      if (!this.fly || UI.open) return;
      this.speed = Math.max(5, Math.min(3000, Math.round(this.speed * (e.deltaY < 0 ? 1.25 : 0.8)))); this.store(); this.badge();
    }, { passive: true });
    this.badge();
  },
  toggleFly(v) {
    this.fly = v === undefined ? !this.fly : v;
    const P = Game.P; P.vz = 0; P.vx = P.vy = 0; Game.hook = null; Game.ladder = null; Game.travel = null;
    if (!this.fly) { /* cai até o chão normalmente */ }
    UI.toast(this.fly ? tt("🛠 Voo livre LIGADO · Espaço sobe · C desce · Shift turbo · rodinha muda a velocidade · P desliga") : tt("🛠 Voo livre desligado"));
    this.badge();
  },
  // voo livre: sem colisão, sem limite, para onde a câmera olha
  updateFly(dt) {
    const P = Game.P, K = Game.keys;
    let fw = 0, st = 0, up = 0;
    if (K['w'] || K['arrowup']) fw += 1; if (K['s'] || K['arrowdown']) fw -= 1;
    if (K['d'] || K['arrowright']) st += 1; if (K['a'] || K['arrowleft']) st -= 1;
    if (K[' ']) up += 1; if (K['c']) up -= 1;
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw), cp = Math.cos(P.pitch), spi = Math.sin(P.pitch);
    // frente acompanha a inclinação da câmera (olhar para cima e andar = subir)
    let vx = -sy * cp * fw + cy * st, vy = -cy * cp * fw - sy * st, vz = spi * fw + up;
    const len = Math.hypot(vx, vy, vz);
    const sp = this.speed * (K['shift'] ? 5 : 1);
    if (len) { vx /= len; vy /= len; vz /= len; }
    const g0 = World.height(P.x, P.y);
    P.x += vx * sp * dt; P.y += vy * sp * dt;
    const g1 = World.height(P.x, P.y);
    P.z = Math.max(0, (g0 + P.z) + vz * sp * dt - g1); // mantém a altura absoluta; nunca entra no chão
    P.vz = 0; P.vx = P.vy = 0; P.moving = len > 0; P.sprint = false; P.stamina = 1; P.tired = false;
    const R = Math.hypot(P.x, P.y); if (R > 9000) { P.x *= 9000 / R; P.y *= 9000 / R; }
  },
  badge() {
    let el = document.getElementById('devbadge');
    if (!this.on) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'devbadge'; document.body.appendChild(el); }
    el.innerHTML = `🛠 DEV${this.fly ? ` · ${tt("voando")} ${fmt(this.speed)} m/s` : ''}${this.oneHit ? ' · 1 golpe' : ''} <small>P ${tt("voar")} · Esc ${tt("menu")}</small>`;
  },

  // ---------- painel ----------
  open() {
    this.on = true; this.store(); this.badge();
    UI.freeMouse(); UI.open = 'dev'; this.render(); $('panel').classList.remove('hidden');
  },
  render() {
    const S = Game.S, b = (label, js, cls) => `<button class="buy ${cls || 'alt'}" onclick="${js};Dev.render()">${label}</button>`;
    const regs = REGIONS.map((R, i) => `<button class="buy alt" onclick="Dev.tp(${i},'ini')">${i + 1}. ${R.name} · ${tt("entrada")}</button><button class="buy alt" onclick="Dev.tp(${i},'fim')">${tt("fundo")}</button>`).join('');
    const attrRows = Object.keys(ATTRS).map(k => `<div class="dv-row"><span>${ATTRS[k].short || k}</span><b>${S.attrs[k]}</b>${b('−', `Dev.attr('${k}',-1)`)}${b('+1', `Dev.attr('${k}',1)`)}${b('+10', `Dev.attr('${k}',10)`)}${b('Máx', `Dev.attr('${k}',99)`)}</div>`).join('');
    const gadRows = Object.keys(GADGETS).map(k => { const G = GADGETS[k], lv = S.gear[k] || 0, max = G.levels.length - 1; return `<div class="dv-row"><span>${G.title}</span><b>${lv}/${max}</b>${b('−', `Dev.gad('${k}',-1)`)}${b('+', `Dev.gad('${k}',1)`)}${b('Máx', `Dev.gad('${k}',99)`)}</div>`; }).join('');
    const pw = Object.keys(POWERUPS).map(k => b(`🧪 ${POWERUPS[k].name}`, `Dev.potion('${k}')`)).join('');
    $('panel').innerHTML = `<div class="win dev"><div class="ph" style="--npc:#5a3ad0"><div class="avatar"></div><div><h2>🛠 ${tt("Modo dev")}</h2><p>${tt("Mexe direto no save. Use para testar; o progresso fica salvo assim.")}</p></div><button class="x" onclick="UI.close()">✕</button></div><div class="pb">
      <h4>✈ ${tt("Voo livre")}</h4>
      <div class="dv-row">${b(this.fly ? tt('Desligar voo (P)') : tt('Ligar voo (P)'), 'Dev.toggleFly()', this.fly ? '' : 'alt')}<span>${tt("Velocidade")}</span><input type="range" min="0" max="100" step="1" value="${Math.round(Math.log(this.speed / 5) / Math.log(600) * 100)}" oninput="Dev.speed=Math.round(5*Math.pow(600,this.value/100));Dev.store();Dev.badge();this.nextElementSibling.textContent=Dev.speed+' m/s'"><b>${this.speed} m/s</b></div>
      <p class="hint">${tt("Sem colisão e sem limite. Olhe para onde quer ir · Espaço sobe · C desce · Shift = 5× mais rápido · rodinha do mouse muda a velocidade.")}</p>
      <h4>⚒ ${tt("Martelo")}</h4>
      <div class="dv-row"><span>${HAMMERS[S.hammer].n}</span><b>${S.hammer}</b>${b('−1', 'Dev.hammer(-1)')}${b('+1', 'Dev.hammer(1)')}${b('+5', 'Dev.hammer(5)')}${b('+10', 'Dev.hammer(10)')}<input type="number" min="1" max="61" value="${S.hammer}" style="width:64px" onchange="Dev.hammer(+this.value - Game.S.hammer);Dev.render()">${b('61', 'Dev.hammer(99)')}</div>
      <div class="dv-row">${b(this.oneHit ? '✔ ' + tt('Quebra em 1 golpe') : tt('Quebra em 1 golpe'), 'Dev.oneHit=!Dev.oneHit;Dev.store();Dev.badge()', this.oneHit ? '' : 'alt')}</div>
      <h4>💰 ${tt("Dinheiro e itens")}</h4>
      <div class="dv-row"><span>${tt("Moedas")}</span><b>${fmt(S.money)}</b>${b('+1 mil', 'Dev.money(1e3)')}${b('+1 mi', 'Dev.money(1e6)')}${b('+1 bi', 'Dev.money(1e9)')}${b('×10', 'Dev.money(Game.S.money*9)')}${b(tt('Zerar'), 'Dev.money(-Game.S.money)')}</div>
      <div class="dv-row"><span>${tt("Cintilhas")}</span><b>${fmt(S.cint || 0)}</b>${b('+10', 'Dev.cint(10)')}${b('+100', 'Dev.cint(100)')}</div>
      <div class="dv-row"><span>${tt("Recursos no depósito")}</span>${b(tt('+100 de cada'), 'Dev.res(100)')}${b(tt('+10 mil de cada'), 'Dev.res(1e4)')}${b(tt('O que falta p/ próximo martelo'), 'Dev.nextHammerMats()')}${b(tt('Zerar depósito'), 'Dev.res(0)')}</div>
      <div class="dv-row">${pw}</div>
      <h4>📈 ${tt("Melhorias da Dona Cida")}</h4>${attrRows}
      <h4>🎒 ${tt("Equipamentos")}</h4>${gadRows}
      <h4>🤖 ${tt("Robôs")}</h4>
      <div class="dv-row"><span>${tt("Robôs")}</span><b>${S.robots || 0}</b>${b('+1', 'Dev.robot(1)')}${b('−1', 'Dev.robot(-1)')}${b(tt('Oficina no máximo'), 'Dev.robotMax()')}</div>
      <h4>🌍 ${tt("Ir para")}</h4>
      <div class="dv-grid">${b('🏠 ' + tt('Vila'), 'Dev.tpXY(0,6)')}${regs}${b('🔒 ' + tt('Zona 7'), 'Dev.tpXY(Z7.x,Z7.y)')}${b('⛰ ' + tt('Montanha rara mais próxima'), 'Dev.tpMtn()')}</div>
      <h4>⚙ ${tt("Mundo e sistemas")}</h4>
      <div class="dv-row">${b('☀ ' + tt('Meio-dia'), 'Game.S.clock=0.5')}${b('🌙 ' + tt('Meia-noite'), 'Game.S.clock=0')}${b(tt('Abrir todos os vendedores'), 'Dev.vendors()')}${b(tt('Baú diário de novo'), 'Dev.daily()')}${b(tt('Encomendas novas'), 'Dev.orders()')}${b(tt('Pular tutorial'), 'Dev.skipTut()')}${b(tt('Repor as pedras'), 'Dev.refill()')}</div>
      <div class="dv-row">${b(tt('Desligar modo dev'), 'Dev.disable()', 'alt')}</div>
    </div></div>`;
  },
  after() { Game.save(); this.badge(); },
  hammer(d) { const S = Game.S; S.hammer = Math.max(1, Math.min(61, S.hammer + d)); S.npcOpen = S.npcOpen || {}; for (const n of NPCS) if (S.hammer >= n.unlock) S.npcOpen[n.id] = true; /* sem fila de cenas */ if (S.hammer > 1 && !S.tut) S.tut = 'skip'; if (typeof Tutorial !== 'undefined' && Tutorial.active) Tutorial.finish(true); this.after(); },
  money(v) { const S = Game.S; S.money = Math.max(0, S.money + v); if (v > 0) S.earned += v; this.after(); },
  cint(v) { const S = Game.S; S.cint = (S.cint || 0) + v; this.after(); },
  res(n) { const S = Game.S; for (const r of RESOURCES) { if (r.sealed) continue; S.stock[r.id] = n ? (S.stock[r.id] || 0) + n : 0; if (!S.stock[r.id]) delete S.stock[r.id]; } this.after(); },
  nextHammerMats() { const S = Game.S; if (S.hammer >= 61) return; const c = hammerCost(Math.min(MAX_LEVEL, S.hammer + 1)); for (const m of c.mats) S.stock[m.id] = Math.max(S.stock[m.id] || 0, m.qty); S.money = Math.max(S.money, c.money); this.after(); },
  potion(k) { const S = Game.S; for (let i = 0; i < 3; i++) S.pw.push({ id: k, tier: Math.max(1, eraOf(S.hammer)) }); this.after(); },
  attr(k, d) { const S = Game.S; S.attrs[k] = Math.max(1, Math.min(MAX_LEVEL, S.attrs[k] + d)); this.after(); },
  gad(k, d) { const S = Game.S, max = GADGETS[k].levels.length - 1; S.gear[k] = Math.max(0, Math.min(max, (S.gear[k] || 0) + d)); this.after(); },
  robot(d) { const S = Game.S; S.robots = Math.max(0, Math.min(12, (S.robots || 0) + d)); Robots.sync(); this.after(); },
  robotMax() { const S = Game.S; S.robotUp = {}; for (const k in ROBOT_UPS) S.robotUp[k] = ROBOT_UPS[k].max; this.after(); },
  vendors() { const S = Game.S; S.npcOpen = S.npcOpen || {}; for (const n of NPCS) S.npcOpen[n.id] = true; this.after(); },
  daily() { Daily.state().last = null; this.after(); },
  orders() { Game.S.orders = null; Orders.list(); this.after(); },
  skipTut() { if (typeof Tutorial !== 'undefined' && Tutorial.active) Tutorial.finish(true); else Game.S.tut = 'skip'; this.after(); },
  refill() { for (const s of World.subs) while (s.nodes.length < (s.cap || s.spawnPts.length) && World.spawn(s)) {} this.after(); },
  tpXY(x, y) { const P = Game.P; P.x = x; P.y = y; P.z = this.fly ? 6 : 0; P.vz = 0; P.vx = P.vy = 0; Game.travel = null; UI.close(); Game.lock(); },
  tp(i, where) { const R = REGIONS[i], d = where === 'fim' ? R.dMax - 25 : R.dMin + 8; this.tpXY(R.ux * d, R.uy * d); },
  tpMtn() { const P = Game.P; let best = null, bd = 1e9; for (const m of World.mountains) { if (!m.special) continue; const d = Math.hypot(m.x - P.x, m.y - P.y); if (d < bd) { bd = d; best = m; } } if (best) this.tpXY(best.x + 3, best.y + 3); },
  disable() { this.on = false; this.fly = false; this.oneHit = false; this.store(); this.badge(); UI.close(); },
};
Dev.init();
