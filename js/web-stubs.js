// Versão para portais (CrazyGames): sem atualizador e sem salvar em pasta. O progresso fica no navegador.
'use strict';
const Updater = {
  init() { document.querySelectorAll('[onclick*="Updater"]').forEach(e => { e.style.display = 'none'; }); },
  open() {}, check() {}, pauseBox() {},
};
const Backup = {
  init() { document.querySelectorAll('[onclick*="Backup.restoreFromFile"]').forEach(e => { e.style.display = 'none'; }); },
  manual() { Game.save(); UI.toast('💾 Progresso salvo.'); },
  statusText() { return 'O progresso é salvo automaticamente neste navegador.'; },
  restoreFromFile() {},
};
