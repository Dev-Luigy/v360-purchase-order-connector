import type {
  ConferenceFilters,
  ConferenceRepository,
  ConferenceSummary,
} from '../ports/conference-repository.js';
import { defaultPageLimit, type Page } from '../ports/pagination.js';
import type {
  ConferenceOutcome,
  ConferenceRecord,
  DivergenceCode,
} from '../../domain/conference.js';

/**
 * Relatório de conferências: o requisito 3 do enunciado — quantas notas
 * passaram, quantas travaram e por quais motivos.
 *
 * São duas leituras com os mesmos filtros: o histórico, paginado, e os totais.
 * Separadas porque contar é barato e listar é caro, e quem quer o número não
 * deveria pagar pela lista.
 */
export interface ConferenceQuery {
  readonly clientId?: string | undefined;
  readonly outcome?: ConferenceOutcome | undefined;
  readonly divergenceCode?: DivergenceCode | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly limit?: number | undefined;
  readonly cursor?: string | undefined;
}

function filtersOf(query: ConferenceQuery): ConferenceFilters {
  return {
    clientId: query.clientId ?? null,
    outcome: query.outcome ?? null,
    divergenceCode: query.divergenceCode ?? null,
    from: query.from ?? null,
    to: query.to ?? null,
  };
}

export class ListConferences {
  constructor(private readonly conferences: ConferenceRepository) {}

  execute(query: ConferenceQuery): Promise<Page<ConferenceRecord>> {
    return this.conferences.list(filtersOf(query), {
      limit: query.limit ?? defaultPageLimit,
      cursor: query.cursor ?? null,
    });
  }
}

export class SummarizeConferences {
  constructor(private readonly conferences: ConferenceRepository) {}

  execute(query: ConferenceQuery): Promise<ConferenceSummary> {
    return this.conferences.summarize(filtersOf(query));
  }
}
