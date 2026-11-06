import test from 'node:test';
import assert from 'node:assert/strict';
import { closeSync, openSync, readSync } from 'node:fs';
import {
  createAtlasClickGuard,
  getMeshAlertSelection,
  isAtlasObjectVisible,
  type AtlasPointerEvent,
} from '../src/lib/anatomicalTwinInteractions.ts';

const pointer = (overrides: Partial<AtlasPointerEvent> = {}): AtlasPointerEvent => ({
  pointerId: 1,
  clientX: 100,
  clientY: 100,
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...overrides,
});

test('mesh selection preserves all applicable alert details and excludes informational or unrelated alerts', () => {
  const warning = { id: 'renal-warning', organ: 'kidney', level: 'WARNING', description: 'Existing measured value', action: 'Existing action' };
  const critical = { id: 'renal-critical', organ: 'Reins', level: 'CRITICAL', description: 'Existing clinical reason' };
  const alerts = [warning, critical, { id: 'info', organ: 'kidneys', level: 'INFO' }, { id: 'heart', organ: 'heart', level: 'CRITICAL' }];
  const result = getMeshAlertSelection('FJ1 left kidney', 'urinaire', alerts);
  assert.deepEqual(result?.alerts, [warning, critical]);
  assert.equal(result?.alerts[0], warning);
  assert.equal(result?.alerts[1], critical);
  assert.ok(result?.label);
});

test('cardiac system matching remains available without borrowing alerts from other systems', () => {
  const alert = { organ: 'Cœur', level: 'CRITICAL' };
  assert.deepEqual(getMeshAlertSelection('wall of ventricle', 'coeur', [alert])?.alerts, [alert]);
  assert.equal(getMeshAlertSelection('fourth ventricle', 'nerveux', [alert]), null);
  assert.equal(getMeshAlertSelection('heartland', 'muscles', [alert]), null);
});

test('real atlas bones accept exact French, English and anatomy IDs without changing laterality', () => {
  // Read only the GLB JSON chunk, not the 49 MB geometry payload.
  const fd = openSync(new URL('../public/models/MediCore-Atlas3D-web.glb', import.meta.url), 'r');
  let meshNames: Set<string>;
  try {
    const header = Buffer.alloc(20);
    readSync(fd, header, 0, header.length, 0);
    const jsonBytes = Buffer.alloc(header.readUInt32LE(12));
    readSync(fd, jsonBytes, 0, jsonBytes.length, 20);
    const atlas = JSON.parse(jsonBytes.toString()) as { nodes: { name?: string; mesh?: number }[] };
    meshNames = new Set(atlas.nodes.filter(node => node.mesh !== undefined).map(node => node.name || ''));
  } finally {
    closeSync(fd);
  }
  assert.ok(meshNames.has('FJ3259 left femur'));
  assert.ok(meshNames.has('FJ3365 right femur'));
  const leftAlerts = ['Fémur gauche', 'femur_left', 'Left femur'].map(organ => ({ organ, level: 'WARNING' }));
  const right = { organ: 'femur_right', level: 'CRITICAL' };
  const vague = { organ: 'femur', level: 'CRITICAL' };
  const clinicalText = { organ: 'fracture du fémur gauche', level: 'CRITICAL' };
  const alerts = [...leftAlerts, right, vague, clinicalText];
  assert.deepEqual(getMeshAlertSelection('FJ3259 left femur', 'os', alerts), { label: 'Fémur gauche', alerts: leftAlerts });
  assert.deepEqual(getMeshAlertSelection('FJ3365 right femur', 'os', alerts)?.alerts, [right]);
});

test('exact atlas codes distinguish structures even when their display names are identical', () => {
  const code = { organ: 'FJ3259', level: 'WARNING' };
  const fullName = { organ: 'FJ3259 left femur', level: 'CRITICAL' };
  const alerts = [code, fullName];
  assert.deepEqual(getMeshAlertSelection('FJ3259 left femur', 'os', alerts)?.alerts, alerts);
  assert.equal(getMeshAlertSelection('FJ6370 left femur', 'os', alerts), null);
  assert.equal(getMeshAlertSelection('FJ3365 right femur', 'os', alerts), null);
});

test('exact other structures match themselves but do not inherit a nearby organ alert', () => {
  const renal = { organ: 'kidneys', level: 'CRITICAL' };
  const artery = { organ: 'anterior division of left renal artery', level: 'WARNING' };
  const vague = { organ: 'renal artery', level: 'CRITICAL' };
  const name = 'FJ3458 anterior division of left renal artery';
  assert.equal(getMeshAlertSelection(name, 'arteres', [renal, vague]), null);
  assert.deepEqual(getMeshAlertSelection(name, 'arteres', [renal, artery, vague])?.alerts, [artery]);
});

test('absent, informational and unlocalized prose do not create a selectable alert', () => {
  const alerts = [
    { organ: 'other', level: 'CRITICAL' },
    { level: 'CRITICAL' },
    { organ: 'brain tumor', level: 'CRITICAL' },
    { organ: 'brain', level: 'INFO' },
  ];
  assert.equal(getMeshAlertSelection('FJ1 brain', 'nerveux', alerts), null);
  assert.equal(getMeshAlertSelection('FJ1 brain', 'nerveux', []), null);
  assert.equal(getMeshAlertSelection('', undefined, [{ organ: '', level: 'CRITICAL' }]), null);
});

test('visibility checks all ancestors because invisible atlas layers remain raycastable', () => {
  const scene = { visible: true, parent: null };
  const layer = { visible: true, parent: scene };
  const mesh = { visible: true, parent: layer };
  assert.equal(isAtlasObjectVisible(mesh), true);
  layer.visible = false;
  assert.equal(isAtlasObjectVisible(mesh), false);
  layer.visible = true;
  scene.visible = false;
  assert.equal(isAtlasObjectVisible(mesh), false);
  scene.visible = true;
  mesh.visible = false;
  assert.equal(isAtlasObjectVisible(mesh), false);
});

test('a primary click accepts a MouseEvent shape without pointerId and can only be consumed once', () => {
  const guard = createAtlasClickGuard();
  const { pointerId: _pointerId, ...click } = pointer();
  assert.equal(guard.consumeClick(click), false);
  guard.pointerDown(pointer());
  guard.pointerUp(pointer());
  assert.equal(guard.consumeClick(click), true);
  assert.equal(guard.consumeClick(click), false);
});

test('small pointer jitter remains a click but movement beyond four pixels becomes a drag', () => {
  const guard = createAtlasClickGuard();
  guard.pointerDown(pointer());
  guard.pointerMove(pointer({ clientX: 102, clientY: 102, button: -1 }));
  guard.pointerUp(pointer({ clientX: 102, clientY: 102 }));
  assert.equal(guard.consumeClick(pointer({ clientX: 102, clientY: 102 })), true);
  guard.pointerDown(pointer());
  guard.pointerMove(pointer({ clientX: 104, clientY: 101, button: -1 }));
  guard.pointerUp(pointer({ clientX: 104, clientY: 101 }));
  assert.equal(guard.consumeClick(pointer({ clientX: 104, clientY: 101 })), false);
});

test('dragging out and back never opens an alert and does not poison the next real click', () => {
  const guard = createAtlasClickGuard();
  guard.pointerDown(pointer());
  guard.pointerMove(pointer({ clientX: 180, button: -1 }));
  guard.pointerMove(pointer({ clientX: 100, button: -1 }));
  guard.pointerUp(pointer());
  assert.equal(guard.consumeClick(pointer()), false);
  guard.pointerDown(pointer());
  guard.pointerUp(pointer());
  assert.equal(guard.consumeClick(pointer()), true);
});

test('Ctrl, Meta and Shift at any observed stage suppress selection even if released before the click', () => {
  for (const key of ['ctrlKey', 'metaKey', 'shiftKey'] as const) {
    for (const stage of ['down', 'move', 'up', 'click'] as const) {
      const guard = createAtlasClickGuard();
      guard.pointerDown(pointer(stage === 'down' ? { [key]: true } : {}));
      guard.pointerMove(pointer(stage === 'move' ? { [key]: true, button: -1 } : { button: -1 }));
      guard.pointerUp(pointer(stage === 'up' ? { [key]: true } : {}));
      assert.equal(guard.consumeClick(pointer(stage === 'click' ? { [key]: true } : {})), false, `${key} at ${stage}`);
    }
  }
});

test('right and middle button gestures never become a primary selection on release', () => {
  for (const button of [1, 2]) {
    const guard = createAtlasClickGuard();
    guard.pointerDown(pointer({ button }));
    guard.pointerUp(pointer({ button }));
    assert.equal(guard.consumeClick(pointer()), false);
    guard.pointerDown(pointer());
    guard.pointerUp(pointer());
    assert.equal(guard.consumeClick(pointer({ button })), false);
  }
});

test('two-pointer gestures cannot select even when either finger is released first', () => {
  for (const order of [[1, 2], [2, 1]]) {
    const guard = createAtlasClickGuard();
    guard.pointerDown(pointer());
    guard.pointerDown(pointer({ pointerId: 2 }));
    for (const pointerId of order) guard.pointerUp(pointer({ pointerId }));
    assert.equal(guard.consumeClick(pointer()), false);
    guard.pointerDown(pointer());
    guard.pointerUp(pointer());
    assert.equal(guard.consumeClick(pointer()), true);
  }
});

test('cancellation, missing release and unrelated pointers cannot leave a selectable gesture', () => {
  const guard = createAtlasClickGuard();
  guard.pointerDown(pointer());
  guard.cancel();
  guard.pointerUp(pointer());
  assert.equal(guard.consumeClick(pointer()), false);
  guard.pointerDown(pointer());
  assert.equal(guard.consumeClick(pointer()), false);
  guard.cancel();
  guard.pointerDown(pointer());
  guard.pointerUp(pointer({ pointerId: 2 }));
  assert.equal(guard.consumeClick(pointer()), false);
});

test('release and click positions are checked even if pointermove was not delivered', () => {
  const guard = createAtlasClickGuard();
  guard.pointerDown(pointer());
  guard.pointerUp(pointer({ clientY: 120 }));
  assert.equal(guard.consumeClick(pointer({ clientY: 120 })), false);
  guard.pointerDown(pointer());
  guard.pointerUp(pointer());
  assert.equal(guard.consumeClick(pointer({ clientY: 120 })), false);
});
