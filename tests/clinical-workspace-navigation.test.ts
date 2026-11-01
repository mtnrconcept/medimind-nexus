import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNavigation, getRouteInfo, isNavigationActive } from '../src/components/layout/navigation.ts';

test('clinical workspace exposes a short, ordered navigation for physicians', () => {
  const groups = buildNavigation('doctor');
  assert.equal(groups[0].label, 'Espace clinique');
  assert.deepEqual(groups[0].items.map((item) => item.path), [
    '/dashboard', '/patients', '/pathologies', '/cross-data-analysis', '/search',
  ]);
  const links = groups.flatMap((group) => group.items);
  assert.equal(new Set(links.map((item) => item.path)).size, links.length);
  assert.equal(links.some((item) => item.path === '/admin'), false);
  assert.equal(links.some((item) => item.path === '/populate-data'), false);
  assert.equal(links.some((item) => item.path === '/research/microsignals'), false);
});

test('only verified admins see administrative links and synthetic research lab', () => {
  const visitorPaths = buildNavigation(null).flatMap((g) => g.items.map((i) => i.path));
  const researcherPaths = buildNavigation('researcher').flatMap((g) => g.items.map((i) => i.path));
  const adminPaths = buildNavigation('admin').flatMap((g) => g.items.map((i) => i.path));
  assert.equal(visitorPaths.includes('/admin'), false);
  assert.equal(researcherPaths.includes('/populate-data'), false);
  assert.ok(adminPaths.includes('/admin'));
  assert.ok(adminPaths.includes('/populate-data'));
  assert.ok(adminPaths.includes('/research/microsignals'));
});

test('patient and pathology details keep their parent navigation selected', () => {
  assert.equal(isNavigationActive('/patients', '/patients/3f56657b'), true);
  assert.equal(isNavigationActive('/pathologies', '/pathologies/some-id'), true);
  assert.equal(isNavigationActive('/patients', '/pathologies/some-id'), false);
  assert.equal(isNavigationActive('/dashboard', '/dashboard-extra'), false);
  assert.equal(getRouteInfo('/patients/some-patient')?.title, 'Dossier patient');
  assert.equal(getRouteInfo('/pathologies/23')?.parentPath, '/pathologies');
  assert.equal(getRouteInfo('/continuous-discovery')?.section, 'Recherche');
  assert.equal(getRouteInfo('/unknown')?.title, 'MediCore');
});

test('each navigation destination has a clear label and a valid route path', () => {
  const routes = buildNavigation('admin').flatMap((group) => group.items);
  assert.ok(routes.length >= 10);
  for (const item of routes) {
    assert.ok(item.label.length >= 4, item.path);
    assert.ok(item.path.startsWith('/'), item.path);
    assert.ok(getRouteInfo(item.path)?.title, item.path);
  }
});
