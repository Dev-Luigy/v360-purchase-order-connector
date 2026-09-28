import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildTestApp, multipartBody } from './support/build-test-app.js';
import type { InMemoryConferenceRepository } from './support/in-memory-conference-repository.js';
import type { InMemoryPurchaseOrderRepository } from './support/in-memory-repositories.js';

/** Conferência: o requisito 2 do enunciado, atravessando a rota. */

async function comPedidoDoAlfa(): Promise<{
  app: FastifyInstance;
  orders: InMemoryPurchaseOrderRepository;
  conferences: InMemoryConferenceRepository;
}> {
  const contexto = await buildTestApp();
  const conteudo = await readFile(
    new URL('./fixtures/alfa/purchase-orders.json', import.meta.url),
    'utf-8',
  );
  const { body, headers } = multipartBody([
    { name: 'orders', filename: 'a.json', content: conteudo },
  ]);
  await contexto.app.inject({
    method: 'POST',
    url: '/clients/alfa/ingestions',
    headers: { ...headers, 'x-format-version': '1' },
    payload: body,
  });
  return contexto;
}

/** MAT-1001: 100 pedidas, 60 recebidas, saldo 40, a 45,90 a unidade. */
const notaConforme = {
  clientId: 'alfa',
  purchaseOrderNumber: '4500001234',
  supplierTaxId: '23456789000101',
  lines: [{ material: 'MAT-1001', quantity: '40', totalValue: '1836.00' }],
};

interface Conferencia {
  id: string;
  purchaseOrderId: string;
  purchaseOrderIngestionVersion: number;
  clientId: string;
  outcome: string;
  divergences: {
    code: string;
    expected: string | null;
    received: string | null;
  }[];
}

test('nota conforme é aprovada e vira registro no histórico', async (t) => {
  const { app, orders, conferences } = await comPedidoDoAlfa();
  t.after(() => app.close());

  const resposta = await app.inject({
    method: 'POST',
    url: '/conferences',
    payload: notaConforme,
  });

  assert.equal(resposta.statusCode, 201, 'conferir cria um fato no histórico');
  const conferencia = resposta.json() as Conferencia;
  assert.equal(conferencia.outcome, 'aprovada');
  assert.deepEqual(conferencia.divergences, []);

  const pedido = await orders.findByExternalNumber('alfa', '4500001234');
  assert.equal(conferencia.purchaseOrderId, pedido?.id);
  assert.equal(conferencia.purchaseOrderIngestionVersion, 1);

  const historico = await conferences.summarize({
    clientId: null,
    outcome: null,
    divergenceCode: null,
    from: null,
    to: null,
  });
  assert.equal(historico.checked, 1);
  assert.equal(historico.approved, 1);
});

test('devolve todas as divergências, não a primeira', async (t) => {
  const { app } = await comPedidoDoAlfa();
  t.after(() => app.close());

  const resposta = await app.inject({
    method: 'POST',
    url: '/conferences',
    payload: {
      ...notaConforme,
      supplierTaxId: '99999999000199',
      lines: [
        { material: 'MAT-9999', quantity: '1', totalValue: '10.00' },
        { material: 'MAT-1001', quantity: '40', totalValue: '1.00' },
      ],
    },
  });

  assert.equal(resposta.statusCode, 201);
  const conferencia = resposta.json() as Conferencia;
  assert.equal(conferencia.outcome, 'reprovada');
  assert.deepEqual(
    conferencia.divergences.map((divergencia) => divergencia.code),
    [
      'FORNECEDOR_DIVERGENTE',
      'MATERIAL_NAO_ENCONTRADO',
      'VALOR_TOTAL_DIVERGENTE',
    ],
  );
});

test('quantidade acima do saldo diz o esperado e o recebido', async (t) => {
  const { app } = await comPedidoDoAlfa();
  t.after(() => app.close());

  const resposta = await app.inject({
    method: 'POST',
    url: '/conferences',
    payload: {
      ...notaConforme,
      lines: [{ material: 'MAT-1001', quantity: '50', totalValue: '2295.00' }],
    },
  });

  const divergencia = (resposta.json() as Conferencia).divergences[0];
  assert.equal(divergencia?.code, 'QUANTIDADE_ACIMA_DO_SALDO');
  assert.equal(divergencia?.expected, '40.000000');
  assert.equal(divergencia?.received, '50');
});

test('conferir não consome saldo', async (t) => {
  const { app, orders } = await comPedidoDoAlfa();
  t.after(() => app.close());

  const antes = await orders.findByExternalNumber('alfa', '4500001234');
  await app.inject({
    method: 'POST',
    url: '/conferences',
    payload: notaConforme,
  });
  await app.inject({
    method: 'POST',
    url: '/conferences',
    payload: notaConforme,
  });
  const depois = await orders.findByExternalNumber('alfa', '4500001234');

  assert.equal(
    depois?.items[0]?.quantityPending,
    antes?.items[0]?.quantityPending,
  );
  assert.equal(depois?.ingestionVersion, antes?.ingestionVersion);
});

test('o histórico guarda a versão do pedido que foi conferida', async (t) => {
  const { app, orders } = await comPedidoDoAlfa();
  t.after(() => app.close());

  const primeira = await app.inject({
    method: 'POST',
    url: '/conferences',
    payload: notaConforme,
  });
  assert.equal(
    (primeira.json() as Conferencia).purchaseOrderIngestionVersion,
    1,
  );

  // Reingestão do mesmo pedido: a versão sobe.
  const conteudo = await readFile(
    new URL('./fixtures/alfa/purchase-orders.json', import.meta.url),
    'utf-8',
  );
  const { body, headers } = multipartBody([
    { name: 'orders', filename: 'a.json', content: conteudo },
  ]);
  await app.inject({
    method: 'POST',
    url: '/clients/alfa/ingestions',
    headers: { ...headers, 'x-format-version': '1' },
    payload: body,
  });

  const segunda = await app.inject({
    method: 'POST',
    url: '/conferences',
    payload: notaConforme,
  });
  assert.equal(
    (segunda.json() as Conferencia).purchaseOrderIngestionVersion,
    2,
  );
  // Sem esse retrato, a reingestão mudaria o sentido do histórico
  // retroativamente (ADR-009).
  assert.equal(
    (primeira.json() as Conferencia).purchaseOrderIngestionVersion,
    1,
  );
  void orders;
});

test('pedido inexistente é 404, não divergência', async (t) => {
  const { app } = await buildTestApp();
  t.after(() => app.close());

  const resposta = await app.inject({
    method: 'POST',
    url: '/conferences',
    payload: { ...notaConforme, purchaseOrderNumber: 'NAO-EXISTE' },
  });

  assert.equal(resposta.statusCode, 404);
  assert.equal(
    (resposta.json() as { error: string }).error,
    'pedido_nao_encontrado',
  );
});

test('campo desconhecido no corpo não atravessa para o histórico', async (t) => {
  const { app, conferences } = await comPedidoDoAlfa();
  t.after(() => app.close());

  await app.inject({
    method: 'POST',
    url: '/conferences',
    payload: { ...notaConforme, segredo: 'nao deveria persistir' },
  });

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
  const guardada = pagina.data[0]?.invoice as
    Record<string, unknown> | undefined;
  assert.equal(
    guardada?.segredo,
    undefined,
    'o registro guarda o valor validado, não o objeto cru (REVIEW-07, R07-04)',
  );
});

test('nota fora do contrato é recusada na borda', async (t) => {
  const { app } = await comPedidoDoAlfa();
  t.after(() => app.close());

  for (const corpo of [
    { ...notaConforme, supplierTaxId: '123' },
    { ...notaConforme, lines: [] },
    {
      ...notaConforme,
      lines: [{ material: 'M', quantity: 'abc', totalValue: '1' }],
    },
  ]) {
    const resposta = await app.inject({
      method: 'POST',
      url: '/conferences',
      payload: corpo,
    });
    assert.equal(resposta.statusCode, 400, JSON.stringify(corpo).slice(0, 60));
  }
});
