import { connectDatabase } from '../../src/infrastructure/database/prisma-client.js';
import type { DatabaseConnection } from '../../src/infrastructure/database/prisma-client.js';
import type { PurchaseOrderRepository } from '../../src/application/ports/purchase-order-repository.js';
import type {
  NormalizedPurchaseOrder,
  PurchaseOrder,
} from '../../src/domain/purchase-order.js';

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

/**
 * Grava o retrato e devolve o pedido.
 *
 * `replaceSnapshot` passou a devolver também quantos itens vieram da carga e
 * quantos foram recuperados da espera, porque somar `order.items.length`
 * contava os preservados (REVIEW-10, R10-02). Os testes que só querem o
 * pedido passam por aqui.
 */
export async function gravar(
  repository: PurchaseOrderRepository,
  snapshot: NormalizedPurchaseOrder,
): Promise<PurchaseOrder> {
  return (await repository.replaceSnapshot(snapshot)).order;
}

/**
 * Recusa rodar com a API do Compose ativa.
 *
 * A suíte dá `TRUNCATE` nas tabelas de negócio, então assume acesso exclusivo.
 * Com a API no ar, o que acontece é uma dúzia de falhas sem relação aparente
 * entre si — e já aconteceu mais de uma vez de eu perder tempo procurando um
 * defeito de código que era ambiente. Uma mensagem vale mais que trinta
 * falhas.
 */
export async function exigirBancoExclusivo(
  database: DatabaseConnection,
): Promise<void> {
  const { rows } = await database.pool.query<{ outros: string }>(
    `SELECT count(*)::text AS outros
       FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND application_name NOT LIKE '%psql%'
        AND state IS NOT NULL`,
  );
  const outros = Number(rows[0]?.outros ?? '0');
  if (outros > 0) {
    throw new Error(
      `há ${String(outros)} conexão(ões) de outro processo neste banco. ` +
        'A suíte de integração dá TRUNCATE e precisa de acesso exclusivo: ' +
        'pare a API com `docker compose stop api` antes de rodar.',
    );
  }
}
