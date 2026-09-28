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

import { maxItemsPerOrder } from '../../domain/limits.js';

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

export const csvHeadersPart = 'headers';
export const csvItemsPart = 'items';

/**
 * Indexa cabeçalhos e percorre itens em fluxo. Os itens precisam estar
 * agrupados por pedido; reabrir um grupo substituiria um retrato já emitido.
 */
export class PairedCsvAdapter implements SourceAdapter {
  readonly deliveryFormat = 'paired-csv' as const;

  constructor(
    private readonly batchSize = 200,
    /** Teto do índice de cabeçalhos mantido em memória. */
    private readonly maxIndexedHeaders = 100_000,
  ) {}

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
    const headers = await indexHeaders(
      payload,
      profile,
      csv,
      rejected,
      this.maxIndexedHeaders,
    );

    let orders: NormalizedPurchaseOrder[] = [];
    let current: Group | null = null;
    const closed = new Set<string>();

    const flush = (): void => {
      if (current === null) return;
      closed.add(current.orderNumber);
      // Este conjunto também cresce para grupos sem cabeçalho.
      if (closed.size > this.maxIndexedHeaders) {
        throw new FieldError(
          csvItemsPart,
          `mais de ${String(this.maxIndexedHeaders)} pedidos distintos no arquivo de itens`,
        );
      }
      const header = headers.get(current.orderNumber);
      if (header === undefined) {
        rejected.push({
          reference: `${csvItemsPart}: pedido ${current.orderNumber}`,
          reason: 'item sem cabeçalho correspondente na mesma carga',
        });
        current = null;
        return;
      }
      headers.delete(current.orderNumber);

      // Nunca persista um retrato truncado quando o pedido excede o teto.
      if (current.overflow) {
        rejected.push({
          reference: `pedido ${current.orderNumber}`,
          reason:
            `mais de ${String(maxItemsPerOrder)} itens; o pedido inteiro foi recusado ` +
            'para não gravar um retrato parcial',
        });
        current = null;
        return;
      }

      try {
        orders.push(
          validateNormalizedOrder({
            clientId: payload.clientId,
            ...header,
            // `null` preserva itens anteriores quando alguma linha foi rejeitada.
            items: current.rejected > 0 ? null : current.items,
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
        current = { orderNumber, items: [], rejected: 0, overflow: false };
      }

      // Aplique o teto antes do push para limitar memória antes do Zod.
      if (current.items.length >= maxItemsPerOrder) {
        current.overflow = true;
        current.items.length = 0;
        continue;
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

    // Neste formato completo, cabeçalho sem linha significa lista vazia.
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
  overflow: boolean;
}

async function indexHeaders(
  payload: SourcePayload,
  profile: ClientProfile,
  csv: NonNullable<ClientProfile['csv']>,
  rejected: RejectedRecord[],
  maxIndexedHeaders: number,
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
    // Estourar o teto encerra a carga inteira, não apenas uma linha.
    if (headers.size > maxIndexedHeaders) {
      throw new FieldError(
        csvHeadersPart,
        `carga com mais de ${maxIndexedHeaders} pedidos; divida o arquivo ou ` +
          'aumente o teto do adaptador',
      );
    }
  }
  return headers;
}

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
