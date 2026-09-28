import type { PurchaseOrderStatus } from '../../domain/client.js';
import { Decimal, quantityScale } from '../../domain/decimal.js';
import type {
  DecimalText,
  IsoDate,
  IsoInstant,
} from '../../domain/primitives.js';

/**
 * Tradução entre as linhas do banco e o contrato normalizado.
 *
 * O ponto delicado é o decimal. O Prisma devolve `runtime.Decimal`, que é
 * decimal.js — a mesma biblioteca do domínio (ADR-011) —, então a ponte é
 * `toFixed()` e não passa por `number` em nenhum momento. Ler com `Number()`
 * aqui desfaria tudo o que ADR-007 protege.
 */

/** Mínimo que precisamos do decimal do Prisma, sem importar o tipo gerado. */
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

/** Data de calendário sem hora: meia-noite UTC, para o `DATE` do Postgres. */
export function isoDateToDate(value: IsoDate): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function isoDateToDateOrNull(value: IsoDate | null): Date | null {
  return value === null ? null : isoDateToDate(value);
}

/**
 * Saldo do item, na unidade de compra. **Não** é limitado a zero: recebimento
 * acima do pedido acontece em ERP, e um saldo negativo é informação real sobre
 * o que veio a mais. Quem decide se há algo a receber é a comparação com zero,
 * logo abaixo.
 */
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

/** As situações do domínio e do banco têm os mesmos nomes, de propósito. */
export function statusToDb(status: PurchaseOrderStatus): PurchaseOrderStatus {
  return status;
}
