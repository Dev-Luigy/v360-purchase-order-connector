# Quadro de tarefas

Estados: disponível, aguardando, em andamento, em revisão, concluída. Responsável `—` significa que ninguém assumiu.

| ID        | Tarefa                                                    | Estado                         | Responsável | Dependência / escopo                                                |
| --------- | --------------------------------------------------------- | ------------------------------ | ----------- | ------------------------------------------------------------------- |
| ENV-01    | Criar base TypeScript/Fastify e Compose                   | concluída                      | Codex       | Arquivos existentes; execução real do Compose pendente em ENV-02    |
| COL-01    | Organizar colaboração e instalação                        | concluída                      | Codex       | AGENTS.md, CLAUDE.md, docs e link no README                         |
| COL-02    | Estruturar contexto compartilhado e leitura sob demanda   | concluída                      | Codex       | Documentação; registro e arquivos abaixo                            |
| DOC-01    | Versionar o enunciado e as amostras dos clientes          | concluída                      | Claude      | Nenhuma; enunciado e fixtures, sem código de negócio                |
| DOC-02    | Reestruturar README como artefato avaliado                | aguardando                     | —           | P1-01; o enunciado cobra as defesas no README (docs/CASE.md)        |
| ARCH-04   | Registrar escolha do ORM Prisma 7                         | concluída                      | Codex       | ADR-001, ADR-002 e ADR-003; documentação apenas                     |
| ARCH-05   | Registrar desenho de observabilidade (Grafana/Prometheus) | aceita, implementação diferida | Claude      | Pedido do usuário; decisão apenas, sem dependência instalada        |
| ENV-02    | Instalar ferramentas do sistema                           | aguardando                     | Usuário     | docs/SETUP.md                                                       |
| ENV-03    | Validar Compose, conexão e reinício do banco              | aguardando                     | —           | ENV-02; ambiente, sem código de negócio                             |
| ENV-04    | Verificar portas e isolar o Compose antes de subir        | concluída                      | Claude      | Pedido do usuário; preflight, nome fixo do projeto e portas por env |
| REPO-01   | Inicializar Git, commit base e fluxo de branches          | concluída                      | Claude      | Commit base autorizado pelo usuário; docs/GIT_WORKFLOW.md           |
| REVIEW-01 | Revisar base e plano técnico                              | em andamento                   | Codex       | Revisão solicitada pelo usuário; sem editar código                  |
| REVIEW-02 | Revisar arquitetura contra o enunciado                    | concluída                      | Claude      | Achados para P1-01, P1-02 e ENV-03; sem editar código               |
| P1-01     | Definir contrato normalizado e decisões de negócio        | aguardando                     | —           | Próxima etapa de implementação; alinhar interfaces antes de dividir |
| P1-02     | Implementar schema, migrações e repositórios              | aguardando                     | —           | P1-01; sugestão: Codex                                              |
| P1-03     | Implementar domínio e adaptadores Alfa/Beta               | aguardando                     | —           | P1-01; sugestão: Claude                                             |
| P1-04     | Integrar API, conferência e relatório paginado            | aguardando                     | —           | P1-02 e P1-03; combinar responsabilidade por arquivo                |
| P1-05     | Validar desafio e registrar marco parte-1                 | aguardando                     | —           | P1-04; persistência, concorrência, precisão e paginação             |
| P2-01     | Integrar Gama/Delta e documentar mudanças                 | aguardando                     | —           | P1-05                                                               |

Ao assumir tarefa, acrescentar abaixo: ID, responsável, arquivos reservados e dependências. Uma tarefa só pode ter um responsável de implementação por vez.

## REVIEW-01 — revisão da base

- Responsável: Codex.
- Arquivos reservados: `docs/TASKS.md`, `docs/STATUS.md`, `docs/handoffs/REVIEW-01-codex.md`.
- Escopo: inspeção do código e configuração, checks locais e disponibilidade das ferramentas; sem instalação ou mudança de serviço.
- Dependências: nenhuma para revisão local; validação real do banco depende de ENV-02/ENV-03.

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
