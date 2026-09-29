# Handoff: FIX-15 — os três achados técnicos de REVIEW-14

- Agente e data: Claude, 2026-09-29.
- Estado: concluída.
- Objetivo: fechar R14-01, R14-02 e R14-03, com aceitação por HTTP real conforme a revisão exigiu.

## R14-01 — defeito que eu introduzi em FINAL-01

Reproduzi por HTTP antes de tocar em código, com o deslocamento que a revisão descreve:

```
antes   aceitos=0  recusas=1  espera=2   (SHIFT e TARGET)
        reenviando so o cabecalho: aceitos=1 -> pedido com 1 item
```

O pedido declarado **integralmente recusado** deixava item para trás, e um reenvio de cabeçalho o aplicava.

São **duas** falhas no mesmo lugar, e eu só tinha visto zero delas.

**A determinística.** Quando um pedido estoura o teto no meio de um lote, a purga apaga o que os lotes anteriores gravaram — mas os itens desse mesmo pedido **já percorridos no lote atual** continuavam na lista a gravar, e eram regravados logo depois. Meu validador passava por acidente de alinhamento: 10.001 itens consecutivos com lote 200 põem o estouro numa fronteira, onde a lista está vazia. Um órfão de outro pedido antes desloca em uma posição e quebra.

**A corrida.** Enquanto uma carga lê os lotes, as linhas dela ficavam visíveis para a reconciliação de outra requisição. Um cabeçalho concorrente levava o prefixo; se a carga depois recusasse o pedido por teto, o que foi levado não voltava. Filtrar o último lote não fecha isso.

A migração `0007` dá o ciclo de vida mínimo: a linha nasce **não publicada** e só vira visível quando a carga termina de ler. Um pedido recusado é purgado sem nunca ter sido visível.

```
depois  aceitos=0  recusas=1  espera=1   (só SHIFT)
        reenviando so o cabecalho: aceitos=0 -> pedido com 0 itens
```

## R14-02 — a varredura não tinha fim próprio

O cursor só levava o limite inferior. Sob escrita contínua, a varredura persegue o que entra e não tem condição de término — e é esse o cenário do requisito 1.

**O meu script não provava o contrário**, e a revisão está certa ao apontar: o escritor dele era finito, então qualquer varredura terminava quando o produtor acabava. Passar não significava nada sobre término.

O cursor foi para a **versão 2** e carrega o teto fixado na primeira página: `{ v, after, until, f }`. Cursor da versão 1 é recusado, que é para isso que o campo de versão existe desde o começo. [ADR-010](../decisions/ADR-010-paginacao.md) registra a mudança e o que ela assume: a varredura é um retrato, e o que entra depois fica para a próxima.

O script foi refeito para provar o que faltava — o escritor agora só para **depois** da varredura, e há prazo de segurança que derruba o teste se ela não terminar sozinha:

```
páginas varridas          402 em 1.4s
cargas novas durante ela  250 pedidos em 3 lotes
escrita continuou depois  2 lotes      <- a varredura terminou por decisão própria
repetidos                 0
do conjunto inicial       20000 de 20000 apareceram
```

## R14-03 — `recovered` contava item antigo como recuperado

Saía da cardinalidade final do retrato: com `items: null`, a base da mesclagem inclui os itens já gravados, e a subtração os contava como recuperados agora. Passou a sair de `esperando.length` — os itens de fato consumidos da espera, depois da deduplicação por linha.

Eu havia **declarado essa correção no handoff de FIX-14** e ela não estava no código: a substituição que escrevi não casou e eu não conferi. É a segunda vez que um handoff meu afirma algo que o código não faz.

## Aceitação

`npm run validate:http` foi de 10 para **13 cenários**, com os três que a revisão exigiu:

```
✔ pedido recusado por teto não deixa item nenhum, mesmo desalinhado
✔ cabeçalho concorrente não consome o prefixo de uma carga em andamento
✔ carga só de cabeçalho relata só o que veio da espera
```

```
npm run check              245 testes, 0 falhas
npm run test:integration    31 testes contra PostgreSQL real
npm run validate:http       13/13 pelas rotas da aplicação
npm run validate:sweep      termina sozinha, com o escritor ainda ativo
node scripts/validate-case.mjs   30/30
```

O cursor da aplicação real, decodificado: `{"v":2,...,"until":"01a0ee03-..."}`; o da versão 1 volta `cursor_invalido`.

## O que a vizinhança rendeu

O ciclo de vida da espera quebrou todos os testes de integração que chamam o repositório direto — corretamente, porque eles pulavam a publicação, que é do caso de uso. Ajustá-los deixou explícito onde a fronteira está.

E o `detalhe()` do script de aceitação paginava o cliente inteiro para achar um pedido; com ~60 mil pedidos de medições anteriores, isso batia no teto de requisições. Passou a usar o filtro por número, que é o mesmo conserto que o outro validador já tinha recebido — eu não tinha propagado.

## Pendências

- R14-04 continua aberto por inteiro: **CI, política de auditoria npm, autenticação, separação DDL/DML, TTL da espera e prova com mais de uma réplica**. São decisões de ambiente, não conserto.
- Posse: reservas de FIX-15 liberadas.
- Não commitado e **não meu**: `Dockerfile`, `compose.yaml` e `prisma/schema.prisma` carregam CLEAN-01 do Codex — no `schema.prisma` preparei o commit para levar só o campo novo. `scripts/activate-node.sh` segue apagado por alteração preexistente.
- Revisão: não realizada.
