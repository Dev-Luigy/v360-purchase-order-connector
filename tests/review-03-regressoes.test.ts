import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { checkInvoice } from '../src/domain/conference-rules.js';
import { Decimal } from '../src/domain/decimal.js';
import { isoInstantSchema } from '../src/domain/schemas.js';
import type { PurchaseOrder } from '../src/domain/purchase-order.js';
import {
  parseDecimal,
  parseTaxId,
} from '../src/infrastructure/integrations/field-parsers.js';

/** Regressões dos riscos residuais de REVIEW-02 e REVIEW-03. */

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
  items: [
    {
      id: 'i',
      externalLine: 1,
      material: 'M',
      description: 'd',
      purchaseUnit: 'UN',
      conversionFactor: '1',
      quantityOrdered: '10',
      quantityReceived: '0',
      quantityPending: '10',
      unitPrice: '1',
      lineCreatedOn: null,
    },
  ],
};

test('R03/1: expoente absurdo para na porta, antes de virar texto', () => {
  // `1e1000000` ocupa dez bytes na entrada e virava um milhão de caracteres em
  // `toFixed`. Rejeitar só no schema deixava um payload curto alocar memória
  // grande.
  assert.throws(() => Decimal.parse('1e10000'), /dígitos inteiros/);
  assert.throws(() => Decimal.parse('1e1000000'), /dígitos inteiros/);
  assert.throws(() => Decimal.parse('1e-10000'), /casas decimais/);
  assert.throws(
    () => parseDecimal('1e10000', 'plain', 'q', 6),
    /decimal inválido/,
  );
  // O que cabe no contrato continua passando.
  assert.equal(Decimal.parse('1e21').toText().length, 22);
  assert.equal(Decimal.parse('0.00000001').toText(), '0.00000001');
});

test('R03/1: a rejeição é barata, não materializa o número', () => {
  const inicio = process.hrtime.bigint();
  for (let vez = 0; vez < 1000; vez += 1) {
    assert.throws(() => Decimal.parse('1e1000000'));
  }
  const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
  assert.ok(ms < 500, `mil rejeições levaram ${ms.toFixed(0)}ms`);
});

test('R03/3: o domínio sozinho não aprova CNPJ contaminado', () => {
  // Antes, `checkInvoice` removia todo não dígito e aprovava; a garantia
  // dependia inteiramente do schema da borda ser chamado.
  const resultado = checkInvoice(pedido, {
    clientId: 'alfa',
    purchaseOrderNumber: 'X',
    supplierTaxId: 'abc12.345.678/0001-90xyz',
    lines: [{ material: 'M', quantity: '1', totalValue: '1' }],
  });
  assert.equal(resultado.outcome, 'reprovada');
  assert.deepEqual(
    resultado.divergences.map((d) => d.code),
    ['FORNECEDOR_DIVERGENTE'],
  );
});

test('R03/4: máscara de CNPJ é tudo ou nada', () => {
  assert.throws(
    () => parseTaxId('12.345678/0001-90', 'c', true, false),
    /fora do formato/,
  );
  assert.throws(
    () => parseTaxId('12345678/0001-90', 'c', true, false),
    /fora do formato/,
  );
  assert.throws(
    () => parseTaxId('12.345.678/000190', 'c', true, false),
    /fora do formato/,
  );
  assert.equal(
    parseTaxId('12.345.678/0001-90', 'c', true, false),
    '12345678000190',
  );
  assert.equal(
    parseTaxId('12345678000190', 'c', false, false),
    '12345678000190',
  );
});

test('R03/5: instante ISO também é verificado no calendário', () => {
  assert.equal(
    isoInstantSchema.safeParse('2026-99-99T99:99:99.999Z').success,
    false,
  );
  assert.equal(
    isoInstantSchema.safeParse('2026-02-31T00:00:00.000Z').success,
    false,
  );
  assert.equal(
    isoInstantSchema.safeParse('2026-09-27T12:00:00.000Z').success,
    true,
  );
});

test('R02/7: o script de teste varre subpastas', async () => {
  // Com `tests/*.test.ts`, um teste em `tests/sub/` era ignorado em silêncio e
  // a suíte passava verde. As aspas importam: quem expande é o Node.
  const pacote = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf-8'),
  ) as { scripts: { test: string } };
  assert.match(pacote.scripts.test, /\*\*/, 'o glob precisa ser recursivo');
  assert.match(pacote.scripts.test, /"tests\/\*\*\/\*\.test\.ts"/);
});
