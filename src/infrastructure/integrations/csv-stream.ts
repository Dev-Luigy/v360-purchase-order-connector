import { Readable } from 'node:stream';

import { parse } from 'csv-parse';

import { maxCsvRecordSize } from '../../domain/limits.js';

export type CsvEncoding = 'utf-8' | 'windows-1252';

export interface CsvRecord {
  readonly line: number;
  get(column: string): string;
  has(column: string): boolean;
}

export interface CsvOptions {
  readonly delimiter: string;
  readonly encoding: CsvEncoding;
  readonly requiredColumns: readonly string[];
}

export async function* streamCsvRecords(
  chunks: AsyncIterable<Uint8Array>,
  options: CsvOptions,
): AsyncIterable<CsvRecord> {
  if (options.delimiter.length !== 1) {
    throw new RangeError(
      `delimitador precisa ter um caractere: ${JSON.stringify(options.delimiter)}`,
    );
  }

  let sawHeader = false;
  const parser = parse({
    delimiter: options.delimiter,
    bom: true,
    // csv-parse não limita o registro por padrão.
    max_record_size: maxCsvRecordSize,
    info: true,
    skip_empty_lines: true,
    trim: true,
    columns: (header: string[]) => {
      sawHeader = true;
      assertHeader(header, options.requiredColumns);
      return header.map((column) => column.trim());
    },
  });

  // `.pipe()` não encaminha erros da origem ao destino.
  const source = Readable.from(decode(chunks, options.encoding));
  pipeSource(source, parser);

  try {
    for await (const row of parser) {
      const { info, record } = row as {
        info: { lines: number };
        record: Record<string, string>;
      };
      yield toRecord(record, info.lines);
    }

    if (!sawHeader) {
      throw new SyntaxError('CSV vazio: nem o cabeçalho foi encontrado');
    }
  } finally {
    // O consumidor pode encerrar antes do fim; feche ambos os fluxos.
    source.destroy();
    parser.destroy();
  }
}

function pipeSource(
  source: Readable,
  destination: NodeJS.WritableStream,
): void {
  source.on('error', (error: Error) => {
    destination.emit('error', error);
  });
  source.pipe(destination);
}

async function* decode(
  chunks: AsyncIterable<Uint8Array>,
  encoding: CsvEncoding,
): AsyncIterable<string> {
  // Dados inválidos não podem virar silenciosamente o caractere de substituição.
  const decoder = new TextDecoder(encoding, { fatal: true });
  // Erros da origem não devem ser reclassificados como erro de encoding.
  for await (const chunk of chunks) {
    yield decodeOrExplain(decoder, chunk, encoding);
  }
  yield decodeOrExplain(decoder, undefined, encoding);
}

function decodeOrExplain(
  decoder: TextDecoder,
  chunk: Uint8Array | undefined,
  encoding: CsvEncoding,
): string {
  try {
    return chunk === undefined
      ? decoder.decode()
      : decoder.decode(chunk, { stream: true });
  } catch (cause) {
    throw new SyntaxError(
      `conteúdo não é ${encoding} válido; confira o encoding declarado no perfil`,
      { cause },
    );
  }
}

function assertHeader(
  header: readonly string[],
  required: readonly string[],
): void {
  const columns = header.map((column) => column.trim());

  if (columns.some((column) => column === '')) {
    throw new SyntaxError('cabeçalho do CSV tem coluna sem nome');
  }
  const repetidas = columns.filter(
    (column, indice) => columns.indexOf(column) !== indice,
  );
  if (repetidas.length > 0) {
    throw new SyntaxError(
      `cabeçalho do CSV tem coluna repetida: ${[...new Set(repetidas)].join(', ')}`,
    );
  }

  const present = new Set(columns);
  const missing = required.filter((column) => !present.has(column));
  if (missing.length > 0) {
    throw new SyntaxError(
      `cabeçalho do CSV não corresponde ao perfil: faltam ${missing.join(', ')}`,
    );
  }
}

function toRecord(record: Record<string, string>, line: number): CsvRecord {
  return {
    line,
    has: (column) => record[column] !== undefined,
    get(column) {
      const value = record[column];
      if (value === undefined) {
        throw new RangeError(`coluna ausente na linha ${line}: ${column}`);
      }
      return value;
    },
  };
}
