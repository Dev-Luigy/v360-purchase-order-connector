import assert from 'node:assert/strict';
import test from 'node:test';

import { maxItemsPerOrder } from '../src/domain/limits.js';
import type { AdapterBatch } from '../src/application/ports/source-adapter.js';
import { betaProfile } from '../src/infrastructure/integrations/client-profiles.js';
import { parseTaxId } from '../src/infrastructure/integrations/field-parsers.js';
import {
  PairedCsvAdapter,
  csvHeadersPart,
  csvItemsPart,
} from '../src/infrastructure/integrations/paired-csv-adapter.js';

/**
 * Regressões de REVIEW-08. A lição do achado R08-01 está nesta suíte: o teste
 * que eu escrevi em FIX-08 comparava uma constante e nunca chamou o adaptador,
 * então ficou verde enquanto o defeito passava. Estes atravessam o adaptador.
 */

const bytes = (texto: string) =>
  async function* (): AsyncIterable<Uint8Array> {
    yield new TextEncoder().encode(texto);
  };

const cabecalho =
  'NUMERO_PEDIDO;FORNECEDOR_CNPJ;FORNECEDOR_RAZAO_SOCIAL;EMISSAO;SITUACAO;MOEDA\n' +
  'P1;12.345.678/0001-90;Fornecedor;15/08/2026;EM ABERTO;BRL\n';

const colunasItens =
  'NUMERO_PEDIDO;ITEM;CODIGO_MATERIAL;DESCRICAO;UNIDADE;QTD_PEDIDA;QTD_RECEBIDA;PRECO_UNITARIO\n';

function itensDe(quantidade: number): string {
  let texto = colunasItens;
  for (let i = 0; i < quantidade; i += 1) {
    texto += `P1;${String(i + 1)};MAT-${String(i)};Item;UN;1,000;0,000;1,00\n`;
  }
  return texto;
}

async function carregar(itens: string): Promise<AdapterBatch> {
  const orders: AdapterBatch['orders'][number][] = [];
  const rejected: AdapterBatch['rejected'][number][] = [];
  for await (const lote of new PairedCsvAdapter().read(
    {
      clientId: 'beta',
      formatVersion: '1',
      parts: new Map([
        [csvHeadersPart, bytes(cabecalho)],
        [csvItemsPart, bytes(itens)],
      ]),
    },
    betaProfile,
  )) {
    orders.push(...lote.orders);
    rejected.push(...lote.rejected);
  }
  return { orders, rejected, staged: [] };
}

test('R08-01: exatamente no teto o pedido sai inteiro', async () => {
  const batch = await carregar(itensDe(maxItemsPerOrder));
  assert.deepEqual(batch.rejected, []);
  assert.equal(batch.orders.length, 1);
  assert.equal(batch.orders[0]?.items?.length, maxItemsPerOrder);
});

test('R08-01: acima do teto o pedido é recusado inteiro, não truncado', async () => {
  // Antes: um pedido com 10.000 itens era emitido e a linha 10.001 virava
  // rejeição. Como `replaceSnapshot` substitui, o excedente sumiria e o
  // retrato se diria completo — corrupção semântica, não só memória.
  const batch = await carregar(itensDe(maxItemsPerOrder + 1));
  assert.deepEqual(
    batch.orders,
    [],
    'nenhum pedido deve ser emitido a partir de um retrato truncado',
  );
  assert.equal(
    batch.rejected.length,
    1,
    'uma rejeição por pedido, não por linha',
  );
  assert.match(batch.rejected[0]?.reason ?? '', /pedido inteiro foi recusado/);
});

test('R08-01: o cabeçalho não reaparece como pedido sem itens', async () => {
  // Emitir o cabeçalho com `items: []` no fim seria igualmente errado: `[]`
  // afirma que o pedido não tem itens, e apagaria os já conhecidos.
  const batch = await carregar(itensDe(maxItemsPerOrder + 1));
  assert.equal(
    batch.orders.find((order) => order.externalNumber === 'P1'),
    undefined,
  );
});

test('R08-01: linha rejeitada não produz retrato parcial', async () => {
  // A aceitação parcial de ADR-008 é por pedido, não por item dentro do
  // pedido: emitir os itens que deram certo apagaria os que não deram.
  const itens =
    colunasItens +
    'P1;1;MAT-1;Bom;UN;1,000;0,000;1,00\n' +
    'P1;2;MAT-2;Quantidade torta;UN;abc;0,000;1,00\n' +
    'P1;3;MAT-3;Bom;UN;2,000;0,000;2,00\n';
  const batch = await carregar(itens);
  assert.equal(batch.orders.length, 1);
  assert.equal(
    batch.orders[0]?.items,
    null,
    'null preserva os itens conhecidos; a lista parcial os apagaria',
  );
  assert.equal(batch.rejected.length, 1);
});

test('R08-02: o formato do CNPJ é exclusivo nos dois sentidos', () => {
  // Matriz 2x2. Antes, `masked = true` aceitava também a forma limpa, então o
  // perfil prometia uma regra e cumpria metade dela.
  const mascarado = '12.345.678/0001-90';
  const limpo = '12345678000190';
  assert.equal(parseTaxId(mascarado, 'c', true), limpo);
  assert.equal(parseTaxId(limpo, 'c', false), limpo);
  assert.throws(
    () => parseTaxId(limpo, 'c', true),
    /declara formato mascarado/,
  );
  assert.throws(
    () => parseTaxId(mascarado, 'c', false),
    /declara formato limpo/,
  );
});

test('R08-02: o perfil do Beta exige a máscara que declara', async () => {
  // O Beta entrega com máscara; uma mudança do ERP para a forma limpa passa a
  // ser rejeição, que é o aviso de que o perfil precisa de versão nova.
  const semMascara = cabecalho.replace('12.345.678/0001-90', '12345678000190');
  const orders = [];
  const rejected = [];
  for await (const lote of new PairedCsvAdapter().read(
    {
      clientId: 'beta',
      formatVersion: '1',
      parts: new Map([
        [csvHeadersPart, bytes(semMascara)],
        [csvItemsPart, bytes(colunasItens)],
      ]),
    },
    betaProfile,
  )) {
    orders.push(...lote.orders);
    rejected.push(...lote.rejected);
  }
  assert.deepEqual(orders, []);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0]?.reason ?? '', /formato mascarado/);
});
