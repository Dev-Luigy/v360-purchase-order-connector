import type {
  ClientId,
  ClientProfile,
  DeliveryFormat,
} from '../../domain/client.js';
import type { RejectedRecord, StagedRecord } from '../../domain/ingestion.js';
import type { NormalizedPurchaseOrder } from '../../domain/purchase-order.js';

/**
 * Uma carga, em partes nomeadas: Beta e Delta entregam duas, Alfa e Gama uma.
 * A parte é uma fábrica de fluxo, e não um fluxo, porque o Beta precisa ler o
 * arquivo de itens depois de indexar os cabeçalhos.
 */
export interface SourcePayload {
  readonly clientId: ClientId;
  readonly formatVersion: string;
  readonly parts: ReadonlyMap<string, () => AsyncIterable<Uint8Array>>;
}

export interface AdapterBatch {
  readonly orders: readonly NormalizedPurchaseOrder[];
  readonly rejected: readonly RejectedRecord[];
  readonly staged: readonly StagedRecord[];
}

/**
 * Tradutor de uma forma de entrega para o contrato normalizado. Um adaptador
 * por forma, não por cliente: o que é rótulo vem do perfil (ADR-008). O
 * adaptador não conhece HTTP nem banco, e rende em lotes limitados para não
 * exigir a carga inteira em memória.
 */
export interface SourceAdapter {
  readonly deliveryFormat: DeliveryFormat;
  read(
    payload: SourcePayload,
    profile: ClientProfile,
  ): AsyncIterable<AdapterBatch>;
}
