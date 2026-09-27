import type { CurrencyCode, DecimalText } from './primitives.js';

/**
 * Decimal exato, com inteiro escalado. `units` é o valor sem vírgula e `scale`
 * diz onde ela fica: `units = 1290n, scale = 2` é `12.90`.
 *
 * `bigint` e não `number` porque o `AGENTS.md` proíbe ponto flutuante em
 * cálculo monetário e o domínio não pode depender de biblioteca de
 * infraestrutura (ADR-007): `Prisma.Decimal` fica confinado ao repositório.
 * O que precisamos aqui é somar, subtrair, comparar e fazer uma multiplicação
 * com uma divisão arredondada no fim — não vale trazer uma dependência.
 */
export class Decimal {
  private constructor(
    readonly units: bigint,
    readonly scale: number,
  ) {}

  static readonly zero = new Decimal(0n, 0);

  /**
   * Lê o texto decimal do contrato. Aceita sinal, parte fracionária e notação
   * exponencial — `JSON.parse` devolve `1e-7` para números pequenos, e recusar
   * isso seria rejeitar um número legítimo do cliente. Não aceita espaço,
   * separador de milhar nem vírgula: a tradução da notação do cliente é do
   * adaptador, e aceitar as duas coisas aqui esconderia perfil errado.
   */
  static parse(text: DecimalText): Decimal {
    const match = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
    if (match === null) {
      throw new RangeError(`decimal inválido: ${JSON.stringify(text)}`);
    }
    const [, sign = '', whole = '', fraction = '', exponent] = match;
    const digits = `${whole}${fraction}`;
    const scale = fraction.length - Number(exponent ?? '0');
    const units = BigInt(digits) * (sign === '-' ? -1n : 1n);
    return scale < 0
      ? new Decimal(units * 10n ** BigInt(-scale), 0)
      : new Decimal(units, scale);
  }

  static fromUnits(units: bigint, scale: number): Decimal {
    if (scale < 0 || !Number.isInteger(scale)) {
      throw new RangeError(`escala inválida: ${scale}`);
    }
    return new Decimal(units, scale);
  }

  /** Texto do contrato. Sem escala, devolve a própria; com escala, arredonda. */
  toText(scale?: number): DecimalText {
    const value = scale === undefined ? this : this.rescale(scale);
    const negative = value.units < 0n;
    const digits = (negative ? -value.units : value.units)
      .toString()
      .padStart(value.scale + 1, '0');
    const cut = digits.length - value.scale;
    const whole = digits.slice(0, cut);
    const fraction = digits.slice(cut);
    const sign =
      negative && (BigInt(whole) !== 0n || BigInt(fraction || '0') !== 0n)
        ? '-'
        : '';
    return value.scale === 0
      ? `${sign}${whole}`
      : `${sign}${whole}.${fraction}`;
  }

  /**
   * Muda a escala. Aumentar é exato; diminuir arredonda **meio para cima**,
   * isto é, meio afastando-se do zero — a prática de nota fiscal brasileira.
   * Arredondamento bancário divergiria do cálculo do fornecedor (ADR-007).
   */
  rescale(scale: number): Decimal {
    if (scale < 0 || !Number.isInteger(scale)) {
      throw new RangeError(`escala inválida: ${scale}`);
    }
    if (scale === this.scale) return this;
    if (scale > this.scale) {
      return new Decimal(this.units * 10n ** BigInt(scale - this.scale), scale);
    }
    const divisor = 10n ** BigInt(this.scale - scale);
    const negative = this.units < 0n;
    const magnitude = negative ? -this.units : this.units;
    const quotient = magnitude / divisor;
    const rounded =
      (magnitude % divisor) * 2n >= divisor ? quotient + 1n : quotient;
    return new Decimal(negative ? -rounded : rounded, scale);
  }

  add(other: Decimal): Decimal {
    const scale = Math.max(this.scale, other.scale);
    return new Decimal(
      this.rescale(scale).units + other.rescale(scale).units,
      scale,
    );
  }

  subtract(other: Decimal): Decimal {
    const scale = Math.max(this.scale, other.scale);
    return new Decimal(
      this.rescale(scale).units - other.rescale(scale).units,
      scale,
    );
  }

  /** Exata: a escala do resultado é a soma das escalas. */
  multiply(other: Decimal): Decimal {
    return new Decimal(this.units * other.units, this.scale + other.scale);
  }

  /**
   * Divisão com arredondamento meio para cima na escala pedida. É a única
   * operação que perde informação, e por isso o cálculo da conferência
   * multiplica primeiro e divide uma vez só, no fim (ADR-007).
   */
  divide(other: Decimal, scale: number): Decimal {
    if (other.units === 0n) {
      throw new RangeError('divisão por zero');
    }
    const numerator = this.units * 10n ** BigInt(other.scale + scale);
    const denominator = other.units * 10n ** BigInt(this.scale);
    const negative = numerator < 0n !== denominator < 0n;
    const absNumerator = numerator < 0n ? -numerator : numerator;
    const absDenominator = denominator < 0n ? -denominator : denominator;
    const quotient = absNumerator / absDenominator;
    const rounded =
      (absNumerator % absDenominator) * 2n >= absDenominator
        ? quotient + 1n
        : quotient;
    return new Decimal(negative ? -rounded : rounded, scale);
  }

  compare(other: Decimal): -1 | 0 | 1 {
    const scale = Math.max(this.scale, other.scale);
    const left = this.rescale(scale).units;
    const right = other.rescale(scale).units;
    if (left < right) return -1;
    return left > right ? 1 : 0;
  }

  equals(other: Decimal): boolean {
    return this.compare(other) === 0;
  }

  get isZero(): boolean {
    return this.units === 0n;
  }

  get isPositive(): boolean {
    return this.units > 0n;
  }

  get isNegative(): boolean {
    return this.units < 0n;
  }
}

/**
 * Casas decimais da moeda, usadas para arredondar o valor esperado de uma
 * linha de nota. Duas para as moedas que este serviço vê hoje; o mapa existe
 * para que uma moeda sem centavo não seja tratada como se tivesse.
 */
const currencyScales: Readonly<Record<string, number>> = {
  BRL: 2,
  USD: 2,
  EUR: 2,
};

export const defaultCurrencyScale = 2;

export function currencyScale(currency: CurrencyCode): number {
  return currencyScales[currency] ?? defaultCurrencyScale;
}
