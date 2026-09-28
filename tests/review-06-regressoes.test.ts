import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { Pool } from 'pg';

import {
  maxClientIdLength,
  maxDescriptionLength,
  maxExternalLine,
  maxExternalNumberLength,
  maxInvoiceLines,
  maxItemsPerOrder,
  maxMaterialLength,
  maxPurchaseUnitLength,
  maxSupplierNameLength,
} from '../src/domain/limits.js';
import {
  invoiceCheckRequestSchema,
  normalizedOrderSchema,
} from '../src/domain/schemas.js';
import { fingerprintOf } from '../src/infrastructure/database/cursor.js';
import { SchemaReadiness } from '../src/infrastructure/database/schema-readiness.js';

/** Regressões dos achados de código de REVIEW-06, todos reproduzidos antes. */

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

test('R06-01: o contrato recusa o que a coluna não guardaria', () => {
  // Antes, todos estes passavam e só morriam na gravação — que em P1-04 viraria
  // 500 em vez de rejeição determinística.
  const excessos: [string, unknown][] = [
    ['clientId', { ...pedido, clientId: 'a'.repeat(maxClientIdLength + 1) }],
    [
      'externalNumber',
      { ...pedido, externalNumber: 'a'.repeat(maxExternalNumberLength + 1) },
    ],
    [
      'supplier.name',
      {
        ...pedido,
        supplier: {
          ...pedido.supplier,
          name: 'a'.repeat(maxSupplierNameLength + 1),
        },
      },
    ],
    [
      'material',
      {
        ...pedido,
        items: [{ ...item, material: 'a'.repeat(maxMaterialLength + 1) }],
      },
    ],
    [
      'description',
      {
        ...pedido,
        items: [{ ...item, description: 'a'.repeat(maxDescriptionLength + 1) }],
      },
    ],
    [
      'purchaseUnit',
      {
        ...pedido,
        items: [
          { ...item, purchaseUnit: 'a'.repeat(maxPurchaseUnitLength + 1) },
        ],
      },
    ],
    [
      'externalLine',
      { ...pedido, items: [{ ...item, externalLine: maxExternalLine + 1 }] },
    ],
  ];
  for (const [campo, valor] of excessos) {
    assert.equal(
      normalizedOrderSchema.safeParse(valor).success,
      false,
      `${campo} acima do limite deveria ser recusado`,
    );
  }
});

test('R06-01: exatamente no limite continua passando', () => {
  const noLimite = {
    ...pedido,
    clientId: 'a'.repeat(maxClientIdLength),
    externalNumber: 'a'.repeat(maxExternalNumberLength),
    supplier: { ...pedido.supplier, name: 'a'.repeat(maxSupplierNameLength) },
    items: [
      {
        ...item,
        material: 'a'.repeat(maxMaterialLength),
        description: 'a'.repeat(maxDescriptionLength),
        purchaseUnit: 'a'.repeat(maxPurchaseUnitLength),
        externalLine: maxExternalLine,
      },
    ],
  };
  assert.equal(normalizedOrderSchema.safeParse(noLimite).success, true);
});

test('R06-01: pedido e nota têm teto de tamanho', () => {
  const demais = {
    ...pedido,
    items: Array.from({ length: maxItemsPerOrder + 1 }, () => item),
  };
  assert.equal(normalizedOrderSchema.safeParse(demais).success, false);

  const nota = (linhas: number) => ({
    clientId: 'alfa',
    purchaseOrderNumber: 'X',
    supplierTaxId: '12345678000190',
    lines: Array.from({ length: linhas }, () => ({
      material: 'M',
      quantity: '1',
      totalValue: '1',
    })),
  });
  assert.equal(
    invoiceCheckRequestSchema.safeParse(nota(maxInvoiceLines)).success,
    true,
  );
  assert.equal(
    invoiceCheckRequestSchema.safeParse(nota(maxInvoiceLines + 1)).success,
    false,
  );
});

test('R06-01: os limites do contrato e das colunas são o mesmo número', () => {
  // Trava de deriva: se alguém mudar o VARCHAR sem mudar a constante, ou o
  // contrário, o registro volta a passar por válido e morrer na gravação.
  const schema = readFileSync(
    new URL('../prisma/schema.prisma', import.meta.url),
    'utf-8',
  );
  const colunas = new Map<string, number>();
  for (const linha of schema.split('\n')) {
    const achado = /^\s*(\w+)\s+String\??.*@db\.VarChar\((\d+)\)/.exec(linha);
    if (achado?.[1] !== undefined && achado[2] !== undefined) {
      colunas.set(achado[1], Number(achado[2]));
    }
  }
  const esperado: [string, number][] = [
    ['clientId', maxClientIdLength],
    ['externalNumber', maxExternalNumberLength],
    ['supplierName', maxSupplierNameLength],
    ['material', maxMaterialLength],
    ['description', maxDescriptionLength],
    ['purchaseUnit', maxPurchaseUnitLength],
  ];
  for (const [campo, limite] of esperado) {
    assert.equal(colunas.get(campo), limite, `coluna ${campo}`);
  }
});

function poolComLinhas(rows: unknown[]): Pool {
  return { query: () => Promise.resolve({ rows }) } as unknown as Pool;
}

test('R06-02: prontidão não depende da ordem das tentativas', async () => {
  // O fluxo do Prisma permite marcar uma tentativa falha como revertida e
  // aplicar de novo; a mesma migração fica com duas linhas. Olhar a primeira
  // fazia a mesma base responder coisas diferentes conforme a ordem.
  const revertida = { finished_at: new Date(), rolled_back_at: new Date() };
  const concluida = { finished_at: new Date(), rolled_back_at: null };
  for (const ordem of [
    [revertida, concluida],
    [concluida, revertida],
  ]) {
    await assert.doesNotReject(
      () => new SchemaReadiness(poolComLinhas(ordem)).ping(),
      'tentativa concluída deveria bastar, em qualquer ordem',
    );
  }
});

test('R06-02: revertida sem reaplicação continua reprovando', async () => {
  await assert.rejects(
    () =>
      new SchemaReadiness(
        poolComLinhas([
          { finished_at: new Date(), rolled_back_at: new Date() },
        ]),
      ).ping(),
    /revertida e não reaplicada/,
  );
});

test('R06-03: a impressão digital distingue tipo, não só texto', () => {
  const nul = String.fromCharCode(0);
  assert.notEqual(fingerprintOf({ a: null }), fingerprintOf({ a: nul }));
  assert.notEqual(fingerprintOf({ a: 1 }), fingerprintOf({ a: '1' }));
  assert.notEqual(fingerprintOf({ a: true }), fingerprintOf({ a: 'true' }));
  assert.notEqual(fingerprintOf({ a: null }), fingerprintOf({ a: '' }));
  // E continua estável para o mesmo conteúdo.
  assert.equal(
    fingerprintOf({ a: 'x', b: 1 }),
    fingerprintOf({ b: 1, a: 'x' }),
  );
});

test('R06-03: separador dentro do valor não imita outro filtro', () => {
  // Com concatenação por `&` e `=`, um valor contendo esses caracteres podia
  // reproduzir a forma de outro conjunto de filtros.
  assert.notEqual(
    fingerprintOf({ a: 'x&b=y', b: null }),
    fingerprintOf({ a: 'x', b: 'y' }),
  );
});
