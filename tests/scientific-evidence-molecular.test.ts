import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReadJson, ResearchMode } from '../supabase/functions/scientific-evidence/contract.ts';
import { molecularSources } from '../supabase/functions/scientific-evidence/molecular.ts';

function search(name: string, mode: ResearchMode, term: string, read: ReadJson) {
  const provider = molecularSources.find(source => source.name === name);
  assert.ok(provider);
  assert.ok(provider.modes.includes(mode));
  return provider.search({ mode, term }, read);
}

const nephrotic = { id: 'MONDO_0005377', name: 'nephrotic syndrome' };
const other = { id: 'MONDO_0044765', name: 'steroid-resistant nephrotic syndrome' };
const nphs1 = { id: 'ENSG00000161270', approvedSymbol: 'NPHS1' };
const disease = {
  ...nephrotic,
  associatedTargets: { rows: [{ score: 0.883, target: nphs1 }] },
  compounds: { rows: [] },
};

test('Open Targets resolves the exact label rather than the top-ranked subtype', async () => {
  const read: ReadJson = async (url, options) => {
    assert.equal(url.hostname, 'api.platform.opentargets.org');
    const { variables } = JSON.parse(String(options?.body));
    if (variables.term) return { data: { search: { hits: [other, nephrotic] } } };
    assert.equal(variables.id, nephrotic.id);
    return { data: { disease } };
  };
  const rows = await search('Open Targets', 'disease', 'Nephrotic Syndrome', read);
  const match = rows.find(row => row.kind === 'association');
  assert.equal(match?.followUp?.term, 'NPHS1');
  assert.ok(match?.url.includes(nphs1.id));
  assert.ok(match?.related?.some(ref => ref.url.endsWith(nephrotic.id)));
});

test('Open Targets returns ontology candidates for ambiguous or approximate terms without fetching associations', async () => {
  for (const [term, hits] of [['nephrotic', [other, nephrotic]], [other.name, [other, { ...nephrotic, name: other.name }]]] as const) {
    let calls = 0;
    const rows = await search('Open Targets', 'disease', term,
      async () => { calls++; return { data: { search: { hits } } }; });
    assert.equal(calls, 1);
    assert.deepEqual(rows.map(row => row.kind), ['disease', 'disease']);
    assert.deepEqual(rows[0].followUp, { mode: 'disease', term: other.id });
  }
});

test('a direct ontology identifier never substitutes a different condition', async () => {
  const result = await search('Open Targets', 'disease', 'MONDO:0005377', async (_, options) => {
    assert.equal(JSON.parse(String(options?.body)).variables.id, nephrotic.id);
    return { data: { disease: null } };
  });
  assert.deepEqual(result, []);
  await assert.rejects(search('Open Targets', 'disease', nephrotic.id, async () => ({ data: { disease: { ...disease, id: other.id } } })));
  await assert.rejects(search('Open Targets', 'disease', nephrotic.id, async () => ({ data: { disease: null }, errors: [{ message: 'upstream error' }] })));
});

test('Ensembl returns human gene cross-references, skips LRG records, and propagates transport errors', async () => {
  const rows = await search('Ensembl', 'gene', 'NPHS1', async url => {
    assert.match(url.pathname, /xrefs\/symbol\/homo_sapiens\/NPHS1$/);
    return [{ type: 'gene', id: nphs1.id }, { type: 'gene', id: 'LRG_693' }];
  });
  assert.equal(rows[0].id, nphs1.id);
  assert.equal(rows.length, 1);
  assert.deepEqual(await search('Ensembl', 'gene', 'XYZ', async () => []), []);
  await assert.rejects(search('Ensembl', 'gene', 'NPHS1', async () => { throw Error('timeout'); }));
});

const protein = { primaryAccession: 'O60500', organism: { taxonId: 9606 }, proteinDescription: { recommendedName: { fullName: { value: 'Nephrin' } } } };

test('UniProt searches reviewed human records and emits a source-controlled accession link', async () => {
  const rows = await search('UniProt', 'gene', 'NPHS1', async url => {
    const q = url.searchParams.get('query');
    assert.match(q ?? '', /gene_exact:NPHS1/);
    assert.match(q ?? '', /organism_id:9606/);
    assert.match(q ?? '', /reviewed:true/);
    return { results: [protein] };
  });
  assert.equal(rows[0].url, 'https://www.uniprot.org/uniprotkb/O60500/entry');
  assert.match(rows[0].title, /nephrin/i);
});

test('AlphaFold annotations correspond to the reviewed protein accession and identify model predictions', async () => {
  const rows = await search('AlphaFold DB', 'gene', 'NPHS1', async url => {
    if (url.hostname === 'rest.uniprot.org') return { results: [protein] };
    assert.ok(url.href.endsWith('/prediction/O60500'));
    return [{ entryId: 'AF-O60500-F1', uniprotAccession: 'O60500', taxId: 9606, uniprotDescription: 'Nephrin', latestVersion: 6 }];
  });
  assert.equal(rows[0].kind, 'structure');
  assert.match(rows[0].detail, /prédit|prédict/i);
  assert.ok(rows[0].related?.some(ref => ref.url === 'https://www.uniprot.org/uniprotkb/O60500/entry'));
});

test('ChEMBL keeps textual matches identifiable and supports an exact compound identifier', async () => {
  const compound = { molecule_chembl_id: 'CHEMBL1201576', pref_name: 'RITUXIMAB', molecule_type: 'Antibody' };
  for (const term of ['rituximab', compound.molecule_chembl_id]) {
    const [row] = await search('ChEMBL', 'drug', term, async url => {
      assert.equal(url.searchParams.get('q') ?? url.searchParams.get('molecule_chembl_id'), term);
      return { molecules: [compound] };
    });
    assert.equal(row.id, compound.molecule_chembl_id);
    assert.equal(row.kind, 'compound');
  }
});

test('malformed molecular source responses are never reported as a valid empty result', async () => {
  for (const [name, mode, term] of [['Open Targets','disease','nephrotic'], ['Ensembl','gene','NPHS1'], ['UniProt','gene','NPHS1'], ['AlphaFold DB','gene','NPHS1'], ['ChEMBL','drug','rituximab']] as const) {
    await assert.rejects(search(name, mode, term, async () => ({ fault: 'upstream' })));
  }
});

test('Open Targets keeps distinct studies and termination reasons when one compound recurs', async () => {
  const drug = { id: 'CHEMBL945', name: 'AMILORIDE' };
  const reports = [
    { id: 'nct00000001', origin: 'CLINICAL_TRIAL', trialOverallStatus: 'TERMINATED', trialWhyStopped: 'safety review' },
    { id: 'nct00000002', origin: 'CLINICAL_TRIAL', trialOverallStatus: 'COMPLETED' },
  ];
  const rows = await search('Open Targets', 'disease', nephrotic.id, async (_url, options) => {
    assert.match(JSON.parse(String(options?.body)).query, /drugAndClinicalCandidates/);
    return { data: { disease: { ...disease, compounds: { rows: [{ drug, clinicalReports: reports }] } } } };
  });
  const studies = rows.filter(row => row.kind === 'compound');
  assert.equal(new Set(studies.map(r => r.id)).size, 2);
  assert.match(studies[0].detail, /safety review/);
  assert.match(studies[1].detail, /COMPLETED/);
  assert.deepEqual(studies.map(r => r.url), reports.map(r => 'https://clinicaltrials.gov/study/' + r.id.toUpperCase()));
  assert.ok(studies.every(r => r.related?.some(link => link.id === drug.id)));
});

test('an Ensembl identifier resolves to a human symbol for further research', async () => {
  const [row] = await search('Ensembl', 'gene', nphs1.id, async (url, options) => {
    assert.equal(url.pathname, '/lookup/id');
    assert.deepEqual(JSON.parse(String(options?.body)), { ids: [nphs1.id] });
    return { [nphs1.id]: { id: nphs1.id, species: 'homo_sapiens', object_type: 'Gene', display_name: 'NPHS1' } };
  });
  assert.deepEqual(row.followUp, { term: 'NPHS1', mode: 'gene' });
  assert.equal(molecularSources.find(p => p.name === 'UniProt')?.accepts?.({ mode: 'gene', term: nphs1.id }), false);
});

test('disease-specific judgments have distinct keys and retain canonical entity and registry links', async () => {
  const withTrial = { id: 'CHEMBL945', name: 'AMILORIDE' };
  const withoutTrial = { id: 'CHEMBL635', name: 'PREDNISONE' };
  const compounds = { rows: [
    { drug: withTrial, clinicalReports: [{ id: 'nct00000001', origin: 'CLINICAL_TRIAL' }] },
    { drug: withoutTrial, clinicalReports: [] },
  ] };
  const byDisease = await Promise.all([nephrotic, other].map(condition => search('Open Targets', 'disease', condition.id,
    async () => ({ data: { disease: { ...disease, ...condition, compounds } } }))));
  assert.equal(new Set(byDisease.flat().map(row => row.id)).size, 6);
  for (const [index, records] of byDisease.entries()) {
    const condition = [nephrotic, other][index];
    const [association, trial, compound] = records;
    assert.ok(records.every(row => row.related?.some(ref => ref.id === condition.id)));
    assert.ok(association.related?.some(ref => ref.id === nphs1.id && ref.url.endsWith('/target/' + nphs1.id)));
    assert.ok(trial.related?.some(ref => ref.id === withTrial.id));
    assert.ok(trial.related?.some(ref => ref.id === 'NCT00000001'));
    assert.ok(compound.related?.some(ref => ref.id === withoutTrial.id));
  }
});
