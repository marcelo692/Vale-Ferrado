// =============================================================
// Vale Ferrado — Masmorra Rúnica (atrás da porta da Zona 7)
// Um "prédio" de 4 andares fechados, só de descida: em cada andar há um chão rachado;
// fique em cima dele e bata uma vez com a picareta para cair no andar de baixo.
// Os minérios mudam a cada andar (níveis 61 a 70). No 4º andar: a Bigorna Rúnica (forja ali mesmo)
// e dois portais, um para a vila e outro para a porta rúnica.
// Dentro não tem dragão nem voo. Só se sai pelo portal (não dá para subir nem usar o H).
// =============================================================
'use strict';

const DUN_SUB = { wild: true, dun: true, nodes: [], spawnPts: [], harvest: 0 };
const DUN = {
  half: 19, floorH: 18, room: 11, base: -700, floors: 4,
  ores: [[61, 62, 63], [63, 64, 65], [66, 67, 68], [68, 69, 70]], // níveis dos minérios de cada andar
};

const Dungeon = {
  active: false, floor: 0, hole: null, portals: [], anvil: null, g: null, fx: [],

  center() { if (!this._c) this._c = Z7.at(Z7.WALL_A + 150, 0); return this._c; },
  inside(x, y) { const c = this.center(); return Math.abs(x - c.x) < DUN.half + 4 && Math.abs(y - c.y) < DUN.half + 4; },
  floorY(k = this.floor) { return DUN.base - k * DUN.floorH; },
  ceilY(k = this.floor) { return this.floorY(k) + DUN.room; },
  doorPt() { return Z7.at(Z7.WALL_A - 2.5, 0); },
  exitPt() { return Z7.at(Z7.WALL_A - 16, 0); },

  // o chão e o teto da masmorra entram no lugar do terreno enquanto a gente está lá dentro
  init() {
    const H = World.height.bind(World), C = World.ceilingAt.bind(World);
    World.height = (x, y) => (this.active && this.inside(x, y)) ? this.floorY() : H(x, y);
    World.ceilingAt = (x, y) => (this.active && this.inside(x, y)) ? this.ceilY() : C(x, y);
    // save feito lá dentro: volta na frente da porta
    const P = Game.P; if (this.inside(P.x, P.y)) { const e = this.exitPt(); P.x = e.x; P.y = e.y; P.z = 0; }
  },

  // ---------- entrar / sair ----------
  update(dt) {
    const S = Game.S, P = Game.P;
    if (!this.active) {
      if (S.seal && !Game.travel && !UI.open && !Cine.busy()) { const d = this.doorPt(); if (Math.hypot(P.x - d.x, P.y - d.y) < 4.5) this.enter(); }
      return;
    }
    // paredes: o andar é uma sala quadrada fechada
    const c = this.center(), m = DUN.half - 0.8;
    P.x = Math.max(c.x - m, Math.min(c.x + m, P.x)); P.y = Math.max(c.y - m, Math.min(c.y + m, P.y));
    // portal do último andar: encostou, saiu
    for (const q of this.portals) if (Math.hypot(P.x - q.x, P.y - q.y) < 1.4 && P.z < 1.5) { this.leave(q.dest); break; }
    this.animate(dt);
  },
  enter() {
    const P = Game.P, S = Game.S;
    if (Dragon.riding) Dragon.dismount(true);
    this.active = true; this.floor = 0; S.dunVisited = 1;
    this.fade();
    this.buildFloor();
    const c = this.center(); P.x = c.x - DUN.half + 3; P.y = c.y - DUN.half + 3; P.z = 0; P.vz = 0; P.vx = P.vy = 0;
    P.yaw = Math.atan2(-(c.x - P.x), -(c.y - P.y)); P.pitch = -0.05;
    Game.hook = null; Game.ladder = null; Game.target = null;
    Snd.rumble && Snd.rumble();
    UI.banner(tt("Masmorra Rúnica"), tt("Andar 1 de 4 · aqui só se desce: ache o chão rachado e bata nele"), 3600);
    Game.save();
  },
  leave(dest = 'porta') {
    const P = Game.P;
    this.fade(); this.clear();
    this.active = false; this.portals = []; this.anvil = null; this.hole = null;
    if (dest === 'vila') { // na praça, de frente para o Seu Bento
      const f = NPCS.find(v => v.id === 'ferreiro'), a = f.ang * Math.PI / 180;
      P.x = Math.cos(a) * 8.5; P.y = Math.sin(a) * 8.5; P.yaw = Math.atan2(-(f.x - P.x), -(f.y - P.y));
      UI.toast(tt("✦ O portal te trouxe para a vila. Para voltar à masmorra, é a porta rúnica da Zona 7."), 'level');
    } else {
      const e = this.exitPt(), d = this.doorPt(); P.x = e.x; P.y = e.y; P.yaw = Math.atan2(-(e.x - d.x), -(e.y - d.y));
      UI.toast(tt("✦ O portal te trouxe de volta para a Zona 7. A porta rúnica continua aberta."), 'level');
    }
    P.z = 0; P.vz = 0; P.vx = P.vy = 0; P.pitch = 0;
    Render.nearAt = null; // o chão de fora volta a ser desenhado
    Snd.levelUp && Snd.levelUp();
    Game.S.dunClears = (Game.S.dunClears || 0) + 1; Game.save();
  },
  fade() { let el = document.getElementById('dunfade'); if (!el) { el = document.createElement('div'); el.id = 'dunfade'; document.body.appendChild(el); } el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); },

  // ---------- chão rachado ----------
  onHole() { if (!this.active || !this.hole) return false; const P = Game.P; return Math.hypot(P.x - this.hole.x, P.y - this.hole.y) < this.hole.r && Game.onGround(); },
  nearHole() { if (!this.active || !this.hole) return false; const P = Game.P; return Math.hypot(P.x - this.hole.x, P.y - this.hole.y) < this.hole.r + 4; },
  nearPortal() { if (!this.active) return null; const P = Game.P; return this.portals.find(q => Math.hypot(P.x - q.x, P.y - q.y) < 3.2) || null; },
  nearAnvil() { if (!this.active || !this.anvil) return false; const P = Game.P; return Math.hypot(P.x - this.anvil.x, P.y - this.anvil.y) < 3.4; },
  // Bigorna Rúnica: guarda a mochila no depósito (sem vender) e abre a forja do Seu Bento
  useAnvil() {
    const S = Game.S; let n = 0;
    for (const [id, q] of Object.entries(S.bag)) { S.stock[id] = (S.stock[id] || 0) + q; n += q; }
    S.bag = {};
    if (n) UI.toast(tt("⚒ A bigorna guardou {0} itens da mochila no depósito.", n));
    Snd.forge && Snd.forge(); UI.openNpc('ferreiro');
  },
  // chamado no clique: em cima da rachadura, um golpe quebra o chão
  tryHole() {
    if (!this.onHole()) return false;
    const P = Game.P, h = this.hole;
    Game.fxBurst(h.x, h.y, '#ffd34d', 40, 1.8); Game.fxBurst(h.x, h.y, '#6a5a7a', 50, 2.2);
    Snd.breakNode && Snd.breakNode('crystal', 3); Game.shake = 1;
    const prev = { x: h.x, y: h.y };
    this.floor++;
    this.buildFloor(prev);
    P.z += DUN.floorH; P.vz = 0; // cai de verdade até o chão de baixo
    const last = this.floor === DUN.floors - 1;
    setTimeout(() => UI.banner(tt("Andar {0} de {1}", this.floor + 1, DUN.floors), last ? tt("Último andar: forje na Bigorna Rúnica e saia pelo portal da vila ou da porta") : tt("Minérios novos. Ache o próximo chão rachado para descer"), 3200), 700);
    return true;
  },

  // ---------- andar: sala, enfeites e minérios ----------
  clear() {
    for (const n of DUN_SUB.nodes.slice()) { n.dead = true; const i = World.nodes.indexOf(n); if (i >= 0) World.nodes.splice(i, 1); }
    DUN_SUB.nodes.length = 0;
    if (Game.target && Game.target.sub === DUN_SUB) Game.target = null;
    if (this.g) { Render.scene.remove(this.g); this.g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); this.g = null; }
    this.fx = [];
  },
  buildFloor(fromHole) {
    this.clear();
    const k = this.floor, c = this.center(), r = rng(911 + k * 37), fy = this.floorY(k), cy = this.ceilY(k), H = DUN.half;
    const last = k === DUN.floors - 1;
    // onde fica o chão rachado (ou o portal, no último andar): longe da entrada e de onde a gente caiu
    const pick = (avoid) => { for (let t = 0; t < 50; t++) { const x = c.x + (r() - 0.5) * (H * 2 - 10), y = c.y + (r() - 0.5) * (H * 2 - 10); if (avoid.every(a => Math.hypot(x - a.x, y - a.y) > a.d)) return { x, y }; } return { x: c.x, y: c.y }; };
    const start = fromHole || { x: c.x - H + 3, y: c.y - H + 3 };
    const spot = pick([{ x: start.x, y: start.y, d: 14 }]);
    this.hole = last ? null : { x: spot.x, y: spot.y, r: 2.4 };
    // último andar: dois portais lado a lado (vila e porta rúnica) e a bigorna no meio
    this.portals = []; this.anvil = null;
    if (last) {
      const ax = c.x - spot.x, ay = c.y - spot.y, al = Math.hypot(ax, ay) || 1, sx = -ay / al, sy = ax / al; // lado (perpendicular ao centro)
      const cl = v => Math.max(-H + 4, Math.min(H - 4, v));
      this.portals.push({ x: c.x + cl(spot.x - c.x + sx * 6), y: c.y + cl(spot.y - c.y + sy * 6), dest: 'vila' });
      this.portals.push({ x: c.x + cl(spot.x - c.x - sx * 6), y: c.y + cl(spot.y - c.y - sy * 6), dest: 'porta' });
      this.anvil = { x: spot.x + ax / al * 2.5, y: spot.y + ay / al * 2.5 };
    }

    const G = this.g = new THREE.Group(); Render.scene.add(G);
    const stoneTex = Render.z7StoneTex().clone(); stoneTex.needsUpdate = true; stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping; stoneTex.repeat.set(6, 6);
    const tones = ['#7a7088', '#6a7a88', '#887868', '#6a5a78'];
    const stone = new THREE.MeshLambertMaterial({ map: stoneTex, color: tones[k], flatShading: true });
    const dark = mat('#2a2430');
    // chão
    const fl = mesh(new THREE.BoxGeometry(H * 2 + 2, 1, H * 2 + 2), stone); fl.position.set(c.x, fy - 0.5, c.y); G.add(fl);
    // paredes
    for (const [dx, dy, w, d] of [[-1, 0, 1.5, H * 2 + 3], [1, 0, 1.5, H * 2 + 3], [0, -1, H * 2 + 3, 1.5], [0, 1, H * 2 + 3, 1.5]]) {
      const wl = mesh(new THREE.BoxGeometry(w, DUN.room + 2, d), stone); wl.position.set(c.x + dx * (H + 0.75), fy + DUN.room / 2, c.y + dy * (H + 0.75)); G.add(wl);
    }
    // teto (com o buraco por onde a gente caiu)
    const cw = H * 2 + 3;
    if (fromHole) {
      const hx = fromHole.x - c.x, hy = fromHole.y - c.y, hs = 3.2, x0 = -cw / 2, x1 = cw / 2;
      const boxes = [[x0, hx - hs, x0, x1], [hx + hs, x1, x0, x1], [hx - hs, hx + hs, x0, hy - hs], [hx - hs, hx + hs, hy + hs, x1]];
      for (const [ax, bx, ay, by] of boxes) { if (bx - ax < 0.1 || by - ay < 0.1) continue; const b = mesh(new THREE.BoxGeometry(bx - ax, 1.2, by - ay), stone); b.position.set(c.x + (ax + bx) / 2, cy + 0.6, c.y + (ay + by) / 2); G.add(b); }
    } else { const b = mesh(new THREE.BoxGeometry(cw, 1.2, cw), stone); b.position.set(c.x, cy + 0.6, c.y); G.add(b); }
    // estalactites no teto e estalagmites no chão (enfeite)
    for (let i = 0; i < 70; i++) {
      const x = c.x + (r() - 0.5) * H * 2, y = c.y + (r() - 0.5) * H * 2, h = 1 + r() * 3.6, rad = 0.25 + r() * 0.45;
      if (fromHole && Math.hypot(x - fromHole.x, y - fromHole.y) < 4) continue;
      const st = mesh(jitterGeo(new THREE.ConeGeometry(rad, h, 6, 2), rad * 0.2, i), dark); st.rotation.x = Math.PI; st.position.set(x, cy - h / 2, y); G.add(st);
    }
    for (let i = 0; i < 36; i++) {
      const sd = Math.floor(r() * 4), t = (r() - 0.5) * H * 2, x = c.x + (sd === 0 ? -H + 1 : sd === 1 ? H - 1 : t), y = c.y + (sd === 2 ? -H + 1 : sd === 3 ? H - 1 : t), h = 0.8 + r() * 2.4, rad = 0.3 + r() * 0.5;
      const st = mesh(jitterGeo(new THREE.ConeGeometry(rad, h, 6, 2), rad * 0.2, i + 99), dark); st.position.set(x, fy + h / 2, y); G.add(st);
    }
    // cristais nas paredes, da cor dos minérios do andar
    const oreRes = DUN.ores[k].map(L => RESOURCES.find(o => o.dun && o.ideal === L));
    for (let i = 0; i < 26; i++) {
      const o = oreRes[i % oreRes.length], sd = i % 4, t = (r() - 0.5) * H * 1.8, x = c.x + (sd === 0 ? -H : sd === 1 ? H : t), y = c.y + (sd === 2 ? -H : sd === 3 ? H : t);
      const cr = mesh(new THREE.OctahedronGeometry(0.35 + r() * 0.4, 0), new THREE.MeshBasicMaterial({ color: o.c2 }), false); cr.scale.y = 1.8; cr.position.set(x, fy + 1.5 + r() * 6, y); cr.rotation.set(r(), r() * 3, r()); G.add(cr);
    }
    Render.mergeStatic(G);
    // braseiros nos cantos (brilho falso, sem luz real)
    const glowM = col => new THREE.SpriteMaterial({ map: Render.getGlowTex(), color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = c.x + sx * (H - 2), y = c.y + sy * (H - 2);
      const b = mesh(new THREE.CylinderGeometry(0.7, 0.45, 1, 8), dark); b.position.set(x, fy + 0.5, y); G.add(b);
      const f = new THREE.Sprite(glowM('#ff9a3a')); f.scale.setScalar(4); f.position.set(x, fy + 1.6, y); G.add(f); this.fx.push({ t: 'fire', o: f, ph: r() * 6 });
    }
    // chão rachado: rachaduras douradas pulsando + poeira subindo
    if (this.hole) {
      const tex = canvasTex(256, 256, (g, w) => {
        const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, 'rgba(20,10,10,0.95)'); gr.addColorStop(0.7, 'rgba(40,25,30,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, w);
        g.strokeStyle = '#ffd34d'; g.lineWidth = 5; g.shadowColor = '#ff9a2a'; g.shadowBlur = 14; g.lineCap = 'round';
        const rr = rng(5 + k); for (let i = 0; i < 9; i++) { let a = i / 9 * 6.28 + rr() * 0.4, x = 128, y = 128; g.beginPath(); g.moveTo(x, y); for (let s = 0; s < 5; s++) { a += (rr() - 0.5) * 0.8; x += Math.cos(a) * 22; y += Math.sin(a) * 22; g.lineTo(x, y); } g.stroke(); }
      });
      const hm = new THREE.Mesh(new THREE.CircleGeometry(this.hole.r * 1.25, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
      hm.position.set(this.hole.x, fy + 0.04, this.hole.y); G.add(hm); this.fx.push({ t: 'hole', o: hm });
      const gl = new THREE.Sprite(glowM('#ffb84a')); gl.scale.setScalar(7); gl.position.set(this.hole.x, fy + 0.6, this.hole.y); G.add(gl); this.fx.push({ t: 'glow', o: gl });
      this.addDust(this.hole.x, this.hole.y, fy, '#ffd38a', 0.9, 40);
      const lab = labelSprite(tt("Chão rachado"), tt("fique em cima e bata uma vez"), '#ffd34d', 1); lab.position.set(this.hole.x, fy + 3.2, this.hole.y); G.add(lab);
    }
    // portais de saída (último andar): anel em pé, disco girando e partículas subindo
    for (const p of this.portals) {
      const vila = p.dest === 'vila', col = vila ? '#ffcf5a' : '#b07aff', col2 = vila ? '#fff1b0' : '#c08aff';
      const pg = new THREE.Group(); pg.position.set(p.x, fy, p.y); G.add(pg);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.22, 8, 40), new THREE.MeshBasicMaterial({ color: vila ? '#ffd34d' : '#d8b0ff' })); ring.position.y = 2.5; pg.add(ring);
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.08, 6, 40), new THREE.MeshBasicMaterial({ color: col2 })); ring2.position.y = 2.5; pg.add(ring2);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(2, 40), new THREE.MeshBasicMaterial({ map: Render.getGlowTex(), color: col, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); disc.position.y = 2.5; pg.add(disc);
      const base = mesh(new THREE.CylinderGeometry(2.6, 2.9, 0.4, 16), dark); base.position.y = 0.2; pg.add(base);
      const gl = new THREE.Sprite(glowM(col)); gl.scale.setScalar(10); gl.position.y = 2.5; pg.add(gl);
      this.fx.push({ t: 'portal', o: pg, ring, ring2, disc, gl });
      this.addDust(p.x, p.y, fy, vila ? '#ffe2a0' : '#d8b0ff', 2.2, 70);
      const lab = vila ? labelSprite(tt("🏠 Portal da vila"), tt("leva para a praça, perto do Seu Bento"), '#ffe27a', 1.1) : labelSprite(tt("ᚱ Portal da porta rúnica"), tt("leva para a entrada da masmorra"), '#e0c0ff', 1.1);
      lab.position.set(p.x, fy + 5.6, p.y); G.add(lab);
    }
    // Bigorna Rúnica: forja as picaretas aqui mesmo
    if (this.anvil) {
      const a = this.anvil, ag = new THREE.Group(); ag.position.set(a.x, fy, a.y); ag.rotation.y = Math.atan2(c.x - a.x, c.y - a.y); G.add(ag);
      const iron = mat('#3a3a44', { shininess: 80, specular: '#9aa0b0' }), rune = new THREE.MeshBasicMaterial({ color: '#ffd34d' });
      const blk = mesh(jitterGeo(new THREE.BoxGeometry(1.4, 0.9, 1.0), 0.05, 4), dark); blk.position.y = 0.45; ag.add(blk);
      const waist = mesh(new THREE.BoxGeometry(0.5, 0.35, 0.45), iron); waist.position.y = 1.07; ag.add(waist);
      const top = mesh(new THREE.BoxGeometry(1.3, 0.3, 0.55), iron); top.position.y = 1.38; ag.add(top);
      const horn = mesh(new THREE.ConeGeometry(0.27, 0.8, 6), iron); horn.rotation.z = Math.PI / 2; horn.position.set(-1.0, 1.38, 0); ag.add(horn);
      for (const sx of [-0.4, 0, 0.4]) { const r1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.02), rune); r1.position.set(sx, 0.5, 0.51); ag.add(r1); }
      const em = new THREE.Sprite(glowM('#ff8a2a')); em.scale.setScalar(3.4); em.position.y = 1.6; ag.add(em); this.fx.push({ t: 'fire', o: em, ph: 1 });
      const lab = labelSprite(tt("⚒ Bigorna Rúnica"), tt("[E] guardar a mochila e forjar"), '#ffb347', 1); lab.position.set(a.x, fy + 3.4, a.y); G.add(lab);
    }
    // minérios do andar
    const avoid = [{ x: start.x, y: start.y, d: 4 }, { x: spot.x, y: spot.y, d: 5 }, ...this.portals.map(q => ({ x: q.x, y: q.y, d: 4.5 }))];
    for (let i = 0; i < 16; i++) {
      let x, y, ok = false;
      for (let t = 0; t < 40 && !ok; t++) { x = c.x + (r() - 0.5) * (H * 2 - 5); y = c.y + (r() - 0.5) * (H * 2 - 5); ok = avoid.every(a => Math.hypot(x - a.x, y - a.y) > a.d); }
      if (!ok) continue;
      avoid.push({ x, y, d: 3.2 });
      const res = oreRes[Math.floor(r() * oreRes.length)], size = 0.6 + r() * 0.9, hp = res.hard * size;
      const n = { x, y, pt: { used: true }, sub: DUN_SUB, res, size, rare: 1, hp, maxHp: hp, r: 0.9 + size * 0.7, seed: 1 + r() * 50, hitT: 0, born: Game.S.time };
      DUN_SUB.nodes.push(n); World.nodes.push(n);
    }
  },
  // poeira/brilho subindo (um desenho só por efeito)
  addDust(x, y, fy, col, rad, N) {
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(N * 3), seeds = [];
    for (let i = 0; i < N; i++) { seeds.push(Math.random() * 6.28, Math.random() * rad, Math.random() * 3); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: Render.getGlowTex(), color: col, size: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    pts.frustumCulled = false; this.g.add(pts);
    this.fx.push({ t: 'dust', o: pts, x, y, fy, seeds, N });
  },
  animate(dt) {
    const t = Render.t;
    for (const f of this.fx) {
      if (f.t === 'fire') f.o.material.opacity = 0.7 + Math.sin(t * 9 + f.ph) * 0.15 + Math.random() * 0.1;
      else if (f.t === 'glow') f.o.material.opacity = 0.35 + Math.sin(t * 3) * 0.2;
      else if (f.t === 'hole') f.o.material.opacity = 0.8 + Math.sin(t * 3) * 0.2;
      else if (f.t === 'portal') { f.ring.rotation.z = t * 0.6; f.ring2.rotation.z = -t * 0.9; f.disc.rotation.z = t * 1.5; f.disc.material.opacity = 0.6 + Math.sin(t * 4) * 0.2; f.gl.material.opacity = 0.5 + Math.sin(t * 2.5) * 0.2; f.o.rotation.y = Math.atan2(Game.P.x - f.o.position.x, Game.P.y - f.o.position.z); }
      else if (f.t === 'dust') {
        const pos = f.o.geometry.attributes.position;
        for (let i = 0; i < f.N; i++) { const a = f.seeds[i * 3], rr = f.seeds[i * 3 + 1], h = (f.seeds[i * 3 + 2] + t * 0.8) % 3; pos.setXYZ(i, f.x + Math.cos(a + t * 0.3) * rr, f.fy + 0.2 + h * 1.6, f.y + Math.sin(a + t * 0.3) * rr); }
        pos.needsUpdate = true;
      }
    }
  },
};
