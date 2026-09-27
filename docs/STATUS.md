# Estado do projeto

Atualizado por Codex em 2026-09-27.

## Implementado

- Base TypeScript estrita e Fastify, separação de aplicação, infraestrutura, apresentação e composição.
- Interface de disponibilidade do banco e adaptador PostgreSQL.
- `GET /health` e `GET /ready`, validação do ambiente, logs e encerramento gracioso.
- Dockerfile, Compose com PostgreSQL 17 e volume persistente.
- Scripts de desenvolvimento, build, testes, lint e formatação; lockfile presente.
- Contrato normalizado, aritmética decimal e regras puras de conferência.
- Leitura em fluxo e adaptadores Alfa (`nested-json`) e Beta (`paired-csv`), com perfis em código.
- Node 24.21.0, dependências npm instaladas e `.env` local criado.
- Guia de colaboração com entrada para ambos os agentes.

## Evidências e limitações

- `npm run check` passou após P1-03: tipagem, lint, formatação, 66 casos em sete arquivos de teste e build.
- Cobertura medida em REVIEW-01: 96,00% de linhas, 81,53% de branches e 99,15% de funções no código carregado pela suíte.
- Duas mil combinações aritméticas inteiras comparadas com `BigInt` passaram; `/health` e `/ready` foram exercitados via `inject` nos limites atuais.
- REVIEW-01 encontrou riscos de validação e volume antes de P1-04: CNPJ contaminado aceito, fator de conversão inválido chegando à regra, notação brasileira permissiva, datas só sintáticas e lote Beta sem limite no caminho de cabeçalhos sem itens. Evidência e demais achados no [handoff](handoffs/REVIEW-01-codex.md).
- Os testes substituem banco e conexão; não validam PostgreSQL real, persistência ou reinício.
- Docker e Compose estão instalados, mas a tentativa de validação real foi interrompida e o usuário pediu para ignorá-la por enquanto. Não havia container do projeto depois da interrupção.
- `scripts/activate-node.sh` está apagado no working tree por alteração preexistente, preservada nesta revisão; o README ainda o referencia.

## Ainda não implementado

Tabelas, migrações e repositórios; casos de uso e rotas de ingestão, consulta, paginação, conferência e relatórios; correções dos limites levantados em REVIEW-01. Gama/Delta somente após o marco da Parte 1.

## Próxima retomada

Priorizar uma tarefa de estabilização para os achados de REVIEW-01, em especial os que podem virar dados inválidos ou consumo sem limite. P1-02 segue disponível; ENV-03 continua pendente e P1-04 depende de P1-02. Consultar o quadro antes de reservar arquivos.

## Colaboração

COL-02 estruturou a memória compartilhada e a leitura sob demanda. Ambos entram por `AGENTS.md`; o mapa está em [COLLABORATION.md](COLLABORATION.md). Resultado e validações: [handoff COL-02](handoffs/COL-02-codex.md).

## Escolhas em discussão

Confirmados pelo usuário: [PostgreSQL, ADR-001](decisions/ADR-001-postgresql.md), [TypeScript + Node.js, ADR-002](decisions/ADR-002-typescript-nodejs.md), [Fastify, ADR-003](decisions/ADR-003-fastify.md), [Prisma ORM 7, ADR-004](decisions/ADR-004-prisma-7.md) e as bibliotecas de P1-03 em [ADR-011](decisions/ADR-011-bibliotecas-p1-03.md). Prisma Migrate ainda precisa de confirmação operacional; os limites máximos de campos e decimais precisam ser definidos antes da borda HTTP.
