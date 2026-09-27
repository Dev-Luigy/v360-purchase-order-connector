import { Readable } from 'node:stream';

import { parse } from 'csv-parse';

/**
 * Leitura de CSV em fluxo, sobre csv-parse (ADR-011).
 *
 * A biblioteca resolve aspas, quebra de linha dentro de campo, CRLF, BOM,
 * linha em branco e numeração de linha por opção. O que ela **não** resolve é
 * encoding fora da lista do Node: `encoding` aceita `BufferEncoding`, e
 * Windows-1252 não está lá. Como exportação de ERP brasileiro costuma vir
 * nesse encoding e o enunciado não especifica nenhum, decodificamos antes com
 * `TextDecoder` e entregamos texto à biblioteca.
 */

export type CsvEncoding = 'utf-8' | 'windows-1252';

export interface CsvRecord {
  /** Número da linha no arquivo. Vai na rejeição, para localizar o registro. */
  readonly line: number;
  get(column: string): string;
  has(column: string): boolean;
}

export interface CsvOptions {
  readonly delimiter: string;
  readonly encoding: CsvEncoding;
  /** Colunas exigidas. Cabeçalho sem alguma delas é perfil errado (ADR-008). */
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
    info: true,
    skip_empty_lines: true,
    trim: true,
    // A forma de callback entrega o cabeçalho para conferirmos contra o perfil
    // antes de qualquer registro, que é onde perfil errado tem que parar.
    columns: (header: string[]) => {
      sawHeader = true;
      assertHeader(header, options.requiredColumns);
      return header.map((column) => column.trim());
    },
  });

  // `.pipe()` não propaga erro da fonte para o destino: sem encaminhar, uma
  // falha de decodificação vira erro não tratado e o consumidor fica esperando.
  pipeSource(Readable.from(decode(chunks, options.encoding)), parser);

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
}

/** Liga fonte e destino encaminhando o erro, que `.pipe()` sozinho não faz. */
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
  // `fatal: true`: byte inválido para o encoding declarado lança, em vez de
  // virar U+FFFD. Um código de material com caractere de substituição é dado
  // corrompido que atravessa toda a validação (REVIEW-01, achado 7).
  const decoder = new TextDecoder(encoding, { fatal: true });
  try {
    for await (const chunk of chunks) {
      yield decoder.decode(chunk, { stream: true });
    }
    yield decoder.decode();
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
  const present = new Set(header.map((column) => column.trim()));
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
