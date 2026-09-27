import type { ClientId, PurchaseOrderStatus } from '../../domain/client.js';
import type { TaxId } from '../../domain/primitives.js';
import type {
  NormalizedPurchaseOrder,
  PurchaseOrder,
  PurchaseOrderSummary,
} from '../../domain/purchase-order.js';
import type { Page, PageRequest } from './pagination.js';

/** Filtros do requisito 1, combináveis entre si e com a paginação. */
export interface PurchaseOrderFilters {
  readonly clientId: ClientId | null;
  readonly supplierTaxId: TaxId | null;
  readonly status: PurchaseOrderStatus | null;
  /** Apenas pedidos com algum item com saldo a receber. */
  readonly onlyPending: boolean;
}

export interface PurchaseOrderRepository {
  /**
   * Substitui o retrato do pedido em uma transação, preservando a identidade
   * interna, incrementando a versão de ingestão e recalculando o saldo. Cargas
   * concorrentes do mesmo pedido são serializadas pela implementação.
   *
   * `snapshot.items === null` atualiza apenas o cabeçalho e **preserva** os
   * itens já conhecidos: é a carga de cabeçalhos do Delta, que não pode apagar
   * o que a outra consulta trouxe (ADR-008).
   */
  replaceSnapshot(snapshot: NormalizedPurchaseOrder): Promise<PurchaseOrder>;
  findById(id: string): Promise<PurchaseOrder | null>;
  findByExternalNumber(
    clientId: ClientId,
    externalNumber: string,
  ): Promise<PurchaseOrder | null>;
  /** Listagem sem itens: o detalhe por item é o endpoint de detalhe. */
  list(
    filters: PurchaseOrderFilters,
    page: PageRequest,
  ): Promise<Page<PurchaseOrderSummary>>;
}
