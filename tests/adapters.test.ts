import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import test from 'node:test';

import type {
  AdapterBatch,
  SourcePayload,
} from '../src/application/ports/source-adapter.js';
import type { ClientProfile } from '../src/domain/client.js';
import type { NormalizedPurchaseOrder } from '../src/domain/purchase-order.js';
import {
  alfaProfile,
  betaProfile,
} from '../src/infrastructure/integrations/client-profiles.js';
import {
  NestedJsonAdapter,
  nestedJsonPart,
} from '../src/infrastructure/integrations/nested-json-adapter.js';
import {
  PairedCsvAdapter,
  csvHeadersPart,
  csvItemsPart,
} from '../src/infrastructure/integrations/paired-csv-adapter.js';

function fixture(path: string): () => AsyncIterable<Uint8Array> {
  return () =>
    createReadStream(new URL(`./fixtures/${path}`, import.meta.url), {
      // Pedaços pequenos de propósito: a carga real não chega inteira.
      highWaterMark: 24,
    });
}

function text(value: string): () => AsyncIterable<Uint8Array> {
  return async function* () {
    yield new TextEncoder().encode(value);
  };
}

function payload(
  profile: ClientProfile,
  parts: Record<string, () => AsyncIterable<Uint8Array>>,
  overrides: Partial<SourcePayload> = {},
): SourcePayload {
  return {
    clientId: profile.clientId,
    formatVersion: profile.formatVersion,
    parts: new Map(Object.entries(parts)),
    ...overrides,
  };
}

async function drain(
  batches: AsyncIterable<AdapterBatch>,
): Promise<AdapterBatch> {
  const orders: NormalizedPurchaseOrder[] = [];
  const rejected: AdapterBatch['rejected'][number][] = [];
  const staged: AdapterBatch['staged'][number][] = [];
  for await (const batch of batches) {
    orders.push(...batch.orders);
    rejected.push(...batch.rejected);
    staged.push(...batch.staged);
  }
  return { orders, rejected, staged };
}

test('Alfa: a amostra vira o contrato normalizado', async () => {
  const batch = await drain(
    new NestedJsonAdapter().read(
      payload(alfaProfile, {
        [nestedJsonPart]: fixture('alfa/purchase-orders.json'),
      }),
      alfaProfile,
    ),
  );
  assert.deepEqual(batch.rejected, []);
  assert.equal(batch.orders.length, 1);

  const order = batch.orders[0];
  assert.equal(order?.externalNumber, '4500001234');
  assert.equal(order?.clientId, 'alfa');
  assert.equal(
    order?.status,
    'aberto',
    'open traduzido pelo vocabulário do perfil',
  );
  assert.equal(order?.issuedOn, '2026-08-05');
  assert.equal(order?.currency, 'BRL');
  assert.equal(order?.supplier.taxId, '23456789000101');
  assert.equal(order?.items?.length, 2);

  const item = order?.items?.[0];
  assert.equal(item?.externalLine, 10);
  assert.equal(item?.material, 'MAT-1001');
  assert.equal(item?.purchaseUnit, 'UN');
  assert.equal(item?.quantityOrdered, '100.000000');
  assert.equal(item?.quantityReceived, '60.000000');
  assert.equal(
    item?.conversionFactor,
    '1.000000',
    'cliente sem caixa: fator neutro',
  );
  // O ponto da leitura em fluxo com numberAsString: 45.9 não virou double.
  assert.equal(item?.unitPrice, '45.900000');
  assert.equal(order?.items?.[1]?.unitPrice, '128.750000');
});

test('Alfa: registro inválido é rejeitado e não derruba a carga', async () => {
  const batch = await drain(
    new NestedJsonAdapter().read(
      payload(alfaProfile, {
        [nestedJsonPart]: text(
          JSON.stringify({
            purchase_orders: [
              {
                po_number: 'PO-BOM',
                created_at: '2026-01-02',
                status: 'open',
                currency: 'BRL',
                vendor: { tax_id: '23456789000101', name: 'Fornecedor' },
                items: [
                  {
                    line: 1,
                    material: 'M1',
                    description: 'd',
                    uom: 'UN',
                    quantity_ordered: 5,
                    quantity_received: 0,
                    unit_price: 2.5,
                  },
                ],
              },
              {
                po_number: 'PO-SITUACAO',
                created_at: '2026-01-02',
                status: 'pendente',
                currency: 'BRL',
                vendor: { tax_id: '23456789000101', name: 'Fornecedor' },
                items: [],
              },
              {
                po_number: 'PO-CNPJ',
                created_at: '2026-01-02',
                status: 'open',
                currency: 'BRL',
                vendor: { tax_id: '123', name: 'Fornecedor' },
                items: [],
              },
            ],
          }),
        ),
      }),
      alfaProfile,
    ),
  );
  assert.deepEqual(
    batch.orders.map((order) => order.externalNumber),
    ['PO-BOM'],
  );
  assert.deepEqual(
    batch.rejected.map((record) => record.reference),
    ['PO-SITUACAO', 'PO-CNPJ'],
  );
  assert.match(batch.rejected[0]?.reason ?? '', /situação fora do vocabulário/);
  assert.match(batch.rejected[1]?.reason ?? '', /CNPJ fora do formato/);
});

test('Alfa: carga com versão ou cliente diferente do perfil falha alto', async () => {
  const adapter = new NestedJsonAdapter();
  await assert.rejects(
    () =>
      drain(
        adapter.read(
          payload(
            alfaProfile,
            { [nestedJsonPart]: text('{"purchase_orders":[]}') },
            { formatVersion: '2' },
          ),
          alfaProfile,
        ),
      ),
    /versão/,
  );
  await assert.rejects(
    () =>
      drain(
        adapter.read(
          payload(
            alfaProfile,
            { [nestedJsonPart]: text('{"purchase_orders":[]}') },
            { clientId: 'outro' },
          ),
          alfaProfile,
        ),
      ),
    /carga do cliente outro/,
  );
  await assert.rejects(
    () =>
      drain(
        adapter.read(
          payload(alfaProfile, { errada: text('{"purchase_orders":[]}') }),
          alfaProfile,
        ),
      ),
    /carga sem a parte orders/,
  );
});

test('Beta: os dois CSV viram pedidos com itens agrupados', async () => {
  const batch = await drain(
    new PairedCsvAdapter().read(
      payload(betaProfile, {
        [csvHeadersPart]: fixture('beta/cabecalho.csv'),
        [csvItemsPart]: fixture('beta/itens.csv'),
      }),
      betaProfile,
    ),
  );
  assert.deepEqual(batch.rejected, []);
  assert.deepEqual(
    batch.orders.map((order) => order.externalNumber),
    ['20260088412', '20260088413'],
  );

  const primeiro = batch.orders[0];
  assert.equal(primeiro?.supplier.taxId, '12345678000190', 'máscara removida');
  assert.equal(primeiro?.issuedOn, '2026-08-15', 'dd/mm/aaaa traduzido');
  assert.equal(primeiro?.status, 'aberto', 'EM ABERTO traduzido');
  assert.equal(primeiro?.items?.length, 2);
  // 1.200,000 no padrão brasileiro: ponto é milhar, vírgula é decimal.
  assert.equal(primeiro?.items?.[0]?.quantityOrdered, '1200.000000');
  assert.equal(primeiro?.items?.[0]?.unitPrice, '6.490000');
  assert.equal(primeiro?.items?.[0]?.description, 'Óleo de soja 900ml');

  const segundo = batch.orders[1];
  assert.equal(segundo?.status, 'bloqueado');
  assert.equal(segundo?.items?.[0]?.purchaseUnit, 'KG');
  assert.equal(segundo?.items?.[0]?.quantityOrdered, '2000.000000');
});

test('Beta: cabeçalho sem nenhum item vira pedido sem itens', async () => {
  const batch = await drain(
    new PairedCsvAdapter().read(
      payload(betaProfile, {
        [csvHeadersPart]: text(
          'NUMERO_PEDIDO;FORNECEDOR_CNPJ;FORNECEDOR_RAZAO_SOCIAL;EMISSAO;SITUACAO;MOEDA\n' +
            '900;12.345.678/0001-90;Sem Itens Ltda;15/08/2026;EM ABERTO;BRL\n',
        ),
        [csvItemsPart]: text(
          'NUMERO_PEDIDO;ITEM;CODIGO_MATERIAL;DESCRICAO;UNIDADE;QTD_PEDIDA;QTD_RECEBIDA;PRECO_UNITARIO\n',
        ),
      }),
      betaProfile,
    ),
  );
  assert.equal(batch.orders.length, 1);
  assert.deepEqual(batch.orders[0]?.items, [], 'lista vazia, não null');
});

test('Beta: item sem cabeçalho na mesma carga é rejeitado, não fica em staging', async () => {
  const batch = await drain(
    new PairedCsvAdapter().read(
      payload(betaProfile, {
        [csvHeadersPart]: text(
          'NUMERO_PEDIDO;FORNECEDOR_CNPJ;FORNECEDOR_RAZAO_SOCIAL;EMISSAO;SITUACAO;MOEDA\n',
        ),
        [csvItemsPart]: text(
          'NUMERO_PEDIDO;ITEM;CODIGO_MATERIAL;DESCRICAO;UNIDADE;QTD_PEDIDA;QTD_RECEBIDA;PRECO_UNITARIO\n' +
            '777;1;MAT-1;Sem cabecalho;UN;1,000;0,000;1,00\n',
        ),
      }),
      betaProfile,
    ),
  );
  assert.deepEqual(batch.orders, []);
  assert.deepEqual(
    batch.staged,
    [],
    'staging é do Delta, cujas consultas são independentes',
  );
  assert.equal(batch.rejected.length, 1);
  assert.match(batch.rejected[0]?.reason ?? '', /sem cabeçalho correspondente/);
});

test('Beta: arquivo de itens fora de ordem é recusado, não apaga itens já lidos', async () => {
  const batch = await drain(
    new PairedCsvAdapter().read(
      payload(betaProfile, {
        [csvHeadersPart]: text(
          'NUMERO_PEDIDO;FORNECEDOR_CNPJ;FORNECEDOR_RAZAO_SOCIAL;EMISSAO;SITUACAO;MOEDA\n' +
            'A;12.345.678/0001-90;Fornecedor;15/08/2026;EM ABERTO;BRL\n' +
            'B;12.345.678/0001-90;Fornecedor;15/08/2026;EM ABERTO;BRL\n',
        ),
        [csvItemsPart]: text(
          'NUMERO_PEDIDO;ITEM;CODIGO_MATERIAL;DESCRICAO;UNIDADE;QTD_PEDIDA;QTD_RECEBIDA;PRECO_UNITARIO\n' +
            'A;1;MAT-1;Primeiro;UN;1,000;0,000;1,00\n' +
            'B;1;MAT-2;Outro pedido;UN;2,000;0,000;2,00\n' +
            'A;2;MAT-3;Volta para A;UN;3,000;0,000;3,00\n',
        ),
      }),
      betaProfile,
    ),
  );
  const pedidoA = batch.orders.find((order) => order.externalNumber === 'A');
  assert.equal(
    pedidoA?.items?.length,
    1,
    'o primeiro grupo de A foi preservado',
  );
  assert.equal(batch.rejected.length, 1);
  assert.match(batch.rejected[0]?.reason ?? '', /não estão agrupados/);
});

test('Beta: linha inválida não faz o pedido afirmar que não tem itens', async () => {
  const batch = await drain(
    new PairedCsvAdapter().read(
      payload(betaProfile, {
        [csvHeadersPart]: text(
          'NUMERO_PEDIDO;FORNECEDOR_CNPJ;FORNECEDOR_RAZAO_SOCIAL;EMISSAO;SITUACAO;MOEDA\n' +
            'A;12.345.678/0001-90;Fornecedor;15/08/2026;EM ABERTO;BRL\n',
        ),
        [csvItemsPart]: text(
          'NUMERO_PEDIDO;ITEM;CODIGO_MATERIAL;DESCRICAO;UNIDADE;QTD_PEDIDA;QTD_RECEBIDA;PRECO_UNITARIO\n' +
            'A;1;MAT-1;Quantidade torta;UN;abc;0,000;1,00\n',
        ),
      }),
      betaProfile,
    ),
  );
  assert.equal(batch.orders.length, 1);
  assert.equal(
    batch.orders[0]?.items,
    null,
    'null preserva os itens já conhecidos; [] os apagaria',
  );
  assert.equal(batch.rejected.length, 1);
});

test('Beta: cabeçalho de CSV que não bate com o perfil falha alto', async () => {
  await assert.rejects(
    () =>
      drain(
        new PairedCsvAdapter().read(
          payload(betaProfile, {
            [csvHeadersPart]: text('NUMERO;CNPJ\n1;2\n'),
            [csvItemsPart]: text('NUMERO_PEDIDO\n'),
          }),
          betaProfile,
        ),
      ),
    /cabeçalho do CSV não corresponde ao perfil/,
  );
});
