import type { ClientId, PurchaseOrderStatus } from '../../domain/client.js';
import type { StagedItem, StagedRecord } from '../../domain/ingestion.js';
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
  /**
   * Número do pedido no sistema do cliente.
   *
   * A plataforma conhece esse número — é por ele que ela identifica o pedido
   * na conferência —, e sem este filtro a única forma de achar um pedido
   * conhecido era varrer a consulta inteira.
   */
  readonly externalNumber: string | null;
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
   *
   * `ingestionId` separa os dois papéis da tabela: acumular **desta** carga e
   * guardar órfão de qualquer carga. Sem ele, duas cargas simultâneas do mesmo
   * pedido consumiam uma a da outra (REVIEW-12, R12-02).
   */
  stageLooseItems(
    clientId: ClientId,
    ingestionId: string,
    staged: readonly StagedItem[],
  ): Promise<void>;

  /**
   * Descarta as linhas que esta carga deixou esperando por um pedido.
   *
   * Um pedido recusado por passar do teto precisa desfazer o que já tinha
   * escrito em lotes anteriores: sem isso, a carga dizia "pedido inteiro
   * recusado" e mesmo assim gravava os primeiros dez mil itens
   * (REVIEW-13, R13-03).
   */
  purgeStaged(
    clientId: ClientId,
    ingestionId: string,
    externalNumber: string,
  ): Promise<void>;

  /**
   * Quantas linhas desta carga continuam esperando.
   *
   * O relatório sai daqui, do estado, e não de `entradas − aplicados`:
   * subtrair contagens de granularidades diferentes fabricava espera que não
   * existia, porque uma linha reenviada dentro da mesma carga substitui a
   * anterior em vez de somar (REVIEW-13, R13-02).
   */
  countStaged(clientId: ClientId, ingestionId: string): Promise<number>;

  /**
   * Torna visível o que esta carga deixou esperando.
   *
   * Enquanto a carga lê os lotes, as linhas dela ficam invisíveis para a
   * reconciliação de outra requisição. Sem isso, um cabeçalho concorrente
   * consumia o prefixo de uma carga ainda em andamento — e se ela depois
   * recusasse o pedido por passar do teto, o consumido não voltava
   * (REVIEW-14, R14-01).
   */
  publishStaged(clientId: ClientId, ingestionId: string): Promise<void>;

  /**
   * Fecha um pedido cujos itens estavam esperando.
   *
   * Se o pedido existe, os itens **desta carga** que esperavam por ele entram
   * num retrato só, sob um lock e uma transação, com um único incremento de
   * versão; se não existe, continuam esperando. Devolve quantos foram
   * aplicados.
   *
   * Leva só o que é da própria carga: levar o que outra gravou fazia os dois
   * relatórios mentirem. Órfão de carga anterior sai daqui pela reconciliação
   * do cabeçalho, em `replaceSnapshot`.
   */
  consolidateStaged(
    clientId: ClientId,
    ingestionId: string,
    externalNumber: string,
  ): Promise<number>;

  /**
   * Amostra do que **continua** esperando por conta desta carga.
   *
   * A amostra era montada antes da consolidação e filtrada depois, então podia
   * sair vazia com total positivo: os cem primeiros candidatos podiam ter sido
   * todos aplicados, escondendo justamente o que ficou (REVIEW-12, R12-05).
   * Agora sai do estado que de fato sobrou.
   */
  sampleStaged(
    clientId: ClientId,
    ingestionId: string,
    limite: number,
  ): Promise<readonly StagedRecord[]>;

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
