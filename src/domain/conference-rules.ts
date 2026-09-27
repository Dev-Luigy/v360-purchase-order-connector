import type {
  ConferenceResult,
  Divergence,
  InvoiceCheckRequest,
  InvoiceLine,
} from './conference.js';
import { Decimal, currencyScale } from './decimal.js';
import type { PurchaseOrder, PurchaseOrderItem } from './purchase-order.js';

/**
 * As sete regras de ADR-009, nesta ordem. Não conhecem cliente: recebem o
 * pedido já normalizado e a nota, e devolvem todas as divergências, não a
 * primeira — o enunciado exige que a plataforma mostre o que não bate "sem
 * adivinhar nada".
 *
 * Conferir não é receber: nada aqui consome saldo (ADR-009).
 *
 * Unidades: a nota vem sempre em **unidade de consumo**, porque fornecedor não
 * fatura em caixa; o pedido guarda quantidade e preço em **unidade de compra**.
 * A conversão usa o `conversionFactor` da linha, que varia entre linhas do
 * mesmo pedido (ADR-007).
 */
export function checkInvoice(
  order: PurchaseOrder,
  invoice: InvoiceCheckRequest,
): ConferenceResult {
  const divergences: Divergence[] = [
    ...checkSupplier(order, invoice),
    ...checkStatus(order),
    ...checkLines(order, invoice),
  ];
  return {
    outcome: divergences.length === 0 ? 'aprovada' : 'reprovada',
    divergences,
  };
}

/** Regra 1: fornecedor da nota igual ao do pedido, por CNPJ normalizado. */
function checkSupplier(
  order: PurchaseOrder,
  invoice: InvoiceCheckRequest,
): Divergence[] {
  const expected = digitsOf(order.supplier.taxId);
  const received = digitsOf(invoice.supplierTaxId);
  if (expected === received) return [];
  return [
    {
      code: 'FORNECEDOR_DIVERGENTE',
      field: 'supplier.taxId',
      invoiceLineIndex: null,
      purchaseOrderLine: null,
      expected,
      received,
    },
  ];
}

/** Regra 2: só pedido em aberto recebe. Encerrado ou bloqueado, não. */
function checkStatus(order: PurchaseOrder): Divergence[] {
  if (order.status === 'aberto') return [];
  return [
    {
      code: 'PEDIDO_NAO_ABERTO',
      field: 'status',
      invoiceLineIndex: null,
      purchaseOrderLine: null,
      expected: 'aberto',
      received: order.status,
    },
  ];
}

/** Regras 3 a 7, por linha da nota, com a quantidade agregada por material. */
function checkLines(
  order: PurchaseOrder,
  invoice: InvoiceCheckRequest,
): Divergence[] {
  const byMaterial = groupOrderItemsByMaterial(order.items);
  const divergences: Divergence[] = [];
  /** Soma por material para a regra 6, com a primeira linha que a originou. */
  const claimed = new Map<string, { total: Decimal; firstIndex: number }>();

  invoice.lines.forEach((line, index) => {
    const matches = byMaterial.get(line.material) ?? [];

    // Regra 3: o material existe em alguma linha do pedido.
    if (matches.length === 0) {
      divergences.push({
        code: 'MATERIAL_NAO_ENCONTRADO',
        field: 'items[].material',
        invoiceLineIndex: index,
        purchaseOrderLine: null,
        expected: null,
        received: line.material,
      });
      return;
    }

    // Regra 4: material em mais de uma linha e a nota não diz qual. Não
    // adivinhamos: escolher mudaria o saldo da linha errada.
    if (matches.length > 1) {
      divergences.push({
        code: 'MATERIAL_AMBIGUO',
        field: 'items[].material',
        invoiceLineIndex: index,
        purchaseOrderLine: null,
        expected: `uma linha do pedido, mas o material está em ${matches.length}`,
        received: line.material,
      });
      return;
    }

    const item = matches[0] as PurchaseOrderItem;
    const quantity = Decimal.parse(line.quantity);

    // Regra 5: quantidade positiva. Quantidade não positiva torna o valor
    // esperado sem sentido, então paramos nesta linha e relatamos a causa em
    // vez da consequência. O material continua valendo para as outras linhas.
    if (!quantity.isPositive) {
      divergences.push({
        code: 'QUANTIDADE_NAO_POSITIVA',
        field: 'items[].quantity',
        invoiceLineIndex: index,
        purchaseOrderLine: item.externalLine,
        expected: 'maior que zero',
        received: line.quantity,
      });
      return;
    }

    const previous = claimed.get(line.material);
    claimed.set(line.material, {
      total: previous === undefined ? quantity : previous.total.add(quantity),
      firstIndex: previous?.firstIndex ?? index,
    });

    // Regra 7: valor total = quantidade ÷ fator × preço por unidade de compra.
    divergences.push(...checkTotalValue(order, item, line, index));
  });

  // Regra 6: saldo, com as linhas repetidas do mesmo material já somadas —
  // senão duas linhas de 60 passariam contra um saldo de 100 (ADR-009).
  for (const [material, aggregate] of claimed) {
    const item = (byMaterial.get(material) ?? [])[0] as PurchaseOrderItem;
    const balance = consumptionBalanceOf(item);
    if (aggregate.total.compare(balance) <= 0) continue;
    divergences.push({
      code: 'QUANTIDADE_ACIMA_DO_SALDO',
      field: 'items[].quantityPending',
      // Ancorada na primeira linha do material: a regra é sobre a soma, e
      // `received` carrega o total somado para o usuário entender o porquê.
      invoiceLineIndex: aggregate.firstIndex,
      purchaseOrderLine: item.externalLine,
      expected: balance.toText(),
      received: aggregate.total.toText(),
    });
  }

  return divergences;
}

function checkTotalValue(
  order: PurchaseOrder,
  item: PurchaseOrderItem,
  line: InvoiceLine,
  index: number,
): Divergence[] {
  const scale = currencyScale(order.currency);
  const factor = Decimal.parse(item.conversionFactor);
  if (factor.isZero) {
    throw new RangeError(
      `fator de conversão zero na linha ${item.externalLine} do pedido ${order.externalNumber}`,
    );
  }
  // Multiplica primeiro e divide uma vez só: arredondar no meio propagaria a
  // dízima do fator de caixa (ADR-007).
  const expected = Decimal.parse(line.quantity)
    .multiply(Decimal.parse(item.unitPrice))
    .divide(factor, scale);
  const received = Decimal.parse(line.totalValue);
  if (expected.equals(received)) return [];
  return [
    {
      code: 'VALOR_TOTAL_DIVERGENTE',
      field: 'items[].unitPrice',
      invoiceLineIndex: index,
      purchaseOrderLine: item.externalLine,
      expected: expected.toText(),
      received: received.toText(scale),
    },
  ];
}

/** Saldo da linha em unidade de consumo, que é a unidade em que a nota fala. */
function consumptionBalanceOf(item: PurchaseOrderItem): Decimal {
  return Decimal.parse(item.quantityPending).multiply(
    Decimal.parse(item.conversionFactor),
  );
}

function groupOrderItemsByMaterial(
  items: readonly PurchaseOrderItem[],
): Map<string, PurchaseOrderItem[]> {
  const grouped = new Map<string, PurchaseOrderItem[]>();
  for (const item of items) {
    const existing = grouped.get(item.material);
    if (existing === undefined) {
      grouped.set(item.material, [item]);
    } else {
      existing.push(item);
    }
  }
  return grouped;
}

/** CNPJ pode chegar mascarado de uma ponta e limpo da outra; comparamos dígitos. */
function digitsOf(taxId: string): string {
  return taxId.replace(/\D/g, '');
}
