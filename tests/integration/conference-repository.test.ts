import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';

import { checkInvoice } from '../../src/domain/conference-rules.js';
import type { InvoiceCheckRequest } from '../../src/domain/conference.js';
import { PrismaConferenceRepository } from '../../src/infrastructure/database/conference-repository.js';
import type { DatabaseConnection } from '../../src/infrastructure/database/prisma-client.js';
import { PrismaPurchaseOrderRepository } from '../../src/infrastructure/database/purchase-order-repository.js';

import { connect, limpar, pedido, semBanco } from './support.js';

/** Histórico de conferências contra PostgreSQL real. */

let database: DatabaseConnection;
let orders: PrismaPurchaseOrderRepository;
let conferences: PrismaConferenceRepository;

before(() => {
  if (semBanco) return;
  database = connect();
  orders = new PrismaPurchaseOrderRepository(database.prisma);
  conferences = new PrismaConferenceRepository(database.prisma);
});

beforeEach(async () => {
  if (semBanco) return;
  await limpar(database);
});

after(async () => {
  if (semBanco) return;
  await database.close();
});

function nota(lines: InvoiceCheckRequest['lines']): InvoiceCheckRequest {
  return {
    clientId: 'alfa',
    purchaseOrderNumber: '4500001234',
    supplierTaxId: '23456789000101',
    lines,
  };
}

async function conferir(lines: InvoiceCheckRequest['lines']) {
  const order = await orders.findByExternalNumber('alfa', '4500001234');
  assert.ok(order);
  const invoice = nota(lines);
  const resultado = checkInvoice(order, invoice);
  return conferences.save({
    purchaseOrderId: order.id,
    purchaseOrderIngestionVersion: order.ingestionVersion,
    clientId: order.clientId,
    checkedAt: new Date().toISOString(),
    invoice,
    outcome: resultado.outcome,
    divergences: resultado.divergences,
  });
}

test(
  'a conferência e as divergências são gravadas atomicamente',
  { skip: semBanco },
  async () => {
    await orders.replaceSnapshot(pedido());
    const registro = await conferir([
      { material: 'MAT-9999', quantity: '1', totalValue: '10.00' },
      { material: 'MAT-1001', quantity: '40', totalValue: '1.00' },
    ]);

    assert.equal(registro.outcome, 'reprovada');
    assert.equal(registro.divergences.length, 2);

    const { rows } = await database.pool.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM conference_divergence WHERE conference_id = $1',
      [registro.id],
    );
    assert.equal(rows[0]?.total, '2');
  },
);

test(
  'a ordem das divergências sobrevive à ida e volta',
  { skip: semBanco },
  async () => {
    await orders.replaceSnapshot(pedido());
    const gravado = await conferir([
      { material: 'MAT-9999', quantity: '1', totalValue: '10.00' },
      { material: 'MAT-1001', quantity: '40', totalValue: '1.00' },
    ]);

    const pagina = await conferences.list(
      {
        clientId: null,
        outcome: null,
        divergenceCode: null,
        from: null,
        to: null,
      },
      { limit: 10, cursor: null },
    );
    // UUID v7 só ordena entre milissegundos diferentes; a coluna `position` é
    // o que faz a ordem das regras sobreviver (REVIEW-05, achado 9).
    assert.deepEqual(
      pagina.data[0]?.divergences.map((divergencia) => divergencia.code),
      gravado.divergences.map((divergencia) => divergencia.code),
    );
  },
);

test(
  'a nota conferida volta do JSONB como o contrato exige',
  { skip: semBanco },
  async () => {
    await orders.replaceSnapshot(pedido());
    await conferir([
      { material: 'MAT-1001', quantity: '40', totalValue: '1836.00' },
    ]);

    const pagina = await conferences.list(
      {
        clientId: null,
        outcome: null,
        divergenceCode: null,
        from: null,
        to: null,
      },
      { limit: 10, cursor: null },
    );
    const guardada = pagina.data[0]?.invoice;
    assert.equal(guardada?.lines[0]?.material, 'MAT-1001');
    assert.equal(guardada?.lines[0]?.totalValue, '1836.00');
  },
);

test(
  'apagar um pedido com histórico é recusado pelo banco',
  { skip: semBanco },
  async () => {
    const salvo = await orders.replaceSnapshot(pedido());
    await conferir([
      { material: 'MAT-1001', quantity: '40', totalValue: '1836.00' },
    ]);

    // O histórico é imutável por decisão de negócio, e `RESTRICT` é o que
    // impede o banco de oferecer um caminho para apagá-lo (REVIEW-05, 6).
    await assert.rejects(
      () =>
        database.pool.query('DELETE FROM purchase_order WHERE id = $1', [
          salvo.id,
        ]),
      /conference_purchase_order_id_fkey/,
    );
  },
);

test(
  'o resumo conta nota e conta ocorrência separadamente',
  { skip: semBanco },
  async () => {
    await orders.replaceSnapshot(pedido());
    await conferir([
      { material: 'MAT-1001', quantity: '40', totalValue: '1836.00' },
    ]);
    await conferir([
      { material: 'MAT-1001', quantity: '40', totalValue: '1.00' },
    ]);
    await conferir([
      { material: 'MAT-9999', quantity: '1', totalValue: '10.00' },
      { material: 'MAT-1001', quantity: '999', totalValue: '1.00' },
    ]);

    const resumo = await conferences.summarize({
      clientId: null,
      outcome: null,
      divergenceCode: null,
      from: null,
      to: null,
    });

    assert.equal(resumo.checked, 3);
    assert.equal(resumo.approved, 1);
    assert.equal(resumo.rejected, 2);

    const ocorrencias = Object.values(resumo.divergencesByCode).reduce(
      (total, quantidade) => total + quantidade,
      0,
    );
    assert.ok(
      ocorrencias > resumo.rejected,
      'a soma por código não fecha com o total de reprovadas (ADR-009)',
    );
  },
);

test(
  'reingestão não muda o sentido do histórico já gravado',
  { skip: semBanco },
  async () => {
    await orders.replaceSnapshot(pedido());
    const antes = await conferir([
      { material: 'MAT-1001', quantity: '40', totalValue: '1836.00' },
    ]);
    assert.equal(antes.purchaseOrderIngestionVersion, 1);

    // O cliente reenvia com o saldo já recebido.
    await orders.replaceSnapshot(
      pedido({
        items: [{ ...pedido().items![0]!, quantityReceived: '100.000000' }],
      }),
    );

    const pagina = await conferences.list(
      {
        clientId: null,
        outcome: null,
        divergenceCode: null,
        from: null,
        to: null,
      },
      { limit: 10, cursor: null },
    );
    // O retrato guardado continua dizendo o que foi comparado naquele dia.
    assert.equal(pagina.data[0]?.purchaseOrderIngestionVersion, 1);
    assert.equal(pagina.data[0]?.outcome, 'aprovada');
  },
);
