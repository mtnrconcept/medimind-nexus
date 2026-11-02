import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANATOMICAL_VIEWS, ATLAS_LAYERS, meshOrgan, locateAlert, groupLocalizedAlerts } from '../src/lib/anatomicalTwin.ts';

test('both renal identifiers localize to the same bilateral zone', () => {
  assert.deepEqual(locateAlert('kidney'), locateAlert('kidneys'));
  assert.equal(locateAlert('Reins')?.id, 'kidneys');
  assert.equal(locateAlert(' CŒUR ')?.id, 'heart');
});

test('unknown and absent organs stay unlocalized instead of inventing a location', () => {
  assert.equal(locateAlert('other'), undefined);
  assert.equal(locateAlert(), undefined);
  assert.equal(locateAlert('brain tumor'), undefined);
});

test('several renal alerts share a region and preserve their evidence and severity', () => {
  const alerts = [{ id: 'a', organ: 'kidney', level: 'WARNING' }, { id: 'b', organ: 'kidneys', level: 'CRITICAL' }, { id: 'c', level: 'INFO' }];
  const groups = groupLocalizedAlerts(alerts);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].region.id, 'kidneys');
  assert.equal(groups[0].critical, true);
  assert.deepEqual(groups[0].alerts, alerts.slice(0, 2));
  assert.equal(groupLocalizedAlerts([{ organ: 'heart', level: 'INFO' }])[0].critical, false);
});

test('all four view URLs point to independent real PNGs with a matching canvas', () => {
  assert.equal(new Set(ANATOMICAL_VIEWS.map(view => view.src)).size, 4);
  for (const view of ANATOMICAL_VIEWS) {
    const png = readFileSync(new URL(`../public${view.src}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1254);
    assert.equal(png.readUInt32BE(20), 1254);
  }
});

test('web atlas preserves all 3210 meshes and 19 independently selectable systems', () => {
  const bytes = readFileSync(new URL('../public/models/MediCore-Atlas3D-web.glb', import.meta.url));
  assert.equal(bytes.subarray(0, 4).toString(), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const data = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  assert.equal(data.meshes.length, 3210);
  const groups = data.scenes[0].nodes.map((index: number) => data.nodes[index].name);
  assert.deepEqual(groups.sort(), ATLAS_LAYERS.map(([id]) => id).sort());
  assert.ok(data.extensionsRequired.includes('EXT_meshopt_compression'));
  assert.match(data.asset.copyright, /Attribution 4.0/);
  for (const organ of ['heart', 'kidneys', 'lungs', 'pancreas', 'stomach']) {
    assert.ok(data.nodes.some((node: { name?: string; mesh?: number }) => node.mesh !== undefined && meshOrgan(node.name || '') === organ), `real mesh for ${organ}`);
  }
});

test('atlas name matching never confuses renal arteries and cardiac vessels with organ surfaces', () => {
  assert.equal(meshOrgan('FJ1_left_kidney'), 'kidneys');
  assert.equal(meshOrgan('FJ2_right_lung'), 'lungs');
  assert.equal(meshOrgan('left renal artery'), undefined);
  assert.equal(meshOrgan('heartland'), undefined);
  assert.equal(meshOrgan('fourth ventricle', 'nerveux'), undefined);
  assert.equal(meshOrgan('wall of ventricle', 'coeur'), 'heart');
  assert.equal(meshOrgan('left duct of caudate lobe of liver'), undefined);
});
