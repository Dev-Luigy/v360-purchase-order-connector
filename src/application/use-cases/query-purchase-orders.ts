import { defaultPageLimit, type Page } from '../ports/pagination.js';
import type {
  PurchaseOrderFilters,
  PurchaseOrderRepository,
} from '../ports/purchase-order-repository.js';
import type { PurchaseOrderStatus } from '../../domain/client.js';
import type {
  PurchaseOrder,
  PurchaseOrderSummary,
} from '../../domain/purchase-order.js';

/**
 * Consulta de pedidos, o requisito 1 do enunciado.
 *
 * Os filtros são todos opcionais e combináveis, e o caso de uso é quem aplica
 * o tamanho de página padrão: a borda HTTP traduz a requisição, não decide
 * política (ADR-010).
 */
export interface PurchaseOrderQuery {
  readonly clientId?: string | undefined;
  readonly supplierTaxId?: string | undefined;
  readonly status?: PurchaseOrderStatus | undefined;
  readonly pending?: boolean | undefined;
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
}

export class ListPurchaseOrders {
  constructor(private readonly orders: PurchaseOrderRepository) {}

  execute(query: PurchaseOrderQuery): Promise<Page<PurchaseOrderSummary>> {
    const filters: PurchaseOrderFilters = {
      clientId: query.clientId ?? null,
      supplierTaxId: query.supplierTaxId ?? null,
      status: query.status ?? null,
      // Ausente é "não filtrar", não "filtrar por falso": um pedido sem saldo
      // continua aparecendo quando ninguém pediu o contrário.
      onlyPending: query.pending === true,
    };
    return this.orders.list(filters, {
      limit: query.limit ?? defaultPageLimit,
      cursor: query.cursor ?? null,
    });
  }
}

export class GetPurchaseOrder {
  constructor(private readonly orders: PurchaseOrderRepository) {}

  execute(id: string): Promise<PurchaseOrder | null> {
    return this.orders.findById(id);
  }
}
