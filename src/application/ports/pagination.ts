/** Tamanho de página quando a plataforma não pede nenhum. */
export const defaultPageLimit = 50;

/** Teto: pedido acima disto é erro de requisição, não recorte silencioso (ADR-010). */
export const maxPageLimit = 100;

export interface PageRequest {
  readonly limit: number;
  /**
   * Cursor opaco devolvido pela página anterior; `null` na primeira. Carrega a
   * posição e a impressão dos filtros, então trocar de filtro no meio da
   * varredura é recusado em vez de devolver resultado incoerente (ADR-010).
   */
  readonly cursor: string | null;
}

export interface PageInfo {
  readonly limit: number;
  /** Onde esta página começou. */
  readonly cursor: string | null;
  /** Como pedir a próxima. `null` quando não há mais. */
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface Page<T> {
  readonly data: readonly T[];
  readonly page: PageInfo;
}
