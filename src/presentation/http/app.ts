import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from '@fastify/type-provider-zod';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { CheckReadiness } from '../../application/use-cases/check-readiness.js';
import type { CheckInvoice } from '../../application/use-cases/check-invoice.js';
import type {
  ListConferences,
  SummarizeConferences,
} from '../../application/use-cases/query-conferences.js';
import type { IngestPurchaseOrders } from '../../application/use-cases/ingest-purchase-orders.js';
import type {
  GetPurchaseOrder,
  ListPurchaseOrders,
} from '../../application/use-cases/query-purchase-orders.js';

import {
  docsPrefix,
  openapiDocument,
  registrarNomesDosObjetos,
} from './openapi.js';
import { toProblem } from './problem.js';
import { registerConferenceRoutes } from './routes/conferences.js';
import { registerIngestionRoutes } from './routes/ingestions.js';
import { registerPurchaseOrderRoutes } from './routes/purchase-orders.js';

/**
 * Limites da borda, em um lugar só.
 *
 * O enunciado fala em dezenas de milhares de registros, então a carga precisa
 * de teto próprio, bem acima do corpo JSON comum. Sem limite explícito, o
 * padrão do multipart e do Fastify decide por nós.
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
    /**
     * Por origem e por minuto; vira quota por identidade quando houver
     * autenticação.
     *
     * Medido, não escolhido: a varredura noturna que o próprio enunciado
     * descreve — dezenas de milhares de pedidos em páginas de 100 — precisa de
     * centenas de requisições seguidas, e um teto na casa das centenas derruba
     * o caso de uso que o sistema existe para servir.
     */
    max: 1200,
    timeWindow: '1 minute',
  },
} as const;

/**
 * Traduz `TRUST_PROXY` para o que o Fastify aceita.
 *
 * O tipo dele é `boolean | string | string[] | função` — **não** aceita
 * contagem de saltos, por mais que a documentação de proxy fale em hops. Vazio
 * vira `false`, e a lista separada por vírgula vira array.
 */
function proxyConfiavel(valor: string | undefined): boolean | string[] {
  const entradas = (valor ?? '')
    .split(',')
    .map((parte) => parte.trim())
    .filter((parte) => parte !== '');
  return entradas.length === 0 ? false : entradas;
}

export interface AppDependencies {
  readonly readiness: CheckReadiness;
  readonly ingest: IngestPurchaseOrders;
  readonly listOrders: ListPurchaseOrders;
  readonly getOrder: GetPurchaseOrder;
  readonly checkInvoice: CheckInvoice;
  readonly listConferences: ListConferences;
  readonly summarizeConferences: SummarizeConferences;
  readonly profileFormatOf: (clientId: string) => Promise<string | null>;
  readonly logLevel?: string;
  /**
   * Endereço ou faixa de quem pode informar o IP de origem. Ausente ou vazio
   * ignora `X-Forwarded-For`. Veja `TRUST_PROXY` em
   * `src/infrastructure/config/env.ts`.
   */
  readonly trustProxy?: string;
  /** Teto de requisições; ausente usa o padrão de `httpLimits`. */
  readonly rateLimit?: { readonly max: number; readonly timeWindow: string };
}

export async function buildApp(
  dependencies: AppDependencies,
): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: httpLimits.bodyLimit,
    // Quem pode dizer o IP de origem por `X-Forwarded-For`. `false` — o padrão
    // — ignora o cabeçalho, que é o certo sem proxy na frente: honrá-lo sem
    // proxy deixa qualquer cliente escapar do teto por origem.
    trustProxy: proxyConfiavel(dependencies.trustProxy),
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
  await app.register(rateLimit, dependencies.rateLimit ?? httpLimits.rateLimit);

  // O documento OpenAPI é **gerado** dos mesmos schemas Zod que validam a
  // requisição: `jsonSchemaTransform` lê o que a rota já declara. Documentação
  // escrita à parte seria mais uma fonte de verdade que ninguém obriga a
  // concordar com o código, e um teste falha se alguma rota ficar de fora.
  registrarNomesDosObjetos();
  await app.register(swagger, {
    openapi: openapiDocument,
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });
  await app.register(swaggerUi, {
    routePrefix: docsPrefix,
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  app.setErrorHandler((error, request, reply) => {
    const problem = toProblem(error);
    // O erro inteiro vai para o log, nunca para a resposta: detalhe de banco ou
    // pilha conta ao cliente como a nossa infraestrutura é por dentro.
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

  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/health',
    {
      schema: {
        tags: ['operação'],
        summary: 'O processo está de pé',
        description:
          'Não olha o banco de propósito: um serviço vivo com banco fora ' +
          'precisa ser reiniciado? Não. Quem responde isso é `/ready`.',
        response: { 200: z.object({ status: z.literal('ok') }) },
      },
    },
    () => ({ status: 'ok' as const }),
  );
  typed.get(
    '/ready',
    {
      schema: {
        tags: ['operação'],
        summary: 'O serviço pode receber tráfego',
        description:
          'Olha o estado das migrações, não só a conexão: banco vazio ' +
          'respondendo 200 faz o healthcheck do Compose mentir.',
        response: {
          200: z.object({ status: z.literal('ready') }),
          503: z.object({ status: z.literal('unavailable') }),
        },
      },
    },
    async (_request, reply) => {
      const ready = await dependencies.readiness.execute();
      // Dois retornos em vez de um ternário: cada status tem o seu schema, e
      // o ternário alargaria o literal para `string`.
      if (!ready) return reply.code(503).send({ status: 'unavailable' });
      return reply.code(200).send({ status: 'ready' });
    },
  );

  registerIngestionRoutes(
    app,
    dependencies.ingest,
    dependencies.profileFormatOf,
  );
  registerPurchaseOrderRoutes(
    app,
    dependencies.listOrders,
    dependencies.getOrder,
  );
  registerConferenceRoutes(
    app,
    dependencies.checkInvoice,
    dependencies.listConferences,
    dependencies.summarizeConferences,
  );

  return app;
}
