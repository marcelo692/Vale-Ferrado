// =============================================================
// Vale Ferrado — desenho do mundo e do personagem (canvas 2D)
// =============================================================
'use strict';

function shade(hex, amt) { // clareia (amt>0) ou escurece (amt<0)
  let r, g, b;
  if (hex.startsWith('rgb')) { [r, g, b] = hex.match(/\d+/g).map(Number); }
  else {
    let c = hex.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join('');
    r = parseInt(c.slice(0, 2), 16); g = parseInt(c.slice(2, 4), 16); b = parseInt(c.slice(4, 6), 16);
  }
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}

const Render = {
  cv: null, ctx: null, mini: null, mctx: null,
  cam: { x: 0, y: 0, zoom: 2.4 }, tileCache: new Map(), t: 0,

  init() {
    this.cv = document.getElementById('game'); this.ctx = this.cv.getContext('2d');
    this.mini = document.getElementById('minimap'); this.mctx = this.mini.getContext('2d');
    const resize = () => { const d = devicePixelRatio || 1; this.cv.width = innerWidth * d; this.cv.height = innerHeight * d; this.dpr = d; };
    resize(); addEventListener('resize', resize);
    this.cv.addEventListener('wheel', e => { e.preventDefault(); this.cam.zoom = Math.max(0.8, Math.min(4.5, this.cam.zoom * (e.deltaY > 0 ? 0.9 : 1.1))); }, { passive: false });
    this.cam.x = Game.P.x; this.cam.y = Game.P.y;
  },

  // mundo (m) -> tela (px)
  sx(x) { return (x - this.cam.x) * this.k + innerWidth / 2; },
  sy(y) { return (y - this.cam.y) * this.k + innerHeight / 2; },

  draw(dt) {
    this.t += dt;
    const ctx = this.ctx, P = Game.P;
    this.cam.x += (P.x - this.cam.x) * Math.min(1, dt * 6);
    this.cam.y += (P.y - this.cam.y) * Math.min(1, dt * 6);
    this.k = PX * this.cam.zoom;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    let shx = 0, shy = 0;
    if (Game.shake > 0) { shx = (Math.random() - 0.5) * Game.shake * 6; shy = (Math.random() - 0.5) * Game.shake * 6; }
    ctx.translate(shx, shy);

    this.drawGround();
    this.drawRoads();
    this.drawRiver();
    this.drawCity();
    this.drawObstacles();
    // objetos ordenados por y
    const objs = [];
    const vw = innerWidth / this.k / 2 + 6, vh = innerHeight / this.k / 2 + 6;
    for (const n of World.nodes) if (Math.abs(n.x - this.cam.x) < vw && Math.abs(n.y - this.cam.y) < vh) objs.push({ y: n.y, f: () => this.drawNode(n) });
    for (const n of NPCS) if (Math.abs(n.x - this.cam.x) < vw && Math.abs(n.y - this.cam.y) < vh) objs.push({ y: n.y, f: () => this.drawNpc(n) });
    this.decor(vw, vh, objs);
    objs.push({ y: P.y, f: () => this.drawPlayer() });
    objs.sort((a, b) => a.y - b.y).forEach(o => o.f());
    this.drawFx();
    this.drawTarget();
    this.drawFloats();
    this.drawVignette();
    this.drawMinimap();
  },

  // ---------- chão ----------
  biome(tx, ty) {
    const key = tx + ',' + ty;
    let b = this.tileCache.get(key);
    if (!b) { b = World.groundAt(tx * 4 + 2, ty * 4 + 2) || { R: null }; this.tileCache.set(key, b); }
    return b;
  },
  drawGround() {
    const ctx = this.ctx, k = this.k, T = 4;
    const x0 = Math.floor((this.cam.x - innerWidth / 2 / k) / T) - 1, x1 = Math.ceil((this.cam.x + innerWidth / 2 / k) / T) + 1;
    const y0 = Math.floor((this.cam.y - innerHeight / 2 / k) / T) - 1, y1 = Math.ceil((this.cam.y + innerHeight / 2 / k) / T) + 1;
    for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
      const b = this.biome(tx, ty), h = hash2(tx, ty);
      let pal;
      if (b.R) pal = b.R.ground; else { const d = Math.hypot(tx * 4, ty * 4); pal = d < 60 ? ['#5b6b3a', '#64743f', '#536233'] : ['#6c6a45', '#76734c', '#62603e']; }
      const X = Math.floor(this.sx(tx * T)), Y = Math.floor(this.sy(ty * T)), S = Math.ceil(T * k) + 1;
      ctx.fillStyle = pal[0]; ctx.fillRect(X, Y, S, S);
      // variação suave (evita o efeito de xadrez)
      const h2 = hash2(Math.floor(tx / 3), Math.floor(ty / 3));
      ctx.globalAlpha = 0.06 + h * 0.06; ctx.fillStyle = pal[1 + Math.floor(h2 * 2)]; ctx.fillRect(X, Y, S, S); ctx.globalAlpha = 1;
    }
    // textura: manchas e pontos (detalhe semi-realista)
    for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
      const b = this.biome(tx, ty);
      for (let i = 0; i < 4; i++) {
        const h1 = hash2(tx * 7 + i, ty * 13 - i), h2 = hash2(tx * 3 - i, ty * 11 + i * 5);
        const x = this.sx(tx * T + h1 * T), y = this.sy(ty * T + h2 * T);
        const pal = b.R ? b.R.ground : ['#4c5a30', '#6d7c45'];
        ctx.fillStyle = i % 2 ? shade(pal[0], -0.18) : shade(pal[1] || pal[0], 0.1);
        ctx.globalAlpha = 0.55;
        const s = (0.12 + h1 * 0.25) * k;
        if (!b.R || b.R.id === 0) { ctx.fillRect(x, y, Math.max(1, s * 0.3), s * 1.6); } // folhinhas de grama
        else { ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.7, h2 * 3, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.globalAlpha = 1;
  },

  drawRoads() { // estradas de terra da cidade até cada região
    const ctx = this.ctx, k = this.k;
    ctx.lineCap = 'round';
    for (const R of REGIONS) {
      ctx.strokeStyle = 'rgba(120,96,64,0.55)'; ctx.lineWidth = 3.5 * k;
      ctx.beginPath(); ctx.moveTo(this.sx(R.ux * CITY_R), this.sy(R.uy * CITY_R));
      for (let d = CITY_R; d <= R.dMin + 10; d += 6) { const w = Math.sin(d / 23 + R.id) * 2.5; ctx.lineTo(this.sx(R.ux * d + R.vx * w), this.sy(R.uy * d + R.vy * w)); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(150,124,88,0.35)'; ctx.lineWidth = 1.6 * k; ctx.stroke();
      // placa na entrada da região
      const px = R.ux * (CITY_R + 4) + R.vx * 3, py = R.uy * (CITY_R + 4) + R.vy * 3;
      if (Math.abs(px - this.cam.x) < 80 && Math.abs(py - this.cam.y) < 60) this.sign(px, py, `${R.dir} → ${R.name}`, `nível ${(R.era - 1) * 10 + 1}–${R.era * 10}`);
    }
  },
  sign(x, y, t1, t2) {
    const ctx = this.ctx, k = this.k, X = this.sx(x), Y = this.sy(y);
    ctx.fillStyle = '#4a3420'; ctx.fillRect(X - 0.12 * k, Y - 1.2 * k, 0.24 * k, 1.2 * k);
    ctx.font = `600 ${Math.max(9, 0.55 * k)}px Georgia, serif`;
    const w = Math.max(ctx.measureText(t1).width, ctx.measureText(t2).width) + 0.6 * k;
    ctx.fillStyle = '#8a6a44'; ctx.strokeStyle = '#3d2a17'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(X - w / 2, Y - 2.6 * k, w, 1.5 * k, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f5e6c8'; ctx.textAlign = 'center';
    ctx.fillText(t1, X, Y - 2.05 * k);
    ctx.font = `${Math.max(8, 0.42 * k)}px Georgia, serif`; ctx.fillStyle = '#e8d2a8';
    ctx.fillText(t2, X, Y - 1.4 * k);
  },

  drawRiver() { // riacho decorativo atravessando a região Leste
    const R = REGIONS[1], ctx = this.ctx, k = this.k;
    if (Math.abs(this.cam.y) > 260 || this.cam.x < 100) return;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const path = () => { ctx.beginPath(); for (let d = R.dMin - 10; d <= R.dMax + 10; d += 4) { const p = Math.sin(d / 37) * 30 + Math.sin(d / 13) * 6; const x = this.sx(R.ux * d + R.vx * p), y = this.sy(R.uy * d + R.vy * p); d === R.dMin - 10 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } };
    path(); ctx.strokeStyle = '#5c5a48'; ctx.lineWidth = 7 * k; ctx.stroke();
    path(); ctx.strokeStyle = '#2f5d73'; ctx.lineWidth = 5 * k; ctx.stroke();
    path(); ctx.strokeStyle = 'rgba(160,205,225,0.25)'; ctx.lineWidth = 0.35 * k; ctx.setLineDash([1.5 * k, 3 * k]); ctx.lineDashOffset = -this.t * 3 * k; ctx.stroke(); ctx.setLineDash([]);
  },

  drawCity() {
    const ctx = this.ctx, k = this.k, X = this.sx(0), Y = this.sy(0);
    if (Math.hypot(this.cam.x, this.cam.y) > CITY_R + 120) return;
    // praça de pedra
    const g = ctx.createRadialGradient(X, Y, 2 * k, X, Y, CITY_R * k);
    g.addColorStop(0, '#9b8f7d'); g.addColorStop(1, '#7a6f60');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, CITY_R * k, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5c5246'; ctx.lineWidth = 0.5 * k; ctx.stroke();
    // paralelepípedos
    ctx.strokeStyle = 'rgba(60,52,44,0.25)'; ctx.lineWidth = 1;
    for (let r = 2; r < CITY_R; r += 1.5) { ctx.beginPath(); ctx.arc(X, Y, r * k, 0, Math.PI * 2); ctx.stroke(); }
    // casas: reconstruídas conforme a era do martelo
    const era = eraOf(Game.S.hammer), built = Math.min(12, era * 2 + (Game.S.hammer >= 60 ? 2 : 0));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.26;
      if (REGIONS.some(R => Math.abs(Math.atan2(Math.sin(a - R.ang * Math.PI / 180), Math.cos(a - R.ang * Math.PI / 180))) < 0.2)) continue;
      const hx = Math.cos(a) * (CITY_R - 3), hy = Math.sin(a) * (CITY_R - 3);
      this.house(hx, hy, i < built, i);
    }
    // fonte central
    ctx.fillStyle = '#6e6458'; ctx.beginPath(); ctx.arc(X, Y, 2.4 * k, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = Game.S.hammer >= 10 ? '#3d7a95' : '#4a4237'; ctx.beginPath(); ctx.arc(X, Y, 1.9 * k, 0, Math.PI * 2); ctx.fill();
    if (Game.S.hammer >= 10) { ctx.fillStyle = 'rgba(200,235,250,0.5)'; ctx.beginPath(); ctx.arc(X, Y, (0.4 + Math.sin(this.t * 3) * 0.1) * k, 0, Math.PI * 2); ctx.fill(); }
  },
  house(x, y, built, i) {
    const ctx = this.ctx, k = this.k, X = this.sx(x), Y = this.sy(y), w = 3.6 * k, h = 2.8 * k;
    ctx.save(); ctx.translate(X, Y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-w / 2 + 0.3 * k, -h / 2 + 0.3 * k, w, h);
    if (built) {
      ctx.fillStyle = ['#b8a58a', '#c9b79a', '#a8957a'][i % 3]; ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.fillStyle = ['#8f3b2a', '#7a3424', '#9a4a30'][i % 3];
      ctx.beginPath(); ctx.moveTo(-w / 2 - 0.3 * k, -h / 2 + 0.6 * k); ctx.lineTo(0, -h / 2 - 0.8 * k); ctx.lineTo(w / 2 + 0.3 * k, -h / 2 + 0.6 * k); ctx.lineTo(w / 2 + 0.3 * k, -h / 2 + 1.4 * k); ctx.lineTo(-w / 2 - 0.3 * k, -h / 2 + 1.4 * k); ctx.fill();
      ctx.fillStyle = '#ffd98a'; ctx.globalAlpha = 0.7 + Math.sin(this.t + i) * 0.1; ctx.fillRect(-0.9 * k, 0.2 * k, 0.6 * k, 0.6 * k); ctx.fillRect(0.3 * k, 0.2 * k, 0.6 * k, 0.6 * k); ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#6d6356'; ctx.fillRect(-w / 2, -h / 2 + 0.8 * k, w * 0.45, h - 0.8 * k);
      ctx.fillRect(w * 0.1, 0, w * 0.4, h / 2);
      ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = 0.2 * k; ctx.beginPath(); ctx.moveTo(-w / 2, -h / 2); ctx.lineTo(w / 3, h / 3); ctx.stroke();
    }
    ctx.restore();
  },

  decor(vw, vh, objs) { // árvores e detalhes em volta das regiões
    const T = 6;
    const x0 = Math.floor((this.cam.x - vw) / T), x1 = Math.ceil((this.cam.x + vw) / T);
    const y0 = Math.floor((this.cam.y - vh) / T), y1 = Math.ceil((this.cam.y + vh) / T);
    for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
      const h = hash2(tx * 31, ty * 17);
      if (h > 0.18) continue;
      const x = tx * T + hash2(tx, ty * 3) * T, y = ty * T + hash2(tx * 5, ty) * T;
      if (Math.hypot(x, y) < CITY_R + 4) continue;
      const g = World.groundAt(x, y);
      if (g && g.edge === 1) { if (h < 0.05 && g.R.id !== 0) objs.push({ y, f: () => this.pebble(x, y, g.R, h) }); continue; }
      const nearRoad = REGIONS.some(R => { const l = World.local(R, x, y); return l.d > 0 && l.d < R.dMin + 12 && Math.abs(l.p) < 5; });
      if (nearRoad) continue;
      if (!g || g.R.id === 0) objs.push({ y, f: () => this.tree(x, y, h) });
      else if (h < 0.08) objs.push({ y, f: () => this.pebble(x, y, g.R, h) });
    }
  },
  tree(x, y, h) {
    const ctx = this.ctx, k = this.k, X = this.sx(x), Y = this.sy(y), r = (1.8 + h * 8) * k;
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(X + r * 0.3, Y + r * 0.2, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a3420'; ctx.fillRect(X - 0.25 * k, Y - r * 0.5, 0.5 * k, r * 0.5);
    const g = ctx.createRadialGradient(X - r * 0.3, Y - r * 1.1, r * 0.1, X, Y - r * 0.8, r);
    g.addColorStop(0, '#6f8f3e'); g.addColorStop(1, '#2f4a1e');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y - r * 0.8, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(160,190,90,0.25)'; ctx.beginPath(); ctx.arc(X - r * 0.35, Y - r * 1.1, r * 0.4, 0, Math.PI * 2); ctx.fill();
  },
  pebble(x, y, R, h) {
    const ctx = this.ctx, k = this.k, X = this.sx(x), Y = this.sy(y), r = (0.3 + h * 6) * k;
    ctx.fillStyle = shade(R.ground[2], -0.25); ctx.beginPath(); ctx.ellipse(X, Y, r, r * 0.7, h * 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(R.ground[1], 0.15); ctx.beginPath(); ctx.ellipse(X - r * 0.2, Y - r * 0.2, r * 0.5, r * 0.3, h * 9, 0, Math.PI * 2); ctx.fill();
  },

  // ---------- obstáculos (atalhos de pulo) ----------
  drawObstacles() {
    const ctx = this.ctx, k = this.k;
    for (const o of World.obstacles) {
      const cx = o.R.ux * o.dc, cy = o.R.uy * o.dc;
      if (Math.hypot(cx - this.cam.x, cy - this.cam.y) > o.len / 2 + Math.hypot(innerWidth, innerHeight) / k) continue;
      ctx.save(); ctx.translate(this.sx(cx), this.sy(cy)); ctx.rotate(Math.atan2(o.R.uy, o.R.ux));
      const w = o.t * k, L = o.len * k, hh = Math.min(3, o.h) * k * 0.5;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-w / 2 + hh, -L / 2 + hh * 0.5, w, L);
      const styles = {
        tronco: ['#6b4a2e', '#8a6440'], pedra: ['#6e6c66', '#8f8c85'], muro: ['#8f5a3e', '#b07656'],
        trilho: ['#4a3a2c', '#6b5a48'], bancada: ['#7a7873', '#a3a19b'], penhasco: ['#2e2a3a', '#4a4560'],
      }[o.type];
      const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, styles[1]); g.addColorStop(1, styles[0]);
      ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-w / 2, -L / 2, w, L, o.type === 'tronco' ? w / 2 : 3); ctx.fill();
      ctx.strokeStyle = shade(styles[0], -0.35); ctx.lineWidth = 1.5;
      if (o.type === 'muro') for (let yy = -L / 2; yy < L / 2; yy += 0.5 * k) { ctx.beginPath(); ctx.moveTo(-w / 2, yy); ctx.lineTo(w / 2, yy); ctx.stroke(); }
      else if (o.type === 'trilho') { ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 0.15 * k; ctx.beginPath(); ctx.moveTo(-w / 4, -L / 2); ctx.lineTo(-w / 4, L / 2); ctx.moveTo(w / 4, -L / 2); ctx.lineTo(w / 4, L / 2); ctx.stroke(); }
      else for (let yy = -L / 2 + 1.5 * k; yy < L / 2; yy += 3.1 * k) { ctx.beginPath(); ctx.moveTo(-w / 2, yy); ctx.lineTo(w / 2, yy + 0.4 * k); ctx.stroke(); }
      ctx.rotate(-Math.atan2(o.R.uy, o.R.ux));
      ctx.restore();
      // aviso de altura quando perto
      const d = Math.hypot(cx - Game.P.x, cy - Game.P.y);
      if (d < o.len / 2 + 15) {
        const ok = Game.jumpH() >= o.h;
        const txt = `${ok ? '⤒ Dá para pular' : '✕ Pulo insuficiente'} · ${o.h.toFixed(1).replace('.', ',')} m`;
        const l = World.local(o.R, Game.P.x, Game.P.y);
        const pp = Math.max(-o.len / 2 + 2, Math.min(o.len / 2 - 2, l.p));
        const lx = o.R.ux * (o.dc) + o.R.vx * pp, ly = o.R.uy * (o.dc) + o.R.vy * pp;
        ctx.font = `600 ${Math.max(10, 0.5 * k)}px system-ui, sans-serif`; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; const tw = ctx.measureText(txt).width + 12;
        ctx.fillRect(this.sx(lx) - tw / 2, this.sy(ly) - 2.4 * k - 14, tw, 18);
        ctx.fillStyle = ok ? '#9fe08a' : '#ff8a7a'; ctx.fillText(txt, this.sx(lx), this.sy(ly) - 2.4 * k);
      }
    }
  },

  // ---------- nós de recurso ----------
  drawNode(n) {
    const ctx = this.ctx, k = this.k, r = n.r * k;
    let X = this.sx(n.x), Y = this.sy(n.y);
    if (n.hitT > 0) { X += (Math.random() - 0.5) * 0.25 * k; Y += (Math.random() - 0.5) * 0.25 * k; }
    const res = n.res, dmg = 1 - n.hp / n.maxHp;
    // aura de raro
    if (n.rare > 1) {
      const a = ctx.createRadialGradient(X, Y, r * 0.5, X, Y, r * 2.2);
      a.addColorStop(0, n.rare === 10 ? 'rgba(140,240,255,0.55)' : 'rgba(255,220,100,0.45)'); a.addColorStop(1, 'rgba(255,220,100,0)');
      ctx.fillStyle = a; ctx.beginPath(); ctx.arc(X, Y, r * 2.2, 0, Math.PI * 2); ctx.fill();
    }
    if (World.veio && World.veio.res === res.id) { ctx.strokeStyle = 'rgba(255,200,80,' + (0.4 + Math.sin(this.t * 5) * 0.3) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X, Y, r * 1.4, 0, Math.PI * 2); ctx.stroke(); }
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(X + r * 0.15, Y + r * 0.35, r * 1.05, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    const rnd = rng(Math.floor(n.seed * 1000));
    const kind = res.kind;
    if (kind === 'nut') {
      ctx.fillStyle = '#2f4a1e'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(X + (rnd() - 0.5) * r * 1.2, Y - r * 0.3 + (rnd() - 0.5) * r * 0.8, r * 0.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#4d7030'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(X + (rnd() - 0.5) * r, Y - r * 0.5 + (rnd() - 0.5) * r * 0.6, r * 0.35, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = res.c; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(X + (rnd() - 0.5) * r * 1.2, Y - r * 0.3 + (rnd() - 0.5) * r * 0.8, r * 0.13, r * 0.1, 0, 0, Math.PI * 2); ctx.fill(); }
    } else if (kind === 'stick') {
      ctx.lineCap = 'round';
      for (let i = 0; i < 7; i++) { const a = rnd() * Math.PI; ctx.strokeStyle = i % 2 ? res.c : res.c2; ctx.lineWidth = r * 0.16; ctx.beginPath(); ctx.moveTo(X - Math.cos(a) * r, Y - r * 0.2 - Math.sin(a) * r * 0.4); ctx.lineTo(X + Math.cos(a) * r, Y - r * 0.2 + Math.sin(a) * r * 0.4); ctx.stroke(); }
    } else if (kind === 'log') {
      ctx.fillStyle = res.c; ctx.beginPath(); ctx.roundRect(X - r, Y - r * 0.7, r * 1.6, r * 0.9, r * 0.45); ctx.fill();
      ctx.fillStyle = res.c2; ctx.beginPath(); ctx.ellipse(X + r * 0.6, Y - r * 0.25, r * 0.38, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = shade(res.c, -0.2); ctx.lineWidth = 1; for (let i = 1; i < 3; i++) { ctx.beginPath(); ctx.ellipse(X + r * 0.6, Y - r * 0.25, r * 0.12 * i, r * 0.14 * i, 0, 0, Math.PI * 2); ctx.stroke(); }
    } else if (kind === 'clay') {
      const g = ctx.createRadialGradient(X - r * 0.3, Y - r * 0.5, r * 0.1, X, Y - r * 0.2, r * 1.1); g.addColorStop(0, res.c2); g.addColorStop(1, res.c);
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(X, Y - r * 0.15, r * 1.05, r * 0.65, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(X - r * 0.3, Y - r * 0.4, r * 0.35, r * 0.15, -0.3, 0, Math.PI * 2); ctx.fill();
    } else {
      // pedra irregular (rock, ore, crystal, scrap, meteor)
      const base = kind === 'rock' ? res.c : kind === 'scrap' ? '#5a4a3e' : kind === 'meteor' ? res.c : '#5d5852';
      const hi = kind === 'rock' ? res.c2 : kind === 'meteor' ? '#5a5054' : '#8a837a';
      const pts = []; const N = 9;
      for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2; const rr = r * (0.75 + rnd() * 0.35); pts.push([X + Math.cos(a) * rr, Y - r * 0.25 + Math.sin(a) * rr * 0.72]); }
      const g = ctx.createRadialGradient(X - r * 0.35, Y - r * 0.6, r * 0.1, X, Y - r * 0.2, r * 1.2); g.addColorStop(0, hi); g.addColorStop(1, shade(base, -0.15));
      ctx.fillStyle = g; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = shade(base, -0.4); ctx.lineWidth = 1; ctx.stroke();
      // faceta de luz
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.moveTo(pts[5][0], pts[5][1]); ctx.lineTo(pts[6][0], pts[6][1]); ctx.lineTo(X, Y - r * 0.3); ctx.closePath(); ctx.fill();
      if (kind === 'ore') { for (let i = 0; i < 7; i++) { ctx.fillStyle = i % 2 ? res.c2 : res.c; ctx.beginPath(); ctx.ellipse(X + (rnd() - 0.5) * r * 1.2, Y - r * 0.25 + (rnd() - 0.5) * r * 0.8, r * (0.08 + rnd() * 0.12), r * 0.07, rnd() * 3, 0, Math.PI * 2); ctx.fill(); } }
      if (kind === 'scrap') { ctx.strokeStyle = '#9a9690'; ctx.lineWidth = Math.max(1, r * 0.06); for (let i = 0; i < 6; i++) { const x1 = X + (rnd() - 0.5) * r * 1.3, y1 = Y - r * 0.25 + (rnd() - 0.5) * r * 0.8; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + r * 0.3, y1 - r * 0.1); ctx.stroke(); } ctx.fillStyle = res.c2; for (let i = 0; i < 4; i++) ctx.fillRect(X + (rnd() - 0.5) * r, Y - r * 0.4 + (rnd() - 0.5) * r * 0.6, r * 0.35, r * 0.18); }
      if (kind === 'crystal') {
        for (let i = 0; i < 5; i++) {
          const bx = X + (rnd() - 0.5) * r * 1.1, by = Y - r * 0.2 + (rnd() - 0.4) * r * 0.5, hgt = r * (0.6 + rnd() * 0.8), wd = r * (0.15 + rnd() * 0.12), tilt = (rnd() - 0.5) * 0.6;
          ctx.save(); ctx.translate(bx, by); ctx.rotate(tilt);
          const cg = ctx.createLinearGradient(-wd, 0, wd, 0); cg.addColorStop(0, res.c2); cg.addColorStop(1, res.c);
          ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(-wd, 0); ctx.lineTo(-wd, -hgt * 0.7); ctx.lineTo(0, -hgt); ctx.lineTo(wd, -hgt * 0.7); ctx.lineTo(wd, 0); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-wd * 0.6, -hgt * 0.65, wd * 0.35, hgt * 0.55);
          ctx.restore();
        }
      }
      if (kind === 'meteor') { ctx.strokeStyle = res.c2; ctx.shadowColor = res.c2; ctx.shadowBlur = 8; ctx.lineWidth = Math.max(1.5, r * 0.07); for (let i = 0; i < 4; i++) { ctx.beginPath(); let px = X + (rnd() - 0.5) * r, py = Y - r * 0.3 + (rnd() - 0.5) * r * 0.6; ctx.moveTo(px, py); for (let j = 0; j < 3; j++) { px += (rnd() - 0.5) * r * 0.5; py += (rnd() - 0.5) * r * 0.4; ctx.lineTo(px, py); } ctx.stroke(); } ctx.shadowBlur = 0; }
    }
    // rachaduras conforme o dano
    if (dmg > 0.02) {
      ctx.strokeStyle = 'rgba(20,15,10,0.7)'; ctx.lineWidth = Math.max(1, r * 0.05);
      const cr = rng(Math.floor(n.seed * 77));
      const cracks = Math.ceil(dmg * 5);
      for (let i = 0; i < cracks; i++) { let px = X + (cr() - 0.5) * r * 0.6, py = Y - r * 0.3 + (cr() - 0.5) * r * 0.4; ctx.beginPath(); ctx.moveTo(px, py); for (let j = 0; j < 3; j++) { px += (cr() - 0.5) * r * 0.6 * dmg; py += (cr() - 0.5) * r * 0.5 * dmg; ctx.lineTo(px, py); } ctx.stroke(); }
    }
    // brilho de raro
    if (n.rare > 1) { for (let i = 0; i < 3; i++) { const a = this.t * 2 + i * 2.1 + n.seed; const sx = X + Math.cos(a) * r * 0.9, sy = Y - r * 0.4 + Math.sin(a * 1.3) * r * 0.5; this.sparkle(sx, sy, r * 0.25 * (0.6 + Math.sin(this.t * 6 + i) * 0.4), n.rare === 10 ? '#bff6ff' : '#fff2b0'); } }
  },
  sparkle(x, y, s, c) {
    const ctx = this.ctx; ctx.fillStyle = c; ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.25, y - s * 0.25); ctx.lineTo(x + s, y); ctx.lineTo(x + s * 0.25, y + s * 0.25); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.25, y + s * 0.25); ctx.lineTo(x - s, y); ctx.lineTo(x - s * 0.25, y - s * 0.25); ctx.fill();
  },

  drawTarget() {
    const n = Game.target; if (!n || UI.open) return;
    const ctx = this.ctx, k = this.k, X = this.sx(n.x), Y = this.sy(n.y), r = n.r * k;
    const hits = Math.ceil(n.hp / Game.force()), time = hits * Game.interval();
    const col = time <= 10 ? '#7fd36a' : time <= 60 ? '#ffd34d' : '#ff6a5a';
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -this.t * 20;
    ctx.beginPath(); ctx.ellipse(X, Y - r * 0.2, r * 1.3, r * 0.95, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    // barra
    const bw = Math.max(70, r * 2.4), by = Y - r * 1.6 - 18;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.beginPath(); ctx.roundRect(X - bw / 2 - 6, by - 18, bw + 12, 34, 6); ctx.fill();
    ctx.fillStyle = '#333'; ctx.fillRect(X - bw / 2, by + 6, bw, 6);
    ctx.fillStyle = col; ctx.fillRect(X - bw / 2, by + 6, bw * Math.max(0, n.hp / n.maxHp), 6);
    ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.fillText(`${n.res.name}${n.size === 2 ? ' (grande)' : n.size === 0.5 ? ' (pequena)' : ''}`, X, by - 4);
    ctx.fillStyle = col; ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(`${fmt(hits)} golpes · ${fmtTime(time)}`, X, by + 26);
  },

  // ---------- NPCs ----------
  drawNpc(n) {
    const ctx = this.ctx, k = this.k, X = this.sx(n.x), Y = this.sy(n.y);
    // barraca
    const bw = 5 * k, bh = 3 * k, era = eraOf(Game.S.hammer);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(X - bw / 2 + 4, Y - bh - 1.2 * k + 4, bw, bh);
    ctx.fillStyle = era >= 4 ? '#6a6e74' : era >= 2 ? '#8a6a48' : '#6b5238'; ctx.fillRect(X - bw / 2, Y - bh - 1.2 * k, bw, bh);
    ctx.fillStyle = n.color; ctx.beginPath(); ctx.moveTo(X - bw / 2 - 0.4 * k, Y - bh - 1.2 * k); ctx.lineTo(X + bw / 2 + 0.4 * k, Y - bh - 1.2 * k); ctx.lineTo(X + bw / 2, Y - bh - 2.4 * k); ctx.lineTo(X - bw / 2, Y - bh - 2.4 * k); ctx.fill();
    for (let i = 0; i < 5; i++) { ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.1)'; ctx.fillRect(X - bw / 2 + i * bw / 5, Y - bh - 1.25 * k, bw / 5, 0.5 * k); }
    // ícone da barraca
    ctx.font = `${1.4 * k}px serif`; ctx.textAlign = 'center';
    ctx.fillText({ ferreiro: '⚒', tropeira: '🎒', botica: '⚗', armazem: '⚖' }[n.id], X, Y - bh * 0.35 - 1.2 * k);
    // pessoa
    this.person(X, Y, { shirt: n.color, skin: n.id === 'tropeira' ? '#a8754f' : n.id === 'botica' ? '#e0b48c' : '#c48c62', hair: n.id === 'ferreiro' ? '#d8d8d8' : '#3a2a1c', npc: true });
    // nome
    const near = Game.npcNear() === n;
    ctx.font = `600 ${Math.max(10, 0.5 * k)}px system-ui, sans-serif`;
    ctx.fillStyle = near ? '#ffe9a8' : 'rgba(255,255,255,0.85)'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
    const nm = n.name.split(',')[0];
    ctx.strokeText(nm, X, Y + 1.4 * k); ctx.fillText(nm, X, Y + 1.4 * k);
  },
  person(X, Y, o) {
    const ctx = this.ctx, k = this.k;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(X, Y + 0.1 * k, 0.6 * k, 0.28 * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a3a40'; ctx.fillRect(X - 0.32 * k, Y - 0.6 * k, 0.26 * k, 0.6 * k); ctx.fillRect(X + 0.06 * k, Y - 0.6 * k, 0.26 * k, 0.6 * k);
    ctx.fillStyle = o.shirt; ctx.beginPath(); ctx.roundRect(X - 0.45 * k, Y - 1.45 * k, 0.9 * k, 0.95 * k, 0.25 * k); ctx.fill();
    ctx.fillStyle = o.skin; ctx.beginPath(); ctx.arc(X, Y - 1.75 * k, 0.32 * k, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = o.hair; ctx.beginPath(); ctx.arc(X, Y - 1.85 * k, 0.32 * k, Math.PI, Math.PI * 2); ctx.fill();
  },

  // ---------- personagem do jogador (muda com cada evolução) ----------
  gear() {
    const A = Game.S.attrs;
    const tint = (base, lvl) => shade(base, ((lvl - 1) % 10) * 0.025); // detalhe que muda a cada nível
    const bagE = eraOf(A.bag), mineE = eraOf(A.mine), moveE = eraOf(A.move), jumpE = eraOf(A.jump);
    return {
      bag: { era: bagE, size: 0.42 + A.bag * 0.0125, col: tint(['#d8c9a8', '#7a5232', '#8a8458', '#b89a5e', '#d0702a', '#3a3f48'][bagE - 1], A.bag), strap: ['#a89878', '#4a3020', '#5a5638', '#7a5e30', '#5a5f66', '#22262c'][bagE - 1], lvl: A.bag },
      glove: { era: mineE, col: tint(['#d7a07a', '#7a4f2e', '#4f3320', '#8a9098', '#c9a020', '#2a3a48'][mineE - 1], A.mine), lvl: A.mine },
      boot: { era: moveE, col: tint(['#c99472', '#c8b08a', '#6b4428', '#33302c', '#a8adb4', '#2a2f3a'][moveE - 1], A.move), sole: ['#c99472', '#8a7458', '#3a2414', '#e0702a', '#55606a', '#40d0ff'][moveE - 1], lvl: A.move },
      leg: { era: jumpE, col: tint(['#4a4a52', '#7a5232', '#5a5a64', '#9aa0a8', '#c9a020', '#40d0ff'][jumpE - 1], A.jump), lvl: A.jump },
    };
  },

  drawPlayer() {
    const ctx = this.ctx, k = this.k, P = Game.P, gear = this.gear();
    const X = this.sx(P.x), Yg = this.sy(P.y), Y = Yg - P.z * k;
    const faceR = Math.cos(P.face) >= 0 ? 1 : -1; // vira para a esquerda/direita
    const facingUp = Math.sin(P.face) < -0.5;
    // sombra no chão (diminui com a altura)
    const sh = 1 / (1 + P.z * 0.35);
    ctx.fillStyle = `rgba(0,0,0,${0.35 * sh})`; ctx.beginPath(); ctx.ellipse(X, Yg + 0.1 * k, 0.75 * k * sh, 0.32 * k * sh, 0, 0, Math.PI * 2); ctx.fill();
    // aura do elixir
    const act = id => Game.S.active.find(a => a.id === id);
    if (act('elixir')) { const a = ctx.createRadialGradient(X, Y - k, 0.2 * k, X, Y - k, 2.4 * k); a.addColorStop(0, 'rgba(255,215,90,0.45)'); a.addColorStop(1, 'rgba(255,215,90,0)'); ctx.fillStyle = a; ctx.beginPath(); ctx.arc(X, Y - k, 2.4 * k, 0, Math.PI * 2); ctx.fill(); }
    // rastro do café
    if (act('cafe') && (P.moving || P.swing > 0)) { for (let i = 0; i < 3; i++) { ctx.strokeStyle = `rgba(80,160,255,${0.35 - i * 0.1})`; ctx.lineWidth = 0.15 * k; ctx.beginPath(); ctx.arc(X, Y - k, (1 + i * 0.3) * k, P.face + Math.PI - 0.6, P.face + Math.PI + 0.6); ctx.stroke(); } }

    const walk = P.moving ? Math.sin(P.walkT * 3.2) : 0;
    const bagBehind = !facingUp;
    if (bagBehind) this.drawBag(X, Y, gear, faceR, facingUp);
    // pernas
    for (const s of [-1, 1]) {
      const lx = X + s * 0.18 * k, off = walk * s * 0.18 * k, top = Y - 0.7 * k;
      ctx.fillStyle = '#3d4250'; ctx.fillRect(lx - 0.13 * k, top, 0.26 * k, 0.55 * k + off * 0.3);
      // joelheira / molas (pulo)
      const L = gear.leg;
      if (L.era >= 2) {
        ctx.fillStyle = L.col;
        if (L.era <= 3) { ctx.beginPath(); ctx.roundRect(lx - 0.15 * k, top + 0.15 * k, 0.3 * k, 0.22 * k, 0.06 * k); ctx.fill(); }
        else { ctx.strokeStyle = L.col; ctx.lineWidth = 0.06 * k; ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(lx - 0.15 * k, top + (0.1 + i * 0.1) * k); ctx.lineTo(lx + 0.15 * k, top + (0.15 + i * 0.1) * k); } ctx.stroke(); if (L.era === 6) { ctx.shadowColor = L.col; ctx.shadowBlur = 8; ctx.fillRect(lx - 0.15 * k, top + 0.05 * k, 0.3 * k, 0.06 * k); ctx.shadowBlur = 0; } }
      }
      // calçado (movimento)
      const B = gear.boot, by = Y - 0.15 * k + off * 0.3;
      ctx.fillStyle = B.col; ctx.beginPath(); ctx.roundRect(lx - 0.16 * k + faceR * 0.04 * k, by - (B.era >= 3 ? 0.18 : 0.06) * k, 0.34 * k, (B.era >= 3 ? 0.28 : 0.16) * k, 0.07 * k); ctx.fill();
      ctx.fillStyle = B.sole; ctx.fillRect(lx - 0.16 * k + faceR * 0.04 * k, by + 0.06 * k, 0.34 * k, 0.05 * k);
      if (B.era === 5) { ctx.strokeStyle = '#d8dde2'; ctx.lineWidth = 0.04 * k; ctx.beginPath(); ctx.moveTo(lx - 0.1 * k, by + 0.12 * k); ctx.lineTo(lx, by + 0.18 * k); ctx.lineTo(lx + 0.1 * k, by + 0.12 * k); ctx.stroke(); }
      if (B.era === 6 && (P.moving || P.z > 0)) { ctx.fillStyle = `rgba(80,200,255,${0.5 + Math.random() * 0.4})`; ctx.beginPath(); ctx.moveTo(lx - 0.1 * k, by + 0.12 * k); ctx.lineTo(lx + 0.1 * k, by + 0.12 * k); ctx.lineTo(lx, by + (0.4 + Math.random() * 0.3) * k); ctx.fill(); }
    }
    // tronco
    const tg = ctx.createLinearGradient(X - 0.5 * k, 0, X + 0.5 * k, 0); tg.addColorStop(0, '#3e6b8a'); tg.addColorStop(1, '#2c4f68');
    ctx.fillStyle = tg; ctx.beginPath(); ctx.roundRect(X - 0.48 * k, Y - 1.55 * k, 0.96 * k, 0.95 * k, 0.28 * k); ctx.fill();
    ctx.fillStyle = '#5a3d24'; ctx.fillRect(X - 0.48 * k, Y - 0.78 * k, 0.96 * k, 0.12 * k); // cinto
    // alças da mochila
    ctx.strokeStyle = gear.bag.strap; ctx.lineWidth = 0.1 * k; ctx.beginPath(); ctx.moveTo(X - 0.3 * k, Y - 1.5 * k); ctx.lineTo(X - 0.25 * k, Y - 0.8 * k); ctx.moveTo(X + 0.3 * k, Y - 1.5 * k); ctx.lineTo(X + 0.25 * k, Y - 0.8 * k); ctx.stroke();
    // cabeça
    ctx.fillStyle = '#d4a17a'; ctx.beginPath(); ctx.arc(X, Y - 1.88 * k, 0.34 * k, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a2e1a'; ctx.beginPath(); ctx.arc(X, Y - 1.98 * k, 0.35 * k, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    if (!facingUp) { ctx.fillStyle = '#2a1a10'; ctx.fillRect(X + faceR * 0.12 * k - 0.04 * k, Y - 1.9 * k, 0.07 * k, 0.07 * k); ctx.fillRect(X + faceR * 0.12 * k - 0.04 * k - faceR * 0.18 * k, Y - 1.9 * k, 0.07 * k, 0.07 * k); }
    if (!bagBehind) this.drawBag(X, Y, gear, faceR, facingUp);
    // braço + martelo
    this.drawHammerArm(X, Y, gear);
    // frascos de power-up pendurados
    let fi = 0;
    for (const p of Game.S.pw.slice(0, 6)) {
      ctx.fillStyle = POWERUPS[p.id].color;
      const fx = X - faceR * (0.55 + gear.bag.size * 0.6) * k + (fi % 3 - 1) * 0.16 * k, fy = Y - 0.95 * k + Math.floor(fi / 3) * 0.24 * k;
      ctx.beginPath(); ctx.arc(fx, fy, 0.09 * k, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ddd'; ctx.fillRect(fx - 0.03 * k, fy - 0.15 * k, 0.06 * k, 0.07 * k);
      fi++;
    }
  },

  drawBag(X, Y, gear, faceR, facingUp) {
    const ctx = this.ctx, k = this.k, B = gear.bag, s = B.size * k;
    const bx = X - (facingUp ? 0 : faceR * 0.35 * k), by = Y - 1.15 * k - (s - 0.42 * k) * 0.7;
    ctx.save(); ctx.translate(bx, by);
    const g = ctx.createLinearGradient(-s, -s, s, s); g.addColorStop(0, shade(B.col, 0.12)); g.addColorStop(1, shade(B.col, -0.2));
    ctx.fillStyle = g; ctx.strokeStyle = shade(B.col, -0.45); ctx.lineWidth = 1.5;
    if (B.era === 1) { ctx.beginPath(); ctx.ellipse(0, 0, s * 0.9, s * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.strokeStyle = B.strap; ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.8); ctx.lineTo(s * 0.1, -s * 1.05); ctx.lineTo(s * 0.3, -s * 0.75); ctx.stroke(); }
    else if (B.era === 2) { ctx.beginPath(); ctx.roundRect(-s * 0.8, -s * 0.7, s * 1.6, s * 1.4, s * 0.5); ctx.fill(); ctx.stroke(); ctx.fillStyle = shade(B.col, -0.25); ctx.beginPath(); ctx.roundRect(-s * 0.8, -s * 0.7, s * 1.6, s * 0.5, s * 0.3); ctx.fill(); }
    else if (B.era === 3) { ctx.beginPath(); ctx.roundRect(-s * 0.75, -s, s * 1.5, s * 2, s * 0.3); ctx.fill(); ctx.stroke(); ctx.fillStyle = shade(B.col, -0.18); ctx.fillRect(-s * 0.5, s * 0.15, s, s * 0.6); ctx.fillStyle = B.strap; ctx.fillRect(-s * 0.4, -s * 0.85, s * 0.12, s * 1.7); ctx.fillRect(s * 0.28, -s * 0.85, s * 0.12, s * 1.7); }
    else if (B.era === 4) { ctx.beginPath(); ctx.moveTo(-s * 0.85, -s); ctx.lineTo(s * 0.85, -s); ctx.lineTo(s * 0.6, s); ctx.lineTo(-s * 0.6, s); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.strokeStyle = shade(B.col, -0.3); ctx.lineWidth = 1; for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * s * 0.2, -s); ctx.lineTo(i * s * 0.15, s); ctx.stroke(); } for (let j = -3; j <= 3; j++) { ctx.beginPath(); ctx.moveTo(-s * 0.8, j * s * 0.28); ctx.lineTo(s * 0.8, j * s * 0.28); ctx.stroke(); } }
    else if (B.era === 5) { ctx.strokeStyle = '#8a9098'; ctx.lineWidth = 0.08 * k; ctx.strokeRect(-s * 0.85, -s * 1.15, s * 1.7, s * 2.25); ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-s * 0.75, -s * 1.05, s * 1.5, s * 2.05, s * 0.2); ctx.fill(); ctx.fillStyle = shade(B.col, -0.25); ctx.fillRect(-s * 0.6, -s * 0.2, s * 1.2, s * 0.45); ctx.fillStyle = '#3a3a3a'; ctx.beginPath(); ctx.ellipse(0, -s * 1.15, s * 0.8, s * 0.2, 0, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.beginPath(); ctx.roundRect(-s * 0.8, -s * 1.1, s * 1.6, s * 2.2, s * 0.25); ctx.fill(); ctx.stroke(); for (let i = 0; i < 3; i++) { ctx.fillStyle = '#2a2f36'; ctx.fillRect(-s * 0.6, -s * 0.8 + i * s * 0.6, s * 1.2, s * 0.42); ctx.fillStyle = `rgba(80,200,255,${0.6 + Math.sin(this.t * 3 + i) * 0.3})`; ctx.fillRect(-s * 0.5, -s * 0.62 + i * s * 0.6, s * 0.18, s * 0.08); } }
    // detalhe por nível (rebites)
    ctx.fillStyle = 'rgba(255,240,200,0.6)';
    for (let i = 0; i < (B.lvl - 1) % 10; i++) { ctx.beginPath(); ctx.arc(-s * 0.55 + (i % 5) * s * 0.27, s * 0.55 + Math.floor(i / 5) * s * 0.16, Math.max(1, s * 0.035), 0, Math.PI * 2); ctx.fill(); }
    // carga visível quando cheia
    const fill = Game.used() / Game.capacity();
    if (fill > 0.05) { const ids = Object.keys(Game.S.bag); ctx.fillStyle = ids.length ? RES[ids[0]].c2 : '#888'; for (let i = 0; i < Math.ceil(fill * 5); i++) { ctx.beginPath(); ctx.arc(-s * 0.4 + i * s * 0.2, -s * (B.era >= 3 ? 1.05 : 0.75) - (i % 2) * s * 0.08, s * 0.14, 0, Math.PI * 2); ctx.fill(); } }
    ctx.restore();
  },

  drawHammerArm(X, Y, gear) {
    const ctx = this.ctx, k = this.k, P = Game.P, L = Game.S.hammer, look = hammerLook(L);
    const s = P.swing;
    const swingA = s < 0.7 ? -1.5 * (s / 0.7) : -1.5 + 1.9 * ((s - 0.7) / 0.3);
    const fr = Math.cos(P.face) >= 0 ? 1 : -1;
    const strike = P.face + fr * swingA;
    const rest = -Math.PI / 2 + fr * 0.55; // martelo apoiado no ombro quando parado
    const blend = Math.min(1, s * 3);
    const ang = rest + Math.atan2(Math.sin(strike - rest), Math.cos(strike - rest)) * blend;
    const sx = X + Math.cos(P.face) * 0.35 * k, sy = Y - 1.25 * k;
    const hand = { x: sx + Math.cos(ang) * 0.55 * k, y: sy + Math.sin(ang) * 0.55 * k * 0.7 };
    // braço
    ctx.strokeStyle = '#3e6b8a'; ctx.lineWidth = 0.22 * k; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hand.x, hand.y); ctx.stroke();
    // martelo: cresce a cada nível
    const len = (0.7 + L * 0.035) * k, headW = (0.22 + L * 0.012) * k, headL = (0.35 + L * 0.022) * k;
    const ex = hand.x + Math.cos(ang) * len, ey = hand.y + Math.sin(ang) * len * 0.7;
    ctx.strokeStyle = look.handle; ctx.lineWidth = Math.max(2, (0.08 + L * 0.002) * k);
    if (look.type === 'machine') { ctx.strokeStyle = '#222'; ctx.lineWidth = 0.08 * k; ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.quadraticCurveTo(X - Math.cos(P.face) * k, Y - 0.5 * k, X - Math.cos(P.face) * 0.5 * k, Y - 1.2 * k); ctx.stroke(); ctx.lineWidth = Math.max(2, 0.14 * k); ctx.strokeStyle = look.handle; }
    ctx.beginPath(); ctx.moveTo(hand.x, hand.y); ctx.lineTo(ex, ey); ctx.stroke();
    // cabeça do martelo
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(Math.atan2(Math.sin(ang) * 0.7, Math.cos(ang)));
    if (look.glow) { ctx.shadowColor = look.glow; ctx.shadowBlur = 6 + Math.sin(this.t * 4) * 4; }
    const hg = ctx.createLinearGradient(0, -headL / 2, 0, headL / 2); hg.addColorStop(0, look.head2); hg.addColorStop(1, look.head);
    ctx.fillStyle = hg;
    if (look.type === 'wood' && L <= 3) { ctx.beginPath(); ctx.ellipse(0, 0, headW * 0.8, headW * 0.6, 0, 0, Math.PI * 2); ctx.fill(); }
    else if (look.type === 'stone') { ctx.beginPath(); ctx.ellipse(0, 0, headW, headL / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#5a3a20'; ctx.lineWidth = Math.max(1, headW * 0.25); ctx.beginPath(); ctx.moveTo(-headW * 0.9, -headL * 0.1); ctx.lineTo(headW * 0.9, headL * 0.1); ctx.stroke(); }
    else if (look.type === 'crystal') { ctx.beginPath(); ctx.moveTo(-headW, -headL * 0.35); ctx.lineTo(0, -headL * 0.6); ctx.lineTo(headW, -headL * 0.35); ctx.lineTo(headW, headL * 0.35); ctx.lineTo(0, headL * 0.6); ctx.lineTo(-headW, headL * 0.35); ctx.closePath(); ctx.fill(); }
    else if (look.type === 'meteor') { ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, rr = (i % 2 ? 0.85 : 1) * headL / 2; ctx.lineTo(Math.cos(a) * rr * 0.9, Math.sin(a) * rr); } ctx.closePath(); ctx.fillStyle = '#3a3436'; ctx.fill(); ctx.strokeStyle = look.head; ctx.lineWidth = Math.max(1, headW * 0.12); ctx.stroke(); }
    else if (look.type === 'machine') { ctx.fillRect(-headW, -headL / 2, headW * 2, headL); ctx.fillStyle = '#333'; ctx.fillRect(headW * 0.6, -headL * 0.12, headW * 0.9, headL * 0.24); ctx.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 0; i < 3; i++) ctx.fillRect(-headW, -headL / 2 + i * headL * 0.33, headW * 2, headL * 0.06); }
    else { ctx.beginPath(); ctx.roundRect(-headW, -headL / 2, headW * 2, headL, Math.max(1, headW * 0.25)); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-headW * 0.8, -headL / 2, headW * 0.4, headL); if (look.type === 'sledge') { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-headW, -headL * 0.05, headW * 2, headL * 0.1); } }
    ctx.shadowBlur = 0;
    ctx.restore();
    // faíscas do tônico
    if (Game.S.active.some(a => a.id === 'tonico')) for (let i = 0; i < 2; i++) { ctx.fillStyle = Math.random() < 0.5 ? '#ff8a3d' : '#ffd34d'; ctx.fillRect(ex + (Math.random() - 0.5) * headL, ey + (Math.random() - 0.5) * headL, 2, 2); }
    // luva (velocidade de mineração)
    const G = gear.glove;
    ctx.fillStyle = G.col; ctx.beginPath(); ctx.arc(hand.x, hand.y, (0.13 + G.era * 0.015) * k, 0, Math.PI * 2); ctx.fill();
    if (G.era >= 4) { ctx.strokeStyle = G.era === 6 ? '#40d0ff' : '#c9cfd6'; ctx.lineWidth = 0.05 * k; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hand.x, hand.y); ctx.stroke(); if (G.era >= 5) { ctx.fillStyle = '#555'; ctx.fillRect((sx + hand.x) / 2 - 0.07 * k, (sy + hand.y) / 2 - 0.07 * k, 0.14 * k, 0.14 * k); } }
  },

  drawFx() {
    const ctx = this.ctx, k = this.k;
    for (const f of Game.fx) { ctx.globalAlpha = Math.min(1, f.t * 2); ctx.fillStyle = f.c; ctx.fillRect(this.sx(f.x) - f.s * k / 2, this.sy(f.y) - f.z * k - f.s * k / 2, f.s * k, f.s * k); }
    ctx.globalAlpha = 1;
  },
  drawFloats() {
    const ctx = this.ctx; ctx.textAlign = 'center';
    for (const f of Game.floats) {
      ctx.globalAlpha = Math.min(1, f.t * 1.5); ctx.font = '700 15px system-ui, sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
      ctx.strokeText(f.txt, this.sx(f.x), this.sy(f.y) - 20); ctx.fillStyle = f.c; ctx.fillText(f.txt, this.sx(f.x), this.sy(f.y) - 20);
    }
    ctx.globalAlpha = 1;
  },
  drawVignette() {
    const ctx = this.ctx, w = innerWidth, h = innerHeight;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,6,0,0.45)');
    ctx.fillStyle = g; ctx.fillRect(-10, -10, w + 20, h + 20);
  },

  // ---------- minimapa (escala de raiz para caber tudo) ----------
  drawMinimap() {
    const c = this.mctx, W = this.mini.width, H = this.mini.height, cx = W / 2, cy = H / 2, MAXD = 4200, RAD = W / 2 - 6;
    const map = (x, y) => { const d = Math.hypot(x, y); if (d < 0.001) return [cx, cy]; const r = Math.sqrt(d / MAXD) * RAD; return [cx + x / d * r, cy + y / d * r]; };
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(30,26,20,0.85)'; c.beginPath(); c.arc(cx, cy, W / 2 - 2, 0, Math.PI * 2); c.fill();
    for (const R of REGIONS) {
      c.fillStyle = R.ground[1]; c.globalAlpha = 0.85; c.beginPath();
      const steps = 10, pts = [];
      for (let i = 0; i <= steps; i++) { const d = R.dMin + (R.dMax - R.dMin) * i / steps, w = 40 + d * 0.12; pts.push(map(R.ux * d + R.vx * w / 2, R.uy * d + R.vy * w / 2)); }
      for (let i = steps; i >= 0; i--) { const d = R.dMin + (R.dMax - R.dMin) * i / steps, w = 40 + d * 0.12; pts.push(map(R.ux * d - R.vx * w / 2, R.uy * d - R.vy * w / 2)); }
      pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill();
      c.globalAlpha = 1;
      const lab = map(R.ux * (R.dMin + R.dMax) / 2, R.uy * (R.dMin + R.dMax) / 2);
      c.fillStyle = Game.S.hammer >= (R.era - 1) * 10 + 1 ? '#fff' : 'rgba(255,255,255,0.45)'; c.font = '600 9px system-ui'; c.textAlign = 'center';
      c.fillText(R.era, lab[0], lab[1] + 3);
    }
    // veio aflorado
    if (World.veio) { const R = REGIONS[RES[World.veio.res].region]; const p = map(R.ux * (R.dMin + R.dMax) / 2, R.uy * (R.dMin + R.dMax) / 2); c.strokeStyle = '#ffd34d'; c.lineWidth = 2; c.beginPath(); c.arc(p[0], p[1], 8 + Math.sin(this.t * 5) * 2, 0, Math.PI * 2); c.stroke(); }
    c.fillStyle = '#d8c8a8'; c.beginPath(); c.arc(cx, cy, 4, 0, Math.PI * 2); c.fill();
    const pp = map(Game.P.x, Game.P.y);
    c.fillStyle = '#ff5a3a'; c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(pp[0], pp[1], 4, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.font = '9px system-ui'; c.textAlign = 'center'; c.fillText('N', cx, 12);
  },
};
