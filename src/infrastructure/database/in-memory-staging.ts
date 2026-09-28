import type { StagingRepository } from '../../application/ports/staging-repository.js';
import type { ClientId } from '../../domain/client.js';
import type { StagedItem } from '../../domain/ingestion.js';

/**
 * Espera em memória, para quem roda sem banco.
 *
 * A chave repete a do banco — cliente, pedido e linha — para que a
 * substituição de uma linha reenviada se comporte igual nos dois lugares.
 */
export class InMemoryStagingRepository implements StagingRepository {
  private readonly rows = new Map<string, StagedItem>();

  stage(clientId: ClientId, items: readonly StagedItem[]): Promise<void> {
    for (const staged of items) {
      this.rows.set(
        chave(clientId, staged.externalNumber, staged.item.externalLine),
        staged,
      );
    }
    return Promise.resolve();
  }

  takeFor(
    clientId: ClientId,
    externalNumber: string,
  ): Promise<readonly StagedItem[]> {
    const prefixo = `${chaveDoPedido(clientId, externalNumber)}:`;
    const encontrados: StagedItem[] = [];
    for (const [key, value] of this.rows) {
      if (key.startsWith(prefixo)) {
        encontrados.push(value);
        this.rows.delete(key);
      }
    }
    encontrados.sort((a, b) => a.item.externalLine - b.item.externalLine);
    return Promise.resolve(encontrados);
  }
}

/**
 * O comprimento de cada parte entra na chave para que `a` + `bc` e `ab` + `c`
 * não colidam — o mesmo cuidado de `lockKeyFor` no repositório de pedidos.
 */
function chaveDoPedido(clientId: ClientId, externalNumber: string): string {
  return `${String(clientId.length)}:${clientId}:${String(externalNumber.length)}:${externalNumber}`;
}

function chave(
  clientId: ClientId,
  externalNumber: string,
  externalLine: number,
): string {
  return `${chaveDoPedido(clientId, externalNumber)}:${String(externalLine)}`;
}
