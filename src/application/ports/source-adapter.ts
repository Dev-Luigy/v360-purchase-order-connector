import type {
  ClientId,
  ClientProfile,
  DeliveryFormat,
} from '../../domain/client.js';
import type { RejectedRecord, StagedRecord } from '../../domain/ingestion.js';
import type { NormalizedPurchaseOrder } from '../../domain/purchase-order.js';

/** As fábricas permitem reabrir uma parte sem manter o conteúdo em memória. */
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

/** Traduz uma forma de entrega em lotes do contrato normalizado. */
export interface SourceAdapter {
  readonly deliveryFormat: DeliveryFormat;
  read(
    payload: SourcePayload,
    profile: ClientProfile,
  ): AsyncIterable<AdapterBatch>;
}
