import type { ClientId, PurchaseOrderStatus } from './client.js';
import type {
  CurrencyCode,
  DecimalText,
  IsoDate,
  IsoInstant,
  TaxId,
} from './primitives.js';

export interface Supplier {
  readonly taxId: TaxId;
  readonly name: string;
}

/** Item normalizado em unidade de compra; o fator varia por item. */
export interface NormalizedPurchaseOrderItem {
  readonly externalLine: number;
  readonly material: string;
  readonly description: string;
  readonly purchaseUnit: string;
  /** Unidades de consumo por unidade de compra. */
  readonly conversionFactor: DecimalText;
  readonly quantityOrdered: DecimalText;
  readonly quantityReceived: DecimalText;
  /** Preço por unidade de compra. */
  readonly unitPrice: DecimalText;
  readonly lineCreatedOn: IsoDate | null;
}

/** Retrato do pedido antes de o repositório resolver sua identidade interna. */
export interface NormalizedPurchaseOrder {
  readonly clientId: ClientId;
  readonly externalNumber: string;
  readonly supplier: Supplier;
  readonly currency: CurrencyCode;
  readonly status: PurchaseOrderStatus;
  readonly issuedOn: IsoDate;
  /**
   * `null` quando a carga não trouxe os itens deste pedido — é o caso do Delta,
   * cujas duas consultas são independentes. Não confundir com `[]`, que é o
   * cliente afirmando que o pedido não tem itens: `null` preserva os itens já
   * conhecidos, `[]` os remove (ADR-008).
   */
  readonly items: readonly NormalizedPurchaseOrderItem[] | null;
}

export interface PurchaseOrderItem extends NormalizedPurchaseOrderItem {
  readonly id: string;
  /** `quantityOrdered - quantityReceived`, na unidade de compra. */
  readonly quantityPending: DecimalText;
}

export interface PurchaseOrder {
  readonly id: string;
  readonly clientId: ClientId;
  readonly externalNumber: string;
  readonly supplier: Supplier;
  readonly currency: CurrencyCode;
  readonly status: PurchaseOrderStatus;
  readonly issuedOn: IsoDate;
  readonly ingestionVersion: number;
  readonly ingestedAt: IsoInstant;
  readonly hasPendingBalance: boolean;
  readonly items: readonly PurchaseOrderItem[];
}

export interface PurchaseOrderSummary {
  readonly id: string;
  readonly clientId: ClientId;
  readonly externalNumber: string;
  readonly supplier: Supplier;
  readonly currency: CurrencyCode;
  readonly status: PurchaseOrderStatus;
  readonly issuedOn: IsoDate;
  readonly itemCount: number;
  readonly pendingItemCount: number;
  readonly hasPendingBalance: boolean;
  readonly ingestionVersion: number;
}
