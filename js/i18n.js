// =============================================================
// Vale Ferrado — idiomas. O texto-fonte é o português: tt('texto em português', ...args)
// devolve a tradução do idioma escolhido ({0}, {1}… são trocados pelos argumentos).
// Trocar de idioma salva a escolha e recarrega a página.
// =============================================================
'use strict';
const LANGS = {
  pt: { n: 'Português', loc: 'pt-BR' },
  en: { n: 'English', loc: 'en-US' },
  es: { n: 'Español', loc: 'es-ES' },
  tr: { n: 'Türkçe', loc: 'tr-TR' },
};
const I18N = { pt: {}, en: {}, es: {}, tr: {} };
const LANG = (() => {
  try { const s = localStorage.getItem('vf_lang'); if (LANGS[s]) return s; } catch (e) {}
  const nav = String((navigator.languages && navigator.languages[0]) || navigator.language || 'en').slice(0, 2).toLowerCase();
  return LANGS[nav] ? nav : 'en';
})();
const LOCALE = LANGS[LANG].loc, DEC = LANG === 'en' ? '.' : ',';
function tt(k, ...a) {
  let s = I18N[LANG][k];
  if (s === undefined) s = k;
  return a.length ? s.replace(/\{(\d+)\}/g, (m, i) => (a[i] === undefined ? m : a[i])) : s;
}
function setLang(l) {
  if (!LANGS[l] || l === LANG) return;
  try { localStorage.setItem('vf_lang', l); } catch (e) {}
  try { if (window.Game && Game.S) Game.save(); } catch (e) {}
  location.reload();
}
// traduz o texto fixo do index.html (texto de cada nó, sem os espaços das pontas) e os title=""
function trDom(root) {
  document.documentElement.lang = LANGS[LANG].loc;
  if (LANG === 'pt') return;
  const d = I18N[LANG], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = [];
  while (w.nextNode()) list.push(w.currentNode);
  for (const n of list) {
    const k = n.nodeValue.trim(); if (!k || d[k] === undefined) continue;
    n.nodeValue = n.nodeValue.replace(k, () => d[k]);
  }
  root.querySelectorAll('[title]').forEach(e => { const k = e.getAttribute('title'); if (d[k] !== undefined) e.setAttribute('title', d[k]); });
}
if (LANG !== 'pt') document.write('<script src="js/lang/' + LANG + '.js"><\/script>');
