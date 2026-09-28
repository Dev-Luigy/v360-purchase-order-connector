import type {
  ClientProfile,
  DateFormat,
  NumberFormat,
  PurchaseOrderStatus,
} from '../../domain/client.js';
import { Decimal } from '../../domain/decimal.js';
import type { DecimalText, IsoDate, TaxId } from '../../domain/primitives.js';
import { isCalendarDate } from '../../domain/schemas.js';

const hundred = Decimal.parse('100');

/**
 * Número no padrão brasileiro: milhar em grupos de três separados por ponto,
 * decimal por vírgula. `1.200,000`, `6,49` e `1200` passam; `12.34` e
 * `1.23.4,50` não.
 */
const brazilianNumber = /^[+-]?(?:\d{1,3}(?:\.\d{3})*|\d+)(?:,\d+)?$/;

/** CNPJ sem nenhuma pontuação. */
const cleanTaxId = /^\d{14}$/;

/**
 * Máscara brasileira completa. Tudo ou nada: com a pontuação opcional campo a
 * campo, `12.345678/0001-90` passava, o que não é nem uma coisa nem outra
 * (REVIEW-01, achado 4). E sem a alternativa de catorze dígitos limpos, porque
 * um perfil que declara máscara precisa exigi-la (REVIEW-08, R08-02).
 */
const brazilianTaxIdMask = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;

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
  // A regra mora no schema do contrato, para o adaptador e a borda HTTP não
  // divergirem sobre o que é uma data (REVIEW-01, achado 5).
  if (!isCalendarDate(value)) {
    throw new FieldError(field, `data inválida ou inexistente: ${value}`);
  }
  return value;
}

/**
 * Traduz a notação do cliente e devolve o decimal na escala do contrato, para
 * que o mesmo valor tenha o mesmo texto venha ele como `1.200,000`, `1200` ou
 * `120000` centavos (ADR-007).
 *
 * Com `scale`, valor com mais casas do que a escala é **rejeitado**, não
 * arredondado. Antes, `toText(6)` fazia `0.0000001` virar `0.000000` — o valor
 * sumia sem ninguém ser avisado, exatamente o que o `AGENTS.md` proíbe para
 * dinheiro (REVIEW-07, R07-01). Cliente que precise de mais casas é decisão de
 * contrato, não arredondamento por acidente.
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
    const value = readNotation(text, format);
    if (scale !== undefined && value.decimalPlaces > scale) {
      throw new RangeError(
        `${String(value.decimalPlaces)} casas decimais, acima das ${String(scale)} que o contrato guarda`,
      );
    }
    return value.toText(scale);
  } catch (cause) {
    // A razão específica precisa chegar a quem lê o relatório de carga:
    // "casas decimais acima do contrato" diz o que corrigir, "decimal
    // inválido" não.
    const reason = cause instanceof Error ? `: ${cause.message}` : '';
    throw new FieldError(
      field,
      `decimal inválido para a notação ${format}${reason}`,
      { cause },
    );
  }
}

/** Só traduz a notação do cliente; a escala do contrato é conferida fora. */
function readNotation(text: string, format: NumberFormat): Decimal {
  switch (format) {
    case 'plain':
      return Decimal.parse(text);
    case 'br': {
      // O ponto é separador de milhar, e separador de milhar aparece a cada
      // três dígitos. Apagar todo ponto sem conferir onde ele estava faz
      // `12.34` virar 1234: erro de cem vezes em dinheiro, que passa por toda
      // a validação seguinte parecendo certo (REVIEW-01, achado 4).
      if (!brazilianNumber.test(text)) {
        throw new RangeError(`agrupamento de milhar inválido: ${text}`);
      }
      return Decimal.parse(text.replace(/\./g, '').replace(',', '.'));
    }
    case 'cents': {
      if (!/^[+-]?\d+$/.test(text)) {
        throw new RangeError(`centavos não inteiros: ${text}`);
      }
      // Centavos para unidade monetária: divisão exata por cem, com as duas
      // casas que o valor tem por construção.
      return Decimal.parse(text).divide(hundred, 2);
    }
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

/**
 * CNPJ sem máscara e com 14 dígitos.
 *
 * `masked` diz se o cliente entrega com pontuação, e vem do `taxIdMasked` do
 * perfil. O campo é **exclusivo nos dois sentidos**: `true` exige a máscara
 * completa e `false` exige a forma limpa. Aceitar as duas formas de todo mundo
 * fazia o perfil prometer uma regra que ninguém cumpria (REVIEW-07, R07-06), e
 * aceitar a forma limpa num perfil mascarado deixava a mesma promessa pela
 * metade (REVIEW-08, R08-02). Mudança de formato no ERP do cliente vira
 * rejeição, que é o aviso de que o perfil precisa de versão nova.
 *
 * Sem valor padrão de propósito: quem chama declara o formato, e um padrão
 * implícito é exatamente o que produz leniência por descuido.
 *
 * Em nenhum dos dois casos se apaga caractere qualquer: aceitar
 * `abc12.345.678/0001-90xyz` seria leniência em campo de identidade
 * (REVIEW-01, achado 1). Dígito verificador continua sem conferência, porque o
 * dado é do ERP do cliente e recusar por checksum criaria rejeição que ninguém
 * consegue corrigir do nosso lado.
 */
export function parseTaxId(raw: string, field: string, masked: boolean): TaxId {
  const text = raw.trim();
  const aceito = masked ? brazilianTaxIdMask : cleanTaxId;
  if (!aceito.test(text)) {
    // Três causas diferentes merecem três mensagens: valor torto é um
    // problema, e formato certo para o cliente errado é outro, nos dois lados.
    const comPontuacao = /\D/.test(text);
    const soDigitos = cleanTaxId.test(text);
    let reason = `CNPJ fora do formato esperado: ${raw}`;
    if (!masked && comPontuacao) {
      reason = `CNPJ com máscara, mas o perfil do cliente declara formato limpo: ${raw}`;
    } else if (masked && soDigitos) {
      reason = `CNPJ sem máscara, mas o perfil do cliente declara formato mascarado: ${raw}`;
    }
    throw new FieldError(field, reason);
  }
  return text.replace(/\D/g, '');
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
