import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roleAfterRefresh, userAfterSessionEvent } from '../src/lib/authContinuity.ts';

test('a transient role refresh outage preserves a validated session without granting an initial role', () => {
  const known = { role: 'admin', validated: true } as const;
  const offline = new Error('TypeError: Failed to fetch');
  assert.equal(roleAfterRefresh(known, null, offline), known);
  assert.deepEqual(roleAfterRefresh({ role: null, validated: false }, 'admin', offline), { role: null, validated: false });
});

test('authoritative revocation and permission errors clear a previous role', () => {
  const known = { role: 'admin', validated: true } as const;
  assert.deepEqual(roleAfterRefresh(known, null), { role: null, validated: true });
  assert.deepEqual(roleAfterRefresh(known, null, { status: 403, message: 'Forbidden' }), { role: null, validated: false });
});

test('same-account auth events preserve identity while profile changes and account switches remain visible', () => {
  const first = { id: 'owner-a', name: 'First' };
  const updated = { id: 'owner-a', name: 'Updated' };
  assert.equal(userAfterSessionEvent(first, updated, 'SIGNED_IN'), first);
  assert.equal(userAfterSessionEvent(first, updated, 'TOKEN_REFRESHED'), first);
  assert.equal(userAfterSessionEvent(first, updated, 'USER_UPDATED'), updated);
  const other = { id: 'owner-b', name: 'Other' };
  assert.equal(userAfterSessionEvent(first, other, 'SIGNED_IN'), other);
  assert.equal(userAfterSessionEvent(first, null, 'SIGNED_OUT'), null);
});
