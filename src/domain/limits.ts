/**
 * Limites do contrato, em um lugar só.
 *
 * Fonte única: o Zod os aplica e o `prisma/schema.prisma` declara exatamente os
 * mesmos números, com um teste comparando os dois lados. Se divergirem, o
 * registro passa pelo contrato e morre na gravação — o que a borda HTTP traduz
 * em 500, no lugar de uma rejeição determinística na carga.
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
 * Separar as duas escalas é o que impede o arredondamento silencioso. Aceitar
 * no contrato mais casas do que a coluna guarda faz o excedente desaparecer na
 * gravação, sem erro: `0.0000001` viraria `0.000000`.
 */
export const maxPersistedDecimalPlaces = 6;

/**
 * Itens em um pedido e linhas em uma nota.
 *
 * Números escolhidos, não medidos: são teto de sanidade para impedir que um
 * único registro consuma memória sem limite, e precisam ser confirmados com
 * dado real antes de virarem compromisso. Pedido de ERP com mais de dez mil
 * linhas existe, mas é exceção que merece decisão própria, não caminho
 * silencioso.
 */
export const maxItemsPerOrder = 10_000;

/**
 * Tamanho máximo de um registro de CSV, em bytes. Sem isso, o `csv-parse`
 * acumula um campo ou uma linha sem limite até encher o buffer. O valor cobre
 * com folga a maior linha plausível: todas as colunas no comprimento máximo,
 * mais delimitadores.
 */
export const maxCsvRecordSize = 64 * 1024;
export const maxInvoiceLines = 1_000;

/**
 * Quantos registros rejeitados ou em staging a resposta de uma carga devolve.
 *
 * O total vai separado, então nada é escondido — só não cabe tudo numa resposta
 * HTTP. Quem precisar da lista inteira consulta o registro da carga, que é
 * trabalho de outra tarefa.
 */
export const maxReportedRecords = 100;

/**
 * Teto do conteúdo cru guardado por item em espera.
 *
 * O cru existe para auditoria, não para reprocessar o payload inteiro: sem
 * teto, um registro gigante entra no banco e volta no relatório da carga.
 */
export const maxStagedRawCharacters = 8 * 1024;

/**
 * Teto de pedidos distintos em espera numa carga.
 *
 * A consolidação guarda um número de pedido por entrada, não os itens — eles
 * ficam no banco. Ainda assim é memória que cresce com a carga, e o mesmo teto
 * dos índices de cabeçalho dos adaptadores se aplica.
 */
export const maxStagedOrders = 100_000;

/**
 * Idade a partir da qual uma espera **não publicada** é considerada abandonada.
 *
 * Linha não publicada pertence a uma carga em andamento, e é invisível por
 * desenho. Se o processo morrer no meio, ela fica para sempre. Uma hora é
 * folgado: a carga mais longa que medimos, 50.000 pedidos, levou pouco mais de
 * três minutos, e o tempo limite do pool de ingestão é de cinco. Um valor menor
 * que a carga mais longa apagaria carga ativa.
 */
export const idadeDeEsperaAbandonada = 60 * 60 * 1000;

/**
 * Moedas suportadas e as casas decimais de cada uma.
 *
 * Allowlist versionada, e não "três letras maiúsculas": `ZZZ` passa por ISO
 * 4217 e cai numa escala padrão de duas casas, o que muda o resultado da
 * conferência sem ninguém decidir isso. Moeda nova entra aqui, conscientemente,
 * com a escala certa.
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

/**
 * Comprimento máximo de um cursor de paginação. Um cursor legítimo tem cerca de
 * oitenta caracteres; o teto existe para a borda HTTP recusar antes de
 * decodificar (ADR-010).
 */
export const maxCursorLength = 256;
