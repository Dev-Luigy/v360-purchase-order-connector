/**
 * A varredura noturna **enquanto novas cargas entram**.
 *
 * O requisito 1 descreve exatamente isto: "a plataforma varre esse conjunto em
 * lote, de madrugada, enquanto novas cargas continuam entrando". É o cenário
 * que decidiu a paginação por cursor em vez de `OFFSET` — e nenhum teste o
 * exercitava. Provar que o cursor era mais rápido não prova que ele é correto
 * sob escrita concorrente, que é a razão de ele existir.
 *
 * O que precisa valer durante a varredura:
 *
 *   - nenhum pedido aparece duas vezes, porque repetir faria a plataforma
 *     reconferir nota já conferida;
 *   - nenhum pedido que existia no início desaparece da varredura;
 *   - a varredura **termina por decisão própria**, e não porque a escrita
 *     acabou.
 *
 * O terceiro ponto é o que a primeira versão deste script não provava: o
 * escritor dela era finito, então qualquer varredura terminava quando o
 * produtor acabava (REVIEW-14, R14-02). Agora o escritor só para **depois**
 * da varredura, e há um prazo de segurança — se a varredura não terminar
 * sozinha, o script falha em vez de rodar para sempre.
 *
 * Pedidos novos podem ou não aparecer, e as duas respostas são legítimas: a
 * varredura é de um instante. O que não pode é perder o que já estava lá.
 *
 *   docker compose up -d --build
 *   node scripts/validate-sweep-under-load.mjs [pedidos] [cargasConcorrentes]
 */

import { randomUUID } from 'node:crypto';

const base = process.env.API_URL ?? 'http://127.0.0.1:3000';
const existentes = Number(process.argv[2] ?? 20000);
const cargas = Number(process.argv[3] ?? 200);
const corrida = randomUUID().slice(0, 8).toUpperCase();

const cabecalho = (numero) => ({
  po_number: numero,
  created_at: '2026-09-02',
  status: 'open',
  currency: 'BRL',
  vendor: { tax_id: '67890123000145', name: 'Embalagens Norte Sul Ltda' },
});

const item = (numero) => ({
  purchase_order: numero,
  created_at: '2026-09-02',
  line: 10,
  material: 'SWEEP',
  description: 'Item da varredura',
  uom: 'UN',
  quantity_ordered: 10,
  quantity_received: 0,
  unit_price: 1.5,
});

async function carregar(numeros) {
  const corpo = new FormData();
  const partes = {
    orders: { orders: numeros.map(cabecalho) },
    items: { items: numeros.map(item) },
  };
  for (const [nome, conteudo] of Object.entries(partes)) {
    corpo.append(
      nome,
      new Blob([JSON.stringify(conteudo)], { type: 'application/json' }),
      `${nome}.json`,
    );
  }
  const resposta = await fetch(`${base}/clients/delta/ingestions`, {
    method: 'POST',
    headers: { 'x-format-version': '1' },
    body: corpo,
  });
  if (!resposta.ok) {
    throw new Error(`carga recusada: HTTP ${String(resposta.status)}`);
  }
  return resposta.json();
}

const numeroDe = (lote, i) =>
  `SW-${corrida}-${lote}-${String(i).padStart(6, '0')}`;

const pronto = await fetch(`${base}/ready`);
if (pronto.status !== 200) {
  console.error(
    'A aplicação precisa estar no ar; GET /ready não respondeu 200.',
  );
  process.exit(1);
}

// ------------------------------------------------- o conjunto do início

console.log(`semeando ${String(existentes)} pedidos…`);
const porCarga = 500;
const antes = new Set();
for (let i = 0; i < existentes; i += porCarga) {
  const numeros = Array.from(
    { length: Math.min(porCarga, existentes - i) },
    (_, n) => numeroDe('BASE', i + n),
  );
  await carregar(numeros);
  for (const numero of numeros) antes.add(numero);
}
console.log(`  ${String(antes.size)} pedidos no conjunto inicial`);

// ------------------------------- varredura e cargas, ao mesmo tempo

// Lotes pequenos e contínuos: o objetivo é que a escrita aconteça **durante**
// a varredura, não antes dela. Um lote grande demora mais que a varredura
// inteira e a sobreposição vira zero — foi o que aconteceu na primeira versão
// deste script, que passou sem provar nada.
// O escritor só para quando a varredura avisar. Se ela nunca terminar, o
// prazo de segurança abaixo derruba o script — que é o resultado certo, e não
// uma espera infinita.
let varrendo = true;
let novosAceitos = 0;
let lotesEscritos = 0;
let lotesDepoisDaVarredura = 0;
const escritor = (async () => {
  for (let lote = 0; lote < cargas; lote += 1) {
    const numeros = Array.from({ length: 50 }, (_, n) =>
      numeroDe(`NOVO${String(lote)}`, n),
    );
    const relatorio = await carregar(numeros);
    novosAceitos += relatorio.ordersAccepted;
    if (varrendo) lotesEscritos += 1;
    else {
      lotesDepoisDaVarredura += 1;
      // Mais alguns depois do fim, só para provar que ele ainda estava vivo.
      if (lotesDepoisDaVarredura >= 2) break;
    }
  }
})();

console.log('varrendo por cursor enquanto as cargas entram…');
const vistos = new Set();
let repetidos = 0;
let paginas = 0;
let cursor = null;
const comecou = Date.now();
// Prazo de segurança: uma varredura que persegue a escrita não termina, e o
// script precisa dizer isso em vez de travar.
const prazo = Number(process.env.SWEEP_TIMEOUT_MS ?? 120_000);
for (;;) {
  if (Date.now() - comecou > prazo) {
    console.error(
      `\n  FALHOU: a varredura passou de ${String(prazo / 1000)}s sem terminar. ` +
        'Sem teto no cursor ela persegue o que entra e não tem fim próprio.',
    );
    varrendo = false;
    await escritor;
    process.exit(1);
  }
  const url = new URL(`${base}/purchase-orders`);
  url.searchParams.set('clientId', 'delta');
  url.searchParams.set('pending', 'true');
  url.searchParams.set('limit', '100');
  if (cursor) url.searchParams.set('cursor', cursor);

  const resposta = await fetch(url);
  if (!resposta.ok) {
    console.error(`página recusada: HTTP ${String(resposta.status)}`);
    varrendo = false;
    await escritor;
    process.exit(1);
  }
  const pagina = await resposta.json();
  for (const pedido of pagina.data) {
    if (vistos.has(pedido.id)) repetidos += 1;
    vistos.add(pedido.id);
  }
  paginas += 1;
  cursor = pagina.page.nextCursor;
  if (!cursor) break;
}
const varreuEm = (Date.now() - comecou) / 1000;
// A varredura terminou **sozinha**, com o escritor ainda ativo.
varrendo = false;
await escritor;

// ----------------------------------------------------------- veredito

// A varredura guardou ids; esta releitura casa id com número de pedido para
// dizer quais do conjunto inicial apareceram nela.
const numerosVistos = new Set();
const restantes = [];
let cursorFinal = null;
for (;;) {
  const url = new URL(`${base}/purchase-orders`);
  url.searchParams.set('clientId', 'delta');
  url.searchParams.set('limit', '100');
  if (cursorFinal) url.searchParams.set('cursor', cursorFinal);
  const pagina = await (await fetch(url)).json();
  for (const p of pagina.data) {
    numerosVistos.add(p.externalNumber);
    if (vistos.has(p.id)) restantes.push(p.externalNumber);
  }
  cursorFinal = pagina.page.nextCursor;
  if (!cursorFinal) break;
}

const perdidos = [...antes].filter((numero) => !numerosVistos.has(numero));
const varridosDoInicio = restantes.filter((numero) => antes.has(numero));

console.log();
console.log(
  `  páginas varridas            ${String(paginas)} em ${varreuEm.toFixed(1)}s`,
);
console.log(`  pedidos distintos vistos    ${String(vistos.size)}`);
console.log(`  repetidos na varredura      ${String(repetidos)}`);
console.log(
  `  cargas novas durante ela    ${String(novosAceitos)} pedidos em ${String(lotesEscritos)} lotes`,
);
console.log(
  `  escrita continuou depois    ${String(lotesDepoisDaVarredura)} lotes`,
);
console.log(
  `  do conjunto inicial         ${String(varridosDoInicio.length)} de ${String(antes.size)} apareceram`,
);
console.log(`  sumiram do banco            ${String(perdidos.length)}`);

const problemas = [];
if (lotesDepoisDaVarredura < 1) {
  problemas.push(
    'a escrita acabou antes da varredura: o término pode ter sido do produtor, ' +
      'não da varredura — aumente as cargas',
  );
}
if (lotesEscritos < 2) {
  problemas.push(
    `só ${String(lotesEscritos)} lote(s) entraram durante a varredura: ` +
      'sem sobreposição o teste não prova nada — aumente o conjunto inicial',
  );
}
if (repetidos > 0) {
  problemas.push(
    `${String(repetidos)} pedidos apareceram duas vezes na varredura`,
  );
}
if (varridosDoInicio.length !== antes.size) {
  problemas.push(
    `a varredura pulou ${String(antes.size - varridosDoInicio.length)} pedidos que já existiam`,
  );
}
if (perdidos.length > 0) {
  problemas.push(`${String(perdidos.length)} pedidos sumiram do banco`);
}

console.log();
if (problemas.length === 0) {
  console.log(
    '  OK: a varredura não repetiu nem perdeu pedido sob carga concorrente.',
  );
  console.log(`  prefixo desta execução: SW-${corrida}`);
  process.exit(0);
}
for (const problema of problemas) console.error(`  FALHOU: ${problema}`);
process.exit(1);
