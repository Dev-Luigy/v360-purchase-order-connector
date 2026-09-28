import pg from 'pg';

import { deepFreeze } from '../deep-freeze.js';

export type PoolPurpose = 'request' | 'ingestion';

// Os presets são compartilhados por referência e precisam ser imutáveis em runtime.
const presets: Readonly<Record<PoolPurpose, pg.PoolConfig>> = deepFreeze({
  request: {
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
    max: 10,
  },
  ingestion: {
    connectionTimeoutMillis: 10_000,
    // A carga sequencial não deve competir com requisições por conexões.
    max: 4,
    // Tetos de segurança; devem ser calibrados com carga real.
    query_timeout: 300_000,
    statement_timeout: 300_000,
    lock_timeout: 30_000,
    idle_in_transaction_session_timeout: 60_000,
  },
});

export function poolOptionsFor(purpose: PoolPurpose): pg.PoolConfig {
  return presets[purpose];
}

export function createPool(
  connectionString: string,
  purpose: PoolPurpose,
): pg.Pool {
  return new pg.Pool({ connectionString, ...poolOptionsFor(purpose) });
}
