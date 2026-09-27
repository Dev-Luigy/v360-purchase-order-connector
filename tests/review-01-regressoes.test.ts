import assert from 'node:assert/strict';
import test from 'node:test';

import { checkInvoice } from '../src/domain/conference-rules.js';
import { currencyScale, Decimal } from '../src/domain/decimal.js';
import {
  decimalTextSchema,
  invoiceCheckRequestSchema,
  isoDateSchema,
  normalizedItemSchema,
} from '../src/domain/schemas.js';
import type { PurchaseOrder } from '../src/domain/purchase-order.js';
import {
  InMemoryClientProfiles,
  alfaProfile,
  assertValidProfile,
  betaProfile,
} from '../src/infrastructure/integrations/client-profiles.js';
import { streamCsvRecords } from '../src/infrastructure/integrations/csv-stream.js';
import { streamArrayAtKey } from '../src/infrastructure/integrations/json-stream.js';
import {
  parseDecimal,
  parseTaxId,
} from '../src/infrastructure/integrations/field-parsers.js';
import {
  NestedJsonAdapter,
  nestedJsonPart,
} from '../src/infrastructure/integrations/nested-json-adapter.js';
import {
  PairedCsvAdapter,
  csvHeadersPart,
  csvItemsPart,
} from '../src/infrastructure/integrations/paired-csv-adapter.js';

/**
 * Regressões dos sete achados de REVIEW-01. Cada teste nomeia o achado: sem
 * isso, a correção volta a ser desfeita na primeira refatoração distraída.
 */

const part = (content: string) =>
  async function* (): AsyncIterable<Uint8Array> {
    yield new TextEncoder().encode(content);
  };

const item = {
  externalLine: 1,
  material: 'M',
  description: 'd',
  purchaseUnit: 'UN',
  conversionFactor: '1',
  quantityOrdered: '10',
  quantityReceived: '0',
  unitPrice: '1',
  lineCreatedOn: null,
};

test('achado 1: CNPJ com lixo em volta não é mais aceito como válido', () => {
  assert.throws(
    () => parseTaxId('abc12.345.678/0001-90xyz', 'cnpj'),
    /fora do formato/,
  );
  assert.throws(
    () => parseTaxId('12 345 678 0001 90', 'cnpj'),
    /fora do formato/,
  );
  // O que é máscara legítima continua passando.
  assert.equal(parseTaxId('12.345.678/0001-90', 'cnpj'), '12345678000190');
  assert.equal(parseTaxId('12345678000190', 'cnpj'), '12345678000190');
});

test('achado 1: a nota exige CNPJ limpo na borda', () => {
  const nota = {
    clientId: 'alfa',
    purchaseOrderNumber: 'X',
    supplierTaxId: 'abc',
    lines: [{ material: 'M', quantity: '1', totalValue: '1' }],
  };
  assert.equal(invoiceCheckRequestSchema.safeParse(nota).success, false);
  assert.equal(
    invoiceCheckRequestSchema.safeParse({
      ...nota,
      supplierTaxId: '12345678000190',
    }).success,
    true,
  );
});

test('achado 2: fator zero e quantidade negativa param no schema do item', () => {
  assert.equal(
    normalizedItemSchema.safeParse({ ...item, conversionFactor: '0' }).success,
    false,
  );
  assert.equal(
    normalizedItemSchema.safeParse({ ...item, conversionFactor: '-1' }).success,
    false,
  );
  assert.equal(
    normalizedItemSchema.safeParse({ ...item, quantityOrdered: '-5' }).success,
    false,
  );
  assert.equal(
    normalizedItemSchema.safeParse({ ...item, unitPrice: '-1' }).success,
    false,
  );
  assert.equal(normalizedItemSchema.safeParse(item).success, true);
});

test('achado 2: a nota continua laxa, para a regra 5 seguir alcançável', () => {
  // Quantidade não positiva é divergência com motivo, não 400 sem explicação.
  const pedido: PurchaseOrder = {
    id: 'o',
    clientId: 'alfa',
    externalNumber: 'X',
    supplier: { taxId: '12345678000190', name: 'F' },
    currency: 'BRL',
    status: 'aberto',
    issuedOn: '2026-01-01',
    ingestionVersion: 1,
    ingestedAt: '2026-01-01T00:00:00.000Z',
    hasPendingBalance: true,
    items: [{ ...item, id: 'i', quantityPending: '10' }],
  };
  const nota = {
    clientId: 'alfa',
    purchaseOrderNumber: 'X',
    supplierTaxId: '12345678000190',
    lines: [{ material: 'M', quantity: '0', totalValue: '0' }],
  };
  assert.equal(invoiceCheckRequestSchema.safeParse(nota).success, true);
  assert.deepEqual(
    checkInvoice(pedido, nota).divergences.map((d) => d.code),
    ['QUANTIDADE_NAO_POSITIVA'],
  );
});

test('achado 3: cabeçalhos sem itens também respeitam o tamanho do lote', async () => {
  let cabecalhos =
    'NUMERO_PEDIDO;FORNECEDOR_CNPJ;FORNECEDOR_RAZAO_SOCIAL;EMISSAO;SITUACAO;MOEDA\n';
  for (let i = 0; i < 25; i += 1) {
    cabecalhos += `P${i};12.345.678/0001-90;Fornecedor;15/08/2026;EM ABERTO;BRL\n`;
  }
  const tamanhos: number[] = [];
  for await (const batch of new PairedCsvAdapter(10).read(
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
    tamanhos.push(batch.orders.length);
  }
  assert.deepEqual(tamanhos, [10, 10, 5], 'antes saía um lote único de 25');
});

test('achado 4: ponto fora do agrupamento de milhar é rejeitado, não apagado', () => {
  // `12.34` virava 1234: erro de cem vezes em dinheiro.
  assert.throws(
    () => parseDecimal('12.34', 'br', 'q'),
    /agrupamento de milhar/,
  );
  assert.throws(
    () => parseDecimal('1.23.4,50', 'br', 'q'),
    /agrupamento de milhar/,
  );
  assert.throws(
    () => parseDecimal('1.2345,00', 'br', 'q'),
    /agrupamento de milhar/,
  );
  // O que é notação brasileira legítima continua passando.
  assert.equal(parseDecimal('1.200,000', 'br', 'q'), '1200');
  assert.equal(parseDecimal('1.234.567,89', 'br', 'q'), '1234567.89');
  assert.equal(parseDecimal('6,49', 'br', 'q'), '6.49');
  assert.equal(parseDecimal('1200', 'br', 'q'), '1200');
});

test('achado 5: o schema recusa data que não existe no calendário', () => {
  assert.equal(isoDateSchema.safeParse('2026-02-31').success, false);
  assert.equal(isoDateSchema.safeParse('2026-13-01').success, false);
  assert.equal(isoDateSchema.safeParse('2026-02-28').success, true);
  assert.equal(
    isoDateSchema.safeParse('2028-02-29').success,
    true,
    'ano bissexto',
  );
});

test('achado 5: o decimal do contrato tem teto e não aceita expoente', () => {
  assert.equal(decimalTextSchema.safeParse('1e21').success, false);
  assert.equal(decimalTextSchema.safeParse('1'.repeat(25)).success, false);
  assert.equal(
    decimalTextSchema.safeParse(`0.${'1'.repeat(13)}`).success,
    false,
  );
  assert.equal(decimalTextSchema.safeParse('1200.000000').success, true);
  assert.equal(decimalTextSchema.safeParse('-0.5').success, true);
});

test('achado 6: perfil incoerente não passa mais no start', () => {
  assert.throws(
    () =>
      assertValidProfile({
        ...structuredClone(alfaProfile),
        fields: { ...alfaProfile.fields, ordersArray: null },
      }),
    /ordersArray/,
  );
  assert.throws(
    () =>
      assertValidProfile({
        ...structuredClone(alfaProfile),
        assumedCurrency: null,
        fields: {
          ...alfaProfile.fields,
          order: { ...alfaProfile.fields.order, currency: null },
        },
      }),
    /assumedCurrency/,
  );
});

test('achado 6: o perfil devolvido pela porta não pode ser alterado', async () => {
  const perfil = await new InMemoryClientProfiles().find('alfa');
  assert.ok(perfil !== null);
  assert.equal(Object.isFrozen(perfil), true);
  assert.equal(Object.isFrozen(perfil.fields.order), true);
  assert.throws(() => {
    (perfil as { clientId: string }).clientId = 'outro';
  }, TypeError);
});

test('achado 7: byte inválido para o encoding declarado falha alto', async () => {
  const invalido = async function* (): AsyncIterable<Uint8Array> {
    yield new Uint8Array([0x41, 0x0a, 0xff, 0xfe, 0x0a]);
  };
  await assert.rejects(async () => {
    for await (const _ of streamCsvRecords(invalido(), {
      delimiter: ';',
      encoding: 'utf-8',
      requiredColumns: ['A'],
    })) {
      void _;
    }
  }, /não é utf-8 válido/);
});

test('achado 7: booleano do JSON não vira nome de fornecedor nem material', async () => {
  const batch: { rejected: { reason: string }[] } = { rejected: [] };
  for await (const lote of new NestedJsonAdapter().read(
    {
      clientId: 'alfa',
      formatVersion: '1',
      parts: new Map([
        [
          nestedJsonPart,
          part(
            JSON.stringify({
              purchase_orders: [
                {
                  po_number: 'PO-1',
                  created_at: '2026-01-02',
                  status: 'open',
                  currency: 'BRL',
                  vendor: { tax_id: '23456789000101', name: true },
                  items: [],
                },
              ],
            }),
          ),
        ],
      ]),
    },
    alfaProfile,
  )) {
    batch.rejected.push(...lote.rejected);
  }
  assert.equal(batch.rejected.length, 1);
  assert.match(batch.rejected[0]?.reason ?? '', /vendor\.name/);
});

test('achado 7: moeda sem centavo não é arredondada como se tivesse', () => {
  assert.equal(currencyScale('JPY'), 0);
  assert.equal(currencyScale('KWD'), 3);
  assert.equal(currencyScale('BRL'), 2);
});

test('achado 7: a guarda de exatidão tem margem para o que é computado', () => {
  // A entrada absurda agora para na porta, pelo limite de grandeza do
  // contrato; a margem de 120 dígitos serve ao que a aritmética produz.
  assert.throws(() => Decimal.parse('1e59'), /dígitos inteiros/);
  const produto = Decimal.parse('9'.repeat(24)).multiply(
    Decimal.parse('9'.repeat(24)),
  );
  assert.equal(produto.add(Decimal.parse('1')).toText().length, 48);
});

test('achado 8, encontrado ao corrigir o 7: erro na origem chega a quem consome', async () => {
  // `.pipe()` não encaminha erro da fonte para o destino. Sem o encaminhamento
  // explícito, uma falha de leitura virava erro não tratado e o consumidor
  // ficava esperando um lote que nunca vinha.
  const quebrada = async function* (): AsyncIterable<Uint8Array> {
    yield new TextEncoder().encode('{"purchase_orders":[{"a":1}');
    throw new Error('origem da carga falhou no meio');
  };
  await assert.rejects(async () => {
    for await (const _ of streamArrayAtKey(quebrada(), 'purchase_orders')) {
      void _;
    }
  }, /origem da carga falhou/);
});
