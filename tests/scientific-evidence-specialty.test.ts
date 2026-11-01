import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReadJson, ResearchMode } from '../supabase/functions/scientific-evidence/contract.ts';
import { specialtySources } from '../supabase/functions/scientific-evidence/specialty.ts';

const find = (name: string) => {
  const provider = specialtySources.find(item => item.name === name);
  assert.ok(provider);
  return provider;
};
const run = (name: string, mode: ResearchMode, term: string, read: ReadJson) => find(name).search({ mode, term }, read);
const doc = (short_form: string, label: string) => ({
  short_form, label, ontology_name: 'efo', iri: 'http://purl.obolibrary.org/obo/' + short_form,
});

test('OLS preserves several ambiguous terms as individually actionable ontology candidates', async () => {
  const docs = [doc('MONDO_0005377', 'nephrotic syndrome'), doc('MONDO_0018170', 'idiopathic nephrotic syndrome')];
  const hits = await run('EFO / OLS', 'disease', 'nephrotic', async url => {
    assert.equal(url.searchParams.get('ontology'), 'efo');
    return { response: { numFound: 2, docs } };
  });
  assert.deepEqual(hits.map(hit => hit.followUp?.term), ['MONDO_0005377', 'MONDO_0018170']);
  assert.ok(hits.every(hit => hit.detail.includes('possible')));
  const [exact] = await run('EFO / OLS', 'disease', 'MONDO:0018170', async () => ({ response: { numFound: 1, docs: [docs[1]] } }));
  assert.ok(exact.detail.includes('Identifiant exact'));
  assert.equal(exact.followUp, undefined);
  const exactLabel = await run('EFO / OLS', 'disease', 'nephrotic syndrome', async () => ({ response: { numFound: 2, docs } }));
  assert.deepEqual(exactLabel.map(hit => hit.id), ['MONDO_0005377']);
  assert.deepEqual(await run('EFO / OLS', 'disease', 'MONDO_9999999', async () => ({ response: { numFound: 2, docs } })), []);
  await assert.rejects(run('EFO / OLS', 'disease', 'asthma', async () => ({ response: { numFound: 1, docs: [] } })));
});

test('GWAS study accession and PMID describe the same study, including reported phenotype and sample', async () => {
  const [hit] = await run('GWAS Catalog', 'disease', 'MONDO:0004979', async url => {
    assert.equal(url.searchParams.get('efo_id'), 'MONDO_0004979');
    return { page: { totalElements: 1 }, _embedded: { studies: [{ accession_id: 'GCST91000572', disease_trait: 'Asthma in severe COVID-19', initial_sample_size: '58 cases, 323 controls', pubmed_id: 38750426 }] } };
  });
  assert.equal(hit.id, 'GCST91000572');
  assert.equal(hit.related?.[0].id, 'PMID:38750426');
  assert.match(hit.detail, /58 cases, 323 controls/);
  assert.deepEqual(await run('GWAS Catalog', 'disease', 'NoSuchTrait', async () => ({ page: { totalElements: 0 } })), []);
  await assert.rejects(run('GWAS Catalog', 'disease', 'asthma', async () => ({ page: { totalElements: 12 } })));
});

test('ClinVar and NCBI Gene check identifiers against rows and exact symbols', async () => {
  const [variant] = await run('ClinVar', 'gene', 'NPHS1', async url => {
    assert.equal(url.searchParams.get('sf'), 'GeneSymbol');
    return [2, ['6874', '81'], null, [['6874', 'NPHS1', 'NM_004646.4(NPHS1):c.793T>C'], ['81', 'NPHS10', 'other variant']]];
  });
  assert.equal(variant.url, 'https://www.ncbi.nlm.nih.gov/clinvar/variation/6874/');
  assert.equal(variant.kind, 'variant');
  const [gene] = await run('NCBI Gene', 'gene', 'NPHS1', async () => [1, ['4868'], null, [['4868', 'NPHS1', 'nephrin']]]);
  assert.equal(gene.url, 'https://www.ncbi.nlm.nih.gov/gene/4868');
  await assert.rejects(run('NCBI Gene', 'gene', 'NPHS1', async () => [1, ['4868'], null, [['5', 'NPHS1', 'nephrin']]]));
  await assert.rejects(run('ClinVar', 'gene', 'NPHS1', async () => [1, [], null, []]));
});

test('PubChem resolves a synonym to every returned CID, verifies the returned properties and distinguishes zero matches', async () => {
  const responses = [
    { esearchresult: { count: '2', idlist: ['2244', '9000'] } },
    { PropertyTable: { Properties: [{ CID: 9000, Title: 'Other', MolecularFormula: 'X' }, { CID: 2244, Title: 'Aspirin', MolecularFormula: 'C9H8O4', MolecularWeight: '180.16' }] } },
  ];
  const hits = await run('PubChem', 'drug', 'aspirin', async url => {
    if (responses.length === 2) assert.equal(url.searchParams.get('term'), '"aspirin"[CompleteSynonym]');
    else assert.match(url.pathname, /cid\/2244,9000\//);
    return responses.shift();
  });
  assert.deepEqual(hits.map(hit => hit.id), ['CID:2244', 'CID:9000']);
  assert.match(hits[0].detail, /180.16/);
  assert.deepEqual(await run('PubChem', 'drug', 'xnoresultxyz', async () => ({ esearchresult: { count: '0', idlist: [] } })), []);
  let calls = 0;
  await assert.rejects(run('PubChem', 'drug', 'aspirin', async () => ++calls === 1
    ? { esearchresult: { count: '1', idlist: ['2244'] } }
    : { PropertyTable: { Properties: [{ CID: 81, Title: 'wrong' }] } }));
});

test('each specialist rejects upstream error envelopes and propagates network failures', async () => {
  for (const provider of specialtySources) {
    const query = { mode: provider.modes[0], term: provider.modes[0] === 'gene' ? 'NPHS1' : 'asthma' };
    await assert.rejects(provider.search(query, async () => ({ error: 'temporarily unavailable' })));
    await assert.rejects(provider.search(query, async () => { throw new Error('timeout'); }));
  }
});

test('symbol-only indexes do not present an unqueried free-text gene name as an empty result', () => {
  for (const name of ['NCBI Gene', 'ClinVar']) {
    const provider = find(name);
    assert.equal(provider.accepts?.({ mode: 'gene', term: 'nephrin protein' }), false);
    assert.equal(provider.accepts?.({ mode: 'gene', term: 'ENSG00000161270' }), false);
    assert.equal(provider.accepts?.({ mode: 'gene', term: 'NPHS1' }), true);
  }
});
