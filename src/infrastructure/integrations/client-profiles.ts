import { z } from 'zod';

import { deepFreeze } from '../deep-freeze.js';

import type { ClientProfiles } from '../../application/ports/client-profiles.js';
import type { ClientId, ClientProfile } from '../../domain/client.js';
import { maxClientIdLength } from '../../domain/limits.js';
import {
  currencySchema,
  describeIssues,
  persistedText,
  purchaseOrderStatusSchema,
} from '../../domain/schemas.js';

import { normalizeStatusKey } from './field-parsers.js';

/**
 * Perfis como configuração tipada em código, validada no start.
 *
 * Não em tabela: quatro clientes não pagam tabela, endpoint de administração e
 * versionamento de perfil (ADR-008). O critério de graduação está registrado —
 * quando onboarding precisar acontecer sem release — e a porta `ClientProfiles`
 * já é assíncrona para que a troca não mexa em quem consome.
 */

export const alfaProfile: ClientProfile = deepFreeze({
  clientId: 'alfa',
  name: 'Alfa Energia',
  deliveryFormat: 'nested-json',
  formatVersion: '1',
  dateFormat: 'iso-date',
  numberFormat: { quantity: 'plain', money: 'plain' },
  taxIdMasked: false,
  // Os CNPJs do enunciado são fictícios e nenhum passa no checksum (ADR-013).
  validatesTaxIdChecksum: false,
  assumedCurrency: null,
  statusVocabulary: {
    OPEN: 'aberto',
    CLOSED: 'encerrado',
    BLOCKED: 'bloqueado',
  },
  csv: null,
  fields: {
    ordersArray: 'purchase_orders',
    itemsArray: 'items',
    order: {
      externalNumber: 'po_number',
      issuedOn: 'created_at',
      status: 'status',
      currency: 'currency',
      supplierTaxId: 'vendor.tax_id',
      supplierName: 'vendor.name',
    },
    item: {
      orderNumber: null,
      externalLine: 'line',
      material: 'material',
      description: 'description',
      purchaseUnit: 'uom',
      quantityOrdered: 'quantity_ordered',
      quantityReceived: 'quantity_received',
      unitPrice: 'unit_price',
      conversionFactor: null,
      lineCreatedOn: null,
    },
  },
});

export const betaProfile: ClientProfile = deepFreeze({
  clientId: 'beta',
  name: 'Beta Alimentos',
  deliveryFormat: 'paired-csv',
  formatVersion: '1',
  dateFormat: 'br-date',
  numberFormat: { quantity: 'br', money: 'br' },
  taxIdMasked: true,
  // Os CNPJs do enunciado são fictícios e nenhum passa no checksum (ADR-013).
  validatesTaxIdChecksum: false,
  assumedCurrency: null,
  statusVocabulary: {
    'EM ABERTO': 'aberto',
    BLOQUEADO: 'bloqueado',
    // As amostras do Beta só trazem `EM ABERTO` e `BLOQUEADO`. O termo para
    // encerrado é suposição nossa, registrada em `docs/CASE.md`; enquanto o
    // cliente não confirmar, um valor diferente deste é rejeitado em vez de
    // interpretado.
    ENCERRADO: 'encerrado',
  },
  csv: { delimiter: ';', encoding: 'utf-8' },
  fields: {
    ordersArray: null,
    itemsArray: null,
    order: {
      externalNumber: 'NUMERO_PEDIDO',
      issuedOn: 'EMISSAO',
      status: 'SITUACAO',
      currency: 'MOEDA',
      supplierTaxId: 'FORNECEDOR_CNPJ',
      supplierName: 'FORNECEDOR_RAZAO_SOCIAL',
    },
    item: {
      orderNumber: 'NUMERO_PEDIDO',
      externalLine: 'ITEM',
      material: 'CODIGO_MATERIAL',
      description: 'DESCRICAO',
      purchaseUnit: 'UNIDADE',
      quantityOrdered: 'QTD_PEDIDA',
      quantityReceived: 'QTD_RECEBIDA',
      unitPrice: 'PRECO_UNITARIO',
      conversionFactor: null,
      lineCreatedOn: null,
    },
  },
});

/**
 * Beta Alimentos, exportação do ERP legado.
 *
 * O enunciado registra que o encoding e o fim de linha do CSV do Beta **não são
 * especificados**, e que exportação de ERP brasileiro costuma vir em
 * Windows-1252 com CRLF. O fim de linha o leitor tolera sem configuração; o
 * encoding é declarado, porque adivinhá-lo produz acento corrompido em
 * silêncio, e falhar alto é melhor que gravar "Ã“leo" no banco.
 *
 * Este perfil existe para provar as duas coisas de uma vez: que o leitor tolera
 * a variante, e a afirmação do ADR-008 de que **cliente novo em forma conhecida
 * entra só com perfil, sem código novo**. Não há uma linha de código abaixo —
 * só rótulos.
 */
export const betaErpProfile: ClientProfile = deepFreeze({
  ...betaProfile,
  clientId: 'beta-erp',
  name: 'Beta Alimentos (exportação do ERP legado)',
  csv: { delimiter: ';', encoding: 'windows-1252' },
});

export const gamaProfile: ClientProfile = deepFreeze({
  clientId: 'gama',
  name: 'Gama Logística',
  deliveryFormat: 'flat-json',
  formatVersion: '1',
  dateFormat: 'unix-seconds',
  // Quantidade é número simples; dinheiro vem em centavos inteiros.
  numberFormat: { quantity: 'plain', money: 'cents' },
  taxIdMasked: false,
  validatesTaxIdChecksum: false,
  // O payload não traz moeda. BRL é hipótese registrada em docs/CASE.md, e
  // precisa ser declarada: sem ela todo registro seria rejeitado.
  assumedCurrency: 'BRL',
  // Situação como código numérico. O vocabulário é fechado: código fora dele é
  // rejeitado em vez de interpretado, como no Beta.
  statusVocabulary: { '1': 'aberto', '2': 'encerrado', '3': 'bloqueado' },
  csv: null,
  fields: {
    // A raiz do payload já é o array de linhas.
    ordersArray: null,
    itemsArray: null,
    order: {
      externalNumber: 'ped',
      issuedOn: 'dt_criacao',
      status: 'situacao',
      currency: null,
      supplierTaxId: 'cnpj_fornecedor',
      supplierName: 'nome_fornecedor',
    },
    item: {
      orderNumber: 'ped',
      externalLine: 'item',
      material: 'cod_mat',
      description: 'desc_mat',
      purchaseUnit: 'um',
      quantityOrdered: 'qtd_ped',
      quantityReceived: 'qtd_rec',
      unitPrice: 'preco_unit_centavos',
      conversionFactor: 'fator_conv',
      lineCreatedOn: null,
    },
  },
});

/**
 * Delta: mesmos nomes de campo do Alfa — é o mesmo produto de mercado, em outra
 * versão. O que muda é só a entrega, em duas consultas independentes. Por isso
 * o cliente vai no caminho da URL e nunca é deduzido do conteúdo.
 */
export const deltaProfile: ClientProfile = deepFreeze({
  clientId: 'delta',
  name: 'Delta Distribuição',
  deliveryFormat: 'split-json',
  formatVersion: '1',
  dateFormat: 'iso-date',
  numberFormat: { quantity: 'plain', money: 'plain' },
  taxIdMasked: false,
  validatesTaxIdChecksum: false,
  assumedCurrency: null,
  statusVocabulary: {
    OPEN: 'aberto',
    CLOSED: 'encerrado',
    BLOCKED: 'bloqueado',
  },
  csv: null,
  fields: {
    ordersArray: 'orders',
    itemsArray: 'items',
    order: {
      externalNumber: 'po_number',
      issuedOn: 'created_at',
      status: 'status',
      currency: 'currency',
      supplierTaxId: 'vendor.tax_id',
      supplierName: 'vendor.name',
    },
    item: {
      orderNumber: 'purchase_order',
      externalLine: 'line',
      material: 'material',
      description: 'description',
      purchaseUnit: 'uom',
      quantityOrdered: 'quantity_ordered',
      quantityReceived: 'quantity_received',
      unitPrice: 'unit_price',
      conversionFactor: null,
      // Cada item do Delta traz a própria data de criação, que pode ser
      // posterior à do cabeçalho quando a linha foi incluída depois.
      lineCreatedOn: 'created_at',
    },
  },
});

/**
 * Os quatro clientes do enunciado, mais a variante de encoding do Beta — que é
 * perfil, não cliente novo, e está aqui para provar que a variante que o
 * enunciado levanta é tolerada ponta a ponta.
 */
export const configuredProfiles: readonly ClientProfile[] = [
  alfaProfile,
  betaProfile,
  betaErpProfile,
  gamaProfile,
  deltaProfile,
];

export class ProfileError extends Error {
  constructor(clientId: string, reason: string) {
    super(`perfil do cliente ${clientId}: ${reason}`);
    this.name = 'ProfileError';
  }
}

const orderFieldMapSchema = z.object({
  externalNumber: z.string().min(1),
  issuedOn: z.string().min(1),
  status: z.string().min(1),
  currency: z.string().min(1).nullable(),
  supplierTaxId: z.string().min(1),
  supplierName: z.string().min(1),
});

const itemFieldMapSchema = z.object({
  orderNumber: z.string().min(1).nullable(),
  externalLine: z.string().min(1),
  material: z.string().min(1),
  description: z.string().min(1),
  purchaseUnit: z.string().min(1),
  quantityOrdered: z.string().min(1),
  quantityReceived: z.string().min(1),
  unitPrice: z.string().min(1),
  conversionFactor: z.string().min(1).nullable(),
  lineCreatedOn: z.string().min(1).nullable(),
});

const profileSchema = z
  .object({
    clientId: persistedText(maxClientIdLength).min(1, 'identificador vazio'),
    name: z.string().min(1, 'nome vazio'),
    deliveryFormat: z.enum([
      'nested-json',
      'paired-csv',
      'flat-json',
      'split-json',
    ]),
    formatVersion: z.string().min(1, 'versão de formato vazia'),
    dateFormat: z.enum(['iso-date', 'br-date', 'unix-seconds']),
    numberFormat: z.object({
      quantity: z.enum(['plain', 'br', 'cents']),
      money: z.enum(['plain', 'br', 'cents']),
    }),
    taxIdMasked: z.boolean(),
    validatesTaxIdChecksum: z.boolean(),
    assumedCurrency: currencySchema.nullable(),
    statusVocabulary: z
      .record(z.string().min(1), purchaseOrderStatusSchema)
      .refine(
        (vocabulary) => Object.keys(vocabulary).length > 0,
        'vocabulário de situação vazio',
      )
      .refine(
        (vocabulary) =>
          Object.keys(vocabulary).every(
            (term) => term === normalizeStatusKey(term),
          ),
        'termo de situação precisa estar normalizado: maiúsculas, sem acento',
      ),
    csv: z
      .object({
        delimiter: z.string().length(1, 'delimitador precisa ter um caractere'),
        encoding: z.enum(['utf-8', 'windows-1252']),
      })
      .nullable(),
    fields: z.object({
      ordersArray: z.string().min(1).nullable(),
      itemsArray: z.string().min(1).nullable(),
      order: orderFieldMapSchema,
      item: itemFieldMapSchema,
    }),
  })
  // Só a forma delimitada usa a seção csv; o contrário é perfil incoerente.
  .refine(
    (profile) =>
      (profile.deliveryFormat === 'paired-csv') === (profile.csv !== null),
    'a seção csv existe exatamente nas formas delimitadas',
  )
  // Duas partes ligadas por chave só funcionam se o item disser a que pedido
  // pertence; itens aninhados não precisam disso.
  .refine(
    (profile) =>
      (profile.deliveryFormat !== 'paired-csv' &&
        profile.deliveryFormat !== 'split-json') ||
      profile.fields.item.orderNumber !== null,
    'entrega em duas partes exige o campo que liga o item ao pedido',
  )
  .refine(
    (profile) =>
      profile.deliveryFormat !== 'nested-json' ||
      profile.fields.itemsArray !== null,
    'itens aninhados exigem itemsArray',
  )
  // Onde está o array de pedidos depende da forma, e o start é o lugar de
  // descobrir que não está em lugar nenhum — senão o perfil incompleto só
  // aparece na primeira carga real do cliente.
  .refine(
    (profile) =>
      profile.deliveryFormat === 'flat-json' ||
      profile.deliveryFormat === 'paired-csv' ||
      profile.fields.ordersArray !== null,
    'esta forma exige ordersArray: é onde o array de pedidos está no payload',
  )
  .refine(
    (profile) =>
      profile.deliveryFormat !== 'flat-json' ||
      profile.fields.ordersArray === null,
    'flat-json não tem ordersArray: a raiz do payload já é o array',
  )
  // Sem campo de moeda e sem moeda assumida, todo registro do cliente seria
  // rejeitado por falta de moeda: um perfil inútil que o start precisa recusar.
  .refine(
    (profile) =>
      profile.fields.order.currency !== null ||
      profile.assumedCurrency !== null,
    'cliente que não envia moeda precisa declarar assumedCurrency',
  );

/**
 * Valida um perfil. Roda no start e não na primeira carga: perfil incoerente
 * descoberto em produção significa carga rejeitada de um cliente real.
 */
export function assertValidProfile(profile: ClientProfile): void {
  const result = profileSchema.safeParse(profile);
  if (!result.success) {
    throw new ProfileError(profile.clientId, describeIssues(result.error));
  }
}

/** Implementação da porta sobre os perfis em código. */
export class InMemoryClientProfiles implements ClientProfiles {
  private readonly byId: ReadonlyMap<ClientId, ClientProfile>;

  constructor(profiles: readonly ClientProfile[] = configuredProfiles) {
    const byId = new Map<ClientId, ClientProfile>();
    for (const profile of profiles) {
      assertValidProfile(profile);
      if (byId.has(profile.clientId)) {
        throw new ProfileError(profile.clientId, 'identificador repetido');
      }
      byId.set(profile.clientId, deepFreeze(structuredClone(profile)));
    }
    this.byId = byId;
  }

  find(clientId: ClientId): Promise<ClientProfile | null> {
    return Promise.resolve(this.byId.get(clientId) ?? null);
  }

  list(): Promise<readonly ClientProfile[]> {
    return Promise.resolve([...this.byId.values()]);
  }
}
