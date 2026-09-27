import assert from 'node:assert/strict';
import test from 'node:test';

import { poolOptionsFor } from '../src/infrastructure/database/pool.js';
import { betaProfile } from '../src/infrastructure/integrations/client-profiles.js';
import {
  PairedCsvAdapter,
  csvHeadersPart,
  csvItemsPart,
} from '../src/infrastructure/integrations/paired-csv-adapter.js';

const part = (content: string) =>
  async function* (): AsyncIterable<Uint8Array> {
    yield new TextEncoder().encode(content);
  };

test('carga acima do teto de pedidos é recusada com motivo, não por memória', async () => {
  let cabecalhos =
    'NUMERO_PEDIDO;FORNECEDOR_CNPJ;FORNECEDOR_RAZAO_SOCIAL;EMISSAO;SITUACAO;MOEDA\n';
  for (let i = 0; i < 5; i += 1) {
    cabecalhos += `P${i};12.345.678/0001-90;Fornecedor;15/08/2026;EM ABERTO;BRL\n`;
  }
  const adapter = new PairedCsvAdapter(200, 2);
  await assert.rejects(async () => {
    for await (const _ of adapter.read(
      {
        clientId: 'beta',
        formatVersion: '1',
        parts: new Map([
          [csvHeadersPart, part(cabecalhos)],
          [
            csvItemsPart,
            part(
              'NUMERO_PEDIDO;ITEM;CODIGO_MATERIAL;DESCRICAO;UNIDADE;QTD_PEDIDA;QTD_RECEBIDA;PRECO_UNITARIO\n',
            ),
          ],
        ]),
      },
      betaProfile,
    )) {
      void _;
    }
  }, /mais de 2 pedidos/);
});

test('dentro do teto, a carga passa normalmente', async () => {
  const cabecalhos =
    'NUMERO_PEDIDO;FORNECEDOR_CNPJ;FORNECEDOR_RAZAO_SOCIAL;EMISSAO;SITUACAO;MOEDA\n' +
    'P1;12.345.678/0001-90;Fornecedor;15/08/2026;EM ABERTO;BRL\n';
  const orders = [];
  for await (const batch of new PairedCsvAdapter(200, 2).read(
    {
      clientId: 'beta',
      formatVersion: '1',
      parts: new Map([
        [csvHeadersPart, part(cabecalhos)],
        [
          csvItemsPart,
          part(
            'NUMERO_PEDIDO;ITEM;CODIGO_MATERIAL;DESCRICAO;UNIDADE;QTD_PEDIDA;QTD_RECEBIDA;PRECO_UNITARIO\n',
          ),
        ],
      ]),
    },
    betaProfile,
  )) {
    orders.push(...batch.orders);
  }
  assert.equal(orders.length, 1);
});

test('o caminho de carga não herda o tempo limite do caminho de requisição', () => {
  // `query_timeout: 3000` é certo para /ready e mataria uma transação de carga
  // no meio. Separado no preset, não no ponto de uso, para não ser herdado por
  // descuido.
  assert.equal(poolOptionsFor('request').query_timeout, 3000);
  assert.equal(poolOptionsFor('ingestion').query_timeout, undefined);
  assert.ok(
    (poolOptionsFor('ingestion').connectionTimeoutMillis ?? 0) >
      (poolOptionsFor('request').connectionTimeoutMillis ?? 0),
  );
  assert.ok(
    (poolOptionsFor('ingestion').max ?? 0) <
      (poolOptionsFor('request').max ?? 0),
    'a carga não deve competir com a requisição pelo banco',
  );
});
