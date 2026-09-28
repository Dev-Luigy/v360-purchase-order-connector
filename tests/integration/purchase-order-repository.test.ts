import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';

import { PrismaPurchaseOrderRepository } from '../../src/infrastructure/database/purchase-order-repository.js';
import type { DatabaseConnection } from '../../src/infrastructure/database/prisma-client.js';

import { connect, limpar, pedido, semBanco } from './support.js';

/** Plano da consulta, em texto, para as asserções de índice. */
async function explicar(sql: string): Promise<string> {
  const { rows } = await database.pool.query<{ 'QUERY PLAN': string }>(
    `EXPLAIN ${sql}`,
  );
  return rows.map((linha) => linha['QUERY PLAN']).join('\n');
}

/**
 * O que só PostgreSQL real prova: transação, advisory lock sob concorrência,
 * `CHECK`, `RESTRICT` e o plano das consultas quentes.
 */

let database: DatabaseConnection;
let orders: PrismaPurchaseOrderRepository;

before(() => {
  if (semBanco) return;
  database = connect();
  orders = new PrismaPurchaseOrderRepository(database.prisma);
});

beforeEach(async () => {
  if (semBanco) return;
  await limpar(database);
});

after(async () => {
  if (semBanco) return;
  await database.close();
});

test(
  'persiste o pedido com o decimal intacto',
  { skip: semBanco },
  async () => {
    const salvo = await orders.replaceSnapshot(pedido());

    assert.equal(salvo.externalNumber, '4500001234');
    assert.equal(salvo.ingestionVersion, 1);
    // Ida e volta por NUMERIC(30,6) sem passar por ponto flutuante.
    assert.equal(salvo.items[0]?.unitPrice, '45.900000');
    assert.equal(salvo.items[0]?.quantityPending, '40.000000');
    assert.equal(salvo.hasPendingBalance, true);

    const lido = await orders.findByExternalNumber('alfa', '4500001234');
    assert.equal(lido?.id, salvo.id);
    assert.equal(lido?.items[0]?.unitPrice, '45.900000');
  },
);

test(
  'reenvio preserva a identidade interna e incrementa a versão',
  { skip: semBanco },
  async () => {
    const primeiro = await orders.replaceSnapshot(pedido());
    const segundo = await orders.replaceSnapshot(
      pedido({
        items: [
          {
            ...pedido().items![0]!,
            quantityReceived: '80.000000',
          },
        ],
      }),
    );

    assert.equal(segundo.id, primeiro.id, 'identidade interna preservada');
    assert.equal(segundo.ingestionVersion, 2);
    assert.equal(segundo.items[0]?.quantityPending, '20.000000');

    const contagem = await database.pool.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM purchase_order',
    );
    assert.equal(contagem.rows[0]?.total, '1', 'reenvio não cria outra linha');
  },
);

test(
  'items null preserva os itens conhecidos; lista vazia os remove',
  { skip: semBanco },
  async () => {
    await orders.replaceSnapshot(pedido());

    const soCabecalho = await orders.replaceSnapshot(
      pedido({ status: 'bloqueado', items: null }),
    );
    assert.equal(soCabecalho.status, 'bloqueado', 'o cabeçalho foi aplicado');
    assert.equal(soCabecalho.items.length, 1, 'os itens sobreviveram');

    const semItens = await orders.replaceSnapshot(pedido({ items: [] }));
    assert.equal(semItens.items.length, 0);
    assert.equal(
      semItens.hasPendingBalance,
      false,
      'sem item não há saldo a receber',
    );
  },
);

test(
  'cargas concorrentes do mesmo pedido são serializadas pelo advisory lock',
  { skip: semBanco },
  async () => {
    // Sem o lock, as duas transações não enxergam a linha uma da outra e ambas
    // tentam criar: o unique de (clientId, externalNumber) derruba uma delas.
    const resultados = await Promise.allSettled([
      orders.replaceSnapshot(pedido()),
      orders.replaceSnapshot(pedido()),
    ]);

    assert.deepEqual(
      resultados.map((resultado) => resultado.status),
      ['fulfilled', 'fulfilled'],
      'as duas cargas concluem; uma cria e a outra atualiza',
    );

    const contagem = await database.pool.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM purchase_order',
    );
    assert.equal(contagem.rows[0]?.total, '1');

    const final = await orders.findByExternalNumber('alfa', '4500001234');
    assert.equal(final?.ingestionVersion, 2, 'as duas cargas foram contadas');
  },
);

test(
  'os CHECK do banco recusam o que a aplicação também recusaria',
  { skip: semBanco },
  async () => {
    const salvo = await orders.replaceSnapshot(pedido());

    // Fator zero fazia a conferência dividir por zero (REVIEW-05, achado 7).
    await assert.rejects(
      () =>
        database.pool.query(
          'UPDATE purchase_order_item SET conversion_factor = 0 WHERE purchase_order_id = $1',
          [salvo.id],
        ),
      /conversion_factor_check/,
    );

    // O saldo é derivado: não pode divergir da origem.
    await assert.rejects(
      () =>
        database.pool.query(
          'UPDATE purchase_order_item SET quantity_pending = 999 WHERE purchase_order_id = $1',
          [salvo.id],
        ),
      /quantity_pending_check/,
    );

    await assert.rejects(
      () =>
        database.pool.query(
          'UPDATE purchase_order SET supplier_tax_id = $1 WHERE id = $2',
          ['abcdefghijklmn', salvo.id],
        ),
      /supplier_tax_id_check/,
    );
  },
);

test(
  'o índice parcial por cliente sustenta a varredura noturna',
  { skip: semBanco },
  async () => {
    // Dois clientes, de propósito: com um só, filtrar por cliente não
    // seleciona nada e o planejador prefere o índice parcial mais estreito.
    // A varredura que o enunciado descreve é por cliente, e é esse caso que
    // precisa de índice.
    for (const clientId of ['alfa', 'beta']) {
      for (let i = 0; i < 150; i += 1) {
        await orders.replaceSnapshot(
          pedido({
            clientId,
            externalNumber: `PO-${clientId}-${String(i).padStart(5, '0')}`,
          }),
        );
      }
    }
    await database.pool.query('ANALYZE purchase_order');

    const plano = await explicar(
      `SELECT id FROM purchase_order
        WHERE client_id = 'alfa' AND has_pending_balance
        ORDER BY id LIMIT 50`,
    );
    assert.match(
      plano,
      /purchase_order_pending_by_client_idx/,
      `a varredura por cliente com saldo deveria usar o índice parcial.\n${plano}`,
    );
    assert.doesNotMatch(plano, /Seq Scan/, plano);
  },
);

test(
  'a varredura de saldo sem recorte por cliente também tem índice',
  { skip: semBanco },
  async () => {
    for (let i = 0; i < 150; i += 1) {
      await orders.replaceSnapshot(
        pedido({ externalNumber: `PO-${String(i).padStart(5, '0')}` }),
      );
    }
    await database.pool.query('ANALYZE purchase_order');

    const plano = await explicar(
      `SELECT id FROM purchase_order
        WHERE has_pending_balance ORDER BY id LIMIT 50`,
    );
    // Este índice entrou em FIX-08: antes, varrer todos os clientes com saldo
    // não tinha caminho indexado (REVIEW-07, R07-04).
    assert.match(plano, /purchase_order_pending_idx/, plano);
  },
);

test(
  'o filtro por fornecedor também é indexado',
  { skip: semBanco },
  async () => {
    for (const taxId of ['23456789000101', '98765432000155']) {
      for (let i = 0; i < 120; i += 1) {
        await orders.replaceSnapshot(
          pedido({
            externalNumber: `PO-${taxId}-${String(i).padStart(5, '0')}`,
            supplier: { taxId, name: 'Fornecedor' },
          }),
        );
      }
    }
    await database.pool.query('ANALYZE purchase_order');

    const plano = await explicar(
      `SELECT id FROM purchase_order
        WHERE supplier_tax_id = '23456789000101' ORDER BY id LIMIT 50`,
    );
    assert.match(plano, /purchase_order_supplier_tax_id_id_idx/, plano);
  },
);

test(
  'a paginação por cursor não repete nem pula registros',
  { skip: semBanco },
  async () => {
    for (let i = 0; i < 25; i += 1) {
      await orders.replaceSnapshot(
        pedido({ externalNumber: `PO-${String(i).padStart(5, '0')}` }),
      );
    }

    const filtros = {
      clientId: 'alfa',
      supplierTaxId: null,
      status: null,
      onlyPending: true,
    };
    const vistos: string[] = [];
    let cursor: string | null = null;

    for (let pagina = 0; pagina < 10; pagina += 1) {
      const resultado = await orders.list(filtros, { limit: 10, cursor });
      vistos.push(...resultado.data.map((pedido) => pedido.externalNumber));
      cursor = resultado.page.nextCursor;
      if (cursor === null) break;
    }

    assert.equal(vistos.length, 25, 'todos os pedidos apareceram');
    assert.equal(new Set(vistos).size, 25, 'nenhum apareceu duas vezes');
  },
);

test(
  'trocar de filtro no meio da varredura é recusado',
  { skip: semBanco },
  async () => {
    for (let i = 0; i < 5; i += 1) {
      await orders.replaceSnapshot(
        pedido({ externalNumber: `PO-${String(i)}` }),
      );
    }

    const primeira = await orders.list(
      {
        clientId: 'alfa',
        supplierTaxId: null,
        status: null,
        onlyPending: true,
      },
      { limit: 2, cursor: null },
    );
    assert.ok(primeira.page.nextCursor);

    await assert.rejects(
      () =>
        orders.list(
          {
            clientId: 'alfa',
            supplierTaxId: null,
            status: null,
            onlyPending: false,
          },
          { limit: 2, cursor: primeira.page.nextCursor },
        ),
      /os filtros mudaram/,
    );
  },
);
