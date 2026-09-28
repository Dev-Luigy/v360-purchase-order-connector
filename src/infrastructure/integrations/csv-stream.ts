import { Readable } from 'node:stream';

import { parse } from 'csv-parse';

import { maxCsvRecordSize } from '../../domain/limits.js';

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
    // Sem teto, um campo ou uma linha sem fim enche o buffer: a opção existe
    // justamente para isso e vem ilimitada por padrão (REVIEW-07, R07-02).
    max_record_size: maxCsvRecordSize,
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
    // Quem consome pode parar antes do fim — limite de lote, erro, desconexão.
    // Sem destruir os dois lados, a origem fica aberta: em arquivo, é
    // descritor vazado.
    source.destroy();
    parser.destroy();
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
  // O laço fica fora do try de propósito: erro vindo da origem da carga não é
  // erro de encoding, e anunciá-lo como tal manda quem depura para o lado
  // errado.
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

  // Coluna sem nome não é endereçável, e coluna repetida fazia o último valor
  // vencer em silêncio: um export com duas colunas de mesmo nome podia trocar
  // identidade, quantidade ou preço sem ninguém perceber (REVIEW-07, R07-07).
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
