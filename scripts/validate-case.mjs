/**
 * Confere o serviço no ar contra **cada** exigência do enunciado
 * ([docs/CASE.md](../docs/CASE.md)), uma asserção por exigência.
 *
 * A suíte de teste prova unidades e a de integração prova o banco; nenhuma das
 * duas responde "o desafio está atendido?". Este script responde, pelo HTTP
 * real, e é o que sustenta o marco `parte-1`.
 *
 *   docker compose up -d
 *   node scripts/validate-case.mjs
 */

import { openAsBlob } from 'node:fs';

const base = process.env.API_URL ?? 'http://127.0.0.1:3000';
const resultados = [];

async function exige(requisito, descricao, verificar) {
  try {
    await verificar();
    resultados.push({ requisito, descricao, ok: true, detalhe: '' });
  } catch (erro) {
    resultados.push({
      requisito,
      descricao,
      ok: false,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
  }
}

function confere(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

const pegar = async (caminho) => {
  const resposta = await fetch(`${base}${caminho}`);
  const corpo = await resposta.json();
  return { status: resposta.status, corpo };
};

const postar = async (caminho, payload) => {
  const resposta = await fetch(`${base}${caminho}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: resposta.status, corpo: await resposta.json() };
};

async function carregarTexto(clientId, partes) {
  const corpo = new FormData();
  for (const [nome, texto] of Object.entries(partes)) {
    corpo.append(
      nome,
      new Blob([texto], { type: 'application/json' }),
      `${nome}.json`,
    );
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

async function carregar(clientId, partes) {
  const corpo = new FormData();
  for (const [nome, caminho] of Object.entries(partes)) {
    corpo.append(nome, await openAsBlob(caminho), caminho.split('/').pop());
  }
  const resposta = await fetch(`${base}/clients/${clientId}/ingestions`, {
    method: 'POST',
    headers: { 'x-format-version': '1' },
    body: corpo,
  });
  const relatorio = await resposta.json();
  if (!resposta.ok)
    throw new Error(`carga ${clientId}: ${JSON.stringify(relatorio)}`);
  return relatorio;
}

/**
 * Um pedido específico de um cliente, buscado pelo filtro dele.
 *
 * Ler a primeira página e procurar ali passava por acidente de ordenação: os
 * cem primeiros são os mais antigos, então um cliente carregado depois nunca
 * aparecia e a asserção não provava o que dizia.
 */
async function pedidoDe(clientId, externalNumber) {
  const { corpo } = await pegar(
    `/purchase-orders?clientId=${clientId}` +
      `&externalNumber=${encodeURIComponent(externalNumber)}`,
  );
  return corpo.data[0] ?? null;
}

/** Percorre todas as páginas de uma consulta, pelo cursor. */
async function todasAsPaginas(caminho) {
  const tudo = [];
  let cursor = null;
  for (;;) {
    const url = new URL(`${base}${caminho}`);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const pagina = await (await fetch(url)).json();
    tudo.push(...pagina.data);
    cursor = pagina.page.nextCursor;
    if (!cursor) break;
  }
  return tudo;
}

/**
 * Linha de base do histórico, tirada **antes** de qualquer conferência desta
 * execução. As conferências não são apagadas por reingestão — é decisão do
 * ADR-009 —, então o script compara o que ele mesmo acrescentou.
 */
const baseDoResumo = (await pegar('/conferences/summary')).corpo;

// Pedidos das amostras, por saldo esperado. O script afirma sobre estes, e
// não sobre a contagem global do banco.
const comSaldoDestaExecucao = [
  'alfa:4500001234',
  'beta:20260088412',
  'beta:20260088413',
  'gama:GL-778',
  'delta:DL-2026-0044',
];
const semSaldoDestaExecucao = [
  'gama:GL-779',
  'delta:DL-2026-0045',
  'delta:DL-2026-0046',
];

// ---------------------------------------------------------------- ingestão

const alfa = await carregar('alfa', {
  orders: 'tests/fixtures/alfa/purchase-orders.json',
});
const beta = await carregar('beta', {
  headers: 'tests/fixtures/beta/cabecalho.csv',
  items: 'tests/fixtures/beta/itens.csv',
});
const gama = await carregar('gama', {
  lines: 'tests/fixtures/gama/purchase-order-lines.json',
});
const delta = await carregar('delta', {
  orders: 'tests/fixtures/delta/orders.json',
  items: 'tests/fixtures/delta/items.json',
});

await exige(
  'Parte 1',
  'Alfa (JSON aninhado) e Beta (dois CSV) entram pelos mesmos endpoints',
  () => {
    confere(
      alfa.ordersAccepted === 1 && alfa.itemsAccepted === 2,
      `alfa: ${JSON.stringify(alfa)}`,
    );
    confere(
      beta.ordersAccepted === 2 && beta.itemsAccepted === 3,
      `beta: ${JSON.stringify(beta)}`,
    );
  },
);

// ------------------------------------------------- requisito 1: consulta

await exige(
  'Req 1',
  'consulta unificada devolve os dois clientes no mesmo contrato',
  async () => {
    const a = await pedidoDe('alfa', '4500001234');
    const b = await pedidoDe('beta', '20260088412');
    confere(a !== null, 'o pedido do alfa não veio na consulta');
    confere(b !== null, 'o pedido do beta não veio na consulta');
    // "Formato único" só vale se os campos forem os mesmos para os dois.
    confere(
      Object.keys(a).sort().join(',') === Object.keys(b).sort().join(','),
      'clientes diferentes devolveram campos diferentes',
    );
    // O Beta veio com vírgula decimal, ponto de milhar, CNPJ com máscara e
    // data dd/mm/aaaa; se a normalização falhasse, apareceria aqui.
    confere(
      b.supplier.taxId === '12345678000190',
      `CNPJ não normalizado: ${b.supplier.taxId}`,
    );
    confere(b.issuedOn === '2026-08-15', `data não normalizada: ${b.issuedOn}`);
    confere(b.status === 'aberto', `situação não normalizada: ${b.status}`);
  },
);

await exige('Req 1', 'filtro por cliente de origem', async () => {
  // Pelo recorte, não percorrendo o cliente inteiro: com cem mil pedidos no
  // banco, varrer tudo são milhares de requisições e o próprio teto do
  // serviço recusa a validação.
  for (const esperado of ['20260088412', '20260088413']) {
    const achado = await pedidoDe('beta', esperado);
    confere(achado !== null, `${esperado} não veio no filtro por cliente`);
    confere(achado.clientId === 'beta', 'o filtro devolveu outro cliente');
  }
  // E o filtro não pode vazar: uma página basta para ver isso.
  const { corpo } = await pegar('/purchase-orders?clientId=beta&limit=100');
  confere(
    corpo.data.every((p) => p.clientId === 'beta'),
    'vazou pedido de outro cliente',
  );
});

await exige('Req 1', 'filtro por fornecedor', async () => {
  const doFornecedor = await todasAsPaginas(
    '/purchase-orders?supplierTaxId=98765432000155',
  );
  confere(
    doFornecedor.some((p) => p.externalNumber === '20260088413'),
    '20260088413 não veio no filtro por fornecedor',
  );
  confere(
    doFornecedor.every((p) => p.supplier.taxId === '98765432000155'),
    'vazou pedido de outro fornecedor',
  );
});

await exige('Req 1', 'filtro por situação do pedido', async () => {
  const bloqueados = await todasAsPaginas('/purchase-orders?status=bloqueado');
  confere(
    bloqueados.some((p) => p.externalNumber === '20260088413'),
    'o pedido bloqueado da amostra não veio',
  );
  confere(
    bloqueados.every((p) => p.status === 'bloqueado'),
    'vazou pedido de outra situação',
  );
});

await exige('Req 1', 'apenas os que ainda têm algo a receber', async () => {
  // Um a um, pelo recorte: percorrer todos os pendentes eram milhares de
  // requisições com o banco cheio, e o próprio teto do serviço recusava a
  // validação (REVIEW-10, R10-05, e o mesmo problema com volume real).
  for (const esperado of comSaldoDestaExecucao) {
    const [cliente, numero] = esperado.split(':');
    const { corpo } = await pegar(
      `/purchase-orders?clientId=${cliente}&externalNumber=${numero}&pending=true`,
    );
    confere(corpo.data.length === 1, `${esperado} deveria ter saldo`);
    confere(corpo.data[0].hasPendingBalance, `${esperado} sem saldo marcado`);
  }
  for (const vazio of semSaldoDestaExecucao) {
    const [cliente, numero] = vazio.split(':');
    const { corpo } = await pegar(
      `/purchase-orders?clientId=${cliente}&externalNumber=${numero}&pending=true`,
    );
    confere(
      corpo.data.length === 0,
      `${vazio} não tem saldo e apareceu no filtro`,
    );
  }
  // E o filtro não devolve pedido sem saldo: uma página basta.
  const { corpo } = await pegar('/purchase-orders?pending=true&limit=100');
  confere(
    corpo.data.every((p) => p.hasPendingBalance),
    'veio pedido sem saldo',
  );
});

await exige(
  'Req 1',
  'filtros combinados convivem com a paginação',
  async () => {
    const { corpo } = await pegar(
      '/purchase-orders?clientId=beta&pending=true&status=aberto&limit=1',
    );
    confere(
      corpo.data.length === 1,
      `esperava 1 por página, veio ${corpo.data.length}`,
    );
    confere(
      corpo.page.nextCursor === null || corpo.data[0].clientId === 'beta',
      'filtro perdido',
    );
    confere(
      corpo.data[0].status === 'aberto' && corpo.data[0].hasPendingBalance,
      'filtro não aplicado',
    );
  },
);

await exige(
  'Req 1',
  'detalhe traz o que já foi recebido e o que falta em cada item',
  async () => {
    // Pelo número do pedido, não por posição: `data[0]` é outro pedido assim
    // que o banco tem mais de um do mesmo cliente.
    const { corpo: lista } = await pegar(
      '/purchase-orders?clientId=alfa&limit=100',
    );
    const daAmostra = lista.data.find((p) => p.externalNumber === '4500001234');
    confere(daAmostra !== undefined, 'o pedido da amostra sumiu da consulta');
    const { status, corpo } = await pegar(`/purchase-orders/${daAmostra.id}`);
    confere(status === 200, `detalhe respondeu ${status}`);
    const item = corpo.items.find((i) => i.material === 'MAT-1001');
    confere(
      item.quantityOrdered === '100.000000',
      `pedida: ${item.quantityOrdered}`,
    );
    confere(
      item.quantityReceived === '60.000000',
      `recebida: ${item.quantityReceived}`,
    );
    confere(
      item.quantityPending === '40.000000',
      `falta: ${item.quantityPending}`,
    );
    // 45.9 é número JSON: se tivesse virado ponto flutuante, não voltaria exato.
    confere(item.unitPrice === '45.900000', `preço: ${item.unitPrice}`);
  },
);

// ---------------------------------------------- requisito 2: conferência

await exige('Req 2', 'nota conforme o pedido é aprovada', async () => {
  const { status, corpo } = await postar('/conferences', {
    clientId: 'alfa',
    purchaseOrderNumber: '4500001234',
    supplierTaxId: '23456789000101',
    lines: [{ material: 'MAT-1001', quantity: '40', totalValue: '1836.00' }],
  });
  confere(status === 201, `respondeu ${status}: ${JSON.stringify(corpo)}`);
  confere(corpo.outcome === 'aprovada', `resultado: ${corpo.outcome}`);
  confere(corpo.divergences.length === 0, 'aprovada com divergência');
});

await exige(
  'Req 2',
  'nota divergente diz exatamente o que não bate',
  async () => {
    const { status, corpo } = await postar('/conferences', {
      clientId: 'beta',
      purchaseOrderNumber: '20260088413',
      supplierTaxId: '98765432000155',
      lines: [
        { material: 'MAT-91', quantity: '5000', totalValue: '1.00' },
        { material: 'MAT-INEXISTENTE', quantity: '1', totalValue: '1.00' },
      ],
    });
    confere(status === 201, `respondeu ${status}`);
    confere(corpo.outcome === 'reprovada', `resultado: ${corpo.outcome}`);
    const codigos = corpo.divergences.map((d) => d.code);
    // O pedido está BLOQUEADO, a quantidade excede o saldo e há material que o
    // pedido não tem: a plataforma precisa dos três sem adivinhar nada.
    for (const esperado of [
      'PEDIDO_NAO_ABERTO',
      'QUANTIDADE_ACIMA_DO_SALDO',
      'MATERIAL_NAO_ENCONTRADO',
    ]) {
      confere(
        codigos.includes(esperado),
        `faltou ${esperado}; veio ${codigos.join(',')}`,
      );
    }
    // "Sem adivinhar nada": cada divergência aponta campo, esperado e recebido.
    for (const d of corpo.divergences) {
      confere(
        typeof d.field === 'string' && d.field.length > 0,
        `divergência sem campo: ${d.code}`,
      );
      confere(
        'expected' in d && 'received' in d,
        `divergência sem esperado/recebido: ${d.code}`,
      );
    }
  },
);

// ------------------------------------------------- requisito 3: relatório

await exige(
  'Req 3',
  'relatório diz quantas passaram, quantas travaram e por quais motivos',
  async () => {
    // Delta contra a linha de base: o histórico é acumulativo por desenho —
    // reingestão não o reescreve —, então exigir totais absolutos tornava o
    // script dependente de banco recém-limpo (REVIEW-10, R10-05).
    const { corpo } = await pegar('/conferences/summary');
    const feitas = corpo.checked - baseDoResumo.checked;
    const aprovadas = corpo.approved - baseDoResumo.approved;
    const reprovadas = corpo.rejected - baseDoResumo.rejected;
    // Duas até aqui: as conferências do Gama rodam depois, na Parte 2.
    confere(feitas === 2, `conferidas até aqui: ${feitas}`);
    confere(aprovadas === 1, `aprovadas até aqui: ${aprovadas}`);
    confere(reprovadas === 1, `reprovadas até aqui: ${reprovadas}`);
    const motivos = Object.keys(corpo.divergencesByCode);
    confere(motivos.length >= 3, `motivos: ${motivos.join(',')}`);
  },
);

await exige(
  'Req 3',
  'histórico de conferências é paginado e filtrável',
  async () => {
    const { corpo } = await pegar('/conferences?outcome=reprovada&limit=1');
    confere(corpo.data.length === 1, `esperava 1, veio ${corpo.data.length}`);
    confere(corpo.data[0].outcome === 'reprovada', 'filtro não aplicado');
    confere(
      'page' in corpo && 'nextCursor' in corpo.page,
      'relatório sem envelope de página',
    );
  },
);

// -------------------------------------- exigência não opcional 1: banco

await exige(
  'Banco',
  'o mesmo número de pedido existe em clientes diferentes',
  async () => {
    // O enunciado cobra isso explicitamente: a identidade é (cliente, número).
    const relatorio = await carregar('alfa', {
      orders: 'tests/fixtures/alfa/purchase-orders.json',
    });
    confere(relatorio.ordersAccepted === 1, 'reenvio do alfa recusado');
    const { corpo } = await pegar('/purchase-orders?limit=100');
    const numeros = corpo.data.map((p) => `${p.clientId}:${p.externalNumber}`);
    confere(new Set(numeros).size === numeros.length, 'identidade duplicada');
  },
);

await exige(
  'Banco',
  'reenvio de pedido que mudou atualiza no lugar e recalcula o saldo',
  async () => {
    // Afirma sobre **o pedido da amostra**, não sobre a contagem do cliente:
    // qualquer outro pedido alfa no banco — de outro script, de outra carga —
    // fazia a contagem global mentir sobre duplicação (REVIEW-10, R10-05).
    const numero = '4500001234';
    const daAmostra = async () => {
      const { corpo } = await pegar('/purchase-orders?clientId=alfa&limit=100');
      const achados = corpo.data.filter((p) => p.externalNumber === numero);
      confere(
        achados.length === 1,
        `reenvio duplicou: ${achados.length} pedidos com o número ${numero}`,
      );
      return achados[0];
    };

    const antes = await daAmostra();
    await carregar('alfa', {
      orders: 'tests/fixtures/alfa/purchase-orders.json',
    });
    const depois = await daAmostra();

    confere(depois.id === antes.id, 'reenvio trocou a identidade interna');
    confere(
      depois.ingestionVersion === antes.ingestionVersion + 1,
      `versão foi de ${antes.ingestionVersion} para ${depois.ingestionVersion}`,
    );
    confere(
      depois.pendingItemCount === antes.pendingItemCount,
      'o saldo mudou sem o dado ter mudado',
    );
  },
);

// -------------------------------- exigência não opcional 2: paginação

await exige('Paginação', 'tamanho de página padrão definido (50)', async () => {
  const { corpo } = await pegar('/purchase-orders');
  confere(corpo.page.limit === 50, `padrão veio ${corpo.page.limit}`);
});

await exige(
  'Paginação',
  'teto máximo definido (100) e acima disso é recusado',
  async () => {
    const { status } = await pegar('/purchase-orders?limit=101');
    confere(status === 400, `limite acima do teto respondeu ${status}`);
  },
);

await exige(
  'Paginação',
  'a resposta diz onde está, se há mais e como pedir o próximo',
  async () => {
    const { corpo } = await pegar('/purchase-orders?limit=1');
    for (const campo of ['limit', 'cursor', 'nextCursor', 'hasMore']) {
      confere(campo in corpo.page, `falta ${campo} no envelope`);
    }
    confere(corpo.page.hasMore === true, 'hasMore falso com mais páginas');
    const { corpo: segunda } = await pegar(
      `/purchase-orders?limit=1&cursor=${encodeURIComponent(corpo.page.nextCursor)}`,
    );
    confere(
      segunda.data[0].id !== corpo.data[0].id,
      'a segunda página repetiu a primeira',
    );
  },
);

await exige(
  'Paginação',
  'trocar o filtro no meio da varredura é recusado, não silenciado',
  async () => {
    const { corpo } = await pegar('/purchase-orders?clientId=beta&limit=1');
    const { status } = await pegar(
      `/purchase-orders?clientId=alfa&limit=1&cursor=${encodeURIComponent(corpo.page.nextCursor)}`,
    );
    confere(status === 400, `cursor de outro filtro respondeu ${status}`);
  },
);

// ----------------------------------------------------- Parte 2: Gama e Delta

await exige(
  'Parte 2',
  'Gama (linhas achatadas) e Delta (duas consultas) entram sem código de cliente',
  () => {
    confere(
      gama.ordersAccepted === 2 && gama.itemsAccepted === 3,
      `gama: ${JSON.stringify(gama)}`,
    );
    confere(
      delta.ordersAccepted === 3 && delta.itemsAccepted === 3,
      `delta: ${JSON.stringify(delta)}`,
    );
  },
);

await exige(
  'Parte 2',
  'os quatro clientes aparecem no mesmo contrato',
  async () => {
    // Um pedido conhecido de cada um, pelo filtro do próprio cliente: ler a
    // primeira página passava por acidente de ordenação.
    const amostras = Object.entries({
      alfa: '4500001234',
      beta: '20260088412',
      gama: 'GL-778',
      delta: 'DL-2026-0044',
    });
    const encontrados = [];
    for (const [cliente, numero] of amostras) {
      const pedido = await pedidoDe(cliente, numero);
      confere(pedido !== null, `${cliente}: ${numero} não veio na consulta`);
      encontrados.push(pedido);
    }
    const chaves = encontrados.map((p) => Object.keys(p).sort().join(','));
    confere(
      new Set(chaves).size === 1,
      'clientes diferentes devolveram campos diferentes',
    );
  },
);

await exige(
  'Gama',
  'timestamp Unix, centavos e situação numérica viram o contrato',
  async () => {
    const { corpo } = await pegar('/purchase-orders?clientId=gama&limit=10');
    const aberto = corpo.data.find((p) => p.externalNumber === 'GL-778');
    confere(aberto.issuedOn === '2026-08-15', `data: ${aberto.issuedOn}`);
    confere(aberto.status === 'aberto', `situação 1 virou: ${aberto.status}`);
    confere(aberto.currency === 'BRL', `moeda assumida: ${aberto.currency}`);
    const encerrado = corpo.data.find((p) => p.externalNumber === 'GL-779');
    confere(
      encerrado.status === 'encerrado',
      `situação 2 virou: ${encerrado.status}`,
    );
  },
);

await exige(
  'Gama',
  'quantidade em caixa é convertida a unidade na conferência',
  async () => {
    // O pedido guarda 8 caixas pendentes de fator 12; a nota fiscal do
    // fornecedor fala em unidades, então o saldo conferível é 96.
    const exata = await postar('/conferences', {
      clientId: 'gama',
      purchaseOrderNumber: 'GL-778',
      supplierTaxId: '34567890000112',
      lines: [{ material: 'TRP-01', quantity: '96', totalValue: '9600.00' }],
    });
    confere(
      exata.corpo.outcome === 'aprovada',
      `96 unidades: ${JSON.stringify(exata.corpo.divergences)}`,
    );

    const acima = await postar('/conferences', {
      clientId: 'gama',
      purchaseOrderNumber: 'GL-778',
      supplierTaxId: '34567890000112',
      lines: [{ material: 'TRP-01', quantity: '97', totalValue: '9700.00' }],
    });
    const saldo = acima.corpo.divergences.find(
      (d) => d.code === 'QUANTIDADE_ACIMA_DO_SALDO',
    );
    confere(
      saldo !== undefined,
      `97 unidades não estourou o saldo: ${JSON.stringify(acima.corpo.divergences)}`,
    );
    confere(
      saldo.expected === '96.000000',
      `saldo informado: ${saldo.expected}`,
    );
  },
);

await exige(
  'Gama',
  'preço por caixa não vira dízima: R$ 100,00 ÷ 3 fecha exato',
  async () => {
    // O caso que o enunciado levanta. A divisão só acontece no cálculo.
    const { corpo } = await postar('/conferences', {
      clientId: 'gama',
      purchaseOrderNumber: 'GL-778',
      supplierTaxId: '34567890000112',
      lines: [{ material: 'TRP-09', quantity: '12', totalValue: '400.00' }],
    });
    confere(
      corpo.outcome === 'aprovada',
      `divergências: ${JSON.stringify(corpo.divergences)}`,
    );
  },
);

await exige(
  'Delta',
  'item sem cabeçalho espera em staging, não vira pedido inventado',
  () => {
    confere(delta.stagedTotal === 1, `staged: ${delta.stagedTotal}`);
    confere(
      delta.staged[0].reference === 'DL-2026-0099',
      `staged: ${JSON.stringify(delta.staged[0])}`,
    );
    confere(
      delta.staged[0].reason === 'cabecalho-ausente',
      'motivo do staging errado',
    );
  },
);

await exige(
  'Delta',
  'cabeçalho sem itens é pedido legítimo, sem saldo pendente',
  async () => {
    const { corpo } = await pegar('/purchase-orders?clientId=delta&limit=10');
    const vazio = corpo.data.find((p) => p.externalNumber === 'DL-2026-0046');
    confere(vazio !== undefined, 'cabeçalho sem itens sumiu da consulta');
    confere(vazio.itemCount === 0, `itens: ${vazio.itemCount}`);
    confere(
      vazio.hasPendingBalance === false,
      'pedido sem itens marcou saldo pendente',
    );
  },
);

await exige(
  'Delta',
  'mandar só cabeçalhos NÃO apaga os itens já conhecidos',
  async () => {
    const { corpo: antes } = await pegar(
      '/purchase-orders?clientId=delta&limit=10',
    );
    const itensAntes = antes.data.find(
      (p) => p.externalNumber === 'DL-2026-0044',
    ).itemCount;
    confere(itensAntes === 2, `esperava 2 itens antes, veio ${itensAntes}`);

    await carregar('delta', { orders: 'tests/fixtures/delta/orders.json' });

    const { corpo: depois } = await pegar(
      '/purchase-orders?clientId=delta&limit=10',
    );
    const itensDepois = depois.data.find(
      (p) => p.externalNumber === 'DL-2026-0044',
    ).itemCount;
    confere(
      itensDepois === 2,
      `carga só de cabeçalhos apagou itens: ${itensDepois}`,
    );
  },
);

await exige('Delta', 'cada item guarda a própria data de criação', async () => {
  const { corpo: lista } = await pegar(
    '/purchase-orders?clientId=delta&limit=10',
  );
  const id = lista.data.find((p) => p.externalNumber === 'DL-2026-0044').id;
  const { corpo } = await pegar(`/purchase-orders/${id}`);
  const linhas = corpo.items.map((i) => i.lineCreatedOn).sort();
  confere(
    linhas.join(',') === '2026-09-02,2026-09-08',
    `datas: ${linhas.join(',')}`,
  );
});

// -------------------------------- o que o enunciado deixa em aberto

await exige(
  'Em aberto',
  'as três situações do Alfa viram o vocabulário do contrato',
  async () => {
    // A amostra só traz `open`; o enunciado diz que também existem `closed` e
    // `blocked`, e as três precisam ter tradução.
    const payload = {
      purchase_orders: ['open', 'closed', 'blocked'].map((situacao, i) => ({
        po_number: `VOCAB-${situacao.toUpperCase()}`,
        created_at: '2026-08-05',
        status: situacao,
        currency: 'BRL',
        vendor: { tax_id: '23456789000101', name: 'Metalúrgica São Jorge' },
        items: [
          {
            line: 10,
            material: `VOC-${String(i)}`,
            description: 'Item de vocabulário',
            uom: 'UN',
            quantity_ordered: 10,
            quantity_received: 0,
            unit_price: 1.5,
          },
        ],
      })),
    };
    const relatorio = await carregarTexto('alfa', {
      orders: JSON.stringify(payload),
    });
    confere(
      relatorio.ordersAccepted === 3,
      `aceitos: ${relatorio.ordersAccepted}`,
    );

    for (const [origem, esperado] of Object.entries({
      OPEN: 'aberto',
      CLOSED: 'encerrado',
      BLOCKED: 'bloqueado',
    })) {
      const pedido = await pedidoDe('alfa', `VOCAB-${origem}`);
      confere(pedido !== null, `VOCAB-${origem} não entrou`);
      confere(
        pedido.status === esperado,
        `${origem} virou ${pedido.status}, esperado ${esperado}`,
      );
    }
  },
);

await exige(
  'Em aberto',
  'situação fora do vocabulário é recusada, não interpretada',
  async () => {
    // O enunciado registra que o termo para "encerrado" do Beta é suposição
    // nossa. A consequência assumida: valor desconhecido é recusado, em vez de
    // virar um palpite que grava a situação errada.
    const payload = {
      purchase_orders: [
        {
          po_number: 'VOCAB-DESCONHECIDO',
          created_at: '2026-08-05',
          status: 'suspended',
          currency: 'BRL',
          vendor: { tax_id: '23456789000101', name: 'Metalúrgica São Jorge' },
          items: [],
        },
      ],
    };
    const relatorio = await carregarTexto('alfa', {
      orders: JSON.stringify(payload),
    });
    confere(relatorio.ordersAccepted === 0, 'aceitou situação desconhecida');
    confere(
      relatorio.rejectedTotal === 1,
      `recusas: ${relatorio.rejectedTotal}`,
    );
    confere(
      (await pedidoDe('alfa', 'VOCAB-DESCONHECIDO')) === null,
      'o pedido com situação desconhecida foi gravado',
    );
  },
);

await exige(
  'Em aberto',
  'CSV do Beta em Windows-1252 com CRLF entra sem perder acento',
  async () => {
    // O enunciado diz que o encoding e o fim de linha não são especificados, e
    // que "uma fixture de variante deveria provar isso". Esta é a fixture.
    const relatorio = await carregar('beta-erp', {
      headers: 'tests/fixtures/beta-erp/cabecalho.csv',
      items: 'tests/fixtures/beta-erp/itens.csv',
    });
    confere(
      relatorio.ordersAccepted === 3,
      `aceitos: ${relatorio.ordersAccepted}`,
    );
    confere(
      relatorio.rejectedTotal === 0,
      `recusas: ${relatorio.rejectedTotal}`,
    );

    const aberto = await pedidoDe('beta-erp', '20260099001');
    confere(aberto !== null, 'o pedido da variante não entrou');
    confere(aberto.supplier.taxId === '12345678000190', 'CNPJ não normalizado');
    confere(aberto.issuedOn === '2026-08-15', `data: ${aberto.issuedOn}`);

    // `ENCERRADO` é o termo que o enunciado diz não aparecer nas amostras.
    const encerrado = await pedidoDe('beta-erp', '20260099002');
    confere(
      encerrado.status === 'encerrado',
      `ENCERRADO virou ${encerrado.status}`,
    );
    confere(encerrado.hasPendingBalance === false, 'encerrado com saldo');

    // Acento vindo de Windows-1252 precisa atravessar o banco intacto.
    const { corpo } = await pegar(`/purchase-orders/${aberto.id}`);
    const oleo = corpo.items.find((i) => i.externalLine === 1);
    confere(
      oleo.description === 'Óleo de soja 900ml',
      `acento corrompido: ${oleo.description}`,
    );
  },
);

// ------------------------------------------------------------- veredito

const largura = Math.max(...resultados.map((r) => r.descricao.length));
console.log();
for (const r of resultados) {
  console.log(
    `  ${r.ok ? '✔' : '✖'} ${r.requisito.padEnd(10)} ${r.descricao.padEnd(largura)}` +
      (r.ok ? '' : `\n      ${r.detalhe}`),
  );
}
const falhas = resultados.filter((r) => !r.ok).length;
console.log(
  `\n  ${String(resultados.length - falhas)}/${String(resultados.length)} exigências atendidas` +
    (falhas > 0 ? `, ${String(falhas)} falharam` : ''),
);
process.exit(falhas > 0 ? 1 : 0);
