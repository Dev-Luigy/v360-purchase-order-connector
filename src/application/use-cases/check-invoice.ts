import type { ConferenceRepository } from '../ports/conference-repository.js';
import type { PurchaseOrderRepository } from '../ports/purchase-order-repository.js';
import { checkInvoice } from '../../domain/conference-rules.js';
import type {
  ConferenceRecord,
  InvoiceCheckRequest,
} from '../../domain/conference.js';

/**
 * Conferência de uma nota contra um pedido: o requisito 2 do enunciado.
 *
 * **Todo campo derivado sai do pedido carregado, nunca da requisição.**
 * `purchaseOrderId`, `purchaseOrderIngestionVersion` e `clientId` do registro
 * vêm do que estava no banco; da nota vem só o que a nota tem autoridade para
 * afirmar — fornecedor e linhas. Sem isso, um chamador poderia gravar um
 * histórico dizendo que conferiu outra coisa.
 *
 * O pedido é encontrado por `(clientId, externalNumber)`, e não pelo nosso
 * identificador interno: a plataforma conhece o número do pedido do cliente,
 * não a nossa identidade (ADR-006).
 */
export class CheckInvoice {
  constructor(
    private readonly orders: PurchaseOrderRepository,
    private readonly conferences: ConferenceRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(invoice: InvoiceCheckRequest): Promise<ConferenceRecord> {
    const order = await this.orders.findByExternalNumber(
      invoice.clientId,
      invoice.purchaseOrderNumber,
    );
    if (order === null) {
      // Pedido inexistente não é divergência da nota: a nota pode estar certa e
      // o pedido simplesmente não ter sido carregado ainda (ADR-009).
      throw new PurchaseOrderNotFoundError(
        invoice.clientId,
        invoice.purchaseOrderNumber,
      );
    }

    const result = checkInvoice(order, invoice);

    // Conferir não consome saldo: nada aqui escreve no pedido (ADR-009).
    return this.conferences.save({
      purchaseOrderId: order.id,
      purchaseOrderIngestionVersion: order.ingestionVersion,
      clientId: order.clientId,
      checkedAt: this.now().toISOString(),
      invoice,
      outcome: result.outcome,
      divergences: result.divergences,
    });
  }
}

export class PurchaseOrderNotFoundError extends Error {
  constructor(
    readonly clientId: string,
    readonly externalNumber: string,
  ) {
    super(`pedido ${externalNumber} do cliente ${clientId} não existe`);
    this.name = 'PurchaseOrderNotFoundError';
  }
}
