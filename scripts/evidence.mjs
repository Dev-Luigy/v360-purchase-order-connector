/**
 * Escreve a evidência em `docs/STATUS.md` a partir dos comandos executados.
 *
 * Os números derivaram três vezes quando eram digitados à mão. Este script
 * mede e grava; o README aponta para o STATUS em vez de repetir.
 *
 * É **fail-closed**: se qualquer comando falhar, nada é escrito e o script
 * sai com erro. A primeira versão capturava a falha e publicava os números
 * assim mesmo, o que é pior do que não ter gerador — publicava com a
 * autoridade de ter medido (REVIEW-11).
 *
 *   npm run evidence            # check + cobertura, sem banco
 *   npm run evidence -- --full  # inclui a suíte de integração
 */

import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const completo = process.argv.includes('--full');

export class FalhaDeMedicao extends Error {}

/** Roda e **exige** sucesso: saída de comando que falhou não é evidência. */
function rodar(rotulo, args) {
  try {
    return execFileSync('npm', args, { encoding: 'utf-8', stdio: 'pipe' });
  } catch (erro) {
    const saida = `${erro.stdout ?? ''}${erro.stderr ?? ''}`;
    throw new FalhaDeMedicao(
      `${rotulo} falhou; nada foi escrito.\n${saida.trim().split('\n').slice(-12).join('\n')}`,
    );
  }
}

const numeroDe = (saida, chave) => {
  const achado = new RegExp(`^ℹ ${chave} (\\d+)$`, 'm').exec(saida);
  return achado === null ? null : Number(achado[1]);
};

/** Contagem de uma suíte, recusando qualquer execução com falha. */
export function suite(rotulo, saida) {
  const testes = numeroDe(saida, 'tests');
  const falhas = numeroDe(saida, 'fail');
  if (testes === null || falhas === null) {
    throw new FalhaDeMedicao(`não consegui ler a contagem de ${rotulo}`);
  }
  if (falhas > 0) {
    throw new FalhaDeMedicao(
      `${rotulo} terminou com ${String(falhas)} falha(s); nada foi escrito`,
    );
  }
  return { testes, pulados: numeroDe(saida, 'skipped') ?? 0 };
}

export const marcador = /^- `npm run check`:.*$/m;

/**
 * Reaproveita a frase da integração da linha anterior, **marcada** como não
 * medida agora. Apagá-la daria a impressão de que a suíte deixou de existir;
 * reaproveitá-la calada daria a impressão de ter sido medida (REVIEW-11).
 */
export function integracaoPreservada(anterior) {
  const frase =
    /`npm run test:integration`: \*\*\d+ testes\*\* contra PostgreSQL real\./.exec(
      anterior,
    );
  return frase === null ? '' : `${frase[0]} _(não medida nesta geração)_. `;
}

const caminho = new URL('../docs/STATUS.md', import.meta.url);

if (chamadoDireto()) {
  try {
    // `check` é o portão: geração, schema, tipos, lint, formato, testes e build.
    console.log('rodando npm run check…');
    const doCheck = suite(
      'npm run check',
      rodar('npm run check', ['run', 'check']),
    );

    // A cobertura é medida à parte, e é dela que saem os percentuais. Antes o
    // script rodava só a cobertura e publicava sob o rótulo do check, que não
    // havia executado (REVIEW-11).
    console.log('medindo cobertura…');
    const saidaCobertura = rodar('npm run coverage', ['run', 'coverage']);
    suite('npm run coverage', saidaCobertura);
    const cobertura = /all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/.exec(
      saidaCobertura,
    );
    if (cobertura === null) {
      throw new FalhaDeMedicao('não consegui ler a cobertura');
    }

    const texto = await readFile(caminho, 'utf-8');
    if (!marcador.test(texto)) {
      throw new FalhaDeMedicao(
        'não achei a linha de evidência em docs/STATUS.md',
      );
    }

    let integracao;
    if (completo) {
      console.log('rodando a suíte de integração…');
      const daIntegracao = suite(
        'npm run test:integration',
        rodar('npm run test:integration', ['run', 'test:integration']),
      );
      integracao = `\`npm run test:integration\`: **${String(daIntegracao.testes)} testes** contra PostgreSQL real. `;
    } else {
      // Sem `--full` a integração não foi medida. Apagar a frase anterior daria
      // a impressão de que ela deixou de existir; reaproveitá-la em silêncio
      // daria a impressão de ter sido medida agora. Ela é preservada e marcada.
      integracao = integracaoPreservada(marcador.exec(texto)?.[0] ?? '');
    }

    const virgula = (n) => n.replace('.', ',');
    const linha =
      `- \`npm run check\`: **${String(doCheck.testes)} testes, 0 falhas** ` +
      `(${String(doCheck.testes - doCheck.pulados)} rodam sem banco; ${String(doCheck.pulados)} são pulados sem \`DATABASE_URL\`). ` +
      integracao +
      `Cobertura por \`npm run coverage\`: **${virgula(cobertura[1])}% de linhas, ${virgula(cobertura[2])}% de branches** ` +
      `(sem banco; os repositórios PostgreSQL só são medidos com ele no ar). ` +
      `Gerado por \`npm run evidence\`, não digitado — os números derivaram três vezes quando eram manuais.`;

    await writeFile(caminho, texto.replace(marcador, linha), 'utf-8');
    console.log(`\n${linha}\n`);
    console.log('docs/STATUS.md atualizado.');
  } catch (erro) {
    if (erro instanceof FalhaDeMedicao) {
      console.error(`\n${erro.message}`);
      process.exit(1);
    }
    throw erro;
  }
}

/** `true` quando o arquivo foi executado, não importado por um teste. */
function chamadoDireto() {
  return (
    process.argv[1] !== undefined &&
    import.meta.url.endsWith(
      process.argv[1].replace(/\\/g, '/').split('/').pop() ?? '',
    )
  );
}
