# Estado do projeto

Atualizado por Claude em 2026-09-28, após P1-04.

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
- Cobertura por `npm run coverage`, comando versionado para o número não depender de quem mede: **94,69% de linhas e 89,50% de branches**. `purchase-order-repository.ts` continua o ponto baixo e não melhora sem banco (REVIEW-07, R07-11); as rotas de P1-04 são cobertas por teste que atravessa a borda HTTP com repositório em memória.
- Os testes substituem banco e conexão; não validam PostgreSQL real, persistência ou reinício.
- Docker e Compose estão instalados, mas a tentativa de validação real foi interrompida e o usuário pediu para ignorá-la por enquanto. Não havia container do projeto depois da interrupção.
- `scripts/activate-node.sh` está apagado no working tree por alteração preexistente, preservada nesta revisão; o README ainda o referencia.

## Ainda não implementado

Validação contra PostgreSQL real, suíte de integração e pipeline de CI. Gama/Delta somente após o marco da Parte 1.

## Próxima retomada

**ENV-03 é o caminho crítico.** O código de P1-02 existe e nada dele rodou contra PostgreSQL: migração não aplicada, transação e advisory lock não exercitados, índices parciais não confirmados em plano. Subir o Compose é mudança de serviço e depende de autorização do usuário. Depois disso, P1-04 (casos de uso e rotas) está liberada. ENV-03 continua pendente e destrava a validação real de banco e Compose. Limites de corpo, página e multipart ficam para P1-04, como REVIEW-01 apontou. Consultar o quadro antes de reservar arquivos.

## Colaboração

COL-02 estruturou a memória compartilhada e a leitura sob demanda. Ambos entram por `AGENTS.md`; o mapa está em [COLLABORATION.md](COLLABORATION.md). Resultado e validações: [handoff COL-02](handoffs/COL-02-codex.md).

## Escolhas em discussão

Confirmados pelo usuário: [PostgreSQL, ADR-001](decisions/ADR-001-postgresql.md), [TypeScript + Node.js, ADR-002](decisions/ADR-002-typescript-nodejs.md), [Fastify, ADR-003](decisions/ADR-003-fastify.md), [Prisma ORM 7, ADR-004](decisions/ADR-004-prisma-7.md) e as bibliotecas de P1-03 em [ADR-011](decisions/ADR-011-bibliotecas-p1-03.md). Prisma Migrate ainda precisa de confirmação operacional; os limites máximos de campos e decimais precisam ser definidos antes da borda HTTP.
