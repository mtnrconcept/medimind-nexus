import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPairCandidates, type SelectedElement } from '../supabase/functions/cross-data-analyzer/analysis-utils.ts';
import { readCells, pendingPairs } from '../supabase/functions/cross-data-analyzer/matrix-progress.ts';

const elements: SelectedElement[] = [
  { name: 'Alpha', type: 'pathology' }, { name: 'Beta', type: 'symptom' }, { name: 'Gamma', type: 'medication' },
];
const pairs = buildPairCandidates(elements);

test('an explicit empty cell is audited, a missing or malformed cell is pending on retry', () => {
  const [first, second] = pairs;
  const cells = readCells([
    { pairHash: first.pairHash, links: [] }, { pairHash: second.pairHash, links: null },
  ], pairs);
  assert.deepEqual(cells, { [first.pairHash]: [] });
  assert.deepEqual(pendingPairs(elements, cells), pairs.slice(1));
});

test('a response cannot fill another pair or silently discard an invalid link', () => {
  assert.deepEqual(readCells([{ pairHash: pairs[1].pairHash, links: [] },
    { pairHash: pairs[0].pairHash, links: [{ from: 'Gamma' }] }], [pairs[0]]), {});
});

import { createClient } from '@supabase/supabase-js';
import { handleMatrix } from '../supabase/functions/cross-data-analyzer/matrix-job.ts';

test('server continues without a polling browser and resumes a truncated batch without re-auditing completed cells', async t => {
  const tasks: Promise<void>[] = [];
  type StoredJob = {
    id: string; status: string; updated_at: string; request_payload: {scope: string};
    result_payload: { cells: Record<string, unknown>; analysis: { summary: string } };
    [field: string]: unknown;
  };
  const database = new Map<string, StoredJob>();
  const submissions: string[][] = [];
  const provider = new Map<string, { status: string; output_text?: string; incomplete_details?: { reason: string }; max_output_tokens?: number }>();
  const providerGets: string[] = [];
  let failFirstRead = true;
  let truncate = true;
  const service = 'test-service', url = 'https://matrix.invalid';
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const u = new URL(req.url);
    const ok = (data: unknown) => Response.json(data);
    if (u.pathname === '/functions/v1/cross-data-analyzer') return dispatch(await req.json(), service);
    if (u.pathname === '/auth/v1/user') return ok({ id: req.headers.get('authorization')?.slice(7) });
    if (u.pathname === '/rest/v1/patients') return ok([]);
    if (u.pathname === '/v1/responses' && req.method === 'POST') {
      const request = await req.json();
      const input = JSON.parse(request.input[1].content);
      const hashes = input.pairs?.map(({ pair }: { pair: { pairHash: string } }) => pair.pairHash) || [];
      submissions.push(hashes);
      const id = 'ai-' + submissions.length;
      // First group returns one explicit cell. The next group exhausts its
      // larger bounded budgets, then the clinician resumes the remaining cells.
      const result = hashes.length ? { cells: hashes.slice(0, 1).map((pairHash: string) => ({ pairHash, links: [] })) } :
        { summary: 'Synthèse du test.' };
      const fail = truncate && submissions.length > 1;
      provider.set(id, fail ? { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, max_output_tokens: request.max_output_tokens } :
        { status: 'completed', output_text: JSON.stringify(result) });
      return ok({ id, status: 'queued', max_output_tokens: request.max_output_tokens });
    }
    if (u.pathname.startsWith('/v1/responses/')) {
      const responseId = u.pathname.split('/').pop()!;
      providerGets.push(responseId);
      if (failFirstRead) { failFirstRead = false; throw new Error('Transient GET disconnection'); }
      return ok(provider.get(responseId));
    }
    assert.equal(u.pathname, '/rest/v1/ai_analysis_jobs');
    if (req.method === 'POST') {
      const row = { id: crypto.randomUUID(), updated_at: new Date().toISOString(), ...await req.json() };
      database.set(row.id, row);
      return ok(row);
    }
    const rows = [...database.values()].filter(row => [...u.searchParams].every(([field, filter]) =>
      !filter.startsWith('eq.') || String(field === 'request_payload->>scope' ? row.request_payload.scope : row[field]) === filter.slice(3)));
    if (req.method === 'PATCH') {
      const patch = await req.json();
      // A valid response older than the former 20-minute cutoff must retain
      // its identity when the next short worker resumes polling it.
      if (patch.provider_started_at) patch.provider_started_at = new Date(Date.now() - 25 * 60_000).toISOString();
      rows.forEach(row => Object.assign(row, patch));
    }
    return ok(req.headers.get('accept')?.includes('vnd.pgrst.object') ? rows[0] ?? null : rows);
  });
  const globals = globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil(p: Promise<void>): void }; Deno?: { env: { get(): string } };
  };
  globals.EdgeRuntime = { waitUntil: (p: Promise<void>) => tasks.push(p) };
  globals.Deno = { env: { get: () => 'test-value' } };
  t.after(() => { delete globals.EdgeRuntime; delete globals.Deno; });
  async function dispatch(body: Record<string, unknown>, token = 'owner') {
    return handleMatrix(new Request(url, { headers: { Authorization: 'Bearer ' + token } }), body, url, service, async () => [], createClient);
  }
  async function drain() { while (tasks.length) await tasks.shift(); }
  await dispatch({ action: 'matrix.start', externalPathologies: elements.map((e, i) => ({ id: String(i), name: e.name })) });
  await drain();
  const [job] = database.values();
  assert.equal(job.status, 'failed');
  assert.deepEqual(providerGets.slice(0, 2), ['ai-1', 'ai-1'], 'a GET error must keep and retry the same generation');
  assert.ok(job.provider_response_id, 'a terminal incomplete response remains available for deliberate resume');
  const [first] = Object.keys(job.result_payload.cells);
  assert.ok(first);
  assert.equal((await (await dispatch({ action: 'matrix.latest', jobId: job.id }, 'other')).json()).job, null);
  assert.equal((await dispatch({ action: 'matrix.work', jobId: job.id })).status, 403);
  assert.equal((await dispatch({ action: 'matrix.latest', patientId: 'inaccessible' })).status, 403);
  truncate = false;
  await dispatch({ action: 'matrix.resume', jobId: job.id });
  await drain();
  assert.equal(job.status, 'completed');
  assert.equal(job.result_payload.analysis.summary, 'Synthèse du test.');
  assert.equal(Object.keys(job.result_payload.cells).length, 3);
  assert.equal(submissions.slice(1).flat().includes(first), false);
  assert.equal((await (await dispatch({ action: 'matrix.latest' })).json()).job.id, job.id);
});
