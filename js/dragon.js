// =============================================================
// Vale Ferrado — o dragão (montaria voadora do fim do jogo)
// Modelo low poly feito em código, voo livre pelo mapa, câmera de perseguição e sopro de fogo.
// R chama/monta e desce · W acelera · mouse guia · Espaço sobe · C desce · Shift voa rápido · clique cospe fogo
// Por enquanto ele vem pelo Modo dev; a missão do ovo → portão rúnico vem depois.
// =============================================================
'use strict';

const Dragon = {
  riding: false, landing: false, built: false,
  pos: null, vel: null, yaw: 0, pitch: 0, roll: 0, flapT: 0, fireT: 0, hitT: 0,
  SPEED: 30, BOOST: 85, CLIMB: 14,

  owned() { return !!(Game.S && Game.S.dragon); },

  // ---------- modelo (frente = -Z, como a câmera) ----------
  build() {
    if (this.built) return; this.built = true;
    const scale = 'dragon';
    const body = mat('#2e8a62', { shininess: 30 }), dark = mat('#1d5a42'), belly = mat('#e0b860'), horn = mat('#efe2c0', { shininess: 60 });
    const memb = new THREE.MeshPhongMaterial({ color: '#b4472f', side: THREE.DoubleSide, flatShading: true, shininess: 10 });
    const eye = new THREE.MeshBasicMaterial({ color: '#ffcc33' });
    const G = this.g = new THREE.Group(); G.name = scale;
    const root = this.root = new THREE.Group(); G.add(root); // balanço do corpo (rolagem, inclinação, respiração)

    // corpo e barriga
    const torso = mesh(jitterGeo(new THREE.SphereGeometry(1, 9, 7), 0.06, 3), body); torso.scale.set(1.15, 1.0, 1.9); torso.position.y = 1.5; root.add(torso);
    const bel = mesh(new THREE.SphereGeometry(1, 8, 6), belly); bel.scale.set(0.9, 0.7, 1.6); bel.position.set(0, 1.18, 0.05); root.add(bel);
    // espinhos das costas
    for (let i = 0; i < 7; i++) { const s = mesh(new THREE.ConeGeometry(0.16, 0.5 - i * 0.03, 4), horn); s.position.set(0, 2.3 - i * 0.04, -1.3 + i * 0.55); s.rotation.x = -0.35; root.add(s); }
    // sela (mostra onde a gente senta)
    const saddle = mesh(new THREE.BoxGeometry(0.9, 0.25, 1.1), mat('#6b3e22')); saddle.position.set(0, 2.35, -0.35); root.add(saddle);
    this.seat = new THREE.Object3D(); this.seat.position.set(0, 1.95, -0.3); root.add(this.seat);

    // pescoço em 3 gomos e cabeça
    const neck = this.neck = new THREE.Group(); neck.position.set(0, 1.9, -1.6); root.add(neck);
    let at = neck; const segs = [];
    for (let i = 0; i < 3; i++) {
      // cada gomo vai para a frente e para cima (pescoço em S suave)
      const sg = new THREE.Group(); sg.position.set(0, i ? 0.42 : 0, i ? -0.5 : 0); at.add(sg);
      const c = mesh(new THREE.CylinderGeometry(0.3 - i * 0.04, 0.38 - i * 0.04, 0.78, 7), body); c.rotation.x = -0.87; c.position.set(0, 0.21, -0.25); sg.add(c);
      const sp = mesh(new THREE.ConeGeometry(0.09, 0.32, 4), horn); sp.position.set(0, 0.5, 0.0); sp.rotation.x = 0.5; sg.add(sp);
      segs.push(sg); at = sg;
    }
    this.neckSegs = segs;
    const head = this.head = new THREE.Group(); head.position.set(0, 0.5, -0.65); head.rotation.x = 0.15; head.scale.setScalar(1.35); at.add(head);
    const skull = mesh(jitterGeo(new THREE.BoxGeometry(0.75, 0.6, 0.85, 2, 2, 2), 0.05, 9), body); head.add(skull);
    const snout = mesh(new THREE.BoxGeometry(0.55, 0.38, 0.8), body); snout.position.set(0, -0.08, -0.72); head.add(snout);
    const jaw = this.jaw = mesh(new THREE.BoxGeometry(0.5, 0.14, 0.95), belly); jaw.position.set(0, -0.3, -0.55); head.add(jaw);
    for (const sd of [-1, 1]) {
      const h = mesh(new THREE.ConeGeometry(0.11, 0.9, 5), horn); h.position.set(sd * 0.25, 0.42, 0.35); h.rotation.set(0.95, 0, sd * -0.25); head.add(h);
      const h2 = mesh(new THREE.ConeGeometry(0.07, 0.45, 4), horn); h2.position.set(sd * 0.38, 0.12, 0.38); h2.rotation.set(1.2, 0, sd * -0.8); head.add(h2);
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), eye); e.position.set(sd * 0.3, 0.12, -0.25); head.add(e);
      const ns = mesh(new THREE.SphereGeometry(0.05, 4, 3), dark); ns.position.set(sd * 0.14, 0.08, -1.1); head.add(ns);
    }
    this.mouth = new THREE.Object3D(); this.mouth.position.set(0, -0.15, -1.25); head.add(this.mouth);

    // asas: braço + antebraço + 3 dedos, com a membrana esticada entre eles
    this.wings = [];
    for (const sd of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(sd * 0.75, 2.05, -0.75); root.add(w);
      const arm = mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.9, 5), dark); arm.rotation.z = sd * Math.PI / 2; arm.position.x = sd * 0.95; w.add(arm);
      const fore = new THREE.Group(); fore.position.x = sd * 1.9; w.add(fore);
      const fa = mesh(new THREE.CylinderGeometry(0.07, 0.11, 1.8, 5), dark); fa.rotation.z = sd * Math.PI / 2; fa.position.x = sd * 0.9; fore.add(fa);
      const claw = mesh(new THREE.ConeGeometry(0.07, 0.3, 4), horn); claw.position.set(sd * 1.85, 0.1, -0.1); claw.rotation.z = sd * -1.2; fore.add(claw);
      // pontas dos dedos (no espaço do antebraço) e membrana em leque
      const tips = [[sd * 1.8, 0, 0.2], [sd * 1.5, 0, 1.4], [sd * 0.9, 0, 2.2]];
      for (const t of tips) { const len = Math.hypot(t[0], t[2]); const f = mesh(new THREE.CylinderGeometry(0.03, 0.05, len, 4), dark); f.position.set(t[0] / 2, 0, t[2] / 2); f.rotation.set(0, 0, 0); f.lookAt(new V3(t[0], 0, t[2]).add(fore.position)); f.rotateX(Math.PI / 2); fore.add(f); }
      const pts = [[0, 0, 0], ...tips, [-sd * 1.9, 0, 1.3], [-sd * 1.9, 0, 0]]; // dedo → corpo, passando pelo braço
      const v = []; for (let i = 1; i < pts.length - 1; i++) v.push(...pts[0], ...pts[i], ...pts[i + 1]);
      const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); mg.computeVertexNormals();
      const mem = new THREE.Mesh(mg, memb); mem.castShadow = true; fore.add(mem);
      this.wings.push({ w, fore, sd });
    }

    // cauda em 7 gomos (cada um balança um pouco) com ponta de lança
    let tp = new THREE.Group(); tp.position.set(0, 1.5, 1.7); root.add(tp); this.tail = [];
    for (let i = 0; i < 7; i++) {
      const r0 = 0.45 - i * 0.055, seg = mesh(new THREE.CylinderGeometry(Math.max(0.06, r0 - 0.05), r0, 0.6, 6), body); seg.rotation.x = Math.PI / 2; seg.position.z = 0.3; tp.add(seg);
      if (i % 2 === 0) { const sp = mesh(new THREE.ConeGeometry(0.09, 0.3, 4), horn); sp.position.set(0, r0, 0.4); sp.rotation.x = -0.4; tp.add(sp); }
      const nx = new THREE.Group(); nx.position.z = 0.58; tp.add(nx); this.tail.push(nx); tp = nx;
    }
    const tip = mesh(new THREE.ConeGeometry(0.32, 0.7, 4), dark); tip.rotation.x = Math.PI / 2; tip.scale.set(1, 1, 0.3); tip.position.z = 0.3; tp.add(tip);

    // pernas (dobradas no voo)
    this.legs = [];
    for (const [x, z] of [[-0.6, -0.9], [0.6, -0.9], [-0.65, 1.0], [0.65, 1.0]]) {
      const l = new THREE.Group(); l.position.set(x, 1.0, z); root.add(l);
      const th = mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.9, 5), body); th.position.y = -0.4; l.add(th);
      const ft = mesh(new THREE.BoxGeometry(0.32, 0.14, 0.45), dark); ft.position.set(0, -0.88, -0.1); l.add(ft);
      this.legs.push(l);
    }
    G.scale.setScalar(1.1);
    Render.scene.add(G);

    // fogo: partículas somadas (um desenho só)
    const N = 160, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    this.fireP = Array.from({ length: N }, () => ({ t: 0, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0 }));
    this.firePts = new THREE.Points(geo, new THREE.PointsMaterial({ map: Render.getGlowTex(), size: 4.2, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.firePts.frustumCulled = false; Render.scene.add(this.firePts);
    G.visible = false;
  },

  // ---------- montar / descer ----------
  toggle() {
    if (!this.owned()) return;
    if (this.riding) { this.dismount(); return; }
    if (UI.open || Game.travel) return;
    if (Dungeon.active || World.ceilingAt(Game.P.x, Game.P.y) !== null) { UI.toast(tt("🐉 Aqui dentro o dragão não cabe. Ele só voa ao ar livre."), 'warn'); Snd.denied && Snd.denied(); return; }
    this.build();
    const P = Game.P;
    this.riding = true; this.landing = false;
    if (!this.pos) this.pos = new V3();
    const near = this.g.visible && Math.hypot(this.pos.x - P.x, this.pos.z - P.y) < 25;
    if (!near) { Game.fxBurst(P.x, P.y, '#e8d8b0', 24, 1.4); Snd.rumble && Snd.rumble(); } // chega voando (por enquanto num sopro de poeira)
    this.vel = new V3(0, 6, 0); this.yaw = P.yaw; this.pitch = 0; this.roll = 0;
    P.z = Math.max(P.z, 1.5); P.vz = 0; P.vx = P.vy = 0; Game.hook = null; Game.ladder = null;
    if (Game.S.riding) Game.S.riding = false;
    Game.target = null; Game.mouse.down = false;
    this.g.visible = true; Snd.forge && Snd.forge();
    UI.toast(tt("🐉 No dragão! W voa · mouse guia · Espaço sobe · C desce · Shift rápido · clique cospe fogo · R pousa"), 'level');
  },
  dismount(now) {
    if (!this.riding) return;
    const P = Game.P, alt = P.z;
    if (!now && alt > 3) { this.landing = true; UI.toast(tt("🐉 Pousando…")); return; }
    this.riding = false; this.landing = false; Render.player.visible = true;
    P.z = Math.min(P.z, 1.2); P.vz = 0;
    P.x += Math.cos(this.yaw) * 3; P.y -= Math.sin(this.yaw) * 3; // desce pelo lado da asa
    this.restYaw = this.yaw; Game.save();
  },

  // ---------- voo (chamado no lugar do andar normal) ----------
  fly(dt) {
    const P = Game.P, K = Game.keys, g0 = World.height(P.x, P.y);
    let fw = 0, st = 0, up = 0;
    if (!this.landing) {
      if (K['w'] || K['arrowup']) fw += 1; if (K['s'] || K['arrowdown']) fw -= 0.5;
      if (K['d'] || K['arrowright']) st += 1; if (K['a'] || K['arrowleft']) st -= 1;
      if (K[' ']) up += 1; if (K['c'] || K['control']) up -= 1;
    } else up = -1.6;
    const boost = K['shift'] && fw > 0 && !this.landing;
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw), cp = Math.cos(P.pitch), spi = Math.sin(P.pitch);
    const sp = boost ? this.BOOST : this.SPEED;
    // velocidade desejada: para onde a câmera olha (subir olhando para cima), mais o lado e o Espaço/C
    const want = new V3((-sy * cp * fw + cy * st * 0.4) * sp, (spi * fw) * sp + up * this.CLIMB, (-cy * cp * fw - sy * st * 0.4) * sp);
    if (!fw && !st && !up) want.y = Math.sin(Game.S.time * 1.6) * 0.6; // pairando, sobe e desce de leve
    const k = 1 - Math.exp(-dt * (boost ? 1.4 : 2.2));
    this.vel.lerp(want, k);
    // altura absoluta, sem entrar no chão nem no teto da mina
    let alt = g0 + P.z + this.vel.y * dt;
    P.x += this.vel.x * dt; P.y += this.vel.z * dt;
    // lugar fechado (Mina Velha): o dragão não entra, para na boca
    if (World.ceilingAt(P.x, P.y) !== null) { P.x -= this.vel.x * dt * 1.5; P.y -= this.vel.z * dt * 1.5; this.vel.x *= -0.2; this.vel.z *= -0.2; if (!this.roofT || Game.S.time - this.roofT > 4) { this.roofT = Game.S.time; UI.toast(tt("🐉 O dragão não cabe em lugar fechado. Pouse do lado de fora e entre a pé."), 'warn'); } }
    const g1 = World.height(P.x, P.y), ceil = World.ceilingAt(P.x, P.y);
    alt = Math.max(g1 + 0.4, Math.min(alt, 420));
    if (ceil !== null) alt = Math.min(alt, ceil - 3.2);
    P.z = alt - g1;
    // limite do mundo (só montanhas depois)
    const R = Math.hypot(P.x, P.y), LIM = 3120;
    if (R > LIM) { P.x *= LIM / R; P.y *= LIM / R; this.vel.multiplyScalar(0.5); if (!this.limT || Game.S.time - this.limT > 5) { this.limT = Game.S.time; UI.toast(tt("Daqui pra frente só há montanhas. Volte para o vale.")); } }
    if (this.landing && P.z <= 0.45) { this.dismount(true); UI.toast(tt("🐉 Pousou. R para montar de novo.")); }
    P.vz = 0; P.vx = P.vy = 0; P.moving = this.vel.length() > 1; P.sprint = boost; P.stamina = 1; P.tired = false;
    Game.target = null;
    // fogo: segurando o clique
    if (Game.mouse.down && !UI.open) this.breathe(dt);
  },

  // ---------- fogo ----------
  breathe(dt) {
    this.fireT += dt; this.hitT -= dt;
    if (!this.mouth) return;
    const m = this.mouth.getWorldPosition(this._mp || (this._mp = new V3()));
    const P = Game.P, dir = new V3(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch) - 0.25, -Math.cos(P.yaw) * Math.cos(P.pitch)).normalize();
    let n = Math.ceil(dt * 120);
    for (const p of this.fireP) { if (n <= 0) break; if (p.t > 0) continue; n--;
      p.t = 0.55 + Math.random() * 0.25; p.x = m.x; p.y = m.y; p.z = m.z;
      const s = 26 + Math.random() * 8; p.vx = dir.x * s + (Math.random() - 0.5) * 5 + this.vel.x; p.vy = dir.y * s + (Math.random() - 0.5) * 5 + this.vel.y; p.vz = dir.z * s + (Math.random() - 0.5) * 5 + this.vel.z; }
    if (Math.random() < dt * 6) Snd.swing && Snd.swing(true);
    // o fogo quebra as pedras que ele pega na frente (o que o seu martelo já quebraria)
    if (this.hitT <= 0) {
      this.hitT = 0.3;
      let best = null, bd = 1e9;
      for (const nd of World.nodes) {
        if (nd.dead) continue;
        const nh = World.height(nd.x, nd.y) + 0.8, dx = nd.x - m.x, dy = nh - m.y, dz = nd.y - m.z, d = Math.hypot(dx, dy, dz);
        if (d > 24 || d < 0.5) continue;
        if ((dx * dir.x + dy * dir.y + dz * dir.z) / d < 0.86) continue; // dentro do cone do fogo
        if (d < bd) { bd = d; best = nd; }
      }
      if (best && !(best.res.sealed) && !(best.res.wild) && !levelRule(best.res.ideal, Game.S.hammer, best.res).blocked) Game.hit(best, 1.5);
    }
  },

  // ---------- animação e câmera (chamado pelo Render a cada quadro) ----------
  frame(dt, cam) {
    if ((!this.owned() && !this.riding) || Dungeon.active) { if (this.g) this.g.visible = false; return; } // dentro da masmorra ele some
    this.build();
    const P = Game.P, t = Render.t;
    if (!this.pos) { // primeira vez: pousado ao lado da fonte
      this.pos = new V3(5, World.height(5, 7), 7); this.yaw = 2.4; this.g.visible = true;
    }
    if (this.riding) {
      const gh = World.height(P.x, P.y);
      this.pos.set(P.x, gh + P.z - 1.9, P.y);
      // vira para onde voa (suave) e inclina nas curvas
      const hv = Math.hypot(this.vel.x, this.vel.z);
      const wantYaw = hv > 2 ? Math.atan2(-this.vel.x, -this.vel.z) : P.yaw;
      let dy = wantYaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, dt * 4);
      this.roll += (-dy * 1.6 - this.roll) * Math.min(1, dt * 3); this.roll = Math.max(-0.7, Math.min(0.7, this.roll));
      const wantPitch = hv > 2 ? Math.atan2(this.vel.y, hv) * 0.8 : 0;
      this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * 3);
    } else {
      this.pitch *= 0.9; this.roll *= 0.9;
      if (this.restYaw !== undefined) this.yaw = this.restYaw;
      // pousado: fica onde desceu; some se a gente for para muito longe (volta com R)
      this.pos.y = World.height(this.pos.x, this.pos.z);
      if (Math.hypot(this.pos.x - P.x, this.pos.z - P.y) > 250) this.g.visible = false; else this.g.visible = true;
    }
    const g = this.g; g.position.copy(this.pos); g.rotation.set(0, this.yaw, 0);
    const root = this.root; root.rotation.set(-this.pitch, 0, this.roll);
    // asas: batem mais rápido subindo e acelerando; planam descendo
    const airborne = this.riding && P.z > 0.6, climbing = this.riding && this.vel.y > 2, gliding = this.riding && this.vel.y < -3;
    const rate = !airborne ? 0 : climbing ? 9 : (Game.keys['shift'] ? 8 : 5.5);
    this.flapT += dt * rate;
    const flap = airborne ? (gliding ? 0.15 + Math.sin(this.flapT * 0.5) * 0.05 : Math.sin(this.flapT) * 0.75) : 0;
    for (const W of this.wings) {
      if (airborne) { W.w.rotation.set(0, 0, W.sd * (flap + 0.1)); W.fore.rotation.set(0, 0, W.sd * (-Math.max(0, -flap) * 0.6)); W.w.rotation.y = 0; }
      else { W.w.rotation.set(0, -W.sd * 1.15, -W.sd * 0.3); W.fore.rotation.set(0, -W.sd * 2.5, 0); } // dobradas para trás, junto do corpo
    }
    if (airborne && flap > 0.7 && !this._flapped) { this._flapped = true; Snd.swing && Snd.swing(false); } else if (flap < 0) this._flapped = false;
    // cauda e pescoço balançam; respiração parado
    this.tail.forEach((s, i) => { s.rotation.y = Math.sin(t * 2 + i * 0.6) * (0.08 + i * 0.012) - this.roll * 0.15; s.rotation.x = airborne ? 0.02 : 0.08 + Math.sin(t * 1.2 + i) * 0.02; });
    this.neckSegs.forEach((s, i) => { s.rotation.x = (airborne ? 0.1 : Math.sin(t * 1.1 + i * 0.5) * 0.06) - (i === 2 ? 0.05 : 0); s.rotation.y = airborne ? -this.roll * 0.12 : Math.sin(t * 0.7) * 0.05; });
    root.position.y = airborne ? Math.sin(this.flapT) * 0.12 : Math.sin(t * 1.5) * 0.03;
    this.jaw.rotation.x = Game.mouse.down && this.riding ? 0.45 : 0.04;
    for (const l of this.legs) l.rotation.x = airborne ? 1.1 : 0;
    // fogo
    if (this.firePts) {
      const pos = this.firePts.geometry.attributes.position, col = this.firePts.geometry.attributes.color;
      this.fireP.forEach((p, i) => {
        if (p.t > 0) { p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy += 2 * dt; const a = Math.max(0, p.t / 0.8); pos.setXYZ(i, p.x, p.y, p.z); col.setXYZ(i, 1 * a + 0.1, 0.55 * a * a + 0.05, 0.12 * a * a); }
        else pos.setXYZ(i, 0, -9999, 0);
      });
      pos.needsUpdate = true; col.needsUpdate = true;
    }
    // câmera de perseguição: atrás e acima do dragão, olhando para onde a gente mira
    if (this.riding && cam) {
      const room = World.ceilingAt(this.pos.x, this.pos.z), tight = room !== null; // dentro da mina: câmera mais perto
      const back = tight ? 6.5 : Game.keys['shift'] ? 13 : 11, upH = tight ? 1.2 : 4.6;
      Render.player.visible = !tight; // na mina a câmera fica baixa: esconde o cavaleiro para ver o caminho
      const fx = Math.sin(P.yaw) * Math.cos(P.pitch), fz = Math.cos(P.yaw) * Math.cos(P.pitch), fy = -Math.sin(P.pitch);
      const cx = this.pos.x + fx * back, cz = this.pos.z + fz * back;
      let cyy = this.pos.y + 2.6 + upH + fy * back;
      cyy = Math.max(cyy, World.height(cx, cz) + 0.8);
      const ceil = World.ceilingAt(cx, cz); if (ceil !== null) cyy = Math.min(cyy, ceil - 0.6);
      cam.position.set(cx, cyy, cz);
    }
  },

  // onde a gente senta (o Render põe o personagem aqui)
  seatPos(out) { return this.seat.getWorldPosition(out); },
};
