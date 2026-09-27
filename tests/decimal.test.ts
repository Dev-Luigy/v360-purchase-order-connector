import assert from 'node:assert/strict';
import test from 'node:test';

import { Decimal, currencyScale } from '../src/domain/decimal.js';

test('lê e devolve o texto decimal, nunca em notação exponencial', () => {
  assert.equal(Decimal.parse('6.49').toText(), '6.49');
  assert.equal(Decimal.parse('0').toText(), '0');
  assert.equal(Decimal.parse('-0.10').toText(), '-0.1');
  assert.equal(Decimal.parse('+45.9').toText(), '45.9');
  // decimal.js devolveria '1e-8' e '1e+21' por toString; o contrato não aceita.
  assert.equal(Decimal.parse('0.00000001').toText(), '0.00000001');
  assert.equal(Decimal.parse('1e21').toText(), '1000000000000000000000');
});

test('escala pedida é respeitada; sem escala, a mínima que representa o valor', () => {
  assert.equal(Decimal.parse('1200.000').toText(), '1200');
  assert.equal(Decimal.parse('1200.000').toText(6), '1200.000000');
  assert.equal(Decimal.parse('45.9').toText(2), '45.90');
  assert.equal(Decimal.parse('0.000001').decimalPlaces, 6);
});

test('recusa o que decimal.js aceitaria calado e viraria outro número', () => {
  // Verificado contra decimal.js 10.6: sem esta guarda, '0x10' vira 16 e
  // '1_000' vira 1000. Campo corrompido tem que virar rejeição, não número.
  for (const invalid of [
    '0x10',
    '0b101',
    '1_000',
    'NaN',
    'Infinity',
    '-Infinity',
  ]) {
    assert.throws(() => Decimal.parse(invalid), RangeError, invalid);
  }
});

test('soma, subtração e multiplicação lançam em vez de arredondar em silêncio', () => {
  // A entrada agora para na porta com 24 dígitos inteiros, então o estouro da
  // guarda aritmética só se alcança encadeando operações sobre resultados.
  const maximo = Decimal.parse('9'.repeat(24));
  // decimal.js devolveria o produto com a cauda zerada, sem avisar.
  assert.throws(() => {
    let acumulado = maximo;
    for (let vez = 0; vez < 5; vez += 1) acumulado = acumulado.multiply(maximo);
  }, /arredondado em silêncio/);
  // Soma estoura quando a grandeza de um lado e a profundidade do outro não
  // cabem juntas: 96 dígitos inteiros mais 24 casas decimais passam de 120.
  const grande = maximo.multiply(maximo).multiply(maximo).multiply(maximo);
  const fundo = Decimal.parse('0.000000000001').multiply(
    Decimal.parse('0.000000000001'),
  );
  assert.throws(() => grande.add(fundo), /arredondado em silêncio/);
  // E o que cabe, passa exato.
  assert.equal(
    Decimal.parse('123456789012345')
      .multiply(Decimal.parse('1000000.000001'))
      .toText(),
    '123456789012468456789.012345',
  );
});

test('aceita notação exponencial, que JSON.parse produz para números pequenos', () => {
  assert.equal(Decimal.parse('1e3').toText(), '1000');
  assert.equal(Decimal.parse('1.5E-3').toText(), '0.0015');
});

test('recusa notação do cliente: vírgula, milhar e espaço são do adaptador', () => {
  for (const invalid of ['1.200,000', '1 200', '', 'abc', '45.', '.9', '1,5']) {
    assert.throws(() => Decimal.parse(invalid), RangeError, invalid);
  }
});

test('soma e subtrai alinhando escalas diferentes', () => {
  assert.equal(
    Decimal.parse('100').subtract(Decimal.parse('60.000')).toText(),
    '40',
  );
  assert.equal(
    Decimal.parse('100').subtract(Decimal.parse('60.000')).toText(3),
    '40.000',
  );
  assert.equal(Decimal.parse('0.1').add(Decimal.parse('0.2')).toText(), '0.3');
});

test('0.1 + 0.2 é exatamente 0.3, que é o ponto de não usar float', () => {
  assert.equal(0.1 + 0.2 === 0.3, false);
  assert.equal(
    Decimal.parse('0.1').add(Decimal.parse('0.2')).equals(Decimal.parse('0.3')),
    true,
  );
});

test('multiplica de forma exata', () => {
  assert.equal(
    Decimal.parse('60').multiply(Decimal.parse('45.9')).toText(),
    '2754',
  );
  assert.equal(
    Decimal.parse('1200.000').multiply(Decimal.parse('6.49')).toText(),
    '7788',
  );
  assert.equal(
    Decimal.parse('0.1').multiply(Decimal.parse('0.2')).toText(),
    '0.02',
  );
});

test('arredonda meio para cima, afastando-se do zero', () => {
  assert.equal(Decimal.parse('2.345').toText(2), '2.35');
  assert.equal(Decimal.parse('2.344').toText(2), '2.34');
  assert.equal(Decimal.parse('-2.345').toText(2), '-2.35');
  // Bancário devolveria 2.34 aqui; ADR-007 escolheu acompanhar a nota fiscal.
  assert.equal(Decimal.parse('2.355').toText(2), '2.36');
});

test('divide arredondando só na escala pedida', () => {
  assert.equal(
    Decimal.parse('100.00').divide(Decimal.parse('3'), 2).toText(),
    '33.33',
  );
  assert.equal(
    Decimal.parse('10000').divide(Decimal.parse('3'), 6).toText(),
    '3333.333333',
  );
  assert.throws(() => Decimal.parse('1').divide(Decimal.zero, 2), RangeError);
});

test('compara sem depender da escala escrita', () => {
  assert.equal(Decimal.parse('1.0').compare(Decimal.parse('1.000')), 0);
  assert.equal(Decimal.parse('1.01').compare(Decimal.parse('1.001')), 1);
  assert.equal(Decimal.parse('0.9').compare(Decimal.parse('1')), -1);
});

test('conhece a escala das moedas que o serviço vê, com dois como padrão', () => {
  assert.equal(currencyScale('BRL'), 2);
  assert.equal(currencyScale('XYZ'), 2);
});
