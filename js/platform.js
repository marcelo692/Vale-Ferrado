// =============================================================
// Vale Ferrado — integração com portais (CrazyGames). Sem o SDK carregado, tudo aqui vira "não faz nada".
// =============================================================
'use strict';
const Platform = {
  sdk: null, playing: false,
  async init() {
    try {
      if (window.CrazyGames && window.CrazyGames.SDK) {
        await window.CrazyGames.SDK.init(); this.sdk = window.CrazyGames.SDK; this.sdk.game.loadingStart();
        // idioma: o que a CrazyGames manda (system info), com inglês se não for um dos nossos; a escolha do jogador sempre vale mais
        const info = this.sdk.user && this.sdk.user.systemInfo, loc = info && info.locale;
        let saved = null; try { saved = localStorage.getItem('vf_lang'); } catch (e) {}
        if (!saved) {
          const l = typeof loc === 'string' ? loc.slice(0, 2).toLowerCase() : 'en', want = LANGS[l] ? l : 'en';
          let ok = false; try { localStorage.setItem('vf_lang', want); ok = localStorage.getItem('vf_lang') === want; } catch (e) {}
          if (ok && want !== LANG) { location.reload(); return; } // só recarrega se a escolha ficou salva (senão entraria em laço)
        }
      }
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
