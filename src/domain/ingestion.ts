import type { ClientId } from './client.js';
import type { IsoInstant } from './primitives.js';

/**
 * Registro que a carga não aceitou. Um registro inválido não invalida a carga:
 * o resto entra e o rejeitado volta no relatório (ADR-008).
 */
export interface RejectedRecord {
  /** Como localizar o registro na origem: número do pedido, linha do CSV, índice do array. */
  readonly reference: string;
  readonly reason: string;
}

/**
 * Registro válido que ainda não pode virar pedido, por falta do outro lado da
 * carga — item sem cabeçalho ou cabeçalho sem itens no Delta. Fica em staging
 * para reconciliar depois, em vez de virar pedido incompleto (ADR-008).
 */
export interface StagedRecord {
  readonly reference: string;
  readonly reason: 'cabecalho-ausente' | 'itens-ausentes';
  /** Conteúdo original, para reprocessar sem pedir a carga de novo. */
  readonly raw: string;
}

export interface IngestionReport {
  readonly ingestionId: string;
  readonly clientId: ClientId;
  readonly formatVersion: string;
  readonly startedAt: IsoInstant;
  readonly finishedAt: IsoInstant;
  readonly ordersAccepted: number;
  readonly itemsAccepted: number;
  readonly rejected: readonly RejectedRecord[];
  readonly staged: readonly StagedRecord[];
}
