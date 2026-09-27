# Handoff: REPO-01 — Git, commit base e fluxo de branches

- Agente e data: Claude, 2026-09-27.
- Estado: concluída.
- Objetivo e resultado: o repositório tinha `git init` mas nenhum commit, o que impedia histórico, worktree e a tag `parte-1` exigida pelo enunciado. Implementado: branch principal `main`, commit base único e convenção de branch por tarefa em [GIT_WORKFLOW.md](../GIT_WORKFLOW.md).
- Arquivos alterados: `docs/GIT_WORKFLOW.md` (convenção), `.gitattributes` (fim de linha normalizado, fixtures preservadas byte a byte, PDF binário), `docs/COLLABORATION.md` (link para a convenção e duas linhas no mapa de leitura), `docs/TASKS.md`, este handoff.
- Contratos e decisões: nenhum contrato de aplicação afetado. Decisões deste handoff, sem ADR por não tocarem arquitetura: `main` como branch de integração; `<tipo>/<id>-<slug>` com o ID do quadro; commit `<tipo>(<id>): resumo`; merge `--no-ff` para a tarefa aparecer como unidade no histórico, que é o que sustenta a resposta da Parte 2 sobre o que mudou para cada cliente novo entrar.
- Commit base: um commit só, importando a base como estado inicial. A maior parte é trabalho do Codex (ENV-01, COL-01, COL-02, ARCH-01 a ARCH-04); o restante é DOC-01, REVIEW-02 e REPO-01 do Claude. Separar autoria retroativamente exigiria dividir arquivos que os dois editaram (`README.md`, `docs/TASKS.md`), com risco maior que o ganho. O usuário autorizou explicitamente o commit incluindo trabalho do Codex ainda sem revisão registrada, o que suspende para este commit a restrição de `COLLABORATION.md`. A partir daqui a restrição volta a valer: cada tarefa em sua branch.
- Validação: `npm run check` verde antes do commit. Confirmado que `dist/`, `node_modules/`, `.tools/` e `.env` ficam fora pelo `.gitignore`, e que `docs/CASE.pdf` (276 KB) entra como binário. Não há remote, então nada foi publicado.
- Pendências ou bloqueios: a identidade Git não estava configurada (nem local, nem global, e o sistema não tem nome no registro do usuário). Configurada localmente com o e-mail do usuário; o nome foi informado por ele para este commit.
- Próxima ação: P1-01 em `feat/p1-01-contrato-normalizado`, partindo dos pontos abertos de [CASE.md](../CASE.md) e dos achados de [REVIEW-02](REVIEW-02-claude.md).
- Posse: reservas liberadas. Não editei `docs/STATUS.md`, `docs/SETUP.md` nem código de aplicação; REVIEW-01 preservada.
- Revisão: não realizada por outro agente.
