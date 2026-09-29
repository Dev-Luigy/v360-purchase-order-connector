import type { ClientId, PurchaseOrderStatus } from '../../domain/client.js';
import type { StagedItem } from '../../domain/ingestion.js';
import type { TaxId } from '../../domain/primitives.js';
import type {
  NormalizedPurchaseOrder,
  PurchaseOrder,
  PurchaseOrderSummary,
} from '../../domain/purchase-order.js';
import type { Page, PageRequest } from './pagination.js';

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
   * Guarda itens que chegaram sem o cabeçalho deles **nesta carga**.
   *
   * Sempre grava, sem decidir nada: a decisão vem depois, em
   * `consolidateStaged`. Separar as duas é o que permite ler em fluxo sem
   * reter a carga em memória e ainda assim ter **uma** transação por pedido —
   * a tabela de espera é o acumulador (REVIEW-11).
   *
   * Reenviar a mesma linha do mesmo pedido substitui a anterior (ADR-008).
   */
  stageLooseItems(
    clientId: ClientId,
    staged: readonly StagedItem[],
  ): Promise<void>;

  /**
   * Fecha um pedido cujos itens estavam esperando.
   *
   * Se o pedido existe, **todos** os itens em espera dele entram num retrato
   * só, sob um lock e uma transação, com um único incremento de versão; se
   * não existe, continuam esperando. Devolve quantos itens foram aplicados.
   */
  consolidateStaged(
    clientId: ClientId,
    externalNumber: string,
  ): Promise<number>;

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
