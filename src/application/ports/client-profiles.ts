import type { ClientId, ClientProfile } from '../../domain/client.js';

/** Porta assíncrona para permitir trocar a origem dos perfis sem afetar casos de uso. */
export interface ClientProfiles {
  find(clientId: ClientId): Promise<ClientProfile | null>;
  list(): Promise<readonly ClientProfile[]>;
}
