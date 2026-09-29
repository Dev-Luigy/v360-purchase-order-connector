import type {
  ClientId,
  ClientProfile,
  DeliveryFormat,
} from '../../domain/client.js';
import type { RejectedRecord, StagedItem } from '../../domain/ingestion.js';
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
  readonly staged: readonly StagedItem[];
}

/** Traduz uma forma de entrega em lotes do contrato normalizado. */
export interface SourceAdapter {
  readonly deliveryFormat: DeliveryFormat;

  /**
   * Confere que o payload **termina**, antes de gravar qualquer coisa.
   *
   * Um documento truncado é falha de transporte, não registro inválido: sem
   * esta passagem, o prefixo é gravado enquanto a resposta diz que o payload é
   * incompatível, sem recibo do que entrou.
   *
   * É uma leitura sobre o arquivo já em disco, que não materializa valor nenhum
   * — custa 1% da carga.
   */
  checkStructure(payload: SourcePayload, profile: ClientProfile): Promise<void>;

  read(
    payload: SourcePayload,
    profile: ClientProfile,
  ): AsyncIterable<AdapterBatch>;
}
