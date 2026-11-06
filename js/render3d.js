// =============================================================
// Vale Ferrado — mundo 3D em primeira pessoa (Three.js, estilo low-poly 128 bits)
// =============================================================
'use strict';

const V3 = THREE.Vector3;
const EYE = 1.65;
const FP_FWD = 0.3, FP_DROP = 0.24; // na primeira pessoa a câmera fica um pouco à frente do peito, para ver o corpo ao olhar para baixo

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  t.anisotropy = 4;
  return t;
}
function labelSprite(text, sub, color = '#f5e6c8', scale = 1) {
  const tex = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = 'rgba(20,14,8,0.72)'; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 18); g.fill();
    g.textAlign = 'center'; g.fillStyle = color; g.font = '700 46px Georgia, serif'; g.fillText(text, w / 2, sub ? 62 : 80);
    if (sub) { g.font = '30px system-ui, sans-serif'; g.fillStyle = '#d8c8a8'; g.fillText(sub, w / 2, 104); }
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: true }));
  sp.scale.set(4 * scale, 1 * scale, 1);
  return sp;
}
function jitterGeo(geo, amt, seed) {
  const r = rng(seed), pos = geo.attributes.position, map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = [pos.getX(i), pos.getY(i), pos.getZ(i)].map(v => String(Math.round(v * 1000) || 0)).join(',');
    if (!map.has(key)) map.set(key, [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]);
    const j = map.get(key);
    pos.setXYZ(i, pos.getX(i) + j[0], pos.getY(i) + j[1], pos.getZ(i) + j[2]);
  }
  geo.computeVertexNormals();
  return geo;
}
const MAT_CACHE = {};
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!MAT_CACHE[key]) MAT_CACHE[key] = new THREE.MeshPhongMaterial(Object.assign({ color, flatShading: true, shininess: 8 }, opts));
  return MAT_CACHE[key];
}
function mesh(geo, m, shadow = true) { const o = new THREE.Mesh(geo, m); o.castShadow = shadow; o.receiveShadow = true; return o; }

const Render = {
  view: 'fp', t: 0, nodeMeshes: new Map(), sig: {},

  init() {
    const cv = document.getElementById('game');
    this.r = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    this.r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.r.setSize(innerWidth, innerHeight);
    this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.r.outputEncoding = THREE.sRGBEncoding;
    this.r.autoClear = false;
    this.scene = new THREE.Scene();
    this.horizon = new THREE.Color('#cfd9d6');
    this.scene.fog = new THREE.Fog(this.horizon, 60, 420);
    this.cam = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.08, 9000);
    this.cam.rotation.order = 'YXZ';
    addEventListener('resize', () => { this.r.setSize(innerWidth, innerHeight); this.cam.aspect = this.vmCam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix(); this.vmCam.updateProjectionMatrix(); });

    // luz
    this.hemi = new THREE.HemisphereLight('#cfe3ff', '#5a4a32', 0.75); this.scene.add(this.hemi);
    this.sunDir = new V3(0.45, 0.62, 0.3).normalize();
    this.sun = new THREE.DirectionalLight('#fff1d6', 1.05);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = sc.bottom = -45; sc.right = sc.top = 45; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.grassTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { const v = 120 + Math.random() * 120 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); }
    }, 1);

    this.buildSky();
    this.buildGround();
    this.buildCity();
    this.buildRoadsAndRiver();
    this.buildObstacles();
    this.buildPitWalls();
    this.buildClimbFx();
    this.buildDecor();
    this.buildGrass();
    this.buildFx();
    this.buildHitFx();
    this.buildViewModel();
    this.player = new THREE.Group(); this.scene.add(this.player);
    this.buildPlayerLights();
    let q = 'alto'; try { q = localStorage.getItem('valeferrado_gfx') || 'alto'; } catch (e) {}
    this.setQuality(q, true);
    this.mini = document.getElementById('minimap'); this.mctx = this.mini.getContext('2d');
    this.floatsEl = document.getElementById('floats');
    this.ray = new THREE.Raycaster();
  },

  buildPlayerLights() {
    this.spot = new THREE.SpotLight('#fff2d8', 0, 40, 0.5, 0.45, 1);
    this.scene.add(this.spot, this.spot.target);
    this.drones = [];
    for (let i = 0; i < 3; i++) {
      const L = new THREE.PointLight('#e2ecff', 0, 60, 1);
      const d = this.makeDrone(); const rotors = d.children.filter(o => o.geometry && o.geometry.type === 'CircleGeometry');
      d.add(L); L.position.y = -0.2;
      d.visible = false; this.scene.add(d);
      this.drones.push({ g: d, light: L, rotors });
    }
    // postes de luz na praça
    this.lampMat = new THREE.MeshBasicMaterial({ color: '#555' });
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + Math.PI / 8, x = Math.cos(a) * 17.5, z = Math.sin(a) * 17.5;
      const post = mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.6, 6), mat('#2a2a2e')); post.position.set(x, 1.8, z); this.city.add(post);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), this.lampMat); bulb.position.set(x, 3.7, z); this.city.add(bulb);
    }
    this.cityLight = new THREE.PointLight('#ffcf8a', 0, 55, 1); this.cityLight.position.set(0, 7, 0); this.scene.add(this.cityLight);
  },

  // ---------- qualidade do gráfico ----------
  quality: 'alto',
  setQuality(q, silent) {
    this.quality = q === 'leve' ? 'leve' : 'alto';
    const leve = this.quality === 'leve';
    this.r.setPixelRatio(leve ? Math.min(devicePixelRatio, 0.85) : Math.min(devicePixelRatio, 2)); this.r.setSize(innerWidth, innerHeight);
    this.sun.castShadow = !leve;
    if (this.grass) this.grass.visible = !leve;
    this.scene.fog.far = leve ? 300 : 420;
    this.fxScale = leve ? 0.45 : 1;
    try { localStorage.setItem('valeferrado_gfx', this.quality); } catch (e) {}
    const sel = document.getElementById('gfx'); if (sel) sel.value = this.quality;
    if (!silent) UI.toast(leve ? tt("Gráfico leve: sem sombras e grama, menos partículas.") : tt("Gráfico bonito ligado."));
  },
  // se o jogo ficar lento, sugere o gráfico leve (uma vez)
  watchFps(dt) {
    if (this.quality === 'leve' || this.fpsTold || !Game.locked || !Game.locked()) return;
    this.fpsAcc = (this.fpsAcc || 0) + dt; this.fpsN = (this.fpsN || 0) + 1;
    if (this.fpsAcc < 6) return;
    const fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0;
    this.fpsLow = fps < 28 ? (this.fpsLow || 0) + 1 : 0;
    if (this.fpsLow >= 2) { this.fpsTold = true; UI.toast(tt("O jogo está lento neste computador. Aperte Esc e escolha Gráfico: Leve."), 'warn'); }
  },
  // ---------- aviso de altura nos obstáculos (atalhos de pulo) ----------
  updateObstacleHint() {
    const P = Game.P;
    let best = null, bd = 18;
    for (const o of World.obstacles) {
      const l = World.local(o.R, P.x, P.y);
      const dd = Math.abs(l.d - o.dc) - o.t / 2, dp = Math.max(0, Math.abs(l.p - o.pc) - o.len / 2);
      const d = Math.hypot(Math.max(0, dd), dp);
      if (d < bd) { bd = d; best = { o, p: Math.max(o.pc - o.len / 2 + 1, Math.min(o.pc + o.len / 2 - 1, l.p)) }; }
    }
    if (!this.obsSprite) {
      this.obsCanvas = document.createElement('canvas'); this.obsCanvas.width = 512; this.obsCanvas.height = 96;
      this.obsTex = new THREE.CanvasTexture(this.obsCanvas);
      this.obsSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.obsTex, depthTest: false, transparent: true, sizeAttenuation: false }));
      this.obsSprite.scale.set(0.3, 0.056, 1); this.obsSprite.renderOrder = 5; this.scene.add(this.obsSprite);
    }
    if (!best || UI.open) { this.obsSprite.visible = false; return; }
    const o = best.o, ok = Game.canClear(o), txt = (ok ? tt("⤒ Dá para pular · ") : tt("✕ Pulo insuficiente · ")) + o.h.toFixed(1).replace('.', DEC) + ' m';
    if (this.obsTxt !== txt) {
      this.obsTxt = txt; const g = this.obsCanvas.getContext('2d');
      g.clearRect(0, 0, 512, 96); g.fillStyle = 'rgba(20,14,8,0.78)'; g.beginPath(); g.roundRect(8, 8, 496, 80, 16); g.fill();
      g.font = '700 38px system-ui, sans-serif'; g.textAlign = 'center'; g.fillStyle = ok ? '#9fe08a' : '#ff8a7a'; g.fillText(txt, 256, 62);
      this.obsTex.needsUpdate = true;
    }
    const x = o.R.ux * o.dc + o.R.vx * best.p, z = o.R.uy * o.dc + o.R.vy * best.p;
    this.obsSprite.position.set(x, World.height(x, z) + o.h + 0.9, z);
    this.obsSprite.visible = true;
  },

  // ---------- dia e noite ----------
  updateDayNight() {
    const c = Game.S.clock, ang = (c - 0.25) * Math.PI * 2, el = Math.sin(ang);
    this.sunDir.set(Math.cos(ang) * 0.9, el, 0.35).normalize();
    const moon = this.sunDir.clone().negate();
    const df = THREE.MathUtils.smoothstep(el, -0.15, 0.2); this.day = df;
    const dusk = Math.max(0, 1 - Math.abs(el) / 0.28);
    const L = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
    // paletas: noite, dia e entardecer (horizonte, baixo, meio, topo)
    const P4 = { night: ['#2c2a52', '#1b2150', '#0f1638', '#050816'], day: ['#f2e6cc', '#a8d4f0', '#5aa0e0', '#1f5fb8'], dusk: ['#ff9a4a', '#f07a6a', '#8a5aa8', '#283a80'] };
    const band = i => L(P4.night[i], P4.day[i], df).lerp(new THREE.Color(P4.dusk[i]), dusk * (i === 3 ? 0.35 : 0.7));
    this.horizon.copy(band(0)); this.skyU.c1.value.copy(band(1)); this.skyU.c2.value.copy(band(2)); this.skyU.c3.value.copy(band(3));
    this.skyU.glowAmt.value = dusk * 0.85;
    this.skyU.moon.value.copy(moon); this.skyU.night.value = 1 - df;
    this.stars.material.opacity = Math.max(0, 1 - df * 1.6);
    this.scene.fog.color.copy(this.horizon);
    this.scene.fog.near = 15 + 45 * df; this.scene.fog.far = 140 + 280 * df;
    this.hemi.intensity = 0.1 + 0.65 * df;
    this.hemi.color.copy(L('#5a6a9a', '#cfe3ff', df));
    if (el > -0.04) { this.lightDir = this.sunDir; this.sun.intensity = 1.05 * df; this.sun.color.copy(L('#ff9a50', '#fff1d6', Math.min(1, el * 4))); }
    else { this.lightDir = moon; this.sun.intensity = 0.2 * (1 - df); this.sun.color.set('#9fb4ff'); }
    this.cloudMat.color.copy(L('#2a3048', '#ffffff', df)); this.cloudMat.emissive.copy(L('#0a0e18', '#c8d4e0', df)).lerp(new THREE.Color('#e08860'), dusk * 0.4);
    for (const m of this.ring.children) m.material.color.copy(m.userData.base).lerp(new THREE.Color('#0d1322'), (1 - df) * 0.85).lerp(new THREE.Color('#c07858'), dusk * 0.25);
    const night = 1 - df;
    this.lampMat.color.copy(L('#555555', '#ffd890', night));
    this.cityLight.intensity = night * 0.9;
    this.vmScene.children.forEach(o => { if (o.isLight) o.intensity = (o.isHemisphereLight ? 0.6 : 0.55) * (0.25 + 0.75 * df); });
  },
  updatePlayerLights() {
    const S = Game.S, P = Game.P, lv = S.gear.light, on = lv > 0 && S.lightOn;
    const fwd = new V3(); this.cam.getWorldDirection(fwd);
    const gh = World.height(P.x, P.y) + P.z + this.rideH();
    if (on) {
      const head = new V3(P.x, gh + EYE, P.y);
      const right = new V3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
      if (lv === 1) { this.spot.position.copy(head).addScaledVector(right, 0.25).add(new V3(0, -0.3, 0)); this.spot.angle = 0.36; this.spot.distance = 30; this.spot.intensity = 2.4 * (0.3 + 0.7 * (1 - this.day)); }
      else { this.spot.position.copy(head).add(new V3(0, 0.15, 0)); this.spot.angle = 0.62; this.spot.distance = 44; this.spot.intensity = 2.8 * (0.3 + 0.7 * (1 - this.day)); }
      const look = this.view === 'fp' ? fwd : new V3(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch));
      this.spot.target.position.copy(this.spot.position).addScaledVector(look, 10);
    } else this.spot.intensity = 0;
    const nd = on && lv >= 3 ? (lv === 4 ? 3 : 1) : 0;
    this.drones.forEach((d, i) => {
      d.g.visible = i < nd;
      if (i >= nd) { d.light.intensity = 0; return; }
      const a = this.t * (lv === 4 ? 0.5 : 0.7) + i * Math.PI * 2 / nd, r = lv === 4 ? 8 : 3;
      const tx = P.x + Math.cos(a) * r, tz = P.y + Math.sin(a) * r, ty = World.height(P.x, P.y) + (lv === 4 ? 8 : 5.5) + Math.sin(this.t * 2 + i) * 0.25;
      d.g.position.lerp(new V3(tx, ty, tz), 0.15);
      d.light.intensity = (lv === 4 ? 1.1 : 1.5) * (0.3 + 0.7 * (1 - this.day)); d.light.distance = lv === 4 ? 85 : 50; d.light.decay = 1.1;
      d.rotors.forEach(rt => rt.rotation.y += 1.5);
    });
  },
  rideH() { const r = Game.ride(); return r ? this.rideHFor(Game.S.gear.ride) + (Game.S.gear.ride === 4 ? Math.sin(this.t * 3) * 0.05 : 0) : 0; },

  // ---------- estrelas cadentes e aurora boreal ----------
  buildNightFx() {
    this.nightFx = new THREE.Group(); this.scene.add(this.nightFx);
    // estrelas cadentes: rastro afinando com brilho na ponta
    this.meteors = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.BufferGeometry(), N = 24, pos = new Float32Array(N * 2 * 3), col = new Float32Array(N * 2 * 4);
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 4));
      const idx = []; for (let k = 0; k < N - 1; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      m.frustumCulled = false; m.renderOrder = -8; m.visible = false; this.nightFx.add(m);
      this.meteors.push({ m, N, t: 0, dur: 1, active: false });
    }
    this.meteorT = 6;
    // aurora: cortinas onduladas, verde embaixo e rosa/roxo em cima
    const amat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { t: { value: 0 }, a: { value: 0 } },
      vertexShader: `uniform float t; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position;
        p.z += sin(p.x * 0.004 + t * 0.35) * 260.0 + sin(p.x * 0.011 - t * 0.6) * 90.0;
        p.y += sin(p.x * 0.007 + t * 0.4) * 60.0 * uv.y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform float t; uniform float a; varying vec2 vUv;
        void main(){ float y = vUv.y;
          float rays = 0.55 + 0.45 * sin(vUv.x * 160.0 + t * 1.3 + sin(vUv.x * 37.0 + t) * 2.0);
          float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
          float body = smoothstep(0.0, 0.12, y) * pow(1.0 - y, 1.6);
          vec3 c = mix(vec3(0.15, 1.0, 0.45), vec3(0.75, 0.25, 0.95), smoothstep(0.35, 0.95, y));
          float pulse = 0.75 + 0.25 * sin(t * 0.8 + vUv.x * 9.0);
          gl_FragColor = vec4(c * rays * body * edge * pulse * a * 1.4, 1.0); }`,
    });
    this.auroraMat = amat; this.aurora = new THREE.Group();
    const curtains = [[-3200, 900, 0.0, 5200], [-3500, 1150, 0.35, 4200], [-2900, 750, -0.4, 3600]];
    for (const [z, y0, rot, w] of curtains) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(w, 900, 80, 1), amat);
      c.position.set(0, y0 + 450, z); c.rotation.y = rot; c.renderOrder = -8.5; c.frustumCulled = false; this.aurora.add(c);
    }
    this.aurora.visible = false; this.nightFx.add(this.aurora);
    this.auroraNight = -1; this.auroraOn = false; this.auroraA = 0;
  },
  spawnMeteor() {
    const me = this.meteors.find(m => !m.active); if (!me) return;
    const a = Math.random() * Math.PI * 2, el = 0.35 + Math.random() * 0.45, R = 5200;
    const start = new V3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).multiplyScalar(R);
    const dir = new V3(Math.random() - 0.5, -0.35 - Math.random() * 0.4, Math.random() - 0.5).normalize();
    Object.assign(me, { active: true, t: 0, dur: 0.7 + Math.random() * 0.8, start, dir, len: 500 + Math.random() * 500, speed: 2600 + Math.random() * 1600, w: 9 + Math.random() * 7 });
    me.m.visible = true;
  },
  updateNightFx(dt) {
    const night = 1 - (this.day || 0);
    this.nightFx.position.copy(this.cam.position);
    // estrelas cadentes de vez em quando
    this.meteorT -= dt;
    if (this.meteorT <= 0) { this.meteorT = 7 + Math.random() * 20; if (night > 0.7 && !(UI && UI.open)) this.spawnMeteor(); }
    const camDir = new V3(); this.cam.getWorldDirection(camDir);
    for (const me of this.meteors) {
      if (!me.active) continue;
      me.t += dt; const k = me.t / me.dur;
      if (k >= 1) { me.active = false; me.m.visible = false; continue; }
      const head = me.start.clone().addScaledVector(me.dir, me.speed * me.t);
      const fade = Math.sin(Math.PI * k);
      const side = new V3().crossVectors(me.dir, head.clone().normalize()).normalize();
      const pos = me.m.geometry.attributes.position, col = me.m.geometry.attributes.color;
      for (let i = 0; i < me.N; i++) {
        const f = i / (me.N - 1), p = head.clone().addScaledVector(me.dir, -me.len * f * Math.min(1, me.t * 3));
        const w = me.w * (1 - f) * (i === 0 ? 1.6 : 1);
        pos.setXYZ(i * 2, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
        pos.setXYZ(i * 2 + 1, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w);
        const br = Math.pow(1 - f, 1.5) * fade * night;
        for (const j of [0, 1]) col.setXYZW(i * 2 + j, 1 * br, 0.95 * br, 0.85 * br, 1);
      }
      pos.needsUpdate = col.needsUpdate = true;
    }
    // aurora boreal em algumas noites (sorteado uma vez por noite)
    const c = Game.S.clock, nightId = Math.floor((Game.S.time + (c < 0.5 ? -DAY_LEN : 0)) / DAY_LEN);
    if (night > 0.8 && this.auroraNight !== nightId) { this.auroraNight = nightId; this.auroraOn = Math.random() < 0.35; this.auroraStart = c; }
    const want = this.auroraOn && night > 0.85 ? 1 : 0;
    this.auroraA += (want - this.auroraA) * Math.min(1, dt * 0.25);
    this.aurora.visible = this.auroraA > 0.01;
    this.auroraMat.uniforms.a.value = this.auroraA; this.auroraMat.uniforms.t.value += dt;
  },

  toggleView() { this.view = this.view === 'fp' ? 'tp' : 'fp'; UI.toast(this.view === 'fp' ? tt("Primeira pessoa") : tt("Terceira pessoa: veja seu personagem (V para voltar)")); },

  // ---------- céu e horizonte infinito ----------
  buildSky() {
    // céu em degradê de 4 cores (horizonte → baixo → meio → topo) + brilho do sol perto do horizonte
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { c0: { value: this.horizon }, c1: { value: new THREE.Color('#a8d4f0') }, c2: { value: new THREE.Color('#5aa0e0') }, c3: { value: new THREE.Color('#1f5fb8') },
        glow: { value: new THREE.Color('#ffb070') }, glowAmt: { value: 0 }, sun: { value: this.sunDir }, moon: { value: new V3(0, -1, 0) }, night: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3; uniform vec3 glow; uniform float glowAmt; uniform vec3 sun; uniform vec3 moon; uniform float night; varying vec3 vP;
        void main(){ float h = vP.y;
          vec3 c = mix(c0, c1, smoothstep(-0.03, 0.12, h));
          c = mix(c, c2, smoothstep(0.10, 0.38, h));
          c = mix(c, c3, smoothstep(0.35, 0.85, h));
          // brilho alaranjado do lado do sol no nascer e no pôr do sol
          vec2 sh = normalize(sun.xz + vec2(1e-4)); float side = max(dot(normalize(vP.xz + vec2(1e-4)), sh), 0.0);
          c = mix(c, glow, glowAmt * pow(side, 3.0) * (1.0 - smoothstep(0.0, 0.45, h)));
          float s = max(dot(vP, sun), 0.0); c += (vec3(1.0,0.85,0.6) * pow(s, 400.0) * 1.6 + vec3(1.0,0.8,0.5) * pow(s, 12.0) * 0.25) * (1.0 - night);
          float m = max(dot(vP, moon), 0.0); c += vec3(0.85,0.9,1.0) * (pow(m, 900.0) * 2.2 + pow(m, 40.0) * 0.08) * night;
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 32, 16), skyMat);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    this.skyU = skyMat.uniforms;
    // estrelas
    const sp = [], rs = rng(5);
    for (let i = 0; i < 1500; i++) { const a = rs() * Math.PI * 2, y = 0.05 + rs() * 0.95, rr = Math.sqrt(1 - y * y); sp.push(Math.cos(a) * rr * 5500, y * 5500, Math.sin(a) * rr * 5500); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.renderOrder = -9.5; this.scene.add(this.stars);
    this.buildNightFx();
    // anel de montanhas que acompanha o jogador (fundo infinito)
    this.ring = new THREE.Group();
    const rings = [[3000, '#7f97a8', 380, 1], [3800, '#9fb2bf', 520, 2], [4600, '#b8c7cf', 700, 3]];
    for (const [rad, col, hmax, seed] of rings) {
      const N = 120, pos = [], idx = [], r = rng(seed * 99);
      let hh = 0;
      for (let i = 0; i <= N; i++) {
        const a = i / N * Math.PI * 2;
        hh = Math.max(40, Math.min(hmax, hh + (r() - 0.45) * hmax * 0.35)) * (0.6 + 0.4 * Math.abs(Math.sin(a * 3 + seed)));
        pos.push(Math.cos(a) * rad, -40, Math.sin(a) * rad, Math.cos(a) * rad, hh, Math.sin(a) * rad);
      }
      for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, fog: false, side: THREE.DoubleSide }));
      m.renderOrder = -9 + seed; m.userData.base = new THREE.Color(col); this.ring.add(m);
      // neve nos picos do anel mais próximo
    }
    this.scene.add(this.ring);
    // nuvens low-poly
    this.clouds = new THREE.Group();
    const cm = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, fog: false, emissive: '#c8d4e0' }); this.cloudMat = cm;
    const r = rng(7);
    for (let i = 0; i < 28; i++) {
      const c = new THREE.Group(), a = r() * Math.PI * 2, d = 900 + r() * 1800;
      for (let j = 0; j < 4 + r() * 4; j++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(40 + r() * 60, 0), cm); s.position.set((r() - 0.5) * 220, (r() - 0.5) * 30, (r() - 0.5) * 90); s.scale.y = 0.45; c.add(s); }
      c.position.set(Math.cos(a) * d, 320 + r() * 260, Math.sin(a) * d);
      this.clouds.add(c);
    }
    this.scene.add(this.clouds);
  },

  // ---------- chão ----------
  groundColor(x, y, out) {
    const d = Math.hypot(x, y);
    const n = hash2(Math.floor(x / 3), Math.floor(y / 3)) * 0.08 - 0.04;
    if (d < CITY_R) { out.set('#8f8576'); out.offsetHSL(0, 0, n); return out; }
    // estradas
    for (const R of REGIONS) {
      const l = World.local(R, x, y);
      if (l.d > 0 && l.d < R.dMin + 10) { const w = Math.sin(l.d / 23 + R.id) * 2.5; if (Math.abs(l.p - w) < 1.9) { out.set('#8a7454'); out.offsetHSL(0, 0, n); return out; } }
    }
    const g = World.groundAt(x, y);
    if (g) {
      const pal = g.R.ground;
      out.set(pal[Math.floor(hash2(Math.floor(x / 9), Math.floor(y / 9)) * 3)]);
      if (g.edge < 1) out.lerp(new THREE.Color(d < 400 ? '#5b6b3a' : '#6e6a48'), 0.5);
    } else out.set(d < 500 ? '#5d6e3b' : d < 1600 ? '#6c6b46' : '#77715a');
    // valões: chão de pedra e camadas de rocha nas paredes laterais
    const pit = World.pitAt(x, y);
    if (pit.inside > 0.05 && pit.R) {
      const h0 = World.height(x, y), sl = Math.abs(World.height(x + 1, y) - h0) + Math.abs(World.height(x, y + 1) - h0);
      const pal = { 1: ['#7d7a6a', '#8f8b78', '#6c6a5c'], 2: ['#a08060', '#b8956c', '#8a6a4c'], 3: ['#5a4434', '#6e5440', '#4a382a'], 4: ['#8a8884', '#9c9a95', '#76746f'], 5: ['#4a4560', '#5a5472', '#3c3850'] }[pit.R.id];
      if (sl > 1.2) out.set(pal[((Math.floor(-h0 / 0.9) % 3) + 3) % 3]);
      else out.lerp(this._pf || (this._pf = new THREE.Color()), 0).lerp(new THREE.Color(pal[1]), 0.45 * pit.inside);
    }
    // montanhas: rocha nas encostas e neve no topo das altas
    const mh = World.mountainH(x, y);
    if (mh > 1.5) {
      const m = World.mountainAt(x, y) || { H: 40 }, t = mh / m.H;
      out.lerp(this._rock || (this._rock = new THREE.Color('#7a7268')), Math.min(1, (t - 0.08) * 1.8));
      if (m.H > 45 && t > 0.72) out.lerp(this._snow || (this._snow = new THREE.Color('#f2f4f8')), Math.min(1, (t - 0.72) * 5));
    }
    out.offsetHSL(0, 0, n);
    return out;
  },
  buildGround() {
    const mk = (size, seg) => { const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2); g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3)); return g; };
    const gm = new THREE.MeshLambertMaterial({ vertexColors: true, map: this.grassTex });
    // terreno distante
    const far = mk(9000, 360); this.fillGround(far, 0, 0, -0.7); this.grassTex.repeat.set(1, 1);
    const farTex = this.grassTex.clone(); farTex.needsUpdate = true; farTex.wrapS = farTex.wrapT = THREE.RepeatWrapping; farTex.repeat.set(2250, 2250);
    const farMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: farTex });
    this.farGround = new THREE.Mesh(far, farMat); this.farGround.receiveShadow = true; this.scene.add(this.farGround);
    // terreno próximo (detalhado, acompanha o jogador)
    gm.map = this.grassTex;
    this.nearGeo = mk(200, 200);
    this.nearGround = new THREE.Mesh(this.nearGeo, gm); this.nearGround.receiveShadow = true; this.scene.add(this.nearGround);
    this.nearAt = null;
  },
  fillGround(geo, ox, oy, dy) {
    const pos = geo.attributes.position, col = geo.attributes.color, c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + ox, y = pos.getZ(i) + oy;
      let h = World.height(x, y);
      // terreno distante (malha grossa): nas montanhas usa o ponto mais baixo em volta,
      // para nunca ficar acima do terreno detalhado e "engolir" o jogador
      if (dy < 0 && Math.hypot(x, y) < 4600) {
        const st = 25 / 2;
        for (const [ax, ay] of [[st, 0], [-st, 0], [0, st], [0, -st], [st, st], [-st, -st], [st, -st], [-st, st]]) h = Math.min(h, World.height(x + ax, y + ay));
        h -= World.mountainH(x, y) > 0.5 ? 1.4 : 0.4;
      }
      pos.setY(i, h + dy);
      this.groundColor(x, y, c); col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = col.needsUpdate = true; geo.computeVertexNormals();
  },
  updateNearGround() {
    const P = Game.P, sx = Math.round(P.x / 24) * 24, sy = Math.round(P.y / 24) * 24;
    if (this.nearAt && this.nearAt[0] === sx && this.nearAt[1] === sy) return;
    if (!this.nearAt) { const g = this.nearGeo, pos = g.attributes.position; this.baseXZ = []; for (let i = 0; i < pos.count; i++) this.baseXZ.push(pos.getX(i), pos.getZ(i)); }
    this.nearAt = [sx, sy];
    const g = this.nearGeo, pos = g.attributes.position, col = g.attributes.color, c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = this.baseXZ[i * 2] + sx, y = this.baseXZ[i * 2 + 1] + sy;
      pos.setXYZ(i, this.baseXZ[i * 2], World.height(x, y), this.baseXZ[i * 2 + 1]);
      g.attributes.uv.setXY(i, x / 4, y / 4);
      this.groundColor(x, y, c); col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = col.needsUpdate = g.attributes.uv.needsUpdate = true; g.computeVertexNormals();
    this.nearGround.position.set(sx, 0.02, sy);
  },

  // ---------- cidade ----------
  buildCity() {
    this.city = new THREE.Group(); this.scene.add(this.city);
    const cobble = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#7d7366'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const v = 130 + Math.random() * 50 | 0; g.fillStyle = `rgb(${v},${v - 8},${v - 18})`; g.beginPath(); g.roundRect(x * 32 + (y % 2) * 16 + 2, y * 32 + 2, 28, 28, 6); g.fill(); }
    }, 10);
    const plaza = mesh(new THREE.CircleGeometry(CITY_R, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: cobble }), false);
    plaza.position.y = 0.04; this.city.add(plaza);
    // fonte
    const f1 = mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.7, 12), mat('#8a8070')); f1.position.y = 0.35; this.city.add(f1);
    this.water = mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.1, 12), new THREE.MeshPhongMaterial({ color: '#3d7a95', shininess: 80 }), false); this.water.position.y = 0.68; this.city.add(this.water);
    const f2 = mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.2, 8), mat('#9a9080')); f2.position.y = 1.1; this.city.add(f2);
    // ovo de dragão: choca no martelo 60 e racha nos marcos 20, 40 e 50
    const nest = mesh(new THREE.TorusGeometry(0.62, 0.16, 5, 12).rotateX(Math.PI / 2), mat('#6b4a2e')); nest.position.y = 2.25; this.city.add(nest);
    const eg = new THREE.SphereGeometry(0.62, 14, 10); eg.scale(1, 1.32, 1);
    this.egg = mesh(eg, mat('#4b7a5a', { emissive: '#ff7a2e', emissiveIntensity: 0, shininess: 50 })); this.egg.position.y = 2.95; this.city.add(this.egg);
    for (let i = 0; i < 9; i++) { const sp = mesh(new THREE.ConeGeometry(0.09, 0.2, 4), mat('#2f5a3e')); const a = i / 9 * Math.PI * 2, yy = (i % 3 - 1) * 0.35; sp.position.set(Math.cos(a) * 0.6 * Math.cos(yy), yy * 1.3, Math.sin(a) * 0.6 * Math.cos(yy)); sp.lookAt(sp.position.clone().multiplyScalar(2)); sp.rotateX(Math.PI / 2); this.egg.add(sp); }
    this.eggCracks = [];
    for (let i = 0; i < 3; i++) { const cr = new THREE.Group(); for (let j = 0; j < 4; j++) { const seg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), new THREE.MeshBasicMaterial({ color: '#ffb347' })); seg.position.set(0, -0.3 + j * 0.2, 0); seg.rotation.z = (j % 2 ? 0.5 : -0.5); cr.add(seg); } const a = i * 2.1; cr.position.set(Math.cos(a) * 0.61, 0, Math.sin(a) * 0.61); cr.lookAt(cr.position.clone().multiplyScalar(2)); cr.visible = false; this.egg.add(cr); this.eggCracks.push(cr); }
    this.eggLight = new THREE.PointLight('#ff8a3d', 0, 8, 2); this.eggLight.position.set(0, 3, 0); this.city.add(this.eggLight);
    const eggLabel = labelSprite(tt("Ovo de Dragão"), tt("choca no Martelo 60"), '#ffd27a', 0.6); eggLabel.position.y = 4.5; this.city.add(eggLabel);
    // barracas dos NPCs (em círculo, de frente para a fonte)
    this.npcObjs = []; this.shopIcons = [];
    for (const n of NPCS) {
      const a = n.ang * Math.PI / 180;
      const g = new THREE.Group(); g.position.set(n.x + Math.cos(a) * 1.4, 0, n.y + Math.sin(a) * 1.4); g.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a));
      for (const [px, pz] of [[-2.3, -1.2], [2.3, -1.2], [-2.3, 1.2], [2.3, 1.2]]) { const p = mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.8, 6), mat('#5a3d24')); p.position.set(px, 1.4, pz); g.add(p); }
      const roof = mesh(new THREE.BoxGeometry(5.4, 0.18, 3.2), mat(n.color)); roof.position.set(0, 2.85, 0); roof.rotation.x = -0.18; g.add(roof);
      for (let i = 0; i < 5; i++) { const st = mesh(new THREE.BoxGeometry(1.08, 0.2, 3.22), mat(i % 2 ? '#e8dcc0' : n.color), false); st.position.set(-2.16 + i * 1.08, 2.86, 0); st.rotation.x = -0.18; g.add(st); }
      const counter = mesh(new THREE.BoxGeometry(4.2, 1, 0.8), mat('#7a5a3a')); counter.position.set(0, 0.5, 0.9); g.add(counter);
      const goods = { ferreiro: '#5f666e', tropeira: '#c49a6c', botica: '#7a3fa0', armazem: '#a07a2a', bazar: '#e0a020' }[n.id];
      for (let i = 0; i < 4; i++) { const it = mesh(n.id === 'botica' ? new THREE.CylinderGeometry(0.12, 0.12, 0.4, 6) : new THREE.BoxGeometry(0.4, 0.3, 0.3), mat(goods)); it.position.set(-1.4 + i * 0.9, 1.15, 0.9); g.add(it); }
      if (n.id === 'ferreiro') { const anvil = mesh(new THREE.BoxGeometry(0.9, 0.5, 0.45), mat('#3a3d42', { shininess: 40 })); anvil.position.set(1.6, 0.25, -0.9); g.add(anvil); }
      const person = this.makePerson({ shirt: n.color, skin: n.id === 'tropeira' ? '#a8754f' : '#c48c62', hair: n.id === 'ferreiro' ? '#d8d8d8' : '#3a2a1c' });
      person.position.set(0, 0, -0.3); g.add(person);
      // placa com o que a barraca vende
      const signTex = canvasTex(512, 128, (c, w, h) => {
        c.fillStyle = '#3a2614'; c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 14); c.fill();
        c.strokeStyle = n.color; c.lineWidth = 8; c.stroke();
        c.fillStyle = '#ffe9a8'; c.font = '900 72px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(n.shop, w / 2, h / 2 + 4);
      });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
      sign.position.set(0, 3.55, 1.25); sign.rotation.x = -0.12; g.add(sign);
      const signBack = sign.clone(); signBack.rotation.y = Math.PI; signBack.position.z = 1.24; g.add(signBack);
      const lab = labelSprite(n.name.split(',')[0], n.id === 'tropeira' ? tt("Mineração · mochila · movimento · pulo") : n.role, '#f5e6c8', 0.8); lab.position.set(0, 2.25, 1.6); g.add(lab);
      // símbolo girando em cima da barraca
      const icon = this.shopIcon(n.id); icon.position.set(0, 5.4, 0); g.add(icon);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex || (this.glowTex = canvasTex(64, 64, (c, w) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); })), color: n.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
      halo.scale.setScalar(2.6); halo.position.set(0, 5.4, 0); g.add(halo);
      this.shopIcons.push(icon);
      g.userData = { npc: n, person };
      this.city.add(g); this.npcObjs.push(g);
    }
    this.houses = new THREE.Group(); this.city.add(this.houses); this.houseEra = -1;
  },
  shopIcon(id) {
    const g = new THREE.Group();
    if (id === 'ferreiro') { const h = this.makeHammer(30); h.scale.setScalar(2.2); h.rotation.z = 0.6; h.position.y = -1; g.add(h); }
    else if (id === 'tropeira') { const b = mesh(new THREE.BoxGeometry(0.9, 1.1, 0.55), mat('#b07a40')); g.add(b); const f = mesh(new THREE.BoxGeometry(0.92, 0.4, 0.57), mat('#8a5a2a')); f.position.y = 0.4; g.add(f); for (const x of [-0.25, 0.25]) { const st = mesh(new THREE.BoxGeometry(0.1, 1.1, 0.05), mat('#4a3020')); st.position.set(x, 0, -0.3); g.add(st); } const pk = mesh(new THREE.BoxGeometry(0.6, 0.4, 0.1), mat('#9a6a34')); pk.position.set(0, -0.2, 0.32); g.add(pk); }
    else if (id === 'botica') { const f = this.makeFlask('elixir', 5); g.add(f); }
    else if (id === 'armazem') { const c = mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.16, 24), mat('#ffcf30', { emissive: '#a07000', emissiveIntensity: 0.4, shininess: 120 })); c.rotation.x = Math.PI / 2; g.add(c); const r = mesh(new THREE.TorusGeometry(0.6, 0.05, 6, 24), mat('#c08a00', { shininess: 120 })); r.position.z = 0.09; g.add(r); const r2 = r.clone(); r2.position.z = -0.09; g.add(r2); }
    else { const box = mesh(new THREE.BoxGeometry(1, 1, 1), mat('#2a9ad0')); g.add(box); const rb1 = mesh(new THREE.BoxGeometry(1.03, 1.03, 0.2), mat('#ffd34d')); g.add(rb1); const rb2 = mesh(new THREE.BoxGeometry(0.2, 1.03, 1.03), mat('#ffd34d')); g.add(rb2); for (const s of [-1, 1]) { const bow = mesh(new THREE.TorusGeometry(0.2, 0.07, 6, 12), mat('#ffd34d')); bow.position.set(s * 0.18, 0.65, 0); bow.rotation.y = Math.PI / 2; bow.rotation.x = s * 0.6; g.add(bow); } }
    return g;
  },
  makePerson(o) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) { const l = mesh(new THREE.BoxGeometry(0.22, 0.85, 0.24), mat('#3a3a44')); l.position.set(s * 0.14, 0.43, 0); g.add(l); }
    const b = mesh(new THREE.BoxGeometry(0.6, 0.7, 0.32), mat(o.shirt)); b.position.y = 1.2; g.add(b);
    for (const s of [-1, 1]) { const a = mesh(new THREE.BoxGeometry(0.16, 0.65, 0.18), mat(o.shirt)); a.position.set(s * 0.39, 1.22, 0); g.add(a); }
    const h = mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), mat(o.skin)); h.position.y = 1.75; g.add(h);
    const hr = mesh(new THREE.BoxGeometry(0.38, 0.14, 0.38), mat(o.hair)); hr.position.y = 1.97; g.add(hr);
    return g;
  },
  updateHouses() {
    const era = eraOf(Game.S.hammer) + (Game.S.hammer >= 60 ? 1 : 0);
    if (era === this.houseEra) return; this.houseEra = era;
    this.houses.clear();
    const built = Math.min(12, era * 2);
    let k = 0;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2;
      if (REGIONS.some(R => Math.abs(Math.atan2(Math.sin(a - R.ang * Math.PI / 180), Math.cos(a - R.ang * Math.PI / 180))) < 0.24)) continue;
      const h = new THREE.Group(); h.position.set(Math.cos(a) * (CITY_R - 3.5), 0, Math.sin(a) * (CITY_R - 3.5)); h.rotation.y = -a - Math.PI / 2;
      if (k < built) {
        const wall = ['#c9b79a', '#b8a58a', '#d4c4a4'][k % 3], roof = ['#8f3b2a', '#7a3424', '#9a4a30'][k % 3];
        const w = mesh(new THREE.BoxGeometry(4.4, 3, 3.6), mat(wall)); w.position.y = 1.5; h.add(w);
        const r = mesh(new THREE.ConeGeometry(3.4, 1.8, 4), mat(roof)); r.rotation.y = Math.PI / 4; r.scale.set(1, 1, 0.82); r.position.y = 3.9; h.add(r);
        const door = mesh(new THREE.BoxGeometry(0.9, 1.7, 0.05), mat('#5a3a20'), false); door.position.set(0, 0.85, 1.82); h.add(door);
        for (const s of [-1, 1]) { const wi = mesh(new THREE.BoxGeometry(0.7, 0.6, 0.05), new THREE.MeshBasicMaterial({ color: '#ffd98a' }), false); wi.position.set(s * 1.4, 1.8, 1.82); h.add(wi); }
      } else {
        const w1 = mesh(new THREE.BoxGeometry(2.2, 1.6, 0.4), mat('#7d7366')); w1.position.set(-1.1, 0.8, 1.6); w1.rotation.z = 0.05; h.add(w1);
        const w2 = mesh(new THREE.BoxGeometry(0.4, 2.3, 3.2), mat('#6d6356')); w2.position.set(-2.1, 1.15, 0); h.add(w2);
        const beam = mesh(new THREE.BoxGeometry(4, 0.2, 0.2), mat('#4a3a2a')); beam.position.set(0, 0.6, 0); beam.rotation.z = 0.35; h.add(beam);
        for (let j = 0; j < 5; j++) { const rb = mesh(new THREE.DodecahedronGeometry(0.3 + j * 0.05, 0), mat('#7d7366')); rb.position.set(j * 0.5 - 0.5, 0.2, (j % 2) - 0.5); h.add(rb); }
      }
      this.houses.add(h); k++;
    }
  },

  buildRoadsAndRiver() {
    // placas nas saídas da cidade
    for (const R of REGIONS) {
      const x = R.ux * (CITY_R + 4) + R.vx * 3.5, y = R.uy * (CITY_R + 4) + R.vy * 3.5, h = World.height(x, y);
      const post = mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 6), mat('#4a3420')); post.position.set(x, h + 1.2, y); this.scene.add(post);
      const lab = labelSprite(`${R.dir} → ${R.name}`, tt("níveis {0}–{1}", (R.era - 1) * 10 + 1, R.era * 10)); lab.position.set(x, h + 2.7, y); this.scene.add(lab);
    }
    // riacho no Leste
    const R = REGIONS[1], pts = [];
    for (let d = R.dMin - 10; d <= R.dMax + 10; d += 3) { const p = Math.sin(d / 37) * 30 + Math.sin(d / 13) * 6; pts.push([R.ux * d + R.vx * p, R.uy * d + R.vy * p]); }
    const pos = [], idx = [];
    pts.forEach((p, i) => {
      const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      let tx = q[0] - o[0], ty = q[1] - o[1]; const l = Math.hypot(tx, ty); tx /= l; ty /= l;
      const nx = -ty * 2.6, ny = tx * 2.6;
      pos.push(p[0] + nx, World.height(p[0] + nx, p[1] + ny) + 0.12, p[1] + ny, p[0] - nx, World.height(p[0] - nx, p[1] - ny) + 0.12, p[1] - ny);
      if (i < pts.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    this.river = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: '#2f6a85', shininess: 90, transparent: true, opacity: 0.88, specular: '#bfe4ff' }));
    this.river.receiveShadow = true; this.scene.add(this.river);
  },

  // ---------- paredes dos valões, com camadas de rocha e fósseis ----------
  fossilTex(R) {
    const pal = { 1: ['#7d7a6a', '#8f8b78', '#6c6a5c', '#a19c86'], 2: ['#a08060', '#b8956c', '#8a6a4c', '#c9a77c'], 3: ['#5a4434', '#6e5440', '#4a382a', '#7d6048'], 4: ['#8a8884', '#9c9a95', '#76746f', '#adaaa4'], 5: ['#4a4560', '#5a5472', '#3c3850', '#6c6488'] }[R.id];
    const bone = R.id === 5 ? '#d8d0ff' : '#e8dcc0', r = rng(R.id * 97 + 3);
    return canvasTex(512, 512, (g, w, h) => {
      let y = 0, i = 0;
      while (y < h) { const t = 18 + r() * 46; g.fillStyle = pal[i++ % 4]; g.fillRect(0, y, w, t + 1); for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`; g.fillRect(r() * w, y + r() * t, 4 + r() * 18, 2 + r() * 3); } y += t; }
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; for (let k = 0; k < 14; k++) { g.beginPath(); let x = r() * w, yy = r() * h; g.moveTo(x, yy); for (let s = 0; s < 4; s++) { x += (r() - 0.5) * 50; yy += r() * 40; g.lineTo(x, yy); } g.stroke(); }
      g.strokeStyle = bone; g.fillStyle = bone; g.lineWidth = 5; g.lineCap = 'round';
      const amm = (cx, cy, s) => { g.beginPath(); for (let a = 0; a < 18; a += 0.2) { const rr = s * Math.exp(-a * 0.16); const x = cx + Math.cos(a) * rr, yy = cy + Math.sin(a) * rr; a ? g.lineTo(x, yy) : g.moveTo(x, yy); } g.stroke(); };
      const fish = (cx, cy, s) => { g.beginPath(); g.moveTo(cx - s, cy); g.lineTo(cx + s, cy); g.stroke(); for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(cx + k * s / 4, cy - s * 0.35); g.lineTo(cx + k * s / 4, cy + s * 0.35); g.stroke(); } g.beginPath(); g.moveTo(cx + s, cy); g.lineTo(cx + s * 1.4, cy - s * 0.3); g.lineTo(cx + s * 1.4, cy + s * 0.3); g.closePath(); g.stroke(); };
      const dino = (cx, cy, s) => { // crânio e coluna de dinossauro
        g.beginPath(); g.ellipse(cx, cy, s * 0.45, s * 0.28, -0.2, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.arc(cx - s * 0.12, cy - s * 0.05, s * 0.08, 0, Math.PI * 2); g.stroke();
        for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(cx - s * 0.4 + k * s * 0.13, cy + s * 0.18); g.lineTo(cx - s * 0.38 + k * s * 0.13, cy + s * 0.3); g.stroke(); }
        for (let k = 1; k < 9; k++) { const x = cx + s * 0.4 + k * s * 0.18, yy = cy + Math.sin(k * 0.6) * s * 0.12; g.beginPath(); g.arc(x, yy, s * 0.06, 0, Math.PI * 2); g.fill(); if (k < 6) { g.beginPath(); g.moveTo(x, yy); g.quadraticCurveTo(x + s * 0.05, yy + s * 0.3, x - s * 0.05, yy + s * 0.42); g.stroke(); } }
      };
      const shell = (cx, cy, s) => { for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(cx, cy + s * 0.5); g.lineTo(cx + k * s * 0.15, cy - s * 0.4); g.stroke(); } g.beginPath(); g.arc(cx, cy, s * 0.5, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); };
      const fns = [amm, amm, fish, shell, dino];
      for (let k = 0; k < 5; k++) { g.lineWidth = 4 + r() * 3; fns[(k + R.id) % fns.length](40 + r() * (w - 100), 40 + r() * (h - 80), 26 + r() * (k % 5 === 4 ? 60 : 24)); }
    }, 1);
  },
  buildPitWalls() {
    this.pitWalls = new THREE.Group(); this.scene.add(this.pitWalls);
    for (const R of REGIONS) {
      if (!R.pit) continue;
      const tex = this.fossilTex(R); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      const m = new THREE.MeshLambertMaterial({ map: tex });
      const top = mat({ 1: '#6f7a5e', 2: '#97805f', 3: '#4d3b2d', 4: '#9a9893', 5: '#56506e' }[R.id]);
      const L = R.pitL, P = R.pit;
      const wall = (d, faceSign, wFrom, wTo, hTop, hBot) => { // parede de d até d - 2*faceSign, virada para +faceSign
        const H = hTop - hBot + 0.6; if (H < 0.4) return;
        const W = wTo - wFrom, T = 2.2;
        const geo = new THREE.BoxGeometry(T, H, W), uv = geo.attributes.uv;
        const ou = Math.random(), ov = Math.random();
        for (let i = 0; i < uv.count; i++) uv.setXY(i, ou + uv.getX(i) * Math.max(W, T) / 9, ov + uv.getY(i) * H / 9);
        const b = new THREE.Mesh(geo, [m, m, top, m, m, m]); b.receiveShadow = true;
        const dc = d - faceSign * T / 2, pc = (wFrom + wTo) / 2, yc = hBot - 0.6 + H / 2;
        b.position.set(R.ux * dc + R.vx * pc, yc, R.uy * dc + R.vy * pc);
        b.rotation.y = -Math.atan2(R.uy, R.ux);
        this.pitWalls.add(b);
      };
      for (let k = 0; k <= 10; k++) {
        const b = R.dMin + L * k / 10, half = World.pitHalf(R, b), g = PIT_RW / 2 + 1.2, hp = -half / 2;
        // com rampa no meio, a parede vira duas (uma de cada lado da rampa)
        const both = (d, top, bot) => { if (P.ramp && k < 10) { wall(d, 1, -half, -g, top, bot); wall(d, 1, g, half, top, bot); } else wall(d, 1, -half, half, top, bot); };
        const H = (dd, pp) => World.height(R.ux * dd + R.vx * pp, R.uy * dd + R.vy * pp);
        if (k === 0) both(b + 0.05, H(b - 2, hp) + 0.2, H(b + 1.5, hp));
        else if (k < 10) both(b, H(b - 1.2, hp), H(b + 1, hp));
        else wall(b + 2.2, 1, -half, half, H(b + 3, 0) + 0.2, H(b - 1.5, 0));
      }
    }
  },
  // ---------- escadas, camas elásticas, corda do gancho ----------
  buildClimbFx() {
    this.climbObjs = new THREE.Group(); this.scene.add(this.climbObjs); this.climbSig = '';
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    this.rope = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#c9a66b' })); this.rope.frustumCulled = false; this.rope.visible = false; this.scene.add(this.rope);
  },
  makeLadder(h, metal) {
    const g = new THREE.Group(), rail = metal ? mat('#9aa0a8', { shininess: 70 }) : mat('#c9a66b'), rung = metal ? mat('#c7cdd4', { shininess: 70 }) : mat('#8a6a44');
    for (const x of [-0.28, 0.28]) { const r = mesh(new THREE.CylinderGeometry(metal ? 0.03 : 0.02, metal ? 0.03 : 0.02, h, 6), rail); r.position.set(x, h / 2, 0); g.add(r); }
    for (let y = 0.3; y < h; y += metal ? 0.3 : 0.4) { const r = mesh(new THREE.BoxGeometry(0.6, metal ? 0.035 : 0.05, 0.05), rung); r.position.y = y; g.add(r); }
    if (!metal) { const hook = mesh(new THREE.TorusGeometry(0.1, 0.02, 4, 8, Math.PI), mat('#777')); hook.position.set(0, h + 0.05, 0.08); g.add(hook); }
    return g;
  },
  makeTramp() {
    const g = new THREE.Group();
    const ring = mesh(new THREE.TorusGeometry(0.85, 0.07, 6, 18).rotateX(Math.PI / 2), mat('#2f6fd0')); ring.position.y = 0.38; g.add(ring);
    const bed = mesh(new THREE.CircleGeometry(0.78, 18).rotateX(-Math.PI / 2), mat('#1a1a1e')); bed.position.y = 0.36; g.add(bed);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, l = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.38, 5), mat('#555a62')); l.position.set(Math.cos(a) * 0.8, 0.19, Math.sin(a) * 0.8); g.add(l); }
    return g;
  },
  makeJetpack() {
    const g = new THREE.Group();
    for (const x of [-0.13, 0.13]) { const t = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 10), mat('#c9ccd1', { shininess: 80 })); t.position.set(x, 0, 0); g.add(t); const n = mesh(new THREE.ConeGeometry(0.08, 0.14, 8), mat('#3a3f48')); n.position.set(x, -0.31, 0); n.rotation.x = Math.PI; g.add(n); const cap = mesh(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#e2574c')); cap.position.set(x, 0.25, 0); g.add(cap); }
    const strap = mesh(new THREE.BoxGeometry(0.42, 0.12, 0.08), mat('#2b2f36')); strap.position.z = -0.08; g.add(strap);
    return g;
  },
  makeClimbItem(lv) {
    if (lv === 1) { const g = new THREE.Group(); const coil = mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 18), mat('#c9a66b')); g.add(coil); const coil2 = mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 18), mat('#b8945a')); coil2.position.z = 0.06; g.add(coil2); const sh = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 5), mat('#777', { shininess: 80 })); sh.position.set(0.3, 0.2, 0); sh.rotation.z = 0.6; g.add(sh); for (const a of [-0.6, 0, 0.6]) { const p = mesh(new THREE.TorusGeometry(0.08, 0.018, 4, 8, Math.PI), mat('#888', { shininess: 80 })); p.position.set(0.38, 0.33, 0); p.rotation.set(0, a, 0.6); g.add(p); } return g; }
    if (lv === 2) return this.makeLadder(1.6, false);
    if (lv === 3) return this.makeLadder(1.6, true);
    if (lv === 4) return this.makeTramp();
    return this.makeJetpack();
  },
  updateClimbFx() {
    const S = Game.S, sig = JSON.stringify([S.ladders, S.tramps]);
    if (sig !== this.climbSig) {
      this.climbSig = sig; this.climbObjs.clear();
      for (const L of S.ladders) { const l = this.makeLadder(Math.max(1, L.h1 - L.h0 + 0.6), L.metal); l.position.set(L.x - Math.sin(L.yaw) * 0.35, L.h0, L.y - Math.cos(L.yaw) * 0.35); l.rotation.y = L.yaw; l.rotation.x = -0.08; this.climbObjs.add(l); }
      for (const T of S.tramps) { const t = this.makeTramp(); t.position.set(T.x, World.height(T.x, T.y), T.y); this.climbObjs.add(t); }
    }
    const H = Game.hook, P = Game.P;
    this.rope.visible = !!H;
    if (H) { const a = this.rope.geometry.attributes.position; a.setXYZ(0, P.x - Math.sin(P.yaw) * 0.3 + Math.cos(P.yaw) * 0.3, World.height(P.x, P.y) + P.z + 1.2, P.y - Math.cos(P.yaw) * 0.3 - Math.sin(P.yaw) * 0.3); a.setXYZ(1, H.tx, H.tz + 0.1, H.ty); a.needsUpdate = true; }
  },

  // ---------- obstáculos (atalhos de pulo) ----------
  buildObstacles() {
    const cols = { tronco: '#6b4a2e', pedra: '#7a786f', muro: '#9a6448', trilho: '#4a3a2c', bancada: '#9a9893', penhasco: '#3e3a4e' };
    for (const o of World.obstacles) {
      // cada pedaço do obstáculo acompanha o terreno embaixo dele
      const g = new THREE.Group(); g.position.set(o.R.ux * o.dc, 0, o.R.uy * o.dc); g.rotation.y = -Math.atan2(o.R.uy, o.R.ux);
      const H = (p, dd = 0) => World.height(o.R.ux * (o.dc + dd) + o.R.vx * p, o.R.uy * (o.dc + dd) + o.R.vy * p);
      const segL = o.type === 'tronco' ? 3 : 2.4, n = Math.max(1, Math.ceil(o.len / segL)), L = o.len / n;
      for (let i = 0; i < n; i++) {
        const pc = o.pc - o.len / 2 + L * (i + 0.5);
        // altura do chão: menor valor na largura do obstáculo (nunca fica flutuando)
        const h0 = Math.min(H(pc), H(pc, -o.t / 2), H(pc, o.t / 2)), slope = (H(pc + L / 2) - H(pc - L / 2)) / L;
        const seg = new THREE.Group(); seg.position.set(0, h0, pc); seg.rotation.x = -Math.atan(slope); g.add(seg);
        const sink = 0.35 + Math.abs(slope) * L * 0.5; // parte enterrada para cobrir as ondulações
        if (o.type === 'tronco') {
          const t = mesh(new THREE.CylinderGeometry(o.h / 2, o.h / 2 * 1.05, L + 0.25, 9), mat(i % 2 ? '#6b4a2e' : '#5f4228')); t.rotation.x = Math.PI / 2; t.position.y = o.h / 2 - 0.05; seg.add(t);
          if (i % 3 === 1) { const knot = mesh(new THREE.CylinderGeometry(o.h * 0.12, o.h * 0.15, o.h * 0.35, 6), mat('#4e3420')); knot.position.set(0, o.h * 0.95, 0); seg.add(knot); }
        } else {
          const tall = o.h + sink;
          const geo = jitterGeo(new THREE.BoxGeometry(o.t, tall, L + 0.15, 2, 2, 2), o.type === 'muro' ? 0.1 : 0.35, i * 7 + o.h * 100);
          const b = mesh(geo, mat(cols[o.type])); b.position.y = tall / 2 - sink; seg.add(b);
          if (o.type === 'trilho') for (const sx of [-0.3, 0.3]) { const rail = mesh(new THREE.BoxGeometry(0.08, 0.08, L + 0.15), mat('#9aa0a6', { shininess: 60 })); rail.position.set(sx, o.h + 0.04, 0); seg.add(rail); }
        }
      }
      this.scene.add(g);
    }
  },

  // ---------- árvores, pedregulhos e capim ----------
  buildDecor() {
    const trunks = [], crowns = [], rocks = [];
    const r = rng(42);
    const ok = (x, y) => {
      const d = Math.hypot(x, y); if (d < CITY_R + 6) return false;
      for (const R of REGIONS) { const l = World.local(R, x, y); if (l.d > 0 && l.d < R.dMin + 14 && Math.abs(l.p) < 6) return false; }
      for (const o of World.obstacles) { const l = World.local(o.R, x, y); if (Math.abs(l.d - o.dc) < o.t + 3 && Math.abs(l.p - o.pc) < o.len / 2 + 3) return false; }
      return true;
    };
    for (let i = 0; i < 26000; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 1800, x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (!ok(x, y)) continue;
      if (World.mountainH(x, y) > 4) { if (r() < 0.12) rocks.push([x, y, 0.6 + r() * 1.6, '#6a645c']); continue; }
      const g = World.groundAt(x, y);
      if (g && g.edge === 1) { if (g.R.id >= 1 && r() < 0.06) rocks.push([x, y, 0.6 + r() * 1.8, g.R.ground[2]]); continue; }
      const nearBosque = (g && g.R.id === 0) || d < 260;
      if (nearBosque ? r() < 0.55 : r() < 0.12) { const s = 0.7 + r() * 0.9; trunks.push([x, y, s]); crowns.push([x, y, s, r()]); }
      else if (r() < 0.08) rocks.push([x, y, 0.5 + r() * 1.5, '#7a786f']);
    }
    const tGeo = new THREE.CylinderGeometry(0.22, 0.32, 3, 6); tGeo.translate(0, 1.5, 0);
    const cGeo = jitterGeo(new THREE.IcosahedronGeometry(2.2, 0), 0.6, 3); cGeo.translate(0, 4.4, 0);
    const c2Geo = new THREE.ConeGeometry(2, 5, 7); c2Geo.translate(0, 5, 0);
    const tm = new THREE.InstancedMesh(tGeo, mat('#5a3d24'), trunks.length);
    const cm = new THREE.InstancedMesh(cGeo, new THREE.MeshLambertMaterial({ flatShading: true }), crowns.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new V3(), pv = new V3(), col = new THREE.Color();
    trunks.forEach(([x, y, s], i) => { pv.set(x, World.height(x, y) - 0.1, y); sv.set(s, s, s); m4.compose(pv, q, sv); tm.setMatrixAt(i, m4); });
    crowns.forEach(([x, y, s, v], i) => { q.setFromAxisAngle(new V3(0, 1, 0), v * 6); pv.set(x, World.height(x, y) - 0.1, y); sv.set(s, s * (0.9 + v * 0.3), s); m4.compose(pv, q, sv); cm.setMatrixAt(i, m4); col.setHSL(0.23 + v * 0.07, 0.45, 0.22 + v * 0.1); cm.setColorAt(i, col); });
    tm.castShadow = cm.castShadow = true; tm.receiveShadow = cm.receiveShadow = true;
    this.scene.add(tm, cm);
    const rGeo = jitterGeo(new THREE.DodecahedronGeometry(1, 0), 0.35, 11);
    const rm = new THREE.InstancedMesh(rGeo, new THREE.MeshLambertMaterial({ flatShading: true }), rocks.length);
    q.identity();
    rocks.forEach(([x, y, s, c], i) => { pv.set(x, World.height(x, y) + s * 0.2, y); sv.set(s, s * 0.7, s * 1.1); m4.compose(pv, q, sv); rm.setMatrixAt(i, m4); col.set(c); col.offsetHSL(0, 0, -0.05); rm.setColorAt(i, col); });
    rm.castShadow = rm.receiveShadow = true; this.scene.add(rm);
  },
  buildGrass() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.25, 0, 0, 0.25, 0, 0, 0, 0.55, 0, 0, 0, -0.25, 0, 0, 0.25, 0.04, 0.5, 0], 3));
    g.computeVertexNormals();
    this.grass = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), 3500);
    this.grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.grass); this.grassAt = null;
  },
  updateGrass() {
    if (this.quality === 'leve') return;
    const P = Game.P, sx = Math.round(P.x / 6) * 6, sy = Math.round(P.y / 6) * 6;
    if (this.grassAt && this.grassAt[0] === sx && this.grassAt[1] === sy) return;
    this.grassAt = [sx, sy];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3(), c = new THREE.Color(), up = new V3(0, 1, 0);
    let n = 0;
    for (let gx = -40; gx <= 40 && n < 3500; gx += 1.6) for (let gy = -40; gy <= 40 && n < 3500; gy += 1.6) {
      const cx = Math.floor((sx + gx) / 1.6), cy = Math.floor((sy + gy) / 1.6), h = hash2(cx, cy);
      if (h > 0.55) continue;
      const x = cx * 1.6 + hash2(cx * 3, cy) * 1.6, y = cy * 1.6 + hash2(cx, cy * 5) * 1.6;
      if (Math.hypot(x, y) < CITY_R + 1 || World.mountainH(x, y) > 6) continue;
      const gr = World.groundAt(x, y), id = gr ? gr.R.id : -1;
      if (id >= 2 && gr.edge === 1) continue;
      q.setFromAxisAngle(up, h * 20); s.set(0.5 + h * 0.6, 0.35 + h * 0.9, 0.5 + h * 0.6); p.set(x, World.height(x, y), y);
      m4.compose(p, q, s); this.grass.setMatrixAt(n, m4);
      c.setHSL(0.2 + h * 0.08, 0.4, 0.2 + h * 0.12); this.grass.setColorAt(n, c); n++;
    }
    this.grass.count = n; this.grass.instanceMatrix.needsUpdate = true; if (this.grass.instanceColor) this.grass.instanceColor.needsUpdate = true;
  },

  // ---------- nós de recurso ----------
  // formas próprias para recursos da mesma região não ficarem parecidos
  SHAPES: (() => {
    const J = (geo, a, seed) => jitterGeo(geo, a, seed);
    const pile = (g, s, r, cols, n, size, spread, h) => { for (let i = 0; i < n; i++) { const z = s * size * (0.6 + r() * 0.7); const b = mesh(J(new THREE.IcosahedronGeometry(z, 0), z * 0.3, i * 13 + 1), mat(cols[i % cols.length])); const a = r() * 6.28, d = Math.sqrt(r()) * s * spread; b.position.set(Math.cos(a) * d, z * 0.6 + (1 - d / (s * spread)) * s * h * r(), Math.sin(a) * d); b.rotation.set(r() * 3, r() * 3, r() * 3); g.add(b); } };
    const hostRock = (g, s, col, seed, sy = 0.75) => { const m = mesh(J(new THREE.IcosahedronGeometry(s, 1), s * 0.18, seed), mat(col)); m.scale.y = sy; m.position.y = s * 0.5; g.add(m); return m; };
    const onSurface = (s, r, sy = 0.75) => { const a = r() * 6.28, b = 0.15 + r() * 1.1; return new V3(Math.cos(a) * Math.cos(b) * s * 0.92, s * 0.5 + Math.sin(b) * s * sy * 0.92, Math.sin(a) * Math.cos(b) * s * 0.92); };
    const shiny = (c, e, k = 0.3) => mat(c, { emissive: e || c, emissiveIntensity: k, shininess: 90, specular: '#888' });
    return {
      // Bosque
      cascalho(g, s, r) { pile(g, s, r, ['#8b8578', '#a8a294', '#6f6a60', '#9a8f7c'], 22, 0.16, 0.95, 0.9); },
      pedrasabao(g, s, r, n) { const m = mesh(J(new THREE.SphereGeometry(s, 12, 8), s * 0.06, n.seed), mat('#6f9a86', { shininess: 70, specular: '#9fc8b4' })); m.scale.set(1.15, 0.5, 0.9); m.position.y = s * 0.3; g.add(m);
        for (let i = 0; i < 3; i++) { const gr = mesh(new THREE.TorusGeometry(s * (0.35 + i * 0.22), s * 0.025, 4, 18), mat('#4e7464')); gr.rotation.x = Math.PI / 2; gr.scale.set(1.15, 0.9, 1); gr.position.y = s * 0.56 - i * s * 0.05; g.add(gr); } },
      // Riacho
      seixo(g, s, r) { for (let i = 0; i < 5; i++) { const z = s * (0.3 + r() * 0.25); const b = mesh(new THREE.SphereGeometry(z, 10, 7), mat(['#c3c8c9', '#9aa0a2', '#b4b0a8'][i % 3], { shininess: 110, specular: '#ffffff' })); b.scale.y = 0.55; const a = i * 1.3 + r(), d = i ? s * 0.6 : 0; b.position.set(Math.cos(a) * d, z * 0.5, Math.sin(a) * d); g.add(b); } },
      arenito(g, s, r) { const cols = ['#c49a6c', '#dcb98d', '#b07a4a', '#e8c89a', '#a86a3a']; let y = 0; for (let i = 0; i < 5; i++) { const t = s * (0.14 + r() * 0.08), w = s * (1.6 - i * 0.22); const sl = mesh(J(new THREE.BoxGeometry(w, t, w * 0.8), s * 0.04, i + 5), mat(cols[i])); sl.position.set((r() - 0.5) * s * 0.2, y + t / 2, (r() - 0.5) * s * 0.2); sl.rotation.y = r() * 0.6; g.add(sl); y += t; } },
      silex(g, s, r) { for (let i = 0; i < 5; i++) { const h = s * (0.8 + r() * 0.9); const sh = mesh(J(new THREE.TetrahedronGeometry(h * 0.6, 0), h * 0.08, i), mat(i % 2 ? '#2e2a28' : '#4b4743', { shininess: 120, specular: '#cccccc' })); sh.scale.set(0.6, 1.4, 0.6); sh.position.set((r() - 0.5) * s, h * 0.45, (r() - 0.5) * s); sh.rotation.set((r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6); g.add(sh); } },
      basalto(g, s, r) { for (let i = 0; i < 7; i++) { const h = s * (0.7 + r() * 1.2), w = s * 0.32; const c = mesh(new THREE.CylinderGeometry(w, w, h, 6), mat(i % 2 ? '#2a2d30' : '#3a3e42')); const a = i * 0.9, d = i ? s * 0.55 : 0; c.position.set(Math.cos(a) * d, h / 2, Math.sin(a) * d); g.add(c); const top = mesh(new THREE.CylinderGeometry(w * 0.98, w * 0.98, 0.02, 6), mat('#55595e')); top.position.set(c.position.x, h + 0.01, c.position.z); g.add(top); } },
      granito(g, s, r, n) { hostRock(g, s * 1.1, '#c9a8a0', n.seed, 0.8); for (let i = 0; i < 40; i++) { const d = mesh(new THREE.BoxGeometry(s * 0.09, s * 0.09, s * 0.09), mat(i % 3 ? '#1e1e22' : '#f0e8e4')); const p = onSurface(s * 1.12, r, 0.8); d.position.copy(p); d.rotation.set(r() * 3, r() * 3, 0); g.add(d); } },
      // Vila / Colinas de Cobre
      calcario(g, s, r) { for (let i = 0; i < 4; i++) { const w = s * (0.7 + r() * 0.5); const b = mesh(J(new THREE.BoxGeometry(w, w * 0.8, w), s * 0.05, i + 9), mat(i % 2 ? '#ebe4d2' : '#d8cfb8')); b.position.set((i % 2 - 0.5) * s * 0.8, w * 0.4 + (i > 1 ? w * 0.75 : 0), (i < 2 ? -0.3 : 0.2) * s); b.rotation.y = r() * 0.8; g.add(b);
          for (let k = 0; k < 4; k++) { const hole = mesh(new THREE.SphereGeometry(s * 0.07, 6, 4), mat('#8f876f')); hole.position.set(b.position.x + (r() - 0.5) * w * 0.8, b.position.y + w * 0.4, b.position.z + (r() - 0.5) * w * 0.8); hole.scale.y = 0.3; g.add(hole); } } },
      malaquita(g, s, r, n) { hostRock(g, s, '#5d5a52', n.seed); for (let i = 0; i < 14; i++) { const z = s * (0.14 + r() * 0.14); const b = mesh(new THREE.SphereGeometry(z, 10, 8), shiny(i % 2 ? '#2f8a5a' : '#6fd49a', '#1a6a40', 0.25)); b.position.copy(onSurface(s, r)); g.add(b); } },
      cassiterita(g, s, r, n) { hostRock(g, s, '#7d6e60', n.seed); for (let i = 0; i < 9; i++) { const z = s * (0.18 + r() * 0.12); const c = mesh(new THREE.OctahedronGeometry(z, 0), shiny('#2a1e18', '#3a2a20', 0.1)); c.scale.y = 1.4; c.position.copy(onSurface(s, r)); c.rotation.set(r(), r(), r()); g.add(c); } },
      esfalerita(g, s, r, n) { hostRock(g, s, '#5a5048', n.seed); for (let i = 0; i < 10; i++) { const z = s * (0.15 + r() * 0.12); const c = mesh(new THREE.BoxGeometry(z, z, z), mat('#e0a030', { emissive: '#a06010', emissiveIntensity: 0.4, shininess: 100, transparent: true, opacity: 0.88 })); c.position.copy(onSurface(s, r)); c.rotation.set(r() * 3, r() * 3, r() * 3); g.add(c); } },
      // Mina Velha
      carvao(g, s, r) { pile(g, s, r, ['#141416', '#24242a', '#1a1a1e'], 12, 0.32, 0.8, 1.1); g.traverse(o => { if (o.isMesh) o.material = mat('#1a1a1e', { shininess: 120, specular: '#666' }); }); },
      hematita(g, s, r, n) { for (let i = 0; i < 9; i++) { const z = s * (0.35 + r() * 0.25); const b = mesh(new THREE.SphereGeometry(z, 10, 8), mat(i % 2 ? '#7a2c22' : '#5a1e18', { shininess: 80, specular: '#c88' })); const a = r() * 6.28, d = Math.sqrt(r()) * s * 0.7; b.position.set(Math.cos(a) * d, z * 0.7 + r() * s * 0.4, Math.sin(a) * d); g.add(b); } },
      magnetita(g, s, r, n) { hostRock(g, s * 0.8, '#6a6e74', n.seed, 0.6); for (let i = 0; i < 6; i++) { const z = s * (0.35 + r() * 0.2); const c = mesh(new THREE.OctahedronGeometry(z, 0), mat('#22252c', { shininess: 140, specular: '#bbbbbb' })); const p = onSurface(s * 0.8, r, 0.6); c.position.copy(p); c.position.y += z * 0.3; c.rotation.set(r(), r(), r()); g.add(c); } },
      cromita(g, s, r, n) { const m = hostRock(g, s * 1.05, '#3a3530', n.seed, 0.7); for (let i = 0; i < 4; i++) { const band = mesh(new THREE.TorusGeometry(s * (1.0 - i * 0.12), s * 0.09, 4, 14), mat('#d8e0e6', { emissive: '#606870', emissiveIntensity: 0.4, shininess: 130, specular: '#ffffff' })); band.rotation.x = Math.PI / 2 + (r() - 0.5) * 0.3; band.scale.set(1, 1, 0.7); band.position.y = s * (0.25 + i * 0.17); g.add(band); } },
      vanadinita(g, s, r, n) { hostRock(g, s, '#6a5a4a', n.seed, 0.6); for (let i = 0; i < 16; i++) { const h = s * (0.18 + r() * 0.2); const c = mesh(new THREE.CylinderGeometry(s * 0.06, s * 0.06, h, 6), mat('#f05a20', { emissive: '#c03000', emissiveIntensity: 0.45, shininess: 80 })); const p = onSurface(s, r, 0.6); c.position.copy(p); c.lookAt(p.clone().multiplyScalar(2)); c.rotateX(Math.PI / 2); g.add(c); } },
      // Pedreira / Mina Profunda
      marmore(g, s, r) { const b = new THREE.Group(); b.rotation.y = r(); g.add(b);
        const blk = mesh(new THREE.BoxGeometry(s * 1.6, s * 1.1, s * 1.2), mat('#f4f2ee', { shininess: 110, specular: '#ffffff' })); blk.position.y = s * 0.55; b.add(blk);
        for (let i = 0; i < 6; i++) { const v = mesh(new THREE.BoxGeometry(s * 1.64, s * 0.03, s * 1.24), mat(i % 2 ? '#8a8a90' : '#b0a8a0')); v.position.y = s * (0.12 + r() * 0.86); v.rotation.set((r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.7); b.add(v); } },
      prata(g, s, r, n) { hostRock(g, s, '#4a4a50', n.seed, 0.7); for (let i = 0; i < 10; i++) { const w = mesh(new THREE.TorusGeometry(s * (0.12 + r() * 0.1), s * 0.03, 4, 10, Math.PI * (1 + r())), shiny('#e8ecf0', '#9aa0a6', 0.35)); w.position.copy(onSurface(s, r, 0.7)); w.rotation.set(r() * 3, r() * 3, r() * 3); g.add(w); } },
      ouro(g, s, r, n) { const q = hostRock(g, s, '#f0ece2', n.seed, 0.75); q.material = mat('#f0ece2', { shininess: 60 }); for (let i = 0; i < 9; i++) { const z = s * (0.1 + r() * 0.14); const nug = mesh(J(new THREE.IcosahedronGeometry(z, 1), z * 0.3, i), shiny('#ffcf30', '#c08a00', 0.45)); nug.position.copy(onSurface(s, r)); g.add(nug); } },
      rutilo(g, s, r, n) { const q = mesh(J(new THREE.IcosahedronGeometry(s, 1), s * 0.12, n.seed), mat('#e8d8c8', { transparent: true, opacity: 0.55, shininess: 120 })); q.scale.y = 0.8; q.position.y = s * 0.55; g.add(q);
        for (let i = 0; i < 14; i++) { const nd = mesh(new THREE.CylinderGeometry(s * 0.015, s * 0.015, s * (0.8 + r() * 0.7), 4), mat('#d08a3a', { emissive: '#a05010', emissiveIntensity: 0.5 })); nd.position.set((r() - 0.5) * s, s * 0.55 + (r() - 0.5) * s * 0.5, (r() - 0.5) * s); nd.rotation.set(r() * 3, r() * 3, r() * 3); g.add(nd); } },
      volframita(g, s, r, n) { hostRock(g, s * 0.8, '#b8b0a4', n.seed, 0.55); for (let i = 0; i < 6; i++) { const bl = mesh(new THREE.BoxGeometry(s * 0.08, s * (0.8 + r() * 0.5), s * 0.45), mat('#1a1c22', { shininess: 140, specular: '#aaaaaa' })); bl.position.set((r() - 0.5) * s * 0.8, s * 0.7, (r() - 0.5) * s * 0.8); bl.rotation.set((r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5); g.add(bl); } },
      // recursos raros das montanhas
      pedravento(g, s, r, n) { hostRock(g, s * 0.7, '#8a9aa0', n.seed, 0.6); const orb = mesh(new THREE.IcosahedronGeometry(s * 0.45, 1), mat('#bff0ff', { emissive: '#4ab8e0', emissiveIntensity: 0.7, transparent: true, opacity: 0.85, shininess: 120 })); orb.position.y = s * 1.15; g.add(orb); g.userData.spin = orb;
        for (let i = 0; i < 3; i++) { const ring = mesh(new THREE.TorusGeometry(s * (0.62 + i * 0.12), s * 0.025, 4, 24), mat('#e8fbff', { emissive: '#8ad8f0', emissiveIntensity: 0.8 })); ring.position.y = s * 1.15; ring.rotation.set(Math.PI / 2 + i * 0.5, i, 0); g.add(ring); } g.userData.glowCol = '#9fe8ff'; },
      ambar(g, s, r, n) { hostRock(g, s * 0.8, '#5a4a3a', n.seed, 0.6); for (let i = 0; i < 6; i++) { const z = s * (0.25 + r() * 0.2); const b = mesh(J(new THREE.SphereGeometry(z, 10, 8), z * 0.15, i), mat('#ffb030', { emissive: '#c06a00', emissiveIntensity: 0.6, transparent: true, opacity: 0.85, shininess: 120 })); b.position.copy(onSurface(s * 0.8, r, 0.6)); g.add(b);
          const bug = mesh(new THREE.SphereGeometry(z * 0.18, 5, 4), mat('#2a1a0a')); bug.position.copy(b.position); g.add(bug); } g.userData.glowCol = '#ffc860'; },
      ferroceleste(g, s, r, n) { hostRock(g, s * 0.75, '#3a3e4a', n.seed, 0.6); for (let i = 0; i < 9; i++) { const h = s * (0.6 + r() * 0.6); const sp = mesh(new THREE.ConeGeometry(s * 0.1, h, 4), mat('#6a8aff', { emissive: '#2a40c0', emissiveIntensity: 0.6, shininess: 140, specular: '#ffffff' })); const p = onSurface(s * 0.75, r, 0.6); sp.position.copy(p); sp.lookAt(p.clone().multiplyScalar(2)); sp.rotateX(Math.PI / 2); g.add(sp); } g.userData.glowCol = '#8aa8ff'; },
      obsidiana(g, s, r) { for (let i = 0; i < 6; i++) { const h = s * (0.9 + r() * 0.8); const sh = mesh(J(new THREE.OctahedronGeometry(h * 0.45, 0), h * 0.06, i), mat('#120a18', { emissive: '#5a1a90', emissiveIntensity: 0.35, shininess: 160, specular: '#d8a0ff' })); sh.scale.set(0.55, 1.5, 0.55); sh.position.set((r() - 0.5) * s, h * 0.55, (r() - 0.5) * s); sh.rotation.set((r() - 0.5) * 0.5, r() * 3, (r() - 0.5) * 0.5); g.add(sh); } g.userData.glowCol = '#b04aff'; },
      coracao(g, s, r, n) { hostRock(g, s * 0.8, '#3a2a28', n.seed, 0.55); const core = mesh(new THREE.IcosahedronGeometry(s * 0.55, 1), mat('#ff3048', { emissive: '#c01020', emissiveIntensity: 0.9, shininess: 140 })); core.position.y = s * 1.0; g.add(core); g.userData.pulse = core;
          for (let i = 0; i < 8; i++) { const c = mesh(new THREE.ConeGeometry(s * 0.09, s * 0.6, 5), mat('#ffd34d', { emissive: '#c08a00', emissiveIntensity: 0.7 })); const a = i / 8 * 6.28; c.position.set(Math.cos(a) * s * 0.5, s * 1.0, Math.sin(a) * s * 0.5); c.lookAt(c.position.clone().multiplyScalar(3).setY(s * 1.6)); c.rotateX(Math.PI / 2); g.add(c); } g.userData.glowCol = '#ff6070'; },
      // Serra dos Cristais
      quartzo(g, s, r) { for (let i = 0; i < 9; i++) { const h = s * (1 + r() * 1.3), w = s * 0.16; const c = mesh(new THREE.CylinderGeometry(0, w, h * 0.25, 6), mat('#f4f6fa', { transparent: true, opacity: 0.8, shininess: 120 })); const b = mesh(new THREE.CylinderGeometry(w, w, h * 0.75, 6), mat('#e4e8f0', { transparent: true, opacity: 0.75, shininess: 120 })); const gg = new THREE.Group(); b.position.y = h * 0.375; c.position.y = h * 0.875; gg.add(b, c); gg.position.set((r() - 0.5) * s * 0.9, 0, (r() - 0.5) * s * 0.9); gg.rotation.set((r() - 0.5) * 0.7, r() * 3, (r() - 0.5) * 0.7); g.add(gg); } },
      ametista(g, s, r, n) { // geodo aberto: casca de pedra com cristais roxos por dentro
        const shell = mesh(new THREE.SphereGeometry(s, 14, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat('#8a7a6a', { side: THREE.DoubleSide })); shell.position.y = s * 0.95; g.add(shell);
        const rim = mesh(new THREE.TorusGeometry(s, s * 0.08, 5, 18), mat('#a89a88')); rim.rotation.x = Math.PI / 2; rim.position.y = s * 0.95; g.add(rim);
        for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * s * 0.82, depth = Math.sqrt(Math.max(0, s * s - d * d)); const c = mesh(new THREE.ConeGeometry(s * 0.09, s * (0.25 + r() * 0.2), 5), mat(i % 3 ? '#9b5ad6' : '#c49cf0', { emissive: '#5a2a90', emissiveIntensity: 0.5, shininess: 100 })); c.position.set(Math.cos(a) * d, s * 0.95 - depth * 0.85 + s * 0.12, Math.sin(a) * d); c.rotation.set((r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5); g.add(c); } },
      esmeralda(g, s, r, n) { hostRock(g, s * 0.8, '#5a5a5a', n.seed, 0.6); for (let i = 0; i < 6; i++) { const h = s * (0.7 + r() * 0.6); const c = mesh(new THREE.CylinderGeometry(s * 0.15, s * 0.15, h, 6), mat('#1ab070', { emissive: '#0a6040', emissiveIntensity: 0.5, transparent: true, opacity: 0.9, shininess: 120 })); const top = mesh(new THREE.CylinderGeometry(s * 0.15, s * 0.15, 0.01, 6), mat('#7af0b8')); top.position.y = h / 2; c.add(top); c.position.set((r() - 0.5) * s * 0.7, s * 0.4 + h / 2, (r() - 0.5) * s * 0.7); c.rotation.set((r() - 0.5) * 0.6, r(), (r() - 0.5) * 0.6); g.add(c); } },
      rubi(g, s, r, n) { hostRock(g, s, '#e8e0d8', n.seed, 0.7); for (let i = 0; i < 7; i++) { const z = s * (0.2 + r() * 0.15); const c = mesh(new THREE.CylinderGeometry(z, z, z * 0.7, 6), mat('#e0203a', { emissive: '#900018', emissiveIntensity: 0.55, shininess: 120, transparent: true, opacity: 0.92 })); c.position.copy(onSurface(s, r, 0.7)); c.rotation.set(r() * 3, r() * 3, 0); g.add(c); } },
      safira(g, s, r) { for (let i = 0; i < 5; i++) { const z = s * (0.35 + r() * 0.2); const c = mesh(new THREE.CylinderGeometry(z * 0.4, z * 0.4, z * 2.2, 6), mat('#2a5ae0', { emissive: '#102a90', emissiveIntensity: 0.6, shininess: 120, transparent: true, opacity: 0.9 })); const tip = mesh(new THREE.ConeGeometry(z * 0.4, z * 0.8, 6), c.material); tip.position.y = z * 1.5; const tip2 = tip.clone(); tip2.rotation.x = Math.PI; tip2.position.y = -z * 1.5; c.add(tip, tip2); c.position.set((r() - 0.5) * s, z * 1.2, (r() - 0.5) * s); c.rotation.set((r() - 0.5) * 1.2, r() * 3, (r() - 0.5) * 1.2); g.add(c); } },
      diamante(g, s, r, n) { const k = mesh(J(new THREE.IcosahedronGeometry(s, 1), s * 0.15, n.seed), mat('#3a3a44')); k.scale.y = 0.7; k.position.y = s * 0.5; g.add(k); for (let i = 0; i < 6; i++) { const z = s * (0.2 + r() * 0.15); const d = mesh(new THREE.OctahedronGeometry(z, 0), mat('#e8faff', { emissive: '#9fe0ff', emissiveIntensity: 0.6, shininess: 150, specular: '#ffffff', transparent: true, opacity: 0.92 })); d.position.copy(onSurface(s, r, 0.7)); d.position.y += z * 0.4; g.add(d); } },
    };
  })(),

  nodeMesh(n) {
    const g = new THREE.Group(), res = n.res, r = rng(Math.floor(n.seed * 1000)), s = n.r * 0.55;
    const rock = (col, sz, seed) => mesh(jitterGeo(new THREE.IcosahedronGeometry(sz, 0), sz * 0.35, seed), mat(col));
    const kind = res.kind;
    if (kind === 'nut') {
      for (let i = 0; i < 4; i++) { const b = mesh(jitterGeo(new THREE.IcosahedronGeometry(s * (0.5 + r() * 0.25), 1), 0.12, i + n.seed), mat(i % 2 ? '#3f6e2a' : '#4d7a30')); b.position.set((r() - 0.5) * s, s * 0.45 + r() * s * 0.3, (r() - 0.5) * s); g.add(b); }
      for (let i = 0; i < 9; i++) { const nu = mesh(new THREE.IcosahedronGeometry(0.07 + r() * 0.04, 0), mat(res.c)); const a = r() * 6.28; nu.position.set(Math.cos(a) * s * 0.7, s * (0.3 + r() * 0.6), Math.sin(a) * s * 0.7); g.add(nu); }
    } else if (kind === 'stick') {
      for (let i = 0; i < 7; i++) { const st = mesh(new THREE.CylinderGeometry(0.04, 0.05, s * 2 * (0.6 + r() * 0.5), 5), mat(i % 2 ? res.c : res.c2)); st.rotation.set(Math.PI / 2 + (r() - 0.5) * 0.4, r() * 3, 0); st.position.set((r() - 0.5) * 0.3, 0.05 + i * 0.06, (r() - 0.5) * 0.3); g.add(st); }
    } else if (kind === 'log') {
      const l = mesh(new THREE.CylinderGeometry(s * 0.45, s * 0.5, s * 2.2, 9), [mat(res.c), mat(res.c2), mat(res.c2)]); l.rotation.z = Math.PI / 2; l.rotation.y = r() * 3; l.position.y = s * 0.45; g.add(l);
    } else if (kind === 'clay') {
      const c = mesh(jitterGeo(new THREE.IcosahedronGeometry(s, 1), s * 0.12, n.seed), mat(res.c, { shininess: 30 })); c.scale.y = 0.5; c.position.y = s * 0.22; g.add(c);
      const c2 = mesh(jitterGeo(new THREE.IcosahedronGeometry(s * 0.45, 0), s * 0.08, n.seed + 3), mat(res.c2, { shininess: 30 })); c2.scale.y = 0.6; c2.position.set(s * 0.55, s * 0.12, s * 0.35); g.add(c2);
    } else if (kind === 'wild') {
      if (res.id === 'veiocint') {
        const base = rock('#3a4a5a', s * 0.9, n.seed); base.position.y = s * 0.35; base.scale.y = 0.6; g.add(base);
        for (let i = 0; i < 9; i++) { const h = s * (0.6 + r() * 1.2), c = mesh(new THREE.CylinderGeometry(0, s * 0.16, h, 5), mat(i % 3 ? res.c : res.c2, { emissive: res.c, emissiveIntensity: 0.9, shininess: 120 })); const a = r() * 6.28, d = r() * s * 0.6; c.position.set(Math.cos(a) * d, s * 0.5 + h / 2, Math.sin(a) * d); c.rotation.set((r() - 0.5) * 0.7, 0, (r() - 0.5) * 0.7); g.add(c); }
      } else {
        const ge = mesh(jitterGeo(new THREE.IcosahedronGeometry(s, 1), s * 0.15, n.seed), mat('#6e6470', { shininess: 20 })); ge.position.y = s * 0.7; g.add(ge);
        const cav = mesh(new THREE.IcosahedronGeometry(s * 0.62, 0), mat('#d9b3ff', { emissive: '#9a4ff0', emissiveIntensity: 0.9 })); cav.position.set(0, s * 0.75, s * 0.48); cav.scale.z = 0.45; g.add(cav);
      }
      // feixe de luz até o céu: dá para ver de longe
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 60, 10, 1, true), new THREE.MeshBasicMaterial({ color: res.id === 'veiocint' ? '#7af0ff' : '#c08aff', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      beam.position.y = 30; g.add(beam); g.userData.beam = beam;
    } else if (this.SHAPES[res.id]) {
      this.SHAPES[res.id].call(this, g, s, r, n, res);
    } else {
      const base = kind === 'rock' ? res.c : kind === 'scrap' ? '#5a4a3e' : kind === 'meteor' ? res.c : '#6a655e';
      const main = rock(base, s, n.seed); main.position.y = s * 0.55; main.scale.y = 0.8; g.add(main);
      const small = rock(kind === 'rock' ? res.c2 : base, s * 0.45, n.seed + 1); small.position.set(s * 0.8, s * 0.25, s * 0.3); g.add(small);
      if (kind === 'ore') for (let i = 0; i < 8; i++) { const o = mesh(new THREE.IcosahedronGeometry(s * (0.1 + r() * 0.08), 0), mat(res.c2, { emissive: res.c, emissiveIntensity: 0.25, shininess: 60 })); const a = r() * 6.28, b = r() * 1.2; o.position.set(Math.cos(a) * s * 0.85 * Math.cos(b), s * 0.55 + Math.sin(b) * s * 0.6, Math.sin(a) * s * 0.85 * Math.cos(b)); g.add(o); }
      if (kind === 'scrap') for (let i = 0; i < 8; i++) { const b = mesh(i % 2 ? new THREE.BoxGeometry(0.5, 0.06, 0.25) : new THREE.CylinderGeometry(0.025, 0.025, 0.6, 4), mat(i % 2 ? res.c2 : '#9a9690', { shininess: 40 })); b.position.set((r() - 0.5) * s * 1.4, s * (0.9 + r() * 0.4), (r() - 0.5) * s * 1.2); b.rotation.set(r() * 3, r() * 3, r() * 3); g.add(b); }
      if (kind === 'crystal') for (let i = 0; i < 6; i++) { const h = s * (0.8 + r() * 1.1); const c = mesh(new THREE.CylinderGeometry(0, s * 0.18, h, 6), mat(res.c2, { emissive: res.c, emissiveIntensity: 0.5, shininess: 100, transparent: true, opacity: 0.9 })); c.position.set((r() - 0.5) * s, s * 0.7 + h / 2 - s * 0.2, (r() - 0.5) * s); c.rotation.set((r() - 0.5) * 0.7, 0, (r() - 0.5) * 0.7); g.add(c); }
      if (kind === 'meteor') for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(s * 0.5, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: res.c2 })); c.position.set((r() - 0.5) * s * 1.2, s * (0.4 + r() * 0.6), (r() - 0.5) * s * 1.2); c.rotation.set(r() * 3, r() * 3, r() * 3); g.add(c); }
    }
    if (n.rare > 1 || res.special || res.wild) {
      if (!this.glowTex) this.glowTex = canvasTex(64, 64, (c, w) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); });
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: res.special ? (g.userData.glowCol || '#ffffff') : n.rare === 10 ? '#8ff0ff' : '#ffd860', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
      sp.scale.setScalar(s * (res.special ? 2.6 : 4)); sp.position.y = s * 0.8; if (res.special) sp.material.opacity = 0.4; g.add(sp); g.userData.glow = sp; g.userData.glowMax = res.special ? 0.4 : 0.85;
    }
    g.rotation.y = n.seed % 6.28;
    g.position.set(n.x, World.height(n.x, n.y) - 0.05, n.y);
    g.userData.res = res.id; g.userData.base = g.position.clone();
    return g;
  },
  // informações de valor de um recurso para o jogador atual
  resInfo(n) {
    const res = n.res, units = Math.max(1, Math.round(2 * n.size)) * n.rare;
    const rule = res.wild ? { mult: 1 } : levelRule(res.ideal, Game.S.hammer);
    const hits = rule.blocked ? Infinity : Math.ceil(n.hp / (Game.force() / rule.mult)), time = Math.max(0.3, hits * Game.interval());
    const need = (Game.missCache || []).find(m => m.id === res.id);
    return { lvl: res.ideal, value: res.value, units, total: units * res.value, perMin: rule.blocked ? 0 : units * res.value / time * 60, hits, time, need, rule };
  },
  tierColor(lvl) { // cor do nível: cinza → verde → azul → roxo → laranja → dourado
    return ['#b8b0a0', '#7fd36a', '#5aa8f0', '#b07af0', '#ff9a3d', '#ffd34d'][Math.min(5, Math.floor((lvl - 1) / 10))];
  },
  badgeTex(res, need) {
    const lock = levelRule(res.ideal, Game.S.hammer).blocked;
    const key = res.id + (need ? '*' : '') + (lock ? '#' : '');
    this.badgeCache = this.badgeCache || {};
    if (this.badgeCache[key]) return this.badgeCache[key];
    const c = document.createElement('canvas'); c.width = 256; c.height = 72; /* etiqueta */ const g = c.getContext('2d');
    const col = this.tierColor(res.ideal);
    g.fillStyle = 'rgba(20,14,8,0.78)'; g.beginPath(); g.roundRect(4, 4, 248, 64, 14); g.fill();
    g.strokeStyle = col; g.lineWidth = 4; g.stroke();
    g.font = '800 34px system-ui, sans-serif'; g.fillStyle = col; g.textAlign = 'left'; g.fillText(tt("Nv ") + res.ideal, 16, 48);
    g.font = '700 26px system-ui, sans-serif'; g.fillStyle = '#ffd34d'; g.textAlign = 'right'; g.fillText(fmt(res.value), 206, 47);
    const cg = g.createRadialGradient(221, 33, 2, 226, 38, 13); cg.addColorStop(0, '#fff2a8'); cg.addColorStop(0.6, '#e0a820'); cg.addColorStop(1, '#8a5a10');
    g.fillStyle = cg; g.beginPath(); g.arc(226, 38, 12, 0, Math.PI * 2); g.fill();
    if (lock) { g.fillStyle = 'rgba(20,14,8,0.6)'; g.fillRect(4, 4, 248, 64); g.font = '800 30px system-ui'; g.textAlign = 'center'; g.fillStyle = '#ff6a5a'; g.fillText('🔒', 140, 47); }
    else if (need) { g.fillStyle = '#8fe07a'; g.font = '800 30px system-ui'; g.textAlign = 'center'; g.fillText('★', 132, 46); }
    const t = new THREE.CanvasTexture(c); this.badgeCache[key] = t; return t;
  },
  syncNodes() {
    this.missT = (this.missT || 0) - 1; if (this.missT <= 0) { this.missT = 20; Game.missCache = Game.missingList(); }
    const P = Game.P, seen = new Set();
    for (const n of World.nodes) {
      const dx = n.x - P.x, dy = n.y - P.y;
      if (dx * dx + dy * dy > 170 * 170) continue;
      seen.add(n);
      let m = this.nodeMeshes.get(n);
      if (m && m.userData.res !== n.res.id) { this.scene.remove(m); if (m.userData.badge) this.scene.remove(m.userData.badge); m = null; }
      if (!m) { m = this.nodeMesh(n); this.scene.add(m); this.nodeMeshes.set(n, m); }
      const k = 0.75 + 0.25 * Math.max(0, n.hp / n.maxHp);
      m.scale.setScalar(k);
      if (n.hitT > 0) m.position.set(m.userData.base.x + (Math.random() - 0.5) * 0.12, m.userData.base.y, m.userData.base.z + (Math.random() - 0.5) * 0.12);
      else m.position.copy(m.userData.base);
      if (m.userData.glow) m.userData.glow.material.opacity = (m.userData.glowMax || 0.85) * (0.65 + Math.sin(this.t * 4 + n.seed) * 0.35);
      if (m.userData.spin) m.userData.spin.rotation.y += 0.02;
      if (m.userData.pulse) m.userData.pulse.scale.setScalar(1 + Math.sin(this.t * 3) * 0.08);
      // etiqueta com nível e valor para recursos por perto
      const d2 = dx * dx + dy * dy, near = d2 < 22 * 22 && d2 > 1.5 * 1.5 && n !== Game.target && Game.S.showBadges !== false && !n.res.wild;
      if (near) {
        const need = (Game.missCache || []).some(x => x.id === n.res.id);
        if (!m.userData.badge) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: true, transparent: true, fog: false, sizeAttenuation: false })); sp.scale.set(0.2, 0.056, 1); sp.renderOrder = 4; m.userData.badge = sp; this.scene.add(sp); }
        const sp = m.userData.badge, tex = this.badgeTex(n.res, need);
        if (sp.material.map !== tex) { sp.material.map = tex; sp.material.needsUpdate = true; }
        sp.position.set(m.userData.base.x, m.userData.base.y + n.r * 1.25 + 0.6, m.userData.base.z); sp.visible = true;
      } else if (m.userData.badge) m.userData.badge.visible = false;
    }
    for (const [n, m] of this.nodeMeshes) if (!seen.has(n) || n.dead) { this.scene.remove(m); if (m.userData.badge) { this.scene.remove(m.userData.badge); m.userData.badge.material.dispose(); } this.nodeMeshes.delete(n); }
  },
  pickTarget(reach) {
    const P = Game.P, o = this.cam.position, dir = new V3(); this.cam.getWorldDirection(dir);
    let best = null, bt = Infinity;
    for (const [n, m] of this.nodeMeshes) {
      const pd = Math.hypot(n.x - P.x, n.y - P.y); if (pd > reach + n.r + 0.6) continue;
      const c = new V3(n.x, m.userData.base.y + n.r * 0.35, n.y), rad = n.r * 0.7;
      const oc = c.clone().sub(o), t = oc.dot(dir); if (t < 0) continue;
      const d2 = oc.lengthSq() - t * t;
      if (d2 < rad * rad && t < bt) { bt = t; best = n; }
    }
    if (best) return best;
    // ajuda de mira: pedra bem na frente
    let bd = 0.86;
    for (const [n] of this.nodeMeshes) {
      const pd = Math.hypot(n.x - P.x, n.y - P.y); if (pd > reach + n.r * 0.6) continue;
      const fx = -Math.sin(P.yaw), fy = -Math.cos(P.yaw), dot = ((n.x - P.x) * fx + (n.y - P.y) * fy) / (pd || 1);
      if (dot > bd) { bd = dot; best = n; }
    }
    return best;
  },

  // ---------- partículas ----------
  buildFx() {
    this.fxMax = 800;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(this.fxMax * 3), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(this.fxMax * 3), 3));
    this.fxPts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.06, vertexColors: true }));
    this.fxPts.frustumCulled = false; this.scene.add(this.fxPts);
  },
  updateFx() {
    const g = this.fxPts.geometry, p = g.attributes.position, c = g.attributes.color, col = new THREE.Color();
    const n = Math.min(this.fxMax, Game.fx.length);
    for (let i = 0; i < n; i++) { const f = Game.fx[i]; p.setXYZ(i, f.x, World.height(f.x, f.y) + f.z, f.y); col.set(f.c); c.setXYZ(i, col.r, col.g, col.b); }
    g.setDrawRange(0, n); p.needsUpdate = c.needsUpdate = true;
  },

  // ---------- martelo (usado na mão e no personagem) ----------
  // martelo girado no próprio cabo: a face de bater fica virada para o alvo (e não de lado)
  hammerInHand(L) { const w = new THREE.Group(), h = this.makeHammer(L); h.rotation.y = Math.PI / 2; w.add(h); w.userData = h.userData; return w; },
  makeHammer(L) {
    const look = hammerLook(L), g = new THREE.Group();
    const len = 0.5 + L * 0.02, hw = 0.07 + L * 0.004, hl = 0.18 + L * 0.011;
    const emi = look.glow ? { emissive: look.glow, emissiveIntensity: 0.35 } : {};
    const handle = mesh(new THREE.CylinderGeometry(0.022 + L * 0.0006, 0.028 + L * 0.0006, len, 6), mat(look.handle), false); handle.position.y = len / 2; g.add(handle);
    let head;
    if (look.type === 'wood' && L <= 3) head = mesh(new THREE.CylinderGeometry(0.035 + L * 0.008, 0.03, 0.18 + L * 0.03, 6), mat(look.head), false), head.position.y = len + 0.05;
    else if (look.type === 'wood') { head = mesh(new THREE.CylinderGeometry(hw * 1.1, hw * 1.1, hl, 8), mat(look.head), false); head.rotation.z = Math.PI / 2; head.position.y = len; }
    else if (look.type === 'stone') { head = mesh(jitterGeo(new THREE.IcosahedronGeometry(hw * 1.5, 0), hw * 0.4, L), mat(look.head), false); head.scale.set(1.5, 1, 1); head.position.y = len; const tie = mesh(new THREE.TorusGeometry(hw * 0.9, 0.012, 4, 8), mat('#6b4a2e'), false); tie.position.y = len; tie.rotation.x = Math.PI / 2; g.add(tie); }
    else if (look.type === 'crystal') { head = mesh(new THREE.OctahedronGeometry(hl * 0.6, 0), mat(look.head, { emissive: look.glow, emissiveIntensity: 0.5, shininess: 120, transparent: true, opacity: 0.9 }), false); head.scale.set(1.5, 0.9, 0.9); head.position.y = len; }
    else if (look.type === 'meteor') { head = mesh(jitterGeo(new THREE.IcosahedronGeometry(hl * 0.55, 1), hl * 0.12, L), mat('#3a3436', { emissive: look.head, emissiveIntensity: 0.45 }), false); head.scale.set(1.4, 0.9, 0.9); head.position.y = len; }
    else if (look.type === 'machine') { head = new THREE.Group(); const b = mesh(new THREE.BoxGeometry(hl * 1.1, hw * 2.2, hw * 2.2), mat(look.head, { shininess: 50 }), false); head.add(b); const bit = mesh(new THREE.CylinderGeometry(hw * 0.35, hw * 0.1, hl * 0.9, 6), mat('#30333a', { shininess: 80 }), false); bit.rotation.z = Math.PI / 2; bit.position.x = hl; head.add(bit); head.position.y = len; }
    else { head = mesh(new THREE.BoxGeometry(hl * (look.type === 'sledge' ? 1.1 : 1), hw * 2, hw * 2), mat(look.head, Object.assign({ shininess: 60, specular: '#666' }, emi)), false); head.position.y = len; if (L >= 35 && L <= 37) { const claw = mesh(new THREE.BoxGeometry(hl * 0.5, hw * 0.6, hw * 1.4), mat(look.head), false); claw.position.set(-hl * 0.6, len + hw * 0.4, 0); claw.rotation.z = 0.5; g.add(claw); } }
    g.add(head); g.userData.headY = len; g.userData.head = head;
    if (L === 60) { // Martelo do Vale: anel de energia e cristais orbitando
      const ring = new THREE.Mesh(new THREE.TorusGeometry(hl * 0.75, 0.018, 6, 28), new THREE.MeshBasicMaterial({ color: '#bff8ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.position.y = len; ring.rotation.x = Math.PI / 2; g.add(ring);
      const orbit = new THREE.Group(); orbit.position.y = len; g.add(orbit);
      ['#7af0ff', '#c06af0', '#ffffff'].forEach((c, i) => { const sh = mesh(new THREE.OctahedronGeometry(0.06, 0), mat(c, { emissive: c, emissiveIntensity: 0.9 }), false); const a = i / 3 * Math.PI * 2; sh.position.set(Math.cos(a) * hl * 1.05, 0, Math.sin(a) * hl * 1.05); orbit.add(sh); });
      g.userData.orbit = orbit; g.userData.ring = ring;
    }
    return g;
  },

  // ---------- visão em primeira pessoa (braço + martelo) ----------
  buildViewModel() {
    this.vmScene = new THREE.Scene();
    this.vmCam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 10);
    this.vmScene.add(new THREE.HemisphereLight('#ffffff', '#6a5a40', 0.6));
    const d = new THREE.DirectionalLight('#fff1d6', 0.55); d.position.set(1, 2, 1); this.vmScene.add(d);
    this.vm = new THREE.Group(); this.vmScene.add(this.vm);
    this.vmGlow = new THREE.PointLight('#7af0ff', 0, 2.5, 2); this.vmGlow.position.set(0.3, -0.2, -0.7); this.vmScene.add(this.vmGlow);
    this.vmFlash = new THREE.PointLight('#ffd27a', 0, 3, 2); this.vmFlash.position.set(0.05, -0.35, -0.9); this.vmScene.add(this.vmFlash);
    this.anim = { t: 0, combo: 0, follow: 0, stop: 0, click: 0, pose: null };
    // seta 3D de objetivo no alto da tela
    const ar = new THREE.Group(), am = new THREE.MeshPhongMaterial({ color: '#ffcf4a', emissive: '#a86a00', emissiveIntensity: 0.5, shininess: 60, flatShading: true });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.018, 0.09), am); shaft.position.z = 0.03; ar.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.075, 4).rotateX(-Math.PI / 2).rotateZ(Math.PI / 4), am); tip.scale.y = 0.4; tip.position.z = -0.045; ar.add(tip);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.095), new THREE.MeshBasicMaterial({ color: '#5a3a00' })); edge.position.set(0, -0.012, 0.03); ar.add(edge);
    this.arrowPivot = new THREE.Group(); this.arrowPivot.position.set(0, 0.22, -0.75); ar.scale.setScalar(0.7); this.arrowPivot.rotation.x = 0.75; this.arrowPivot.add(ar); this.arrow = ar;
    this.vmScene.add(this.arrowPivot);
  },
  updateArrow() {
    const T = Missions.arrowTarget(), P = Game.P, el = document.getElementById('objarrow');
    let show = false;
    if (T && !UI.open && !Game.travel) {
      const dx = T.x - P.x, dy = T.y - P.y, d = Math.hypot(dx, dy);
      if (d > 4) {
        show = true;
        const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw), lf = -dx * sy - dy * cy, lx = dx * cy - dy * sy;
        const want = Math.atan2(-lx, lf);
        let dd = want - this.arrow.rotation.y; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); this.arrow.rotation.y += dd * 0.25;
        this.arrowPivot.position.y = 0.22 + Math.sin(this.t * 3) * 0.004;
        el.textContent = `${T.label} · ${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(1).replace('.', DEC) + tt(" km")}`;
      }
    }
    this.arrowPivot.visible = show; el.style.display = show ? 'block' : 'none';
  },
  rebuildViewModel() {
    const gear = this.gear(), L = Game.S.hammer;
    const sig = L + '|' + gear.glove.era + '|' + gear.glove.lvl + '|' + Game.S.gear.light + Game.S.lightOn;
    if (this.sig.vm === sig) return; this.sig.vm = sig;
    this.vm.clear();
    const arm = new THREE.Group();
    const G = gear.glove, gs = 0.075 + G.era * 0.008;
    const glove = mesh(new THREE.BoxGeometry(gs * 1.2, gs * 1.1, gs * 1.4), mat(G.col, G.era === 6 ? { emissive: '#40d0ff', emissiveIntensity: 0.25 } : {}), false); glove.position.z = -0.02; arm.add(glove); this.vmGlove = glove;
    if (G.era >= 4) { const brace = mesh(new THREE.BoxGeometry(0.13, 0.13, 0.16), mat(G.era === 6 ? '#2a3a48' : '#9aa0a8', { shininess: 60 }), false); brace.position.z = 0.12; arm.add(brace); }
    if (G.era >= 5) { const pis = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 6), mat('#d8dde2', { shininess: 80 }), false); pis.rotation.x = Math.PI / 2; pis.position.set(0.07, 0.05, 0.2); arm.add(pis); }
    const ham = this.hammerInHand(L);
    ham.scale.setScalar(0.42 - L * 0.0035);
    ham.position.set(0, -0.06, 0); ham.rotation.set(-0.45, 0, 0.32);
    // braço e luva um pouco menores para não tampar a pedra
    for (const c of arm.children) { c.scale.multiplyScalar(0.62); c.position.multiplyScalar(0.62); }
    arm.add(ham); this.vmHam = ham;
    this.vmRig = new THREE.Group(); this.vmRig.add(arm);
    this.vmArm = arm; this.vm.add(this.vmRig);
    // manga: sempre liga a mão ao ombro (fora da tela, embaixo à direita), assim o braço nunca parece cortado
    const sg = new THREE.BoxGeometry(0.07, 0.07, 1); sg.translate(0, 0, 0.5);
    this.vmSleeve = mesh(sg, mat('#2c4f68'), false); this.vm.add(this.vmSleeve);
    // ajusta o braço para a batida cair um pouco abaixo da mira
    const hp = new V3(); this.vmCam.updateMatrixWorld(true);
    this.applyVmPose(this.vmPoseAt(0, 0.58));
    for (let it = 0; it < 8; it++) { this.vmRig.updateMatrixWorld(true); ham.userData.head.getWorldPosition(hp); hp.project(this.vmCam); this.vmRig.position.y += (-0.28 - hp.y) * 0.25; this.vmRig.position.x += (0.1 - hp.x) * 0.3; }
    this.vmTorch = null;
    if (Game.S.gear.light === 1) {
      const t = new THREE.Group();
      const hand = mesh(new THREE.BoxGeometry(0.09, 0.08, 0.11), mat(G.col), false); t.add(hand);
      const tor = this.makeTorch(); tor.position.z = -0.1; tor.scale.setScalar(0.9); t.add(tor);
      t.position.set(-0.32, -0.36, -0.55); t.rotation.set(0.05, 0.1, 0);
      this.vm.add(t); this.vmTorch = t;
    }
  },
  // ---------- animação "Combo de três": direita, esquerda e golpe final por cima ----------
  vmPoseAt(combo, t) {
    const R = { x: 0.34, y: -0.4, z: -0.62, rx: 0, ry: -0.12, rz: 0 }, P = o => Object.assign({}, R, o);
    const sm = u => u * u * (3 - 2 * u), ein = u => u * u * u, eout = u => 1 - Math.pow(1 - u, 3);
    const K = this._combo || (this._combo = [
      [[0, P({})], [0.42, P({ x: 0.45, y: -0.33, rx: 0.6, rz: -0.5 }), sm], [0.58, P({ x: 0.16, y: -0.46, rx: -0.85, rz: 0.4, z: -0.68 }), ein], [0.7, P({ x: 0.18, y: -0.44, rx: -0.65, rz: 0.3 }), eout], [1, P({ x: 0.2 }), sm]],
      [[0, P({ x: 0.2 })], [0.42, P({ x: -0.02, y: -0.33, rx: 0.6, ry: 0.4, rz: 0.6 }), sm], [0.58, P({ x: 0.3, y: -0.46, rx: -0.85, ry: -0.3, rz: -0.45, z: -0.68 }), ein], [0.7, P({ x: 0.28, y: -0.44, rx: -0.65, rz: -0.3 }), eout], [1, P({}), sm]],
      [[0, P({})], [0.4, P({ x: 0.22, y: -0.12, z: -0.5, rx: 1.45 }), sm], [0.58, P({ x: 0.2, y: -0.5, z: -0.7, rx: -1.05 }), ein], [0.7, P({ x: 0.22, y: -0.47, rx: -0.85 }), eout], [1, P({}), sm]],
    ]);
    const keys = K[combo % 3];
    let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const [t0, a] = keys[i], [t1, b, ease] = keys[i + 1], u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0))), e = ease(u), o = {};
    for (const k in a) o[k] = a[k] + (b[k] - a[k]) * e;
    return o;
  },
  applyVmPose(p, bob = 0) {
    this.vmArm.position.set(p.x + bob * 0.012, p.y + Math.abs(bob) * 0.015, p.z);
    this.vmArm.rotation.set(p.rx, p.ry, p.rz + bob * 0.03);
  },
  clickSwing() { const A = this.anim; if (!A) return; A.click = 0.07; A.follow = 0; if (A.t < 0.36 || A.t > 0.58) A.t = 0.36; },
  updateViewModel(dt) {
    this.rebuildViewModel();
    const P = Game.P, A = this.anim;
    const bob = P.moving ? Math.sin(P.walkT * (P.sprint ? 2.6 : 2.2)) : 0;
    if (A.stop > 0) A.stop -= dt; // pausa de impacto
    else if (A.follow > 0) { A.follow -= dt; A.t = 0.58 + (1 - Math.max(0, A.follow) / A.followDur) * 0.42; if (A.follow <= 0) A.t = 0; }
    else if (A.click > 0) { A.click -= dt; A.t = Math.min(0.58, A.t + dt / 0.07 * 0.22); }
    else if (Game.mineT > 0 && P.swing > 0.001) A.t = Math.min(0.575, P.swing * 0.58); // segurando: sobe devagar até o golpe
    else A.t = Math.max(0, A.t - dt * 2);
    const want = this.vmPoseAt(A.combo, A.t);
    if (!A.pose) A.pose = want;
    const k = A.follow > 0 || A.click > 0 ? 1 : Math.min(1, dt * 18);
    for (const key in want) A.pose[key] += (want[key] - A.pose[key]) * k;
    this.applyVmPose(A.pose, bob);
    if (this.vmSleeve) {
      this.vmRig.updateMatrixWorld(true);
      const hand = this.vmGlove.getWorldPosition(this._hv || (this._hv = new V3())), sh = this._sh || (this._sh = new V3(0.42, -0.78, 0.25));
      this.vmSleeve.position.copy(hand); this.vmSleeve.lookAt(sh); this.vmSleeve.scale.set(1, 1, hand.distanceTo(sh));
    }
    if (this.vmTorch) this.vmTorch.position.set(-0.32 - bob * 0.01, -0.36 + Math.abs(bob) * 0.012, -0.55);
    // martelo do Vale: cristais girando e brilho pulsando
    const u = this.vmHam && this.vmHam.userData;
    if (u && u.orbit) { u.orbit.rotation.y += dt * 3; u.ring.rotation.z += dt * 1.5; this.vmGlow.intensity = 0.8 + Math.sin(this.t * 4) * 0.3; } else this.vmGlow.intensity = 0;
    this.vmFlash.intensity = Math.max(0, this.vmFlash.intensity - dt * 12);
  },

  // ---------- impacto: lascas, faíscas, clarão e onda de choque (crescem com o martelo) ----------
  buildHitFx() {
    const N = this.hfN = 420;
    this.chips = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff' }), 220);
    this.chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.chips.frustumCulled = false;
    const z = new THREE.Matrix4().makeScale(0, 0, 0), c0 = new THREE.Color('#888');
    for (let i = 0; i < 220; i++) { this.chips.setMatrixAt(i, z); this.chips.setColorAt(i, c0); }
    this.scene.add(this.chips); this.chipD = Array.from({ length: 220 }, () => ({ t: 0 }));
    const tex = canvasTex(32, 32, (g) => { const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); });
    const sg = new THREE.BufferGeometry(); this.spPos = new Float32Array(N * 3); this.spCol = new Float32Array(N * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(this.spPos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(this.spCol, 3));
    this.sparkPts = new THREE.Points(sg, new THREE.PointsMaterial({ map: tex, size: 0.09, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.sparkPts.frustumCulled = false; this.scene.add(this.sparkPts); this.spD = Array.from({ length: N }, () => ({ t: 0 }));
    for (let i = 0; i < N; i++) this.spPos[i * 3 + 1] = -999;
    this.hitLight = new THREE.PointLight('#ffd27a', 0, 7, 2); this.scene.add(this.hitLight);
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#bff8ff', transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.wave); this.waveT = 0; this.hitLightT = 0;
  },
  hitFx(n, o) {
    if (!this.chips) return;
    const L = Game.S.hammer, A = this.anim;
    // combo: cada golpe troca de lado; o terceiro é o golpe final, com mais partículas
    const fin = A && A.combo % 3 === 2;
    if (A) { A.followDur = Math.min(0.26, Math.max(0.12, Game.interval() * (o.click ? 0.3 : 0.25))); A.follow = A.followDur; A.click = 0; A.t = 0.58; A.stop = 0.03 + L / 1200 + (fin ? 0.03 : 0); A.combo = (A.combo + 1) % 3; }
    let power = (fin ? 1.7 : 1) * (o.broke ? 2 : 1) * (o.click ? 0.85 : 1);
    // ponto do impacto: superfície da pedra virada para o jogador
    const P = Game.P, dx = P.x - n.x, dy = P.y - n.y, dd = Math.hypot(dx, dy) || 1, r = n.r * 0.55;
    const ix = n.x + dx / dd * r, iy = n.y + dy / dd * r, iz = World.height(n.x, n.y) + n.r * 0.75;
    const chipCols = [n.res.c, n.res.c2, n.res.c].map(c => new THREE.Color(c));
    const fs = this.fxScale || 1, nChips = Math.round((4 + L * 0.45) * power * fs), nSparks = Math.round((L < 6 ? 0 : 6 + L * 1.25) * power * fs);
    const look = hammerLook(L);
    const sc = new THREE.Color(L >= 51 ? look.head : L >= 31 ? '#ffd27a' : '#ffb24a'), sc2 = new THREE.Color(L >= 51 ? '#ffffff' : '#ff7a2e'), sc3 = new THREE.Color(L >= 58 ? '#c06af0' : sc2);
    let made = 0;
    for (let i = 0; i < 220 && made < nChips; i++) {
      const d = this.chipD[i]; if (d.t > 0) continue; made++;
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * (1.5 + L / 25);
      Object.assign(d, { t: 0.7 + Math.random() * 0.5, x: ix, y: iz, z: iy, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 2.5, vz: Math.sin(a) * sp, s: (0.04 + Math.random() * 0.05) * (1 + L / 80), rx: Math.random() * 6, ry: Math.random() * 6, g: World.height(ix, iy) });
      this.chips.setColorAt(i, chipCols[i % 3]);
    }
    this.chips.instanceColor.needsUpdate = true;
    made = 0;
    for (let i = 0; i < this.hfN && made < nSparks; i++) {
      const d = this.spD[i]; if (d.t > 0) continue; made++;
      const a = Math.random() * Math.PI * 2, el = Math.random() * 1.2, sp = 3 + Math.random() * (2.5 + L / 12);
      d.t0 = d.t = 0.3 + Math.random() * 0.45;
      Object.assign(d, { x: ix, y: iz, z: iy, vx: Math.cos(a) * Math.cos(el) * sp, vy: Math.sin(el) * sp + 1.2, vz: Math.sin(a) * Math.cos(el) * sp, c: Math.random() < 0.25 ? sc2 : Math.random() < 0.2 ? sc3 : sc });
    }
    // clarão, onda de choque e tremida
    if (L >= 10) { this.hitLight.position.set(ix, iz + 0.3, iy); this.hitLight.color.copy(sc); this.hitLightT = 0.14; this.hitLightPow = 0.5 + L / 45 * power; this.vmFlash.color.copy(sc); this.vmFlash.intensity = 0.8 + L / 40; }
    if (L >= 50 || (fin && L >= 35) || (o.broke && L >= 30)) { this.waveT = 0.45; this.wave.position.set(ix, World.height(ix, iy) + 0.08, iy); this.wave.material.color.set(L >= 51 ? look.head : '#ffe2a0'); this.waveSize = 1 + L / 40 * power; }
    Game.shake = Math.min(1, Game.shake + 0.05 * power + L / 400);
    // número do dano
    Game.floats.push({ x: n.x + (Math.random() - 0.5) * 0.8, y: n.y - 0.2, txt: '-' + fmt(Math.round(o.dmg)), c: fin ? '#ffd34d' : '#ffffff', t: 0.8, cls: 'dmg' });
  },
  updateHitFx(dt) {
    if (!this.chips) return;
    const m = this._m || (this._m = new THREE.Matrix4()), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new V3(), sc = new V3(), z = new THREE.Matrix4().makeScale(0, 0, 0);
    let any = false;
    for (let i = 0; i < 220; i++) {
      const d = this.chipD[i];
      if (d.t > 0) {
        any = true; d.t -= dt; d.vy -= 14 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; d.rx += dt * 8; d.ry += dt * 6;
        if (d.y < d.g + 0.03) { d.y = d.g + 0.03; d.vy *= -0.3; d.vx *= 0.5; d.vz *= 0.5; }
        const k = Math.min(1, d.t * 3) * d.s;
        m.compose(v.set(d.x, d.y, d.z), q.setFromEuler(e.set(d.rx, d.ry, 0)), sc.set(k, k, k)); this.chips.setMatrixAt(i, m);
        if (d.t <= 0) this.chips.setMatrixAt(i, z);
      }
    }
    if (any) this.chips.instanceMatrix.needsUpdate = true;
    let anyS = false;
    for (let i = 0; i < this.hfN; i++) {
      const d = this.spD[i], j = i * 3;
      if (d.t > 0) {
        anyS = true; d.t -= dt; d.vy -= 9 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        const f = Math.max(0, d.t / d.t0);
        this.spPos[j] = d.x; this.spPos[j + 1] = d.t > 0 ? d.y : -999; this.spPos[j + 2] = d.z;
        const ff = f * 0.85; this.spCol[j] = d.c.r * ff; this.spCol[j + 1] = d.c.g * ff; this.spCol[j + 2] = d.c.b * ff;
      }
    }
    if (anyS || this._spWas) { this.sparkPts.geometry.attributes.position.needsUpdate = this.sparkPts.geometry.attributes.color.needsUpdate = true; }
    this._spWas = anyS;
    this.sparkPts.material.size = 0.045 + Game.S.hammer / 1600;
    this.hitLightT = Math.max(0, this.hitLightT - dt); this.hitLight.intensity = this.hitLightT > 0 ? (this.hitLightT / 0.14) * this.hitLightPow : 0;
    this.waveT = Math.max(0, this.waveT - dt); const wk = this.waveT / 0.45;
    this.wave.material.opacity = wk * 0.55; this.wave.scale.setScalar(0.3 + (1 - wk) * (this.waveSize || 2)); this.wave.visible = this.waveT > 0;
  },

  // ---------- personagem (terceira pessoa e pés na primeira) ----------
  gear(A = Game.S.attrs) {
    const tint = (base, lvl) => '#' + new THREE.Color(base).offsetHSL(0, 0, ((lvl - 1) % 10) * 0.012).getHexString();
    const bagE = eraOf(A.bag), mineE = eraOf(A.mine), moveE = eraOf(A.move), jumpE = eraOf(A.jump);
    return {
      bag: { era: bagE, size: 0.5 + A.bag * 0.014, col: tint(['#d8c9a8', '#7a5232', '#8a8458', '#b89a5e', '#d0702a', '#3a3f48'][bagE - 1], A.bag), strap: ['#a89878', '#4a3020', '#5a5638', '#7a5e30', '#5a5f66', '#22262c'][bagE - 1], lvl: A.bag },
      glove: { era: mineE, col: tint(['#d7a07a', '#7a4f2e', '#4f3320', '#8a9098', '#c9a020', '#2a3a48'][mineE - 1], A.mine), lvl: A.mine },
      boot: { era: moveE, col: tint(['#c99472', '#c8b08a', '#6b4428', '#33302c', '#a8adb4', '#2a2f3a'][moveE - 1], A.move), sole: ['#c99472', '#8a7458', '#3a2414', '#e0702a', '#55606a', '#40d0ff'][moveE - 1], lvl: A.move },
      leg: { era: jumpE, col: tint(['#4a4a52', '#7a5232', '#5a5a64', '#9aa0a8', '#c9a020', '#40d0ff'][jumpE - 1], A.jump), lvl: A.jump },
    };
  },
  charState(over = {}) {
    const S = Game.S;
    return Object.assign({ hammer: S.hammer, attrs: Object.assign({}, S.attrs), gear: Object.assign({}, S.gear), riding: S.riding, lightOn: S.lightOn, detOn: S.detOn, pw: S.pw.slice() }, over);
  },
  tag(o, part) { o.userData.part = part; return o; },

  // ---------- modelos dos equipamentos ----------
  makeSkate() {
    const sk = new THREE.Group();
    const base = mesh(new THREE.BoxGeometry(0.26, 0.05, 0.44), mat('#d0303a')); sk.add(base);
    const cuff = mesh(new THREE.BoxGeometry(0.27, 0.16, 0.2), mat('#f0f0f0')); cuff.position.set(0, 0.1, 0.08); sk.add(cuff);
    for (const z of [-0.15, 0.15]) for (const x of [-0.08, 0.08]) { const w = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 10), mat('#ffd34d')); w.rotation.z = Math.PI / 2; w.position.set(x, -0.05, z); sk.add(w); }
    const stop = mesh(new THREE.BoxGeometry(0.08, 0.06, 0.06), mat('#222')); stop.position.set(0, -0.04, -0.25); sk.add(stop);
    return sk;
  },
  makeRide(lv) {
    const r = new THREE.Group();
    if (lv === 1) { const a = this.makeSkate(), b = this.makeSkate(); a.position.x = -0.16; b.position.x = 0.16; r.add(a, b); r.position.y = 0.07; }
    else if (lv === 2) {
      const deck = mesh(new THREE.BoxGeometry(0.26, 0.05, 0.95), mat('#2f8fd0')); deck.position.y = 0.06; r.add(deck);
      const grip = mesh(new THREE.BoxGeometry(0.2, 0.052, 0.7), mat('#1a1a1a')); grip.position.set(0, 0.062, 0.05); r.add(grip);
      const stem = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), mat('#aab0b6', { shininess: 70 })); stem.position.set(0, 0.55, -0.45); stem.rotation.x = 0.12; r.add(stem);
      const bar = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), mat('#222')); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.03, -0.5); r.add(bar);
      for (const x of [-0.25, 0.25]) { const h = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 6), mat('#e04040')); h.rotation.z = Math.PI / 2; h.position.set(x, 1.03, -0.5); r.add(h); }
      for (const z of [-0.42, 0.42]) { const w = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10), mat('#222')); w.rotation.z = Math.PI / 2; w.position.set(0, 0.04, z); r.add(w); }
      r.position.y = -0.12;
    } else if (lv === 3) {
      const wheel = mesh(new THREE.TorusGeometry(0.34, 0.09, 6, 14), mat('#1f1f22')); wheel.rotation.y = Math.PI / 2; wheel.position.y = -0.3; r.add(wheel); r.userData.wheel = wheel;
      const hub = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 10), mat('#ff7a1a', { emissive: '#ff7a1a', emissiveIntensity: 0.3 })); hub.rotation.z = Math.PI / 2; hub.position.y = -0.3; r.add(hub);
      const shell = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 12, 1, true, -Math.PI / 2, Math.PI), mat('#f2f2f2', { side: THREE.DoubleSide })); shell.rotation.z = Math.PI / 2; shell.position.y = -0.3; r.add(shell);
      for (const x of [-0.18, 0.18]) { const pad = mesh(new THREE.BoxGeometry(0.16, 0.04, 0.3), mat('#333')); pad.position.set(x, -0.27, 0); r.add(pad); }
    } else {
      const board = mesh(new THREE.BoxGeometry(0.42, 0.08, 1.35), mat('#e0408a', { shininess: 90 })); board.position.y = -0.36; r.add(board);
      const nose = mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.08, 12, 1, false, 0, Math.PI), mat('#e0408a', { shininess: 90 })); nose.position.set(0, -0.36, -0.675); nose.rotation.y = Math.PI / 2; r.add(nose);
      const stripe = mesh(new THREE.BoxGeometry(0.43, 0.085, 0.3), mat('#40e0ff', { emissive: '#40e0ff', emissiveIntensity: 0.6 })); stripe.position.y = -0.36; r.add(stripe);
      for (const z of [-0.45, 0.45]) { const pad = mesh(new THREE.BoxGeometry(0.3, 0.04, 0.22), mat('#ffd34d', { emissive: '#ffd34d', emissiveIntensity: 0.4 })); pad.position.set(0, -0.42, z); r.add(pad); }
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#40e0ff', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })); glow.position.y = -0.45; r.add(glow);
    }
    return r;
  },
  makeTorch() {
    const t = new THREE.Group();
    const body = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.26, 10), mat('#2a2a2e', { shininess: 60 }), false); body.rotation.x = Math.PI / 2; t.add(body);
    const head = mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.08, 10), mat('#c9a020', { shininess: 80 }), false); head.rotation.x = Math.PI / 2; head.position.z = -0.16; t.add(head);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), new THREE.MeshBasicMaterial({ color: '#fff6d0' })); lens.position.z = -0.201; lens.rotation.y = Math.PI; t.add(lens);
    const btn = mesh(new THREE.BoxGeometry(0.02, 0.015, 0.04), mat('#e04040'), false); btn.position.set(0, 0.035, 0); t.add(btn);
    return t;
  },
  makeHeadlamp(on = true) {
    const g = new THREE.Group();
    const band = mesh(new THREE.TorusGeometry(0.21, 0.025, 4, 16), mat('#222')); band.rotation.x = Math.PI / 2; g.add(band);
    const box = mesh(new THREE.BoxGeometry(0.13, 0.09, 0.07), mat('#e0a020')); box.position.z = -0.23; g.add(box);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), new THREE.MeshBasicMaterial({ color: on ? '#fff6d0' : '#666' })); lens.position.z = -0.266; lens.rotation.y = Math.PI; g.add(lens);
    return g;
  },
  makeDrone() {
    const d = new THREE.Group();
    const body = mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), mat('#2a2f36', { shininess: 60 }), false); d.add(body);
    for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) {
      const arm = mesh(new THREE.BoxGeometry(0.05, 0.04, 0.5), mat('#3a3f48'), false); arm.position.set(x / 2, 0, z / 2); arm.rotation.y = Math.atan2(x, z); d.add(arm);
      const r = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#9aa0a6', transparent: true, opacity: 0.45, side: THREE.DoubleSide })); r.position.set(x, 0.09, z); d.add(r);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' })); lamp.position.y = -0.1; d.add(lamp);
    return d;
  },
  // ---------- robô auto-minerador: bonequinho com hélice na cabeça ----------
  makeRobot(i = 0) {
    const cols = ['#e8a33a', '#4aa3df', '#e2574c', '#6cc070', '#b07ad8', '#f0d04a', '#ef8bb2', '#45c4b0', '#d9824a', '#9aa7b8'];
    const acc = cols[i % cols.length], metal = mat('#c9ccd1', { shininess: 70, specular: '#aaa' }), dark = mat('#2b2f36', { shininess: 30 });
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const legs = [];
    for (const sx of [-0.11, 0.11]) {
      const L = new THREE.Group(); L.position.set(sx, 0.32, 0);
      const leg = mesh(new THREE.BoxGeometry(0.11, 0.26, 0.11), dark); leg.position.y = -0.13; L.add(leg);
      const foot = mesh(new THREE.BoxGeometry(0.15, 0.07, 0.2), mat(acc)); foot.position.set(0, -0.28, 0.03); L.add(foot);
      body.add(L); legs.push(L);
    }
    const torso = mesh(new THREE.BoxGeometry(0.44, 0.38, 0.32), mat(acc, { shininess: 50, specular: '#666' })); torso.position.y = 0.52; body.add(torso);
    const belly = mesh(new THREE.BoxGeometry(0.26, 0.2, 0.02), metal, false); belly.position.set(0, 0.52, 0.17); body.add(belly);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: '#7dff9a' })); led.position.set(0.08, 0.57, 0.185); body.add(led);
    const neck = mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.06, 8), dark); neck.position.y = 0.74; body.add(neck);
    const head = new THREE.Group(); head.position.y = 0.9; body.add(head);
    head.add(mesh(new THREE.BoxGeometry(0.4, 0.28, 0.34), metal));
    const visor = mesh(new THREE.BoxGeometry(0.32, 0.13, 0.02), mat('#14181e', { shininess: 90 }), false); visor.position.set(0, 0.01, 0.175); head.add(visor);
    const eyeM = new THREE.MeshBasicMaterial({ color: '#6ff3ff' });
    for (const ex of [-0.075, 0.075]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 6), eyeM); e.position.set(ex, 0.01, 0.188); head.add(e); }
    for (const ex of [-0.21, 0.21]) { const ear = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10).rotateZ(Math.PI / 2), mat(acc)); ear.position.x = ex; head.add(ear); }
    // hélice
    const mast = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 6), dark); mast.position.y = 0.21; head.add(mast);
    const rotor = new THREE.Group(); rotor.position.y = 0.29; head.add(rotor);
    rotor.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), mat('#f0d04a', { shininess: 60 })));
    for (const [c, a] of [['#e2574c', 0], ['#4aa3df', Math.PI]]) { const b = mesh(new THREE.BoxGeometry(0.36, 0.018, 0.08), mat(c), false); b.position.x = Math.cos(a) * 0.2; b.rotation.x = a ? -0.25 : 0.25; rotor.add(b); }
    // braços: o direito segura uma picareta
    const arms = [];
    for (const sx of [-0.27, 0.27]) {
      const A = new THREE.Group(); A.position.set(sx, 0.66, 0);
      const arm = mesh(new THREE.BoxGeometry(0.09, 0.28, 0.09), dark); arm.position.y = -0.13; A.add(arm);
      const hand = mesh(new THREE.SphereGeometry(0.06, 8, 6), metal); hand.position.y = -0.29; A.add(hand);
      body.add(A); arms.push(A);
    }
    const pick = new THREE.Group(); pick.position.set(0, -0.29, 0.02); arms[1].add(pick);
    const hnd = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.36, 6), mat('#7a5a3a')); hnd.rotation.x = Math.PI / 2; hnd.position.z = 0.14; pick.add(hnd);
    const headP = mesh(new THREE.BoxGeometry(0.06, 0.26, 0.05), metal); headP.position.z = 0.3; pick.add(headP);
    // cestinho nas costas com a carga
    const basket = mesh(new THREE.BoxGeometry(0.32, 0.2, 0.14), mat('#8a6a40')); basket.position.set(0, 0.56, -0.24); body.add(basket);
    const load = mesh(new THREE.IcosahedronGeometry(0.12, 0), mat('#999')); load.position.set(0, 0.7, -0.24); load.visible = false; body.add(load);
    g.userData = { body, legs, arms, rotor, load, acc };
    return g;
  },
  robotImg(n) {
    const key = 'r|' + n;
    if (this.thumbCache[key]) return this.thumbCache[key];
    const grp = new THREE.Group();
    for (let i = 0; i < n; i++) {
      const r = this.makeRobot(i), row = Math.floor(i / 4), col = i % 4, inRow = Math.min(4, n - row * 4);
      r.position.set((col - (inRow - 1) / 2) * 0.62, 0, -row * 0.7); r.rotation.y = (Math.random() - 0.5) * 0.5;
      r.userData.rotor.rotation.y = i; grp.add(r);
    }
    return (this.thumbCache[key] = this.snap(grp, new V3(0.5, 0.45, 1)));
  },
  updateRobots(dt) {
    const L = Robots.list;
    this.robotMeshes = this.robotMeshes || [];
    while (this.robotMeshes.length < L.length) { const m = this.makeRobot(this.robotMeshes.length); this.scene.add(m); this.robotMeshes.push(m); }
    while (this.robotMeshes.length > L.length) this.scene.remove(this.robotMeshes.pop());
    L.forEach((r, i) => {
      const m = this.robotMeshes[i], u = m.userData;
      const hover = r.z > 0.05;
      m.position.set(r.x, World.height(r.x, r.y) + r.z + (hover ? Math.sin(this.t * 6 + i) * 0.05 : 0), r.y);
      let dy = r.yaw - m.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); m.rotation.y += dy * Math.min(1, dt * 10);
      const w = r.moving && !hover ? Math.sin(r.walkT * 2.2) * 0.7 : 0;
      u.legs[0].rotation.x = w; u.legs[1].rotation.x = -w;
      u.arms[0].rotation.x = -w * 0.8;
      const sw = r.swing, raise = sw > 0.6 ? (1 - sw) / 0.4 : sw / 0.6; // levanta e desce a picareta
      u.arms[1].rotation.x = r.st === 'mine' ? -raise * 2.2 : w * 0.8;
      u.body.position.y = r.moving && !hover ? Math.abs(Math.sin(r.walkT * 2.2)) * 0.04 : 0;
      u.rotor.rotation.y += dt * (hover ? 30 : r.moving ? 14 : 6);
      const carry = Object.keys(r.carry)[0];
      u.load.visible = !!carry;
      if (carry && u.loadId !== carry) { u.load.material = mat(RES[carry].c); u.loadId = carry; }
      if (carry) u.load.scale.setScalar(0.6 + Math.min(1, r.n / Robots.cap()) * 0.8);
    });
  },
  makeLightItem(lv) {
    if (lv === 1) return this.makeTorch();
    if (lv === 2) return this.makeHeadlamp(true);
    const g = new THREE.Group(), n = lv === 4 ? 3 : 1;
    for (let i = 0; i < n; i++) { const d = this.makeDrone(); d.position.set((i - (n - 1) / 2) * 0.75, i === 1 ? 0.25 : 0, i === 1 ? -0.3 : 0); g.add(d); }
    return g;
  },
  makeDetector(lv) {
    const g = new THREE.Group();
    if (lv === 1) {
      const box = mesh(new THREE.BoxGeometry(0.16, 0.22, 0.06), mat('#d8c070')); g.add(box);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.08), new THREE.MeshBasicMaterial({ color: '#7fd36a' })); scr.position.set(0, 0.04, -0.031); scr.rotation.y = Math.PI; g.add(scr);
      const dial = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 10), mat('#333')); dial.rotation.x = Math.PI / 2; dial.position.set(0, -0.06, -0.035); g.add(dial);
      const ant = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 4), mat('#aaa', { shininess: 80 })); ant.position.set(0.05, 0.22, 0); g.add(ant);
      const tip = mesh(new THREE.SphereGeometry(0.015, 6, 4), mat('#e04040')); tip.position.set(0.05, 0.33, 0); g.add(tip);
    } else if (lv === 2) {
      const pole = mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.1, 6), mat('#9aa0a8', { shininess: 70 })); pole.position.y = 0.55; g.add(pole);
      const coil = mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 16), mat('#2a2a2e')); coil.rotation.x = Math.PI / 2; coil.position.set(0, 0, -0.08); g.add(coil);
      const plate = mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 16), mat('#e0a020')); plate.position.set(0, 0, -0.08); g.add(plate);
      const ctrl = mesh(new THREE.BoxGeometry(0.12, 0.08, 0.16), mat('#2a2a2e')); ctrl.position.set(0, 0.85, 0.05); g.add(ctrl);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.05), new THREE.MeshBasicMaterial({ color: '#7fd36a' })); scr.position.set(0, 0.891, 0.05); scr.rotation.x = -Math.PI / 2; g.add(scr);
      const grip = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 6), mat('#222')); grip.position.set(0, 1.05, 0); g.add(grip);
    } else {
      const dish = mesh(new THREE.SphereGeometry(0.22, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3), mat('#e8eef4', { side: THREE.DoubleSide, shininess: 80 })); dish.rotation.x = Math.PI * 0.75; g.add(dish);
      const feed = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 4), mat('#888')); feed.position.set(0, 0.06, -0.08); feed.rotation.x = -0.8; g.add(feed);
      const lnb = mesh(new THREE.BoxGeometry(0.04, 0.04, 0.05), mat('#40d0ff', { emissive: '#40d0ff', emissiveIntensity: 0.6 })); lnb.position.set(0, 0.13, -0.16); g.add(lnb);
      const mast = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 6), mat('#555')); mast.position.y = -0.18; g.add(mast);
      const tab = new THREE.Group(); tab.position.set(0.4, -0.2, 0);
      const tb = mesh(new THREE.BoxGeometry(0.2, 0.03, 0.14), mat('#22262c')); tab.add(tb);
      const ts = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.11), new THREE.MeshBasicMaterial({ color: '#40d0ff' })); ts.rotation.x = -Math.PI / 2; ts.position.y = 0.016; tab.add(ts);
      g.add(tab); g.userData.tablet = tab;
    }
    return g;
  },
  makeFlask(id, scale = 1) {
    const g = new THREE.Group(), c = POWERUPS[id].color;
    const glass = mesh(new THREE.SphereGeometry(0.1 * scale, 10, 8), mat('#dfe8ec', { transparent: true, opacity: 0.45, shininess: 100 }), false); g.add(glass);
    const liq = mesh(new THREE.SphereGeometry(0.085 * scale, 10, 8, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), mat(c, { emissive: c, emissiveIntensity: 0.35 }), false); g.add(liq);
    const neck = mesh(new THREE.CylinderGeometry(0.03 * scale, 0.04 * scale, 0.09 * scale, 8), mat('#dfe8ec', { transparent: true, opacity: 0.5 }), false); neck.position.y = 0.12 * scale; g.add(neck);
    const cork = mesh(new THREE.CylinderGeometry(0.033 * scale, 0.03 * scale, 0.05 * scale, 8), mat('#8a6a44'), false); cork.position.y = 0.18 * scale; g.add(cork);
    if (id === 'elixir') { const star = mesh(new THREE.OctahedronGeometry(0.03 * scale, 0), mat('#fff', { emissive: '#ffd34d', emissiveIntensity: 1 }), false); star.position.y = 0.23 * scale; g.add(star); }
    return g;
  },

  // peças da Tropeira em destaque (para a loja)
  makeGloveItem(G) {
    const g = new THREE.Group(), m = mat(G.col, G.era === 6 ? { emissive: '#40d0ff', emissiveIntensity: 0.25 } : {});
    const palm = mesh(new THREE.BoxGeometry(0.34, 0.36, 0.12), m, false); g.add(palm);
    for (let i = 0; i < 4; i++) { const f = mesh(new THREE.BoxGeometry(0.075, 0.22 - Math.abs(i - 1.5) * 0.03, 0.1), m, false); f.position.set(-0.12 + i * 0.08, 0.28 - Math.abs(i - 1.5) * 0.015, 0); g.add(f); }
    const th = mesh(new THREE.BoxGeometry(0.08, 0.18, 0.1), m, false); th.position.set(0.21, 0.02, 0); th.rotation.z = -0.6; g.add(th);
    const cuff = mesh(new THREE.BoxGeometry(0.38, 0.14, 0.15), mat(new THREE.Color(G.col).offsetHSL(0, 0, -0.12).getStyle()), false); cuff.position.y = -0.24; g.add(cuff);
    if (G.era >= 2) for (let i = 0; i < 3; i++) { const st = mesh(new THREE.BoxGeometry(0.3, 0.012, 0.125), mat('#2a1a10'), false); st.position.set(0, -0.08 + i * 0.09, 0); g.add(st); }
    if (G.era >= 4) { const br = mesh(new THREE.BoxGeometry(0.4, 0.2, 0.17), mat(G.era === 6 ? '#2a3a48' : '#9aa0a8', { shininess: 70 }), false); br.position.y = -0.4; g.add(br); }
    if (G.era >= 5) for (const x of [-0.12, 0.12]) { const pis = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), mat('#d8dde2', { shininess: 90 }), false); pis.position.set(x, -0.15, 0.09); g.add(pis); }
    if (G.era === 6) { const led = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.01), new THREE.MeshBasicMaterial({ color: '#40d0ff' })); led.position.set(0, -0.4, 0.09); g.add(led); }
    return g;
  },
  makeBootItem(B) {
    const g = new THREE.Group();
    for (const x of [-0.2, 0.2]) {
      const b = new THREE.Group(); b.position.x = x;
      const tall = B.era >= 3 ? 0.32 : B.era === 1 ? 0.05 : 0.12;
      const sole = mesh(new THREE.BoxGeometry(0.28, 0.06, 0.48), mat(B.sole, B.era === 6 ? { emissive: B.sole, emissiveIntensity: 0.8 } : {}), false); b.add(sole);
      const up = mesh(new THREE.BoxGeometry(0.26, 0.12 + tall, 0.3), mat(B.col), false); up.position.set(0, 0.06 + (0.12 + tall) / 2, 0.07); b.add(up);
      const toe = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.26, 10, 1, false, 0, Math.PI), mat(B.col), false); toe.rotation.z = Math.PI / 2; toe.rotation.y = Math.PI / 2; toe.position.set(0, 0.06, -0.08); toe.scale.set(1, 1, 0.8); b.add(toe);
      if (B.era >= 3) for (let i = 0; i < 3; i++) { const l = mesh(new THREE.BoxGeometry(0.16, 0.015, 0.02), mat('#e8e0c8'), false); l.position.set(0, 0.16 + i * 0.08, -0.085); b.add(l); }
      if (B.era === 5) { const sp = mesh(new THREE.TorusGeometry(0.06, 0.02, 4, 8), mat('#d8dde2', { shininess: 80 }), false); sp.position.set(0, -0.05, 0.12); sp.rotation.y = Math.PI / 2; b.add(sp); }
      if (B.era === 6) { const jet = mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.1, 8), mat('#40d0ff', { emissive: '#40d0ff', emissiveIntensity: 0.9 }), false); jet.position.set(0, -0.06, 0.15); b.add(jet); }
      g.add(b);
    }
    return g;
  },
  makeKneeItem(J) {
    const g = new THREE.Group();
    for (const x of [-0.2, 0.2]) {
      const k = new THREE.Group(); k.position.x = x;
      const legp = mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), mat('#3d4250', { transparent: true, opacity: 0.35 }), false); k.add(legp);
      if (J.era === 1) { const w = mesh(new THREE.BoxGeometry(0.22, 0.1, 0.24), mat('#a89070'), false); k.add(w); }
      else { const kp = mesh(new THREE.BoxGeometry(0.24, J.era >= 4 ? 0.3 : 0.2, 0.1), mat(J.col, J.era === 6 ? { emissive: J.col, emissiveIntensity: 0.4 } : { shininess: J.era >= 4 ? 60 : 8 }), false); kp.position.z = -0.14; k.add(kp);
        for (const y of [-0.08, 0.08]) { const st = mesh(new THREE.BoxGeometry(0.235, 0.035, 0.235), mat('#2a2a2e'), false); st.position.y = y; k.add(st); } }
      if (J.era >= 4) { const spr = new THREE.Group(); for (let i = 0; i < 6; i++) { const c = mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 10), mat(J.col, { shininess: 90 }), false); c.rotation.x = Math.PI / 2; c.position.y = -0.3 + i * 0.05; spr.add(c); } spr.position.set(x > 0 ? 0.13 : -0.13, 0, 0.05); k.add(spr); }
      g.add(k);
    }
    return g;
  },

  // monta o personagem completo a partir de um estado (jogador ou prévia da loja)
  buildCharacter(st) {
    const gear = this.gear(st.attrs), L = st.hammer, out = { g: new THREE.Group(), legs: [] }, g = out.g;
    for (const s of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(s * 0.14, 0.9, 0);
      const pant = mesh(new THREE.BoxGeometry(0.22, 0.8, 0.24), mat('#3d4250')); pant.position.y = -0.4; leg.add(pant);
      const B = gear.boot, bh = B.era >= 3 ? 0.28 : 0.12;
      const boot = this.tag(mesh(new THREE.BoxGeometry(0.25, bh, 0.38), mat(B.col, B.era === 6 ? { emissive: '#40d0ff', emissiveIntensity: 0.2 } : {})), 'move'); boot.position.set(0, -0.86 + bh / 2, -0.05); leg.add(boot);
      const sole = this.tag(mesh(new THREE.BoxGeometry(0.26, 0.05, 0.4), mat(B.sole, B.era === 6 ? { emissive: B.sole, emissiveIntensity: 0.8 } : {})), 'move'); sole.position.set(0, -0.88, -0.05); leg.add(sole);
      if (B.era === 5) { const sp = this.tag(mesh(new THREE.TorusGeometry(0.07, 0.02, 4, 8), mat('#d8dde2', { shininess: 80 })), 'move'); sp.position.set(0, -0.93, 0.08); sp.rotation.y = Math.PI / 2; leg.add(sp); }
      const J = gear.leg;
      if (J.era >= 2) { const kp = this.tag(mesh(new THREE.BoxGeometry(0.25, J.era >= 4 ? 0.3 : 0.18, 0.1), mat(J.col, J.era === 6 ? { emissive: J.col, emissiveIntensity: 0.4 } : { shininess: J.era >= 4 ? 60 : 8 })), 'jump'); kp.position.set(0, -0.42, -0.13); leg.add(kp); }
      if (J.era >= 4) { const spr = this.tag(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), mat(J.col, { shininess: 80 })), 'jump'); spr.position.set(s * 0.12, -0.6, 0.05); leg.add(spr); }
      if (J.era === 1) { const wrap = this.tag(mesh(new THREE.BoxGeometry(0.235, 0.08, 0.25), mat('#a89070')), 'jump'); wrap.position.y = -0.62; leg.add(wrap); }
      g.add(leg); out.legs.push(leg);
    }
    const body = new THREE.Group(); g.add(body); out.body = body;
    const torso = mesh(new THREE.BoxGeometry(0.6, 0.72, 0.34), mat('#3e6b8a')); torso.position.y = 1.28; body.add(torso);
    const belt = mesh(new THREE.BoxGeometry(0.62, 0.1, 0.36), mat('#5a3d24')); belt.position.y = 0.95; body.add(belt);
    const head = this.tag(mesh(new THREE.BoxGeometry(0.38, 0.4, 0.38), mat('#d4a17a')), 'head'); head.position.y = 1.86; body.add(head);
    for (const x of [-0.08, 0.08]) { const eye = this.tag(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.01), mat('#2a1a10'), false), 'head'); eye.position.set(x, 1.88, -0.195); body.add(eye); }
    const hair = this.tag(mesh(new THREE.BoxGeometry(0.4, 0.14, 0.4), mat('#4a2e1a')), 'head'); hair.position.y = 2.08; body.add(hair);
    const hairB = this.tag(mesh(new THREE.BoxGeometry(0.4, 0.3, 0.08), mat('#4a2e1a')), 'head'); hairB.position.set(0, 1.93, 0.17); body.add(hairB);
    // mochila
    const B = gear.bag, s = B.size, bag = new THREE.Group(); bag.position.set(0, 1.3 + (s - 0.5) * 0.4, 0.17 + s * 0.3);
    let bgeo;
    if (B.era === 1) bgeo = jitterGeo(new THREE.SphereGeometry(s * 0.5, 7, 5), 0.04, 1);
    else if (B.era === 2) bgeo = new THREE.BoxGeometry(s * 0.8, s * 0.7, s * 0.5);
    else if (B.era === 3) bgeo = new THREE.BoxGeometry(s * 0.8, s * 1.1, s * 0.55);
    else if (B.era === 4) bgeo = new THREE.CylinderGeometry(s * 0.5, s * 0.38, s * 1.2, 8);
    else bgeo = new THREE.BoxGeometry(s * 0.85, s * 1.3, s * 0.6);
    bag.add(this.tag(mesh(bgeo, mat(B.col)), 'bag'));
    for (const x of [-0.18, 0.18]) { const strap = this.tag(mesh(new THREE.BoxGeometry(0.06, 0.6, 0.03), mat(B.strap)), 'strap'); strap.position.set(x, 1.28, -0.175); body.add(strap); }
    if (B.era >= 5) { const fr = this.tag(mesh(new THREE.BoxGeometry(s * 0.95, s * 1.45, 0.05), mat(B.era === 6 ? '#22262c' : '#8a9098', { shininess: 60 })), 'bag'); fr.position.z = -s * 0.32; bag.add(fr); }
    if (B.era === 6) for (let i = 0; i < 3; i++) { const li = this.tag(new THREE.Mesh(new THREE.BoxGeometry(s * 0.2, 0.04, 0.02), new THREE.MeshBasicMaterial({ color: '#40d0ff' })), 'bag'); li.position.set(-s * 0.2, -s * 0.4 + i * s * 0.4, s * 0.31); bag.add(li); }
    for (let i = 0; i < (B.lvl - 1) % 10; i++) { const rv = this.tag(mesh(new THREE.SphereGeometry(0.02, 4, 3), mat('#e8d8a8', { shininess: 80 }), false), 'bag'); rv.position.set(-s * 0.3 + (i % 5) * s * 0.15, -s * 0.25 - Math.floor(i / 5) * 0.06, s * 0.28); bag.add(rv); }
    body.add(bag);
    // frascos de power-up pendurados na mochila
    (st.pw || []).slice(0, 6).forEach((p, i) => { const f = this.tag(this.makeFlask(p.id, 0.8), 'pw_' + p.id); f.position.set((i % 2 ? 1 : -1) * (s * 0.45 + 0.06), -s * 0.1 - Math.floor(i / 2) * 0.17, 0); bag.add(f); });
    // braço com martelo
    const arm = new THREE.Group(); arm.position.set(0.4, 1.55, 0); body.add(arm); out.arm = arm;
    { const up = mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), mat('#3e6b8a')); up.position.y = -0.3; arm.add(up); }
    const G = gear.glove;
    const gl = this.tag(mesh(new THREE.BoxGeometry(0.17 + G.era * 0.012, 0.16, 0.2), mat(G.col, G.era === 6 ? { emissive: '#40d0ff', emissiveIntensity: 0.25 } : {})), 'mine'); gl.position.y = -0.64; arm.add(gl);
    if (G.era >= 4) { const br = this.tag(mesh(new THREE.BoxGeometry(0.19, 0.16, 0.21), mat(G.era === 6 ? '#2a3a48' : '#9aa0a8', { shininess: 60 })), 'mine'); br.position.y = -0.45; arm.add(br); }
    const ham = this.tag(this.hammerInHand(L), 'hammer'); ham.position.y = -0.64; ham.rotation.x = -Math.PI / 2; arm.add(ham); ham.traverse(o => { if (o.isMesh) o.userData.part = 'hammer'; });
    const arm2 = new THREE.Group(); arm2.position.set(-0.4, 1.55, 0); body.add(arm2);
    { const up2 = mesh(new THREE.BoxGeometry(0.16, 0.65, 0.18), mat('#3e6b8a')); up2.position.y = -0.32; arm2.add(up2); }
    const gl2 = this.tag(mesh(new THREE.BoxGeometry(0.17 + G.era * 0.012, 0.16, 0.2), mat(G.col)), 'mine'); gl2.position.y = -0.66; arm2.add(gl2);
    // iluminação
    const lv = st.gear.light;
    if (lv === 1) { const t = this.tag(this.makeTorch(), 'light'); t.position.set(0, -0.7, -0.08); arm2.add(t); arm2.rotation.x = -0.5; }
    if (lv >= 2) { const hl = this.tag(this.makeHeadlamp(st.lightOn), 'light'); hl.position.y = 1.95; body.add(hl); }
    if (lv >= 3 && st.preview) { const n = lv === 4 ? 3 : 1; for (let i = 0; i < n; i++) { const d = this.tag(this.makeDrone(), 'light'); d.scale.setScalar(0.8); d.position.set((i - (n - 1) / 2) * 1.1, 2.7 + (i === 1 ? 0.25 : 0), 0.3); g.add(d); } }
    // detector
    const dl = st.gear.detector;
    if (dl === 1) { const d = this.tag(this.makeDetector(1), 'detector'); d.position.set(-0.33, 0.95, -0.05); d.rotation.y = Math.PI / 2; d.scale.setScalar(0.9); body.add(d); }
    if (dl === 2) { const d = this.tag(this.makeDetector(2), 'detector'); d.position.set(-0.36, 0.55, 0.32); d.rotation.set(0.5, 0, 0.35); d.scale.setScalar(0.9); body.add(d); }
    if (dl === 3) { const d = this.tag(this.makeDetector(3), 'detector'); const tab = d.userData.tablet; d.remove(tab); d.position.set(0, bag.position.y + s * 0.75 + 0.2, bag.position.z); d.scale.setScalar(0.8); body.add(d);
      const t2 = this.tag(tab, 'detector'); t2.position.set(0, -0.5, -0.11); t2.rotation.set(-Math.PI / 2, 0, 0); t2.scale.setScalar(0.6); arm2.add(t2); }
    // escalada
    const cl = st.gear.climb || 0;
    if (cl >= 5) { const j = this.tag(this.makeJetpack(), 'climb'); j.position.set(0, 1.05, 0.2 + s * 0.15); body.add(j); }
    else if (cl >= 1) { const c = this.tag(mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 16), mat('#c9a66b')), 'climb'); c.position.set(0.3, 1.3, 0.05); c.rotation.set(0, Math.PI / 2, 0.5); body.add(c); }
    // transporte
    if ((st.riding || st.preview === 'ride') && st.gear.ride) {
      const rl = st.gear.ride;
      if (rl === 1) for (const leg of out.legs) { const sk = this.tag(this.makeSkate(), 'ride'); sk.position.set(0, -0.93, -0.05); leg.add(sk); }
      else { const r = this.tag(this.makeRide(rl), 'ride'); g.add(r); out.wheel = r.userData.wheel; }
      if (st.preview) g.position.y = this.rideHFor(rl);
    }
    return out;
  },
  rideHFor(lv) { return [0, 0.08, 0.12, 0.72, 0.4][lv] || 0; },
  rebuildPlayer() {
    const S = Game.S, A = S.attrs;
    const sig = [S.hammer, A.bag, A.mine, A.move, A.jump, S.gear.light, S.lightOn, S.gear.ride, S.riding, S.gear.detector, S.pw.map(p => p.id).join('')].join('|');
    if (this.sig.pl === sig) return; this.sig.pl = sig;
    const out = this.buildCharacter(this.charState());
    this.player.clear();
    while (out.g.children.length) this.player.add(out.g.children[0]);
    this.legs = out.legs; this.pArm = out.arm; this.pBody = out.body; this.wheel = out.wheel;
    this.pOrbit = null; this.player.traverse(o => { if (o.userData && o.userData.orbit) this.pOrbit = o.userData; });
  },

  // ---------- imagens dos itens para as lojas ----------
  thumbCache: {},
  thumbInit() {
    if (this.tr) return;
    const c = document.createElement('canvas'); c.width = c.height = 200;
    this.tr = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.tr.outputEncoding = THREE.sRGBEncoding; this.tr.setClearColor(0x000000, 0);
    this.tScene = new THREE.Scene();
    this.tScene.add(new THREE.HemisphereLight('#ffffff', '#6a5a40', 0.55));
    const d = new THREE.DirectionalLight('#fff4e0', 0.7); d.position.set(2, 3, -2.5); this.tScene.add(d);
    const d2 = new THREE.DirectionalLight('#9fc0ff', 0.35); d2.position.set(-3, 1, 2); this.tScene.add(d2);
    this.tCam = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
  },
  snap(obj, dir) {
    this.thumbInit();
    this.tScene.add(obj);
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new V3()), size = box.getSize(new V3());
    const r = Math.max(size.x, size.y, size.z) * 0.66 + 0.02;
    const dist = r / Math.sin(THREE.MathUtils.degToRad(15));
    this.tCam.position.copy(c).addScaledVector(dir.clone().normalize(), dist);
    this.tCam.lookAt(c);
    this.tr.render(this.tScene, this.tCam);
    const url = this.tr.domElement.toDataURL();
    this.tScene.remove(obj);
    return url;
  },
  // imagem do item sozinho
  itemImg(kind, a) {
    const key = 'i|' + kind + '|' + a;
    if (this.thumbCache[key]) return this.thumbCache[key];
    let obj, dir = new V3(1.2, 0.7, -1);
    if (kind === 'hammer') { obj = this.makeHammer(a); obj.rotation.z = -0.7; dir = new V3(0.2, 0.15, -1); }
    else if (kind === 'ride') { obj = this.makeRide(a); dir = new V3(1.3, 0.8, -0.6); }
    else if (kind === 'light') { obj = this.makeLightItem(a); if (a === 1) dir = new V3(1, 0.5, -1.4); if (a === 2) dir = new V3(0.6, 0.9, -1.4); if (a >= 3) dir = new V3(0.5, 0.8, -1.2); }
    else if (kind === 'climb') { obj = this.makeClimbItem(a); dir = a === 4 ? new V3(0.6, 1, -1) : a === 5 ? new V3(0.9, 0.4, 1.2) : new V3(1, 0.5, -1.2); }
    else if (kind === 'detector') { obj = this.makeDetector(a); if (a === 1) dir = new V3(0.5, 0.3, -1.4); if (a === 2) { obj.rotation.z = 0.5; dir = new V3(1, 0.4, -1); } if (a === 3) dir = new V3(0.4, 0.8, -1.2); }
    else if (kind === 'pw') { obj = this.makeFlask(a, 1.6); dir = new V3(0.6, 0.35, -1.2); }
    else { // partes do personagem (Tropeira): mochila, luvas, calçados, pernas
      const A = Object.assign({}, Game.S.attrs, { [kind]: a }), G = this.gear(A);
      if (kind === 'mine') { obj = this.makeGloveItem(G.glove); dir = new V3(0.5, 0.35, -1.3); }
      else if (kind === 'move') { obj = this.makeBootItem(G.boot); dir = new V3(1.1, 0.8, -1.2); }
      else if (kind === 'jump') { obj = this.makeKneeItem(G.leg); dir = new V3(0.8, 0.3, -1.3); }
      else {
        const st = this.charState(); st.attrs = A; st.gear = { light: 0, ride: 0, detector: 0 }; st.pw = [];
        const ch = this.buildCharacter(st).g; ch.updateMatrixWorld(true);
        obj = new THREE.Group();
        ch.traverse(o => { if (o.isMesh && o.userData.part === 'bag') { const m = o.clone(); o.matrixWorld.decompose(m.position, m.quaternion, m.scale); obj.add(m); } });
        dir = new V3(1.2, 0.5, 1.4);
      }
    }
    return (this.thumbCache[key] = this.snap(obj, dir));
  },
  // imagem do personagem usando o item
  charImg(kind, a) {
    const S = Game.S, over = {};
    if (kind === 'hammer') over.hammer = a;
    else if (kind in GADGETS) { over.gear = Object.assign({}, S.gear, { [kind]: a }); over.preview = kind === 'ride' ? 'ride' : true; over.lightOn = true; }
    else if (kind === 'pw') over.pw = [{ id: a }, { id: a }, { id: a }];
    else { over.attrs = Object.assign({}, S.attrs, { [kind]: a }); }
    const st = this.charState(over); st.preview = st.preview || true;
    const key = 'c|' + kind + '|' + a + '|' + JSON.stringify([st.hammer, st.attrs, st.gear, st.lightOn, (st.pw || []).map(p => p.id)]);
    if (this.thumbCache[key]) return this.thumbCache[key];
    const ch = this.buildCharacter(st).g;
    ch.rotation.y = kind === 'bag' || kind === 'pw' || (kind === 'detector' && a >= 2) || (kind === 'climb' && a >= 5) ? -2.2 : -0.55;
    if (kind === 'light' && a === 1) ch.rotation.y = 0.6;
    return (this.thumbCache[key] = this.snap(ch, new V3(0, 0.25, -1)));
  },

  updatePlayer() {
    this.rebuildPlayer();
    const P = Game.P, g = this.player;
    const rh = this.rideH();
    g.position.set(P.x, World.height(P.x, P.y) + P.z + rh - (this.view === 'fp' ? FP_DROP : 0), P.y);
    g.rotation.y = P.yaw;
    const riding = !!Game.ride(), lvR = Game.S.gear.ride;
    const w = P.moving ? Math.sin(P.walkT * 2.2) * (riding ? (lvR === 1 ? 0.35 : 0) : 0.6) : 0;
    if (this.wheel && riding && lvR === 3) this.wheel.rotation.x += P.moving ? 0.3 : 0;
    this.legs[0].rotation.x = w; this.legs[1].rotation.x = -w;
    const s = P.swing, raise = s < 0.7 ? s / 0.7 : 1 - (s - 0.7) / 0.3;
    this.pArm.rotation.x = raise * 2.4;
    const fp = this.view === 'fp';
    // primeira pessoa: o corpo aparece ao olhar para baixo; só a cabeça, o braço do martelo e a mochila somem
    if (this._fpWas !== fp || this._fpSig !== this.sig.pl) {
      this._fpWas = fp; this._fpSig = this.sig.pl;
      this.pBody.traverse(o => { if (o.isMesh) { const part = o.userData.part; o.visible = !(fp && (part === 'head' || part === 'bag' || (part === 'light' && Game.S.gear.light >= 2) || (part || '').startsWith('pw_'))); } });
      this.pArm.visible = !fp;
    }
    for (const l of this.legs) l.position.z = 0;
    if (this.pOrbit) { this.pOrbit.orbit.rotation.y += 0.05; this.pOrbit.ring.rotation.z += 0.03; }
  },

  // ---------- quadro ----------
  draw(dt) {
    this.t += dt;
    const P = Game.P;
    this.updateDayNight();
    this.updateNearGround(); this.updateGrass(); this.updateHouses(); this.syncNodes(); this.updateFx(); this.updatePlayer();
    // câmera
    const gh = World.height(P.x, P.y);
    const bob = P.moving && P.z === 0 ? Math.sin(P.walkT * (P.sprint ? 2.6 : 2.2) * 2) * (P.sprint ? 0.06 : 0.035) : 0;
    const shake = Game.shake * 0.012;
    this.cam.rotation.set(P.pitch + (Math.random() - 0.5) * shake, P.yaw + (Math.random() - 0.5) * shake, 0);
    const rh = this.rideH(), ridingNow = !!Game.ride();
    let fwd = FP_FWD;
    if (this.view === 'fp') { const feet = gh + P.z; for (let i = 0; i < 4 && fwd > 0; i++) { const cx = P.x - Math.sin(P.yaw) * (fwd + 0.3), cz = P.y - Math.cos(P.yaw) * (fwd + 0.3); if (World.height(cx, cz) > feet + 0.05) fwd -= 0.1; else break; } fwd = Math.max(0, fwd); }
    if (this.view === 'fp') this.cam.position.set(P.x - Math.sin(P.yaw) * fwd, gh + P.z + EYE + rh + (ridingNow ? bob * 0.2 : bob), P.y - Math.cos(P.yaw) * fwd);
    else {
      const bs = this.gear().bag.size, back = 4 + bs * 2.2, fx = Math.sin(P.yaw) * Math.cos(P.pitch), fz = Math.cos(P.yaw) * Math.cos(P.pitch);
      const cx = P.x + fx * back + Math.cos(P.yaw) * 0.7, cz = P.y + fz * back - Math.sin(P.yaw) * 0.7; // câmera sobre o ombro
      this.cam.position.set(cx, Math.max(World.height(cx, cz) + 0.5, gh + P.z + 1.7 + bs * 0.9 - Math.sin(P.pitch) * back), cz);
    }
    const rr = Game.ride(); const wantFov = Game.travel ? 72 + Math.min(34, (P.speedNow || 0) * 0.12) : (P.sprint ? 82 : 72) + (rr && P.moving ? Math.min(14, rr.mult * 2.5) : 0); this.cam.fov += (wantFov - this.cam.fov) * Math.min(1, dt * 6); this.cam.updateProjectionMatrix();
    // céu, montanhas e nuvens acompanham o jogador (horizonte infinito)
    this.sky.position.copy(this.cam.position);
    this.ring.position.set(this.cam.position.x, 0, this.cam.position.z);
    this.clouds.position.set(this.cam.position.x, 0, this.cam.position.z);
    this.clouds.rotation.y = this.t * 0.004;
    // sol e sombra seguem o jogador
    const ld = this.lightDir || this.sunDir;
    this.sun.position.set(P.x + ld.x * 120, gh + Math.max(0.15, ld.y) * 120, P.y + ld.z * 120);
    this.sun.target.position.set(P.x, gh, P.y);
    // efeitos de veio aflorado: recurso brilha
    this.water.position.y = 0.68 + Math.sin(this.t * 2) * 0.02;
    if (this.egg) { const L = Game.S.hammer, st = L >= 50 ? 3 : L >= 40 ? 2 : L >= 20 ? 1 : 0; this.eggCracks.forEach((c, i) => c.visible = i < st); const pulse = st ? (0.15 + st * 0.15) * (0.6 + 0.4 * Math.sin(this.t * (1 + st))) : 0; this.egg.material.emissiveIntensity = pulse; this.eggLight.intensity = pulse * 2; this.egg.rotation.z = st >= 2 ? Math.sin(this.t * 7) * 0.04 * (Math.sin(this.t * 0.7) > 0.6 ? 1 : 0) : 0; }
    if (this.shopIcons) this.shopIcons.forEach((ic, i) => { ic.rotation.y = this.t * 1.2 + i; ic.position.y = 5.4 + Math.sin(this.t * 2 + i) * 0.15; });
    this.updatePlayerLights();
    this.updateRobots(dt);
    this.updateHitFx(dt);
    this.updateClimbFx();
    this.updateObstacleHint();
    this.stars.position.copy(this.cam.position);
    this.updateNightFx(dt);

    this.r.clear();
    this.r.render(this.scene, this.cam);
    this.updateArrow();
    if (!UI.open) {
      const fpv = this.view === 'fp'; this.vm.visible = fpv;
      if (fpv) this.updateViewModel(dt);
      if (fpv || this.arrowPivot.visible) { this.r.clearDepth(); this.r.render(this.vmScene, this.vmCam); }
    }
    this.drawFloats();
    this.drawTargetInfo();
    this.drawMinimap();
  },

  project(x, y, z) {
    const v = new V3(x, z, y).project(this.cam);
    if (v.z > 1) return null;
    return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
  },
  drawFloats() {
    let html = '';
    for (const f of Game.floats) {
      const p = this.project(f.x, f.y, World.height(f.x, f.y) + 1.6 + (1.6 - f.t) * 0.8);
      if (!p) continue;
      html += `<div ${f.cls ? `class="${f.cls}"` : ''} style="left:${p[0]}px;top:${p[1]}px;color:${f.c};opacity:${Math.min(1, f.t * 1.5)}">${f.txt}</div>`;
    }
    this.floatsEl.innerHTML = html;
  },
  drawTargetInfo() {
    const el = document.getElementById('tinfo'), n = Game.target;
    const cross = document.getElementById('cross');
    if (!n || UI.open) { el.style.display = 'none'; cross.className = ''; return; }
    const I = this.resInfo(n), tc = this.tierColor(I.lvl), hits = I.hits, time = I.time, R = I.rule;
    const col = R.blocked ? '#ff6a5a' : time <= 10 ? '#7fd36a' : time <= 60 ? '#ffd34d' : '#ff6a5a';
    cross.className = 'on';
    el.style.display = 'block';
    if (n.res.wild) { el.innerHTML = tt("<div class=\"tl\"><b>✦ {0}</b></div><div class=\"hp\"><i style=\"width:{1}%;background:#9ff3ff\"></i></div><span>{2} · some em {3}</span>", n.res.name, Math.max(0, n.hp / n.maxHp * 100), n.res.id === 'veiocint' ? tt("Rende de 3 a 6 Cintilhas · qualquer martelo quebra") : tt("Abre com 1 Cintilha e solta uma poção"), fmtTime(Math.max(0, 240 - (Game.S.time - n.born)))); return; }
    el.innerHTML = tt("<div class=\"tl\"><em style=\"border-color:{0};color:{1}\">Nv {2}</em><b>{3}{4}{5}</b></div>\n      <div class=\"hp\"><i style=\"width:{6}%;background:{7}\"></i></div>\n      {8}\n      <div class=\"val\"><i class=\"coin\"></i>{9} cada · rende {10} = <b>{11}</b> · ≈ {12}/min</div>\n      {13}", tc, tc, I.lvl, n.res.name, n.size === 2 ? tt(" · grande") : n.size === 0.5 ? tt(" · pequena") : '', n.rare === 10 ? tt(" · 💎 cristalizada") : n.rare === 3 ? tt(" · ✨ veio rico") : '', Math.max(0, n.hp / n.maxHp * 100), col, R.blocked ? tt("<span style=\"color:{0}\">🔒 Precisa do Martelo {1} para quebrar</span>", col, I.lvl - LEVEL_LOCK) : tt("<span style=\"color:{0}\">{1} golpes · {2}{3}</span>", col, fmt(hits), fmtTime(time), R.mult > 1 ? tt(" · <b>×{0} mais lento</b> (pedra acima do seu martelo)", R.mult < 10 ? R.mult.toFixed(1).replace('.', DEC) : Math.round(R.mult)) : ''), fmt(I.value), I.units, fmt(I.total), fmt(Math.round(I.perMin)), I.need ? tt("<div class=\"need\">⭐ Precisa para evolução · faltam {0}</div>", fmt(I.need.falta)) : '');
  },

  drawMinimap() {
    const c = this.mctx, W = this.mini.width, H = this.mini.height, cx = W / 2, cy = H / 2, MAXD = 4300, RAD = W / 2 - 6;
    // o mapa gira com você: a frente do jogador fica sempre para cima
    const rot = Game.P.yaw, rc = Math.cos(rot), rs = Math.sin(rot);
    const map = (x, y) => { const d = Math.hypot(x, y); if (d < 0.001) return [cx, cy]; const r = Math.sqrt(d / MAXD) * RAD, px = x / d * r, py = y / d * r; return [cx + px * rc - py * rs, cy + px * rs + py * rc]; };
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(30,26,20,0.85)'; c.beginPath(); c.arc(cx, cy, W / 2 - 2, 0, Math.PI * 2); c.fill();
    for (const R of REGIONS) {
      c.fillStyle = R.ground[1]; c.globalAlpha = 0.9; c.beginPath();
      const pts = [];
      for (let i = 0; i <= 10; i++) { const d = R.dMin + (R.dMax - R.dMin) * i / 10, w = 40 + d * 0.12; pts.push(map(R.ux * d + R.vx * w / 2, R.uy * d + R.vy * w / 2)); }
      for (let i = 10; i >= 0; i--) { const d = R.dMin + (R.dMax - R.dMin) * i / 10, w = 40 + d * 0.12; pts.push(map(R.ux * d - R.vx * w / 2, R.uy * d - R.vy * w / 2)); }
      pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); c.globalAlpha = 1;
      const lab = map(R.ux * (R.dMin + R.dMax) / 2, R.uy * (R.dMin + R.dMax) / 2);
      c.fillStyle = '#fff'; c.font = '700 18px system-ui'; c.textAlign = 'center'; c.fillText(R.era, lab[0], lab[1] + 6);
    }
    for (const n of World.WILD_SUB.nodes) { const p = map(n.x, n.y); c.fillStyle = n.res.id === 'veiocint' ? '#7af0ff' : '#c08aff'; c.strokeStyle = '#000'; c.lineWidth = 2; c.font = '800 22px system-ui'; c.textAlign = 'center'; c.strokeText('✦', p[0], p[1] + 8); c.fillText('✦', p[0], p[1] + 8); }
    for (const m of World.mountains) { const p = map(m.x, m.y), s2 = 5 + m.H / 14; c.fillStyle = m.special ? m.special.c2 : '#a89a88'; c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(p[0], p[1] - s2); c.lineTo(p[0] + s2, p[1] + s2 * 0.7); c.lineTo(p[0] - s2, p[1] + s2 * 0.7); c.closePath(); c.fill(); c.stroke(); }
    if (World.veio) { const R = REGIONS[RES[World.veio.res].region]; const p = map(R.ux * (R.dMin + R.dMax) / 2, R.uy * (R.dMin + R.dMax) / 2); c.strokeStyle = '#ffd34d'; c.lineWidth = 4; c.beginPath(); c.arc(p[0], p[1], 16 + Math.sin(this.t * 5) * 4, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = '#d8c8a8'; c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.fill();
    for (const r of Robots.list) { const p = map(r.x, r.y); c.fillStyle = '#6ff3ff'; c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 1.5; c.beginPath(); c.arc(p[0], p[1], 4, 0, Math.PI * 2); c.fill(); c.stroke(); }
    const pp = map(Game.P.x, Game.P.y), a = -Math.PI / 2;
    // alvo da seta
    const T = Missions.arrowTarget(); if (T) { const tp = map(T.x, T.y); c.fillStyle = '#ffcf4a'; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.arc(tp[0], tp[1], 7, 0, Math.PI * 2); c.fill(); c.stroke(); }
    c.save(); c.translate(pp[0], pp[1]); c.rotate(a);
    c.fillStyle = '#ff5a3a'; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(12, 0); c.lineTo(-8, 8); c.lineTo(-4, 0); c.lineTo(-8, -8); c.closePath(); c.fill(); c.stroke();
    c.restore();
    { const n = map(0, -MAXD * 0.92), dx = n[0] - cx, dy = n[1] - cy, k = (RAD - 12) / Math.hypot(dx, dy); c.fillStyle = '#ff6a5a'; c.font = '800 20px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', cx + dx * k, cy + dy * k); c.textBaseline = 'alphabetic'; }
  },
};
