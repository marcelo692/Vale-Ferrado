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
  // anúncio com prêmio: o jogador escolhe ver; o prêmio só vem se o anúncio terminar.
  // Na CrazyGames usa o SDK; fora dela (versão do PC) mostra um anúncio de TESTE de 3 segundos.
  rewarded(onReward, onFail) {
    if (this.adBusy) return; this.adBusy = true;
    const wasMuted = Snd.muted, wasPlaying = this.playing;
    const start = () => { Snd.muted = true; Snd.apply(); this.play(false); document.body.classList.add('adon'); };
    const stop = () => { Snd.muted = wasMuted; Snd.apply(); document.body.classList.remove('adon'); this.adBusy = false; if (wasPlaying) this.play(true); };
    const fail = () => { stop(); UI.toast(tt("Anúncio indisponível agora. Tente de novo daqui a pouco."), 'warn'); if (onFail) onFail(); };
    try {
      if (this.sdk && this.sdk.ad) {
        this.sdk.ad.requestAd('rewarded', { adStarted: start, adFinished: () => { stop(); onReward(); }, adError: fail });
        return;
      }
    } catch (e) { fail(); return; }
    // anúncio de teste (versão do PC): tela preta de 3 s com contagem
    start();
    const el = document.createElement('div'); el.id = 'fakead'; document.body.appendChild(el);
    let n = 3; const tick = () => { el.innerHTML = `<b>${tt("ANÚNCIO DE TESTE")}</b><span>${tt("Na CrazyGames aqui passa um anúncio de verdade.")}</span><i>${n}</i>`; };
    tick(); const iv = setInterval(() => { n--; if (n > 0) tick(); else { clearInterval(iv); el.remove(); stop(); onReward(); } }, 1000);
  },
  hasAds() { return true; },
  // comemoração do site (usar pouco: só nos grandes marcos)
  happy() { try { if (this.sdk) this.sdk.game.happytime(); } catch (e) {} },
};
