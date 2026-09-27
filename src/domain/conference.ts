import type { ClientId } from './client.js';
import type { DecimalText, IsoInstant, TaxId } from './primitives.js';

/**
 * Linha da nota fiscal. A quantidade vem sempre em **unidade de consumo**:
 * fornecedor nunca fatura em caixa (ADR-007).
 */
export interface InvoiceLine {
  readonly material: string;
  readonly quantity: DecimalText;
  readonly totalValue: DecimalText;
}

/** Nota que a plataforma envia para conferir contra um pedido. */
export interface InvoiceCheckRequest {
  readonly clientId: ClientId;
  readonly purchaseOrderNumber: string;
  readonly supplierTaxId: TaxId;
  readonly lines: readonly InvoiceLine[];
}

/**
 * Taxonomia fechada de divergências. Fechada de propósito: a plataforma precisa
 * mostrar o motivo ao usuário sem interpretar texto livre (ADR-009).
 */
export const divergenceCodes = [
  'FORNECEDOR_DIVERGENTE',
  'PEDIDO_NAO_ABERTO',
  'MATERIAL_NAO_ENCONTRADO',
  'MATERIAL_AMBIGUO',
  'QUANTIDADE_NAO_POSITIVA',
  'QUANTIDADE_ACIMA_DO_SALDO',
  'VALOR_TOTAL_DIVERGENTE',
] as const;

export type DivergenceCode = (typeof divergenceCodes)[number];

export interface Divergence {
  readonly code: DivergenceCode;
  /** Campo do contrato normalizado a que a divergência se refere. */
  readonly field: string;
  /** Índice da linha da nota, começando em 0. `null` quando a divergência é do cabeçalho. */
  readonly invoiceLineIndex: number | null;
  /** Linha do pedido, quando identificada. */
  readonly purchaseOrderLine: number | null;
  readonly expected: string | null;
  readonly received: string | null;
}

export type ConferenceOutcome = 'aprovada' | 'reprovada';

export interface ConferenceResult {
  readonly outcome: ConferenceOutcome;
  readonly divergences: readonly Divergence[];
}

/**
 * Conferência persistida. Guarda a nota conferida e a versão do pedido usada:
 * sem esse retrato, uma reingestão mudaria retroativamente o sentido do
 * histórico e do relatório (ADR-009).
 */
export interface ConferenceRecord extends ConferenceResult {
  readonly id: string;
  readonly purchaseOrderId: string;
  readonly purchaseOrderIngestionVersion: number;
  readonly clientId: ClientId;
  readonly checkedAt: IsoInstant;
  readonly invoice: InvoiceCheckRequest;
}
