# REVIEW-10 — verificação pós-FIX-10 e cobertura de cenários

- Agente e data: Codex, 2026-09-29.
- Escopo: conferir as correções do FIX-10, a implementação do enunciado, os limites de tipos e requisições e a cobertura real dos testes.
- Produção preservada: esta revisão só alterou o quadro e este handoff.

## Veredito

O FIX-10 corrigiu os defeitos centrais do REVIEW-09: consumo transacional do staging, lock por pedido, validação das linhas Gama, recusa de grupos fora de ordem, validação de item órfão, teto de cabeçalhos, pools separados e invariantes da conferência. Os 24 testes PostgreSQL passaram e o repositório de pedidos chegou a 99,53% de linhas na cobertura integrada.

As funcionalidades pedidas pelo enunciado existem para Alfa, Beta, Gama e Delta. Ainda não recomendo encerrar a revisão sem um FIX-11: encontrei uma falha de atomicidade/desempenho no caminho normal de itens avulsos do Delta, duas incorreções de relatório/lote, um conflito de cabeçalho aceito silenciosamente e um validador ponta a ponta dependente do estado anterior do banco.

Não é possível provar que uma suíte cobre literalmente todos os cenários. O que foi feito aqui foi conferir as classes relevantes do contrato e criar sondas adversariais para as combinações que não estavam nos testes. Quatro dessas sondas reproduziram comportamento incorreto.

## Evidência executada

| Verificação                         | Resultado atual                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `npm run check`                     | passou: geração, schema, tipos, lint, formato, testes e build                   |
| `npm run test:integration`          | 24/24 contra PostgreSQL real                                                    |
| suíte completa com banco e coverage | 226/226; 98,54% linhas, 88,66% branches, 98,07% funções                         |
| `npm run coverage` sem banco        | 94,63% linhas e 89,65% branches; não mede de verdade os repositórios PostgreSQL |
| `docker compose up -d --build api`  | build passou; API e banco ficaram `healthy`                                     |
| `node scripts/validate-case.mjs`    | 26/27 no banco já usado; falha reproduzida e explicada em R10-05                |
| `npm audit --omit=dev --json`       | 4 altas, todas na cadeia Prisma → `@prisma/config`/`deepmerge-ts`/`mysql2`      |

A cobertura integrada é a medida útil para persistência. A cobertura padrão deixa `purchase-order-repository.ts` em 54,37% porque pula o banco; com PostgreSQL ativo ele ficou em 99,53%. Percentual alto não detectou os defeitos semânticos abaixo.

## Conferência do enunciado

- Requisito 1: consulta unificada, quatro filtros, combinação com cursor e detalhe com recebido/pendente estão implementados e testados.
- Requisito 2: conferência, todas as divergências estruturadas, caixa/unidade do Gama e decimal exato estão implementados e testados.
- Requisito 3: histórico, resumo, motivos, filtros e paginação estão implementados e testados.
- Exigências não opcionais: PostgreSQL, persistência, identidade por cliente, reenvio, Compose e paginação estão implementados. A tag anotada `parte-1` existe.
- Parte 2: Gama e Delta estão integrados; o banco possui staging persistente e a migração `0003` acrescenta as invariantes da conferência.
- README: as justificativas de conferência, reenvio e desencontro do Delta estão presentes. As contagens de validação ainda derivaram; ver R10-06.

Assim, não encontrei feature obrigatória totalmente ausente. O problema atual é a robustez de alguns caminhos implementados e da própria evidência ponta a ponta.

## Achados

### R10-01 — alta — itens avulsos do mesmo pedido Delta não formam uma transação por pedido

Fontes:

- `src/application/use-cases/ingest-purchase-orders.ts:73-87`
- `src/infrastructure/database/purchase-order-repository.ts:75-107`
- `README.md:71` e `docs/decisions/ADR-008-ingestao.md:24`

Quando chega somente a consulta de itens do Delta e o pedido já existe, o caso de uso chama `applyLooseItem` uma vez por linha. Cada chamada abre uma transação, lê o pedido inteiro, remove/recria seus itens e incrementa `ingestionVersion`.

Sonda reproduzida com a fixture oficial:

```text
DL-2026-0044: ingestionVersion 1 -> 3 ao reenviar uma única consulta com 2 linhas
relatório: ordersAccepted=0, itemsAccepted=3, stagedTotal=1
```

Consequências:

- contradiz a decisão registrada de transação por pedido;
- uma falha na segunda linha deixa a primeira confirmada, expondo retrato parcial;
- para N linhas do mesmo pedido, regravar o retrato crescente linha a linha tende a O(N²);
- a versão avança por linha, não por retrato/carga aceita.

Correção esperada: agrupar itens avulsos por `(clientId, externalNumber)` e criar uma operação de repositório que aplique o grupo sob um lock e uma transação. Testar rollback do grupo, incremento único de versão, concorrência e volume próximo do teto.

### R10-02 — média — carga só de cabeçalhos conta itens antigos como aceitos

Fonte: `src/application/use-cases/ingest-purchase-orders.ts:54-60`.

O caso de uso soma `saved.items.length`. Em `items: null`, o repositório devolve também os itens preservados de cargas anteriores, embora nenhum item tenha vindo na requisição atual.

Sonda reproduzida: depois da carga completa do Delta, reenviar somente `orders.json` devolve `ordersAccepted=3` e `itemsAccepted=3`; o correto para itens recebidos nessa carga é zero. O mesmo erro ocorre quando uma linha rejeitada faz o adaptador preservar o conjunto anterior.

Correção esperada: o retorno da operação deve carregar a quantidade efetivamente aplicada nessa transação, distinguindo entrada atual, itens recuperados do staging e itens apenas preservados. Acrescentar regressão para cabeçalho puro sobre pedido existente.

### R10-03 — média — R09-05 ficou parcial: rejeições do Delta continuam sem lote

Fonte: `src/infrastructure/integrations/split-json-adapter.ts:75,94-99,163-175,199-207`.

O adaptador passou a render `staged` em lotes, mas guarda todas as rejeições num único array até terminar os arquivos. Um arquivo composto apenas por linhas inválidas cresce sem o `batchSize`; o teto de cabeçalhos também conta apenas cabeçalhos válidos.

Sonda com `batchSize=2` e cinco itens inválidos:

```json
[{ "orders": 0, "rejected": 5, "staged": 0 }]
```

O lote prometido era 2. Isso reabre a parte de memória de R09-05 para entradas adversariais.

Correção esperada: escoar rejeições durante a leitura, sem esperar a iteração final dos cabeçalhos. Testar arquivos somente com cabeçalhos inválidos e somente com itens inválidos.

### R10-04 — média — cabeçalhos Delta duplicados e conflitantes usam “último vence” silenciosamente

Fonte: `src/infrastructure/integrations/split-json-adapter.ts:75-93`.

`pendentes.set(externalNumber, ...)` sobrescreve o primeiro cabeçalho. Duas linhas válidas para `DUP`, uma aberta/Fornecedor Primeiro e outra bloqueada/Fornecedor Segundo, produziram um pedido bloqueado do segundo fornecedor e zero rejeições.

Gama já recusa cabeçalhos repetidos que discordam. Delta precisa de política igualmente explícita: conflito deve recusar o pedido; duplicata idêntica deve ser deduplicada ou rejeitada conforme decisão documentada. Cobrir os dois casos.

### R10-05 — média — `validate-case.mjs` não é hermético nem repetível

Fontes: `scripts/validate-case.mjs:155-165` e `scripts/validate-case.mjs:276-285`.

O script pressupõe contagens globais exatas. Depois dos testes de integração, o pedido `delta:DL-7` permaneceu no banco; a validação encontrou seis pedidos pendentes em vez de cinco e terminou 26/27. Uma segunda execução também acumula as conferências criadas pelo próprio script, enquanto exige `checked === 2`.

Isso não demonstra falha do filtro `pending`; demonstra que o artefato usado para afirmar 27/27 só funciona sobre estado implícito e limpo.

Correção esperada: executar contra banco efêmero/isolado, ou usar um identificador exclusivo por execução e comparar deltas/conjuntos pertencentes à execução. A futura CI deve reconstruir a imagem e rodar essa validação isolada.

### R10-06 — baixa — contagens e migrações documentadas derivaram novamente

Fontes:

- `README.md:145-151` ainda diz 16 testes de integração;
- `docs/STATUS.md:21` diz 218 no total, calculado como 202 sem banco + 16 pulados;
- a execução integrada atual registrou 226 testes: 202 sem banco + 24 PostgreSQL;
- `docs/STATUS.md:56` ainda termina a enumeração em `0002`, embora `0003_invariantes_da_conferencia` exista.

R09-09, portanto, não está completamente fechado. Evitar contagens manuais repetidas ou gerar a evidência a partir do comando executado.

### R10-07 — baixa — resíduo da limpeza de comentários

`src/infrastructure/database/purchase-order-repository.ts:42-49` tem o mesmo JSDoc duplicado. Não afeta execução, mas é uma regressão pequena em relação ao CLEAN-01.

## O que a suíte cobre bem

- regras de conferência e decimais, inclusive caixas, preço periódico, linhas repetidas e todas as divergências;
- schemas Zod nas bordas HTTP e na saída dos adaptadores, limites de texto/decimal/lista e NUL;
- parsing em chunks, UTF-8/Windows-1252, CRLF, CSV com aspas e JSON sem conversão por `double`;
- paginação, fingerprint de filtro, índices por `EXPLAIN`, locks e transações reais;
- rollback e concorrência do staging no PostgreSQL;
- 400/404/413/422/429 e sanitização de 5xx;
- composição dos pools separados e fechamento gracioso.

Zod está aplicado nas fronteiras relevantes; não encontrei novo ponto em que apenas um tipo TypeScript esteja protegendo dado externo. Os achados atuais são de semântica, atomicidade e controle de recursos, que validação de schema não resolve.

## Cenários que faltam virar regressão

1. Delta: múltiplos itens avulsos do mesmo pedido em uma transação e uma versão.
2. Delta: falha no segundo item avulso desfaz o primeiro.
3. Delta: carga só de cabeçalho reporta zero itens novos; reconciliação reporta apenas os realmente recuperados.
4. Delta: rejeições respeitam `batchSize` em arquivos sem nenhum registro válido.
5. Delta: cabeçalhos duplicados idênticos e conflitantes.
6. Delta: volume de muitos itens de um mesmo pedido já existente; hoje o teste de volume cobre Alfa/Beta, não este caminho.
7. E2E: duas execuções consecutivas do validador e execução depois da suíte de integração.

## Segurança e operação ainda abertas

Não são features ausentes do enunciado, mas continuam sem fechamento:

- não existe pipeline de CI;
- `npm audit` reporta quatro altas na cadeia de tooling do Prisma. A imagem da API remove explicitamente Prisma CLI, `@prisma/config`, `deepmerge-ts` e `mysql2`, mas a imagem efêmera de migração ainda usa o tooling; falta política de exceção, rastreio e prazo;
- staging não tem expiração nem teto global/por cliente;
- credenciais DDL e DML continuam compartilhadas fora da separação ideal;
- autenticação/autorização não foi pedida pelo desafio e segue corretamente fora do escopo declarado.

## Ordem sugerida para FIX-11

1. R10-01 e R10-02 juntos, porque exigem tornar explícito o resultado da operação por pedido.
2. R10-03 e R10-04 no adaptador Delta.
3. R10-05 numa execução isolada de Compose/CI.
4. R10-06 e R10-07 como fechamento documental e de limpeza.

Arquivos prováveis: porta e repositórios de pedido, caso de uso de ingestão, `split-json-adapter.ts`, testes P2/integration, `validate-case.mjs`, README e STATUS. Registrar a reserva antes de editar, porque esses arquivos atravessam domínio, banco e documentação compartilhada.

## Estado do working tree observado

Antes desta revisão já existiam alterações em `Dockerfile`, `compose.yaml`, `prisma/schema.prisma` e a remoção de `scripts/activate-node.sh`; foram preservadas. Esta tarefa acrescentou apenas `docs/TASKS.md` e este handoff.
