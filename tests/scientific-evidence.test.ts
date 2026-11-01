import test from 'node:test';
import assert from 'node:assert/strict';
import { readBoundedJson } from '../supabase/functions/_shared/bounded-json.ts';
import { collectEvidence, parseResearchQuery, serveEvidence } from '../supabase/functions/scientific-evidence/engine.ts';
import type { EvidenceRecord, Provider } from '../supabase/functions/scientific-evidence/contract.ts';

const query = { mode: 'gene' as const, term: 'NPHS1' };
const record: EvidenceRecord = { id: 'PMID:1', title: 'Public citation', kind: 'publication', detail: 'Citation', url: 'https://pubmed.ncbi.nlm.nih.gov/1/' };
const source = (name: string, search: Provider['search']): Provider => ({ name, modes: ['gene'], search });
const noNetwork = async () => { throw new Error('unexpected request'); };

test('allows public terms, rejects extra fields, free-text notes and unexpected modes', () => {
  assert.deepEqual(parseResearchQuery({ mode: 'disease', term: '  syndrome   néphrotique  ' }), { mode: 'disease', term: 'syndrome néphrotique' });
  for (const input of [null, { ...query, patient_id: '123' }, { ...query, mode: 'patient' }, { ...query, term: 'patient@example.org' }, { ...query, term: 'NPHS1\nmedical note' }, { ...query, term: 'X'.repeat(121) }]) {
    assert.throws(() => parseResearchQuery(input));
  }
});

test('unavailable, genuinely empty, and retrieved records remain separate in a partial report', async () => {
  const providers = [
    source('A', async () => [record, record]), source('B', async () => []),
    source('C', async () => { throw new Error('private upstream details'); }),
    { ...source('D', noNetwork), modes: ['drug' as const] },
  ];
  const result = await collectEvidence(query, providers, noNetwork);
  assert.deepEqual(result.sources.map(s => [s.name, s.status, s.records.length]), [['A', 'matched', 1], ['B', 'empty', 0], ['C', 'unavailable', 0]]);
  assert.equal(result.query.term, query.term);
  assert.ok(!JSON.stringify(result).includes('private upstream details'));
  assert.ok(Number.isFinite(Date.parse(result.retrievedAt)));
});

test('does not contact a scientific source without a verified user or valid public query', async () => {
  let calls = 0;
  const providers = [source('T', async () => { calls++; return [record]; })];
  const run = (body: unknown, token?: string, verify = async () => true) => serveEvidence(
    new Request('https://local.test', { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: JSON.stringify(body) }),
    verify, providers, noNetwork);
  assert.equal((await run(query)).status, 401);
  assert.equal((await run(query, 'invalid', async () => false)).status, 401);
  assert.equal((await run({ ...query, record: 'private clinical context' }, 'valid')).status, 400);
  assert.equal(calls, 0);
  assert.equal((await run(query, 'valid')).status, 200);
  assert.equal(calls, 1);
});

test('actual response size is capped even without a declared size', async () => {
  assert.deepEqual(await readBoundedJson(new Response('{"ok":true}'), 20), { ok: true });
  await assert.rejects(readBoundedJson(new Response('{"value":"abcdefghi"}'), 12));
});

test('an unsupported term is not reported as an empty upstream search', async () => {
  const report = await collectEvidence(query, [{ ...source('Symbols', noNetwork), accepts: () => false }], noNetwork);
  assert.deepEqual(report.sources, []);
});

test('cancelled requests do not contact further providers or misreport empty searches', async () => {
  const report = await collectEvidence(query, [source('A', noNetwork)], noNetwork, AbortSignal.abort());
  assert.equal(report.sources[0].status, 'unavailable');
});

test('transport refuses unlisted or credential-bearing endpoints before network access', async () => {
  const { fetchPublicJson } = await import('../supabase/functions/scientific-evidence/engine.ts');
  for (const url of ['https://attacker.test/', 'https://www.ebi.ac.uk:8888/', 'https://u:p@www.ebi.ac.uk/']) {
    await assert.rejects(fetchPublicJson(new URL(url)), /Invalid scientific endpoint/);
  }
});

test('clinical citation identifiers are not resolved as gene or disease synonyms', async () => {
  for (const term of ['NCT02438982', 'PMID:29913001']) {
    const query = { mode: 'disease' as const, term };
    const report = await collectEvidence(query, [
      { name: 'Ontology', modes: ['disease'], search: noNetwork },
      { name: 'Citations', modes: ['disease'], citationLookup: true, search: async () => [] },
    ], noNetwork);
    assert.deepEqual(report.sources.map(source => source.name), ['Citations']);
  }
});
