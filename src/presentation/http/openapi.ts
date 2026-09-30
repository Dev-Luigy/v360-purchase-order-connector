import { z } from 'zod';

import {
  conferenceRecordSchema,
  conferenceSummarySchema,
  divergenceSchema,
  ingestionReportSchema,
  invoiceCheckRequestSchema,
  rejectedRecordSchema,
  stagedRecordSchema,
} from '../../domain/schemas.js';

import {
  pageInfoSchema,
  purchaseOrderDetailSchema,
  purchaseOrderItemViewSchema,
  purchaseOrderSummarySchema,
} from './schemas.js';

/** Onde a API navegável é servida. O documento cru fica em `<prefixo>/json`. */
export const docsPrefix = '/docs';

/**
 * Nomes para os objetos saírem em `components.schemas`.
 *
 * Sem `id`, o gerador copia a forma inteira dentro de cada rota que a usa: a
 * página mostra caminhos e esconde o contrato, e o mesmo objeto reaparece em
 * vários lugares sem nada que os ligue. Com `id`, ele vira um objeto navegável
 * e as rotas apontam para ele.
 *
 * O registro é aqui, e não junto da definição, porque nomear para OpenAPI é
 * assunto da borda HTTP: o domínio não deve saber que existe documentação.
 */
const nomes: readonly (readonly [z.ZodType, string])[] = [
  [pageInfoSchema, 'Pagina'],
  [purchaseOrderSummarySchema, 'PedidoResumo'],
  [purchaseOrderItemViewSchema, 'PedidoItem'],
  [purchaseOrderDetailSchema, 'PedidoDetalhe'],
  [invoiceCheckRequestSchema, 'NotaFiscal'],
  [conferenceRecordSchema, 'Conferencia'],
  [conferenceSummarySchema, 'ResumoDeConferencias'],
  [divergenceSchema, 'Divergencia'],
  [ingestionReportSchema, 'RelatorioDeCarga'],
  [rejectedRecordSchema, 'RegistroRecusado'],
  [stagedRecordSchema, 'RegistroEmEspera'],
];

/** Idempotente: a suíte monta a aplicação muitas vezes no mesmo processo. */
export function registrarNomesDosObjetos(): void {
  for (const [schema, id] of nomes) {
    if (!z.globalRegistry.has(schema)) z.globalRegistry.add(schema, { id });
  }
}

/**
 * A capa do documento: só o que o gerador não deduz das rotas.
 *
 * Caminho, parâmetro, corpo e resposta vêm dos schemas Zod que já validam a
 * requisição. Aqui ficam título, versão e a explicação de cada grupo — o que
 * alguém precisa ler antes de clicar na primeira rota.
 */
export const openapiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'V360 — Conector de Pedidos de Compra',
    version: '1.0.0',
    description:
      'Um contrato único sobre quatro clientes que não concordam em quase ' +
      'nada: estrutura dos arquivos, idioma, formato de data, formato de ' +
      'número, máscara de CNPJ e vocabulário de situação. A carga normaliza; ' +
      'daqui para a frente todo pedido tem a mesma forma, venha de onde vier.\n\n' +
      'Toda lista é paginada por cursor, e o cursor carrega o recorte: trocar ' +
      'um filtro no meio da varredura é recusado, em vez de devolver em ' +
      'silêncio uma página de outro conjunto.\n\n' +
      'Dinheiro e quantidade são decimais exatos do começo ao fim, nunca ' +
      'ponto flutuante.\n\n' +
      'Este documento é gerado dos mesmos schemas que validam as ' +
      'requisições, então não tem como divergir do serviço — e um teste ' +
      'falha se alguma rota registrada ficar de fora dele.',
  },
  tags: [
    {
      name: 'pedidos',
      description:
        'Consulta unificada e detalhe. Os filtros são os de quem opera: ' +
        'cliente de origem, fornecedor, situação do pedido e apenas os que ' +
        'ainda têm algo a receber.',
    },
    {
      name: 'conferências',
      description:
        'Confere uma nota contra o pedido e guarda o resultado. Quando não ' +
        'bate, a resposta diz exatamente o que não bateu, com código ' +
        'estruturado — a plataforma mostra ao usuário sem adivinhar.',
    },
    {
      name: 'cargas',
      description:
        'Entrada dos quatro formatos pelo mesmo endpoint. O que muda é o ' +
        'perfil do cliente, não o código da rota.',
    },
    { name: 'operação', description: 'Vivacidade e prontidão.' },
  ],
};
