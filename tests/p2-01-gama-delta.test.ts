import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { checkInvoice } from '../src/domain/conference-rules.js';
import { Decimal, quantityScale } from '../src/domain/decimal.js';
import {
  deltaProfile,
  gamaProfile,
} from '../src/infrastructure/integrations/client-profiles.js';
import { FlatJsonAdapter } from '../src/infrastructure/integrations/flat-json-adapter.js';
import { SplitJsonAdapter } from '../src/infrastructure/integrations/split-json-adapter.js';

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
