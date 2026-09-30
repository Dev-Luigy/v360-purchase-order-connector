/**
 * O que está no banco é igual ao que entrou?
 *
 * `validate-case.mjs` prova que cada exigência do enunciado é atendida e a
 * suíte de integração prova o comportamento do repositório. Nenhuma das duas
 * percorre todos os campos de todos os registros afirmando "este valor é o
 * mesmo que entrou pelo arquivo".
 *
 * O esperado aqui é derivado **à mão** do arquivo cru, aplicando as regras
 * escritas em docs/CASE.md. Nada de `src/` é importado: se o adaptador e este
 * script chegarem ao mesmo valor, é porque chegaram por caminhos
 * independentes. O lido vem do PostgreSQL por `psql`, não pela API, para que a
 * serialização da resposta não possa mascarar o que está gravado.
 *
 *   docker compose up -d
 *   npm run audit:fidelity
 */

import { execFileSync } from 'node:child_process';
import { openAsBlob, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.API_URL ?? 'http://127.0.0.1:3000';

const falhas = [];
let comparacoes = 0;

function conferir(onde, campo, esperado, lido) {
  comparacoes += 1;
  if (String(esperado) !== String(lido)) {
    falhas.push({ onde, campo, esperado, lido });
  }
}

// ------------------------------------------------------------------ entrada

async function carregar(clientId, partes) {
  const corpo = new FormData();
  for (const [nome, caminho] of Object.entries(partes)) {
    const arquivo = `${raiz}/${caminho}`;
    corpo.append(nome, await openAsBlob(arquivo), caminho.split('/').pop());
  }
  const resposta = await fetch(`${base}/clients/${clientId}/ingestions`, {
    method: 'POST',
    headers: { 'x-format-version': '1' },
    body: corpo,
  });
  const relatorio = await resposta.json();
  if (!resposta.ok) {
    throw new Error(`carga ${clientId}: ${JSON.stringify(relatorio)}`);
  }
  return relatorio;
}

/** Consulta o banco direto, para não depender da serialização da API. */
function consultar(sql) {
  const saida = execFileSync(
    'docker',
    [
      'compose',
      'exec',
      '-T',
      'db',
      'psql',
      '-U',
      'v360',
      '-d',
      'v360',
      '-tAc',
      sql,
    ],
    { cwd: raiz, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
  );
  return saida.trim() === '' ? [] : JSON.parse(saida);
}

// --------------------------------------------- regras do enunciado, à mão

/** Texto decimal na escala persistida, sem passar por ponto flutuante. */
function decimal(valor, casas = 6) {
  const texto = String(valor);
  const negativo = texto.startsWith('-');
  const [inteira, fracao = ''] = (negativo ? texto.slice(1) : texto).split('.');
  return `${negativo ? '-' : ''}${inteira}.${(fracao + '0'.repeat(casas)).slice(0, casas)}`;
}

const escala = 10n ** 6n;
const paraInteiro = (texto) => {
  const negativo = texto.startsWith('-');
  const [i, f = ''] = (negativo ? texto.slice(1) : texto).split('.');
  const v = BigInt(i) * escala + BigInt((f + '000000').slice(0, 6));
  return negativo ? -v : v;
};
const doInteiro = (v) => {
  const negativo = v < 0n;
  const abs = negativo ? -v : v;
  return `${negativo ? '-' : ''}${abs / escala}.${String(abs % escala).padStart(6, '0')}`;
};
const subtrair = (a, b) => doInteiro(paraInteiro(a) - paraInteiro(b));

const statusIngles = {
  open: 'aberto',
  closed: 'encerrado',
  blocked: 'bloqueado',
};
const statusBeta = {
  'EM ABERTO': 'aberto',
  BLOQUEADO: 'bloqueado',
  ENCERRADO: 'encerrado',
};
const statusGama = { 1: 'aberto', 2: 'encerrado', 3: 'bloqueado' };

const ler = (caminho) => readFileSync(`${raiz}/${caminho}`, 'utf-8');
/** O texto exato do número no arquivo, para `JSON.parse` não virar float. */
const precosCrus = (texto) =>
  [...texto.matchAll(/"unit_price":\s*(-?[0-9.]+)/g)].map((m) => m[1]);

const esperados = [];

function registrar(clientId, pedido) {
  const items = pedido.items
    .map((i) => ({
      ...i,
      quantityPending: subtrair(i.quantityOrdered, i.quantityReceived),
    }))
    .sort((a, b) => a.externalLine - b.externalLine);
  esperados.push({
    ...pedido,
    clientId,
    items,
    hasPendingBalance: items.some((i) => paraInteiro(i.quantityPending) > 0n),
  });
}

// Alfa: JSON aninhado, ISO, CNPJ limpo, situação em inglês.
{
  const texto = ler('tests/fixtures/alfa/purchase-orders.json');
  const precos = precosCrus(texto);
  let k = 0;
  for (const p of JSON.parse(texto).purchase_orders) {
    registrar('alfa', {
      externalNumber: p.po_number,
      supplierTaxId: p.vendor.tax_id,
      supplierName: p.vendor.name,
      currency: p.currency,
      status: statusIngles[p.status],
      issuedOn: p.created_at,
      items: p.items.map((i) => ({
        externalLine: i.line,
        material: i.material,
        description: i.description,
        purchaseUnit: i.uom,
        conversionFactor: decimal(1),
        quantityOrdered: decimal(i.quantity_ordered),
        quantityReceived: decimal(i.quantity_received),
        unitPrice: decimal(precos[k++]),
        lineCreatedOn: null,
      })),
    });
  }
}

// Beta: dois CSV, CNPJ com máscara, dd/mm/aaaa, decimal brasileiro.
{
  const linhas = (arquivo) =>
    ler(`tests/fixtures/beta/${arquivo}`)
      .split(/\r?\n/)
      .filter((l) => l.trim() !== '')
      .map((l) => l.split(';'));
  const [, ...cabecalhos] = linhas('cabecalho.csv');
  const [, ...itens] = linhas('itens.csv');
  // Milhar com ponto, decimal com vírgula: o ponto some, a vírgula vira ponto.
  const numeroBr = (t) => decimal(t.replace(/\./g, '').replace(',', '.'));
  for (const [numero, cnpj, razao, emissao, situacao, moeda] of cabecalhos) {
    const [dia, mes, ano] = emissao.split('/');
    registrar('beta', {
      externalNumber: numero,
      supplierTaxId: cnpj.replace(/\D/g, ''),
      supplierName: razao,
      currency: moeda,
      status: statusBeta[situacao],
      issuedOn: `${ano}-${mes}-${dia}`,
      items: itens
        .filter((i) => i[0] === numero)
        .map((i) => ({
          externalLine: Number(i[1]),
          material: i[2],
          description: i[3],
          purchaseUnit: i[4],
          conversionFactor: decimal(1),
          quantityOrdered: numeroBr(i[5]),
          quantityReceived: numeroBr(i[6]),
          unitPrice: numeroBr(i[7]),
          lineCreatedOn: null,
        })),
    });
  }
}

// Gama: achatado, timestamp Unix, centavos, situação numérica, moeda assumida.
{
  const linhas = JSON.parse(
    ler('tests/fixtures/gama/purchase-order-lines.json'),
  );
  const porPedido = new Map();
  for (const l of linhas) {
    if (!porPedido.has(l.ped)) porPedido.set(l.ped, []);
    porPedido.get(l.ped).push(l);
  }
  const deCentavos = (c) => {
    const s = String(c).padStart(3, '0');
    return decimal(`${s.slice(0, -2)}.${s.slice(-2)}`);
  };
  const daEpoca = (s) => new Date(s * 1000).toISOString().slice(0, 10);
  for (const [numero, ls] of porPedido) {
    const p = ls[0];
    registrar('gama', {
      externalNumber: numero,
      supplierTaxId: p.cnpj_fornecedor,
      supplierName: p.nome_fornecedor,
      // O payload do Gama não traz moeda; BRL é hipótese declarada no perfil.
      currency: 'BRL',
      status: statusGama[p.situacao],
      issuedOn: daEpoca(p.dt_criacao),
      items: ls.map((i) => ({
        externalLine: i.item,
        material: i.cod_mat,
        description: i.desc_mat,
        purchaseUnit: i.um,
        conversionFactor: decimal(i.fator_conv),
        quantityOrdered: decimal(i.qtd_ped),
        quantityReceived: decimal(i.qtd_rec),
        unitPrice: deCentavos(i.preco_unit_centavos),
        // `dt_criacao` é a data do pedido, e o perfil do Gama não declara data
        // por linha: no formato achatado o cabeçalho é que se repete.
        lineCreatedOn: null,
      })),
    });
  }
}

// Delta: duas consultas ligadas por `purchase_order`, com data por item.
{
  const cabecalhos = JSON.parse(ler('tests/fixtures/delta/orders.json')).orders;
  const textoItens = ler('tests/fixtures/delta/items.json');
  const itens = JSON.parse(textoItens).items;
  const precos = precosCrus(textoItens);
  itens.forEach((i, k) => {
    i.precoCru = precos[k];
  });
  for (const p of cabecalhos) {
    registrar('delta', {
      externalNumber: p.po_number,
      supplierTaxId: p.vendor.tax_id,
      supplierName: p.vendor.name,
      currency: p.currency,
      status: statusIngles[p.status],
      issuedOn: p.created_at,
      items: itens
        .filter((i) => i.purchase_order === p.po_number)
        .map((i) => ({
          externalLine: i.line,
          material: i.material,
          description: i.description,
          purchaseUnit: i.uom,
          conversionFactor: decimal(1),
          quantityOrdered: decimal(i.quantity_ordered),
          quantityReceived: decimal(i.quantity_received),
          unitPrice: decimal(i.precoCru),
          lineCreatedOn: i.created_at,
        })),
    });
  }
}

// ---------------------------------------------------------------- execução

console.log('carregando as amostras do enunciado pelas rotas reais…\n');
const relatorios = {
  alfa: await carregar('alfa', {
    orders: 'tests/fixtures/alfa/purchase-orders.json',
  }),
  beta: await carregar('beta', {
    headers: 'tests/fixtures/beta/cabecalho.csv',
    items: 'tests/fixtures/beta/itens.csv',
  }),
  gama: await carregar('gama', {
    lines: 'tests/fixtures/gama/purchase-order-lines.json',
  }),
  delta: await carregar('delta', {
    orders: 'tests/fixtures/delta/orders.json',
    items: 'tests/fixtures/delta/items.json',
  }),
};
for (const [cliente, r] of Object.entries(relatorios)) {
  console.log(
    `  ${cliente.padEnd(6)} pedidos=${r.ordersAccepted} itens=${r.itemsAccepted} ` +
      `recusados=${r.rejectedTotal} esperando=${r.stagedTotal}`,
  );
}

const chaves = esperados
  .map((e) => `('${e.clientId}','${e.externalNumber}')`)
  .join(',');
const gravados = consultar(`
  select coalesce(json_agg(t), '[]'::json)::text from (
    select o.client_id, o.external_number, o.supplier_tax_id, o.supplier_name,
           o.currency, o.status::text as status,
           to_char(o.issued_on, 'YYYY-MM-DD') as issued_on,
           o.has_pending_balance,
           coalesce((
             select json_agg(json_build_object(
               'externalLine', i.external_line,
               'material', i.material,
               'description', i.description,
               'purchaseUnit', i.purchase_unit,
               'conversionFactor', i.conversion_factor::text,
               'quantityOrdered', i.quantity_ordered::text,
               'quantityReceived', i.quantity_received::text,
               'quantityPending', i.quantity_pending::text,
               'unitPrice', i.unit_price::text,
               'lineCreatedOn', to_char(i.line_created_on, 'YYYY-MM-DD')
             ) order by i.external_line)
             from purchase_order_item i where i.purchase_order_id = o.id
           ), '[]'::json) as items
    from purchase_order o
    where (o.client_id, o.external_number) in (${chaves})
  ) t`);

const porChave = new Map(
  gravados.map((g) => [`${g.client_id}:${g.external_number}`, g]),
);

for (const e of esperados) {
  const onde = `${e.clientId}:${e.externalNumber}`;
  const g = porChave.get(onde);
  if (g === undefined) {
    falhas.push({
      onde,
      campo: '(o pedido)',
      esperado: 'gravado',
      lido: 'ausente',
    });
    continue;
  }
  conferir(onde, 'supplierTaxId', e.supplierTaxId, g.supplier_tax_id);
  conferir(onde, 'supplierName', e.supplierName, g.supplier_name);
  conferir(onde, 'currency', e.currency, g.currency);
  conferir(onde, 'status', e.status, g.status);
  conferir(onde, 'issuedOn', e.issuedOn, g.issued_on);
  conferir(
    onde,
    'hasPendingBalance',
    e.hasPendingBalance,
    g.has_pending_balance,
  );
  conferir(onde, 'quantidade de itens', e.items.length, g.items.length);
  for (const item of e.items) {
    const rotulo = `${onde} linha ${item.externalLine}`;
    const lido = g.items.find((x) => x.externalLine === item.externalLine);
    if (lido === undefined) {
      falhas.push({
        onde: rotulo,
        campo: '(o item)',
        esperado: 'gravado',
        lido: 'ausente',
      });
      continue;
    }
    for (const campo of [
      'material',
      'description',
      'purchaseUnit',
      'conversionFactor',
      'quantityOrdered',
      'quantityReceived',
      'quantityPending',
      'unitPrice',
      'lineCreatedOn',
    ]) {
      conferir(rotulo, campo, item[campo], lido[campo]);
    }
  }
}

// O item Delta sem cabeçalho não pode virar pedido inventado.
const inventado = consultar(`
  select coalesce(json_agg(t), '[]'::json)::text from (
    select external_number from purchase_order
    where client_id = 'delta' and external_number = 'DL-2026-0099') t`);
conferir(
  'delta:DL-2026-0099',
  'item sem cabeçalho vira pedido',
  'não',
  inventado.length === 0 ? 'não' : 'sim',
);

console.log(
  `\n${comparacoes} comparações de campo em ${esperados.length} pedidos e ` +
    `${esperados.reduce((s, e) => s + e.items.length, 0)} itens`,
);

if (falhas.length === 0) {
  console.log('  todos os campos batem com o arquivo de entrada\n');
} else {
  console.log(`\n  ${falhas.length} divergência(s):\n`);
  for (const f of falhas) {
    console.log(`  ✖ ${f.onde} — ${f.campo}`);
    console.log(`      arquivo: ${JSON.stringify(f.esperado)}`);
    console.log(`      banco:   ${JSON.stringify(f.lido)}`);
  }
}

process.exitCode = falhas.length === 0 ? 0 : 1;
