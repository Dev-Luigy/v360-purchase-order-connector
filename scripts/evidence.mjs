/**
 * Escreve a evidência em `docs/STATUS.md` a partir dos comandos executados.
 *
 * Os números de teste e cobertura derivaram três vezes — R09-09, e de novo
 * R10-06 — porque eram digitados à mão em dois documentos. Digitar de novo só
 * adiaria a quarta vez. Este script mede e grava; o README aponta para o
 * STATUS em vez de repetir.
 *
 *   npm run evidence            # sem banco
 *   npm run evidence -- --full  # com PostgreSQL no ar, inclui integração
 */

import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const completo = process.argv.includes('--full');

const rodar = (args) => {
  try {
    return execFileSync('npm', args, { encoding: 'utf-8', stdio: 'pipe' });
  } catch (erro) {
    // Falha de teste ainda traz a contagem no stdout, e queremos registrá-la.
    return `${erro.stdout ?? ''}${erro.stderr ?? ''}`;
  }
};

const numeroDe = (saida, chave) => {
  const achado = new RegExp(`^ℹ ${chave} (\\d+)$`, 'm').exec(saida);
  return achado === null ? null : Number(achado[1]);
};

console.log('medindo a suíte sem banco…');
const semBanco = rodar(['run', 'coverage']);
const testes = numeroDe(semBanco, 'tests');
const falhas = numeroDe(semBanco, 'fail');
const pulados = numeroDe(semBanco, 'skipped');
const cobertura = /all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/.exec(semBanco);

if (testes === null || cobertura === null) {
  console.error('não consegui ler a saída da suíte; nada foi gravado');
  process.exit(1);
}

let integracao = null;
if (completo) {
  console.log('medindo a suíte de integração…');
  integracao = numeroDe(rodar(['run', 'test:integration']), 'tests');
}

const virgula = (n) => n.replace('.', ',');
const linha =
  `- \`npm run check\`: **${String(testes)} testes, ${String(falhas ?? 0)} falhas** ` +
  `(${String(testes - (pulados ?? 0))} rodam sem banco; ${String(pulados ?? 0)} são pulados sem \`DATABASE_URL\`). ` +
  (integracao === null
    ? ''
    : `\`npm run test:integration\`: **${String(integracao)} testes** contra PostgreSQL real. `) +
  `Cobertura por \`npm run coverage\`: **${virgula(cobertura[1])}% de linhas, ${virgula(cobertura[2])}% de branches** ` +
  `(sem banco; os repositórios PostgreSQL só são medidos com ele no ar). ` +
  `Gerado por \`npm run evidence\`, não digitado — os números derivaram três vezes quando eram manuais (REVIEW-10, R10-06).`;

const caminho = new URL('../docs/STATUS.md', import.meta.url);
const texto = await readFile(caminho, 'utf-8');
const marcador = /^- `npm run check`:.*$/m;
if (!marcador.test(texto)) {
  console.error('não achei a linha de evidência em docs/STATUS.md');
  process.exit(1);
}
await writeFile(caminho, texto.replace(marcador, linha), 'utf-8');
console.log(`\n${linha}\n`);
console.log('docs/STATUS.md atualizado.');
