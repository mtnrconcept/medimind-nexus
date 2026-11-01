import assert from 'node:assert/strict';
import test from 'node:test';
import { pluginSources } from '../supabase/functions/scientific-evidence/plugins.ts';

const prognyx = pluginSources.find(provider => provider.name === 'Prognyx')!;
const query = { mode: 'drug' as const, term: 'KRAS G12C' };
const trial = {
  nct: 'NCT05132075', title: 'Public trial protocol', status: 'ACTIVE_NOT_RECRUITING',
  phases: ['PHASE3'], url: 'https://clinicaltrials.gov/study/NCT05132075',
};
const envelope = (structuredContent: unknown) => ({
  jsonrpc: '2.0', id: 1,
  result: { structuredContent, isError: false, content: [{ type: 'text', text: 'Ungrounded interpretation' }] },
});
const ready = (row: unknown) => ({ state: 'ready', total: 1, trials: [row] });

test('Prognyx reads public registry facts and shares the stable ClinicalTrials.gov identifier', async () => {
  const results = await prognyx.search(query, async (url, init) => {
    assert.equal(url.href, 'https://www.prognyx.com/api/mcp');
    assert.equal(init?.method, 'POST');
    const request = JSON.parse(String(init?.body));
    assert.equal(request.method, 'tools/call');
    assert.equal(request.params.name, 'search_registry');
    assert.equal(request.params.arguments.query, query.term);
    assert.ok(request.params.arguments.limit > 0 && request.params.arguments.limit <= 12);
    return envelope(ready(trial));
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].id, trial.nct);
  assert.equal(results[0].url, trial.url);
  assert.equal(results[0].kind, 'trial');
  assert.match(results[0].detail, /registre/i);
  assert.doesNotMatch(JSON.stringify(results), /Ungrounded/);
});

test('a valid empty Prognyx answer is distinct from RPC, tool and upstream failures', async () => {
  assert.deepEqual(await prognyx.search(query, async () => envelope({ state: 'empty' })), []);
  const errors = [
    { jsonrpc: '2.0', id: 1, error: { code: -32603 } },
    { ...envelope({ state: 'empty' }), id: 99 },
    { jsonrpc: '2.0', id: 1, result: { isError: true, structuredContent: { state: 'empty' } } },
    envelope({ state: 'unavailable' }), envelope({ state: 'ready', total: 3, trials: [] }),
    envelope({ state: 'empty', total: 1 }), envelope({ state: 'empty', trials: [trial] }),
    envelope(ready({ ...trial, nct: '../private' })), envelope(ready({ ...trial, url: 'https://example.org/' })),
    envelope(ready({ ...trial, title: '' })),
  ];
  for (const failure of errors) await assert.rejects(prognyx.search(query, async () => failure));
});
