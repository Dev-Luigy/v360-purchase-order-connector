import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { maxClientIdLength } from '../src/domain/limits.js';

import { buildTestApp, multipartBody } from './support/build-test-app.js';

/**
 * Ingestão de ponta a ponta: rota → caso de uso → adaptador → repositório.
 *
 * Com repositório em memória. Transação, advisory lock e `CHECK` continuam
 * dependendo de PostgreSQL real, que é ENV-03.
 */

async function fixture(caminho: string): Promise<string> {
  return readFile(new URL(`./fixtures/${caminho}`, import.meta.url), 'utf-8');
}

test('Alfa: um JSON aninhado vira pedido persistido', async (t) => {
  const { app, orders } = await buildTestApp();
  t.after(() => app.close());

  const { body, headers } = multipartBody([
    {
      name: 'orders',
      filename: 'purchase-orders.json',
      content: await fixture('alfa/purchase-orders.json'),
    },
  ]);

  const resposta = await app.inject({
    method: 'POST',
    url: '/clients/alfa/ingestions',
    headers: { ...headers, 'x-format-version': '1' },
    payload: body,
  });

  assert.equal(resposta.statusCode, 200);
  const relatorio = resposta.json() as {
    ordersAccepted: number;
    itemsAccepted: number;
    rejectedTotal: number;
    clientId: string;
  };
  assert.equal(relatorio.ordersAccepted, 1);
  assert.equal(relatorio.itemsAccepted, 2);
  assert.equal(relatorio.rejectedTotal, 0);
  assert.equal(relatorio.clientId, 'alfa');

  const salvo = await orders.findByExternalNumber('alfa', '4500001234');
  assert.equal(salvo?.ingestionVersion, 1);
  assert.equal(salvo?.supplier.taxId, '23456789000101');
  // O decimal atravessou a cadeia inteira sem virar ponto flutuante.
  assert.equal(salvo?.items[0]?.unitPrice, '45.900000');
  assert.equal(salvo?.items[0]?.quantityPending, '40.000000');
  assert.equal(salvo?.hasPendingBalance, true);
});

test('Beta: dois CSV na mesma carga viram dois pedidos', async (t) => {
  const { app, orders } = await buildTestApp();
  t.after(() => app.close());

  const { body, headers } = multipartBody([
    {
      name: 'headers',
      filename: 'cabecalho.csv',
      content: await fixture('beta/cabecalho.csv'),
    },
    {
      name: 'items',
      filename: 'itens.csv',
      content: await fixture('beta/itens.csv'),
    },
  ]);

  const resposta = await app.inject({
    method: 'POST',
    url: '/clients/beta/ingestions',
    headers: { ...headers, 'x-format-version': '1' },
    payload: body,
  });

  assert.equal(resposta.statusCode, 200);
  const relatorio = resposta.json() as {
    ordersAccepted: number;
    itemsAccepted: number;
  };
  assert.equal(relatorio.ordersAccepted, 2);
  assert.equal(relatorio.itemsAccepted, 3);

  const bloqueado = await orders.findByExternalNumber('beta', '20260088413');
  assert.equal(bloqueado?.status, 'bloqueado');
  // 1.200,000 no padrão brasileiro, atravessando rota e adaptador.
  const aberto = await orders.findByExternalNumber('beta', '20260088412');
  assert.equal(aberto?.items[0]?.quantityOrdered, '1200.000000');
});

test('reenvio preserva a identidade e incrementa a versão', async (t) => {
  const { app, orders } = await buildTestApp();
  t.after(() => app.close());

  const carga = async () => {
    const { body, headers } = multipartBody([
      {
        name: 'orders',
        filename: 'purchase-orders.json',
        content: await fixture('alfa/purchase-orders.json'),
      },
    ]);
    return app.inject({
      method: 'POST',
      url: '/clients/alfa/ingestions',
      headers: { ...headers, 'x-format-version': '1' },
      payload: body,
    });
  };

  await carga();
  const primeiro = await orders.findByExternalNumber('alfa', '4500001234');
  await carga();
  const segundo = await orders.findByExternalNumber('alfa', '4500001234');

  assert.equal(segundo?.id, primeiro?.id, 'a identidade interna é preservada');
  assert.equal(segundo?.ingestionVersion, 2);
  assert.equal(orders.size, 1, 'reenvio não cria um segundo pedido');
});

test('cliente sem perfil é 404, não 500', async (t) => {
  const { app } = await buildTestApp();
  t.after(() => app.close());

  const { body, headers } = multipartBody([
    { name: 'orders', filename: 'x.json', content: '{"purchase_orders":[]}' },
  ]);
  const resposta = await app.inject({
    method: 'POST',
    url: '/clients/omega/ingestions',
    headers: { ...headers, 'x-format-version': '1' },
    payload: body,
  });

  assert.equal(resposta.statusCode, 404);
  assert.equal(
    (resposta.json() as { error: string }).error,
    'cliente_desconhecido',
  );
});

test('parte com nome fora da allowlist é recusada antes de qualquer escrita', async (t) => {
  const { app } = await buildTestApp();
  t.after(() => app.close());

  const { body, headers } = multipartBody([
    // O nome que o cliente manda nunca vira caminho no disco; aqui ele nem
    // chega a ser gravado, porque não está na allowlist da forma.
    { name: '../../etc/passwd', filename: 'x.json', content: '{}' },
  ]);
  const resposta = await app.inject({
    method: 'POST',
    url: '/clients/alfa/ingestions',
    headers: { ...headers, 'x-format-version': '1' },
    payload: body,
  });

  assert.equal(resposta.statusCode, 400);
  assert.equal((resposta.json() as { error: string }).error, 'carga_invalida');
});

test('carga sem a parte que a forma exige é 400 com o que falta', async (t) => {
  const { app } = await buildTestApp();
  t.after(() => app.close());

  const { body, headers } = multipartBody([
    { name: 'headers', filename: 'cabecalho.csv', content: 'NUMERO_PEDIDO\n' },
  ]);
  const resposta = await app.inject({
    method: 'POST',
    url: '/clients/beta/ingestions',
    headers: { ...headers, 'x-format-version': '1' },
    payload: body,
  });

  assert.equal(resposta.statusCode, 400);
  const corpo = resposta.json() as { error: string; message: string };
  assert.equal(corpo.error, 'partes_ausentes');
  assert.match(corpo.message, /items/);
});

test('versão de formato diferente do perfil é 422, não tentativa de leitura', async (t) => {
  const { app } = await buildTestApp();
  t.after(() => app.close());

  const { body, headers } = multipartBody([
    {
      name: 'orders',
      filename: 'purchase-orders.json',
      content: await fixture('alfa/purchase-orders.json'),
    },
  ]);
  const resposta = await app.inject({
    method: 'POST',
    url: '/clients/alfa/ingestions',
    headers: { ...headers, 'x-format-version': '99' },
    payload: body,
  });

  assert.equal(resposta.statusCode, 422);
  assert.match((resposta.json() as { message: string }).message, /versão/);
});

test('cabeçalho de versão ausente é recusado pelo schema da rota', async (t) => {
  const { app } = await buildTestApp();
  t.after(() => app.close());

  const { body, headers } = multipartBody([
    { name: 'orders', filename: 'x.json', content: '{"purchase_orders":[]}' },
  ]);
  const resposta = await app.inject({
    method: 'POST',
    url: '/clients/alfa/ingestions',
    headers,
    payload: body,
  });

  assert.equal(resposta.statusCode, 400);
});

test('identificador de cliente acima do limite não chega ao caso de uso', async (t) => {
  const { app } = await buildTestApp();
  t.after(() => app.close());

  const { body, headers } = multipartBody([
    { name: 'orders', filename: 'x.json', content: '{"purchase_orders":[]}' },
  ]);
  const resposta = await app.inject({
    method: 'POST',
    url: `/clients/${'a'.repeat(maxClientIdLength + 1)}/ingestions`,
    headers: { ...headers, 'x-format-version': '1' },
    payload: body,
  });

  assert.equal(resposta.statusCode, 400);
});
