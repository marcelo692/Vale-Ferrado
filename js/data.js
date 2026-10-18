// =============================================================
// Vale Ferrado — dados do jogo (tabelas do documento de design)
// =============================================================
'use strict';

const GAME_VERSION = '1.6.2';
const PX = 8; // pixels por metro

// ---------- Regiões (uma por era) ----------
const REGIONS = [
  { id: 0, era: 1, name: 'Bosque do Avô',          dir: 'Norte',    ang: -90,  dMin: 30,   dMax: 150,  jMin: 0.5, jMax: 1,   ground: ['#4f6b2f', '#5d7a36', '#46602a'], obstacle: 'tronco' },
  { id: 1, era: 2, name: 'Riacho das Pedras',      dir: 'Leste',    ang: 0,    dMin: 150,  dMax: 400,  jMin: 1,   jMax: 2,   ground: ['#6f7a5e', '#7d8668', '#5f6b52'], obstacle: 'pedra' },
  { id: 2, era: 3, name: 'Vila em Ruínas',         dir: 'Sul',      ang: 90,   dMin: 400,  dMax: 800,  jMin: 2,   jMax: 3.5, ground: ['#8a7356', '#97805f', '#7a654b'], obstacle: 'muro' },
  { id: 3, era: 4, name: 'Mina Velha',             dir: 'Oeste',    ang: 180,  dMin: 800,  dMax: 1500, jMin: 3.5, jMax: 5,   ground: ['#5a4636', '#4d3b2d', '#66503e'], obstacle: 'trilho' },
  { id: 4, era: 5, name: 'Pedreira Funda',         dir: 'Noroeste', ang: -135, dMin: 1500, dMax: 2500, jMin: 5,   jMax: 8,   ground: ['#8d8b86', '#9a9893', '#7e7c77'], obstacle: 'bancada' },
  { id: 5, era: 6, name: 'Serra dos Cristais',     dir: 'Nordeste', ang: -45,  dMin: 2500, dMax: 4000, jMin: 8,   jMax: 12,  ground: ['#4a4560', '#56506e', '#3f3b52'], obstacle: 'penhasco' },
];

// ---------- Recursos ----------
// kind: visual (nut, stick, log, clay, rock, ore, crystal, scrap, meteor)
const RESOURCES = [
  { id: 'noz',         name: 'Noz e castanha',          region: 0, ideal: 1,  hard: 10,       kind: 'nut',     c: '#8a5a2b', c2: '#3f6e2a' },
  { id: 'graveto',     name: 'Graveto',                 region: 0, ideal: 2,  hard: 13,       kind: 'stick',   c: '#7a5a3a', c2: '#5b4128' },
  { id: 'lenha',       name: 'Lenha',                   region: 0, ideal: 4,  hard: 20,       kind: 'log',     c: '#6b4a2e', c2: '#c9a57a' },
  { id: 'argila',      name: 'Argila',                  region: 0, ideal: 6,  hard: 33,       kind: 'clay',    c: '#a5603d', c2: '#c27a52' },
  { id: 'cascalho',    name: 'Cascalho',                region: 0, ideal: 8,  hard: 52,       kind: 'rock',    c: '#8b8578', c2: '#a8a294' },
  { id: 'pedrasabao',  name: 'Pedra-sabão',             region: 0, ideal: 10, hard: 82,       kind: 'rock',    c: '#7f8f84', c2: '#9fb0a3' },
  { id: 'seixo',       name: 'Seixo de rio',            region: 1, ideal: 11, hard: 104,      kind: 'rock',    c: '#9aa0a2', c2: '#c3c8c9' },
  { id: 'arenito',     name: 'Arenito',                 region: 1, ideal: 13, hard: 166,      kind: 'rock',    c: '#c49a6c', c2: '#dcb98d' },
  { id: 'silex',       name: 'Sílex',                   region: 1, ideal: 15, hard: 265,      kind: 'rock',    c: '#4b4743', c2: '#7d7570' },
  { id: 'basalto',     name: 'Basalto',                 region: 1, ideal: 17, hard: 423,      kind: 'rock',    c: '#35383b', c2: '#575b5f' },
  { id: 'granito',     name: 'Granito',                 region: 1, ideal: 19, hard: 676,      kind: 'rock',    c: '#a39a96', c2: '#d1c6c1' },
  { id: 'sucata',      name: 'Sucata e pregos velhos',  region: 2, ideal: 21, hard: 1080,     kind: 'scrap',   c: '#7d5b45', c2: '#a37350' },
  { id: 'malaquita',   name: 'Malaquita (cobre)',       region: 2, ideal: 23, hard: 1730,     kind: 'ore',     c: '#3f8a63', c2: '#6fc496' },
  { id: 'cassiterita', name: 'Cassiterita (estanho)',   region: 2, ideal: 25, hard: 2770,     kind: 'ore',     c: '#4d3d33', c2: '#9a8b7e' },
  { id: 'esfalerita',  name: 'Esfalerita (zinco)',      region: 2, ideal: 27, hard: 4420,     kind: 'ore',     c: '#7a5a22', c2: '#c9a046' },
  { id: 'calcario',    name: 'Calcário',                region: 2, ideal: 29, hard: 7060,     kind: 'rock',    c: '#cfc6b0', c2: '#ebe4d2' },
  { id: 'carvao',      name: 'Carvão',                  region: 3, ideal: 31, hard: 11300,    kind: 'ore',     c: '#1f1f22', c2: '#4a4a52' },
  { id: 'hematita',    name: 'Hematita (ferro)',        region: 3, ideal: 33, hard: 18000,    kind: 'ore',     c: '#6e2c22', c2: '#b0524a' },
  { id: 'magnetita',   name: 'Magnetita',               region: 3, ideal: 35, hard: 29000,    kind: 'ore',     c: '#2b2d33', c2: '#6c7180' },
  { id: 'cromita',     name: 'Cromita (cromo)',         region: 3, ideal: 37, hard: 46000,    kind: 'ore',     c: '#3a3530', c2: '#9aa3a8' },
  { id: 'vanadinita',  name: 'Vanadinita (vanádio)',    region: 3, ideal: 39, hard: 74000,    kind: 'ore',     c: '#7a3a1e', c2: '#e2683a' },
  { id: 'marmore',     name: 'Mármore',                 region: 4, ideal: 41, hard: 118000,   kind: 'rock',    c: '#e6e3dc', c2: '#ffffff' },
  { id: 'prata',       name: 'Prata',                   region: 4, ideal: 43, hard: 189000,   kind: 'ore',     c: '#6f747a', c2: '#e3e8ee' },
  { id: 'ouro',        name: 'Ouro',                    region: 4, ideal: 45, hard: 303000,   kind: 'ore',     c: '#6d5a2a', c2: '#ffd34d' },
  { id: 'rutilo',      name: 'Rutilo (titânio)',        region: 4, ideal: 47, hard: 484000,   kind: 'ore',     c: '#4a2c22', c2: '#c4724a' },
  { id: 'volframita',  name: 'Volframita (tungstênio)', region: 4, ideal: 49, hard: 773000,   kind: 'ore',     c: '#222327', c2: '#8d96a6' },
  { id: 'quartzo',     name: 'Quartzo',                 region: 5, ideal: 51, hard: 1200000,  kind: 'crystal', c: '#d9dde6', c2: '#ffffff' },
  { id: 'ametista',    name: 'Ametista (geodo)',        region: 5, ideal: 52, hard: 1600000,  kind: 'crystal', c: '#6a3fa0', c2: '#c49cf0' },
  { id: 'esmeralda',   name: 'Esmeralda',               region: 5, ideal: 53, hard: 2000000,  kind: 'crystal', c: '#127a4a', c2: '#57e0a0' },
  { id: 'rubi',        name: 'Rubi',                    region: 5, ideal: 54, hard: 2500000,  kind: 'crystal', c: '#8f1028', c2: '#ff4f6e' },
  { id: 'safira',      name: 'Safira',                  region: 5, ideal: 55, hard: 3200000,  kind: 'crystal', c: '#123a8f', c2: '#4f8cff' },
  { id: 'diamante',    name: 'Diamante',                region: 5, ideal: 57, hard: 5000000,  kind: 'crystal', c: '#9fd8e8', c2: '#ffffff' },
  { id: 'meteoro',     name: 'Ferro meteórico',         region: 5, ideal: 59, hard: 8000000,  kind: 'meteor',  c: '#3a3436', c2: '#ff8a3d' },
  { id: 'nucleo',      name: 'Núcleo estelar',          region: 5, ideal: 60, hard: 10000000, kind: 'meteor',  c: '#2a1e3a', c2: '#7af0ff' },
];
const RES = {};
RESOURCES.forEach(r => { r.value = Math.max(1, Math.round(r.hard / 2)); RES[r.id] = r; });

// ---------- Os 60 martelos ----------
// mat: materiais para forjar (ids). force: força do golpe.
const HAMMERS = [
  null,
  { n: 'Graveto seco',                        f: 1,       mat: [] },
  { n: 'Galho grosso',                        f: 1.3,     mat: ['noz'] },
  { n: 'Galho de goiabeira',                  f: 1.6,     mat: ['graveto'] },
  { n: 'Porrete de pinho',                    f: 2,       mat: ['graveto'] },
  { n: 'Porrete de eucalipto',                f: 2.6,     mat: ['lenha'] },
  { n: 'Clava de aroeira',                    f: 3.2,     mat: ['lenha'] },
  { n: 'Clava de ipê',                        f: 4.1,     mat: ['argila'] },
  { n: 'Maço de madeira',                     f: 5.2,     mat: ['argila'] },
  { n: 'Maço amarrado com cipó',              f: 6.5,     mat: ['cascalho'] },
  { n: 'Maço de ipê curado',                  f: 8.2,     mat: ['cascalho'] },
  { n: 'Pedra de rio amarrada',               f: 10,      mat: ['pedrasabao'] },
  { n: 'Pedra amarrada com couro',            f: 13,      mat: ['seixo'] },
  { n: 'Arenito lascado',                     f: 17,      mat: ['seixo'] },
  { n: 'Arenito com cabo encaixado',          f: 21,      mat: ['arenito'] },
  { n: 'Sílex lascado',                       f: 27,      mat: ['arenito'] },
  { n: 'Sílex com cabo de ipê',               f: 34,      mat: ['silex'] },
  { n: 'Basalto lascado',                     f: 43,      mat: ['silex'] },
  { n: 'Basalto polido',                      f: 54,      mat: ['basalto'] },
  { n: 'Granito polido',                      f: 68,      mat: ['basalto'] },
  { n: 'Maço de granito do Ancião',           f: 86,      mat: ['granito'] },
  { n: 'Martelo de sucata',                   f: 108,     mat: ['granito', 'sucata'] },
  { n: 'Cobre batido a frio',                 f: 137,     mat: ['sucata'] },
  { n: 'Cobre fundido',                       f: 173,     mat: ['sucata'] },
  { n: 'Cobre reforçado',                     f: 219,     mat: ['malaquita'] },
  { n: 'Bronze rústico',                      f: 277,     mat: ['malaquita', 'cassiterita'] },
  { n: 'Bronze fundido',                      f: 350,     mat: ['cassiterita'] },
  { n: 'Bronze temperado',                    f: 442,     mat: ['cassiterita'] },
  { n: 'Latão',                               f: 559,     mat: ['esfalerita'] },
  { n: 'Latão com cabo reforçado',            f: 707,     mat: ['esfalerita'] },
  { n: 'Martelo do Avô (restaurado)',         f: 893,     mat: ['calcario', 'esfalerita'] },
  { n: 'Ferro de sucata',                     f: 1130,    mat: ['calcario', 'carvao'] },
  { n: 'Ferro batido',                        f: 1430,    mat: ['carvao'] },
  { n: 'Ferro fundido',                       f: 1800,    mat: ['hematita'] },
  { n: 'Ferro forjado',                       f: 2280,    mat: ['hematita'] },
  { n: 'Martelo de unha de ferro',            f: 2880,    mat: ['magnetita'] },
  { n: 'Aço carbono',                         f: 3640,    mat: ['magnetita', 'carvao'] },
  { n: 'Aço temperado',                       f: 4600,    mat: ['cromita'] },
  { n: 'Marreta de aço',                      f: 5820,    mat: ['cromita'] },
  { n: 'Aço cromo-vanádio',                   f: 7360,    mat: ['vanadinita'] },
  { n: 'Marreta de demolição',                f: 9300,    mat: ['vanadinita'] },
  { n: 'Martelete pneumático leve',           f: 11800,   mat: ['marmore'] },
  { n: 'Martelete pneumático pesado',         f: 14900,   mat: ['marmore'] },
  { n: 'Rompedor elétrico',                   f: 18800,   mat: ['prata'] },
  { n: 'Rompedor a diesel',                   f: 23800,   mat: ['prata'] },
  { n: 'Martelo hidráulico',                  f: 30000,   mat: ['ouro'] },
  { n: 'Bate-estaca a vapor',                 f: 38000,   mat: ['ouro'] },
  { n: 'Bate-estaca hidráulico',              f: 48000,   mat: ['rutilo'] },
  { n: 'Martelo de titânio',                  f: 60700,   mat: ['rutilo'] },
  { n: 'Martelo de tungstênio',               f: 76700,   mat: ['volframita'] },
  { n: 'Martelo de carboneto de tungstênio',  f: 97000,   mat: ['volframita'] },
  { n: 'Tungstênio com núcleo de quartzo',    f: 123000,  mat: ['quartzo'] },
  { n: 'Martelo de ametista',                 f: 155000,  mat: ['ametista'] },
  { n: 'Martelo de esmeralda',                f: 196000,  mat: ['esmeralda'] },
  { n: 'Martelo de rubi',                     f: 248000,  mat: ['rubi'] },
  { n: 'Martelo de safira',                   f: 313000,  mat: ['safira'] },
  { n: 'Martelo de cristais fundidos',        f: 396000,  mat: ['safira', 'rubi', 'esmeralda'] },
  { n: 'Martelo de diamante',                 f: 500000,  mat: ['diamante'] },
  { n: 'Fragmento de meteorito',              f: 633000,  mat: ['diamante'] },
  { n: 'Martelo de ferro meteórico',          f: 800000,  mat: ['meteoro'] },
  { n: 'Martelo do Vale',                     f: 1000000, mat: ['nucleo'] },
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
  mine: { name: 'Velocidade de mineração', short: 'Mineração', part: 'Luvas e braços' },
  bag:  { name: 'Tamanho da mochila',      short: 'Mochila',   part: 'Mochila' },
  move: { name: 'Velocidade de movimento', short: 'Movimento', part: 'Calçados' },
  jump: { name: 'Altura do pulo',          short: 'Pulo',      part: 'Pernas' },
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
    case 'mine': return (1 / v).toFixed(2).replace('.', ',') + ' golpes/s';
    case 'bag':  return fmt(v) + ' espaços';
    case 'move': return v.toFixed(1).replace('.', ',') + ' m/s';
    case 'jump': return v.toFixed(2).replace('.', ',') + ' m';
  }
}

// ---------- Custos ----------
function hammerCost(L) { // custo para chegar ao nível L
  const h = HAMMERS[L];
  const qty = 3 + Math.floor(L / 2);
  const money = Math.round(25 * Math.pow(1.31, L - 2));
  return { money, mats: h.mat.map(id => ({ id, qty })) };
}
function resourceForLevel(lvl) {
  let best = RESOURCES[0];
  for (const r of RESOURCES) if (r.ideal <= lvl) best = r;
  return best;
}
function attrCost(key, lvl) { // custo para chegar ao nível lvl
  const r = resourceForLevel(Math.max(1, lvl - 1));
  const money = Math.round(20 * Math.pow(1.29, lvl - 2));
  return { money, mats: [{ id: r.id, qty: 3 + Math.floor(lvl / 3) }] };
}

// ---------- Power-ups (Zé da Botica) ----------
const POWERUPS = {
  tonico: { name: 'Tônico de Força',    key: '1', slots: 3, dur: 120, color: '#e8552f', desc: 'mais recurso por golpe' },
  cafe:   { name: 'Café Forte',         key: '2', slots: 3, dur: 120, color: '#3a8ef0', desc: 'mais velocidade de mineração' },
  elixir: { name: 'Elixir do Ferreiro', key: '3', slots: 5, dur: 180, color: '#f0c03a', desc: 'força e velocidade juntas' },
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];
function powerBonus(id, tier) {
  if (id === 'elixir') return 0.35 + 0.15 * (tier - 1);
  return 0.5 + 0.2 * (tier - 1);
}
function powerPrice(id, hammerLvl) {
  const base = 15 * Math.pow(1.31, hammerLvl - 1);
  return Math.round(base * (id === 'elixir' ? 2 : 1));
}
function eraOf(L) { return Math.min(6, Math.floor((L - 1) / 10) + 1); }

// ---------- História (marcos a cada 10 níveis) ----------
const STORY = {
  1:  { t: 'O bilhete do avô', s: 'Vale Ferrado está vazio. A mina desabou e todos foram embora. Na oficina em ruínas, só um graveto e um bilhete: "Reconstrói o que eu não consegui." Vá ao Norte, no Bosque do Avô, e comece a golpear.' },
  10: { t: 'A primeira família volta', s: 'O barulho do seu maço ecoa pelo vale. Uma família de lenhadores reabre a casa ao lado da praça. Dizem que no Leste, no Riacho das Pedras, há pedras boas para martelos de verdade.' },
  20: { t: 'O Ancião do riacho', s: 'Um velho pescador observa seu trabalho e entrega um maço de granito: "Seu avô me fez um igual." Ele conta que a Vila do Sul ainda guarda sucata e cobre.' },
  30: { t: 'O martelo do avô', s: 'Entre as ruínas da vila você encontra a cabeça do martelo do seu avô. Seu Bento chora ao ver o martelo restaurado. Na cabeça, gravado: "Oeste. Galeria 7."' },
  40: { t: 'A Mina Velha reabre', s: 'Você abre caminho até a Galeria 7. As vigas não quebraram sozinhas: foram cortadas. Alguém queria a mina fechada. Rastros levam à Pedreira Funda, a Noroeste.' },
  50: { t: 'Vale Ferrado industrial', s: 'Máquinas voltam a rugir e a cidade cresce. Na Pedreira Funda você acha mapas antigos marcando uma cratera na Serra dos Cristais, a Nordeste.' },
  60: { t: 'O Martelo do Vale', s: 'No fundo da cratera estava o núcleo estelar que o avô protegeu, escondendo a mina de quem queria saqueá-la. Com o Martelo do Vale, você reconstrói o que ele não conseguiu. Vale Ferrado vive de novo.' },
};

function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2).replace('.', ',') + ' bi';
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace('.', ',') + ' mi';
  if (n >= 1e4) return Math.round(n).toLocaleString('pt-BR');
  if (n >= 100) return Math.round(n).toLocaleString('pt-BR');
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1).replace('.', ',');
}
function fmtTime(s) {
  if (!isFinite(s)) return '∞';
  if (s < 60) return Math.ceil(s) + ' s';
  if (s < 3600) return Math.round(s / 60) + ' min';
  if (s < 86400) return (s / 3600).toFixed(1).replace('.', ',') + ' h';
  return Math.round(s / 86400) + ' dias';
}

// ---------- Equipamentos (Tonho do Bazar) ----------
const GADGETS = {
  detector: {
    title: 'Detector de minério', key: 'G', desc: 'Aponta a direção do minério escolhido (T troca o minério).',
    levels: [null,
      { n: 'Detector de bolso',    price: 300,     range: 80,   err: 0.6,  info: 'Alcance 80 m · direção aproximada' },
      { n: 'Detector de campo',    price: 15000,   range: 600,  err: 0.35, info: 'Alcance 600 m · mais preciso' },
      { n: 'Detector de satélite', price: 1500000, range: 4500, err: 0.15, info: 'Alcance de quase o mapa inteiro' },
    ],
  },
  ride: {
    title: 'Transporte', key: 'R', desc: 'Suba e desça com R. Vale também para pular.',
    levels: [null,
      { n: 'Patins de rodinha',  price: 800,      mult: 1.5, info: '+50% de velocidade · correr ainda cansa' },
      { n: 'Patinete',           price: 20000,    mult: 2.2, info: '+120% de velocidade · correr ainda cansa' },
      { n: 'Monociclo elétrico', price: 600000,   mult: 3.2, info: '+220% de velocidade · correr ainda cansa' },
      { n: 'Hoverboard',         price: 25000000, mult: 5.5, free: true, info: '+450% de velocidade · não gasta fôlego' },
    ],
  },
  light: {
    title: 'Iluminação', key: 'L', desc: 'Liga e desliga com L. À noite, sem luz, quase não se vê nada.',
    levels: [null,
      { n: 'Lanterna de mão',       price: 150,      info: 'Facho estreito de 28 m' },
      { n: 'Lanterna de cabeça',    price: 6000,     info: 'Facho largo de 40 m, mãos livres' },
      { n: 'Drone de luz',          price: 400000,   info: 'Lanterna de cabeça + drone que ilumina 45 m em volta' },
      { n: 'Esquadrilha de drones', price: 12000000, info: 'Lanterna de cabeça + 3 drones iluminando 80 m' },
    ],
  },
};
const DAY_LEN = 16 * 60; // um dia inteiro dura 16 minutos
