import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '@fastify/type-provider-zod';
import { z } from 'zod';

import type { IngestPurchaseOrders } from '../../../application/use-cases/ingest-purchase-orders.js';
import { maxClientIdLength } from '../../../domain/limits.js';
import { ingestionReportSchema } from '../../../domain/schemas.js';
import { commonProblems } from '../problem.js';
import { spoolMultipart } from '../spool.js';

/**
 * Carga de pedidos de um cliente.
 *
 * `POST /clients/{clientId}/ingestions`, com o cliente **no caminho** e nunca
 * deduzido do conteúdo: o Delta usa exatamente os mesmos nomes de campo do
 * Alfa, então dedução quebraria justamente onde mais dói (ADR-008).
 *
 * A versão do formato vem em cabeçalho. Versão diferente da que o perfil
 * declara é recusa, não tentativa de leitura: mudança no ERP do cliente
 * precisa de perfil novo, não de parse otimista.
 */

/** Nomes de parte aceitos, por forma de entrega. É allowlist, não sugestão. */
const partsByFormat: Readonly<Record<string, readonly string[]>> = {
  'nested-json': ['orders'],
  'paired-csv': ['headers', 'items'],
  'flat-json': ['lines'],
  // Delta entrega duas consultas independentes e qualquer uma pode vir
  // sozinha; `requiredParts` é quem diz que nenhuma é obrigatória.
  'split-json': ['orders', 'items'],
};

/**
 * Partes sem as quais a carga não faz sentido. Para `split-json` a lista é
 * vazia de propósito: mandar só `orders` é uso normal e **não apaga** os itens
 * já conhecidos (ADR-008).
 */
const requiredPartsByFormat: Readonly<Record<string, readonly string[]>> = {
  'nested-json': ['orders'],
  'paired-csv': ['headers', 'items'],
  'flat-json': ['lines'],
  'split-json': [],
};

const paramsSchema = z.object({
  clientId: z.string().min(1).max(maxClientIdLength),
});

const headersSchema = z.object({
  'x-format-version': z.string().min(1).max(32),
});

export function registerIngestionRoutes(
  app: FastifyInstance,
  ingest: IngestPurchaseOrders,
  profileFormatOf: (clientId: string) => Promise<string | null>,
): void {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/clients/:clientId/ingestions',
    {
      schema: {
        params: paramsSchema,
        headers: headersSchema,
        response: {
          200: ingestionReportSchema,
          501: commonProblems[422],
          ...commonProblems,
        },
      },
    },
    async (request, reply) => {
      const { clientId } = request.params;
      const format = await profileFormatOf(clientId);
      if (format === null) {
        return reply.code(404).send({
          error: 'cliente_desconhecido',
          message: `cliente ${clientId} não tem perfil declarado`,
        });
      }

      const allowed = partsByFormat[format];
      if (allowed === undefined) {
        return reply.code(501).send({
          error: 'forma_nao_suportada',
          message: `a forma de entrega ${format} ainda não tem adaptador`,
        });
      }

      // O spool precisa ser desfeito em qualquer saída — sucesso, erro do
      // parser ou desconexão do cliente (REVIEW-04, R04-01).
      const spooled = await spoolMultipart(request.files(), allowed);
      try {
        const obrigatorias = requiredPartsByFormat[format] ?? allowed;
        const faltando = obrigatorias.filter(
          (part) => !spooled.parts.has(part),
        );
        if (faltando.length > 0) {
          return reply.code(400).send({
            error: 'partes_ausentes',
            message: `a carga de ${format} exige: ${faltando.join(', ')}`,
          });
        }

        const report = await ingest.execute({
          clientId,
          formatVersion: request.headers['x-format-version'],
          parts: spooled.parts,
        });
        // Cópia rasa: o contrato do domínio é somente-leitura e o schema da
        // resposta não é, o que o provider Zod cobra com razão.
        return reply.code(200).send({
          ...report,
          rejected: [...report.rejected],
          staged: [...report.staged],
        });
      } finally {
        await spooled.cleanup();
      }
    },
  );
}
