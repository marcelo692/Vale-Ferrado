// =============================================================
// Vale Ferrado — sons e música, tudo sintetizado (Web Audio, sem arquivos)
// =============================================================
'use strict';

const Snd = {
  ctx: null, ready: false,
  vol: { master: 0.8, music: 0.5, sfx: 0.8, amb: 0.6 }, muted: false,

  load() {
    try { const v = JSON.parse(localStorage.getItem('valeferrado_audio')); if (v) { Object.assign(this.vol, v.vol || {}); this.muted = !!v.muted; } } catch (e) {}
  },
  saveCfg() { try { localStorage.setItem('valeferrado_audio', JSON.stringify({ vol: this.vol, muted: this.muted })); } catch (e) {} },

  // o navegador só libera áudio depois de um clique
  start() {
    if (this.ready) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      this.ctx = new C();
      const c = this.ctx;
      this.master = c.createGain();
      const lim = c.createDynamicsCompressor(); lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.15;
      this.master.connect(lim); lim.connect(c.destination);
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.connect(this.master);
      this.busMusic = c.createGain(); this.busSfx = c.createGain(); this.busAmb = c.createGain();
      [this.busMusic, this.busSfx, this.busAmb].forEach(b => b.connect(comp));
      // eco suave para a música
      this.verb = c.createConvolver(); this.verb.buffer = this.impulse(2.4, 2.5);
      const vg = c.createGain(); vg.gain.value = 0.35; this.verb.connect(vg); vg.connect(this.busMusic);
      this.noiseBuf = this.makeNoise(2);
      this.ready = true;
      this.apply();
      this.startAmbience();
      this.music.init(this);
    } catch (e) { this.ready = false; }
  },
  apply() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted || this.paused ? 0 : this.vol.master * 2.2, t, this.paused ? 0.08 : 0.05);
    this.busMusic.gain.setTargetAtTime(this.paused ? 0 : this.vol.music * 1.1, t, 0.05);
    this.busSfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.busAmb.gain.setTargetAtTime(this.paused ? 0 : this.vol.amb * 0.8, t, 0.05);
  },
  // pausa: música e ambiente somem suavemente e voltam ao continuar
  setPaused(p) {
    if (!this.ready || this.paused === p) return;
    this.paused = p;
    const t = this.ctx.currentTime;
    this.busMusic.gain.cancelScheduledValues(t); this.busAmb.gain.cancelScheduledValues(t); this.master.gain.cancelScheduledValues(t);
    if (p) { this.master.gain.setTargetAtTime(0, t, 0.08); /* pausa: silencia absolutamente tudo */ this.busMusic.gain.setTargetAtTime(0, t, 0.15); this.busAmb.gain.setTargetAtTime(0, t, 0.15); if (this.humG) this.humG.gain.setTargetAtTime(0, t, 0.05); if (this.roll) this.roll.g.gain.setTargetAtTime(0, t, 0.05); }
    else this.apply();
  },
  set(k, v) { this.vol[k] = v; this.apply(); this.saveCfg(); },
  toggleMute() { this.muted = !this.muted; this.apply(); this.saveCfg(); return !this.muted; },

  makeNoise(sec) {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate * sec, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  },
  impulse(sec, decay) {
    const c = this.ctx, len = c.sampleRate * sec, b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  },

  // ---------- blocos básicos ----------
  tone(freq, dur, { type = 'sine', vol = 0.3, attack = 0.005, bus, at = 0, slide = 0, filter } = {}) {
    if (!this.ready || this.paused) return;
    const c = this.ctx, t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) { const f = c.createBiquadFilter(); f.type = filter.type || 'lowpass'; f.frequency.value = filter.f; f.Q.value = filter.q || 1; o.connect(f); node = f; }
    node.connect(g); g.connect(bus || this.busSfx);
    o.start(t); o.stop(t + dur + 0.05);
    return g;
  },
  noise(dur, { vol = 0.3, f = 1000, q = 1, type = 'bandpass', attack = 0.002, bus, at = 0, fEnd } = {}) {
    if (!this.ready || this.paused) return;
    const c = this.ctx, t = c.currentTime + at, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true;
    fl.type = type; fl.frequency.setValueAtTime(f, t); if (fEnd) fl.frequency.exponentialRampToValueAtTime(fEnd, t + dur); fl.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(bus || this.busSfx);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  rnd(a, b) { return a + Math.random() * (b - a); },

  // ---------- efeitos ----------
  step(surface, running) {
    const v = running ? 0.22 : 0.15, p = this.rnd(0.85, 1.15);
    if (surface === 'stone') { this.noise(0.06, { vol: v, f: 2600 * p, q: 2 }); this.tone(180 * p, 0.05, { vol: v * 0.4, type: 'triangle' }); }
    else if (surface === 'dirt') this.noise(0.09, { vol: v, f: 700 * p, q: 0.8 });
    else if (surface === 'crystal') { this.noise(0.07, { vol: v * 0.8, f: 3800 * p, q: 3 }); }
    else { this.noise(0.11, { vol: v * 0.9, f: 1400 * p, q: 0.6, type: 'highpass' }); this.noise(0.06, { vol: v * 0.5, f: 500 * p, q: 1 }); }
  },
  jump() { this.noise(0.12, { vol: 0.12, f: 900, fEnd: 2000, q: 0.7 }); },
  land(h) { const v = Math.min(0.4, 0.12 + h * 0.06); this.noise(0.14, { vol: v, f: 400, q: 0.7, type: 'lowpass' }); this.tone(70, 0.12, { vol: v * 0.6, slide: 0.6 }); },
  swing(fast) { this.noise(0.12, { vol: fast ? 0.1 : 0.07, f: 600, fEnd: 2400, q: 1.2 }); },
  hit(kind, hammerLvl, crit) {
    const p = this.rnd(0.92, 1.08), heavy = Math.min(1, hammerLvl / 60);
    const v = 0.32 + heavy * 0.12;
    switch (kind) {
      case 'nut': case 'stick': this.noise(0.08, { vol: v, f: 900 * p, q: 1.5 }); this.tone(220 * p, 0.07, { vol: v * 0.4, type: 'triangle' }); break;
      case 'log': this.tone(140 * p, 0.14, { vol: v * 0.8, type: 'triangle', slide: 0.7 }); this.noise(0.1, { vol: v * 0.6, f: 600 * p, q: 1 }); break;
      case 'clay': this.noise(0.12, { vol: v * 0.8, f: 300 * p, q: 0.6, type: 'lowpass' }); this.tone(90, 0.1, { vol: v * 0.5, slide: 0.6 }); break;
      case 'scrap': this.tone(620 * p, 0.25, { vol: v * 0.35, type: 'square', filter: { f: 2500, q: 2 } }); this.tone(931 * p, 0.3, { vol: v * 0.25, type: 'triangle' }); this.noise(0.06, { vol: v * 0.6, f: 3000 }); break;
      case 'ore': this.noise(0.06, { vol: v, f: 2200 * p, q: 1.5 }); this.tone(1240 * p, 0.35, { vol: v * 0.22, type: 'triangle' }); this.tone(160 * p, 0.1, { vol: v * 0.5, type: 'triangle', slide: 0.6 }); break;
      case 'crystal': this.tone(1568 * p, 0.6, { vol: v * 0.22 }); this.tone(2349 * p, 0.5, { vol: v * 0.15 }); this.noise(0.05, { vol: v * 0.6, f: 4500, q: 2 }); break;
      case 'meteor': this.tone(80, 0.4, { vol: v * 0.7, slide: 0.5 }); this.tone(1800 * p, 0.4, { vol: v * 0.18, type: 'sawtooth', filter: { f: 3000 } }); this.noise(0.1, { vol: v * 0.7, f: 1500 }); break;
      default: this.noise(0.07, { vol: v, f: 1800 * p, q: 1.4 }); this.tone(150 * p, 0.09, { vol: v * 0.55, type: 'triangle', slide: 0.6 });
    }
    if (hammerLvl >= 41 && hammerLvl <= 50) this.noise(0.15, { vol: 0.12, f: 120, q: 0.5, type: 'lowpass' }); // máquina
    if (crit) this.tone(1760, 0.25, { vol: 0.12, type: 'triangle' });
  },
  breakNode(kind, rare) {
    this.noise(0.35, { vol: 0.35, f: kind === 'crystal' ? 3000 : 900, fEnd: 200, q: 0.7 });
    this.tone(110, 0.3, { vol: 0.25, slide: 0.5 });
    for (let i = 0; i < 4; i++) this.noise(0.05, { vol: 0.12, f: this.rnd(1500, 3500), q: 3, at: 0.08 + i * 0.05 });
    if (rare > 1) [880, 1109, 1319, 1760].forEach((f, i) => this.tone(f, 0.4, { vol: 0.12, type: 'triangle', at: 0.1 + i * 0.07 }));
  },
  pickup() { this.tone(660, 0.08, { vol: 0.12, type: 'triangle' }); this.tone(990, 0.12, { vol: 0.1, type: 'triangle', at: 0.06 }); },
  coins(n) { const k = Math.min(10, 3 + Math.floor(Math.log10(1 + n))); for (let i = 0; i < k; i++) { this.tone(this.rnd(2400, 3600), 0.12, { vol: 0.07, type: 'square', filter: { f: 5000 }, at: i * 0.045 }); } this.tone(1046, 0.25, { vol: 0.1, type: 'triangle', at: k * 0.045 }); },
  levelUp() { [523, 659, 784, 1046].forEach((f, i) => { this.tone(f, 0.35, { vol: 0.16, type: 'triangle', at: i * 0.09 }); this.tone(f / 2, 0.35, { vol: 0.08, at: i * 0.09 }); }); },
  forge() { for (let i = 0; i < 3; i++) { this.tone(1200 + i * 60, 0.4, { vol: 0.14, type: 'triangle', at: i * 0.18 }); this.noise(0.05, { vol: 0.2, f: 3000, at: i * 0.18 }); } this.levelUp(); },
  buy() { this.tone(880, 0.08, { vol: 0.1, type: 'triangle' }); this.tone(1320, 0.14, { vol: 0.1, type: 'triangle', at: 0.07 }); },
  power(id) { const base = id === 'tonico' ? 220 : id === 'cafe' ? 330 : 262; this.tone(base, 0.6, { vol: 0.15, type: 'sawtooth', slide: 4, filter: { f: 2000 } }); this.noise(0.4, { vol: 0.1, f: 2000, fEnd: 6000 }); this.tone(base * 4, 0.5, { vol: 0.08, at: 0.3 }); },
  click() { this.tone(1400, 0.03, { vol: 0.06, type: 'square', filter: { f: 3000 } }); },
  open() { this.tone(520, 0.08, { vol: 0.08, type: 'triangle' }); this.tone(780, 0.1, { vol: 0.07, type: 'triangle', at: 0.05 }); },
  close() { this.tone(700, 0.07, { vol: 0.06, type: 'triangle' }); this.tone(470, 0.09, { vol: 0.05, type: 'triangle', at: 0.05 }); },
  warn() { this.tone(220, 0.18, { vol: 0.14, type: 'square', filter: { f: 900 } }); this.tone(196, 0.22, { vol: 0.14, type: 'square', filter: { f: 900 }, at: 0.2 }); },
  tired() { this.noise(0.5, { vol: 0.12, f: 900, q: 0.6, attack: 0.15 }); this.noise(0.6, { vol: 0.1, f: 700, q: 0.6, attack: 0.2, at: 0.7 }); },
  denied() { this.tone(160, 0.12, { vol: 0.1, type: 'square', filter: { f: 600 } }); },
  beep(freq) { this.tone(freq, 0.09, { vol: 0.07 }); },
  story() { [392, 494, 587, 784].forEach((f, i) => this.tone(f, 1.2, { vol: 0.08, type: 'triangle', at: i * 0.25, bus: this.busMusic })); },
  veio() { [659, 784, 988].forEach((f, i) => this.tone(f, 0.3, { vol: 0.1, type: 'triangle', at: i * 0.1 })); },
  toggle(on) { this.tone(on ? 900 : 600, 0.06, { vol: 0.07, type: 'triangle' }); },

  // ---------- sons contínuos (ambiente, transporte) ----------
  startAmbience() {
    const c = this.ctx;
    const loop = (f, q, type) => { const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.busAmb); s.start(); return { g, fl }; };
    this.wind = loop(400, 0.5, 'lowpass');
    this.roll = loop(1800, 0.8, 'bandpass');
    this.water = loop(1200, 0.4, 'bandpass');
    // zumbido do hoverboard / motor
    this.hum = c.createOscillator(); this.hum.type = 'sawtooth'; this.hum.frequency.value = 90;
    const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 500;
    this.humG = c.createGain(); this.humG.gain.value = 0; this.hum.connect(hf); hf.connect(this.humG); this.humG.connect(this.busSfx); this.hum.start();
    this.ambT = 0;
  },
  update(dt, st) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    // vento: mais forte longe da cidade e nas regiões altas
    const windV = 0.05 + Math.min(0.18, st.dist / 9000) + (st.night ? 0.02 : 0) + Math.sin(t * 0.13) * 0.025;
    this.wind.g.gain.setTargetAtTime(windV, t, 0.5);
    this.wind.fl.frequency.setTargetAtTime(300 + Math.sin(t * 0.21) * 120 + st.speed * 15, t, 0.5);
    this.water.g.gain.setTargetAtTime(st.river * 0.12, t, 0.4);
    // rodinhas / monociclo
    const rollV = st.ride && st.ride < 4 && st.moving ? 0.05 + st.speed / 150 : 0;
    this.roll.g.gain.setTargetAtTime(rollV, t, 0.08);
    this.roll.fl.frequency.setTargetAtTime(900 + st.speed * 60, t, 0.1);
    const humV = st.ride === 4 ? 0.03 + (st.moving ? 0.04 : 0) : st.ride === 3 && st.moving ? 0.025 : 0;
    this.humG.gain.setTargetAtTime(humV, t, 0.1);
    this.hum.frequency.setTargetAtTime((st.ride === 4 ? 70 : 140) + st.speed * (st.ride === 4 ? 2 : 6), t, 0.1);
    // pássaros de dia, grilos à noite, sapos perto do riacho
    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = this.rnd(0.4, 1.6);
      if (st.night) { if (Math.random() < 0.7) this.cricket(); if (st.river > 0.2 && Math.random() < 0.3) this.frog(); }
      else if (st.dist < 1600 && Math.random() < 0.55) this.bird(); else if (Math.random() < 0.15) this.bird(true);
    }
    this.music.update(dt, st);
  },
  bird(far) {
    const base = this.rnd(2200, 3800), n = 2 + Math.floor(Math.random() * 4), v = far ? 0.02 : 0.045;
    for (let i = 0; i < n; i++) this.tone(base * this.rnd(0.9, 1.1), 0.09, { vol: v, at: i * 0.11, slide: this.rnd(0.7, 1.4), bus: this.busAmb });
  },
  cricket() {
    const f = this.rnd(4200, 4800), at0 = Math.random() * 0.2;
    for (let i = 0; i < 3; i++) this.tone(f, 0.03, { vol: 0.025, at: at0 + i * 0.05, type: 'square', filter: { f: 6000 }, bus: this.busAmb });
  },
  frog() { this.tone(this.rnd(140, 200), 0.18, { vol: 0.05, type: 'square', filter: { f: 700, q: 4 }, slide: 0.8, bus: this.busAmb }); },

  // ---------- música de fundo (gerada, calma, muda de dia e de noite) ----------
  music: {
    init(A) {
      this.A = A; this.beat = 0; this.next = A.ctx.currentTime + 0.5; this.bar = 0; this.prog = 0;
      // violão/viola caipira suave em Ré maior pentatônica
      this.dayChords = [[50, 57, 62, 66], [47, 54, 59, 62], [43, 50, 55, 59], [45, 52, 57, 61]];   // D Bm G A
      this.nightChords = [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 58], [40, 47, 52, 55]]; // Am F Gm Em
      this.dayScale = [62, 64, 66, 69, 71, 74, 76, 78];
      this.nightScale = [57, 60, 62, 64, 67, 69, 72];
      this.melody = 0;
    },
    mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); },
    pluck(m, at, vol, dur = 1.6) {
      const A = this.A, c = A.ctx, t = at, f = this.mtof(m);
      const o = c.createOscillator(), o2 = c.createOscillator(), fl = c.createBiquadFilter(), g = c.createGain();
      o.type = 'triangle'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.003;
      fl.type = 'lowpass'; fl.frequency.setValueAtTime(f * 6, t); fl.frequency.exponentialRampToValueAtTime(f * 1.5, t + dur * 0.6);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const g2 = c.createGain(); g2.gain.value = 0.25; o2.connect(g2); g2.connect(fl);
      o.connect(fl); fl.connect(g); g.connect(A.busMusic); g.connect(A.verb);
      o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
    },
    pad(notes, at, dur, vol) {
      const A = this.A, c = A.ctx;
      for (const m of notes) {
        const o = c.createOscillator(), g = c.createGain(), fl = c.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.value = this.mtof(m); o.detune.value = (Math.random() - 0.5) * 12;
        fl.type = 'lowpass'; fl.frequency.value = 700;
        g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vol, at + dur * 0.4); g.gain.linearRampToValueAtTime(0.0001, at + dur);
        o.connect(fl); fl.connect(g); g.connect(A.verb); g.connect(A.busMusic);
        o.start(at); o.stop(at + dur + 0.1);
      }
    },
    update(dt, st) {
      const A = this.A, c = A.ctx;
      const night = st.night, bpm = night ? 66 : 84, spb = 60 / bpm;
      if (this.next < c.currentTime - 0.2) this.next = c.currentTime + 0.15; // voltando da pausa: não acumula notas
      while (this.next < c.currentTime + 0.3) {
        const t = this.next, b = this.beat % 8;
        const chords = night ? this.nightChords : this.dayChords, ch = chords[this.prog % 4];
        if (b === 0) { this.pad(ch.map(n => n + 12), t, spb * 8, night ? 0.018 : 0.012); this.pluck(ch[0] - 12, t, 0.09, 2.5); }
        // dedilhado
        const pattern = night ? [0, 2, 1, 3, 2, 1, 3, 2] : [0, 2, 3, 1, 2, 3, 1, 2];
        if (!night || b % 2 === 0) this.pluck(ch[pattern[b]] + (b === 4 ? 12 : 0), t + (Math.random() - 0.5) * 0.01, night ? 0.045 : 0.05);
        // melodia ocasional
        if ((b === 2 || b === 5 || b === 7) && Math.random() < (night ? 0.35 : 0.5)) {
          const sc = night ? this.nightScale : this.dayScale;
          this.melody = Math.max(0, Math.min(sc.length - 1, this.melody + Math.floor(Math.random() * 5) - 2));
          this.pluck(sc[this.melody] + 12, t + spb * 0.5, 0.035, 2.2);
        }
        this.beat++; this.next += spb / 2;
        if (this.beat % 8 === 0) this.prog++;
      }
    },
  },
};
Snd.load();
