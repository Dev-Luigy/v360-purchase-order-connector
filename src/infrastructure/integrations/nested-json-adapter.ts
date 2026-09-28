import type {
  AdapterBatch,
  SourceAdapter,
  SourcePayload,
} from '../../application/ports/source-adapter.js';
import type { ClientProfile } from '../../domain/client.js';
import type { RejectedRecord } from '../../domain/ingestion.js';
import { describeIssues, normalizedOrderSchema } from '../../domain/schemas.js';
import type { NormalizedPurchaseOrder } from '../../domain/purchase-order.js';

import { FieldError } from './field-parsers.js';
import { streamArrayAtKey, type JsonValue } from './json-stream.js';
import {
  readItem,
  readOrderHeader,
  type FieldSource,
} from './record-mapping.js';

export const nestedJsonPart = 'orders';

/** Adaptador por forma; nomes de campos pertencem ao perfil. */
export class NestedJsonAdapter implements SourceAdapter {
  readonly deliveryFormat = 'nested-json' as const;

  constructor(private readonly batchSize = 200) {}

  async *read(
    payload: SourcePayload,
    profile: ClientProfile,
  ): AsyncIterable<AdapterBatch> {
    assertPayloadMatchesProfile(payload, profile, this.deliveryFormat);
    const ordersArray = profile.fields.ordersArray;
    if (ordersArray === null) {
      throw new FieldError(
        'ordersArray',
        `perfil do cliente ${profile.clientId} não diz onde está o array de pedidos`,
      );
    }

    let orders: NormalizedPurchaseOrder[] = [];
    let rejected: RejectedRecord[] = [];
    let index = 0;

    for await (const raw of streamArrayAtKey(
      openPart(payload, nestedJsonPart),
      ordersArray,
    )) {
      try {
        orders.push(toNormalizedOrder(raw, payload, profile));
      } catch (cause) {
        rejected.push({
          reference: referenceOf(raw, profile, index),
          reason: reasonOf(cause),
        });
      }
      index += 1;

      if (orders.length + rejected.length >= this.batchSize) {
        yield { orders, rejected, staged: [] };
        orders = [];
        rejected = [];
      }
    }

    if (orders.length > 0 || rejected.length > 0) {
      yield { orders, rejected, staged: [] };
    }
  }
}

function toNormalizedOrder(
  raw: JsonValue,
  payload: SourcePayload,
  profile: ClientProfile,
): NormalizedPurchaseOrder {
  const header = readOrderHeader(jsonFieldSource(raw), profile);
  const itemsPath = profile.fields.itemsArray as string;
  const rawItems = readPath(raw, itemsPath);
  // Nesta forma, ausência de itens é payload malformado, não carga parcial.
  if (!isJsonArray(rawItems)) {
    throw new FieldError(itemsPath, 'itens ausentes ou não são uma lista');
  }
  return validateNormalizedOrder({
    clientId: payload.clientId,
    ...header,
    items: rawItems.map((item) => readItem(jsonFieldSource(item), profile)),
  });
}

export function validateNormalizedOrder(
  order: NormalizedPurchaseOrder,
): NormalizedPurchaseOrder {
  const result = normalizedOrderSchema.safeParse(order);
  if (!result.success) {
    throw new FieldError(
      `pedido ${order.externalNumber}`,
      describeIssues(result.error),
    );
  }
  return order;
}

export function assertPayloadMatchesProfile(
  payload: SourcePayload,
  profile: ClientProfile,
  deliveryFormat: ClientProfile['deliveryFormat'],
): void {
  if (profile.deliveryFormat !== deliveryFormat) {
    throw new FieldError(
      'deliveryFormat',
      `adaptador ${deliveryFormat} recebeu perfil ${profile.deliveryFormat}`,
    );
  }
  if (payload.clientId !== profile.clientId) {
    throw new FieldError(
      'clientId',
      `carga do cliente ${payload.clientId} com o perfil de ${profile.clientId}`,
    );
  }
  if (payload.formatVersion !== profile.formatVersion) {
    throw new FieldError(
      'formatVersion',
      `carga na versão ${payload.formatVersion} com perfil na versão ${profile.formatVersion}`,
    );
  }
}

export function openPart(
  payload: SourcePayload,
  name: string,
): AsyncIterable<Uint8Array> {
  const part = payload.parts.get(name);
  if (part === undefined) {
    const available = [...payload.parts.keys()].join(', ') || 'nenhuma';
    throw new FieldError(
      'parts',
      `carga sem a parte ${name}; partes recebidas: ${available}`,
    );
  }
  return part();
}

export function reasonOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function referenceOf(
  raw: JsonValue,
  profile: ClientProfile,
  index: number,
): string {
  try {
    return jsonFieldSource(raw).text(profile.fields.order.externalNumber);
  } catch {
    return `pedido #${index}`;
  }
}

export function jsonFieldSource(value: JsonValue): FieldSource {
  return {
    text(path) {
      const found = textOf(readPath(value, path));
      if (found === null) throw new FieldError(path, 'campo ausente ou vazio');
      return found;
    },
    optionalText: (path) => textOf(readPath(value, path)),
  };
}

/**
 * `Array.isArray` sozinho estreita para `any[]` quando a união tem array
 * somente-leitura, e o `any` se espalha silenciosamente pelo `map`.
 */
function isJsonArray(
  value: JsonValue | undefined,
): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function readPath(value: JsonValue, path: string): JsonValue | undefined {
  let current: JsonValue | undefined = value;
  for (const key of path.split('.')) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object' ||
      Array.isArray(current)
    ) {
      return undefined;
    }
    current = (current as { readonly [key: string]: JsonValue })[key];
  }
  return current;
}

function textOf(value: JsonValue | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value === '' ? null : value;
  return null;
}
