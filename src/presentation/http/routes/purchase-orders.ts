import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { maxPageLimit } from '../../../application/ports/pagination.js';
import type {
  GetPurchaseOrder,
  ListPurchaseOrders,
} from '../../../application/use-cases/query-purchase-orders.js';
import { maxClientIdLength, maxCursorLength } from '../../../domain/limits.js';
import {
  purchaseOrderStatusSchema,
  taxIdSchema,
} from '../../../domain/schemas.js';
import { commonProblems } from '../problem.js';
import {
  pagedSchema,
  purchaseOrderDetailSchema,
  purchaseOrderSummarySchema,
  toPurchaseOrderDetail,
} from '../schemas.js';

/**
 * Consulta de pedidos: o requisito 1 do enunciado.
 *
 * Os filtros chegam como texto na query, então a conversão é declarada no
 * schema e não espalhada pelo handler. `limit` acima do teto é `400`, não
 * recorte silencioso — o enunciado pede o teto justamente para ninguém
 * descobrir em produção o que acontece ao pedir um milhão de registros.
 */

const listQuerySchema = z.object({
  clientId: z.string().min(1).max(maxClientIdLength).optional(),
  supplierTaxId: taxIdSchema.optional(),
  status: purchaseOrderStatusSchema.optional(),
  /** `?pending=true` devolve só pedidos com algum item com saldo. */
  pending: z.stringbool().optional(),
  limit: z.coerce.number().int().positive().max(maxPageLimit).optional(),
  cursor: z.string().max(maxCursorLength).optional(),
});

const detailParamsSchema = z.object({ id: z.string().min(1).max(64) });

export function registerPurchaseOrderRoutes(
  app: FastifyInstance,
  list: ListPurchaseOrders,
  detail: GetPurchaseOrder,
): void {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/purchase-orders',
    {
      schema: {
        querystring: listQuerySchema,
        response: {
          200: pagedSchema(purchaseOrderSummarySchema),
          ...commonProblems,
        },
      },
    },
    async (request, reply) => {
      const page = await list.execute(request.query);
      return reply.code(200).send({
        data: page.data.map((order) => ({
          ...order,
          supplier: { ...order.supplier },
        })),
        page: page.page,
      });
    },
  );

  typed.get(
    '/purchase-orders/:id',
    {
      schema: {
        params: detailParamsSchema,
        response: { 200: purchaseOrderDetailSchema, ...commonProblems },
      },
    },
    async (request, reply) => {
      const order = await detail.execute(request.params.id);
      if (order === null) {
        // Pedido inexistente é 404, e não lista vazia: a plataforma precisa
        // distinguir "não existe" de "existe e está vazio".
        return reply.code(404).send({
          error: 'pedido_nao_encontrado',
          message: `pedido ${request.params.id} não existe`,
        });
      }
      return reply.code(200).send(toPurchaseOrderDetail(order));
    },
  );
}
