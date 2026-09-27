/**
 * Renderiza os `.puml` deste diretorio pelo servidor publico do PlantUML.
 *
 * Nao ha PlantUML, Java nem Graphviz nesta maquina, e instalar e do usuario
 * (AGENTS.md). Entao a renderizacao acontece em https://plantuml.com/: o script
 * comprime a fonte, monta a URL no formato do servidor e grava o SVG ao lado.
 *
 * Isso **envia a fonte do diagrama para um servidor publico**. Vale para o
 * contrato normalizado, que nao tem segredo nem dado real de cliente; nao vale
 * para diagrama que descreva dado de cliente.
 *
 *   node scripts/render-diagrams.mjs         # grava os SVG
 *   node scripts/render-diagrams.mjs --urls  # so imprime as URLs, nao acessa a rede
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const server = 'https://www.plantuml.com/plantuml';
const here = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'docs',
  'diagrams',
);

/** Alfabeto de 6 bits do PlantUML: nao e base64 padrao, a ordem e outra. */
function encode6bit(value) {
  if (value < 10) return String.fromCharCode(48 + value);
  let b = value - 10;
  if (b < 26) return String.fromCharCode(65 + b);
  b -= 26;
  if (b < 26) return String.fromCharCode(97 + b);
  b -= 26;
  if (b === 0) return '-';
  if (b === 1) return '_';
  throw new Error(`valor de 6 bits invalido: ${value}`);
}

/** Deflate cru + o base64 do PlantUML, que e o que a URL do servidor espera. */
function encodePlantUml(source) {
  const deflated = deflateRawSync(Buffer.from(source, 'utf-8'), { level: 9 });
  let encoded = '';
  for (let i = 0; i < deflated.length; i += 3) {
    const b1 = deflated[i];
    const b2 = i + 1 < deflated.length ? deflated[i + 1] : 0;
    const b3 = i + 2 < deflated.length ? deflated[i + 2] : 0;
    encoded += encode6bit(b1 >> 2);
    encoded += encode6bit(((b1 & 0x03) << 4) | (b2 >> 4));
    encoded += encode6bit(((b2 & 0x0f) << 2) | (b3 >> 6));
    encoded += encode6bit(b3 & 0x3f);
  }
  return encoded;
}

async function main() {
  const urlsOnly = process.argv.includes('--urls');
  const sources = (await readdir(here))
    .filter((name) => name.endsWith('.puml'))
    .sort();

  if (sources.length === 0) {
    console.error('nenhum .puml em docs/diagrams');
    process.exitCode = 1;
    return;
  }

  for (const name of sources) {
    const source = await readFile(join(here, name), 'utf-8');
    const encoded = encodePlantUml(source);
    const svgUrl = `${server}/svg/${encoded}`;

    if (urlsOnly) {
      console.log(`${name}`);
      console.log(`  svg    ${svgUrl}`);
      console.log(`  editar ${server}/uml/${encoded}`);
      continue;
    }

    const response = await fetch(svgUrl);
    if (!response.ok) {
      throw new Error(`${name}: servidor respondeu ${response.status}`);
    }
    const svg = await response.text();
    // O servidor devolve 200 com uma imagem de erro quando a fonte nao compila.
    if (/syntax error|cannot find|Assumed diagram/i.test(svg)) {
      throw new Error(`${name}: PlantUML recusou a fonte; veja ${svgUrl}`);
    }
    const target = name.replace(/\.puml$/, '.svg');
    await writeFile(join(here, target), svg, 'utf-8');
    console.log(`${name} -> ${target} (${svg.length} bytes)`);
  }
}

await main();
