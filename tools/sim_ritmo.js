// Simulação do ritmo do jogo (node tools/sim_ritmo.js)
// Modelo simples de um jogador que segura o clique, vai e volta da vila com a mochila cheia,
// busca o material do próximo martelo e compra melhorias quando dá. Não usa robôs, poções nem cliques rápidos.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = { console, Math }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/data.js'), 'utf8').replace(/^const (\w+) =/mg, 'var $1 ='), ctx);
const { HAMMERS, RES, RESOURCES, REGIONS, hammerCost, attrCost, attrValue, levelRule, MAX_LEVEL, SPECIAL_AT } = ctx;

const S = { L: 1, a: { mine: 1, bag: 1, move: 1, jump: 1 }, money: 0, stock: {}, t: 0 };
const marks = {};
const regionDist = r => (REGIONS[r.region].dMin + REGIONS[r.region].dMax) / 2;
function tripFor(res) { // um passeio: ir, encher a mochila de um recurso, voltar
  const rule = levelRule(res.ideal, S.L); if (rule.blocked) return null;
  const force = HAMMERS[S.L].f / rule.mult, iv = attrValue('mine', S.a.mine), cap = attrValue('bag', S.a.bag), sp = attrValue('move', S.a.move) * 1.2;
  const perNode = Math.ceil(res.hard / force) * iv + 8 / sp, nodes = Math.ceil(cap / 2);
  const time = 2 * regionDist(res) / sp + nodes * perNode;
  return { time, units: nodes * 2 };
}
function bestMoney() {
  let best = null;
  for (const r of RESOURCES) { if (r.special) continue; const tr = tripFor(r); if (!tr) continue; const rate = tr.units * r.value / tr.time; if (!best || rate > best.rate) best = { r, tr, rate }; }
  return best;
}
const fmtT = s => `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;
let guard = 0;
while (S.L < MAX_LEVEL && guard++ < 200000) {
  const c = hammerCost(S.L + 1);
  // materiais que faltam para o próximo martelo
  const miss = c.mats.find(m => (S.stock[m.id] || 0) < m.qty);
  if (miss) {
    const r = RES[miss.id];
    if (r.special) { S.t += 180; S.stock[r.id] = (S.stock[r.id] || 0) + 5; continue; } // ida à montanha
    const tr = tripFor(r);
    if (!tr) { console.log(`travado no martelo ${S.L}: ${r.name} (nível ${r.ideal}) bloqueado`); break; }
    S.t += tr.time; const keep = Math.min(tr.units, miss.qty - (S.stock[r.id] || 0));
    S.stock[r.id] = (S.stock[r.id] || 0) + keep; S.money += (tr.units - keep) * r.value; continue;
  }
  if (S.money >= c.money) {
    S.money -= c.money; c.mats.forEach(m => S.stock[m.id] -= m.qty); S.L++;
    if ([2, 3, 5, 10, 15, 20, 25, 30, 40, 50, 60].includes(S.L)) marks[S.L] = S.t;
    continue;
  }
  // melhoria barata de atributo (dinheiro só; material vem junto no mesmo passeio)
  let bought = false;
  for (const k of ['mine', 'bag', 'move']) {
    if (S.a[k] >= MAX_LEVEL || S.a[k] >= S.L + 3) continue;
    const ac = attrCost(k, S.a[k] + 1);
    if (ac.money < c.money * 0.35 && S.money >= ac.money && ac.mats.every(m => (S.stock[m.id] || 0) >= m.qty)) { S.money -= ac.money; ac.mats.forEach(m => S.stock[m.id] -= m.qty); S.a[k]++; bought = true; break; }
    if (ac.money < c.money * 0.35) for (const m of ac.mats) if ((S.stock[m.id] || 0) < m.qty && !RES[m.id].special) { const tr = tripFor(RES[m.id]); if (tr) { S.t += tr.time; S.stock[m.id] = (S.stock[m.id] || 0) + Math.min(tr.units, m.qty); S.money += Math.max(0, tr.units - m.qty) * RES[m.id].value; bought = true; } break; }
    if (bought) break;
  }
  if (bought) continue;
  const b = bestMoney(); S.t += b.tr.time; S.money += b.tr.units * b.r.value;
}
console.log('Tempo estimado (segurando o clique, sem robôs/poções) até cada martelo:');
for (const L in marks) console.log(`  Martelo ${String(L).padStart(2)}: ${fmtT(marks[L])}`);
console.log('Atributos no fim:', JSON.stringify(S.a));
