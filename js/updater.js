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
      // se a API do GitHub recusar (limite de consultas), usa direto a branch main
      try { const r = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, { cache: 'no-store' }); if (r.status === 404) throw new Error('privado'); this.sha = r.ok ? (await r.json()).sha : 'main'; }
      catch (e) { if (e.message === 'privado') throw e; this.sha = 'main'; }
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
    this.pauseBox(false);
  },

  banner() {
    const el = document.getElementById('upd');
    if (this.state !== 'available') { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.innerHTML = `<span>${tt('⬆ Nova versão <b>{0}</b> disponível', this.latest.version)}</span><button onclick="Updater.open()">${tt('Ver e atualizar')}</button><button class="x" onclick="this.parentElement.style.display='none'">✕</button>`;
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
    if (st === 'available' && !this.isOnline() && this.canWriteFolder()) h += `${this.folderErr ? `<p class="warnbox">${this.folderErr}</p>` : ''}<p class="hint">O jogo aberto agora está na pasta:<br><b style="user-select:all">${this.gameFolder()}</b><br>Na primeira vez (e sempre que você abrir o jogo de outra pasta) o navegador pede para escolher <b>essa pasta</b> e permitir salvar nela.</p><div class="row"><button class="buy alt" onclick="Updater.install(true)">Escolher a pasta de novo</button></div>`;
    if (st === 'available' && !this.isOnline() && !this.canWriteFolder()) h += `<p class="hint">Seu navegador não permite atualizar a pasta sozinho. Use o Chrome ou o Edge para atualizar com um clique.</p>`;
    h += `<p class="hint">Seu progresso fica salvo no navegador e não é apagado ao atualizar.</p></div>`;
    document.getElementById('panel').innerHTML = h;
  },

  reloadFresh() { Game.save(); location.replace(location.pathname + '?v=' + this.latest.version + '-' + Date.now()); },

  // ---------- guarda a pasta escolhida para as próximas vezes ----------
  db() { return new Promise((res, rej) => { const r = indexedDB.open('valeferrado', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async getHandle() { try { const d = await this.db(); return await new Promise(res => { const q = d.transaction('kv').objectStore('kv').get('dir'); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (e) { return null; } },
  async setHandle(h) { try { const d = await this.db(); d.transaction('kv', 'readwrite').objectStore('kv').put(h, 'dir'); } catch (e) {} },

  // pasta de onde o jogo foi aberto (para mostrar ao jogador qual escolher)
  gameFolder() { try { return decodeURIComponent(location.pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/\/[^/]*$/, '').replace(/\//g, location.pathname.match(/^\/[A-Za-z]:/) ? '\\' : '/'); } catch (e) { return ''; } },
  // confere se a pasta é mesmo a do jogo aberto agora (mesma versão instalada)
  async sameGame(dir) {
    try {
      await dir.getFileHandle('index.html');
      const f = await (await (await dir.getDirectoryHandle('js')).getFileHandle('data.js')).getFile();
      const m = (await f.text()).match(/GAME_VERSION\s*=\s*'([^']+)'/);
      return m ? m[1] : 'sem versão';
    } catch (e) { return null; }
  },
  async folder(forcePick) {
    let dir = forcePick ? null : await this.getHandle();
    if (dir) {
      const p = await dir.requestPermission({ mode: 'readwrite' });
      if (p !== 'granted' || (await this.sameGame(dir)) !== GAME_VERSION) dir = null; // pasta antiga (outro download): pede de novo
    }
    if (!dir) {
      UI.toast('Escolha a pasta do jogo aberto agora: ' + this.gameFolder(), 'warn');
      dir = await window.showDirectoryPicker({ id: 'vale-ferrado', mode: 'readwrite' });
      const v = await this.sameGame(dir);
      if (v === null) throw new Error('pasta');
      if (v !== GAME_VERSION) throw new Error('outra:' + v);
      await this.setHandle(dir);
      if (window.Backup) Backup.handle = null;
    }
    return dir;
  },

  async install(forcePick) {
    let dir;
    try { dir = await this.folder(forcePick); }
    catch (e) {
      if (e.name === 'AbortError') return;
      const msg = e.message === 'pasta' ? 'Essa pasta não tem o jogo (index.html e js/data.js).'
        : e.message.startsWith('outra:') ? `Essa pasta tem outra cópia do jogo (versão ${e.message.slice(6)}), não a que está aberta (versão ${GAME_VERSION}).`
        : 'Não foi possível acessar a pasta.';
      this.state = 'available'; this.folderErr = msg + ' Escolha a pasta: ' + this.gameFolder(); this.render(); UI.toast(msg, 'warn');
      return;
    }
    this.folderErr = null;
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
  // caixa de atualização no menu de pausa (Esc): verifica ao abrir e atualiza com um clique
  pauseBox(opened) {
    const el = document.getElementById('pauseupd'); if (!el) return;
    if (opened && this.state !== 'checking' && this.state !== 'updating' && Date.now() - this.checkedAt > 120000) this.check(false);
    const st = this.state, L = this.latest;
    let h;
    if (st === 'available') h = `<button class="buy" onclick="Updater.quick()">⬆ Atualizar agora para a ${L.version}</button><small>${(L.notes || []).slice(0, 2).join(' · ')}</small>`;
    else if (st === 'checking') h = `<small>Procurando atualização…</small>`;
    else if (st === 'uptodate') h = `<small>${tt('✅ Versão {0} · é a mais nova', GAME_VERSION)}</small>`;
    else if (st === 'error') h = `<small>⚠ Não consegui procurar atualização (${this.err}). <a href="#" onclick="Updater.check(true);return false" style="color:#ffe27a">Tentar de novo</a></small>`;
    else h = '';
    if (el.dataset.h !== h) { el.dataset.h = h; el.innerHTML = h; }
  },
  quick() {
    this.open();
    if (this.isOnline()) this.reloadFresh();
    else if (this.canWriteFolder()) this.install();
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
