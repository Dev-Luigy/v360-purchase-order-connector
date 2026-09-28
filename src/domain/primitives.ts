/**
 * Decimal exato em texto e com ponto como separador. Nunca usar `number` para
 * esses valores.
 */
export type DecimalText = string;

/** Data de calendário, sem hora e sem fuso. */
export type IsoDate = string;

/** Instante completo em UTC. */
export type IsoInstant = string;

/** CNPJ com 14 dígitos, sem máscara. */
export type TaxId = string;

/** Código ISO 4217 em maiúsculas. */
export type CurrencyCode = string;
