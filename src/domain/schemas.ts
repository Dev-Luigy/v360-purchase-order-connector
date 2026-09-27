import { z } from 'zod';

import { divergenceCodes, type InvoiceCheckRequest } from './conference.js';
import { maxDecimalPlaces, maxIntegerDigits } from './decimal.js';
import type { NormalizedPurchaseOrder } from './purchase-order.js';

/**
 * O contrato normalizado expresso em schema, não só em tipo.
 *
 * O tipo some na compilação; o schema sobrevive e vale na borda de ingestão,
 * onde o dado vem do ERP de outra empresa. Validar a **saída** do adaptador
 * garante que defeito de mapeamento vira rejeição com caminho do campo, em vez
 * de linha torta persistida (ADR-011).
 */

/**
 * Decimal como texto **do contrato** — mais estrito que a entrada que
 * `Decimal.parse` aceita, e de propósito. A entrada do cliente pode vir em
 * notação exponencial; o contrato normalizado, não, porque tudo sai por
 * `toFixed`. E o tamanho tem teto: sem ele, um expoente grande gera uma string
 * de milhares de dígitos que atravessa o serviço inteiro (REVIEW-01, achado 5).
 */
export const decimalTextSchema = z.string().regex(
  // Construído a partir das constantes do domínio: o limite do schema e o
  // limite que `Decimal.parse` aplica precisam ser o mesmo número.
  new RegExp(
    `^-?\\d{1,${maxIntegerDigits}}(?:\\.\\d{1,${maxDecimalPlaces}})?$`,
  ),
  `decimal fora do contrato: até ${maxIntegerDigits} dígitos inteiros, ${maxDecimalPlaces} decimais, sem expoente`,
);

/** Decimal do contrato que não pode ser negativo: quantidade, preço, saldo. */
export const nonNegativeDecimalSchema = decimalTextSchema.refine(
  (value) => !value.startsWith('-'),
  'não pode ser negativo',
);

/**
 * Decimal do contrato estritamente positivo. O fator de conversão é o caso:
 * zero fazia a conferência dividir por zero e lançar, o que viraria erro 500
 * na borda em vez de rejeição na carga (REVIEW-01, achado 2).
 */
export const positiveDecimalSchema = decimalTextSchema.refine(
  (value) => !value.startsWith('-') && /[1-9]/.test(value),
  'precisa ser maior que zero',
);

/**
 * Instante que existe. `toISOString` lança quando a data é inválida, então o
 * `NaN` precisa ser filtrado antes — senão o refine estoura em vez de recusar.
 */
export function isCalendarInstant(value: string): boolean {
  const instant = new Date(value);
  return !Number.isNaN(instant.getTime()) && instant.toISOString() === value;
}

/**
 * Data que existe no calendário, e não só uma que tem a forma de data.
 * `new Date` acomoda 31/02 virando 03/03; comparar de volta rejeita isso.
 * Fonte única: o adaptador e a borda HTTP usam esta mesma regra.
 */
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'data fora de aaaa-mm-dd')
  .refine(isCalendarDate, 'data inexistente no calendário');

export const isoInstantSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    'instante fora de ISO UTC',
  )
  // Aparência não basta: `2026-99-99T99:99:99.999Z` tem a forma certa e não
  // existe. O irmão `isoDateSchema` já era semântico; este ficou para trás
  // (REVIEW-03, 5).
  .refine(isCalendarInstant, 'instante inexistente no calendário');

/** CNPJ com 14 dígitos, sem máscara. Dígito verificador não é conferido: o dado é do ERP do cliente e recusar por checksum criaria rejeição que ninguém corrige do nosso lado. */
export const taxIdSchema = z
  .string()
  .regex(/^\d{14}$/, 'CNPJ fora de 14 dígitos');

export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'moeda fora de ISO 4217');

export const purchaseOrderStatusSchema = z.enum([
  'aberto',
  'encerrado',
  'bloqueado',
]);

export const supplierSchema = z.object({
  taxId: taxIdSchema,
  name: z.string().min(1, 'razão social vazia'),
});

export const normalizedItemSchema = z.object({
  externalLine: z.int().nonnegative(),
  material: z.string().min(1, 'material vazio'),
  description: z.string(),
  purchaseUnit: z.string().min(1, 'unidade vazia'),
  // Invariantes, não aparências: quantidade negativa e fator zero passavam e
  // só explodiam na conferência (REVIEW-01, achado 2).
  conversionFactor: positiveDecimalSchema,
  quantityOrdered: nonNegativeDecimalSchema,
  quantityReceived: nonNegativeDecimalSchema,
  unitPrice: nonNegativeDecimalSchema,
  lineCreatedOn: isoDateSchema.nullable(),
});

export const normalizedOrderSchema = z.object({
  clientId: z.string().min(1, 'cliente vazio'),
  externalNumber: z.string().min(1, 'número do pedido vazio'),
  supplier: supplierSchema,
  currency: currencySchema,
  status: purchaseOrderStatusSchema,
  issuedOn: isoDateSchema,
  /**
   * `null` é carga que não trouxe os itens e preserva os conhecidos; `[]` é o
   * cliente afirmando que não há itens, e remove (ADR-008). São coisas
   * diferentes e o schema mantém as duas possíveis de propósito.
   */
  items: z.array(normalizedItemSchema).nullable(),
});

/** Nota fiscal como a plataforma envia. Usado na borda HTTP, em P1-04. */
export const invoiceCheckRequestSchema = z.object({
  clientId: z.string().min(1),
  purchaseOrderNumber: z.string().min(1),
  // O CNPJ chega limpo nesta borda. Máscara é assunto do arquivo do cliente,
  // resolvido pelo adaptador; a API não precisa adivinhar pontuação, e aceitar
  // qualquer string com 14 dígitos dentro era leniência em campo de identidade
  // (REVIEW-01, achado 1).
  supplierTaxId: taxIdSchema,
  // A nota é laxa de propósito onde o pedido é estrito: ela é uma afirmação
  // sobre o mundo que nós julgamos, não um registro que guardamos. Quantidade
  // zero ou negativa é `QUANTIDADE_NAO_POSITIVA` na resposta, com o motivo
  // estruturado (ADR-009, regra 5) — barrar aqui devolveria 400 e tornaria o
  // código de divergência inalcançável.
  lines: z
    .array(
      z.object({
        material: z.string().min(1),
        quantity: decimalTextSchema,
        totalValue: decimalTextSchema,
      }),
    )
    .min(1, 'nota sem linhas'),
});

export const divergenceCodeSchema = z.enum(divergenceCodes);

/** Mensagem curta e com caminho, para virar `RejectedRecord.reason`. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path === '' ? issue.message : `${path}: ${issue.message}`;
    })
    .join('; ');
}

/**
 * Trava de deriva: se o schema e o tipo do contrato se separarem, isto para de
 * compilar. Sem ela, `normalizedOrderSchema` viraria documentação desatualizada
 * em vez de validação.
 */
const _schemaMatchesContract: NormalizedPurchaseOrder =
  null as unknown as z.infer<typeof normalizedOrderSchema>;
const _invoiceMatchesContract: InvoiceCheckRequest = null as unknown as z.infer<
  typeof invoiceCheckRequestSchema
>;
void _schemaMatchesContract;
void _invoiceMatchesContract;
