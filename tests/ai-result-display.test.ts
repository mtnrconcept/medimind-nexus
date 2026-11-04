import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIEventReplay, describeAIResult, describeSystematicRun, type SystematicRunResult } from '../src/lib/aiResultDisplay.ts';

test('saved SSE combines content in order and keeps structured outcomes separate from progress', () => {
  const result = describeAIResult({
    httpStatus: 200, contentType: 'text/event-stream; charset=utf-8',
    body: [
      'data: {"type":"step_update","label":"Searching"}\r\n\r\n',
      'data: {"choices":[{"delta":{"content":"Résultat "}}]}\n\n',
      'data: {"type":"text","content":"terminé."}\n\n',
      'event: finding\ndata: {"type":"finding",\ndata: "confidence":0.7}\n\n',
      'data: [DONE]\n\n',
    ].join(''),
  });
  assert.equal(result.text, 'Résultat terminé.');
  assert.deepEqual(result.structured, [{ type: 'finding', confidence: 0.7 }]);
});

test('saved native JSON retains the complete outcome alongside readable synthesis text', () => {
  const outcome = { global_synthesis: 'Synthèse disponible.', findings: [{ evidence: 'unavailable' }] };
  const result = describeAIResult({ httpStatus: 200, contentType: 'application/json', body: JSON.stringify(outcome) });
  assert.equal(result.text, outcome.global_synthesis);
  assert.deepEqual(result.structured, [outcome]);
});

test('incomplete output remains available for inspection and is never converted to a successful finding', () => {
  const partial = 'data: {"type":"finding","text":"incomplete';
  assert.deepEqual(describeAIResult({ httpStatus: 500, contentType: 'text/event-stream', body: partial }), {
    text: '', structured: ['{"type":"finding","text":"incomplete'],
  });
});

test('an interrupted worker result is reconstructed from paginated events without replaying frames twice', () => {
  const replay = new AIEventReplay();
  const job = { id: 'saved-stream', status: 'processing', stalled: true, result_payload: { httpStatus: 200, contentType: 'text/event-stream', body: '' } };
  const first = 'data: {"type":"text","content":"Éléments "}\n\n';
  const second = 'data: {"type":"text","content":"conservés."}\n\n';
  replay.accept({ job, events: [{ seq: 1, data: first }], hasMore: true });
  assert.equal(replay.cursor, 1);
  const recovered = replay.accept({ job, events: [{ seq: 1, data: first }, { seq: 2, data: second }], hasMore: false });
  assert.equal(replay.cursor, 2);
  assert.equal(recovered.status, 'processing');
  assert.equal(recovered.stalled, true);
  assert.equal(describeAIResult(recovered.result_payload!).text, 'Éléments conservés.');
});

test('a final body replaces replayed partial events and is never appended a second time', () => {
  const replay = new AIEventReplay();
  const frame = 'data: {"type":"text","content":"Résultat"}\n\n';
  const body = frame + 'data: [DONE]\n\n';
  replay.accept({ job: { id: 'saved-stream', status: 'processing' }, events: [{ seq: 1, data: frame }] });
  const completed = replay.accept({
    job: { id: 'saved-stream', status: 'completed', result_payload: { httpStatus: 200, contentType: 'text/event-stream', body } },
    events: [{ seq: 2, data: 'data: [DONE]\n\n' }],
  });
  assert.equal(completed.result_payload!.body, body);
  assert.equal(describeAIResult(completed.result_payload!).text, 'Résultat');
});

test('systematic progress comes from saved steps and missing counts are not presented as zero findings', () => {
  const saved: SystematicRunResult = {
    success: true, completed: false, run_id: 'run-one', total_substances: 5, total_pairs: 10,
    pairs_analyzed: 4, discoveries_found: 2, current_substance_index: 1,
    steps: [{ substance_analyzed: 'Synthetic A', pairs_count: 4, discoveries_count: 2, synthesis: 'Saved synthesis.' },
      { substance_analyzed: 'Synthetic B', synthesis: 'Count unavailable.' }],
  };
  const restored = describeSystematicRun(saved);
  assert.equal(restored.discoveries.length, 2);
  assert.equal(restored.discoveries[0].discoveries, 2);
  assert.equal(restored.discoveries[1].discoveries, null);
  assert.match(restored.logs[1].detail, /non précisé/);
  assert.deepEqual(describeSystematicRun(saved), restored);
});
