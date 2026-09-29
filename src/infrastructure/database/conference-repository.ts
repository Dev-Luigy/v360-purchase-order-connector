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
import {
  divergenceSchema,
  invoiceCheckRequestSchema,
} from '../../domain/schemas.js';

import { decodeCursor, encodeCursor, fingerprintOf } from './cursor.js';
import type { Prisma, PrismaClient } from './generated/client.js';
import { instantToIso } from './mapping.js';
import { assertPageLimit } from './purchase-order-repository.js';

export class PrismaConferenceRepository implements ConferenceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Persiste nota, versão do pedido e divergências como um único retrato. */
  async save(record: Omit<ConferenceRecord, 'id'>): Promise<ConferenceRecord> {
    // Valida textos variáveis antes de atingir os limites das colunas.
    const divergences = record.divergences.map((divergence) =>
      divergenceSchema.parse(divergence),
    );
    // A nota é persistida **como o schema a devolve**, não como veio. Gravar o
    // objeto original com cast deixa uma chave extra entrar no JSONB e
    // desaparecer em silêncio na leitura, que aplica o schema. A borda HTTP
    // também filtra, mas a porta do repositório é pública e não pode depender
    // de quem a chama.
    const invoice = invoiceCheckRequestSchema.parse(record.invoice);

    // Coerência que o banco não consegue garantir por linha: aprovada tem zero
    // divergências e reprovada tem ao menos uma.
    const esperado = divergences.length === 0 ? 'aprovada' : 'reprovada';
    if (record.outcome !== esperado) {
      throw new RangeError(
        `conferência ${record.outcome} com ${String(divergences.length)} divergências`,
      );
    }

    const created = await this.prisma.conference.create({
      data: {
        purchaseOrderId: record.purchaseOrderId,
        purchaseOrderIngestionVersion: record.purchaseOrderIngestionVersion,
        clientId: record.clientId,
        checkedAt: new Date(record.checkedAt),
        outcome: record.outcome,
        // Sem cast: o valor vem tipado do schema, não do chamador.
        invoice,
        divergences: {
          // UUID não preserva a ordem das regras do domínio.
          create: divergences.map((divergence, position) => ({
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
    const posicao =
      page.cursor === null ? null : decodeCursor(page.cursor, fingerprint);

    const recorte = whereOf(filters);
    // O teto do retrato é fixado na primeira página e viaja no cursor: o
    // histórico cresce enquanto a plataforma o lê, e sem teto a leitura não tem
    // condição própria de término.
    const until =
      posicao?.until ??
      (
        await this.prisma.conference.findFirst({
          where: recorte,
          orderBy: { id: 'desc' },
          select: { id: true },
        })
      )?.id;

    if (until === undefined) {
      return {
        data: [],
        page: {
          limit: page.limit,
          cursor: page.cursor,
          nextCursor: null,
          hasMore: false,
        },
      };
    }

    const rows = await this.prisma.conference.findMany({
      where: {
        ...recorte,
        id:
          posicao === null ? { lte: until } : { gt: posicao.after, lte: until },
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
            ? encodeCursor(last.id, until, fingerprint)
            : null,
        hasMore,
      },
    };
  }

  /** Conta notas por resultado e ocorrências por código separadamente. */
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
    // A lista devolve notas que tenham ao menos uma ocorrência do código.
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
  // JSON persistido volta sem tipo e precisa ser validado na leitura.
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
