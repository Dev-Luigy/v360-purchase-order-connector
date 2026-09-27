import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { streamArrayAtKey } from '../src/infrastructure/integrations/json-stream.js';

/** Entrega o texto em pedaços de `size` bytes, para exercitar as fronteiras. */
async function* bytes(text: string, size = 4096): AsyncIterable<Uint8Array> {
  const encoded = new TextEncoder().encode(text);
  for (let offset = 0; offset < encoded.length; offset += size) {
    yield encoded.subarray(offset, offset + size);
  }
}

async function collect(
  chunks: AsyncIterable<Uint8Array>,
  key: string,
): Promise<unknown[]> {
  const items: unknown[] = [];
  for await (const item of streamArrayAtKey(chunks, key)) items.push(item);
  return items;
}

test('rende cada elemento do array pedido', async () => {
  const items = await collect(
    bytes('{"orders":[{"a":1},{"a":2},{"a":3}]}'),
    'orders',
  );
  assert.equal(items.length, 3);
});

test('o número chega como o texto que o cliente escreveu, não como double', async () => {
  const [item] = (await collect(
    bytes('{"orders":[{"unit_price":45.9,"big":1e3,"tiny":0.00000001}]}'),
    'orders',
  )) as { unit_price: string; big: string; tiny: string }[];
  assert.equal(item?.unit_price, '45.9');
  assert.equal(item?.big, '1e3');
  assert.equal(item?.tiny, '0.00000001');
  // Sem numberAsString, o mesmo campo chegaria como double e 45.9 não é 45.9.
  assert.equal((45.9).toFixed(20), '45.89999999999999857891');
});

test('não depende de onde o chunk corta, nem no meio de um caractere multibyte', async () => {
  const payload =
    '{"orders":[{"name":"Metalúrgica São Jorge S.A.","price":45.9},{"name":"Açúcar"}]}';
  for (const size of [1, 2, 3, 7, 64]) {
    const items = (await collect(bytes(payload, size), 'orders')) as {
      name: string;
      price?: string;
    }[];
    assert.equal(items.length, 2, `chunk de ${size}`);
    assert.equal(
      items[0]?.name,
      'Metalúrgica São Jorge S.A.',
      `chunk de ${size}`,
    );
    assert.equal(items[0]?.price, '45.9', `chunk de ${size}`);
    assert.equal(items[1]?.name, 'Açúcar', `chunk de ${size}`);
  }
});

test('colchete e chave dentro de string não confundem o recorte', async () => {
  const items = (await collect(
    bytes('{"orders":[{"d":"]},{ \\" ["},{"d":"fim"}]}'),
    'orders',
  )) as { d: string }[];
  assert.deepEqual(
    items.map((item) => item.d),
    [']},{ " [', 'fim'],
  );
});

test('array vazio rende nada, sem erro', async () => {
  assert.deepEqual(await collect(bytes('{"orders":[]}'), 'orders'), []);
});

test('pega o array da raiz, não um de mesmo nome aninhado', async () => {
  const items = await collect(
    bytes('{"meta":[1,2,3],"nested":{"orders":[9,9]},"orders":[{"a":1}]}'),
    'orders',
  );
  assert.deepEqual(items, [{ a: '1' }]);
});

test('payload que não corresponde ao perfil falha alto, em vez de render zero', async () => {
  await assert.rejects(
    () => collect(bytes('{"pedidos":[{"a":1}]}'), 'orders'),
    {
      message: /não encontrado como array/,
    },
  );
  await assert.rejects(() => collect(bytes('{"orders":{"a":1}}'), 'orders'), {
    message: /should be an array/,
  });
});

test('lê a amostra do Alfa como ela está no repositório', async () => {
  const text = await readFile(
    new URL('./fixtures/alfa/purchase-orders.json', import.meta.url),
    'utf-8',
  );
  const orders = (await collect(bytes(text, 16), 'purchase_orders')) as {
    po_number: string;
    items: { unit_price: string }[];
  }[];
  assert.equal(orders.length, 1);
  assert.equal(orders[0]?.po_number, '4500001234');
  assert.equal(orders[0]?.items[0]?.unit_price, '45.9');
  assert.equal(orders[0]?.items[1]?.unit_price, '128.75');
});
