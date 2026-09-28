import { CheckReadiness } from '../application/use-cases/check-readiness.js';
import { parseEnvironment } from '../infrastructure/config/env.js';
import { connectDatabase } from '../infrastructure/database/prisma-client.js';
import { SchemaReadiness } from '../infrastructure/database/schema-readiness.js';
import { buildApp } from '../presentation/http/app.js';
const env = parseEnvironment(process.env);
// O caminho de carga tem pool próprio, sem tempo limite curto; entra com o
// endpoint de ingestão, em P1-04 (ADR-012).
const database = connectDatabase(env.DATABASE_URL, 'request');
const app = buildApp({
  // Prontidão olha o estado das migrações, não só a conexão: banco vazio
  // respondendo 200 fazia o healthcheck do Compose mentir (REVIEW-02, 2).
  readiness: new CheckReadiness(new SchemaReadiness(database.pool)),
  logLevel: env.LOG_LEVEL,
});
database.pool.on('error', (error) =>
  app.log.error(error, 'PostgreSQL idle connection error'),
);
app.addHook('onClose', async () => {
  await database.close();
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    const timeout = setTimeout(() => process.exit(1), 10000).unref();
    app
      .close()
      .then(() => clearTimeout(timeout))
      .catch((error: unknown) => {
        app.log.error(error);
        process.exitCode = 1;
      });
  });
}
try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
