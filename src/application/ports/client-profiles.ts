import type { ClientId, ClientProfile } from '../../domain/client.js';

/**
 * Fonte dos perfis de cliente. Assíncrona de propósito: a implementação de P1-03
 * é configuração tipada em código, validada no start, e trocar por tabela no
 * banco — quando onboarding precisar acontecer sem release — não muda quem
 * consome esta porta (ADR-008).
 */
export interface ClientProfiles {
  find(clientId: ClientId): Promise<ClientProfile | null>;
  list(): Promise<readonly ClientProfile[]>;
}
