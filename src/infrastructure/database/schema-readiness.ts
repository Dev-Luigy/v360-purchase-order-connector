import type { Pool } from 'pg';

import type { DatabaseHealth } from '../../application/ports/database-health.js';

/**
 * Prontidão que olha o schema, e não só a conexão.
 *
 * `SELECT 1` prova que o banco responde, não que ele tem tabelas. Com banco
 * vazio, o Compose marcava o container como saudável, o avaliador recebia 200
 * e todo endpoint de negócio respondia 500 (REVIEW-02, achado 2). Aqui
 * exigimos que as migrações tenham sido aplicadas de verdade.
 *
 * Migração é etapa de implantação, executada por um papel com DDL; a API só
 * confere e recusa tráfego enquanto o schema não estiver pronto. Ela nunca
 * cria nem altera schema no start (REVIEW-04, R04-05).
 */
export class SchemaReadiness implements DatabaseHealth {
  constructor(private readonly pool: Pool) {}

  async ping(): Promise<void> {
    const { rows } = await this.pool.query<{
      applied: string;
      pending: string;
      failed: string;
    }>(
      `SELECT
         count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied,
         count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS pending,
         count(*) FILTER (WHERE rolled_back_at IS NOT NULL) AS failed
       FROM "_prisma_migrations"`,
    );

    const linha = rows[0];
    if (linha === undefined) {
      throw new Error('não foi possível ler o estado das migrações');
    }
    if (Number(linha.applied) === 0) {
      throw new Error(
        'banco sem migração aplicada: execute a etapa de migração antes de servir',
      );
    }
    if (Number(linha.pending) > 0) {
      throw new Error(
        `${linha.pending} migração(ões) em andamento: o schema ainda não está estável`,
      );
    }
    if (Number(linha.failed) > 0) {
      throw new Error(
        `${linha.failed} migração(ões) revertida(s): o schema está inconsistente`,
      );
    }
  }
}

/**
 * Quando a tabela de controle não existe, o Postgres devolve `42P01`. É o caso
 * do banco recém-criado pelo Compose, e a mensagem precisa dizer isso em vez
 * de vazar erro de SQL.
 */
export function describeReadinessFailure(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '42P01'
  ) {
    return 'banco sem a tabela de controle de migrações: nenhuma migração foi aplicada';
  }
  return error instanceof Error ? error.message : String(error);
}
