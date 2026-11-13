// =============================================================
// Vale Ferrado — mundo 3D em primeira pessoa (Three.js, estilo low-poly 128 bits)
// =============================================================
'use strict';

const V3 = THREE.Vector3;
const FAR_SIZE = 1040, FAR_SEG = 52; // chão distante: 1 km em volta do jogador (a neblina fecha em ~420 m), quadrados de 20 m
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
// estrada: região 1 vai até a mina; das outras, só até a metade do caminho
function roadEnd(R) { return R.id === 0 ? R.dMin + 10 : R.dMin * 0.5; }
function roadSway(R, d) { return Math.sin(d / 23 + R.id) * 2.5; }
function labelSprite(text, sub, color = '#f5e6c8', scale = 1) {
  const tex = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = 'rgba(20,14,8,0.72)'; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 18); g.fill();
    g.textAlign = 'center'; g.fillStyle = color; let fs = 46; g.font = `700 ${fs}px Georgia, serif`; while (g.measureText(text).width > w - 44 && fs > 20) { fs -= 2; g.font = `700 ${fs}px Georgia, serif`; } g.fillText(text, w / 2, sub ? 62 : 80);
    if (sub) { let ss = 30; g.font = `${ss}px system-ui, sans-serif`; while (g.measureText(sub).width > w - 40 && ss > 16) { ss -= 2; g.font = `${ss}px system-ui, sans-serif`; } g.fillStyle = '#d8c8a8'; g.fillText(sub, w / 2, 104); }
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
    this.r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.r.setSize(innerWidth, innerHeight);
    this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFShadowMap;
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
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera; sc.left = sc.bottom = -32; sc.right = sc.top = 32; sc.near = 1; sc.far = 260; // sombra só em volta do jogador
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.grassTex = canvasTex(256, 256, (g, w, h) => {
      // tons de cinza (a cor vem do vértice): manchas grandes + fiapos de capim + pedrinhas
      g.fillStyle = '#a0a0a0'; g.fillRect(0, 0, w, h);
      const r = rng(77);
      for (let i = 0; i < 46; i++) { const x = r() * w, y = r() * h, rr = 14 + r() * 40, v = 132 + r() * 70 | 0; for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) { const gg = g.createRadialGradient(x + dx, y + dy, 1, x + dx, y + dy, rr); gg.addColorStop(0, `rgba(${v},${v},${v},.55)`); gg.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gg; g.fillRect(x + dx - rr, y + dy - rr, rr * 2, rr * 2); } }
      g.lineCap = 'round';
      for (let i = 0; i < 1500; i++) { const x = r() * w, y = r() * h, l = 2 + r() * 5, a = -Math.PI / 2 + (r() - 0.5) * 1.2, v = 95 + r() * 130 | 0; g.strokeStyle = `rgba(${v},${v},${v},.8)`; g.lineWidth = 0.7 + r() * 0.9; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
      for (let i = 0; i < 160; i++) { const x = r() * w, y = r() * h, v = 150 + r() * 80 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.ellipse(x, y, 1 + r() * 1.6, 0.8 + r() * 1.2, r() * 3, 0, 7); g.fill(); g.fillStyle = 'rgba(40,40,40,.35)'; g.fillRect(x - 1, y + 1, 2, 1); }
    }, 1);

    this.buildSky();
    this.buildGround();
    this.buildCity();
    this.buildZone7();
    this.buildRoadsAndRiver();
    this.buildObstacles();
    this.buildPitWalls();
    this.buildSpiralWalls(); this.buildCave(); this.buildMineDecor();
    this.buildClimbFx();
    this.buildDecor(); this.buildOreLod(); this.buildEdgeRange(); this.buildBirds();
    this.buildGrass();
    this.buildFx();
    this.buildHitFx();
    this.buildViewModel();
    this.player = new THREE.Group(); this.scene.add(this.player);
    this.buildPlayerLights();
    // junta as peças paradas da vila e da Zona 7 (fica igual na tela, com bem menos pedidos de desenho)
    this.mergedCount = this.mergeStatic(this.city) + (this.z7 ? this.mergeStatic(this.z7) : 0);
    let q = 'alto'; try { q = localStorage.getItem('valeferrado_gfx') || 'alto'; } catch (e) {}
    this.setQuality(q, true);
    try { this.r.compile(this.scene, this.cam); } catch (e) {} // compila os materiais já no início (evita travadinhas na primeira vez)
    this.mini = document.getElementById('minimap'); this.mctx = this.mini.getContext('2d');
    this.floatsEl = document.getElementById('floats');
    this.ray = new THREE.Raycaster();
  },

  buildPlayerLights() {
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
    this.r.setPixelRatio(leve ? Math.min(devicePixelRatio, 0.75) : Math.min(devicePixelRatio, 1.5)); this.r.setSize(innerWidth, innerHeight);
    this.sun.castShadow = !leve;
    if (this.grass) this.grass.visible = !leve;
    this.fogK = leve ? 0.7 : 1; // modo leve: neblina mais perto (desenha menos coisa)
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
    this.scene.fog.near = (15 + 45 * df) * (this.fogK || 1); this.scene.fog.far = (140 + 280 * df) * (this.fogK || 1);
    this.hemi.intensity = 0.3 + 0.45 * df;
    this.hemi.color.copy(L('#5a6a9a', '#cfe3ff', df));
    if (el > -0.04) { this.lightDir = this.sunDir; this.sun.intensity = 1.05 * df; this.sun.color.copy(L('#ff9a50', '#fff1d6', Math.min(1, el * 4))); }
    else { this.lightDir = moon; this.sun.intensity = 0.38 * (1 - df); this.sun.color.set('#a8bcff'); }
    this.cloudMat.color.copy(L('#2a3048', '#ffffff', df)); this.cloudMat.emissive.copy(L('#0a0e18', '#c8d4e0', df)).lerp(new THREE.Color('#e08860'), dusk * 0.4);
    // dentro da caverna (Mina Velha): tudo escurece e a neblina fica marrom e perto; os lampiões fazem o resto
    { const P = Game.P, inC = World.ceilingAt(P.x, P.y) !== null && World.height(P.x, P.y) + P.z < -0.5 ? 1 : 0; this.caveK = (this.caveK || 0) + (inC - (this.caveK || 0)) * 0.06;
      const k = this.caveK; if (k > 0.01) { this.hemi.intensity *= 1 - 0.7 * k; this.sun.intensity *= 1 - 0.85 * k; this.scene.fog.color.lerp(new THREE.Color('#1a120c'), k); this.scene.fog.near *= 1 - 0.7 * k; this.scene.fog.far = this.scene.fog.far * (1 - k) + 75 * k; } }
    for (const m of this.ring.children) m.material.color.copy(m.userData.base).lerp(new THREE.Color('#0d1322'), (1 - df) * 0.85).lerp(new THREE.Color('#c07858'), dusk * 0.25);
    const night = 1 - df;
    this.lampMat.color.copy(L('#555555', '#ffd890', night));
    this.cityLight.intensity = night * 0.9;
    this.vmScene.children.forEach(o => { if (o.isLight) o.intensity = (o.isHemisphereLight ? 0.6 : 0.55) * (0.25 + 0.75 * df); });
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
    this.mergeStatic(this.clouds, true); // as nuvens se movem juntas: viram uma peça só
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
      if (l.d > 0 && l.d < roadEnd(R)) { const w = roadSway(R, l.d); if (Math.abs(l.p - w) < 1.9) { out.set('#8a7454'); out.offsetHSL(0, 0, n); return out; } }
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
    if (d > Z7.d - 110) { const dz = Math.hypot(x - Z7.x, y - Z7.y); if (dz < 85) out.lerp(this._z7c || (this._z7c = new THREE.Color('#5c566a')), 1 - smooth01(34, 82, dz)); }
    return out;
  },
  buildGround() {
    const mk = (size, seg) => { const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2); g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3)); return g; };
    const gm = new THREE.MeshLambertMaterial({ vertexColors: true, map: this.grassTex });
    // terreno distante: só até onde a neblina deixa ver (grade leve que acompanha o jogador)
    this.farGeo = mk(FAR_SIZE, FAR_SEG); this.farXZ = null; this.farAt = null;
    this.farGround = new THREE.Mesh(this.farGeo, new THREE.MeshLambertMaterial({ vertexColors: true, map: this.grassTex })); this.farGround.receiveShadow = true; this.scene.add(this.farGround);
    this.updateFarGround(true);
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
  updateFarGround(force) {
    const P = Game.P, st = 80, sx = Math.round(P.x / st) * st, sy = Math.round(P.y / st) * st;
    if (!force && this.farAt && this.farAt[0] === sx && this.farAt[1] === sy) return;
    const g = this.farGeo, pos = g.attributes.position, col = g.attributes.color, uv = g.attributes.uv, c = new THREE.Color();
    if (!this.farXZ) { this.farXZ = []; for (let i = 0; i < pos.count; i++) this.farXZ.push(pos.getX(i), pos.getZ(i)); }
    this.farAt = [sx, sy];
    for (let i = 0; i < pos.count; i++) {
      const lx = this.farXZ[i * 2], lz = this.farXZ[i * 2 + 1], x = lx + sx, y = lz + sy;
      // malha grossa: usa o ponto mais baixo em volta, para nunca ficar acima do terreno detalhado
      let h = World.height(x, y); const q = FAR_SIZE / FAR_SEG / 2;
      for (const [ax, ay] of [[q, 0], [-q, 0], [0, q], [0, -q]]) h = Math.min(h, World.height(x + ax, y + ay));
      h -= World.mountainH(x, y) > 0.5 ? 1.4 : 0.4;
      pos.setXYZ(i, lx, h - 0.7, lz); uv.setXY(i, x / 4, y / 4);
      this.groundColor(x, y, c); col.setXYZ(i, c.r, c.g, c.b);
    }
    pos.needsUpdate = col.needsUpdate = uv.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingSphere();
    this.farGround.position.set(sx, 0, sy);
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
    this.eggLight = { intensity: 0, color: new THREE.Color() }; // sem luz real: o brilho do ovo é falso (halo), para não pesar
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
      g.add(this.makeWares(n.id));
      const person = this.makeVendor(n.id);
      person.position.set(n.id === 'ferreiro' ? -0.5 : 0, 0, -0.35); g.add(person);
      // placa com o que a barraca vende
      const signTex = canvasTex(512, 128, (c, w, h) => {
        c.fillStyle = '#3a2614'; c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 14); c.fill();
        c.strokeStyle = n.color; c.lineWidth = 8; c.stroke();
        c.fillStyle = '#ffe9a8'; c.font = '900 72px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(n.shop, w / 2, h / 2 + 4);
      });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshBasicMaterial({ map: signTex, transparent: true }));
      sign.position.set(0, 3.55, 1.25); sign.rotation.x = -0.12; g.add(sign);
      const signBack = sign.clone(); signBack.rotation.y = Math.PI; signBack.position.z = 1.24; g.add(signBack);
      const lab = labelSprite(n.name.split(',')[0], n.id === 'tropeira' ? tt("Mineração · mochila · movimento · pulo") : n.role, '#f5e6c8', 0.62); lab.position.set(0, 2.62, 1.5); lab.material.depthTest = false; lab.renderOrder = 5; g.add(lab);
      // símbolo girando em cima da barraca
      const icon = this.shopIcon(n.id); icon.position.set(0, 5.4, 0); g.add(icon);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex || (this.glowTex = canvasTex(64, 64, (c, w) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); })), color: n.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
      halo.scale.setScalar(2.6); halo.position.set(0, 5.4, 0); g.add(halo);
      this.shopIcons.push(icon);
      g.userData = { npc: n, person };
      this.mergeStatic(g, true); this.city.add(g); this.npcObjs.push(g);
    }
    this.houses = new THREE.Group(); this.city.add(this.houses); this.houseEra = -1;
    this.buildCityDeco();
  },
  // ---------- enfeites da vila: fonte, trilhas de pedra, bandeirolas, canteiros, bancos e a picareta 61 ----------
  buildCityDeco() {
    const C = this.city, T = () => performance.now() / 1000, gtex = this.getGlowTex();
    const stone = '#8a8070', light = '#b9ad98';
    // piso: anéis de pedra clara em volta da fonte e trilhas até cada barraca
    for (const [r0, r1, col] of [[4.1, 4.5, light], [7.4, 7.65, '#6f6659']]) { const ring = mesh(new THREE.RingGeometry(r0, r1, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: col }), false); ring.position.y = 0.055; C.add(ring); }
    for (const n of NPCS) {
      const a = Math.atan2(n.y, n.x), d = Math.hypot(n.x, n.y), len = d - 4.6 - 2.2;
      const path = mesh(new THREE.BoxGeometry(len, 0.02, 1.2), new THREE.MeshLambertMaterial({ color: '#a2977f' }), false);
      path.position.set(Math.cos(a) * (4.6 + len / 2), 0.056, Math.sin(a) * (4.6 + len / 2)); path.rotation.y = -a; C.add(path);
    }
    // fonte em dois andares com borda de pedra e jatos d'água
    const rim = mesh(new THREE.TorusGeometry(2.7, 0.2, 6, 20).rotateX(Math.PI / 2), mat('#a09680')); rim.position.y = 0.72; C.add(rim);
    const step = mesh(new THREE.CylinderGeometry(3.5, 3.7, 0.3, 16), mat('#7a7062')); step.position.y = 0.15; C.add(step);
    const bowl = mesh(new THREE.CylinderGeometry(1.05, 0.7, 0.35, 12), mat('#a09680')); bowl.position.y = 1.55; C.add(bowl);
    const bw = mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.06, 12), new THREE.MeshPhongMaterial({ color: '#4a95b5', shininess: 90 }), false); bw.position.y = 1.72; C.add(bw);
    const NJ = 5, ND = 10, jp = new Float32Array(NJ * ND * 3), jc = new Float32Array(NJ * ND * 3), jg = new THREE.BufferGeometry();
    jg.setAttribute('position', new THREE.BufferAttribute(jp, 3)); jg.setAttribute('color', new THREE.BufferAttribute(jc, 3));
    const jets = new THREE.Points(jg, new THREE.PointsMaterial({ map: gtex, size: 0.2, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    jets.frustumCulled = false; C.add(jets);
    jets.onBeforeRender = () => {
      const t = T();
      for (let j = 0; j < NJ; j++) for (let k = 0; k < ND; k++) {
        const u = ((t * 0.55 + k / ND) % 1), a = j / NJ * Math.PI * 2 + 0.3, r = 0.35 + u * 1.7, y = 2.0 + 1.6 * u - 4.1 * u * u * 1.0, i = (j * ND + k) * 3, f = Math.max(0, y) > 0.7 ? 1 : 0;
        jp[i] = Math.cos(a) * r; jp[i + 1] = Math.max(0.75, y); jp[i + 2] = Math.sin(a) * r;
        const fade = f * Math.sin(u * Math.PI); jc[i] = 0.6 * fade; jc[i + 1] = 0.85 * fade; jc[i + 2] = 1 * fade;
      }
      jg.attributes.position.needsUpdate = true; jg.attributes.color.needsUpdate = true;
    };
    // ninho com gravetos e brilho de brasas em volta do ovo
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const tw = mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.55, 4), mat('#5a3f2a'), false); tw.position.set(Math.cos(a) * 0.72, 2.3, Math.sin(a) * 0.72); tw.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); C.add(tw); }
    const NE = 14, ep = new Float32Array(NE * 3), ec = new Float32Array(NE * 3), eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(ep, 3)); eg.setAttribute('color', new THREE.BufferAttribute(ec, 3));
    const embers = new THREE.Points(eg, new THREE.PointsMaterial({ map: gtex, size: 0.13, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    embers.frustumCulled = false; embers.position.y = 2.6; C.add(embers);
    embers.onBeforeRender = () => {
      const t = T(), L = Game.S.hammer, pw = L >= 50 ? 1 : L >= 40 ? 0.75 : L >= 20 ? 0.5 : 0.25;
      for (let i = 0; i < NE; i++) { const u = (t * 0.25 + i / NE) % 1, a = i * 2.4 + t * 0.6, r = 0.55 + 0.3 * Math.sin(i + t); ep[i * 3] = Math.cos(a) * r; ep[i * 3 + 1] = u * 2.4; ep[i * 3 + 2] = Math.sin(a) * r; const f = Math.sin(u * Math.PI) * pw; ec[i * 3] = 1 * f; ec[i * 3 + 1] = 0.55 * f; ec[i * 3 + 2] = 0.2 * f; }
      eg.attributes.position.needsUpdate = true; eg.attributes.color.needsUpdate = true;
    };
    // bandeirolas ligando as barracas
    const sorted = NPCS.map(n => ({ x: n.x + Math.cos(n.ang * Math.PI / 180) * 1.4, y: n.y + Math.sin(n.ang * Math.PI / 180) * 1.4, ang: Math.atan2(n.y, n.x) })).sort((p, q) => p.ang - q.ang);
    const cols = ['#d8483c', '#f0b030', '#3a9ad0', '#58b05a', '#e8dcc0', '#a05ac0'], flags = [];
    const fg = new THREE.BufferGeometry(); const tri = new Float32Array([-0.12, 0, 0, 0.12, 0, 0, 0, -0.27, 0]); fg.setAttribute('position', new THREE.BufferAttribute(tri, 3)); fg.computeVertexNormals();
    const NF = sorted.length * 11, fm = new THREE.InstancedMesh(fg, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), NF), dm = new THREE.Object3D(); let fi = 0;
    for (let i = 0; i < sorted.length; i++) {
      const A = sorted[i], B = sorted[(i + 1) % sorted.length], pts = [];
      for (let k = 0; k <= 22; k++) { const u = k / 22; pts.push(new THREE.Vector3(A.x + (B.x - A.x) * u, 3.55 - Math.sin(u * Math.PI) * 0.7, A.y + (B.y - A.y) * u)); }
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#4a3420' })); C.add(ln);
      for (let k = 0; k < 11; k++) { const p = pts[1 + k * 2], q = pts[Math.min(22, 2 + k * 2)]; dm.position.copy(p); dm.lookAt(q.x, p.y, q.z); dm.rotateY(Math.PI / 2); dm.scale.setScalar(1); dm.updateMatrix(); fm.setMatrixAt(fi, dm.matrix); fm.setColorAt(fi, new THREE.Color(cols[(i + k) % cols.length])); fi++; }
    }
    fm.instanceMatrix.needsUpdate = true; fm.instanceColor.needsUpdate = true; C.add(fm);
    // canteiros de flores e bancos nos vãos entre as barracas (longe das saídas para as regiões)
    const fcols = ['#e8506a', '#f5c542', '#f0f0f0', '#b06ad8', '#ff8a3d'];
    for (let i = 0; i < sorted.length; i++) {
      const A = sorted[i], B = sorted[(i + 1) % sorted.length]; let am = (A.ang + (B.ang + (i === sorted.length - 1 ? Math.PI * 2 : 0))) / 2;
      if (REGIONS.some(R => Math.abs(Math.atan2(Math.sin(am - R.ang * Math.PI / 180), Math.cos(am - R.ang * Math.PI / 180))) < 0.3)) continue;
      const g = new THREE.Group(); g.position.set(Math.cos(am) * 12.2, 0, Math.sin(am) * 12.2); g.rotation.y = -am + Math.PI / 2;
      const box = mesh(new THREE.BoxGeometry(2.6, 0.45, 0.8), mat('#6b4a2e')); box.position.y = 0.25; g.add(box);
      const soil = mesh(new THREE.BoxGeometry(2.45, 0.08, 0.65), mat('#3d2b1c'), false); soil.position.y = 0.5; g.add(soil);
      for (let k = 0; k < 9; k++) { const fl = mesh(new THREE.IcosahedronGeometry(0.11, 0), mat(fcols[(i + k) % fcols.length], { emissive: fcols[(i + k) % fcols.length], emissiveIntensity: 0.15 }), false); fl.position.set(-1.05 + k * 0.26, 0.68 + (k % 3) * 0.05, ((k * 7) % 5 - 2) * 0.1); g.add(fl); const st = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 3), mat('#3f7a3a'), false); st.position.set(fl.position.x, 0.58, fl.position.z); g.add(st); }
      const bench = new THREE.Group(); bench.position.set(0, 0, -1.5);
      const seat = mesh(new THREE.BoxGeometry(2.2, 0.1, 0.5), mat('#7a5a3a')); seat.position.y = 0.5; bench.add(seat); const back = mesh(new THREE.BoxGeometry(2.2, 0.4, 0.07), mat('#7a5a3a')); back.position.set(0, 0.8, -0.22); bench.add(back);
      for (const sx of [-0.95, 0.95]) { const lg = mesh(new THREE.BoxGeometry(0.1, 0.5, 0.45), mat('#4a3420')); lg.position.set(sx, 0.25, 0); bench.add(lg); }
      bench.rotation.y = Math.PI; g.add(bench); C.add(g);
    }
    this.buildPick61();
    if (this.polishEgg) this.polishEgg();
  },
  // picareta 61: relíquia à mostra perto da fonte, soltando faíscas
  buildPick61() {
    const C = this.city, gtex = this.getGlowTex();
    // lugar: no meio do maior vão entre barracas, entre a fonte e as barracas
    const angs = NPCS.map(n => Math.atan2(n.y, n.x)).sort((a, b) => a - b); let best = 0, ba = 0;
    for (let i = 0; i < angs.length; i++) { const a = angs[i], b = i === angs.length - 1 ? angs[0] + Math.PI * 2 : angs[i + 1], gap = b - a; if (gap > best && !REGIONS.some(R => Math.abs(Math.atan2(Math.sin((a + gap / 2) - R.ang * Math.PI / 180), Math.cos((a + gap / 2) - R.ang * Math.PI / 180))) < 0.3)) { best = gap; ba = a + gap / 2; } }
    const g = new THREE.Group(); g.position.set(Math.cos(ba) * 6.2, 0, Math.sin(ba) * 6.2);
    const base = mesh(new THREE.CylinderGeometry(1.15, 1.35, 0.35, 8), mat('#6f6659')); base.position.y = 0.18; g.add(base);
    const ped = mesh(new THREE.CylinderGeometry(0.55, 0.8, 1.1, 8), mat('#8a8070')); ped.position.y = 0.9; g.add(ped);
    const cap = mesh(new THREE.CylinderGeometry(0.85, 0.6, 0.18, 8), mat('#b9ad98')); cap.position.y = 1.5; g.add(cap);
    const pick = this.makeHammer(61); pick.scale.setScalar(1.25); pick.rotation.set(0, 0, -0.5); pick.position.y = 1.75;
    const hold = new THREE.Group(); hold.add(pick); hold.position.y = 0; g.add(hold);
    // chuva de faíscas dos dois bicos
    const NS = 46, sp = new Float32Array(NS * 3), sc = new Float32Array(NS * 3), sg = new THREE.BufferGeometry(), seed = Array.from({ length: NS }, () => ({ a: Math.random() * 6.28, s: 0.5 + Math.random() * 0.9, r: Math.random(), v: 0.8 + Math.random() * 1.6, side: Math.random() < 0.5 ? -1 : 1 }));
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const sparks = new THREE.Points(sg, new THREE.PointsMaterial({ map: gtex, size: 0.14, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sparks.frustumCulled = false; g.add(sparks);
    const hv = new THREE.Vector3();
    sparks.onBeforeRender = () => {
      const t = performance.now() / 1000; hold.updateMatrixWorld(true); pick.userData.head.getWorldPosition(hv); g.worldToLocal(hv);
      for (let i = 0; i < NS; i++) { const q = seed[i], u = ((t * q.s * 0.9) + q.r) % 1, life = u * 1.1, hx = Math.cos(hold.rotation.y) * q.side * 0.9, hz = -Math.sin(hold.rotation.y) * q.side * 0.9;
        sp[i * 3] = hv.x + hx + Math.cos(q.a) * q.v * life * 0.9; sp[i * 3 + 1] = hv.y + q.v * life * 1.6 - 5.2 * life * life; sp[i * 3 + 2] = hv.z + hz + Math.sin(q.a) * q.v * life * 0.9;
        const f = Math.max(0, 1 - u) * Math.min(1, u * 10); sc[i * 3] = 1 * f; sc[i * 3 + 1] = (0.6 + 0.3 * q.r) * f; sc[i * 3 + 2] = 0.2 * f; }
      hold.position.y = Math.sin(t * 1.4) * 0.12; hold.rotation.y = t * 0.5;
      sg.attributes.position.needsUpdate = true; sg.attributes.color.needsUpdate = true;
    };
    const lab = labelSprite(tt("Picareta 61"), tt("o que vem depois do 60"), '#ffe27a', 0.7); lab.position.y = 6.2; g.add(lab);
    // sem luz real: a aura da picareta já faz o brilho
    C.add(g); this.pick61 = g;
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
  // ---------- vendedores: corpo com mais polígonos, roupa e cabelo de cada um, e um movimento de "vida" ----------
  makeVendor(id) {
    const S = {
      ferreiro: { skin: '#c48c62', shirt: '#9a3a22', pants: '#3a3434', hair: '#e2e2e2', apron: '#5a3a22', beard: '#e8e8e8', bald: true, big: 1.12 },
      tropeira: { skin: '#a8754f', shirt: '#3f7a4a', pants: '#6a4a2a', hair: '#2a1a10', skirt: '#7a5232', hat: 'straw', braid: true, big: 0.95 },
      bazar:    { skin: '#d4a17a', shirt: '#2a6a8a', pants: '#3a3f4a', hair: '#3a2a1c', vest: '#e0a020', cap: '#c0302a', mustache: '#3a2a1c', big: 1 },
      armazem:  { skin: '#c48c62', shirt: '#e0c890', pants: '#4a3a2a', hair: '#7a7a7a', apron: '#f0ece0', flatcap: '#5a4a3a', mustache: '#9a9a9a', big: 1.05 },
      botica:   { skin: '#e0b090', shirt: '#5a2a7a', pants: '#2a1a3a', hair: '#1a1a1a', robe: '#6a3a8a', glasses: true, goatee: '#1a1a1a', pointy: '#4a1a6a', big: 0.98 },
    }[id];
    const M = c => new THREE.MeshLambertMaterial({ color: c }), g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const sk = M(S.skin), sh = M(S.shirt);
    // pernas e sapatos
    for (const x of [-0.12, 0.12]) { const l = mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.82, 10), M(S.pants)); l.position.set(x, 0.43, 0); g.add(l); const sho = mesh(new THREE.SphereGeometry(0.1, 10, 8), M('#2a1e14')); sho.scale.set(1, 0.6, 1.5); sho.position.set(x, 0.05, 0.04); g.add(sho); }
    if (S.skirt) { const sk2 = mesh(new THREE.CylinderGeometry(0.2, 0.36, 0.6, 14), M(S.skirt)); sk2.position.y = 0.62; g.add(sk2); }
    if (S.robe) { const rb = mesh(new THREE.CylinderGeometry(0.24, 0.38, 0.95, 14), M(S.robe)); rb.position.y = 0.5; g.add(rb); }
    // tronco (respira)
    const torso = mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.62, 14), sh); torso.position.y = 1.18; body.add(torso);
    const belly = mesh(new THREE.SphereGeometry(0.235, 14, 10), sh); belly.scale.set(1, 0.6, 0.95); belly.position.y = 0.9; body.add(belly);
    const shoulders = mesh(new THREE.SphereGeometry(0.25, 14, 10), sh); shoulders.scale.set(1.12, 0.5, 0.85); shoulders.position.y = 1.47; body.add(shoulders);
    if (S.apron) { const ap = mesh(new THREE.BoxGeometry(0.42, 0.72, 0.03), M(S.apron)); ap.position.set(0, 1.0, 0.23); body.add(ap); const st = mesh(new THREE.TorusGeometry(0.2, 0.012, 4, 16, Math.PI), M(S.apron)); st.position.set(0, 1.4, 0.12); st.rotation.x = -0.4; body.add(st); }
    if (S.vest) for (const x of [-0.13, 0.13]) { const v = mesh(new THREE.BoxGeometry(0.16, 0.6, 0.04), M(S.vest)); v.position.set(x, 1.18, 0.22); body.add(v); }
    // cabeça (olha para o jogador)
    const head = new THREE.Group(); head.position.y = 1.78; body.add(head);
    const neck = mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 10), sk); neck.position.y = -0.16; head.add(neck);
    const skull = mesh(new THREE.SphereGeometry(0.17, 18, 14), sk); skull.scale.set(1, 1.1, 1.02); head.add(skull);
    const nose = mesh(new THREE.ConeGeometry(0.03, 0.08, 8), sk); nose.rotation.x = Math.PI / 2; nose.position.set(0, -0.01, 0.18); head.add(nose);
    for (const x of [-0.06, 0.06]) { const e = mesh(new THREE.SphereGeometry(0.022, 8, 6), M('#1a1410'), false); e.position.set(x, 0.04, 0.15); head.add(e); const br = mesh(new THREE.BoxGeometry(0.06, 0.012, 0.02), M(S.hair), false); br.position.set(x, 0.085, 0.155); head.add(br); const ear = mesh(new THREE.SphereGeometry(0.035, 8, 6), sk, false); ear.scale.set(0.5, 1, 0.8); ear.position.set(x * 2.8, 0.01, 0); head.add(ear); }
    const mouth = mesh(new THREE.BoxGeometry(0.06, 0.01, 0.01), M('#7a3a2a'), false); mouth.position.set(0, -0.07, 0.16); head.add(mouth);
    if (!S.bald) { const hr = mesh(new THREE.SphereGeometry(0.18, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M(S.hair)); hr.position.y = 0.02; hr.rotation.x = -0.25; head.add(hr); }
    else for (const x of [-1, 1]) { const tuft = mesh(new THREE.SphereGeometry(0.07, 8, 6), M(S.hair)); tuft.scale.set(0.6, 1, 1.2); tuft.position.set(x * 0.15, 0.0, -0.05); head.add(tuft); }
    if (S.beard) { const b = mesh(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), M(S.beard)); b.position.set(0, -0.03, 0.03); b.scale.set(1, 1.3, 1); head.add(b); }
    if (S.mustache) { const m = mesh(new THREE.TorusGeometry(0.05, 0.016, 6, 12, Math.PI), M(S.mustache), false); m.position.set(0, -0.045, 0.165); head.add(m); }
    if (S.goatee) { const gt = mesh(new THREE.ConeGeometry(0.03, 0.08, 8), M(S.goatee), false); gt.rotation.x = Math.PI; gt.position.set(0, -0.15, 0.13); head.add(gt); }
    if (S.glasses) for (const x of [-0.06, 0.06]) { const gl = mesh(new THREE.TorusGeometry(0.035, 0.007, 6, 14), M('#d8c070'), false); gl.position.set(x, 0.04, 0.165); head.add(gl); }
    if (S.braid) { for (let i = 0; i < 4; i++) { const bd = mesh(new THREE.SphereGeometry(0.045 - i * 0.006, 8, 6), M(S.hair)); bd.position.set(0, -0.06 - i * 0.07, -0.17); head.add(bd); } }
    if (S.hat === 'straw') { const brim = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.02, 20), M('#d8b860')); brim.position.y = 0.12; head.add(brim); const top = mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.14, 16), M('#d8b860')); top.position.y = 0.2; head.add(top); const band = mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.035, 16), M('#9a3a22')); band.position.y = 0.15; head.add(band); }
    if (S.cap) { const c = mesh(new THREE.SphereGeometry(0.185, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), M(S.cap)); c.position.y = 0.04; head.add(c); const v = mesh(new THREE.BoxGeometry(0.22, 0.015, 0.14), M(S.cap)); v.position.set(0, 0.06, 0.2); head.add(v); }
    if (S.flatcap) { const c = mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.08, 16), M(S.flatcap)); c.position.set(0, 0.13, 0.02); c.rotation.x = 0.15; head.add(c); const v = mesh(new THREE.BoxGeometry(0.2, 0.015, 0.1), M(S.flatcap)); v.position.set(0, 0.1, 0.2); head.add(v); }
    if (S.pointy) { const c = mesh(new THREE.ConeGeometry(0.2, 0.42, 16), M(S.pointy)); c.position.y = 0.3; c.rotation.z = 0.15; head.add(c); const brim = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.02, 20), M(S.pointy)); brim.position.y = 0.11; head.add(brim); }
    // braços: ombro -> cotovelo -> mão (animados)
    const arms = [];
    for (const sd of [-1, 1]) {
      const sh0 = new THREE.Group(); sh0.position.set(sd * 0.32, 1.45, 0); body.add(sh0);
      const up = mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.34, 10), sh); up.position.y = -0.17; sh0.add(up);
      const el = new THREE.Group(); el.position.y = -0.34; sh0.add(el);
      const fo = mesh(new THREE.CylinderGeometry(0.062, 0.05, 0.3, 10), S.robe || S.apron ? sh : sh); fo.position.y = -0.15; el.add(fo);
      const hand = mesh(new THREE.SphereGeometry(0.06, 10, 8), sk); hand.position.y = -0.32; el.add(hand);
      sh0.rotation.z = sd * 0.12; el.rotation.x = -0.5;
      arms.push({ sh0, el, sd, hand });
    }
    if (id === 'ferreiro') { const hm = this.hammerInHand(12); hm.scale.setScalar(0.55); hm.rotation.set(Math.PI / 2, 0, 0); hm.position.set(0, -0.36, 0.06); arms[1].el.add(hm); }
    g.scale.setScalar(S.big);
    g.userData.anim = { id, body, head, torso, arms, ph: Math.random() * 6 };
    // junta as peças de cada parte que se mexe junto (cabeça, antebraços, pernas) para pesar menos
    this.mergeStatic(head, true); for (const a of arms) this.mergeStatic(a.el, true); this.mergeStatic(g, true);
    return g;
  },
  // o que cada barraca vende, exposto no balcão de frente para quem chega
  makeWares(id) {
    const g = new THREE.Group(), top = 1.0, z = 0.95;
    const put = (o, x, y = 0, s = 1, ry = 0, rx = 0) => { o.scale.multiplyScalar(s); o.position.set(x, top + y, z); o.rotation.set(rx, ry, 0); g.add(o); return o; };
    if (id === 'ferreiro') {
      // suporte com martelos de níveis diferentes + bigorna ao lado
      const rack = mesh(new THREE.BoxGeometry(3.4, 0.08, 0.3), mat('#5a3d24')); rack.position.set(0, top + 0.05, z - 0.1); g.add(rack);
      [6, 16, 26, 38, 50].forEach((L, i) => { const h = this.hammerInHand(L); h.scale.setScalar(0.42 + i * 0.03); h.position.set(-1.4 + i * 0.7, top + 0.1, z); h.rotation.set(0, 0, 0.25); g.add(h); });
      const anvil = new THREE.Group(); const ab = mesh(new THREE.BoxGeometry(0.5, 0.42, 0.34), mat('#3a3d42', { shininess: 40 })); ab.position.y = 0.21; anvil.add(ab);
      const at = mesh(new THREE.BoxGeometry(0.9, 0.16, 0.36), mat('#4a4e55', { shininess: 70 })); at.position.y = 0.5; anvil.add(at); const horn = mesh(new THREE.ConeGeometry(0.12, 0.38, 8), mat('#4a4e55', { shininess: 70 })); horn.rotation.z = Math.PI / 2; horn.position.set(-0.6, 0.5, 0); anvil.add(horn);
      anvil.position.set(0.55, 0, -0.55); g.add(anvil);
      const fire = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.getGlowTex(), color: '#ff7a2a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 })); fire.scale.setScalar(0.6); fire.position.set(0.55, 1.12, -0.55); g.add(fire); g.userData.fire = fire;
    } else if (id === 'tropeira') {
      put(this.makeGloveItem({ col: '#8a5a32', era: 2 }), -1.45, 0.25, 0.9);
      put(this.makeBootItem({ col: '#6b4a2c', sole: '#2a1a10', era: 3 }), -0.45, 0.04, 0.95, 0.4);
      const bag = new THREE.Group(); const bb = mesh(new THREE.BoxGeometry(0.55, 0.62, 0.32), mat('#7a5a32')); bb.position.y = 0.31; bag.add(bb); const fl = mesh(new THREE.BoxGeometry(0.57, 0.22, 0.34), mat('#5a3d24')); fl.position.y = 0.55; bag.add(fl); const pk = mesh(new THREE.BoxGeometry(0.36, 0.2, 0.08), mat('#6a4a2a')); pk.position.set(0, 0.22, 0.19); bag.add(pk); for (const x of [-0.15, 0.15]) { const st = mesh(new THREE.TorusGeometry(0.16, 0.025, 4, 12, Math.PI), mat('#3a2a1a')); st.position.set(x, 0.62, -0.1); st.rotation.y = Math.PI / 2; bag.add(st); }
      put(bag, 0.6, 0, 1);
      const spring = mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 20), mat('#c8ccd2', { shininess: 80 })); for (let i = 0; i < 4; i++) { const r = spring.clone(); r.rotation.x = Math.PI / 2; r.position.set(1.45, top + 0.06 + i * 0.07, z); g.add(r); }
    } else if (id === 'bazar') {
      put(this.makeDetector(2), -1.5, 0.05, 1.1, 0.3);
      put(this.makeSkate(), -0.55, 0.05, 0.9, 0.6);
      const rope = this.makeClimbItem(1); put(rope, 0.35, 0.25, 1.3, 0, Math.PI / 2.4);
      const rb = this.makeRobot(0); put(rb, 1.35, 0, 0.55, -0.3);
    } else if (id === 'armazem') {
      const crate = c => { const b = mesh(new THREE.BoxGeometry(0.5, 0.42, 0.42), mat(c)); b.position.y = 0.21; return b; };
      for (const [x, c] of [[-1.5, '#a07a4a'], [-0.95, '#8a6a3a']]) { const cr = crate(c); cr.position.set(x, top + 0.21, z); g.add(cr); const ore = mesh(jitterGeo(new THREE.IcosahedronGeometry(0.14, 0), 0.04, x * 10), mat(x < -1 ? '#b8b0a0' : '#c9822a')); ore.position.set(x, top + 0.46, z); g.add(ore); }
      for (const [x, c] of [[-0.25, '#b89a6a'], [0.15, '#a88a5a']]) { const sack = mesh(jitterGeo(new THREE.SphereGeometry(0.17, 10, 8), 0.03, x * 7), mat(c)); sack.scale.set(1, 1.3, 0.9); sack.position.set(x, top + 0.2, z); g.add(sack); }
      const scale = new THREE.Group(); const post = mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.5, 6), mat('#b8a060', { shininess: 80 })); post.position.y = 0.25; scale.add(post); const beam = mesh(new THREE.BoxGeometry(0.6, 0.02, 0.02), mat('#b8a060', { shininess: 80 })); beam.position.y = 0.5; scale.add(beam); for (const x of [-0.28, 0.28]) { const pan = mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.03, 12), mat('#b8a060', { shininess: 80 })); pan.position.set(x, 0.36, 0); scale.add(pan); }
      put(scale, 1.2, 0, 1.1); g.userData.scaleBeam = beam;
      const coins = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12), mat('#e8c040', { shininess: 90, emissive: '#5a4000', emissiveIntensity: 0.3 })); coins.position.set(0.85, top + 0.06, z + 0.1); g.add(coins);
    } else if (id === 'botica') {
      ['tonico', 'cafe', 'elixir'].forEach((p, i) => { if (!POWERUPS[p]) return; put(this.makeFlask(p, 2.2), -1.2 + i * 0.9, 0.24, 1); });
      for (let i = 0; i < 5; i++) { const jar = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 10), mat(['#9ad0a0', '#e0b0d8', '#a0c8f0', '#f0d090', '#d0a080'][i], { transparent: true, opacity: 0.8 })); jar.position.set(-1.6 + i * 0.25, top + 0.08, z - 0.25); g.add(jar); }
      const caul = mesh(new THREE.SphereGeometry(0.28, 14, 10, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.65), mat('#2a2a30')); caul.position.set(1.35, top + 0.18, z); g.add(caul);
      const brew = mesh(new THREE.CircleGeometry(0.22, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7af06a' })); brew.position.set(1.35, top + 0.3, z); g.add(brew);
      const bub = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.getGlowTex(), color: '#7af06a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 })); bub.scale.setScalar(0.7); bub.position.set(1.35, top + 0.45, z); g.add(bub); g.userData.bub = bub;
    }
    g.userData.wares = id; return g;
  },
  // vendedores se mexem: respiram, olham para você, e cada um tem um gesto (o ferreiro bate na bigorna)
  updateVendors(dt) {
    if (!this.npcObjs) return;
    const t = this.t, P = Game.P;
    for (const g of this.npcObjs) {
      const p = g.userData.person; if (!p || !p.userData.anim) continue;
      const A = p.userData.anim, near = Math.hypot(g.position.x - P.x, g.position.z - P.y) < 22;
      if (!near) continue;
      A.torso.scale.set(1 + Math.sin(t * 1.6 + A.ph) * 0.015, 1, 1 + Math.sin(t * 1.6 + A.ph) * 0.02);
      // cabeça vira devagar para o jogador (limitado)
      const wp = p.getWorldPosition(this._vp || (this._vp = new V3())), ang = Math.atan2(P.x - wp.x, P.y - wp.z), base = g.rotation.y + (g.parent ? g.parent.rotation.y : 0);
      let rel = Math.atan2(Math.sin(ang - base), Math.cos(ang - base)); rel = Math.max(-0.9, Math.min(0.9, rel));
      A.head.rotation.y += (rel - A.head.rotation.y) * Math.min(1, dt * 3); A.head.rotation.x = Math.sin(t * 0.7 + A.ph) * 0.05;
      const [L, Rr] = A.arms;
      if (A.id === 'ferreiro') { const k = Math.max(0, Math.sin(t * 3.2)); Rr.sh0.rotation.x = -0.4 - k * 1.1; Rr.el.rotation.x = -0.9 + k * 0.5; L.sh0.rotation.x = -0.3; L.el.rotation.x = -1.0; }
      else if (A.id === 'botica') { const k = Math.sin(t * 2 + A.ph); Rr.sh0.rotation.x = -0.6 + k * 0.15; Rr.el.rotation.x = -1.2 + k * 0.2; L.sh0.rotation.x = -0.2; L.el.rotation.x = -0.4; }
      else { const wave = Math.max(0, Math.sin(t * 0.6 + A.ph)) ** 6; Rr.sh0.rotation.x = -0.3 - wave * 1.6; Rr.sh0.rotation.z = 0.12 + wave * 0.5; Rr.el.rotation.x = -0.5 - wave * 0.8; L.sh0.rotation.x = -0.25 + Math.sin(t + A.ph) * 0.05; L.el.rotation.x = -0.6; }
      const w = g.children.find(c => c.userData && c.userData.wares);
      if (w && w.userData.fire) w.userData.fire.material.opacity = 0.6 + Math.sin(t * 9) * 0.25;
      if (w && w.userData.bub) w.userData.bub.material.opacity = 0.45 + Math.sin(t * 5) * 0.2;
    }
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
    this.disposeObj(this.houses); this.houses.clear();
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
    this.mergeStatic(this.houses, true);
  },

  // estradas de terra visíveis de longe: das minas 2 a 6, saem da cidade e vão até a metade do caminho
  buildMineRoads() {
    const tex = canvasTex(128, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(138,116,84,0)'); gr.addColorStop(0.12, 'rgba(138,116,84,.85)'); gr.addColorStop(0.5, 'rgba(150,126,92,1)'); gr.addColorStop(0.88, 'rgba(138,116,84,.85)'); gr.addColorStop(1, 'rgba(138,116,84,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const r = rng(5);
      g.fillStyle = 'rgba(70,52,34,.35)'; g.fillRect(w * 0.27, 0, 9, h); g.fillRect(w * 0.66, 0, 9, h); // sulcos de carroça
      for (let i = 0; i < 260; i++) { g.fillStyle = r() < 0.5 ? 'rgba(60,44,30,.28)' : 'rgba(205,185,150,.25)'; const x = w * (0.1 + r() * 0.8); g.fillRect(x, r() * h, 1 + r() * 3, 1 + r() * 3); }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const m = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const stone = new THREE.MeshLambertMaterial({ color: '#8a857a', flatShading: true });
    this.mineRoads = [];
    for (const R of REGIONS) {
      if (R.id === 0) continue; // a primeira mina é colada na cidade
      const d0 = CITY_R + 2, d1 = roadEnd(R), step = 4, pos = [], uv = [], idx = [];
      const C = d => { const sw = roadSway(R, d); return [R.ux * d + R.vx * sw, R.uy * d + R.vy * sw]; };
      let i = 0;
      for (let d = d0; d <= d1 + 0.01; d += step, i++) {
        const [cx, cy] = C(d), [ax, ay] = C(d - 1.5), [bx, by] = C(d + 1.5);
        let tx = bx - ax, ty = by - ay; const l = Math.hypot(tx, ty); tx /= l; ty /= l;
        const taper = d > d1 - 36 ? 0.35 + 0.65 * (d1 - d) / 36 : 1, hw = 2.3 * taper, nx = -ty * hw, ny = tx * hw;
        pos.push(cx + nx, World.height(cx + nx, cy + ny) + 0.1, cy + ny, cx - nx, World.height(cx - nx, cy - ny) + 0.1, cy - ny);
        uv.push(0, d / 7, 1, d / 7);
        if (d + step <= d1 + 0.01) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      const road = new THREE.Mesh(geo, m); road.receiveShadow = true; road.renderOrder = -1; road.frustumCulled = false; this.scene.add(road); this.mineRoads.push(road);
      // marcos de pedra ao longo do caminho (um por trecho de ~25%)
      for (let k = 1; k <= 3; k++) {
        const d = d0 + (d1 - d0) * k / 4, [cx, cy] = C(d), side = k % 2 ? 1 : -1, x = cx + R.vx * 3.1 * side, y = cy + R.vy * 3.1 * side;
        const mk = new THREE.Group(); mk.position.set(x, World.height(x, y), y); mk.rotation.y = d;
        const base = mesh(new THREE.BoxGeometry(0.55, 0.9, 0.4), stone); base.position.y = 0.45; mk.add(base);
        const cap = mesh(new THREE.DodecahedronGeometry(0.32, 0), stone); cap.position.y = 1.0; mk.add(cap);
        this.scene.add(mk);
      }
      // placa no fim da estrada
      const [ex, ey] = C(d1 - 4), sx = ex + R.vx * 3, sy = ey + R.vy * 3, h = World.height(sx, sy);
      const post = mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 6), mat('#4a3420')); post.position.set(sx, h + 1.2, sy); this.scene.add(post);
      const lab = labelSprite(`${R.dir} → ${R.name}`, tt("mais {0} m adiante", Math.round(R.dMin - d1)), '#f5e6c8', 1.1); lab.position.set(sx, h + 2.9, sy); this.scene.add(lab);
    }
  },
  buildRoadsAndRiver() {
    // placas nas saídas da cidade
    for (const R of REGIONS) {
      const x = R.ux * (CITY_R + 4) + R.vx * 3.5, y = R.uy * (CITY_R + 4) + R.vy * 3.5, h = World.height(x, y);
      const post = mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 6), mat('#4a3420')); post.position.set(x, h + 1.2, y); this.scene.add(post);
      const lab = labelSprite(`${R.dir} → ${R.name}`, tt("níveis {0}–{1}", (R.era - 1) * 10 + 1, R.era * 10)); lab.position.set(x, h + 2.7, y); this.scene.add(lab);
    }
    this.buildMineRoads();
    // riacho no Leste
    const R = REGIONS[1], pts = [];
    for (let d = R.dMin - 10; d <= R.dMax + 10; d += 3) { const p = riverP(d); pts.push([R.ux * d + R.vx * p, R.uy * d + R.vy * p]); }
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
        // valão: a parede fica do lado de cima (antes da divisa); planalto: do lado de cima também (depois da divisa)
        const fs = P.up, both = (d, a, c) => { const top = Math.max(a, c), bot = Math.min(a, c); if (P.ramp && k < 10) { wall(d, fs, -half, -g, top, bot); wall(d, fs, g, half, top, bot); } else wall(d, fs, -half, half, top, bot); };
        const H = (dd, pp) => World.height(R.ux * dd + R.vx * pp, R.uy * dd + R.vy * pp);
        if (k === 0) both(b + 0.05 * fs, H(b - 2, hp) + 0.2, H(b + 1.5, hp));
        else if (k < 10) both(b, H(b - 1.2, hp), H(b + 1, hp));
        else { const a = H(b + 3, 0), c = H(b - 1.5, 0); wall(fs > 0 ? b + 2.2 : b - 2.2, fs, -half, half, Math.max(a, c) + 0.2, Math.min(a, c)); }
      }
    }
  },
  // ---------- paredes da mina em espiral (Serra dos Cristais) ----------
  buildSpiralWalls() {
    const R = REGIONS[5], S = R.spiral; if (!S) return;
    const tex = this.fossilTex(R); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const m = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
    const pos = [], uv = [], idx = []; let base = 0;
    for (let n = -1; n < S.turns; n++) {
      const N = 120;
      for (let i = 0; i <= N; i++) {
        const f = i / N, a = S.a0 + f * Math.PI * 2, r = S.R0 - S.W * (n + 1 + f), x = S.cx + Math.cos(a) * r, y = S.cy + Math.sin(a) * r;
        const top = n < 0 ? World.height(x + Math.cos(a) * 1.2, y + Math.sin(a) * 1.2) + 0.3 : -S.H * (n + f) + 0.3, bot = -Math.min(S.H * S.turns, S.H * (n + 1 + f)) - 0.5;
        pos.push(x, top, y, x, bot, y); const u = f * r * Math.PI * 2 / 9; uv.push(u, top / 9, u, bot / 9);
        if (i < N) idx.push(base + i * 2, base + i * 2 + 1, base + i * 2 + 2, base + i * 2 + 1, base + i * 2 + 3, base + i * 2 + 2);
      }
      base += (N + 1) * 2;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const w = new THREE.Mesh(g, m); w.receiveShadow = true; this.scene.add(w); this.spiralWalls = w;
  },
  // ---------- teto da Mina Velha (caverna), lampiões, trilhos e estalactites ----------
  buildCave() {
    const R = REGIONS[3]; if (!R.pit) return;
    const G = new THREE.Group(); this.scene.add(G); this.cave = G;
    const L = R.pitL, d0 = R.dMin + L * 0.1, d1 = R.dMax - 3, rock = new THREE.MeshLambertMaterial({ color: '#4a3a2e', flatShading: true });
    const rot = -Math.atan2(R.uy, R.ux), seg = 25, r = rng(303);
    for (let d = d0; d < d1; d += seg) {
      const dd = Math.min(seg, d1 - d), dc = d + dd / 2, half = World.pitHalf(R, dc) + 3;
      // laje do teto: um pouco irregular por cima, com estalactites embaixo
      const slab = mesh(jitterGeo(new THREE.BoxGeometry(dd + 0.6, 3, half * 2, 3, 1, 4), 0.5, d), rock); slab.position.set(R.ux * dc, -0.2 + 1.5, R.uy * dc); slab.rotation.y = rot; G.add(slab);
      for (let i = 0; i < 7; i++) { const p = (r() - 0.5) * half * 1.7, dl = d + r() * dd, h = 0.8 + r() * 2.2; const st = mesh(new THREE.ConeGeometry(0.25 + r() * 0.4, h, 6), rock, false); st.rotation.x = Math.PI; st.position.set(R.ux * dl + R.vx * p, -0.2 - h / 2, R.uy * dl + R.vy * p); G.add(st); }
    }
    // lampiões nas paredes (brilho falso, sem luz real) e trilho no meio
    const lampMat = new THREE.SpriteMaterial({ map: this.getGlowTex(), color: '#ffb050', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 });
    const rail = mat('#6a6a70', { shininess: 60 }), sleeper = mat('#4a3424');
    for (let d = R.dMin + 6; d < R.dMax - 4; d += 14) {
      const half = World.pitHalf(R, d) - 0.6;
      for (const sd of [-1, 1]) { const x = R.ux * d + R.vx * half * sd, y = R.uy * d + R.vy * half * sd, h = World.height(R.ux * d + R.vx * (half - 2) * sd, R.uy * d + R.vy * (half - 2) * sd);
        const box = mesh(new THREE.BoxGeometry(0.22, 0.32, 0.22), mat('#2a2a2a'), false); box.position.set(x, h + 2.4, y); G.add(box);
        const gl = new THREE.Sprite(lampMat); gl.scale.setScalar(2.6); gl.position.set(x, h + 2.4, y); G.add(gl); }
    }
    for (let d = R.dMin + 2; d < R.dMax - 2; d += 1.6) {
      const p = 9, x = R.ux * d + R.vx * p, y = R.uy * d + R.vy * p, h = World.height(x, y);
      const sl = mesh(new THREE.BoxGeometry(0.3, 0.08, 1.5), sleeper, false); sl.position.set(x, h + 0.04, y); sl.rotation.y = rot; G.add(sl);
    }
    for (const off of [-0.5, 0.5]) { const pts = []; for (let d = R.dMin + 2; d < R.dMax - 2; d += 4) { const p = 9 + off, x = R.ux * d + R.vx * p, y = R.uy * d + R.vy * p; pts.push(new V3(x, World.height(x, y) + 0.12, y)); } const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 0.04, 4), rail); G.add(tube); }
    this.mergeStatic(G, true);
  },
  // ---------- enfeites de cada região: ruínas no planalto, cristais na espiral, blocos na pedreira, seixos no riacho ----------
  buildMineDecor() {
    const G = new THREE.Group(); this.scene.add(G); this.mineDecor = G; const r = rng(808);
    // Vila em Ruínas (planalto): muros quebrados, colunas e arcos nas laterais de cada patamar
    { const R = REGIONS[2], stone = new THREE.MeshLambertMaterial({ color: '#b0a088', flatShading: true }), moss = new THREE.MeshLambertMaterial({ color: '#6a7a4a', flatShading: true }), rot = -Math.atan2(R.uy, R.ux);
      for (let k = 0; k < 10; k++) for (const sd of [-1, 1]) {
        const d = R.dMin + R.pitL * (k + 0.2 + r() * 0.6), half = World.pitHalf(R, d), p = sd * (half - 4 - r() * 6), x = R.ux * d + R.vx * p, y = R.uy * d + R.vy * p, h = World.height(x, y);
        const kind = r();
        if (kind < 0.5) { // pedaço de muro com o topo quebrado
          const len = 4 + r() * 6, wall = new THREE.Group();
          for (let i = 0; i < len / 0.8; i++) { const hh = 0.6 + r() * 2.4 * (1 - Math.abs(i / (len / 0.8) - 0.5)); const b = mesh(jitterGeo(new THREE.BoxGeometry(0.78, hh, 0.7), 0.08, i + k * 9), stone); b.position.set(i * 0.8 - len / 2, hh / 2, 0); wall.add(b); if (r() < 0.3) { const mo = mesh(new THREE.BoxGeometry(0.8, 0.1, 0.72), moss, false); mo.position.set(i * 0.8 - len / 2, hh + 0.04, 0); wall.add(mo); } }
          wall.position.set(x, h, y); wall.rotation.y = rot + Math.PI / 2 + (r() - 0.5) * 0.4; G.add(wall);
        } else if (kind < 0.8) { // coluna (às vezes caída)
          const fallen = r() < 0.4, c = mesh(new THREE.CylinderGeometry(0.35, 0.4, 3.4, 10), stone); if (fallen) { c.rotation.z = Math.PI / 2; c.position.set(x, h + 0.38, y); c.rotation.y = r() * 3; } else c.position.set(x, h + 1.7, y); G.add(c);
          const cap = mesh(new THREE.BoxGeometry(1, 0.3, 1), stone); cap.position.set(x + (fallen ? 2 : 0), h + (fallen ? 0.15 : 3.5), y); G.add(cap);
        } else { // arco
          const arch = new THREE.Group(); for (const ax of [-1.4, 1.4]) { const pl = mesh(new THREE.BoxGeometry(0.7, 3, 0.7), stone); pl.position.set(ax, 1.5, 0); arch.add(pl); }
          const top = mesh(new THREE.TorusGeometry(1.4, 0.35, 6, 10, Math.PI), stone); top.position.y = 3; arch.add(top); arch.position.set(x, h, y); arch.rotation.y = rot + (r() - 0.5); G.add(arch);
        }
      } }
    // Serra dos Cristais (espiral): cristais nas paredes e na rampa, mais e maiores conforme desce
    { const R = REGIONS[5], S = R.spiral; if (S) {
      const cg = new THREE.OctahedronGeometry(1, 0); cg.scale(0.35, 1.4, 0.35);
      const N = 520, cm = new THREE.InstancedMesh(cg, new THREE.MeshLambertMaterial({ emissive: '#3a2a6a', emissiveIntensity: 0.6 }), N), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new V3(), pv = new V3(), col = new THREE.Color(), e = new THREE.Euler();
      const pal = ['#b89cff', '#7ad8ff', '#ff9ad8', '#c8ffe8'];
      let i = 0;
      while (i < N) {
        const tot = Math.pow(r(), 0.7) * S.turns, f = tot - Math.floor(tot), a = S.a0 + f * Math.PI * 2, rr = S.R0 - S.W * (Math.floor(tot) + 1 + f) + 0.6 + r() * 1.5;
        const x = S.cx + Math.cos(a) * rr, y = S.cy + Math.sin(a) * rr, h = World.height(x, y), k = 0.5 + tot / S.turns * 1.6;
        for (let c = 0; c < 3 && i < N; c++, i++) { e.set((r() - 0.5) * 0.9, r() * 6, (r() - 0.5) * 0.9 + (c - 1) * 0.4); q.setFromEuler(e); const sc = k * (0.6 + r() * 0.8); sv.set(sc, sc, sc); pv.set(x + (r() - 0.5), h + sc * 0.6 + r() * 2, y + (r() - 0.5)); m4.compose(pv, q, sv); cm.setMatrixAt(i, m4); col.set(pal[Math.floor(r() * 4)]); cm.setColorAt(i, col); }
      }
      cm.frustumCulled = false; G.add(cm); this.crystalDeco = cm;
    } }
    // Pedreira Funda: blocos cortados empilhados perto das paredes de cada bancada
    { const R = REGIONS[4], cut = [new THREE.MeshLambertMaterial({ color: '#b8b6b0' }), new THREE.MeshLambertMaterial({ color: '#a29f99' }), new THREE.MeshLambertMaterial({ color: '#c9c6bf' })];
      for (let k = 0; k < 10; k++) for (let j = 0; j < 3; j++) {
        const d = R.dMin + R.pitL * (k + 0.15 + r() * 0.7), half = World.pitHalf(R, d), p = (r() < 0.5 ? -1 : 1) * (half - 3 - r() * 4), x = R.ux * d + R.vx * p, y = R.uy * d + R.vy * p, h = World.height(x, y);
        const n = 2 + Math.floor(r() * 4); for (let b = 0; b < n; b++) { const bl = mesh(new THREE.BoxGeometry(1.6, 0.9, 1.1), cut[b % 3]); bl.position.set(x + (b % 2) * 1.7 - 0.8, h + 0.45 + Math.floor(b / 2) * 0.9, y + (r() - 0.5) * 0.3); bl.rotation.y = r() * 0.3; G.add(bl); }
      } }
    // Riacho das Pedras: seixos arredondados nas margens
    { const R = REGIONS[1], N = 900, pg = new THREE.SphereGeometry(1, 8, 6), pm = new THREE.InstancedMesh(pg, new THREE.MeshLambertMaterial({ flatShading: false }), N), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new V3(), pv = new V3(), col = new THREE.Color();
      for (let i = 0; i < N; i++) { const d = R.dMin - 30 + r() * (R.dMax - R.dMin + 60), side = r() < 0.5 ? -1 : 1, p = riverP(d) + side * (2.8 + r() * 6), x = R.ux * d + R.vx * p, y = R.uy * d + R.vy * p, s = 0.15 + r() * 0.45;
        q.setFromAxisAngle(new V3(0, 1, 0), r() * 6); sv.set(s * 1.3, s * 0.6, s); pv.set(x, World.height(x, y) + s * 0.2, y); m4.compose(pv, q, sv); pm.setMatrixAt(i, m4); col.setHSL(0.08, 0.06, 0.45 + r() * 0.25); pm.setColorAt(i, col); }
      pm.frustumCulled = false; G.add(pm); }
    this.mergeStatic(G, true);
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
      this.mergeStatic(g, true); this.scene.add(g);
    }
  },

  // ---------- árvores, pedregulhos e capim ----------
  buildDecor() {
    const trunks = [], crowns = [], rocks = [], pines = [], bushes = [];
    const r = rng(42);
    const ok = (x, y) => {
      const d = Math.hypot(x, y); if (d < CITY_R + 6) return false;
      for (const R of REGIONS) { const l = World.local(R, x, y); if (l.d > 0 && l.d < R.dMin + 14 && Math.abs(l.p) < 6) return false; }
      for (const o of World.obstacles) { const l = World.local(o.R, x, y); if (Math.abs(l.d - o.dc) < o.t + 3 && Math.abs(l.p - o.pc) < o.len / 2 + 3) return false; }
      return true;
    };
    for (let i = 0; i < 52000; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 4250, x = Math.cos(a) * d, y = Math.sin(a) * d;
      if (Math.hypot(x - Z7.x, y - Z7.y) < Z7.flatR) continue;
      if (!ok(x, y)) continue;
      if (World.mountainH(x, y) > 4) { if (r() < 0.12) rocks.push([x, y, 0.6 + r() * 1.6, '#6a645c']); continue; }
      const g = World.groundAt(x, y);
      if (g && g.edge === 1) { if (g.R.id >= 1 && r() < 0.06) rocks.push([x, y, 0.6 + r() * 1.8, g.R.ground[2]]); continue; }
      const nearBosque = (g && g.R.id === 0) || d < 260;
      // bosquezinhos: o ruído decide onde ficam as matas (fora delas, campo aberto com arbustos)
      const mata = Math.sin(x * 0.009 + 1.7) * Math.cos(y * 0.011 - 0.4) + Math.sin((x - y) * 0.004) * 0.6;
      const pTree = nearBosque ? 0.55 : mata > 0.55 ? 0.35 : mata > 0.1 ? 0.06 : 0.015;
      if (r() < pTree) { const s = 0.7 + r() * 0.9, pine = r() < (d > 1500 ? 0.65 : 0.35); if (pine) pines.push([x, y, s * 1.1, r()]); else { trunks.push([x, y, s]); crowns.push([x, y, s, r()]); } }
      else if (r() < 0.05) bushes.push([x, y, 0.5 + r() * 0.6, r()]);
      else if (r() < 0.035) rocks.push([x, y, 0.5 + r() * 1.5, '#7a786f']);
    }
    const tGeo = new THREE.CylinderGeometry(0.22, 0.32, 3, 6); tGeo.translate(0, 1.5, 0);
    const cGeo = jitterGeo(new THREE.IcosahedronGeometry(2.2, 0), 0.6, 3); cGeo.translate(0, 4.4, 0);
    const rGeo = jitterGeo(new THREE.DodecahedronGeometry(1, 0), 0.35, 11);
    // pinheiro: tronco + 4 andares de copa (cones que encaixam), com a cor mais escura embaixo
    const pGeo = (() => { const parts = []; const tr = new THREE.CylinderGeometry(0.16, 0.24, 2.2, 6); tr.translate(0, 1.1, 0); parts.push([tr, [0.35, 0.24, 0.14]]);
      [[2.3, 2.4, 1.6], [1.85, 2.2, 2.9], [1.35, 2.0, 4.1], [0.85, 1.7, 5.2]].forEach(([rad, hh, y], i) => { const c = jitterGeo(new THREE.ConeGeometry(rad, hh, 8, 1), 0.12, i + 4); c.translate(0, y + hh / 2, 0); const k = 0.75 + i * 0.09; parts.push([c, [0.2 * k, 0.42 * k, 0.22 * k]]); });
      const P = [], N = [], C = []; for (const [gg, cc] of parts) { const ni = gg.toNonIndexed(); ni.computeVertexNormals(); P.push(...ni.attributes.position.array); N.push(...ni.attributes.normal.array); for (let i = 0; i < ni.attributes.position.count; i++) C.push(...cc); }
      const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); return out; })();
    const pMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const bGeo = jitterGeo(new THREE.IcosahedronGeometry(1, 1), 0.25, 21); bGeo.scale(1.2, 0.75, 1.1); bGeo.translate(0, 0.45, 0);
    const tMat = mat('#5a3d24'), cMat = new THREE.MeshLambertMaterial({ flatShading: true }), rMat = new THREE.MeshLambertMaterial({ flatShading: true });
    // árvores e pedregulhos divididos em blocos de 200 m: cada bloco só é desenhado quando está perto e na frente da câmera
    const CH = 200, cells = new Map(), cell = (x, y) => { const k = Math.floor(x / CH) + ',' + Math.floor(y / CH); if (!cells.has(k)) cells.set(k, { t: [], c: [], r: [], p: [], b: [], cx: (Math.floor(x / CH) + 0.5) * CH, cy: (Math.floor(y / CH) + 0.5) * CH }); return cells.get(k); };
    trunks.forEach(t => cell(t[0], t[1]).t.push(t)); crowns.forEach(c => cell(c[0], c[1]).c.push(c)); rocks.forEach(r => cell(r[0], r[1]).r.push(r)); pines.forEach(v => cell(v[0], v[1]).p.push(v)); bushes.forEach(v => cell(v[0], v[1]).b.push(v));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new V3(), pv = new V3(), col = new THREE.Color(), up = new V3(0, 1, 0);
    this.decoChunks = [];
    for (const C of cells.values()) {
      const ch = { x: C.cx, y: C.cy, list: [] };
      if (C.t.length) { const tm = new THREE.InstancedMesh(tGeo, tMat, C.t.length); C.t.forEach(([x, y, s2], i) => { q.identity(); pv.set(x, World.height(x, y) - 0.1, y); sv.set(s2, s2, s2); m4.compose(pv, q, sv); tm.setMatrixAt(i, m4); }); ch.tm = tm; ch.list.push(tm); }
      if (C.c.length) { const cm = new THREE.InstancedMesh(cGeo, cMat, C.c.length); C.c.forEach(([x, y, s2, v], i) => { q.setFromAxisAngle(up, v * 6); pv.set(x, World.height(x, y) - 0.1, y); sv.set(s2, s2 * (0.9 + v * 0.3), s2); m4.compose(pv, q, sv); cm.setMatrixAt(i, m4); col.setHSL(0.23 + v * 0.07, 0.45, 0.22 + v * 0.1); cm.setColorAt(i, col); }); ch.cm = cm; ch.list.push(cm); }
      if (C.r.length) { const rm = new THREE.InstancedMesh(rGeo, rMat, C.r.length); q.identity(); C.r.forEach(([x, y, s2, c], i) => { pv.set(x, World.height(x, y) + s2 * 0.2, y); sv.set(s2, s2 * 0.7, s2 * 1.1); m4.compose(pv, q, sv); rm.setMatrixAt(i, m4); col.set(c); col.offsetHSL(0, 0, -0.05); rm.setColorAt(i, col); }); ch.rm = rm; ch.list.push(rm); }
      if (C.p.length) { const pm = new THREE.InstancedMesh(pGeo, pMat, C.p.length); C.p.forEach(([x, y, s2, v], i) => { q.setFromAxisAngle(up, v * 6); pv.set(x, World.height(x, y) - 0.15, y); sv.set(s2, s2 * (0.85 + v * 0.4), s2); m4.compose(pv, q, sv); pm.setMatrixAt(i, m4); col.setHSL(0.3 + v * 0.06, 0.25, 0.75 + v * 0.3); pm.setColorAt(i, col); }); ch.cm2 = pm; ch.list.push(pm); }
      if (C.b.length) { const bm = new THREE.InstancedMesh(bGeo, cMat, C.b.length); C.b.forEach(([x, y, s2, v], i) => { q.setFromAxisAngle(up, v * 6); pv.set(x, World.height(x, y) - 0.1, y); sv.set(s2, s2, s2); m4.compose(pv, q, sv); bm.setMatrixAt(i, m4); col.setHSL(0.24 + v * 0.08, 0.42, 0.2 + v * 0.1); bm.setColorAt(i, col); }); ch.bm = bm; ch.list.push(bm); }
      for (const o of ch.list) { o.frustumCulled = false; o.receiveShadow = true; o.castShadow = false; o.visible = false; this.scene.add(o); }
      this.decoChunks.push(ch);
    }
  },
  // liga só os blocos de árvores perto e na frente; sombra só nos bem próximos; troncos somem de longe (LOD)
  updateDecor() {
    if (!this.decoChunks) return;
    const P = Game.P, fwd = this.cam.getWorldDirection(this._fwd || (this._fwd = new V3())), view = this.scene.fog.far + 30, R = 142;
    const shadows = this.quality !== 'leve';
    if (this.crystalDeco) { const S = REGIONS[5].spiral; this.crystalDeco.visible = Math.hypot(P.x - S.cx, P.y - S.cy) < S.R0 + view; }
    if (this.cave) { const R = REGIONS[3], d = P.x * R.ux + P.y * R.uy; this.cave.visible = d > R.dMin - view - 50 && d < R.dMax + view && Math.abs(P.x * R.vx + P.y * R.vy) < 200 + view; }
    if (this.z7) this.z7.visible = Math.hypot(P.x - Z7.x, P.y - Z7.y) < view + 120; // Zona 7 só quando está perto
    for (const ch of this.decoChunks) {
      const dx = ch.x - P.x, dy = ch.y - P.y, d = Math.hypot(dx, dy), ahead = dx * fwd.x + dy * fwd.z;
      const vis = d - R < view && (ahead > -R || d < R * 1.2);
      if (ch.cm) ch.cm.visible = vis;
      if (ch.cm2) ch.cm2.visible = vis;
      if (ch.bm) ch.bm.visible = vis && d - R < 220;
      if (ch.rm) ch.rm.visible = vis;
      if (ch.tm) ch.tm.visible = vis && d - R < 170;
      const sh = shadows && d - R < 50;
      for (const o of ch.list) o.castShadow = sh;
    }
  },
  // serra em volta do mapa: avisa que o mundo acaba (só aparece quando você chega perto da borda)
  buildEdgeRange() {
    const g = jitterGeo(new THREE.ConeGeometry(1, 1, 7, 3), 0.18, 31); g.translate(0, 0.5, 0);
    const N = 150, m = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ flatShading: true }), N * 2), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new V3(), pv = new V3(), c = new THREE.Color(), r = rng(404);
    let i = 0;
    for (let k = 0; k < N; k++) for (const ring of [4420, 4560]) {
      const a = k / N * Math.PI * 2 + r() * 0.02, rad = ring + r() * 60, x = Math.cos(a) * rad, y = Math.sin(a) * rad, h = (ring > 4500 ? 160 : 95) + r() * 90, w = 110 + r() * 60;
      q.setFromAxisAngle(new V3(0, 1, 0), r() * 6); pv.set(x, World.height(x, y) - 4, y); sv.set(w, h, w * (0.8 + r() * 0.4)); m4.compose(pv, q, sv); m.setMatrixAt(i, m4);
      c.setHSL(0.3 - r() * 0.2, 0.12, 0.32 + r() * 0.1); m.setColorAt(i, c); i++;
    }
    m.frustumCulled = false; m.receiveShadow = false; this.scene.add(m); this.edgeRange = m;
  },
  // pássaros de dia: bandos em V voando devagar em volta do jogador, batendo as asas
  buildBirds() {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.25, 0, 0, 0.3, 1, 0.08, 0.05], 3)); wing.computeVertexNormals();
    const body = new THREE.ConeGeometry(0.12, 0.7, 4); body.rotateX(Math.PI / 2);
    const mt = new THREE.MeshBasicMaterial({ color: '#2a2a30', side: THREE.DoubleSide, fog: true });
    this.birds = [];
    for (let f = 0; f < 3; f++) {
      const flock = new THREE.Group(), n = 5 + f * 2, list = [];
      for (let i = 0; i < n; i++) {
        const b = new THREE.Group(), L = new THREE.Mesh(wing, mt), Rw = new THREE.Mesh(wing, mt); Rw.scale.x = -1; b.add(new THREE.Mesh(body, mt), L, Rw);
        const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1; b.position.set(side * row * 2.2, (Math.random() - 0.5) * 0.6, row * 2.4);
        b.scale.setScalar(1.6); flock.add(b); list.push({ b, L, Rw, ph: Math.random() * 6 });
      }
      flock.userData = { a: Math.random() * 6.28, r: 120 + f * 90, h: 38 + f * 14, sp: (0.05 + f * 0.015) * (f % 2 ? -1 : 1), list };
      this.scene.add(flock); this.birds.push(flock);
    }
  },
  updateBirds(dt) {
    if (!this.birds) return;
    const day = this.day === undefined ? 1 : this.day, P = Game.P, t = this.t;
    for (const f of this.birds) {
      const u = f.userData; u.a += u.sp * dt; f.visible = day > 0.35;
      if (!u.cx || Math.hypot(u.cx - P.x, u.cy - P.y) > 600) { u.cx = P.x; u.cy = P.y; }
      u.cx += (P.x - u.cx) * dt * 0.02; u.cy += (P.y - u.cy) * dt * 0.02;
      const x = u.cx + Math.cos(u.a) * u.r, y = u.cy + Math.sin(u.a) * u.r;
      f.position.set(x, World.height(x, y) + u.h + Math.sin(t * 0.3 + u.r) * 4, y);
      f.rotation.y = -u.a + (u.sp > 0 ? 0 : Math.PI);
      for (const b of u.list) { const w = Math.sin(t * 7 + b.ph) * 0.7; b.L.rotation.z = w; b.Rw.rotation.z = -w; }
    }
  },
  // ---------- minérios de longe: versão simplificada (poucos polígonos, na cor do minério) ----------
  buildOreLod() {
    const g = jitterGeo(new THREE.DodecahedronGeometry(1, 0), 0.25, 5);
    this.oreLod = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ flatShading: true }), 2600);
    this.oreLod.frustumCulled = false; this.oreLod.count = 0; this.oreLod.receiveShadow = false; this.oreLod.castShadow = false;
    this.oreLod.setColorAt(0, new THREE.Color()); this.scene.add(this.oreLod); this.oreLodAt = null;
  },
  updateOreLod() {
    if (!this.oreLod) return;
    const P = Game.P, now = this.t;
    if (this.oreLodAt && Math.hypot(P.x - this.oreLodAt[0], P.y - this.oreLodAt[1]) < 6 && now - this.oreLodAt[2] < 0.5) return;
    this.oreLodAt = [P.x, P.y, now];
    const near = this.nodeNear(), far = this.scene.fog.far + 40, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new V3(), pv = new V3(), col = new THREE.Color();
    let i = 0; const lim = this.oreLod.instanceMatrix.count;
    for (const n of World.nodes) {
      if (n.dead || n.res.sealed) continue;
      const d2 = (n.x - P.x) ** 2 + (n.y - P.y) ** 2;
      if (d2 < (near - 6) ** 2 || d2 > far * far || i >= lim) continue;
      const om = oreMul(n), s2 = n.r * 0.62;
      pv.set(n.x, World.height(n.x, n.y) + s2 * 0.25 * om.M, n.y); sv.set(s2 * om.W, s2 * 0.55 * om.M, s2 * om.W); q.setFromAxisAngle(sv.clone().set(0, 1, 0), n.seed * 6);
      m4.compose(pv, q, sv); this.oreLod.setMatrixAt(i, m4);
      col.set(n.res.c || '#8a8580'); if (n.res.c2) col.lerp(this._c2 || (this._c2 = new THREE.Color()), 0).lerp(this._c2.set(n.res.c2), 0.5); col.offsetHSL(0, 0, 0.06); if (n.rare > 1 || n.res.special || n.res.wild) col.offsetHSL(0, 0.15, 0.12); this.oreLod.setColorAt(i, col); i++;
    }
    this.oreLod.count = i; this.oreLod.instanceMatrix.needsUpdate = true; if (this.oreLod.instanceColor) this.oreLod.instanceColor.needsUpdate = true;
  },
  // distância em que o minério aparece completo (o resto vira versão simplificada)
  nodeFull() { return this.quality === 'leve' ? 32 : 45; },
  // versão média do minério: todas as peças viram uma malha só, com a cor de cada peça pintada nos vértices
  bakeNode(g) {
    if (!this.lodMat) this.lodMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), parts = [], kill = [], col = new THREE.Color();
    g.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const mt = Array.isArray(o.material) ? o.material[0] : o.material; kill.push(o);
      if (mt.transparent || mt.blending === THREE.AdditiveBlending) return;
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      geo.applyMatrix4(m);
      const pos = geo.attributes.position, nrm = geo.attributes.normal, n = pos.count;
      if (m.determinant() < 0) for (let i = 0; i < n; i += 3) for (const a of [pos, nrm]) { if (!a) continue; for (let j = 0; j < 3; j++) { const t = a.array[(i + 1) * 3 + j]; a.array[(i + 1) * 3 + j] = a.array[(i + 2) * 3 + j]; a.array[(i + 2) * 3 + j] = t; } }
      col.copy(mt.color || col.set('#888888')); if (mt.emissive && !mt.isMeshBasicMaterial) col.add(mt.emissive);
      const ca = new Float32Array(n * 3); for (let i = 0; i < n; i++) { ca[i * 3] = col.r; ca[i * 3 + 1] = col.g; ca[i * 3 + 2] = col.b; }
      parts.push([pos.array, nrm ? nrm.array : new Float32Array(n * 3), ca]);
    });
    for (const o of kill) { o.parent.remove(o); o.geometry.dispose(); }
    if (!parts.length) return;
    const tot = parts.reduce((a, p) => a + p[0].length, 0), P = new Float32Array(tot), N = new Float32Array(tot), C = new Float32Array(tot);
    let off = 0; for (const [p, nn, c] of parts) { P.set(p, off); N.set(nn, off); C.set(c, off); off += p.length; }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('color', new THREE.BufferAttribute(C, 3)); out.computeBoundingSphere();
    const mm = new THREE.Mesh(out, this.lodMat); mm.castShadow = true; mm.receiveShadow = true;
    // a malha fica no espaço do grupo: desfaz a escala do grupo (será reaplicada pelo grupo)
    g.add(mm);
  },
  nodeNear() { return this.quality === 'leve' ? 85 : 130; },
  buildGrass() {
    // tufo: 7 folhas finas inclinadas, base escura e ponta clara
    const pos = [], col = [], rr = rng(9);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2 + rr() * 0.6, lean = 0.12 + rr() * 0.22, hgt = 0.32 + rr() * 0.3, w = 0.035 + rr() * 0.02, ox = Math.cos(a) * 0.05, oz = Math.sin(a) * 0.05;
      const px = -Math.sin(a) * w, pz = Math.cos(a) * w, tx = ox + Math.cos(a) * lean, tz = oz + Math.sin(a) * lean;
      pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, tx, hgt, tz); col.push(0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 1.25, 1.25, 1.1);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    { const n = g.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); } // luz de cima: folhas não ficam pretas de um lado
    this.grass = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, vertexColors: true }), 4200);
    // flores: miolo + pétalas (estrela achatada)
    const fg = new THREE.ConeGeometry(0.09, 0.05, 5, 1); fg.rotateX(Math.PI); fg.translate(0, 0.3, 0);
    const stem = new THREE.CylinderGeometry(0.008, 0.008, 0.3, 3); stem.translate(0, 0.15, 0);
    this.flowers = new THREE.InstancedMesh(fg, new THREE.MeshLambertMaterial({ emissive: '#222222' }), 700); this.flowers.count = 0; this.scene.add(this.flowers);
    this.flowerStems = new THREE.InstancedMesh(stem, mat('#4f7a2e'), 700); this.flowerStems.count = 0; this.scene.add(this.flowerStems);
    this.grass.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.grass); this.grassAt = null;
  },
  updateGrass() {
    if (this.quality === 'leve') return;
    const P = Game.P, sx = Math.round(P.x / 6) * 6, sy = Math.round(P.y / 6) * 6;
    if (this.grassAt && this.grassAt[0] === sx && this.grassAt[1] === sy) return;
    this.grassAt = [sx, sy];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3(), c = new THREE.Color(), up = new V3(0, 1, 0);
    let n = 0, nf = 0;
    const FC = ['#ffd84a', '#ffffff', '#c58cff', '#ff7a8a', '#ffa03a', '#8ad0ff'].map(v => new THREE.Color(v));
    for (let gx = -40; gx <= 40 && n < 4200; gx += 1.3) for (let gy = -40; gy <= 40 && n < 4200; gy += 1.3) {
      const cx = Math.floor((sx + gx) / 1.3), cy = Math.floor((sy + gy) / 1.3), h = hash2(cx, cy);
      if (h > 0.6) continue;
      const x = cx * 1.3 + hash2(cx * 3, cy) * 1.3, y = cy * 1.3 + hash2(cx, cy * 5) * 1.3;
      if (Math.hypot(x, y) < CITY_R + 1 || World.mountainH(x, y) > 6) continue;
      if (World.pitAt(x, y).inside > 0.15 || World.groundRocky(x, y)) continue; // chão de pedra das minas: sem capim
      const gr = World.groundAt(x, y), id = gr ? gr.R.id : -1;
      if (id >= 2 && gr.edge === 1) continue;
      q.setFromAxisAngle(up, h * 20); s.set(0.8 + h * 0.7, 0.7 + h * 1.0, 0.8 + h * 0.7); p.set(x, World.height(x, y) - 0.02, y);
      m4.compose(p, q, s); this.grass.setMatrixAt(n, m4);
      c.setHSL(0.21 + h * 0.07, 0.42, 0.24 + h * 0.1); this.grass.setColorAt(n, c); n++;
      // canteirinhos de flores espalhados (manchas)
      const fz = Math.sin(x * 0.07 + Math.cos(y * 0.05) * 2) * Math.sin(y * 0.061 - 1.2);
      if (fz > 0.55 && nf < 700 && hash2(cx * 7, cy * 11) < 0.55) {
        const fx = x + 0.35, fy = y - 0.2, fh = World.height(fx, fy), fsz = 0.8 + hash2(cx, cy * 3) * 0.6;
        q.identity(); s.set(fsz, fsz, fsz); p.set(fx, fh, fy); m4.compose(p, q, s); this.flowers.setMatrixAt(nf, m4); this.flowerStems.setMatrixAt(nf, m4);
        this.flowers.setColorAt(nf, FC[Math.floor(hash2(Math.floor(x / 9), Math.floor(y / 9)) * FC.length)]); nf++;
      }
    }
    this.flowers.count = this.flowerStems.count = nf; this.flowers.instanceMatrix.needsUpdate = this.flowerStems.instanceMatrix.needsUpdate = true; if (this.flowers.instanceColor) this.flowers.instanceColor.needsUpdate = true;
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

  // miniatura (foto pequena) de um material, tirada uma vez do próprio modelo 3D e guardada como imagem
  resIcon(id) {
    const C = this._icons || (this._icons = {});
    if (C[id] !== undefined) return C[id];
    C[id] = null;
    try {
      const res = RES[id], S = 64, r = this.r;
      if (!this._iconRT) {
        this._iconRT = new THREE.WebGLRenderTarget(S * 2, S * 2); this._iconRT.texture.encoding = THREE.sRGBEncoding;
        const sc = this._iconScene = new THREE.Scene(); sc.add(new THREE.HemisphereLight('#ffffff', '#6a5a48', 0.9)); const d = new THREE.DirectionalLight('#ffffff', 1.0); d.position.set(3, 6, 5); sc.add(d);
        this._iconCam = new THREE.PerspectiveCamera(28, 1, 0.05, 200);
        this._iconCv = document.createElement('canvas'); this._iconCv.width = this._iconCv.height = S * 2;
        this._iconOut = document.createElement('canvas'); this._iconOut.width = this._iconOut.height = S;
      }
      const n = { x: 0, y: 0, res, size: 1, rare: 1, seed: 0.37, r: res.wild ? 1.1 : 1.5, hp: 1, maxHp: 1, sub: {}, pt: {}, hitT: 0 };
      const g = this.nodeMesh(n); g.position.set(0, 0, 0); g.scale.setScalar(1);
      const sprites = []; g.traverse(o => { if (o.isSprite || o.isPoints) sprites.push(o); }); sprites.forEach(o => o.parent.remove(o));
      this._iconScene.add(g); g.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new V3()), sz = box.getSize(new V3()), dist = Math.max(sz.x, sz.y, sz.z) * 2.3 + 0.2;
      this._iconCam.position.set(c.x + dist * 0.62, c.y + dist * 0.42, c.z + dist * 0.66); this._iconCam.lookAt(c);
      const cc = r.getClearColor(new THREE.Color()), ca = r.getClearAlpha();
      r.setRenderTarget(this._iconRT); r.setClearColor(0x000000, 0); r.clear(); r.render(this._iconScene, this._iconCam);
      const px = new Uint8Array(S * 2 * S * 2 * 4); r.readRenderTargetPixels(this._iconRT, 0, 0, S * 2, S * 2, px);
      r.setRenderTarget(null); r.setClearColor(cc, ca);
      this._iconScene.remove(g); this.disposeObj(g);
      const g2 = this._iconCv.getContext('2d'), img = g2.createImageData(S * 2, S * 2);
      for (let y = 0; y < S * 2; y++) img.data.set(px.subarray((S * 2 - 1 - y) * S * 8, (S * 2 - y) * S * 8), y * S * 8); // vira de cabeça para cima
      g2.putImageData(img, 0, 0);
      const o = this._iconOut.getContext('2d'); o.clearRect(0, 0, S, S); o.imageSmoothingQuality = 'high'; o.drawImage(this._iconCv, 0, 0, S, S);
      C[id] = this._iconOut.toDataURL('image/png');
    } catch (e) { C[id] = null; }
    return C[id];
  },
  // libera da placa de vídeo as malhas únicas de um objeto removido (materiais são compartilhados)
  disposeObj(o) {
    o.traverse(c => { if ((c.isMesh || c.isPoints) && c.geometry && !c.isInstancedMesh && !c.userData.sharedGeo) c.geometry.dispose(); if (c.isSprite && c.material && c !== o.userData.badge) c.material.dispose(); });
  },
  // junta as peças paradas de um grupo que usam o mesmo material numa peça só (menos pedidos de desenho)
  mergeStatic(root, local) {
    root.updateMatrixWorld(true);
    const dyn = new Set(), noop = THREE.Object3D.prototype.onBeforeRender;
    const mark = v => { if (v && v.isObject3D) dyn.add(v); else if (Array.isArray(v)) v.forEach(mark); };
    if (!local) for (const k in this) { const v = this[k]; if (v === root) continue; if (v && v.isObject3D) dyn.add(v); else if (Array.isArray(v)) v.forEach(x => { mark(x); if (x && typeof x === 'object' && !x.isObject3D) for (const kk in x) mark(x[kk]); }); else if (v && typeof v === 'object' && !(v instanceof Map) && !v.isMaterial && !v.isTexture) for (const kk in v) mark(v[kk]); }
    root.traverse(o => { for (const k in o.userData) mark(o.userData[k]); if (o.onBeforeRender !== noop && o !== root) dyn.add(o); });
    const isDyn = o => { for (let p = o; p && p !== root; p = p.parent) if (dyn.has(p)) return true; return false; };
    const groups = new Map(), inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    root.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.transparent || !o.visible || isDyn(o)) return;
      for (let p = o.parent; p && p !== root; p = p.parent) if (!p.visible) return;
      const g = o.geometry; if (!g.attributes.position || !g.attributes.normal || g.morphAttributes.position) return;
      const useUv = !!(o.material.map || o.material.emissiveMap), useCol = !!o.material.vertexColors;
      if ((useUv && !g.attributes.uv) || (useCol && !g.attributes.color)) return;
      const key = o.material.uuid + '|' + o.castShadow + o.receiveShadow + useUv + useCol;
      if (!groups.has(key)) groups.set(key, { m: o.material, cast: o.castShadow, recv: o.receiveShadow, useUv, useCol, list: [] });
      groups.get(key).list.push(o);
    });
    let merged = 0;
    for (const G of groups.values()) {
      if (G.list.length < 2) continue;
      const parts = [];
      let nv = 0;
      for (const o of G.list) {
        const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()); g.applyMatrix4(m);
        if (m.determinant() < 0) { const flip = a => { if (!a) return; const it = a.itemSize, arr = a.array; for (let i = 0; i < a.count; i += 3) for (let j = 0; j < it; j++) { const t = arr[(i + 1) * it + j]; arr[(i + 1) * it + j] = arr[(i + 2) * it + j]; arr[(i + 2) * it + j] = t; } }; flip(g.attributes.position); flip(g.attributes.normal); flip(g.attributes.uv); flip(g.attributes.color); }
        parts.push(g); nv += g.attributes.position.count;
      }
      const out = new THREE.BufferGeometry(), names = ['position', 'normal'].concat(G.useUv ? ['uv'] : [], G.useCol ? ['color'] : []);
      for (const nm of names) { const it = parts[0].attributes[nm].itemSize, arr = new Float32Array(nv * it); let off = 0; for (const p of parts) { arr.set(p.attributes[nm].array, off); off += p.attributes[nm].array.length; } out.setAttribute(nm, new THREE.BufferAttribute(arr, it)); }
      out.computeBoundingSphere();
      const mm = new THREE.Mesh(out, G.m); mm.castShadow = G.cast; mm.receiveShadow = G.recv; root.add(mm);
      for (const o of G.list) { o.parent.remove(o); o.geometry.dispose(); }
      merged += G.list.length;
    }
    return merged;
  },
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
    } else if (kind === 'sealed') {
      this.buildSealRock(g, s, n);
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
    const { M, W } = oreMul(n);
    if (M > 1) for (const c of g.children) { if (c.isSprite) { c.scale.multiplyScalar(W); c.position.y *= M; continue; } c.scale.x *= W; c.scale.z *= W; c.scale.y *= M; c.position.x *= W; c.position.z *= W; c.position.y *= M; }
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
    if (this.pick61) this.pick61.visible = !(Game.S.hammer >= 61);
    if (this.z7s && (!this.z7s.init || this.z7s.target !== (Game.S.seal ? 1 : 0))) this.openSeal(!!Game.S.seal);
    const P = Game.P, seen = new Set(), NR = this.nodeNear();
    for (const n of World.nodes) {
      const dx = n.x - P.x, dy = n.y - P.y;
      if (dx * dx + dy * dy > NR * NR) continue;
      seen.add(n);
      let m = this.nodeMeshes.get(n);
      // LOD: perto = minério completo; médio = mesmo formato numa peça só (1 desenho); longe = versão simplificada (updateOreLod)
      const dd = Math.sqrt(dx * dx + dy * dy), FR = this.nodeFull(), lod = m ? (m.userData.lod === 'full' ? (dd < FR + 6 ? 'full' : 'mid') : (dd < FR - 6 ? 'full' : 'mid')) : (dd < FR ? 'full' : 'mid');
      if (m && m.userData.lod !== lod && n !== Game.target) { this.scene.remove(m); this.disposeObj(m); if (m.userData.badge) { this.scene.remove(m.userData.badge); m.userData.badge.material.dispose(); } this.nodeMeshes.delete(n); m = null; }
      if (m && m.userData.res !== n.res.id) { this.scene.remove(m); if (m.userData.badge) this.scene.remove(m.userData.badge); m = null; }
      if (!m) { m = this.nodeMesh(n); if (lod === 'mid') this.bakeNode(m); m.userData.lod = lod; this.scene.add(m); this.nodeMeshes.set(n, m); }
      const k = 0.75 + 0.25 * Math.max(0, n.hp / n.maxHp);
      m.scale.setScalar(k);
      if (n.hitT > 0) m.position.set(m.userData.base.x + (Math.random() - 0.5) * 0.12, m.userData.base.y, m.userData.base.z + (Math.random() - 0.5) * 0.12);
      else m.position.copy(m.userData.base);
      if (m.userData.glow) m.userData.glow.material.opacity = (m.userData.glowMax || 0.85) * (0.65 + Math.sin(this.t * 4 + n.seed) * 0.35);
      if (m.userData.spin) m.userData.spin.rotation.y += 0.02;
      if (m.userData.pulse) m.userData.pulse.scale.setScalar(1 + Math.sin(this.t * 3) * 0.08);
      // etiqueta com nível e valor para recursos por perto
      const d2 = dx * dx + dy * dy, near = d2 < 22 * 22 && d2 > 1.5 * 1.5 && n !== Game.target && Game.S.showBadges !== false && !n.res.wild && !n.res.sealed;
      if (near) {
        const need = (Game.missCache || []).some(x => x.id === n.res.id);
        if (!m.userData.badge) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: true, transparent: true, fog: false, sizeAttenuation: false })); sp.scale.set(0.2, 0.056, 1); sp.renderOrder = 4; m.userData.badge = sp; this.scene.add(sp); }
        const sp = m.userData.badge, tex = this.badgeTex(n.res, need);
        if (sp.material.map !== tex) { sp.material.map = tex; sp.material.needsUpdate = true; }
        sp.position.set(m.userData.base.x, m.userData.base.y + n.r * 1.25 * oreMul(n).M + 0.6, m.userData.base.z); sp.visible = true;
      } else if (m.userData.badge) m.userData.badge.visible = false;
    }
    for (const [n, m] of this.nodeMeshes) if (!seen.has(n) || n.dead) { this.scene.remove(m); this.disposeObj(m); if (m.userData.badge) { this.scene.remove(m.userData.badge); m.userData.badge.material.dispose(); } this.nodeMeshes.delete(n); }
  },
  pickTarget(reach) {
    const P = Game.P, o = this.cam.position, dir = new V3(); this.cam.getWorldDirection(dir);
    let best = null, bt = Infinity;
    for (const [n, m] of this.nodeMeshes) {
      const pd = Math.hypot(n.x - P.x, n.y - P.y); const om = oreMul(n); if (pd > reach + n.r * om.W + 0.6) continue;
      const c = new V3(n.x, m.userData.base.y + n.r * 0.35 * om.M, n.y), rad = n.r * 0.7 * om.W;
      const oc = c.clone().sub(o), t = oc.dot(dir); if (t < 0) continue;
      const d2 = oc.lengthSq() - t * t;
      if (d2 < rad * rad && t < bt) { bt = t; best = n; }
    }
    if (best) return best;
    // ajuda de mira: pedra bem na frente
    let bd = 0.86;
    for (const [n] of this.nodeMeshes) {
      const pd = Math.hypot(n.x - P.x, n.y - P.y); if (pd > reach + n.r * 0.6 * oreMul(n).W) continue;
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
  getGlowTex() {
    if (!this.glowTex) this.glowTex = canvasTex(64, 64, (c, w) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); });
    return this.glowTex;
  },
  // ---------- picaretas (martelos 31 a 59): cada faixa fica mais enfeitada, com brilho e partículas crescentes ----------
  makePick(L, g, handle, len, hw, hl) {
    const p = Math.min(1, (L - 31) / 28), tier = L >= 61 ? 9 : L <= 34 ? 0 : L <= 37 ? 1 : L <= 40 ? 2 : L <= 44 ? 3 : L <= 47 ? 4 : L <= 50 ? 5 : L <= 55 ? 6 : L <= 57 ? 7 : 8;
    const gem = L >= 61 ? '#ffe27a' : hammerLook(L).head;
    const PAL = [
      { h: '#8e949c', t: '#c4cad0', glow: null },
      { h: '#5f6a76', t: '#c9d3dd', glow: '#bfe6ff' },
      { h: '#aab6c4', t: '#ffffff', glow: '#ffffff' },
      { h: '#c28b2a', t: '#ffe08a', glow: '#ffa63a' },
      { h: '#e0b030', t: '#fff1a8', glow: '#ffd34d' },
      { h: '#4f7488', t: '#9fe9ff', glow: '#5ad7ff' },
      { h: '#33363f', t: '#e8ecf4', glow: gem },
      { h: '#cfd6e2', t: '#ffffff', glow: gem },
      { h: '#2a2224', t: '#ff8a3d', glow: '#ff6a2a' },
      { h: '#f2ead2', t: '#ffd34d', glow: '#ffe27a' },
    ][tier];
    const gcol = new THREE.Color(PAL.glow || '#ffffff'), glowOn = !!PAL.glow;
    handle.material = mat(L >= 41 ? '#2a2230' : '#5a3f2a');
    const hr = 0.028 + L * 0.0006;
    for (let i = 0; i < (tier >= 3 ? Math.min(4, tier - 1) : 0); i++) { const bd = mesh(new THREE.TorusGeometry(hr + 0.004, 0.012, 5, 10), mat(PAL.t, glowOn ? { emissive: PAL.glow, emissiveIntensity: 0.25 } : {}), false); bd.rotation.x = Math.PI / 2; bd.position.y = len * 0.78 - i * len * 0.12; g.add(bd); }
    if (tier >= 2) { const pm = mesh(new THREE.SphereGeometry(hr * 1.7, 8, 6), mat(PAL.t, { shininess: 90 }), false); pm.position.y = 0.02; g.add(pm); }
    const head = new THREE.Group(); head.position.y = len; // eixo da cabeça = direção do golpe: as pontas ficam viradas para a pedra
    const half = hl * 0.72, arch = hl * 0.3, depth = hw * 1.15, thk = hw * 1.5, N = 9;
    const k0 = L - [31, 35, 38, 41, 45, 48, 51, 56, 58, 61][tier], hc = new THREE.Color(PAL.h).offsetHSL(0, 0.015 * k0, 0.014 * k0).getStyle();
    const hm = mat(hc, Object.assign({ shininess: 80, specular: '#999' }, tier >= 8 ? { emissive: '#5a1a00', emissiveIntensity: 0.4 } : {}));
    const P = t => [t * half, arch * (1 - t * t)];
    for (let i = 0; i < N; i++) {
      const t0 = -1 + 2 * i / N, t1 = -1 + 2 * (i + 1) / N, tm = (t0 + t1) / 2, [x0, y0] = P(t0), [x1, y1] = P(t1);
      const sl = Math.hypot(x1 - x0, y1 - y0), th = thk * (1 - 0.72 * Math.pow(Math.abs(tm), 1.3)) + 0.015, dp = depth * (1 - 0.35 * Math.abs(tm));
      const seg = mesh(new THREE.BoxGeometry(sl * 1.06, th, dp), hm, false); seg.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); seg.rotation.z = Math.atan2(y1 - y0, x1 - x0); head.add(seg);
      if (tier === 8 && i % 2 === 0) for (const sd of [-1, 1]) { const v = mesh(new THREE.BoxGeometry(sl * 0.7, th * 0.22, 0.01), new THREE.MeshBasicMaterial({ color: '#ff7a2e' }), false); v.position.set(seg.position.x, seg.position.y, sd * (dp / 2 + 0.003)); v.rotation.z = seg.rotation.z; head.add(v); }
      if ((tier === 4 || tier === 5 || tier === 9) && Math.abs(tm) < 0.5) for (const sd of [-1, 1]) { const rn = mesh(new THREE.BoxGeometry(sl * 0.35, th * 0.3, 0.01), new THREE.MeshBasicMaterial({ color: PAL.glow }), false); rn.position.set(seg.position.x, seg.position.y, sd * (dp / 2 + 0.003)); rn.rotation.z = seg.rotation.z; head.add(rn); }
    }
    for (const sd of [-1, 1]) { const [tx, ty] = P(sd); const tip = mesh(new THREE.ConeGeometry(thk * 0.3, hl * 0.28, 5), mat(PAL.t, Object.assign({ shininess: 110, specular: '#fff' }, tier >= 4 ? { emissive: PAL.glow || '#fff', emissiveIntensity: 0.3 } : {})), false); tip.rotation.z = -sd * (Math.PI / 2 + 0.55); tip.position.set(tx + sd * hl * 0.1, ty - hl * 0.1, 0); head.add(tip); }
    const sock = mesh(new THREE.BoxGeometry(hw * 1.5, thk * 1.2, depth * 1.45), mat(PAL.t, { shininess: 90, specular: '#fff' }), false); sock.position.y = arch * 0.82; head.add(sock);
    const col = mesh(new THREE.CylinderGeometry(hr * 2.0, hr * 1.6, 0.06, 8), mat(PAL.t, { shininess: 90 }), false); col.position.y = -0.02; head.add(col);
    if (tier >= 5) for (let i = 0; i < (tier === 9 ? 5 : tier >= 7 ? 3 : 1); i++) { const x = (i - (tier === 9 ? 2 : tier >= 7 ? 1 : 0)) * half * 0.38, [, y] = P(x / half); const sp = mesh(new THREE.ConeGeometry(thk * 0.2, thk * 0.9, 4), mat(PAL.t, { emissive: PAL.glow, emissiveIntensity: 0.5 }), false); sp.position.set(x, y + thk * 0.75, 0); head.add(sp); }
    if (tier === 6 || tier === 7 || tier === 9) {
      const gm = () => mat(gem, { emissive: gem, emissiveIntensity: 0.9, shininess: 150, specular: '#ffffff', transparent: true, opacity: 0.92 });
      const g0 = mesh(new THREE.OctahedronGeometry(thk * 0.85, 0), gm(), false); g0.scale.set(0.8, 1.1, 0.8); g0.position.set(0, arch + thk * 0.55, 0); head.add(g0);
      for (const sd of [-1, 1]) { const g1 = mesh(new THREE.OctahedronGeometry(thk * 0.42, 0), gm(), false); const [gx, gy] = P(sd * 0.62); g1.position.set(gx, gy + thk * 0.35, 0); head.add(g1); }
    }
    g.add(head); g.userData.headY = len; g.userData.head = head;
    // brilho, partículas e cristais girando: ficam mais fortes a cada faixa
    if (tier >= 1) {
      const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.getGlowTex(), color: gcol, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.1 }));
      aura.scale.setScalar(hl * (1.0 + p * 1.9)); aura.position.y = arch * 0.7; head.add(aura);
      const base = 0.04 + p * 0.36, ph0 = L;
      aura.onBeforeRender = () => { aura.material.opacity = base * (0.72 + 0.28 * Math.sin(performance.now() / 240 + ph0)); };
    }
    const n = L < 35 ? 0 : Math.round(3 + p * 30);
    if (n) {
      const pos = new Float32Array(n * 3), cl = new Float32Array(n * 3), ph = [];
      for (let i = 0; i < n; i++) ph.push({ a: Math.random() * 6.28, s: 0.3 + Math.random() * 0.9, r: Math.random(), x: Math.random() * 2 - 1 });
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(cl, 3));
      const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: this.getGlowTex(), size: 0.016 + p * 0.03, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      pts.frustumCulled = false; const rise = hl * (0.5 + p * 1.1);
      pts.onBeforeRender = () => {
        const T = performance.now() / 1000;
        for (let i = 0; i < n; i++) {
          const q = ph[i], u = (T * q.s * (0.6 + p * 0.8) + q.r) % 1, x = q.x * half * 0.95, [, by] = P(x / half), f = (1 - u) * Math.min(1, u * 8);
          pos[i * 3] = x + Math.sin(T * 2 + q.a) * 0.02; pos[i * 3 + 1] = by + u * rise; pos[i * 3 + 2] = Math.sin(q.a + T * 2.4) * depth * 0.9 * (0.3 + u);
          cl[i * 3] = gcol.r * f; cl[i * 3 + 1] = gcol.g * f; cl[i * 3 + 2] = gcol.b * f;
        }
        geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
      };
      head.add(pts);
    }
    if (tier >= 7) {
      const orbit = new THREE.Group(), cnt = tier === 9 ? 8 : tier === 8 ? 5 : 3; orbit.position.y = arch * 0.7; head.add(orbit);
      for (let i = 0; i < cnt; i++) {
        const c = tier === 9 ? ['#ff6a6a', '#ffd34d', '#7af0ff', '#c06af0'][i % 4] : i % 2 ? '#ffffff' : (PAL.glow || '#fff'), sh = mesh(new THREE.OctahedronGeometry(0.035 + p * 0.03, 0), new THREE.MeshBasicMaterial({ color: c }), false);
        const a = i / cnt * Math.PI * 2; sh.position.set(Math.cos(a) * hl * 0.95, Math.sin(a * 2) * 0.05, Math.sin(a) * hl * 0.95); orbit.add(sh);
        if (i === 0) sh.onBeforeRender = () => { orbit.rotation.y = performance.now() / 1000 * 2.6; };
      }
    }
    g.userData.glowCol = PAL.glow; g.userData.glowPow = tier >= 3 ? 0.15 + p * 0.7 : 0;
    return g;
  },
  makeHammer(L) {
    const look = hammerLook(L), g = new THREE.Group();
    const len = 0.5 + L * 0.02, hw = 0.07 + L * 0.004, hl = 0.18 + L * 0.011;
    const emi = look.glow ? { emissive: look.glow, emissiveIntensity: 0.35 } : {};
    const handle = mesh(new THREE.CylinderGeometry(0.022 + L * 0.0006, 0.028 + L * 0.0006, len, 6), mat(look.handle), false); handle.position.y = len / 2; g.add(handle);
    if ((L >= 31 && L <= 59) || L === 61) return this.makePick(L, g, handle, len, hw, hl);
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
    // braço articulado: ombro -> cotovelo -> pulso (o ombro fica um pouco à frente da câmera, truque de FPS, para o cotovelo aparecer)
    const G = gear.glove, L1 = 0.29, L2 = 0.27;
    const cyl = (r1, r2, len, m) => { const g = new THREE.CylinderGeometry(r2, r1, len, 16, 1); g.rotateX(-Math.PI / 2); g.translate(0, 0, -len / 2); return mesh(g, m, false); };
    const shirt = new THREE.MeshLambertMaterial({ color: '#2c4f68' }), skin = new THREE.MeshLambertMaterial({ color: '#d9a27a' }), rollM = new THREE.MeshLambertMaterial({ color: '#24425a' });
    const gmat = mat(G.col, G.era === 6 ? { emissive: '#40d0ff', emissiveIntensity: 0.25 } : {});
    const shoulder = new THREE.Group(); shoulder.position.set(0.36, -0.2, -0.25); shoulder.rotation.order = 'YXZ'; this.vm.add(shoulder);
    shoulder.add(cyl(0.064, 0.056, L1, shirt));
    const roll = mesh(new THREE.TorusGeometry(0.058, 0.013, 8, 20), rollM, false); roll.position.z = -L1 + 0.05; shoulder.add(roll); // manga arregaçada
    const elbow = new THREE.Group(); elbow.position.z = -L1; shoulder.add(elbow);
    elbow.add(mesh(new THREE.SphereGeometry(0.052, 16, 12), skin, false));
    elbow.add(cyl(0.047, 0.035, L2, skin));
    const wrist = new THREE.Group(); wrist.position.z = -L2; wrist.rotation.order = 'XZY'; elbow.add(wrist);
    const glove = mesh(new THREE.SphereGeometry(0.048, 16, 12), gmat, false); glove.scale.set(1.05, 0.95, 1.2); wrist.add(glove); this.vmGlove = glove;
    const gcuff = mesh(new THREE.CylinderGeometry(0.043, 0.04, 0.035, 14).rotateX(Math.PI / 2), gmat, false); gcuff.position.z = 0.04; wrist.add(gcuff);
    if (G.era >= 4) { const brace = mesh(new THREE.BoxGeometry(0.09, 0.09, 0.1), mat(G.era === 6 ? '#2a3a48' : '#9aa0a8', { shininess: 60 }), false); brace.position.z = 0.09; wrist.add(brace); }
    if (G.era >= 5) { const pis = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6), mat('#d8dde2', { shininess: 80 }), false); pis.rotation.x = Math.PI / 2; pis.position.set(0.05, 0.04, 0.14); wrist.add(pis); }
    // martelo/picareta: cresce com o nível; nos cabos compridos a mão segura mais embaixo, para todos acertarem o mesmo ponto
    const ham = this.hammerInHand(L), sc = (0.3 + (L - 1) / 60 * 0.22) * ((L >= 31 && L !== 60) ? 0.74 : 1);
    ham.scale.setScalar(sc); ham.rotation.set(-0.15, 0, 0); ham.position.set(0, -0.03, 0); wrist.add(ham); this.vmHam = ham;
    if (ham.userData.head) { wrist.updateWorldMatrix(true, true); const hp = wrist.worldToLocal(ham.userData.head.getWorldPosition(new V3())); if (hp.length() > 0.3) ham.position.sub(hp.sub(hp.clone().setLength(0.3))); else if (hp.length() < 0.24) ham.scale.multiplyScalar(0.24 / hp.length()); } // curtos crescem até alcançar
    this.vmShoulder = shoulder; this.vmElbowG = elbow; this.vmWrist = wrist;
    this.vmSleeve = null; this.vmTorch = null;
  },
  // ---------- golpes aprovados: alternam direita -> esquerda -> por cima ----------
  // sp: ombro levanta  sy: ombro gira  sr: ombro inclina  ef: cotovelo dobra  wp: pulso para trás/frente  wr: pulso gira
  // repouso longe da pedra: braço baixo, só a ponta do martelo aparece no canto (no máximo ~5% da tela)
  VM_IDLE: { sp: -0.95, sy: -0.4, sr: 1.1, ef: 0.55, wp: -1.1, wr: -0.6 },
  VM_REST: { sp: -0.244, sy: -0.325, sr: 1.093, ef: 0.894, wp: 0.524, wr: -0.736 },
  SWINGS: [
    { side: 'R', n: 'Alto com giro do pulso', up: { sp: 0.304, sy: -0.376, sr: 0.299, ef: 1.496, wp: -0.035, wr: -0.543 }, hit: { sp: -0.307, sy: 0.299, sr: 0.701, ef: 0.343, wp: 0.434, wr: -0.016 } },
    { side: 'L', n: 'Cruzado do alto', up: { sp: 0.261, sy: 0.071, sr: 0.551, ef: 1.694, wp: -1.1, wr: 0.309 }, hit: { sp: -0.246, sy: 0.074, sr: 1.037, ef: 0.488, wp: -0.226, wr: 0.01 } },
    { side: 'C', n: 'Pesado por cima', up: { sp: 0.349, sy: -0.231, sr: 0.534, ef: 1.947, wp: -1.15, wr: 0.089 }, hit: { sp: -0.274, sy: 0.189, sr: 0.67, ef: 0.173, wp: -0.121, wr: 0.169 } },
  ],
  nextSwing(A) { A.n = (A.n || 0) + 1; return A.n % this.SWINGS.length; },
  vmPoseAt(combo, t) {
    const R = this.VM_REST, sm = u => u * u * (3 - 2 * u), ein = u => u * u * u, eout = u => 1 - Math.pow(1 - u, 3);
    if (!this._swk) this._swk = this.SWINGS.map(w => {
      const fol = Object.assign({}, w.hit, { ef: w.hit.ef + 0.12, wp: w.hit.wp + 0.15, sp: w.hit.sp + 0.05 });
      return [[0, R], [0.42, w.up, sm], [0.58, w.hit, ein], [0.7, fol, eout], [1, R, sm]];
    });
    const keys = this._swk[combo % this._swk.length];
    let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const [t0, a] = keys[i], [t1, b, ease] = keys[i + 1], u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0))), e = ease(u), o = {};
    for (const k in a) o[k] = a[k] + (b[k] - a[k]) * e;
    return o;
  },
  applyVmPose(p, bob = 0) {
    if (!this.vmShoulder) return;
    this.vmShoulder.position.set(0.36 + bob * 0.006, -0.2 + Math.abs(bob) * 0.008, -0.25);
    this.vmShoulder.rotation.set(p.sp, p.sy, p.sr + bob * 0.02); this.vmElbowG.rotation.x = p.ef; this.vmWrist.rotation.set(p.wp, 0, p.wr);
  },
  clickSwing() { const A = this.anim; if (!A) return; A.click = 0.07; A.follow = 0; if (A.t < 0.36 || A.t > 0.58) A.t = 0.36; },
  updateViewModel(dt) {
    this.rebuildViewModel();
    const P = Game.P, A = this.anim;
    const bob = P.moving ? Math.sin(P.walkT * (P.sprint ? 2.6 : 2.2)) : 0;
    if (A.stop > 0) A.stop -= dt; // pausa de impacto
    else if (A.follow > 0) { A.follow -= dt; A.t = 0.58 + (1 - Math.max(0, A.follow) / A.followDur) * 0.42; if (A.follow <= 0) { A.t = 0; if (A.next !== undefined) { A.combo = A.next; A.next = undefined; } } }
    else if (A.click > 0) { A.click -= dt; A.t = Math.min(0.58, A.t + dt / 0.07 * 0.22); }
    else if (Game.mineT > 0 && P.swing > 0.001) A.t = Math.min(0.575, P.swing * 0.58); // segurando: sobe devagar até o golpe
    else A.t = Math.max(0, A.t - dt * 2);
    // levanta o martelo quando há pedra na mira ou está batendo; abaixa quando está só andando
    const busy = A.t > 0.001 || A.follow > 0 || A.click > 0 || A.stop > 0 || Game.mineT > 0 || !!Game.target || (Game.mouse && Game.mouse.down);
    A.ready = (A.ready || 0) + ((busy ? 1 : 0) - (A.ready || 0)) * Math.min(1, dt * (busy ? 12 : 3));
    let want = this.vmPoseAt(A.combo, A.t);
    if (A.ready < 0.999) { const I = this.VM_IDLE, o = {}; for (const k in want) o[k] = I[k] + (want[k] - I[k]) * A.ready; want = o; }
    if (!A.pose) A.pose = Object.assign({}, want);
    const k = A.follow > 0 || A.click > 0 ? 1 : Math.min(1, dt * 18);
    for (const key in want) A.pose[key] += (want[key] - A.pose[key]) * k;
    this.applyVmPose(A.pose, bob);
    if (this.vmTorch) this.vmTorch.position.set(-0.32 - bob * 0.01, -0.36 + Math.abs(bob) * 0.012, -0.55);
    // martelo do Vale: cristais girando e brilho pulsando
    const u = this.vmHam && this.vmHam.userData;
    if (u && u.orbit) { u.orbit.rotation.y += dt * 3; u.ring.rotation.z += dt * 1.5; this.vmGlow.intensity = 0.8 + Math.sin(this.t * 4) * 0.3; } else if (u && u.glowPow) { this.vmGlow.color.set(u.glowCol); this.vmGlow.intensity = u.glowPow * (0.8 + Math.sin(this.t * 4) * 0.2); } else this.vmGlow.intensity = 0;
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
    this.hitLight = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.getGlowTex(), color: '#ffd27a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 })); this.hitLight.scale.setScalar(2.4); this.hitLight.intensity = 0; this.hitLight.color = this.hitLight.material.color; this.scene.add(this.hitLight); // flash falso (sem luz real)
    this.wave = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#bff8ff', transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.wave); this.waveT = 0; this.hitLightT = 0;
  },
  // estilo do impacto por faixa de picareta (cor, brasas, onda); martelos < 31 mantêm o estilo clássico
  impactStyle(L, look) {
    if (L < 31) return { a: '#ffb24a', b: '#ff7a2e', c: '#ff7a2e', w: '#ffe2a0', gr: 9, spread: 1, life: 1, glow: 1, wave: false, waveK: 1 };
    const T = [
      { a: '#dfe3e8', b: '#ffffff', c: '#9aa2ab', w: '#e6eaee', gr: 11, spread: 0.9, life: 0.8, glow: 0.7, wave: false, waveK: 0.8 },
      { a: '#bfe6ff', b: '#ffffff', c: '#7ac8ff', w: '#bfe6ff', gr: 9, spread: 1, life: 1, glow: 0.9, wave: false, waveK: 0.9 },
      { a: '#ffffff', b: '#e8f2ff', c: '#cfe0ff', w: '#ffffff', gr: 8, spread: 1.1, life: 1.05, glow: 1, wave: true, waveK: 1 },
      { a: '#ffa63a', b: '#ff7a2e', c: '#ffe08a', w: '#ffb060', gr: 4, spread: 1, life: 1.5, glow: 1.1, wave: true, waveK: 1 },
      { a: '#ffd34d', b: '#fff1a8', c: '#ffb000', w: '#ffe27a', gr: 3, spread: 1.1, life: 1.6, glow: 1.2, wave: true, waveK: 1.1 },
      { a: '#5ad7ff', b: '#bff8ff', c: '#ffffff', w: '#7ae3ff', gr: 6, spread: 1.2, life: 1.2, glow: 1.2, wave: true, waveK: 1.2 },
      { a: look.head, b: '#ffffff', c: look.head, w: look.head, gr: 5, spread: 1.2, life: 1.3, glow: 1.3, wave: true, waveK: 1.3 },
      { a: look.head, b: '#ffffff', c: '#ffffff', w: '#ffffff', gr: 2, spread: 1.3, life: 1.6, glow: 1.4, wave: true, waveK: 1.5 },
      { a: '#ff6a2a', b: '#ffb04a', c: '#c06af0', w: '#ff8a3d', gr: -1.5, spread: 1.3, life: 2, glow: 1.5, wave: true, waveK: 1.6 },
    ];
    const tier = L >= 61 ? 9 : L <= 34 ? 0 : L <= 37 ? 1 : L <= 40 ? 2 : L <= 44 ? 3 : L <= 47 ? 4 : L <= 50 ? 5 : L <= 55 ? 6 : L <= 57 ? 7 : 8;
    return tier === 9 ? { a: '#ffe27a', b: '#ffffff', c: '#7af0ff', w: '#ffe27a', gr: -2.5, spread: 1.5, life: 2.2, glow: 1.8, wave: true, waveK: 2 } : T[tier];
  },
  hitFx(n, o) {
    if (!this.chips) return;
    const L = Game.S.hammer, A = this.anim;
    // combo: cada golpe troca de lado; o terceiro é o golpe final, com mais partículas
    const fin = A && this.SWINGS[A.combo % this.SWINGS.length].side === 'C';
    if (A) { A.followDur = Math.min(0.26, Math.max(0.12, Game.interval() * (o.click ? 0.3 : 0.25))); A.follow = A.followDur; A.click = 0; A.t = 0.58; A.stop = 0.03 + L / 1200 + (fin ? 0.03 : 0); A.next = this.nextSwing(A); }
    let power = (fin ? 1.7 : 1) * (o.broke ? 2 : 1) * (o.click ? 0.85 : 1);
    // ponto do impacto: superfície da pedra virada para o jogador
    const P = Game.P, dx = P.x - n.x, dy = P.y - n.y, dd = Math.hypot(dx, dy) || 1, om = oreMul(n), r = n.r * 0.55 * om.W;
    const ix = n.x + dx / dd * r, iy = n.y + dy / dd * r, iz = World.height(n.x, n.y) + n.r * 0.75 * (1 + (om.M - 1) * 0.6);
    const chipCols = [n.res.c, n.res.c2, n.res.c].map(c => new THREE.Color(c));
    const fs = this.fxScale || 1, nChips = Math.round((4 + L * 0.45) * power * fs), nSparks = Math.round((L < 6 ? 0 : 6 + L * 1.25) * power * fs);
    const look = hammerLook(L);
    const IS = this.impactStyle(L, look), sc = new THREE.Color(IS.a), sc2 = new THREE.Color(IS.b), sc3 = new THREE.Color(IS.c);
    const rainbow = L >= 61 ? ['#ff6a6a', '#ffd34d', '#7af0ff', '#c06af0'].map(c => new THREE.Color(c)) : null;
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
      d.t0 = d.t *= IS.life; Object.assign(d, { x: ix, y: iz, z: iy, vx: Math.cos(a) * Math.cos(el) * sp * IS.spread, vy: Math.sin(el) * sp * IS.spread + 1.2, vz: Math.sin(a) * Math.cos(el) * sp * IS.spread, gr: IS.gr, c: rainbow ? rainbow[Math.floor(Math.random() * 4)] : Math.random() < 0.25 ? sc2 : Math.random() < 0.2 ? sc3 : sc });
    }
    // clarão, onda de choque e tremida
    if (L >= 10) { this.hitLight.position.set(ix, iz + 0.3, iy); this.hitLight.color.copy(sc); this.hitLightT = 0.14; this.hitLightPow = (0.5 + L / 45 * power) * IS.glow; this.vmFlash.color.copy(sc); this.vmFlash.intensity = 0.8 + L / 40; }
    if (L >= 50 || IS.wave && (fin || o.broke) || (fin && L >= 35) || (o.broke && L >= 30)) { this.waveT = 0.45; this.wave.position.set(ix, World.height(ix, iy) + 0.08, iy); this.wave.material.color.set(IS.w); this.waveSize = (1 + L / 40 * power) * IS.waveK; }
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
        anyS = true; d.t -= dt; d.vy -= (d.gr === undefined ? 9 : d.gr) * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        const f = Math.max(0, d.t / d.t0);
        this.spPos[j] = d.x; this.spPos[j + 1] = d.t > 0 ? d.y : -999; this.spPos[j + 2] = d.z;
        const ff = f * 0.85; this.spCol[j] = d.c.r * ff; this.spCol[j + 1] = d.c.g * ff; this.spCol[j + 2] = d.c.b * ff;
      }
    }
    if (anyS || this._spWas) { this.sparkPts.geometry.attributes.position.needsUpdate = this.sparkPts.geometry.attributes.color.needsUpdate = true; }
    this._spWas = anyS;
    this.sparkPts.material.size = 0.045 + Game.S.hammer / 1600;
    this.hitLightT = Math.max(0, this.hitLightT - dt); { const k = this.hitLightT > 0 ? (this.hitLightT / 0.14) * this.hitLightPow : 0; this.hitLight.material.opacity = Math.min(0.85, k * 0.45); this.hitLight.scale.setScalar(1.6 + k * 1.2); this.hitLight.visible = k > 0.01; }
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
    if (false) { const t = this.tag(this.makeTorch(), 'light'); t.position.set(0, -0.7, -0.08); arm2.add(t); arm2.rotation.x = -0.5; }
    if (false) { const hl = this.tag(this.makeHeadlamp(st.lightOn), 'light'); hl.position.y = 1.95; body.add(hl); }
    if (false) { const n = lv === 4 ? 3 : 1; for (let i = 0; i < n; i++) { const d = this.tag(this.makeDrone(), 'light'); d.scale.setScalar(0.8); d.position.set((i - (n - 1) / 2) * 1.1, 2.7 + (i === 1 ? 0.25 : 0), 0.3); g.add(d); } }
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
    this.updateNearGround(); this.updateFarGround(); this.updateDecor(); this.updateOreLod(); this.updateGrass(); this.updateBirds(dt); this.updateVendors(dt); this.updateHouses(); this.syncNodes(); this.updateFx(); this.updatePlayer();
    // câmera
    const gh = World.height(P.x, P.y);
    const bob = P.z === 0 ? Math.sin(P.walkT * (P.sprint ? 2.6 : 2.2) * 2) * (P.sprint ? 0.06 : 0.035) * (P.bobAmp || 0) : 0;
    const shake = Game.shake * 0.012;
    this.cam.rotation.set(P.pitch + (Math.random() - 0.5) * shake, P.yaw + (Math.random() - 0.5) * shake, 0);
    const rh = this.rideH(), ridingNow = !!Game.ride();
    let fwd = FP_FWD;
    if (this.view === 'fp') { const feet = gh + P.z; for (let i = 0; i < 4 && fwd > 0; i++) { const cx = P.x - Math.sin(P.yaw) * (fwd + 0.3), cz = P.y - Math.cos(P.yaw) * (fwd + 0.3); if (World.height(cx, cz) > feet + 0.05) fwd -= 0.1; else break; } fwd = Math.max(0, fwd); }
    if (this.view === 'fp') this.cam.position.set(P.x - Math.sin(P.yaw) * fwd, gh + P.z + EYE + rh + (ridingNow ? bob * 0.2 : bob) - (Game.landDip || 0), P.y - Math.cos(P.yaw) * fwd);
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
    if (this.egg) { const L = Game.S.hammer, st = L >= 50 ? 3 : L >= 40 ? 2 : L >= 20 ? 1 : 0; this.eggCracks.forEach((c, i) => c.visible = i < st); const pulse = st ? (0.15 + st * 0.15) * (0.6 + 0.4 * Math.sin(this.t * (1 + st))) : 0; this.egg.material.emissiveIntensity = (this.eggBase || 0) + pulse; this.eggLight.intensity = 0.5 + pulse * 2; this.egg.rotation.z = st >= 2 ? Math.sin(this.t * 7) * 0.04 * (Math.sin(this.t * 0.7) > 0.6 ? 1 : 0) : 0; }
    if (this.shopIcons) this.shopIcons.forEach((ic, i) => { ic.rotation.y = this.t * 1.2 + i; ic.position.y = 5.4 + Math.sin(this.t * 2 + i) * 0.15; });
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
    if (n.res.sealed) { el.innerHTML = tt("<div class=\"tl\"><em style=\"border-color:#ffd34d;color:#ffd34d\">Martelo 61</em><b>🔒 {0}</b></div><div class=\"hp\"><i style=\"width:{1}%;background:#ffd34d\"></i></div><span>{2}</span>", n.res.name, Math.max(0, n.hp / n.maxHp * 100), Game.S.hammer >= 61 ? tt("Golpeie sem parar: o selo vai ceder.") : tt("Precisa do Martelo 61 para quebrar")); return; }
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
    if (Game.S.hammer >= 61 && !Game.S.seal) { const p = map(Z7.x, Z7.y), k = 12 + Math.sin(this.t * 4) * 3; c.strokeStyle = '#ffd34d'; c.lineWidth = 3; c.beginPath(); c.arc(p[0], p[1], k, 0, Math.PI * 2); c.stroke(); c.fillStyle = '#ffd34d'; c.strokeStyle = '#000'; c.font = '800 20px system-ui'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeText('7', p[0], p[1] + 7); c.fillText('7', p[0], p[1] + 7); }
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
