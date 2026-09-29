# Handoff: FIX-16 — o ciclo de vida da ingestão, de verdade

- Agente e data: Claude, 2026-09-29.
- Estado: concluída.
- Objetivo: fechar R15-01, R15-02 e R15-03 de [REVIEW-15](REVIEW-15-validacao-integral-pos-fix-15-codex.md), que o usuário pediu para corrigir antes de refazer a validação com banco limpo.

## Os dois graves eram o mesmo problema

Em FIX-15 eu introduzi a publicação da espera para fechar uma corrida. Publiquei **tudo de uma vez ao fim da leitura** e consolidei depois, pedido a pedido. Essa forma cria duas falhas:

**R15-01 — a leitura que falha não desfaz nada.** As linhas nascem invisíveis; se o `for await` termina com erro, elas ficam no banco sem caminho de recuperação. Reproduzido pela rota, com JSON truncado depois de 700 itens válidos:

```
antes   HTTP 500  erro_interno   600 linhas nao publicadas deixadas
depois  HTTP 422  payload_incompativel   0 linhas
```

E havia **10.600 linhas** acumuladas no banco pelas sondas anteriores — o "crescimento permanente" que o review descreveu, já materializado.

**R15-02 — publicar antes de contabilizar permite apropriação cruzada.** Entre a publicação global e a consolidação de cada pedido, outra requisição podia consumir uma linha que ainda pertencia ao relatório desta carga. A linha sumia da contabilidade: o dado final ficava certo, mas o relatório mentia, e o requisito 3 cobra exatamente o relatório.

**A correção é uma só:** `finalizeStaged` fecha **cada pedido sob o lock dele**, decidindo ali entre aplicar (o cabeçalho existe) e publicar (não existe). Publicação e contabilização passam a acontecer na mesma transação, então não há intervalo em que a linha esteja visível e ainda não contada.

Sonda de 1.500 pedidos com cabeçalho concorrente:

```
carga item-only: aceitos=1 recusas=0 espera=1500
contabilizado=1501 de 1501 registros   (fecha)
```

Mais duas peças que o review pediu e que o `catch` não alcança:

- `discardIngestion` desfaz o que a carga gravou quando a leitura falha;
- `discardAbandonedStaging`, chamado no start, remove espera não publicada com mais de uma hora — o caso da **queda do processo**, que nenhum `catch` cobre. Uma hora é folgado: a carga mais longa medida, 50.000 pedidos, levou pouco mais de três minutos.

E o erro estrutural do leitor virou `PayloadError`, traduzido para **422**. O parser em fluxo lança `Error` comum, então `toProblem` o tratava como defeito interno: payload inválido corriqueiro virava `erro_interno`.

## R15-03 — o cenário que não testava o que o nome dizia

O 13º cenário criava um pedido com três itens e mandava um quarto por item-only. Como o pedido já existia, o item era aplicado pela própria carga: **não havia resíduo nenhum na espera**, e portanto nada de R14-03 era exercitado. Falso positivo, e o review está certo.

Refeito pelo caminho real: uma carga só de itens deixa três esperando, o cabeçalho chega depois e recupera exatamente três, e um segundo reenvio do cabeçalho — sem nada esperando — relata zero. É o terceiro passo que prende o defeito original.

## Evidência

```
npm run check              245 testes, 0 falhas
npm run test:integration    31 testes contra PostgreSQL real
npm run validate:http       14/14 pelas rotas da aplicação
```

O cenário novo, `payload malformado responde 422 e não deixa resíduo`, é a regressão de R15-01 pela rota.

## Uma nota sobre o teste que quebrou ao corrigir

O teste de integração de duas cargas concorrentes passou a falhar, e por um motivo correto: o auxiliar dele agora **fecha** o pedido, então a primeira carga aplicava antes de a segunda existir. Ele foi reescrito para as duas gravarem antes de qualquer uma fechar — que é o entrelaçamento que o achado descreve. Do jeito anterior ele não provava nada.

## Pendências

- R15-04 (deriva do README) fechado junto: `validate:http` são 14 cenários, e a limitação sobre Windows-1252 saiu porque FINAL-01 acrescentou a fixture.
- Continua aberto o R14-04 inteiro: **CI, política de auditoria npm, autenticação, separação DDL/DML e prova com mais de uma réplica**.
- A varredura de espera abandonada é por réplica, no start, e não é coordenação entre réplicas.
- Posse: reservas de FIX-16 liberadas.
- Não commitado e **não meu**: `Dockerfile`, `compose.yaml` e `prisma/schema.prisma` carregam CLEAN-01 do Codex. `scripts/activate-node.sh` segue apagado por alteração preexistente.
- Revisão: não realizada.
