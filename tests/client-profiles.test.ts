import assert from 'node:assert/strict';
import test from 'node:test';

import type { ClientProfile } from '../src/domain/client.js';
import {
  InMemoryClientProfiles,
  ProfileError,
  alfaProfile,
  assertValidProfile,
  betaProfile,
  configuredProfiles,
} from '../src/infrastructure/integrations/client-profiles.js';

function broken(
  changes: (profile: ClientProfile) => ClientProfile,
): ClientProfile {
  return changes(structuredClone(alfaProfile));
}

test('os perfis configurados são válidos', () => {
  for (const profile of configuredProfiles) {
    assert.doesNotThrow(() => assertValidProfile(profile), profile.clientId);
  }
  assert.deepEqual(
    configuredProfiles.map((profile) => profile.clientId),
    ['alfa', 'beta', 'beta-erp', 'gama', 'delta'],
    'os quatro do enunciado, mais a variante de encoding do Beta',
  );
});

test('a porta devolve o perfil por cliente e nada para desconhecido', async () => {
  const profiles = new InMemoryClientProfiles();
  assert.equal((await profiles.find('beta'))?.deliveryFormat, 'paired-csv');
  assert.equal((await profiles.find('gama'))?.deliveryFormat, 'flat-json');
  assert.equal((await profiles.find('delta'))?.deliveryFormat, 'split-json');
  assert.equal(await profiles.find('omega'), null);
  assert.equal((await profiles.list()).length, 5);
});

test('identificador repetido é recusado na construção', () => {
  assert.throws(
    () => new InMemoryClientProfiles([alfaProfile, alfaProfile]),
    ProfileError,
  );
});

test('termo de situação fora da forma normalizada nunca seria encontrado', () => {
  // 'Em Aberto' jamais casaria com a chave normalizada da busca, e a carga
  // inteira do cliente seria rejeitada por situação desconhecida.
  assert.throws(
    () =>
      assertValidProfile(
        broken((profile) => ({
          ...profile,
          statusVocabulary: { 'Em Aberto': 'aberto' },
        })),
      ),
    /normalizado/,
  );
});

test('vocabulário vazio é recusado', () => {
  assert.throws(
    () =>
      assertValidProfile(
        broken((profile) => ({ ...profile, statusVocabulary: {} })),
      ),
    /vazio/,
  );
});

test('a seção csv existe exatamente nas formas delimitadas', () => {
  assert.throws(
    () =>
      assertValidProfile(
        broken((profile) => ({
          ...profile,
          csv: { delimiter: ';', encoding: 'utf-8' },
        })),
      ),
    /seção csv/,
  );
  assert.throws(
    () => assertValidProfile({ ...structuredClone(betaProfile), csv: null }),
    /seção csv/,
  );
});

test('entrega em duas partes sem o campo de ligação é recusada', () => {
  assert.throws(
    () =>
      assertValidProfile({
        ...structuredClone(betaProfile),
        fields: {
          ...betaProfile.fields,
          item: { ...betaProfile.fields.item, orderNumber: null },
        },
      }),
    /liga o item ao pedido/,
  );
});

test('itens aninhados sem itemsArray são recusados', () => {
  assert.throws(
    () =>
      assertValidProfile(
        broken((profile) => ({
          ...profile,
          fields: { ...profile.fields, itemsArray: null },
        })),
      ),
    /itemsArray/,
  );
});

test('moeda assumida fora da allowlist é recusada', () => {
  // Não basta ter a forma de ISO 4217: sem escala declarada, a conferência
  // arredondaria por omissão (REVIEW-07, R07-08).
  for (const invalida of ['real', 'ZZZ']) {
    assert.throws(
      () =>
        assertValidProfile(
          broken((profile) => ({ ...profile, assumedCurrency: invalida })),
        ),
      /não suportada/,
      invalida,
    );
  }
  assert.doesNotThrow(() =>
    assertValidProfile(
      broken((profile) => ({ ...profile, assumedCurrency: 'USD' })),
    ),
  );
});

test('o erro nomeia o cliente e o caminho do campo', () => {
  try {
    assertValidProfile(
      broken((profile) => ({ ...profile, formatVersion: '' })),
    );
    assert.fail('deveria ter lançado');
  } catch (error) {
    assert.ok(error instanceof ProfileError);
    assert.match(error.message, /perfil do cliente alfa/);
    assert.match(error.message, /formatVersion/);
  }
});
