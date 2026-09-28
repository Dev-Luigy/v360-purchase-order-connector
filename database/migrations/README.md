# Migrações

Migrações versionadas do schema, geradas e aplicadas pelo **Prisma Migrate**.

Esta é a única fonte de verdade do schema. O `prisma.config.ts` aponta o Prisma
para cá em vez de `prisma/migrations/`, que é o padrão da ferramenta: duas
pastas de migração seriam duas fontes de verdade para a mesma coisa
([REVIEW-02](../../docs/handoffs/REVIEW-02-claude.md), achado 8).

## Como uma migração nasce

```sh
# Depois de mudar prisma/schema.prisma, com o banco de desenvolvimento no ar:
npx prisma migrate dev --name descricao_curta

# Sem banco disponível, para revisar o SQL antes de aplicar:
npx prisma migrate diff --from-migrations database/migrations \
  --to-schema prisma/schema.prisma --script
```

## Como é aplicada

Nunca pela API. O Compose tem um serviço `migrate` próprio que roda
`prisma migrate deploy` e termina; a API só sobe depois que ele conclui com
sucesso, e o `/ready` recusa tráfego enquanto as migrações não estiverem
aplicadas. Runtime não tem o CLI do Prisma nem precisa de permissão de DDL.

## SQL escrito à mão

`0001_contrato_normalizado/migration.sql` tem dois índices parciais no fim,
acrescentados depois da geração: o schema do Prisma não declara `WHERE`, e o
filtro de saldo pendente do requisito 1 depende deles. Ao regerar uma migração,
conferir se esse trecho sobreviveu.
