import pg from 'pg';
import { CheckReadiness } from '../application/use-cases/check-readiness.js';
import { parseEnvironment } from '../infrastructure/config/env.js';
import { PostgresHealth } from '../infrastructure/database/postgres-health.js';
import { buildApp } from '../presentation/http/app.js';
const env = parseEnvironment(process.env);
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 3000,
  query_timeout: 3000,
  max: 10,
});
const app = buildApp({
  readiness: new CheckReadiness(new PostgresHealth(pool)),
  logLevel: env.LOG_LEVEL,
});
pool.on('error', (error) =>
  app.log.error(error, 'PostgreSQL idle connection error'),
);
app.addHook('onClose', async () => {
  await pool.end();
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
