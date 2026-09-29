import type { Page, PageRequest } from '../../application/ports/pagination.js';
import { maxPageLimit } from '../../application/ports/pagination.js';
import type {
  PurchaseOrderFilters,
  PurchaseOrderRepository,
  SnapshotResult,
} from '../../application/ports/purchase-order-repository.js';
import type { ClientId } from '../../domain/client.js';
import { Decimal } from '../../domain/decimal.js';
import {
  mergeWaitingItems,
  semPersistencia,
  type StagedItem,
  type StagedRecord,
} from '../../domain/ingestion.js';
import {
  describeIssues,
  normalizedItemSchema,
  normalizedOrderSchema,
} from '../../domain/schemas.js';
import type {
  NormalizedPurchaseOrder,
  NormalizedPurchaseOrderItem,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderSummary,
} from '../../domain/purchase-order.js';

import { decodeCursor, encodeCursor, fingerprintOf } from './cursor.js';
import type { Prisma, PrismaClient } from './generated/client.js';
import {
  dateToIsoDate,
  decimalToText,
  hasPendingBalance,
  instantToIso,
  isoDateToDate,
  isoDateToDateOrNull,
  optionalDateToIsoDate,
  pendingOf,
} from './mapping.js';

type Transaction = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

export class PrismaPurchaseOrderRepository implements PurchaseOrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Serializa cargas do mesmo pedido com lock transacional. `FOR UPDATE` não
   * cobre um pedido que ainda não existe.
   */
  replaceSnapshot(snapshot: NormalizedPurchaseOrder): Promise<SnapshotResult> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKeyFor(snapshot)}))`;

      // Os itens que esperavam por este pedido entram aqui dentro. Eram
      // consumidos numa transação própria, e uma falha na gravação abaixo os
      // perdia para sempre (REVIEW-09, R09-01).
      const esperando = await takeWaitingItems(
        tx,
        snapshot.clientId,
        snapshot.externalNumber,
      );
      const completo = mergeWaitingItems(snapshot, esperando);
      const order = await persistSnapshot(tx, completo);
      return {
        order,
        // `items: null` não traz item nenhum, por mais que o pedido salvo
        // tenha itens preservados de antes (REVIEW-10, R10-02).
        fromLoad: snapshot.items?.length ?? 0,
        recovered:
          (completo.items?.length ?? 0) - (snapshot.items?.length ?? 0),
      };
    });
  }

  /**
   * Guarda itens sem cabeçalho. Não decide nada: a decisão é de
   * `consolidateStaged`, que roda uma vez por pedido no fim da carga.
   *
   * Separar as duas é o que permite escoar o staging em lotes — necessário
   * para não reter a carga em memória — e ainda assim ter uma transação por
   * pedido. Enquanto elas eram a mesma operação, um pedido cujas linhas
   * atravessavam dois lotes abria duas transações (REVIEW-11).
   */
  async stageLooseItems(
    clientId: ClientId,
    ingestionId: string,
    staged: readonly StagedItem[],
  ): Promise<void> {
    if (staged.length === 0) return;
    await this.prisma.$transaction(async (tx) => {
      for (const item of staged) {
        await stageItem(tx, clientId, ingestionId, item);
      }
    });
  }

  /**
   * Fecha um pedido cujos itens estavam esperando.
   *
   * Lock, leitura, decisão e escrita na mesma transação: ler o pedido fora do
   * lock deixava duas cargas simultâneas lerem o mesmo retrato, e a segunda
   * gravação perdia a primeira (REVIEW-09, R09-06).
   */
  consolidateStaged(
    clientId: ClientId,
    ingestionId: string,
    externalNumber: string,
  ): Promise<number> {
    const chave = lockKeyFor({ clientId, externalNumber });
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chave}))`;

      const encontrado = await tx.purchaseOrder.findUnique({
        where: { clientId_externalNumber: { clientId, externalNumber } },
        select: { id: true },
      });
      // Sem cabeçalho ainda: os itens seguem esperando, intactos.
      if (encontrado === null) return 0;

      const esperando = await takeWaitingItems(
        tx,
        clientId,
        externalNumber,
        ingestionId,
      );
      if (esperando.length === 0) return 0;

      const existente = await findFull(tx, encontrado.id);
      if (existente === null) {
        throw new Error(
          `pedido ${encontrado.id} desapareceu dentro da própria transação`,
        );
      }
      // Um retrato só, com todas as linhas que esperavam.
      const porLinha = new Map(
        semPersistencia(existente).map((item) => [item.externalLine, item]),
      );
      for (const item of esperando) porLinha.set(item.externalLine, item);

      // O agregado atravessa a fronteira de persistência aqui, e não só cada
      // item: validar linha a linha não confere a cardinalidade do pedido, e
      // o caminho item-only do Delta passava do teto (REVIEW-12, R12-01).
      await persistSnapshot(
        tx,
        conferirAgregado({
          clientId: existente.clientId,
          externalNumber: existente.externalNumber,
          supplier: existente.supplier,
          currency: existente.currency,
          status: existente.status,
          issuedOn: existente.issuedOn,
          items: [...porLinha.values()],
        }),
      );
      return esperando.length;
    });
  }

  async sampleStaged(
    clientId: ClientId,
    ingestionId: string,
    limite: number,
  ): Promise<readonly StagedRecord[]> {
    const rows = await this.prisma.ingestionStaging.findMany({
      where: { clientId, ingestionId },
      orderBy: [{ externalNumber: 'asc' }, { externalLine: 'asc' }],
      take: limite,
      select: { externalNumber: true, raw: true },
    });
    return rows.map((row) => ({
      reference: row.externalNumber,
      reason: 'cabecalho-ausente' as const,
      raw: row.raw,
    }));
  }

  findById(id: string): Promise<PurchaseOrder | null> {
    return findFull(this.prisma, id);
  }

  async findByExternalNumber(
    clientId: ClientId,
    externalNumber: string,
  ): Promise<PurchaseOrder | null> {
    const found = await this.prisma.purchaseOrder.findUnique({
      where: { clientId_externalNumber: { clientId, externalNumber } },
      select: { id: true },
    });
    return found === null ? null : findFull(this.prisma, found.id);
  }

  async list(
    filters: PurchaseOrderFilters,
    page: PageRequest,
  ): Promise<Page<PurchaseOrderSummary>> {
    assertPageLimit(page.limit);

    const fingerprint = fingerprintOf({
      clientId: filters.clientId,
      supplierTaxId: filters.supplierTaxId,
      status: filters.status,
      onlyPending: filters.onlyPending,
    });
    const after =
      page.cursor === null ? null : decodeCursor(page.cursor, fingerprint);

    const rows = await this.prisma.purchaseOrder.findMany({
      where: {
        ...(filters.clientId === null ? {} : { clientId: filters.clientId }),
        ...(filters.supplierTaxId === null
          ? {}
          : { supplierTaxId: filters.supplierTaxId }),
        ...(filters.status === null ? {} : { status: filters.status }),
        ...(filters.onlyPending ? { hasPendingBalance: true } : {}),
        ...(after === null ? {} : { id: { gt: after } }),
      },
      orderBy: { id: 'asc' },
      take: page.limit + 1,
      include: { items: { select: { quantityPending: true } } },
    });

    const visible = rows.slice(0, page.limit);
    const hasMore = rows.length > page.limit;
    const last = visible.at(-1);

    return {
      data: visible.map(toSummary),
      page: {
        limit: page.limit,
        cursor: page.cursor,
        nextCursor:
          hasMore && last !== undefined
            ? encodeCursor(last.id, fingerprint)
            : null,
        hasMore,
      },
    };
  }
}

/**
 * Grava o retrato. Recebe a transação porque os dois caminhos que gravam —
 * carga de pedido e item avulso — precisam do lock e da escrita na mesma.
 */
async function persistSnapshot(
  tx: Transaction,
  completo: NormalizedPurchaseOrder,
): Promise<PurchaseOrder> {
  const existing = await tx.purchaseOrder.findUnique({
    where: {
      clientId_externalNumber: {
        clientId: completo.clientId,
        externalNumber: completo.externalNumber,
      },
    },
    select: { id: true },
  });

  const header = {
    supplierTaxId: completo.supplier.taxId,
    supplierName: completo.supplier.name,
    currency: completo.currency,
    status: completo.status,
    issuedOn: isoDateToDate(completo.issuedOn),
    ingestedAt: new Date(),
  };

  const id =
    existing === null
      ? (
          await tx.purchaseOrder.create({
            data: {
              ...header,
              clientId: completo.clientId,
              externalNumber: completo.externalNumber,
              hasPendingBalance: false,
            },
            select: { id: true },
          })
        ).id
      : (
          await tx.purchaseOrder.update({
            where: { id: existing.id },
            data: { ...header, ingestionVersion: { increment: 1 } },
            select: { id: true },
          })
        ).id;

  // `items: null` é carga que não trouxe os itens e preserva os conhecidos;
  // `[]` é o cliente afirmando que não há itens, e remove (ADR-008).
  if (completo.items !== null) {
    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
    if (completo.items.length > 0) {
      await tx.purchaseOrderItem.createMany({
        data: completo.items.map((item) => ({
          purchaseOrderId: id,
          externalLine: item.externalLine,
          material: item.material,
          description: item.description,
          purchaseUnit: item.purchaseUnit,
          conversionFactor: item.conversionFactor,
          quantityOrdered: item.quantityOrdered,
          quantityReceived: item.quantityReceived,
          quantityPending: pendingOf(
            item.quantityOrdered,
            item.quantityReceived,
          ),
          unitPrice: item.unitPrice,
          lineCreatedOn: isoDateToDateOrNull(item.lineCreatedOn),
        })),
      });
    }
  }

  // Com `items: null`, o saldo depende dos itens preservados no banco.
  const saldos = await tx.purchaseOrderItem.findMany({
    where: { purchaseOrderId: id },
    select: { quantityPending: true },
  });
  await tx.purchaseOrder.update({
    where: { id },
    data: {
      hasPendingBalance: hasPendingBalance(
        saldos.map((item) => ({
          quantityPending: decimalToText(
            item.quantityPending,
            'quantityPending',
          ),
        })),
      ),
    },
  });

  const saved = await findFull(tx, id);
  if (saved === null) {
    throw new Error(`pedido ${id} desapareceu dentro da própria transação`);
  }
  return saved;
}

/**
 * Remove e devolve os itens que esperavam por este pedido.
 *
 * Roda dentro da transação de quem grava: se a gravação falhar, o `DELETE` é
 * desfeito junto e os itens continuam esperando.
 */
async function takeWaitingItems(
  tx: Transaction,
  clientId: ClientId,
  externalNumber: string,
  /**
   * Quando informado, leva só as linhas desta carga — é a consolidação. Sem
   * ele, leva todas, que é a reconciliação pelo cabeçalho (ADR-008).
   */
  ingestionId?: string,
): Promise<readonly NormalizedPurchaseOrderItem[]> {
  const rows = await tx.ingestionStaging.findMany({
    where: {
      clientId,
      externalNumber,
      ...(ingestionId === undefined ? {} : { ingestionId }),
    },
    orderBy: { externalLine: 'asc' },
  });
  if (rows.length === 0) return [];
  await tx.ingestionStaging.deleteMany({
    where: { id: { in: rows.map((row) => row.id) } },
  });
  // O que sai daqui entra num pedido de verdade: uma linha gravada por uma
  // versão anterior do contrato não atravessa sem conferência.
  return rows.map((row) => {
    const parsed = normalizedItemSchema.safeParse(row.item);
    if (!parsed.success) {
      throw new Error(
        `item em espera do pedido ${externalNumber} não passou no contrato: ${describeIssues(parsed.error)}`,
      );
    }
    return parsed.data;
  });
}

/** Reenviar a mesma linha do mesmo pedido substitui a anterior (ADR-008). */
async function stageItem(
  tx: Transaction,
  clientId: ClientId,
  ingestionId: string,
  staged: StagedItem,
): Promise<void> {
  const item = staged.item as unknown as Prisma.InputJsonValue;
  await tx.ingestionStaging.upsert({
    where: {
      clientId_externalNumber_externalLine: {
        clientId,
        externalNumber: staged.externalNumber,
        externalLine: staged.item.externalLine,
      },
    },
    create: {
      clientId,
      externalNumber: staged.externalNumber,
      externalLine: staged.item.externalLine,
      ingestionId,
      item,
      raw: staged.raw,
      stagedAt: new Date(),
    },
    update: { ingestionId, item, raw: staged.raw, stagedAt: new Date() },
  });
}

/**
 * Confere o pedido inteiro contra o contrato antes de gravar.
 *
 * Validar cada item não confere a **cardinalidade**: o caminho item-only do
 * Delta montava um pedido acima do teto sem ninguém reclamar, porque o teto é
 * do agregado (REVIEW-12, R12-01).
 */
function conferirAgregado(
  order: NormalizedPurchaseOrder,
): NormalizedPurchaseOrder {
  const conferido = normalizedOrderSchema.safeParse(order);
  if (!conferido.success) {
    throw new RangeError(
      `pedido ${order.externalNumber}: ${describeIssues(conferido.error)}`,
    );
  }
  return order;
}

/** Inclui o comprimento para evitar colisões na concatenação das partes. */
export function lockKeyFor(snapshot: {
  clientId: string;
  externalNumber: string;
}): string {
  return `${String(snapshot.clientId.length)}:${snapshot.clientId}:${snapshot.externalNumber}`;
}

export function assertPageLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`tamanho de página inválido: ${String(limit)}`);
  }
  if (limit > maxPageLimit) {
    throw new RangeError(
      `tamanho de página ${String(limit)} acima do teto de ${String(maxPageLimit)}`,
    );
  }
}

type FullOrder = Prisma.PurchaseOrderGetPayload<{ include: { items: true } }>;
type SummaryRow = Prisma.PurchaseOrderGetPayload<{
  include: { items: { select: { quantityPending: true } } };
}>;

async function findFull(
  client: PrismaClient | Transaction,
  id: string,
): Promise<PurchaseOrder | null> {
  const row = await client.purchaseOrder.findUnique({
    where: { id },
    include: { items: { orderBy: { externalLine: 'asc' } } },
  });
  return row === null ? null : toPurchaseOrder(row);
}

function toPurchaseOrder(row: FullOrder): PurchaseOrder {
  return {
    id: row.id,
    clientId: row.clientId,
    externalNumber: row.externalNumber,
    supplier: { taxId: row.supplierTaxId, name: row.supplierName },
    currency: row.currency,
    status: row.status,
    issuedOn: dateToIsoDate(row.issuedOn, 'issuedOn'),
    ingestionVersion: row.ingestionVersion,
    ingestedAt: instantToIso(row.ingestedAt, 'ingestedAt'),
    hasPendingBalance: row.hasPendingBalance,
    items: row.items.map((item): PurchaseOrderItem => ({
      id: item.id,
      externalLine: item.externalLine,
      material: item.material,
      description: item.description,
      purchaseUnit: item.purchaseUnit,
      conversionFactor: decimalToText(
        item.conversionFactor,
        'conversionFactor',
      ),
      quantityOrdered: decimalToText(item.quantityOrdered, 'quantityOrdered'),
      quantityReceived: decimalToText(
        item.quantityReceived,
        'quantityReceived',
      ),
      quantityPending: decimalToText(item.quantityPending, 'quantityPending'),
      unitPrice: decimalToText(item.unitPrice, 'unitPrice'),
      lineCreatedOn: optionalDateToIsoDate(item.lineCreatedOn),
    })),
  };
}

// O teto de página limita o custo de carregar os saldos para esta contagem.
function toSummary(row: SummaryRow): PurchaseOrderSummary {
  const pendentes = row.items.filter(
    (item) =>
      Decimal.parse(decimalToText(item.quantityPending, 'quantityPending'))
        .isPositive,
  );
  return {
    id: row.id,
    clientId: row.clientId,
    externalNumber: row.externalNumber,
    supplier: { taxId: row.supplierTaxId, name: row.supplierName },
    currency: row.currency,
    status: row.status,
    issuedOn: dateToIsoDate(row.issuedOn, 'issuedOn'),
    itemCount: row.items.length,
    pendingItemCount: pendentes.length,
    hasPendingBalance: row.hasPendingBalance,
    ingestionVersion: row.ingestionVersion,
  };
}
