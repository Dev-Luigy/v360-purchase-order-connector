import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  defaultPageLimit,
  maxPageLimit,
} from '../src/application/ports/pagination.js';

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
