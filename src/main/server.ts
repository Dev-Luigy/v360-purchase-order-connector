import { CheckReadiness } from '../application/use-cases/check-readiness.js';
import { CheckInvoice } from '../application/use-cases/check-invoice.js';
import {
  ListConferences,
  SummarizeConferences,
} from '../application/use-cases/query-conferences.js';
import { IngestPurchaseOrders } from '../application/use-cases/ingest-purchase-orders.js';
import {
  GetPurchaseOrder,
  ListPurchaseOrders,
} from '../application/use-cases/query-purchase-orders.js';
import { parseEnvironment } from '../infrastructure/config/env.js';
import { connectDatabase } from '../infrastructure/database/prisma-client.js';
import { PrismaConferenceRepository } from '../infrastructure/database/conference-repository.js';
import { PrismaPurchaseOrderRepository } from '../infrastructure/database/purchase-order-repository.js';
import { SchemaReadiness } from '../infrastructure/database/schema-readiness.js';
import { buildAdapterRegistry } from '../infrastructure/integrations/adapter-registry.js';
import { InMemoryClientProfiles } from '../infrastructure/integrations/client-profiles.js';
import { buildApp } from '../presentation/http/app.js';
import { sweepSpoolLeftovers } from '../presentation/http/spool.js';

const env = parseEnvironment(process.env);

// Dois pools, por propósito (ADR-012): o caminho de requisição desiste rápido
// e o de carga aceita transação longa mas finita. O preset de ingestão existia
// desde P1-02 e **nada o usava** — as cargas passavam pelo pool de requisição,
// com tempo limite de 3 segundos (REVIEW-09, R09-07).
const database = connectDatabase(env.DATABASE_URL, 'request');
const ingestionDatabase = connectDatabase(env.DATABASE_URL, 'ingestion');
const profiles = new InMemoryClientProfiles();

const orderRepository = new PrismaPurchaseOrderRepository(database.prisma);
const conferenceRepository = new PrismaConferenceRepository(database.prisma);
// A carga grava pelo pool dela; consulta e conferência continuam no de
// requisição, onde o tempo limite curto é proteção e não estorvo.
const ingestionOrderRepository = new PrismaPurchaseOrderRepository(
  ingestionDatabase.prisma,
);

const app = await buildApp({
  // Prontidão olha o estado das migrações, não só a conexão: banco vazio
  // respondendo 200 fazia o healthcheck do Compose mentir (REVIEW-02, 2).
  readiness: new CheckReadiness(new SchemaReadiness(database.pool)),
  ingest: new IngestPurchaseOrders(
    profiles,
    buildAdapterRegistry(),
    ingestionOrderRepository,
  ),
  listOrders: new ListPurchaseOrders(orderRepository),
  getOrder: new GetPurchaseOrder(orderRepository),
  checkInvoice: new CheckInvoice(orderRepository, conferenceRepository),
  listConferences: new ListConferences(conferenceRepository),
  summarizeConferences: new SummarizeConferences(conferenceRepository),
  profileFormatOf: async (clientId) =>
    (await profiles.find(clientId))?.deliveryFormat ?? null,
  logLevel: env.LOG_LEVEL,
  rateLimit: { max: env.RATE_LIMIT_MAX, timeWindow: env.RATE_LIMIT_WINDOW },
});

// Resto de carga que morreu com o processo: `finally` não roda quando o
// processo cai, então a limpeza precisa também de um ponto no start.
const removidos = await sweepSpoolLeftovers();
if (removidos > 0) {
  app.log.warn({ removidos }, 'restos de carga anterior removidos');
}

for (const { pool } of [database, ingestionDatabase]) {
  pool.on('error', (error) =>
    app.log.error(error, 'PostgreSQL idle connection error'),
  );
}
app.addHook('onClose', async () => {
  // Os dois precisam fechar: deixar o de carga aberto segurava conexão e o
  // processo não encerrava sozinho.
  await Promise.all([database.close(), ingestionDatabase.close()]);
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
