import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  streamCsvRecords,
  type CsvRecord,
} from '../src/infrastructure/integrations/csv-stream.js';

async function* utf8(text: string, size = 4096): AsyncIterable<Uint8Array> {
  const encoded = new TextEncoder().encode(text);
  for (let offset = 0; offset < encoded.length; offset += size) {
    yield encoded.subarray(offset, offset + size);
  }
}

/**
 * Windows-1252 coincide com Latin-1 nos acentos que as amostras usam, então
 * um byte por ponto de código basta para produzir a variante que falta nas
 * fixtures (ver tests/fixtures/README.md).
 */
async function* windows1252(text: string): AsyncIterable<Uint8Array> {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    assert.ok(code < 256, `fora de Latin-1: ${text[index]}`);
    bytes[index] = code;
  }
  yield bytes;
}

async function collect(
  chunks: AsyncIterable<Uint8Array>,
  requiredColumns: readonly string[],
  delimiter = ';',
  encoding: 'utf-8' | 'windows-1252' = 'utf-8',
): Promise<CsvRecord[]> {
  const records: CsvRecord[] = [];
  for await (const record of streamCsvRecords(chunks, {
    delimiter,
    encoding,
    requiredColumns,
  })) {
    records.push(record);
  }
  return records;
}

test('lê o cabeçalho e devolve valor por nome de coluna', async () => {
  const records = await collect(utf8('A;B\n1;2\n3;4\n'), ['A', 'B']);
  assert.equal(records.length, 2);
  assert.equal(records[0]?.get('A'), '1');
  assert.equal(records[1]?.get('B'), '4');
});

test('numera a linha do arquivo, para a rejeição saber apontar', async () => {
  const records = await collect(utf8('A\n1\n2\n'), ['A']);
  assert.deepEqual(
    records.map((record) => record.line),
    [2, 3],
  );
});

test('CRLF e arquivo sem quebra final dão o mesmo resultado', async () => {
  for (const text of ['A;B\r\n1;2\r\n', 'A;B\n1;2', 'A;B\r\n1;2']) {
    const records = await collect(utf8(text), ['A', 'B']);
    assert.equal(records.length, 1, JSON.stringify(text));
    assert.equal(records[0]?.get('B'), '2', JSON.stringify(text));
  }
});

test('BOM no início não vira parte do nome da primeira coluna', async () => {
  const records = await collect(utf8('﻿A;B\n1;2\n'), ['A', 'B']);
  assert.equal(records[0]?.get('A'), '1');
});

test('lê Windows-1252, que é o que um ERP brasileiro costuma exportar', async () => {
  const records = await collect(
    windows1252('DESCRICAO\nÓleo de soja 900ml\nAçúcar refinado 1kg\n'),
    ['DESCRICAO'],
    ';',
    'windows-1252',
  );
  assert.equal(records[0]?.get('DESCRICAO'), 'Óleo de soja 900ml');
  assert.equal(records[1]?.get('DESCRICAO'), 'Açúcar refinado 1kg');
});

test('campo entre aspas pode conter o delimitador e quebra de linha', async () => {
  const records = await collect(utf8('A;B\n"tem ; dentro";"duas\nlinhas"\n'), [
    'A',
    'B',
  ]);
  assert.equal(records[0]?.get('A'), 'tem ; dentro');
  assert.equal(records[0]?.get('B'), 'duas\nlinhas');
});

test('aspas duplicadas viram uma aspa literal', async () => {
  const records = await collect(utf8('A\n"diz ""oi"" assim"\n'), ['A']);
  assert.equal(records[0]?.get('A'), 'diz "oi" assim');
});

test('não depende de onde o chunk corta', async () => {
  for (const size of [1, 2, 5, 13]) {
    const records = await collect(
      utf8('A;B\nÓleo;1.200,000\nAçúcar;500,000\n', size),
      ['A', 'B'],
    );
    assert.equal(records.length, 2, `chunk de ${size}`);
    assert.equal(records[0]?.get('B'), '1.200,000', `chunk de ${size}`);
  }
});

test('cabeçalho que não bate com o perfil falha alto', async () => {
  await assert.rejects(
    () => collect(utf8('NUMERO;VALOR\n1;2\n'), ['NUMERO_PEDIDO']),
    SyntaxError,
  );
  await assert.rejects(() => collect(utf8(''), ['A']), SyntaxError);
});

test('lê as duas amostras do Beta como estão no repositório', async () => {
  const cabecalho = await readFile(
    new URL('./fixtures/beta/cabecalho.csv', import.meta.url),
    'utf-8',
  );
  const registros = await collect(utf8(cabecalho, 8), [
    'NUMERO_PEDIDO',
    'FORNECEDOR_CNPJ',
    'EMISSAO',
    'SITUACAO',
    'MOEDA',
  ]);
  assert.equal(registros.length, 2);
  assert.equal(registros[0]?.get('FORNECEDOR_CNPJ'), '12.345.678/0001-90');
  assert.equal(registros[1]?.get('SITUACAO'), 'BLOQUEADO');

  const itens = await readFile(
    new URL('./fixtures/beta/itens.csv', import.meta.url),
    'utf-8',
  );
  const linhas = await collect(utf8(itens, 8), [
    'NUMERO_PEDIDO',
    'ITEM',
    'QTD_PEDIDA',
  ]);
  assert.equal(linhas.length, 3);
  assert.equal(linhas[0]?.get('QTD_PEDIDA'), '1.200,000');
  assert.equal(linhas[0]?.get('DESCRICAO'), 'Óleo de soja 900ml');
});
