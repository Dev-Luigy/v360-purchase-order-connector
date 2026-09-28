import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import test from 'node:test';

import type { Pool } from 'pg';

import {
  CursorError,
  cursorVersion,
  decodeCursor,
  encodeCursor,
  fingerprintOf,
} from '../src/infrastructure/database/cursor.js';
import { requiredMigration } from '../src/infrastructure/database/migrations.js';
import {
  dateToIsoDate,
  decimalToText,
  hasPendingBalance,
  instantToIso,
  isoDateToDate,
  optionalDateToIsoDate,
  pendingOf,
} from '../src/infrastructure/database/mapping.js';
import {
  assertPageLimit,
  lockKeyFor,
} from '../src/infrastructure/database/purchase-order-repository.js';
import {
  SchemaReadiness,
  describeReadinessFailure,
} from '../src/infrastructure/database/schema-readiness.js';

/**
 * O que dá para provar sem banco. Transação, lock e plano de consulta só se
 * verificam contra PostgreSQL real, que é ENV-03.
 */

const filtros = {
  clientId: 'alfa',
  supplierTaxId: null,
  status: 'aberto',
  onlyPending: true,
};
const id = '0199a3f1-0000-7000-8000-000000000001';

test('o cursor devolve a posição quando os filtros são os mesmos', () => {
  const impressao = fingerprintOf(filtros);
  assert.equal(decodeCursor(encodeCursor(id, impressao), impressao), id);
});

test('trocar de filtro no meio da varredura é recusado', () => {
  // Sem isso, a página seguinte viria de outro conjunto e o cliente não
  // perceberia: registros sumiriam ou se repetiriam (ADR-010).
  const cursor = encodeCursor(id, fingerprintOf(filtros));
  assert.throws(
    () =>
      decodeCursor(cursor, fingerprintOf({ ...filtros, onlyPending: false })),
    /os filtros mudaram/,
  );
});

test('null e string vazia são filtros diferentes', () => {
  assert.notEqual(
    fingerprintOf({ ...filtros, supplierTaxId: null }),
    fingerprintOf({ ...filtros, supplierTaxId: '' }),
  );
});

test('a impressão digital não depende da ordem das chaves', () => {
  assert.equal(
    fingerprintOf({ a: '1', b: '2' }),
    fingerprintOf({ b: '2', a: '1' }),
  );
});

test('cursor malformado é recusado antes de chegar ao banco', () => {
  const impressao = fingerprintOf(filtros);
  const invalidos: [string, string][] = [
    ['x'.repeat(300), 'comprimento'],
    ['não-base64!', 'alfabeto'],
    [Buffer.from('não é json').toString('base64url'), 'ilegível'],
    [Buffer.from('{"a":1,"f":"x"}').toString('base64url'), 'estrutura'],
    [encodeCursor('não-é-uuid', impressao), 'identificador'],
  ];
  for (const [cursor, motivo] of invalidos) {
    assert.throws(() => decodeCursor(cursor, impressao), CursorError, motivo);
  }
});

test('tamanho de página fora da faixa é erro, não recorte silencioso', () => {
  assert.doesNotThrow(() => {
    assertPageLimit(1);
  });
  assert.doesNotThrow(() => {
    assertPageLimit(100);
  });
  assert.throws(() => {
    assertPageLimit(101);
  }, /acima do teto/);
  assert.throws(() => {
    assertPageLimit(0);
  }, /inválido/);
  assert.throws(() => {
    assertPageLimit(1.5);
  }, /inválido/);
});

test('a chave do lock não colide entre clientes de nomes parecidos', () => {
  // Sem o comprimento na frente, ("a", "bc") e ("ab", "c") dariam a mesma
  // chave e duas cargas de pedidos diferentes se serializariam à toa — ou,
  // pior, o mesmo pedido de clientes distintos compartilharia o lock.
  assert.notEqual(
    lockKeyFor({ clientId: 'a', externalNumber: 'bc' }),
    lockKeyFor({ clientId: 'ab', externalNumber: 'c' }),
  );
  assert.equal(
    lockKeyFor({ clientId: 'alfa', externalNumber: '450' }),
    lockKeyFor({ clientId: 'alfa', externalNumber: '450' }),
  );
});

test('o saldo do item preserva recebimento acima do pedido', () => {
  assert.equal(pendingOf('100.000000', '60.000000'), '40.000000');
  assert.equal(pendingOf('100.000000', '100.000000'), '0.000000');
  // Recebimento a mais existe em ERP; zerar aqui apagaria a informação.
  assert.equal(pendingOf('100.000000', '120.000000'), '-20.000000');
});

test('só saldo positivo conta como algo a receber', () => {
  assert.equal(hasPendingBalance([{ quantityPending: '0.000000' }]), false);
  assert.equal(hasPendingBalance([{ quantityPending: '-5.000000' }]), false);
  assert.equal(
    hasPendingBalance([
      { quantityPending: '0.000000' },
      { quantityPending: '0.000001' },
    ]),
    true,
  );
  assert.equal(hasPendingBalance([]), false);
});

test('o decimal do banco vira texto sem passar por ponto flutuante', () => {
  // `runtime.Decimal` do Prisma é decimal.js, a mesma do domínio (ADR-011).
  const doBanco = { toFixed: (casas?: number) => (45.9).toFixed(casas ?? 0) };
  assert.equal(decimalToText(doBanco, 'unitPrice'), '45.900000');
  assert.throws(() => decimalToText(null, 'unitPrice'), /nula/);
});

test('datas atravessam a fronteira sem deslocar o dia', () => {
  assert.equal(
    dateToIsoDate(new Date('2026-08-15T00:00:00.000Z'), 'd'),
    '2026-08-15',
  );
  assert.equal(
    isoDateToDate('2026-08-15').toISOString(),
    '2026-08-15T00:00:00.000Z',
  );
  assert.equal(optionalDateToIsoDate(null), null);
  assert.equal(
    instantToIso(new Date('2026-09-27T12:00:00.000Z'), 'i'),
    '2026-09-27T12:00:00.000Z',
  );
  assert.throws(() => dateToIsoDate(null, 'issuedOn'), /nula/);
});

test('banco sem tabela de migração é explicado, não vaza erro de SQL', () => {
  assert.match(
    describeReadinessFailure({
      code: '42P01',
      message: 'relation does not exist',
    }),
    /nenhuma migração foi aplicada/,
  );
  assert.equal(
    describeReadinessFailure(new Error('conexão recusada')),
    'conexão recusada',
  );
});

test('o cursor carrega versão, como ADR-010 especifica', () => {
  // A ADR diz `{ v, after, f }`. Sem versão, mudar o formato depois não teria
  // caminho explícito: cursor antigo seria lido errado ou daria erro obscuro.
  const impressao = fingerprintOf(filtros);
  const conteudo = JSON.parse(
    Buffer.from(encodeCursor(id, impressao), 'base64url').toString('utf-8'),
  ) as Record<string, unknown>;
  assert.deepEqual(Object.keys(conteudo).sort(), ['after', 'f', 'v']);
  assert.equal(conteudo.v, cursorVersion);

  const deOutraVersao = Buffer.from(
    JSON.stringify({ v: 99, after: id, f: impressao }),
  ).toString('base64url');
  assert.throws(() => decodeCursor(deOutraVersao, impressao), /versão 99/);
});

test('a migração exigida acompanha a pasta de migrações', () => {
  // Constante escrita à mão envelhece em silêncio: quando alguém acrescentar
  // uma migração sem atualizar isto, a prontidão continuaria aprovando um
  // banco desatualizado. Este teste é a trava.
  const pasta = new URL('../database/migrations/', import.meta.url);
  const migracoes = readdirSync(pasta, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .sort();
  assert.ok(migracoes.length > 0, 'nenhuma migração encontrada');
  assert.equal(requiredMigration, migracoes.at(-1));
});

function poolComLinhas(rows: unknown[]): Pool {
  return { query: () => Promise.resolve({ rows }) } as unknown as Pool;
}

test('prontidão reprova banco parado numa migração anterior', async () => {
  // Migração que ainda não rodou não deixa linha na tabela de controle, então
  // contar aplicadas deixaria passar (REVIEW-05, achado 2).
  const readiness = new SchemaReadiness(poolComLinhas([]), '0002_futura');
  await assert.rejects(() => readiness.ping(), /0002_futura não foi aplicada/);
});

test('prontidão reprova migração revertida ou inacabada', async () => {
  await assert.rejects(
    () =>
      new SchemaReadiness(
        poolComLinhas([
          { finished_at: new Date(), rolled_back_at: new Date() },
        ]),
      ).ping(),
    /revertida/,
  );
  await assert.rejects(
    () =>
      new SchemaReadiness(
        poolComLinhas([{ finished_at: null, rolled_back_at: null }]),
      ).ping(),
    /não terminou/,
  );
});

test('prontidão aprova quando a migração exigida terminou', async () => {
  const readiness = new SchemaReadiness(
    poolComLinhas([{ finished_at: new Date(), rolled_back_at: null }]),
  );
  await assert.doesNotReject(() => readiness.ping());
});
