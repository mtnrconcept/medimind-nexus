import assert from 'node:assert/strict';
import test from 'node:test';
import { createOwnerBoundGraphInvoke } from '../src/lib/graphResearchSession.ts';

test('a graph request cannot start under another owner after the owner reference was captured', async () => {
  let calls = 0;
  const bound = createOwnerBoundGraphInvoke('A', {
    async getSession() { return { user: { id: 'B' }, access_token: 'token-B' }; },
    async invoke() { calls++; return { data: {}, error: null }; },
  });
  await assert.rejects(bound.invokeAI('deep-research-graph', { topic: 'Synthetic' }), { status: 401 });
  assert.equal(calls, 0);
});

test('the verified token stays bound to its owner if the account switches during dispatch, and the old result is rejected', async () => {
  let owner = 'A';
  let suppliedToken = '';
  const bound = createOwnerBoundGraphInvoke('A', {
    async getSession() { return { user: { id: owner }, access_token: 'token-' + owner }; },
    async invoke(_name, _body, headers) {
      owner = 'B';
      suppliedToken = headers.Authorization;
      return { data: { owner: 'A' }, error: null };
    },
  });
  await assert.rejects(bound.invokeAI('deep-research-graph', { topic: 'Synthetic' }), { status: 401 });
  assert.equal(suppliedToken, 'Bearer token-A');
});

test('long-running graph observations use the current refreshed token only for the same owner', async () => {
  let token = 'first';
  const headers: string[] = [];
  const bound = createOwnerBoundGraphInvoke('A', {
    async getSession() { return { user: { id: 'A' }, access_token: token }; },
    async invoke(_name, _body, supplied) { headers.push(supplied.Authorization); return { data: {}, error: null }; },
  });
  await bound.invokeAI('deep-research-graph', { action: 'status' });
  token = 'refreshed';
  await bound.invokeAI('deep-research-graph', { action: 'status' });
  assert.deepEqual(headers, ['Bearer first', 'Bearer refreshed']);
  await assert.rejects(bound.assertOwner('B'), { status: 401 });
});
