import { randomUUID } from 'node:crypto';

import type { ClientProfiles } from '../ports/client-profiles.js';
import type { PurchaseOrderRepository } from '../ports/purchase-order-repository.js';
import type { StagingRepository } from '../ports/staging-repository.js';
import type { SourceAdapter, SourcePayload } from '../ports/source-adapter.js';
import type { ClientId, DeliveryFormat } from '../../domain/client.js';
import type {
  IngestionReport,
  RejectedRecord,
  StagedItem,
  StagedRecord,
} from '../../domain/ingestion.js';
import { maxReportedRecords } from '../../domain/limits.js';
import type {
  NormalizedPurchaseOrder,
  NormalizedPurchaseOrderItem,
  PurchaseOrder,
} from '../../domain/purchase-order.js';

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
    private readonly staging: StagingRepository,
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
          // O cabeçalho chegou: itens que esperavam por ele entram agora,
          // sem pedir a carga de novo (ADR-008).
          const completo = await this.reconcile(snapshot);
          // Transação por pedido, não por carga: é o que permite o resto
          // entrar quando um pedido falha na gravação (ADR-008).
          await this.orders.replaceSnapshot(completo);
          ordersAccepted += 1;
          itemsAccepted += completo.items?.length ?? 0;
        } catch (cause) {
          rejected.add({
            reference: `pedido ${snapshot.externalNumber}`,
            reason: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }

      // O adaptador só enxerga os cabeçalhos **desta** carga, então o que ele
      // chama de órfão pode ser item de pedido que já existe no banco — o caso
      // de mandar só a consulta de itens do Delta. Quem sabe disso é aqui.
      const aindaOrfaos: StagedItem[] = [];
      for (const candidato of batch.staged) {
        const existente = await this.orders.findByExternalNumber(
          payload.clientId,
          candidato.externalNumber,
        );
        if (existente === null) {
          aindaOrfaos.push(candidato);
          staged.add(candidato);
          continue;
        }
        try {
          await this.orders.replaceSnapshot(
            applyItem(existente, candidato.item),
          );
          itemsAccepted += 1;
        } catch (cause) {
          rejected.add({
            reference: `item do pedido ${candidato.externalNumber}`,
            reason: cause instanceof Error ? cause.message : String(cause),
          });
        }
      }
      await this.staging.stage(payload.clientId, aindaOrfaos);
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

  /** Traz para o pedido os itens que esperavam pelo cabeçalho dele. */
  private async reconcile(
    snapshot: NormalizedPurchaseOrder,
  ): Promise<NormalizedPurchaseOrder> {
    const esperando = await this.staging.takeFor(
      snapshot.clientId,
      snapshot.externalNumber,
    );
    if (esperando.length === 0) return snapshot;

    // Os itens desta carga mandam: se ela trouxe a linha, a versão em espera
    // está velha. `items: null` significa que a carga não trouxe itens, e aí
    // os que esperavam são tudo o que se sabe.
    const desta = snapshot.items ?? [];
    const linhas = new Set(desta.map((item) => item.externalLine));
    const recuperados = esperando
      .map((staged) => staged.item)
      .filter((item) => !linhas.has(item.externalLine));

    return { ...snapshot, items: [...desta, ...recuperados] };
  }
}

/**
 * Aplica um item avulso a um pedido que já existe, substituindo a linha de
 * mesmo número. O retrato continua completo, que é o que `replaceSnapshot`
 * espera receber.
 */
function applyItem(
  existente: PurchaseOrder,
  item: NormalizedPurchaseOrderItem,
): NormalizedPurchaseOrder {
  const outros = existente.items.filter(
    (atual) => atual.externalLine !== item.externalLine,
  );
  return {
    clientId: existente.clientId,
    externalNumber: existente.externalNumber,
    supplier: existente.supplier,
    currency: existente.currency,
    status: existente.status,
    issuedOn: existente.issuedOn,
    items: [...outros.map(semPersistencia), item],
  };
}

/** Descarta o que a persistência acrescentou, deixando o item do contrato. */
function semPersistencia(
  item: PurchaseOrder['items'][number],
): NormalizedPurchaseOrderItem {
  const { id, quantityPending, ...contrato } = item;
  void id;
  void quantityPending;
  return contrato;
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
