# ADR-004 — Prisma ORM 7

- Estado: aceita.
- Data: 2026-09-27.
- Responsável pelo registro: Codex; tarefa ARCH-04.
- Aceite: usuário, nesta conversa: “vamos escolher o prisma 7”.

## Contexto e decisão

Usaremos Prisma ORM 7 para acessar o PostgreSQL na aplicação TypeScript/Node.js. A escolha prioriza organização e manutenção, conforme a preferência do usuário por um ORM.

Prisma 7 foi escolhido após comparação com Drizzle. Pesaram a favor o fluxo integrado de modelagem, cliente tipado e convenções maduras. Drizzle continua sendo uma alternativa válida, mas não foi adotado.

Usaremos explicitamente a linha principal 7 de `prisma` e `@prisma/client`. O lockfile registrará versões exatas resolvidas. Não usaremos um comando sem versão que possa instalar Prisma 8 durante sua transição de release candidate.

## Impacto e limites

A decisão orienta P1-02 e substituirá o acesso direto por `pg` nos repositórios de negócio. A composição continuará escondida atrás das interfaces pequenas da camada de aplicação; domínio e casos de uso não importarão Prisma.

O adaptador de saúde existente e as dependências atuais só serão modificados na tarefa de implementação, depois de definir o schema. Este registro não instala pacotes nem altera o lockfile.

Prisma Migrate é a opção natural para acompanhar o ORM, mas a estratégia operacional das migrações ainda será confirmada antes da implementação. Valores monetários continuarão em `NUMERIC` no PostgreSQL; o mapeamento decimal e a política de arredondamento precisam de validação específica.

## Validação e pendências

Na implementação, validar geração do cliente, migrações em banco vazio e populado, transações e rollback, concorrência, tipos `NUMERIC`, consultas paginadas e execução em Node.js 24. Verificar também a árvore de dependências instalada com auditoria adequada ao uso real.
