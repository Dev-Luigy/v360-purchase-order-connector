import { z } from 'zod';

import { Decimal, quantityScale } from '../../domain/decimal.js';
import {
  maxClientIdLength,
  maxExternalNumberLength,
} from '../../domain/limits.js';
import type {
  PurchaseOrder,
  PurchaseOrderItem,
} from '../../domain/purchase-order.js';
import {
  currencySchema,
  isoDateSchema,
  isoInstantSchema,
  persistedDecimalSchema,
  persistedText,
  purchaseOrderStatusSchema,
  supplierSchema,
} from '../../domain/schemas.js';

/**
 * Schemas da resposta HTTP.
 *
 * Separados dos schemas do domínio de propósito: uma resposta pode ter campo
 * derivado que o contrato persistido não tem. O detalhe do pedido é o caso —
 * ele entrega o saldo também na unidade de consumo, que é a unidade em que a
 * nota fiscal fala, e que o banco não guarda porque é cálculo (ADR-007).
 */

export const pageInfoSchema = z.object({
  limit: z.int().positive(),
  cursor: z.string().nullable(),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export function pagedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ data: z.array(item), page: pageInfoSchema });
}

export const purchaseOrderSummarySchema = z.object({
  id: z.string().min(1),
  clientId: persistedText(maxClientIdLength).min(1),
  externalNumber: persistedText(maxExternalNumberLength).min(1),
  supplier: supplierSchema,
  currency: currencySchema,
  status: purchaseOrderStatusSchema,
  issuedOn: isoDateSchema,
  itemCount: z.int().nonnegative(),
  pendingItemCount: z.int().nonnegative(),
  hasPendingBalance: z.boolean(),
  ingestionVersion: z.int().positive(),
});

export const purchaseOrderItemViewSchema = z.object({
  id: z.string().min(1),
  externalLine: z.int().nonnegative(),
  material: z.string().min(1),
  description: z.string(),
  purchaseUnit: z.string().min(1),
  conversionFactor: persistedDecimalSchema,
  quantityOrdered: persistedDecimalSchema,
  quantityReceived: persistedDecimalSchema,
  /** Saldo na unidade de compra, como o pedido foi feito. */
  quantityPending: persistedDecimalSchema,
  /**
   * O mesmo saldo na unidade de consumo. Fornecedor não fatura em caixa, então
   * é nesta unidade que a conferência compara (ADR-007). Vai calculado para a
   * plataforma não ter que refazer a conversão e errar o fator.
   */
  quantityPendingInConsumptionUnit: persistedDecimalSchema,
  unitPrice: persistedDecimalSchema,
  lineCreatedOn: isoDateSchema.nullable(),
});

export const purchaseOrderDetailSchema = z.object({
  id: z.string().min(1),
  clientId: persistedText(maxClientIdLength).min(1),
  externalNumber: persistedText(maxExternalNumberLength).min(1),
  supplier: supplierSchema,
  currency: currencySchema,
  status: purchaseOrderStatusSchema,
  issuedOn: isoDateSchema,
  ingestionVersion: z.int().positive(),
  ingestedAt: isoInstantSchema,
  hasPendingBalance: z.boolean(),
  items: z.array(purchaseOrderItemViewSchema),
});

export type PurchaseOrderDetail = z.infer<typeof purchaseOrderDetailSchema>;

export function toPurchaseOrderDetail(
  order: PurchaseOrder,
): PurchaseOrderDetail {
  return {
    id: order.id,
    clientId: order.clientId,
    externalNumber: order.externalNumber,
    supplier: { ...order.supplier },
    currency: order.currency,
    status: order.status,
    issuedOn: order.issuedOn,
    ingestionVersion: order.ingestionVersion,
    ingestedAt: order.ingestedAt,
    hasPendingBalance: order.hasPendingBalance,
    items: order.items.map(toItemView),
  };
}

function toItemView(
  item: PurchaseOrderItem,
): z.infer<typeof purchaseOrderItemViewSchema> {
  return {
    id: item.id,
    externalLine: item.externalLine,
    material: item.material,
    description: item.description,
    purchaseUnit: item.purchaseUnit,
    conversionFactor: item.conversionFactor,
    quantityOrdered: item.quantityOrdered,
    quantityReceived: item.quantityReceived,
    quantityPending: item.quantityPending,
    quantityPendingInConsumptionUnit: Decimal.parse(item.quantityPending)
      .multiply(Decimal.parse(item.conversionFactor))
      .toText(quantityScale),
    unitPrice: item.unitPrice,
    lineCreatedOn: item.lineCreatedOn,
  };
}
