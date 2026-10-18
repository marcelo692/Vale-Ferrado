# Vale Ferrado

Jogo incremental de coleta em 3D, primeira pessoa, visual low-poly: comece com um graveto seco e chegue ao Martelo do Vale. Colete, venda, evolua e reconstrua a cidade do seu avô.

## Como baixar e jogar

1. Nesta página, clique no botão verde **Code** e depois em **Download ZIP**.
2. Extraia o arquivo ZIP numa pasta do seu computador.
3. Abra a pasta e dê dois cliques em **index.html**.

O jogo abre no navegador (Chrome, Edge ou Firefox). Não precisa instalar nada nem estar conectado à internet. O progresso é salvo automaticamente no seu computador.

## Atualizações

O jogo verifica sozinho se há versão nova (ao abrir e a cada 10 minutos). Quando houver, aparece um aviso verde no canto da tela: clique em **Ver e atualizar** e depois em **Atualizar agora**. Na primeira vez, escolha a pasta do jogo e permita salvar arquivos nela; das próximas vezes é um clique. Funciona no Chrome e no Edge. O botão **⬆ Atualizações** também verifica na hora.

## Controles

| Tecla | Ação |
| --- | --- |
| Mouse | Olhar em volta (clique na tela para prender o mouse) |
| W A S D | Andar |
| Shift | Correr (gasta fôlego; se zerar, você cansa) |
| Espaço | Pular: troncos, muros e penhascos são atalhos; com pulo alto o bastante você sobe neles e passa por cima |
| Segurar o botão esquerdo | Minerar na velocidade normal, sem cansar |
| Clicar várias vezes | Golpes quase 3x mais rápidos, mas cada clique gasta fôlego |
| E perto de um NPC | Abrir a loja |
| 1, 2, 3 | Ativar power-ups |
| V | Alternar primeira e terceira pessoa |
| I | Mostrar/esconder a tabela de evoluções e materiais |
| B | Mostrar/esconder as etiquetas de nível e valor em cima dos recursos |
| R | Subir/descer do transporte |
| L | Ligar/desligar a luz |
| G | Ligar/desligar o detector (no automático ele procura o que falta) · T escolhe na mão · Shift+T volta ao automático |
| M | Som on/off (volumes no botão 🔊 Som) |
| K | Salvar agora (navegador + arquivo save/progresso.json na pasta do jogo) |
| Esc | Soltar o mouse e abrir o menu de pausa |

## O que já tem

- Os 60 martelos, do graveto seco ao Martelo do Vale
- 34 recursos em 6 regiões, cada uma numa direção e mais longe que a anterior
- 11 montanhas espalhadas (subida lenta, sem correr) com 5 recursos raros que só existem perto do topo: Pedra-do-Vento, Âmbar Antigo, Ferro Celeste, Obsidiana Real e Coração da Montanha
- Martelos 20, 30, 40, 50 e 60, detector de satélite, esquadrilha de drones e hoverboard pedem 5 unidades de recurso raro
- Terreno com pequenos relevos e depressões
- 5 NPCs: Seu Bento (martelo), Dona Cida (mineração, mochila, movimento e pulo), Zé da Botica (power-ups), Seu Lauro (venda automática) e Tonho do Bazar (equipamentos)
- Equipamentos: detector de minério (3 níveis), transporte (patins, patinete, monociclo, hoverboard) e iluminação (lanterna, headlamp, drone, esquadrilha de drones)
- Música de fundo gerada pelo jogo (viola calma de dia, mais lenta e misteriosa à noite) e sons para tudo: passos por tipo de chão, golpes por material, quebra, moedas, forja, pulo, power-ups, vento, pássaros, grilos e riacho
- Ciclo de dia e noite (um dia dura 16 minutos), com estrelas, lua e luzes na cidade
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
| `js/audio.js` | Música e efeitos sonoros, todos sintetizados (sem arquivos de áudio) |
| `js/render3d.js` | Mundo 3D: céu, terreno, cidade, pedras, personagem e martelo na mão |
| `lib/three.min.js` | Three.js r149 (biblioteca 3D, incluída para rodar sem internet) |

Para balancear preços e valores, mexa em `js/data.js`.
