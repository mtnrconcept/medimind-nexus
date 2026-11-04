import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ensureAnalysisShape, ensureSchemaComparison } from '../supabase/functions/cross-data-analyzer/analysis-utils.ts';

test('a matrix without documented links has no numerical benefit-risk assessment', () => {
  const comparison = ensureSchemaComparison(ensureAnalysisShape({ causalLinks: [], webResearch: [] }));
  assert.equal(comparison.currentScore, null);
  assert.equal(comparison.proposedScore, null);
  assert.equal(comparison.improvementPercent, null);
  assert.equal(comparison.benefitRiskRatio.current, null);
});

test('legacy fabricated scores cannot override missing documented links', () => {
  const comparison = ensureSchemaComparison(ensureAnalysisShape({ causalLinks: [], schemaComparison: { ...ensureSchemaComparison(ensureAnalysisShape({})), currentScore: 100, proposedScore: 100 } }));
  assert.equal(comparison.currentScore, null);
});

import { buildPairSearchQuery, createLiteratureSearch, parsePubMedArticles } from '../supabase/functions/cross-data-analyzer/pubmed-research.ts';
import { medicalSearchTerms, frenchMedicalLabel } from '../supabase/functions/_shared/medical-terminology.ts';
import { buildPairCandidates, buildSelectedElements } from '../supabase/functions/cross-data-analyzer/analysis-utils.ts';

const pair = buildPairCandidates([
  { name: 'Nephrotic syndrome, other', type: 'pathology' },
  { name: 'Œdème des paupières', type: 'symptom' },
])[0];

test('French clinical concepts are searched together without mandatory French filler words', () => {
  const query = buildPairSearchQuery(pair);
  assert.match(query, /nephrotic syndrome/);
  assert.match(query, /periorbital edema/);
  assert.match(query, / AND /);
  assert.doesNotMatch(query, /symptome|causalite|relation clinique|\|pathology/);
});

test('generic drug search preserves the original name, formulation and ATC context', () => {
  const selected = buildSelectedElements([], [], [], [{ name: 'ACICLOVIR ACCORD 25 mg/mL, solution à diluer pour perfusion', substance: 'ACICLOVIR 25 mg1 mL de solution + ACICLOVIR SODIQUE', atc_code: 'J05AB01' }]);
  assert.equal(selected[0].name, 'ACICLOVIR ACCORD 25 mg/mL, solution à diluer pour perfusion');
  assert.equal(selected[0].atcCode, 'J05AB01');
  assert.ok(medicalSearchTerms(selected[0]).includes('acyclovir'));
  assert.equal(frenchMedicalLabel('Nephrotic syndrome, other'), 'Syndrome néphrotique, autre');
});

test('unknown terminology and gene identifiers are not invented or translated', () => {
  assert.deepEqual(medicalSearchTerms({ name: 'Unlisted syndrome', type: 'pathology' }), ['Unlisted syndrome']);
  assert.equal(frenchMedicalLabel('NPHS1'), 'NPHS1');
});

const articleXml = '<PubmedArticle><MedlineCitation><PMID>12345</PMID><Article><ArticleTitle>First\n<i>verified</i> &amp; title</ArticleTitle><Abstract><AbstractText Label="RESULTS">Line one\nline two.</AbstractText></Abstract></Article></MedlineCitation></PubmedArticle>';
const emptyPmc = { hitCount: 0, resultList: { result: [] } };

test('PubMed XML handles line breaks and inline markup while rejecting unexpected identifiers', () => {
  const articles = parsePubMedArticles(articleXml, ['12345']);
  assert.equal(articles[0].title, 'First verified & title');
  assert.equal(articles[0].abstract, 'RESULTS: Line one line two.');
  assert.equal(articles[0].url, 'https://pubmed.ncbi.nlm.nih.gov/12345/');
  assert.throws(() => parsePubMedArticles(articleXml, ['54321']), /identifier/i);
});

test('source outages do not become a successful empty search', async () => {
  const search = createLiteratureSearch({ intervalMs: 0, fetcher: async () => new Response('unavailable', { status: 503 }) });
  const result = await search(pair);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.providers.every(p => p.status === 'unavailable'), true);
  assert.deepEqual(result.articles, []);
});

test('HTTP 200 error envelopes remain unavailable even if the fallback is empty', async () => {
  const search = createLiteratureSearch({ intervalMs: 0, fetcher: async url => Response.json(String(url).includes('eutils') ? { error: 'rate limited' } : emptyPmc) });
  const result = await search(pair);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.providers[0].status, 'unavailable');
});

test('an empty response from both sources is distinguishable from an outage', async () => {
  const search = createLiteratureSearch({ intervalMs: 0, fetcher: async url => Response.json(String(url).includes('eutils') ? { esearchresult: { count: '0', idlist: [] } } : emptyPmc) });
  assert.equal((await search(pair)).status, 'empty');
});

test('Europe PMC fallback provides verifiable metadata when PubMed is unavailable', async () => {
  const search = createLiteratureSearch({ intervalMs: 0, fetcher: async url => String(url).includes('eutils') ? new Response('', { status: 429 }) : Response.json({ hitCount: 1, resultList: { result: [{ source: 'MED', id: '12345', pmid: '12345', title: 'Verified study', abstractText: 'Abstract retrieved from provider.', pubYear: '2024' }] } }) });
  const result = await search(pair);
  assert.equal(result.status, 'matched');
  assert.equal(result.articles[0].pmid, '12345');
  assert.equal(result.articles[0].provider, 'Europe PMC');
  assert.equal(result.providers[0].status, 'unavailable');
});

test('PubMed metadata is fetched only for IDs returned by the search', async () => {
  const calls: string[] = [];
  const search = createLiteratureSearch({ intervalMs: 0, fetcher: async url => {
    calls.push(String(url));
    return String(url).includes('esearch') ? Response.json({ esearchresult: { count: '1', idlist: ['12345'] } }) : new Response(articleXml);
  }});
  const result = await search(pair);
  assert.equal(result.status, 'matched');
  assert.equal(result.articles.length, 1);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /id=12345/);
});

import { canDisplayRiskScore, matrixEvidenceLabel } from '../src/components/patient/crossDataDisplay.ts';
test('historical empty matrices cannot display a perfect score', () => {
  assert.equal(canDisplayRiskScore([], 100), false);
  assert.equal(canDisplayRiskScore([{}], null), false);
  assert.equal(matrixEvidenceLabel({ sources: [] }, true), 'Preuves insuffisantes');
  assert.equal(matrixEvidenceLabel({ status: 'unavailable', sources: [] }, false), 'Source indisponible');
  assert.equal(matrixEvidenceLabel({ status: 'matched', sources: [{}] }, true), 'Lien non conclu');
});
