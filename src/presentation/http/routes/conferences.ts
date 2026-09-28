import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import type { FastifyInstance } from 'fastify';

import { z } from 'zod';

import { maxPageLimit } from '../../../application/ports/pagination.js';
import type { CheckInvoice } from '../../../application/use-cases/check-invoice.js';
import type {
  ListConferences,
  SummarizeConferences,
} from '../../../application/use-cases/query-conferences.js';
import { maxClientIdLength, maxCursorLength } from '../../../domain/limits.js';
import {
  conferenceRecordSchema,
  conferenceSummarySchema,
  divergenceCodeSchema,
  invoiceCheckRequestSchema,
  isoInstantSchema,
} from '../../../domain/schemas.js';
import { commonProblems } from '../problem.js';
import { pagedSchema } from '../schemas.js';

/**
 * Filtros do relatório. O recorte por data usa instante ISO completo, e não só
 * data: "as conferências de hoje" depende de fuso, e o cliente é quem sabe o
 * dele.
 */
const reportQuerySchema = z.object({
  clientId: z.string().min(1).max(maxClientIdLength).optional(),
  outcome: z.enum(['aprovada', 'reprovada']).optional(),
  divergenceCode: divergenceCodeSchema.optional(),
  from: isoInstantSchema.optional(),
  to: isoInstantSchema.optional(),
  limit: z.coerce.number().int().positive().max(maxPageLimit).optional(),
  cursor: z.string().max(maxCursorLength).optional(),
});

/**
 * Conferência de nota fiscal: o requisito 2 do enunciado.
 *
 * O handler não decide nada — valida, chama o caso de uso e traduz. Toda regra
 * está em `checkInvoice`, e todo campo derivado é montado a partir do pedido
 * carregado, dentro do caso de uso (REVIEW-07, R07-04).
 *
 * `201` porque a conferência **cria** um registro no histórico: o resultado não
 * é uma consulta, é um fato novo que sobrevive à parada do serviço.
 */
export function registerConferenceRoutes(
  app: FastifyInstance,
  check: CheckInvoice,
  list: ListConferences,
  summarize: SummarizeConferences,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  // Rota estática antes da paginada: `/conferences/summary` nunca deve ser
  // lida como um identificador de conferência.
  typed.get(
    '/conferences/summary',
    {
      schema: {
        querystring: reportQuerySchema,
        response: { 200: conferenceSummarySchema, ...commonProblems },
      },
    },
    async (request, reply) => {
      const resumo = await summarize.execute(request.query);
      return reply.code(200).send({
        ...resumo,
        divergencesByCode: { ...resumo.divergencesByCode },
      });
    },
  );

  typed.get(
    '/conferences',
    {
      schema: {
        querystring: reportQuerySchema,
        response: {
          200: pagedSchema(conferenceRecordSchema),
          ...commonProblems,
        },
      },
    },
    async (request, reply) => {
      const pagina = await list.execute(request.query);
      return reply.code(200).send({
        data: pagina.data.map((record) => ({
          ...record,
          invoice: {
            ...record.invoice,
            lines: record.invoice.lines.map((line) => ({ ...line })),
          },
          divergences: record.divergences.map((divergence) => ({
            ...divergence,
          })),
        })),
        page: pagina.page,
      });
    },
  );

  typed.post(
    '/conferences',
    {
      schema: {
        body: invoiceCheckRequestSchema,
        response: { 201: conferenceRecordSchema, ...commonProblems },
      },
    },
    async (request, reply) => {
      // `request.body` já é o valor validado pelo schema, não o objeto cru:
      // campo desconhecido não atravessa para o histórico.
      const record = await check.execute(request.body);
      return reply.code(201).send({
        ...record,
        invoice: {
          ...record.invoice,
          lines: record.invoice.lines.map((line) => ({ ...line })),
        },
        divergences: record.divergences.map((divergence) => ({
          ...divergence,
        })),
      });
    },
  );
}
