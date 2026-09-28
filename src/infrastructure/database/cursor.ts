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

interface CursorPayload {
  /** Último identificador entregue na página anterior. */
  readonly a: string;
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
  const canonical = Object.keys(filters)
    .sort()
    .map((key) => {
      const value = filters[key];
      // `null` e ausente precisam ser distinguíveis de uma string vazia.
      return `${key}=${value === null || value === undefined ? '\u0000' : String(value)}`;
    })
    .join('&');
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

export function encodeCursor(after: string, fingerprint: string): string {
  const payload: CursorPayload = { a: after, f: fingerprint };
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
    typeof (payload as CursorPayload).a !== 'string' ||
    typeof (payload as CursorPayload).f !== 'string'
  ) {
    throw new CursorError('estrutura inesperada');
  }

  const { a, f } = payload as CursorPayload;
  if (!uuid.test(a)) {
    throw new CursorError('posição não é um identificador válido');
  }
  if (f !== fingerprint) {
    throw new CursorError(
      'os filtros mudaram desde a página anterior; recomece a varredura',
    );
  }
  return a;
}
