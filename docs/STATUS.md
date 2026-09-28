# Estado do projeto

Atualizado por Claude em 2026-09-28, após P2-01.

## Implementado

- Base TypeScript estrita e Fastify, separação de aplicação, infraestrutura, apresentação e composição.
- Interface de disponibilidade do banco e adaptador PostgreSQL.
- `GET /health` e `GET /ready`, validação do ambiente, logs e encerramento gracioso.
- Dockerfile, Compose com PostgreSQL 17 e volume persistente.
- Scripts de desenvolvimento, build, testes, lint e formatação; lockfile presente.
- Contrato normalizado, aritmética decimal e regras puras de conferência.
- Leitura em fluxo e adaptadores Alfa (`nested-json`) e Beta (`paired-csv`), com perfis em código.
- Schema Prisma, migração inicial com índices parciais, repositórios de pedido e conferência, prontidão pelo estado das migrações e migração como etapa própria do Compose.
- As seis rotas de negócio: ingestão multipart com spool, consulta com filtros e paginação, detalhe do pedido, conferência e relatório. Contrato em [API.md](API.md).
- Node 24.21.0, dependências npm instaladas e `.env` local criado.
- Guia de colaboração com entrada para ambos os agentes.

## Evidências e limitações

- `npm run check` passou após P1-04: geração do cliente, formato do schema Prisma, tipagem, lint com tipo em `src`, formatação, 169 casos de teste e build.
- Imagem de runtime construída e inspecionada sem executar container: sem CLI do Prisma e sem `mysql2`, que entrava por peer opcional e trazia CVE de credencial para uma aplicação que só fala PostgreSQL.
- Duas mil combinações aritméticas inteiras comparadas com `BigInt` passaram; `/health` e `/ready` foram exercitados via `inject` nos limites atuais.
- Três revisões registradas — [REVIEW-01](handoffs/REVIEW-01-codex.md), [REVIEW-02](handoffs/REVIEW-02-claude.md) e [REVIEW-03](handoffs/REVIEW-03-codex.md) — e os defeitos inequívocos das três estão fechados em [FIX-01](handoffs/FIX-01-claude.md), [FIX-02](handoffs/FIX-02-claude.md) e [FIX-03](handoffs/FIX-03-claude.md), cada um com regressão. Nenhum achado era falso positivo; dois defeitos adicionais apareceram durante as correções.
- Os quatro pontos que dependiam de decisão foram fechados em [FIX-04](handoffs/FIX-04-claude.md) e registrados em [ADR-012](decisions/ADR-012-notacao-por-campo.md). Seguem abertos, como tarefa própria: política de auditoria npm e pipeline de CI ([REVIEW-06](handoffs/REVIEW-06-pos-fix-06-p1-02-codex.md), R06-04 e R06-07).
- Cobertura por `npm run coverage`, comando versionado para o número não depender de quem mede: **94,68% de linhas e 89,28% de branches**. `purchase-order-repository.ts` continua o ponto baixo e não melhora sem banco (REVIEW-07, R07-11); as rotas de P1-04 são cobertas por teste que atravessa a borda HTTP com repositório em memória.
- **ENV-03 fechou a lacuna que atravessava todo o projeto.** `npm run test:integration` roda 16 testes contra PostgreSQL real e prova transação, advisory lock sob carga concorrente, os nove `CHECK`, o `RESTRICT` do histórico, a ordem das divergências e a paginação por cursor. Os índices parciais foram confirmados por `EXPLAIN`, não supostos.
- `docker compose up` do zero levanta banco, aplica a migração como etapa própria e só então sobe a API, com `/ready` em 200 — fecha os achados 1 e 2 de [REVIEW-02](handoffs/REVIEW-02-claude.md).
- Persistência de pedidos **e** do histórico de conferências após reinício do banco provada por `scripts/verify-persistence.mjs`.
- Sem `DATABASE_URL`, os 16 testes de integração são pulados: `npm run check` continua funcionando em máquina sem Docker.
- **P2-01 integrou Gama e Delta sem mudar uma coluna** do contrato normalizado. A única migração da Parte 2, `0002_staging_de_itens_orfaos`, não foi para acomodar formato de cliente: fechou a promessa do ADR-008 de reconciliar o item que chega antes do cabeçalho, que estava escrita e não implementada. Detalhe em [P2-01](handoffs/P2-01-claude.md).
- **P1-05 conferiu o serviço contra o enunciado, exigência por exigência.** `node scripts/validate-case.mjs` faz uma asserção por exigência contra o stack no ar: **18/18**. Detalhe em [P1-05](handoffs/P1-05-claude.md).
- **Volume medido, não suposto**: 50.000 pedidos e 150.000 itens carregados em 189,3s (264 pedidos/s); varredura de 500 páginas em 1,8s com **zero repetidos**; a última página custa 0,54× a primeira, o que prova o cursor contra `OFFSET`; memória plana em ~380MiB enquanto os pedidos iam de 5 mil a 50 mil.
- Três defeitos encontrados e fechados com regressão: recusa do framework (429, 413) virava 500; o teto de 120 req/min estrangulava a varredura noturna do próprio enunciado; e `docs/API.md` errava **todos** os nomes de parte e o cabeçalho da ingestão, então quem seguisse a documentação não carregava nada.
- `scripts/activate-node.sh` está apagado no working tree por alteração preexistente, preservada nesta revisão; o README ainda o referencia.

## Ainda não implementado

Pipeline de CI e política de exceção da auditoria npm. A espera de itens órfãos não tem expiração nem teto, e a política depende de dado de uso real ([ADR-008](decisions/ADR-008-ingestao.md)).

## Próxima retomada

**As features do enunciado estão completas para os quatro clientes.** A Parte 1 está marcada na tag `parte-1`; P2-01 integrou Gama e Delta, e `scripts/validate-case.mjs` verifica 27 exigências contra o serviço no ar.

O que falta não é produto: **pipeline de CI** e a **política de exceção da auditoria npm**, adiados pelo usuário desde o início e agora o único item aberto de peso.

Limitações que P1-05 revelou e deixou abertas: a carga de 50.000 pedidos é uma requisição HTTP de 3,2 minutos, que qualquer balanceador com tempo limite padrão derruba sem retomada; o teto de requisições é por origem e não por identidade, porque não há autenticação; e Windows-1252 com CRLF tem teste unitário, não fixture ponta a ponta.

Seguem sem tarefa: pipeline de CI, política de exceção da auditoria npm e separação de credenciais DDL/DML fora do ambiente local. Consultar o quadro antes de reservar arquivos.

## Colaboração

COL-02 estruturou a memória compartilhada e a leitura sob demanda. Ambos entram por `AGENTS.md`; o mapa está em [COLLABORATION.md](COLLABORATION.md). Resultado e validações: [handoff COL-02](handoffs/COL-02-codex.md).

## Escolhas em discussão

Confirmados pelo usuário: [PostgreSQL, ADR-001](decisions/ADR-001-postgresql.md), [TypeScript + Node.js, ADR-002](decisions/ADR-002-typescript-nodejs.md), [Fastify, ADR-003](decisions/ADR-003-fastify.md), [Prisma ORM 7, ADR-004](decisions/ADR-004-prisma-7.md) e as bibliotecas de P1-03 em [ADR-011](decisions/ADR-011-bibliotecas-p1-03.md). Prisma Migrate ainda precisa de confirmação operacional; os limites máximos de campos e decimais precisam ser definidos antes da borda HTTP.
