import type {
  ConferenceResult,
  Divergence,
  InvoiceCheckRequest,
  InvoiceLine,
} from './conference.js';
import { Decimal, currencyScale, quantityScale } from './decimal.js';
import type { PurchaseOrder, PurchaseOrderItem } from './purchase-order.js';

/** Executa todas as regras de ADR-009 sem consumir o saldo do pedido. */
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

// A normalização do CNPJ pertence às bordas; o domínio compara valores válidos.
function checkSupplier(
  order: PurchaseOrder,
  invoice: InvoiceCheckRequest,
): Divergence[] {
  const expected = order.supplier.taxId;
  const received = invoice.supplierTaxId;
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

function checkLines(
  order: PurchaseOrder,
  invoice: InvoiceCheckRequest,
): Divergence[] {
  const byMaterial = groupOrderItemsByMaterial(order.items);
  const divergences: Divergence[] = [];
  const claimed = new Map<string, { total: Decimal; firstIndex: number }>();

  invoice.lines.forEach((line, index) => {
    const matches = byMaterial.get(line.material) ?? [];

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

    // Não escolhe entre linhas ambíguas, pois isso mudaria o saldo errado.
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

    // Sem quantidade positiva não há valor total significativo para conferir.
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

    divergences.push(...checkTotalValue(order, item, line, index));
  });

  // O saldo considera a soma de todas as linhas da nota para o material.
  for (const [material, aggregate] of claimed) {
    const item = (byMaterial.get(material) ?? [])[0] as PurchaseOrderItem;
    const balance = consumptionBalanceOf(item);
    if (aggregate.total.compare(balance) <= 0) continue;
    divergences.push({
      code: 'QUANTIDADE_ACIMA_DO_SALDO',
      field: 'items[].quantityPending',
      invoiceLineIndex: aggregate.firstIndex,
      purchaseOrderLine: item.externalLine,
      // Quantidade sai na escala do contrato, como `docs/API.md` especifica e
      // como o detalhe do pedido devolve: o mesmo valor com o mesmo texto nos
      // dois lugares. `received` vem da nota e sai como a nota escreveu.
      expected: balance.toText(quantityScale),
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
  // Uma única divisão evita propagar arredondamento intermediário.
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
      expected: expected.toText(scale),
      received: received.toText(scale),
    },
  ];
}

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
