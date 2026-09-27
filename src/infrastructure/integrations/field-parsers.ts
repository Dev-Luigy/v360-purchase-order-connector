import type {
  ClientProfile,
  DateFormat,
  NumberFormat,
  PurchaseOrderStatus,
} from '../../domain/client.js';
import { Decimal } from '../../domain/decimal.js';

const hundred = Decimal.parse('100');
import type { DecimalText, IsoDate, TaxId } from '../../domain/primitives.js';

/**
 * Tradutores de notação, um por rótulo declarado no perfil. Todos recusam o
 * que não entendem: `1.200,000` lido com a política do Alfa viraria outro
 * número sem nada explodir, e é exatamente isso que o perfil errado precisa
 * evitar (ADR-008).
 */

/** Erro de um campo, com o nome no vocabulário do cliente, para a rejeição. */
export class FieldError extends Error {
  constructor(
    readonly field: string,
    reason: string,
    options?: ErrorOptions,
  ) {
    super(`${field}: ${reason}`, options);
    this.name = 'FieldError';
  }
}

export function parseDate(
  raw: string,
  format: DateFormat,
  field: string,
): IsoDate {
  switch (format) {
    case 'iso-date':
      return assertCalendarDate(raw.trim(), field);
    case 'br-date': {
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
      if (match === null) {
        throw new FieldError(field, `data fora de dd/mm/aaaa: ${raw}`);
      }
      return assertCalendarDate(`${match[3]}-${match[2]}-${match[1]}`, field);
    }
    case 'unix-seconds': {
      if (!/^-?\d+$/.test(raw.trim())) {
        throw new FieldError(field, `timestamp não inteiro: ${raw}`);
      }
      // Em UTC, não no fuso local: os timestamps das amostras são múltiplos
      // exatos de 86400, ou seja meia-noite UTC, e lê-los em America/Sao_Paulo
      // deslocaria a data um dia para trás (ADR-006).
      const date = new Date(Number(raw.trim()) * 1000);
      if (Number.isNaN(date.getTime())) {
        throw new FieldError(field, `timestamp inválido: ${raw}`);
      }
      return date.toISOString().slice(0, 10);
    }
  }
}

function assertCalendarDate(value: string, field: string): IsoDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new FieldError(field, `data fora de aaaa-mm-dd: ${value}`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  // `new Date` acomoda 31/02 virando 03/03; comparar de volta rejeita isso.
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new FieldError(field, `data inexistente no calendário: ${value}`);
  }
  return value;
}

/**
 * Traduz a notação do cliente e devolve o decimal na escala do contrato, para
 * que o mesmo valor tenha o mesmo texto venha ele como `1.200,000`, `1200` ou
 * `120000` centavos (ADR-007).
 */
export function parseDecimal(
  raw: string,
  format: NumberFormat,
  field: string,
  scale?: number,
): DecimalText {
  const text = raw.trim();
  if (text === '') throw new FieldError(field, 'decimal vazio');
  try {
    switch (format) {
      case 'plain':
        return Decimal.parse(text).toText(scale);
      case 'br':
        // No padrão brasileiro o ponto é sempre milhar e a vírgula é sempre
        // decimal. Não há ambiguidade a resolver porque o perfil já declarou.
        return Decimal.parse(text.replace(/\./g, '').replace(',', '.')).toText(
          scale,
        );
      case 'cents': {
        if (!/^[+-]?\d+$/.test(text)) {
          throw new RangeError(`centavos não inteiros: ${text}`);
        }
        // Centavos para unidade monetária: divisão exata por cem, com as duas
        // casas que o valor tem por construção.
        return Decimal.parse(text).divide(hundred, 2).toText(scale);
      }
    }
  } catch (cause) {
    throw new FieldError(
      field,
      `decimal inválido para a notação ${format}: ${raw}`,
      { cause },
    );
  }
}

export function parseInteger(raw: string, field: string): number {
  const text = raw.trim();
  if (!/^[+-]?\d+$/.test(text)) {
    throw new FieldError(field, `inteiro inválido: ${raw}`);
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value)) {
    throw new FieldError(field, `inteiro fora da faixa segura: ${raw}`);
  }
  return value;
}

/** CNPJ sem máscara e com 14 dígitos. Não validamos dígito verificador: o dado é do ERP do cliente e recusar por checksum criaria rejeição que ninguém consegue corrigir do nosso lado. */
export function parseTaxId(raw: string, field: string): TaxId {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 14) {
    throw new FieldError(field, `CNPJ não tem 14 dígitos: ${raw}`);
  }
  return digits;
}

/**
 * Situação pelo vocabulário do cliente. Valor fora do mapa é rejeição, não
 * suposição: adivinhar situação é pior que recusar a linha (ADR-006), e é por
 * isso que o termo do Beta para encerrado precisa estar declarado.
 */
export function parseStatus(
  raw: string,
  profile: ClientProfile,
  field: string,
): PurchaseOrderStatus {
  const key = normalizeStatusKey(raw);
  const status = profile.statusVocabulary[key];
  if (status === undefined) {
    throw new FieldError(
      field,
      `situação fora do vocabulário do cliente ${profile.clientId}: ${raw}`,
    );
  }
  return status;
}

/** Maiúsculas, sem acento e sem espaço repetido, que é como o perfil declara. */
export function normalizeStatusKey(raw: string): string {
  return raw
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

export function parseCurrency(
  raw: string | null,
  profile: ClientProfile,
  field: string,
): string {
  const text = raw?.trim() ?? '';
  if (text === '') {
    if (profile.assumedCurrency === null) {
      throw new FieldError(
        field,
        `cliente ${profile.clientId} não declara moeda assumida e o registro não trouxe moeda`,
      );
    }
    return profile.assumedCurrency;
  }
  if (!/^[A-Za-z]{3}$/.test(text)) {
    throw new FieldError(field, `moeda fora de ISO 4217: ${raw}`);
  }
  return text.toUpperCase();
}
