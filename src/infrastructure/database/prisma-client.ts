import { PrismaPg } from '@prisma/adapter-pg';
import type pg from 'pg';

import { PrismaClient } from './generated/client.js';
import { createPool, type PoolPurpose } from './pool.js';

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
      // O cliente precisa parar antes do pool que ele utiliza.
      await prisma.$disconnect();
      await pool.end();
    },
  };
}
