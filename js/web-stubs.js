// Versão para portais (CrazyGames): sem atualizador e sem salvar em pasta. O progresso fica no navegador.
'use strict';
const Updater = {
  init() { document.querySelectorAll('[onclick*="Updater"]').forEach(e => { e.style.display = 'none'; }); },
  open() {}, check() {}, pauseBox() {},
};
const Backup = {
  init() { document.querySelectorAll('[onclick*="Backup.restoreFromFile"]').forEach(e => { e.style.display = 'none'; }); },
  manual() { Game.save(); UI.toast(tt('💾 Progresso salvo.')); },
  statusText() { return tt('O progresso é salvo automaticamente neste navegador.'); },
  restoreFromFile() {},
};

// modo dev não vai para a CrazyGames: só um objeto vazio para o jogo não quebrar
const Dev = { on: false, fly: false, oneHit: false, updateFly() {}, open() {} };
document.querySelectorAll('[onclick*="Dev.open"]').forEach(e => { e.style.display = 'none'; });
