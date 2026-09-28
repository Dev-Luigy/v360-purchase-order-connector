import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import test from 'node:test';

import type { ClientProfile } from '../src/domain/client.js';
import { streamCsvRecords } from '../src/infrastructure/integrations/csv-stream.js';
import {
  parseDate,
  parseDecimal,
} from '../src/infrastructure/integrations/field-parsers.js';
import { streamArrayAtKey } from '../src/infrastructure/integrations/json-stream.js';
import {
  NestedJsonAdapter,
  nestedJsonPart,
} from '../src/infrastructure/integrations/nested-json-adapter.js';
import { assertValidProfile } from '../src/infrastructure/integrations/client-profiles.js';

/**
 * Verificação depois de FIX-01. Dois defeitos nos leitores e as notações que
 * ficaram sem teste porque Alfa e Beta não as usam — código sem teste que a
 * Parte 2 vai confiar é pior que código ausente.
 */

test('consumidor que para no meio não deixa a origem aberta', async () => {
  const json = createReadStream(
    new URL('./fixtures/alfa/purchase-orders.json', import.meta.url),
    { highWaterMark: 8 },
  );
  for await (const _ of streamArrayAtKey(json, 'purchase_orders')) {
    void _;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(json.destroyed, true, 'descritor de arquivo vazava');

  const csv = createReadStream(
    new URL('./fixtures/beta/itens.csv', import.meta.url),
    { highWaterMark: 8 },
  );
  for await (const _ of streamCsvRecords(csv, {
    delimiter: ';',
    encoding: 'utf-8',
    requiredColumns: ['NUMERO_PEDIDO'],
  })) {
    void _;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(csv.destroyed, true, 'descritor de arquivo vazava');
});

test('erro da origem não é anunciado como erro de encoding', async () => {
  // Antes, qualquer falha do laço virava "conteúdo não é utf-8 válido", o que
  // manda quem depura para o lado errado.
  const quebrada = async function* (): AsyncIterable<Uint8Array> {
    yield new TextEncoder().encode('A;B\n1;2\n');
    throw new Error('origem da carga caiu no meio');
  };
  await assert.rejects(async () => {
    for await (const _ of streamCsvRecords(quebrada(), {
      delimiter: ';',
      encoding: 'utf-8',
      requiredColumns: ['A'],
    })) {
      void _;
    }
  }, /origem da carga caiu no meio/);
});

test('notação de centavos converte sem ponto flutuante', () => {
  assert.equal(parseDecimal('120000', 'cents', 'p'), '1200');
  assert.equal(parseDecimal('10000', 'cents', 'p', 6), '100.000000');
  assert.equal(parseDecimal('1', 'cents', 'p'), '0.01');
  assert.equal(parseDecimal('-250', 'cents', 'p'), '-2.5');
  assert.throws(() => parseDecimal('1200.50', 'cents', 'p'), /centavos/);
});

test('timestamp Unix é lido em UTC, não no fuso local', () => {
  // Os timestamps das amostras são múltiplos exatos de 86400, ou seja
  // meia-noite UTC; lê-los em America/Sao_Paulo recuaria a data um dia.
  assert.equal(parseDate('1786752000', 'unix-seconds', 'd'), '2026-08-15');
  assert.equal(parseDate('1784160000', 'unix-seconds', 'd'), '2026-07-16');
  // Em America/Sao_Paulo (UTC-3) as duas recuariam um dia.
  assert.equal(
    new Date(1786752000 * 1000).toLocaleDateString('sv-SE', {
      timeZone: 'America/Sao_Paulo',
    }),
    '2026-08-14',
  );
  assert.equal(parseDate('0', 'unix-seconds', 'd'), '1970-01-01');
  assert.throws(
    () => parseDate('1786752000.5', 'unix-seconds', 'd'),
    /inteiro/,
  );
});

test('cliente novo em forma conhecida entra só com perfil, sem código novo', async () => {
  // É a promessa de ADR-008, e o teste usa a notação real do Gama para provar
  // também ADR-012: quantidade e fator em inteiro simples, preço em centavos e
  // data em timestamp Unix, tudo na mesma linha. Antes de FIX-04 isto era
  // inexprimível — `numberFormat: 'cents'` converteria também a quantidade.
  const sigma: ClientProfile = {
    clientId: 'sigma',
    name: 'Sigma (sintético, notação do Gama)',
    deliveryFormat: 'nested-json',
    formatVersion: '1',
    dateFormat: 'unix-seconds',
    numberFormat: { quantity: 'plain', money: 'cents' },
    taxIdMasked: false,
    validatesTaxIdChecksum: false,
    assumedCurrency: 'BRL',
    statusVocabulary: { '1': 'aberto', '2': 'encerrado', '3': 'bloqueado' },
    csv: null,
    fields: {
      ordersArray: 'pedidos',
      itemsArray: 'linhas',
      order: {
        externalNumber: 'ped',
        issuedOn: 'dt_criacao',
        status: 'situacao',
        currency: null,
        supplierTaxId: 'forn.cnpj',
        supplierName: 'forn.nome',
      },
      item: {
        orderNumber: null,
        externalLine: 'item',
        material: 'cod_mat',
        description: 'desc_mat',
        purchaseUnit: 'um',
        quantityOrdered: 'qtd_ped',
        quantityReceived: 'qtd_rec',
        unitPrice: 'preco_unit_centavos',
        conversionFactor: 'fator_conv',
        lineCreatedOn: 'dt_linha',
      },
    },
  };
  assert.doesNotThrow(() => assertValidProfile(sigma));

  const payload = JSON.stringify({
    pedidos: [
      {
        ped: 'GL-778',
        dt_criacao: 1786752000,
        situacao: 1,
        forn: { cnpj: '34567890000112', nome: 'Transportes Ideal ME' },
        linhas: [
          {
            item: 1,
            cod_mat: 'TRP-01',
            desc_mat: 'Pallet de madeira',
            um: 'CX',
            fator_conv: 12,
            qtd_ped: 10,
            qtd_rec: 2,
            preco_unit_centavos: 120000,
            dt_linha: 1786752000,
          },
        ],
      },
    ],
  });

  const orders = [];
  for await (const batch of new NestedJsonAdapter().read(
    {
      clientId: 'sigma',
      formatVersion: '1',
      parts: new Map([
        [
          nestedJsonPart,
          async function* () {
            yield new TextEncoder().encode(payload);
          },
        ],
      ]),
    },
    sigma,
  )) {
    orders.push(...batch.orders);
    assert.deepEqual(batch.rejected, []);
  }

  const item = orders[0]?.items?.[0];
  assert.equal(
    orders[0]?.currency,
    'BRL',
    'moeda assumida, o payload não traz',
  );
  assert.equal(orders[0]?.status, 'aberto', 'vocabulário numérico do cliente');
  assert.equal(orders[0]?.issuedOn, '2026-08-15', 'timestamp lido em UTC');
  assert.equal(orders[0]?.supplier.taxId, '34567890000112');
  // O ponto de ADR-012: a mesma linha, duas notações.
  assert.equal(
    item?.quantityOrdered,
    '10.000000',
    'inteiro simples, não centavos',
  );
  assert.equal(item?.quantityReceived, '2.000000');
  assert.equal(
    item?.conversionFactor,
    '12.000000',
    'fator é medida, não dinheiro',
  );
  assert.equal(item?.unitPrice, '1200.000000', '120000 centavos = R$ 1.200,00');
  assert.equal(item?.lineCreatedOn, '2026-08-15', 'data própria da linha');
});
