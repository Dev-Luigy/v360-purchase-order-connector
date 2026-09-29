/**
 * Mede o serviço sob o volume que o enunciado descreve: "um cliente de porte
 * médio tem dezenas de milhares de pedidos em aberto".
 *
 * Gera uma carga do Beta com N pedidos, envia pelo HTTP real, e depois varre o
 * resultado por cursor como a plataforma faria de madrugada. Mede tempo e a
 * memória do container da API — porque o risco do desenho é justamente o
 * índice de cabeçalhos, que cresce com o número de pedidos.
 *
 * O enunciado diz que "os exemplos são amostras: o serviço deve funcionar para
 * qualquer volume **nesses formatos**" — no plural. Por isso o cliente é
 * parâmetro: cada forma de entrega tem um custo diferente, e medir só uma
 * delas não responde à exigência.
 *
 *   docker compose up -d
 *   node scripts/volume-check.mjs [pedidos] [itensPorPedido] [cliente]
 */

import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { openAsBlob } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pedidos = Number(process.argv[2] ?? 20000);
const itensPorPedido = Number(process.argv[3] ?? 3);
const cliente = process.argv[4] ?? 'beta';
const base = process.env.API_URL ?? 'http://127.0.0.1:3000';
// Prefixo por execução: medir duas formas seguidas não pode fazer uma
// sobrescrever a outra, nem a segunda medir reenvio em vez de inserção.
const corrida = Math.random().toString(36).slice(2, 8).toUpperCase();

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
const arquivo = async (nome, conteudo) => {
  const caminho = join(diretorio, nome);
  await writeFile(caminho, conteudo, 'utf-8');
  return caminho;
};
try {
  console.log(
    `gerando ${pedidos} pedidos × ${itensPorPedido} itens no formato do ${cliente}…`,
  );
  const numeroDe = (i) => `VOL-${corrida}-${String(i).padStart(8, '0')}`;

  /** Cada forma de entrega gera os arquivos dela; a medição é a mesma. */
  const geradores = {
    // Dois CSV ligados pelo número, padrão brasileiro.
    beta: async () => {
      const cabecalhos = [
        'NUMERO_PEDIDO;FORNECEDOR_CNPJ;FORNECEDOR_RAZAO_SOCIAL;EMISSAO;SITUACAO;MOEDA',
      ];
      const itens = [
        'NUMERO_PEDIDO;ITEM;CODIGO_MATERIAL;DESCRICAO;UNIDADE;QTD_PEDIDA;QTD_RECEBIDA;PRECO_UNITARIO',
      ];
      for (let i = 0; i < pedidos; i += 1) {
        const numero = numeroDe(i);
        cabecalhos.push(
          `${numero};12.345.678/0001-90;Distribuidora Horizonte Ltda;15/08/2026;EM ABERTO;BRL`,
        );
        for (let linha = 1; linha <= itensPorPedido; linha += 1) {
          itens.push(
            `${numero};${linha};MAT-${String(linha)};Item de volume;UN;1.200,000;400,000;6,49`,
          );
        }
      }
      return {
        headers: await arquivo('cabecalho.csv', `${cabecalhos.join('\n')}\n`),
        items: await arquivo('itens.csv', `${itens.join('\n')}\n`),
      };
    },

    // JSON com itens aninhados.
    alfa: async () => {
      const lista = [];
      for (let i = 0; i < pedidos; i += 1) {
        lista.push({
          po_number: numeroDe(i),
          created_at: '2026-08-05',
          status: 'open',
          currency: 'BRL',
          vendor: { tax_id: '23456789000101', name: 'Metalúrgica São Jorge' },
          items: Array.from({ length: itensPorPedido }, (_, linha) => ({
            line: (linha + 1) * 10,
            material: `MAT-${String(linha)}`,
            description: 'Item de volume',
            uom: 'UN',
            quantity_ordered: 1200,
            quantity_received: 400,
            unit_price: 6.49,
          })),
        });
      }
      return {
        orders: await arquivo(
          'orders.json',
          JSON.stringify({ purchase_orders: lista }),
        ),
      };
    },

    // Tudo achatado: uma linha por item, cabeçalho repetido.
    gama: async () => {
      const linhas = [];
      for (let i = 0; i < pedidos; i += 1) {
        for (let item = 1; item <= itensPorPedido; item += 1) {
          linhas.push({
            ped: numeroDe(i),
            item,
            cnpj_fornecedor: '34567890000112',
            nome_fornecedor: 'Transportes Ideal ME',
            dt_criacao: 1786752000,
            cod_mat: `TRP-${String(item)}`,
            desc_mat: 'Item de volume',
            um: 'CX',
            fator_conv: 12,
            qtd_ped: 10,
            qtd_rec: 2,
            preco_unit_centavos: 120000,
            situacao: 1,
          });
        }
      }
      return { lines: await arquivo('lines.json', JSON.stringify(linhas)) };
    },

    // Duas consultas independentes, ligadas pelo número.
    delta: async () => {
      const cabecalhos = [];
      const itens = [];
      for (let i = 0; i < pedidos; i += 1) {
        const numero = numeroDe(i);
        cabecalhos.push({
          po_number: numero,
          created_at: '2026-09-02',
          status: 'open',
          currency: 'BRL',
          vendor: { tax_id: '67890123000145', name: 'Embalagens Norte Sul' },
        });
        for (let linha = 1; linha <= itensPorPedido; linha += 1) {
          itens.push({
            purchase_order: numero,
            created_at: '2026-09-02',
            line: linha * 10,
            material: `EMB-${String(linha)}`,
            description: 'Item de volume',
            uom: 'UN',
            quantity_ordered: 1200,
            quantity_received: 400,
            unit_price: 6.49,
          });
        }
      }
      return {
        orders: await arquivo(
          'orders.json',
          JSON.stringify({ orders: cabecalhos }),
        ),
        items: await arquivo('items.json', JSON.stringify({ items: itens })),
      };
    },
  };

  const gerar = geradores[cliente];
  if (gerar === undefined) {
    console.error(
      `cliente ${cliente} não tem gerador; use ${Object.keys(geradores).join(', ')}`,
    );
    process.exit(1);
  }
  const caminhos = await gerar();

  console.log(`memória da API antes:  ${memoriaDaApi()}`);

  const corpo = new FormData();
  for (const [parte, caminho] of Object.entries(caminhos)) {
    corpo.append(parte, await openAsBlob(caminho), caminho.split('/').pop());
  }

  const inicio = Date.now();
  const resposta = await fetch(`${base}/clients/${cliente}/ingestions`, {
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
  const destaCorrida = new Set();
  let repetidos = 0;
  const custos = [];
  for (;;) {
    const url = new URL(`${base}/purchase-orders`);
    url.searchParams.set('clientId', cliente);
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
      // Só o que **esta execução** carregou: o cliente pode ter pedidos de
      // antes, e comparar com a contagem dele fazia a conferência final
      // acusar diferença que não existe.
      if (pedido.externalNumber.startsWith(`VOL-${corrida}-`)) {
        destaCorrida.add(pedido.id);
      }
    }
    cursor = pagina.page.nextCursor;
    if (!cursor) break;
  }
  const varreuEm = (Date.now() - varredura) / 1000;
  const paginas = custos.length;
  console.log(
    `varredura: ${String(destaCorrida.size)} desta execução de ` +
      `${String(vistos.size)} distintos, em ${String(paginas)} páginas, ` +
      `${varreuEm.toFixed(1)}s, repetidos=${String(repetidos)}`,
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
  if (destaCorrida.size !== relatorio.ordersAccepted || repetidos > 0) {
    console.error(
      `FALHOU: carga aceitou ${String(relatorio.ordersAccepted)}, ` +
        `varredura viu ${String(destaCorrida.size)} desta execução e ` +
        `${String(repetidos)} repetidos.`,
    );
    process.exit(1);
  }
  console.log(`memória da API no fim: ${memoriaDaApi()}`);
} finally {
  await rm(diretorio, { recursive: true, force: true });
}
