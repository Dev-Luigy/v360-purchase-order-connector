import { PrismaPg } from '@prisma/adapter-pg';
import type pg from 'pg';

import { PrismaClient } from './generated/client.js';
import { createPool, type PoolPurpose } from './pool.js';

/**
 * Cliente Prisma sobre um pool nosso.
 *
 * A linha 7 do Prisma não traz mais motor Rust: o acesso passa por um
 * adaptador de driver, e o nosso é `@prisma/adapter-pg`, sobre o `pg` que o
 * projeto já usava. O efeito colateral é bom — o pool deixa de ser escolha do
 * ORM e volta a ser nossa, então os presets por propósito de ADR-012 valem
 * também para o Prisma.
 */
export interface DatabaseConnection {
  readonly prisma: PrismaClient;
  readonly pool: pg.Pool;
  close(): Promise<void>;
}

export function connectDatabase(
  connectionString: string,
  purpose: PoolPurpose,
): DatabaseConnection {
  const pool = createPool(connectionString, purpose);
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  return {
    prisma,
    pool,
    async close() {
      // Ordem importa: desligar o cliente antes do pool evita consulta em voo
      // encontrando conexão já fechada.
      await prisma.$disconnect();
      await pool.end();
    },
  };
}
