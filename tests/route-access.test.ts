import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveRouteAccess, preparePatientLookup, sanitizeSignupMetadata } from '../src/components/auth/access-policy.ts';

test('anonymous visitors must authenticate for protected routes', () => {
  assert.equal(resolveRouteAccess({ userId: null, loading: false, roleLoading: false, role: null }), 'login');
});

test('admin route waits until server-validated role resolves', () => {
  assert.equal(resolveRouteAccess({ userId: 'user-1', loading: false, roleLoading: true, role: null, requiredRole: 'admin' }), 'loading');
});

test('authenticated researchers and doctors cannot access admin controls', () => {
  for (const role of ['researcher', 'doctor', null] as const) {
    assert.equal(resolveRouteAccess({ userId: 'user-1', loading: false, roleLoading: false, role, requiredRole: 'admin' }), 'denied');
  }
});

test('only admin role grants the admin route', () => {
  assert.equal(resolveRouteAccess({ userId: 'user-1', loading: false, roleLoading: false, role: 'admin', requiredRole: 'admin' }), 'allowed');
});

test('patient lookup never reaches the database when a real auth session is absent', () => {
  assert.equal(preparePatientLookup(null, 'PAT-001'), null);
  assert.equal(preparePatientLookup('', 'PAT-001'), null);
});

test('patient identifier lookup trims and validates without shared PIN', () => {
  assert.equal(preparePatientLookup('user-1', '  PAT-001  '), 'PAT-001');
  assert.equal(preparePatientLookup('user-1', ''), null);
  assert.equal(preparePatientLookup('user-1', 'x'.repeat(100)), null);
});


test('signup metadata never grants a role by trusting user-controlled fields', () => {
  assert.deepEqual(
    sanitizeSignupMetadata({ first_name: '  Dr  ', last_name: '  Example  ', role: 'admin' }),
    { first_name: 'Dr', last_name: 'Example' },
  );
});
