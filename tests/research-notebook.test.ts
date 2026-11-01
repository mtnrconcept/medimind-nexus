import test from 'node:test';
import assert from 'node:assert/strict';
import type { EvidenceRecord, EvidenceReport } from '../supabase/functions/scientific-evidence/contract.ts';
import { createNotebook, exportNotebook, notebookReducer, recordKey, MAX_NOTEBOOK_ITEMS } from '../src/lib/researchNotebook.ts';

const article: EvidenceRecord = { id: 'PMID:123', kind: 'publication', title: 'Test publication', url: 'https://pubmed.ncbi.nlm.nih.gov/123/', detail: 'Summary' };
const trial: EvidenceRecord = { id: 'NCT00000001', kind: 'trial', title: 'Test registration', url: 'https://clinicaltrials.gov/study/NCT00000001', detail: 'Protocol', related: [{ id: article.id, url: article.url }] };
const report: EvidenceReport = {
  schemaVersion: 1, query: { mode: 'disease', term: 'example disease' }, retrievedAt: '2026-01-01T01:00:00Z',
  sources: [
    { name: 'PubMed', status: 'matched', records: [article] },
    { name: 'Europe PMC', status: 'matched', records: [{ ...article, url: 'https://europepmc.org/article/MED/123' }] },
    { name: 'ClinicalTrials.gov', status: 'matched', records: [trial] },
  ],
};

test('one canonical record retains both source-specific notices and separate consultations; a linked trial remains distinct', () => {
  let state = notebookReducer(createNotebook(), { type: 'retain', record: article, report });
  state = notebookReducer(state, { type: 'retain', record: article, report });
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].provenance.length, 2);
  assert.notEqual(state.items[0].provenance[0].record.url, state.items[0].provenance[1].record.url);
  state = notebookReducer(state, { type: 'refresh', report: { ...report, query: { mode: 'gene', term: 'NPHS1' }, retrievedAt: '2026-01-02T03:00:00Z' } });
  assert.equal(state.items[0].provenance.length, 4);
  assert.deepEqual(state.items[0].provenance[3].query, { mode: 'gene', term: 'NPHS1' });
  assert.equal(state.items[0].provenance[3].retrievedAt, '2026-01-02T03:00:00Z');
  assert.equal(state.items[0].role, 'unreviewed');
  state = notebookReducer(state, { type: 'retain', record: trial, report });
  assert.equal(state.items.length, 2);
  assert.deepEqual(state.items[1].provenance[0].record.related, trial.related);
});

test('draft and human interpretation export together, removal and reset clear only the intended state', () => {
  let state = notebookReducer(createNotebook(), { type: 'retain', record: article, report });
  state = notebookReducer(state, { type: 'field', field: 'hypothesis', value: 'Hypothesis test' });
  state = notebookReducer(state, { type: 'field', field: 'refutationCriterion', value: 'Observed effect below threshold' });
  state = notebookReducer(state, { type: 'role', key: recordKey(article), role: 'contradicts' });
  const dossier = JSON.parse(JSON.stringify(exportNotebook(state, '2026-01-02T00:00:00Z')));
  assert.deepEqual(dossier.items[0].provenance[0], { source: 'PubMed', query: report.query, retrievedAt: report.retrievedAt, record: article });
  assert.equal(dossier.items[0].role, 'contradicts');
  assert.equal(dossier.hypothesis, state.hypothesis);
  assert.equal(dossier.refutationCriterion, state.refutationCriterion);
  assert.equal(dossier.exportedAt, '2026-01-02T00:00:00Z');
  state = notebookReducer(state, { type: 'remove', key: recordKey(article) });
  assert.equal(state.items.length, 0);
  assert.equal(state.hypothesis, 'Hypothesis test');
  assert.deepEqual(notebookReducer(state, { type: 'reset' }), createNotebook());
});

test('selection capacity does not silently discard a previous reference', () => {
  let state = createNotebook();
  for (let index = 0; index <= MAX_NOTEBOOK_ITEMS; index++) {
    const record = { ...article, id: 'PMID:' + (1000 + index) };
    const eachReport = { ...report, sources: [{ name: 'PubMed', status: 'matched' as const, records: [record] }] };
    state = notebookReducer(state, { type: 'retain', record, report: eachReport });
  }
  assert.equal(state.items.length, MAX_NOTEBOOK_ITEMS);
  assert.equal(state.items[0].provenance[0].record.id, 'PMID:1000');
});
