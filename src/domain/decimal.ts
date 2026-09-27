import { Decimal as DecimalJs } from 'decimal.js';

import type { CurrencyCode, DecimalText } from './primitives.js';

/**
 * Decimal exato do domínio, sobre decimal.js.
 *
 * A biblioteca é a mesma que o Prisma usa internamente, então a ponte com o
 * repositório de P1-02 é `toString()` dos dois lados (ADR-011). Mas ela é
 * permissiva de um jeito que dinheiro não tolera, e esta classe existe para
 * fechar as quatro frestas, todas verificadas contra a versão 10.6:
 *
 * 1. `new Decimal('0x10')` devolve 16, `'1_000'` devolve 1000, `'NaN'` e
 *    `'Infinity'` passam. Um campo corrompido do cliente viraria número
 *    plausível em vez de rejeição, então validamos o texto antes de construir.
 * 2. `toString()` usa notação exponencial (`1e-8`, `1e+21`), que não é o
 *    `DecimalText` do contrato. Só emitimos por `toFixed`.
 * 3. Zeros à direita não sobrevivem: `'1200.000'` volta `'1200'`. Quem precisa
 *    de escala estável pede a escala em `toText`.
 * 4. **`plus`, `minus` e `times` arredondam para `precision` em silêncio.** É a
 *    fresta perigosa: o produto de dois números de 30 dígitos volta com a cauda
 *    zerada sem avisar. Aqui essas três operações conferem se o resultado exato
 *    cabe e **lançam** em vez de arredondar. A única operação que arredonda é
 *    `divide`, e só na escala que quem chama pediu.
 */

/**
 * Cento e vinte dígitos significativos. Dado de ERP não chega perto disso — o
 * maior caso real aqui tem nove —, e a folga é o que permite tratar
 * arredondamento em soma ou produto como defeito, e não como rotina.
 *
 * A guarda abaixo é conservadora: estima o pior caso em vez de medir o
 * resultado, então recusa um pouco antes do limite real. Com sessenta dígitos
 * ela recusava `1e59 + 1`, que caberia (REVIEW-01, achado 7); com o dobro, a
 * margem sobra e nenhuma operação plausível encosta nela.
 */
const precision = 120;

const Exact = DecimalJs.clone({
  precision,
  rounding: DecimalJs.ROUND_HALF_UP,
  // Mesmo não usando `toString`, um template literal usaria: garantimos que
  // nem por acidente sai notação exponencial.
  toExpNeg: -9e15,
  toExpPos: 9e15,
});

/** O contrato aceita sinal, fração e expoente. Não aceita hexadecimal, sublinhado, NaN nem infinito. */
const decimalText = /^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

export class Decimal {
  private constructor(private readonly value: InstanceType<typeof Exact>) {}

  static readonly zero = new Decimal(new Exact(0));

  static parse(text: DecimalText): Decimal {
    if (typeof text !== 'string' || !decimalText.test(text)) {
      throw new RangeError(`decimal inválido: ${JSON.stringify(text)}`);
    }
    return new Decimal(new Exact(text));
  }

  /** Casas decimais do texto de origem, para preservar a escala declarada. */
  get decimalPlaces(): number {
    return this.value.decimalPlaces();
  }

  /** Texto do contrato, nunca exponencial. Sem escala, a mínima que representa o valor. */
  toText(scale?: number): DecimalText {
    if (scale === undefined) return this.value.toFixed();
    if (scale < 0 || !Number.isInteger(scale)) {
      throw new RangeError(`escala inválida: ${scale}`);
    }
    return this.value.toFixed(scale, DecimalJs.ROUND_HALF_UP);
  }

  add(other: Decimal): Decimal {
    return this.exact(this.value.plus(other.value), this.sumDigits(other), '+');
  }

  subtract(other: Decimal): Decimal {
    return this.exact(
      this.value.minus(other.value),
      this.sumDigits(other),
      '-',
    );
  }

  multiply(other: Decimal): Decimal {
    return this.exact(
      this.value.times(other.value),
      // `precision(true)`: sem o argumento, decimal.js não conta os zeros à
      // direita da parte inteira, e a guarda passaria batido justamente nos
      // números redondos e grandes.
      this.value.precision(true) + other.value.precision(true),
      '×',
    );
  }

  /**
   * A única operação que perde informação, e por isso a escala é obrigatória:
   * quem divide declara onde quer parar. Meio para cima, afastando-se do zero,
   * que é a prática de nota fiscal brasileira (ADR-007).
   */
  divide(other: Decimal, scale: number): Decimal {
    if (other.value.isZero()) throw new RangeError('divisão por zero');
    if (scale < 0 || !Number.isInteger(scale)) {
      throw new RangeError(`escala inválida: ${scale}`);
    }
    return new Decimal(
      this.value
        .div(other.value)
        .toDecimalPlaces(scale, DecimalJs.ROUND_HALF_UP),
    );
  }

  compare(other: Decimal): -1 | 0 | 1 {
    return this.value.comparedTo(other.value) as -1 | 0 | 1;
  }

  equals(other: Decimal): boolean {
    return this.value.equals(other.value);
  }

  get isZero(): boolean {
    return this.value.isZero();
  }

  get isPositive(): boolean {
    return this.value.greaterThan(0);
  }

  get isNegative(): boolean {
    return this.value.lessThan(0);
  }

  /**
   * Dígitos que o resultado exato de uma soma ocupa: da ordem de grandeza do
   * maior operando até a casa decimal mais funda, mais um para o "vai um".
   */
  private sumDigits(other: Decimal): number {
    const magnitude = Math.max(this.value.e, other.value.e) + 1;
    const depth = Math.max(
      this.value.decimalPlaces(),
      other.value.decimalPlaces(),
    );
    return magnitude + depth + 1;
  }

  private exact(
    result: InstanceType<typeof Exact>,
    exactDigits: number,
    operation: string,
  ): Decimal {
    if (exactDigits > precision) {
      throw new RangeError(
        `${operation} exigiria ${exactDigits} dígitos significativos e o limite é ${precision}: ` +
          'o resultado seria arredondado em silêncio',
      );
    }
    return new Decimal(result);
  }
}

/**
 * Casas decimais da moeda, para arredondar o valor esperado de uma linha de
 * nota. O mapa existe para que uma moeda sem centavo não seja tratada como se
 * tivesse.
 */
const currencyScales: Readonly<Record<string, number>> = {
  BRL: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  // Sem centavo. Tratá-las como se tivessem duas casas arredondaria o valor
  // esperado para uma fração que não existe na moeda (REVIEW-01, achado 7).
  CLP: 0,
  ISK: 0,
  JPY: 0,
  KRW: 0,
  PYG: 0,
  VND: 0,
  // Três casas.
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
};

export const defaultCurrencyScale = 2;

export function currencyScale(currency: CurrencyCode): number {
  return currencyScales[currency] ?? defaultCurrencyScale;
}

/** Escala do contrato para quantidade, fator e preço unitário (ADR-007). */
export const quantityScale = 6;
