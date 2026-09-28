/**
 * Prova que pedidos **e** histórico de conferências sobrevivem a uma parada do
 * banco — exigência explícita do enunciado.
 *
 * Fica fora da suíte de teste de propósito: reiniciar container é operação de
 * ambiente, lenta e dependente do Docker, e misturá-la com os testes tornaria
 * `npm run test:integration` refém dele.
 *
 *   docker compose up -d db
 *   node --env-file=.env scripts/verify-persistence.mjs
 */

import { execFileSync } from 'node:child_process';

import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL ausente: rode com --env-file=.env');
  process.exit(1);
}

const compose = (...args) =>
  execFileSync('docker', ['compose', ...args], { encoding: 'utf-8' });

async function contar(rotulo) {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    const { rows } = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM purchase_order) AS pedidos,
         (SELECT count(*)::int FROM purchase_order_item) AS itens,
         (SELECT count(*)::int FROM conference) AS conferencias,
         (SELECT count(*)::int FROM conference_divergence) AS divergencias`,
    );
    const totais = rows[0];
    console.log(
      `  ${rotulo.padEnd(18)} pedidos=${totais.pedidos} itens=${totais.itens} ` +
        `conferencias=${totais.conferencias} divergencias=${totais.divergencias}`,
    );
    return totais;
  } finally {
    await pool.end();
  }
}

async function semear() {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await pool.query(
      'TRUNCATE TABLE "conference_divergence", "conference", "purchase_order_item", "purchase_order" CASCADE',
    );
    const { rows } = await pool.query(
      `INSERT INTO purchase_order
         (id, client_id, external_number, supplier_tax_id, supplier_name,
          currency, status, issued_on, ingestion_version, ingested_at,
          has_pending_balance)
       VALUES (gen_random_uuid(), 'alfa', 'PERSIST-1', '23456789000101',
               'Fornecedor', 'BRL', 'aberto', DATE '2026-08-05', 1, now(), true)
       RETURNING id`,
    );
    const orderId = rows[0].id;
    await pool.query(
      `INSERT INTO purchase_order_item
         (id, purchase_order_id, external_line, material, description,
          purchase_unit, conversion_factor, quantity_ordered, quantity_received,
          quantity_pending, unit_price)
       VALUES (gen_random_uuid(), $1, 10, 'MAT-1001', 'Chapa', 'UN',
               1.000000, 100.000000, 60.000000, 40.000000, 45.900000)`,
      [orderId],
    );
    const conferencia = await pool.query(
      `INSERT INTO conference
         (id, purchase_order_id, purchase_order_ingestion_version, client_id,
          checked_at, outcome, invoice)
       VALUES (gen_random_uuid(), $1, 1, 'alfa', now(), 'reprovada',
               '{"clientId":"alfa","purchaseOrderNumber":"PERSIST-1","supplierTaxId":"23456789000101","lines":[{"material":"MAT-1001","quantity":"999","totalValue":"1.00"}]}'::jsonb)
       RETURNING id`,
      [orderId],
    );
    await pool.query(
      `INSERT INTO conference_divergence
         (id, conference_id, position, code, field, invoice_line_index,
          purchase_order_line, expected, received)
       VALUES (gen_random_uuid(), $1, 0, 'QUANTIDADE_ACIMA_DO_SALDO',
               'items[].quantityPending', 0, 10, '40.000000', '999')`,
      [conferencia.rows[0].id],
    );
  } finally {
    await pool.end();
  }
}

console.log('semeando pedido, item, conferência e divergência…');
await semear();
const antes = await contar('antes');

console.log('reiniciando o container do banco…');
compose('restart', 'db');
// O healthcheck do Compose é quem sabe quando o banco voltou a aceitar conexão.
for (let tentativa = 0; tentativa < 30; tentativa += 1) {
  const estado = compose('ps', '--format', '{{.Service}} {{.Health}}');
  if (estado.includes('db healthy')) break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

const depois = await contar('depois');

const iguais = ['pedidos', 'itens', 'conferencias', 'divergencias'].every(
  (chave) => antes[chave] === depois[chave] && depois[chave] > 0,
);
console.log(
  iguais
    ? '\nOK: pedidos e histórico de conferências sobreviveram ao reinício.'
    : '\nFALHOU: a contagem mudou depois do reinício.',
);
process.exit(iguais ? 0 : 1);
