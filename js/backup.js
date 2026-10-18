// =============================================================
// Vale Ferrado — cópia de segurança do progresso
//  1) navegador: localStorage (principal) + IndexedDB (reserva)
//  2) arquivo na pasta do jogo: save/progresso.json (+ progresso-anterior.json)
// =============================================================
'use strict';

const Backup = {
  last: 0, lastFile: 0, fileState: 'off', // off | ok | needs-permission | unsupported | error
  canFile() { return 'showDirectoryPicker' in window; },

  // ---------- reserva no IndexedDB ----------
  async idbPut(data) { try { const d = await Updater.db(); d.transaction('kv', 'readwrite').objectStore('kv').put(data, 'save'); } catch (e) {} },
  async idbGet() { try { const d = await Updater.db(); return await new Promise(res => { const q = d.transaction('kv').objectStore('kv').get('save'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch (e) { return null; } },

  // ---------- arquivo na pasta do jogo ----------
  async dir(ask) {
    if (!this.canFile()) { this.fileState = 'unsupported'; return null; }
    let d = this.handle || await Updater.getHandle();
    if (d) {
      let p = await d.queryPermission({ mode: 'readwrite' });
      if (p !== 'granted' && ask) p = await d.requestPermission({ mode: 'readwrite' });
      if (p === 'granted') { this.handle = d; return d; }
      this.fileState = 'needs-permission'; return null;
    }
    if (!ask) { this.fileState = 'off'; return null; }
    d = await window.showDirectoryPicker({ id: 'vale-ferrado', mode: 'readwrite' });
    try { await d.getFileHandle('index.html'); } catch (e) { throw new Error('pasta'); }
    await Updater.setHandle(d); this.handle = d;
    return d;
  },
  async writeFile(ask) {
    try {
      const d = await this.dir(ask); if (!d) return false;
      const sd = await d.getDirectoryHandle('save', { create: true });
      // guarda a versão anterior antes de sobrescrever
      try { const old = await (await sd.getFileHandle('progresso.json')).getFile(); const t = await old.text(); if (t.length > 20) { const w0 = await (await sd.getFileHandle('progresso-anterior.json', { create: true })).createWritable(); await w0.write(t); await w0.close(); } } catch (e) {}
      const w = await (await sd.getFileHandle('progresso.json', { create: true })).createWritable();
      await w.write(JSON.stringify(Game.S)); await w.close();
      this.lastFile = Date.now(); this.fileState = 'ok';
      return true;
    } catch (e) { if (e.name !== 'AbortError') this.fileState = e.message === 'pasta' ? 'error' : this.fileState; if (ask && e.message === 'pasta') UI.toast('Essa pasta não tem o index.html do jogo. Escolha a pasta do Vale Ferrado.', 'warn'); return false; }
  },
  async readFile() {
    const d = await this.dir(true); if (!d) return null;
    for (const name of ['progresso.json', 'progresso-anterior.json']) {
      try { const sd = await d.getDirectoryHandle('save'); const t = await (await (await sd.getFileHandle(name)).getFile()).text(); const s = JSON.parse(t); if (s && s.hammer) return s; } catch (e) {}
    }
    return null;
  },

  // ---------- salvar ----------
  saveAll(reason) {
    Game.S.savedAt = Date.now();
    Game.save();
    this.idbPut(JSON.parse(JSON.stringify(Game.S)));
    this.writeFile(false);
    this.last = Date.now();
    this.indicator(reason);
  },
  async manual() {
    Game.S.savedAt = Date.now(); Game.save(); this.idbPut(JSON.parse(JSON.stringify(Game.S)));
    if (!this.canFile()) { UI.exportSave(); UI.toast('Seu navegador não salva direto na pasta: baixei um arquivo de progresso.', 'money'); return; }
    const ok = await this.writeFile(true);
    UI.toast(ok ? 'Progresso salvo no navegador e no arquivo save/progresso.json da pasta do jogo.' : 'Salvo no navegador. Para salvar também em arquivo, escolha a pasta do jogo.', ok ? 'money' : 'warn');
    if (ok) Snd.pickup();
    this.indicator('manual'); UI.renderPausa && UI.renderPausa();
  },
  indicator(reason) {
    const el = document.getElementById('saved'); if (!el) return;
    el.textContent = '💾 Salvo' + (this.fileState === 'ok' ? ' (navegador + arquivo)' : '');
    el.classList.add('on'); clearTimeout(this.indT); this.indT = setTimeout(() => el.classList.remove('on'), 1600);
  },
  statusText() {
    const ago = t => { if (!t) return 'nunca'; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `há ${s} s` : `há ${Math.round(s / 60)} min`; };
    const f = { ok: `✅ arquivo salvo ${ago(this.lastFile)}`, 'needs-permission': '⚠ clique em Salvar agora para liberar o arquivo', off: '⚠ ainda sem arquivo: clique em Salvar agora', unsupported: 'arquivo: só no Chrome/Edge', error: '⚠ erro ao salvar o arquivo' }[this.fileState];
    return `Navegador: ✅ salvo ${ago(this.last || Game.S.savedAt)} · ${f}`;
  },

  // ---------- recuperar ao abrir ----------
  async recoverOnStart() {
    const local = Game.load();
    const idb = await this.idbGet();
    const t = s => (s && (s.savedAt || 0)) || 0;
    if (idb && idb.hammer && (!local || t(idb) > t(local) + 1000)) {
      localStorage.setItem(SAVE_KEY, JSON.stringify(idb));
      UI.toast('Recuperei seu progresso da cópia de segurança do navegador.', 'money');
      location.reload(); return true;
    }
    if (!local && this.canFile() && await Updater.getHandle()) {
      document.getElementById('restoreFile').style.display = 'inline-block';
    }
    return false;
  },
  async restoreFromFile() {
    try {
      const s = await this.readFile();
      if (!s) { UI.toast('Não achei save/progresso.json nessa pasta.', 'warn'); return; }
      if (!confirm(`Carregar progresso do arquivo: martelo nível ${s.hammer} e ${fmt(s.money || 0)} moedas?`)) return;
      localStorage.setItem(SAVE_KEY, JSON.stringify(s)); location.reload();
    } catch (e) { if (e.name !== 'AbortError') UI.toast('Não consegui ler o arquivo.', 'warn'); }
  },

  init() {
    // salva sozinho: a cada 30 s, ao trocar de aba/minimizar, ao perder o foco e ao fechar
    setInterval(() => { if (started) this.saveAll('auto'); }, 30000);
    document.addEventListener('visibilitychange', () => { if (document.hidden && started) this.saveAll('saida'); });
    addEventListener('pagehide', () => { if (started) { Game.S.savedAt = Date.now(); Game.save(); this.idbPut(JSON.parse(JSON.stringify(Game.S))); this.writeFile(false); } });
    addEventListener('blur', () => { if (started) this.saveAll('saida'); });
    this.recoverOnStart();
  },
};
