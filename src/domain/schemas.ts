import { z } from 'zod';

import { divergenceCodes, type InvoiceCheckRequest } from './conference.js';
import {
  maxClientIdLength,
  maxDecimalPlaces,
  maxDescriptionLength,
  maxDivergenceTextLength,
  maxExternalLine,
  maxExternalNumberLength,
  maxFieldLength,
  maxIntegerDigits,
  maxInvoiceLines,
  maxPersistedDecimalPlaces,
  maxReportedRecords,
  maxItemsPerOrder,
  maxMaterialLength,
  maxPurchaseUnitLength,
  maxSupplierNameLength,
  supportedCurrencies,
} from './limits.js';
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

/**
 * Decimal **persistido**: no máximo a escala que a coluna guarda. O contrato
 * aceitava doze casas para uma coluna de seis, e o adaptador arredondava em
 * silêncio (REVIEW-07, R07-01).
 */
export const persistedDecimalSchema = z
  .string()
  .regex(
    new RegExp(
      `^-?\\d{1,${maxIntegerDigits}}(?:\\.\\d{1,${maxPersistedDecimalPlaces}})?$`,
    ),
    `decimal persistido: até ${maxIntegerDigits} dígitos inteiros e ${maxPersistedDecimalPlaces} decimais`,
  );

/** Decimal do contrato que não pode ser negativo: quantidade, preço, saldo. */
export const nonNegativeDecimalSchema = persistedDecimalSchema.refine(
  (value) => !value.startsWith('-'),
  'não pode ser negativo',
);

/**
 * Decimal do contrato estritamente positivo. O fator de conversão é o caso:
 * zero fazia a conferência dividir por zero e lançar, o que viraria erro 500
 * na borda em vez de rejeição na carga (REVIEW-01, achado 2).
 */
export const positiveDecimalSchema = persistedDecimalSchema.refine(
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

/**
 * Texto que vai para uma coluna do PostgreSQL.
 *
 * `z.string()` aceita `\u0000`, e o PostgreSQL não representa NUL em `text`,
 * `varchar` nem `jsonb`. O dado atravessava toda a aplicação e abortava só na
 * gravação (REVIEW-07, R07-03). Só o NUL é recusado: outros caracteres de
 * controle e qualquer Unicode válido continuam passando, e nada é removido ou
 * truncado em silêncio.
 */
export const persistedText = (max: number) =>
  z
    .string()
    .max(max)
    .refine(
      (value) => !value.includes('\u0000'),
      'texto com caractere NUL, que o PostgreSQL não armazena',
    );

/**
 * Moeda que o serviço suporta, com escala conhecida. Não é "três letras
 * maiúsculas": a escala decide o arredondamento da conferência, e moeda sem
 * escala conhecida não pode ser conferida (ADR-007, REVIEW-07 R07-08).
 */
export const currencySchema = z
  .string()
  .refine(
    (value) => Object.hasOwn(supportedCurrencies, value),
    'moeda não suportada: a escala decimal precisa estar declarada',
  );

export const purchaseOrderStatusSchema = z.enum([
  'aberto',
  'encerrado',
  'bloqueado',
]);

export const supplierSchema = z.object({
  taxId: taxIdSchema,
  name: persistedText(maxSupplierNameLength).min(1, 'razão social vazia'),
});

export const normalizedItemSchema = z.object({
  externalLine: z.int().nonnegative().max(maxExternalLine),
  material: persistedText(maxMaterialLength).min(1, 'material vazio'),
  description: persistedText(maxDescriptionLength),
  purchaseUnit: persistedText(maxPurchaseUnitLength).min(1, 'unidade vazia'),
  // Invariantes, não aparências: quantidade negativa e fator zero passavam e
  // só explodiam na conferência (REVIEW-01, achado 2).
  conversionFactor: positiveDecimalSchema,
  quantityOrdered: nonNegativeDecimalSchema,
  quantityReceived: nonNegativeDecimalSchema,
  unitPrice: nonNegativeDecimalSchema,
  lineCreatedOn: isoDateSchema.nullable(),
});

export const normalizedOrderSchema = z.object({
  clientId: persistedText(maxClientIdLength).min(1, 'cliente vazio'),
  externalNumber: persistedText(maxExternalNumberLength).min(
    1,
    'número do pedido vazio',
  ),
  supplier: supplierSchema,
  currency: currencySchema,
  status: purchaseOrderStatusSchema,
  issuedOn: isoDateSchema,
  /**
   * `null` é carga que não trouxe os itens e preserva os conhecidos; `[]` é o
   * cliente afirmando que não há itens, e remove (ADR-008). São coisas
   * diferentes e o schema mantém as duas possíveis de propósito.
   */
  items: z.array(normalizedItemSchema).max(maxItemsPerOrder).nullable(),
});

/** Nota fiscal como a plataforma envia. Usado na borda HTTP, em P1-04. */
export const invoiceCheckRequestSchema = z.object({
  // A nota vai inteira para uma coluna `jsonb`, que também recusa NUL.
  clientId: persistedText(maxClientIdLength).min(1),
  purchaseOrderNumber: persistedText(maxExternalNumberLength).min(1),
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
        material: persistedText(maxMaterialLength).min(1),
        quantity: decimalTextSchema,
        totalValue: decimalTextSchema,
      }),
    )
    .min(1, 'nota sem linhas')
    .max(maxInvoiceLines, 'nota com linhas demais'),
});

/** Registro que a carga não aceitou, como sai na resposta. */
export const rejectedRecordSchema = z.object({
  reference: persistedText(maxFieldLength).min(1),
  reason: persistedText(maxDivergenceTextLength).min(1),
});

export const stagedRecordSchema = z.object({
  reference: persistedText(maxFieldLength).min(1),
  reason: z.enum(['cabecalho-ausente', 'itens-ausentes']),
  raw: z.string(),
});

/**
 * Resultado de uma carga. As listas são amostra e os totais vêm separados: uma
 * carga com dez mil rejeições não pode virar resposta sem teto (REVIEW-04).
 */
export const ingestionReportSchema = z.object({
  ingestionId: z.uuid(),
  clientId: persistedText(maxClientIdLength).min(1),
  formatVersion: z.string().min(1),
  startedAt: isoInstantSchema,
  finishedAt: isoInstantSchema,
  ordersAccepted: z.int().nonnegative(),
  itemsAccepted: z.int().nonnegative(),
  rejected: z.array(rejectedRecordSchema).max(maxReportedRecords),
  rejectedTotal: z.int().nonnegative(),
  staged: z.array(stagedRecordSchema).max(maxReportedRecords),
  stagedTotal: z.int().nonnegative(),
});

export const divergenceCodeSchema = z.enum(divergenceCodes);

/**
 * Divergência antes de persistir. `expected` e `received` copiam texto vindo
 * da nota, e sem teto uma conferência válida para o contrato falharia só na
 * gravação, na coluna `VARCHAR(512)` (REVIEW-06, R06-01).
 */
export const divergenceSchema = z.object({
  code: divergenceCodeSchema,
  field: persistedText(maxFieldLength).min(1),
  invoiceLineIndex: z.int().nonnegative().nullable(),
  // Linha de pedido é número de linha do ERP; negativo não existe.
  purchaseOrderLine: z.int().nonnegative().nullable(),
  expected: persistedText(maxDivergenceTextLength).nullable(),
  received: persistedText(maxDivergenceTextLength).nullable(),
});

/** Conferência como sai na resposta e como volta do histórico. */
export const conferenceRecordSchema = z.object({
  id: z.string().min(1),
  purchaseOrderId: z.string().min(1),
  purchaseOrderIngestionVersion: z.int().positive(),
  clientId: persistedText(maxClientIdLength).min(1),
  checkedAt: isoInstantSchema,
  outcome: z.enum(['aprovada', 'reprovada']),
  invoice: invoiceCheckRequestSchema,
  divergences: z.array(divergenceSchema),
});

export const conferenceSummarySchema = z.object({
  checked: z.int().nonnegative(),
  approved: z.int().nonnegative(),
  rejected: z.int().nonnegative(),
  /**
   * Ocorrências por código. A soma **não** fecha com `rejected`: uma nota
   * reprovada pode ter várias divergências (ADR-009).
   */
  divergencesByCode: z.record(divergenceCodeSchema, z.int().nonnegative()),
});

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
