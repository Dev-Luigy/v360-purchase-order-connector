import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import type { FastifyInstance } from 'fastify';

import { buildTestApp, multipartBody } from './support/build-test-app.js';

/**
 * Relatório de conferências: o requisito 3 do enunciado — quantas notas
 * passaram, quantas travaram e por quais motivos.
 */

const notaBase = {
  clientId: 'alfa',
  purchaseOrderNumber: '4500001234',
  supplierTaxId: '23456789000101',
};

async function comHistorico(): Promise<FastifyInstance> {
  const { app } = await buildTestApp();
  const conteudo = await readFile(
    new URL('./fixtures/alfa/purchase-orders.json', import.meta.url),
    'utf-8',
  );
  const { body, headers } = multipartBody([
    { name: 'orders', filename: 'a.json', content: conteudo },
  ]);
  await app.inject({
    method: 'POST',
    url: '/clients/alfa/ingestions',
    headers: { ...headers, 'x-format-version': '1' },
    payload: body,
  });

  const conferir = (lines: unknown) =>
    app.inject({
      method: 'POST',
      url: '/conferences',
      payload: { ...notaBase, lines },
    });

  // Uma aprovada.
  await conferir([
    { material: 'MAT-1001', quantity: '40', totalValue: '1836.00' },
  ]);
  // Uma reprovada por valor.
  await conferir([
    { material: 'MAT-1001', quantity: '40', totalValue: '1.00' },
  ]);
  // Uma reprovada com **duas** divergências: é o que faz a soma por código
  // não fechar com o total de reprovadas.
  await conferir([
    { material: 'MAT-9999', quantity: '1', totalValue: '10.00' },
    { material: 'MAT-1001', quantity: '999', totalValue: '1.00' },
  ]);

  return app;
}

interface Resumo {
  checked: number;
  approved: number;
  rejected: number;
  divergencesByCode: Record<string, number>;
}

test('o resumo conta nota e conta ocorrência separadamente', async (t) => {
  const app = await comHistorico();
  t.after(() => app.close());

  const resposta = await app.inject('/conferences/summary');
  assert.equal(resposta.statusCode, 200);

  const resumo = resposta.json() as Resumo;
  assert.equal(resumo.checked, 3);
  assert.equal(resumo.approved, 1);
  assert.equal(resumo.rejected, 2);

  const ocorrencias = Object.values(resumo.divergencesByCode).reduce(
    (total, quantidade) => total + quantidade,
    0,
  );
  assert.equal(
    ocorrencias > resumo.rejected,
    true,
    'a soma por código não fecha com o total de reprovadas (ADR-009)',
  );
  assert.equal(resumo.divergencesByCode.VALOR_TOTAL_DIVERGENTE, 2);
  assert.equal(resumo.divergencesByCode.MATERIAL_NAO_ENCONTRADO, 1);
  assert.equal(
    resumo.divergencesByCode.PEDIDO_NAO_ABERTO,
    undefined,
    'código sem ocorrência não aparece, em vez de vir zerado',
  );
});

test('o histórico é paginado e filtrável pelos mesmos filtros', async (t) => {
  const app = await comHistorico();
  t.after(() => app.close());

  const tudo = await app.inject('/conferences');
  assert.equal(tudo.statusCode, 200);
  const pagina = tudo.json() as {
    data: { outcome: string }[];
    page: { limit: number; hasMore: boolean };
  };
  assert.equal(pagina.data.length, 3);
  assert.equal(pagina.page.limit, 50);

  const reprovadas = await app.inject('/conferences?outcome=reprovada');
  assert.equal((reprovadas.json() as { data: unknown[] }).data.length, 2);

  const porCodigo = await app.inject(
    '/conferences?divergenceCode=MATERIAL_NAO_ENCONTRADO',
  );
  assert.equal((porCodigo.json() as { data: unknown[] }).data.length, 1);

  const limitada = await app.inject('/conferences?limit=1');
  const primeira = limitada.json() as {
    data: unknown[];
    page: { hasMore: boolean };
  };
  assert.equal(primeira.data.length, 1);
  assert.equal(primeira.page.hasMore, true);
});

test('o resumo aceita os mesmos filtros da lista', async (t) => {
  const app = await comHistorico();
  t.after(() => app.close());

  const resposta = await app.inject('/conferences/summary?outcome=aprovada');
  const resumo = resposta.json() as Resumo;
  assert.equal(resumo.checked, 1);
  assert.equal(resumo.approved, 1);
  assert.equal(resumo.rejected, 0);
  assert.deepEqual(resumo.divergencesByCode, {});
});

test('o histórico devolve a nota conferida e a versão do pedido', async (t) => {
  const app = await comHistorico();
  t.after(() => app.close());

  const resposta = await app.inject('/conferences?limit=1');
  const registro = (
    resposta.json() as {
      data: {
        invoice: { lines: unknown[] };
        purchaseOrderIngestionVersion: number;
        divergences: unknown[];
      }[];
    }
  ).data[0];

  // O retrato do que foi comparado, não só o resultado (ADR-009).
  assert.equal(registro?.invoice.lines.length, 1);
  assert.equal(registro?.purchaseOrderIngestionVersion, 1);
  assert.deepEqual(registro?.divergences, []);
});

test('filtro de relatório fora do contrato é recusado na borda', async (t) => {
  const { app } = await buildTestApp();
  t.after(() => app.close());

  for (const query of [
    '/conferences?outcome=talvez',
    '/conferences?divergenceCode=INVENTADO',
    '/conferences?from=2026-09-27',
    '/conferences/summary?limit=abc',
  ]) {
    const resposta = await app.inject(query);
    assert.equal(resposta.statusCode, 400, query);
  }
});

test('summary não é lido como identificador de conferência', async (t) => {
  const { app } = await buildTestApp();
  t.after(() => app.close());

  const resposta = await app.inject('/conferences/summary');
  assert.equal(resposta.statusCode, 200);
});
