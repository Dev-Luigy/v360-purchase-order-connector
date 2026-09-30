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

/**
 * Tempo que uma transação interativa do Prisma pode durar, por propósito.
 *
 * É um mecanismo **diferente** dos tetos acima: `statement_timeout` é do
 * PostgreSQL e limita uma instrução; este é do Prisma e limita a transação
 * inteira, do `$transaction` ao retorno. Sem declará-lo vale o padrão de 5s da
 * biblioteca, e aí o preset de ingestão promete transação longa que a camada
 * de cima corta — o pedido no teto de itens fica a poucos segundos do limite,
 * e o estouro chega como `erro_interno` 500, sem dizer o que houve.
 *
 * O valor da carga fica abaixo do `statement_timeout` de propósito: quem
 * decide o fim é o PostgreSQL, com a transação já desfeita, e não um
 * cancelamento do cliente sobre uma transação ainda aberta no servidor.
 */
export const transactionTimeoutMs: Readonly<Record<PoolPurpose, number>> = {
  request: 5_000,
  ingestion: 120_000,
};

export function createPool(
  connectionString: string,
  purpose: PoolPurpose,
): pg.Pool {
  return new pg.Pool({ connectionString, ...poolOptionsFor(purpose) });
}
