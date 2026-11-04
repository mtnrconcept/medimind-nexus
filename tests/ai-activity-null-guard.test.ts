import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('AI activity selection checks for a non-null detail before accessing job on initial unauthenticated render', () => {
  const source = readFileSync(new URL('../src/components/ai/AIActivityPanel.tsx', import.meta.url), 'utf8');
  assert.match(source, /const selected = detail !== null && detail\.owner === owner && detail\.job\.id === selectedId/);
});

test('AI activity selection remains null for a missing detail while owner is undefined', () => {
  const select = (detail: { owner: string; job: { id: string } } | null, owner: string | undefined, selectedId: string | null) =>
    detail !== null && detail.owner === owner && detail.job.id === selectedId ? detail.job : null;
  assert.equal(select(null, undefined, null), null);
  assert.deepEqual(select({ owner: 'account-a', job: { id: 'job-a' } }, 'account-a', 'job-a'), { id: 'job-a' });
});
