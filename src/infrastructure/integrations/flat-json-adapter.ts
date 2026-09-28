import type {
  AdapterBatch,
  SourceAdapter,
  SourcePayload,
} from '../../application/ports/source-adapter.js';
import type { ClientProfile } from '../../domain/client.js';
import type { RejectedRecord } from '../../domain/ingestion.js';
import { maxItemsPerOrder } from '../../domain/limits.js';
import type {
  NormalizedPurchaseOrder,
  NormalizedPurchaseOrderItem,
} from '../../domain/purchase-order.js';

import { streamRootArray } from './json-stream.js';
import {
  assertPayloadMatchesProfile,
  jsonFieldSource,
  openPart,
  reasonOf,
  validateNormalizedOrder,
} from './nested-json-adapter.js';
import {
  readItem,
  readItemOrderNumber,
  readOrderHeader,
  type OrderHeader,
} from './record-mapping.js';

export const flatJsonPart = 'lines';

interface Group {
  readonly number: string;
  header: OrderHeader | null;
  items: NormalizedPurchaseOrderItem[];
  /** Alguma linha do pedido foi recusada: os itens deixam de ser confiáveis. */
  failed: boolean;
  /** O pedido passou do teto de itens; o pedido inteiro é recusado. */
  overflow: boolean;
}

/**
 * Gama: uma linha por item, com os dados do pedido repetidos em cada uma.
 *
 * Não existe cabeçalho de pedido, então ele é reconstruído da primeira linha do
 * grupo. As linhas do mesmo pedido chegam consecutivas — como no CSV do Beta —
 * e é isso que permite ler em fluxo: só um pedido fica em memória por vez, que
 * é o que o volume do enunciado exige.
 */
export class FlatJsonAdapter implements SourceAdapter {
  readonly deliveryFormat = 'flat-json' as const;

  constructor(private readonly batchSize = 200) {}

  async *read(
    payload: SourcePayload,
    profile: ClientProfile,
  ): AsyncIterable<AdapterBatch> {
    assertPayloadMatchesProfile(payload, profile, this.deliveryFormat);

    let orders: NormalizedPurchaseOrder[] = [];
    let rejected: RejectedRecord[] = [];
    let group: Group | null = null;
    let index = 0;

    const fechar = (): void => {
      if (group === null) return;
      const finished = finish(group, payload);
      if (finished.order !== null) orders.push(finished.order);
      if (finished.rejected !== null) rejected.push(finished.rejected);
      group = null;
    };

    for await (const raw of streamRootArray(openPart(payload, flatJsonPart))) {
      const source = jsonFieldSource(raw);
      let numero: string;
      try {
        numero = readItemOrderNumber(source, profile);
      } catch (cause) {
        // Linha sem número de pedido não pertence a grupo nenhum: é recusada
        // sozinha, sem contaminar o pedido que estiver aberto.
        rejected.push({
          reference: `linha #${String(index)}`,
          reason: reasonOf(cause),
        });
        index += 1;
        continue;
      }

      if (group !== null && group.number !== numero) fechar();
      group ??= {
        number: numero,
        header: null,
        items: [],
        failed: false,
        overflow: false,
      };

      try {
        // O cabeçalho sai da primeira linha do grupo. As linhas seguintes
        // repetem os mesmos dados e não são reconferidas: divergência entre
        // elas é dado do cliente, não erro de leitura, e escolher qual vale
        // seria adivinhar.
        group.header ??= readOrderHeader(source, profile);
        if (group.items.length >= maxItemsPerOrder) {
          group.overflow = true;
        } else {
          group.items.push(readItem(source, profile));
        }
      } catch (cause) {
        group.failed = true;
        rejected.push({
          reference: `${numero} item #${String(index)}`,
          reason: reasonOf(cause),
        });
      }

      index += 1;
      if (orders.length + rejected.length >= this.batchSize) {
        // O grupo aberto não entra no lote: ele ainda pode receber linhas.
        yield { orders, rejected, staged: [] };
        orders = [];
        rejected = [];
      }
    }

    fechar();
    if (orders.length > 0 || rejected.length > 0) {
      yield { orders, rejected, staged: [] };
    }
  }
}

function finish(
  group: Group,
  payload: SourcePayload,
): { order: NormalizedPurchaseOrder | null; rejected: RejectedRecord | null } {
  // Passar do teto recusa o **pedido inteiro**. Persistir os primeiros dez mil
  // como se fossem o pedido completo zeraria o saldo dos itens que sobraram, e
  // a conferência passaria a aprovar nota que não deveria.
  if (group.overflow) {
    return {
      order: null,
      rejected: {
        reference: group.number,
        reason: `pedido acima do teto de ${String(maxItemsPerOrder)} itens`,
      },
    };
  }
  // Sem cabeçalho, nenhuma linha do grupo pôde ser lida — e cada uma delas já
  // foi recusada com o motivo próprio. Acrescentar uma recusa do grupo
  // contaria o mesmo problema duas vezes e inflaria o relatório de carga.
  if (group.header === null) {
    return { order: null, rejected: null };
  }
  try {
    return {
      order: validateNormalizedOrder({
        clientId: payload.clientId,
        ...group.header,
        // Alguma linha recusada significa que não sabemos o conjunto completo
        // de itens. `null` preserva os itens já conhecidos em vez de apagá-los
        // (ADR-008); `[]` afirmaria que o pedido não tem itens.
        items: group.failed ? null : group.items,
      }),
      rejected: null,
    };
  } catch (cause) {
    return {
      order: null,
      rejected: { reference: group.number, reason: reasonOf(cause) },
    };
  }
}
