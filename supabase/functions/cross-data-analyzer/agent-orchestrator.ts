import type { AICallOptions } from '../_shared/ai-client.ts';
import { buildPairCandidates, ensureAnalysisShape, typedElementKey, type AnalysisResult, type PairAssessment, type PairCandidate, type SelectedElement } from './analysis-utils.ts';
import { pendingPairs, type MatrixCells } from './matrix-progress.ts';
import { RELATION_ENGINE_VERSION } from './relation-contract.ts';
import { ASTRA_MODEL, AGENT_VERSION, MEDICAL_WEB_DOMAINS, buildAgentPairFormat, AGENT_PLAN_FORMAT,
  AGENT_PAIR_PROMPT, AGENT_PLAN_PROMPT, AGENT_FINAL_PROMPT, readAgentCells, readAgentPlan, verifiedAgentSources,
  type AgentSource, type AgentPlan, type AgentStage } from './agent-contract.ts';

export interface AgentRuntimeState {
  version: number; stage: AgentStage; candidates: SelectedElement[]; candidateCells: MatrixCells;
  candidateAssessments: PairAssessment[]; sourceRegistry: AgentSource[]; draftPlan?: AgentPlan;
}
export interface AgentMatrixState {
  elements: SelectedElement[]; cells: MatrixCells; batchSize: number; analysis: AnalysisResult;
  agent: AgentRuntimeState;
}
export interface AgentStep { kind: Exclude<AgentStage, 'completed'>; pairs: PairCandidate[] }

const AGENT_PAIR_BATCH_SIZE = 4;

export function createAgentState(elements: SelectedElement[]): AgentMatrixState {
  // Analyze several pairs per provider response while keeping pair-specific citations and structured cells.
  // This removes the dominant sequential latency without reducing reasoning effort or web-search requirements.
  const state: AgentMatrixState = { elements, cells: {}, batchSize: AGENT_PAIR_BATCH_SIZE,
    analysis: ensureAnalysisShape({ engineVersion: RELATION_ENGINE_VERSION, summary: 'Recherche spécialisée et analyse croisée par GPT-6 Astra.' }),
    agent: { version: AGENT_VERSION, stage: 'pairs', candidates: [], candidateCells: {}, candidateAssessments: [], sourceRegistry: [] } };
  updateAgentCoverage(state);
  return state;
}

export function candidatePairs(state: AgentMatrixState): PairCandidate[] {
  const candidates = new Set(state.agent.candidates.map(typedElementKey));
  return buildPairCandidates([...state.elements, ...state.agent.candidates]).filter(pair =>
    candidates.has(typedElementKey(pair.left)) || candidates.has(typedElementKey(pair.right)));
}
export function nextAgentStep(state: AgentMatrixState): AgentStep {
  if (state.agent.version !== AGENT_VERSION) throw new Error('Version de l’agent incompatible : relancez une nouvelle analyse.');
  const unfinished = pendingPairs(state.elements, state.cells);
  if (unfinished.length) return { kind: 'pairs', pairs: unfinished.slice(0, state.batchSize) };
  if (!state.agent.draftPlan) return { kind: 'plan', pairs: [] };
  const remaining = candidatePairs(state).filter(pair => !Object.hasOwn(state.agent.candidateCells, pair.pairHash));
  if (remaining.length) return { kind: 'candidate_pairs', pairs: remaining.slice(0, state.batchSize) };
  return { kind: 'final', pairs: [] };
}

function updateAgentCoverage(state: AgentMatrixState) {
  const assessments = state.analysis.pairAssessments || [];
  state.analysis.agentReview = { model: ASTRA_MODEL, stage: state.agent.stage,
    coverage: { totalPairs: buildPairCandidates(state.elements).length, reviewedPairs: Object.keys(state.cells).length,
      webSearchedPairs: assessments.length, uncertainPairs: assessments.filter(item => item.verdict !== 'cited_relation' || item.evidenceSupport !== 'direct').length,
      candidatePairs: candidatePairs(state).length, reviewedCandidatePairs: Object.keys(state.agent.candidateCells).length },
    ...(state.analysis.agentReview?.plan ? { plan: state.analysis.agentReview.plan } : {}) };
}

/** All pairs and all risk links are included. Only prose is compacted, never the set of pairs. */
export function globalAgentInput(state: AgentMatrixState) {
  const compact = (assessment: PairAssessment) => ({ pairHash: assessment.pairHash, verdict: assessment.verdict,
    explanation: assessment.explanation.slice(0, 600), limitations: assessment.limitations.slice(0, 350),
    directions: assessment.directions?.map(d => ({ ...d, explanation: d.explanation.slice(0, 350), limitations: d.limitations.slice(0, 200) })) });
  const compactLinks = (cells: MatrixCells) => Object.entries(cells).map(([pairHash, links]) => ({ pairHash, links: links.map(link => ({
    from: typedElementKey({ name: link.from, type: link.fromType }), to: typedElementKey({ name: link.to, type: link.toType }),
    kind: link.relationKind, support: link.evidenceSupport, evidence: link.evidence.slice(0, 600), danger: link.dangerLevel,
    interactionEffect: link.interactionEffect, limitations: link.contextLimitations, sourceUrls: link.webSources,
  })) }));
  return { selection: state.elements, assessments: (state.analysis.pairAssessments || []).map(compact), warnings: state.analysis.warnings,
    findings: compactLinks(state.cells), candidates: state.agent.candidates,
    candidateAssessments: state.agent.candidateAssessments.map(compact), candidateFindings: compactLinks(state.agent.candidateCells),
    draftPlan: state.agent.draftPlan, sourceRegistry: state.agent.sourceRegistry,
    coverage: state.analysis.agentReview?.coverage,
    context: 'Sélection de concepts médicaux uniquement. Pas de dossier individuel complet ; âge, doses, allergies, biologie et chronologie ne sont pas établis.' };
}

export function buildAgentRequest(state: AgentMatrixState, step: AgentStep): { system: string; user: string; options: AICallOptions } {
  const pairStep = step.kind === 'pairs' || step.kind === 'candidate_pairs';
  const final = step.kind === 'final';
  const payload = pairStep ? { pairs: step.pairs.map(pair => ({ pair: { ...pair, leftKey: typedElementKey(pair.left), rightKey: typedElementKey(pair.right) } })),
    selectionContext: [...state.elements, ...state.agent.candidates].map(e => ({ ...e, key: typedElementKey(e) })),
    purpose: step.kind === 'candidate_pairs' ? 'Vérification de la paire planifiée ; les candidats ne sont pas déjà prescrits.' : 'Analyse de la paire planifiée dans le cadre de la revue exhaustive de la sélection.' }
    : globalAgentInput(state);
  const user = JSON.stringify(payload);
  // Do not silently omit low-ranked pairs to fit a context window.
  if (user.length > (final ? 1_800_000 : 350_000)) throw new Error('La synthèse dépasse le contexte prévu ; réduisez la sélection ou reprenez une analyse plus ciblée.');
  return { system: pairStep ? AGENT_PAIR_PROMPT : final ? AGENT_FINAL_PROMPT : AGENT_PLAN_PROMPT, user,
    options: { model: ASTRA_MODEL, forceModel: true, reasoningEffort: final ? 'xhigh' : 'high',
      clinicalTask: final ? 'final_safety_review' : pairStep ? 'polypharmacy' : 'treatment_complex',
      maxTokens: 65_536, responseFormat: pairStep ? buildAgentPairFormat(step.pairs) : AGENT_PLAN_FORMAT,
      elementCount: state.elements.length + state.agent.candidates.length, hasExternalEvidence: state.agent.sourceRegistry.length > 0,
      ...(final ? {} : { webSearch: { allowedDomains: MEDICAL_WEB_DOMAINS, required: true,
        searchContextSize: 'high' as const, externalWebAccess: true, maxToolCalls: pairStep ? Math.min(32, Math.max(16, step.pairs.length * 4)) : 20 } }) } };
}

export function applyAgentResult(state: AgentMatrixState, step: AgentStep, raw: unknown, returnedSources: AgentSource[], webSearchCalls: number): boolean {
  const expected = nextAgentStep(state);
  if (state.agent.stage === 'completed' || step.kind !== expected.kind ||
    step.pairs.map(p => p.pairHash).join('\n') !== expected.pairs.map(p => p.pairHash).join('\n'))
    throw new Error('Étape de l’agent incohérente ou couverture incomplète.');
  const parsed = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const sources = verifiedAgentSources(returnedSources);
  // A batch may cite only its own actual tool trace. The global registry is used by the final review.
  if (step.kind !== 'final' && webSearchCalls < 1) throw new Error('Réponse sans recherche web exécutée.');
  if (step.kind === 'pairs' || step.kind === 'candidate_pairs') {
    const result = readAgentCells(parsed.cells, step.pairs, sources, webSearchCalls);
    if (!result.assessments.length) throw new Error('Réponse IA sans cellule complète et ses deux directions.');
    const target = step.kind === 'pairs' ? state.cells : state.agent.candidateCells;
    Object.assign(target, result.cells);
    const reviewed = new Set(result.assessments.map(a => a.pairHash));
    if (step.kind === 'pairs') {
      state.analysis.pairAssessments = [...(state.analysis.pairAssessments || []).filter(a => !reviewed.has(a.pairHash)), ...result.assessments];
      state.analysis.causalLinks = Object.values(state.cells).flat();
    } else state.agent.candidateAssessments = [...state.agent.candidateAssessments.filter(a => !reviewed.has(a.pairHash)), ...result.assessments];
    for (const assessment of result.assessments) {
      const pair = step.pairs.find(p => p.pairHash === assessment.pairHash)!;
      const urls = new Set([...(result.cells[pair.pairHash] || []).flatMap(link => link.webSources),
        ...(assessment.directions || []).flatMap(d => d.sourceUrls)]);
      state.analysis.webResearch = state.analysis.webResearch.filter(r => r.pairHash !== pair.pairHash);
      state.analysis.webResearch.push({ pairHash: pair.pairHash, query: `${pair.left.name} × ${pair.right.name}`,
        status: urls.size ? 'matched' : 'empty', retrievedAt: new Date().toISOString(),
        providers: [{ name: 'OpenAI web_search', status: urls.size ? 'matched' : 'empty', count: urls.size }],
        findings: [assessment.explanation], sources: sources.filter(s => urls.has(s.url)) });
    }
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter((w): w is string => typeof w === 'string').map(w => w.slice(0, 1600)) : [];
    state.analysis.warnings = [...new Set([...state.analysis.warnings, ...warnings])];
  } else {
    const available = step.kind === 'final' ? state.agent.sourceRegistry : verifiedAgentSources([...state.agent.sourceRegistry, ...sources]);
    const plan = readAgentPlan(parsed, available, state.elements, step.kind === 'final' ? state.agent.candidates : undefined);
    if (step.kind === 'plan') {
      state.agent.draftPlan = plan;
      state.agent.candidates = plan.candidates;
    }
    state.analysis.agentReview!.plan = plan;
    if (step.kind === 'final') {
      state.agent.stage = 'completed';
      state.analysis.summary = plan.summary;
      state.analysis.recommendations = plan.options.flatMap(o => o.requiredChecks);
      state.analysis.warnings = [...new Set([...state.analysis.warnings, ...plan.globalRisks])];
    }
  }
  const referenced = new Set([
    ...state.analysis.causalLinks.flatMap(link => link.webSources),
    ...Object.values(state.agent.candidateCells).flatMap(links => links.flatMap(link => link.webSources)),
    ...[...(state.analysis.pairAssessments || []), ...state.agent.candidateAssessments].flatMap(a => (a.directions || []).flatMap(d => d.sourceUrls)),
    ...[state.agent.draftPlan, state.analysis.agentReview?.plan].flatMap(plan => (plan?.options || []).flatMap(o => [...o.sourceUrls, ...o.changes.flatMap(c => c.sourceUrls)])),
  ]);
  state.agent.sourceRegistry = verifiedAgentSources([...state.agent.sourceRegistry, ...sources]).filter(source => referenced.has(source.url));
  const complete = state.agent.stage === 'completed';
  if (!complete) state.agent.stage = nextAgentStep(state).kind;
  updateAgentCoverage(state);
  if (!complete) state.analysis.summary = agentProgress(state).message;
  return complete;
}

export function agentProgress(state: AgentMatrixState): { message: string; percentage: number } {
  const c = state.analysis.agentReview!.coverage;
  const original = `${c.reviewedPairs} / ${c.totalPairs} paires analysées dans les deux sens`;
  const stage = state.agent.stage;
  if (stage === 'completed') return { message: `${original} · revue finale terminée, validation médicale requise.`, percentage: 100 };
  if (stage === 'pairs') return { message: `GPT-6 Astra · ${original} · recherche spécialisée en cours.`, percentage: Math.floor(65 * c.reviewedPairs / Math.max(1, c.totalPairs)) };
  if (stage === 'plan') return { message: `${original} · recherche de pistes d’optimisation et revue globale.`, percentage: 68 };
  if (stage === 'candidate_pairs') return { message: `${original} · alternatives : ${c.reviewedCandidatePairs} / ${c.candidatePairs} croisements vérifiés.`, percentage: 72 + Math.floor(20 * c.reviewedCandidatePairs / Math.max(1, c.candidatePairs)) };
  return { message: `${original} · revue finale des bénéfices, interactions et risques résiduels.`, percentage: 96 };
}
