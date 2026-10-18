// =============================================================
// Vale Ferrado — atualizador automático (verifica o GitHub e atualiza a pasta do jogo)
// =============================================================
'use strict';

const REPO = 'marcelo692/Vale-Ferrado';

const Updater = {
  latest: null, sha: null, state: 'idle', checkedAt: 0,

  isOnline() { return /github\.io$/.test(location.hostname); },
  canWriteFolder() { return 'showDirectoryPicker' in window; },
  newer(a, b) { // a > b ?
    const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((pa[i] || 0) > (pb[i] || 0)) return true; if ((pa[i] || 0) < (pb[i] || 0)) return false; }
    return false;
  },

  async check(manual) {
    if (this.state === 'checking' || this.state === 'updating') return;
    this.state = 'checking'; if (manual) this.render();
    try {
      // commit mais recente da branch principal (assim os arquivos baixados são sempre os mais novos)
      const r = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status === 404 ? 'privado' : 'http ' + r.status);
      this.sha = (await r.json()).sha;
      const v = await fetch(`https://raw.githubusercontent.com/${REPO}/${this.sha}/version.json`, { cache: 'no-store' });
      if (!v.ok) throw new Error('version.json ' + v.status);
      this.latest = await v.json();
      this.checkedAt = Date.now();
      this.state = this.newer(this.latest.version, GAME_VERSION) ? 'available' : 'uptodate';
    } catch (e) {
      this.state = 'error'; this.err = e.message;
    }
    this.banner();
    if (manual || UI.open === 'update') this.render();
  },

  banner() {
    const el = document.getElementById('upd');
    if (this.state !== 'available') { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.innerHTML = `<span>⬆ Nova versão <b>${this.latest.version}</b> disponível</span><button onclick="Updater.open()">Ver e atualizar</button><button class="x" onclick="this.parentElement.style.display='none'">✕</button>`;
  },

  open() { UI.freeMouse(); UI.open = 'update'; document.getElementById('panel').classList.remove('hidden'); this.render(); },

  render() {
    if (UI.open !== 'update') return;
    const L = this.latest, st = this.state;
    let h = `<div class="story upd"><h2>Atualizações</h2><p class="free">Versão instalada: <b>${GAME_VERSION}</b>${L ? ` · Versão mais nova: <b>${L.version}</b>` : ''}</p>`;
    if (st === 'checking') h += `<p>Procurando atualizações…</p>`;
    else if (st === 'error') h += this.err === 'privado'
      ? `<p class="warnbox">Não consegui acessar o repositório do jogo no GitHub. Ele está <b>privado</b>, e o navegador só consegue baixar atualizações de um repositório <b>público</b>.</p>`
      : `<p class="warnbox">Não consegui verificar agora (${this.err}). Confira sua internet e tente de novo.</p>`;
    else if (st === 'uptodate') h += `<p>✅ Você já está com a versão mais nova.</p>`;
    else if (st === 'updating') h += `<p>Baixando e instalando… <b id="updpct">0%</b></p><div class="pbar"><i id="updbar"></i></div><p class="hint" id="updfile"></p>`;
    else if (st === 'done') h += `<p>✅ Atualizado para a versão ${L.version}! Recarregando o jogo…</p>`;
    if (L && L.notes && (st === 'available' || st === 'uptodate')) h += `<h4>Novidades da versão ${L.version}</h4><ul class="notes">${L.notes.map(n => `<li>${n}</li>`).join('')}</ul>`;
    h += `<div class="row">`;
    if (st === 'available') {
      if (this.isOnline()) h += `<button class="buy" onclick="Updater.reloadFresh()">Atualizar agora</button>`;
      else if (this.canWriteFolder()) h += `<button class="buy" onclick="Updater.install()">Atualizar agora</button>`;
      else h += `<a class="buy" href="https://github.com/${REPO}/archive/refs/heads/main.zip">Baixar a versão nova (ZIP)</a>`;
    }
    if (st !== 'updating' && st !== 'checking') h += `<button class="buy alt" onclick="Updater.check(true)">Verificar de novo</button>`;
    h += `<button class="buy alt" onclick="UI.close()">Fechar</button></div>`;
    if (st === 'available' && !this.isOnline() && this.canWriteFolder()) h += `<p class="hint">Na primeira vez o navegador vai pedir para você escolher a <b>pasta do jogo</b> (a que tem o index.html) e permitir que ele salve arquivos nela. Depois disso, as próximas atualizações são com um clique.</p>`;
    if (st === 'available' && !this.isOnline() && !this.canWriteFolder()) h += `<p class="hint">Seu navegador não permite atualizar a pasta sozinho. Use o Chrome ou o Edge para atualizar com um clique.</p>`;
    h += `<p class="hint">Seu progresso fica salvo no navegador e não é apagado ao atualizar.</p></div>`;
    document.getElementById('panel').innerHTML = h;
  },

  reloadFresh() { Game.save(); location.replace(location.pathname + '?v=' + this.latest.version + '-' + Date.now()); },

  // ---------- guarda a pasta escolhida para as próximas vezes ----------
  db() { return new Promise((res, rej) => { const r = indexedDB.open('valeferrado', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async getHandle() { try { const d = await this.db(); return await new Promise(res => { const q = d.transaction('kv').objectStore('kv').get('dir'); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (e) { return null; } },
  async setHandle(h) { try { const d = await this.db(); d.transaction('kv', 'readwrite').objectStore('kv').put(h, 'dir'); } catch (e) {} },

  async folder() {
    let dir = await this.getHandle();
    if (dir) {
      const p = await dir.requestPermission({ mode: 'readwrite' });
      if (p !== 'granted') dir = null;
    }
    if (!dir) {
      dir = await window.showDirectoryPicker({ id: 'vale-ferrado', mode: 'readwrite' });
      try { await dir.getFileHandle('index.html'); } catch (e) { throw new Error('pasta'); }
      await this.setHandle(dir);
    }
    return dir;
  },

  async install() {
    let dir;
    try { dir = await this.folder(); }
    catch (e) {
      if (e.name === 'AbortError') return;
      UI.toast(e.message === 'pasta' ? 'Essa pasta não tem o index.html do jogo. Escolha a pasta Vale-Ferrado.' : 'Não foi possível acessar a pasta.', 'warn');
      return;
    }
    Game.save();
    this.state = 'updating'; this.render();
    const files = this.latest.files, base = `https://raw.githubusercontent.com/${REPO}/${this.sha}/`;
    try {
      // baixa tudo primeiro; só grava se todos os arquivos vierem certos
      const got = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const r = await fetch(base + f.path, { cache: 'no-store' });
        if (!r.ok) throw new Error(f.path);
        got.push({ path: f.path, data: await r.arrayBuffer() });
        this.progress((i + 1) / files.length * 0.7, 'Baixando ' + f.path);
      }
      for (let i = 0; i < got.length; i++) {
        const parts = got[i].path.split('/'); let d = dir;
        for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
        const fh = await d.getFileHandle(parts[parts.length - 1], { create: true });
        const w = await fh.createWritable(); await w.write(got[i].data); await w.close();
        this.progress(0.7 + (i + 1) / got.length * 0.3, 'Instalando ' + got[i].path);
      }
      this.state = 'done'; this.render(); Snd.levelUp();
      setTimeout(() => location.reload(), 1500);
    } catch (e) {
      this.state = 'error'; this.err = 'falha ao baixar ' + e.message; this.render();
    }
  },
  progress(p, file) {
    const b = document.getElementById('updbar'), t = document.getElementById('updpct'), f = document.getElementById('updfile');
    if (b) b.style.width = (p * 100) + '%'; if (t) t.textContent = Math.round(p * 100) + '%'; if (f) f.textContent = file;
  },

  init() {
    document.getElementById('ver').textContent = 'v' + GAME_VERSION;
    setTimeout(() => this.check(false), 1500);
    setInterval(() => this.check(false), 10 * 60 * 1000); // a cada 10 minutos
  },
};
