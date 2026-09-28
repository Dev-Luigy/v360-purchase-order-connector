import { connectDatabase } from '../../src/infrastructure/database/prisma-client.js';
import type { DatabaseConnection } from '../../src/infrastructure/database/prisma-client.js';
import type { NormalizedPurchaseOrder } from '../../src/domain/purchase-order.js';

/**
 * Apoio da suíte de integração.
 *
 * Estes testes só rodam com PostgreSQL de verdade. Sem `DATABASE_URL` eles são
 * **pulados**, não falhos: `npm run check` precisa funcionar em máquina sem
 * Docker, e `npm run test:integration` é quem carrega o `.env` e exige o banco.
 */

export const databaseUrl = process.env.DATABASE_URL;

/** `true` quando não há banco: vira `skip` em vez de falha. */
export const semBanco = databaseUrl === undefined || databaseUrl === '';

export function connect(): DatabaseConnection {
  if (databaseUrl === undefined) {
    throw new Error('DATABASE_URL ausente: rode com npm run test:integration');
  }
  // Pool de ingestão: é o caminho que a carga usa, e é o que queremos exercitar.
  return connectDatabase(databaseUrl, 'ingestion');
}

/**
 * Limpa as tabelas de negócio entre testes, preservando `_prisma_migrations`:
 * apagar o controle de migração faria a prontidão reprovar sem motivo.
 */
export async function limpar(database: DatabaseConnection): Promise<void> {
  await database.pool.query(
    'TRUNCATE TABLE "conference_divergence", "conference", "purchase_order_item", "purchase_order" CASCADE',
  );
}

/** Pedido normalizado mínimo, para os testes não repetirem a mesma montagem. */
export function pedido(
  overrides: Partial<NormalizedPurchaseOrder> = {},
): NormalizedPurchaseOrder {
  return {
    clientId: 'alfa',
    externalNumber: '4500001234',
    supplier: { taxId: '23456789000101', name: 'Metalúrgica São Jorge S.A.' },
    currency: 'BRL',
    status: 'aberto',
    issuedOn: '2026-08-05',
    items: [
      {
        externalLine: 10,
        material: 'MAT-1001',
        description: 'Chapa de aço 2mm',
        purchaseUnit: 'UN',
        conversionFactor: '1.000000',
        quantityOrdered: '100.000000',
        quantityReceived: '60.000000',
        unitPrice: '45.900000',
        lineCreatedOn: null,
      },
    ],
    ...overrides,
  };
}
