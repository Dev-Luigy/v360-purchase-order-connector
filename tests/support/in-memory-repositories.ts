import type {
  Page,
  PageRequest,
} from '../../src/application/ports/pagination.js';
import type {
  PurchaseOrderFilters,
  PurchaseOrderRepository,
  SnapshotResult,
  StagedOutcome,
} from '../../src/application/ports/purchase-order-repository.js';
import type { ClientId } from '../../src/domain/client.js';
import {
  decodeCursor,
  encodeCursor,
  fingerprintOf,
} from '../../src/infrastructure/database/cursor.js';
import { assertPageLimit } from '../../src/infrastructure/database/purchase-order-repository.js';
import { Decimal, quantityScale } from '../../src/domain/decimal.js';
import {
  mergeWaitingItems,
  semPersistencia,
  type StagedItem,
  type StagedRecord,
} from '../../src/domain/ingestion.js';
import { maxReportedRecords } from '../../src/domain/limits.js';
import {
  normalizedItemSchema,
  normalizedOrderSchema,
} from '../../src/domain/schemas.js';
import type {
  NormalizedPurchaseOrder,
  NormalizedPurchaseOrderItem,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderSummary,
} from '../../src/domain/purchase-order.js';

/**
 * Repositório em memória, para exercitar caso de uso e rota sem banco.
 *
 * **Não substitui o teste de integração**: transação, advisory lock, `CHECK` e
 * plano de consulta só se provam contra PostgreSQL real, que é ENV-03. O que
 * ele prova é a cadeia adaptador → caso de uso → rota, que hoje não teria
 * nenhuma cobertura sem ele.
 *
 * Reproduz de propósito as duas semânticas que mais importam: identidade
 * preservada com versão incrementada, e `items: null` preservando os itens
 * conhecidos enquanto `[]` os remove (ADR-008).
 */
export class InMemoryPurchaseOrderRepository implements PurchaseOrderRepository {
  private readonly byKey = new Map<string, PurchaseOrder>();
  // A espera fica aqui, e não num colaborador à parte, pelo mesmo motivo do
  // PostgreSQL: consumir a espera e gravar o pedido é uma operação só.
  private readonly waiting = new Map<
    string,
    {
      ingestionId: string;
      item: NormalizedPurchaseOrderItem;
      raw: string;
      em: number;
      publicada: boolean;
    }[]
  >();
  private relogio = 0;
  private contador = 0;

  /**
   * Identificador no formato e na ordem do real: UUID v7, monotônico.
   *
   * O dobro usava `order-1`, `order-2`… e por isso o codec de cursor recusava
   * a posição — o que só aparecia quando o dobro passou a paginar de verdade.
   * Ids que não são UUID também ordenariam errado: `order-10` vem antes de
   * `order-2` numa comparação de texto.
   */
  private proximoId(): string {
    this.contador += 1;
    const ms = Date.now().toString(16).padStart(12, '0').slice(-12);
    const seq = this.contador.toString(16).padStart(6, '0').slice(-6);
    return `${ms.slice(0, 8)}-${ms.slice(8, 12)}-7${seq.slice(0, 3)}-8${seq.slice(3, 6)}-${seq.padStart(12, '0')}`;
  }
  private sequence = 0;

  replaceSnapshot(snapshot: NormalizedPurchaseOrder): Promise<SnapshotResult> {
    const key = `${snapshot.clientId}:${snapshot.externalNumber}`;
    // A reconciliação pelo cabeçalho leva **tudo** o que esperava, de
    // qualquer carga: é a promessa do ADR-008.
    const porLinhaEsperando = new Map<number, NormalizedPurchaseOrderItem>();
    for (const linha of [...(this.waiting.get(key) ?? [])]
      .filter((l) => l.publicada)
      .sort((a, b) => a.em - b.em)) {
      porLinhaEsperando.set(linha.item.externalLine, linha.item);
    }
    const esperando = [...porLinhaEsperando.values()];
    // Só o publicado sai; o de carga em andamento continua esperando.
    this.waiting.set(
      key,
      (this.waiting.get(key) ?? []).filter((l) => !l.publicada),
    );
    // O test double revalida como o repositório real: era a ausência disso
    // que deixava R09-04 passar verde nos testes (REVIEW-09).
    for (const item of esperando) normalizedItemSchema.parse(item);
    // Com `items: null`, a base é o que está gravado, não o retrato recebido:
    // mesclar sobre ele fazia a espera substituir o anterior (R13-04).
    const anterior = this.byKey.get(key);
    const base =
      snapshot.items === null && esperando.length > 0
        ? {
            ...snapshot,
            items: anterior === undefined ? [] : [...semPersistencia(anterior)],
          }
        : snapshot;
    const completo = normalizedOrderSchema.parse(
      mergeWaitingItems(base, esperando),
    ) as NormalizedPurchaseOrder;
    return Promise.resolve({
      order: this.gravar(completo),
      fromLoad: snapshot.items?.length ?? 0,
      recovered: esperando.length,
    });
  }

  /**
   * Grava sem tocar na espera.
   *
   * `consolidateStaged` passava por `replaceSnapshot`, que consome **toda** a
   * espera do pedido — inclusive linhas de outra carga que ainda não tinham
   * sido consolidadas. O repositório real não faz isso, e a divergência entre
   * o dobro e ele escondia o comportamento certo (REVIEW-12, R12-02).
   */
  private gravar(completo: NormalizedPurchaseOrder): PurchaseOrder {
    const key = `${completo.clientId}:${completo.externalNumber}`;
    const existing = this.byKey.get(key);

    const items =
      completo.items === null
        ? (existing?.items ?? [])
        : completo.items.map((item): PurchaseOrderItem => ({
            ...item,
            id: this.proximoId(),
            quantityPending: Decimal.parse(item.quantityOrdered)
              .subtract(Decimal.parse(item.quantityReceived))
              .toText(quantityScale),
          }));

    this.sequence += 1;
    const saved: PurchaseOrder = {
      id: existing?.id ?? this.proximoId(),
      clientId: completo.clientId,
      externalNumber: completo.externalNumber,
      supplier: completo.supplier,
      currency: completo.currency,
      status: completo.status,
      issuedOn: completo.issuedOn,
      ingestionVersion: (existing?.ingestionVersion ?? 0) + 1,
      ingestedAt: new Date().toISOString(),
      hasPendingBalance: items.some(
        (item) => Decimal.parse(item.quantityPending).isPositive,
      ),
      items,
    };
    this.byKey.set(key, saved);
    return saved;
  }

  stageLooseItems(
    clientId: ClientId,
    ingestionId: string,
    staged: readonly StagedItem[],
  ): Promise<void> {
    for (const item of staged) {
      normalizedItemSchema.parse(item.item);
      const key = `${clientId}:${item.externalNumber}`;
      const fila = this.waiting.get(key) ?? [];
      // A carga faz parte da identidade: duas podem ter a mesma linha do
      // mesmo pedido esperando, cada uma dona da sua (REVIEW-13, R13-01).
      this.waiting.set(key, [
        ...fila.filter(
          (atual) =>
            atual.ingestionId !== ingestionId ||
            atual.item.externalLine !== item.item.externalLine,
        ),
        {
          ingestionId,
          item: item.item,
          raw: item.raw,
          em: this.relogio++,
          publicada: false,
        },
      ]);
    }
    return Promise.resolve();
  }

  finalizeStaged(
    clientId: ClientId,
    ingestionId: string,
    externalNumber: string,
  ): Promise<StagedOutcome> {
    const key = `${clientId}:${externalNumber}`;
    const fila = this.waiting.get(key) ?? [];
    const meus = fila.filter((linha) => linha.ingestionId === ingestionId);
    if (meus.length === 0) {
      return Promise.resolve({ applied: 0, waiting: 0, sample: [] });
    }

    const existing = this.byKey.get(key);
    if (existing === undefined) {
      // Sem cabeçalho: publica **aqui**, na mesma passagem em que a carga
      // contabiliza como esperando (REVIEW-15, R15-02).
      this.waiting.set(
        key,
        fila.map((linha) =>
          linha.ingestionId === ingestionId
            ? { ...linha, publicada: true }
            : linha,
        ),
      );
      return Promise.resolve({
        applied: 0,
        waiting: meus.length,
        // A amostra sai do mesmo fechamento, como no real (R16-02).
        sample: meus.slice(0, maxReportedRecords).map((linha) => ({
          reference: externalNumber,
          reason: 'cabecalho-ausente' as const,
          raw: linha.raw,
        })),
      });
    }

    const porLinha = new Map(
      semPersistencia(existing).map((item) => [item.externalLine, item]),
    );
    for (const linha of meus) porLinha.set(linha.item.externalLine, linha.item);
    const completo = normalizedOrderSchema.parse({
      clientId: existing.clientId,
      externalNumber: existing.externalNumber,
      supplier: existing.supplier,
      currency: existing.currency,
      status: existing.status,
      issuedOn: existing.issuedOn,
      items: [...porLinha.values()],
    }) as NormalizedPurchaseOrder;

    this.waiting.set(
      key,
      fila.filter((linha) => linha.ingestionId !== ingestionId),
    );
    this.gravar(completo);
    return Promise.resolve({ applied: meus.length, waiting: 0, sample: [] });
  }

  discardIngestion(clientId: ClientId, ingestionId: string): Promise<void> {
    for (const [key, fila] of this.waiting) {
      if (!key.startsWith(`${clientId}:`)) continue;
      this.waiting.set(
        key,
        fila.filter((linha) => linha.ingestionId !== ingestionId),
      );
    }
    return Promise.resolve();
  }

  discardUnpublished(clientId: ClientId, ingestionId: string): Promise<number> {
    let removidas = 0;
    for (const [key, fila] of this.waiting) {
      if (!key.startsWith(`${clientId}:`)) continue;
      const restam = fila.filter(
        (linha) => linha.publicada || linha.ingestionId !== ingestionId,
      );
      removidas += fila.length - restam.length;
      this.waiting.set(key, restam);
    }
    return Promise.resolve(removidas);
  }

  discardAbandonedStaging(idadeMinimaMs: number): Promise<number> {
    // O dobro não tem relógio real; o contrato é o que importa aqui.
    void idadeMinimaMs;
    let removidas = 0;
    for (const [key, fila] of this.waiting) {
      const publicadas = fila.filter((linha) => linha.publicada);
      removidas += fila.length - publicadas.length;
      this.waiting.set(key, publicadas);
    }
    return Promise.resolve(removidas);
  }

  purgeStaged(
    clientId: ClientId,
    ingestionId: string,
    externalNumber: string,
  ): Promise<void> {
    const key = `${clientId}:${externalNumber}`;
    const fila = this.waiting.get(key) ?? [];
    this.waiting.set(
      key,
      fila.filter((linha) => linha.ingestionId !== ingestionId),
    );
    return Promise.resolve();
  }

  countStaged(clientId: ClientId, ingestionId: string): Promise<number> {
    let total = 0;
    for (const [key, fila] of this.waiting) {
      if (!key.startsWith(`${clientId}:`)) continue;
      total += fila.filter((l) => l.ingestionId === ingestionId).length;
    }
    return Promise.resolve(total);
  }

  sampleStaged(
    clientId: ClientId,
    ingestionId: string,
    limite: number,
  ): Promise<readonly StagedRecord[]> {
    const encontrados: StagedRecord[] = [];
    for (const [key, fila] of this.waiting) {
      if (!key.startsWith(`${clientId}:`)) continue;
      const externalNumber = key.slice(clientId.length + 1);
      for (const linha of fila) {
        if (linha.ingestionId !== ingestionId) continue;
        if (encontrados.length >= limite) break;
        encontrados.push({
          reference: externalNumber,
          reason: 'cabecalho-ausente',
          raw: linha.raw,
        });
      }
    }
    return Promise.resolve(encontrados);
  }

  /** Só para teste: quantos itens ainda esperam por este pedido. */
  waitingCountFor(clientId: ClientId, externalNumber: string): number {
    return (this.waiting.get(`${clientId}:${externalNumber}`) ?? []).length;
  }

  findById(id: string): Promise<PurchaseOrder | null> {
    return Promise.resolve(
      [...this.byKey.values()].find((order) => order.id === id) ?? null,
    );
  }

  findByExternalNumber(
    clientId: ClientId,
    externalNumber: string,
  ): Promise<PurchaseOrder | null> {
    return Promise.resolve(
      this.byKey.get(`${clientId}:${externalNumber}`) ?? null,
    );
  }

  list(
    filters: PurchaseOrderFilters,
    page: PageRequest,
  ): Promise<Page<PurchaseOrderSummary>> {
    assertPageLimit(page.limit);

    // O cursor usa o **mesmo codec** do repositório real, e não uma imitação:
    // este dobro devolvia `nextCursor: null` sempre e ignorava o cursor
    // recebido, então todo teste de paginação na borda HTTP era vazio — e
    // ainda produzia `hasMore: true` com `nextCursor: null`, que o repositório
    // real nunca produz.
    const fingerprint = fingerprintOf({
      clientId: filters.clientId,
      externalNumber: filters.externalNumber,
      supplierTaxId: filters.supplierTaxId,
      status: filters.status,
      onlyPending: filters.onlyPending,
    });
    const posicao =
      page.cursor === null ? null : decodeCursor(page.cursor, fingerprint);

    const noRecorte = [...this.byKey.values()].filter(
      (order) =>
        (filters.clientId === null || order.clientId === filters.clientId) &&
        (filters.externalNumber === null ||
          order.externalNumber === filters.externalNumber) &&
        (filters.supplierTaxId === null ||
          order.supplier.taxId === filters.supplierTaxId) &&
        (filters.status === null || order.status === filters.status) &&
        (!filters.onlyPending || order.hasPendingBalance),
    );

    // O teto do retrato é fixado na primeira página, como no real.
    const until =
      posicao?.until ??
      noRecorte
        .map((o) => o.id)
        .sort((a, b) => a.localeCompare(b))
        .at(-1);

    if (until === undefined) {
      return Promise.resolve({
        data: [],
        page: {
          limit: page.limit,
          cursor: page.cursor,
          nextCursor: null,
          hasMore: false,
        },
      });
    }

    const todos = noRecorte
      .filter(
        (order) =>
          order.id <= until && (posicao === null || order.id > posicao.after),
      )
      .sort((a, b) => a.id.localeCompare(b.id));

    const visible = todos.slice(0, page.limit);
    const hasMore = todos.length > page.limit;
    const ultimo = visible.at(-1);

    return Promise.resolve({
      data: visible.map((order): PurchaseOrderSummary => ({
        id: order.id,
        clientId: order.clientId,
        externalNumber: order.externalNumber,
        supplier: order.supplier,
        currency: order.currency,
        status: order.status,
        issuedOn: order.issuedOn,
        itemCount: order.items.length,
        pendingItemCount: order.items.filter(
          (item) => Decimal.parse(item.quantityPending).isPositive,
        ).length,
        hasPendingBalance: order.hasPendingBalance,
        ingestionVersion: order.ingestionVersion,
      })),
      page: {
        limit: page.limit,
        cursor: page.cursor,
        nextCursor:
          hasMore && ultimo !== undefined
            ? encodeCursor(ultimo.id, until, fingerprint)
            : null,
        hasMore,
      },
    });
  }

  /** Só para os testes: quantos pedidos estão guardados. */
  get size(): number {
    return this.byKey.size;
  }
}
