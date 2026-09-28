import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from '@fastify/type-provider-zod';
import { z } from 'zod';

import { PurchaseOrderNotFoundError } from '../../application/use-cases/check-invoice.js';
import { UnknownClientError } from '../../application/use-cases/ingest-purchase-orders.js';
import { CursorError } from '../../infrastructure/database/cursor.js';
import { FieldError } from '../../infrastructure/integrations/field-parsers.js';

import { SpoolError } from './spool.js';

/**
 * Forma única de erro das rotas de negócio.
 *
 * `error` é código estável, para a plataforma decidir sem interpretar texto —
 * a mesma razão pela qual a taxonomia de divergências é fechada (ADR-009).
 * `message` é para gente ler.
 *
 * Nada de pilha, nada de erro do Prisma: mensagem de banco na resposta conta
 * ao cliente detalhes da nossa infraestrutura.
 */
export const problemSchema = z.object({
  error: z.string().min(1),
  message: z.string().min(1),
});

export type Problem = z.infer<typeof problemSchema>;

/** Respostas de erro que quase toda rota declara. */
export const commonProblems = {
  400: problemSchema,
  404: problemSchema,
  413: problemSchema,
  415: problemSchema,
  422: problemSchema,
  429: problemSchema,
  500: problemSchema,
  503: problemSchema,
} as const;

export interface MappedProblem {
  readonly status: number;
  readonly body: Problem;
}

/**
 * Traduz erro de domínio e de infraestrutura para status HTTP.
 *
 * A tradução mora aqui e não nos handlers para que a decisão seja uma só: sem
 * isso, cada rota escolheria um status diferente para a mesma causa.
 */
export function toProblem(error: unknown): MappedProblem {
  // Falha de schema na entrada é requisição malformada, e sem este ramo caía
  // no 500 genérico — que é exatamente o risco apontado em REVIEW-07, R06-01:
  // rejeição determinística virando erro interno.
  if (hasZodFastifySchemaValidationErrors(error)) {
    return {
      status: 400,
      body: {
        error: 'requisicao_invalida',
        message: describeValidation(error.validation),
      },
    };
  }
  // Resposta fora do schema declarado é defeito nosso, não do cliente.
  if (isResponseSerializationError(error)) {
    return {
      status: 500,
      body: {
        error: 'resposta_invalida',
        message: 'a resposta não corresponde ao contrato declarado',
      },
    };
  }
  if (error instanceof PurchaseOrderNotFoundError) {
    // A nota pode estar certa e o pedido ainda não ter sido carregado: isso é
    // ausência de recurso, não divergência da nota (ADR-009).
    return {
      status: 404,
      body: { error: 'pedido_nao_encontrado', message: error.message },
    };
  }
  if (error instanceof UnknownClientError) {
    return {
      status: 404,
      body: { error: 'cliente_desconhecido', message: error.message },
    };
  }
  if (error instanceof SpoolError) {
    return {
      status: 400,
      body: { error: 'carga_invalida', message: error.message },
    };
  }
  if (error instanceof CursorError) {
    return {
      status: 400,
      body: { error: 'cursor_invalido', message: error.message },
    };
  }
  if (error instanceof FieldError || error instanceof SyntaxError) {
    // O payload chegou inteiro e não corresponde ao perfil declarado: é
    // conteúdo que não dá para processar, não requisição malformada.
    return {
      status: 422,
      body: { error: 'payload_incompativel', message: error.message },
    };
  }
  // O framework e os plugins já decidem o status de casos que eles conhecem:
  // 429 do rate limit, 413 do corpo acima do teto, 415 de tipo não suportado.
  // Sem honrar isso, tudo virava 500 — o cliente recebia "erro interno" para
  // uma recusa que ele podia corrigir. Descoberto medindo volume.
  const doFramework = frameworkStatus(error);
  if (doFramework !== null) {
    return {
      status: doFramework,
      body: {
        error: frameworkCode(doFramework),
        message: error instanceof Error ? error.message : 'requisição recusada',
      },
    };
  }
  if (isConnectionFailure(error)) {
    return {
      status: 503,
      body: {
        error: 'dependencia_indisponivel',
        message: 'o banco de dados não está acessível',
      },
    };
  }
  return {
    status: 500,
    body: {
      error: 'erro_interno',
      message: 'erro inesperado ao processar a requisição',
    },
  };
}

/** Caminho do campo e motivo, sem devolver a estrutura interna do Zod. */
function describeValidation(
  issues: readonly { instancePath?: string; message?: string }[],
): string {
  const descritos = issues
    .map((issue) => {
      const caminho = (issue.instancePath ?? '').replace(/^\//, '');
      const motivo = issue.message ?? 'valor inválido';
      return caminho === '' ? motivo : `${caminho}: ${motivo}`;
    })
    .slice(0, 10);
  return descritos.length > 0
    ? descritos.join('; ')
    : 'a requisição não corresponde ao contrato';
}

/** Status que o próprio Fastify ou um plugin já atribuiu ao erro. */
function frameworkStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const status = (error as { statusCode?: unknown }).statusCode;
  // Só 4xx: um 5xx do framework não deve escapar com a mensagem interna.
  return typeof status === 'number' && status >= 400 && status < 500
    ? status
    : null;
}

function frameworkCode(status: number): string {
  switch (status) {
    case 413:
      return 'carga_acima_do_limite';
    case 415:
      return 'tipo_nao_suportado';
    case 429:
      return 'limite_de_requisicoes';
    default:
      return 'requisicao_recusada';
  }
}

/** Códigos do `pg` para banco fora do ar ou recusando conexão. */
const connectionCodes = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  '57P03',
  '08006',
  '08001',
]);

function isConnectionFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && connectionCodes.has(code);
}
