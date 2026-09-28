/**
 * Limites do contrato, em um lugar só.
 *
 * O schema Zod validava conteúdo e o schema Prisma declarava `VARCHAR(n)`, sem
 * nenhuma relação entre os dois. O resultado é que um registro passava por
 * válido e morria na gravação: `material` com 129 caracteres era aceito pelo
 * contrato e recusado pela coluna. Quando P1-04 traduzir isso para HTTP, viraria
 * 500 em vez de rejeição determinística (REVIEW-06, R06-01).
 *
 * Estas constantes são a fonte única: o Zod as aplica e o
 * `prisma/schema.prisma` declara exatamente os mesmos números, com um teste
 * comparando os dois lados para não divergirem em silêncio.
 */

/** `VARCHAR(64)` em `purchase_order.client_id`. */
export const maxClientIdLength = 64;

/** `VARCHAR(64)` em `purchase_order.external_number`. */
export const maxExternalNumberLength = 64;

/** `VARCHAR(256)` em `purchase_order.supplier_name`. */
export const maxSupplierNameLength = 256;

/** `VARCHAR(128)` em `purchase_order_item.material`. */
export const maxMaterialLength = 128;

/** `VARCHAR(512)` em `purchase_order_item.description`. */
export const maxDescriptionLength = 512;

/** `VARCHAR(16)` em `purchase_order_item.purchase_unit`. */
export const maxPurchaseUnitLength = 16;

/** `VARCHAR(128)` em `conference_divergence.field`. */
export const maxFieldLength = 128;

/** `VARCHAR(512)` em `conference_divergence.expected` e `received`. */
export const maxDivergenceTextLength = 512;

/**
 * Teto do `INTEGER` do PostgreSQL. Número de linha acima disso não é dado de
 * ERP, é entrada malformada.
 */
export const maxExternalLine = 2_147_483_647;

/**
 * Dígitos que o decimal do contrato representa, e que a coluna
 * `NUMERIC(30, 6)` guarda.
 */
export const maxIntegerDigits = 24;
export const maxDecimalPlaces = 12;

/**
 * Itens em um pedido e linhas em uma nota.
 *
 * Números escolhidos, não medidos: são teto de sanidade para impedir que um
 * único registro consuma memória sem limite (REVIEW-04, R04-02), e precisam
 * ser confirmados com dado real antes de virarem compromisso. Pedido de ERP
 * com mais de dez mil linhas existe, mas é exceção que merece decisão própria,
 * não caminho silencioso.
 */
export const maxItemsPerOrder = 10_000;
export const maxInvoiceLines = 1_000;
