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
/** O que aconteceu com os itens desta carga para um pedido. */
export interface StagedOutcome {
  /** Entraram no pedido agora. */
  readonly applied: number;
  /** Ficaram esperando pelo cabeçalho, já visíveis para outras cargas. */
  readonly waiting: number;
  /**
   * Amostra do que ficou esperando, tirada **dentro** do mesmo fechamento.
   *
   * Recontar depois de soltar os locks deixava outra requisição consumir uma
   * linha entre o fechamento e a contagem, e ela sumia do relatório da carga
   * que a recebeu (REVIEW-16, R16-02).
   */
  readonly sample: readonly StagedRecord[];
}

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
   * `finalizeStaged`. Separar as duas é o que permite ler em fluxo sem reter a
   * carga em memória e ainda assim ter **uma** transação por pedido — a tabela
   * de espera é o acumulador (REVIEW-11).
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
   * escrito em lotes anteriores (REVIEW-13, R13-03).
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
   * Fecha um pedido desta carga, sob o lock dele.
   *
   * Se o pedido existe, os itens **desta carga** entram num retrato só, com um
   * único incremento de versão. Se não existe, eles são **publicados** ali
   * mesmo — visíveis para a reconciliação de outra carga a partir de então.
   *
   * Decidir as duas coisas na mesma transação é o que fecha a janela: publicar
   * tudo de uma vez e consolidar depois deixava outra requisição consumir uma
   * linha que ainda pertencia ao relatório desta carga, e ela sumia da
   * contabilidade (REVIEW-15, R15-02).
   */
  finalizeStaged(
    clientId: ClientId,
    ingestionId: string,
    externalNumber: string,
  ): Promise<StagedOutcome>;

  /**
   * Descarta tudo o que esta carga deixou, publicado ou não.
   *
   * Uma leitura que falha no meio deixava as linhas já gravadas sem caminho de
   * recuperação, porque elas nascem invisíveis: payload inválido comum virava
   * crescimento permanente da espera (REVIEW-15, R15-01).
   */
  discardIngestion(clientId: ClientId, ingestionId: string): Promise<void>;

  /**
   * Remove espera não publicada que ficou de cargas abandonadas.
   *
   * A compensação cobre a falha que o processo enxerga; uma queda entre
   * gravar e fechar, não. Linha não publicada é invisível por desenho, então
   * sem isto ela ficaria para sempre — e o `catch` não alcança um processo
   * que morreu (REVIEW-15, R15-01).
   *
   * `idadeMinimaMs` precisa ser maior que a carga mais longa possível, senão
   * a limpeza atinge carga ainda ativa.
   */
  discardAbandonedStaging(idadeMinimaMs: number): Promise<number>;

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
