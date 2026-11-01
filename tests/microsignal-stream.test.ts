import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoState, demoReducer, STREAM_SIZE } from '../src/lib/microSignals/demo-state.ts';
import { buildCohortAnalysis } from '../src/lib/microSignals/engine.ts';

test('synthetic stream adds a new lab without mutating the original 50 dossiers', () => {
  const baseline=makeDemoState();
  const before=buildCohortAnalysis(baseline.patients);
  const next=demoReducer(baseline,{type:'tick'});
  assert.equal(next.cursor,1);
  assert.equal(next.history.length,1);
  assert.equal(next.patients.length,50);
  assert.equal(baseline.cursor,0);
  assert.equal(baseline.history.length,0);
  const after=buildCohortAnalysis(next.patients);
  assert.equal(after.cohortSize,before.cohortSize);
  assert.notEqual(after.patientAlerts.length,before.patientAlerts.length);
});

test('the stream has a finite number of simulated observations and can be reset', () => {
  let current=makeDemoState();
  for(let i=0;i<STREAM_SIZE+2;i++) current=demoReducer(current,{type:'tick'});
  assert.equal(current.cursor,STREAM_SIZE);
  assert.equal(current.history.length,STREAM_SIZE);
  const state=demoReducer(current,{type:'reset'});
  assert.deepEqual(state,makeDemoState());
});
