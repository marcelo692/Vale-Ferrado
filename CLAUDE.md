# Vale Ferrado — notas para desenvolvimento

- Jogo em HTML/JS puro + Three.js (lib/three.min.js), roda abrindo index.html (file://) sem servidor.
- O jogo tem um atualizador (js/updater.js) que compara GAME_VERSION (js/data.js) com version.json no GitHub.
- **Toda mudança publicada precisa de versão nova**, senão o atualizador do jogador não percebe:
  `python3 tools/release.py <nova-versão> "novidade 1" "novidade 2"` (atualiza GAME_VERSION e version.json), depois commit e push.
- version.json lista todos os arquivos baixados pelo atualizador (gerado a partir de `git ls-files`; rode `git add` antes do release).
- Textos do jogo em português do Brasil.
