import { Readable } from 'node:stream';

import { chain } from 'stream-chain';
import { parser } from 'stream-json';
import type { Token } from 'stream-json/parser.js';
import { pick } from 'stream-json/core/filters/pick.js';
import { streamArray } from 'stream-json/core/streamers/stream-array.js';

/**
 * Leitura de JSON em fluxo com o decimal preservado como texto.
 *
 * `streamArray({ numberAsString: true })` faz o `Assembler` do stream-json
 * guardar o número como a string que veio no payload, em vez de `parseFloat`.
 * É o requisito da ADR-007 resolvido pela biblioteca: `45.9` chega `'45.9'`,
 * e não o `double` mais próximo (ADR-011).
 *
 * O fluxo importa pelo volume: o enunciado fala em dezenas de milhares de
 * pedidos, e aqui só um pedido por vez fica montado em memória.
 */

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
    // Sonda entre o filtro e o montador: distingue "array vazio" de "chave que
    // não existe", que sem isto seriam a mesma saída silenciosa.
    (token: Token) => {
      if (token.name === 'startArray') found = true;
      return token;
    },
    streamArray({ numberAsString: true }),
  ]);

  // `.pipe()` não propaga erro da fonte para o destino: sem encaminhar, uma
  // falha na origem da carga vira erro não tratado.
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
    // Quem consome pode parar antes do fim — limite de lote, erro, desconexão.
    // Sem destruir os dois lados, a origem fica aberta: em arquivo, é
    // descritor vazado.
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
