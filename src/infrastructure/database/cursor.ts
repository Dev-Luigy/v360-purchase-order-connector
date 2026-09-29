import { createHash } from 'node:crypto';

import { maxCursorLength } from '../../domain/limits.js';

// Cursor legítimo tem cerca de 80 caracteres; o teto limita custo de parsing.

const base64url = /^[A-Za-z0-9_-]+$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CursorError extends Error {
  constructor(reason: string) {
    super(`cursor inválido: ${reason}`);
    this.name = 'CursorError';
  }
}

/**
 * Versão 2: o cursor passou a carregar o **teto** da varredura.
 *
 * Com só o limite inferior, uma varredura sob escrita contínua persegue o que
 * entra e não tem condição própria de término — e o enunciado descreve
 * exatamente esse cenário, varrer de madrugada enquanto novas cargas chegam
 * (REVIEW-14, R14-02). O teto é fixado na primeira página; o que entrar depois
 * fica para a varredura seguinte, que é o comportamento de um retrato.
 *
 * Cursor da versão anterior é recusado, não reinterpretado.
 */
export const cursorVersion = 2;

interface CursorPayload {
  readonly v: number;
  readonly after: string;
  /** Maior identificador que a varredura vai considerar. */
  readonly until: string;
  readonly f: string;
}

/** Posição e teto de uma varredura em andamento. */
export interface CursorPosition {
  readonly after: string;
  readonly until: string;
}

/** Objetos não são aceitos porque sua conversão textual não é canônica. */
export type FilterValue = string | number | boolean | null;

/**
 * Impressão digital dos filtros, estável para o mesmo conjunto de valores.
 * As chaves são ordenadas porque a ordem de escrita do objeto não é contrato.
 */
export function fingerprintOf(
  filters: Readonly<Record<string, FilterValue>>,
): string {
  // Tipo e valor evitam colisões entre, por exemplo, `1` e `"1"`.
  const canonical = JSON.stringify(
    Object.keys(filters)
      .sort()
      .map((key): [string, string, string?] => {
        const value = filters[key];
        if (value === null || value === undefined) return [key, 'null'];
        return [key, typeof value, String(value)];
      }),
  );
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export function encodeCursor(
  after: string,
  until: string,
  fingerprint: string,
): string {
  const payload: CursorPayload = {
    v: cursorVersion,
    after,
    until,
    f: fingerprint,
  };
  return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
}

/** Decodifica e impede reutilizar um cursor com outros filtros. */
export function decodeCursor(
  cursor: string,
  fingerprint: string,
): CursorPosition {
  if (cursor.length > maxCursorLength) {
    throw new CursorError('comprimento acima do limite');
  }
  if (!base64url.test(cursor)) {
    throw new CursorError('fora do alfabeto esperado');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
  } catch {
    throw new CursorError('conteúdo ilegível');
  }

  if (
    payload === null ||
    typeof payload !== 'object' ||
    typeof (payload as CursorPayload).v !== 'number' ||
    typeof (payload as CursorPayload).after !== 'string' ||
    typeof (payload as CursorPayload).until !== 'string' ||
    typeof (payload as CursorPayload).f !== 'string'
  ) {
    throw new CursorError('estrutura inesperada');
  }

  const { v, after, until, f } = payload as CursorPayload;
  if (v !== cursorVersion) {
    throw new CursorError(
      `versão ${String(v)} desconhecida; esperada ${String(cursorVersion)}`,
    );
  }
  if (!uuid.test(after) || !uuid.test(until)) {
    throw new CursorError('posição não é um identificador válido');
  }
  if (f !== fingerprint) {
    throw new CursorError(
      'os filtros mudaram desde a página anterior; recomece a varredura',
    );
  }
  return { after, until };
}
