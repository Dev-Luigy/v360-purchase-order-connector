# Handoff: ENV-04 — verificação de portas e isolamento do Compose

- Agente e data: Claude, 2026-09-27.
- Estado: concluída.
- Objetivo e resultado: pedido do usuário — verificar a máquina antes de subir o Compose, para não encostar em serviço de cliente já em execução. Implementado: `scripts/preflight-docker.mjs`, executado automaticamente antes de `npm run up` e `npm run db:up`; nome de projeto fixo no Compose; portas publicadas configuráveis; porta do banco no host movida para 55432.
- Arquivos alterados: `scripts/preflight-docker.mjs` (novo), `compose.yaml` (`name:` e portas por variável), `package.json` (`preflight`, `up`, hooks `preup` e `predb:up`), `.env.example` e `.env` (API_PORT, DB_PORT, DATABASE_URL), `eslint.config.js` (globals do Node para `scripts/**/*.mjs`), `README.md` (seção Executar), `docs/TASKS.md`, este handoff.

## O risco real, corrigido o mecanismo

`docker compose up` não derruba um serviço que já ocupa a porta: o Docker falha ao fazer o bind e o container não sobe. O risco grave é outro, e é silencioso: com `DATABASE_URL` apontando para `localhost:5432`, se já existir um PostgreSQL na máquina — do host ou de outro projeto — as nossas migrações e cargas rodariam **dentro do banco alheio**, sem erro nenhum. Daí as três medidas:

1. **Porta do banco no host em 55432** (dentro da rede do Compose continua 5432). Não disputa a porta padrão, então não há como confundir o nosso banco com um banco existente. Da API mantive 3000, que é a porta que o avaliador espera.
2. **`name: v360-purchase-order-connector` no Compose.** Sem nome fixo o projeto é derivado do diretório, e um worktree ou uma cópia da pasta viraria outro projeto, com outros containers e outro volume. Consequência aceita: worktrees compartilham um único stack, então apenas um sobe o serviço por vez — já era a regra em `GIT_WORKFLOW.md`.
3. **Preflight que só lê e aborta.** Verifica daemon, se cada porta publicada está livre, quem a ocupa quando não está, e se existe outro projeto Compose com o nosso nome declarado fora deste diretório. Nunca executa `stop`, `rm`, `down` ou `kill`: em conflito imprime o ocupante e sai com código 1.

## Validação

Os três caminhos foram exercitados de verdade, não só lidos:

- Nada rodando: aprovado, exit 0.
- Porta 3000 ocupada por processo do host (servidor Node local): abortou, exit 1, identificando o PID via `ss`.
- Porta 3000 publicada por container alheio e 55432 por container com o label do nosso projeto: abortou por 3000 nomeando container e imagem, e reconheceu 55432 como nossa ("subir de novo é idempotente"). Container e imagem temporários removidos; a máquina ficou sem containers e sem imagens.
- `docker compose config` resolve `published: "3000"` e `"55432"`, e `API_PORT=3100 DB_PORT=55433` sobrescreve.
- Confirmado que o npm executa o hook `predb:up` apesar do dois-pontos no nome do script.
- `npm run check` verde. O Compose real não foi subido: pull do PostgreSQL 17 e validação de persistência são ENV-03.

## Limites, explicitamente

- O preflight é um retrato: entre a verificação e o bind, algo pode tomar a porta. Nesse caso o Docker falha ao subir — não derruba o ocupante.
- Não protege de `docker compose down -v`, que apaga o volume. É a única forma de perder dados carregados e nenhuma verificação a impede.
- Quem roda `docker compose up` direto não passa pela verificação. Foi mantido de propósito: o enunciado exige que o comando do Compose funcione sozinho.
- Sem privilégio, o `ss` mostra o socket mas pode esconder o processo de outro usuário; a mensagem então diz apenas que é processo do host.
- Não inspeciona o conteúdo do volume: não sabe dizer se o banco já tem dados de outra finalidade.

## Pendências e próxima ação

- `/ready` continua apenas com `SELECT 1`, mantido por decisão do usuário. O achado segue registrado em [REVIEW-02](REVIEW-02-claude.md), item 2.
- Ambiente é frente proposta do Codex em `COLLABORATION.md`; editei `compose.yaml` por pedido explícito do usuário, com os arquivos reservados no quadro antes da primeira edição. Se o Codex assumir ENV-03, alinhar antes de mexer no Compose.
- `docs/SETUP.md` e `docs/STATUS.md` continuam desatualizados sobre Docker e Node, e agora também não mencionam o preflight nem a porta 55432. Não editei: reserva de REVIEW-01 e frente do Codex.
- Próxima ação: P1-01 em `feat/p1-01-contrato-normalizado`.
- Posse: reservas de ENV-04 liberadas.
- Revisão: não realizada por outro agente.
