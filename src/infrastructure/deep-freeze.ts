/**
 * Congela um objeto e tudo dentro dele.
 *
 * `readonly` do TypeScript só existe na compilação: quem recebe o objeto em
 * tempo de execução pode alterá-lo e, quando o objeto é compartilhado — um
 * perfil de cliente, um preset de pool —, a alteração vale para todo mundo e
 * contorna a validação feita no start.
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
