import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// O gerador é script de ferramenta em JavaScript, sem tipos próprios: o
// `import` dinâmico mantém a checagem de tipos do resto da suíte intacta.
// O caminho vai por variável de propósito: o gerador é JavaScript de
// ferramenta, sem declaração de tipos, e resolvê-lo estaticamente faria o
// `tsc` do projeto exigir uma que não existe. O formato importado é
// declarado logo abaixo e verificado pelos próprios testes.
const caminhoDoGerador = '../scripts/evidence.mjs';
const gerador = (await import(caminhoDoGerador)) as {
  FalhaDeMedicao: new (mensagem: string) => Error;
  integracaoPreservada: (anterior: string) => string;
  marcador: RegExp;
  suite: (rotulo: string, saida: string) => { testes: number; pulados: number };
};
const { FalhaDeMedicao, integracaoPreservada, marcador, suite } = gerador;

/**
 * O gerador de evidência existe para os números pararem de derivar. Se ele
 * publicar número de execução que falhou, é pior do que não existir: publica
 * com a autoridade de ter medido (REVIEW-11).
 */
describe('gerador de evidência', () => {
  const saida = (testes: number, falhas: number, pulados = 0) =>
    `ℹ tests ${String(testes)}\nℹ pass ${String(testes - falhas)}\nℹ fail ${String(falhas)}\nℹ skipped ${String(pulados)}`;

  it('aceita suíte verde e devolve a contagem', () => {
    const lido = suite('check', saida(225, 0, 16));
    assert.equal(lido.testes, 225);
    assert.equal(lido.pulados, 16);
  });

  it('recusa suíte com falha, em vez de publicar o número', () => {
    assert.throws(
      () => suite('check', saida(225, 3)),
      (erro: unknown) =>
        erro instanceof FalhaDeMedicao && /3 falha/.test(String(erro)),
    );
  });

  it('recusa saída que não tem contagem', () => {
    assert.throws(
      () => suite('check', 'npm ERR! algo explodiu antes de rodar'),
      FalhaDeMedicao,
    );
  });

  it('preserva a integração anterior, marcada como não medida', () => {
    const anterior =
      '- `npm run check`: **225 testes, 0 falhas** (209 rodam sem banco). ' +
      '`npm run test:integration`: **27 testes** contra PostgreSQL real. ' +
      'Cobertura: **94%**.';
    const frase = integracaoPreservada(anterior);
    assert.match(frase, /27 testes/, 'apagou a evidência anterior');
    assert.match(frase, /não medida nesta geração/, 'não marcou que não mediu');
  });

  it('não inventa integração quando não havia nenhuma', () => {
    assert.equal(integracaoPreservada('- `npm run check`: **10 testes**.'), '');
  });

  it('a linha de evidência do STATUS casa com o marcador', async () => {
    const status = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../docs/STATUS.md', import.meta.url), 'utf-8'),
    );
    assert.match(status, marcador, 'o gerador não encontraria onde escrever');
  });
});
