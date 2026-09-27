import Fastify from 'fastify';
import type { CheckReadiness } from '../../application/use-cases/check-readiness.js';
export function buildApp(dependencies: {
  readiness: CheckReadiness;
  logLevel?: string;
}) {
  const app = Fastify({
    logger: {
      level: dependencies.logLevel ?? 'info',
      redact: ['req.headers.authorization'],
    },
  });
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/ready', async (_request, reply) => {
    const ready = await dependencies.readiness.execute();
    return reply
      .code(ready ? 200 : 503)
      .send({ status: ready ? 'ready' : 'unavailable' });
  });
  return app;
}
