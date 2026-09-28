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
 * Dígitos inteiros que o decimal do contrato representa, e que a parte inteira
 * de `NUMERIC(30, 6)` guarda.
 */
export const maxIntegerDigits = 24;

/**
 * Casas decimais que um decimal **de cálculo** pode ter. É maior que a escala
 * persistida de propósito: quantidade de nota e valor total são comparados, não
 * gravados, e a conversão de caixa para unidade produz mais casas no meio do
 * caminho.
 */
export const maxDecimalPlaces = 12;

/**
 * Casas decimais que um campo **persistido** pode ter: a escala de
 * `NUMERIC(30, 6)`, que ADR-007 fixou.
 *
 * Separar as duas escalas é o que impede o arredondamento silencioso: o
 * contrato aceitava doze casas, a coluna guardava seis, e `toText(6)` no
 * adaptador fazia `0.0000001` virar `0.000000` — o valor sumia sem ninguém
 * ser avisado (REVIEW-07, R07-01).
 */
export const maxPersistedDecimalPlaces = 6;

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

/**
 * Tamanho máximo de um registro de CSV, em bytes. Sem isso, o `csv-parse`
 * acumula um campo ou uma linha sem limite até encher o buffer (REVIEW-07,
 * R07-02). O valor cobre com folga a maior linha plausível: todas as colunas
 * no comprimento máximo, mais delimitadores.
 */
export const maxCsvRecordSize = 64 * 1024;
export const maxInvoiceLines = 1_000;

/**
 * Moedas suportadas e as casas decimais de cada uma.
 *
 * Allowlist versionada, e não "três letras maiúsculas": `ZZZ` passava por ISO
 * 4217 e caía numa escala padrão de duas casas, o que muda o resultado da
 * conferência sem ninguém decidir isso (REVIEW-07, R07-08). Moeda nova entra
 * aqui, conscientemente, com a escala certa.
 */
export const supportedCurrencies: Readonly<Record<string, number>> = {
  BRL: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
  // Sem centavo.
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
