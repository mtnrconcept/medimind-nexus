import test from 'node:test';
import assert from 'node:assert/strict';
import { isOutputLimit, outputBudget } from '../supabase/functions/cross-data-analyzer/output-budget.ts';

test('retry only incomplete responses with the provider output-limit reason', () => {
  const limit = '{"reason":"max_output_tokens"}';
  assert.equal(isOutputLimit('incomplete', limit), true);
  assert.equal(isOutputLimit('failed', limit), false);
  assert.equal(isOutputLimit('incomplete', '{"reason":"content_filter"}'), false);
  assert.equal(isOutputLimit('incomplete', 'unexpected'), false);
});

test('retry exceeds even the clinical reasoning floor and preserves initial budgets', () => {
  for (const initial of [6000, 8000]) {
    assert.equal(outputBudget(initial, false), initial);
    assert.ok(outputBudget(initial, true) > 25_000);
  }
});
