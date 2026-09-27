# Quadro de tarefas

Estados: disponível, aguardando, em andamento, em revisão, concluída. Responsável `—` significa que ninguém assumiu.

| ID        | Tarefa                                                           | Estado                         | Responsável | Dependência / escopo                                                        |
| --------- | ---------------------------------------------------------------- | ------------------------------ | ----------- | --------------------------------------------------------------------------- |
| ENV-01    | Criar base TypeScript/Fastify e Compose                          | concluída                      | Codex       | Arquivos existentes; execução real do Compose pendente em ENV-02            |
| COL-01    | Organizar colaboração e instalação                               | concluída                      | Codex       | AGENTS.md, CLAUDE.md, docs e link no README                                 |
| COL-02    | Estruturar contexto compartilhado e leitura sob demanda          | concluída                      | Codex       | Documentação; registro e arquivos abaixo                                    |
| DOC-01    | Versionar o enunciado e as amostras dos clientes                 | concluída                      | Claude      | Nenhuma; enunciado e fixtures, sem código de negócio                        |
| DOC-02    | Reestruturar README como artefato avaliado                       | aguardando                     | —           | P1-01; o enunciado cobra as defesas no README (docs/CASE.md)                |
| DOC-03    | Diagramar objetos e relações do contrato normalizado             | concluída                      | Claude      | P1-01; diagramas em docs/diagrams, sem código de negócio                    |
| ARCH-04   | Registrar escolha do ORM Prisma 7                                | concluída                      | Codex       | ADR-001, ADR-002 e ADR-003; documentação apenas                             |
| ARCH-05   | Registrar desenho de observabilidade (Grafana/Prometheus)        | aceita, implementação diferida | Claude      | Pedido do usuário; decisão apenas, sem dependência instalada                |
| ENV-02    | Instalar ferramentas do sistema                                  | aguardando                     | Usuário     | docs/SETUP.md                                                               |
| ENV-03    | Validar Compose, conexão e reinício do banco                     | aguardando                     | —           | ENV-02; ambiente, sem código de negócio                                     |
| ENV-04    | Verificar portas e isolar o Compose antes de subir               | concluída                      | Claude      | Pedido do usuário; preflight, nome fixo do projeto e portas por env         |
| REPO-01   | Inicializar Git, commit base e fluxo de branches                 | concluída                      | Claude      | Commit base autorizado pelo usuário; docs/GIT_WORKFLOW.md                   |
| REVIEW-01 | Revisar base e plano técnico                                     | concluída                      | Codex       | Limites de P1-03 e HTTP testados; achados no handoff                        |
| REVIEW-02 | Revisar arquitetura contra o enunciado                           | concluída                      | Claude      | Achados para P1-01, P1-02 e ENV-03; sem editar código                       |
| REVIEW-03 | Consolidar verificação pós-FIX-02 para a outra IA                | concluída                      | Codex       | Handoff documental; riscos residuais e retomada                             |
| REVIEW-04 | Preparar plano de fix: arquitetura, segurança, CI/CD e Docker    | concluída                      | Codex       | Revisão documental; não altera código nem arquivos reservados por FIX-04/05 |
| P1-01     | Definir contrato normalizado e decisões de negócio               | concluída                      | Claude      | ADR-006 a ADR-010, docs/API.md, tipos e portas; libera P1-02 e P1-03        |
| P1-02     | Implementar schema, migrações e repositórios                     | em andamento                   | Claude      | P1-01, ADR-004 e ADR-012; validação real depende de ENV-03                  |
| P1-03     | Implementar domínio e adaptadores Alfa/Beta                      | concluída                      | Claude      | P1-01; ADR-011; libera P1-04                                                |
| FIX-01    | Estabilizar validação e limites de REVIEW-01                     | concluída                      | Claude      | REVIEW-01; sete achados corrigidos com regressão; libera P1-04              |
| FIX-02    | Verificação pós-FIX-01: vazamento de origem e notações sem teste | concluída                      | Claude      | Dois defeitos corrigidos; notação por campo fica para decisão               |
| FIX-03    | Fechar riscos residuais de REVIEW-02 e REVIEW-03                 | concluída                      | Claude      | Cinco defeitos fechados; quatro decisões listadas em aberto                 |
| FIX-04    | Fechar os pontos que dependiam de decisão                        | concluída                      | Claude      | ADR-012: notação por campo, teto do Beta, pool por propósito, lint com tipo |
| FIX-05    | Congelar presets e perfis exportados                             | concluída                      | Claude      | Preset de pool era mutável por referência; deepFreeze compartilhado         |
| P1-04     | Integrar API, conferência e relatório paginado                   | aguardando                     | —           | P1-02; P1-03 e FIX-01 concluídas; combinar responsabilidade por arquivo     |
| P1-05     | Validar desafio e registrar marco parte-1                        | aguardando                     | —           | P1-04; persistência, concorrência, precisão e paginação                     |
| P2-01     | Integrar Gama/Delta e documentar mudanças                        | aguardando                     | —           | P1-05                                                                       |

Ao assumir tarefa, acrescentar abaixo: ID, responsável, arquivos reservados e dependências. Uma tarefa só pode ter um responsável de implementação por vez.

## REVIEW-01 — revisão da base

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md`, `docs/STATUS.md`, `docs/handoffs/REVIEW-01-codex.md`.
- Escopo: inspeção do código e configuração, checks locais, cobertura e testes exploratórios de limites; nenhum código de produção ou teste do projeto alterado.
- Dependências: persistência real continua dependendo de P1-02 e ENV-03.
- Evidência: [handoff REVIEW-01](handoffs/REVIEW-01-codex.md); `npm run check` verde, cobertura medida e sondas temporárias executadas.

## REVIEW-03 — handoff pós-FIX-02

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md`, `docs/handoffs/REVIEW-03-codex.md`.
- Escopo: consolidar para a outra IA o que foi corrigido, os riscos residuais reproduzidos e a ordem recomendada de retomada; sem editar código.
- Dependências: FIX-01 e FIX-02 concluídas.
- Evidência: [handoff REVIEW-03](handoffs/REVIEW-03-codex.md).

## REVIEW-04 — plano de fix de arquitetura e operação

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/TASKS.md`, `docs/handoffs/REVIEW-04-arquitetura-seguranca-cicd-docker-codex.md`.
- Escopo: consolidar achados de arquitetura e ampliar a revisão para segurança, CI/CD e Docker, com prioridade e critérios de aceite; nenhuma correção de código ou configuração nesta tarefa.
- Dependências: considera FIX-04 e FIX-05 já concluídas para não pedir novamente correções que o Claude acabou de entregar.
- Evidência: [handoff REVIEW-04](handoffs/REVIEW-04-arquitetura-seguranca-cicd-docker-codex.md); `npm run check`, `docker compose config --quiet` e `docker build --check .` verdes; `npm audit --audit-level=low` sem vulnerabilidades conhecidas na data da revisão.

## COL-02 — contexto compartilhado e leitura sob demanda

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/COLLABORATION.md`, `docs/TASKS.md`, `docs/STATUS.md`, `docs/HANDOFF_TEMPLATE.md`, `docs/TECHNICAL_PLAN.md`, `docs/decisions/README.md`, `docs/handoffs/COL-02-codex.md`.
- Escopo: entrada curta comum, mapa de contexto, handoffs objetivos e decisões consultadas por tarefa; sem novas dependências.
- Dependências: nenhuma. Atualizações do quadro e estado executadas sequencialmente por Codex; preservar o registro de REVIEW-01.
- Evidência: [handoff COL-02](handoffs/COL-02-codex.md); `npm run check` passou. Sem revisão de Claude registrada.

## ARCH-01 — registrar escolha do banco

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `README.md`, `docs/TASKS.md`, `docs/STATUS.md`, `docs/decisions/README.md`, `docs/decisions/ADR-001-postgresql.md`, `docs/handoffs/ARCH-01-codex.md`.
- Escopo: documentar a escolha explícita do usuário; demais ferramentas em discussão. Sem instalação ou alteração de serviços.
- Dependências: nenhuma; edição sequencial dos documentos por Codex, preservando REVIEW-01.
- Evidência: [handoff ARCH-01](handoffs/ARCH-01-codex.md).

## ARCH-02 — registrar linguagem e runtime

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `README.md`, `docs/TASKS.md`, `docs/STATUS.md`, `docs/decisions/README.md`, `docs/decisions/ADR-002-typescript-nodejs.md`, `docs/handoffs/ARCH-02-codex.md`.
- Escopo: registrar TypeScript e Node.js aceitos pelo usuário; sem alterar código, dependências ou serviços.
- Dependências: nenhuma; atualizações documentais sequenciais por Codex, preservando REVIEW-01.
- Evidência: [handoff ARCH-02](handoffs/ARCH-02-codex.md).

## ARCH-03 — registrar framework HTTP

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `README.md`, `docs/TASKS.md`, `docs/STATUS.md`, `docs/decisions/README.md`, `docs/decisions/ADR-003-fastify.md`, `docs/handoffs/ARCH-03-codex.md`.
- Escopo: registrar aceite explícito de Fastify; sem alteração de código, dependências ou serviços.
- Dependências: ADR-002; atualização documental sequencial por Codex, preservando REVIEW-01.
- Evidência: [handoff ARCH-03](handoffs/ARCH-03-codex.md).

## ARCH-04 — registrar ORM

- Responsável: Codex.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `README.md`, `docs/TASKS.md`, `docs/STATUS.md`, `docs/decisions/README.md`, `docs/decisions/ADR-004-prisma-7.md`, `docs/handoffs/ARCH-04-codex.md`.
- Escopo: registrar Prisma 7 como ORM aceito pelo usuário; sem instalar dependências ou alterar código.
- Dependências: ADR-001, ADR-002 e ADR-003; preservar a reserva de REVIEW-01.
- Evidência: [handoff ARCH-04](handoffs/ARCH-04-codex.md).

## DOC-01 — enunciado e amostras versionados

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/CASE.md`, `docs/CASE.pdf`, `tests/fixtures/**`, `.prettierignore`, `README.md` (uma linha de link), `docs/TASKS.md`, `docs/handoffs/DOC-01-claude.md`.
- Escopo: transcrever o enunciado para consulta local e reproduzir as amostras dos quatro clientes como fixtures. Sem código de negócio, sem contrato normalizado e sem decisão de regra.
- Dependências: nenhuma. Não toca `docs/STATUS.md` nem os arquivos reservados por REVIEW-01.
- Evidência: [handoff DOC-01](handoffs/DOC-01-claude.md); `npm run check` passou.

## REPO-01 — Git, commit base e fluxo de branches

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/GIT_WORKFLOW.md`, `.gitattributes`, `docs/COLLABORATION.md` (link e duas linhas do mapa), `docs/TASKS.md`, `docs/handoffs/REPO-01-claude.md`.
- Escopo: branch principal `main`, commit base único importando a base existente e convenção de branch por tarefa. Sem alteração de código de aplicação.
- Dependências: autorização explícita do usuário para o commit base, que inclui trabalho do Codex ainda sem revisão registrada.
- Evidência: [handoff REPO-01](handoffs/REPO-01-claude.md).

## REVIEW-02 — revisão de arquitetura

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/handoffs/REVIEW-02-claude.md`, `docs/TASKS.md`.
- Escopo: revisão de arquitetura contra o enunciado e as ADR aceitas; treze achados, nenhuma correção aplicada. Não substitui REVIEW-01, que segue com o Codex.
- Dependências: nenhuma. Não edita código, `docs/STATUS.md` nem arquivos reservados por REVIEW-01.
- Evidência: [handoff REVIEW-02](handoffs/REVIEW-02-claude.md).

## ENV-04 — verificação de portas e isolamento do Compose

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `scripts/preflight-docker.mjs`, `compose.yaml`, `package.json`, `.env.example`, `eslint.config.js`, `README.md`, `docs/TASKS.md`, `docs/handoffs/ENV-04-claude.md`.
- Escopo: verificação antes de subir o Compose, para não colidir com serviço já em execução no host, e isolamento do projeto Docker. Sem código de negócio e sem mexer em `/ready` (mantido por decisão do usuário).
- Dependências: ambiente é frente proposta do Codex em `COLLABORATION.md`; esta tarefa foi pedida explicitamente pelo usuário, que tem prioridade conforme `AGENTS.md`. ENV-03 segue sem responsável; se o Codex assumir, alinhar antes de editar `compose.yaml`.
- Evidência: [handoff ENV-04](handoffs/ENV-04-claude.md); três caminhos do preflight exercitados; `npm run check` verde; Compose real não subido (é ENV-03).

## ARCH-05 — desenho de observabilidade

- Responsável: Claude.
- Estado: concluída como registro; implementação diferida para depois do marco `parte-1`.
- Arquivos alterados (reservas liberadas): `docs/decisions/ADR-005-observabilidade.md`, `docs/decisions/README.md`, `docs/TASKS.md`, `docs/handoffs/ARCH-05-claude.md`.
- Evidência: [handoff ARCH-05](handoffs/ARCH-05-claude.md); `npm run check` verde; nada validado contra Grafana ou Prometheus reais, que não existem nesta máquina.
- Escopo: registrar como a aplicação se conecta a Grafana e Prometheus, o consentimento de quem executa e a convenção de nomes e labels. Nenhuma dependência instalada, nenhum endpoint criado.
- Dependências: nenhuma para o registro. A implementação depende de P1-01 e P1-03, porque os labels saem do contrato e dos adaptadores.

## P1-01 — contrato normalizado e decisões de negócio

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `docs/decisions/ADR-006-modelo-normalizado.md` a `ADR-010-paginacao.md`, `docs/decisions/README.md`, `docs/API.md`, `src/domain/**`, `src/application/ports/**`, `docs/COLLABORATION.md`, `README.md`, `docs/TASKS.md`, `docs/handoffs/P1-01-claude.md`.
- Escopo: modelo normalizado, identidade, situação canônica, política decimal e de unidade, contrato de ingestão, taxonomia de divergências, paginação e contrato HTTP. Contrato em tipos e portas, sem implementação: adaptadores são P1-03 e schema é P1-02.
- Dependências: nenhuma. Libera P1-02 e P1-03 para trabalho paralelo. Entrada: pontos abertos de `docs/CASE.md` e achados de `docs/handoffs/REVIEW-02-claude.md`.
- Evidência: [handoff P1-01](handoffs/P1-01-claude.md); `npm run check` verde; sem teste novo, porque o entregável é tipo e decisão, não comportamento.

## DOC-03 — diagramas de objetos e relacoes

- Responsavel: Claude.
- Estado: concluida.
- Arquivos alterados (reservas liberadas): `docs/diagrams/**`, `scripts/render-diagrams.mjs`, `eslint.config.js` (globais `Buffer` e `fetch` no bloco de `scripts/**`), `docs/COLLABORATION.md` (uma linha do mapa), `README.md` (uma secao curta), `docs/TASKS.md`, `docs/handoffs/DOC-03-claude.md`.
- Escopo: representar em PlantUML os objetos de P1-01 e suas relacoes, com fonte versionada e SVG renderizado. Diagrama derivado do contrato: nao altera tipo, porta nem decisao. O modelo entidade-relacionamento das tabelas pertence a P1-02.
- Dependencias: P1-01 concluida. Nao toca `src/**`, `package.json`, `docs/STATUS.md` nem os arquivos reservados por REVIEW-01.
- Evidencia: [handoff DOC-03](handoffs/DOC-03-claude.md); `npm run check` verde; diagramas renderizados pelo servidor publico do PlantUML e inspecionados visualmente. Sem PlantUML local: nao ha render offline.

## P1-03 — domínio e adaptadores Alfa/Beta

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/domain/decimal.ts`, `src/domain/conference-rules.ts`, `src/domain/schemas.ts`, `src/domain/client.ts` (mapa de campos do perfil), `src/infrastructure/integrations/**`, `tests/*.test.ts` (novos), `package.json` e `package-lock.json` (tres dependencias), `docs/decisions/ADR-011-bibliotecas-p1-03.md`, `docs/decisions/README.md`, `docs/diagrams/**` (regerar), `docs/TASKS.md`, `docs/handoffs/P1-03-claude.md`.
- **Lockfile liberado:** decimal.js, stream-json e csv-parse entraram nesta tarefa, por escolha do usuario registrada em [ADR-011](decisions/ADR-011-bibliotecas-p1-03.md).
- Evidencia: [handoff P1-03](handoffs/P1-03-claude.md); `npm run check` verde com 66 testes; adaptadores exercitados contra as fixtures reais de Alfa e Beta. Nada tocou banco, HTTP ou Docker.
- Escopo: aritmética decimal sem ponto flutuante, as sete regras de conferência de ADR-009, leitores de fluxo JSON e CSV, os adaptadores `nested-json` (Alfa) e `paired-csv` (Beta) e os perfis em código. Implementa o contrato de P1-01 sem alterá-lo.
- Dependências: P1-01. **Não toca** `prisma/`, `src/infrastructure/database/`, `src/presentation/`, `src/main/` nem `package.json`, que são P1-02 e P1-04. Se o Codex assumir P1-02, os dois andam em paralelo; combinar antes de mexer em `package.json`.

## FIX-01 — estabilizar validação e limites

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/domain/{decimal,schemas}.ts`, `src/infrastructure/integrations/{field-parsers,csv-stream,client-profiles,nested-json-adapter,paired-csv-adapter}.ts`, `tests/*.test.ts`, `docs/TASKS.md`, `docs/handoffs/FIX-01-claude.md`.
- Escopo: os sete achados de [REVIEW-01](handoffs/REVIEW-01-codex.md), cada um com teste de regressão. Corrige o que P1-03 entregou; não acrescenta funcionalidade nem toca contrato de porta.
- Dependências: REVIEW-01 concluída. **Não toca** `prisma/`, `src/infrastructure/database/`, `src/presentation/`, `src/main/` nem `package.json`. P1-02 segue livre para o Codex em paralelo.
- Prioridade adotada, diferente da ordem do handoff: a normalização brasileira permissiva (achado 4) vem primeiro, porque é a única que **altera um valor monetário** em silêncio; as demais aceitam entrada ruim sem mudar número.
- Evidência: [handoff FIX-01](handoffs/FIX-01-claude.md); `npm run check` verde com 81 testes; os sete achados foram reproduzidos antes da correção e um oitavo apareceu durante ela.

## FIX-02 — verificação pós-FIX-01

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/infrastructure/integrations/{json-stream,csv-stream}.ts`, `tests/verificacao-pos-fix-01.test.ts`, `docs/TASKS.md`, `docs/handoffs/FIX-02-claude.md`.
- Escopo: passada adversarial sobre o que FIX-01 entregou, com cobertura medida. Dois defeitos encontrados nos leitores e as notações que Alfa e Beta não exercitam. Sem mudança de contrato.
- Dependências: FIX-01. Não toca `src/domain/`, `package.json` nem arquivos de P1-02.
- Evidência: [handoff FIX-02](handoffs/FIX-02-claude.md); `npm run check` verde com 86 testes; cobertura 98,07% de linhas e 87,11% de branches. Um problema de contrato ficou registrado sem correção: `numberFormat` é único por cliente e o Gama não cabe nisso.

## FIX-03 — riscos residuais de REVIEW-02 e REVIEW-03

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/domain/{decimal,schemas,conference-rules}.ts`, `src/infrastructure/integrations/field-parsers.ts`, `package.json` (só o script `test`), `docs/STATUS.md`, `tests/*.test.ts`, `docs/TASKS.md`, `docs/handoffs/FIX-03-claude.md`.
- Escopo: os defeitos inequívocos dos dois reviews — amplificação por expoente antes do schema, identidade de fornecedor comparada com leniência no domínio, máscara híbrida de CNPJ, `isoInstantSchema` só sintático, e o glob de teste que ignora subpastas em silêncio. **Não** resolve o que exige decisão: notação por campo, teto de memória do Beta, `query_timeout` e lint type-aware.
- Dependências: REVIEW-02, REVIEW-03. `package.json` volta a ficar reservado; P1-02 deve aguardar ou alinhar antes de mexer nele.
- Evidência: [handoff FIX-03](handoffs/FIX-03-claude.md); `npm run check` verde com 92 testes; cobertura 98,26% de linhas e 87,08% de branches. `package.json` liberado.

## FIX-04 — pontos que dependiam de decisão

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/domain/client.ts`, `src/infrastructure/integrations/{record-mapping,client-profiles,paired-csv-adapter}.ts`, `src/infrastructure/database/pool.ts` (novo), `src/presentation/http/app.ts` (uma linha), `src/main/server.ts`, `eslint.config.js`, `docs/decisions/ADR-012-notacao-por-campo.md` e o índice, `docs/diagrams/**` (regerar), `tests/*.test.ts`, `docs/TASKS.md`, `docs/handoffs/FIX-04-claude.md`.
- Escopo: os quatro pontos que FIX-03 deixou abertos por exigirem decisão, autorizados pelo usuário. Muda contrato (`ClientProfile`), então exige ADR e regeração dos diagramas.
- Dependências: FIX-03. `src/main/server.ts` é composição e encosta em P1-02: alinhar se o Codex assumir P1-02 antes do merge.
- Evidência: [handoff FIX-04](handoffs/FIX-04-claude.md) e [ADR-012](decisions/ADR-012-notacao-por-campo.md); `npm run check` verde com 95 testes; perfil sintético com a notação real do Gama passa.

## FIX-05 — congelar presets e perfis exportados

- Responsável: Claude.
- Estado: concluída.
- Arquivos alterados (reservas liberadas): `src/infrastructure/database/pool.ts`, `src/infrastructure/integrations/client-profiles.ts`, `tests/fix-04-decisoes.test.ts`, `docs/TASKS.md`, `docs/handoffs/FIX-05-claude.md`.
- Escopo: `poolOptionsFor` devolvia o preset compartilhado por referência; mutar o retorno corrompia o preset para todo mundo. Mesma classe do perfil mutável de REVIEW-03. Sem mudança de contrato.
- Dependências: FIX-04.
- Evidência: [handoff FIX-05](handoffs/FIX-05-claude.md); `npm run check` verde com 97 testes.

## P1-02 — schema, migrações e repositórios

- Responsável: Claude.
- Estado: em andamento.
- Arquivos reservados: `prisma/**`, `database/migrations/README.md`, `src/infrastructure/database/**`, `src/application/ports/pagination.ts` (só se o cursor exigir), `package.json` e `package-lock.json` (Prisma 7), `.gitignore`, `Dockerfile`, `compose.yaml`, `tests/*.test.ts`, `docs/TASKS.md`, `docs/handoffs/P1-02-claude.md`.
- Escopo: schema Prisma, migração inicial com os índices que o requisito 1 exige, e as implementações de `PurchaseOrderRepository` e `ConferenceRepository`. Resolve também os achados 1, 2, 3 e 8 de [REVIEW-02](handoffs/REVIEW-02-claude.md).
- Dependências: P1-01 (contrato), ADR-004 (Prisma 7), ADR-012 (pool por propósito). **A validação contra PostgreSQL real é ENV-03** e depende de o usuário autorizar subir o Compose; até lá, migração e consultas não são exercitadas contra banco.
- Nota de posse: `package.json` volta a ficar reservado enquanto durar.
