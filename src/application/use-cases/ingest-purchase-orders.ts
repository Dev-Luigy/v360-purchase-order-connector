import { randomUUID } from 'node:crypto';

import type { ClientProfiles } from '../ports/client-profiles.js';
import type { PurchaseOrderRepository } from '../ports/purchase-order-repository.js';
import type { SourceAdapter, SourcePayload } from '../ports/source-adapter.js';
import type { ClientId, DeliveryFormat } from '../../domain/client.js';
import type {
  IngestionReport,
  RejectedRecord,
  StagedItem,
  StagedRecord,
} from '../../domain/ingestion.js';
import { maxReportedRecords } from '../../domain/limits.js';

/**
 * Carga de pedidos de um cliente.
 *
 * O caso de uso não conhece HTTP nem formato: recebe as partes da carga,
 * descobre o perfil do cliente, escolhe o adaptador pela **forma de entrega**
 * declarada no perfil e persiste pedido a pedido (ADR-008).
 *
 * Aceitação parcial é por pedido: um registro inválido não derruba a carga, o
 * resto entra e o relatório devolve cada rejeitado com referência e motivo.
 */
export class IngestPurchaseOrders {
  constructor(
    private readonly profiles: ClientProfiles,
    private readonly adapters: ReadonlyMap<DeliveryFormat, SourceAdapter>,
    private readonly orders: PurchaseOrderRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(payload: SourcePayload): Promise<IngestionReport> {
    const startedAt = this.now();
    const profile = await this.profiles.find(payload.clientId);
    if (profile === null) {
      throw new UnknownClientError(payload.clientId);
    }

    const adapter = this.adapters.get(profile.deliveryFormat);
    if (adapter === undefined) {
      throw new Error(
        `nenhum adaptador registrado para a forma ${profile.deliveryFormat}`,
      );
    }

    const rejected = new Sample<RejectedRecord>();
    const staged = new Sample<StagedRecord>();
    let ordersAccepted = 0;
    let itemsAccepted = 0;

    for await (const batch of adapter.read(payload, profile)) {
      rejected.addAll(batch.rejected);

      for (const snapshot of batch.orders) {
        try {
          // Itens que esperavam por este pedido entram dentro da mesma
          // transação da gravação (R09-01).
          const resultado = await this.orders.replaceSnapshot(snapshot);
          ordersAccepted += 1;
          // Só o que esta carga trouxe, mais o que foi recuperado da espera.
          // Somar `order.items.length` contava também os preservados, e uma
          // carga só de cabeçalhos relatava itens que não vieram (R10-02).
          itemsAccepted += resultado.fromLoad + resultado.recovered;
        } catch (cause) {
          rejected.add({
            reference: `pedido ${snapshot.externalNumber}`,
            reason: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }

      // O adaptador só enxerga os cabeçalhos **desta** carga, então o que ele
      // chama de órfão pode ser item de pedido que já existe no banco — o caso
      // de mandar só a consulta de itens do Delta. Quem decide é o
      // repositório, sob o lock e numa transação só (R09-06).
      //
      // Agrupados por pedido: uma transação por linha fazia a versão avançar
      // por linha e deixava retrato parcial quando a segunda falhava (R10-01).
      for (const [externalNumber, grupo] of agruparPorPedido(batch.staged)) {
        try {
          const destino = await this.orders.applyLooseItems(
            payload.clientId,
            externalNumber,
            grupo,
          );
          if (destino === 'aplicado') itemsAccepted += grupo.length;
          else for (const item of grupo) staged.add(item);
        } catch (cause) {
          rejected.add({
            reference: `itens do pedido ${externalNumber}`,
            reason: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
    }

    return {
      ingestionId: randomUUID(),
      clientId: payload.clientId,
      formatVersion: payload.formatVersion,
      startedAt: startedAt.toISOString(),
      finishedAt: this.now().toISOString(),
      ordersAccepted,
      itemsAccepted,
      rejected: rejected.sample,
      rejectedTotal: rejected.total,
      staged: staged.sample,
      stagedTotal: staged.total,
    };
  }
}

/**
 * Agrupa os itens avulsos por pedido, preservando a ordem de chegada. Um
 * `Map` já faz isso: a inserção define a ordem da iteração.
 */
function agruparPorPedido(
  staged: readonly StagedItem[],
): ReadonlyMap<string, readonly StagedItem[]> {
  const porPedido = new Map<string, StagedItem[]>();
  for (const item of staged) {
    const atual = porPedido.get(item.externalNumber);
    if (atual === undefined) porPedido.set(item.externalNumber, [item]);
    else atual.push(item);
  }
  return porPedido;
}

/**
 * Guarda os primeiros registros e conta o resto. Acumular tudo para depois
 * cortar gastaria a memória que o corte existe para poupar.
 */
class Sample<T> {
  private readonly kept: T[] = [];
  private counted = 0;

  add(record: T): void {
    this.counted += 1;
    if (this.kept.length < maxReportedRecords) this.kept.push(record);
  }

  addAll(records: readonly T[]): void {
    for (const record of records) this.add(record);
  }

  get sample(): readonly T[] {
    return this.kept;
  }

  get total(): number {
    return this.counted;
  }
}

/** Cliente sem perfil: a borda traduz para 404, não para 500. */
export class UnknownClientError extends Error {
  constructor(readonly clientId: ClientId) {
    super(`cliente desconhecido: ${clientId}`);
    this.name = 'UnknownClientError';
  }
}
