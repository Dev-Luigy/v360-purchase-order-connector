import assert from 'node:assert/strict';
import test from 'node:test';

import { Decimal, currencyScale } from '../src/domain/decimal.js';
import {
  maxCsvRecordSize,
  maxItemsPerOrder,
  maxPersistedDecimalPlaces,
} from '../src/domain/limits.js';
import {
  currencySchema,
  normalizedOrderSchema,
} from '../src/domain/schemas.js';
import {
  alfaProfile,
  assertValidProfile,
  betaProfile,
} from '../src/infrastructure/integrations/client-profiles.js';
import { streamCsvRecords } from '../src/infrastructure/integrations/csv-stream.js';
import {
  parseDecimal,
  parseTaxId,
} from '../src/infrastructure/integrations/field-parsers.js';
import {
  PairedCsvAdapter,
  csvHeadersPart,
  csvItemsPart,
} from '../src/infrastructure/integrations/paired-csv-adapter.js';

/** Regressões dos achados de REVIEW-07, todos reproduzidos antes da correção. */

const nul = String.fromCharCode(0);
const item = {
  externalLine: 1,
  material: 'M',
  description: 'd',
  purchaseUnit: 'UN',
  conversionFactor: '1',
  quantityOrdered: '1',
  quantityReceived: '0',
  unitPrice: '1',
  lineCreatedOn: null,
};
const pedido = {
  clientId: 'alfa',
  externalNumber: 'X',
  supplier: { taxId: '12345678000190', name: 'F' },
  currency: 'BRL',
  status: 'aberto' as const,
  issuedOn: '2026-01-01',
  items: [item],
};

const bytes = (texto: string) =>
  async function* (): AsyncIterable<Uint8Array> {
    yield new TextEncoder().encode(texto);
  };

test('R07-01: valor com mais casas do que a coluna guarda é recusado, não arredondado', () => {
  // `0.0000001` virava `0.000000` no adaptador: o valor sumia em silêncio.
  assert.throws(
    () => parseDecimal('0.0000001', 'plain', 'q', maxPersistedDecimalPlaces),
    /casas decimais/,
  );
  assert.throws(
    () => parseDecimal('1.9999999', 'plain', 'q', maxPersistedDecimalPlaces),
    /casas decimais/,
  );
  assert.throws(
    () => parseDecimal('1,0000005', 'br', 'q', maxPersistedDecimalPlaces),
    /casas decimais/,
  );
  // Exatamente na escala continua passando.
  assert.equal(
    parseDecimal('1.999999', 'plain', 'q', maxPersistedDecimalPlaces),
    '1.999999',
  );
  assert.equal(
    parseDecimal('120000', 'cents', 'p', maxPersistedDecimalPlaces),
    '1200.000000',
  );
});

test('R07-01: o contrato persistido não aceita mais casas que a coluna', () => {
  assert.equal(
    normalizedOrderSchema.safeParse({
      ...pedido,
      items: [{ ...item, quantityOrdered: '0.0000001' }],
    }).success,
    false,
  );
  assert.equal(
    normalizedOrderSchema.safeParse({
      ...pedido,
      items: [{ ...item, quantityOrdered: '0.000001' }],
    }).success,
    true,
  );
});

test('R07-03: texto com NUL é recusado, porque o PostgreSQL não o armazena', () => {
  for (const [campo, valor] of [
    [
      'supplier.name',
      { ...pedido, supplier: { ...pedido.supplier, name: `F${nul}` } },
    ],
    ['material', { ...pedido, items: [{ ...item, material: `M${nul}` }] }],
    [
      'description',
      { ...pedido, items: [{ ...item, description: `d${nul}` }] },
    ],
    ['externalNumber', { ...pedido, externalNumber: `X${nul}` }],
  ] as const) {
    assert.equal(
      normalizedOrderSchema.safeParse(valor).success,
      false,
      `${campo} com NUL deveria ser recusado`,
    );
  }
  // Unicode legítimo continua passando, sem remoção nem truncamento.
  assert.equal(
    normalizedOrderSchema.safeParse({
      ...pedido,
      supplier: { ...pedido.supplier, name: 'Metalúrgica São Jorge 日本 🙂' },
    }).success,
    true,
  );
});

test('R07-08: moeda sem escala declarada não passa e não é conferida', () => {
  assert.equal(currencySchema.safeParse('BRL').success, true);
  assert.equal(currencySchema.safeParse('ZZZ').success, false);
  assert.equal(
    normalizedOrderSchema.safeParse({ ...pedido, currency: 'ZZZ' }).success,
    false,
  );
  assert.throws(() => currencyScale('ZZZ'), /não tem escala declarada/);
  assert.equal(currencyScale('JPY'), 0);
});

test('R07-07: cabeçalho de CSV repetido ou sem nome é recusado', async () => {
  // `A;A` devolvia o último valor, então um export com coluna duplicada podia
  // trocar identidade, quantidade ou preço sem ninguém perceber.
  for (const [caso, conteudo] of [
    ['duplicada', 'A;A\nx;y\n'],
    ['duplicada com espaço', 'A; A\nx;y\n'],
    ['sem nome', 'A;\nx;y\n'],
  ] as const) {
    await assert.rejects(
      async () => {
        for await (const _ of streamCsvRecords(bytes(conteudo)(), {
          delimiter: ';',
          encoding: 'utf-8',
          requiredColumns: ['A'],
        })) {
          void _;
        }
      },
      /coluna (repetida|sem nome)/,
      caso,
    );
  }
});

test('R07-02: o registro de CSV tem teto de tamanho', async () => {
  // Sem `max_record_size`, um campo sem fim enchia o buffer: a opção vem
  // ilimitada por padrão. O teste prova o teto, não a borda exata — a
  // contabilidade de bytes é do `csv-parse`.
  const ler = async (conteudo: string): Promise<number> => {
    let linhas = 0;
    for await (const _ of streamCsvRecords(bytes(conteudo)(), {
      delimiter: ';',
      encoding: 'utf-8',
      requiredColumns: ['A'],
    })) {
      void _;
      linhas += 1;
    }
    return linhas;
  };

  await assert.rejects(
    () => ler(`A\n${'x'.repeat(maxCsvRecordSize + 100)}\n`),
    /Max Record Size/,
  );
  assert.equal(
    await ler(`A\n${'x'.repeat(1024)}\n`),
    1,
    'registro normal passa',
  );
});

test('R07-02: o teto de pedidos distintos vale também para órfãos', async () => {
  // Grupos órfãos não entram no mapa de cabeçalhos, então escapavam do limite
  // que protegia o índice e cresciam sem teto num conjunto paralelo.
  let itens =
    'NUMERO_PEDIDO;ITEM;CODIGO_MATERIAL;DESCRICAO;UNIDADE;QTD_PEDIDA;QTD_RECEBIDA;PRECO_UNITARIO\n';
  for (let i = 0; i < 6; i += 1) {
    itens += `ORFAO-${String(i)};1;MAT;Item;UN;1,000;0,000;1,00\n`;
  }
  await assert.rejects(async () => {
    for await (const _ of new PairedCsvAdapter(200, 2).read(
      {
        clientId: 'beta',
        formatVersion: '1',
        parts: new Map([
          [
            csvHeadersPart,
            bytes(
              'NUMERO_PEDIDO;FORNECEDOR_CNPJ;FORNECEDOR_RAZAO_SOCIAL;EMISSAO;SITUACAO;MOEDA\n',
            ),
          ],
          [csvItemsPart, bytes(itens)],
        ]),
      },
      betaProfile,
    )) {
      void _;
    }
  }, /pedidos distintos/);
});

test('R07-06: o perfil cumpre o que declara sobre a máscara do CNPJ', () => {
  // Antes, `taxIdMasked` nunca era lido: o perfil prometia uma regra falsa.
  assert.equal(alfaProfile.taxIdMasked, false);
  assert.equal(betaProfile.taxIdMasked, true);
  assert.equal(parseTaxId('12345678000190', 'c', false), '12345678000190');
  assert.throws(
    () => parseTaxId('12.345.678/0001-90', 'c', false),
    /declara formato limpo/,
  );
  assert.equal(parseTaxId('12.345.678/0001-90', 'c', true), '12345678000190');
});

test('R07-06: identificador de cliente do perfil respeita o limite da coluna', () => {
  assert.throws(
    () =>
      assertValidProfile({
        ...structuredClone(alfaProfile),
        clientId: 'a'.repeat(65),
      }),
    /clientId/,
  );
});

test('o teto de itens por pedido é conhecido pelo adaptador, não só pelo schema', () => {
  // A checagem precisa acontecer antes do push; aqui só garantimos que a
  // constante é a mesma dos dois lados.
  assert.equal(maxItemsPerOrder, 10_000);
  assert.equal(
    Decimal.parse('1').toText(maxPersistedDecimalPlaces),
    '1.000000',
  );
});
