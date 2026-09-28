import type { FastifyInstance } from 'fastify';

import { CheckReadiness } from '../../src/application/use-cases/check-readiness.js';
import { IngestPurchaseOrders } from '../../src/application/use-cases/ingest-purchase-orders.js';
import { buildAdapterRegistry } from '../../src/infrastructure/integrations/adapter-registry.js';
import { InMemoryClientProfiles } from '../../src/infrastructure/integrations/client-profiles.js';
import { buildApp } from '../../src/presentation/http/app.js';

import { InMemoryPurchaseOrderRepository } from './in-memory-repositories.js';

export interface TestApp {
  readonly app: FastifyInstance;
  readonly orders: InMemoryPurchaseOrderRepository;
}

/**
 * Aplicação completa com repositório em memória: prova a cadeia rota → caso de
 * uso → adaptador sem banco. O que depende de PostgreSQL continua em ENV-03.
 */
export async function buildTestApp(
  options: { readonly databaseAvailable?: boolean } = {},
): Promise<TestApp> {
  const profiles = new InMemoryClientProfiles();
  const orders = new InMemoryPurchaseOrderRepository();
  const disponivel = options.databaseAvailable ?? true;

  const app = await buildApp({
    logLevel: 'silent',
    readiness: new CheckReadiness({
      ping() {
        return disponivel
          ? Promise.resolve()
          : Promise.reject(new Error('Database offline'));
      },
    }),
    ingest: new IngestPurchaseOrders(profiles, buildAdapterRegistry(), orders),
    profileFormatOf: async (clientId) =>
      (await profiles.find(clientId))?.deliveryFormat ?? null,
  });

  return { app, orders };
}

/**
 * Monta um corpo multipart à mão. `inject` do Fastify não tem construtor de
 * form-data, e depender de uma biblioteca só para o teste seria dependência
 * sem necessidade.
 */
export function multipartBody(
  parts: readonly { name: string; filename: string; content: string }[],
): { body: Buffer; headers: Record<string, string> } {
  const boundary = `----v360test${String(Date.now())}`;
  const pedacos: Buffer[] = [];
  for (const part of parts) {
    pedacos.push(
      Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n` +
          'Content-Type: application/octet-stream\r\n\r\n',
      ),
      Buffer.from(part.content, 'utf-8'),
      Buffer.from('\r\n'),
    );
  }
  pedacos.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(pedacos),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
