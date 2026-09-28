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

/** Abstrai caminho JSON e coluna CSV sob o mesmo mapeamento. */
export interface FieldSource {
  text(path: string): string;
  optionalText(path: string): string | null;
}

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
        profile.validatesTaxIdChecksum,
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
  // Um mesmo perfil pode usar notações diferentes para medida e dinheiro.
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

  const conversionFactor =
    map.conversionFactor === null
      ? neutralFactor
      : measure(map.conversionFactor);

  return {
    externalLine: parseInteger(source.text(map.externalLine), map.externalLine),
    material: source.text(map.material).trim(),
    description: source.text(map.description).trim(),
    purchaseUnit: source.text(map.purchaseUnit).trim(),
    conversionFactor,
    // A quantidade é guardada **como o cliente mandou**, na unidade de compra
    // dele: `10` caixas do Gama continuam 10, e o detalhe do pedido mostra o
    // mesmo número que aparece no sistema do cliente. A conversão para unidade
    // de consumo acontece na conferência, onde a nota fiscal fala em unidades
    // (`consumptionBalanceOf` em `conference-rules.ts`, ADR-007).
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
