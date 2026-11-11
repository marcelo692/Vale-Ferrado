// =============================================================
// Vale Ferrado — Zona 7: a zona que não existe (segredo do fim do jogo)
// Clareira a sudeste com menires rúnicos, muralha com inscrições nas 4 línguas,
// a porta do dragão, a Pedra Selada (só quebra com a Picareta 61) e uma coluna
// de luz visível de longe.
// Eixos locais do grupo: +X = para longe da cidade (a), +Z = para o lado (b).
// =============================================================
'use strict';

// ---------- alfabeto rúnico desenhado à mão (futhark antigo), cada letra em caixa 0..1 ----------
const RUNES = {
  A: [[.3, 0, .3, 1], [.3, .08, .8, .32], [.3, .38, .8, .62]],
  B: [[.3, 0, .3, 1], [.3, 0, .75, .22], [.75, .22, .3, .5], [.3, .5, .75, .75], [.75, .75, .3, 1]],
  C: [[.78, .12, .25, .5], [.25, .5, .78, .88]],
  D: [[.2, 0, .2, 1], [.8, 0, .8, 1], [.2, 0, .8, 1], [.2, 1, .8, 0]],
  E: [[.22, 0, .22, 1], [.78, 0, .78, 1], [.22, 0, .5, .42], [.5, .42, .78, 0]],
  F: [[.3, 0, .3, 1], [.3, .3, .78, .06], [.3, .62, .78, .38]],
  G: [[.2, .08, .8, .92], [.8, .08, .2, .92]],
  H: [[.25, 0, .25, 1], [.75, 0, .75, 1], [.25, .38, .75, .62]],
  I: [[.5, 0, .5, 1]],
  J: [[.5, 0, .5, 1], [.5, .22, .22, .44], [.5, .56, .78, .78]],
  L: [[.35, 0, .35, 1], [.35, 0, .78, .3]],
  M: [[.2, 0, .2, 1], [.8, 0, .8, 1], [.2, 0, .5, .45], [.5, .45, .8, 0], [.2, 1, .5, .55], [.5, .55, .8, 1]],
  N: [[.5, 0, .5, 1], [.2, .3, .8, .7]],
  O: [[.5, .08, .2, .4], [.2, .4, .5, .7], [.5, .7, .8, .4], [.8, .4, .5, .08], [.3, .62, .15, 1], [.7, .62, .85, 1]],
  P: [[.3, 0, .3, 1], [.3, 0, .76, .16], [.76, .16, .76, .44], [.76, .44, .3, .6]],
  R: [[.3, 0, .3, 1], [.3, 0, .76, .2], [.76, .2, .3, .5], [.3, .5, .8, 1]],
  S: [[.76, .04, .3, .4], [.3, .4, .7, .6], [.7, .6, .24, .96]],
  T: [[.5, 0, .5, 1], [.5, 0, .2, .3], [.5, 0, .8, .3]],
  U: [[.22, 1, .22, 0], [.22, 0, .78, .22], [.78, .22, .78, 1]],
  W: [[.3, 0, .3, 1], [.3, 0, .76, .2], [.76, .2, .3, .44]],
  Z: [[.5, 0, .5, 1], [.5, .5, .2, .14], [.5, .5, .8, .14]],
};
const RUNE_MAP = { V: 'U', K: 'C', Q: 'C', X: 'C', Y: 'J' };
function runeKey(ch) {
  ch = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (ch === 'İ' || ch === 'I') return 'I';
  return RUNES[ch] ? ch : RUNE_MAP[ch] || null;
}
// escreve um texto em runas num canvas (largura de cada runa = cw)
function runeText(g, text, x, y, cw, ch, maxW) {
  const words = text.split(' '), gap = cw * 0.3, adv = cw * 1.28;
  const lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (t.length * adv > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  lines.forEach((ln, li) => {
    let px = x;
    for (const c of ln) {
      if (c === ' ') { px += adv * 0.55; continue; }
      if (c === '.' || c === ',') { g.beginPath(); g.arc(px + cw * 0.2, y + li * ch * 1.35 + ch * 0.55, cw * 0.09, 0, 7); g.fill(); px += adv * 0.5; continue; }
      const k = runeKey(c); if (!k) { px += adv * 0.5; continue; }
      g.beginPath();
      for (const [x1, y1, x2, y2] of RUNES[k]) { g.moveTo(px + x1 * cw, y + li * ch * 1.35 + y1 * ch); g.lineTo(px + x2 * cw, y + li * ch * 1.35 + y2 * ch); }
      g.stroke(); px += adv;
    }
  });
  return lines.length;
}

// a inscrição na muralha: a mesma frase nas quatro línguas do jogo (de propósito, sem tt)
const Z7_TEXT = {
  pt: 'O OVO GUARDA O FOGO. O DRAGÃO DORME ATRÁS DA PORTA. QUEM FORJOU SESSENTA E UM ROMPE O SELO.',
  en: 'THE EGG KEEPS THE FIRE. THE DRAGON SLEEPS BEHIND THE DOOR. HE WHO FORGED SIXTY ONE BREAKS THE SEAL.',
  es: 'EL HUEVO GUARDA EL FUEGO. EL DRAGÓN DUERME TRAS LA PUERTA. QUIEN FORJÓ SESENTA Y UNO ROMPE EL SELLO.',
  tr: 'YUMURTA ATEŞİ SAKLAR. EJDERHA KAPININ ARKASINDA UYUR. ALTMIŞ BİRİ DÖVEN MÜHRÜ KIRAR.',
};

Object.assign(Render, {
  // painel de runas: duas línguas, uma em cima da outra
  z7Panel(langs) {
    return canvasTex(1024, 768, (g, w, h) => {
      g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#ffd34d'; g.fillStyle = '#ffd34d'; g.lineWidth = 5; g.shadowColor = '#ff9a2a'; g.shadowBlur = 12;
      let y = 70;
      langs.forEach((l, i) => {
        const n = runeText(g, Z7_TEXT[l], 70, y, 26, 50, w - 140);
        y += n * 50 * 1.35 + 40;
        if (i < langs.length - 1) { g.lineWidth = 3; g.beginPath(); g.moveTo(70, y - 24); g.lineTo(w - 70, y - 24); g.stroke(); for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(w / 2 - 90 + k * 30, y - 34); g.lineTo(w / 2 - 75 + k * 30, y - 14); g.stroke(); } g.lineWidth = 5; y += 30; }
      });
    });
  },
  // a porta: dragão enrolado em volta do ovo, em relevo dourado
  z7DoorTex() {
    return canvasTex(640, 768, (g, w, h) => {
      g.fillStyle = '#2b2326'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 20; i++) { g.fillStyle = i % 2 ? '#2f272b' : '#241d20'; g.fillRect(i * w / 20, 0, w / 20 - 2, h); }
      g.fillStyle = '#4a3f3a'; for (const y of [0.08, 0.5, 0.92]) g.fillRect(0, h * y - 14, w, 28); // tiras de ferro
      for (let i = 0; i < 14; i++) for (const y of [0.08, 0.5, 0.92]) { g.fillStyle = '#7a6a56'; g.beginPath(); g.arc(20 + i * 46, h * y, 5, 0, 7); g.fill(); }
      const cx = w / 2, cy = h * 0.53, rx = 150, ry = 190, gold = '#d6a23a', hi = '#ffe9a0', lo = '#7a5416';
      const blob = (x, y, r) => { g.fillStyle = lo; g.beginPath(); g.arc(x + 2, y + 3, r, 0, 7); g.fill(); g.fillStyle = gold; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = hi; g.globalAlpha = 0.55; g.beginPath(); g.arc(x - r * 0.25, y - r * 0.3, r * 0.45, 0, 7); g.fill(); g.globalAlpha = 1; };
      // asas
      for (const sd of [-1, 1]) {
        g.fillStyle = lo; g.beginPath(); g.moveTo(cx + sd * 40, cy - ry * 0.9); g.bezierCurveTo(cx + sd * 150, cy - ry * 1.5, cx + sd * 290, cy - ry * 1.1, cx + sd * 300, cy - ry * 0.35); g.lineTo(cx + sd * 240, cy - ry * 0.55); g.lineTo(cx + sd * 200, cy - ry * 0.3); g.lineTo(cx + sd * 150, cy - ry * 0.5); g.lineTo(cx + sd * 90, cy - ry * 0.3); g.closePath(); g.fill();
        g.strokeStyle = gold; g.lineWidth = 6; g.stroke();
        g.lineWidth = 4; for (const [ex, ey] of [[240, -0.55], [200, -0.3], [150, -0.5]]) { g.beginPath(); g.moveTo(cx + sd * 40, cy - ry * 0.9); g.lineTo(cx + sd * ex, cy + ry * ey); g.stroke(); }
      }
      // corpo enrolado: espiral em volta do ovo, afinando até a cauda
      const N = 110;
      for (let i = 0; i <= N; i++) {
        const t = i / N, a = -Math.PI * 0.45 + t * Math.PI * 3.1, k = 1 + (1 - t) * 0.12;
        blob(cx + Math.cos(a) * rx * k * (0.9 + 0.1 * Math.sin(t * 20)), cy + Math.sin(a) * ry * k * 0.95, 26 - t * 17 + Math.sin(t * 40) * 1.5);
      }
      g.strokeStyle = lo; g.lineWidth = 2; for (let i = 0; i < N; i += 2) { const t = i / N, a = -Math.PI * 0.45 + t * Math.PI * 3.1; g.beginPath(); g.arc(cx + Math.cos(a) * rx * 1.05, cy + Math.sin(a) * ry, 10 - t * 6, a + 1.4, a + 3.2); g.stroke(); }
      // o ovo
      const eg = g.createRadialGradient(cx - 18, cy - 28, 8, cx, cy, 105); eg.addColorStop(0, '#fff3c0'); eg.addColorStop(0.5, '#e8b04a'); eg.addColorStop(1, '#8a5a1a');
      g.fillStyle = eg; g.beginPath(); g.ellipse(cx, cy + 6, 78, 104, 0, 0, 7); g.fill(); g.strokeStyle = lo; g.lineWidth = 4; g.stroke();
      g.strokeStyle = '#3a2410'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx - 20, cy - 70); g.lineTo(cx - 4, cy - 38); g.lineTo(cx - 26, cy - 10); g.lineTo(cx + 2, cy + 22); g.lineTo(cx - 12, cy + 60); g.stroke();
      // cabeça (acima do ovo, olhando para ele)
      const hx = cx + 62, hy = cy - ry - 26;
      g.fillStyle = lo; g.beginPath(); g.moveTo(hx - 60, hy + 22); g.lineTo(hx - 20, hy - 26); g.lineTo(hx + 34, hy - 20); g.lineTo(hx + 78, hy + 18); g.lineTo(hx + 30, hy + 34); g.lineTo(hx - 24, hy + 50); g.closePath(); g.fill(); g.strokeStyle = gold; g.lineWidth = 5; g.stroke();
      g.fillStyle = gold; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(hx + sd * 14, hy - 22); g.lineTo(hx + sd * 40 + 20, hy - 70); g.lineTo(hx + sd * 40 + 4, hy - 18); g.fill(); }
      g.fillStyle = '#ff5a2a'; g.shadowColor = '#ff7a2a'; g.shadowBlur = 14; g.beginPath(); g.ellipse(hx + 10, hy + 4, 11, 6, -0.4, 0, 7); g.fill(); g.shadowBlur = 0;
      g.fillStyle = hi; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(hx + 30 + i * 9, hy + 22 + i * 2); g.lineTo(hx + 34 + i * 9, hy + 34 + i * 2); g.lineTo(hx + 38 + i * 9, hy + 22 + i * 2); g.fill(); }
      // borda de runas
      g.lineCap = 'round'; g.strokeStyle = gold; g.fillStyle = gold; g.lineWidth = 3; runeText(g, 'FOGO OVO DRAGAO SELO', 60, 26, 18, 30, w - 120);
    });
  },
  // textura de pedra com blocos para a muralha
  z7StoneTex() {
    return canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#58505f'; g.fillRect(0, 0, w, h);
      const r = rng(9);
      for (let y = 0; y < h; y += 64) for (let x = (y / 64 % 2) * 64; x < w + 64; x += 128) { g.fillStyle = `rgb(${80 + r() * 28 | 0},${72 + r() * 24 | 0},${88 + r() * 28 | 0})`; g.fillRect(x + 3, y + 3, 122, 58); }
      g.strokeStyle = 'rgba(15,10,20,.55)'; g.lineWidth = 4; for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.1})`; g.fillRect(r() * w, r() * h, 2 + r() * 5, 2 + r() * 3); }
    });
  },
  // anel de runas no chão em volta da Pedra Selada
  z7FloorTex() {
    return canvasTex(1024, 1024, (g, w, h) => {
      const c = w / 2; g.lineCap = 'round'; g.strokeStyle = '#ffd34d'; g.fillStyle = '#ffd34d'; g.shadowColor = '#ff9a2a'; g.shadowBlur = 14;
      for (const [r, lw] of [[500, 8], [430, 4], [330, 4]]) { g.lineWidth = lw; g.beginPath(); g.arc(c, c, r, 0, 7); g.stroke(); }
      const word = 'OVO FOGO DRAGAO SELO ', M = 40;
      for (let i = 0; i < M; i++) {
        const a = i / M * Math.PI * 2, ch = word[i % word.length], k = runeKey(ch); if (!k) continue;
        g.save(); g.translate(c + Math.cos(a) * 465, c + Math.sin(a) * 465); g.rotate(a + Math.PI / 2); g.lineWidth = 6;
        g.beginPath(); for (const [x1, y1, x2, y2] of RUNES[k]) { g.moveTo((x1 - 0.5) * 36, (y1 - 0.5) * 56); g.lineTo((x2 - 0.5) * 36, (y2 - 0.5) * 56); } g.stroke(); g.restore();
      }
      g.lineWidth = 3; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * 330, c + Math.sin(a) * 330); g.lineTo(c + Math.cos(a) * 430, c + Math.sin(a) * 430); g.stroke(); }
    });
  },
  // coluna de luz: faixa vertical com bordas macias
  z7BeamTex() {
    return canvasTex(64, 256, (g, w, h) => {
      const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.5, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gx; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-in'; const gy = g.createLinearGradient(0, 0, 0, h); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.35, 'rgba(0,0,0,.55)'); gy.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gy; g.fillRect(0, 0, w, h);
    });
  },

  buildZone7() {
    const G = this.z7 = new THREE.Group(); G.position.set(Z7.x, 0, Z7.y); G.rotation.y = -Z7.ang * Math.PI / 180; this.scene.add(G);
    const gt = this.getGlowTex();
    const glowCol = '#ffd34d', stone = new THREE.MeshLambertMaterial({ map: this.z7StoneTex(), flatShading: true });
    stone.map.wrapS = stone.map.wrapT = THREE.RepeatWrapping;
    const dark = mat('#3a3442');
    const tfn = [];  // animações por quadro (feitas em onBeforeRender, sem laço próprio)
    const glow = (col, size, op = 0.8) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op })); s.scale.setScalar(size); return s; };

    // chão de pedra e anel de runas em volta da Pedra Selada
    const ring = new THREE.Mesh(new THREE.CircleGeometry(13, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.z7FloorTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, opacity: 0.9 }));
    ring.position.set(14, 0.05, 0); G.add(ring);

    // avenida de menires: leva da entrada da clareira até a Pedra
    const r = rng(77);
    for (let i = 0; i < 7; i++) for (const sd of [-1, 1]) {
      const a = -54 + i * 9, b = sd * (7.5 + (i % 2) * 0.8), p = Z7.at(a, b), h = 4.2 + r() * 2.2;
      const m = mesh(jitterGeo(new THREE.CylinderGeometry(0.55, 1, h, 6, 2), 0.14, i * 3 + (sd + 1)), stone); m.position.set(a, World.height(p.x, p.y) + h / 2 - 0.1, b); m.rotation.y = r() * 3; G.add(m);
      const rk = RUNES[Object.keys(RUNES)[(i * 2 + (sd + 1)) % 20]];
      const tex = canvasTex(64, 96, (g) => { g.strokeStyle = '#ffd34d'; g.lineWidth = 7; g.lineCap = 'round'; g.shadowColor = '#ff9a2a'; g.shadowBlur = 8; g.beginPath(); for (const [x1, y1, x2, y2] of rk) { g.moveTo(8 + x1 * 48, 8 + y1 * 80); g.lineTo(8 + x2 * 48, 8 + y2 * 80); } g.stroke(); });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.35), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      pl.position.set(a - sd * 0.0, m.position.y + 0.3, b - sd * 0.82 + (sd > 0 ? 0 : 0)); pl.rotation.y = sd > 0 ? Math.PI : 0; G.add(pl);
      const gl = glow('#ffb84a', 3.2, 0.5); gl.position.set(a, m.position.y + h * 0.5 + 0.4, b); G.add(gl);
      World.solids.push({ x: p.x, y: p.y, r: 0.9 });
    }
    // placa da entrada
    { const lab = labelSprite(tt("Zona 7"), tt("a zona que não existe"), '#ffe27a', 1.5); lab.position.set(-58, 5.2, 0); G.add(lab);
      for (const sd of [-1, 1]) { const br = mesh(new THREE.CylinderGeometry(0.5, 0.35, 1.1, 8), stone); br.position.set(-58, 0.55, sd * 3.4); G.add(br); const f = glow('#ff9a3a', 2.6, 0.9); f.position.set(-58, 1.7, sd * 3.4); G.add(f); tfn.push(t => f.material.opacity = 0.7 + Math.sin(t * 9 + sd) * 0.2); } }

    // muralha com a porta
    const WA = Z7.WALL_A, wallH = 12;
    for (const sd of [-1, 1]) {
      const w = mesh(new THREE.BoxGeometry(4, wallH, 22), stone); w.position.set(WA, wallH / 2, sd * 19.5); G.add(w);
      w.geometry.attributes.uv.array.forEach((v, i, arr) => { arr[i] = v * 2; });
      const pil = mesh(new THREE.BoxGeometry(5, 24, 2.6), stone); pil.position.set(WA - 0.4, 12, sd * 9.2); G.add(pil);
      const pan = new THREE.Mesh(new THREE.PlaneGeometry(17, 12.75), new THREE.MeshBasicMaterial({ map: this.z7Panel(sd < 0 ? ['pt', 'en'] : ['es', 'tr']), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      pan.position.set(WA - 2.03, 6.2, sd * 19.5); pan.rotation.y = -Math.PI / 2; G.add(pan);
      tfn.push(t => pan.material.opacity = 0.75 + Math.sin(t * 1.3 + sd) * 0.2);
      for (let k = 0; k < 6; k++) { const c = mesh(jitterGeo(new THREE.DodecahedronGeometry(1.1 + r() * 0.8, 0), 0.3, k + 20), stone); c.position.set(WA + 3 + r() * 1.6, 0.6, sd * (11 + k * 4.2)); G.add(c); }
      for (let b = -30; b <= 30; b += 3) { const p = Z7.at(WA, b); World.solids.push({ x: p.x, y: p.y, r: 2.7 }); }
    }
    const lintel = mesh(new THREE.BoxGeometry(5, 7, 21), stone); lintel.position.set(WA - 0.4, 20.5, 0); G.add(lintel);
    { const keys = mesh(new THREE.BoxGeometry(0.4, 4.6, 8), dark); keys.position.set(WA - 3, 20.6, 0); G.add(keys);
      const t = canvasTex(512, 128, (g, w, h) => { g.strokeStyle = '#ffd34d'; g.fillStyle = '#ffd34d'; g.lineCap = 'round'; g.lineWidth = 6; g.shadowColor = '#ff9a2a'; g.shadowBlur = 12; runeText(g, 'OVO DRAGAO', 40, 30, 36, 66, w - 60); });
      const ins = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })); ins.position.set(WA - 3.22, 20.6, 0); ins.rotation.y = -Math.PI / 2; G.add(ins); }

    // porta: duas folhas que giram nas dobradiças; atrás, o brilho do que dorme lá dentro
    const doorTex = this.z7DoorTex(), leaves = [];
    for (const sd of [-1, 1]) {
      const t = doorTex.clone(); t.needsUpdate = true; t.repeat.set(0.5, 1); t.offset.set(sd < 0 ? 0 : 0.5, 0);
      const m = new THREE.MeshLambertMaterial({ map: t, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.22 });
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.8, 16.5, 7.2), [dark, m, dark, dark, dark, dark]);
      leaf.geometry.translate(0, 0, -sd * 3.6); // dobradiça na borda de fora
      const pivot = new THREE.Group(); pivot.position.set(WA - 0.6, 8.25, sd * 7.2); pivot.add(leaf); G.add(pivot); leaves.push([pivot, sd]);
    }
    const cave = new THREE.Mesh(new THREE.BoxGeometry(9, 17, 16), new THREE.MeshBasicMaterial({ color: '#100810' })); cave.position.set(WA + 5, 8.5, 0); G.add(cave);
    const inner = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 16.5), new THREE.MeshBasicMaterial({ color: '#ff8a2a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    inner.position.set(WA + 0.6, 8.25, 0); inner.rotation.y = -Math.PI / 2; G.add(inner);
    const eyes = [-1, 1].map(sd => { const e = glow('#ffb020', 1.3, 0); e.position.set(WA + 4, 3.2, sd * 1.5); G.add(e); return e; });
    const spill = glow('#ff8a3a', 16, 0); spill.position.set(WA - 4, 1.2, 0); G.add(spill);
    const S7 = this.z7s = { cur: 0, target: 0, init: false };
    let lastT = performance.now();
    inner.onBeforeRender = () => {
      const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
      S7.cur += (S7.target - S7.cur) * (1 - Math.exp(-dt * 1.4));
      for (const [pv, sd] of leaves) pv.rotation.y = -sd * S7.cur * 0.34;
      inner.material.opacity = S7.cur * (0.75 + Math.sin(now / 600) * 0.1); spill.material.opacity = S7.cur * 0.55;
      const blink = Math.sin(now / 1900) > 0.93 ? 0 : 1; eyes.forEach(e => { e.material.opacity = S7.cur * 0.9 * blink; });
    };

    // braseiros de cada lado da porta
    for (const b of [-5.5, 5.5]) { const br = mesh(new THREE.CylinderGeometry(1.1, 0.7, 1.3, 8), dark); br.position.set(WA - 5, 0.65, b); G.add(br); const f = glow('#ff9a3a', 4, 0.9); f.position.set(WA - 5, 2, b); G.add(f); tfn.push(t => { f.material.opacity = 0.75 + Math.sin(t * 8 + b) * 0.2; f.scale.setScalar(3.6 + Math.sin(t * 11 + b) * 0.5); }); }

    // coluna de luz que se vê de longe (faixa sempre de frente para a câmera)
    const beamTex = this.z7BeamTex(), bp = Z7.at(14, 0);
    const mkBeam = (w, col) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 1100), new THREE.MeshBasicMaterial({ map: beamTex, color: col, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })); m.position.set(bp.x, 550, bp.y); m.frustumCulled = false; this.scene.add(m); return m; };
    const b1 = mkBeam(46, '#ffb84a'), b2 = mkBeam(12, '#fff2c0');
    this.z7Beams = [b1, b2];
    b1.onBeforeRender = () => {
      const c = this.cam.position, yaw = Math.atan2(c.x - bp.x, c.z - bp.y), t = performance.now() / 1000, lit = Game.S.hammer >= 61 && !Game.S.seal ? 1 : Game.S.seal ? 0.35 : 0.55;
      for (const b of this.z7Beams) b.rotation.y = yaw;
      b1.material.opacity = (0.32 + Math.sin(t * 1.7) * 0.06) * lit; b2.material.opacity = (0.6 + Math.sin(t * 2.3) * 0.1) * lit;
      b1.material.color.set(Game.S.seal ? '#c08aff' : '#ffb84a');
    };
    const flare = glow('#ffd34d', 18, 0.7); flare.position.set(14, 3, 0); G.add(flare); tfn.push(t => flare.material.opacity = 0.55 + Math.sin(t * 2) * 0.15);

    // um único laço de animação, preso na luz do chão
    let last = 0;
    const run = () => { const t = performance.now() / 1000; if (t - last < 0.008) return; last = t; ring.material.opacity = 0.65 + Math.sin(t * 1.4) * 0.25; for (const f of tfn) f(t); };
    ring.onBeforeRender = run; lintel.onBeforeRender = run; for (const [pv] of leaves) pv.children[0].onBeforeRender = run;
  },

  // porta aberta (true) ou fechada (false); a primeira chamada é instantânea
  openSeal(on) { const S = this.z7s; if (!S) return; S.target = on ? 1 : 0; if (!S.init) { S.cur = S.target; S.init = true; } },

  // a Pedra Selada em si (chamado pelo nodeMesh)
  buildSealRock(g, s, n) {
    const rk = rng(Math.floor(n.seed * 1000)), body = mesh(jitterGeo(new THREE.IcosahedronGeometry(s * 2.1, 2), s * 0.5, 5), mat('#2a2133', { shininess: 40, specular: '#6a5a88' }));
    body.scale.set(1.25, 1.45, 1.1); body.position.y = s * 2.1; g.add(body);
    for (let i = 0; i < 5; i++) { const m = mesh(jitterGeo(new THREE.IcosahedronGeometry(s * (0.7 + rk() * 0.5), 1), s * 0.25, i + 3), mat('#3a2e46')); const a = i / 5 * 6.28; m.position.set(Math.cos(a) * s * 2.7, s * 0.4, Math.sin(a) * s * 2.7); g.add(m); }
    const gold = new THREE.MeshBasicMaterial({ color: '#ffd34d' });
    for (let i = 0; i < 12; i++) { // rachaduras luminosas
      const a = rk() * 6.28, el = 0.1 + rk() * 1.2, len = s * (1 + rk() * 1.4), c = new THREE.Mesh(new THREE.BoxGeometry(len, s * 0.07, s * 0.07), gold);
      const p = new V3(Math.cos(a) * Math.cos(el) * s * 2.5, s * 2.1 + Math.sin(el) * s * 2.9, Math.sin(a) * Math.cos(el) * s * 2.5); c.position.copy(p); c.lookAt(p.clone().multiplyScalar(2)); c.rotateZ(rk() * 3); g.add(c);
    }
    const rune = new THREE.Group(); rune.position.y = s * 2.3; g.add(rune);
    for (let i = 0; i < 3; i++) { const t = mesh(new THREE.TorusGeometry(s * (3.4 + i * 0.35), s * 0.045, 4, 48), new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffe27a' : '#c08aff' }), false); t.rotation.set(Math.PI / 2 + i * 0.35, i * 0.9, 0); rune.add(t); }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.getGlowTex(), color: '#ffcf6a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
    halo.scale.setScalar(s * 9); halo.position.y = s * 2.3; g.add(halo);
    const lab = labelSprite(tt("Martelo 61"), tt("Pedra Selada"), '#ffe27a', 2.2); lab.position.y = s * 5.6; g.add(lab);
    g.userData.glow = halo; g.userData.glowMax = 0.6; g.userData.spin = rune;
  },
});

// =============================================================
// Ovo lendário da fonte: casca lisa e redonda, cores vibrantes, manchas,
// filigrana élfica dourada com runas e partículas de vaga-lumes
// =============================================================
Object.assign(Render, {
  eggTex(glowOnly) {
    return canvasTex(1024, 512, (g, w, h) => {
      const r = rng(glowOnly ? 3 : 3);
      if (!glowOnly) {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7a3cff'); gr.addColorStop(0.3, '#18c8d8'); gr.addColorStop(0.62, '#19d98a'); gr.addColorStop(1, '#e8c820');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        // manchas macias de duas cores, repetidas nas bordas para fechar a costura
        const blots = [['rgba(10,40,110,.9)', 46], ['rgba(255,50,160,.85)', 34], ['rgba(255,235,70,.85)', 30], ['rgba(120,40,200,.8)', 30]];
        for (const [col, n] of blots) for (let i = 0; i < n; i++) {
          const x = r() * w, y = h * (0.1 + r() * 0.8), rad = 12 + r() * 38;
          for (const dx of [-w, 0, w]) { const gg = g.createRadialGradient(x + dx, y, 1, x + dx, y, rad); gg.addColorStop(0, col); gg.addColorStop(0.7, col.replace(/[\d.]+\)$/, '.25)')); gg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gg; g.beginPath(); g.ellipse(x + dx, y, rad, rad * (0.7 + r() * 0.5), r() * 3, 0, 7); g.fill(); }
        }
        for (let i = 0; i < 260; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.35)' : 'rgba(0,40,60,.3)'; g.beginPath(); g.arc(r() * w, h * (0.08 + r() * 0.84), 1 + r() * 2.4, 0, 7); g.fill(); }
      }
      // filigrana élfica dourada: dois cintos de videira com folhas e uma faixa de runas
      g.strokeStyle = '#ffd34d'; g.fillStyle = '#ffd34d'; g.lineCap = 'round'; g.lineJoin = 'round';
      if (glowOnly) { g.shadowColor = '#ffffff'; g.shadowBlur = 0; }
      const vine = (y0, amp, ph) => {
        g.lineWidth = 5; g.beginPath(); for (let x = 0; x <= w; x += 4) { const y = y0 + Math.sin(x / w * Math.PI * 16 + ph) * amp; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
        for (let k = 0; k < 32; k++) { const x = k * w / 32 + w / 64, y = y0 + Math.sin(x / w * Math.PI * 16 + ph) * amp, sd = k % 2 ? 1 : -1;
          g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 12, y + sd * 18, x + 3, y + sd * 36); g.quadraticCurveTo(x - 10, y + sd * 18, x, y); g.fill();
          g.beginPath(); g.arc(x + 20, y - sd * 8, 3, 0, 7); g.fill(); }
      };
      vine(h * 0.3, 12, 0); vine(h * 0.72, 12, 1.6);
      g.lineWidth = 3; for (const y of [0.4, 0.6]) { g.beginPath(); g.moveTo(0, h * y); g.lineTo(w, h * y); g.stroke(); }
      g.lineWidth = 4; runeText(g, 'OVO LENDARIO FOGO ESTRELA DRAGAO VALE FERRADO ', 0, h * 0.425, 22, 50, 99999);
      // estrelas élficas de quatro pontas
      for (let k = 0; k < 14; k++) { const x = (k + 0.5) * w / 14, y = h * (k % 2 ? 0.16 : 0.86), q = 11; g.beginPath(); g.moveTo(x, y - q * 1.6); g.quadraticCurveTo(x, y, x + q, y); g.quadraticCurveTo(x, y, x, y + q * 1.6); g.quadraticCurveTo(x, y, x - q, y); g.quadraticCurveTo(x, y, x, y - q * 1.6); g.fill(); }
    });
  },
  polishEgg() {
    const egg = this.egg; if (!egg) return;
    // casca mais redonda e com mais polígonos; topo mais fino, como um ovo de verdade
    const geo = new THREE.SphereGeometry(0.62, 72, 48), pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) { const y = pa.getY(i) / 0.62, k = 1 - 0.13 * Math.max(0, y) - 0.03 * Math.max(0, -y); pa.setX(i, pa.getX(i) * k); pa.setZ(i, pa.getZ(i) * k); pa.setY(i, pa.getY(i) * 1.32); }
    geo.computeVertexNormals(); egg.geometry.dispose(); egg.geometry = geo;
    while (egg.children.length) { const c = egg.children[0]; if (this.eggCracks.includes(c)) break; egg.remove(c); }
    for (const c of [...egg.children]) if (!this.eggCracks.includes(c)) egg.remove(c); // espinhos antigos
    const tex = this.eggTex(false), glowT = this.eggTex(true);
    egg.material = new THREE.MeshPhongMaterial({ map: tex, emissive: '#ffffff', emissiveMap: glowT, emissiveIntensity: 0.55, shininess: 120, specular: '#ffffff', flatShading: false });
    egg.castShadow = false;
    this.eggBase = 0.55;
    const C = this.city, gt = this.getGlowTex(), T = () => performance.now() / 1000;
    // luz élfica: esverdeada, sobe junto com a força do martelo
    const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: '#40ffb0', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.2 }));
    aura.scale.setScalar(3.0); aura.position.y = 2.95; C.add(aura);
    // anel armilar fino com runas orbitando
    const arm = new THREE.Group(); arm.position.y = 2.95; C.add(arm);
    const gold = new THREE.MeshBasicMaterial({ color: '#ffd34d' });
    for (const [rot, rad] of [[[Math.PI / 2, 0, 0.0], 1.05], [[Math.PI / 2.6, 0.5, 0], 1.18]]) { const t = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.012, 6, 96), gold); t.rotation.set(...rot); arm.add(t); }
    const keys = Object.keys(RUNES), plates = [];
    for (let i = 0; i < 9; i++) {
      const rk = RUNES[keys[(i * 3) % keys.length]], tx = canvasTex(64, 96, g => { g.strokeStyle = '#ffe27a'; g.lineWidth = 7; g.lineCap = 'round'; g.shadowColor = '#ffb020'; g.shadowBlur = 10; g.beginPath(); for (const [x1, y1, x2, y2] of rk) { g.moveTo(8 + x1 * 48, 8 + y1 * 80); g.lineTo(8 + x2 * 48, 8 + y2 * 80); } g.stroke(); });
      const pl = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); pl.scale.set(0.2, 0.3, 1); arm.add(pl); plates.push(pl);
    }
    // vaga-lumes élficos: espirais subindo em volta do ovo, em dourado, menta e lilás
    const NP = 70, pp = new Float32Array(NP * 3), pc = new Float32Array(NP * 3), pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ map: gt, size: 0.13, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false; pts.position.y = 2.2; C.add(pts);
    const pal = ['#ffb000', '#00f090', '#a860ff', '#ffd000'].map(c => new THREE.Color(c)), sd = Array.from({ length: NP }, (_, i) => ({ a: Math.random() * 6.28, sp: 0.15 + Math.random() * 0.35, rr: 0.7 + Math.random() * 0.9, ph: Math.random(), c: pal[i % 4], tw: 2 + Math.random() * 4 }));
    pts.onBeforeRender = () => {
      const t = T(), L = Game.S.hammer, pw = 0.6 + Math.min(1, L / 60) * 0.4;
      sd.forEach((q, i) => { const u = (t * q.sp * 0.3 + q.ph) % 1, a = q.a + t * q.sp * 2 + u * 5, r = q.rr * (0.7 + 0.5 * Math.sin(u * Math.PI)); pp[i * 3] = Math.cos(a) * r; pp[i * 3 + 1] = u * 3.4; pp[i * 3 + 2] = Math.sin(a) * r; const f = Math.sin(u * Math.PI) * (0.6 + 0.4 * Math.sin(t * q.tw + i)) * pw; pc[i * 3] = q.c.r * f; pc[i * 3 + 1] = q.c.g * f; pc[i * 3 + 2] = q.c.b * f; });
      pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true;
      arm.children[0].rotation.z = t * 0.35; arm.children[1].rotation.z = -t * 0.25; arm.rotation.y = t * 0.2;
      plates.forEach((pl, i) => { const a = i / plates.length * 6.283 + t * 0.4; pl.position.set(Math.cos(a) * 1.35, Math.sin(t * 1.3 + i) * 0.35 + (i % 3 - 1) * 0.3, Math.sin(a) * 1.35); pl.material.opacity = 0.6 + Math.sin(t * 2 + i) * 0.3; });
      aura.material.opacity = 0.16 + Math.sin(t * 1.6) * 0.05 + Math.min(1, L / 60) * 0.1; egg.rotation.y = t * 0.25;
    };
  },
});
