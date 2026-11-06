import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as grouping from '../src/components/patient/crossGraphGroups.ts';
import * as contract from '../supabase/functions/cross-data-analyzer/relation-contract.ts';
import * as display from '../src/components/patient/crossDataDisplay.ts';
import * as analysisUtils from '../supabase/functions/cross-data-analyzer/analysis-utils.ts';
import * as terminology from '../supabase/functions/_shared/medical-terminology.ts';

type Tree = { type: unknown; props: Record<string, unknown> };
type Hook = { value?: unknown; setter?: (next: unknown) => void; deps?: unknown[]; cleanup?: () => void };

/** Exercise the actual component's hooks/projection without a DOM or live DB.
 * The small hook driver deliberately batches effects before the next render,
 * which catches selection/grouping races hidden by helper-only tests. */
function mountGraph(initialProps: Record<string, unknown>, options: {
  component?: 'CrossDataAnalyzer' | 'RelationshipMatrix'; readJob?: () => unknown; submit?: (action: string, body: unknown) => Promise<void>;
} = {}) {
  const hooks: Hook[] = [];
  let index = 0, dirty = true;
  let effects: Array<() => void> = [];
  let props = initialProps;
  let tree: Tree;
  const changed = (before: unknown[] | undefined, after: unknown[]) => !before || before.length !== after.length || after.some((value, i) => !Object.is(value, before[i]));
  const react = {
    useState(initial: unknown) {
      const slot = index++;
      if (!hooks[slot]) hooks[slot] = { value: typeof initial === 'function' ? initial() : initial };
      const hook = hooks[slot];
      if (!hook.setter) hook.setter = next => {
        const value = typeof next === 'function' ? next(hook.value) : next;
        if (!Object.is(hook.value, value)) { hook.value = value; dirty = true; }
      };
      return [hook.value, hook.setter] as const;
    },
    useRef(initial: unknown) {
      const slot = index++;
      if (!hooks[slot]) hooks[slot] = { value: { current: initial } };
      return hooks[slot].value;
    },
    useMemo<T>(factory: () => T, deps: unknown[]): T {
      const slot = index++;
      const hook = hooks[slot] ?? (hooks[slot] = {});
      if (changed(hook.deps, deps)) { hook.value = factory(); hook.deps = [...deps]; }
      return hook.value as T;
    },
    useCallback<T>(callback: T, deps: unknown[]) { return react.useMemo(() => callback, deps); },
    useEffect(effect: () => void | (() => void), deps: unknown[]) {
      const slot = index++;
      const hook = hooks[slot] ?? (hooks[slot] = {});
      if (changed(hook.deps, deps)) {
        hook.deps = [...deps];
        effects.push(() => { hook.cleanup?.(); hook.cleanup = effect() || undefined; });
      }
    },
  };
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const flowState = (initial: unknown[]) => {
    const [value, setter] = react.useState(initial);
    const onChange = react.useCallback((changes: Array<{ id: string; type: string; position?: unknown }>) => setter((previous: Array<Record<string, unknown>>) =>
      previous.map(node => {
        const change = changes.find(change => change.id === node.id && change.type === 'position');
        return change ? { ...node, position: change.position } : node;
      })), [setter]);
    return [value, setter, onChange];
  };
  const components = new Proxy({}, { get: (_target, name) => String(name) });
  const componentName = options.component || 'RiskNetworkGraph';
  const source = readFileSync(new URL(`../src/components/patient/${componentName}.tsx`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} as Record<string, (props: Record<string, unknown>) => Tree> };
  runInNewContext(compiled, {
    module, exports: module.exports, URL, console: { log() {}, error() {} },
    setTimeout: () => 1, clearTimeout() {},
    require(name: string) {
      if (name === 'react') return react;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' };
      if (name === '@xyflow/react') return { ...components, ReactFlow: 'ReactFlow',
        useNodesState: flowState, useEdgesState: flowState, MarkerType: { ArrowClosed: 'arrow' },
        BackgroundVariant: { Dots: 'dots' }, Position: { Top: 'top', Bottom: 'bottom' } };
      if (name.endsWith('.css')) return {};
      if (name === './crossGraphGroups') return grouping;
      if (name === './crossDataDisplay') return display;
      if (name.endsWith('/relation-contract')) return contract;
      if (name.endsWith('/analysis-utils')) return analysisUtils;
      if (name.endsWith('/medical-terminology')) return terminology;
      if (name === './RiskNetworkGraph') return { RiskNetworkGraph: 'RiskNetworkGraph' };
      if (name === './AgentCrossAnalysisPanel') return { AgentCrossAnalysisPanel: 'AgentCrossAnalysisPanel' };
      if (name === './RelationshipMatrix' || name === './VideoLoader' || name === 'react-virtuoso') return components;
      if (name === '@/contexts/TranslationContext') return { useAutoTranslation: () => ({ t: (value: string) => value }) };
      if (name === '@/contexts/AIContext') return { useAI: () => ({ invokeAI: async () => { throw new Error('No AI call allowed'); } }) };
      if (name === '@/hooks/useCrossMatrix') return { useCrossMatrix: () => ({ job: options.readJob?.() ?? null, busy: false, error: null,
        submit: options.submit || (async () => { throw new Error('No launch allowed'); }) }) };
      if (name === '@/hooks/useMedicalStats') return { default: () => ({ stats: null }) };
      if (name === '@/lib/aiJobs') return { resolveAIJob: async () => { throw new Error('No legacy job allowed'); } };
      if (name === '@/integrations/supabase/client') return { supabase: {
        from: () => ({ select: () => {
          const query = { order: () => query, range: async () => ({ data: [] }),
            then: (resolve: (value: {data: unknown[]}) => unknown) => Promise.resolve({ data: [] }).then(resolve) };
          return query;
        } }),
        functions: { invoke: () => { throw new Error('Graph must delegate to the parent Astra workflow'); } },
      } };
      if (name === 'sonner') return { toast: { error() {}, success() {}, info() {}, warning() {} } };
      if (name.startsWith('@/components/ui/') || name === 'lucide-react') return components;
      throw new Error('Unexpected graph dependency: ' + name);
    },
  }, { filename: 'RiskNetworkGraph.tsx' });

  return {
    async flush() {
      for (let pass = 0; pass < 35 && dirty; pass++) {
        dirty = false; index = 0; effects = [];
        tree = (module.exports[componentName] || module.exports.default)(props);
        effects.forEach(effect => effect());
        await new Promise<void>(resolve => setImmediate(resolve));
      }
      assert.equal(dirty, false, 'The graph must settle without a rendering loop');
      return tree;
    },
    update(next: Record<string, unknown>) { props = { ...props, ...next }; dirty = true; },
  };
}

function descendants(node: unknown): Tree[] {
  if (Array.isArray(node)) return node.flatMap(descendants);
  if (!node || typeof node !== 'object' || !('props' in node)) return [];
  const item = node as Tree;
  return [item, ...descendants(item.props.children)];
}
function textContent(node: unknown): string {
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (node && typeof node === 'object' && 'props' in node) return textContent((node as Tree).props.children);
  return typeof node === 'string' ? node : '';
}
const normalized = <T>(value: T): T => JSON.parse(JSON.stringify(value));

function matrixCell(tree: Tree, row: number, column: number): Tree {
  const body = descendants(tree).find(item => item.type === 'TableBody')!;
  const rows = descendants(body).filter(item => item.type === 'TableRow');
  return descendants(rows[row]).filter(item => item.type === 'TableCell')[column + 1];
}

function matrixFixture(links: Array<Record<string, unknown>>, directions: Array<Record<string, unknown>> = []) {
  const elements = [{ name: 'Traitement A', type: 'medication' as const }, { name: 'Traitement B', type: 'medication' as const }];
  const pairHash = analysisUtils.buildPairHash(elements[0].name, elements[0].type, elements[1].name, elements[1].type);
  return {
    pathologies: [], symptoms: [], treatments: [], medications: [],
    selectedPathologies: [], selectedSymptoms: [], selectedTreatments: [], selectedMedications: [],
    snapshot: { elements, cells: { [pairHash]: links } },
    analysisResult: { summary: 'Données synthétiques de test.', causalLinks: links, webResearch: [],
      pairAssessments: directions.length ? [{ pairHash, verdict: 'cited_relation', headline: 'Résumé non orienté de la paire',
        explanation: 'Synthèse des deux directions.', limitations: 'Contexte synthétique.', directions, source: 'openai' }] : [] },
  };
}

const matrixLink = (evidence: string, interactionEffect: string, reverse = false) => ({
  from: reverse ? 'Traitement B' : 'Traitement A', fromType: 'medication',
  to: reverse ? 'Traitement A' : 'Traitement B', toType: 'medication',
  relationship: 'Interaction rapportée', relationKind: 'interaction', evidenceSupport: 'direct',
  validationVersion: contract.RELATION_ENGINE_VERSION, citationVerification: 'provider_trace',
  interactionEffect, evidence, probability: 'low', contextLimitations: ['Fixture synthétique ; aucune décision clinique.'],
  webSources: ['https://pubmed.ncbi.nlm.nih.gov/38804512/', 'javascript:alert(1)', 'https://user:secret@example.org/private'],
});

test('invalid interaction effects cannot expose object prototype values to the rendered UI', () => {
  for (const effect of ['__proto__', 'constructor', 'toString', 'unrecognized-effect']) {
    assert.equal(display.interactionEffectLabel(effect), null);
  }
  assert.equal(display.interactionEffectLabel('cancel_effect'), 'Annulation d’effet rapportée');
});

test('the matrix keeps every mechanism in its own directed cell and opens each source-backed detail', async () => {
  const links = [matrixLink('Mécanisme alpha synthétique.', 'increase_effect'),
    matrixLink('Mécanisme bêta synthétique.', 'decrease_effect'),
    matrixLink('Mécanisme gamma synthétique.', 'cancel_effect'),
    matrixLink('Mécanisme inverse synthétique.', 'unknown', true)];
  const matrix = mountGraph(matrixFixture(links), { component: 'RelationshipMatrix' });
  let tree = await matrix.flush();
  const forward = matrixCell(tree, 0, 1);
  const reverse = matrixCell(tree, 1, 0);
  assert.match(textContent(forward), /3 relations/);
  assert.doesNotMatch(textContent(reverse), /3 relations/);
  const openForward = descendants(forward).find(item => typeof item.props.onClick === 'function')!;
  assert.match(String(openForward.props['aria-label']), /Traitement A.*Traitement B/);
  (openForward.props.onClick as () => void)();
  tree = await matrix.flush();
  const relationGroup = descendants(tree).find(item => item.props['aria-label'] === 'Relations dans ce sens')!;
  assert.ok(relationGroup);
  const selectors = descendants(relationGroup).filter(item => item.type === 'button');
  assert.equal(selectors.length, 3, 'All mechanisms must remain individually inspectable');
  assert.match(textContent(selectors[1]), /Diminution de l’effet/);
  assert.doesNotMatch(textContent(selectors[1]), /Annulation/);
  assert.match(textContent(selectors[2]), /Annulation d’effet rapportée/);
  assert.ok(selectors.every(item => !textContent(item).includes('Effet non déterminé')), 'The opposite direction must not leak into this cell');
  (selectors[2].props.onClick as () => void)();
  tree = await matrix.flush();
  assert.match(textContent(tree), /Mécanisme gamma synthétique/);
  assert.doesNotMatch(textContent(tree), /Mécanisme inverse synthétique/);
  const sourceLinks = descendants(tree).filter(item => item.type === 'a').map(item => String(item.props.href));
  assert.ok(sourceLinks.includes('https://pubmed.ncbi.nlm.nih.gov/38804512/'));
  assert.ok(sourceLinks.every(url => !url.includes('javascript:') && !url.includes('user:secret')));
});

test('a reverse direction with insufficient evidence never inherits the documented forward relation', async () => {
  const keyA = analysisUtils.typedElementKey({ name: 'Traitement A', type: 'medication' });
  const keyB = analysisUtils.typedElementKey({ name: 'Traitement B', type: 'medication' });
  const directions = [
    { fromKey: keyA, toKey: keyB, verdict: 'cited_relation', explanation: 'Effet documenté de A vers B.', limitations: 'Source à vérifier.', sourceUrls: [] },
    { fromKey: keyB, toKey: keyA, verdict: 'insufficient', explanation: 'Aucune preuve exploitable pour B vers A.', limitations: 'Ne démontre pas une absence de risque.', sourceUrls: [] },
  ];
  const matrix = mountGraph(matrixFixture([matrixLink('Effet A vers B.', 'increase_effect')], directions), { component: 'RelationshipMatrix' });
  let tree = await matrix.flush();
  assert.match(textContent(matrixCell(tree, 0, 1)), /Interaction rapportée/);
  const reverse = matrixCell(tree, 1, 0);
  assert.match(textContent(reverse), /Preuves insuffisantes/);
  assert.doesNotMatch(textContent(reverse), /Interaction rapportée|Résumé non orienté/);
  (descendants(reverse).find(item => typeof item.props.onClick === 'function')!.props.onClick as () => void)();
  tree = await matrix.flush();
  assert.match(textContent(tree), /Aucune preuve exploitable pour B vers A/);
  assert.doesNotMatch(textContent(tree), /Effet documenté de A vers B/);
  assert.match(textContent(tree), /absence de risque/);
});

test('the cross-analysis entry describes the task without hardcoding a provider model', async () => {
  const page = mountGraph({}, { component: 'CrossDataAnalyzer' });
  const tree = await page.flush();
  assert.doesNotMatch(textContent(tree), /GPT-6 Astra/);
  assert.match(textContent(tree), /recherche médicale|sources médicales/i);
});

test('the mounted graph automatically creates shared copies and analyzes every canonical selection even when a group is hidden', async () => {
  const requests: unknown[] = [];
  const graph = mountGraph({
    externalPathologies: [{ id: 'p1', name: 'Maladie A' }, { id: 'p2', name: 'Maladie B' }], selectedPathologyIds: ['p1', 'p2'],
    externalMedications: [{ id: 'm1', name: 'Médicament partagé' }], selectedMedicationIds: ['m1'],
    externalSymptoms: [{ id: 's1', name: 'Symptôme à explorer' }], selectedSymptomIds: ['s1'],
    externalTreatments: [], selectedTreatmentIds: [],
    analysisResultFromParent: { warnings: [], causalLinks: ['Maladie A', 'Maladie B'].map(to => ({
      from: 'Médicament partagé', fromType: 'medication', to, toType: 'pathology',
      relationKind: 'indication', evidenceSupport: 'direct', validationVersion: contract.RELATION_ENGINE_VERSION,
      relationship: 'Indication étudiée', evidence: 'Cas synthétique de vérification.', webSources: [],
    })) },
    onAnalyzeWithOpenAI: async (selection: unknown) => { requests.push(normalized(selection)); },
  });
  let tree = await graph.flush();
  let flow = descendants(tree).find(item => item.type === 'ReactFlow')!;
  let nodes = normalized(flow.props.nodes) as Array<{ id: string; parentId?: string; data: { type: string; entityId?: string } }>;
  assert.equal(nodes.filter(node => node.data.type === 'group').length, 2);
  assert.equal(nodes.filter(node => node.data.entityId === 'm1').length, 2);
  assert.equal(nodes.filter(node => node.data.entityId === 's1').length, 1);
  assert.equal((flow.props.edges as unknown[]).length, 2);

  const hideGroup = descendants(tree).find(item => item.type === 'Button' && item.props.title === 'Cacher le groupe')!;
  assert.ok(hideGroup);
  (hideGroup.props.onClick as () => void)();
  tree = await graph.flush();
  flow = descendants(tree).find(item => item.type === 'ReactFlow')!;
  nodes = normalized(flow.props.nodes) as typeof nodes;
  assert.equal(nodes.filter(node => node.data.entityId === 'm1').length, 1);
  const analyze = descendants(tree).find(item => item.type === 'Button' && textContent(item).includes('Analyser tous les éléments'))!;
  assert.ok(analyze);
  await (analyze.props.onClick as () => Promise<void>)();
  await graph.flush();
  assert.deepEqual(requests, [{ pathologyIds: ['p1', 'p2'], medicationIds: ['m1'], symptomIds: ['s1'], treatmentIds: [] }]);

  graph.update({ selectedPathologyIds: ['p2'] });
  tree = await graph.flush();
  flow = descendants(tree).find(item => item.type === 'ReactFlow')!;
  nodes = normalized(flow.props.nodes) as typeof nodes;
  assert.equal(nodes.filter(node => node.data.type === 'group').length, 1);
  assert.equal(nodes.filter(node => node.data.entityId === 'm1').length, 1);
  assert.ok(nodes.every(node => node.data.entityId !== 'p1'), 'a removed pathology and its obsolete copies must not reappear');
});

test('contextual uses and associations remain visible without arrows or treatment membership', async () => {
  const graph = mountGraph({
    externalPathologies: [{ id: 'p1', name: 'Maladie A' }], selectedPathologyIds: ['p1'],
    externalMedications: [{ id: 'm1', name: 'Médicament A' }], selectedMedicationIds: ['m1'],
    externalSymptoms: [{ id: 's1', name: 'Symptôme A' }], selectedSymptomIds: ['s1'],
    externalTreatments: [], selectedTreatmentIds: [],
    analysisResultFromParent: { warnings: [], causalLinks: [
      { from: 'Médicament A', fromType: 'medication', to: 'Maladie A', toType: 'pathology',
        relationKind: 'indication', evidenceSupport: 'contextual', validationVersion: contract.RELATION_ENGINE_VERSION,
        relationship: 'Usage rapporté', evidence: 'Contexte différent.' },
      { from: 'Maladie A', fromType: 'pathology', to: 'Symptôme A', toType: 'symptom',
        relationKind: 'association', evidenceSupport: 'direct', validationVersion: contract.RELATION_ENGINE_VERSION,
        relationship: 'Association rapportée', evidence: 'Cooccurrence sans causalité démontrée.' },
    ] },
    onAnalyzeWithOpenAI: async () => {},
  });
  const tree = await graph.flush();
  const flow = descendants(tree).find(item => item.type === 'ReactFlow')!;
  const nodes = normalized(flow.props.nodes) as Array<{ parentId?: string; data: { entityId?: string } }>;
  assert.ok(nodes.filter(node => ['m1', 's1'].includes(node.data.entityId || '')).every(node => !node.parentId));
  const edges = normalized(flow.props.edges) as Array<{ markerEnd?: unknown; style: { strokeDasharray?: string } }>;
  assert.equal(edges.length, 2);
  assert.ok(edges.every(edge => !edge.markerEnd), 'neither contextual use nor association should suggest a causal direction');
  assert.ok(edges.some(edge => edge.style.strokeDasharray), 'contextual evidence must have its distinct dashed presentation');
});

test('a restored snapshot rebuilds every graph entity, including a concept absent from the current catalogue', async () => {
  const analysis = { warnings: [], pairAssessments: [{}], causalLinks: [{
    from: 'Médicament partagé', fromType: 'medication', to: 'Maladie A', toType: 'pathology',
    relationKind: 'indication', evidenceSupport: 'direct', validationVersion: contract.RELATION_ENGINE_VERSION,
    relationship: 'Indication étudiée', evidence: 'Cas synthétique de restauration.',
  }] };
  const graph = mountGraph({
    externalPathologies: [], externalMedications: [], externalSymptoms: [], externalTreatments: [],
    selectedPathologyIds: ['p1'], selectedMedicationIds: ['m1'], selectedSymptomIds: ['external-s1'], selectedTreatmentIds: [],
    analysisSnapshot: { jobId: 'saved-job', selection: {
      pathologyIds: ['p1'], medicationIds: ['m1'], externalSymptoms: [{ id: 'external-s1', name: 'Symptôme externe' }],
    }, elements: [
      { name: 'Maladie A', type: 'pathology' }, { name: 'Médicament partagé', type: 'medication' },
      { name: 'Symptôme externe', type: 'symptom' },
    ] },
    analysisResultFromParent: analysis, onAnalyzeWithOpenAI: async () => {},
  });
  const tree = await graph.flush();
  const flow = descendants(tree).find(item => item.type === 'ReactFlow');
  assert.ok(flow, 'the saved snapshot must produce graph nodes without relying on current catalogue rows');
  const nodes = normalized(flow.props.nodes) as Array<{ data: { type: string; label: string } }>;
  assert.equal(nodes.filter(node => node.data.type !== 'group').length, 3);
  assert.equal(nodes.filter(node => node.data.type === 'group').length, 1);
  assert.equal((flow.props.edges as unknown[]).length, 1);
});

test('changing a restored selection hides old evidence and a poll cannot undo the draft', async () => {
  const analysis = { warnings: [], pairAssessments: [{}], causalLinks: [{
    from: 'Médicament partagé', fromType: 'medication', to: 'Maladie A', toType: 'pathology',
    relationKind: 'indication', evidenceSupport: 'direct', validationVersion: contract.RELATION_ENGINE_VERSION,
    relationship: 'Indication étudiée', evidence: 'Cas synthétique de restauration.',
  }] };
  const snapshot = { jobId: 'saved-job', selection: { pathologyIds: ['p1'], medicationIds: ['m1'] },
    elements: [{ name: 'Maladie A', type: 'pathology' }, { name: 'Médicament partagé', type: 'medication' }] };
  const matches: boolean[] = [];
  const graph = mountGraph({
    externalPathologies: [{ id: 'p1', name: 'Maladie A' }, { id: 'p2', name: 'Maladie B' }],
    externalMedications: [{ id: 'm1', name: 'Médicament partagé' }], externalSymptoms: [], externalTreatments: [],
    selectedPathologyIds: ['p1'], selectedMedicationIds: ['m1'], selectedSymptomIds: [], selectedTreatmentIds: [],
    analysisSnapshot: snapshot, analysisResultFromParent: analysis, onAnalyzeWithOpenAI: async () => {},
    onSnapshotMatchChange: (value: boolean) => matches.push(value),
  });
  let tree = await graph.flush();
  const remove = descendants(tree).find(item => item.type === 'Button' && item.props['aria-label'] === 'Retirer Médicament partagé de la sélection')!;
  assert.ok(remove);
  (remove.props.onClick as () => void)();
  await graph.flush();
  graph.update({ analysisSnapshot: normalized(snapshot), analysisResultFromParent: normalized(analysis) });
  tree = await graph.flush();
  let flow = descendants(tree).find(item => item.type === 'ReactFlow')!;
  assert.ok((normalized(flow.props.nodes) as Array<{data: {label: string}}>).every(node => node.data.label !== 'Médicament partagé'),
    'a poll must not recreate a node manually removed from the restored graph');
  assert.equal(matches.at(-1), false);
  graph.update({ selectedPathologyIds: ['p1', 'p2'] });
  tree = await graph.flush();
  flow = descendants(tree).find(item => item.type === 'ReactFlow')!;
  assert.equal((flow.props.edges as unknown[]).length, 0, 'old partial evidence must not be presented as the new selection analysis');
  assert.match(textContent(tree), /Nouvelle sélection non analysée/);
  assert.doesNotMatch(textContent(tree), /OpenAI a examiné|Relations analysées/);
  assert.equal(matches.at(-1), false);

  graph.update({ analysisSnapshot: normalized(snapshot), analysisResultFromParent: normalized(analysis) });
  tree = await graph.flush();
  flow = descendants(tree).find(item => item.type === 'ReactFlow')!;
  const nodes = normalized(flow.props.nodes) as Array<{ data: { label: string; type: string } }>;
  assert.ok(nodes.some(node => node.data.label === 'Maladie B' && node.data.type === 'pathology'));
  assert.equal((flow.props.edges as unknown[]).length, 0);
  assert.equal(matches.at(-1), false);
});

test('the page restores the job once, preserves a changed draft during polling and excludes a prior patient snapshot', async () => {
  const savedAnalysis = { summary: 'Analyse synthétique enregistrée.', warnings: [], causalLinks: [], recommendations: [], webResearch: [],
    agentReview: { model: 'gpt-6-astra', stage: 'completed', coverage: {} },
    alternatives: [{ for: 'Legacy' }], treatmentSchemas: [{ title: 'Legacy' }] };
  let job = { id: 'job-original', status: 'completed', stalled: false, progress_message: 'Terminé', updated_at: 'first',
    selection: { externalPathologies: [{ id: 'p1', name: 'Maladie sauvegardée' }], medicationIds: ['m1'] },
    result_payload: { analysis: savedAnalysis, cells: {}, elements: [
      { name: 'Maladie sauvegardée', type: 'pathology' }, { name: 'Médicament sauvegardé', type: 'medication' },
    ] } };
  const submissions: {action: string; body: unknown}[] = [];
  const page = mountGraph({}, { component: 'CrossDataAnalyzer', readJob: () => job,
    submit: async (action, body) => { submissions.push({ action, body: normalized(body) }); } });
  let tree = await page.flush();
  let matrix = descendants(tree).find(item => item.type === 'RelationshipMatrix')!;
  assert.ok(descendants(tree).some(item => item.type === 'AgentCrossAnalysisPanel'));
  assert.ok(descendants(tree).every(item => typeof item.type !== 'function' ||
    !['TreatmentSchemaGenerator', 'TreatmentSchemasPanel', 'AlternativesPanel'].includes(item.type.name)), 'Astra results never expose the legacy treatment workflow');
  assert.deepEqual(normalized(matrix.props.selectedPathologies), ['p1']);
  assert.deepEqual(normalized(matrix.props.selectedMedications), ['m1']);
  assert.equal((matrix.props.pathologies as unknown[]).length, 1, 'the external concept must be restored after catalogue loading');

  const pathologyList = descendants(tree).find(item => item.type === 'Virtuoso' &&
    (item.props.data as Array<{id: string}> | undefined)?.some(entity => entity.id === 'p1'))!;
  assert.ok(pathologyList);
  const row = (pathologyList.props.itemContent as (index: number, item: unknown) => Tree)(0, (pathologyList.props.data as unknown[])[0]);
  const checkbox = descendants(row).find(item => item.type === 'Checkbox')!;
  (checkbox.props.onCheckedChange as () => void)();
  tree = await page.flush();
  job = { ...job, updated_at: 'second', result_payload: { ...job.result_payload } };
  page.update({});
  tree = await page.flush();
  matrix = descendants(tree).find(item => item.type === 'RelationshipMatrix')!;
  assert.deepEqual(normalized(matrix.props.selectedPathologies), [], 'a poll must not overwrite an edited selection');

  const graphButton = descendants(tree).find(item => item.type === 'Button' && textContent(item).trim() === 'Graphique')!;
  (graphButton.props.onClick as () => void)();
  tree = await page.flush();
  let graph = descendants(tree).find(item => item.type === 'RiskNetworkGraph')!;
  assert.equal((graph.props.analysisSnapshot as { jobId: string }).jobId, 'job-original');
  assert.deepEqual(normalized(graph.props.selectedPathologyIds), []);
  (graph.props.onSnapshotMatchChange as (value: boolean) => void)(false);
  tree = await page.flush();
  assert.ok(descendants(tree).every(item => item.type !== 'AgentCrossAnalysisPanel'), 'a graph draft must not display the previous analysis coverage');

  page.update({ patientData: { id: 'another-patient' } });
  tree = await page.flush();
  graph = descendants(tree).find(item => item.type === 'RiskNetworkGraph')!;
  assert.equal(graph.props.analysisSnapshot, null, 'the previous scope job is excluded even before the hook returns a fresh row');
  assert.equal(graph.props.analysisResultFromParent, null);
  assert.deepEqual(normalized(graph.props.selectedMedicationIds), []);

  job = { ...job, id: 'job-new-patient', updated_at: 'third' };
  page.update({});
  tree = await page.flush();
  graph = descendants(tree).find(item => item.type === 'RiskNetworkGraph')!;
  assert.equal((graph.props.analysisSnapshot as { jobId: string }).jobId, 'job-new-patient');
  assert.deepEqual(normalized(graph.props.selectedPathologyIds), ['p1']);
  await (graph.props.onAnalyzeWithOpenAI as (selection: unknown) => Promise<void>)({
    pathologyIds: ['p1'], medicationIds: ['snapshot-missing-medication'], symptomIds: [], treatmentIds: [],
    elements: [{ id: 'p1', name: 'Maladie sauvegardée', type: 'pathology' },
      { id: 'snapshot-missing-medication', name: 'Médicament sauvegardé', type: 'medication' }],
  });
  assert.equal(submissions.length, 1);
  assert.equal(submissions[0].action, 'matrix.start', 'the parent uses its sole durable Astra submission callback');
  const request = submissions[0].body as { medicationIds: string[]; externalMedications: {id: string; name: string}[] };
  assert.deepEqual(request.medicationIds, []);
  assert.deepEqual(request.externalMedications, [{ id: 'snapshot-missing-medication', name: 'Médicament sauvegardé' }]);
});
