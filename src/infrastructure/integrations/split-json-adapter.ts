import type {
  AdapterBatch,
  SourceAdapter,
  SourcePayload,
} from '../../application/ports/source-adapter.js';
import type { ClientProfile } from '../../domain/client.js';
import type { RejectedRecord, StagedItem } from '../../domain/ingestion.js';
import {
  maxItemsPerOrder,
  maxStagedRawCharacters,
} from '../../domain/limits.js';
import type {
  NormalizedPurchaseOrder,
  NormalizedPurchaseOrderItem,
} from '../../domain/purchase-order.js';

import { FieldError } from './field-parsers.js';
import { describeIssues, normalizedItemSchema } from '../../domain/schemas.js';
import {
  scanJsonStructure,
  streamArrayAtKey,
  type JsonValue,
} from './json-stream.js';
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

  constructor(
    private readonly batchSize = 200,
    private readonly maxIndexedHeaders = 100_000,
  ) {}

  async checkStructure(payload: SourcePayload): Promise<void> {
    // Qualquer uma das duas partes pode vir sozinha.
    for (const parte of [splitJsonOrdersPart, splitJsonItemsPart]) {
      if (payload.parts.has(parte)) {
        await scanJsonStructure(openPart(payload, parte));
      }
    }
  }

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

    // Uma emissão só, que conta as três categorias juntas. Enquanto cada uma
    // tinha o próprio controle, o lote final somava pedidos, recusas e espera
    // sem conferir nada e passava do teto (REVIEW-12, R12-04).
    const lote = new Lote(this.batchSize);
    const pendentes = new Map<string, Pending>();
    // Pedidos com cabeçalhos que discordam: nada é gravado para eles.
    const conflitantes = new Set<string>();
    // Pedidos órfãos distintos, só como guarda de memória do índice.
    const orfaosPorPedido = new Set<string>();

    if (temCabecalhos) {
      let index = 0;
      for await (const raw of streamArrayAtKey(
        openPart(payload, splitJsonOrdersPart),
        profile.fields.ordersArray as string,
      )) {
        try {
          const header = readOrderHeader(jsonFieldSource(raw), profile);
          const anterior = pendentes.get(header.externalNumber);
          if (anterior === undefined) {
            pendentes.set(header.externalNumber, {
              header,
              // Sem a parte de itens, `null` diz "esta carga não trouxe os
              // itens" e preserva os já conhecidos; `[]` os apagaria.
              items: [],
              failed: false,
              overflow: false,
            });
          } else if (!sameHeader(anterior.header, header)) {
            // "Último vence" em silêncio escolhia um dos dois cabeçalhos sem
            // dizer nada. Duplicata idêntica é ignorada; conflito recusa o
            // pedido, como o Gama já faz (REVIEW-10, R10-04).
            conflitantes.add(header.externalNumber);
            lote.recusar({
              reference: header.externalNumber,
              reason:
                'dois cabeçalhos do mesmo pedido discordam na carga; ' +
                'o pedido inteiro foi recusado para não gravar um dos dois',
            });
          }
        } catch (cause) {
          lote.recusar({
            reference: `cabeçalho #${String(index)}`,
            reason: reasonOf(cause),
          });
        }
        if (lote.cheio) yield lote.tirar();
        // Fora do `try`: estourar o teto encerra a carga inteira, não vira
        // recusa de um registro. Aceitar em parte gravaria pedidos sem os
        // itens que viriam depois (REVIEW-09, R09-05).
        if (pendentes.size > this.maxIndexedHeaders) {
          throw new FieldError(
            splitJsonOrdersPart,
            `carga com mais de ${String(this.maxIndexedHeaders)} pedidos; ` +
              'divida o arquivo ou aumente o teto do adaptador',
          );
        }
        index += 1;
      }
    }

    if (temItens) {
      let index = 0;
      for await (const raw of streamArrayAtKey(
        openPart(payload, splitJsonItemsPart),
        profile.fields.itemsArray as string,
      )) {
        try {
          const numero = readItemOrderNumber(jsonFieldSource(raw), profile);
          const alvo = pendentes.get(numero);
          if (alvo !== undefined) {
            if (alvo.items.length >= maxItemsPerOrder) alvo.overflow = true;
            else alvo.items.push(readItem(jsonFieldSource(raw), profile));
          } else {
            // Item sem cabeçalho espera com o conteúdo cru, para reconciliar
            // quando o cabeçalho aparecer. Inventar um pedido a partir do item
            // significaria inventar fornecedor, situação e data — e um pedido
            // sem situação nunca poderia ser conferido (ADR-008).
            //
            // O teto de itens por pedido é do agregado e vive no caso de
            // uso, que enxerga a soma entre lotes e sabe desfazer o que já
            // foi escrito. Conferir aqui também produziria recusa dupla.
            //
            // Validado contra o contrato antes de esperar: sem isso, material
            // acima do limite entrava e só estourava muito depois, fora do
            // tratamento por registro (REVIEW-09, R09-04).
            const conferido = normalizedItemSchema.safeParse(
              readItem(jsonFieldSource(raw), profile),
            );
            if (!conferido.success) {
              throw new FieldError(
                `item do pedido ${numero}`,
                describeIssues(conferido.error),
              );
            }
            orfaosPorPedido.add(numero);
            lote.esperar({
              reference: numero,
              externalNumber: numero,
              reason: 'cabecalho-ausente',
              raw: JSON.stringify(raw).slice(0, maxStagedRawCharacters),
              item: conferido.data,
            });
          }
        } catch (cause) {
          lote.recusar({
            reference: `item #${String(index)}`,
            reason: reasonOf(cause),
          });
          marcarFalha(raw, profile, pendentes);
        }
        if (lote.cheio) yield lote.tirar();
        if (orfaosPorPedido.size > this.maxIndexedHeaders) {
          throw new FieldError(
            splitJsonItemsPart,
            `carga com mais de ${String(this.maxIndexedHeaders)} pedidos sem ` +
              'cabeçalho; divida o arquivo ou aumente o teto do adaptador',
          );
        }
        index += 1;
      }
    }

    for (const [numero, pendente] of pendentes) {
      // Cabeçalhos que discordam já foram recusados uma vez.
      if (conflitantes.has(numero)) continue;

      if (pendente.overflow) {
        lote.recusar({
          reference: numero,
          reason: `pedido acima do teto de ${String(maxItemsPerOrder)} itens`,
        });
      } else {
        try {
          lote.aceitar(
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
          lote.recusar({ reference: numero, reason: reasonOf(cause) });
        }
      }
      if (lote.cheio) yield lote.tirar();
    }

    if (!lote.vazio) yield lote.tirar();
  }
}

/**
 * Acumula um lote e diz quando ele encheu, contando as três categorias
 * juntas. Como a conferência acontece depois de **cada** inclusão, nenhuma
 * emissão passa do teto — nem a última.
 */
class Lote {
  private orders: NormalizedPurchaseOrder[] = [];
  private rejected: RejectedRecord[] = [];
  private staged: StagedItem[] = [];

  constructor(private readonly teto: number) {}

  aceitar(order: NormalizedPurchaseOrder): void {
    this.orders.push(order);
  }

  recusar(record: RejectedRecord): void {
    this.rejected.push(record);
  }

  esperar(item: StagedItem): void {
    this.staged.push(item);
  }

  get cheio(): boolean {
    return (
      this.orders.length + this.rejected.length + this.staged.length >=
      this.teto
    );
  }

  get vazio(): boolean {
    return this.orders.length + this.rejected.length + this.staged.length === 0;
  }

  tirar(): AdapterBatch {
    const batch = {
      orders: this.orders,
      rejected: this.rejected,
      staged: this.staged,
    };
    this.orders = [];
    this.rejected = [];
    this.staged = [];
    return batch;
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

/**
 * Dois cabeçalhos do mesmo pedido são o mesmo? Comparados **depois** de
 * normalizados: o que importa é o significado, não o texto de origem. É a
 * mesma regra do Gama, pelo mesmo motivo.
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
