import type { PurchaseOrderStatus } from '../../domain/client.js';
import { Decimal, quantityScale } from '../../domain/decimal.js';
import type {
  DecimalText,
  IsoDate,
  IsoInstant,
} from '../../domain/primitives.js';

/** Interface mínima que mantém a conversão decimal fora de `number`. */
interface PrismaDecimal {
  toFixed(decimalPlaces?: number): string;
}

export function decimalToText(
  value: PrismaDecimal | null | undefined,
  field: string,
): DecimalText {
  if (value === null || value === undefined) {
    throw new TypeError(
      `coluna decimal nula onde o contrato exige valor: ${field}`,
    );
  }
  return value.toFixed(quantityScale);
}

export function dateToIsoDate(
  value: Date | null | undefined,
  field: string,
): IsoDate {
  if (value === null || value === undefined) {
    throw new TypeError(
      `coluna de data nula onde o contrato exige valor: ${field}`,
    );
  }
  return value.toISOString().slice(0, 10);
}

export function optionalDateToIsoDate(
  value: Date | null | undefined,
): IsoDate | null {
  return value === null || value === undefined
    ? null
    : value.toISOString().slice(0, 10);
}

export function instantToIso(
  value: Date | null | undefined,
  field: string,
): IsoInstant {
  if (value === null || value === undefined) {
    throw new TypeError(
      `coluna de instante nula onde o contrato exige valor: ${field}`,
    );
  }
  return value.toISOString();
}

export function isoDateToDate(value: IsoDate): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function isoDateToDateOrNull(value: IsoDate | null): Date | null {
  return value === null ? null : isoDateToDate(value);
}

/** Saldo pode ser negativo para preservar recebimento acima do pedido. */
export function pendingOf(
  quantityOrdered: DecimalText,
  quantityReceived: DecimalText,
): DecimalText {
  return Decimal.parse(quantityOrdered)
    .subtract(Decimal.parse(quantityReceived))
    .toText(quantityScale);
}

export function hasPendingBalance(
  items: readonly { quantityPending: DecimalText }[],
): boolean {
  return items.some((item) => Decimal.parse(item.quantityPending).isPositive);
}

export function statusToDb(status: PurchaseOrderStatus): PurchaseOrderStatus {
  return status;
}
