import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';

import fc from 'fast-check';

import type { StagedItem } from '../../src/domain/ingestion.js';
import { idadeDeEsperaAbandonada } from '../../src/domain/limits.js';
import type { NormalizedPurchaseOrderItem } from '../../src/domain/purchase-order.js';
import { PrismaPurchaseOrderRepository } from '../../src/infrastructure/database/purchase-order-repository.js';

import {
  connect,
  databaseUrl,
  exigirBancoExclusivo,
  limpar,
  semBanco,
} from './support.js';
import type { DatabaseConnection } from '../../src/infrastructure/database/prisma-client.js';

const quantidadeDePedidos = 250;
const atrasoDeAbandonoMs = idadeDeEsperaAbandonada + 60 * 60 * 1000;
const fornecedor = {
  tax_id: '67890123000145',
  name: 'Fornecedor de recuperação de teste',
};

interface GeneratedLine {
  readonly quantity: number;
  readonly receivedPercent: number;
  readonly priceCents: number;
  readonly day: number;
}

type GeneratedOrder = readonly GeneratedLine[];

interface ApiProcess {
  readonly child: ChildProcess;
  readonly baseUrl: string;
}

interface IngestionReport {
  readonly ordersAccepted: number;
  readonly itemsAccepted: number;
  readonly stagedTotal: number;
  readonly rejectedTotal: number;
}

interface StoredItem {
  readonly externalLine: number;
  readonly material: string;
  readonly description: string;
  readonly purchaseUnit: string;
  readonly conversionFactor: string;
  readonly quantityOrdered: string;
  readonly quantityReceived: string;
  readonly quantityPending: string;
  readonly unitPrice: string;
  readonly lineCreatedOn: string | null;
}

interface StoredOrder {
  readonly clientId: string;
  readonly externalNumber: string;
  readonly supplierTaxId: string;
  readonly supplierName: string;
  readonly currency: string;
  readonly status: string;
  readonly issuedOn: string;
  readonly hasPendingBalance: boolean;
  readonly items: readonly StoredItem[];
}

const lineArbitrary: fc.Arbitrary<GeneratedLine> = fc.record({
  quantity: fc.integer({ min: 1, max: 20_000 }),
  receivedPercent: fc.integer({ min: 0, max: 100 }),
  priceCents: fc.integer({ min: 1, max: 999_999 }),
  day: fc.integer({ min: 1, max: 27 }),
});

const orderArbitrary: fc.Arbitrary<GeneratedOrder> = fc.array(lineArbitrary, {
  minLength: 1,
  maxLength: 5,
});

const numberFor = (prefix: string, index: number): string =>
  `${prefix}-${String(index).padStart(3, '0')}`;

const fixedQuantity = (value: number): string => `${String(value)}.000000`;

const fixedPrice = (cents: number): string =>
  `${String(Math.floor(cents / 100))}.${String(cents % 100).padStart(2, '0')}0000`;

const lineDate = (day: number): string =>
  `2026-09-${String(day).padStart(2, '0')}`;

function sourceItems(
  prefix: string,
  groups: readonly GeneratedOrder[],
  revise = false,
) {
  return groups.flatMap((group, orderIndex) =>
    group.map((line, lineIndex) => {
      const quantity = line.quantity + (revise ? 1 : 0);
      const received = Math.floor((line.quantity * line.receivedPercent) / 100);
      const priceCents = line.priceCents + (revise ? 1 : 0);
      const day = line.day + (revise ? 1 : 0);
      return {
        purchase_order: numberFor(prefix, orderIndex),
        created_at: lineDate(day),
        line: lineIndex + 1,
        material: `MAT-${String(orderIndex).padStart(3, '0')}-${String(lineIndex + 1)}`,
        description: `Generated recovery ${String(orderIndex)}-${String(lineIndex + 1)}${revise ? ' replay' : ''}`,
        uom: 'UN',
        quantity_ordered: quantity,
        quantity_received: received,
        unit_price: priceCents / 100,
      };
    }),
  );
}

function stagedItems(
  prefix: string,
  groups: readonly GeneratedOrder[],
  revise = false,
): StagedItem[] {
  return sourceItems(prefix, groups, revise).map((source) => {
    const item: NormalizedPurchaseOrderItem = {
      externalLine: source.line,
      material: source.material,
      description: source.description,
      purchaseUnit: source.uom,
      conversionFactor: '1.000000',
      quantityOrdered: fixedQuantity(source.quantity_ordered),
      quantityReceived: fixedQuantity(source.quantity_received),
      unitPrice: fixedPrice(Math.round(source.unit_price * 100)),
      lineCreatedOn: source.created_at,
    };
    return {
      reference: source.purchase_order,
      reason: 'cabecalho-ausente',
      raw: JSON.stringify(source),
      externalNumber: source.purchase_order,
      item,
    };
  });
}

function sourceOrders(prefix: string, groups: readonly GeneratedOrder[]) {
  return groups.map((_, index) => ({
    po_number: numberFor(prefix, index),
    created_at: '2026-09-01',
    status: 'open',
    currency: 'BRL',
    vendor: fornecedor,
  }));
}

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('não foi possível reservar uma porta de teste');
  }
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function startApi(databaseUrl: string): Promise<ApiProcess> {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', 'src/main/server.ts'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        HOST: '127.0.0.1',
        PORT: String(port),
        LOG_LEVEL: 'silent',
      },
      stdio: 'ignore',
    },
  );
  const baseUrl = `http://127.0.0.1:${String(port)}`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('API de teste terminou antes de ficar pronta');
    }
    try {
      const response = await fetch(`${baseUrl}/ready`);
      if (response.status === 200) return { child, baseUrl };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  await stopApi(child, 'SIGKILL');
  throw new Error('API de teste não ficou pronta em 20 segundos');
}

async function stopApi(
  child: ChildProcess,
  signal: NodeJS.Signals,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill(signal);
  await exited;
}

async function uploadPart(
  api: ApiProcess,
  part: 'orders' | 'items',
  value: readonly unknown[],
): Promise<IngestionReport> {
  const form = new FormData();
  form.append(
    part,
    new Blob([JSON.stringify({ [part]: value })], {
      type: 'application/json',
    }),
    `${part}.json`,
  );
  const response = await fetch(`${api.baseUrl}/clients/delta/ingestions`, {
    method: 'POST',
    headers: { 'x-format-version': '1' },
    body: form,
  });
  const report = (await response.json()) as IngestionReport;
  assert.equal(response.status, 200, `ingestão ${part} recusada`);
  return report;
}

function expectedItems(
  group: GeneratedOrder,
  orderIndex: number,
  revise: boolean,
): StoredItem[] {
  return group.map((line, lineIndex) => {
    const quantity = line.quantity + (revise ? 1 : 0);
    const received = Math.floor((line.quantity * line.receivedPercent) / 100);
    const priceCents = line.priceCents + (revise ? 1 : 0);
    const day = line.day + (revise ? 1 : 0);
    return {
      externalLine: lineIndex + 1,
      material: `MAT-${String(orderIndex).padStart(3, '0')}-${String(lineIndex + 1)}`,
      description: `Generated recovery ${String(orderIndex)}-${String(lineIndex + 1)}${revise ? ' replay' : ''}`,
      purchaseUnit: 'UN',
      conversionFactor: '1.000000',
      quantityOrdered: fixedQuantity(quantity),
      quantityReceived: fixedQuantity(received),
      quantityPending: fixedQuantity(quantity - received),
      unitPrice: fixedPrice(priceCents),
      lineCreatedOn: lineDate(day),
    };
  });
}

describe(
  'recuperação de quedas e órfãos Delta no PostgreSQL',
  { skip: semBanco },
  () => {
    let database: DatabaseConnection;
    let repository: PrismaPurchaseOrderRepository;

    before(async () => {
      database = connect();
      await exigirBancoExclusivo(database);
      repository = new PrismaPurchaseOrderRepository(database.prisma);
    });

    after(async () => {
      await database.close();
    });

    beforeEach(async () => {
      await limpar(database);
      await database.pool.query('TRUNCATE TABLE "ingestion_staging"');
    });

    it('recupera centenas de pedidos sem cabeçalho após queda, reinício, expurgo e reenvio', async (context) => {
      const runId = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
      const orphanPrefix = `REC-${runId}-P`;
      const retryPrefix = `REC-${runId}-R`;
      const activePrefix = `REC-${runId}-ACTIVE`;
      const activeNumber = numberFor(activePrefix, 0);
      const groups = fc.sample(orderArbitrary, {
        numRuns: quantidadeDePedidos,
        seed: 20260930,
      });
      const totalLines = groups.reduce((sum, group) => sum + group.length, 0);
      const abandonedIngestion = randomUUID();
      const activeIngestion = randomUUID();
      let api: ApiProcess | null = null;

      context.diagnostic(
        `seed 20260930: ${String(quantidadeDePedidos)} pedidos gerados, ${String(totalLines)} linhas; cada pedido percorre queda, espera e reconciliação`,
      );

      try {
        api = await startApi(databaseUrl as string);

        const firstLoad = await uploadPart(
          api,
          'items',
          sourceItems(orphanPrefix, groups),
        );
        assert.equal(firstLoad.ordersAccepted, 0);
        assert.equal(firstLoad.itemsAccepted, 0);
        assert.equal(firstLoad.stagedTotal, totalLines);
        assert.equal(firstLoad.rejectedTotal, 0);

        const abandoned = stagedItems(retryPrefix, groups);
        await repository.stageLooseItems(
          'delta',
          abandonedIngestion,
          abandoned,
        );
        await database.pool.query(
          `UPDATE ingestion_staging
            SET staged_at = now() - ($2::int * interval '1 millisecond')
          WHERE client_id = 'delta' AND ingestion_id = $1`,
          [abandonedIngestion, atrasoDeAbandonoMs],
        );

        const firstLine = groups[0]?.[0];
        assert.ok(firstLine);
        const activeItem = stagedItems(activePrefix, [[firstLine]])[0];
        assert.ok(activeItem);
        await repository.stageLooseItems('delta', activeIngestion, [
          activeItem,
        ]);

        // O processo morre depois de o Delta publicar a espera, mas enquanto
        // outro conjunto de registros ainda está invisível no meio da carga.
        await stopApi(api.child, 'SIGKILL');
        api = await startApi(databaseUrl as string);

        const recoveryState = await database.pool.query<{
          publicada: boolean;
          total: number;
        }>(
          `SELECT publicada, count(*)::int AS total
           FROM ingestion_staging
          WHERE client_id = 'delta'
            AND (external_number LIKE $1 OR external_number LIKE $2 OR external_number = $3)
          GROUP BY publicada`,
          [`${orphanPrefix}-%`, `${retryPrefix}-%`, activeNumber],
        );
        const byVisibility = new Map(
          recoveryState.rows.map((row) => [row.publicada, row.total]),
        );
        assert.equal(byVisibility.get(true), totalLines);
        assert.equal(
          byVisibility.get(false),
          1,
          'a linha recente ativa foi removida',
        );

        const retry = await uploadPart(
          api,
          'items',
          sourceItems(retryPrefix, groups),
        );
        assert.equal(retry.stagedTotal, totalLines);
        assert.equal(retry.rejectedTotal, 0);

        const replay = await uploadPart(
          api,
          'items',
          sourceItems(orphanPrefix, groups, true),
        );
        assert.equal(replay.stagedTotal, totalLines);
        assert.equal(replay.rejectedTotal, 0);

        const orders = [
          ...sourceOrders(orphanPrefix, groups),
          ...sourceOrders(retryPrefix, groups),
        ];
        const headers = await uploadPart(api, 'orders', orders);
        assert.equal(headers.ordersAccepted, quantidadeDePedidos * 2);
        assert.equal(headers.itemsAccepted, totalLines * 2);
        assert.equal(headers.stagedTotal, 0);
        assert.equal(headers.rejectedTotal, 0);

        const expected = new Map<string, StoredOrder>();
        groups.forEach((group, index) => {
          const makeExpected = (
            prefix: string,
            revise: boolean,
          ): StoredOrder => ({
            clientId: 'delta',
            externalNumber: numberFor(prefix, index),
            supplierTaxId: fornecedor.tax_id,
            supplierName: fornecedor.name,
            currency: 'BRL',
            status: 'aberto',
            issuedOn: '2026-09-01',
            hasPendingBalance: expectedItems(group, index, revise).some(
              (item) => item.quantityPending !== '0.000000',
            ),
            items: expectedItems(group, index, revise),
          });
          expected.set(
            numberFor(orphanPrefix, index),
            makeExpected(orphanPrefix, true),
          );
          expected.set(
            numberFor(retryPrefix, index),
            makeExpected(retryPrefix, false),
          );
        });

        const stored = await database.pool.query<StoredOrder>(
          `SELECT p.client_id AS "clientId",
                p.external_number AS "externalNumber",
                p.supplier_tax_id AS "supplierTaxId",
                p.supplier_name AS "supplierName",
                p.currency,
                p.status,
                p.issued_on::text AS "issuedOn",
                p.has_pending_balance AS "hasPendingBalance",
                COALESCE(
                  jsonb_agg(jsonb_build_object(
                    'externalLine', i.external_line,
                    'material', i.material,
                    'description', i.description,
                    'purchaseUnit', i.purchase_unit,
                    'conversionFactor', i.conversion_factor::text,
                    'quantityOrdered', i.quantity_ordered::text,
                    'quantityReceived', i.quantity_received::text,
                    'quantityPending', i.quantity_pending::text,
                    'unitPrice', i.unit_price::text,
                    'lineCreatedOn', i.line_created_on::text
                  ) ORDER BY i.external_line) FILTER (WHERE i.id IS NOT NULL),
                  '[]'::jsonb
                ) AS items
           FROM purchase_order p
           LEFT JOIN purchase_order_item i ON i.purchase_order_id = p.id
          WHERE p.client_id = 'delta' AND p.external_number LIKE $1
          GROUP BY p.id`,
          [`REC-${runId}-%`],
        );
        assert.equal(stored.rows.length, quantidadeDePedidos * 2);
        for (const row of stored.rows) {
          const want = expected.get(row.externalNumber);
          assert.ok(want, `pedido inesperado: ${row.externalNumber}`);
          assert.deepEqual(
            row,
            want,
            `dados persistidos divergentes: ${row.externalNumber}`,
          );
          expected.delete(row.externalNumber);
        }
        assert.equal(expected.size, 0, 'faltaram pedidos após a reconciliação');

        const remaining = await database.pool.query<{ total: number }>(
          `SELECT count(*)::int AS total
           FROM ingestion_staging
          WHERE client_id = 'delta' AND external_number LIKE $1`,
          [`REC-${runId}-%`],
        );
        assert.equal(
          remaining.rows[0]?.total,
          1,
          'espera ativa foi consumida ou outra linha ficou',
        );
        const active = await database.pool.query(
          `SELECT count(*)::int AS total
           FROM ingestion_staging
          WHERE client_id = 'delta' AND external_number = $1 AND publicada = false`,
          [activeNumber],
        );
        assert.equal(active.rows[0]?.total, 1);
      } finally {
        if (api !== null) await stopApi(api.child, 'SIGTERM');
        await database.pool.query(
          `DELETE FROM ingestion_staging
          WHERE client_id = 'delta' AND external_number LIKE $1`,
          [`REC-${runId}-%`],
        );
        await database.pool.query(
          `DELETE FROM purchase_order
          WHERE client_id = 'delta' AND external_number LIKE $1`,
          [`REC-${runId}-%`],
        );
      }
    });
  },
);
