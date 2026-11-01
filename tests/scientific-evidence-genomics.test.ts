import assert from 'node:assert/strict';
import test from 'node:test';
import { genomicsSources } from '../supabase/functions/scientific-evidence/genomics.ts';
const providers = Object.fromEntries(genomicsSources.map(source => [source.name, source]));
const gene = { mode: 'gene' as const, term: 'NPHS1' };

test('HPA selects only the requested human gene and labels the measurement as RNA', async () => {
  const records = await providers['Human Protein Atlas'].search(gene, async () => [
    { Gene: 'EMP2', Ensembl: 'ENSG00000213853' },
    { Gene: 'NPHS1', Ensembl: 'ENSG00000161270', 'RNA tissue specificity': 'Group enriched', 'RNA tissue specific nTPM': { kidney: '39.8' } },
  ]);
  assert.equal(records.length, 1);
  await assert.rejects(providers['Human Protein Atlas'].search(gene, async () => [{}]));
  assert.equal(records[0].id, 'HPA:ENSG00000161270');
  assert.match(records[0].detail, /ARN.*kidney.*39.8 nTPM/);
  await assert.rejects(providers['Human Protein Atlas'].search(gene, async () => [{ Gene: 'NPHS1', Ensembl: '../' }]));
});

test('STRING resolves a human protein before requesting partner associations', async () => {
  const a = '9606.ENSP00000368190', b = '9606.ENSP00000356587';
  const [record] = await providers.STRING.search(gene, async (url, init) => {
    assert.equal(init?.method, 'POST');
    const body = new URLSearchParams(String(init.body));
    assert.equal(body.get('species'), '9606');
    if (url.pathname.endsWith('get_string_ids')) return [{ stringId: a, preferredName: 'NPHS1', ncbiTaxonId: 9606 }];
    assert.equal(body.get('identifiers'), a);
    return [{ stringId_A: a, stringId_B: b, preferredName_A: 'NPHS1', preferredName_B: 'NPHS2', ncbiTaxonId: 9606, score: 0.996 }];
  });
  assert.match(record.detail, /association fonctionnelle/i);
  assert.match(record.detail, /0.996/);
  assert.deepEqual(new URL(record.url).searchParams.get('identifiers')?.split('\r'), [a, b]);
  assert.match(record.title, /NPHS2/);
  assert.deepEqual(await providers.STRING.search(gene, async () => []), []);
  await assert.rejects(providers.STRING.search(gene, async () => [{ stringId: b, preferredName: 'Alien', ncbiTaxonId: 10090 }]));
});

test('STRING returns a candidate to select when an alias or family maps to another symbol', async () => {
  const provider = providers.STRING;
  for (const [term, symbol, id] of [
    ['APOL', 'APOL1', '9606.ENSP00000368910'], ['CYP', 'PPIG', '9606.ENSP00000362547'],
  ]) {
    const [candidate] = await provider.search({ mode: 'gene', term }, async url => {
      assert.match(url.pathname, /get_string_ids$/);
      return [{ stringId: id, preferredName: symbol, ncbiTaxonId: 9606 }];
    });
    assert.equal(candidate.kind, 'gene');
    assert.deepEqual(candidate.followUp, { mode: 'gene', term: id });
    assert.match(candidate.detail, /candidat/i);
  }
});

test('GWAS gene preserves a mapped association with a PMID, never a causal claim', async () => {
  const gwas = providers['GWAS Catalog'];
  const [record] = await gwas.search(gene, async url => {
    assert.equal(url.searchParams.get('mapped_gene'), 'NPHS1');
    return { _embedded: { associations: [{ association_id: 227747327, accession_id: 'GCST91000670', pubmed_id: '38836225',
      mapped_genes: ['NPHS1'], reported_trait: ['Creatinine-cystatin C ratio'], snp_effect_allele: ['rs3814995-T'], pvalue_mantissa: 3, pvalue_exponent: -8 }] } };
  });
  assert.equal(record.kind, 'association');
  assert.match(record.detail, /3 × 10\^-8/);
  assert.match(record.detail, /rs3814995-T/);
  assert.equal(record.related?.[0].id, 'PMID:38836225');
  assert.deepEqual(await gwas.search(gene, async () => ({ page: { totalElements: 0 } })), []);
  await assert.rejects(gwas.search(gene, async () => ({ page: { totalElements: 5 } })));
  await assert.rejects(gwas.search(gene, async () => ({ page: { totalElements: 5 }, _embedded: { associations: [] } })));
});

test('CPIC lookup uses an exact drug or gene and labels its annotation without inferring a prescription', async () => {
  const cpic = providers['CPIC / ClinPGx'];
  const [record] = await cpic.search({ mode: 'drug', term: 'Warfarin' }, async url => {
    assert.equal(url.searchParams.get('drugname'), 'eq.warfarin');
    return [{ pairid: 110149, genesymbol: 'CYP4F2', drugname: 'warfarin', cpiclevel: 'A', provisional: false,
      guidelineurl: 'https://malicious.invalid/', pmids: ['28198005', '../'] }];
  });
  assert.match(record.detail, /niveau CPIC A/);
  assert.match(record.url, /^https:\/\/api\.cpicpgx\.org\//);
  assert.equal(record.related?.length, 1);
  assert.equal(record.related?.[0].id, 'PMID:28198005');
  assert.deepEqual(await cpic.search(gene, async () => []), []);
  await assert.rejects(cpic.search(gene, async () => ({})));
});
