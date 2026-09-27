import type { CurrencyCode } from './primitives.js';

/** Identificador do cliente de origem, atribuído por nós: `"alfa"`, `"beta"`. */
export type ClientId = string;

/**
 * Situação canônica do pedido. Cada cliente fala a sua língua (`open`,
 * `EM ABERTO`, `1`); a tradução mora no perfil do cliente, e o domínio só
 * conhece estes três valores (ADR-006).
 */
export type PurchaseOrderStatus = 'aberto' | 'encerrado' | 'bloqueado';

/**
 * Forma de entrega dos dados, que é o que exige código novo. São quatro, e um
 * cliente novo em forma conhecida não precisa de adaptador novo (ADR-008).
 */
export type DeliveryFormat =
  /** Alfa: um JSON com os itens aninhados dentro do pedido. */
  | 'nested-json'
  /** Beta: dois CSV, cabeçalhos e itens, ligados pelo número do pedido. */
  | 'paired-csv'
  /** Gama: JSON achatado, uma linha por item, cabeçalho repetido. */
  | 'flat-json'
  /** Delta: dois JSON independentes, ligados por `purchase_order`. */
  | 'split-json';

/** Como o cliente escreve datas. */
export type DateFormat = 'iso-date' | 'br-date' | 'unix-seconds';

/** Como o cliente escreve um número. */
export type NumberFormat =
  /** `45.9`, ponto decimal, sem separador de milhar. */
  | 'plain'
  /** `1.200,000`, vírgula decimal e ponto de milhar. */
  | 'br'
  /** `120000` significando R$ 1.200,00. */
  | 'cents';

/**
 * Onde cada campo do contrato mora no vocabulário do cliente. Caminho com
 * ponto navega objeto aninhado (`vendor.tax_id`); em CSV é o nome da coluna.
 *
 * Isto é rótulo, não estrutura, e por isso mora no perfil (ADR-008): o Delta
 * usa exatamente os mesmos nomes do Alfa e só muda a forma de entrega, então
 * um cliente novo em forma conhecida precisa de perfil novo, não de código.
 */
export interface OrderFieldMap {
  readonly externalNumber: string;
  readonly issuedOn: string;
  readonly status: string;
  /** `null` quando o cliente não envia moeda; vale então `assumedCurrency`. */
  readonly currency: string | null;
  readonly supplierTaxId: string;
  readonly supplierName: string;
}

export interface ItemFieldMap {
  /** Onde o item diz a que pedido pertence. `null` quando já vem aninhado. */
  readonly orderNumber: string | null;
  readonly externalLine: string;
  readonly material: string;
  readonly description: string;
  readonly purchaseUnit: string;
  readonly quantityOrdered: string;
  readonly quantityReceived: string;
  readonly unitPrice: string;
  /** `null` quando o cliente não trabalha com caixa: o fator é 1. */
  readonly conversionFactor: string | null;
  /** `null` quando a linha não tem data própria, como no Alfa e no Beta. */
  readonly lineCreatedOn: string | null;
}

export interface ClientFieldMap {
  /**
   * Chave do array de pedidos dentro da parte. `null` quando a parte já é o
   * array na raiz, ou quando a forma não é JSON.
   */
  readonly ordersArray: string | null;
  /**
   * Onde estão os itens: caminho dentro do pedido quando aninhados, chave da
   * parte de itens quando separados, `null` quando a forma não é JSON.
   */
  readonly itemsArray: string | null;
  readonly order: OrderFieldMap;
  readonly item: ItemFieldMap;
}

/**
 * Notação numérica por natureza do campo.
 *
 * Uma notação só por cliente não descreve a realidade: no Gama, `qtd_ped` é
 * `10` e `fator_conv` é `12` em inteiro simples, enquanto
 * `preco_unit_centavos` é `120000` em centavos, tudo na mesma linha. Declarar
 * `cents` para o cliente inteiro converteria também quantidade e fator, que
 * virariam `0,10` e `0,12` (ADR-012).
 *
 * A divisão é por natureza e não por campo porque é assim que os ERPs tratam:
 * dinheiro tem uma convenção, medida tem outra. Se algum cliente precisar de
 * notação por campo individual, o mapa de campos é o lugar, não aqui.
 */
export interface NumberFormats {
  /** Quantidade pedida, recebida e fator de conversão. */
  readonly quantity: NumberFormat;
  /** Preço unitário e qualquer valor monetário. */
  readonly money: NumberFormat;
}

/**
 * Perfil de integração de um cliente: tudo que é rótulo, e não estrutura.
 * Cliente novo em forma de entrega conhecida vira um perfil novo, sem código
 * novo (ADR-008).
 */
export interface ClientProfile {
  readonly clientId: ClientId;
  readonly name: string;
  readonly deliveryFormat: DeliveryFormat;
  /**
   * Versão do formato do cliente. Alfa e Delta são o mesmo produto de mercado
   * em versões diferentes: quando um cliente atualiza o ERP, queremos versão
   * nova registrada em vez de parse silenciosamente errado.
   */
  readonly formatVersion: string;
  readonly dateFormat: DateFormat;
  readonly numberFormat: NumberFormats;
  /** `true` quando o CNPJ vem mascarado, como no Beta. */
  readonly taxIdMasked: boolean;
  /**
   * Moeda assumida quando o cliente não envia nenhuma, como o Gama. `null`
   * quando o cliente sempre envia; aí a ausência é rejeição, não suposição.
   */
  readonly assumedCurrency: CurrencyCode | null;
  /**
   * Tradução da situação do cliente para a canônica, com as chaves já
   * normalizadas (maiúsculas, sem acento). Valor fora deste mapa é rejeitado:
   * adivinhar situação é pior que recusar a linha.
   */
  readonly statusVocabulary: Readonly<Record<string, PurchaseOrderStatus>>;
  /** Presente apenas em formatos de texto delimitado. */
  readonly csv: {
    readonly delimiter: string;
    readonly encoding: 'utf-8' | 'windows-1252';
  } | null;
  /** Onde cada campo do contrato mora no vocabulário deste cliente. */
  readonly fields: ClientFieldMap;
}
