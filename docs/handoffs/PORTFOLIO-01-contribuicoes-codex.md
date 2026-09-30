# PORTFOLIO-01 — contribuição do responsável pelo projeto

- Responsável: Codex; 2026-09-30.
- Objetivo: tornar as contribuições declaradas pelo usuário visíveis no README sem alterar a autoria do código ou do histórico Git.

## Contribuições documentadas

- **Escolha e aceite de tecnologia:** TypeScript/Node.js, PostgreSQL, Fastify, Prisma 7 e bibliotecas de P1-03. As ADRs registram as confirmações do usuário e suas justificativas: [ADR-001](../decisions/ADR-001-postgresql.md), [ADR-002](../decisions/ADR-002-typescript-nodejs.md), [ADR-003](../decisions/ADR-003-fastify.md), [ADR-004](../decisions/ADR-004-prisma-7.md) e [ADR-011](../decisions/ADR-011-bibliotecas-p1-03.md).
- **Aceite e revisão:** o quadro [TASKS.md](../TASKS.md) registra as frentes, critérios e revisões; os handoffs mantêm a autoria real de cada implementação e validação. REVIEW-18 e REVIEW-19 mostram verificações pedidas/aceitas pelo responsável: regressões pela API real, banco PostgreSQL e comparação dos exemplos persistidos.
- **Critério técnico de aceite:** não bastar compilação verde; incluir limites, concorrência, falhas, repetição e comparação da persistência com as entradas. TEST-RECOVERY-01 acrescenta os cenários gerados e a recuperação após reinício.

O README agora apresenta essas atividades na primeira pessoa como contribuições do responsável pelo projeto e declara explicitamente a assistência de Claude/Codex. Não foram alterados código de produção, commits, autoria Git ou registros históricos para atribuir trabalho dos agentes ao usuário.

## Arquivos

- `README.md`
- `docs/COLLABORATION.md`
- `docs/TASKS.md`
- `docs/handoffs/PORTFOLIO-01-contribuicoes-codex.md`

Validação: formatação Prettier e `git diff --check`.
