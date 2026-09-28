# Handoff: P1-02 — schema, migrações e repositórios

- Agente e data: Claude, 2026-09-28.
- Estado: concluída como código; **validação contra PostgreSQL real é ENV-03 e não aconteceu**.
- Objetivo e resultado: materializar o contrato de P1-01 em tabelas e implementar as duas portas de repositório. Implementado: schema, migração inicial com os índices que o requisito 1 exige, geração do cliente, os dois repositórios, prontidão pelo schema e migração como etapa própria do Compose.

## Arquivos

- `prisma/schema.prisma`, `prisma.config.ts`, `database/migrations/0001_contrato_normalizado/migration.sql` e o README da pasta.
- `src/infrastructure/database/{cursor,mapping,prisma-client,purchase-order-repository,conference-repository,schema-readiness}.ts`; `postgres-health.ts` removido por virar código morto.
- `src/main/server.ts`, `Dockerfile`, `compose.yaml`, `package.json` (scripts de geração), `.gitignore` e `.prettierignore`.
- `tests/database-unit.test.ts`.

## Prisma 7 não é Prisma 6 — o spike que REVIEW-02/9 pediu, na prática

Três mudanças de arquitetura apareceram e custaram iteração:

1. **`url` saiu do datasource.** Vai para `prisma.config.ts`, e o cliente passa a exigir adaptador de driver, porque a linha 7 não tem motor Rust. Usamos `@prisma/adapter-pg`, sobre o `pg` que o projeto já tinha — efeito colateral bom: o pool volta a ser escolha nossa, então os presets por propósito de ADR-012 valem também para o Prisma.
2. **A linha 7 não lê `.env` sozinha.** O config carrega explicitamente quando o arquivo existe; em container a variável vem do ambiente. A URL é opcional de propósito: `validate` e `generate` não precisam de banco, e exigi-la quebraria `npm run check` em máquina sem `.env`.
3. **`--to-schema-datamodel` virou `--to-schema`.**

## Decisões que o schema materializa

- **Identidade** `(clientId, externalNumber)` como única; identidade interna em UUID v7, ordenável no tempo, que é o que faz o cursor de ADR-010 avançar pelos mesmos índices que sustentam os filtros.
- **Decimal** em `NUMERIC(30, 6)`: escala 6 de ADR-007, precisão 30 porque o contrato admite 24 dígitos inteiros. O Prisma devolve `runtime.Decimal`, que é decimal.js — a mesma biblioteca do domínio —, então a ponte é `toFixed()` e nada passa por `number`.
- **Saldo** persistido por item e sinalizado no pedido, com dois **índices parciais escritos à mão** (`WHERE has_pending_balance`), porque o schema do Prisma não declara `WHERE` e comparar pedido contra recebido não usaria índice (REVIEW-02, achado 3).
- **Divergências em tabela própria**, e não JSON: o relatório do requisito 3 conta ocorrência por código, e isso precisa de índice. A nota conferida fica em JSONB, porque é retrato e não é consultada por campo.
- **Saldo negativo é preservado.** Recebimento acima do pedido existe em ERP; zerar apagaria informação real. Quem decide se há algo a receber é a comparação com zero.

## Três achados antigos fechados

- **REVIEW-02/1:** o Compose ganhou serviço `migrate` que roda `prisma migrate deploy` e termina; a API só sobe com `service_completed_successfully`. A imagem de runtime não leva o CLI do Prisma nem precisa de DDL.
- **REVIEW-02/2:** `/ready` passou a consultar `_prisma_migrations` em vez de `SELECT 1`. Banco vazio agora reprova, que era o caso em que o healthcheck mentia.
- **REVIEW-02/8:** uma pasta só. O `prisma.config.ts` aponta para `database/migrations/`, que o repositório já tinha reservado.

## Validação, e o que ela não cobre

`npm run check` verde: tipagem, lint com tipo em `src`, formatação, **109 testes** e build. `docker compose config --quiet` e `docker build --check .` passam.

O lint com tipo pagou por si de novo: pegou `String(unknown)` na impressão digital dos filtros, onde um objeto viraria `[object Object]` e dois filtros diferentes teriam a mesma impressão — exatamente o que ela existe para impedir.

**O que não foi validado, e é muito:** nada rodou contra PostgreSQL. A migração nunca foi aplicada, a transação e o advisory lock nunca foram exercitados, nenhum plano de consulta foi observado e os índices parciais não foram confirmados em uso. Subir o Compose é mudança de serviço, que o `AGENTS.md` reserva ao usuário.

**Os repositórios em si não têm teste.** Os 109 casos cobrem cursor, impressão digital, chave de lock, limites de página e conversões — as partes puras. `replaceSnapshot`, `list`, `save` e `summarize` são código que parece pronto e ninguém executou. Isso é o mesmo risco que apontei em FIX-02 e vale repetir: até ENV-03, tratá-los como não verificados.

## Pendências e próxima ação

- **ENV-03 é o próximo passo natural** e precisa de autorização para subir o Compose. Com o banco no ar: aplicar a migração, escrever a suíte de integração (persistência após reinício, reingestão, concorrência do mesmo pedido, paginação com filtros) e confirmar que os índices parciais entram no plano.
- O papel de runtime deve ficar sem DDL quando sair do ambiente local (REVIEW-04, R04-05); hoje o Compose usa um usuário só.
- `user: node` no serviço `migrate` não foi verificado em container real.
- P1-04 depende disto e já tem o pool de ingestão pronto para usar.
- Fora do escopo, não é meu: `scripts/activate-node.sh` segue apagado e o `README.md:41` ainda o referencia.
- Posse: reservas de P1-02 liberadas, inclusive `package.json`.
- Revisão: não realizada.
