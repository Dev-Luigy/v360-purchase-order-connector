import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { docsPrefix } from '../src/presentation/http/openapi.js';

import { buildTestApp } from './support/build-test-app.js';

/**
 * A documentação navegável só vale se não puder mentir.
 *
 * Ela é gerada dos schemas Zod que as rotas já declaram, então o risco não é
 * o texto ficar errado — é uma rota nova aparecer no serviço e **não** no
 * documento, por esquecer o schema ou registrar fora do alcance do gerador.
 * Estes testes comparam o documento com as rotas que o Fastify de fato tem.
 */
describe('documentação da API', () => {
  let app: FastifyInstance;
  let documento: {
    readonly openapi: string;
    readonly info: { readonly title: string };
    readonly paths: Record<string, Record<string, { tags?: string[] }>>;
    readonly components?: { readonly schemas?: Record<string, unknown> };
    readonly tags?: readonly { readonly name: string }[];
  };

  before(async () => {
    ({ app } = await buildTestApp());
    await app.ready();
    const resposta = await app.inject({
      method: 'GET',
      url: `${docsPrefix}/json`,
    });
    assert.equal(resposta.statusCode, 200);
    documento = resposta.json();
  });

  after(async () => {
    await app.close();
  });

  it('cobre todas as rotas que o serviço registra', () => {
    // `printRoutes` é o que o Fastify tem, não o que nós achamos que tem. A
    // saída é uma árvore: o caminho de um nó é a concatenação com os
    // ancestrais, e o nível vem da indentação de quatro caracteres.
    const registradas = new Set<string>();
    const porNivel: string[] = [];
    for (const linha of app.printRoutes({ commonPrefix: false }).split('\n')) {
      const conteudo = /^((?:[│ ]\s{3})*)[├└]──\s(.*)$/.exec(linha);
      const recuo = conteudo?.[1];
      const resto = conteudo?.[2];
      if (recuo === undefined || resto === undefined) continue;
      const nivel = recuo.length / 4;
      const partido = /^(.*?)\s+\(([^)]+)\)\s*$/.exec(resto);
      const segmento = partido?.[1] ?? resto;
      porNivel[nivel] = segmento.trim();
      porNivel.length = nivel + 1;
      const metodos = partido?.[2];
      if (metodos === undefined) continue;
      const caminho = porNivel.join('') || '/';
      for (const metodo of metodos.split(',')) {
        const limpo = metodo.trim();
        if (limpo === 'HEAD' || limpo === 'OPTIONS') continue;
        registradas.add(`${limpo} ${caminho}`);
      }
    }

    const documentadas = new Set<string>();
    for (const [caminho, operacoes] of Object.entries(documento.paths)) {
      for (const metodo of Object.keys(operacoes)) {
        documentadas.add(`${metodo.toUpperCase()} ${caminho}`);
      }
    }

    // O documento usa `{param}` onde o Fastify usa `:param`.
    const normalizar = (rota: string) =>
      rota.replace(/:([A-Za-z0-9_]+)/g, '{$1}');

    const deNegocio = [...registradas]
      .map(normalizar)
      // A própria documentação não precisa documentar a si mesma.
      .filter((rota) => !rota.includes(docsPrefix));

    assert.ok(deNegocio.length > 0, 'nenhuma rota foi lida de printRoutes');
    const faltando = deNegocio.filter((rota) => !documentadas.has(rota));
    assert.deepEqual(
      faltando,
      [],
      `rota registrada e ausente do documento: ${faltando.join(', ')}`,
    );
  });

  it('agrupa cada rota sob uma etiqueta declarada', () => {
    const declaradas = new Set((documento.tags ?? []).map((t) => t.name));
    assert.ok(declaradas.size > 0, 'nenhuma etiqueta declarada');

    const semEtiqueta: string[] = [];
    for (const [caminho, operacoes] of Object.entries(documento.paths)) {
      for (const [metodo, operacao] of Object.entries(operacoes)) {
        const tags = operacao.tags ?? [];
        if (tags.length === 0 || !tags.every((t) => declaradas.has(t))) {
          semEtiqueta.push(`${metodo.toUpperCase()} ${caminho}`);
        }
      }
    }
    assert.deepEqual(semEtiqueta, []);
  });

  it('descreve os objetos, e não só os caminhos', () => {
    const nomes = Object.keys(documento.components?.schemas ?? {});
    // O pedido, a nota e a divergência precisam aparecer como objeto navegável;
    // sem isso a página mostra rotas e esconde o contrato.
    assert.ok(
      nomes.length > 0,
      'nenhum schema em components: o documento virou só uma lista de rotas',
    );
  });

  it('serve a página navegável', async () => {
    const resposta = await app.inject({ method: 'GET', url: docsPrefix });
    assert.ok(
      resposta.statusCode === 200 || resposta.statusCode === 302,
      `a página de documentação respondeu ${String(resposta.statusCode)}`,
    );
  });
});
