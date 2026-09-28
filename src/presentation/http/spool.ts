import { createReadStream } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { randomUUID } from 'node:crypto';

import type { MultipartFile } from '@fastify/multipart';

/**
 * Grava as partes de um upload em disco antes de entregá-las ao adaptador.
 *
 * O contrato `SourcePayload` pede **fábricas** de fluxo, porque o adaptador do
 * Beta precisa ler os cabeçalhos antes dos itens. Um fluxo de multipart é
 * descartável e sequencial: não dá para reabrir nem para ler fora de ordem.
 * O spool resolve os dois, e é a política que REVIEW-04 pediu em R04-01.
 *
 * Três cuidados que o mesmo achado exige:
 *
 * - o nome no disco é **gerado por nós**; o nome que o cliente manda nunca
 *   toca o caminho, senão `../../algo` escreveria fora do diretório;
 * - o diretório é exclusivo desta requisição e some no `finally`, inclusive
 *   quando o cliente desconecta ou o parser falha;
 * - sobra de queda abrupta é varrida na inicialização, porque `finally` não
 *   roda quando o processo morre.
 */

const spoolPrefix = 'v360-ingest-';

export interface SpooledPayload {
  readonly parts: ReadonlyMap<string, () => AsyncIterable<Uint8Array>>;
  cleanup(): Promise<void>;
}

export class SpoolError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'SpoolError';
  }
}

/**
 * Consome as partes do multipart, uma de cada vez, e devolve fábricas que leem
 * do disco. `allowedParts` é allowlist: nome de campo fora dela é recusado
 * antes de qualquer escrita.
 */
export async function spoolMultipart(
  files: AsyncIterableIterator<MultipartFile>,
  allowedParts: readonly string[],
): Promise<SpooledPayload> {
  const directory = await mkdtemp(join(tmpdir(), spoolPrefix));
  const parts = new Map<string, () => AsyncIterable<Uint8Array>>();

  const cleanup = async (): Promise<void> => {
    await rm(directory, { recursive: true, force: true });
  };

  try {
    for await (const file of files) {
      if (!allowedParts.includes(file.fieldname)) {
        throw new SpoolError(
          `parte inesperada ${JSON.stringify(file.fieldname)}; esperadas: ${allowedParts.join(', ')}`,
        );
      }
      if (parts.has(file.fieldname)) {
        throw new SpoolError(`parte ${file.fieldname} enviada duas vezes`);
      }

      // Nome nosso, sempre. O `file.filename` do cliente é registrado no
      // relatório, nunca usado como caminho.
      const target = join(directory, `${randomUUID()}.part`);
      await pipeline(file.file, createWriteStream(target));

      // `truncated` é como o multipart avisa que o limite de tamanho estourou;
      // sem conferir, o adaptador receberia um arquivo cortado como se fosse
      // inteiro — que é pior que recusar.
      if (file.file.truncated) {
        throw new SpoolError(
          `parte ${file.fieldname} excede o tamanho máximo permitido`,
        );
      }

      parts.set(file.fieldname, () => createReadStream(target));
    }
  } catch (error) {
    await cleanup();
    throw error;
  }

  return { parts, cleanup };
}

/**
 * Remove restos de cargas anteriores. `finally` não roda quando o processo
 * morre, então a limpeza precisa também de um ponto no start.
 */
export async function sweepSpoolLeftovers(): Promise<number> {
  const base = tmpdir();
  let removed = 0;
  for (const entry of await readdir(base, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith(spoolPrefix)) {
      await rm(join(base, entry.name), { recursive: true, force: true });
      removed += 1;
    }
  }
  return removed;
}
