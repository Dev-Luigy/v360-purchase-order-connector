import type { ClientId, PurchaseOrderStatus } from '../../domain/client.js';
import type { StagedItem } from '../../domain/ingestion.js';
import type { TaxId } from '../../domain/primitives.js';
import type {
  NormalizedPurchaseOrder,
  PurchaseOrder,
  PurchaseOrderSummary,
} from '../../domain/purchase-order.js';
import type { Page, PageRequest } from './pagination.js';

/** O que aconteceu com os itens que chegaram sem o cabeçalho deles. */
export type LooseItemOutcome = 'aplicado' | 'em-espera';

/**
 * Quantos itens a gravação de fato aplicou, separados por origem.
 *
 * Somar `order.items.length` contava também os itens **preservados** de cargas
 * anteriores, então uma carga só de cabeçalhos relatava itens que ela não
 * trouxe (REVIEW-10, R10-02). Quem chama precisa distinguir as três origens.
 */
export interface SnapshotResult {
  readonly order: PurchaseOrder;
  /** Vieram nesta carga. Zero quando `items` é `null`. */
  readonly fromLoad: number;
  /** Estavam esperando pelo cabeçalho e entraram agora. */
  readonly recovered: number;
}

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
  replaceSnapshot(snapshot: NormalizedPurchaseOrder): Promise<SnapshotResult>;

  /**
   * Aplica **todos** os itens avulsos de um mesmo pedido de uma vez.
   *
   * Se o pedido já existe, as linhas são substituídas; se não, os itens ficam
   * esperando. Lock, leitura, decisão e escrita acontecem na mesma transação:
   * ler o pedido fora do lock deixava duas cargas simultâneas lerem o mesmo
   * retrato, e a segunda gravação perdia a primeira (REVIEW-09, R09-06).
   *
   * Recebe o grupo, e não uma linha por vez, porque uma transação por linha
   * contradiz a transação por pedido do ADR-008: a versão avançava por linha,
   * uma falha no meio deixava o retrato pela metade, e regravar o pedido
   * inteiro a cada linha custava O(n²) (REVIEW-10, R10-01).
   */
  applyLooseItems(
    clientId: ClientId,
    externalNumber: string,
    staged: readonly StagedItem[],
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
