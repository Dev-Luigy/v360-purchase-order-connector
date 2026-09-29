/**
 * Aceitação de FIX-14 **pela aplicação em execução**.
 *
 * Nada aqui importa `buildApp`, repositório ou caso de uso, e nada usa
 * `app.inject`: tudo passa por `fetch` contra a porta 3000, como a plataforma
 * passaria. É exigência registrada em REVIEW-13, e a razão é boa — os defeitos
 * que a revisão encontrou existiam com a suíte inteira verde, porque estavam
 * na combinação entre lotes, chave física e semântica de relatório.
 *
 * Cada cenário afirma três coisas ao mesmo tempo: o status HTTP, o corpo do
 * relatório e o estado observável pelas rotas de consulta.
 *
 *   docker compose up -d --build
 *   node scripts/validate-fix-14-http.mjs
 */

import { randomUUID } from 'node:crypto';

const base = process.env.API_URL ?? 'http://127.0.0.1:3000';
// Prefixo por execução: o script é repetível sem depender do que havia antes.
const corrida = randomUUID().slice(0, 8).toUpperCase();
const resultados = [];

async function exige(cenario, verificar) {
  try {
    await verificar();
    resultados.push({ cenario, ok: true, detalhe: '' });
  } catch (erro) {
    resultados.push({
      cenario,
      ok: false,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
  }
}

function confere(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

const numeroDe = (sufixo) => `F14-${corrida}-${sufixo}`;

const cabecalho = (numero, over = {}) => ({
  po_number: numero,
  created_at: '2026-09-02',
  status: 'open',
  currency: 'BRL',
  vendor: { tax_id: '67890123000145', name: 'Embalagens Norte Sul Ltda' },
  ...over,
});

const item = (numero, linha, material = `M-${String(linha)}`) => ({
  purchase_order: numero,
  created_at: '2026-09-02',
  line: linha,
  material,
  description: 'Item de aceitação',
  uom: 'UN',
  quantity_ordered: 10,
  quantity_received: 0,
  unit_price: 1.5,
});

/** Carga Delta por multipart, como a plataforma envia. */
async function carregar(partes) {
  const corpo = new FormData();
  for (const [nome, conteudo] of Object.entries(partes)) {
    corpo.append(
      nome,
      new Blob([JSON.stringify({ [nome]: conteudo })], {
        type: 'application/json',
      }),
      `${nome}.json`,
    );
  }
  const resposta = await fetch(`${base}/clients/delta/ingestions`, {
    method: 'POST',
    headers: { 'x-format-version': '1' },
    body: corpo,
  });
  return { status: resposta.status, corpo: await resposta.json() };
}

/**
 * Detalhe do pedido pelas rotas de consulta, nunca por SQL.
 *
 * Pelo filtro de número: paginar o cliente inteiro para achar um pedido
 * custava centenas de requisições e batia no teto de requisições assim que o
 * banco tinha dado de outras medições.
 */
async function detalhe(numero) {
  const lista = await (
    await fetch(
      `${base}/purchase-orders?clientId=delta` +
        `&externalNumber=${encodeURIComponent(numero)}`,
    )
  ).json();
  if (lista.data.length === 0) return { status: 404, corpo: null };
  const resposta = await fetch(`${base}/purchase-orders/${lista.data[0].id}`);
  return { status: resposta.status, corpo: await resposta.json() };
}

// ------------------------------------------------- o serviço está de pé

const saude = await fetch(`${base}/ready`);
if (saude.status !== 200) {
  console.error(
    `A aplicação precisa estar no ar: GET /ready respondeu ${String(saude.status)}.\n` +
      'Suba com `docker compose up -d --build` e espere ficar saudável.',
  );
  process.exit(1);
}

// ----------------------------------------------------------- cenários

await exige('as quatro fixtures do enunciado entram pelas rotas', async () => {
  const { openAsBlob } = await import('node:fs');
  const enviar = async (cliente, partes) => {
    const corpo = new FormData();
    for (const [nome, caminho] of Object.entries(partes)) {
      corpo.append(nome, await openAsBlob(caminho), caminho.split('/').pop());
    }
    const resposta = await fetch(`${base}/clients/${cliente}/ingestions`, {
      method: 'POST',
      headers: { 'x-format-version': '1' },
      body: corpo,
    });
    return { status: resposta.status, corpo: await resposta.json() };
  };

  const alfa = await enviar('alfa', {
    orders: 'tests/fixtures/alfa/purchase-orders.json',
  });
  const beta = await enviar('beta', {
    headers: 'tests/fixtures/beta/cabecalho.csv',
    items: 'tests/fixtures/beta/itens.csv',
  });
  const gama = await enviar('gama', {
    lines: 'tests/fixtures/gama/purchase-order-lines.json',
  });
  const delta = await enviar('delta', {
    orders: 'tests/fixtures/delta/orders.json',
    items: 'tests/fixtures/delta/items.json',
  });

  for (const [nome, r] of Object.entries({ alfa, beta, gama, delta })) {
    confere(r.status === 200, `${nome}: HTTP ${String(r.status)}`);
    confere(r.corpo.ordersAccepted > 0, `${nome}: nenhum pedido aceito`);
  }
});

await exige('conferência, histórico e resumo respondem', async () => {
  const conferencia = await fetch(`${base}/conferences`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: 'alfa',
      purchaseOrderNumber: '4500001234',
      supplierTaxId: '23456789000101',
      lines: [{ material: 'MAT-1001', quantity: '40', totalValue: '1836.00' }],
    }),
  });
  confere(conferencia.status === 201, `HTTP ${String(conferencia.status)}`);
  confere(
    (await conferencia.json()).outcome === 'aprovada',
    'nota conforme não foi aprovada',
  );

  const historico = await fetch(`${base}/conferences?limit=10`);
  confere(historico.status === 200, 'histórico não respondeu');
  confere('page' in (await historico.json()), 'histórico sem paginação');

  const resumo = await fetch(`${base}/conferences/summary`);
  confere(resumo.status === 200, 'resumo não respondeu');
  confere((await resumo.json()).checked > 0, 'resumo sem conferências');
});

await exige('duas cargas simultâneas com linhas distintas', async () => {
  const numero = numeroDe('DISTINTAS');
  await carregar({ orders: [cabecalho(numero)] });

  const [a, b] = await Promise.all([
    carregar({ items: [item(numero, 10, 'DE-A')] }),
    carregar({ items: [item(numero, 20, 'DE-B')] }),
  ]);

  confere(a.status === 200 && b.status === 200, 'alguma carga não foi 200');
  confere(a.corpo.itemsAccepted === 1, `A aceitou ${a.corpo.itemsAccepted}`);
  confere(b.corpo.itemsAccepted === 1, `B aceitou ${b.corpo.itemsAccepted}`);
  confere(
    a.corpo.stagedTotal === 0 && b.corpo.stagedTotal === 0,
    'alguma carga deixou item esperando',
  );

  const pedido = await detalhe(numero);
  confere(pedido.corpo.items.length === 2, 'o retrato não tem as duas linhas');
});

await exige('duas cargas simultâneas com as MESMAS linhas', async () => {
  // R13-01: a chave física ignorava a carga, então uma tomava a linha da
  // outra e os dois relatórios mentiam.
  const numero = numeroDe('MESMAS');
  await carregar({ orders: [cabecalho(numero)] });

  const [a, b] = await Promise.all([
    carregar({ items: [item(numero, 10, 'DE-A'), item(numero, 20, 'DE-A2')] }),
    carregar({ items: [item(numero, 10, 'DE-B'), item(numero, 20, 'DE-B2')] }),
  ]);

  confere(a.status === 200 && b.status === 200, 'alguma carga não foi 200');
  confere(
    a.corpo.itemsAccepted === 2,
    `A trouxe 2 linhas e aceitou ${a.corpo.itemsAccepted}`,
  );
  confere(
    b.corpo.itemsAccepted === 2,
    `B trouxe 2 linhas e aceitou ${b.corpo.itemsAccepted}`,
  );
  confere(
    a.corpo.stagedTotal === 0 && b.corpo.stagedTotal === 0,
    `espera fantasma: A=${a.corpo.stagedTotal} B=${b.corpo.stagedTotal}`,
  );

  // O retrato tem uma linha de cada número; qual das duas cargas venceu é
  // decidido pelo lock, e as duas são respostas legítimas.
  const pedido = await detalhe(numero);
  confere(
    pedido.corpo.items.length === 2,
    `retrato com ${String(pedido.corpo.items.length)} itens`,
  );
  for (const linha of pedido.corpo.items) {
    confere(
      /^DE-[AB]2?$/.test(linha.material),
      `material inesperado: ${linha.material}`,
    );
  }
});

await exige('duplicata da mesma linha dentro de uma carga', async () => {
  // R13-02: o relatório contava as duas ocorrências e fabricava espera.
  const numero = numeroDe('DUPLICATA');
  await carregar({ orders: [cabecalho(numero)] });

  const carga = await carregar({
    items: [item(numero, 10, 'PRIMEIRO'), item(numero, 10, 'SEGUNDO')],
  });

  confere(carga.status === 200, `HTTP ${String(carga.status)}`);
  confere(
    carga.corpo.stagedTotal === 0,
    `espera fabricada: ${String(carga.corpo.stagedTotal)}`,
  );
  confere(
    carga.corpo.staged.length === carga.corpo.stagedTotal,
    'amostra e total discordam',
  );
  confere(
    carga.corpo.itemsAccepted === 1,
    `aceitou ${String(carga.corpo.itemsAccepted)} para uma linha`,
  );

  const pedido = await detalhe(numero);
  confere(pedido.corpo.items.length === 1, 'duplicata virou duas linhas');
  confere(
    pedido.corpo.items[0].material === 'SEGUNDO',
    'a última ocorrência não prevaleceu',
  );
});

await exige('exatamente 10.000 itens sem cabeçalho são aceitos', async () => {
  // O limite tem que ser alcançável: um teto que recusa no próprio valor
  // esconderia um erro de contagem por um.
  const numero = numeroDe('NOLIMITE');
  await carregar({ orders: [cabecalho(numero)] });

  const cheio = Array.from({ length: 10_000 }, (_, i) => item(numero, i + 1));
  const carga = await carregar({ items: cheio });

  confere(carga.status === 200, `HTTP ${String(carga.status)}`);
  confere(
    carga.corpo.itemsAccepted === 10_000,
    `aceitou ${String(carga.corpo.itemsAccepted)} de 10.000`,
  );
  confere(carga.corpo.rejectedTotal === 0, 'recusou dentro do limite');

  const pedido = await detalhe(numero);
  confere(
    pedido.corpo.items.length === 10_000,
    `retrato com ${String(pedido.corpo.items.length)} itens`,
  );
});

await exige('10.001 itens recusam sem mudar o retrato anterior', async () => {
  // R13-03: a mensagem dizia "pedido inteiro recusado" e gravava os
  // primeiros dez mil assim mesmo.
  const numero = numeroDe('TETO');
  await carregar({
    orders: [cabecalho(numero)],
    items: [item(numero, 1, 'ORIGINAL')],
  });
  const antes = await detalhe(numero);
  confere(antes.corpo.items.length === 1, 'preparação falhou');

  const excesso = Array.from({ length: 10_001 }, (_, i) =>
    item(numero, i + 100),
  );
  const recusa = await carregar({ items: excesso });

  confere(recusa.status === 200, `HTTP ${String(recusa.status)}`);
  confere(
    recusa.corpo.itemsAccepted === 0,
    `gravou ${String(recusa.corpo.itemsAccepted)} do que disse recusar`,
  );
  confere(recusa.corpo.rejectedTotal > 0, 'não reportou a recusa');
  confere(
    recusa.corpo.stagedTotal === 0,
    `deixou ${String(recusa.corpo.stagedTotal)} linhas escondidas`,
  );

  const depois = await detalhe(numero);
  confere(
    depois.corpo.items.length === 1,
    `o retrato mudou: ${String(depois.corpo.items.length)} itens`,
  );
  confere(
    depois.corpo.items[0].material === 'ORIGINAL',
    'o item original foi substituído',
  );
});

await exige(
  'falha do agregado não esconde linhas nem apaga o retrato',
  async () => {
    // R13-04, o caminho que perdia dado: a carga falhava dizendo zero em
    // espera, e o reenvio só de cabeçalho consumia as linhas escondidas e
    // substituía o retrato anterior.
    const numero = numeroDe('AGREGADO');
    await carregar({
      orders: [cabecalho(numero)],
      items: [item(numero, 1, 'ORIGINAL')],
    });

    const excesso = Array.from({ length: 10_000 }, (_, i) =>
      item(numero, i + 100),
    );
    const falha = await carregar({ items: excesso });
    confere(falha.status === 200, `HTTP ${String(falha.status)}`);
    confere(
      falha.corpo.itemsAccepted === 0,
      `aplicou ${String(falha.corpo.itemsAccepted)} apesar de exceder o agregado`,
    );
    confere(
      falha.corpo.stagedTotal === falha.corpo.staged.length ||
        falha.corpo.staged.length === 100,
      'amostra e total do relatório discordam',
    );

    const entre = await detalhe(numero);
    confere(entre.corpo.items.length === 1, 'o retrato mudou na falha');

    // O reenvio do cabeçalho não pode substituir o conhecido pela espera.
    const soCabecalho = await carregar({ orders: [cabecalho(numero)] });
    confere(soCabecalho.status === 200, `HTTP ${String(soCabecalho.status)}`);

    const fim = await detalhe(numero);
    confere(
      fim.corpo.items.some((linha) => linha.material === 'ORIGINAL'),
      'o item original desapareceu depois do reenvio do cabeçalho',
    );
  },
);

await exige('carga só de cabeçalho não apaga os itens conhecidos', async () => {
  const numero = numeroDe('CABECALHO');
  await carregar({
    orders: [cabecalho(numero)],
    items: [item(numero, 10), item(numero, 20)],
  });

  const soCabecalho = await carregar({ orders: [cabecalho(numero)] });
  confere(
    soCabecalho.corpo.itemsAccepted === 0,
    `relatou ${String(soCabecalho.corpo.itemsAccepted)} itens que não vieram`,
  );

  const pedido = await detalhe(numero);
  confere(pedido.corpo.items.length === 2, 'os itens conhecidos sumiram');
});

await exige(
  'item sem cabeçalho fica esperando, e o relatório o mostra',
  async () => {
    const numero = numeroDe('ORFAO');
    const carga = await carregar({ items: [item(numero, 10)] });

    confere(carga.status === 200, `HTTP ${String(carga.status)}`);
    confere(carga.corpo.ordersAccepted === 0, 'inventou um pedido');
    confere(
      carga.corpo.stagedTotal === 1,
      `espera reportada: ${String(carga.corpo.stagedTotal)}`,
    );
    confere(carga.corpo.staged.length === 1, 'a amostra escondeu o que ficou');
    confere(
      carga.corpo.staged[0].reference === numero,
      'a amostra aponta outro pedido',
    );

    confere((await detalhe(numero)).status === 404, 'o órfão virou pedido');

    // E o cabeçalho, chegando depois, traz o item.
    await carregar({ orders: [cabecalho(numero)] });
    const pedido = await detalhe(numero);
    confere(pedido.corpo.items.length === 1, 'a reconciliação não aconteceu');
  },
);

await exige(
  'pedido recusado por teto não deixa item nenhum, mesmo desalinhado',
  async () => {
    // R14-01: a purga apagava o que os lotes anteriores gravaram, mas os
    // itens do mesmo pedido já percorridos **no lote atual** continuavam na
    // lista a gravar e voltavam logo depois.
    //
    // O cenário anterior passava por acidente de alinhamento: 10.001 itens
    // consecutivos com lote 200 põem o estouro numa fronteira, onde a lista
    // está vazia. Um órfão de outro pedido antes desloca em uma posição.
    const alvo = numeroDe('DESALINHADO');
    const deslocador = numeroDe('DESLOCADOR');
    await carregar({ orders: [cabecalho(alvo)] });

    const carga = await carregar({
      items: [
        item(deslocador, 1),
        ...Array.from({ length: 10_001 }, (_, i) => item(alvo, i + 1)),
      ],
    });

    confere(carga.status === 200, `HTTP ${String(carga.status)}`);
    confere(carga.corpo.rejectedTotal > 0, 'não reportou a recusa');
    confere(
      carga.corpo.stagedTotal === 1,
      `espera deveria ter só o deslocador, veio ${String(carga.corpo.stagedTotal)}`,
    );
    confere(
      carga.corpo.staged.every((s) => s.reference === deslocador),
      `o pedido recusado ficou na espera: ${JSON.stringify(carga.corpo.staged.map((s) => s.reference))}`,
    );

    const depois = await detalhe(alvo);
    confere(
      depois.corpo.items.length === 0,
      `o pedido recusado tem ${String(depois.corpo.items.length)} itens`,
    );

    // E reenviar o cabeçalho não pode aplicar nada do que foi recusado.
    await carregar({ orders: [cabecalho(alvo)] });
    const fim = await detalhe(alvo);
    confere(
      fim.corpo.items.length === 0,
      `o reenvio do cabeçalho aplicou ${String(fim.corpo.items.length)} item(ns) do pedido recusado`,
    );
  },
);

await exige(
  'cabeçalho concorrente não consome o prefixo de uma carga em andamento',
  async () => {
    // A outra metade de R14-01: enquanto a carga lê os lotes, as linhas dela
    // ficam invisíveis para a reconciliação de outra requisição. Sem isso, um
    // cabeçalho que chega no meio leva o prefixo — e se a carga depois recusar
    // o pedido por teto, o que foi levado não volta.
    const alvo = numeroDe('CORRIDA');

    const excedente = carregar({
      items: Array.from({ length: 10_001 }, (_, i) => item(alvo, i + 1)),
    });
    // Sem esperar: o cabeçalho entra enquanto a carga acima ainda lê.
    await new Promise((resolve) => setTimeout(resolve, 150));
    const cabecalhoNoMeio = await carregar({ orders: [cabecalho(alvo)] });
    const recusa = await excedente;

    confere(recusa.corpo.rejectedTotal > 0, 'a carga excedente não recusou');
    confere(
      cabecalhoNoMeio.corpo.itemsAccepted === 0,
      `o cabeçalho concorrente levou ${String(cabecalhoNoMeio.corpo.itemsAccepted)} item(ns) de uma carga em andamento`,
    );

    const fim = await detalhe(alvo);
    confere(
      fim.corpo.items.length === 0,
      `o pedido recusado terminou com ${String(fim.corpo.items.length)} itens`,
    );
  },
);

await exige(
  'carga só de cabeçalho relata só o que veio da espera',
  async () => {
    // R14-03: `recovered` saía da cardinalidade final do retrato, contando
    // item já gravado como recuperado agora.
    //
    // A versão anterior deste cenário não exercitava isso: o pedido já
    // existia, então o item novo era aplicado pela própria carga e não havia
    // resíduo nenhum na espera (REVIEW-15, R15-03). Agora o resíduo é criado
    // pelo caminho real — item sem cabeçalho fica esperando — e o cabeçalho
    // chega depois.
    const numero = numeroDe('RESIDUO');

    // Uma carga só de itens, sem cabeçalho: as três linhas ficam esperando.
    const espera = await carregar({
      items: [item(numero, 10), item(numero, 20), item(numero, 30)],
    });
    confere(espera.corpo.ordersAccepted === 0, 'inventou um pedido');
    confere(
      espera.corpo.stagedTotal === 3,
      `espera: ${String(espera.corpo.stagedTotal)}`,
    );
    confere((await detalhe(numero)).status === 404, 'o órfão virou pedido');

    // O cabeçalho chega e recupera exatamente as três, nem mais nem menos.
    const cabecalhoDepois = await carregar({ orders: [cabecalho(numero)] });
    confere(
      cabecalhoDepois.corpo.itemsAccepted === 3,
      `recuperou ${String(cabecalhoDepois.corpo.itemsAccepted)} de 3`,
    );

    const pedido = await detalhe(numero);
    confere(pedido.corpo.items.length === 3, 'o retrato não tem as três');

    // E um segundo reenvio do cabeçalho, sem nada esperando, não pode
    // relatar como recuperado o que já estava gravado.
    const semEspera = await carregar({ orders: [cabecalho(numero)] });
    confere(
      semEspera.corpo.itemsAccepted === 0,
      `relatou ${String(semEspera.corpo.itemsAccepted)} itens sem nada esperando`,
    );
    confere(
      (await detalhe(numero)).corpo.items.length === 3,
      'o reenvio mexeu no retrato',
    );
  },
);

await exige('payload malformado responde 422 e não deixa resíduo', async () => {
  // R15-01: JSON truncado depois de um lote respondia 500 e deixava linhas
  // invisíveis no banco, sem caminho de recuperação.
  const numero = numeroDe('TRUNCADO');
  const validos = Array.from({ length: 700 }, (_, i) =>
    item(`${numero}-${String(i)}`, 10),
  );
  const texto = JSON.stringify({ items: validos });

  const corpo = new FormData();
  corpo.append(
    'items',
    new Blob([texto.slice(0, texto.length - 30)], {
      type: 'application/json',
    }),
    'items.json',
  );
  const resposta = await fetch(`${base}/clients/delta/ingestions`, {
    method: 'POST',
    headers: { 'x-format-version': '1' },
    body: corpo,
  });

  confere(
    resposta.status === 422,
    `payload malformado respondeu ${String(resposta.status)}`,
  );
  const relatorio = await resposta.json();
  confere(
    relatorio.error !== 'erro_interno',
    'tratou payload do cliente como defeito interno',
  );

  // Nenhum dos pedidos da carga interrompida pode ter ficado para trás.
  const sobrou = await detalhe(`${numero}-0`);
  confere(sobrou.status === 404, 'a carga interrompida gravou pedido');
});

// ------------------------------------------------------------- veredito

const largura = Math.max(...resultados.map((r) => r.cenario.length));
console.log();
for (const r of resultados) {
  console.log(
    `  ${r.ok ? '✔' : '✖'} ${r.cenario.padEnd(largura)}` +
      (r.ok ? '' : `\n      ${r.detalhe}`),
  );
}
const falhas = resultados.filter((r) => !r.ok).length;
console.log(
  `\n  ${String(resultados.length - falhas)}/${String(resultados.length)} cenários pela aplicação real` +
    (falhas > 0 ? `, ${String(falhas)} falharam` : ''),
);
console.log(`  prefixo desta execução: F14-${corrida}`);
process.exit(falhas > 0 ? 1 : 0);
