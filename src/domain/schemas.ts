import { z } from 'zod';

import { divergenceCodes, type InvoiceCheckRequest } from './conference.js';
import type { NormalizedPurchaseOrder } from './purchase-order.js';

/**
 * O contrato normalizado expresso em schema, não só em tipo.
 *
 * O tipo some na compilação; o schema sobrevive e vale na borda de ingestão,
 * onde o dado vem do ERP de outra empresa. Validar a **saída** do adaptador
 * garante que defeito de mapeamento vira rejeição com caminho do campo, em vez
 * de linha torta persistida (ADR-011).
 */

/** Decimal como texto, a mesma gramática que `Decimal.parse` aceita (ADR-007). */
export const decimalTextSchema = z
  .string()
  .regex(/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/, 'decimal fora do contrato');

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'data fora de aaaa-mm-dd');

export const isoInstantSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    'instante fora de ISO UTC',
  );

/** CNPJ com 14 dígitos, sem máscara. Dígito verificador não é conferido: o dado é do ERP do cliente e recusar por checksum criaria rejeição que ninguém corrige do nosso lado. */
export const taxIdSchema = z
  .string()
  .regex(/^\d{14}$/, 'CNPJ fora de 14 dígitos');

export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'moeda fora de ISO 4217');

export const purchaseOrderStatusSchema = z.enum([
  'aberto',
  'encerrado',
  'bloqueado',
]);

export const supplierSchema = z.object({
  taxId: taxIdSchema,
  name: z.string().min(1, 'razão social vazia'),
});

export const normalizedItemSchema = z.object({
  externalLine: z.int(),
  material: z.string().min(1, 'material vazio'),
  description: z.string(),
  purchaseUnit: z.string().min(1, 'unidade vazia'),
  conversionFactor: decimalTextSchema,
  quantityOrdered: decimalTextSchema,
  quantityReceived: decimalTextSchema,
  unitPrice: decimalTextSchema,
  lineCreatedOn: isoDateSchema.nullable(),
});

export const normalizedOrderSchema = z.object({
  clientId: z.string().min(1, 'cliente vazio'),
  externalNumber: z.string().min(1, 'número do pedido vazio'),
  supplier: supplierSchema,
  currency: currencySchema,
  status: purchaseOrderStatusSchema,
  issuedOn: isoDateSchema,
  /**
   * `null` é carga que não trouxe os itens e preserva os conhecidos; `[]` é o
   * cliente afirmando que não há itens, e remove (ADR-008). São coisas
   * diferentes e o schema mantém as duas possíveis de propósito.
   */
  items: z.array(normalizedItemSchema).nullable(),
});

/** Nota fiscal como a plataforma envia. Usado na borda HTTP, em P1-04. */
export const invoiceCheckRequestSchema = z.object({
  clientId: z.string().min(1),
  purchaseOrderNumber: z.string().min(1),
  supplierTaxId: z.string().min(1),
  lines: z
    .array(
      z.object({
        material: z.string().min(1),
        quantity: decimalTextSchema,
        totalValue: decimalTextSchema,
      }),
    )
    .min(1, 'nota sem linhas'),
});

export const divergenceCodeSchema = z.enum(divergenceCodes);

/** Mensagem curta e com caminho, para virar `RejectedRecord.reason`. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path === '' ? issue.message : `${path}: ${issue.message}`;
    })
    .join('; ');
}

/**
 * Trava de deriva: se o schema e o tipo do contrato se separarem, isto para de
 * compilar. Sem ela, `normalizedOrderSchema` viraria documentação desatualizada
 * em vez de validação.
 */
const _schemaMatchesContract: NormalizedPurchaseOrder =
  null as unknown as z.infer<typeof normalizedOrderSchema>;
const _invoiceMatchesContract: InvoiceCheckRequest = null as unknown as z.infer<
  typeof invoiceCheckRequestSchema
>;
void _schemaMatchesContract;
void _invoiceMatchesContract;
