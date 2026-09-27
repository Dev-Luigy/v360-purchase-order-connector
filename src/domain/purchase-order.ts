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

/**
 * Item como o cliente o entrega: quantidade e preço na **unidade de compra**,
 * que pode ser caixa. O fator de conversão vem por item e varia entre itens do
 * mesmo pedido, então não é configuração do cliente (ADR-007).
 */
export interface NormalizedPurchaseOrderItem {
  /** Número da linha no sistema do cliente: 10 e 20 no Alfa, 1 e 2 no Beta. */
  readonly externalLine: number;
  readonly material: string;
  readonly description: string;
  /** Unidade de compra: `"UN"`, `"KG"`, `"CX"`. */
  readonly purchaseUnit: string;
  /** Unidades de consumo por unidade de compra. `"1"` quando não há caixa. */
  readonly conversionFactor: DecimalText;
  readonly quantityOrdered: DecimalText;
  readonly quantityReceived: DecimalText;
  /** Preço por unidade de compra. Nunca por unidade de consumo: a divisão pelo fator pode ser dízima (ADR-007). */
  readonly unitPrice: DecimalText;
  /** Data de criação da linha, quando o cliente a envia separada, como o Delta. */
  readonly lineCreatedOn: IsoDate | null;
}

/**
 * Retrato completo de um pedido produzido por um adaptador, antes de persistir.
 * Não tem identidade interna: quem a resolve é o repositório, por
 * `(clientId, externalNumber)` (ADR-006).
 */
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
  /**
   * `quantityOrdered - quantityReceived`, na unidade de compra. Persistido, e
   * não calculado na consulta, porque comparação entre duas colunas não usa
   * índice (ADR-006).
   */
  readonly quantityPending: DecimalText;
}

/** Pedido persistido, com identidade imutável e rastro de ingestão. */
export interface PurchaseOrder {
  readonly id: string;
  readonly clientId: ClientId;
  readonly externalNumber: string;
  readonly supplier: Supplier;
  readonly currency: CurrencyCode;
  readonly status: PurchaseOrderStatus;
  readonly issuedOn: IsoDate;
  /** Cresce a cada carga aceita deste pedido. Toda conferência guarda a versão que conferiu. */
  readonly ingestionVersion: number;
  readonly ingestedAt: IsoInstant;
  /** Verdadeiro quando algum item ainda tem saldo. Mantido na ingestão e indexado. */
  readonly hasPendingBalance: boolean;
  readonly items: readonly PurchaseOrderItem[];
}

/** Projeção para listagem: sem os itens, com o que a plataforma precisa para decidir se abre o detalhe. */
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
