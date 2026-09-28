import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import {
  serializerCompiler,
  validatorCompiler,
} from '@fastify/type-provider-zod';
import Fastify, { type FastifyInstance } from 'fastify';

import type { CheckReadiness } from '../../application/use-cases/check-readiness.js';
import type { IngestPurchaseOrders } from '../../application/use-cases/ingest-purchase-orders.js';

import { toProblem } from './problem.js';
import { registerIngestionRoutes } from './routes/ingestions.js';

/**
 * Limites da borda, em um lugar só.
 *
 * O enunciado fala em dezenas de milhares de registros, então a carga precisa
 * de teto próprio, bem acima do corpo JSON comum. Sem limite explícito, o
 * padrão do multipart e do Fastify decide por nós (REVIEW-04, R04-02).
 */
export const httpLimits = {
  /** Corpo JSON de uma requisição comum: nota fiscal, filtros. */
  bodyLimit: 1024 * 1024,
  multipart: {
    /** Cada arquivo de carga. Um CSV de dezenas de milhares de linhas cabe. */
    fileSize: 64 * 1024 * 1024,
    /** Beta manda dois arquivos; nenhuma forma manda mais. */
    files: 2,
    parts: 8,
    fields: 4,
    fieldSize: 4096,
    fieldNameSize: 64,
    headerPairs: 64,
  },
  rateLimit: {
    /** Por identidade e por minuto. Vira quota real quando houver autenticação. */
    max: 120,
    timeWindow: '1 minute',
  },
} as const;

export interface AppDependencies {
  readonly readiness: CheckReadiness;
  readonly ingest: IngestPurchaseOrders;
  readonly profileFormatOf: (clientId: string) => Promise<string | null>;
  readonly logLevel?: string;
}

export async function buildApp(
  dependencies: AppDependencies,
): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: httpLimits.bodyLimit,
    logger: {
      level: dependencies.logLevel ?? 'info',
      // Cabeçalho de credencial nunca vai para o log, nem os que ainda não
      // existem: a lista é por nome, e é mais barato incluí-los antes.
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'req.headers["x-api-key"]',
      ],
    },
  });

  // Os schemas Zod que já existem passam a validar request e resposta, com
  // inferência no handler: é o que impede o tipo e a validação de divergirem.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(multipart, { limits: httpLimits.multipart });
  await app.register(rateLimit, httpLimits.rateLimit);

  app.setErrorHandler((error, request, reply) => {
    const problem = toProblem(error);
    // O erro inteiro vai para o log, nunca para a resposta: detalhe de banco
    // ou pilha conta ao cliente como a nossa infraestrutura é por dentro.
    if (problem.status >= 500) {
      request.log.error(error, 'falha ao processar requisição');
    } else {
      request.log.warn(
        { err: error instanceof Error ? error.message : String(error) },
        'requisição recusada na validação',
      );
    }
    return reply.code(problem.status).send(problem.body);
  });

  app.get('/health', () => ({ status: 'ok' }));
  app.get('/ready', async (_request, reply) => {
    const ready = await dependencies.readiness.execute();
    return reply
      .code(ready ? 200 : 503)
      .send({ status: ready ? 'ready' : 'unavailable' });
  });

  registerIngestionRoutes(
    app,
    dependencies.ingest,
    dependencies.profileFormatOf,
  );

  return app;
}
