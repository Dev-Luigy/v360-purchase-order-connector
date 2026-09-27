# Estado do projeto

Atualizado por Codex em 2026-09-27.

## Implementado

- Base TypeScript estrita e Fastify, separação de aplicação, infraestrutura, apresentação e composição.
- Interface de disponibilidade do banco e adaptador PostgreSQL.
- `GET /health` e `GET /ready`, validação do ambiente, logs e encerramento gracioso.
- Dockerfile, Compose com PostgreSQL 17 e volume persistente.
- Scripts de desenvolvimento, build, testes, lint e formatação; lockfile presente.
- Node 24.21.0 isolado em `.tools/node`, dependências npm instaladas e `.env` local criado.
- Guia de colaboração com entrada para ambos os agentes.

## Evidências e limitações

- `npm run check` passou: tipagem, lint, formatação, testes HTTP via inject e build.
- Os testes substituem a conexão; não validam PostgreSQL real.
- Docker não estava instalado na inspeção. Compose, build da imagem e persistência real ainda não foram executados.
- Tentativa de iniciar o servidor compilado foi bloqueada pelo sandbox com `listen EPERM`. A solicitação para testar fora do sandbox foi interrompida pelo usuário; não considerar esse teste aprovado.
- Em COL-02, `git rev-parse --show-toplevel` reconheceu a raiz deste projeto; `git status --short` mostrou arquivos não rastreados. Commit inicial e conclusão de REPO-01 não foram verificados. Claude não foi iniciado por Codex nesta tarefa.
- O usuário assumiu a instalação das ferramentas. Não há instalação do sistema em andamento por Codex.

## Ainda não implementado

Modelo de negócio, tabelas e runner de migração, ingestão Alfa/Beta, consulta e filtros, paginação, conferência e relatórios. Gama/Delta somente após o marco da Parte 1.

## Próxima retomada

Usuário instala requisitos de `SETUP.md`. Depois, validar Compose e banco em ENV-03. REVIEW-01 continua registrada com Codex; Claude deve consultar o quadro antes de assumir trabalho. A implementação de negócio deve partir dos contratos de P1-01.

## Colaboração

COL-02 estruturou a memória compartilhada e a leitura sob demanda. Ambos entram por `AGENTS.md`; o mapa está em [COLLABORATION.md](COLLABORATION.md). Resultado e validações: [handoff COL-02](handoffs/COL-02-codex.md).

## Escolhas em discussão

Confirmados pelo usuário: [PostgreSQL, ADR-001](decisions/ADR-001-postgresql.md), [TypeScript + Node.js, ADR-002](decisions/ADR-002-typescript-nodejs.md), [Fastify, ADR-003](decisions/ADR-003-fastify.md) e [Prisma ORM 7, ADR-004](decisions/ADR-004-prisma-7.md). Prisma Migrate ainda precisa de confirmação operacional; precisão decimal, validação, ingestão, paginação e testes permanecem em discussão.
