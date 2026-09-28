import type { Page, PageRequest } from '../../application/ports/pagination.js';
import { maxPageLimit } from '../../application/ports/pagination.js';
import type {
  PurchaseOrderFilters,
  PurchaseOrderRepository,
} from '../../application/ports/purchase-order-repository.js';
import type { ClientId } from '../../domain/client.js';
import { Decimal } from '../../domain/decimal.js';
import type {
  NormalizedPurchaseOrder,
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
   * Substitui o retrato do pedido em uma transação (ADR-008).
   *
   * Cargas concorrentes do mesmo pedido são serializadas por advisory lock
   * sobre `(clientId, externalNumber)`. Lock de transação, e não de sessão: o
   * Postgres o solta no commit ou no rollback, então carga que morre no meio
   * não deixa o pedido travado. `SELECT ... FOR UPDATE` não serviria porque o
   * pedido pode ainda não existir, e duas cargas simultâneas do mesmo pedido
   * novo criariam duas linhas antes de qualquer uma travar a outra.
   */
  replaceSnapshot(snapshot: NormalizedPurchaseOrder): Promise<PurchaseOrder> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKeyFor(snapshot)}))`;

      const existing = await tx.purchaseOrder.findUnique({
        where: {
          clientId_externalNumber: {
            clientId: snapshot.clientId,
            externalNumber: snapshot.externalNumber,
          },
        },
        select: { id: true },
      });

      const header = {
        supplierTaxId: snapshot.supplier.taxId,
        supplierName: snapshot.supplier.name,
        currency: snapshot.currency,
        status: snapshot.status,
        issuedOn: isoDateToDate(snapshot.issuedOn),
        ingestedAt: new Date(),
      };

      const id =
        existing === null
          ? (
              await tx.purchaseOrder.create({
                data: {
                  ...header,
                  clientId: snapshot.clientId,
                  externalNumber: snapshot.externalNumber,
                  hasPendingBalance: false,
                },
                select: { id: true },
              })
            ).id
          : (
              await tx.purchaseOrder.update({
                where: { id: existing.id },
                // Identidade interna preservada e versão incrementada: toda
                // conferência guarda a versão que conferiu (ADR-009).
                data: { ...header, ingestionVersion: { increment: 1 } },
                select: { id: true },
              })
            ).id;

      // `items: null` é carga que não trouxe os itens e preserva os conhecidos;
      // `[]` é o cliente afirmando que não há itens, e remove (ADR-008).
      if (snapshot.items !== null) {
        await tx.purchaseOrderItem.deleteMany({
          where: { purchaseOrderId: id },
        });
        if (snapshot.items.length > 0) {
          await tx.purchaseOrderItem.createMany({
            data: snapshot.items.map((item) => ({
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

      // Recalculado a partir do que ficou no banco, e não do payload: com
      // `items: null` o saldo vem dos itens preservados.
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
    });
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

  /**
   * Listagem sem itens, paginada por cursor sobre a identidade interna
   * (ADR-010). O `id` é UUID v7, ordenável no tempo, então a varredura avança
   * pelos mesmos índices que sustentam os filtros.
   */
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
        // Coluna mantida na ingestão e coberta por índice parcial: comparar
        // quantidade pedida com recebida não usaria índice (ADR-006).
        ...(filters.onlyPending ? { hasPendingBalance: true } : {}),
        ...(after === null ? {} : { id: { gt: after } }),
      },
      orderBy: { id: 'asc' },
      // Um a mais do que a página, para saber se há próxima sem um COUNT.
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
 * Chave do advisory lock. O comprimento do cliente vai na frente para que
 * `("a", "bc")` e `("ab", "c")` não colidam na concatenação.
 */
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
  // Acima do teto é erro de requisição, não recorte silencioso (ADR-010).
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

/**
 * Contagem feita sobre as linhas da própria página. Uma subconsulta por pedido
 * transferiria menos bytes, mas exigiria SQL cru e perderia a tipagem; com teto
 * de cem por página (ADR-010), o custo é limitado e fica visível aqui.
 */
function toSummary(row: SummaryRow): PurchaseOrderSummary {
  const pendentes = row.items.filter(
    (item) =>
      // `Decimal`, não `parseFloat`: quantidade é decimal exato e ponto
      // flutuante é proibido neste projeto (ADR-007).
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
