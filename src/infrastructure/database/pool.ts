import pg from 'pg';

import { deepFreeze } from '../deep-freeze.js';

/**
 * Os dois caminhos de banco deste serviço têm exigências opostas, e um pool só
 * não atende os dois.
 *
 * O caminho de requisição precisa desistir rápido: `/ready` responder depressa
 * é o que faz o `healthcheck` do Compose ter sentido, e consulta de listagem
 * presa segura a conexão de todo mundo. O caminho de carga é o contrário —
 * transação por pedido sobre dezenas de milhares de registros leva o tempo que
 * levar, e `query_timeout: 3000` a mataria no meio (REVIEW-02, 10).
 *
 * Separar aqui, e não no ponto de uso, é o que impede a carga de herdar o
 * tempo limite da requisição por descuido.
 */

export type PoolPurpose = 'request' | 'ingestion';

/**
 * Congelados de verdade: `Readonly` é só de compilação, e `poolOptionsFor`
 * devolve o preset por referência. Sem congelar, quem recebesse o objeto
 * poderia alterá-lo e o preset mudaria para todo mundo — o mesmo defeito que
 * os perfis de cliente tiveram.
 */
const presets: Readonly<Record<PoolPurpose, pg.PoolConfig>> = deepFreeze({
  request: {
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
    max: 10,
  },
  ingestion: {
    // Conectar pode esperar.
    connectionTimeoutMillis: 10_000,
    // Poucas conexões de propósito: a carga é sequencial por pedido e não
    // deve competir com o caminho de requisição pelo banco.
    max: 4,
    // Limites largos, mas **finitos**. Sem tempo limite, uma carga travada em
    // lock espera para sempre e segura uma das quatro conexões até o processo
    // morrer (REVIEW-04, R04-05). Os números são folgados de propósito e
    // precisam ser medidos contra uma carga de referência antes de virarem
    // compromisso — hoje são teto de segurança, não afinação.
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
