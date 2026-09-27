# ADR-003 — Fastify

- Estado: aceita.
- Data: 2026-09-27.
- Responsável pelo registro: Codex; tarefa ARCH-03.
- Aceite: usuário, nesta conversa: “Vamos manter fastify”.

## Contexto e decisão

Manter Fastify como framework HTTP da API REST, sobre TypeScript e Node.js (ADR-002), com PostgreSQL (ADR-001).

A base já utiliza Fastify e separa a construção da aplicação da abertura da porta, permitindo testes HTTP por injeção. A decisão preserva essa estrutura. O usuário não apresentou justificativa adicional nem solicitou comparação nesta etapa; não se atribui a ele uma avaliação de desempenho ou de alternativas que não ocorreu.

Express e NestJS haviam sido citados como alternativas para discussão, sem implementação ou escolha. A confirmação de Fastify encerra a pendência de framework registrada nas decisões anteriores.

## Impacto e limites

Orienta `src/presentation/http/`, `src/main/` e testes HTTP; não altera código, contratos, schema ou dependências. Domínio e casos de uso continuam independentes do framework, conforme AGENTS.md.

O aceite não escolhe automaticamente plugins, driver/ORM, migrações ou bibliotecas de validação. A versão existente não foi objeto de nova decisão.

## Validação e pendências

Registro documental com verificação de formatação. Testes de aplicação não repetidos nesta tarefa. Próximo tema: acesso ao PostgreSQL e ferramenta de migrações, ainda sem escolha definitiva.
