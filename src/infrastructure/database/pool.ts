import pg from 'pg';

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

const presets: Readonly<Record<PoolPurpose, pg.PoolConfig>> = {
  request: {
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
    max: 10,
  },
  ingestion: {
    // Conectar pode esperar; a consulta, não pode ser interrompida.
    connectionTimeoutMillis: 10_000,
    // Poucas conexões de propósito: a carga é sequencial por pedido e não
    // deve competir com o caminho de requisição pelo banco.
    max: 4,
  },
};

export function poolOptionsFor(purpose: PoolPurpose): pg.PoolConfig {
  return presets[purpose];
}

export function createPool(
  connectionString: string,
  purpose: PoolPurpose,
): pg.Pool {
  return new pg.Pool({ connectionString, ...poolOptionsFor(purpose) });
}
