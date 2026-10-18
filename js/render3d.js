// =============================================================
// Vale Ferrado — mundo 3D em primeira pessoa (Three.js, estilo low-poly 128 bits)
// =============================================================
'use strict';

const V3 = THREE.Vector3;
const EYE = 1.65;

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
    this.buildDecor();
    this.buildGrass();
    this.buildFx();
    this.buildViewModel();
    this.player = new THREE.Group(); this.scene.add(this.player);
    this.buildPlayerLights();
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

  // ---------- aviso de altura nos obstáculos (atalhos de pulo) ----------
  updateObstacleHint() {
    const P = Game.P;
    let best = null, bd = 18;
    for (const o of World.obstacles) {
      const l = World.local(o.R, P.x, P.y);
      const dd = Math.abs(l.d - o.dc) - o.t / 2, dp = Math.max(0, Math.abs(l.p) - o.len / 2);
      const d = Math.hypot(Math.max(0, dd), dp);
      if (d < bd) { bd = d; best = { o, p: Math.max(-o.len / 2 + 1, Math.min(o.len / 2 - 1, l.p)) }; }
    }
    if (!this.obsSprite) {
      this.obsCanvas = document.createElement('canvas'); this.obsCanvas.width = 512; this.obsCanvas.height = 96;
      this.obsTex = new THREE.CanvasTexture(this.obsCanvas);
      this.obsSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.obsTex, depthTest: false, transparent: true }));
      this.obsSprite.scale.set(3.2, 0.6, 1); this.obsSprite.renderOrder = 5; this.scene.add(this.obsSprite);
    }
    if (!best || UI.open) { this.obsSprite.visible = false; return; }
    const o = best.o, ok = Game.canClear(o), txt = (ok ? '⤒ Dá para pular · ' : '✕ Pulo insuficiente · ') + o.h.toFixed(1).replace('.', ',') + ' m';
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

  toggleView() { this.view = this.view === 'fp' ? 'tp' : 'fp'; UI.toast(this.view === 'fp' ? 'Primeira pessoa' : 'Terceira pessoa: veja seu personagem (V para voltar)'); },

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
    out.offsetHSL(0, 0, n);
    return out;
  },
  buildGround() {
    const mk = (size, seg) => { const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2); g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3)); return g; };
    const gm = new THREE.MeshLambertMaterial({ vertexColors: true, map: this.grassTex });
    // terreno distante
    const far = mk(9000, 225); this.fillGround(far, 0, 0, -0.7); this.grassTex.repeat.set(1, 1);
    const farTex = this.grassTex.clone(); farTex.needsUpdate = true; farTex.wrapS = farTex.wrapT = THREE.RepeatWrapping; farTex.repeat.set(2250, 2250);
    const farMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: farTex });
    this.farGround = new THREE.Mesh(far, farMat); this.farGround.receiveShadow = true; this.scene.add(this.farGround);
    // terreno próximo (detalhado, acompanha o jogador)
    gm.map = this.grassTex;
    this.nearGeo = mk(240, 120);
    this.nearGround = new THREE.Mesh(this.nearGeo, gm); this.nearGround.receiveShadow = true; this.scene.add(this.nearGround);
    this.nearAt = null;
  },
  fillGround(geo, ox, oy, dy) {
    const pos = geo.attributes.position, col = geo.attributes.color, c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + ox, y = pos.getZ(i) + oy;
      pos.setY(i, World.height(x, y) + dy);
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
    // barracas dos NPCs
    this.npcObjs = [];
    for (const n of NPCS) {
      const g = new THREE.Group(); g.position.set(n.x, 0, n.y - 1.6);
      for (const [px, pz] of [[-2.3, -1.2], [2.3, -1.2], [-2.3, 1.2], [2.3, 1.2]]) { const p = mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.8, 6), mat('#5a3d24')); p.position.set(px, 1.4, pz); g.add(p); }
      const roof = mesh(new THREE.BoxGeometry(5.4, 0.18, 3.2), mat(n.color)); roof.position.set(0, 2.85, 0); roof.rotation.x = -0.18; g.add(roof);
      for (let i = 0; i < 5; i++) { const st = mesh(new THREE.BoxGeometry(1.08, 0.2, 3.22), mat(i % 2 ? '#e8dcc0' : n.color), false); st.position.set(-2.16 + i * 1.08, 2.86, 0); st.rotation.x = -0.18; g.add(st); }
      const counter = mesh(new THREE.BoxGeometry(4.2, 1, 0.8), mat('#7a5a3a')); counter.position.set(0, 0.5, 0.9); g.add(counter);
      const goods = { ferreiro: '#5f666e', tropeira: '#c49a6c', botica: '#7a3fa0', armazem: '#a07a2a', bazar: '#e0a020' }[n.id];
      for (let i = 0; i < 4; i++) { const it = mesh(n.id === 'botica' ? new THREE.CylinderGeometry(0.12, 0.12, 0.4, 6) : new THREE.BoxGeometry(0.4, 0.3, 0.3), mat(goods)); it.position.set(-1.4 + i * 0.9, 1.15, 0.9); g.add(it); }
      if (n.id === 'ferreiro') { const anvil = mesh(new THREE.BoxGeometry(0.9, 0.5, 0.45), mat('#3a3d42', { shininess: 40 })); anvil.position.set(1.6, 0.25, 2.4); g.add(anvil); }
      const person = this.makePerson({ shirt: n.color, skin: n.id === 'tropeira' ? '#a8754f' : '#c48c62', hair: n.id === 'ferreiro' ? '#d8d8d8' : '#3a2a1c' });
      person.position.set(0, 0, -0.4); g.add(person);
      const lab = labelSprite(n.name.split(',')[0], n.role.length > 30 ? 'Mineração · mochila · movimento · pulo' : n.role); lab.position.set(0, 3.9, 0.6); g.add(lab);
      g.userData = { npc: n, person };
      this.city.add(g); this.npcObjs.push(g);
    }
    this.houses = new THREE.Group(); this.city.add(this.houses); this.houseEra = -1;
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
      const lab = labelSprite(`${R.dir} → ${R.name}`, `níveis ${(R.era - 1) * 10 + 1}–${R.era * 10}`); lab.position.set(x, h + 2.7, y); this.scene.add(lab);
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

  // ---------- obstáculos (atalhos de pulo) ----------
  buildObstacles() {
    const cols = { tronco: '#6b4a2e', pedra: '#7a786f', muro: '#9a6448', trilho: '#4a3a2c', bancada: '#9a9893', penhasco: '#3e3a4e' };
    for (const o of World.obstacles) {
      const cx = o.R.ux * o.dc, cy = o.R.uy * o.dc, h0 = World.height(cx, cy);
      const g = new THREE.Group(); g.position.set(cx, h0, cy); g.rotation.y = -Math.atan2(o.R.uy, o.R.ux);
      if (o.type === 'tronco') {
        const n = Math.ceil(o.len / 8);
        for (let i = 0; i < n; i++) { const L = o.len / n; const t = mesh(new THREE.CylinderGeometry(o.h / 2, o.h / 2 * 1.05, L - 0.2, 9), mat(i % 2 ? '#6b4a2e' : '#5f4228')); t.rotation.x = Math.PI / 2; t.position.set(0, o.h / 2, -o.len / 2 + L * (i + 0.5)); g.add(t); }
      } else {
        const n = Math.ceil(o.len / 6);
        for (let i = 0; i < n; i++) {
          const L = o.len / n;
          const geo = jitterGeo(new THREE.BoxGeometry(o.t, o.h + 0.6, L, 2, 2, 2), o.type === 'muro' ? 0.12 : 0.5, i * 7 + o.h * 100);
          const b = mesh(geo, mat(cols[o.type])); b.position.set(0, (o.h + 0.6) / 2 - 0.4, -o.len / 2 + L * (i + 0.5)); g.add(b);
          if (o.type === 'trilho') for (const s of [-0.3, 0.3]) { const rail = mesh(new THREE.BoxGeometry(0.08, 0.08, L), mat('#9aa0a6', { shininess: 60 })); rail.position.set(s, o.h + 0.25, -o.len / 2 + L * (i + 0.5)); g.add(rail); }
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
      for (const o of World.obstacles) { const l = World.local(o.R, x, y); if (Math.abs(l.d - o.dc) < o.t + 3 && Math.abs(l.p) < o.len / 2 + 3) return false; }
      return true;
    };
    for (let i = 0; i < 26000; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 1800, x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (!ok(x, y)) continue;
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
    const P = Game.P, sx = Math.round(P.x / 6) * 6, sy = Math.round(P.y / 6) * 6;
    if (this.grassAt && this.grassAt[0] === sx && this.grassAt[1] === sy) return;
    this.grassAt = [sx, sy];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3(), c = new THREE.Color(), up = new V3(0, 1, 0);
    let n = 0;
    for (let gx = -40; gx <= 40 && n < 3500; gx += 1.6) for (let gy = -40; gy <= 40 && n < 3500; gy += 1.6) {
      const cx = Math.floor((sx + gx) / 1.6), cy = Math.floor((sy + gy) / 1.6), h = hash2(cx, cy);
      if (h > 0.55) continue;
      const x = cx * 1.6 + hash2(cx * 3, cy) * 1.6, y = cy * 1.6 + hash2(cx, cy * 5) * 1.6;
      if (Math.hypot(x, y) < CITY_R + 1) continue;
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
    if (n.rare > 1) {
      if (!this.glowTex) this.glowTex = canvasTex(64, 64, (c, w) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); });
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: n.rare === 10 ? '#8ff0ff' : '#ffd860', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
      sp.scale.setScalar(s * 4); sp.position.y = s * 0.7; g.add(sp); g.userData.glow = sp;
    }
    g.rotation.y = n.seed % 6.28;
    g.position.set(n.x, World.height(n.x, n.y) - 0.05, n.y);
    g.userData.res = res.id; g.userData.base = g.position.clone();
    return g;
  },
  // informações de valor de um recurso para o jogador atual
  resInfo(n) {
    const res = n.res, units = Math.max(1, Math.round(2 * n.size)) * n.rare;
    const hits = Math.ceil(n.hp / Game.force()), time = Math.max(0.3, hits * Game.interval());
    const need = (Game.missCache || []).find(m => m.id === res.id);
    return { lvl: res.ideal, value: res.value, units, total: units * res.value, perMin: units * res.value / time * 60, hits, time, need };
  },
  tierColor(lvl) { // cor do nível: cinza → verde → azul → roxo → laranja → dourado
    return ['#b8b0a0', '#7fd36a', '#5aa8f0', '#b07af0', '#ff9a3d', '#ffd34d'][Math.min(5, Math.floor((lvl - 1) / 10))];
  },
  badgeTex(res, need) {
    const key = res.id + (need ? '*' : '');
    this.badgeCache = this.badgeCache || {};
    if (this.badgeCache[key]) return this.badgeCache[key];
    const c = document.createElement('canvas'); c.width = 256; c.height = 72; /* etiqueta */ const g = c.getContext('2d');
    const col = this.tierColor(res.ideal);
    g.fillStyle = 'rgba(20,14,8,0.78)'; g.beginPath(); g.roundRect(4, 4, 248, 64, 14); g.fill();
    g.strokeStyle = col; g.lineWidth = 4; g.stroke();
    g.font = '800 34px system-ui, sans-serif'; g.fillStyle = col; g.textAlign = 'left'; g.fillText('Nv ' + res.ideal, 16, 48);
    g.font = '700 26px system-ui, sans-serif'; g.fillStyle = '#ffd34d'; g.textAlign = 'right'; g.fillText(fmt(res.value), 206, 47);
    const cg = g.createRadialGradient(221, 33, 2, 226, 38, 13); cg.addColorStop(0, '#fff2a8'); cg.addColorStop(0.6, '#e0a820'); cg.addColorStop(1, '#8a5a10');
    g.fillStyle = cg; g.beginPath(); g.arc(226, 38, 12, 0, Math.PI * 2); g.fill();
    if (need) { g.fillStyle = '#8fe07a'; g.font = '800 30px system-ui'; g.textAlign = 'center'; g.fillText('★', 132, 46); }
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
      if (m.userData.glow) m.userData.glow.material.opacity = 0.55 + Math.sin(this.t * 4 + n.seed) * 0.3;
      // etiqueta com nível e valor para recursos por perto
      const d2 = dx * dx + dy * dy, near = d2 < 22 * 22 && d2 > 1.5 * 1.5 && n !== Game.target && Game.S.showBadges !== false;
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
    g.add(head); g.userData.headY = len;
    return g;
  },

  // ---------- visão em primeira pessoa (braço + martelo) ----------
  buildViewModel() {
    this.vmScene = new THREE.Scene();
    this.vmCam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 10);
    this.vmScene.add(new THREE.HemisphereLight('#ffffff', '#6a5a40', 0.6));
    const d = new THREE.DirectionalLight('#fff1d6', 0.55); d.position.set(1, 2, 1); this.vmScene.add(d);
    this.vm = new THREE.Group(); this.vmScene.add(this.vm);
  },
  rebuildViewModel() {
    const gear = this.gear(), L = Game.S.hammer;
    const sig = L + '|' + gear.glove.era + '|' + gear.glove.lvl + '|' + Game.S.gear.light + Game.S.lightOn;
    if (this.sig.vm === sig) return; this.sig.vm = sig;
    this.vm.clear();
    const arm = new THREE.Group();
    const sleeve = mesh(new THREE.BoxGeometry(0.1, 0.1, 0.26), mat('#2c4f68'), false); sleeve.position.z = 0.15; arm.add(sleeve);
    const G = gear.glove, gs = 0.075 + G.era * 0.008;
    const glove = mesh(new THREE.BoxGeometry(gs * 1.2, gs * 1.1, gs * 1.4), mat(G.col, G.era === 6 ? { emissive: '#40d0ff', emissiveIntensity: 0.25 } : {}), false); glove.position.z = -0.02; arm.add(glove);
    if (G.era >= 4) { const brace = mesh(new THREE.BoxGeometry(0.13, 0.13, 0.16), mat(G.era === 6 ? '#2a3a48' : '#9aa0a8', { shininess: 60 }), false); brace.position.z = 0.12; arm.add(brace); }
    if (G.era >= 5) { const pis = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 6), mat('#d8dde2', { shininess: 80 }), false); pis.rotation.x = Math.PI / 2; pis.position.set(0.07, 0.05, 0.2); arm.add(pis); }
    const ham = this.makeHammer(L);
    ham.scale.setScalar(0.42 - L * 0.0035);
    ham.position.set(0, -0.06, 0); ham.rotation.set(-0.45, 0, 0.32);
    arm.add(ham);
    this.vmArm = arm; this.vm.add(arm);
    this.vmTorch = null;
    if (Game.S.gear.light === 1) {
      const t = new THREE.Group();
      const hand = mesh(new THREE.BoxGeometry(0.09, 0.08, 0.11), mat(G.col), false); t.add(hand);
      const tor = this.makeTorch(); tor.position.z = -0.1; tor.scale.setScalar(0.9); t.add(tor);
      t.position.set(-0.32, -0.36, -0.55); t.rotation.set(0.05, 0.1, 0);
      this.vm.add(t); this.vmTorch = t;
    }
  },
  updateViewModel(dt) {
    this.rebuildViewModel();
    const P = Game.P, s = P.swing;
    const bob = P.moving ? Math.sin(P.walkT * (P.sprint ? 2.6 : 2.2)) : 0;
    const rx = s < 0.7 ? (s / 0.7) * 0.5 : 0.5 - ((s - 0.7) / 0.3) * 1.3;
    this.vmArm.position.set(0.36 + bob * 0.012 + Math.max(0, rx) * 0.08, -0.4 + Math.abs(bob) * 0.015, -0.6);
    this.vmArm.rotation.set(rx, -0.12, bob * 0.03);
    if (this.vmTorch) this.vmTorch.position.set(-0.32 - bob * 0.01, -0.36 + Math.abs(bob) * 0.012, -0.55);
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
    const head = mesh(new THREE.BoxGeometry(0.38, 0.4, 0.38), mat('#d4a17a')); head.position.y = 1.86; body.add(head);
    for (const x of [-0.08, 0.08]) { const eye = mesh(new THREE.BoxGeometry(0.05, 0.05, 0.01), mat('#2a1a10'), false); eye.position.set(x, 1.88, -0.195); body.add(eye); }
    const hair = mesh(new THREE.BoxGeometry(0.4, 0.14, 0.4), mat('#4a2e1a')); hair.position.y = 2.08; body.add(hair);
    const hairB = mesh(new THREE.BoxGeometry(0.4, 0.3, 0.08), mat('#4a2e1a')); hairB.position.set(0, 1.93, 0.17); body.add(hairB);
    // mochila
    const B = gear.bag, s = B.size, bag = new THREE.Group(); bag.position.set(0, 1.3 + (s - 0.5) * 0.4, 0.17 + s * 0.3);
    let bgeo;
    if (B.era === 1) bgeo = jitterGeo(new THREE.SphereGeometry(s * 0.5, 7, 5), 0.04, 1);
    else if (B.era === 2) bgeo = new THREE.BoxGeometry(s * 0.8, s * 0.7, s * 0.5);
    else if (B.era === 3) bgeo = new THREE.BoxGeometry(s * 0.8, s * 1.1, s * 0.55);
    else if (B.era === 4) bgeo = new THREE.CylinderGeometry(s * 0.5, s * 0.38, s * 1.2, 8);
    else bgeo = new THREE.BoxGeometry(s * 0.85, s * 1.3, s * 0.6);
    bag.add(this.tag(mesh(bgeo, mat(B.col)), 'bag'));
    for (const x of [-0.18, 0.18]) { const strap = this.tag(mesh(new THREE.BoxGeometry(0.06, 0.6, 0.03), mat(B.strap)), 'bag'); strap.position.set(x, 1.28, -0.175); body.add(strap); }
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
    const ham = this.tag(this.makeHammer(L), 'hammer'); ham.position.y = -0.64; ham.rotation.x = -Math.PI / 2; arm.add(ham);
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
    ch.rotation.y = kind === 'bag' || kind === 'pw' || (kind === 'detector' && a >= 2) ? -2.2 : -0.55;
    if (kind === 'light' && a === 1) ch.rotation.y = 0.6;
    return (this.thumbCache[key] = this.snap(ch, new V3(0, 0.25, -1)));
  },

  updatePlayer() {
    this.rebuildPlayer();
    const P = Game.P, g = this.player;
    const rh = this.rideH();
    g.position.set(P.x, World.height(P.x, P.y) + P.z + rh, P.y);
    g.rotation.y = P.yaw;
    const riding = !!Game.ride(), lvR = Game.S.gear.ride;
    const w = P.moving ? Math.sin(P.walkT * 2.2) * (riding ? (lvR === 1 ? 0.35 : 0) : 0.6) : 0;
    if (this.wheel && riding && lvR === 3) this.wheel.rotation.x += P.moving ? 0.3 : 0;
    this.legs[0].rotation.x = w; this.legs[1].rotation.x = -w;
    const s = P.swing, raise = s < 0.7 ? s / 0.7 : 1 - (s - 0.7) / 0.3;
    this.pArm.rotation.x = raise * 2.4;
    const fp = this.view === 'fp';
    this.pBody.visible = !fp;
    // na primeira pessoa, as pernas ficam um pouco atrás para aparecerem ao olhar para baixo
    for (const l of this.legs) l.position.z = fp ? -0.08 : 0;
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
    if (this.view === 'fp') this.cam.position.set(P.x, gh + P.z + EYE + rh + (ridingNow ? bob * 0.2 : bob), P.y);
    else {
      const bs = this.gear().bag.size, back = 4 + bs * 2.2, fx = Math.sin(P.yaw) * Math.cos(P.pitch), fz = Math.cos(P.yaw) * Math.cos(P.pitch);
      const cx = P.x + fx * back + Math.cos(P.yaw) * 0.7, cz = P.y + fz * back - Math.sin(P.yaw) * 0.7; // câmera sobre o ombro
      this.cam.position.set(cx, Math.max(World.height(cx, cz) + 0.5, gh + P.z + 1.7 + bs * 0.9 - Math.sin(P.pitch) * back), cz);
    }
    const rr = Game.ride(); const wantFov = (P.sprint ? 82 : 72) + (rr && P.moving ? Math.min(14, rr.mult * 2.5) : 0); this.cam.fov += (wantFov - this.cam.fov) * Math.min(1, dt * 6); this.cam.updateProjectionMatrix();
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
    this.updatePlayerLights();
    this.updateObstacleHint();
    this.stars.position.copy(this.cam.position);
    this.updateNightFx(dt);

    this.r.clear();
    this.r.render(this.scene, this.cam);
    if (this.view === 'fp' && !UI.open) { this.updateViewModel(dt); this.r.clearDepth(); this.r.render(this.vmScene, this.vmCam); }
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
      html += `<div style="left:${p[0]}px;top:${p[1]}px;color:${f.c};opacity:${Math.min(1, f.t * 1.5)}">${f.txt}</div>`;
    }
    this.floatsEl.innerHTML = html;
  },
  drawTargetInfo() {
    const el = document.getElementById('tinfo'), n = Game.target;
    const cross = document.getElementById('cross');
    if (!n || UI.open) { el.style.display = 'none'; cross.className = ''; return; }
    const hits = Math.ceil(n.hp / Game.force()), time = hits * Game.interval();
    const col = time <= 10 ? '#7fd36a' : time <= 60 ? '#ffd34d' : '#ff6a5a';
    cross.className = 'on';
    el.style.display = 'block';
    const I = this.resInfo(n), tc = this.tierColor(I.lvl);
    el.innerHTML = `<div class="tl"><em style="border-color:${tc};color:${tc}">Nv ${I.lvl}</em><b>${n.res.name}${n.size === 2 ? ' · grande' : n.size === 0.5 ? ' · pequena' : ''}${n.rare === 10 ? ' · 💎 cristalizada' : n.rare === 3 ? ' · ✨ veio rico' : ''}</b></div>
      <div class="hp"><i style="width:${Math.max(0, n.hp / n.maxHp * 100)}%;background:${col}"></i></div>
      <span style="color:${col}">${fmt(hits)} golpes · ${fmtTime(time)}</span>
      <div class="val"><i class="coin"></i>${fmt(I.value)} cada · rende ${I.units} = <b>${fmt(I.total)}</b> · ≈ ${fmt(Math.round(I.perMin))}/min</div>
      ${I.need ? `<div class="need">⭐ Precisa para evolução · faltam ${fmt(I.need.falta)}</div>` : ''}`;
  },

  drawMinimap() {
    const c = this.mctx, W = this.mini.width, H = this.mini.height, cx = W / 2, cy = H / 2, MAXD = 4300, RAD = W / 2 - 6;
    const map = (x, y) => { const d = Math.hypot(x, y); if (d < 0.001) return [cx, cy]; const r = Math.sqrt(d / MAXD) * RAD; return [cx + x / d * r, cy + y / d * r]; };
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
    if (World.veio) { const R = REGIONS[RES[World.veio.res].region]; const p = map(R.ux * (R.dMin + R.dMax) / 2, R.uy * (R.dMin + R.dMax) / 2); c.strokeStyle = '#ffd34d'; c.lineWidth = 4; c.beginPath(); c.arc(p[0], p[1], 16 + Math.sin(this.t * 5) * 4, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = '#d8c8a8'; c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.fill();
    const pp = map(Game.P.x, Game.P.y), a = -Game.P.yaw - Math.PI / 2;
    c.save(); c.translate(pp[0], pp[1]); c.rotate(a);
    c.fillStyle = '#ff5a3a'; c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(12, 0); c.lineTo(-8, 8); c.lineTo(-4, 0); c.lineTo(-8, -8); c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.font = '700 18px system-ui'; c.textAlign = 'center'; c.fillText('N', cx, 24);
  },
};
