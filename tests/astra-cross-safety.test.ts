import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPairCandidates, typedElementKey, type PairCandidate, type SelectedElement } from '../supabase/functions/cross-data-analyzer/analysis-utils.ts';
import { readAgentCells, readAgentPlan, type AgentPlanChange } from '../supabase/functions/cross-data-analyzer/agent-contract.ts';
import { applyAgentResult, candidatePairs, createAgentState, globalAgentInput, nextAgentStep } from '../supabase/functions/cross-data-analyzer/agent-orchestrator.ts';

const selected: SelectedElement[] = [
  { name: 'Traitement A oral', type: 'medication' },
  { name: 'Pathologie alpha', type: 'pathology' },
];
const source = {
  title: 'Notice synthétique pour test de traçabilité',
  url: 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=synthetic-safety-test',
};
const dedicatedSearchTrace = { webSearchQueries: [], webQueryCalls: 1 };

function rawCell(pair: PairCandidate) {
  return {
    pairHash: pair.pairHash,
    links: [] as Record<string, unknown>[],
    directions: [[pair.left, pair.right], [pair.right, pair.left]].map(([from, to]) => ({
      fromKey: typedElementKey(from), toKey: typedElementKey(to), verdict: 'insufficient',
      explanation: 'Le lien reste insuffisamment documenté dans ce contexte.',
      limitations: 'La sélection ne constitue pas un dossier clinique complet.', sourceUrls: [] as string[],
    })),
  };
}

function change(action: AgentPlanChange['action'], target: string, replacement: string | null): AgentPlanChange {
  return { action, target, replacement, rationale: 'Discussion clinique conditionnelle et sourcée.', sourceUrls: [source.url] };
}

function rawPlan(changes: AgentPlanChange[], candidates: SelectedElement[] = []) {
  return {
    status: 'review_required', summary: 'Une option conditionnelle reste à discuter avec le prescripteur.',
    globalRisks: ['Contexte individuel incomplet.'], missingData: ['Chronologie à préciser.'], candidates,
    options: [{
      id: 'option-one', title: 'Option à examiner', rationale: 'Revue des indications et des risques.',
      expectedBenefits: ['Bénéfice à confirmer.'], residualRisks: ['Risque résiduel à vérifier.'],
      monitoring: ['Surveillance clinique à définir.'], requiredChecks: ['Validation médicale.'],
      sourceUrls: [source.url], changes,
    }],
  };
}

const noChangePlan = () => ({
  status: 'no_change_supported', summary: 'Aucune modification suffisamment étayée dans cette revue.',
  globalRisks: [], missingData: ['Contexte individuel non disponible.'], candidates: [], options: [],
});

test('a final plan cannot smuggle an unaudited replacement through another action', () => {
  for (const action of ['discuss_adjust', 'discuss_add', 'discuss_withdraw', 'monitor', 'maintain'] as const) {
    assert.throws(() => readAgentPlan(
      rawPlan([change(action, selected[0].name, 'Molécule non auditée')]), [source], selected, [],
    ), `The replacement field must not bypass candidate auditing through ${action}`);
  }
  const audited: SelectedElement = { name: 'Candidat B oral', type: 'medication' };
  const valid = readAgentPlan(rawPlan([change('discuss_replace', selected[0].name, audited.name)], [audited]),
    [source], selected, [audited]);
  assert.equal(valid.options[0].changes[0].replacement, audited.name);
});

test('a monitoring action cannot introduce an unknown medicine into the final structured plan', () => {
  assert.throws(() => readAgentPlan(rawPlan([change('monitor', 'Molécule inconnue non auditée', null)]),
    [source], selected, []));
  const valid = readAgentPlan(rawPlan([change('monitor', selected[0].name, null)]), [source], selected, []);
  assert.equal(valid.options[0].changes[0].target, selected[0].name);
});

test('punctuation variants use the same identity when retaining every active candidate for cross-checking', () => {
  const candidates: SelectedElement[] = [
    { name: 'Candidat-B', type: 'medication' },
    { name: 'Candidat-C', type: 'medication' },
    { name: 'Candidat-D', type: 'medication' },
    { name: 'Candidat-E', type: 'treatment' },
  ];
  const plan = rawPlan([
    change('discuss_replace', selected[0].name, 'Candidat B'),
    change('discuss_add', 'Candidat C', null),
  ], candidates);
  plan.options.push({ ...plan.options[0], id: 'option-two', title: 'Deuxième option', changes: [
    change('discuss_replace', selected[0].name, 'Candidat D'),
    change('discuss_add', 'Candidat E', null),
  ] });
  const parsed = readAgentPlan(plan, [source], selected);
  assert.deepEqual(new Set(parsed.candidates.map(typedElementKey)), new Set(candidates.map(typedElementKey)));

  const state = createAgentState(selected);
  state.agent.candidates = parsed.candidates;
  const pairs = candidatePairs(state);
  assert.equal(pairs.length, candidates.length * selected.length + candidates.length * (candidates.length - 1) / 2);
  assert.equal(new Set(pairs.map(pair => pair.pairHash)).size, pairs.length);
  for (const candidate of candidates) {
    const key = typedElementKey(candidate);
    assert.equal(pairs.filter(pair => [pair.left, pair.right].some(item => typedElementKey(item) === key)).length,
      selected.length + candidates.length - 1);
  }
});

test('a final result cannot complete a state whose original selection is still unreviewed', () => {
  const state = createAgentState(selected);
  state.agent.draftPlan = readAgentPlan(noChangePlan(), [], selected);
  state.agent.stage = 'final';
  assert.throws(() => applyAgentResult(state, { kind: 'final', pairs: [] }, noChangePlan(), [], 0));
  assert.notEqual(state.agent.stage, 'completed');
  assert.equal(Object.keys(state.cells).length, 0);
});

test('a final result cannot complete before all candidate crossings have been reviewed', () => {
  const candidate: SelectedElement = { name: 'Candidat B oral', type: 'medication' };
  const state = createAgentState(selected);
  const originalStep = nextAgentStep(state);
  applyAgentResult(state, originalStep, { cells: originalStep.pairs.map(rawCell) }, [], 1, dedicatedSearchTrace);
  applyAgentResult(state, nextAgentStep(state), rawPlan([change('discuss_replace', selected[0].name, candidate.name)], [candidate]), [source], 1);
  assert.equal(state.agent.stage, 'candidate_pairs');
  assert.equal(candidatePairs(state).length, selected.length);
  assert.throws(() => applyAgentResult(state, { kind: 'final', pairs: [] }, noChangePlan(), [], 0));
  assert.notEqual(state.agent.stage, 'completed');
});

test('a fully reviewed selection can finish without inventing a therapeutic change', () => {
  const state = createAgentState(selected);
  const originalStep = nextAgentStep(state);
  applyAgentResult(state, originalStep, { cells: originalStep.pairs.map(rawCell) }, [], 1, dedicatedSearchTrace);
  assert.equal(nextAgentStep(state).kind, 'plan');
  applyAgentResult(state, nextAgentStep(state), noChangePlan(), [], 1);
  assert.equal(nextAgentStep(state).kind, 'final');
  assert.equal(applyAgentResult(state, nextAgentStep(state), noChangePlan(), [], 0), true);
  assert.equal(state.agent.stage, 'completed');
  assert.equal(state.analysis.agentReview?.coverage.reviewedPairs, 1);
  assert.equal(state.analysis.agentReview?.coverage.webSearchedPairs, 1);
  assert.deepEqual(state.analysis.agentReview?.plan?.options, []);
});

test('cumulative-risk warnings from pair reviews reach the global review without losing later alerts', () => {
  const state = createAgentState([...selected, { name: 'Symptôme bêta', type: 'symptom' }]);
  const first = nextAgentStep(state);
  assert.equal(first.pairs.length, 1, 'One native research response must own one pair');
  const notes = Array.from({ length: 100 }, (_, index) => `Limite contextuelle ${index + 1}.`);
  applyAgentResult(state, first, { cells: first.pairs.map(rawCell), warnings: notes }, [], 1, dedicatedSearchTrace);
  const later = nextAgentStep(state);
  const critical = 'Risque cumulatif majeur impliquant les trois éléments : réévaluation nécessaire.';
  applyAgentResult(state, later, { cells: later.pairs.map(rawCell), warnings: [critical] }, [], 1, dedicatedSearchTrace);
  assert.ok(state.analysis.warnings.includes(critical), 'Later risk warnings must survive persistence');
  assert.ok(JSON.stringify(globalAgentInput(state)).includes(critical), 'The final reviewer must receive cumulative risks from earlier steps');
});

test('a symptom predating exposure cannot retain a direct adverse-effect attribution or affirmative causal text', () => {
  const [pair] = buildPairCandidates([selected[0], { name: 'Symptôme bêta', type: 'symptom' }]);
  const cell = rawCell(pair);
  const causalClaim = 'Le traitement A oral a provoqué le symptôme bêta.';
  cell.directions[0] = { ...cell.directions[0], verdict: 'cited_relation', explanation: causalClaim, sourceUrls: [source.url] };
  cell.links.push({
    fromKey: typedElementKey(pair.left), toKey: typedElementKey(pair.right), relationKind: 'adverse_effect',
    evidence: causalClaim, sourceUrls: [source.url], confidence: 'high', evidenceSupport: 'direct',
    context: { condition: 'same', route: 'same', population: 'same', temporality: 'before_exposure' },
    contextLimitations: [], dangerLevel: 'high', interactionEffect: 'unknown',
  });
  const parsed = readAgentCells([cell], [pair], [source], 1);
  const link = parsed.cells[pair.pairHash]?.[0];
  assert.ok(link, 'Preserve the contextual relation and its provenance');
  assert.equal(link.evidenceSupport, 'contextual');
  assert.notEqual(link.evidence, causalClaim);
  assert.doesNotMatch(link.evidence, /a provoqué|a causé/);
  assert.doesNotMatch(parsed.assessments[0].explanation, /a provoqué|a causé/);
  assert.doesNotMatch(JSON.stringify(parsed.assessments[0].directions), /a provoqué|a causé/);
  assert.deepEqual(link.webSources, [source.url]);
});

test('a final option cannot silently lose a dependent action whose source is missing from the native trace', () => {
  const concurrent: SelectedElement = { name: 'Traitement associé C', type: 'medication' };
  const candidate: SelectedElement = { name: 'Candidat B oral', type: 'medication' };
  const plan = rawPlan([
    change('discuss_replace', selected[0].name, candidate.name),
    change('discuss_withdraw', concurrent.name, null),
  ], [candidate]);
  plan.options[0].rationale = 'Cette option synthétique exige conjointement le remplacement et le retrait de C.';
  plan.options[0].residualRisks = ['Dans ce scénario fictif, B ne doit pas être associé à C.'];
  const untraced = 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=not-in-native-trace';
  const missingActionSource = structuredClone(plan);
  missingActionSource.options[0].changes[1].sourceUrls = [untraced];
  assert.throws(() => readAgentPlan(missingActionSource, [source], [...selected, concurrent], [candidate]),
    'An indivisible final option must not keep the substitution after silently dropping its required withdrawal');
  const missingOptionSource = structuredClone(plan);
  missingOptionSource.options[0].sourceUrls = [untraced];
  assert.throws(() => readAgentPlan(missingOptionSource, [source], [...selected, concurrent], [candidate]),
    'A missing option-level source must not leave an affirmative final summary with a silently removed option');
  const valid = readAgentPlan(plan, [source], [...selected, concurrent], [candidate]);
  assert.equal(valid.options[0].changes.length, 2);
});

test('a directly sourced non-pharmacological treatment keeps its indication when drug route is not applicable', () => {
  const rehabilitation: SelectedElement = { name: 'Rééducation respiratoire', type: 'treatment' };
  const [pair] = buildPairCandidates([rehabilitation, selected[1]]);
  const cell = rawCell(pair);
  cell.directions[0] = { ...cell.directions[0], verdict: 'cited_relation',
    explanation: 'Cette indication directe est une donnée synthétique de test.', sourceUrls: [source.url] };
  cell.links.push({
    fromKey: typedElementKey(rehabilitation), toKey: typedElementKey(selected[1]), relationKind: 'indication',
    evidence: 'Une source synthétique décrit directement cette intervention non médicamenteuse.',
    sourceUrls: [source.url], confidence: 'high', evidenceSupport: 'direct',
    context: { condition: 'same', route: 'not_applicable', population: 'same', temporality: 'not_reported' },
    contextLimitations: ['Exemple de test uniquement.'], dangerLevel: 'unknown', interactionEffect: 'unknown',
  });
  const parsed = readAgentCells([cell], [pair], [source], 1);
  assert.equal(parsed.cells[pair.pairHash]?.[0]?.evidenceSupport, 'direct',
    'A non-drug intervention must not lose a directly sourced indication solely because no administration route applies');
});

test('a sourced positive direction without its typed relation cannot mark the pair as completed', () => {
  const state = createAgentState(selected);
  const step = nextAgentStep(state);
  const cell = rawCell(step.pairs[0]);
  cell.directions[0] = { ...cell.directions[0], verdict: 'cited_relation',
    explanation: 'Le traitement est indiqué pour cette pathologie dans la source synthétique.',
    sourceUrls: [source.url] };
  assert.throws(() => applyAgentResult(state, step, { cells: [cell], warnings: [] }, [source], 1, dedicatedSearchTrace),
    'A cited direction must not disappear from the graph while the backend counts its pair as reviewed');
  assert.equal(Object.keys(state.cells).length, 0);
  assert.equal(state.analysis.agentReview?.coverage.reviewedPairs, 0);
  assert.equal(state.analysis.agentReview?.coverage.webSearchedPairs, 0);
  assert.equal(nextAgentStep(state).kind, 'pairs');
});

test('an untraced worsening mechanism leaves explicit uncertainty without discarding the sourced indication or repeating the pair', () => {
  const state = createAgentState(selected);
  const step = nextAgentStep(state);
  const pair = step.pairs[0];
  const cell = rawCell(pair);
  const untraced = 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=untraced-worsening';
  const unsupportedClaim = 'Le traitement A oral est indiqué et aggrave avec certitude la pathologie alpha.';
  cell.directions[0] = { ...cell.directions[0], verdict: 'cited_relation',
    explanation: unsupportedClaim, sourceUrls: [source.url, untraced] };
  const indication = {
    fromKey: typedElementKey(pair.left), toKey: typedElementKey(pair.right), relationKind: 'indication',
    evidence: 'La notice synthétique décrit cette indication directement.', sourceUrls: [source.url],
    confidence: 'high', evidenceSupport: 'direct',
    context: { condition: 'same', route: 'same', population: 'same', temporality: 'not_reported' },
    contextLimitations: ['Scénario synthétique uniquement.'], dangerLevel: 'unknown', interactionEffect: 'unknown',
  };
  cell.links.push(indication, { ...indication, relationKind: 'disease_worsening',
    evidence: 'Le traitement aggrave avec certitude cette pathologie dans ce scénario fictif.',
    sourceUrls: [untraced], dangerLevel: 'high' });

  applyAgentResult(state, step, { cells: [cell], warnings: [] }, [source], 1, dedicatedSearchTrace);
  const links = state.cells[pair.pairHash];
  assert.equal(links.length, 1, 'Only the independently traced clinical finding may become an edge');
  assert.equal(links[0].relationKind, 'indication', 'The valid indication must survive a separate unsupported mechanism');
  assert.equal(links[0].evidenceSupport, 'direct');
  assert.deepEqual(links[0].webSources, [source.url]);
  assert.equal(links[0].dangerLevel, undefined, 'A dropped unsourced risk must not contaminate the retained indication');
  assert.equal(state.analysis.agentReview?.coverage.reviewedPairs, 1);
  assert.equal(state.analysis.agentReview?.coverage.webSearchedPairs, 1);
  assert.equal(nextAgentStep(state).kind, 'plan', 'Record the partial review without paying for an automatic repeat of the pair');
  assert.equal(state.analysis.agentReview?.coverage.uncertainPairs, 1,
    'A second unsupported mechanism must remain visible in the pair uncertainty count');
  const assessment = state.analysis.pairAssessments![0];
  const direction = assessment.directions!.find(item => item.fromKey === typedElementKey(pair.left))!;
  assert.notEqual(direction.verdict, 'cited_relation', 'The combined narrative is only partially supported');
  assert.doesNotMatch(assessment.explanation, /aggrave avec certitude/);
  assert.doesNotMatch(direction.explanation, /aggrave avec certitude/);
  const limitations = `${assessment.limitations} ${direction.limitations}`;
  assert.match(limitations, /source.*traçable|traçable.*source/i);
  assert.match(limitations, /(?:aucune|pas de|ne permet[^.]*).*s[ée]curit[ée]/i,
    'An omitted risk mechanism must never become an implicit conclusion of safety');
});
