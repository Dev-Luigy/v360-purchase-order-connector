import type { StagedItem } from '../../domain/ingestion.js';
import type { ClientId } from '../../domain/client.js';

/**
 * Itens que chegaram antes do cabeçalho deles.
 *
 * O Delta entrega pedidos e itens em duas consultas independentes, sem garantia
 * de retratarem o mesmo instante: um lado pode conhecer um pedido que o outro
 * ainda não conhece (ADR-008). O item espera aqui, em vez de virar pedido
 * inventado — sem fornecedor e sem situação, um pedido assim nunca poderia ser
 * conferido — e é reconciliado quando o cabeçalho chega numa carga seguinte.
 */
export interface StagingRepository {
  /**
   * Guarda os itens em espera. Reenviar a mesma linha do mesmo pedido
   * substitui a anterior: a carga mais recente é a que vale (ADR-008).
   */
  stage(clientId: ClientId, items: readonly StagedItem[]): Promise<void>;

  /** Remove e devolve os itens em espera do pedido, em uma operação só. */
  takeFor(
    clientId: ClientId,
    externalNumber: string,
  ): Promise<readonly StagedItem[]>;
}
