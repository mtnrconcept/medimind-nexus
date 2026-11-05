import assert from 'node:assert/strict';
import test from 'node:test';
import { admitGraphResearch, graphPayloadFingerprint, GraphAdmissionError, type GraphAdmissionJob, type GraphAdmissionStore } from '../supabase/functions/deep-research-graph/admission.ts';
import { parseResearchInput } from '../supabase/functions/deep-research-graph/handler.ts';

const requestId = '34bd6dc2-a235-4a82-94bf-f49e8510572e';
const owner = 'synthetic-owner';
const timestamp = Date.parse('2026-11-05T10:00:00.000Z');
const input = () => parseResearchInput({ topic: 'Condition synthétique', pathologies: ['Condition synthétique'],
  existing_nodes: [{ id: 'synthetic-node', name: 'Symptôme synthétique', node_type: 'SYMPTOM' }], include_fda: false })!;

function fixture() {
  const rows = new Map<string, GraphAdmissionJob>();
  let writes = 0, attempts = 0, initialMisses = 0, loseAcknowledgement = false;
  const store: GraphAdmissionStore = {
    async findOwned(id, actor, functionName) {
      if (initialMisses > 0) { initialMisses--; return null; }
      const row = rows.get(id);
      return row?.requested_by === actor && row.function_name === functionName ? structuredClone(row) : null;
    },
    async insert(row) {
      attempts++;
      if (rows.has(row.public_token)) throw Object.assign(new Error('Unique token conflict'), { code: '23505' });
      const saved = { ...row, id: crypto.randomUUID(), created_at: new Date(timestamp).toISOString() };
      rows.set(row.public_token, saved);
      writes++;
      if (loseAcknowledgement) { loseAcknowledgement = false; throw new TypeError('Failed to fetch'); }
      return structuredClone(saved);
    },
  };
  const admit = (extra: Partial<Parameters<typeof admitGraphResearch>[0]> = {}) => admitGraphResearch({
    input: input(), requestId, userId: owner, store, now: () => timestamp, ...extra,
  });
  return { admit, store, rows, get writes() { return writes; }, get attempts() { return attempts; },
    forceMisses(count: number) { initialMisses = count; }, loseAcknowledgement() { loseAcknowledgement = true; } };
}

test('same graph admission reference creates exactly one canonical 24-hour job', async () => {
  const f = fixture();
  const first = await f.admit();
  const second = await f.admit({ requestId: requestId.toUpperCase() });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.job.id, first.job.id);
  assert.equal(f.writes, 1);
  assert.equal(Date.parse(first.job.expires_at) - timestamp, 24 * 60 * 60 * 1000);
  assert.equal(first.job.public_token, requestId);
  assert.equal(first.job.request_payload.streaming, false);
  assert.equal((first.job.request_payload._graphAdmission as { version: number }).version, 1);
});

test('racing graph submissions recover the winner of the unique request token', async () => {
  const f = fixture();
  f.forceMisses(2);
  const results = await Promise.all([f.admit(), f.admit()]);
  assert.equal(f.attempts, 2);
  assert.equal(f.writes, 1);
  assert.equal(results[0].job.id, results[1].job.id);
  assert.equal(results.filter(result => result.created).length, 1);
});

test('a lost INSERT acknowledgement recovers the recorded job without another insertion', async () => {
  const f = fixture();
  f.loseAcknowledgement();
  const recovered = await f.admit();
  assert.equal(recovered.created, false);
  assert.equal(f.attempts, 1);
  assert.equal(f.writes, 1);
  assert.equal((await f.admit()).job.id, recovered.job.id);
  assert.equal(f.attempts, 1);
});

test('a token cannot cross owners, function namespaces or different graph inputs', async () => {
  const f = fixture();
  await f.admit();
  for (const mismatch of [{ userId: 'another-owner' }, { functionName: 'another-function' },
    { input: { ...input(), topic: 'Different synthetic topic' } }]) {
    await assert.rejects(f.admit(mismatch), error => error instanceof GraphAdmissionError && error.status === 409);
  }
  assert.equal(f.writes, 1);
});

test('expired or terminal jobs are never silently replaced during admission', async () => {
  const f = fixture();
  const { job } = await f.admit();
  f.rows.get(requestId)!.status = 'completed';
  assert.equal((await f.admit()).job.status, 'completed');
  await assert.rejects(f.admit({ now: () => Date.parse(job.expires_at) }), error => error instanceof GraphAdmissionError && error.status === 410);
  assert.equal(f.writes, 1);
});

test('fingerprint normalization ignores browser control fields but preserves centre ordering', async () => {
  const raw = { ...input(), topic: 'Condition synthe\u0301tique', runJob: true,
    _researchSnapshot: { malicious: true }, providerResponseId: 'forged-provider', _graphAdmission: { fingerprint: 'forged' } };
  const a = await graphPayloadFingerprint(input());
  const b = await graphPayloadFingerprint(raw);
  assert.equal(a.fingerprint, b.fingerprint);
  const f = fixture();
  const { job } = await f.admit({ input: raw });
  assert.equal(job.request_payload._researchSnapshot, undefined);
  assert.equal(job.request_payload.runJob, undefined);
  assert.equal(job.request_payload.providerResponseId, undefined);
  assert.doesNotMatch(JSON.stringify(job.request_payload), /forged|malicious/);
  const forward = await graphPayloadFingerprint({ ...input(), pathologies: ['Alpha', 'Beta'] });
  const reverse = await graphPayloadFingerprint({ ...input(), pathologies: ['Beta', 'Alpha'] });
  assert.notEqual(forward.fingerprint, reverse.fingerprint);
});

test('stored input is rechecked even when admission metadata appears unchanged', async () => {
  const f = fixture();
  await f.admit();
  f.rows.get(requestId)!.request_payload.topic = 'Different stored input';
  await assert.rejects(f.admit(), error => error instanceof GraphAdmissionError && error.status === 409);
  assert.equal(f.writes, 1);
});

test('invalid references and uncertain storage failures do not trigger blind replacement inserts', async () => {
  const f = fixture();
  await assert.rejects(f.admit({ requestId: 'not-a-uuid' }), error => error instanceof GraphAdmissionError && error.status === 400);
  assert.equal(f.attempts, 0);
  await assert.rejects(f.admit({ store: { ...f.store, async findOwned() { throw new Error('Database unavailable'); } } }),
    error => error instanceof GraphAdmissionError && error.status === 503);
  assert.equal(f.attempts, 0);
  let attempts = 0;
  await assert.rejects(f.admit({ store: { ...f.store, async insert() { attempts++; throw new TypeError('Failed to fetch'); } } }),
    error => error instanceof GraphAdmissionError && error.status === 503);
  assert.equal(attempts, 1);
});

test('admission lookup is read-only and proves expiry only after owner, namespace and payload verification', async () => {
  const f = fixture();
  await assert.rejects(f.admit({ lookupOnly: true }), error => error instanceof GraphAdmissionError && error.status === 404);
  assert.equal(f.attempts, 0);
  const admitted = await f.admit();
  const lookup = await f.admit({ lookupOnly: true });
  assert.equal(lookup.created, false);
  assert.deepEqual(lookup.job, admitted.job);
  const now = () => Date.parse(admitted.job.expires_at);
  await assert.rejects(f.admit({ lookupOnly: true, now }), error => error instanceof GraphAdmissionError && error.status === 410);
  await assert.rejects(f.admit({ lookupOnly: true, now, input: { ...input(), topic: 'Another research' } }),
    error => error instanceof GraphAdmissionError && error.status === 409);
  await assert.rejects(f.admit({ lookupOnly: true, now, userId: 'another-owner' }),
    error => error instanceof GraphAdmissionError && error.status === 404);
  await assert.rejects(f.admit({ lookupOnly: true, store: { ...f.store, async findOwned() { throw new Error('Unavailable'); } } }),
    error => error instanceof GraphAdmissionError && error.status === 503);
  assert.equal(f.attempts, 1);
  assert.equal(f.writes, 1);
});

test('malformed expiry metadata does not prove that a paid job can be replaced', async () => {
  const f = fixture();
  await f.admit();
  f.rows.get(requestId)!.expires_at = 'unknown';
  await assert.rejects(f.admit({ lookupOnly: true }), error => error instanceof GraphAdmissionError && error.status === 503);
  assert.equal(f.writes, 1);
});
