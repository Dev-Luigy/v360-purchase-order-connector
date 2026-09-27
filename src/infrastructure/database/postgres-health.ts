import type { Pool } from 'pg';
import type { DatabaseHealth } from '../../application/ports/database-health.js';
export class PostgresHealth implements DatabaseHealth {
  constructor(private readonly pool: Pool) {}
  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }
}
