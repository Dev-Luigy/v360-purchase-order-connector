/**
 * Política de exceção da auditoria npm, verificável.
 *
 * `npm audit --omit=dev --audit-level=high` falha neste projeto, e suprimir o
 * comando inteiro esconderia também o aviso que ainda não existe. Esta política
 * é mais estreita: cada aviso alto precisa estar nomeado em
 * `security/audit-exceptions.json`, com por onde entra, por que não foi
 * atualizado, qual a mitigação e quando a exceção vence.
 *
 * Recusa em quatro casos:
 *
 * - aviso alto ou crítico que não está na lista;
 * - exceção vencida;
 * - exceção que ninguém usa mais, para a lista não virar sedimento;
 * - com `--imagem <tag>`, pacote excetuado que **continua** dentro da imagem de
 *   runtime. É o que separa mitigação verificada de mitigação alegada.
 *
 *   npm run audit:policy
 *   npm run audit:policy -- --imagem v360-purchase-order-connector-api
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gravidadesQueImportam = new Set(['high', 'critical']);

const argumentos = process.argv.slice(2);
const posicaoImagem = argumentos.indexOf('--imagem');
const imagem = posicaoImagem === -1 ? null : argumentos[posicaoImagem + 1];

const problemas = [];

const politica = JSON.parse(
  readFileSync(`${raiz}/security/audit-exceptions.json`, 'utf-8'),
);
const excecoes = new Map(politica.excecoes.map((e) => [e.pacote, e]));

// `npm audit` sai com código diferente de zero quando acha algo: a saída é o
// resultado, não o erro.
let bruto;
try {
  bruto = execFileSync('npm', ['audit', '--omit=dev', '--json'], {
    cwd: raiz,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (erro) {
  bruto = erro.stdout;
  if (typeof bruto !== 'string' || bruto.trim() === '') throw erro;
}

const relatorio = JSON.parse(bruto);
const encontrados = Object.entries(relatorio.vulnerabilities ?? {})
  .filter(([, v]) => gravidadesQueImportam.has(v.severity))
  .map(([nome, v]) => ({ nome, gravidade: v.severity }));

const hoje = new Date().toISOString().slice(0, 10);
const usadas = new Set();

for (const { nome, gravidade } of encontrados) {
  const excecao = excecoes.get(nome);
  if (excecao === undefined) {
    problemas.push(
      `aviso ${gravidade} em "${nome}" sem exceção declarada. ` +
        'Atualize a dependência ou registre a exceção com motivo, mitigação e vencimento.',
    );
    continue;
  }
  usadas.add(nome);
  if (excecao.expiraEm < hoje) {
    problemas.push(
      `a exceção de "${nome}" venceu em ${excecao.expiraEm}. ` +
        'Reavalie: ou a correção já existe, ou o prazo precisa ser renovado conscientemente.',
    );
  }
}

for (const pacote of excecoes.keys()) {
  if (!usadas.has(pacote)) {
    problemas.push(
      `a exceção de "${pacote}" não corresponde a nenhum aviso atual. ` +
        'Remova-a para a lista não virar sedimento.',
    );
  }
}

if (imagem !== null) {
  for (const pacote of politica.ausentesDaImagem) {
    const saida = execFileSync(
      'docker',
      [
        'run',
        '--rm',
        '--entrypoint',
        'sh',
        imagem,
        '-c',
        `test -d /app/node_modules/${pacote} && echo presente || echo ausente`,
      ],
      { encoding: 'utf-8' },
    ).trim();
    if (saida !== 'ausente') {
      problemas.push(
        `"${pacote}" continua na imagem ${imagem}. ` +
          'A mitigação declarada na política deixou de valer.',
      );
    }
  }
}

console.log(
  `${encontrados.length} aviso(s) alto/crítico; ${excecoes.size} exceção(ões) declarada(s)` +
    `${imagem === null ? '' : `; imagem ${imagem} conferida`}`,
);
for (const { nome, gravidade } of encontrados) {
  const e = excecoes.get(nome);
  const nota = e === undefined ? 'SEM EXCEÇÃO' : `vence em ${e.expiraEm}`;
  console.log(`  ${gravidade.padEnd(8)} ${nome.padEnd(18)} ${nota}`);
}

if (problemas.length === 0) {
  console.log('\n  política satisfeita');
} else {
  console.log(`\n  ${problemas.length} problema(s):\n`);
  for (const p of problemas) console.log(`  ✖ ${p}`);
}

process.exitCode = problemas.length === 0 ? 0 : 1;
