import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import type { FastifyInstance } from 'fastify';

import type { CheckInvoice } from '../../../application/use-cases/check-invoice.js';
import {
  conferenceRecordSchema,
  invoiceCheckRequestSchema,
} from '../../../domain/schemas.js';
import { commonProblems } from '../problem.js';

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
): void {
  app.withTypeProvider<ZodTypeProvider>().post(
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
