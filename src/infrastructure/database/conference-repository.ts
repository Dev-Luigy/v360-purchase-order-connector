import type {
  ConferenceFilters,
  ConferenceRepository,
  ConferenceSummary,
} from '../../application/ports/conference-repository.js';
import type { Page, PageRequest } from '../../application/ports/pagination.js';
import type {
  ConferenceRecord,
  Divergence,
  DivergenceCode,
} from '../../domain/conference.js';
import { invoiceCheckRequestSchema } from '../../domain/schemas.js';

import { decodeCursor, encodeCursor, fingerprintOf } from './cursor.js';
import type { Prisma, PrismaClient } from './generated/client.js';
import { instantToIso } from './mapping.js';
import { assertPageLimit } from './purchase-order-repository.js';

export class PrismaConferenceRepository implements ConferenceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Grava o retrato do que foi comparado: a nota recebida, a versão de
   * ingestão do pedido e as divergências estruturadas. Sem esse retrato, uma
   * reingestão mudaria o sentido do histórico retroativamente (ADR-009).
   *
   * Em uma transação porque conferência sem as divergências dela é pior que
   * conferência nenhuma: o relatório contaria uma nota reprovada sem motivo.
   */
  async save(record: Omit<ConferenceRecord, 'id'>): Promise<ConferenceRecord> {
    const created = await this.prisma.conference.create({
      data: {
        purchaseOrderId: record.purchaseOrderId,
        purchaseOrderIngestionVersion: record.purchaseOrderIngestionVersion,
        clientId: record.clientId,
        checkedAt: new Date(record.checkedAt),
        outcome: record.outcome,
        invoice: record.invoice as unknown as Prisma.InputJsonValue,
        divergences: {
          // A posição vem do array que o domínio produziu: as regras de
          // ADR-009 avaliam em ordem, e ler de volta por UUID não reproduz
          // isso (REVIEW-05, achado 9).
          create: record.divergences.map((divergence, position) => ({
            position,
            code: divergence.code,
            field: divergence.field,
            invoiceLineIndex: divergence.invoiceLineIndex,
            purchaseOrderLine: divergence.purchaseOrderLine,
            expected: divergence.expected,
            received: divergence.received,
          })),
        },
      },
      include: { divergences: { orderBy: { position: 'asc' } } },
    });
    return toConferenceRecord(created);
  }

  async list(
    filters: ConferenceFilters,
    page: PageRequest,
  ): Promise<Page<ConferenceRecord>> {
    assertPageLimit(page.limit);

    const fingerprint = fingerprintOf({
      clientId: filters.clientId,
      outcome: filters.outcome,
      divergenceCode: filters.divergenceCode,
      from: filters.from,
      to: filters.to,
    });
    const after =
      page.cursor === null ? null : decodeCursor(page.cursor, fingerprint);

    const rows = await this.prisma.conference.findMany({
      where: {
        ...whereOf(filters),
        ...(after === null ? {} : { id: { gt: after } }),
      },
      orderBy: { id: 'asc' },
      take: page.limit + 1,
      include: { divergences: { orderBy: { position: 'asc' } } },
    });

    const visible = rows.slice(0, page.limit);
    const hasMore = rows.length > page.limit;
    const last = visible.at(-1);

    return {
      data: visible.map(toConferenceRecord),
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

  /**
   * Relatório do requisito 3.
   *
   * Conta **nota** e conta **ocorrência** separadamente, e a soma por código
   * não fecha com o total de reprovadas: uma nota pode ter várias divergências
   * (ADR-009). A cardinalidade do agrupamento é limitada pela taxonomia
   * fechada, então não há risco de resposta sem teto.
   */
  async summarize(filters: ConferenceFilters): Promise<ConferenceSummary> {
    const where = whereOf(filters);

    const [porResultado, porCodigo] = await Promise.all([
      this.prisma.conference.groupBy({ by: ['outcome'], where, _count: true }),
      this.prisma.conferenceDivergence.groupBy({
        by: ['code'],
        where: { conference: where },
        _count: true,
      }),
    ]);

    const aprovadas =
      porResultado.find((linha) => linha.outcome === 'aprovada')?._count ?? 0;
    const reprovadas =
      porResultado.find((linha) => linha.outcome === 'reprovada')?._count ?? 0;

    const divergencesByCode: Partial<Record<DivergenceCode, number>> = {};
    for (const linha of porCodigo) {
      divergencesByCode[linha.code] = linha._count;
    }

    return {
      checked: aprovadas + reprovadas,
      approved: aprovadas,
      rejected: reprovadas,
      divergencesByCode,
    };
  }
}

function whereOf(filters: ConferenceFilters): Prisma.ConferenceWhereInput {
  return {
    ...(filters.clientId === null ? {} : { clientId: filters.clientId }),
    ...(filters.outcome === null ? {} : { outcome: filters.outcome }),
    // Nota que tem ao menos uma divergência daquele código; o filtro é sobre a
    // nota, não sobre a linha, porque a lista devolve notas.
    ...(filters.divergenceCode === null
      ? {}
      : { divergences: { some: { code: filters.divergenceCode } } }),
    ...(filters.from === null && filters.to === null
      ? {}
      : {
          checkedAt: {
            ...(filters.from === null ? {} : { gte: new Date(filters.from) }),
            ...(filters.to === null ? {} : { lte: new Date(filters.to) }),
          },
        }),
  };
}

type ConferenceRow = Prisma.ConferenceGetPayload<{
  include: { divergences: true };
}>;

function toConferenceRecord(row: ConferenceRow): ConferenceRecord {
  // A nota foi gravada por nós, mas é lida de volta como JSON solto: conferir
  // contra o schema garante que o histórico devolvido ainda cumpre o contrato,
  // em vez de propagar uma linha corrompida como se fosse boa.
  const invoice = invoiceCheckRequestSchema.parse(row.invoice);
  return {
    id: row.id,
    purchaseOrderId: row.purchaseOrderId,
    purchaseOrderIngestionVersion: row.purchaseOrderIngestionVersion,
    clientId: row.clientId,
    checkedAt: instantToIso(row.checkedAt, 'checkedAt'),
    outcome: row.outcome,
    invoice,
    divergences: row.divergences.map((divergence): Divergence => ({
      code: divergence.code,
      field: divergence.field,
      invoiceLineIndex: divergence.invoiceLineIndex,
      purchaseOrderLine: divergence.purchaseOrderLine,
      expected: divergence.expected,
      received: divergence.received,
    })),
  };
}
