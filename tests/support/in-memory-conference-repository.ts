import type {
  ConferenceFilters,
  ConferenceRepository,
  ConferenceSummary,
} from '../../src/application/ports/conference-repository.js';
import type {
  Page,
  PageRequest,
} from '../../src/application/ports/pagination.js';
import type {
  ConferenceRecord,
  DivergenceCode,
} from '../../src/domain/conference.js';

/**
 * Histórico de conferências em memória.
 *
 * Reproduz a distinção que o relatório do requisito 3 exige: conta **nota** em
 * `checked`/`approved`/`rejected` e conta **ocorrência** em
 * `divergencesByCode`, que por isso não somam igual (ADR-009).
 */
export class InMemoryConferenceRepository implements ConferenceRepository {
  private readonly records: ConferenceRecord[] = [];
  private sequence = 0;

  save(record: Omit<ConferenceRecord, 'id'>): Promise<ConferenceRecord> {
    this.sequence += 1;
    const saved: ConferenceRecord = {
      ...record,
      id: `conference-${String(this.sequence).padStart(6, '0')}`,
    };
    this.records.push(saved);
    return Promise.resolve(saved);
  }

  list(
    filters: ConferenceFilters,
    page: PageRequest,
  ): Promise<Page<ConferenceRecord>> {
    const todos = this.matching(filters);
    const visible = todos.slice(0, page.limit);
    return Promise.resolve({
      data: visible,
      page: {
        limit: page.limit,
        cursor: page.cursor,
        nextCursor: null,
        hasMore: todos.length > page.limit,
      },
    });
  }

  summarize(filters: ConferenceFilters): Promise<ConferenceSummary> {
    const notas = this.matching(filters);
    const divergencesByCode: Partial<Record<DivergenceCode, number>> = {};
    for (const nota of notas) {
      for (const divergence of nota.divergences) {
        divergencesByCode[divergence.code] =
          (divergencesByCode[divergence.code] ?? 0) + 1;
      }
    }
    return Promise.resolve({
      checked: notas.length,
      approved: notas.filter((nota) => nota.outcome === 'aprovada').length,
      rejected: notas.filter((nota) => nota.outcome === 'reprovada').length,
      divergencesByCode,
    });
  }

  private matching(filters: ConferenceFilters): ConferenceRecord[] {
    return this.records.filter(
      (record) =>
        (filters.clientId === null || record.clientId === filters.clientId) &&
        (filters.outcome === null || record.outcome === filters.outcome) &&
        (filters.divergenceCode === null ||
          record.divergences.some(
            (divergence) => divergence.code === filters.divergenceCode,
          )) &&
        (filters.from === null || record.checkedAt >= filters.from) &&
        (filters.to === null || record.checkedAt <= filters.to),
    );
  }
}
