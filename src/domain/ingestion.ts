import type {
  NormalizedPurchaseOrder,
  NormalizedPurchaseOrderItem,
  PurchaseOrder,
} from './purchase-order.js';

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

/**
 * O que o adaptador entrega quando um item não encontrou o pedido dele.
 *
 * Carrega o item **já normalizado** além do conteúdo cru: quem reconcilia mais
 * tarde é o caso de uso, que não conhece o formato do cliente e não teria como
 * reparsear. O cru fica para auditoria e para o relatório da carga.
 */
export interface StagedItem extends StagedRecord {
  readonly externalNumber: string;
  readonly item: NormalizedPurchaseOrderItem;
}

/**
 * Resultado de uma carga.
 *
 * As listas são **amostra**, não o conjunto: uma carga com dez mil rejeições
 * viraria uma resposta JSON sem teto, e o enunciado fala em dezenas de
 * milhares de registros (REVIEW-04, R04-02). Os totais vêm separados, e o
 * quanto ficou de fora é `total - lista.length`.
 */
export interface IngestionReport {
  readonly ingestionId: string;
  readonly clientId: ClientId;
  readonly formatVersion: string;
  readonly startedAt: IsoInstant;
  readonly finishedAt: IsoInstant;
  readonly ordersAccepted: number;
  readonly itemsAccepted: number;
  /** Amostra das rejeições, limitada por `maxReportedRecords`. */
  readonly rejected: readonly RejectedRecord[];
  readonly rejectedTotal: number;
  /** Amostra do que ficou em staging, limitada do mesmo jeito. */
  readonly staged: readonly StagedRecord[];
  readonly stagedTotal: number;
}

/**
 * Traz para o retrato os itens que esperavam pelo cabeçalho dele.
 *
 * A carga da vez manda: se ela trouxe a linha, a versão que esperava está
 * velha e é descartada — coerente com "prevalece a última carga aceita"
 * (ADR-008). `items: null` é carga que não trouxe itens, e aí os que
 * esperavam são tudo o que se sabe sobre eles.
 */
export function mergeWaitingItems(
  snapshot: NormalizedPurchaseOrder,
  waiting: readonly NormalizedPurchaseOrderItem[],
): NormalizedPurchaseOrder {
  if (waiting.length === 0) return snapshot;
  const desta = snapshot.items ?? [];
  const linhas = new Set(desta.map((item) => item.externalLine));
  const recuperados = waiting.filter((item) => !linhas.has(item.externalLine));
  if (recuperados.length === 0 && snapshot.items !== null) return snapshot;
  return { ...snapshot, items: [...desta, ...recuperados] };
}

/** Descarta o que a persistência acrescentou, deixando os itens do contrato. */
export function semPersistencia(
  order: PurchaseOrder,
): readonly NormalizedPurchaseOrderItem[] {
  return order.items.map((item) => {
    const { id, quantityPending, ...contrato } = item;
    void id;
    void quantityPending;
    return contrato;
  });
}
