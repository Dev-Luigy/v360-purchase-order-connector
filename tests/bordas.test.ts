import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import {
  maxCursorLength,
  maxStagedRawCharacters,
} from '../src/domain/limits.js';
import {
  transactionTimeoutMs,
  poolOptionsFor,
} from '../src/infrastructure/database/pool.js';

import { buildTestApp, multipartBody } from './support/build-test-app.js';

/**
 * Bordas que funcionavam sem nada provar.
 *
 * Uma auditoria de cobertura mostrou que `maxCursorLength` e
 * `maxStagedRawCharacters` não eram exercitados por teste nenhum. Os dois
 * estavam corretos quando sondados contra a aplicação real — mas apagar a
 * guarda não deixaria nada vermelho, que é a definição de limite não coberto.
 */
describe('limites da borda HTTP', () => {
  let app: FastifyInstance;

  before(async () => {
    ({ app } = await buildTestApp());
    await app.ready();
  });

  after(async () => {
    await app.close();
  });

  it('cursor acima do teto é recusado antes de ser decodificado', async () => {
    // O teto existe para a borda recusar sem gastar decodificação em entrada
    // arbitrária. Precisa ser 400 de contrato, não 500 nem 400 de cursor
    // inválido: o cursor nem chegou a ser lido.
    const resposta = await app.inject({
      method: 'GET',
      url: `/purchase-orders?cursor=${'A'.repeat(maxCursorLength + 1)}`,
    });

    assert.equal(resposta.statusCode, 400);
    assert.equal(resposta.json().error, 'requisicao_invalida');
  });

  it('o teto do cursor é um número que serve para alguma coisa', async () => {
    // A asserção acima monta a entrada **a partir da constante**, então ela
    // acompanha qualquer valor: com o teto em 100.000 ela continuaria passando
    // e a guarda não guardaria nada. Um cursor legítimo tem cerca de oitenta
    // caracteres; um de mil não pode ser aceito.
    assert.ok(
      maxCursorLength < 1024,
      `teto de cursor grande demais para servir de guarda: ${String(maxCursorLength)}`,
    );

    const resposta = await app.inject({
      method: 'GET',
      url: `/purchase-orders?cursor=${'A'.repeat(1024)}`,
    });
    assert.equal(resposta.statusCode, 400);
    assert.equal(resposta.json().error, 'requisicao_invalida');
  });

  it('cursor no teto exato passa da validação de tamanho', async () => {
    // Sem este lado, a asserção acima passaria com um teto errado — ou com um
    // schema que recusasse todo cursor.
    const resposta = await app.inject({
      method: 'GET',
      url: `/purchase-orders?cursor=${'A'.repeat(maxCursorLength)}`,
    });

    // Chega a ser decodificado, e aí sim é recusado por não ser um cursor.
    assert.equal(resposta.statusCode, 400);
    assert.equal(resposta.json().error, 'cursor_invalido');
  });

  it('o conteúdo cru de um item em espera tem teto', async () => {
    // `raw` guarda o objeto **de origem**, não o item já validado: um campo
    // fora do contrato entra inteiro nele. Sem teto, um registro gigante vai
    // para o banco e volta no relatório da carga.
    const gigante = 'Z'.repeat(maxStagedRawCharacters * 4);
    const { body, headers } = multipartBody([
      {
        name: 'items',
        filename: 'items.json',
        content: JSON.stringify({
          items: [
            {
              purchase_order: 'BORDA-RAW',
              created_at: '2026-09-30',
              line: 1,
              material: 'EMB-1',
              description: 'item de borda',
              uom: 'UN',
              quantity_ordered: 1,
              quantity_received: 0,
              unit_price: 1.0,
              campo_fora_do_contrato: gigante,
            },
          ],
        }),
      },
    ]);

    const resposta = await app.inject({
      method: 'POST',
      url: '/clients/delta/ingestions',
      headers: { ...headers, 'x-format-version': '1' },
      payload: body,
    });

    assert.equal(resposta.statusCode, 200);
    const relatorio = resposta.json();
    assert.equal(relatorio.stagedTotal, 1);
    const [emEspera] = relatorio.staged;
    assert.equal(
      emEspera.raw.length,
      maxStagedRawCharacters,
      'o conteúdo cru entrou sem o teto',
    );
    // E o item validado atravessou inteiro: o teto corta o cru, não o dado.
    assert.equal(relatorio.rejectedTotal, 0);
  });
});

/**
 * O teto de duração da transação é do Prisma e é **outro** mecanismo que os
 * tempos do PostgreSQL no preset. Enquanto ele não era declarado, o preset de
 * ingestão prometia transação longa e a biblioteca cortava em 5s.
 */
describe('os tempos de transação concordam com os do pool', () => {
  it('a carga aceita transação mais longa que a requisição', () => {
    assert.ok(
      transactionTimeoutMs.ingestion > transactionTimeoutMs.request,
      'a carga não tem mais folga que o caminho de requisição',
    );
  });

  it('quem decide o fim é o PostgreSQL, não o cliente', () => {
    // Se o teto do Prisma passar do `statement_timeout`, o cancelamento vem do
    // cliente com a transação ainda aberta no servidor. O contrário — servidor
    // primeiro — encerra com a transação já desfeita.
    for (const proposito of ['request', 'ingestion'] as const) {
      const doPostgres = poolOptionsFor(proposito).statement_timeout;
      if (typeof doPostgres !== 'number') continue;
      assert.ok(
        transactionTimeoutMs[proposito] < doPostgres,
        `o teto de transação de ${proposito} passou do statement_timeout`,
      );
    }
  });
});

/**
 * `X-Forwarded-For` é cabeçalho que o cliente escreve. Honrá-lo sem proxy na
 * frente deixa qualquer um escolher o próprio IP — e escapar do teto por
 * origem mandando um valor novo a cada requisição. Ignorá-lo atrás de um proxy
 * faz o contrário: todos os clientes chegam com o IP do proxy e dividem uma
 * quota só. Os dois extremos erram, então a confiança é declarada no ambiente.
 */
describe('de quem é o IP de origem', () => {
  const comoSeFosseOutro = { 'x-forwarded-for': '203.0.113.7' };

  /** O IP que o Fastify resolveu, que é o que o teto por origem usa. */
  async function ipResolvido(trustProxy?: string): Promise<string> {
    const { app } = await buildTestApp(
      trustProxy === undefined ? {} : { trustProxy },
    );
    try {
      let visto = '';
      // Antes do `ready`: o Fastify recusa `addHook` depois que a instância
      // está de pé.
      app.addHook('onRequest', (requisicao, _resposta, segue) => {
        visto = requisicao.ip;
        segue();
      });
      await app.ready();
      await app.inject({
        method: 'GET',
        url: '/health',
        headers: comoSeFosseOutro,
      });
      return visto;
    } finally {
      await app.close();
    }
  }

  it('sem proxy declarado, o cabeçalho do cliente é ignorado', async () => {
    const ip = await ipResolvido();
    assert.notEqual(
      ip,
      '203.0.113.7',
      'o cliente escolheu o próprio IP e escaparia do teto por origem',
    );
  });

  it('com o proxy declarado, o cabeçalho passa a valer', async () => {
    // Sem este lado, a asserção acima passaria também num serviço que nunca
    // olha o cabeçalho — inclusive num que não soubesse ler proxy nenhum.
    assert.equal(await ipResolvido('127.0.0.1'), '203.0.113.7');
  });
});

/**
 * Corpo multipart ilegível é erro de quem enviou.
 *
 * Descoberto testando a coleção `.http` num cliente que monta as linhas com
 * LF: multipart exige CRLF, o parser lança `Unexpected end of multipart data`
 * — um `Error` simples, sem `statusCode` — e isso caía no `erro_interno` 500.
 * Quem integra recebia "defeito interno" para um problema que era dele.
 */
describe('multipart que o servidor não consegue ler', () => {
  it('é 400 do cliente, não 500 nosso', async () => {
    const { app } = await buildTestApp();
    await app.ready();
    try {
      const corpo = [
        '--limite',
        'Content-Disposition: form-data; name="orders"; filename="o.json"',
        'Content-Type: application/json',
        '',
        '{"purchase_orders":[]}',
        '--limite--',
        '',
        // LF puro, de propósito: é o que torna o corpo ilegível.
      ].join('\n');

      const resposta = await app.inject({
        method: 'POST',
        url: '/clients/alfa/ingestions',
        headers: {
          'x-format-version': '1',
          'content-type': 'multipart/form-data; boundary=limite',
        },
        payload: corpo,
      });

      assert.equal(resposta.statusCode, 400);
      assert.equal(resposta.json().error, 'carga_invalida');
    } finally {
      await app.close();
    }
  });

  it('o mesmo corpo com CRLF é aceito', async () => {
    // Sem este lado, a asserção acima passaria num serviço que recusasse todo
    // multipart — inclusive o válido.
    const { app } = await buildTestApp();
    await app.ready();
    try {
      const corpo = [
        '--limite',
        'Content-Disposition: form-data; name="orders"; filename="o.json"',
        'Content-Type: application/json',
        '',
        '{"purchase_orders":[]}',
        '--limite--',
        '',
      ].join('\r\n');

      const resposta = await app.inject({
        method: 'POST',
        url: '/clients/alfa/ingestions',
        headers: {
          'x-format-version': '1',
          'content-type': 'multipart/form-data; boundary=limite',
        },
        payload: corpo,
      });

      assert.equal(resposta.statusCode, 200);
      assert.equal(resposta.json().ordersAccepted, 0);
    } finally {
      await app.close();
    }
  });
});
