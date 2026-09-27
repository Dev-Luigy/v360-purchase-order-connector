# Decisões técnicas

Consultar este índice apenas quando a tarefa envolver contratos, schema, dependências ou arquitetura. O plano inicial está em [TECHNICAL_PLAN.md](../TECHNICAL_PLAN.md); decisões posteriores devem indicar explicitamente qual proposta substituem.

- [ADR-001 — PostgreSQL](ADR-001-postgresql.md): aceita pelo usuário; afeta P1-01, P1-02 e ENV-03.

- [ADR-002 — TypeScript e Node.js](ADR-002-typescript-nodejs.md): aceita pelo usuário; orienta a implementação e resolve a pendência de linguagem/runtime da ADR-001.

- [ADR-003 — Fastify](ADR-003-fastify.md): aceita pelo usuário; confirma o framework HTTP da base.

- [ADR-004 — Prisma ORM 7](ADR-004-prisma-7.md): aceita pelo usuário; orienta o acesso ao PostgreSQL em P1-02.

- [ADR-005 — Observabilidade com Grafana e Prometheus](ADR-005-observabilidade.md): direção aceita pelo usuário; implementação diferida para depois do marco `parte-1`, porque os labels dependem de P1-01 e P1-03.

## Como registrar

Antes do trabalho dependente, reservar no quadro o arquivo `ADR-NNN-titulo.md` e este índice. Adicionar aqui um link com título, estado e tarefas afetadas. Usar o próximo número livre.

Cada registro deve conter:

- Título, data, responsável e tarefa.
- Estado: proposta / aceita / substituída; registrar quem aceitou e a evidência, conforme a autoridade da tarefa.
- Contexto e problema.
- Decisão e justificativa, com alternativas relevantes.
- Contratos e arquivos afetados, consumidores e migração necessária.
- Validação esperada e pendências.
- Link para a decisão sucessora, se substituída.

Uma proposta não libera consumidores dependentes. Preservar decisões anteriores e indicar substituição, sem apagar o histórico.
