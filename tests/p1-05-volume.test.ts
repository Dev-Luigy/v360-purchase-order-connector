import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { httpLimits } from '../src/presentation/http/app.js';
import { buildTestApp } from './support/build-test-app.js';

/**
 * Regressões do que a medição de volume expôs (P1-05).
 *
 * Nenhum destes defeitos aparecia em teste unitário nem na suíte de
 * integração: os dois dependiam de **muitas** requisições seguidas, que é
 * exatamente o que o enunciado descreve e nenhuma tarefa anterior exercitou.
 */
describe('P1-05: o que só apareceu sob volume', () => {
  it('recusa por excesso de requisições responde 429, não 500', async () => {
    // Teto de 1 para provocar o mesmo erro que a varredura provocou, sem
    // precisar disparar mil requisições dentro do teste.
    const { app } = await buildTestApp({
      rateLimit: { max: 1, timeWindow: '1 minute' },
    });
    after(() => app.close());

    const primeira = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(primeira.statusCode, 200);

    const segunda = await app.inject({ method: 'GET', url: '/health' });

    // Antes de P1-05 isto era 500 com "erro_interno": o @fastify/rate-limit
    // marcava o erro com statusCode 429, o handler não olhava esse campo e
    // caía no caso genérico. O cliente estrangulado não tinha como saber que
    // bastava esperar.
    assert.equal(segunda.statusCode, 429);
    const corpo = segunda.json() as { error: string; message: string };
    assert.equal(corpo.error, 'limite_de_requisicoes');
    assert.match(corpo.message, /retry|limit/i);
  });

  it('corpo acima do teto responde 413, não 500', async () => {
    const { app } = await buildTestApp();
    after(() => app.close());

    const resposta = await app.inject({
      method: 'POST',
      url: '/clients/alfa/invoice-checks',
      headers: { 'content-type': 'application/json' },
      payload: 'x'.repeat(httpLimits.bodyLimit + 1),
    });

    assert.equal(resposta.statusCode, 413);
    assert.equal(
      (resposta.json() as { error: string }).error,
      'carga_acima_do_limite',
    );
  });

  it('um 5xx do framework não escapa com a mensagem interna', async () => {
    // A faixa honrada é só 4xx, de propósito: um erro interno que por acaso
    // carregue statusCode 500 continua passando pelo caso genérico, sem expor
    // a mensagem original.
    const { app } = await buildTestApp();
    after(() => app.close());
    app.get('/quebra', () => {
      throw Object.assign(new Error('senha do banco no texto'), {
        statusCode: 500,
      });
    });

    const resposta = await app.inject({ method: 'GET', url: '/quebra' });
    assert.equal(resposta.statusCode, 500);
    const corpo = resposta.json() as { message: string };
    assert.doesNotMatch(corpo.message, /senha/);
  });

  it('o teto padrão cabe a varredura que o enunciado descreve', () => {
    // "Dezenas de milhares de pedidos em aberto", varridos em páginas de 100.
    // 50.000 pedidos são 500 requisições; o teto anterior, de 120/min,
    // estrangulava a própria operação que o sistema existe para servir.
    const pedidosDeUmClienteGrande = 50_000;
    const paginas = Math.ceil(pedidosDeUmClienteGrande / 100);
    assert.ok(
      httpLimits.rateLimit.max >= paginas,
      `teto ${String(httpLimits.rateLimit.max)}/min não cobre ${String(paginas)} páginas`,
    );
  });
});
