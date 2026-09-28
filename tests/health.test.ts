import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildTestApp } from './support/build-test-app.js';

for (const available of [true, false]) {
  test(`health continua vivo e readiness reflete o banco: ${String(available)}`, async (t) => {
    const { app } = await buildTestApp({ databaseAvailable: available });
    t.after(() => app.close());

    const health = await app.inject('/health');
    assert.equal(health.statusCode, 200);

    const ready = await app.inject('/ready');
    assert.equal(ready.statusCode, available ? 200 : 503);
    assert.deepEqual(ready.json(), {
      status: available ? 'ready' : 'unavailable',
    });
  });
}
