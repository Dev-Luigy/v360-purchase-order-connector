import { Decimal as DecimalJs } from 'decimal.js';

import {
  maxDecimalPlaces,
  maxIntegerDigits,
  maxPersistedDecimalPlaces,
  supportedCurrencies,
} from './limits.js';

import type { CurrencyCode, DecimalText } from './primitives.js';

// A folga permite detectar arredondamento implícito de decimal.js nas
// operações exatas. A guarda é conservadora e pode recusar antes do limite.
const precision = 120;

const Exact = DecimalJs.clone({
  precision,
  rounding: DecimalJs.ROUND_HALF_UP,
  // Evita notação exponencial até em conversões acidentais para string.
  toExpNeg: -9e15,
  toExpPos: 9e15,
});

// decimal.js também aceita formatos que não pertencem ao contrato.
const decimalText = /^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

export class Decimal {
  private constructor(private readonly value: InstanceType<typeof Exact>) {}

  static readonly zero = new Decimal(new Exact(0));

  static parse(text: DecimalText): Decimal {
    if (typeof text !== 'string' || !decimalText.test(text)) {
      throw new RangeError(`decimal inválido: ${JSON.stringify(text)}`);
    }
    const value = new Exact(text);
    // Valida a grandeza antes de `toFixed`, que expandiria expoentes enormes.
    if (!value.isZero()) {
      const integerDigits = value.e + 1;
      if (integerDigits > maxIntegerDigits) {
        throw new RangeError(
          `decimal com ${integerDigits} dígitos inteiros excede o limite de ${maxIntegerDigits}: ${JSON.stringify(text)}`,
        );
      }
      if (value.decimalPlaces() > maxDecimalPlaces) {
        throw new RangeError(
          `decimal com ${value.decimalPlaces()} casas decimais excede o limite de ${maxDecimalPlaces}: ${JSON.stringify(text)}`,
        );
      }
    }
    return new Decimal(value);
  }

  get decimalPlaces(): number {
    return this.value.decimalPlaces();
  }

  /** Texto não exponencial; sem escala, usa a representação mínima. */
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
      // `true` inclui zeros à direita da parte inteira na guarda.
      this.value.precision(true) + other.value.precision(true),
      '×',
    );
  }

  /** Divide com escala explícita e arredondamento fiscal meio para cima. */
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
 * Escala monetária usada na conferência. Moeda desconhecida lança porque não é
 * seguro presumir duas casas decimais.
 */
export function currencyScale(currency: CurrencyCode): number {
  const scale = supportedCurrencies[currency];
  if (scale === undefined) {
    throw new RangeError(
      `moeda ${currency} não tem escala declarada; adicione-a à allowlist antes de usá-la`,
    );
  }
  return scale;
}

export const quantityScale = maxPersistedDecimalPlaces;
