import assert from 'node:assert/strict';
import test from 'node:test';

import { checkInvoice } from '../src/domain/conference-rules.js';
import type { DivergenceCode, InvoiceLine } from '../src/domain/conference.js';
import type { PurchaseOrderStatus } from '../src/domain/client.js';
import type {
  PurchaseOrder,
  PurchaseOrderItem,
} from '../src/domain/purchase-order.js';

const supplierTaxId = '23456789000101';

/** Linha do pedido do Alfa: 100 pedidas, 60 recebidas, 40 de saldo a 45,90. */
function orderItem(
  overrides: Partial<PurchaseOrderItem> = {},
): PurchaseOrderItem {
  return {
    id: 'item-1',
    externalLine: 10,
    material: 'MAT-1001',
    description: 'Chapa de aço 2mm',
    purchaseUnit: 'UN',
    conversionFactor: '1',
    quantityOrdered: '100.000',
    quantityReceived: '60.000',
    quantityPending: '40.000',
    unitPrice: '45.90',
    lineCreatedOn: null,
    ...overrides,
  };
}

function order(
  items: readonly PurchaseOrderItem[] = [orderItem()],
  status: PurchaseOrderStatus = 'aberto',
): PurchaseOrder {
  return {
    id: 'order-1',
    clientId: 'alfa',
    externalNumber: '4500001234',
    supplier: { taxId: supplierTaxId, name: 'Metalúrgica São Jorge S.A.' },
    currency: 'BRL',
    status,
    issuedOn: '2026-08-05',
    ingestionVersion: 1,
    ingestedAt: '2026-09-27T12:00:00.000Z',
    hasPendingBalance: true,
    items,
  };
}

function invoice(lines: readonly InvoiceLine[], taxId = supplierTaxId) {
  return {
    clientId: 'alfa',
    purchaseOrderNumber: '4500001234',
    supplierTaxId: taxId,
    lines,
  };
}

function codes(
  divergences: readonly { code: DivergenceCode }[],
): DivergenceCode[] {
  return divergences.map((divergence) => divergence.code);
}

test('nota dentro do saldo e com valor exato é aprovada', () => {
  const result = checkInvoice(
    order(),
    invoice([{ material: 'MAT-1001', quantity: '40', totalValue: '1836.00' }]),
  );
  assert.equal(result.outcome, 'aprovada');
  assert.deepEqual(result.divergences, []);
});

test('o domínio compara identidade estritamente: máscara é da fronteira', () => {
  // Normalizar aqui tornava a validação da borda contornável — `checkInvoice`
  // chamado direto aprovava CNPJ com lixo em volta. Tirar máscara é trabalho
  // do adaptador (arquivo) e do schema (HTTP), testados em outro lugar.
  const result = checkInvoice(
    order(),
    invoice(
      [{ material: 'MAT-1001', quantity: '40', totalValue: '1836.00' }],
      '23.456.789/0001-01',
    ),
  );
  assert.deepEqual(codes(result.divergences), ['FORNECEDOR_DIVERGENTE']);
  assert.equal(result.divergences[0]?.received, '23.456.789/0001-01');
});

test('fornecedor diferente reprova a nota inteira', () => {
  const result = checkInvoice(
    order(),
    invoice(
      [{ material: 'MAT-1001', quantity: '40', totalValue: '1836.00' }],
      '99999999000199',
    ),
  );
  assert.deepEqual(codes(result.divergences), ['FORNECEDOR_DIVERGENTE']);
  assert.equal(result.divergences[0]?.invoiceLineIndex, null);
});

test('pedido encerrado ou bloqueado não recebe', () => {
  for (const status of ['encerrado', 'bloqueado'] as const) {
    const result = checkInvoice(
      order([orderItem()], status),
      invoice([
        { material: 'MAT-1001', quantity: '40', totalValue: '1836.00' },
      ]),
    );
    assert.deepEqual(codes(result.divergences), ['PEDIDO_NAO_ABERTO'], status);
    assert.equal(result.divergences[0]?.received, status);
  }
});

test('material fora do pedido é divergência da linha, não do pedido', () => {
  const result = checkInvoice(
    order(),
    invoice([{ material: 'MAT-9999', quantity: '1', totalValue: '10.00' }]),
  );
  assert.deepEqual(codes(result.divergences), ['MATERIAL_NAO_ENCONTRADO']);
  assert.equal(result.divergences[0]?.invoiceLineIndex, 0);
  assert.equal(result.divergences[0]?.received, 'MAT-9999');
});

test('material repetido no pedido é ambíguo: não escolhemos a linha', () => {
  const result = checkInvoice(
    order([
      orderItem(),
      orderItem({ id: 'item-2', externalLine: 20, quantityPending: '10.000' }),
    ]),
    invoice([{ material: 'MAT-1001', quantity: '5', totalValue: '229.50' }]),
  );
  assert.deepEqual(codes(result.divergences), ['MATERIAL_AMBIGUO']);
});

test('quantidade zero ou negativa para na regra 5, sem inventar valor esperado', () => {
  for (const quantity of ['0', '0.000', '-5']) {
    const result = checkInvoice(
      order(),
      invoice([{ material: 'MAT-1001', quantity, totalValue: '0.00' }]),
    );
    assert.deepEqual(
      codes(result.divergences),
      ['QUANTIDADE_NAO_POSITIVA'],
      quantity,
    );
  }
});

test('duas linhas do mesmo material somam antes de comparar com o saldo', () => {
  const result = checkInvoice(
    order(),
    invoice([
      { material: 'MAT-1001', quantity: '30', totalValue: '1377.00' },
      { material: 'MAT-1001', quantity: '30', totalValue: '1377.00' },
    ]),
  );
  assert.deepEqual(codes(result.divergences), ['QUANTIDADE_ACIMA_DO_SALDO']);
  const divergence = result.divergences[0];
  assert.equal(divergence?.received, '60');
  assert.equal(divergence?.expected, '40.000000');
  assert.equal(
    divergence?.invoiceLineIndex,
    0,
    'ancorada na primeira linha do material',
  );
});

test('uma linha inválida não isenta as outras linhas do mesmo material', () => {
  const result = checkInvoice(
    order(),
    invoice([
      { material: 'MAT-1001', quantity: '0', totalValue: '0.00' },
      { material: 'MAT-1001', quantity: '500', totalValue: '22950.00' },
    ]),
  );
  assert.deepEqual(codes(result.divergences), [
    'QUANTIDADE_NAO_POSITIVA',
    'QUANTIDADE_ACIMA_DO_SALDO',
  ]);
  assert.equal(result.divergences[1]?.invoiceLineIndex, 1);
});

test('um centavo de diferença é divergência: a tolerância é zero', () => {
  const result = checkInvoice(
    order(),
    invoice([{ material: 'MAT-1001', quantity: '40', totalValue: '1836.01' }]),
  );
  assert.deepEqual(codes(result.divergences), ['VALOR_TOTAL_DIVERGENTE']);
  assert.equal(result.divergences[0]?.expected, '1836.00');
  assert.equal(result.divergences[0]?.received, '1836.01');
});

test('caixa: a nota fala em unidades e o pedido em caixas', () => {
  // 10 caixas de 12 unidades a R$ 1.200,00 a caixa: 120 unidades de saldo,
  // e 12 unidades valem exatamente uma caixa.
  const caixa = orderItem({
    material: 'TRP-01',
    purchaseUnit: 'CX',
    conversionFactor: '12',
    quantityOrdered: '10.000',
    quantityReceived: '0.000',
    quantityPending: '10.000',
    unitPrice: '1200.00',
  });
  const aprovada = checkInvoice(
    order([caixa]),
    invoice([{ material: 'TRP-01', quantity: '12', totalValue: '1200.00' }]),
  );
  assert.equal(aprovada.outcome, 'aprovada');

  const acima = checkInvoice(
    order([caixa]),
    invoice([{ material: 'TRP-01', quantity: '121', totalValue: '12100.00' }]),
  );
  assert.deepEqual(codes(acima.divergences), ['QUANTIDADE_ACIMA_DO_SALDO']);
  assert.equal(
    acima.divergences[0]?.expected,
    '120.000000',
    'saldo convertido para unidades',
  );
});

test('preço periódico: arredonda uma vez, no fim, e não a cada unidade', () => {
  // TRP-09 do Gama: R$ 100,00 a caixa de 3. A unidade sai 33,333...; três
  // unidades voltam a valer exatamente 100,00, o que arredondar antes perderia.
  const periodico = orderItem({
    material: 'TRP-09',
    purchaseUnit: 'CX',
    conversionFactor: '3',
    quantityPending: '5.000',
    unitPrice: '100.00',
  });
  const result = checkInvoice(
    order([periodico]),
    invoice([{ material: 'TRP-09', quantity: '3', totalValue: '100.00' }]),
  );
  assert.equal(result.outcome, 'aprovada');

  const umaUnidade = checkInvoice(
    order([periodico]),
    invoice([{ material: 'TRP-09', quantity: '1', totalValue: '33.33' }]),
  );
  assert.equal(
    umaUnidade.outcome,
    'aprovada',
    '33,333... arredonda para 33,33',
  );
});

test('devolve todas as divergências, não a primeira', () => {
  const result = checkInvoice(
    order([orderItem()], 'bloqueado'),
    invoice(
      [
        { material: 'MAT-9999', quantity: '1', totalValue: '10.00' },
        { material: 'MAT-1001', quantity: '40', totalValue: '1.00' },
      ],
      '99999999000199',
    ),
  );
  assert.deepEqual(codes(result.divergences), [
    'FORNECEDOR_DIVERGENTE',
    'PEDIDO_NAO_ABERTO',
    'MATERIAL_NAO_ENCONTRADO',
    'VALOR_TOTAL_DIVERGENTE',
  ]);
});

test('conferir não consome saldo: conferir duas vezes dá o mesmo resultado', () => {
  const pedido = order();
  const nota = invoice([
    { material: 'MAT-1001', quantity: '40', totalValue: '1836.00' },
  ]);
  assert.equal(checkInvoice(pedido, nota).outcome, 'aprovada');
  assert.equal(checkInvoice(pedido, nota).outcome, 'aprovada');
  assert.equal(pedido.items[0]?.quantityPending, '40.000');
});
