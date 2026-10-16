# Vale Ferrado

Jogo incremental de coleta em 3D, primeira pessoa, visual low-poly: comece com um graveto seco e chegue ao Martelo do Vale. Colete, venda, evolua e reconstrua a cidade do seu avô.

## Como baixar e jogar

1. Nesta página, clique no botão verde **Code** e depois em **Download ZIP**.
2. Extraia o arquivo ZIP numa pasta do seu computador.
3. Abra a pasta e dê dois cliques em **index.html**.

O jogo abre no navegador (Chrome, Edge ou Firefox). Não precisa instalar nada nem estar conectado à internet. O progresso é salvo automaticamente no seu computador.

## Controles

| Tecla | Ação |
| --- | --- |
| Mouse | Olhar em volta (clique na tela para prender o mouse) |
| W A S D | Andar |
| Shift | Correr (gasta fôlego; se zerar, você cansa) |
| Espaço | Pular (passa por cima de troncos, muros e penhascos) |
| Segurar o botão esquerdo | Minerar a pedra na mira |
| E perto de um NPC | Abrir a loja |
| 1, 2, 3 | Ativar power-ups |
| V | Alternar primeira e terceira pessoa |
| Esc | Soltar o mouse |

## O que já tem

- Os 60 martelos, do graveto seco ao Martelo do Vale
- 34 recursos em 6 regiões, cada uma numa direção e mais longe que a anterior
- 4 NPCs: Seu Bento (martelo), Dona Cida (mineração, mochila, movimento e pulo), Zé da Botica (power-ups) e Seu Lauro (venda automática)
- Power-ups que ocupam espaço na mochila e podem ser ativados juntos
- Respawn dinâmico: pedras voltam em outro lugar, com outro tamanho, às vezes raras; eventos de veio aflorado
- Personagem muda de visual a cada melhoria (martelo, mochila, luvas, calçados, pernas)
- Atalhos de pulo em cada região
- História com marcos a cada 10 níveis e cidade sendo reconstruída

## Estrutura do código

| Arquivo | Conteúdo |
| --- | --- |
| `index.html` | Página, estilos e laço principal |
| `js/data.js` | Tabelas do jogo: martelos, recursos, regiões, custos, power-ups, história |
| `js/world.js` | Mundo: trechos, obstáculos, nós de recurso e respawn |
| `js/game.js` | Regras: movimento, pulo, mineração, mochila, economia, salvamento |
| `js/ui.js` | Interface: HUD, lojas dos NPCs, avisos |
| `js/render3d.js` | Mundo 3D: céu, terreno, cidade, pedras, personagem e martelo na mão |
| `lib/three.min.js` | Three.js r149 (biblioteca 3D, incluída para rodar sem internet) |

Para balancear preços e valores, mexa em `js/data.js`.
