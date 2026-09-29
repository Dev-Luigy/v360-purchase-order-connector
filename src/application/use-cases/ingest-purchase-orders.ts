import { randomUUID } from 'node:crypto';

import type { ClientProfiles } from '../ports/client-profiles.js';
import type { PurchaseOrderRepository } from '../ports/purchase-order-repository.js';
import type {
  AdapterBatch,
  SourceAdapter,
  SourcePayload,
} from '../ports/source-adapter.js';
import type { ClientId, DeliveryFormat } from '../../domain/client.js';
import type {
  IngestionReport,
  RejectedRecord,
  StagedItem,
  StagedRecord,
} from '../../domain/ingestion.js';
import {
  maxItemsPerOrder,
  maxReportedRecords,
  maxStagedOrders,
} from '../../domain/limits.js';

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
    // grava na espera precisam dele para que outra carga não as consuma.
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
    // Quais linhas desta carga esperam por pedido, e quais pedidos foram
    // recusados por passar do teto. Só números de linha ficam em memória; os
    // itens estão na tabela de espera, que é o acumulador.
    const linhasPorPedido = new Map<string, Set<number>>();
    const recusados = new Set<string>();
    let ordersAccepted = 0;
    let itemsAccepted = 0;

    // O documento inteiro é conferido **antes** de gravar qualquer coisa: sem
    // isso, um truncamento deixa o prefixo no banco enquanto a resposta diz que
    // o payload é incompatível, sem recibo do que entrou. Custa 1% da carga,
    // medido.
    try {
      await adapter.checkStructure(payload, profile);
    } catch (cause) {
      throw new PayloadError(cause);
    }

    try {
      for await (const batch of comErroDePayload(
        adapter.read(payload, profile),
      )) {
        rejected.addAll(batch.rejected);

        for (const snapshot of batch.orders) {
          try {
            // Itens que esperavam por este pedido entram dentro da mesma
            // transação da gravação.
            const resultado = await this.orders.replaceSnapshot(snapshot);
            ordersAccepted += 1;
            // Só o que esta carga trouxe, mais o que foi recuperado da espera:
            // `order.items.length` incluiria os preservados, e uma carga só de
            // cabeçalhos relataria itens que não vieram.
            itemsAccepted += resultado.fromLoad + resultado.recovered;
          } catch (cause) {
            rejected.add({
              reference: `pedido ${snapshot.externalNumber}`,
              reason: cause instanceof Error ? cause.message : String(cause),
            });
          }
        }

        // O adaptador só enxerga os cabeçalhos **desta** carga, então o que ele
        // chama de órfão pode ser item de pedido que já existe no banco — o
        // caso de mandar só a consulta de itens do Delta.
        //
        // Os itens são **gravados na espera** agora e consolidados uma vez por
        // pedido depois de ler tudo. Decidir lote a lote abriria uma transação
        // por lote para o mesmo pedido, porque as linhas dele atravessam lotes.
        // A tabela de espera é o acumulador, então nada além dos números de
        // pedido fica em memória.
        if (batch.staged.length > 0) {
          // O teto de itens por pedido é do **agregado**, e só aqui se conhece
          // a soma entre lotes: o adaptador vê um lote por vez. Um pedido que
          // passa do teto é recusado e o que ele já tinha escrito é desfeito,
          // senão a carga diz "pedido inteiro recusado" e grava os primeiros
          // dez mil assim mesmo.
          const aceitos: StagedItem[] = [];
          for (const item of batch.staged) {
            const numero = item.externalNumber;
            if (recusados.has(numero)) continue;

            const linhas = linhasPorPedido.get(numero) ?? new Set<number>();
            if (
              !linhas.has(item.item.externalLine) &&
              linhas.size >= maxItemsPerOrder
            ) {
              recusados.add(numero);
              linhasPorPedido.delete(numero);
              await this.orders.purgeStaged(
                payload.clientId,
                ingestionId,
                numero,
              );
              rejected.add({
                reference: numero,
                reason:
                  `mais de ${String(maxItemsPerOrder)} itens sem cabeçalho; ` +
                  'o pedido inteiro foi recusado e o que já esperava foi descartado',
              });
              continue;
            }
            linhas.add(item.item.externalLine);
            linhasPorPedido.set(numero, linhas);
            aceitos.push(item);
          }

          // Um pedido pode estourar **no meio deste lote**, e os itens dele
          // percorridos antes disso ficam em `aceitos`: sem esta segunda
          // passagem, a purga apaga o que os lotes anteriores gravaram e estes
          // são regravados logo em seguida.
          const paraGravar = aceitos.filter(
            (item) => !recusados.has(item.externalNumber),
          );

          if (paraGravar.length > 0) {
            // O teto de pedidos distintos é conferido **antes** de escrever.
            if (linhasPorPedido.size > maxStagedOrders) {
              throw new RangeError(
                `carga com mais de ${String(maxStagedOrders)} pedidos em espera; ` +
                  'divida o arquivo',
              );
            }
            await this.orders.stageLooseItems(
              payload.clientId,
              ingestionId,
              paraGravar,
            );
          }
        }
      }
    } catch (cause) {
      // A leitura falhou no meio. As linhas já gravadas nascem invisíveis e não
      // teriam caminho de recuperação: payload inválido comum viraria
      // crescimento permanente da espera.
      await this.orders.discardIngestion(payload.clientId, ingestionId);
      throw cause;
    }

    // Cada pedido é fechado sob o lock dele: ou os itens desta carga entram, ou
    // são publicados ali mesmo. Publicar tudo antes e consolidar depois
    // deixaria outra requisição consumir uma linha que ainda pertence a este
    // relatório.
    for (const externalNumber of linhasPorPedido.keys()) {
      try {
        const destino = await this.orders.finalizeStaged(
          payload.clientId,
          ingestionId,
          externalNumber,
        );
        itemsAccepted += destino.applied;
        // Contagem e amostra vêm do mesmo fechamento que publicou as linhas:
        // recontar depois de soltar os locks deixa outra requisição consumir
        // uma linha no intervalo, e ela some deste relatório.
        staged.count(destino.waiting);
        for (const registro of destino.sample) staged.keep(registro);
      } catch (cause) {
        // Fechar falhou: a linha ficaria invisível no banco, sem ninguém para
        // reconciliá-la e sem aparecer no relatório. É descartada aqui, e a
        // recusa explica o evento **uma vez**.
        await this.orders
          .purgeStaged(payload.clientId, ingestionId, externalNumber)
          .catch(() => undefined);
        rejected.add({
          reference: `itens do pedido ${externalNumber}`,
          reason:
            `${cause instanceof Error ? cause.message : String(cause)}; ` +
            'os itens desta carga foram descartados, reenvie',
        });
      }
    }

    // Invariante: carga terminada não deixa linha não publicada. Fechar um
    // pedido pode falhar, e sem isto a linha fica invisível no banco enquanto o
    // relatório diz que nada esperava — mentira dos dois lados.
    const invisiveis = await this.orders.discardUnpublished(
      payload.clientId,
      ingestionId,
    );
    // Rede de segurança: normalmente é zero, porque o `catch` acima já
    // descartou. Se sobrar algo, é sinal de caminho não previsto, e o relatório
    // precisa dizer em vez de deixar a linha invisível no banco.
    if (invisiveis > 0) {
      rejected.add({
        reference: `${String(invisiveis)} item(ns) sem pedido fechado`,
        reason: 'itens descartados por não terem sido fechados; reenvie',
      });
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

/**
 * Erro do leitor de payload, para a borda responder 422 em vez de 500.
 *
 * O parser em fluxo lança `Error` comum, que `toProblem` trataria como defeito
 * interno: JSON truncado — payload inválido corriqueiro — viraria
 * `erro_interno`.
 */
export class PayloadError extends Error {
  constructor(cause: unknown) {
    super(
      `carga malformada: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = 'PayloadError';
  }
}

/**
 * Reclassifica o que vier **do leitor**. Erro do corpo do laço não passa por
 * aqui: quando ele lança, o `for await` chama `return()` no iterador, e o `try`
 * abaixo vê um encerramento, não uma exceção.
 */
async function* comErroDePayload(
  batches: AsyncIterable<AdapterBatch>,
): AsyncIterable<AdapterBatch> {
  try {
    yield* batches;
  } catch (cause) {
    throw new PayloadError(cause);
  }
}
