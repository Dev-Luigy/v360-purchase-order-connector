import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CheckReadiness } from '../src/application/use-cases/check-readiness.js';
import { buildApp } from '../src/presentation/http/app.js';
for (const available of [true, false]) {
  test(`health stays live and readiness reflects database availability: ${available}`, async (t) => {
    const app = buildApp({
      logLevel: 'silent',
      readiness: new CheckReadiness({
        async ping() {
          if (!available) throw new Error('Database offline');
        },
      }),
    });
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
