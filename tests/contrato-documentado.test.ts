import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  defaultPageLimit,
  maxPageLimit,
} from '../src/application/ports/pagination.js';
import {
  conferenceRecordSchema,
  conferenceSummarySchema,
  ingestionReportSchema,
} from '../src/domain/schemas.js';

/**
 * `docs/API.md` é contrato publicado: o avaliador lê a documentação e espera
 * que o serviço responda a ela.
 *
 * O cabeçalho da ingestão tinha derivado — a doc dizia
 * `X-Source-Format-Version` e o código exigia `x-format-version`, então quem
 * seguisse a documentação recebia 400. Uma linha contra dezesseis referências
 * no código: ninguém forçava as duas a concordar. Encontrado em P1-05.
 */
const api = await readFile(new URL('../docs/API.md', import.meta.url), 'utf-8');
const rota = await readFile(
  new URL('../src/presentation/http/routes/ingestions.ts', import.meta.url),
  'utf-8',
);
const problema = await readFile(
  new URL('../src/presentation/http/problem.ts', import.meta.url),
  'utf-8',
);
const rotasDeNegocio = await Promise.all(
  ['conferences', 'ingestions', 'purchase-orders'].map((nome) =>
    readFile(
      new URL(`../src/presentation/http/routes/${nome}.ts`, import.meta.url),
      'utf-8',
    ),
  ),
);

describe('a documentação e o código concordam', () => {
  it('o cabeçalho da ingestão é o mesmo nos dois', () => {
    const noCodigo = /'(x-[a-z-]*format-version)'/.exec(rota)?.[1];
    assert.ok(noCodigo, 'não achei o cabeçalho no schema da rota');

    const naDoc = /^([A-Za-z-]*Format-Version):/m.exec(api)?.[1];
    assert.ok(naDoc, 'não achei o cabeçalho em docs/API.md');

    assert.equal(naDoc.toLowerCase(), noCodigo);
  });

  it('os nomes de parte da ingestão são os mesmos nos dois', () => {
    // A doc anunciava `purchase-orders`, `cabecalho` e `itens`; o código
    // aceita `orders`, `headers` e `items`. Errava **todos** os nomes da
    // Parte 1: quem seguisse a documentação não conseguia carregar nada.
    const bloco = /const partsByFormat[^}]+}/.exec(rota)?.[0];
    assert.ok(bloco, 'não achei partsByFormat na rota');
    const noCodigo = [...bloco.matchAll(/'([a-z-]+)'(?=[,\]])/g)].map(
      (m) => m[1],
    );
    assert.ok(noCodigo.length >= 3, `partes no código: ${noCodigo.join(',')}`);

    // A doc precisa citar cada nome que o código aceita, como implementado.
    const implementadas = /Implementadas:([^.]+)\./.exec(api)?.[1] ?? '';
    for (const parte of noCodigo) {
      assert.ok(
        implementadas.includes(`\`${parte}\``),
        `docs/API.md não documenta a parte "${parte}"`,
      );
    }
  });

  it('todo código de erro que o serviço emite está documentado', () => {
    // A doc anunciava `{ "error": { "code": "CURSOR_INVALIDO" } }` e o serviço
    // responde `{ "error": "cursor_invalido" }`: forma diferente e caixa
    // diferente. Quem integrasse lendo a documentação escreveria
    // `err.error.code` e receberia `undefined` em toda recusa — e dois dos seis
    // códigos listados nem existiam no código.
    //
    // Mesma classe do cabeçalho e dos nomes de parte: duas fontes de verdade
    // que ninguém obrigava a concordar.
    const emitidos = new Set(
      [...problema.matchAll(/error: '([a-z_]+)'/g)].map((m) => m[1]),
      // `frameworkCode` devolve os códigos por `return`, não por `error:`.
    );
    for (const achado of problema.matchAll(/return '([a-z_]+)';/g)) {
      emitidos.add(achado[1]);
    }
    for (const arquivo of rotasDeNegocio) {
      for (const achado of arquivo.matchAll(/error: '([a-z_]+)'/g)) {
        emitidos.add(achado[1]);
      }
    }
    assert.ok(emitidos.size >= 10, `poucos códigos lidos: ${emitidos.size}`);

    const documentados = new Set(
      [...api.matchAll(/^\| `([a-z_]+)`\s*\|/gm)].map((m) => m[1]),
    );
    const faltando = [...emitidos].filter((c) => !documentados.has(c)).sort();
    assert.deepEqual(
      faltando,
      [],
      `o serviço emite código que docs/API.md não documenta: ${faltando.join(', ')}`,
    );

    // E o contrário: a doc não pode anunciar código que não existe.
    const inventados = [...documentados].filter((c) => !emitidos.has(c)).sort();
    assert.deepEqual(
      inventados,
      [],
      `docs/API.md documenta código que o serviço não emite: ${inventados.join(', ')}`,
    );
  });

  it('os exemplos publicados têm os campos que o schema declara', () => {
    // Não basta a lista de rotas e os códigos baterem: o exemplo é o que um
    // integrador copia. O relatório de carga estava publicado sem
    // `rejectedTotal`/`stagedTotal` — quem lesse acharia que `rejected.length`
    // é o total, quando a lista tem teto de 100 — e a conferência aparecia sem
    // `invoice`, que é justamente o que o histórico existe para guardar.
    const blocos = [...api.matchAll(/```json\n([\s\S]*?)```/g)]
      .map((achado) => achado[1])
      .filter((bruto): bruto is string => bruto !== undefined)
      .map((bruto): unknown => {
        try {
          return JSON.parse(bruto);
        } catch {
          return null;
        }
      })
      .filter((valor): valor is Record<string, unknown> => valor !== null);

    const casos = [
      ['relatório de carga', ingestionReportSchema, 'ingestionId'],
      ['conferência', conferenceRecordSchema, 'checkedAt'],
      ['resumo de conferências', conferenceSummarySchema, 'divergencesByCode'],
    ] as const;

    for (const [nome, schema, marcador] of casos) {
      // O exemplo é reconhecido por um campo que só ele tem.
      const exemplo = blocos.find((b) => marcador in b);
      assert.ok(exemplo, `docs/API.md não publica exemplo de ${nome}`);

      const doSchema = Object.keys(schema.shape).sort();
      const doExemplo = Object.keys(exemplo).sort();
      assert.deepEqual(
        doExemplo,
        doSchema,
        `o exemplo de ${nome} em docs/API.md não tem os campos da resposta`,
      );
    }
  });

  it('a forma do erro documentada é a que o schema declara', () => {
    // `problemSchema` é plano. Se a doc voltar a mostrar `error` como objeto,
    // o exemplo publicado deixa de corresponder à resposta.
    assert.match(
      problema,
      /error: z\.string\(\)/,
      'problemSchema deixou de ter `error` como string',
    );
    const exemplo = /```json\n(\{\n\s+"error":[\s\S]*?)```/.exec(api)?.[1];
    assert.ok(exemplo, 'não achei o exemplo de erro em docs/API.md');
    const corpo: unknown = JSON.parse(exemplo);
    assert.equal(
      typeof (corpo as { error: unknown }).error,
      'string',
      'o exemplo de erro publicado não é plano como o schema',
    );
  });

  it('os limites de página documentados são os que o código aplica', () => {
    // O enunciado exige tamanho padrão e teto declarados; se a doc anunciar
    // um número e o código aplicar outro, a exigência está só aparentemente
    // atendida.
    assert.match(api, new RegExp(`limit=${String(defaultPageLimit)}\\b`));
    assert.ok(
      api.includes(String(maxPageLimit)),
      `docs/API.md não menciona o teto ${String(maxPageLimit)}`,
    );
  });
});

const servidor = await readFile(
  new URL('../src/main/server.ts', import.meta.url),
  'utf-8',
);

/**
 * O preset de ingestão existia desde P1-02 e **nada o usava**: a composição
 * criava só o pool de requisição, e um comentário afirmava o contrário. Cargas
 * longas rodavam com tempo limite de 3 segundos (REVIEW-09, R09-07).
 *
 * Testar os presets isoladamente não pegava isso, porque o defeito estava na
 * ligação entre eles — a mesma classe de "duas fontes que ninguém obriga a
 * concordar" de FIX-05 e do cabeçalho da ingestão.
 */
describe('a composição usa os pools que declara', () => {
  it('cria uma conexão por propósito declarado', () => {
    for (const proposito of ['request', 'ingestion']) {
      assert.ok(
        servidor.includes(`connectDatabase(env.DATABASE_URL, '${proposito}')`),
        `nenhuma conexão criada com o propósito ${proposito}`,
      );
    }
  });

  it('a ingestão recebe o repositório do pool de carga', () => {
    const chamada =
      /ingest: new IngestPurchaseOrders\(([\s\S]*?)\n {2}\),/.exec(
        servidor,
      )?.[1];
    assert.ok(chamada, 'não achei a composição da ingestão');
    assert.match(
      chamada,
      /ingestionOrderRepository/,
      'a carga voltou a usar o repositório do pool de requisição',
    );
  });

  it('todos os pools criados são fechados no encerramento', () => {
    const criados = [
      ...servidor.matchAll(/const (\w+) = connectDatabase\(/g),
    ].map((m) => m[1]);
    assert.ok(criados.length >= 2);
    const fechamento = /onClose[\s\S]*?\n\}\);/.exec(servidor)?.[0] ?? '';
    for (const nome of criados) {
      assert.ok(
        fechamento.includes(`${String(nome)}.close()`),
        `${String(nome)} não é fechado no encerramento`,
      );
    }
  });
});

const schema = await readFile(
  new URL('../prisma/schema.prisma', import.meta.url),
  'utf-8',
);

/**
 * A varredura noturna por cursor ordena por `id` e pede `id > cursor`. Isso só
 * não pula pedido porque o identificador é **monotônico**: uma linha inserida
 * durante a varredura recebe um id maior que a posição atual e vai para o fim,
 * em vez de cair antes dela e nunca ser vista.
 *
 * Trocar `uuid(7)` por `uuid(4)` quebraria isso em silêncio — a suíte inteira
 * continuaria verde, porque nenhum teste unitário insere durante uma
 * varredura. `scripts/validate-sweep-under-load.mjs` prova o comportamento;
 * esta trava aponta a causa.
 */
describe('a paginação depende de identificador monotônico', () => {
  it('todas as tabelas usam uuid(7), não uuid(4)', () => {
    const versoes = [...schema.matchAll(/@default\(uuid\((\d)\)\)/g)].map(
      (achado) => achado[1],
    );
    assert.ok(versoes.length > 0, 'nenhum id com uuid() no schema');
    for (const versao of versoes) {
      assert.equal(
        versao,
        '7',
        'uuid não monotônico: a varredura por cursor passaria a pular pedidos ' +
          'inseridos durante ela, sem nenhum teste ficar vermelho',
      );
    }
  });
});
