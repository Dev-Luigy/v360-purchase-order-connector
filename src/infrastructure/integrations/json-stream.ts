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

/**
 * Rende cada elemento de um array que é a **raiz** do payload.
 *
 * O Gama entrega `[{…}, {…}]` sem envelope, então não há chave para apontar.
 * Raiz que não é array falha alto, pelo mesmo motivo de `streamArrayAtKey`:
 * perfil que não corresponde ao payload não pode render zero em silêncio.
 */
export async function* streamRootArray(
  chunks: AsyncIterable<Uint8Array>,
): AsyncIterable<JsonValue> {
  let found = false;
  const pipeline = chain([
    parser(),
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
      throw new SyntaxError('a raiz do JSON não é um array');
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

/**
 * Percorre o JSON inteiro só para saber se ele **termina**.
 *
 * Não materializa valor nenhum: consome os tokens do parser e os descarta. Um
 * documento truncado é falha de transporte, não registro inválido, e aceitar o
 * prefixo dele deixava pedidos gravados com a resposta dizendo que o payload
 * era incompatível — sem recibo do que entrou (REVIEW-16, R16-01).
 *
 * Custa 1% da carga: 0,6s contra 83s, medido com 20.000 pedidos.
 */
export async function scanJsonStructure(
  chunks: AsyncIterable<Uint8Array>,
): Promise<void> {
  const pipeline = chain([parser()]);
  const source = Readable.from(toBuffers(chunks));
  source.on('error', (error: Error) => {
    pipeline.emit('error', error);
  });
  source.pipe(pipeline);
  try {
    // O `for await` propaga o erro do parser; o corpo vazio é o ponto.
    for await (const _ of pipeline) void _;
  } finally {
    source.destroy();
    pipeline.destroy();
  }
}
