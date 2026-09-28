import type { ClientId, PurchaseOrderStatus } from '../../domain/client.js';
import type { StagedItem } from '../../domain/ingestion.js';
import type { TaxId } from '../../domain/primitives.js';
import type {
  NormalizedPurchaseOrder,
  PurchaseOrder,
  PurchaseOrderSummary,
} from '../../domain/purchase-order.js';
import type { Page, PageRequest } from './pagination.js';

/** O que aconteceu com um item que chegou sem o cabeçalho dele. */
export type LooseItemOutcome = 'aplicado' | 'em-espera';

export interface PurchaseOrderFilters {
  readonly clientId: ClientId | null;
  readonly supplierTaxId: TaxId | null;
  readonly status: PurchaseOrderStatus | null;
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
   *
   * Itens que esperavam por este pedido entram **na mesma transação**. Eles
   * eram consumidos antes, numa transação própria, e uma falha na gravação do
   * pedido os perdia para sempre (REVIEW-09, R09-01).
   */
  replaceSnapshot(snapshot: NormalizedPurchaseOrder): Promise<PurchaseOrder>;

  /**
   * Aplica um item que chegou sem o cabeçalho dele na mesma carga.
   *
   * Se o pedido já existe, a linha é substituída; se não, o item fica
   * esperando. Lock, leitura, decisão e escrita acontecem na mesma transação:
   * ler o pedido fora do lock deixava duas cargas simultâneas lerem o mesmo
   * retrato, e a segunda gravação perdia a primeira (REVIEW-09, R09-06).
   */
  applyLooseItem(
    clientId: ClientId,
    staged: StagedItem,
  ): Promise<LooseItemOutcome>;
  findById(id: string): Promise<PurchaseOrder | null>;
  findByExternalNumber(
    clientId: ClientId,
    externalNumber: string,
  ): Promise<PurchaseOrder | null>;
  list(
    filters: PurchaseOrderFilters,
    page: PageRequest,
  ): Promise<Page<PurchaseOrderSummary>>;
}
