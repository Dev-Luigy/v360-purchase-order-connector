import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPool,
  poolOptionsFor,
} from '../src/infrastructure/database/pool.js';
import {
  alfaProfile,
  betaProfile,
} from '../src/infrastructure/integrations/client-profiles.js';
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
  const request = poolOptionsFor('request');
  const ingestion = poolOptionsFor('ingestion');
  assert.equal(request.query_timeout, 3000);
  // Largo, mas finito: sem limite, uma carga travada em lock espera para
  // sempre e segura a conexão até o processo morrer (REVIEW-04, R04-05).
  assert.ok((ingestion.query_timeout ?? 0) > (request.query_timeout ?? 0));
  assert.ok(Number.isFinite(ingestion.query_timeout));
  assert.ok(Number.isFinite(ingestion.lock_timeout));
  assert.ok(Number.isFinite(ingestion.idle_in_transaction_session_timeout));
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

test('preset de pool e perfil exportado não podem ser alterados por quem os recebe', () => {
  // `Readonly` é só de compilação. Sem congelar, mutar o objeto devolvido
  // mudava o preset para todo mundo — a mesma classe de defeito que os perfis
  // de cliente tiveram em REVIEW-03.
  const opcoes = poolOptionsFor('request');
  assert.equal(Object.isFrozen(opcoes), true);
  assert.throws(() => {
    (opcoes as { max?: number }).max = 999;
  }, TypeError);
  assert.equal(poolOptionsFor('request').max, 10);

  assert.equal(Object.isFrozen(alfaProfile), true);
  assert.equal(Object.isFrozen(alfaProfile.numberFormat), true);
  assert.throws(() => {
    (alfaProfile as { clientId: string }).clientId = 'outro';
  }, TypeError);
});

test('createPool aplica o preset sem deixar o chamador alterá-lo', () => {
  // A cópia que vai para o pg é nova; o preset segue intacto.
  const pool = createPool('postgres://localhost:5432/x', 'ingestion');
  assert.equal(poolOptionsFor('ingestion').max, 4);
  void pool.end();
});
