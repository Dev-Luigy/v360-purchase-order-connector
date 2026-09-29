import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';

import { PrismaPurchaseOrderRepository } from '../../src/infrastructure/database/purchase-order-repository.js';
import type { DatabaseConnection } from '../../src/infrastructure/database/prisma-client.js';
import type { StagedItem } from '../../src/domain/ingestion.js';
import type { NormalizedPurchaseOrderItem } from '../../src/domain/purchase-order.js';

import { maxItemsPerOrder } from '../../src/domain/limits.js';

import { connect, gravar, limpar, pedido, semBanco } from './support.js';

/**
 * A espera de itens órfãos, contra PostgreSQL de verdade.
 *
 * REVIEW-09 apontou que toda a reconciliação era testada só com o dobro em
 * memória, que não revalidava JSON nem reproduzia transação — e foi por isso
 * que R09-01 e R09-04 passavam verdes. Estes testes existem para que a
 * fronteira transacional seja provada onde ela realmente vive.
 */
describe('espera de itens órfãos no PostgreSQL', { skip: semBanco }, () => {
  let database: DatabaseConnection;
  let orders: PrismaPurchaseOrderRepository;

  before(() => {
    database = connect();
    orders = new PrismaPurchaseOrderRepository(database.prisma);
  });

  after(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await limpar(database);
    await database.pool.query('TRUNCATE TABLE "ingestion_staging"');
  });

  const item = (
    overrides: Partial<NormalizedPurchaseOrderItem> = {},
  ): NormalizedPurchaseOrderItem => ({
    externalLine: 10,
    material: 'EMB-500',
    description: 'Caixa papelão',
    purchaseUnit: 'UN',
    conversionFactor: '1.000000',
    quantityOrdered: '100.000000',
    quantityReceived: '0.000000',
    unitPrice: '3.750000',
    lineCreatedOn: null,
    ...overrides,
  });

  const orfao = (
    externalNumber: string,
    overrides: Partial<NormalizedPurchaseOrderItem> = {},
  ): StagedItem => ({
    reference: externalNumber,
    externalNumber,
    reason: 'cabecalho-ausente',
    raw: '{"origem":"teste"}',
    item: item(overrides),
  });

  /**
   * O que a carga faz: guarda os itens e tenta fechar o pedido. Devolve
   * quantos foram aplicados — zero significa que continuam esperando.
   */
  const avulsos = async (
    clientId: string,
    externalNumber: string,
    items: readonly StagedItem[],
    // Cada chamada é uma carga distinta, como na vida real.
    ingestionId: string = randomUUID(),
  ): Promise<number> => {
    await orders.stageLooseItems(clientId, ingestionId, items);
    return orders.consolidateStaged(clientId, ingestionId, externalNumber);
  };

  const emEspera = async (externalNumber: string): Promise<number> => {
    const { rows } = await database.pool.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM ingestion_staging WHERE external_number = $1',
      [externalNumber],
    );
    return Number(rows[0]?.total ?? '0');
  };

  it('item de pedido inexistente espera; o cabeçalho depois o recupera', async () => {
    const destino = await avulsos('delta', 'DL-1', [orfao('DL-1')]);
    assert.equal(destino, 0, 'deveria continuar esperando');
    assert.equal(await emEspera('DL-1'), 1);

    // O cabeçalho chega sem itens: a espera é tudo o que se sabe sobre eles.
    const salvo = await gravar(
      orders,
      pedido({ clientId: 'delta', externalNumber: 'DL-1', items: null }),
    );
    assert.equal(salvo.items.length, 1);
    assert.equal(salvo.items[0]?.material, 'EMB-500');
    assert.equal(await emEspera('DL-1'), 0, 'a espera não foi consumida');
  });

  it('falha ao gravar o pedido desfaz o consumo da espera', async () => {
    // R09-01: `takeFor` apagava numa transação própria, então a falha da
    // gravação seguinte perdia o item para sempre.
    await avulsos('delta', 'DL-2', [orfao('DL-2')]);
    assert.equal(await emEspera('DL-2'), 1);

    await assert.rejects(
      () =>
        gravar(
          orders,
          pedido({
            clientId: 'delta',
            externalNumber: 'DL-2',
            // `CHECK` do banco recusa fator zero: falha depois do consumo da
            // espera e dentro da mesma transação.
            items: [item({ conversionFactor: '0.000000' })],
          }),
        ),
      /.*/,
    );

    assert.equal(
      await emEspera('DL-2'),
      1,
      'o item que esperava foi perdido pela falha de gravação',
    );
  });

  it('item de pedido existente atualiza em vez de esperar', async () => {
    await gravar(orders, pedido({ clientId: 'delta', externalNumber: 'DL-3' }));
    const destino = await avulsos('delta', 'DL-3', [
      orfao('DL-3', { externalLine: 99, material: 'NOVO-1' }),
    ]);
    assert.ok(destino > 0, 'deveria ter sido aplicado');
    assert.equal(await emEspera('DL-3'), 0);

    const salvo = await orders.findByExternalNumber('delta', 'DL-3');
    const linhas = salvo?.items
      .map((i) => i.externalLine)
      .sort((a, b) => a - b);
    assert.deepEqual(linhas, [10, 99], 'a linha nova não entrou junto');
  });

  it('dentro da mesma carga, reenviar a linha substitui a anterior', async () => {
    const carga = randomUUID();
    await orders.stageLooseItems('delta', carga, [orfao('DL-4')]);
    await orders.stageLooseItems('delta', carga, [
      orfao('DL-4', { quantityOrdered: '777.000000' }),
    ]);
    assert.equal(await emEspera('DL-4'), 1, 'duplicou em vez de substituir');

    const salvo = await gravar(
      orders,
      pedido({ clientId: 'delta', externalNumber: 'DL-4', items: null }),
    );
    assert.equal(salvo.items[0]?.quantityOrdered, '777.000000');
  });

  it('cargas diferentes coexistem na espera; a última prevalece', async () => {
    // A carga faz parte da identidade, então as duas linhas convivem: é o que
    // impede uma carga de tomar a linha da outra (REVIEW-13, R13-01). Na
    // reconciliação, "prevalece a última carga aceita" decide (ADR-008).
    await orders.stageLooseItems('delta', randomUUID(), [orfao('DL-14')]);
    await orders.stageLooseItems('delta', randomUUID(), [
      orfao('DL-14', { quantityOrdered: '777.000000' }),
    ]);
    assert.equal(
      await emEspera('DL-14'),
      2,
      'uma carga tomou a linha da outra',
    );

    const salvo = await gravar(
      orders,
      pedido({ clientId: 'delta', externalNumber: 'DL-14', items: null }),
    );
    assert.equal(salvo.items.length, 1, 'a mesma linha entrou duas vezes');
    assert.equal(salvo.items[0]?.quantityOrdered, '777.000000');
  });

  it('a espera é isolada por cliente', async () => {
    await avulsos('delta', 'MESMO-NUMERO', [orfao('MESMO-NUMERO')]);
    await avulsos('alfa', 'MESMO-NUMERO', [orfao('MESMO-NUMERO')]);
    assert.equal(await emEspera('MESMO-NUMERO'), 2);

    const salvo = await gravar(
      orders,
      pedido({
        clientId: 'delta',
        externalNumber: 'MESMO-NUMERO',
        items: null,
      }),
    );
    assert.equal(salvo.items.length, 1);
    // O item do alfa continua esperando: identidade é (cliente, número).
    assert.equal(await emEspera('MESMO-NUMERO'), 1);
  });

  it('itens recuperados entram na ordem da linha', async () => {
    for (const linha of [30, 10, 20]) {
      await avulsos('delta', 'DL-5', [
        orfao('DL-5', { externalLine: linha, material: `M-${String(linha)}` }),
      ]);
    }
    const salvo = await gravar(
      orders,
      pedido({ clientId: 'delta', externalNumber: 'DL-5', items: null }),
    );
    assert.deepEqual(
      salvo.items.map((i) => i.externalLine),
      [10, 20, 30],
    );
  });

  it('linha gravada fora do contrato é recusada na leitura, não aplicada', async () => {
    // Uma versão anterior do contrato pode ter gravado algo que hoje não
    // passa. O que sai da espera entra num pedido de verdade.
    await database.pool.query(
      `INSERT INTO ingestion_staging
         (id, client_id, ingestion_id, external_number, external_line,
          item, raw, staged_at)
       VALUES (gen_random_uuid(), 'delta', gen_random_uuid(), 'DL-6', 10,
               $1::jsonb, '{}', now())`,
      [JSON.stringify({ ...item(), material: 'M'.repeat(129) })],
    );

    await assert.rejects(
      () =>
        gravar(
          orders,
          pedido({ clientId: 'delta', externalNumber: 'DL-6', items: null }),
        ),
      /não passou no contrato/,
    );
    assert.equal(await emEspera('DL-6'), 1, 'a linha inválida foi consumida');
  });

  it('grupo de itens avulsos entra numa transação e numa versão só', async () => {
    // R10-01: uma transação por linha fazia a versão avançar por linha e
    // regravava o retrato inteiro a cada uma, custando O(n²).
    const antes = await gravar(
      orders,
      pedido({ clientId: 'delta', externalNumber: 'DL-8' }),
    );
    const grupo = [21, 22, 23, 24, 25].map((linha) =>
      orfao('DL-8', { externalLine: linha, material: `G-${String(linha)}` }),
    );
    const destino = await avulsos('delta', 'DL-8', grupo);
    assert.ok(destino > 0, 'deveria ter sido aplicado');

    const depois = await orders.findByExternalNumber('delta', 'DL-8');
    assert.equal(
      (depois?.ingestionVersion ?? 0) - antes.ingestionVersion,
      1,
      'a versão avançou mais de uma vez para um grupo',
    );
    assert.equal(depois?.items.length, 6, 'o grupo não entrou inteiro');
  });

  it('grupo de um pedido inexistente espera inteiro, sem gravar nada', async () => {
    const grupo = [10, 20].map((linha) =>
      orfao('DL-9', { externalLine: linha, material: `E-${String(linha)}` }),
    );
    const destino = await avulsos('delta', 'DL-9', grupo);
    assert.equal(destino, 0, 'deveria continuar esperando');
    assert.equal(await emEspera('DL-9'), 2);
    assert.equal(await orders.findByExternalNumber('delta', 'DL-9'), null);
  });

  it('falha no meio do grupo desfaz o grupo inteiro', async () => {
    await gravar(
      orders,
      pedido({ clientId: 'delta', externalNumber: 'DL-10' }),
    );
    const grupo = [
      orfao('DL-10', { externalLine: 21, material: 'OK' }),
      // `CHECK` do banco recusa fator zero: falha depois da primeira linha.
      orfao('DL-10', { externalLine: 22, conversionFactor: '0.000000' }),
    ];
    await assert.rejects(() => avulsos('delta', 'DL-10', grupo), /.*/);
    const salvo = await orders.findByExternalNumber('delta', 'DL-10');
    assert.equal(
      salvo?.items.length,
      1,
      'a primeira linha do grupo ficou confirmada apesar da falha',
    );
  });

  it('duas cargas simultâneas não consomem o staging uma da outra', async () => {
    // R12-02: sem identidade de carga, a primeira a pegar o lock levava as
    // duas e os dois relatórios mentiam.
    await gravar(
      orders,
      pedido({ clientId: 'delta', externalNumber: 'DL-11' }),
    );
    const cargaA = randomUUID();
    const cargaB = randomUUID();
    await orders.stageLooseItems('delta', cargaA, [
      orfao('DL-11', { externalLine: 21, material: 'DE-A' }),
    ]);
    await orders.stageLooseItems('delta', cargaB, [
      orfao('DL-11', { externalLine: 22, material: 'DE-B' }),
    ]);

    const aplicadosPorA = await orders.consolidateStaged(
      'delta',
      cargaA,
      'DL-11',
    );
    const aplicadosPorB = await orders.consolidateStaged(
      'delta',
      cargaB,
      'DL-11',
    );
    assert.equal(aplicadosPorA, 1, 'A tomou crédito pelo item de B');
    assert.equal(aplicadosPorB, 1, 'B não encontrou o próprio item');

    const salvo = await orders.findByExternalNumber('delta', 'DL-11');
    assert.deepEqual(
      salvo?.items.map((i) => i.material).sort(),
      ['DE-A', 'DE-B', 'MAT-1001'],
      'um dos itens se perdeu',
    );
    assert.equal(await emEspera('DL-11'), 0);
  });

  it('a reconciliação pelo cabeçalho leva a espera de qualquer carga', async () => {
    // O oposto da consolidação: quando o cabeçalho chega, tudo o que esperava
    // entra, venha de que carga vier. É a promessa do ADR-008.
    await orders.stageLooseItems('delta', randomUUID(), [
      orfao('DL-12', { externalLine: 10, material: 'DE-1' }),
    ]);
    await orders.stageLooseItems('delta', randomUUID(), [
      orfao('DL-12', { externalLine: 20, material: 'DE-2' }),
    ]);
    const salvo = await gravar(
      orders,
      pedido({ clientId: 'delta', externalNumber: 'DL-12', items: null }),
    );
    assert.equal(
      salvo.items.length,
      2,
      'a reconciliação deixou item para trás',
    );
    assert.equal(await emEspera('DL-12'), 0);
  });

  it('consolidação acima do teto de itens recusa em vez de gravar', async () => {
    // R12-01: o teto é do agregado. Validar item a item não o confere, e o
    // caminho item-only montava um retrato acima do limite.
    await gravar(
      orders,
      pedido({ clientId: 'delta', externalNumber: 'DL-13' }),
    );
    const carga = randomUUID();
    const grupo = Array.from({ length: maxItemsPerOrder }, (_, i) =>
      orfao('DL-13', { externalLine: i + 100, material: `X-${String(i)}` }),
    );
    await orders.stageLooseItems('delta', carga, grupo);

    await assert.rejects(
      () => orders.consolidateStaged('delta', carga, 'DL-13'),
      /itens|teto|máximo|too/i,
    );
    const salvo = await orders.findByExternalNumber('delta', 'DL-13');
    assert.equal(salvo?.items.length, 1, 'gravou um pedido acima do teto');
  });

  it('duas aplicações concorrentes no mesmo pedido não perdem uma delas', async () => {
    // R09-06: a leitura acontecia fora do lock, então as duas liam o mesmo
    // retrato e a segunda gravação apagava a linha da primeira.
    await gravar(orders, pedido({ clientId: 'delta', externalNumber: 'DL-7' }));

    await Promise.all([
      avulsos('delta', 'DL-7', [
        orfao('DL-7', { externalLine: 21, material: 'CONC-A' }),
      ]),
      avulsos('delta', 'DL-7', [
        orfao('DL-7', { externalLine: 22, material: 'CONC-B' }),
      ]),
    ]);

    const salvo = await orders.findByExternalNumber('delta', 'DL-7');
    const materiais = salvo?.items.map((i) => i.material).sort();
    assert.deepEqual(
      materiais,
      ['CONC-A', 'CONC-B', 'MAT-1001'],
      'uma das aplicações concorrentes foi perdida',
    );
  });
});
