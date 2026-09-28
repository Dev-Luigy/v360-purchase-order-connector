import { defineConfig } from 'prisma/config';

/**
 * Configuração do Prisma 7.
 *
 * A linha 7 tirou a URL do `schema.prisma` e o motor Rust do cliente: a URL de
 * migração vem para cá e o cliente recebe um adaptador de driver — no nosso
 * caso `@prisma/adapter-pg`, sobre o `pg` que o projeto já usava.
 *
 * As migrações moram em `database/migrations/`, a pasta que o repositório já
 * tinha reservado. Apontar o Prisma para ela, em vez de criar
 * `prisma/migrations/`, evita duas fontes de verdade para o mesmo schema
 * (REVIEW-02, achado 8).
 *
 * A linha 7 também deixou de ler `.env` sozinha. Carregamos aqui quando o
 * arquivo existe; em container a variável já vem do ambiente. A URL fica
 * opcional de propósito: `validate` e `generate` não precisam de banco, e
 * exigi-la quebraria `npm run check` em máquina sem `.env`.
 */
try {
  process.loadEnvFile(new URL('.env', import.meta.url));
} catch {
  // Sem `.env`: a variável vem do ambiente, ou o comando que precisar dela falha.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'database/migrations' },
  datasource: { url: process.env.DATABASE_URL },
});
