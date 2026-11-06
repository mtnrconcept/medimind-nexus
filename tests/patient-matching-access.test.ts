import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAuthorizedPathologyMatches, type AuthorizedMatchGateway } from '../src/lib/patientSimilarity/authorizedMatches.ts';
import type { ClinicalPatientProfile } from '../src/lib/patientSimilarity/clinicalSimilarity.ts';

const PATH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const SOURCE = '11111111-1111-4111-8111-111111111111';
const PEER = '22222222-2222-4222-8222-222222222222';
const HIDDEN = '33333333-3333-4333-8333-333333333333';
const HISTORY = '44444444-4444-4444-8444-444444444444';
const recordedDisease = { id: HISTORY, name: 'Eczéma', conditionType: 'disease' };
function minimal(id: string, pathologyId: string | null = PATH) {return { id, patientCode: id, age: 45, pathologyId };}
function profile(id: string): ClinicalPatientProfile {
  return { id, patientCode: id, age: 45, diagnoses: [{ pathologyId: PATH }], history: [], medications: [], labs: [], symptoms: [] };
}
function gateway(changes: Partial<AuthorizedMatchGateway> = {}): AuthorizedMatchGateway {
  return {
    getSourcePatient: async () => minimal(SOURCE),
    listSourcePathologies: async () => [],
    listSourceMedicalHistory: async () => [],
    listRecordedConditionMatchIds: async () => [],
    listPrimaryMatches: async () => [minimal(SOURCE), minimal(PEER)],
    listSecondaryMatchIds: async () => [PEER, HIDDEN],
    listVisiblePatients: async () => [minimal(PEER)],
    loadProfiles: async ids => ids.map(profile),
    ...changes,
  };
}

test('returns only independently RLS-visible candidates, without including hidden IDs in results', async () => {
  let enriched: string[] = [];
  const matches = await loadAuthorizedPathologyMatches(gateway({
    loadProfiles: async ids => { enriched = ids; return ids.map(profile); },
  }), SOURCE, PATH);
  assert.deepEqual(matches.map(x => x.patientId), [PEER]);
  assert.deepEqual(enriched.sort(), [SOURCE, PEER].sort());
  assert.ok(!JSON.stringify(matches).includes(HIDDEN));
});

test('denied patient source forbids searching or loading candidate records', async () => {
  let readOthers = false;
  await assert.rejects(() => loadAuthorizedPathologyMatches(gateway({
    getSourcePatient: async () => null,
    listPrimaryMatches: async () => { readOthers = true; return []; },
  }), SOURCE, PATH), /acc.s|autorisation|dossier/i);
  assert.equal(readOthers, false);
});

test('source cannot request a pathology it does not have, even by guessing its UUID', async () => {
  let readOthers = false;
  await assert.rejects(() => loadAuthorizedPathologyMatches(gateway({
    listPrimaryMatches: async () => { readOthers = true; return []; },
  }), SOURCE, OTHER), /pathologie|diagnos/i);
  assert.equal(readOthers, false);
});

test('multi-diagnosis source can request a secondary recorded pathology', async () => {
  const results = await loadAuthorizedPathologyMatches(gateway({
    listSourcePathologies: async () => [{ pathologyId: OTHER, diagnosedAt: null }],
    loadProfiles: async ids => ids.map(id => ({ ...profile(id), diagnoses: [{ pathologyId: OTHER }] })),
  }), SOURCE, OTHER);
  assert.equal(results.length, 1);
});

test('invalid path and identifier are rejected without invoking the gateway', async () => {
  let called = false;
  const repo = gateway({getSourcePatient: async () => {called = true;return null;}});
  await assert.rejects(() => loadAuthorizedPathologyMatches(repo, SOURCE, "foo,or(id.eq.1)"), /identifiant|invalide/i);
  assert.equal(called, false);
});

test('no visible matches produces no disclosure about inaccessible source records', async () => {
  const results = await loadAuthorizedPathologyMatches(gateway({listVisiblePatients: async () => []}), SOURCE, PATH);
  assert.deepEqual(results, []);
});

test('history selection is re-read from the authorized source and never trusts a caller-supplied label', async () => {
  let searched = '';
  let enriched: string[] = [];
  const matches = await loadAuthorizedPathologyMatches(gateway({
    listSourceMedicalHistory: async () => [recordedDisease],
    listRecordedConditionMatchIds: async name => { searched = name; return [SOURCE, PEER, HIDDEN]; },
    loadProfiles: async ids => {
      enriched = ids;
      return ids.map(id => ({ ...profile(id), history: [{ ...recordedDisease, id: id === SOURCE ? HISTORY : OTHER }] }));
    },
  }), SOURCE, `history:${HISTORY}`);
  assert.equal(searched, 'Eczéma');
  assert.deepEqual(enriched.sort(), [SOURCE, PEER].sort());
  assert.deepEqual(matches.map(p => p.patientId), [PEER]);
  assert.equal(matches[0].samePathology, false);
  assert.ok(!JSON.stringify(matches).includes(HIDDEN));
});

test('another patient’s history ID and non-disease entries cannot be used to search', async () => {
  let searched = false;
  for (const histories of [[], [{ ...recordedDisease, conditionType: 'surgery' }]]) {
    await assert.rejects(() => loadAuthorizedPathologyMatches(gateway({
      listSourceMedicalHistory: async () => histories,
      listRecordedConditionMatchIds: async () => { searched = true; return []; },
    }), SOURCE, `history:${HISTORY}`), /antécédent|maladies/i);
  }
  assert.equal(searched, false);
});

test('malformed history selectors are rejected before any patient read', async () => {
  let accessed = false;
  const repo = gateway({ getSourcePatient: async () => { accessed = true; return minimal(SOURCE); } });
  for (const selector of ['history:', 'history:eczéma', `history:${HISTORY},or(id.eq.1)`]) {
    await assert.rejects(() => loadAuthorizedPathologyMatches(repo, SOURCE, selector), /identifiant|invalide/i);
  }
  assert.equal(accessed, false);
});

test('removed or changed source history is not restored from a stale selection', async () => {
  for (const currentHistory of [[], [{ ...recordedDisease, name: 'Asthme' }]]) {
    await assert.rejects(() => loadAuthorizedPathologyMatches(gateway({
      listSourceMedicalHistory: async () => [recordedDisease],
      listRecordedConditionMatchIds: async () => [PEER],
      loadProfiles: async ids => ids.map(id => ({ ...profile(id), history: id === SOURCE ? currentHistory : [recordedDisease] })),
    }), SOURCE, `history:${HISTORY}`), /antécédent.*chang/i);
  }
});

test('history candidates are rechecked against current clinical evidence and access permissions', async () => {
  const repo = gateway({
    listSourceMedicalHistory: async () => [recordedDisease],
    listRecordedConditionMatchIds: async () => [PEER, HIDDEN],
    loadProfiles: async () => [
      { ...profile(SOURCE), history: [recordedDisease] },
      { ...profile(PEER), history: [] },
      { ...profile(HIDDEN), history: [recordedDisease] },
    ],
  });
  assert.deepEqual(await loadAuthorizedPathologyMatches(repo, SOURCE, `history:${HISTORY}`), []);
});

test('history candidate lookup does not trigger clinical enrichment when access is denied', async () => {
  let enriched = false;
  const matches = await loadAuthorizedPathologyMatches(gateway({
    listSourceMedicalHistory: async () => [recordedDisease],
    listRecordedConditionMatchIds: async () => [HIDDEN],
    listVisiblePatients: async () => [],
    loadProfiles: async () => { enriched = true; return []; },
  }), SOURCE, `history:${HISTORY}`);
  assert.deepEqual(matches, []);
  assert.equal(enriched, false);
});
