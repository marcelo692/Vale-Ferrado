// =============================================================
// Vale Ferrado — integração com portais (CrazyGames). Sem o SDK carregado, tudo aqui vira "não faz nada".
// =============================================================
'use strict';
const Platform = {
  sdk: null, playing: false,
  async init() {
    try {
      if (window.CrazyGames && window.CrazyGames.SDK) { await window.CrazyGames.SDK.init(); this.sdk = window.CrazyGames.SDK; this.sdk.game.loadingStart(); }
    } catch (e) { this.sdk = null; }
  },
  ready() { try { if (this.sdk) this.sdk.game.loadingStop(); } catch (e) {} },
  // jogando de verdade (não pausado, sem menu aberto)
  play(on) {
    if (on === this.playing) return; this.playing = on;
    try { if (this.sdk) on ? this.sdk.game.gameplayStart() : this.sdk.game.gameplayStop(); } catch (e) {}
  },
  // comemoração do site (usar pouco: só nos grandes marcos)
  happy() { try { if (this.sdk) this.sdk.game.happytime(); } catch (e) {} },
};
