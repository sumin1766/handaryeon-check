import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { strict as assert } from 'node:assert';
// Existing suites mock the same framework modules. Isolate authorization mocks so they cannot affect any other feature.
test('guide authorization and limits in isolated mock runtime', () => {
  const result = spawnSync('bun', ['test', new URL('./guide-functions.checks.ts', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
