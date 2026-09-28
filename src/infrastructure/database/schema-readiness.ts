import type { Pool } from 'pg';

import type { DatabaseHealth } from '../../application/ports/database-health.js';

import { requiredMigration } from './migrations.js';

/** Prontidão exige a migração esperada; a API nunca aplica DDL no start. */
export class SchemaReadiness implements DatabaseHealth {
  constructor(
    private readonly pool: Pool,
    private readonly expected: string = requiredMigration,
  ) {}

  async ping(): Promise<void> {
    let rows: readonly MigrationRow[];
    try {
      ({ rows } = await this.pool.query<MigrationRow>(
        `SELECT finished_at, rolled_back_at
           FROM "_prisma_migrations"
          WHERE migration_name = $1`,
        [this.expected],
      ));
    } catch (error) {
      throw new Error(describeReadinessFailure(error), { cause: error });
    }

    // Uma migração reaplicada pode ter tentativas falhas e uma bem-sucedida.
    const aplicada = rows.some(
      (linha) => linha.finished_at !== null && linha.rolled_back_at === null,
    );
    if (aplicada) return;

    if (rows.length === 0) {
      throw new Error(
        `migração ${this.expected} não foi aplicada: execute a etapa de migração antes de servir`,
      );
    }
    if (rows.some((linha) => linha.finished_at === null)) {
      throw new Error(
        `migração ${this.expected} não terminou: o schema ainda não está estável`,
      );
    }
    throw new Error(
      `migração ${this.expected} foi revertida e não reaplicada: o schema está inconsistente`,
    );
  }
}

interface MigrationRow {
  readonly finished_at: Date | null;
  readonly rolled_back_at: Date | null;
}

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
