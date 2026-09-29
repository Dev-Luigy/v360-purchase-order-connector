import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { checkInvoice } from '../src/domain/conference-rules.js';
import { maxItemsPerOrder } from '../src/domain/limits.js';
import { Decimal, quantityScale } from '../src/domain/decimal.js';
import {
  deltaProfile,
  gamaProfile,
} from '../src/infrastructure/integrations/client-profiles.js';
import { FlatJsonAdapter } from '../src/infrastructure/integrations/flat-json-adapter.js';
import { SplitJsonAdapter } from '../src/infrastructure/integrations/split-json-adapter.js';
import { IngestPurchaseOrders } from '../src/application/use-cases/ingest-purchase-orders.js';
import { InMemoryClientProfiles } from '../src/infrastructure/integrations/client-profiles.js';
import { buildAdapterRegistry } from '../src/infrastructure/integrations/adapter-registry.js';
import { InMemoryPurchaseOrderRepository } from './support/in-memory-repositories.js';

import type { AdapterBatch } from '../src/application/ports/source-adapter.js';
import type {
  NormalizedPurchaseOrder,
  PurchaseOrder,
} from '../src/domain/purchase-order.js';

async function* bytes(text: string): AsyncIterable<Uint8Array> {
  yield new TextEncoder().encode(text);
}

const fixture = (caminho: string): Promise<string> =>
  readFile(new URL(`fixtures/${caminho}`, import.meta.url), 'utf-8');

/** Completa o pedido normalizado com o que a persistência acrescenta. */
function persistido(order: NormalizedPurchaseOrder): PurchaseOrder {
  const items = (order.items ?? []).map((item, indice) => ({
    ...item,
    id: `item-${String(indice)}`,
    // O saldo é pedida menos recebida, na unidade de compra do cliente — que
    // é como a persistência o calcula e como o tipo do domínio o documenta.
    quantityPending: Decimal.parse(item.quantityOrdered)
      .subtract(Decimal.parse(item.quantityReceived))
      .toText(quantityScale),
  }));
  return {
    ...order,
    id: 'teste',
    ingestionVersion: 1,
    ingestedAt: '2026-09-28T00:00:00.000Z',
    items,
    hasPendingBalance: items.some(
      (item) => !Decimal.parse(item.quantityPending).isZero,
    ),
  };
}

async function colher(
  batches: AsyncIterable<AdapterBatch>,
): Promise<AdapterBatch> {
  const orders: NormalizedPurchaseOrder[] = [];
  const rejected = [];
  const staged = [];
  for await (const batch of batches) {
    orders.push(...batch.orders);
    rejected.push(...batch.rejected);
    staged.push(...batch.staged);
  }
  return { orders, rejected, staged };
}

describe('Gama — flat-json', () => {
  it('reconstrói pedidos a partir de linhas achatadas', async () => {
    const texto = await fixture('gama/purchase-order-lines.json');
    const resultado = await colher(
      new FlatJsonAdapter().read(
        {
          clientId: 'gama',
          formatVersion: '1',
          parts: new Map([['lines', () => bytes(texto)]]),
        },
        gamaProfile,
      ),
    );

    assert.equal(resultado.rejected.length, 0);
    assert.equal(resultado.orders.length, 2);
    const [primeiro, segundo] = resultado.orders;

    // Três linhas viraram dois pedidos: as duas de GL-778 se agruparam.
    assert.equal(primeiro?.externalNumber, 'GL-778');
    assert.equal(primeiro?.items?.length, 2);
    assert.equal(segundo?.externalNumber, 'GL-779');
    assert.equal(segundo?.items?.length, 1);
  });

  it('converte as quatro notações do Gama de uma vez', async () => {
    const texto = await fixture('gama/purchase-order-lines.json');
    const { orders } = await colher(
      new FlatJsonAdapter().read(
        {
          clientId: 'gama',
          formatVersion: '1',
          parts: new Map([['lines', () => bytes(texto)]]),
        },
        gamaProfile,
      ),
    );

    const pedido = orders[0];
    assert.ok(pedido);
    // Timestamp Unix em segundos → data de calendário.
    assert.equal(pedido.issuedOn, '2026-08-15');
    // Situação como código numérico → vocabulário do contrato.
    assert.equal(pedido.status, 'aberto');
    // Sem moeda no payload: BRL é hipótese declarada no perfil.
    assert.equal(pedido.currency, 'BRL');

    const item = pedido.items?.[0];
    assert.ok(item);
    // Centavos → decimal exato, sem passar por ponto flutuante.
    assert.equal(item.unitPrice, '1200.000000');
    // A quantidade fica **como o cliente mandou**: 10 caixas, não 120
    // unidades. O detalhe do pedido mostra o mesmo número que aparece no
    // sistema do Gama; a conversão para unidade de consumo é da conferência.
    assert.equal(item.quantityOrdered, '10.000000');
    assert.equal(item.quantityReceived, '2.000000');
    assert.equal(item.conversionFactor, '12.000000');
    // A unidade de compra é preservada: o preço continua por caixa.
    assert.equal(item.purchaseUnit, 'CX');
  });

  it('o preço não é convertido, porque converter daria dízima', async () => {
    const texto = await fixture('gama/purchase-order-lines.json');
    const { orders } = await colher(
      new FlatJsonAdapter().read(
        {
          clientId: 'gama',
          formatVersion: '1',
          parts: new Map([['lines', () => bytes(texto)]]),
        },
        gamaProfile,
      ),
    );

    // TRP-09 é o caso que o enunciado levanta: R$ 100,00 por caixa de fator 3
    // dá R$ 33,3333… por unidade. Guardamos os R$ 100,00 e o fator 3.
    const item = orders[0]?.items?.[1];
    assert.ok(item);
    assert.equal(item.unitPrice, '100.000000');
    assert.equal(item.conversionFactor, '3.000000');
    assert.equal(item.quantityOrdered, '4.000000');

    // A nota fiscal do fornecedor fala em **unidades**: 4 caixas de fator 3
    // são 12 unidades, a R$ 100,00 a caixa, ou seja R$ 400,00. Fecha exato
    // porque a única divisão acontece no cálculo, nunca na gravação.
    const resultado = checkInvoice(
      persistido(orders[0] as NormalizedPurchaseOrder),
      {
        clientId: 'gama',
        purchaseOrderNumber: 'GL-778',
        supplierTaxId: '34567890000112',
        lines: [{ material: 'TRP-09', quantity: '12', totalValue: '400.00' }],
      },
    );
    assert.deepEqual(
      resultado.divergences.map((d) => d.code),
      [],
    );

    // E uma unidade a mais estoura o saldo: 12 unidades é o limite.
    const acima = checkInvoice(
      persistido(orders[0] as NormalizedPurchaseOrder),
      {
        clientId: 'gama',
        purchaseOrderNumber: 'GL-778',
        supplierTaxId: '34567890000112',
        lines: [{ material: 'TRP-09', quantity: '13', totalValue: '433.33' }],
      },
    );
    assert.ok(
      acima.divergences.some((d) => d.code === 'QUANTIDADE_ACIMA_DO_SALDO'),
      'saldo em caixas não foi convertido para unidades',
    );
  });

  it('pedido totalmente recebido não tem saldo pendente', async () => {
    const texto = await fixture('gama/purchase-order-lines.json');
    const { orders } = await colher(
      new FlatJsonAdapter().read(
        {
          clientId: 'gama',
          formatVersion: '1',
          parts: new Map([['lines', () => bytes(texto)]]),
        },
        gamaProfile,
      ),
    );
    const item = orders[1]?.items?.[0];
    assert.ok(item);
    assert.equal(item.quantityOrdered, item.quantityReceived);
    assert.equal(orders[1]?.status, 'encerrado');
  });

  it('situação fora do vocabulário é recusada, não interpretada', async () => {
    const texto = JSON.stringify([
      {
        ped: 'GL-900',
        item: 1,
        cnpj_fornecedor: '34567890000112',
        nome_fornecedor: 'Transportes Ideal ME',
        dt_criacao: 1786752000,
        cod_mat: 'X',
        desc_mat: 'X',
        um: 'UN',
        fator_conv: 1,
        qtd_ped: 1,
        qtd_rec: 0,
        preco_unit_centavos: 100,
        situacao: 9,
      },
    ]);
    const resultado = await colher(
      new FlatJsonAdapter().read(
        {
          clientId: 'gama',
          formatVersion: '1',
          parts: new Map([['lines', () => bytes(texto)]]),
        },
        gamaProfile,
      ),
    );
    assert.equal(resultado.orders.length, 0);
    assert.equal(resultado.rejected.length, 1);
    assert.match(String(resultado.rejected[0]?.reason), /situa|vocabul/i);
  });
});

describe('Delta — split-json', () => {
  const carga = async (partes: readonly ('orders' | 'items')[]) => {
    const mapa = new Map<string, () => AsyncIterable<Uint8Array>>();
    for (const parte of partes) {
      const texto = await fixture(`delta/${parte}.json`);
      mapa.set(parte, () => bytes(texto));
    }
    return colher(
      new SplitJsonAdapter().read(
        { clientId: 'delta', formatVersion: '1', parts: mapa },
        deltaProfile,
      ),
    );
  };

  it('junta itens ao cabeçalho pelo número do pedido', async () => {
    const resultado = await carga(['orders', 'items']);
    assert.equal(resultado.orders.length, 3);
    const p44 = resultado.orders.find(
      (o) => o.externalNumber === 'DL-2026-0044',
    );
    assert.equal(p44?.items?.length, 2);
    assert.equal(p44?.supplier.taxId, '67890123000145');
  });

  it('item sem cabeçalho espera em staging, não vira pedido inventado', async () => {
    const resultado = await carga(['orders', 'items']);
    // DL-2026-0099 aparece só do lado dos itens.
    assert.equal(resultado.staged.length, 1);
    assert.equal(resultado.staged[0]?.reference, 'DL-2026-0099');
    assert.equal(resultado.staged[0]?.reason, 'cabecalho-ausente');
    // E não foi criado como pedido: fornecedor e situação seriam invenção.
    assert.ok(
      !resultado.orders.some((o) => o.externalNumber === 'DL-2026-0099'),
      'item órfão virou pedido',
    );
    // O conteúdo cru é preservado, para reconciliar sem pedir a carga de novo.
    assert.match(String(resultado.staged[0]?.raw), /EMB-500/);
  });

  it('cabeçalho sem itens é pedido legítimo, sem saldo pendente', async () => {
    const resultado = await carga(['orders', 'items']);
    const p46 = resultado.orders.find(
      (o) => o.externalNumber === 'DL-2026-0046',
    );
    assert.ok(p46, 'cabeçalho sem itens sumiu');
    assert.deepEqual(p46.items, []);
  });

  it('cada item traz a própria data, que pode ser posterior à do cabeçalho', async () => {
    const resultado = await carga(['orders', 'items']);
    const p44 = resultado.orders.find(
      (o) => o.externalNumber === 'DL-2026-0044',
    );
    assert.equal(p44?.issuedOn, '2026-09-02');
    assert.equal(p44?.items?.[0]?.lineCreatedOn, '2026-09-02');
    // A linha 20 foi incluída depois do cabeçalho.
    assert.equal(p44?.items?.[1]?.lineCreatedOn, '2026-09-08');
  });

  it('mandar só cabeçalhos NÃO apaga os itens já conhecidos', async () => {
    const resultado = await carga(['orders']);
    assert.equal(resultado.orders.length, 3);
    for (const pedido of resultado.orders) {
      // `null` significa "esta carga não trouxe os itens"; `[]` os apagaria.
      assert.equal(
        pedido.items,
        null,
        `${pedido.externalNumber} apagaria os itens`,
      );
    }
  });

  it('mandar só itens não inventa cabeçalho: tudo espera em staging', async () => {
    const resultado = await carga(['items']);
    assert.equal(resultado.orders.length, 0);
    assert.equal(resultado.staged.length, 4);
  });

  it('carga sem nenhuma das duas partes falha alto', async () => {
    await assert.rejects(
      () =>
        colher(
          new SplitJsonAdapter().read(
            { clientId: 'delta', formatVersion: '1', parts: new Map() },
            deltaProfile,
          ),
        ),
      /sem nenhuma das partes/,
    );
  });
});

describe('Delta — reconciliação do staging', () => {
  const ingest = () => {
    const orders = new InMemoryPurchaseOrderRepository();
    return {
      orders,
      uso: new IngestPurchaseOrders(
        new InMemoryClientProfiles(),
        buildAdapterRegistry(),
        orders,
      ),
    };
  };

  const partes = async (nomes: readonly ('orders' | 'items')[]) => {
    const mapa = new Map<string, () => AsyncIterable<Uint8Array>>();
    for (const nome of nomes) {
      const texto = await fixture(`delta/${nome}.json`);
      mapa.set(nome, () => bytes(texto));
    }
    return { clientId: 'delta', formatVersion: '1', parts: mapa };
  };

  it('o item órfão sobrevive à carga e volta quando o cabeçalho chega', async () => {
    const { uso, orders } = ingest();

    const primeira = await uso.execute(await partes(['items']));
    assert.equal(primeira.ordersAccepted, 0);
    assert.equal(primeira.stagedTotal, 4);

    const segunda = await uso.execute(await partes(['orders']));
    assert.equal(segunda.ordersAccepted, 3);

    const p44 = await orders.findByExternalNumber('delta', 'DL-2026-0044');
    assert.equal(p44?.items.length, 2, 'itens em espera não foram recuperados');
    assert.deepEqual(
      p44?.items.map((i) => i.externalLine).sort((a, b) => a - b),
      [10, 20],
    );
  });

  it('o item cujo cabeçalho nunca chega continua esperando', async () => {
    const { uso, orders } = ingest();
    await uso.execute(await partes(['items']));
    await uso.execute(await partes(['orders']));

    // Provado pelo comportamento, não espiando o estado: quando o cabeçalho
    // de DL-2026-0099 finalmente chega, o item que esperava aparece nele.
    const cabecalhoTardio = JSON.stringify({
      orders: [
        {
          po_number: 'DL-2026-0099',
          created_at: '2026-09-15',
          status: 'open',
          currency: 'BRL',
          vendor: {
            tax_id: '67890123000145',
            name: 'Embalagens Norte Sul Ltda',
          },
        },
      ],
    });
    await uso.execute({
      clientId: 'delta',
      formatVersion: '1',
      parts: new Map([['orders', () => bytes(cabecalhoTardio)]]),
    });

    const p99 = await orders.findByExternalNumber('delta', 'DL-2026-0099');
    assert.equal(p99?.items.length, 1, 'o item não esperou pelo cabeçalho');
    assert.equal(p99?.items[0]?.material, 'EMB-500');
  });

  it('item de pedido que já existe atualiza, em vez de ir para espera', async () => {
    const { uso, orders } = ingest();
    await uso.execute(await partes(['orders', 'items']));

    // Só a consulta de itens. O adaptador não vê cabeçalho nenhum nesta carga
    // e chamaria tudo de órfão; o repositório sabe que os pedidos já existem.
    const segunda = await uso.execute(await partes(['items']));
    assert.equal(segunda.stagedTotal, 1, 'só DL-2026-0099 deveria esperar');

    const p44 = await orders.findByExternalNumber('delta', 'DL-2026-0044');
    assert.equal(p44?.items.length, 2, 'itens do pedido existente se perderam');
    assert.equal(orders.waitingCountFor('delta', 'DL-2026-0044'), 0);
  });

  it('a carga desta vez manda: linha reenviada substitui a que esperava', async () => {
    const { uso, orders } = ingest();
    await uso.execute(await partes(['items']));

    const itensNovos = JSON.stringify({
      items: [
        {
          purchase_order: 'DL-2026-0044',
          created_at: '2026-09-20',
          line: 10,
          material: 'EMB-500',
          description: 'Caixa papelão 40x30',
          uom: 'UN',
          quantity_ordered: 999,
          quantity_received: 0,
          unit_price: 3.75,
        },
      ],
    });
    const cabecalhos = await fixture('delta/orders.json');
    await uso.execute({
      clientId: 'delta',
      formatVersion: '1',
      parts: new Map([
        ['orders', () => bytes(cabecalhos)],
        ['items', () => bytes(itensNovos)],
      ]),
    });

    const p44 = await orders.findByExternalNumber('delta', 'DL-2026-0044');
    const linha10 = p44?.items.find((i) => i.externalLine === 10);
    assert.equal(
      linha10?.quantityOrdered,
      '999.000000',
      'venceu a versão velha',
    );
    assert.ok(
      p44?.items.some((i) => i.externalLine === 20),
      'linha que esperava não entrou',
    );
    assert.equal(orders.waitingCountFor('delta', 'DL-2026-0044'), 0);
  });

  it('falha ao gravar o pedido NÃO perde os itens que esperavam', async () => {
    // R09-01: o staging era consumido numa transação própria, antes da
    // gravação. Uma falha depois disso apagava os itens para sempre.
    const { uso, orders } = ingest();
    await uso.execute(await partes(['items']));
    assert.equal(orders.waitingCountFor('delta', 'DL-2026-0044'), 2);

    const original = orders.replaceSnapshot.bind(orders);
    orders.replaceSnapshot = () =>
      Promise.reject(new Error('falha induzida na gravação'));
    const relatorio = await uso.execute(await partes(['orders']));
    assert.equal(relatorio.ordersAccepted, 0);
    assert.ok(relatorio.rejectedTotal > 0, 'a falha não foi reportada');

    orders.replaceSnapshot = original;
    assert.equal(
      orders.waitingCountFor('delta', 'DL-2026-0044'),
      2,
      'os itens que esperavam foram perdidos pela falha de gravação',
    );
  });
});

describe('REVIEW-09: o que a revisão do Codex expôs', () => {
  const linhaGama = (over: Record<string, unknown> = {}) => ({
    ped: 'GL-778',
    item: 1,
    cnpj_fornecedor: '34567890000112',
    nome_fornecedor: 'Transportes Ideal ME',
    dt_criacao: 1786752000,
    cod_mat: 'TRP-01',
    desc_mat: 'Pallet',
    um: 'CX',
    fator_conv: 12,
    qtd_ped: 10,
    qtd_rec: 2,
    preco_unit_centavos: 120000,
    situacao: 1,
    ...over,
  });

  const lerGama = async (
    linhas: readonly unknown[],
    adaptador = new FlatJsonAdapter(),
  ) =>
    colher(
      adaptador.read(
        {
          clientId: 'gama',
          formatVersion: '1',
          parts: new Map([['lines', () => bytes(JSON.stringify(linhas))]]),
        },
        gamaProfile,
      ),
    );

  it('R09-02: cada linha do Gama tem o cabeçalho validado, não só a primeira', async () => {
    // Com `??=`, situação fora do vocabulário numa linha seguinte atravessava
    // sem ser olhada, e o resultado dependia da ordem das linhas.
    const { rejected } = await lerGama([
      linhaGama(),
      linhaGama({ item: 2, situacao: 9 }),
    ]);
    assert.equal(rejected.length, 1, 'situação 9 passou despercebida');
  });

  it('R09-02: linhas que discordam no cabeçalho recusam o pedido inteiro', async () => {
    // Os dois cabeçalhos são válidos e diferentes. Escolher um seria adivinhar.
    const { orders, rejected } = await lerGama([
      linhaGama(),
      linhaGama({ item: 2, nome_fornecedor: 'Outro Fornecedor Ltda' }),
    ]);
    assert.equal(orders.length, 0, 'gravou um dos dois cabeçalhos');
    assert.equal(rejected.length, 1);
    assert.match(String(rejected[0]?.reason), /discordam/);
  });

  it('R09-03: pedido com linhas fora de ordem não vira dois retratos', async () => {
    // O segundo retrato de GL-778 substituiria o primeiro na gravação e
    // apagaria a linha já lida. O enunciado não garante ordenação.
    const { orders, rejected } = await lerGama([
      linhaGama({ item: 1 }),
      { ...linhaGama({ item: 1 }), ped: 'GL-779' },
      linhaGama({ item: 2 }),
    ]);
    const gl778 = orders.filter((o) => o.externalNumber === 'GL-778');
    assert.equal(gl778.length, 1, 'GL-778 foi emitido mais de uma vez');
    assert.equal(rejected.length, 1);
    assert.match(String(rejected[0]?.reason), /não estão agrupadas/);
  });

  it('R09-04: item órfão fora do contrato é recusado, não guardado', async () => {
    const itens = {
      items: [
        {
          purchase_order: 'DL-9999',
          created_at: '2026-09-15',
          line: 10,
          material: 'M'.repeat(129),
          description: 'acima do contrato',
          uom: 'UN',
          quantity_ordered: 1,
          quantity_received: 0,
          unit_price: 1.0,
        },
      ],
    };
    const resultado = await colher(
      new SplitJsonAdapter().read(
        {
          clientId: 'delta',
          formatVersion: '1',
          parts: new Map([['items', () => bytes(JSON.stringify(itens))]]),
        },
        deltaProfile,
      ),
    );
    assert.equal(
      resultado.staged.length,
      0,
      'material de 129 caracteres esperou',
    );
    assert.equal(resultado.rejected.length, 1);
  });

  it('R09-05: a espera do Delta sai em lotes, não toda no fim', async () => {
    const texto = await fixture('delta/items.json');
    const porLote: number[] = [];
    for await (const lote of new SplitJsonAdapter(2).read(
      {
        clientId: 'delta',
        formatVersion: '1',
        parts: new Map([['items', () => bytes(texto)]]),
      },
      deltaProfile,
    )) {
      if (lote.staged.length > 0) porLote.push(lote.staged.length);
    }
    assert.ok(porLote.length > 1, `saiu em ${String(porLote.length)} lote(s)`);
  });

  it('R09-05: teto de cabeçalhos encerra a carga em vez de gravar pela metade', async () => {
    const cabecalhos = {
      orders: [0, 1, 2].map((n) => ({
        po_number: `DL-${String(n)}`,
        created_at: '2026-09-02',
        status: 'open',
        currency: 'BRL',
        vendor: { tax_id: '67890123000145', name: 'Embalagens Norte Sul Ltda' },
      })),
    };
    await assert.rejects(
      () =>
        colher(
          new SplitJsonAdapter(200, 2).read(
            {
              clientId: 'delta',
              formatVersion: '1',
              parts: new Map([
                ['orders', () => bytes(JSON.stringify(cabecalhos))],
              ]),
            },
            deltaProfile,
          ),
        ),
      /mais de 2 pedidos/,
    );
  });
});

describe('REVIEW-10: o que a segunda revisão expôs', () => {
  const ingest = () => {
    const orders = new InMemoryPurchaseOrderRepository();
    return {
      orders,
      uso: new IngestPurchaseOrders(
        new InMemoryClientProfiles(),
        buildAdapterRegistry(),
        orders,
      ),
    };
  };

  const partes = async (nomes: readonly ('orders' | 'items')[]) => {
    const mapa = new Map<string, () => AsyncIterable<Uint8Array>>();
    for (const nome of nomes) {
      const texto = await fixture(`delta/${nome}.json`);
      mapa.set(nome, () => bytes(texto));
    }
    return { clientId: 'delta', formatVersion: '1', parts: mapa };
  };

  it('R10-01: itens avulsos do mesmo pedido avançam a versão uma vez só', async () => {
    const { uso, orders } = ingest();
    await uso.execute(await partes(['orders', 'items']));
    const antes = await orders.findByExternalNumber('delta', 'DL-2026-0044');

    // Duas linhas do mesmo pedido, numa carga só de itens.
    await uso.execute(await partes(['items']));
    const depois = await orders.findByExternalNumber('delta', 'DL-2026-0044');

    assert.equal(
      (depois?.ingestionVersion ?? 0) - (antes?.ingestionVersion ?? 0),
      1,
      'a versão avançou por linha, não por carga',
    );
    assert.equal(depois?.items.length, 2);
  });

  it('R10-01: falha no meio do grupo não deixa retrato pela metade', async () => {
    const { uso, orders } = ingest();
    await uso.execute(await partes(['orders', 'items']));
    const antes = await orders.findByExternalNumber('delta', 'DL-2026-0044');

    const original = orders.replaceSnapshot.bind(orders);
    orders.replaceSnapshot = () => Promise.reject(new Error('falha induzida'));
    const relatorio = await uso.execute(await partes(['items']));
    orders.replaceSnapshot = original;

    assert.ok(relatorio.rejectedTotal > 0, 'a falha não foi reportada');
    const depois = await orders.findByExternalNumber('delta', 'DL-2026-0044');
    assert.deepEqual(
      depois?.items.map((i) => i.externalLine).sort((a, b) => a - b),
      antes?.items.map((i) => i.externalLine).sort((a, b) => a - b),
      'o retrato mudou apesar da falha',
    );
  });

  it('R10-02: carga só de cabeçalhos relata zero itens novos', async () => {
    const { uso } = ingest();
    await uso.execute(await partes(['orders', 'items']));

    const soCabecalhos = await uso.execute(await partes(['orders']));
    assert.equal(soCabecalhos.ordersAccepted, 3);
    assert.equal(
      soCabecalhos.itemsAccepted,
      0,
      'contou itens preservados como se tivessem vindo na carga',
    );
  });

  it('R10-02: a reconciliação relata só o que foi de fato recuperado', async () => {
    const { uso } = ingest();
    // Quatro itens esperam; três têm cabeçalho na carga seguinte.
    await uso.execute(await partes(['items']));
    const comCabecalhos = await uso.execute(await partes(['orders']));
    assert.equal(comCabecalhos.itemsAccepted, 3);
  });

  it('R10-03: as recusas do Delta respeitam o lote', async () => {
    const invalidos = {
      items: [0, 1, 2, 3, 4].map((n) => ({
        purchase_order: `X-${String(n)}`,
        created_at: 'data-invalida',
        line: n,
        material: 'M',
        description: 'D',
        uom: 'UN',
        quantity_ordered: 1,
        quantity_received: 0,
        unit_price: 1.0,
      })),
    };
    const porLote: number[] = [];
    for await (const lote of new SplitJsonAdapter(2).read(
      {
        clientId: 'delta',
        formatVersion: '1',
        parts: new Map([['items', () => bytes(JSON.stringify(invalidos))]]),
      },
      deltaProfile,
    )) {
      if (lote.rejected.length > 0) porLote.push(lote.rejected.length);
    }
    assert.ok(
      porLote.length > 1,
      `um arquivo só de inválidos saiu em ${String(porLote.length)} lote(s)`,
    );
  });

  const comCabecalhos = async (orders: readonly unknown[]) =>
    colher(
      new SplitJsonAdapter().read(
        {
          clientId: 'delta',
          formatVersion: '1',
          parts: new Map([['orders', () => bytes(JSON.stringify({ orders }))]]),
        },
        deltaProfile,
      ),
    );

  const cabecalho = (over: Record<string, unknown> = {}) => ({
    po_number: 'DUP',
    created_at: '2026-09-02',
    status: 'open',
    currency: 'BRL',
    vendor: { tax_id: '67890123000145', name: 'Embalagens Norte Sul Ltda' },
    ...over,
  });

  it('R10-04: cabeçalhos duplicados que discordam recusam o pedido', async () => {
    const resultado = await comCabecalhos([
      cabecalho(),
      cabecalho({
        status: 'blocked',
        vendor: { tax_id: '78901234000156', name: 'Fornecedor Segundo' },
      }),
    ]);
    assert.equal(resultado.orders.length, 0, 'gravou um dos dois cabeçalhos');
    assert.equal(resultado.rejected.length, 1);
    assert.match(String(resultado.rejected[0]?.reason), /discordam/);
  });

  it('R10-04: duplicata idêntica é deduplicada, sem recusa', async () => {
    const resultado = await comCabecalhos([cabecalho(), cabecalho()]);
    assert.equal(resultado.orders.length, 1, 'duplicata virou dois pedidos');
    assert.equal(
      resultado.rejected.length,
      0,
      'duplicata idêntica foi recusada',
    );
  });
});

describe('REVIEW-11: o que ficou em aberto do FIX-11', () => {
  const cabecalho = (over: Record<string, unknown> = {}) => ({
    po_number: 'DUP',
    created_at: '2026-09-02',
    status: 'open',
    currency: 'BRL',
    vendor: { tax_id: '67890123000145', name: 'Embalagens Norte Sul Ltda' },
    ...over,
  });

  /**
   * Afirma o invariante, não um sintoma: **nenhum** lote passa do teto, em
   * qualquer caminho. O teste anterior só verificava que havia mais de um
   * lote, e por isso não pegou os dois `continue` que pulavam a conferência
   * (REVIEW-11).
   */
  const lotesDe = async (
    payload: unknown,
    parte: 'orders' | 'items',
    batchSize = 2,
  ): Promise<number[]> => {
    const tamanhos: number[] = [];
    for await (const lote of new SplitJsonAdapter(batchSize).read(
      {
        clientId: 'delta',
        formatVersion: '1',
        parts: new Map([[parte, () => bytes(JSON.stringify(payload))]]),
      },
      deltaProfile,
    )) {
      tamanhos.push(
        lote.orders.length + lote.rejected.length + lote.staged.length,
      );
    }
    return tamanhos;
  };

  const nenhumEstourou = (lotes: readonly number[], teto: number) => {
    const estourados = lotes.filter((n) => n > teto);
    assert.equal(
      estourados.length,
      0,
      `lotes acima do teto ${String(teto)}: ${JSON.stringify(lotes)}`,
    );
  };

  it('R10-03: cabeçalhos conflitantes repetidos respeitam o lote', async () => {
    const lotes = await lotesDe(
      {
        orders: [0, 1, 2, 3, 4].map((n) => ({
          ...cabecalho(),
          status: n === 0 ? 'open' : 'blocked',
          vendor: {
            tax_id: '67890123000145',
            name: `Fornecedor ${String(n)}`,
          },
        })),
      },
      'orders',
    );
    nenhumEstourou(lotes, 2);
  });

  it('R10-03: vários pedidos acima do teto de itens respeitam o lote', async () => {
    // Cada pedido estoura `maxItemsPerOrder`; a recusa de cada um vai para o
    // laço final, que também precisa escoar.
    const pedidos = [0, 1, 2];
    const orders = pedidos.map((n) => ({
      ...cabecalho(),
      po_number: `OVER-${String(n)}`,
    }));
    const items = pedidos.flatMap((n) =>
      Array.from({ length: maxItemsPerOrder + 1 }, (_, linha) => ({
        purchase_order: `OVER-${String(n)}`,
        created_at: '2026-09-02',
        line: linha + 1,
        material: 'M',
        description: 'D',
        uom: 'UN',
        quantity_ordered: 1,
        quantity_received: 0,
        unit_price: 1.0,
      })),
    );
    const tamanhos: number[] = [];
    for await (const lote of new SplitJsonAdapter(2).read(
      {
        clientId: 'delta',
        formatVersion: '1',
        parts: new Map([
          ['orders', () => bytes(JSON.stringify({ orders }))],
          ['items', () => bytes(JSON.stringify({ items }))],
        ]),
      },
      deltaProfile,
    )) {
      tamanhos.push(
        lote.orders.length + lote.rejected.length + lote.staged.length,
      );
    }
    nenhumEstourou(tamanhos, 2);
  });

  it('R10-03: itens inválidos respeitam o lote', async () => {
    const lotes = await lotesDe(
      {
        items: [0, 1, 2, 3, 4].map((n) => ({
          purchase_order: `X-${String(n)}`,
          created_at: 'data-invalida',
          line: n,
          material: 'M',
          description: 'D',
          uom: 'UN',
          quantity_ordered: 1,
          quantity_received: 0,
          unit_price: 1.0,
        })),
      },
      'items',
    );
    nenhumEstourou(lotes, 2);
  });

  it('R10-01: pedido cujas linhas atravessam lotes ganha uma versão só', async () => {
    // O caminho completo: adaptador com lote pequeno, caso de uso e
    // repositório. Os testes anteriores usavam duas linhas, abaixo do lote
    // padrão, ou chamavam o repositório com o grupo já montado (REVIEW-11).
    const repositorio = new InMemoryPurchaseOrderRepository();
    const registro = new Map(buildAdapterRegistry());
    registro.set('split-json', new SplitJsonAdapter(2));
    const uso = new IngestPurchaseOrders(
      new InMemoryClientProfiles(),
      registro,
      repositorio,
    );

    const soCabecalho = JSON.stringify({
      orders: [{ ...cabecalho(), po_number: 'DL-LOTE' }],
    });
    await uso.execute({
      clientId: 'delta',
      formatVersion: '1',
      parts: new Map([['orders', () => bytes(soCabecalho)]]),
    });
    const antes = await repositorio.findByExternalNumber('delta', 'DL-LOTE');

    const cincoItens = JSON.stringify({
      items: [10, 20, 30, 40, 50].map((linha) => ({
        purchase_order: 'DL-LOTE',
        created_at: '2026-09-02',
        line: linha,
        material: `M-${String(linha)}`,
        description: 'D',
        uom: 'UN',
        quantity_ordered: 10,
        quantity_received: 0,
        unit_price: 1.5,
      })),
    });
    const relatorio = await uso.execute({
      clientId: 'delta',
      formatVersion: '1',
      parts: new Map([['items', () => bytes(cincoItens)]]),
    });

    const depois = await repositorio.findByExternalNumber('delta', 'DL-LOTE');
    assert.equal(
      (depois?.ingestionVersion ?? 0) - (antes?.ingestionVersion ?? 0),
      1,
      'cinco linhas em três lotes abriram mais de uma transação',
    );
    assert.equal(depois?.items.length, 5);
    assert.equal(relatorio.itemsAccepted, 5);
    assert.equal(relatorio.stagedTotal, 0);
  });
});
