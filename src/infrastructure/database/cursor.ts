import { createHash } from 'node:crypto';

/**
 * Cursor opaco de ADR-010.
 *
 * Carrega duas coisas: onde a varredura parou e a impressão digital dos
 * filtros que a originaram. Trocar de filtro no meio da varredura passa a ser
 * recusa, em vez de página incoerente — o cliente receberia registros de dois
 * conjuntos diferentes sem perceber.
 *
 * Opaco para quem consome, **tipado antes de chegar ao banco**: tamanho,
 * alfabeto, forma e identidade são conferidos aqui, e o construtor da consulta
 * só recebe um identificador já validado (REVIEW-04, R04-06).
 */

/** Teto de tamanho: cursor legítimo tem ~80 caracteres. */
const maxCursorLength = 256;

const base64url = /^[A-Za-z0-9_-]+$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CursorError extends Error {
  constructor(reason: string) {
    super(`cursor inválido: ${reason}`);
    this.name = 'CursorError';
  }
}

/**
 * Formato do cursor. A ADR-010 especifica `{ v, after, f }`, e o `v` não é
 * enfeite: sem versão, mudar o formato no futuro não tem caminho explícito —
 * cursor antigo viraria erro de estrutura, ou pior, seria lido errado.
 */
export const cursorVersion = 1;

interface CursorPayload {
  /** Versão do formato. */
  readonly v: number;
  /** Último identificador entregue na página anterior. */
  readonly after: string;
  /** Impressão digital dos filtros. */
  readonly f: string;
}

/**
 * Valor de filtro que a impressão digital sabe representar. Só primitivos, de
 * propósito: um objeto viraria `[object Object]` e dois filtros diferentes
 * teriam a mesma impressão, que é justamente o que ela existe para impedir.
 */
export type FilterValue = string | number | boolean | null;

/**
 * Impressão digital dos filtros, estável para o mesmo conjunto de valores.
 * As chaves são ordenadas porque a ordem de escrita do objeto não é contrato.
 */
export function fingerprintOf(
  filters: Readonly<Record<string, FilterValue>>,
): string {
  // Tipo **e** valor, em tuplas. Concatenar `String(value)` confundia coisas
  // distintas: `null` com o caractere NUL, o número 1 com a string "1", o
  // booleano true com a string "true" — três colisões reproduzidas em
  // REVIEW-06, R06-03. Uma impressão que colide não distingue os filtros que
  // ela existe para distinguir.
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

export function encodeCursor(after: string, fingerprint: string): string {
  const payload: CursorPayload = {
    v: cursorVersion,
    after,
    f: fingerprint,
  };
  return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
}

/**
 * Devolve o identificador em que a próxima página começa, ou lança. Nunca
 * devolve dado do cursor sem conferir a impressão digital: é o que impede
 * combinar cursor de uma consulta com filtro de outra.
 */
export function decodeCursor(cursor: string, fingerprint: string): string {
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
    typeof (payload as CursorPayload).f !== 'string'
  ) {
    throw new CursorError('estrutura inesperada');
  }

  const { v, after, f } = payload as CursorPayload;
  if (v !== cursorVersion) {
    throw new CursorError(
      `versão ${String(v)} desconhecida; esperada ${String(cursorVersion)}`,
    );
  }
  if (!uuid.test(after)) {
    throw new CursorError('posição não é um identificador válido');
  }
  if (f !== fingerprint) {
    throw new CursorError(
      'os filtros mudaram desde a página anterior; recomece a varredura',
    );
  }
  return after;
}
