/**
 * Tipos primitivos do contrato normalizado. São apelidos de `string` de
 * propósito: o formato é documentado aqui e validado na borda de ingestão, não
 * carregado como marca de tipo, para que P1-02 e P1-03 possam construir valores
 * sem depender de um construtor que ainda não existe.
 */

/**
 * Número decimal exato, em texto, com ponto como separador: `"1200.000"`,
 * `"45.90"`, `"33.333333"`. Nunca `number`: `JSON.parse` já transforma
 * `45.9` em ponto flutuante binário, e dinheiro não sobrevive a isso
 * (ADR-007). A aritmética decimal entra em P1-03; no PostgreSQL o tipo é
 * `NUMERIC`.
 */
export type DecimalText = string;

/** Data de calendário, sem hora e sem fuso: `"2026-08-15"`. */
export type IsoDate = string;

/** Instante completo em UTC: `"2026-09-27T12:00:00.000Z"`. */
export type IsoInstant = string;

/** CNPJ com 14 dígitos, sem máscara e sem pontuação: `"12345678000190"`. */
export type TaxId = string;

/** Código ISO 4217 em maiúsculas: `"BRL"`. */
export type CurrencyCode = string;
