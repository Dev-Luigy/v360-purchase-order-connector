import type { Pool } from 'pg';

import type { DatabaseHealth } from '../../application/ports/database-health.js';

import { requiredMigration } from './migrations.js';

/**
 * Prontidão que olha o schema, e não só a conexão.
 *
 * `SELECT 1` prova que o banco responde, não que ele tem as tabelas certas.
 * Com banco vazio, o Compose marcava o container como saudável, o avaliador
 * recebia 200 e todo endpoint de negócio respondia 500 (REVIEW-02, achado 2).
 *
 * Conferimos a migração **nomeada** que este artefato exige, e não apenas se
 * existe alguma aplicada: migração que ainda não rodou não deixa rastro na
 * tabela de controle, então contar linhas deixaria um banco desatualizado
 * passar por pronto (REVIEW-05, achado 2).
 *
 * Migração é etapa de implantação, executada por um papel com DDL; a API só
 * confere e recusa tráfego enquanto o schema não estiver pronto. Ela nunca
 * cria nem altera schema no start (REVIEW-04, R04-05).
 */
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

    const linha = rows[0];
    if (linha === undefined) {
      throw new Error(
        `migração ${this.expected} não foi aplicada: execute a etapa de migração antes de servir`,
      );
    }
    if (linha.rolled_back_at !== null) {
      throw new Error(
        `migração ${this.expected} foi revertida: o schema está inconsistente`,
      );
    }
    if (linha.finished_at === null) {
      // Aplicação interrompida no meio deixa a linha sem `finished_at`. Pode
      // ser uma migração em curso agora ou uma que morreu; em ambos os casos o
      // schema não é confiável para servir tráfego.
      throw new Error(
        `migração ${this.expected} não terminou: o schema ainda não está estável`,
      );
    }
  }
}

interface MigrationRow {
  readonly finished_at: Date | null;
  readonly rolled_back_at: Date | null;
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
