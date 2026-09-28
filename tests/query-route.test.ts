import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import type { FastifyInstance } from 'fastify';

import { maxPageLimit } from '../src/application/ports/pagination.js';

import { buildTestApp, multipartBody } from './support/build-test-app.js';
import type { InMemoryPurchaseOrderRepository } from './support/in-memory-repositories.js';

/** Consulta e detalhe: o requisito 1 do enunciado, atravessando a rota. */

async function comCargaDosDois(): Promise<{
  app: FastifyInstance;
  orders: InMemoryPurchaseOrderRepository;
}> {
  const { app, orders } = await buildTestApp();
  const ler = (caminho: string) =>
    readFile(new URL(`./fixtures/${caminho}`, import.meta.url), 'utf-8');

  const alfa = multipartBody([
    {
      name: 'orders',
      filename: 'a.json',
      content: await ler('alfa/purchase-orders.json'),
    },
  ]);
  await app.inject({
    method: 'POST',
    url: '/clients/alfa/ingestions',
    headers: { ...alfa.headers, 'x-format-version': '1' },
    payload: alfa.body,
  });

  const beta = multipartBody([
    {
      name: 'headers',
      filename: 'c.csv',
      content: await ler('beta/cabecalho.csv'),
    },
    { name: 'items', filename: 'i.csv', content: await ler('beta/itens.csv') },
  ]);
  await app.inject({
    method: 'POST',
    url: '/clients/beta/ingestions',
    headers: { ...beta.headers, 'x-format-version': '1' },
    payload: beta.body,
  });

  return { app, orders };
}

interface Pagina {
  data: { clientId: string; externalNumber: string; status: string }[];
  page: { limit: number; hasMore: boolean; nextCursor: string | null };
}

test('lista os pedidos de todos os clientes em formato único', async (t) => {
  const { app } = await comCargaDosDois();
  t.after(() => app.close());

  const resposta = await app.inject('/purchase-orders');
  assert.equal(resposta.statusCode, 200);
  const pagina = resposta.json() as Pagina;
  assert.equal(pagina.data.length, 3);
  // Alfa e Beta saem com a mesma forma, que é o ponto do conector.
  assert.deepEqual(
    [...new Set(pagina.data.map((pedido) => pedido.clientId))].sort(),
    ['alfa', 'beta'],
  );
  assert.equal(pagina.page.limit, 50, 'tamanho padrão de ADR-010');
});

test('os filtros do requisito 1 são combináveis', async (t) => {
  const { app } = await comCargaDosDois();
  t.after(() => app.close());

  const porCliente = await app.inject('/purchase-orders?clientId=beta');
  assert.equal((porCliente.json() as Pagina).data.length, 2);

  const porSituacao = await app.inject(
    '/purchase-orders?clientId=beta&status=bloqueado',
  );
  const bloqueados = (porSituacao.json() as Pagina).data;
  assert.equal(bloqueados.length, 1);
  assert.equal(bloqueados[0]?.externalNumber, '20260088413');

  const porFornecedor = await app.inject(
    '/purchase-orders?supplierTaxId=23456789000101',
  );
  assert.equal((porFornecedor.json() as Pagina).data.length, 1);

  const comSaldo = await app.inject('/purchase-orders?pending=true');
  assert.equal(
    (comSaldo.json() as Pagina).data.length,
    3,
    'os três têm item com saldo',
  );
});

test('a paginação convive com os filtros', async (t) => {
  const { app } = await comCargaDosDois();
  t.after(() => app.close());

  const resposta = await app.inject('/purchase-orders?clientId=beta&limit=1');
  const pagina = resposta.json() as Pagina;
  assert.equal(pagina.data.length, 1);
  assert.equal(pagina.page.limit, 1);
  assert.equal(pagina.page.hasMore, true);
});

test('tamanho de página acima do teto é 400, não recorte silencioso', async (t) => {
  const { app } = await buildTestApp();
  t.after(() => app.close());

  const resposta = await app.inject(
    `/purchase-orders?limit=${String(maxPageLimit + 1)}`,
  );
  assert.equal(resposta.statusCode, 400);
  assert.equal(
    (resposta.json() as { error: string }).error,
    'requisicao_invalida',
  );
});

test('filtro com valor fora do contrato é recusado na borda', async (t) => {
  const { app } = await buildTestApp();
  t.after(() => app.close());

  for (const query of [
    '/purchase-orders?status=inventado',
    '/purchase-orders?supplierTaxId=123',
    '/purchase-orders?limit=0',
    '/purchase-orders?limit=abc',
  ]) {
    const resposta = await app.inject(query);
    assert.equal(resposta.statusCode, 400, query);
  }
});

test('o detalhe traz o saldo também na unidade de consumo', async (t) => {
  const { app, orders } = await comCargaDosDois();
  t.after(() => app.close());

  const pedido = await orders.findByExternalNumber('alfa', '4500001234');
  assert.ok(pedido);

  const resposta = await app.inject(`/purchase-orders/${pedido.id}`);
  assert.equal(resposta.statusCode, 200);

  const detalhe = resposta.json() as {
    items: {
      quantityPending: string;
      conversionFactor: string;
      quantityPendingInConsumptionUnit: string;
    }[];
  };
  const item = detalhe.items[0];
  assert.equal(item?.quantityPending, '40.000000');
  assert.equal(item?.conversionFactor, '1.000000');
  // Fator 1: as duas unidades coincidem. O campo existe porque a nota fala
  // em unidade de consumo e o pedido em unidade de compra (ADR-007).
  assert.equal(item?.quantityPendingInConsumptionUnit, '40.000000');
});

test('pedido inexistente é 404, não lista vazia', async (t) => {
  const { app } = await buildTestApp();
  t.after(() => app.close());

  const resposta = await app.inject('/purchase-orders/nao-existe');
  assert.equal(resposta.statusCode, 404);
  assert.equal(
    (resposta.json() as { error: string }).error,
    'pedido_nao_encontrado',
  );
});
