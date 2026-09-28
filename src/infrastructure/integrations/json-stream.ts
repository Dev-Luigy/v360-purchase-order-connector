import { Readable } from 'node:stream';

import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import type { Token } from 'stream-json/parser.js';
import { pick } from 'stream-json/core/filters/pick.js';
import { streamArray } from 'stream-json/core/streamers/stream-array.js';

export type JsonValue =
  | string
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/**
 * Rende cada elemento do array na chave `key`.
 *
 * Lança quando a chave não existe ou não é array: perfil declarado que não
 * corresponde ao payload precisa falhar alto, não render zero pedidos em
 * silêncio (ADR-008). Array de verdade vazio rende nada, sem erro.
 */
export async function* streamArrayAtKey(
  chunks: AsyncIterable<Uint8Array>,
  key: string,
): AsyncIterable<JsonValue> {
  let found = false;
  const pipeline = chain([
    parser(),
    pick({ filter: key }),
    // Distingue array vazio de chave ausente.
    (token: Token) => {
      if (token.name === 'startArray') found = true;
      return token;
    },
    streamArray({ numberAsString: true }),
  ]);

  const source = Readable.from(toBuffers(chunks));
  source.on('error', (error: Error) => {
    pipeline.emit('error', error);
  });
  source.pipe(pipeline);

  try {
    for await (const entry of pipeline) {
      yield (entry as { key: number; value: JsonValue }).value;
    }

    if (!found) {
      throw new SyntaxError(
        `campo ${JSON.stringify(key)} não encontrado como array no JSON`,
      );
    }
  } finally {
    source.destroy();
    pipeline.destroy();
  }
}

async function* toBuffers(
  chunks: AsyncIterable<Uint8Array>,
): AsyncIterable<Buffer> {
  for await (const chunk of chunks) {
    yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  }
}
