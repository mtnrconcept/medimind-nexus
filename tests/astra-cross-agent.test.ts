import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPairCandidates, typedElementKey, type SelectedElement } from '../supabase/functions/cross-data-analyzer/analysis-utils.ts';
import { ASTRA_MODEL, MEDICAL_WEB_DOMAINS, readAgentCells, readAgentPlan } from '../supabase/functions/cross-data-analyzer/agent-contract.ts';
import { createAgentState, nextAgentStep, applyAgentResult, buildAgentRequest } from '../supabase/functions/cross-data-analyzer/agent-orchestrator.ts';

const elements: SelectedElement[] = [
  { name: 'Hypertension artérielle', type: 'pathology' },
  { name: 'Migraine', type: 'pathology' },
  { name: 'Propranolol oral', type: 'medication' },
];
const source = { title: 'Official label', url: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=synthetic' };
function rawCell(pair = buildPairCandidates(elements)[0]) {
  const directions = [[pair.left, pair.right], [pair.right, pair.left]].map(([from, to]) => ({
    fromKey: typedElementKey(from), toKey: typedElementKey(to), verdict: 'insufficient',
    explanation: 'Les données disponibles ne permettent pas une attribution.',
    limitations: 'Le contexte clinique est incomplet.', sourceUrls: [],
  }));
  return { pairHash: pair.pairHash, directions, links: [] };
}

test('Astra mode requires a real hosted search and both directions for every pair', () => {
  const [pair] = buildPairCandidates(elements);
  assert.equal(ASTRA_MODEL, 'gpt-6-astra');
  assert.ok(MEDICAL_WEB_DOMAINS.includes('swissmedicinfo-pro.ch'));
  assert.throws(() => readAgentCells([rawCell(pair)], [pair], [], 0), /recherche/i);
  assert.deepEqual(Object.keys(readAgentCells([rawCell(pair)], [pair], [], 1).cells), [pair.pairHash]);
  assert.deepEqual(readAgentCells([{ ...rawCell(pair), directions: rawCell(pair).directions.slice(0, 1) }], [pair], [], 1).cells, {});
});

test('native citations must be in actual allowed tool sources, never generated URLs', () => {
  const pair = buildPairCandidates(elements).find(p => p.right.type === 'medication')!;
  const cell = rawCell(pair);
  const rawLink = {
    fromKey: typedElementKey(pair.right), toKey: typedElementKey(pair.left), relationKind: 'indication',
    evidence: 'Notice officielle : indication générale, à vérifier dans le contexte individuel.',
    sourceUrls: [source.url], confidence: 'high', evidenceSupport: 'direct',
    context: { condition: 'same', route: 'same', population: 'unknown', temporality: 'not_reported' },
    contextLimitations: ['Posologie et antécédents non disponibles.'], dangerLevel: 'unknown', interactionEffect: 'unknown',
  };
  cell.links = [rawLink] as never[];
  cell.directions[1].verdict = 'cited_relation';
  cell.directions[1].sourceUrls = [source.url] as never[];
  const result = readAgentCells([cell], [pair], [source], 1);
  assert.equal(result.cells[pair.pairHash][0].evidenceOrigin, 'openai_web_search');
  assert.equal(result.cells[pair.pairHash][0].citationVerification, 'provider_trace');
  assert.equal(result.cells[pair.pairHash][0].evidenceQuotes, undefined);
  assert.equal(readAgentCells([cell], [pair], [], 1).cells[pair.pairHash].length, 0);
  const spoofed = { ...source, url: 'https://dailymed.nlm.nih.gov.attacker.invalid/claim' };
  rawLink.sourceUrls = [spoofed.url];
  assert.equal(readAgentCells([cell], [pair], [spoofed], 1).cells[pair.pairHash].length, 0);
});

test('every selected pair is reviewed even if local relationships already exist', () => {
  const state = createAgentState(elements);
  const request = buildAgentRequest(state, nextAgentStep(state));
  assert.equal(request.options.model, ASTRA_MODEL);
  assert.equal(request.options.forceModel, true);
  assert.equal(request.options.webSearch?.required, true);
  assert.equal(nextAgentStep(state).pairs.length, 1);
  while (nextAgentStep(state).kind === 'pairs') {
    const step = nextAgentStep(state);
    applyAgentResult(state, step, { cells: step.pairs.map(rawCell) }, [], 1);
  }
  assert.equal(state.analysis.agentReview?.coverage.reviewedPairs, 3);
  assert.equal(state.analysis.agentReview?.coverage.webSearchedPairs, 3);
  assert.equal(nextAgentStep(state).kind, 'plan');
});

test('independent scheduled pair batches can finish out of order without skipping coverage or borrowing sources', () => {
  const state = createAgentState(elements);
  const pair = buildPairCandidates(elements)[2];
  const step = { kind: 'pairs' as const, pairs: [pair] };
  assert.throws(() => applyAgentResult(state, step, { cells: [rawCell(pair)] }, [], 1), /incohérente/);
  applyAgentResult(state, step, { cells: [rawCell(pair)] }, [], 1, { independentPairs: true });
  assert.equal(state.analysis.agentReview?.coverage.reviewedPairs, 1);
  assert.equal(nextAgentStep(state).kind, 'pairs');
  assert.throws(() => applyAgentResult(state, step, { cells: [rawCell(pair)] }, [], 1, { independentPairs: true }), /incohérente/);
  assert.throws(() => applyAgentResult(state, { ...step, pairs: [{ ...pair, left: { name: 'Intrus', type: 'pathology' } }] },
    { cells: [rawCell(pair)] }, [], 1, { independentPairs: true }), /incohérente/);
});

test('an edge and its direction may cite different independently traced medical sources', () => {
  const pair = buildPairCandidates(elements).find(p => p.right.type === 'medication')!;
  const cell = rawCell(pair);
  const second = { title: 'Second official source', url: 'https://base-donnees-publique.medicaments.gouv.fr/medicament/63003440/extrait' };
  cell.directions[1].verdict = 'cited_relation';
  cell.directions[1].sourceUrls = [source.url] as never[];
  cell.links = [{ fromKey: typedElementKey(pair.right), toKey: typedElementKey(pair.left), relationKind: 'indication',
    evidence: 'Une deuxième notice décrit la même indication antihypertensive.', sourceUrls: [second.url], confidence: 'high',
    evidenceSupport: 'direct', context: { condition: 'same', route: 'same', population: 'unknown', temporality: 'not_reported' },
    contextLimitations: ['Pertinence individuelle à vérifier.'], dangerLevel: 'unknown', interactionEffect: 'unknown' }] as never[];
  const result = readAgentCells([cell], [pair], [source, second], 1);
  assert.equal(result.cells[pair.pairHash][0]?.relationKind, 'indication');
  assert.deepEqual(result.cells[pair.pairHash][0]?.webSources, [second.url]);
  assert.equal(readAgentCells([cell], [pair], [source], 1).cells[pair.pairHash], undefined);
});

test('unverified replacement plans cannot bypass candidate cross-checks', () => {
  const candidate = { name: 'Candidat fictif', type: 'medication' as const };
  const plan = { status: 'review_required', summary: 'Option théorique à discuter.', globalRisks: [], missingData: ['Fonction rénale'],
    candidates: [candidate], options: [{ id: 'option-1', title: 'Option à vérifier', rationale: 'Revue comparative nécessaire.',
      expectedBenefits: ['Bénéfice à confirmer'], residualRisks: ['Données incomplètes'], monitoring: ['Surveillance clinique'],
      requiredChecks: ['Validation du prescripteur'], sourceUrls: [source.url],
      changes: [{ action: 'discuss_replace', target: 'Propranolol oral', replacement: candidate.name,
        rationale: 'Option à examiner.', sourceUrls: [source.url] }] }] };
  assert.throws(() => readAgentPlan(plan, [source], elements, []), /candidat|vérifi/i);
  const state = createAgentState(elements);
  while (nextAgentStep(state).kind === 'pairs') {
    const step = nextAgentStep(state);
    applyAgentResult(state, step, { cells: step.pairs.map(rawCell) }, [], 1);
  }
  applyAgentResult(state, nextAgentStep(state), plan, [source], 1);
  assert.equal(nextAgentStep(state).kind, 'candidate_pairs');
  assert.equal(state.analysis.agentReview?.coverage.candidatePairs, 3);
  assert.equal(state.analysis.agentReview?.stage, 'candidate_pairs');
  assert.equal(nextAgentStep(state).pairs.every(p => [p.left.name,p.right.name].includes(candidate.name)), true);
});
