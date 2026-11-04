import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_AI_OUTPUT_TOKENS,
  MAX_DIRECT_AI_TIMEOUT_MS,
  resolveAIOutputTokens,
  resolveDirectAITimeout,
} from '../supabase/functions/_shared/ai-policy.ts';

test('invalid or fractional token settings cannot undercut the reasoning budget or exceed the provider cap', () => {
  for (const value of [undefined, NaN, Infinity, -Infinity, -1, 0, 1]) {
    assert.equal(resolveAIOutputTokens({ maxTokens: value, reasoningEffort: 'high' }), 32_768);
  }
  assert.equal(resolveAIOutputTokens({ maxTokens: 80_000.9 }), 80_000);
  assert.equal(resolveAIOutputTokens({ maxTokens: 200_000 }), MAX_AI_OUTPUT_TOKENS);
});

test('foreground timeouts accept deliberate shorter settings but stay below the Edge idle limit', () => {
  assert.equal(resolveDirectAITimeout(), 120_000);
  assert.equal(resolveDirectAITimeout(undefined, '110000'), 110_000);
  assert.equal(resolveDirectAITimeout(45_000, '90000'), 45_000);
  assert.equal(resolveDirectAITimeout(600_000), MAX_DIRECT_AI_TIMEOUT_MS);
  for (const configured of ['', 'NaN', 'Infinity', '-1', '0']) {
    assert.equal(resolveDirectAITimeout(undefined, configured), MAX_DIRECT_AI_TIMEOUT_MS);
  }
});
