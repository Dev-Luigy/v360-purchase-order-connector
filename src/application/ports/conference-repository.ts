import type { ClientId } from '../../domain/client.js';
import type {
  ConferenceOutcome,
  ConferenceRecord,
  DivergenceCode,
} from '../../domain/conference.js';
import type { IsoInstant } from '../../domain/primitives.js';
import type { Page, PageRequest } from './pagination.js';

export interface ConferenceFilters {
  readonly clientId: ClientId | null;
  readonly outcome: ConferenceOutcome | null;
  readonly divergenceCode: DivergenceCode | null;
  readonly from: IsoInstant | null;
  readonly to: IsoInstant | null;
}

export interface ConferenceSummary {
  readonly checked: number;
  readonly approved: number;
  readonly rejected: number;
  /**
   * Ocorrências por código. A soma não fecha com `rejected`: uma nota
   * reprovada pode ter várias divergências, e contar nota é diferente de
   * contar ocorrência (ADR-009).
   */
  readonly divergencesByCode: Readonly<Partial<Record<DivergenceCode, number>>>;
}

export interface ConferenceRepository {
  save(record: Omit<ConferenceRecord, 'id'>): Promise<ConferenceRecord>;
  list(
    filters: ConferenceFilters,
    page: PageRequest,
  ): Promise<Page<ConferenceRecord>>;
  summarize(filters: ConferenceFilters): Promise<ConferenceSummary>;
}
