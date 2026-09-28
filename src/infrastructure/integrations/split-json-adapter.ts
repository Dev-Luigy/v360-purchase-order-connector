import type {
  AdapterBatch,
  SourceAdapter,
  SourcePayload,
} from '../../application/ports/source-adapter.js';
import type { ClientProfile } from '../../domain/client.js';
import type { RejectedRecord, StagedRecord } from '../../domain/ingestion.js';
import { maxItemsPerOrder } from '../../domain/limits.js';
import type {
  NormalizedPurchaseOrder,
  NormalizedPurchaseOrderItem,
} from '../../domain/purchase-order.js';

import { FieldError } from './field-parsers.js';
import { streamArrayAtKey, type JsonValue } from './json-stream.js';
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

export const splitJsonOrdersPart = 'orders';
export const splitJsonItemsPart = 'items';

interface Pending {
  readonly header: OrderHeader;
  items: NormalizedPurchaseOrderItem[];
  failed: boolean;
  overflow: boolean;
}

/**
 * Delta: pedidos e itens em duas consultas independentes, ligadas por
 * `purchase_order`, **sem garantia de retratarem o mesmo instante**.
 *
 * Qualquer uma das partes pode vir sozinha, e a substituição é escopada ao que
 * a carga trouxe (ADR-008): mandar só `orders` atualiza cabeçalhos e **não
 * apaga** os itens já conhecidos. Sem isso, uma consulta de cabeçalhos do
 * Delta apagaria todos os itens válidos.
 */
export class SplitJsonAdapter implements SourceAdapter {
  readonly deliveryFormat = 'split-json' as const;

  constructor(private readonly batchSize = 200) {}

  async *read(
    payload: SourcePayload,
    profile: ClientProfile,
  ): AsyncIterable<AdapterBatch> {
    assertPayloadMatchesProfile(payload, profile, this.deliveryFormat);
    const temCabecalhos = payload.parts.has(splitJsonOrdersPart);
    const temItens = payload.parts.has(splitJsonItemsPart);
    if (!temCabecalhos && !temItens) {
      throw new FieldError(
        'parts',
        `carga do ${profile.clientId} sem nenhuma das partes ${splitJsonOrdersPart} e ${splitJsonItemsPart}`,
      );
    }

    const rejected: RejectedRecord[] = [];
    const pendentes = new Map<string, Pending>();

    if (temCabecalhos) {
      let index = 0;
      for await (const raw of streamArrayAtKey(
        openPart(payload, splitJsonOrdersPart),
        profile.fields.ordersArray as string,
      )) {
        try {
          const header = readOrderHeader(jsonFieldSource(raw), profile);
          pendentes.set(header.externalNumber, {
            header,
            // Sem a parte de itens, `null` diz "esta carga não trouxe os
            // itens" e preserva os já conhecidos; `[]` os apagaria.
            items: [],
            failed: false,
            overflow: false,
          });
        } catch (cause) {
          rejected.push({
            reference: `cabeçalho #${String(index)}`,
            reason: reasonOf(cause),
          });
        }
        index += 1;
      }
    }

    const staged: StagedRecord[] = [];
    if (temItens) {
      let index = 0;
      for await (const raw of streamArrayAtKey(
        openPart(payload, splitJsonItemsPart),
        profile.fields.itemsArray as string,
      )) {
        try {
          const numero = readItemOrderNumber(jsonFieldSource(raw), profile);
          const alvo = pendentes.get(numero);
          if (alvo === undefined) {
            // Item sem cabeçalho espera em staging com o conteúdo cru, para
            // reconciliar quando o cabeçalho aparecer. Inventar um pedido a
            // partir do item significaria inventar fornecedor, situação e
            // data — e um pedido sem situação nunca poderia ser conferido,
            // porque a regra 2 depende dela (ADR-008).
            staged.push({
              reference: numero,
              reason: 'cabecalho-ausente',
              raw: JSON.stringify(raw),
            });
          } else if (alvo.items.length >= maxItemsPerOrder) {
            alvo.overflow = true;
          } else {
            alvo.items.push(readItem(jsonFieldSource(raw), profile));
          }
        } catch (cause) {
          rejected.push({
            reference: `item #${String(index)}`,
            reason: reasonOf(cause),
          });
          marcarFalha(raw, profile, pendentes);
        }
        index += 1;
      }
    }

    let orders: NormalizedPurchaseOrder[] = [];
    let lote: RejectedRecord[] = rejected;
    for (const [numero, pendente] of pendentes) {
      if (pendente.overflow) {
        lote.push({
          reference: numero,
          reason: `pedido acima do teto de ${String(maxItemsPerOrder)} itens`,
        });
        continue;
      }
      try {
        orders.push(
          validateNormalizedOrder({
            clientId: payload.clientId,
            ...pendente.header,
            // Sem a parte de itens, esta carga não afirma nada sobre eles.
            // Com ela, uma linha recusada deixa o conjunto incerto, e `null`
            // preserva o que já existe em vez de apagar.
            items: !temItens || pendente.failed ? null : pendente.items,
          }),
        );
      } catch (cause) {
        lote.push({ reference: numero, reason: reasonOf(cause) });
      }

      if (orders.length + lote.length >= this.batchSize) {
        yield { orders, rejected: lote, staged: [] };
        orders = [];
        lote = [];
      }
    }

    // O staging sai no último lote: ele só se conhece depois de ler tudo.
    if (orders.length > 0 || lote.length > 0 || staged.length > 0) {
      yield { orders, rejected: lote, staged };
    }
  }
}

/** Item ilegível deixa o conjunto de itens do pedido incerto. */
function marcarFalha(
  raw: JsonValue,
  profile: ClientProfile,
  pendentes: Map<string, Pending>,
): void {
  try {
    const numero = readItemOrderNumber(jsonFieldSource(raw), profile);
    const alvo = pendentes.get(numero);
    if (alvo !== undefined) alvo.failed = true;
  } catch {
    // Sem número de pedido não há a que atribuir: a recusa já foi registrada.
  }
}
