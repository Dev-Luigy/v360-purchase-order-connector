/**
 * Leitor de CSV em fluxo, por linha, com as tolerâncias que uma exportação de
 * ERP brasileiro exige: delimitador configurável, UTF-8 ou Windows-1252, LF ou
 * CRLF e BOM no início. O enunciado não especifica encoding nem fim de linha
 * (ver "O que o enunciado não fecha" em `docs/CASE.md`), então toleramos os
 * dois em vez de apostar em um.
 *
 * Aspas seguem a convenção usual: campo entre `"` pode conter o delimitador e
 * quebra de linha, e `""` é uma aspa literal. As amostras do Beta não usam
 * aspas, mas descrição de material com ponto e vírgula é questão de tempo.
 */

export type CsvEncoding = 'utf-8' | 'windows-1252';

export interface CsvRow {
  /** Número da linha no arquivo, começando em 1 no cabeçalho. Vai na rejeição. */
  readonly line: number;
  readonly values: readonly string[];
}

export interface CsvRecord {
  readonly line: number;
  /** Valor por nome de coluna, como escrito no cabeçalho. */
  get(column: string): string;
  has(column: string): boolean;
}

export interface CsvOptions {
  readonly delimiter: string;
  readonly encoding: CsvEncoding;
  /** Colunas exigidas. Cabeçalho sem alguma delas é perfil errado (ADR-008). */
  readonly requiredColumns: readonly string[];
}

/** Rende as linhas de dados já casadas com o cabeçalho. */
export async function* streamCsvRecords(
  chunks: AsyncIterable<Uint8Array>,
  options: CsvOptions,
): AsyncIterable<CsvRecord> {
  let header: readonly string[] | null = null;

  for await (const row of streamCsvRows(chunks, options)) {
    if (header === null) {
      header = row.values;
      assertHeader(header, options.requiredColumns);
      continue;
    }
    // Linha em branco no fim do arquivo é comum e não é registro.
    if (row.values.length === 1 && row.values[0] === '') continue;
    yield toRecord(header, row);
  }

  if (header === null) {
    throw new SyntaxError('CSV vazio: nem o cabeçalho foi encontrado');
  }
}

export async function* streamCsvRows(
  chunks: AsyncIterable<Uint8Array>,
  options: Pick<CsvOptions, 'delimiter' | 'encoding'>,
): AsyncIterable<CsvRow> {
  if (options.delimiter.length !== 1) {
    throw new RangeError(
      `delimitador precisa ter um caractere: ${JSON.stringify(options.delimiter)}`,
    );
  }
  const decoder = new TextDecoder(options.encoding);
  const parser = new RowParser(options.delimiter);

  for await (const chunk of chunks) {
    yield* parser.push(decoder.decode(chunk, { stream: true }));
  }
  yield* parser.push(decoder.decode());
  yield* parser.end();
}

class RowParser {
  private values: string[] = [];
  private field = '';
  private inQuotes = false;
  /** Aspa dentro de campo entre aspas: pode fechar o campo ou ser literal. */
  private quotePending = false;
  private started = false;
  private line = 1;

  constructor(private readonly delimiter: string) {}

  *push(text: string): Generator<CsvRow> {
    for (const character of text) {
      const row = this.consume(character);
      if (row !== null) yield row;
    }
  }

  *end(): Generator<CsvRow> {
    if (this.quotePending) this.quotePending = false;
    if (this.started || this.field !== '' || this.values.length > 0) {
      yield this.takeRow();
    }
  }

  private consume(character: string): CsvRow | null {
    // O BOM só existe antes de qualquer conteúdo.
    if (!this.started && character === '﻿') return null;
    this.started = true;

    if (this.quotePending) {
      this.quotePending = false;
      if (character === '"') {
        this.field += '"';
        return null;
      }
      this.inQuotes = false;
    }

    if (this.inQuotes) {
      if (character === '"') {
        this.quotePending = true;
        return null;
      }
      this.field += character;
      return null;
    }

    if (character === '"' && this.field === '') {
      this.inQuotes = true;
      return null;
    }
    if (character === this.delimiter) {
      this.values.push(this.field);
      this.field = '';
      return null;
    }
    // CRLF: o \r some e o \n fecha a linha. \r sozinho não fecha nada, porque
    // não aparece em exportação real e engoli-lo é mais seguro que inventar
    // uma linha.
    if (character === '\r') return null;
    if (character === '\n') return this.takeRow();

    this.field += character;
    return null;
  }

  private takeRow(): CsvRow {
    this.values.push(this.field);
    const row: CsvRow = { line: this.line, values: this.values };
    this.values = [];
    this.field = '';
    this.line += 1;
    return row;
  }
}

function assertHeader(
  header: readonly string[],
  required: readonly string[],
): void {
  const present = new Set(header.map((column) => column.trim()));
  const missing = required.filter((column) => !present.has(column));
  if (missing.length > 0) {
    throw new SyntaxError(
      `cabeçalho do CSV não corresponde ao perfil: faltam ${missing.join(', ')}`,
    );
  }
}

function toRecord(header: readonly string[], row: CsvRow): CsvRecord {
  const values = new Map<string, string>();
  header.forEach((column, index) => {
    values.set(column.trim(), (row.values[index] ?? '').trim());
  });
  return {
    line: row.line,
    has: (column) => values.has(column),
    get(column) {
      const value = values.get(column);
      if (value === undefined) {
        throw new RangeError(`coluna ausente na linha ${row.line}: ${column}`);
      }
      return value;
    },
  };
}
