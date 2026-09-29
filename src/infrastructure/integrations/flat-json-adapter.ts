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

import { FieldError } from './field-parsers.js';
import { scanJsonStructure, streamRootArray } from './json-stream.js';
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
  /** Duas linhas do mesmo pedido discordam no cabeçalho: nada é gravado. */
  inconsistent: boolean;
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

  constructor(
    private readonly batchSize = 200,
    private readonly maxDistinctOrders = 100_000,
  ) {}

  async checkStructure(payload: SourcePayload): Promise<void> {
    await scanJsonStructure(openPart(payload, flatJsonPart));
  }

  async *read(
    payload: SourcePayload,
    profile: ClientProfile,
  ): AsyncIterable<AdapterBatch> {
    assertPayloadMatchesProfile(payload, profile, this.deliveryFormat);

    let orders: NormalizedPurchaseOrder[] = [];
    let rejected: RejectedRecord[] = [];
    let group: Group | null = null;
    let index = 0;
    // Grupos já encerrados. O enunciado não garante que as linhas de um
    // pedido venham juntas, e reabrir um grupo emitiria um segundo retrato
    // que apagaria o primeiro na gravação (REVIEW-09, R09-03).
    const encerrados = new Set<string>();

    const fechar = (): void => {
      if (group === null) return;
      encerrados.add(group.number);
      if (encerrados.size > this.maxDistinctOrders) {
        throw new FieldError(
          flatJsonPart,
          `carga com mais de ${String(this.maxDistinctOrders)} pedidos distintos; ` +
            'divida o arquivo ou aumente o teto do adaptador',
        );
      }
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
      if (group === null) {
        if (encerrados.has(numero)) {
          rejected.push({
            reference: `linha #${String(index)}`,
            reason:
              `as linhas do pedido ${numero} não estão agrupadas no arquivo; ` +
              'aceitar esta linha apagaria os itens já lidos deste pedido',
          });
          index += 1;
          continue;
        }
        group = {
          number: numero,
          header: null,
          items: [],
          failed: false,
          overflow: false,
          inconsistent: false,
        };
      }

      try {
        // **Cada** linha tem o cabeçalho lido e validado, não só a primeira.
        // Com `??=`, uma segunda linha com situação fora do vocabulário ou
        // CNPJ inválido atravessava sem ser olhada, e o resultado dependia da
        // ordem das linhas (REVIEW-09, R09-02).
        const desta = readOrderHeader(source, profile);
        if (group.header === null) {
          group.header = desta;
        } else if (!sameHeader(group.header, desta)) {
          // Escolher qual das duas vale seria adivinhar. O pedido inteiro é
          // recusado, uma vez só.
          if (!group.inconsistent) {
            group.inconsistent = true;
            rejected.push({
              reference: numero,
              reason:
                'linhas do mesmo pedido discordam nos dados do cabeçalho; ' +
                'o pedido inteiro foi recusado para não gravar um dos dois',
            });
          }
        }
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
  // Cabeçalho inconsistente já foi recusado uma vez; nada é gravado.
  if (group.inconsistent) {
    return { order: null, rejected: null };
  }
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

/**
 * Dois cabeçalhos do mesmo pedido são o mesmo? Comparados **depois** de
 * normalizados, para que `EM ABERTO` e um sinônimo do vocabulário não contem
 * como divergência — o que diverge é o significado, não o texto de origem.
 */
function sameHeader(a: OrderHeader, b: OrderHeader): boolean {
  return (
    a.externalNumber === b.externalNumber &&
    a.supplier.taxId === b.supplier.taxId &&
    a.supplier.name === b.supplier.name &&
    a.currency === b.currency &&
    a.status === b.status &&
    a.issuedOn === b.issuedOn
  );
}
