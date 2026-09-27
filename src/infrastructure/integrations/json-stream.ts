/**
 * Leitor de JSON em fluxo que preserva o **texto original** dos números.
 *
 * Duas exigências se encontram aqui. O enunciado fala em dezenas de milhares
 * de pedidos, então não podemos materializar a carga inteira; e `JSON.parse`
 * converte `45.9` em `double` antes de qualquer decisão nossa, o que o
 * `AGENTS.md` proíbe para dinheiro (ADR-007).
 *
 * A solução é recortar o array elemento a elemento — contando chaves e
 * colchetes, respeitando strings e escapes — e só então entregar cada elemento
 * a `JSON.parse`, usando o terceiro argumento do reviver, que desde o Node 24
 * expõe o texto exato do número. Um pedido por vez cabe na memória; a carga
 * inteira, não.
 */

/** Número como o cliente escreveu. Nunca `number`: `45.9` não sobrevive. */
export class JsonNumber {
  constructor(readonly raw: string) {}
}

export type JsonValue =
  | string
  | boolean
  | null
  | JsonNumber
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** O reviver de três argumentos ainda não está nos tipos da biblioteca padrão. */
type SourceReviver = (
  this: unknown,
  key: string,
  value: unknown,
  context?: { source?: string },
) => unknown;

/** Lê um valor JSON completo mantendo os números como texto. */
export function parseJsonValue(text: string): JsonValue {
  const reviver: SourceReviver = (_key, value, context) =>
    typeof value === 'number' && context?.source !== undefined
      ? new JsonNumber(context.source)
      : value;
  return JSON.parse(text, reviver as never) as JsonValue;
}

type ScanState = 'seek-key' | 'expect-array' | 'in-array' | 'done';

/**
 * Rende cada elemento do array que está na chave `key` da raiz do documento.
 *
 * Lança quando a chave não existe ou não é um array: perfil declarado que não
 * corresponde ao payload precisa falhar alto, não render zero pedidos em
 * silêncio (ADR-008).
 */
export async function* streamArrayAtKey(
  chunks: AsyncIterable<Uint8Array>,
  key: string,
): AsyncIterable<JsonValue> {
  const decoder = new TextDecoder('utf-8');
  const scanner = new ArrayScanner(key);

  for await (const chunk of chunks) {
    yield* scanner.push(decoder.decode(chunk, { stream: true }));
  }
  yield* scanner.push(decoder.decode());
  scanner.end();
}

/**
 * Máquina de estados de um caractere por vez. Sem lookahead: é o que permite
 * parar no fim de um chunk e continuar no próximo sem guardar o documento.
 */
class ArrayScanner {
  private state: ScanState = 'seek-key';
  private depth = 0;
  private inString = false;
  private escaped = false;
  /** Última string lida na raiz, candidata a nome de campo. */
  private lastString = '';
  private stringValue = '';
  private elementDepth = 0;
  private element = '';

  constructor(private readonly key: string) {}

  *push(text: string): Generator<JsonValue> {
    for (const character of text) {
      if (this.state === 'done') return;
      const element = this.consume(character);
      if (element !== null) yield parseJsonValue(element);
    }
  }

  end(): void {
    if (this.state !== 'done') {
      throw new SyntaxError(
        `campo ${JSON.stringify(this.key)} não encontrado como array na raiz do JSON`,
      );
    }
  }

  private consume(character: string): string | null {
    switch (this.state) {
      case 'seek-key':
        this.seekKey(character);
        return null;
      case 'expect-array':
        if (/\s/.test(character)) return null;
        if (character !== '[') {
          throw new SyntaxError(
            `campo ${JSON.stringify(this.key)} não é um array`,
          );
        }
        this.state = 'in-array';
        return null;
      case 'in-array':
        return this.readArray(character);
      default:
        return null;
    }
  }

  private seekKey(character: string): void {
    if (this.inString) {
      if (this.escaped) {
        this.escaped = false;
        this.stringValue += character;
        return;
      }
      if (character === '\\') {
        this.escaped = true;
        this.stringValue += character;
        return;
      }
      if (character === '"') {
        this.inString = false;
        // Só interessa o que está na raiz do documento.
        if (this.depth === 1) this.lastString = this.stringValue;
        return;
      }
      this.stringValue += character;
      return;
    }
    if (character === '"') {
      this.inString = true;
      this.stringValue = '';
      return;
    }
    if (character === '{' || character === '[') {
      this.depth += 1;
      return;
    }
    if (character === '}' || character === ']') {
      this.depth -= 1;
      return;
    }
    if (character === ':' && this.depth === 1 && this.lastString === this.key) {
      this.state = 'expect-array';
    }
  }

  private readArray(character: string): string | null {
    if (this.inString) {
      this.element += character;
      if (this.escaped) {
        this.escaped = false;
      } else if (character === '\\') {
        this.escaped = true;
      } else if (character === '"') {
        this.inString = false;
      }
      return null;
    }
    if (character === '"') {
      this.inString = true;
      this.element += character;
      return null;
    }
    if (character === '{' || character === '[') {
      this.elementDepth += 1;
      this.element += character;
      return null;
    }
    if (character === '}' || character === ']') {
      if (this.elementDepth === 0 && character === ']') {
        this.state = 'done';
        return this.takeElement();
      }
      this.elementDepth -= 1;
      this.element += character;
      return null;
    }
    if (character === ',' && this.elementDepth === 0) {
      return this.takeElement();
    }
    this.element += character;
    return null;
  }

  /** Devolve o elemento acumulado, ou `null` quando só havia espaço. */
  private takeElement(): string | null {
    const element = this.element.trim();
    this.element = '';
    return element === '' ? null : element;
  }
}
