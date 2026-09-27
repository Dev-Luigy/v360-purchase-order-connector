import type {
  AdapterBatch,
  SourceAdapter,
  SourcePayload,
} from '../../application/ports/source-adapter.js';
import type { ClientProfile } from '../../domain/client.js';
import type { RejectedRecord } from '../../domain/ingestion.js';
import type {
  NormalizedPurchaseOrder,
  NormalizedPurchaseOrderItem,
} from '../../domain/purchase-order.js';

import { streamCsvRecords, type CsvRecord } from './csv-stream.js';
import { FieldError } from './field-parsers.js';
import {
  assertPayloadMatchesProfile,
  openPart,
  reasonOf,
  validateNormalizedOrder,
} from './nested-json-adapter.js';
import {
  readItem,
  readItemOrderNumber,
  readOrderHeader,
  type FieldSource,
  type OrderHeader,
} from './record-mapping.js';

/** As duas partes da carga do Beta. */
export const csvHeadersPart = 'headers';
export const csvItemsPart = 'items';

/**
 * Forma `paired-csv`: dois arquivos delimitados ligados pelo número do pedido,
 * que é como o Beta entrega.
 *
 * **Memória.** Os cabeçalhos são indexados primeiro, um registro por pedido —
 * é o que a porta `SourceAdapter` já previa ("o Beta precisa ler o arquivo de
 * itens depois de indexar os cabeçalhos"). Os itens seguem em fluxo, agrupados
 * enquanto o número do pedido não muda. Guardar todos os itens para agrupar
 * depois custaria a carga inteira em memória, que é justamente o que o volume
 * do enunciado proíbe.
 *
 * **O preço dessa escolha** é que o arquivo de itens precisa vir agrupado por
 * pedido. Isso não é assumido em silêncio: se um pedido reaparece depois de o
 * grupo dele ter fechado, as linhas são **rejeitadas** com o motivo explícito,
 * porque emiti-las substituiria o retrato e apagaria os itens já lidos.
 */
export class PairedCsvAdapter implements SourceAdapter {
  readonly deliveryFormat = 'paired-csv' as const;

  constructor(private readonly batchSize = 200) {}

  async *read(
    payload: SourcePayload,
    profile: ClientProfile,
  ): AsyncIterable<AdapterBatch> {
    assertPayloadMatchesProfile(payload, profile, this.deliveryFormat);
    const csv = profile.csv;
    if (csv === null) {
      throw new FieldError(
        'csv',
        `perfil do cliente ${profile.clientId} sem seção csv`,
      );
    }

    const rejected: RejectedRecord[] = [];
    const headers = await indexHeaders(payload, profile, csv, rejected);

    let orders: NormalizedPurchaseOrder[] = [];
    let current: Group | null = null;
    /** Pedidos cujo grupo já fechou, para detectar arquivo fora de ordem. */
    const closed = new Set<string>();

    const flush = (): void => {
      if (current === null) return;
      closed.add(current.orderNumber);
      const header = headers.get(current.orderNumber);
      if (header === undefined) {
        // As duas partes vieram na mesma carga: falta de cabeçalho aqui é
        // payload incoerente, não a espera do Delta, cujas duas consultas são
        // independentes e vão para staging (ADR-008).
        rejected.push({
          reference: `${csvItemsPart}: pedido ${current.orderNumber}`,
          reason: 'item sem cabeçalho correspondente na mesma carga',
        });
        current = null;
        return;
      }
      headers.delete(current.orderNumber);
      try {
        orders.push(
          validateNormalizedOrder({
            clientId: payload.clientId,
            ...header,
            // Grupo em que toda linha foi rejeitada não afirma "pedido sem
            // itens": `null` aplica o cabeçalho e preserva os itens já
            // conhecidos, em vez de apagá-los (ADR-008).
            items:
              current.items.length === 0 && current.rejected > 0
                ? null
                : current.items,
          }),
        );
      } catch (cause) {
        rejected.push({
          reference: `pedido ${current.orderNumber}`,
          reason: reasonOf(cause),
        });
      }
      current = null;
    };

    for await (const record of streamCsvRecords(
      openPart(payload, csvItemsPart),
      { ...csv, requiredColumns: itemColumns(profile) },
    )) {
      const source = csvFieldSource(record);
      let orderNumber: string;
      try {
        orderNumber = readItemOrderNumber(source, profile);
      } catch (cause) {
        rejected.push({
          reference: `${csvItemsPart} linha ${record.line}`,
          reason: reasonOf(cause),
        });
        continue;
      }

      if (current === null || current.orderNumber !== orderNumber) {
        flush();
        if (closed.has(orderNumber)) {
          rejected.push({
            reference: `${csvItemsPart} linha ${record.line}`,
            reason:
              `itens do pedido ${orderNumber} não estão agrupados no arquivo; ` +
              'aceitar esta linha apagaria os itens já lidos deste pedido',
          });
          continue;
        }
        current = { orderNumber, items: [], rejected: 0 };
      }

      try {
        current.items.push(readItem(source, profile));
      } catch (cause) {
        current.rejected += 1;
        rejected.push({
          reference: `${csvItemsPart} linha ${record.line}`,
          reason: reasonOf(cause),
        });
      }

      if (orders.length + rejected.length >= this.batchSize) {
        yield { orders, rejected: rejected.splice(0), staged: [] };
        orders = [];
      }
    }
    flush();

    // Cabeçalho sem nenhum item no arquivo: o cliente exporta a carga inteira,
    // então ausência de linha é afirmação de que o pedido não tem itens.
    for (const [orderNumber, header] of headers) {
      try {
        orders.push(
          validateNormalizedOrder({
            clientId: payload.clientId,
            ...header,
            items: [],
          }),
        );
      } catch (cause) {
        rejected.push({
          reference: `pedido ${orderNumber}`,
          reason: reasonOf(cause),
        });
      }
      // Este caminho também respeita o lote. Sem isso, uma carga só de
      // cabeçalhos saía num único lote do tamanho do arquivo, contradizendo a
      // promessa de lotes limitados (REVIEW-01, achado 3).
      if (orders.length + rejected.length >= this.batchSize) {
        yield { orders, rejected: rejected.splice(0), staged: [] };
        orders = [];
      }
    }

    if (orders.length > 0 || rejected.length > 0) {
      yield { orders, rejected, staged: [] };
    }
  }
}

interface Group {
  readonly orderNumber: string;
  readonly items: NormalizedPurchaseOrderItem[];
  rejected: number;
}

async function indexHeaders(
  payload: SourcePayload,
  profile: ClientProfile,
  csv: NonNullable<ClientProfile['csv']>,
  rejected: RejectedRecord[],
): Promise<Map<string, OrderHeader>> {
  const headers = new Map<string, OrderHeader>();
  for await (const record of streamCsvRecords(
    openPart(payload, csvHeadersPart),
    { ...csv, requiredColumns: orderColumns(profile) },
  )) {
    try {
      const header = readOrderHeader(csvFieldSource(record), profile);
      if (headers.has(header.externalNumber)) {
        rejected.push({
          reference: `${csvHeadersPart} linha ${record.line}`,
          reason: `cabeçalho repetido para o pedido ${header.externalNumber}`,
        });
        continue;
      }
      headers.set(header.externalNumber, header);
    } catch (cause) {
      rejected.push({
        reference: `${csvHeadersPart} linha ${record.line}`,
        reason: reasonOf(cause),
      });
    }
  }
  return headers;
}

/** As colunas exigidas saem do perfil, não de uma lista fixa no código. */
function orderColumns(profile: ClientProfile): string[] {
  const map = profile.fields.order;
  return [
    map.externalNumber,
    map.issuedOn,
    map.status,
    map.supplierTaxId,
    map.supplierName,
    ...(map.currency === null ? [] : [map.currency]),
  ];
}

function itemColumns(profile: ClientProfile): string[] {
  const map = profile.fields.item;
  return [
    ...(map.orderNumber === null ? [] : [map.orderNumber]),
    map.externalLine,
    map.material,
    map.description,
    map.purchaseUnit,
    map.quantityOrdered,
    map.quantityReceived,
    map.unitPrice,
    ...(map.conversionFactor === null ? [] : [map.conversionFactor]),
    ...(map.lineCreatedOn === null ? [] : [map.lineCreatedOn]),
  ];
}

export function csvFieldSource(record: CsvRecord): FieldSource {
  return {
    text(column) {
      const value = record.get(column).trim();
      if (value === '') throw new FieldError(column, 'campo vazio');
      return value;
    },
    optionalText(column) {
      if (!record.has(column)) return null;
      const value = record.get(column).trim();
      return value === '' ? null : value;
    },
  };
}
