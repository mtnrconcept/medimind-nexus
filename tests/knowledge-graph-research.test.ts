import assert from 'node:assert/strict';
import test from 'node:test';
import { handleResearchRequest, type ResearchServices } from '../supabase/functions/deep-research-graph/handler.ts';
import { GRAPH_FAMILIES, GRAPH_RESPONSE_FORMAT } from '../supabase/functions/deep-research-graph/contract.ts';

const sourceUrl = 'https://pubmed.ncbi.nlm.nih.gov/12345678/';
const node = (id: string, label: string, node_type: string) => ({ id, label, node_type, weight: 0.6 });
const link = (source_id: string, target_id: string, edge_type = 'ASSOCIATED_WITH') => ({
  source_id, target_id, edge_type, rationale: 'Relation étudiée dans une population définie.', weight: 0.4,
  qualifier: 'association', evidence: { status: 'limited', study_type: 'cohort', population: 'Adultes étudiés',
    limitations: ['Applicabilité individuelle non établie.'], sources: [{ url: sourceUrl }] },
});
const request = (extra: Record<string, unknown> = {}) => new Request('https://example.test/deep-research-graph', {
  method: 'POST', headers: { authorization: 'Bearer synthetic-session' },
  body: JSON.stringify({ topic: 'Maladie exemple', include_pubmed: false, include_fda: false, ...extra }),
});
function services(graph: Record<string, unknown>): ResearchServices {
  return {
    isAuthenticated: async () => true, readTable: async () => [], readInteractions: async () => [],
    callAI: async () => ({ text: JSON.stringify(graph), model: 'test', provider: 'stub',
      webSearchCalls: 1, webSources: [{ url: sourceUrl, title: 'Notice réellement retournée' }] }),
  };
}

test('a source failure leaves disease centres and inspectable matches, never artificial evidence nodes or clinical edges', async () => {
  const deps = services({});
  deps.readTable = async table => table.table === 'medications'
    ? [{ id: 'local-med', name: 'Médicament retrouvé', description: 'Correspondance textuelle' }] : [];
  deps.callAI = async () => { throw new Error('Provider unavailable'); };
  const data = await (await handleResearchRequest(request(), deps)).json();
  assert.deepEqual(data.nodes.map((n: { node_type: string }) => n.node_type), ['PATHOLOGY']);
  assert.deepEqual(data.edges, []);
  assert.equal(data.research_status, 'unavailable');
  assert.equal(data.schema_version, 2);
  assert.ok(data.search_matches.some((match: { label: string }) => match.label === 'Médicament retrouvé'));
  assert.ok(data.limitations.length > 0);
});

test('a mediated graph keeps its real directions and families without inventing a central star', async () => {
  const graph = { nodes: [node('c0', 'Maladie exemple', 'PATHOLOGY'), node('kidney', 'Rein', 'ORGAN'),
    node('gene', 'Gène exemple', 'GENE'), node('molecule', 'Protéine exemple', 'PROTEIN'),
    node('symptom', 'Manifestation exemple', 'SYMPTOM')],
  edges: [link('c0', 'kidney', 'AFFECTS'), link('gene', 'kidney', 'EXPRESSED_IN'),
    link('gene', 'molecule', 'ENCODES'), link('molecule', 'symptom', 'ASSOCIATED_WITH')] };
  const data = await (await handleResearchRequest(request({ max_depth: 2 }), services(graph))).json();
  assert.deepEqual(data.nodes.map((n: { id: string }) => n.id), ['c0', 'kidney', 'gene']);
  assert.deepEqual(data.edges.map((e: { source_id: string; target_id: string }) => [e.source_id, e.target_id]),
    [['c0', 'kidney'], ['gene', 'kidney']]);
  assert.equal(data.nodes.find((n: { id: string }) => n.id === 'kidney').family, 'anatomy');
  assert.equal(data.nodes.find((n: { id: string }) => n.id === 'gene').family, 'genetics');
  assert.ok(data.nodes.every((n: { canonical_id?: string }) => n.canonical_id));
  assert.equal(data.exploration.truncated, true);
  assert.equal(data.exploration.max_depth, 2);
});

test('publications are edge provenance and forged URLs or a weight never establish a clinical fact', async () => {
  const graph = { nodes: [node('c0', 'Maladie exemple', 'PATHOLOGY'), node('drug', 'Substance exemple', 'DRUG'),
    node('paper', 'Titre de publication', 'EVIDENCE')], edges: [
    { ...link('drug', 'c0', 'TREATS'), qualifier: 'established', weight: 1,
      evidence: { status: 'supported', sources: [{ url: 'https://pubmed.ncbi.nlm.nih.gov/99999999/' }] } },
    link('paper', 'c0')], sources_consulted: ['Fabricated registry'] };
  const data = await (await handleResearchRequest(request(), services(graph))).json();
  assert.equal(data.nodes.some((n: { node_type: string }) => n.node_type === 'EVIDENCE'), false);
  assert.equal(data.edges.length, 1);
  assert.equal(data.edges[0].qualifier, 'unverified');
  assert.equal(data.edges[0].evidence.status, 'unavailable');
  assert.deepEqual(data.edges[0].evidence.sources, []);
  assert.ok(!JSON.stringify(data).includes('99999999'));
  assert.ok(!JSON.stringify(data).includes('Fabricated registry'));
});

test('provenance comes from source retrieval while population, contradictory findings and limits survive normalization', async () => {
  const graph = { nodes: [node('c0', 'Maladie exemple', 'PATHOLOGY'), node('drug', 'Substance exemple', 'DRUG')],
    edges: [{ ...link('drug', 'c0'), qualifier: 'research', polarity: 'contradicts',
      evidence: { status: 'conflicting', study_type: 'randomized_trial', population: 'Adultes uniquement',
        limitations: ['Critère principal négatif.'], sources: [{ url: sourceUrl, title: 'Titre inventé par IA' }] } }] };
  const data = await (await handleResearchRequest(request(), services(graph))).json();
  assert.equal(data.edges[0].polarity, 'contradicts');
  assert.equal(data.edges[0].evidence.population, 'Adultes uniquement');
  assert.deepEqual(data.edges[0].evidence.limitations, ['Critère principal négatif.']);
  assert.equal(data.edges[0].evidence.sources[0].title, 'Notice réellement retournée');
  assert.equal(data.edges[0].evidence.sources[0].verification_status, 'verified');
  assert.equal(data.nodes[1].family, 'treatments');
  assert.equal(data.nodes[1].entity_kind, 'drug');
});

test('expansions resolve existing concept IDs and avoid inferring patient facts or alias-based duplicate nodes', async () => {
  const graph = { nodes: [node('c0', 'Maladie exemple', 'PATHOLOGY'),
    { ...node('dup', 'Concept connu', 'SYMPTOM'), properties: { patient_has: true, diagnosis_confirmed: true } },
    node('next', 'Autre concept', 'MOLECULE')], edges: [link('dup', 'next')], };
  const data = await (await handleResearchRequest(request({ existing_nodes: [
    { id: 'known', name: 'Concept connu', node_type: 'SYMPTOM', canonical_id: 'local:symptom:concept-connu', family: 'manifestations' },
  ] }), services(graph))).json();
  assert.equal(data.nodes.some((n: { id: string }) => n.id === 'dup'), false);
  assert.ok(data.edges.some((e: { source_id: string; target_id: string }) => e.source_id === 'known' && e.target_id === 'next'));
  assert.ok(!JSON.stringify(data).includes('patient_has'));
  assert.ok(!JSON.stringify(data).includes('diagnosis_confirmed'));
  assert.equal(data.knowledge_scope, 'general');
});

test('max_depth is validated and bounded before network or AI work', async () => {
  const deps = services({});
  deps.callAI = async () => { assert.fail('Invalid depth reached provider'); };
  for (const max_depth of [0, 5, -1, 1.5, '3']) {
    assert.equal((await handleResearchRequest(request({ max_depth }), deps)).status, 400);
  }
});

test('a gene can be re-centred without replacing the earlier c0 disease or merging an identically named protein', async () => {
  const deps = services({});
  deps.callAI = async (_system, prompt) => {
    const input = JSON.parse(prompt);
    const center = input.central_nodes[0];
    assert.equal(center.node_type, 'GENE');
    assert.notEqual(center.id, 'c0');
    return { model: 'test', provider: 'stub', webSearchCalls: 1,
      webSources: [{ url: sourceUrl, title: 'Source consultée' }], text: JSON.stringify({
        nodes: [node(center.id, center.label, 'GENE'), node('protein', 'Gène exemple', 'PROTEIN')],
        edges: [link(center.id, 'protein', 'ENCODES'), link(center.id, 'c0', 'ASSOCIATED_WITH')],
      }) };
  };
  const data = await (await handleResearchRequest(request({ topic: 'Gène exemple', topic_type: 'GENE',
    existing_nodes: [{ id: 'c0', name: 'Ancienne maladie', node_type: 'PATHOLOGY' }],
  }), deps)).json();
  assert.equal(data.nodes[0].node_type, 'GENE');
  assert.equal(data.nodes[1].node_type, 'PROTEIN');
  assert.notEqual(data.nodes[0].canonical_id, data.nodes[1].canonical_id);
  assert.ok(data.edges.some((edge: { target_id: string }) => edge.target_id === 'c0'));
});

test('expanding an imported centre preserves its external canonical ID and resolves local duplicate identities in JSON and SSE', async () => {
  const graph = { nodes: [node('gene', 'NPHS1', 'GENE'), node('duplicate-gene', 'NPHS1', 'GENE'),
    node('protein', 'NPHS1', 'PROTEIN')],
    edges: [link('duplicate-gene', 'protein', 'ENCODES'), link('hgnc:7908', 'disease', 'ASSOCIATED_WITH'),
      link('local:gene:nphs1', 'protein', 'INTERACTS_WITH')] };
  for (const streaming of [false, true]) {
    const response = await handleResearchRequest(request({ topic: 'NPHS1', topic_type: 'GENE', streaming,
      existing_nodes: [
        { id: 'disease', name: 'Ancienne maladie', node_type: 'PATHOLOGY', canonical_id: 'local:pathology:ancienne-maladie' },
        { id: 'gene', name: 'NPHS1', node_type: 'GENE', canonical_id: 'hgnc:7908', family: 'genetics' },
      ],
    }), services(graph));
    const data = streaming ? undefined : await response.json();
    const events = streaming ? (await response.text()).trim().split('\n\n').map(frame => JSON.parse(frame.slice(6))) : [];
    const nodes = data?.nodes ?? events.filter(event => event.type === 'node').map(event => event.node);
    const edges = data?.edges ?? events.filter(event => event.type === 'edges').flatMap(event => event.edges);
    assert.equal(nodes.length, 2);
    assert.equal(nodes[0].id, 'gene');
    assert.equal(nodes[0].canonical_id, 'hgnc:7908');
    assert.equal(nodes[0].node_type, 'GENE');
    assert.equal(nodes[0].entity_kind, 'gene');
    assert.equal(nodes[1].entity_kind, 'protein');
    assert.notEqual(nodes[1].canonical_id, nodes[0].canonical_id);
    assert.deepEqual(edges.map((edge: { source_id: string; target_id: string; edge_type: string }) =>
      [edge.source_id, edge.target_id, edge.edge_type]), [
      ['gene', 'protein', 'ENCODES'], ['gene', 'disease', 'ASSOCIATED_WITH'], ['gene', 'protein', 'INTERACTS_WITH'],
    ]);
  }
});

test('preclinical findings and case reports cannot silently become established clinical effects', async () => {
  for (const [study_type, expected] of [['in vitro', 'research'], ['case_report', 'association']] as const) {
    const graph = { nodes: [node('c0', 'Maladie exemple', 'PATHOLOGY'), node('drug', 'Substance exemple', 'DRUG')],
      edges: [{ ...link('drug', 'c0', 'REDUCES'), qualifier: 'established',
        evidence: { status: 'supported', study_type, population: 'Population décrite dans l’étude',
          limitations: [], sources: [{ url: sourceUrl }] } }] };
    const data = await (await handleResearchRequest(request(), services(graph))).json();
    assert.equal(data.edges[0].qualifier, expected);
  }
});

test('FAERS-only reports remain pharmacovigilance associations, not proof that a medicine causes an outcome', async () => {
  const reportUrl = 'https://api.fda.gov/drug/event.json?' + new URLSearchParams({ search: 'safetyreportid:"10003730"', limit: '1' });
  const graph = { nodes: [node('c0', 'Maladie exemple', 'PATHOLOGY'), node('drug', 'Substance exemple', 'DRUG')],
    edges: [{ ...link('drug', 'c0', 'CAUSES'), qualifier: 'established',
      evidence: { status: 'supported', study_type: 'report', population: 'Patients signalés', limitations: [], sources: [{ url: reportUrl }] } }] };
  const deps = services(graph);
  deps.fetcher = async () => Response.json({ results: [{ safetyreportid: '10003730', patient: { reaction: [{ reactionmeddrapt: 'Maladie exemple' }] } }] });
  const data = await (await handleResearchRequest(request({ medication: 'Substance exemple', include_fda: true, include_web: false }), deps)).json();
  assert.equal(data.edges[0].edge_type, 'REPORTED_WITH');
  assert.equal(data.edges[0].qualifier, 'association');
  assert.equal(data.edges[0].evidence.status, 'limited');
  assert.match(data.edges[0].evidence.limitations.join(' '), /ni causalité/);
});

test('a retrieved PubMed case report cannot be relabelled as established randomized evidence by the model', async () => {
  const graph = { nodes: [node('c0', 'Maladie exemple', 'PATHOLOGY'), node('drug', 'Substance exemple', 'DRUG')],
    edges: [{ ...link('drug', 'c0', 'TREATS'), qualifier: 'established',
      evidence: { status: 'supported', study_type: 'randomized_trial', population: 'Adults', limitations: [], sources: [{ url: sourceUrl }] } }] };
  const deps = services(graph);
  deps.fetcher = async url => {
    if (url.includes('esearch')) return Response.json({ esearchresult: { idlist: ['12345678'], count: '1' } });
    if (url.includes('esummary')) return Response.json({ result: { '12345678': { uid: '12345678', title: 'A case report' } } });
    return new Response('<PubmedArticle><PMID>12345678</PMID><ArticleTitle>A case report</ArticleTitle>' +
      '<AbstractText>One patient was observed.</AbstractText><PublicationType>Case Reports</PublicationType></PubmedArticle>');
  };
  const data = await (await handleResearchRequest(request({ include_pubmed: true, include_web: false }), deps)).json();
  assert.equal(data.edges[0].qualifier, 'association');
  assert.equal(data.edges[0].evidence.status, 'limited');
  assert.equal(data.edges[0].evidence.study_type, 'case_report');
});

test('ambiguous name-only endpoints and reference identifiers cannot create misleading relationships', async () => {
  const graph = { nodes: [node('c0', 'Maladie exemple', 'PATHOLOGY'), node('gene', 'Même nom', 'GENE'),
    node('protein', 'Même nom', 'PROTEIN'), node('trial', 'NCT12345678', 'RESEARCH')],
    edges: [link('gene', 'c0'), link('protein', 'c0'), link('Même nom', 'c0'), link('trial', 'c0')] };
  const data = await (await handleResearchRequest(request(), services(graph))).json();
  assert.deepEqual(data.edges.map((edge: { source_id: string }) => edge.source_id), ['gene', 'protein']);
  assert.equal(data.nodes.some((n: { id: string }) => n.id === 'trial'), false);
});

test('semantic families can express an interaction role while entity kinds and legacy defaults remain distinct', async () => {
  const graph = { nodes: [node('c0', 'Maladie exemple', 'PATHOLOGY'),
    { ...node('fruit', 'Pamplemousse', 'EXPOSURE'), family: 'interactions' },
    { ...node('drug', 'Substance exemple', 'DRUG'), family: 'interactions' },
    { ...node('gene', 'Même nom', 'GENE'), family: 'molecules' },
    { ...node('protein', 'Même nom', 'PROTEIN'), family: 'genetics' },
    node('organ', 'Organe exemple', 'ORGAN'),
    { ...node('sign', 'Signe exemple', 'SIGN'), family: 'unknown_family' }],
    edges: [link('drug', 'c0'), link('fruit', 'drug', 'INTERACTS_WITH'), link('gene', 'c0'),
      link('gene', 'protein', 'ENCODES'), link('organ', 'c0'), link('sign', 'c0')] };
  const data = await (await handleResearchRequest(request(), services(graph))).json();
  const byId = Object.fromEntries(data.nodes.map((n: { id: string }) => [n.id, n]));
  assert.equal(byId.fruit.family, 'interactions');
  assert.equal(byId.fruit.entity_kind, 'exposure');
  assert.equal(byId.drug.family, 'interactions');
  assert.equal(byId.drug.entity_kind, 'drug');
  assert.equal(byId.gene.family, 'genetics');
  assert.equal(byId.protein.family, 'molecules');
  assert.notEqual(byId.gene.canonical_id, byId.protein.canonical_id);
  assert.equal(byId.organ.family, 'anatomy');
  assert.equal(byId.sign.family, 'manifestations');
  const schema = GRAPH_RESPONSE_FORMAT.schema.properties.nodes as { items: {
    required: string[]; properties: { family?: { enum: readonly string[] } };
  } };
  assert.deepEqual(schema.items.properties.family?.enum, GRAPH_FAMILIES);
  assert.ok(schema.items.required.includes('family'));
});

test('observations on the same relation retain distinct sources, statuses, rationales and limitations', async () => {
  const otherUrl = 'https://pubmed.ncbi.nlm.nih.gov/87654321/';
  const baseline = { ...link('drug', 'c0'), polarity: 'supports' };
  const observations = [baseline,
    { ...baseline, evidence: { ...baseline.evidence, sources: [{ url: otherUrl }] } },
    { ...baseline, evidence: { ...baseline.evidence, status: 'conflicting' } },
    { ...baseline, rationale: 'Résultat distinct sur un autre critère de la même étude.' },
    { ...baseline, evidence: { ...baseline.evidence, limitations: ['Suivi très court.'] } },
    { ...baseline, evidence: { ...baseline.evidence, study_type: 'case_control' } },
    { ...baseline, polarity: 'contradicts', evidence: { ...baseline.evidence, sources: [{ url: otherUrl }] } },
  ];
  const graph = { nodes: [node('c0', 'Maladie exemple', 'PATHOLOGY'), node('drug', 'Substance exemple', 'DRUG')],
    edges: [...observations, baseline] };
  const deps = services(graph);
  deps.callAI = async () => ({ text: JSON.stringify(graph), model: 'test', provider: 'stub', webSearchCalls: 1,
    webSources: [{ url: sourceUrl, title: 'Première étude' }, { url: otherUrl, title: 'Seconde étude' }] });
  const data = await (await handleResearchRequest(request(), deps)).json();
  assert.equal(data.edges.length, observations.length, 'Only identical observations may be deduplicated');
  assert.equal(new Set(data.edges.map((edge: { id: string }) => edge.id)).size, observations.length);
  assert.ok(data.edges.some((edge: { evidence: { status: string } }) => edge.evidence.status === 'conflicting'));
  assert.ok(data.edges.some((edge: { polarity: string }) => edge.polarity === 'contradicts'));
  assert.equal(data.edges.filter((edge: { evidence: { sources: { url: string }[] } }) =>
    edge.evidence.sources.some(source => source.url === otherUrl)).length, 2);
  const repeated = await (await handleResearchRequest(request(), deps)).json();
  assert.deepEqual(repeated.edges.map((edge: { id: string }) => edge.id), data.edges.map((edge: { id: string }) => edge.id));
});

test('a canonical medicine shared by several centres retains all memberships without fabricating parent edges', async () => {
  const graph = { nodes: [node('c0', 'Maladie A', 'PATHOLOGY'), node('c1', 'Maladie B', 'PATHOLOGY'),
    { ...node('drug-a', 'Substance commune', 'DRUG'), parent_pathology: 'Maladie A' },
    { ...node('drug-b', 'Substance commune', 'MEDICATION'), parent_pathology: 'Maladie B',
      parent_pathologies: ['Maladie B', 'Maladie inventée'] }],
    edges: [link('drug-a', 'c0')] };
  const data = await (await handleResearchRequest(request({ pathologies: ['Maladie A', 'Maladie B'] }), services(graph))).json();
  const medicines = data.nodes.filter((n: { entity_kind: string }) => n.entity_kind === 'drug');
  assert.equal(medicines.length, 1);
  assert.equal(medicines[0].parent_pathology, 'Maladie A');
  assert.deepEqual(medicines[0].parent_pathologies, ['Maladie A', 'Maladie B']);
  assert.deepEqual(data.edges.map((edge: { source_id: string; target_id: string }) => [edge.source_id, edge.target_id]),
    [['drug-a', 'c0']]);
});

test('streaming returns progress and source states before synthesis resolves, then the same verified graph payload', async () => {
  let resolveAI: (result: { text: string; model: string; provider: string }) => void = () => {};
  let markEntered: () => void = () => {};
  const entered = new Promise<void>(resolve => { markEntered = resolve; });
  const result = { nodes: [node('c0', 'Maladie exemple', 'PATHOLOGY')], edges: [], research_summary: 'Synthèse prête' };
  const deps = services(result);
  deps.callAI = async () => { markEntered(); return new Promise(resolve => { resolveAI = resolve; }); };
  let returned = false;
  const pending = handleResearchRequest(request({ streaming: true }), deps).then(value => { returned = true; return value; });
  await entered;
  try {
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(returned, true, 'SSE response must be available while the provider still works');
    const response = await pending;
    const reader = response.body!.getReader();
    const initial = new TextDecoder().decode((await reader.read()).value);
    assert.match(initial, /"type":"progress"/);
    resolveAI({ text: JSON.stringify(result), model: 'test', provider: 'stub' });
    let rest = '';
    while (true) { const next = await reader.read(); if (next.done) break; rest += new TextDecoder().decode(next.value); }
    const events = (initial + rest).trim().split('\n\n').map(frame => JSON.parse(frame.slice(6)));
    assert.ok(events.some(event => event.type === 'sources'));
    assert.ok(events.some(event => event.type === 'node'));
    assert.equal(events.at(-1).type, 'complete');
    assert.equal(events.at(-1).schema_version, 2);
    assert.equal(events.at(-1).research_summary, result.research_summary);
  } finally { resolveAI({ text: JSON.stringify(result), model: 'test', provider: 'stub' }); await pending; }
});
