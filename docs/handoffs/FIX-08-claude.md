# Handoff: FIX-08 — achados de código de REVIEW-07

- Agente e data: Claude, 2026-09-28.
- Estado: concluída.
- Objetivo e resultado: reproduzir e fechar os achados de [REVIEW-07](REVIEW-07-geral-codex.md) que são defeito de código. **Seis reproduzidos por sonda antes da correção, os seis procedem.** Mais o aviso de OpenSSL no estágio de build.

## R07-01 — o arredondamento silencioso, de novo

O pior, e é o meu erro recorrente: guarda numa camada, buraco na camada de cima.

O `Decimal` lança em vez de arredondar em soma, subtração e multiplicação — construí isso no FIX-01 justamente porque você pediu para não perder nada. E então o adaptador chamava `toText(6)`, que arredonda sem avisar. A sonda mostrou o resultado:

```
plain 0.0000001 -> 0.000000     o valor simplesmente some
plain 1.9999999 -> 2.000000
br    1,0000005 -> 1.000001
```

O contrato aceitava doze casas decimais para colunas `NUMERIC(30,6)`, então havia dois caminhos de perda: o adaptador arredondava antes do schema, e qualquer outro chamador de `replaceSnapshot` deixaria o PostgreSQL arredondar na coerção.

A correção separa **escala de cálculo** de **escala persistida**: `maxDecimalPlaces` (12) continua valendo para quantidade de nota e valor total, que são comparados e não gravados; `maxPersistedDecimalPlaces` (6) vale para o que vai para a coluna. E `parseDecimal` passa a **rejeitar** o excesso em vez de arredondar — cliente que precise de mais casas é decisão de contrato, não acidente.

## R07-03 — NUL passava pelo contrato e morria na gravação

`z.string()` aceita `�`; o PostgreSQL não o representa em `text`, `varchar` nem `jsonb`. O dado atravessava a aplicação inteira e abortava só na escrita. Criei `persistedText`, aplicado a todo texto que vai para coluna, incluindo as strings dentro do JSONB da nota. Só o NUL é recusado: Unicode válido continua passando, e nada é removido nem truncado em silêncio.

## R07-02 — os limites entravam depois da alocação que deviam impedir

Três buracos distintos, todos confirmados:

- `csv-parse` sem `max_record_size` — a opção vem **ilimitada por padrão**, e existe exatamente para impedir que um campo sem fim encha o buffer.
- o teto de itens por pedido era só o `.max()` do Zod, que roda quando a lista já existe: um pedido podia acumular milhões de itens antes de alguém reclamar. Agora a checagem acontece **antes do push**.
- o conjunto `closed` crescia com todo número de pedido visto nos itens, inclusive órfãos que nunca entravam no mapa de cabeçalhos — escapando do teto que protegia o índice.

Fica um limite conhecido: no JSON aninhado, o `stream-json` materializa um pedido inteiro antes da validação. O tamanho de um elemento é limitado pelo teto de corpo da requisição, que P1-04 precisa definir. Está registrado, não resolvido.

## R07-07, R07-06 e R07-08

- **Cabeçalho de CSV duplicado**: `A;A` devolvia o último valor. Um export com coluna repetida podia trocar identidade, quantidade ou preço sem ninguém perceber. Agora coluna repetida ou sem nome é recusada antes da primeira linha.
- **`taxIdMasked` nunca era lido**: o perfil prometia uma regra que ninguém cumpria. Agora ele decide o que é aceito, e uma mudança de formato no ERP do cliente vira rejeição em vez de passar despercebida. O `clientId` do perfil também ganhou o limite da coluna.
- **Moeda**: `ZZZ` passava por "ISO 4217" e caía numa escala padrão de duas casas — assumir escala é decidir o resultado da conferência por omissão. Virou allowlist versionada, e `currencyScale` **lança** para moeda sem escala declarada.

## Validação

`npm run check` verde: **132 testes**. Build real dos estágios `runtime` e `migrate`, os dois agora sem aviso de OpenSSL — FIX-07 tinha resolvido só o de migração.

**Cobertura corrigida no STATUS**, como a revisão pediu: **94,08% de linhas, 89,20% de branches**. O número antigo de 98,26% era anterior aos repositórios e não representava mais a base. `purchase-order-repository.ts` está em 57,73% de linhas e 30,77% de funções, e isso não melhora sem banco.

## Fora de escopo, e por quê

- **R07-04 e R07-09** (agregado da conferência montado pelo caso de uso, invariantes de coerência): a correção certa é P1-04 construir o registro a partir do pedido carregado, não o repositório desconfiar de quem o chama. Misturar agora seria escrever o caso de uso dentro do repositório.
- **R07-05** (igualdade bidirecional de tipo, `strictObject`, devolver `result.data`): parte é decisão de política — sanitizar ou rejeitar campo desconhecido — e vale decidir junto com a borda HTTP.
- **R07-10** (CI, política de auditoria, empacotamento sem `rm -rf`): tarefa própria, e depende de decisão sua sobre severidade aceita e prazo de exceção.
- **R07-11** (integração com PostgreSQL): ENV-03.
- **R07-12** (observabilidade e hardening): depois de P1-04, quando houver o que observar.

## Pendências e próxima ação

- **ENV-03** segue sendo o caminho crítico.
- As bibliotecas que a revisão recomenda para P1-04 — provider Zod do Fastify, `@fastify/multipart` com limites, `fast-check` — não foram instaladas: a decisão é sua e o lugar delas é quando a rota existir.
- Posse: reservas de FIX-08 liberadas.
- Revisão: não realizada.
