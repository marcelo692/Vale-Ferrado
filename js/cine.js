// =============================================================
// Vale Ferrado — cenas de câmera (vendedor surgindo, tutorial)
// Enquanto uma cena roda, o jogador não anda, não minera e não mexe a câmera.
// =============================================================
'use strict';

const Cine = {
  active: null,
  // spec: { dur, cam(t) -> { pos: THREE.Vector3, look: THREE.Vector3 }, tick(t, dt), end(), blendIn, blendOut, skippable }
  play(spec) {
    this.active = Object.assign({ t: 0, blendIn: 0.9, blendOut: 0.8, skippable: true }, spec);
    Game.keys = {}; Game.mouse.down = false;
    UI.close && UI.open && UI.close(true);
    document.body.classList.add('cine');
  },
  busy() { return !!this.active; },
  skip() { const c = this.active; if (c && c.skippable && c.t > 0.6) c.t = Math.max(c.t, c.dur - c.blendOut); },
  update(dt) {
    const c = this.active; if (!c) return;
    Game.keys = {}; Game.mouse.down = false;
    c.t += dt;
    if (c.tick) c.tick(Math.min(c.t, c.dur), dt);
    if (c.t >= c.dur) { this.active = null; document.body.classList.remove('cine'); if (c.end) c.end(); }
  },
  // chamado pelo Render depois de posicionar a câmera do jogador: mistura com a câmera da cena
  apply(cam) {
    const c = this.active; if (!c || !c.cam) return;
    const want = c.cam(Math.min(c.t, c.dur));
    const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
    const k = Math.min(ease(c.t / c.blendIn), ease((c.dur - c.t) / c.blendOut));
    if (!this.m) this.m = new THREE.Matrix4(), this.q = new THREE.Quaternion(), this.q0 = new THREE.Quaternion();
    this.m.lookAt(want.pos, want.look, new THREE.Vector3(0, 1, 0));
    this.q.setFromRotationMatrix(this.m);
    this.q0.copy(cam.quaternion);
    cam.position.lerp(want.pos, k);
    cam.quaternion.copy(this.q0).slerp(this.q, k);
  },
};

// ---------- vendedores que aparecem conforme o martelo ----------
const Vendors = {
  isOpen(id) { const n = NPCS.find(v => v.id === id); return !n || n.unlock <= 1 || !!(Game.S.npcOpen && Game.S.npcOpen[id]); },
  // save antigo (sem a lista): quem já tem o martelo ganha os vendedores direto, sem cena
  init() {
    const S = Game.S;
    if (!S.npcOpen) { S.npcOpen = {}; if (S.hammer > 1 || S.earned > 0) for (const n of NPCS) if (S.hammer >= n.unlock) S.npcOpen[n.id] = true; }
  },
  pending() { return NPCS.find(n => n.unlock > 1 && Game.S.hammer >= n.unlock && !Game.S.npcOpen[n.id]); },
  update() {
    if (Cine.busy() || UI.open || Game.travel || !Game.inCity) return;
    const n = this.pending(); if (n) this.reveal(n);
  },
  reveal(n) {
    const a = n.ang * Math.PI / 180, sx = n.x + Math.cos(a) * 1.4, sy = n.y + Math.sin(a) * 1.4;
    // câmera na frente da barraca, um pouco alta, olhando para ela
    const dirx = -Math.cos(a), diry = -Math.sin(a);
    const pos = new THREE.Vector3(sx + dirx * 7.8, 3.3, sy + diry * 7.8), look = new THREE.Vector3(sx, 1.9, sy);
    let told = false, dust = 0; this.revealing = n.id;
    Snd.rumble();
    Cine.play({
      dur: 5.2, blendIn: 1, blendOut: 0.9,
      cam: t => ({ pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.08 * (t > 1 && t < 3.4 ? 1 : 0), 0, 0)), look }),
      tick: (t, dt) => {
        const k = Math.max(0, Math.min(1, (t - 1.1) / 2.2));          // 0 → 1 enquanto sobe
        const settle = t > 3.3 ? Math.max(0, 1 - (t - 3.3) / 0.5) : 1;
        Render.setStallRise(n.id, k, settle);
        dust += dt;
        if (t > 1 && t < 3.6 && dust > 0.12) { dust = 0; for (let i = 0; i < 2; i++) { const r = 2.2 + Math.random() * 1.5, q = Math.random() * 6.28; Game.fxBurst(sx + Math.cos(q) * r, sy + Math.sin(q) * r, i ? '#c9b48a' : '#8a7356', 6, 1.2); } }
        if (t > 3.3 && !told) {
          told = true; Snd.forge(); Game.fxBurst(sx, sy, n.color, 30, 1.6); Game.fxBurst(sx, sy, '#ffe27a', 24, 1.4);
          UI.banner(tt("Novo vendedor!"), n.name.split(',')[0] + ' · ' + (n.id === 'tropeira' ? tt("Mineração · mochila · movimento · pulo") : n.role));
        }
      },
      end: () => { Game.S.npcOpen[n.id] = true; this.revealing = null; Render.setStallRise(n.id, 1, 0); Game.save(); },
    });
  },
};
