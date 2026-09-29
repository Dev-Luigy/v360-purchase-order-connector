import { randomUUID } from 'node:crypto';

import type { ClientProfiles } from '../ports/client-profiles.js';
import type { PurchaseOrderRepository } from '../ports/purchase-order-repository.js';
import type { SourceAdapter, SourcePayload } from '../ports/source-adapter.js';
import type { ClientId, DeliveryFormat } from '../../domain/client.js';
import type {
  IngestionReport,
  RejectedRecord,
  StagedRecord,
} from '../../domain/ingestion.js';
import { maxReportedRecords, maxStagedOrders } from '../../domain/limits.js';

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
    // O identificador da carga nasce aqui, não no retorno: as linhas que ela
    // grava na espera precisam dele para que outra carga não as consuma
    // (REVIEW-12, R12-02).
    const ingestionId = randomUUID();
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
    // Quantos itens esperam por pedido. Só os números ficam em memória; os
    // itens estão na tabela de espera, que é o acumulador.
    const esperandoPorPedido = new Map<string, number>();
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
      // de mandar só a consulta de itens do Delta.
      //
      // Os itens são **gravados na espera** agora e consolidados uma vez por
      // pedido depois de ler tudo. Decidir lote a lote abria uma transação por
      // lote para o mesmo pedido, porque as linhas dele atravessam lotes
      // (REVIEW-11). A tabela de espera é o acumulador, então nada além dos
      // números de pedido fica em memória.
      if (batch.staged.length > 0) {
        // O teto é conferido **antes** de escrever: conferir depois encerrava
        // a requisição mas deixava no banco justamente as linhas que
        // excederam o limite (REVIEW-12, R12-03).
        const novos = new Set(
          batch.staged
            .map((item) => item.externalNumber)
            .filter((numero) => !esperandoPorPedido.has(numero)),
        );
        if (esperandoPorPedido.size + novos.size > maxStagedOrders) {
          throw new RangeError(
            `carga com mais de ${String(maxStagedOrders)} pedidos em espera; ` +
              'divida o arquivo',
          );
        }

        await this.orders.stageLooseItems(
          payload.clientId,
          ingestionId,
          batch.staged,
        );
        for (const item of batch.staged) {
          const atual = esperandoPorPedido.get(item.externalNumber) ?? 0;
          esperandoPorPedido.set(item.externalNumber, atual + 1);
        }
      }
    }

    // Uma transação por pedido, com todas as linhas que esperavam por ele.
    for (const [externalNumber, total] of esperandoPorPedido) {
      try {
        const aplicados = await this.orders.consolidateStaged(
          payload.clientId,
          ingestionId,
          externalNumber,
        );
        itemsAccepted += aplicados;
        // O que não foi aplicado continua esperando pelo cabeçalho.
        staged.count(total - aplicados);
      } catch (cause) {
        rejected.add({
          reference: `itens do pedido ${externalNumber}`,
          reason: cause instanceof Error ? cause.message : String(cause),
        });
      }
    }
    // A amostra sai do estado que de fato sobrou. Montá-la antes da
    // consolidação e filtrar depois podia devolver lista vazia com total
    // positivo: os cem primeiros candidatos podiam ter sido todos aplicados,
    // escondendo justamente o que ficou (REVIEW-12, R12-05).
    if (staged.total > 0) {
      for (const registro of await this.orders.sampleStaged(
        payload.clientId,
        ingestionId,
        maxReportedRecords,
      )) {
        staged.keep(registro);
      }
    }

    return {
      ingestionId,
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

  /** Conta sem guardar: o total é conhecido antes da amostra. */
  count(quantos: number): void {
    this.counted += quantos;
  }

  /** Guarda sem contar: o total já foi contado por `count`. */
  keep(record: T): void {
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
