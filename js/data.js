// =============================================================
// Vale Ferrado — dados do jogo (tabelas do documento de design)
// =============================================================
'use strict';

const GAME_VERSION = '3.7.0';
const PX = 8; // pixels por metro

// ---------- Regiões (uma por era) ----------
const REGIONS = [
  { id: 0, era: 1, name: tt("Bosque do Avô"),          dir: tt("Norte"),    ang: -90,  dMin: 30,   dMax: 150,  jMin: 0.5, jMax: 1,   ground: ['#4f6b2f', '#5d7a36', '#46602a'], obstacle: 'tronco' },
  { id: 1, era: 2, name: tt("Riacho das Pedras"),      dir: tt("Leste"),    ang: 0,    dMin: 150,  dMax: 400,  jMin: 1,   jMax: 2,   ground: ['#6f7a5e', '#7d8668', '#5f6b52'], obstacle: 'pedra' },
  { id: 2, era: 3, name: tt("Vila em Ruínas"),         dir: tt("Sul"),      ang: 90,   dMin: 400,  dMax: 800,  jMin: 2,   jMax: 3.5, ground: ['#8a7356', '#97805f', '#7a654b'], obstacle: 'muro' },
  { id: 3, era: 4, name: 'Mina Velha',             dir: tt("Oeste"),    ang: 180,  dMin: 800,  dMax: 1500, jMin: 3.5, jMax: 5,   ground: ['#5a4636', '#4d3b2d', '#66503e'], obstacle: 'trilho' },
  { id: 4, era: 5, name: tt("Pedreira Funda"),         dir: tt("Noroeste"), ang: -135, dMin: 1500, dMax: 2500, jMin: 5,   jMax: 8,   ground: ['#8d8b86', '#9a9893', '#7e7c77'], obstacle: 'bancada' },
  { id: 5, era: 6, name: tt("Serra dos Cristais"),     dir: tt("Nordeste"), ang: -45,  dMin: 2500, dMax: 4000, jMin: 8,   jMax: 12,  ground: ['#4a4560', '#56506e', '#3f3b52'], obstacle: 'penhasco' },
];

// ---------- Recursos ----------
// kind: visual (nut, stick, log, clay, rock, ore, crystal, scrap, meteor)
const RESOURCES = [
  { id: 'noz',         name: tt("Noz e castanha"),          region: 0, ideal: 1,  hard: 10,       kind: 'nut',     c: '#8a5a2b', c2: '#3f6e2a' },
  { id: 'graveto',     name: tt("Graveto"),                 region: 0, ideal: 2,  hard: 13,       kind: 'stick',   c: '#7a5a3a', c2: '#5b4128' },
  { id: 'lenha',       name: tt("Lenha"),                   region: 0, ideal: 4,  hard: 20,       kind: 'log',     c: '#6b4a2e', c2: '#c9a57a' },
  { id: 'argila',      name: tt("Argila"),                  region: 0, ideal: 6,  hard: 33,       kind: 'clay',    c: '#a5603d', c2: '#c27a52' },
  { id: 'cascalho',    name: tt("Cascalho"),                region: 0, ideal: 8,  hard: 52,       kind: 'rock',    c: '#8b8578', c2: '#a8a294' },
  { id: 'pedrasabao',  name: tt("Pedra-sabão"),             region: 0, ideal: 10, hard: 82,       kind: 'rock',    c: '#4e7464', c2: '#6f9a86' },
  { id: 'seixo',       name: tt("Seixo de rio"),            region: 1, ideal: 11, hard: 104,      kind: 'rock',    c: '#9aa0a2', c2: '#c3c8c9' },
  { id: 'arenito',     name: tt("Arenito"),                 region: 1, ideal: 13, hard: 166,      kind: 'rock',    c: '#c49a6c', c2: '#dcb98d' },
  { id: 'silex',       name: tt("Sílex"),                   region: 1, ideal: 15, hard: 265,      kind: 'rock',    c: '#4b4743', c2: '#7d7570' },
  { id: 'basalto',     name: tt("Basalto"),                 region: 1, ideal: 17, hard: 423,      kind: 'rock',    c: '#35383b', c2: '#575b5f' },
  { id: 'granito',     name: tt("Granito"),                 region: 1, ideal: 19, hard: 676,      kind: 'rock',    c: '#a87870', c2: '#d8a8a0' },
  { id: 'sucata',      name: tt("Sucata e pregos velhos"),  region: 2, ideal: 21, hard: 1080,     kind: 'scrap',   c: '#7d5b45', c2: '#a37350' },
  { id: 'malaquita',   name: 'Malaquita (cobre)',       region: 2, ideal: 23, hard: 1730,     kind: 'ore',     c: '#3f8a63', c2: '#6fc496' },
  { id: 'cassiterita', name: tt("Cassiterita (estanho)"),   region: 2, ideal: 25, hard: 2770,     kind: 'ore',     c: '#4d3d33', c2: '#9a8b7e' },
  { id: 'esfalerita',  name: tt("Esfalerita (zinco)"),      region: 2, ideal: 27, hard: 4420,     kind: 'ore',     c: '#7a5a22', c2: '#c9a046' },
  { id: 'calcario',    name: tt("Calcário"),                region: 2, ideal: 29, hard: 7060,     kind: 'rock',    c: '#cfc6b0', c2: '#ebe4d2' },
  { id: 'carvao',      name: tt("Carvão"),                  region: 3, ideal: 31, hard: 11300,    kind: 'ore',     c: '#1f1f22', c2: '#4a4a52' },
  { id: 'hematita',    name: tt("Hematita (ferro)"),        region: 3, ideal: 33, hard: 18000,    kind: 'ore',     c: '#6e2c22', c2: '#b0524a' },
  { id: 'magnetita',   name: tt("Magnetita"),               region: 3, ideal: 35, hard: 29000,    kind: 'ore',     c: '#2b2d33', c2: '#6c7180' },
  { id: 'cromita',     name: tt("Cromita (cromo)"),         region: 3, ideal: 37, hard: 46000,    kind: 'ore',     c: '#3a3530', c2: '#9aa3a8' },
  { id: 'vanadinita',  name: tt("Vanadinita (vanádio)"),    region: 3, ideal: 39, hard: 74000,    kind: 'ore',     c: '#7a3a1e', c2: '#e2683a' },
  { id: 'marmore',     name: tt("Mármore"),                 region: 4, ideal: 41, hard: 118000,   kind: 'rock',    c: '#e6e3dc', c2: '#ffffff' },
  { id: 'prata',       name: tt("Prata"),                   region: 4, ideal: 43, hard: 189000,   kind: 'ore',     c: '#6f747a', c2: '#e3e8ee' },
  { id: 'ouro',        name: tt("Ouro"),                    region: 4, ideal: 45, hard: 303000,   kind: 'ore',     c: '#6d5a2a', c2: '#ffd34d' },
  { id: 'rutilo',      name: tt("Rutilo (titânio)"),        region: 4, ideal: 47, hard: 484000,   kind: 'ore',     c: '#4a2c22', c2: '#c4724a' },
  { id: 'volframita',  name: tt("Volframita (tungstênio)"), region: 4, ideal: 49, hard: 773000,   kind: 'ore',     c: '#222327', c2: '#8d96a6' },
  { id: 'quartzo',     name: tt("Quartzo"),                 region: 5, ideal: 51, hard: 1200000,  kind: 'crystal', c: '#d9dde6', c2: '#ffffff' },
  { id: 'ametista',    name: tt("Ametista (geodo)"),        region: 5, ideal: 52, hard: 1600000,  kind: 'crystal', c: '#6a3fa0', c2: '#c49cf0' },
  { id: 'esmeralda',   name: tt("Esmeralda"),               region: 5, ideal: 53, hard: 2000000,  kind: 'crystal', c: '#127a4a', c2: '#57e0a0' },
  { id: 'rubi',        name: tt("Rubi"),                    region: 5, ideal: 54, hard: 2500000,  kind: 'crystal', c: '#8f1028', c2: '#ff4f6e' },
  { id: 'safira',      name: tt("Safira"),                  region: 5, ideal: 55, hard: 3200000,  kind: 'crystal', c: '#123a8f', c2: '#4f8cff' },
  { id: 'diamante',    name: tt("Diamante"),                region: 5, ideal: 57, hard: 5000000,  kind: 'crystal', c: '#9fd8e8', c2: '#ffffff' },
  { id: 'meteoro',     name: tt("Ferro meteórico"),         region: 5, ideal: 59, hard: 8000000,  kind: 'meteor',  c: '#3a3436', c2: '#ff8a3d' },
  { id: 'nucleo',      name: tt("Núcleo estelar"),          region: 5, ideal: 60, hard: 10000000, kind: 'meteor',  c: '#2a1e3a', c2: '#7af0ff' },
];
// recursos raros: só existem perto do topo das montanhas
const SPECIALS = [
  { id: 'pedravento',   name: tt("Pedra-do-Vento"),       region: 1, ideal: 19, hard: 900,      kind: 'special', c: '#6ac8e0', c2: '#d8f6ff', special: true },
  { id: 'ambar',        name: tt("Âmbar Antigo"),         region: 2, ideal: 29, hard: 9000,     kind: 'special', c: '#d07a10', c2: '#ffc04a', special: true },
  { id: 'ferroceleste', name: tt("Ferro Celeste"),        region: 3, ideal: 39, hard: 95000,    kind: 'special', c: '#3a5ad0', c2: '#9ab8ff', special: true },
  { id: 'obsidiana',    name: tt("Obsidiana Real"),       region: 4, ideal: 49, hard: 1000000,  kind: 'special', c: '#18101e', c2: '#b04aff', special: true },
  { id: 'coracao',      name: tt("Coração da Montanha"),  region: 5, ideal: 59, hard: 10000000, kind: 'special', c: '#c01830', c2: '#ffd34d', special: true },
];
RESOURCES.push(...SPECIALS);
const RES = {};
// escada de tamanho dos minérios: pequeno 1x, médio 2x, grande e especial 3x de altura (largura cresce metade)
function oreMul(n) { const M = (n.res.wild || n.res.sealed) ? 1 : (n.res.special || n.size >= 2) ? 3 : n.size >= 1 ? 2 : 1; return { M, W: 1 + (M - 1) * 0.5 }; }
RESOURCES.forEach(r => { r.value = Math.max(1, Math.round(r.special ? r.hard * 2 : r.hard / 2)); RES[r.id] = r; });
// martelos que exigem o recurso raro da montanha (5 unidades)
const SPECIAL_AT = { 20: 'pedravento', 30: 'ambar', 40: 'ferroceleste', 50: 'obsidiana', 60: 'coracao' };

// ---------- Os 60 martelos ----------
// mat: materiais para forjar (ids). force: força do golpe.
const HAMMERS = [
  null,
  { n: tt("Graveto seco"),                        f: 1,       mat: [] },
  { n: tt("Galho grosso"),                        f: 1.3,     mat: ['noz'] },
  { n: tt("Galho de goiabeira"),                  f: 1.6,     mat: ['graveto'] },
  { n: tt("Porrete de pinho"),                    f: 2,       mat: ['graveto'] },
  { n: tt("Porrete de eucalipto"),                f: 2.6,     mat: ['lenha'] },
  { n: tt("Clava de aroeira"),                    f: 3.2,     mat: ['lenha'] },
  { n: tt("Clava de ipê"),                        f: 4.1,     mat: ['argila'] },
  { n: tt("Maço de madeira"),                     f: 5.2,     mat: ['argila'] },
  { n: tt("Maço amarrado com cipó"),              f: 6.5,     mat: ['cascalho'] },
  { n: tt("Maço de ipê curado"),                  f: 8.2,     mat: ['cascalho'] },
  { n: tt("Pedra de rio amarrada"),               f: 10,      mat: ['pedrasabao'] },
  { n: tt("Pedra amarrada com couro"),            f: 13,      mat: ['seixo'] },
  { n: tt("Arenito lascado"),                     f: 17,      mat: ['seixo'] },
  { n: tt("Arenito com cabo encaixado"),          f: 21,      mat: ['arenito'] },
  { n: tt("Sílex lascado"),                       f: 27,      mat: ['arenito'] },
  { n: tt("Sílex com cabo de ipê"),               f: 34,      mat: ['silex'] },
  { n: tt("Basalto lascado"),                     f: 43,      mat: ['silex'] },
  { n: tt("Basalto polido"),                      f: 54,      mat: ['basalto'] },
  { n: tt("Granito polido"),                      f: 68,      mat: ['basalto'] },
  { n: tt("Maço de granito do Ancião"),           f: 86,      mat: ['granito'] },
  { n: tt("Martelo de sucata"),                   f: 108,     mat: ['granito', 'sucata'] },
  { n: tt("Cobre batido a frio"),                 f: 137,     mat: ['sucata'] },
  { n: tt("Cobre fundido"),                       f: 173,     mat: ['sucata'] },
  { n: tt("Cobre reforçado"),                     f: 219,     mat: ['malaquita'] },
  { n: tt("Bronze rústico"),                      f: 277,     mat: ['malaquita', 'cassiterita'] },
  { n: tt("Bronze fundido"),                      f: 350,     mat: ['cassiterita'] },
  { n: tt("Bronze temperado"),                    f: 442,     mat: ['cassiterita'] },
  { n: tt("Latão"),                               f: 559,     mat: ['esfalerita'] },
  { n: tt("Latão com cabo reforçado"),            f: 707,     mat: ['esfalerita'] },
  { n: tt("Martelo do Avô (restaurado)"),         f: 893,     mat: ['calcario', 'esfalerita'] },
  { n: tt("Ferro de sucata"),                     f: 1130,    mat: ['calcario', 'carvao'] },
  { n: tt("Ferro batido"),                        f: 1430,    mat: ['carvao'] },
  { n: tt("Ferro fundido"),                       f: 1800,    mat: ['hematita'] },
  { n: tt("Ferro forjado"),                       f: 2280,    mat: ['hematita'] },
  { n: tt("Martelo de unha de ferro"),            f: 2880,    mat: ['magnetita'] },
  { n: tt("Aço carbono"),                         f: 3640,    mat: ['magnetita', 'carvao'] },
  { n: tt("Aço temperado"),                       f: 4600,    mat: ['cromita'] },
  { n: tt("Marreta de aço"),                      f: 5820,    mat: ['cromita'] },
  { n: tt("Aço cromo-vanádio"),                   f: 7360,    mat: ['vanadinita'] },
  { n: tt("Marreta de demolição"),                f: 9300,    mat: ['vanadinita'] },
  { n: tt("Martelete pneumático leve"),           f: 11800,   mat: ['marmore'] },
  { n: tt("Martelete pneumático pesado"),         f: 14900,   mat: ['marmore'] },
  { n: tt("Rompedor elétrico"),                   f: 18800,   mat: ['prata'] },
  { n: tt("Rompedor a diesel"),                   f: 23800,   mat: ['prata'] },
  { n: tt("Martelo hidráulico"),                  f: 30000,   mat: ['ouro'] },
  { n: tt("Bate-estaca a vapor"),                 f: 38000,   mat: ['ouro'] },
  { n: tt("Bate-estaca hidráulico"),              f: 48000,   mat: ['rutilo'] },
  { n: tt("Martelo de titânio"),                  f: 60700,   mat: ['rutilo'] },
  { n: tt("Martelo de tungstênio"),               f: 76700,   mat: ['volframita'] },
  { n: tt("Martelo de carboneto de tungstênio"),  f: 97000,   mat: ['volframita'] },
  { n: tt("Tungstênio com núcleo de quartzo"),    f: 123000,  mat: ['quartzo'] },
  { n: tt("Martelo de ametista"),                 f: 155000,  mat: ['ametista'] },
  { n: tt("Martelo de esmeralda"),                f: 196000,  mat: ['esmeralda'] },
  { n: tt("Martelo de rubi"),                     f: 248000,  mat: ['rubi'] },
  { n: tt("Martelo de safira"),                   f: 313000,  mat: ['safira'] },
  { n: tt("Martelo de cristais fundidos"),        f: 396000,  mat: ['safira', 'rubi', 'esmeralda'] },
  { n: tt("Martelo de diamante"),                 f: 500000,  mat: ['diamante'] },
  { n: tt("Fragmento de meteorito"),              f: 633000,  mat: ['diamante'] },
  { n: tt("Martelo de ferro meteórico"),          f: 800000,  mat: ['meteoro'] },
  { n: tt("Martelo do Vale"),                     f: 1000000, mat: ['nucleo'] },
  { n: tt("Picareta Rúnica"),                     f: 1400000, mat: [] }, // nível 61: segredo da Zona 7 (não entra na forja)
];
const MAX_LEVEL = 60;

// Cor da cabeça do martelo por nível (visual)
function hammerLook(L) {
  if (L <= 10) return { head: '#7a5532', head2: '#a3784c', handle: '#6b4a2e', type: 'wood' };
  if (L <= 20) {
    const pal = ['#8f9496', '#8f9496', '#c49a6c', '#c49a6c', '#4b4743', '#4b4743', '#35383b', '#45494d', '#a39a96', '#b8aeaa'];
    const c = pal[L - 11];
    return { head: c, head2: '#d8d2c8', handle: '#6b4a2e', type: 'stone' };
  }
  if (L <= 30) {
    if (L === 21) return { head: '#7d5b45', head2: '#a37350', handle: '#5a3f2a', type: 'metal' };
    if (L <= 24) return { head: '#b5653a', head2: '#f0a070', handle: '#5a3f2a', type: 'metal' };
    if (L <= 27) return { head: '#a87a35', head2: '#e8c070', handle: '#4f3826', type: 'metal' };
    if (L <= 29) return { head: '#c9a446', head2: '#fff0a0', handle: '#4f3826', type: 'metal' };
    return { head: '#b07a3a', head2: '#ffd890', handle: '#3a2a1c', type: 'metal', glow: '#ffcf70' };
  }
  if (L <= 40) {
    if (L <= 34) return { head: '#4a4d52', head2: '#8a8f96', handle: '#3a2a1c', type: 'metal' };
    if (L <= 37) return { head: '#5f666e', head2: '#c7cdd4', handle: '#2a2a2a', type: 'metal' };
    return { head: '#6e7680', head2: '#e8eef4', handle: '#1f1f1f', type: 'sledge' };
  }
  if (L <= 50) {
    if (L <= 47) return { head: '#d9a21a', head2: '#ffe27a', handle: '#222', type: 'machine' };
    return { head: '#8d96a6', head2: '#e6ecf5', handle: '#222', type: 'machine' };
  }
  const crystal = { 51: '#d9dde6', 52: '#9b6ad6', 53: '#2ec27e', 54: '#e8324f', 55: '#3a74f0', 56: '#c06af0', 57: '#bdf2ff', 58: '#ff8a3d', 59: '#ff6a2a', 60: '#7af0ff' };
  return { head: crystal[L], head2: '#ffffff', handle: '#2a2238', type: L >= 58 ? 'meteor' : 'crystal', glow: crystal[L] };
}

// ---------- Atributos (Dona Cida, a Tropeira) ----------
const ATTRS = {
  mine: { name: tt("Velocidade de mineração"), short: tt("Mineração"), part: tt("Luvas e braços") },
  bag:  { name: tt("Tamanho da mochila"),      short: tt("Mochila"),   part: tt("Mochila") },
  move: { name: tt("Velocidade de movimento"), short: tt("Movimento"), part: tt("Calçados") },
  jump: { name: tt("Altura do pulo"),          short: tt("Pulo"),      part: tt("Pernas") },
};
function attrValue(key, lvl) {
  const l = lvl - 1;
  switch (key) {
    case 'mine': return 1.5 / Math.pow(1.0379, l);          // segundos por golpe
    case 'bag':  return Math.round(10 * Math.pow(1.111, l)); // espaços
    case 'move': return 3 * Math.pow(1.0398, l);             // m/s
    case 'jump': return 0.5 * Math.pow(1.0554, l);           // metros
  }
}
function attrLabel(key, lvl) {
  const v = attrValue(key, lvl);
  switch (key) {
    case 'mine': return (1 / v).toFixed(2).replace('.', DEC) + tt(" golpes/s");
    case 'bag':  return fmt(v) + tt(" espaços");
    case 'move': return v.toFixed(1).replace('.', DEC) + ' m/s';
    case 'jump': return v.toFixed(2).replace('.', DEC) + ' m';
  }
}

// ---------- Custos ----------
function hammerCost(L) { // custo para chegar ao nível L
  const h = HAMMERS[L];
  // primeiros martelos bem baratos: a primeira evolução sai em menos de 1 minuto
  const qty = L <= 4 ? L : 3 + Math.floor(L / 2);
  const money = L <= 4 ? [0, 0, 10, 20, 32][L] : Math.round(25 * Math.pow(1.31, L - 2));
  const mats = h.mat.map(id => ({ id, qty }));
  if (SPECIAL_AT[L]) mats.push({ id: SPECIAL_AT[L], qty: 5 });
  return { money, mats };
}
function resourceForLevel(lvl) {
  let best = RESOURCES[0];
  for (const r of RESOURCES) if (!r.special && r.ideal <= lvl) best = r;
  return best;
}
function attrCost(key, lvl) { // custo para chegar ao nível lvl
  const r = resourceForLevel(Math.max(1, lvl - 1));
  const money = Math.round(20 * Math.pow(1.29, lvl - 2));
  return { money, mats: [{ id: r.id, qty: 3 + Math.floor(lvl / 3) }] };
}

// ---------- Power-ups (Zé da Botica) ----------
const POWERUPS = {
  tonico: { name: tt("Tônico de Força"),    key: '1', slots: 3, dur: 120, color: '#e8552f', desc: tt("mais recurso por golpe") },
  cafe:   { name: tt("Café Forte"),         key: '2', slots: 3, dur: 120, color: '#3a8ef0', desc: tt("mais velocidade de mineração") },
  elixir: { name: tt("Elixir do Ferreiro"), key: '3', slots: 5, dur: 180, color: '#f0c03a', desc: tt("força e velocidade juntas") },
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
function powerBonus(id, tier) {
  if (id === 'elixir') return 0.35 + 0.15 * (tier - 1);
  return 0.5 + 0.2 * (tier - 1);
}
// regra do nível: pedra acima do martelo demora mais (×2 a ×12); 11+ níveis acima não quebra
const LEVEL_LOCK = 10;
function levelRule(resIdeal, hammer) {
  const gap = resIdeal - hammer;
  if (gap <= 0) return { mult: 1, gap, blocked: false };
  if (gap > LEVEL_LOCK) return { mult: Infinity, gap, blocked: true };
  return { mult: 2 * Math.pow(6, (gap - 1) / 9), gap, blocked: false };
}
// Cintilha: pedrinha brilhante que sai de qualquer pedra e compra poções
function powerCint(id, hammerLvl) { return (id === 'elixir' ? 3 : 1) * (1 + Math.floor((eraOf(hammerLvl) - 1) / 2)); }
const OLHO = [0, 800, 8000, 80000, 800000, 8000000]; // preço de cada nível do Olho de Garimpeiro
function cintChance(olho) { return 0.03 + 0.015 * (olho || 0); }
// achados espalhados pelo mapa (não entram na lista normal de recursos)
const WILDS = [
  { id: 'veiocint', name: tt("Veio de Cintilha"), kind: 'wild', wild: true, c: '#7af0ff', c2: '#e8fbff', value: 0, hard: 1, ideal: 0, region: -1 },
  { id: 'geodo',    name: tt("Geodo de Poção"),   kind: 'wild', wild: true, c: '#6a4a8a', c2: '#d9b3ff', value: 0, hard: 1, ideal: 0, region: -1 },
];
for (const w of WILDS) RES[w.id] = w;
// a Pedra Selada da Zona 7 (segredo): só quebra com a Picareta 61
const SEAL = { id: 'selada', name: tt("Pedra Selada"), kind: 'sealed', sealed: true, c: '#2a1e3a', c2: '#ffd34d', value: 0, hard: 78000000, ideal: 61, region: -1 };
RES[SEAL.id] = SEAL;
function powerPrice(id, hammerLvl) {
  const base = 15 * Math.pow(1.31, hammerLvl - 1);
  return Math.round(base * (id === 'elixir' ? 2 : 1));
}
function eraOf(L) { return Math.min(6, Math.floor((L - 1) / 10) + 1); }

// ---------- História (marcos a cada 10 níveis) ----------
const STORY = {
  1:  { t: tt("O bilhete do avô"), s: tt("Vale Ferrado está vazio. A mina desabou e todos foram embora. Na oficina em ruínas, só um graveto e um bilhete: \"Reconstrói o que eu não consegui.\" Vá ao Norte, no Bosque do Avô, e comece a golpear.") },
  10: { t: tt("A primeira família volta"), s: tt("O barulho do seu maço ecoa pelo vale. Uma família de lenhadores reabre a casa ao lado da praça. Dizem que no Leste, no Riacho das Pedras, há pedras boas para martelos de verdade.") },
  20: { t: tt("O Ancião do riacho"), s: tt("Um velho pescador observa seu trabalho e entrega um maço de granito: \"Seu avô me fez um igual.\" Ele conta que a Vila do Sul ainda guarda sucata e cobre.") },
  30: { t: tt("O martelo do avô"), s: tt("Entre as ruínas da vila você encontra a cabeça do martelo do seu avô. Seu Bento chora ao ver o martelo restaurado. Na cabeça, gravado: \"Oeste. Galeria 7.\"") },
  40: { t: tt("A Mina Velha reabre"), s: tt("Você abre caminho até a Galeria 7. As vigas não quebraram sozinhas: foram cortadas. Alguém queria a mina fechada. Rastros levam à Pedreira Funda, a Noroeste.") },
  50: { t: tt("Vale Ferrado industrial"), s: tt("Máquinas voltam a rugir e a cidade cresce. Na Pedreira Funda você acha mapas antigos marcando uma cratera na Serra dos Cristais, a Nordeste.") },
  61: { t: tt("A Picareta Rúnica"), s: tt("Ao tocar a picareta, as runas do pedestal se acendem e uma coluna de luz sobe no Sudeste, onde o mapa não marca nada. Algo que ninguém chama de zona está esperando por você: a Zona 7.") },
  60: { t: tt("O Martelo do Vale"), s: tt("No fundo da cratera estava o núcleo estelar que o avô protegeu, escondendo a mina de quem queria saqueá-la. Com o Martelo do Vale, você reconstrói o que ele não conseguiu. Vale Ferrado vive de novo.") },
};

function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2).replace('.', DEC) + tt(" bi");
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace('.', DEC) + tt(" mi");
  if (n >= 1e4) return Math.round(n).toLocaleString(LOCALE);
  if (n >= 100) return Math.round(n).toLocaleString(LOCALE);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1).replace('.', DEC);
}
function fmtTime(s) {
  if (!isFinite(s)) return '∞';
  if (s < 60) return Math.ceil(s) + ' s';
  if (s < 3600) return Math.round(s / 60) + tt(" min");
  if (s < 86400) return (s / 3600).toFixed(1).replace('.', DEC) + ' h';
  return Math.round(s / 86400) + tt(" dias");
}

// ---------- Equipamentos (Tonho do Bazar) ----------
const GADGETS = {
  detector: {
    title: tt("Detector (a seta)"), key: 'G', desc: tt("Mostra uma seta para o que você procura. G liga/desliga; segure G para escolher."),
    levels: [null,
      { n: tt("Detector de bolso"),    price: 300,     range: 80,   err: 0.6,  info: tt("A seta acha coisas a até 80 m") },
      { n: tt("Detector de campo"),    price: 15000,   range: 600,  err: 0.35, info: tt("A seta acha coisas a até 600 m") },
      { n: tt("Detector de satélite"), price: 1500000, range: 4500, err: 0.15, info: tt("A seta acha coisas em quase o mapa inteiro"), mats: [{ id: 'ferroceleste', qty: 5 }] },
    ],
  },
  ride: {
    title: tt("Transporte"), key: 'R', desc: tt("R sobe e desce."),
    levels: [null,
      { n: tt("Patins de rodinha"),  price: 800,      mult: 1.5, info: tt("+50% de velocidade · correr ainda cansa") },
      { n: tt("Patinete"),           price: 20000,    mult: 2.2, info: tt("+120% de velocidade · correr ainda cansa") },
      { n: tt("Monociclo elétrico"), price: 600000,   mult: 3.2, info: tt("+220% de velocidade · correr ainda cansa") },
      { n: tt("Hoverboard"),         price: 25000000, mult: 5.5, free: true, info: tt("+450% de velocidade · não gasta fôlego"), mats: [{ id: 'obsidiana', qty: 5 }] },
    ],
  },
};
GADGETS.climb = {
  title: tt("Escalada"), key: 'Q · Z · X', desc: tt("Para sair dos valões (e subir onde quiser). Q lança o gancho, Z pendura escada, X coloca a cama elástica e, com o jetpack, é só segurar Espaço no ar. Quem tem o melhor continua usando os anteriores."),
  levels: [null,
    { n: tt("Corda com gancho"),   price: 1500,     info: tt("Q: lança o gancho na beirada à sua frente e sobe um degrau (até 6 m)") },
    { n: tt("Escada de cordas"),   price: 25000,    info: tt("Z: pendura uma escada na parede à sua frente (até 3). Subida lenta") },
    { n: tt("Escada de metal"),    price: 400000,   info: tt("Z: escada de subida rápida (até 6 penduradas)") },
    { n: tt("Mini cama elástica"), price: 6000000,  info: tt("X: coloca no chão (até 3). Pule nela e suba 2 ou 3 degraus de uma vez; serve também para montanha") },
    { n: tt("Jetpack"),            price: 60000000, info: tt("Segure Espaço no ar para voar; o combustível recarrega no chão. Sai até do fundo da Serra dos Cristais"), mats: [{ id: 'ferroceleste', qty: 5 }] },
  ],
};
const SELL_MODES = { sobra: tt("guardar o que falta, vender o resto"), guardar: tt("guardar tudo"), vender: tt("vender tudo") };
const DAY_LEN = 16 * 60; // um dia inteiro dura 16 minutos
