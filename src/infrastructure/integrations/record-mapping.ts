import type { ClientProfile } from '../../domain/client.js';
import { Decimal, quantityScale } from '../../domain/decimal.js';
import type {
  NormalizedPurchaseOrderItem,
  Supplier,
} from '../../domain/purchase-order.js';
import type { CurrencyCode, IsoDate } from '../../domain/primitives.js';
import type { PurchaseOrderStatus } from '../../domain/client.js';

import {
  FieldError,
  parseCurrency,
  parseDate,
  parseDecimal,
  parseInteger,
  parseStatus,
  parseTaxId,
} from './field-parsers.js';

/**
 * Um registro do cliente, visto como "me dê o campo que está neste rótulo".
 * JSON resolve por caminho com ponto, CSV por nome de coluna — a diferença
 * para aqui, e a tradução para o contrato é uma só para os dois.
 */
export interface FieldSource {
  /** Valor obrigatório. Lança `FieldError` quando ausente ou vazio. */
  text(path: string): string;
  /** Valor opcional: `null` quando ausente, nulo ou vazio. */
  optionalText(path: string): string | null;
}

/** Fator de um cliente que não trabalha com caixa, na escala do contrato. */
const neutralFactor = Decimal.parse('1').toText(quantityScale);

export interface OrderHeader {
  readonly externalNumber: string;
  readonly supplier: Supplier;
  readonly currency: CurrencyCode;
  readonly status: PurchaseOrderStatus;
  readonly issuedOn: IsoDate;
}

export function readOrderHeader(
  source: FieldSource,
  profile: ClientProfile,
): OrderHeader {
  const map = profile.fields.order;
  const externalNumber = source.text(map.externalNumber).trim();
  if (externalNumber === '') {
    throw new FieldError(map.externalNumber, 'número do pedido vazio');
  }
  return {
    externalNumber,
    supplier: {
      taxId: parseTaxId(
        source.text(map.supplierTaxId),
        map.supplierTaxId,
        profile.taxIdMasked,
      ),
      name: source.text(map.supplierName).trim(),
    },
    currency: parseCurrency(
      map.currency === null ? null : source.optionalText(map.currency),
      profile,
      map.currency ?? 'moeda',
    ),
    status: parseStatus(source.text(map.status), profile, map.status),
    issuedOn: parseDate(
      source.text(map.issuedOn),
      profile.dateFormat,
      map.issuedOn,
    ),
  };
}

export function readItem(
  source: FieldSource,
  profile: ClientProfile,
): NormalizedPurchaseOrderItem {
  const map = profile.fields.item;
  // Medida e dinheiro têm notações próprias: o Gama manda quantidade em
  // inteiro simples e preço em centavos na mesma linha (ADR-012).
  const measure = (path: string): string =>
    parseDecimal(
      source.text(path),
      profile.numberFormat.quantity,
      path,
      quantityScale,
    );
  const money = (path: string): string =>
    parseDecimal(
      source.text(path),
      profile.numberFormat.money,
      path,
      quantityScale,
    );

  return {
    externalLine: parseInteger(source.text(map.externalLine), map.externalLine),
    material: source.text(map.material).trim(),
    description: source.text(map.description).trim(),
    purchaseUnit: source.text(map.purchaseUnit).trim(),
    // Cliente sem caixa não manda fator: uma unidade de compra é uma unidade
    // de consumo, e o fator neutro mantém a conferência com uma fórmula só.
    conversionFactor:
      map.conversionFactor === null
        ? neutralFactor
        : measure(map.conversionFactor),
    quantityOrdered: measure(map.quantityOrdered),
    quantityReceived: measure(map.quantityReceived),
    unitPrice: money(map.unitPrice),
    lineCreatedOn:
      map.lineCreatedOn === null
        ? null
        : parseDate(
            source.text(map.lineCreatedOn),
            profile.dateFormat,
            map.lineCreatedOn,
          ),
  };
}

/** Número do pedido a que um item de parte separada pertence. */
export function readItemOrderNumber(
  source: FieldSource,
  profile: ClientProfile,
): string {
  const path = profile.fields.item.orderNumber;
  if (path === null) {
    throw new FieldError(
      'orderNumber',
      `perfil do cliente ${profile.clientId} não diz como ligar item e pedido`,
    );
  }
  const value = source.text(path).trim();
  if (value === '')
    throw new FieldError(path, 'número do pedido vazio no item');
  return value;
}
