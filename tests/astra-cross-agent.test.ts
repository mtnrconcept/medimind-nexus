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

function researchQueries(state: ReturnType<typeof createAgentState>) {
  return JSON.parse(buildAgentRequest(state, nextAgentStep(state)).user).pairs
    .map((item: { researchQuery: string }) => item.researchQuery) as string[];
}

test('one native query cannot certify every pair in a batch; uncovered pairs get dedicated requests', () => {
  const state = createAgentState([...elements, { name: 'Élément Delta', type: 'symptom' }]);
  const step = nextAgentStep(state), queries = researchQueries(state);
  assert.equal(step.pairs.length, 4);
  applyAgentResult(state, step, { cells: step.pairs.map(rawCell), webSearchQueries: queries }, [], 1,
    { webSearchQueries: [queries[0]], webQueryCalls: 1 });
  assert.deepEqual(Object.keys(state.cells), [step.pairs[0].pairHash]);
  assert.equal(state.analysis.agentReview?.coverage.webSearchedPairs, 1);
  assert.equal(state.batchSize, 1);
  assert.equal(nextAgentStep(state).pairs.length, 1);
  assert.notEqual(nextAgentStep(state).pairs[0].pairHash, step.pairs[0].pairHash);
});

test('a native multi-query search covers each distinct planned pair and preserves both directions', () => {
  const state = createAgentState([...elements, { name: 'Élément Delta', type: 'symptom' }]);
  const step = nextAgentStep(state), queries = researchQueries(state);
  assert.ok(queries.every(query => typeof query === 'string' && query.length > 8));
  assert.equal(new Set(queries).size, 4);
  applyAgentResult(state, step, { cells: step.pairs.map(rawCell) }, [], 1,
    { webSearchQueries: queries, webQueryCalls: 1 });
  assert.equal(state.analysis.agentReview?.coverage.webSearchedPairs, 4);
  assert.equal(state.batchSize, 4);
  assert.equal(nextAgentStep(state).pairs.length, 2);
  assert.ok(state.analysis.pairAssessments?.every(item => item.searchVerification === 'planned_query' && item.directions?.length === 2));
});

test('page visits and model-declared queries cannot replace a completed native search', () => {
  const state = createAgentState(elements);
  const step = nextAgentStep(state);
  assert.throws(() => applyAgentResult(state, step,
    { cells: step.pairs.map(rawCell), webSearchQueries: researchQueries(state) }, [], 1,
    { webSearchQueries: [], webQueryCalls: 0 }), /recherche/i);
  assert.deepEqual(state.cells, {});
  assert.equal(state.analysis.agentReview?.coverage.webSearchedPairs, 0);
});

test('unexposed query metadata falls back to one dedicated response per pair without certifying the original batch', () => {
  const state = createAgentState([...elements, { name: 'Élément Delta', type: 'symptom' }]);
  const batch = nextAgentStep(state);
  applyAgentResult(state, batch, { cells: batch.pairs.map(rawCell) }, [], 1,
    { webSearchQueries: [], webQueryCalls: 1 });
  assert.deepEqual(state.cells, {});
  assert.equal(state.analysis.agentReview?.coverage.webSearchedPairs, 0);
  assert.equal(state.batchSize, 1);
  const dedicated = nextAgentStep(state);
  applyAgentResult(state, dedicated, { cells: dedicated.pairs.map(rawCell) }, [], 1,
    { webSearchQueries: [], webQueryCalls: 1 });
  assert.equal(state.analysis.agentReview?.coverage.webSearchedPairs, 1);
  assert.equal(state.analysis.pairAssessments?.[0].searchVerification, 'dedicated_response');
  assert.match(state.analysis.pairAssessments?.[0].limitations || '', /requête.*non exposée/i);
});

test('a disclosed unrelated query cannot validate a dedicated pair', () => {
  const state = createAgentState(elements), step = nextAgentStep(state);
  assert.throws(() => applyAgentResult(state, step, { cells: step.pairs.map(rawCell) }, [], 1,
    { webSearchQueries: ['unrelated search'], webQueryCalls: 1 }), /traçabilité/i);
  assert.deepEqual(state.cells, {});
});

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
  assert.equal(request.options.model, 'gpt-6.1-sol');
  assert.equal(request.options.forceModel, true);
  assert.equal(request.options.reasoningEffort, 'low');
  assert.equal(request.options.clinicalTask, 'pair_relation_research');
  assert.equal(request.options.maxTokens, 16_384);
  assert.equal(request.options.skipClinicalBrain, undefined);
  assert.equal(request.options.webSearch?.required, true);
  assert.equal(request.options.webSearch?.searchContextSize, 'medium');
  assert.equal(state.analysis.agentReview?.pairModel, 'gpt-6.1-sol');
  assert.equal(state.analysis.agentReview?.reviewModel, ASTRA_MODEL);
  assert.equal(nextAgentStep(state).pairs.length, 1);
  while (nextAgentStep(state).kind === 'pairs') {
    const step = nextAgentStep(state);
    applyAgentResult(state, step, { cells: step.pairs.map(rawCell) }, [], 1,
      { webSearchQueries: researchQueries(state), webQueryCalls: 1 });
  }
  assert.equal(state.analysis.agentReview?.coverage.reviewedPairs, 3);
  assert.equal(state.analysis.agentReview?.coverage.webSearchedPairs, 3);
  assert.equal(nextAgentStep(state).kind, 'plan');
  assert.equal(buildAgentRequest(state, nextAgentStep(state)).options.model, ASTRA_MODEL);
});

test('persisted legacy agent jobs keep their original model when resuming an accepted response', () => {
  const state = createAgentState(elements);
  delete state.agent.pairModel;
  delete state.agent.reviewModel;
  delete state.agent.pairSearchPolicy;
  const request = buildAgentRequest(state, nextAgentStep(state));
  assert.equal(request.options.model, ASTRA_MODEL);
  assert.equal(request.options.reasoningEffort, 'high');
  assert.equal(request.options.clinicalTask, 'polypharmacy');
  assert.equal(request.options.maxTokens, 65_536);
  assert.equal(request.options.webSearch?.required, true);
  const step = nextAgentStep(state);
  applyAgentResult(state, step, { cells: step.pairs.map(rawCell) }, [], 1);
  assert.equal(state.analysis.agentReview?.pairModel, ASTRA_MODEL);
});

test('independent scheduled pair batches can finish out of order without skipping coverage or borrowing sources', () => {
  const state = createAgentState(elements);
  const pair = buildPairCandidates(elements)[2];
  const step = { kind: 'pairs' as const, pairs: [pair] };
  assert.throws(() => applyAgentResult(state, step, { cells: [rawCell(pair)] }, [], 1), /incohérente/);
  applyAgentResult(state, step, { cells: [rawCell(pair)] }, [], 1, { independentPairs: true,
    webQueryCalls: 1, webSearchQueries: JSON.parse(buildAgentRequest(state, step).user).pairs.map((item: { researchQuery: string }) => item.researchQuery) });
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
    applyAgentResult(state, step, { cells: step.pairs.map(rawCell) }, [], 1,
      { webSearchQueries: researchQueries(state), webQueryCalls: 1 });
  }
  applyAgentResult(state, nextAgentStep(state), plan, [source], 1);
  assert.equal(nextAgentStep(state).kind, 'candidate_pairs');
  assert.equal(state.analysis.agentReview?.coverage.candidatePairs, 3);
  assert.equal(state.analysis.agentReview?.stage, 'candidate_pairs');
  assert.equal(buildAgentRequest(state, nextAgentStep(state)).options.model, 'gpt-6.1-sol');
  assert.equal(buildAgentRequest(state, nextAgentStep(state)).options.reasoningEffort, 'low');
  assert.equal(nextAgentStep(state).pairs.every(p => [p.left.name,p.right.name].includes(candidate.name)), true);
});
