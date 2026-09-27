import assert from 'node:assert/strict';
import test from 'node:test';

import { Decimal, currencyScale } from '../src/domain/decimal.js';

test('lê e devolve o texto decimal preservando a escala', () => {
  assert.equal(Decimal.parse('1200.000').toText(), '1200.000');
  assert.equal(Decimal.parse('6,49'.replace(',', '.')).toText(), '6.49');
  assert.equal(Decimal.parse('0').toText(), '0');
  assert.equal(Decimal.parse('-0.10').toText(), '-0.10');
  assert.equal(Decimal.parse('+45.9').toText(), '45.9');
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

test('multiplica de forma exata, somando as escalas', () => {
  assert.equal(
    Decimal.parse('60').multiply(Decimal.parse('45.9')).toText(),
    '2754.0',
  );
  assert.equal(
    Decimal.parse('1200.000').multiply(Decimal.parse('6.49')).toText(),
    '7788.00000',
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
