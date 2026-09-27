# ADR-001 — PostgreSQL

- Estado: aceita.
- Data: 2026-09-27.
- Responsável pelo registro: Codex; tarefa ARCH-01.
- Aceite: usuário, nesta conversa: “vamos seguir com postgres”.

## Contexto e decisão

O desafio exige persistir pedidos normalizados e histórico de conferências, com filtros, relatórios e cargas concorrentes. Usaremos PostgreSQL como banco relacional.

A escolha considera a adequação do modelo relacional ao problema e a experiência do usuário com bancos relacionais. MySQL foi a alternativa final considerada; o usuário não identificou diferença suficiente para preferi-lo neste projeto. MongoDB e SQLite também foram discutidos, sem adoção. Não se afirma superioridade universal do PostgreSQL.

## Impacto e limites

Confirma a proposta de banco da base existente (`compose.yaml` e `src/infrastructure/database/`); nenhuma migração é necessária para registrar esta decisão. Orienta P1-01, P1-02 e ENV-03.

A versão 17 no Compose é configuração existente, não uma decisão de versão tomada nesta conversa. Linguagem, framework, driver/ORM, migrações, precisão decimal e estratégia de paginação continuam sujeitos à discussão. A presença de uma ferramenta na base não equivale a aprovação.

## Validação e pendências

Validar banco real, inicialização conjunta, persistência após reinício e concorrência nas tarefas correspondentes. A escolha do banco não resolve por si só a consistência de uma varredura paginada durante novas cargas. Não há implementação de schema de negócio decorrente deste registro.
