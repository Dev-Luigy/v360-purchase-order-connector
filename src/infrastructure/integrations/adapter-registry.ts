import type { SourceAdapter } from '../../application/ports/source-adapter.js';
import type { DeliveryFormat } from '../../domain/client.js';

import { NestedJsonAdapter } from './nested-json-adapter.js';
import { PairedCsvAdapter } from './paired-csv-adapter.js';

/**
 * Um adaptador por forma de entrega, não por cliente (ADR-008).
 *
 * Cliente novo em forma conhecida entra com um perfil e nada aqui muda; forma
 * nova é o único caso que pede código, e aparece como chave faltando em vez de
 * comportamento errado.
 */
export function buildAdapterRegistry(): ReadonlyMap<
  DeliveryFormat,
  SourceAdapter
> {
  return new Map<DeliveryFormat, SourceAdapter>([
    ['nested-json', new NestedJsonAdapter()],
    ['paired-csv', new PairedCsvAdapter()],
    // `flat-json` (Gama) e `split-json` (Delta) entram na Parte 2.
  ]);
}
