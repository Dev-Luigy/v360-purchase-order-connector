import type {
  Page,
  PageRequest,
} from '../../src/application/ports/pagination.js';
import type {
  PurchaseOrderFilters,
  PurchaseOrderRepository,
} from '../../src/application/ports/purchase-order-repository.js';
import type { ClientId } from '../../src/domain/client.js';
import { Decimal, quantityScale } from '../../src/domain/decimal.js';
import type {
  NormalizedPurchaseOrder,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderSummary,
} from '../../src/domain/purchase-order.js';

/**
 * Repositório em memória, para exercitar caso de uso e rota sem banco.
 *
 * **Não substitui o teste de integração**: transação, advisory lock, `CHECK` e
 * plano de consulta só se provam contra PostgreSQL real, que é ENV-03. O que
 * ele prova é a cadeia adaptador → caso de uso → rota, que hoje não teria
 * nenhuma cobertura sem ele.
 *
 * Reproduz de propósito as duas semânticas que mais importam: identidade
 * preservada com versão incrementada, e `items: null` preservando os itens
 * conhecidos enquanto `[]` os remove (ADR-008).
 */
export class InMemoryPurchaseOrderRepository implements PurchaseOrderRepository {
  private readonly byKey = new Map<string, PurchaseOrder>();
  private sequence = 0;

  replaceSnapshot(snapshot: NormalizedPurchaseOrder): Promise<PurchaseOrder> {
    const key = `${snapshot.clientId}:${snapshot.externalNumber}`;
    const existing = this.byKey.get(key);

    const items =
      snapshot.items === null
        ? (existing?.items ?? [])
        : snapshot.items.map((item, index): PurchaseOrderItem => ({
            ...item,
            id: `item-${String(this.sequence)}-${String(index)}`,
            quantityPending: Decimal.parse(item.quantityOrdered)
              .subtract(Decimal.parse(item.quantityReceived))
              .toText(quantityScale),
          }));

    this.sequence += 1;
    const saved: PurchaseOrder = {
      id: existing?.id ?? `order-${String(this.sequence)}`,
      clientId: snapshot.clientId,
      externalNumber: snapshot.externalNumber,
      supplier: snapshot.supplier,
      currency: snapshot.currency,
      status: snapshot.status,
      issuedOn: snapshot.issuedOn,
      ingestionVersion: (existing?.ingestionVersion ?? 0) + 1,
      ingestedAt: new Date().toISOString(),
      hasPendingBalance: items.some(
        (item) => Decimal.parse(item.quantityPending).isPositive,
      ),
      items,
    };
    this.byKey.set(key, saved);
    return Promise.resolve(saved);
  }

  findById(id: string): Promise<PurchaseOrder | null> {
    return Promise.resolve(
      [...this.byKey.values()].find((order) => order.id === id) ?? null,
    );
  }

  findByExternalNumber(
    clientId: ClientId,
    externalNumber: string,
  ): Promise<PurchaseOrder | null> {
    return Promise.resolve(
      this.byKey.get(`${clientId}:${externalNumber}`) ?? null,
    );
  }

  list(
    filters: PurchaseOrderFilters,
    page: PageRequest,
  ): Promise<Page<PurchaseOrderSummary>> {
    const todos = [...this.byKey.values()]
      .filter(
        (order) =>
          (filters.clientId === null || order.clientId === filters.clientId) &&
          (filters.supplierTaxId === null ||
            order.supplier.taxId === filters.supplierTaxId) &&
          (filters.status === null || order.status === filters.status) &&
          (!filters.onlyPending || order.hasPendingBalance),
      )
      .sort((a, b) => a.id.localeCompare(b.id));

    const visible = todos.slice(0, page.limit);
    return Promise.resolve({
      data: visible.map((order): PurchaseOrderSummary => ({
        id: order.id,
        clientId: order.clientId,
        externalNumber: order.externalNumber,
        supplier: order.supplier,
        currency: order.currency,
        status: order.status,
        issuedOn: order.issuedOn,
        itemCount: order.items.length,
        pendingItemCount: order.items.filter(
          (item) => Decimal.parse(item.quantityPending).isPositive,
        ).length,
        hasPendingBalance: order.hasPendingBalance,
        ingestionVersion: order.ingestionVersion,
      })),
      page: {
        limit: page.limit,
        cursor: page.cursor,
        nextCursor: null,
        hasMore: todos.length > page.limit,
      },
    });
  }

  /** Só para os testes: quantos pedidos estão guardados. */
  get size(): number {
    return this.byKey.size;
  }
}
