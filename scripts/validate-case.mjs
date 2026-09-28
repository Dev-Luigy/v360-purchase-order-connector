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

// ---------------------------------------------------------------- ingestão

const alfa = await carregar('alfa', {
  orders: 'tests/fixtures/alfa/purchase-orders.json',
});
const beta = await carregar('beta', {
  headers: 'tests/fixtures/beta/cabecalho.csv',
  items: 'tests/fixtures/beta/itens.csv',
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
    const { corpo } = await pegar('/purchase-orders?limit=100');
    const clientes = new Set(corpo.data.map((p) => p.clientId));
    confere(
      clientes.has('alfa') && clientes.has('beta'),
      `clientes: ${[...clientes].join(',')}`,
    );
    // "Formato único" só vale se os campos forem os mesmos para os dois.
    const chaves = corpo.data.map((p) => Object.keys(p).sort().join(','));
    confere(
      new Set(chaves).size === 1,
      'clientes diferentes devolveram campos diferentes',
    );
    // O Beta veio com vírgula decimal, ponto de milhar, CNPJ com máscara e
    // data dd/mm/aaaa; se a normalização falhasse, apareceria aqui.
    const b = corpo.data.find((p) => p.externalNumber === '20260088412');
    confere(
      b.supplier.taxId === '12345678000190',
      `CNPJ não normalizado: ${b.supplier.taxId}`,
    );
    confere(b.issuedOn === '2026-08-15', `data não normalizada: ${b.issuedOn}`);
    confere(b.status === 'aberto', `situação não normalizada: ${b.status}`);
  },
);

await exige('Req 1', 'filtro por cliente de origem', async () => {
  const { corpo } = await pegar('/purchase-orders?clientId=beta&limit=100');
  confere(corpo.data.length === 2, `esperava 2, veio ${corpo.data.length}`);
  confere(
    corpo.data.every((p) => p.clientId === 'beta'),
    'vazou pedido de outro cliente',
  );
});

await exige('Req 1', 'filtro por fornecedor', async () => {
  const { corpo } = await pegar(
    '/purchase-orders?supplierTaxId=98765432000155&limit=100',
  );
  confere(corpo.data.length === 1, `esperava 1, veio ${corpo.data.length}`);
  confere(corpo.data[0].externalNumber === '20260088413', 'fornecedor errado');
});

await exige('Req 1', 'filtro por situação do pedido', async () => {
  const { corpo } = await pegar('/purchase-orders?status=bloqueado&limit=100');
  confere(
    corpo.data.length === 1,
    `esperava 1 bloqueado, veio ${corpo.data.length}`,
  );
  confere(corpo.data[0].status === 'bloqueado', 'situação errada');
});

await exige('Req 1', 'apenas os que ainda têm algo a receber', async () => {
  const { corpo } = await pegar('/purchase-orders?pending=true&limit=100');
  confere(
    corpo.data.length === 3,
    `esperava 3 com saldo, veio ${corpo.data.length}`,
  );
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
    const { corpo: lista } = await pegar(
      '/purchase-orders?clientId=alfa&limit=10',
    );
    const { status, corpo } = await pegar(
      `/purchase-orders/${lista.data[0].id}`,
    );
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
    const { corpo } = await pegar('/conferences/summary');
    confere(corpo.checked === 2, `conferidas: ${corpo.checked}`);
    confere(corpo.approved === 1, `aprovadas: ${corpo.approved}`);
    confere(corpo.rejected === 1, `reprovadas: ${corpo.rejected}`);
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
    const { corpo: antes } = await pegar(
      '/purchase-orders?clientId=alfa&limit=10',
    );
    const versaoAntes = antes.data[0].ingestionVersion;
    await carregar('alfa', {
      orders: 'tests/fixtures/alfa/purchase-orders.json',
    });
    const { corpo: depois } = await pegar(
      '/purchase-orders?clientId=alfa&limit=10',
    );
    confere(
      depois.data.length === 1,
      `reenvio duplicou: ${depois.data.length} pedidos`,
    );
    confere(
      depois.data[0].id === antes.data[0].id,
      'reenvio trocou a identidade interna',
    );
    confere(
      depois.data[0].ingestionVersion === versaoAntes + 1,
      'versão não avançou',
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
