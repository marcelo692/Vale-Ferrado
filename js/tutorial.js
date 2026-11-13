// =============================================================
// Vale Ferrado — tutorial de segundos (só em jogo novo)
// colher → noz → volta à vila → Seu Bento forja o martelinho → a noz cai num golpe
// O resto da tela fica escondido e só as teclas do passo atual funcionam.
// =============================================================
'use strict';

const TUT_SUB = { wild: true, tut: true, nodes: [], spawnPts: [], harvest: 0 };
const TUT_START = { x: 0, y: -15 };   // borda norte da vila, de frente para o Bosque
const TUT_NUT = { x: 0.6, y: -27.5 };  // logo fora da vila

const Tutorial = {
  active: false, step: null, nut: null, t: 0,
  shouldStart() { const S = Game.S; return !S.tut && S.hammer === 1 && !(S.earned > 0) && !(S.time > 5); },
  start() {
    const S = Game.S, P = Game.P;
    this.active = true; S.seen[1] = true; document.body.classList.add('tut');
    P.x = TUT_START.x; P.y = TUT_START.y; P.z = 0; P.vz = 0; P.yaw = 0; P.pitch = -0.08;
    this.nut = this.spawnNut(TUT_NUT.x, TUT_NUT.y, 1, 0.6);
    const look = new THREE.Vector3(TUT_NUT.x, World.height(TUT_NUT.x, TUT_NUT.y) + 0.6, TUT_NUT.y);
    this.go('intro');
    Cine.play({ dur: 2.8, blendIn: 0.9, blendOut: 0.7, skippable: true,
      cam: () => ({ pos: new THREE.Vector3(TUT_NUT.x + 4.5, World.height(TUT_NUT.x, TUT_NUT.y) + 2.4, TUT_NUT.y + 5.5), look }),
      end: () => this.go('walk') });
  },
  spawnNut(x, y, size, hpMul) {
    const res = RES.noz, hp = res.hard * size * hpMul;
    const n = { x, y, pt: { used: true }, sub: TUT_SUB, res, size, rare: 1, hp, maxHp: hp, r: 0.9 + size * 0.7, seed: 3.3, hitT: 0, born: Game.S.time };
    TUT_SUB.nodes.push(n); World.nodes.push(n);
    return n;
  },
  texts: {
    intro: () => tt("Seu avô só deixou uma colher de sopa. Serve para começar!"),
    walk:  () => tt("Ande até a noz  ·  <kbd>W</kbd>  e o mouse para olhar"),
    mine:  () => tt("<b>Segure o clique</b> para bater com a colher"),
    back:  () => tt("Boa! Agora volte para a vila  ·  <kbd>W</kbd>"),
    smith: () => tt("Vá até o Seu Bento e aperte <kbd>E</kbd>"),
    forge: () => tt("Clique em <b>Forjar</b>: o primeiro é por conta da casa"),
    try:   () => tt("Martelinho novo! Bata nesta noz"),
  },
  go(step) {
    this.step = step; this.t = 0;
    let el = document.getElementById('tutbox'); if (!el) { el = document.createElement('div'); el.id = 'tutbox'; document.body.appendChild(el); }
    el.innerHTML = `<p>${this.texts[step]()}</p><button onclick="Tutorial.skip()">${tt("Pular")}</button>`;
    el.classList.toggle('top', step === 'forge');
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    Snd.tone && Snd.tone(880, 0.08, { vol: 0.05, type: 'triangle' });
  },
  // teclas que valem em cada passo (o resto do jogo espera o tutorial acabar)
  allowKey(k) {
    if (!this.active) return true;
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', ' ', 'f', 'escape'].includes(k)) return true;
    return k === 'e' && this.step === 'smith';
  },
  target() {
    if (!this.active) return null;
    const S = this.step;
    if ((S === 'walk' || S === 'mine' || S === 'try') && this.nut && !this.nut.dead) return { x: this.nut.x, y: this.nut.y, label: tt("Noz") };
    if (S === 'back') return { x: 0, y: -16, label: tt("Vila") };
    if (S === 'smith') { const n = NPCS.find(v => v.id === 'ferreiro'); return { x: n.x, y: n.y, label: tt("Seu Bento") }; }
    return null;
  },
  update(dt) {
    if (!this.active) { if (started && this.shouldStart()) this.start(); return; }
    this.t += dt;
    const P = Game.P, n = this.nut, S = Game.S;
    switch (this.step) {
      case 'walk': if (n && Math.hypot(n.x - P.x, n.y - P.y) < Game.reach() + n.r + 0.6) this.go('mine'); break;
      case 'mine':
        if (n && n.dead) {
          this.go('back');
          // vira a câmera para a vila
          const want = Math.atan2(-(0 - P.x), -(-10 - P.y)); this.turn = { from: P.yaw, to: want, t: 0 };
        }
        break;
      case 'back':
        if (this.turn) { const T = this.turn; T.t = Math.min(1, T.t + dt * 1.6); let d = T.to - T.from; d = Math.atan2(Math.sin(d), Math.cos(d)); P.yaw = T.from + d * (T.t * T.t * (3 - 2 * T.t)); if (T.t >= 1) this.turn = null; }
        if (Game.inCity && !Object.keys(S.bag).length) {
          this.go('smith');
          const f = NPCS.find(v => v.id === 'ferreiro'), a = f.ang * Math.PI / 180, sx = f.x + Math.cos(a) * 1.4, sy = f.y + Math.sin(a) * 1.4;
          Cine.play({ dur: 2.2, blendIn: 0.7, blendOut: 0.7, cam: () => ({ pos: new THREE.Vector3(sx - Math.cos(a) * 7, 2.8, sy - Math.sin(a) * 7), look: new THREE.Vector3(sx, 1.7, sy) }),
            end: () => { P.yaw = Math.atan2(-(f.x - P.x), -(f.y - P.y)); } });
        }
        break;
      case 'smith': if (UI.open === 'ferreiro') this.go('forge'); break;
      case 'forge':
        if (S.hammer >= 2) { UI.close(); const f = NPCS.find(v => v.id === 'ferreiro'), a = f.ang * Math.PI / 180; this.nut = this.spawnNut(Math.cos(a) * 7.2, Math.sin(a) * 7.2, 0.5, 0.9); /* na praça, entre o ferreiro e a fonte */ this.go('try'); }
        else if (UI.open !== 'ferreiro') this.go('smith');
        break;
      case 'try':
        if (n && n.dead) { UI.banner(tt("Um golpe só!"), tt("Cada martelo novo deixa moles as pedras de antes. Agora é com você."), 3600); this.finish(); }
        break;
    }
  },
  finish(skipped) {
    const S = Game.S;
    this.active = false; S.tut = skipped ? 'skip' : 'done'; this.step = null; this.endT = S.time;
    document.body.classList.remove('tut');
    const el = document.getElementById('tutbox'); if (el) el.remove();
    for (const n of TUT_SUB.nodes.slice()) if (!n.dead) World.breakNode(n);
    Game.save();
  },
  skip() { if (Cine.busy()) Cine.active = null, document.body.classList.remove('cine'); this.finish(true); },
};
