/**
 * Mede o serviço sob o volume que o enunciado descreve: "um cliente de porte
 * médio tem dezenas de milhares de pedidos em aberto".
 *
 * Gera uma carga do Beta com N pedidos, envia pelo HTTP real, e depois varre o
 * resultado por cursor como a plataforma faria de madrugada. Mede tempo e a
 * memória do container da API — porque o risco do desenho é justamente o
 * índice de cabeçalhos, que cresce com o número de pedidos.
 *
 *   docker compose up -d
 *   node scripts/volume-check.mjs [pedidos] [itensPorPedido]
 */

import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { openAsBlob } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pedidos = Number(process.argv[2] ?? 20000);
const itensPorPedido = Number(process.argv[3] ?? 3);
const base = process.env.API_URL ?? 'http://127.0.0.1:3000';

const memoriaDaApi = () => {
  const saida = execFileSync(
    'docker',
    ['stats', '--no-stream', '--format', '{{.Name}} {{.MemUsage}}'],
    { encoding: 'utf-8' },
  );
  const linha = saida.split('\n').find((l) => l.includes('api'));
  return linha?.split(' ').slice(1).join(' ').trim() ?? '?';
};

const diretorio = await mkdtemp(join(tmpdir(), 'v360-volume-'));
try {
  console.log(`gerando ${pedidos} pedidos × ${itensPorPedido} itens…`);
  const cabecalhos = [
    'NUMERO_PEDIDO;FORNECEDOR_CNPJ;FORNECEDOR_RAZAO_SOCIAL;EMISSAO;SITUACAO;MOEDA',
  ];
  const itens = [
    'NUMERO_PEDIDO;ITEM;CODIGO_MATERIAL;DESCRICAO;UNIDADE;QTD_PEDIDA;QTD_RECEBIDA;PRECO_UNITARIO',
  ];
  for (let i = 0; i < pedidos; i += 1) {
    const numero = `VOL-${String(i).padStart(8, '0')}`;
    cabecalhos.push(
      `${numero};12.345.678/0001-90;Distribuidora Horizonte Ltda;15/08/2026;EM ABERTO;BRL`,
    );
    for (let linha = 1; linha <= itensPorPedido; linha += 1) {
      itens.push(
        `${numero};${linha};MAT-${String(linha)};Item de volume;UN;1.200,000;400,000;6,49`,
      );
    }
  }
  const arquivoCabecalhos = join(diretorio, 'cabecalho.csv');
  const arquivoItens = join(diretorio, 'itens.csv');
  await writeFile(arquivoCabecalhos, `${cabecalhos.join('\n')}\n`, 'utf-8');
  await writeFile(arquivoItens, `${itens.join('\n')}\n`, 'utf-8');

  console.log(`memória da API antes:  ${memoriaDaApi()}`);

  const corpo = new FormData();
  corpo.append('headers', await openAsBlob(arquivoCabecalhos), 'cabecalho.csv');
  corpo.append('items', await openAsBlob(arquivoItens), 'itens.csv');

  const inicio = Date.now();
  const resposta = await fetch(`${base}/clients/beta/ingestions`, {
    method: 'POST',
    headers: { 'x-format-version': '1' },
    body: corpo,
  });
  const segundos = (Date.now() - inicio) / 1000;
  const relatorio = await resposta.json();

  if (!resposta.ok) {
    console.error('carga recusada:', relatorio);
    process.exit(1);
  }
  console.log(
    `carga: ${String(relatorio.ordersAccepted)} pedidos e ` +
      `${String(relatorio.itemsAccepted)} itens em ${segundos.toFixed(1)}s ` +
      `(${Math.round(relatorio.ordersAccepted / segundos)} pedidos/s), ` +
      `rejeitados=${String(relatorio.rejectedTotal)}`,
  );
  console.log(`memória da API depois: ${memoriaDaApi()}`);

  console.log('varrendo por cursor, como a plataforma faria…');
  const varredura = Date.now();
  let cursor = null;
  // O conjunto é o ponto: contar não prova nada, porque repetir um pedido e
  // pular outro dá a mesma contagem. A varredura noturna que repete pedido
  // reconfere nota já conferida.
  const vistos = new Set();
  let repetidos = 0;
  const custos = [];
  for (;;) {
    const url = new URL(`${base}/purchase-orders`);
    url.searchParams.set('clientId', 'beta');
    url.searchParams.set('pending', 'true');
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const marca = Date.now();
    const resposta = await fetch(url);
    if (!resposta.ok) {
      console.error(
        `página recusada: HTTP ${String(resposta.status)}`,
        await resposta.text(),
      );
      process.exit(1);
    }
    const pagina = await resposta.json();
    custos.push(Date.now() - marca);
    for (const pedido of pagina.data) {
      if (vistos.has(pedido.id)) repetidos += 1;
      vistos.add(pedido.id);
    }
    cursor = pagina.page.nextCursor;
    if (!cursor) break;
  }
  const varreuEm = (Date.now() - varredura) / 1000;
  const paginas = custos.length;
  console.log(
    `varredura: ${String(vistos.size)} pedidos distintos em ` +
      `${String(paginas)} páginas, ${varreuEm.toFixed(1)}s, ` +
      `repetidos=${String(repetidos)}`,
  );

  // A promessa do cursor contra OFFSET: a última página custa o mesmo que a
  // primeira. Com OFFSET, a página 500 varreria 50.000 linhas para descartar
  // 49.900 — a degradação apareceria exatamente aqui.
  const media = (fatia) =>
    fatia.reduce((soma, valor) => soma + valor, 0) / fatia.length;
  const primeiras = media(custos.slice(0, 10));
  const ultimas = media(custos.slice(-10));
  console.log(
    `profundidade: 10 primeiras páginas ${primeiras.toFixed(1)}ms, ` +
      `10 últimas ${ultimas.toFixed(1)}ms ` +
      `(fator ${(ultimas / primeiras).toFixed(2)}×)`,
  );
  if (vistos.size !== relatorio.ordersAccepted || repetidos > 0) {
    console.error(
      `FALHOU: carga aceitou ${String(relatorio.ordersAccepted)}, ` +
        `varredura viu ${String(vistos.size)} distintos e ` +
        `${String(repetidos)} repetidos.`,
    );
    process.exit(1);
  }
  console.log(`memória da API no fim: ${memoriaDaApi()}`);
} finally {
  await rm(diretorio, { recursive: true, force: true });
}
