# Decisões técnicas

Consultar este índice apenas quando a tarefa envolver contratos, schema, dependências ou arquitetura. O plano inicial está em [TECHNICAL_PLAN.md](../TECHNICAL_PLAN.md); decisões posteriores devem indicar explicitamente qual proposta substituem.

- [ADR-001 — PostgreSQL](ADR-001-postgresql.md): aceita pelo usuário; afeta P1-01, P1-02 e ENV-03.

- [ADR-002 — TypeScript e Node.js](ADR-002-typescript-nodejs.md): aceita pelo usuário; orienta a implementação e resolve a pendência de linguagem/runtime da ADR-001.

- [ADR-003 — Fastify](ADR-003-fastify.md): aceita pelo usuário; confirma o framework HTTP da base.

- [ADR-004 — Prisma ORM 7](ADR-004-prisma-7.md): aceita pelo usuário; orienta o acesso ao PostgreSQL em P1-02.

- [ADR-005 — Observabilidade com Grafana e Prometheus](ADR-005-observabilidade.md): direção aceita pelo usuário; implementação diferida para depois do marco `parte-1`, porque os labels dependem de P1-01 e P1-03.

- [ADR-006 — Modelo normalizado, identidade e situação canônica](ADR-006-modelo-normalizado.md): aceita; base de P1-02, P1-03 e P1-04.

- [ADR-007 — Decimal, dinheiro e unidade de compra](ADR-007-decimal-e-unidade.md): aceita; define precisão, arredondamento e por que o preço fica na unidade de compra.

- [ADR-008 — Ingestão: cliente, adaptadores, reenvio e cargas parciais](ADR-008-ingestao.md): aceita; um adaptador por forma de entrega e perfil por cliente.

- [ADR-009 — Conferência e taxonomia de divergências](ADR-009-conferencia.md): aceita; regras de negócio e códigos de divergência.

- [ADR-010 — Paginação por cursor](ADR-010-paginacao.md): aceita; rebaixa a proposta de instantâneo do TECHNICAL_PLAN, item 4.

- [ADR-011 — Bibliotecas de precisão, leitura em fluxo e validação](ADR-011-bibliotecas-p1-03.md): aceita por escolha do usuário; decimal.js, stream-json, csv-parse e o alcance do Zod. Fecha a pendência que ADR-007 deixou para P1-03. Afeta P1-03, P1-02 e P1-04.

- [ADR-012 — Notação numérica por natureza do campo, e pool por caminho](ADR-012-notacao-por-campo.md): aceita por autorização do usuário; desbloqueia o Gama e separa o caminho de carga do de requisição. Afeta FIX-04, P1-04 e P2-01.

- [ADR-013 — Checksum de CNPJ por perfil, e bibliotecas da borda HTTP](ADR-013-checksum-e-bibliotecas-p1-04.md): aceita por escolha do usuário; mantém o invólucro do `Decimal`, adota `cpf-cnpj-validator` com checksum por perfil e instala o provider Zod, multipart, rate-limit e fast-check. Afeta P1-04.

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
