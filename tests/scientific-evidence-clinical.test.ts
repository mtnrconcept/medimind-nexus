import assert from 'node:assert/strict';
import test from 'node:test';
import { clinicalSources } from '../supabase/functions/scientific-evidence/clinical.ts';
import type { ReadJson } from '../supabase/functions/scientific-evidence/contract.ts';

const providers = Object.fromEntries(clinicalSources.map(provider => [provider.name, provider]));
const disease = { mode: 'disease' as const, term: 'nephrotic syndrome' };

const pubmedRecord = {
  uid: '29913001', title: 'Trial publication', pubdate: '2018 Sep',
  pubtype: ['Clinical Trial', 'Journal Article'], fulljournalname: 'A journal',
  articleids: [{ idtype: 'doi', value: '10.1001/example.2018' }],
};

test('PubMed validates both calls and reports the actual indexed type without guessing randomization', async () => {
  const urls: URL[] = [];
  const read: ReadJson = async url => {
    urls.push(url);
    return urls.length === 1 ? { esearchresult: { count: '1', idlist: ['29913001'] } } :
      { result: { uids: ['29913001'], '29913001': pubmedRecord } };
  };
  const [record] = await providers['PubMed'].search(disease, read);
  assert.equal(record.id, 'PMID:29913001');
  assert.equal(record.url, 'https://pubmed.ncbi.nlm.nih.gov/29913001/');
  assert.equal(record.kind, 'publication');
  assert.match(record.detail, /Clinical Trial/);
  assert.doesNotMatch(record.detail, /random/i);
  assert.equal(urls[0].searchParams.get('term'), disease.term);
  assert.equal(urls[1].searchParams.get('id'), '29913001');
});

test('PubMed treats a valid zero differently from upstream XML/JSON errors or partial summaries', async () => {
  const pubmed = providers['PubMed'];
  assert.deepEqual(await pubmed.search(disease, async () => ({ esearchresult: { count: '0', idlist: [] } })), []);
  await assert.rejects(pubmed.search(disease, async () => ({ esearchresult: { ERROR: 'upstream maintenance', idlist: [] } })));
  await assert.rejects(pubmed.search(disease, async url => url.pathname.endsWith('esearch.fcgi')
    ? { esearchresult: { count: '1', idlist: ['29913001'] } } : { result: { uids: [], '29913001': { error: 'Invalid uid' } } }));
  await assert.rejects(pubmed.search(disease, async () => ({ esearchresult: { count: '1', idlist: ['../private'] } })));
});

test('Europe PMC keeps shared PMIDs canonical and distinguishes preprints by source', async () => {
  const hits = await providers['Europe PMC'].search(disease, async () => ({
    hitCount: 2, resultList: { result: [
      { source: 'MED', id: '29913001', pmid: '29913001', title: 'Trial publication', pubYear: '2018', pubTypeList: { pubType: ['Clinical Trial'] } },
      { source: 'PPR', id: 'PPR12345', title: 'Early hypothesis', pubTypeList: { pubType: ['preprint'] } },
    ] },
  }));
  assert.equal(hits[0].id, 'PMID:29913001');
  assert.equal(hits[1].id, 'EPMC:PPR:PPR12345');
  assert.equal(hits[1].url, 'https://europepmc.org/article/PPR/PPR12345');
  assert.match(hits[1].detail, /prépublication/i);
});

test('Europe PMC rejects schema drift, inconsistent empty results and unsafe accessions', async () => {
  const epmc = providers['Europe PMC'];
  assert.deepEqual(await epmc.search(disease, async () => ({ hitCount: 0, resultList: { result: [] } })), []);
  await assert.rejects(epmc.search(disease, async () => ({ hitCount: 2, resultList: { result: [] } })));
  await assert.rejects(epmc.search(disease, async () => ({ resultList: {} })));
  await assert.rejects(epmc.search(disease, async () => ({
    hitCount: 1, resultList: { result: [{ source: 'MED', id: '29913001', pmid: '39513526', title: 'Mismatched PMID' }] },
  })));
  await assert.rejects(epmc.search(disease, async () => ({
    hitCount: 1, resultList: { result: [{ source: 'MED', id: '../../bad', title: 'Record' }] },
  })));
});

const study = {
  protocolSection: {
    identificationModule: { nctId: 'NCT02438982', briefTitle: 'Synthetic test protocol' },
    statusModule: { overallStatus: 'COMPLETED' },
    designModule: { phases: ['PHASE3'] },
    armsInterventionsModule: { interventions: [{ name: 'Intervention A' }] },
    outcomesModule: { primaryOutcomes: [{ measure: 'Relapse rate', timeFrame: '12 months' }] },
    referencesModule: { references: [
      { pmid: '29913001', type: 'RESULT' }, { pmid: '39513526', type: 'DERIVED' }, { pmid: '1', type: 'BACKGROUND' }, { pmid: 'ABC', type: 'RESULT' },
    ] },
  },
  hasResults: false,
};

test('registry keeps status separate from posted results, and includes interventions, endpoints and study-linked PMIDs', async () => {
  const [record] = await providers['ClinicalTrials.gov'].search(disease, async url => {
    assert.equal(url.searchParams.get('query.cond'), disease.term);
    return { studies: [study] };
  });
  assert.equal(record.kind, 'trial');
  assert.equal(record.id, 'NCT02438982');
  assert.match(record.detail, /COMPLETED/);
  assert.match(record.detail, /PHASE3/);
  assert.match(record.detail, /Intervention A/);
  assert.match(record.detail, /Relapse rate/);
  assert.match(record.detail, /12 months/);
  assert.match(record.detail, /non déposés/i);
  assert.deepEqual(record.related, [
    { id: 'PMID:29913001', url: 'https://pubmed.ncbi.nlm.nih.gov/29913001/' },
    { id: 'PMID:39513526', url: 'https://pubmed.ncbi.nlm.nih.gov/39513526/' },
  ]);
  assert.match(record.detail, /liens bibliographiques/i);
});

test('registry explicitly differentiates posted results and unspecified status; searches the appropriate indexed field', async () => {
  const trials = providers['ClinicalTrials.gov'];
  for (const mode of ['gene', 'drug'] as const) {
    const [posted, unknown] = await trials.search({ mode, term: 'term' }, async url => {
      assert.equal(url.searchParams.get(mode === 'drug' ? 'query.intr' : 'query.term'), 'term');
      return { studies: [{ ...study, hasResults: true }, { ...study, hasResults: undefined }] };
    });
    assert.match(posted.detail, /résultats déposés/i);
    assert.match(unknown.detail, /dépôt des résultats non renseigné/i);
  }
  assert.deepEqual(await trials.search(disease, async () => ({ studies: [] })), []);
  await assert.rejects(trials.search(disease, async () => ({ error: 'access denied' })));
  await assert.rejects(trials.search(disease, async () => ({ studies: [{ protocolSection: {} }] })));
});

test('canonical PMID resolves by exact identifiers in both bibliographies, regardless of research mode', async () => {
  for (const mode of ['disease', 'gene', 'drug'] as const) {
    const query = { mode, term: 'PMID:29913001' };
    const [article] = await providers.PubMed.search(query, async url => {
      if (url.pathname.endsWith('esearch.fcgi')) {
        assert.equal(url.searchParams.get('term'), '29913001[uid]');
        return { esearchresult: { count: '1', idlist: ['29913001'] } };
      }
      assert.equal(url.searchParams.get('id'), '29913001');
      return { result: { uids: ['29913001'], '29913001': pubmedRecord } };
    });
    const [indexed] = await providers['Europe PMC'].search(query, async url => {
      assert.equal(url.searchParams.get('query'), 'SRC:MED AND EXT_ID:29913001');
      return { hitCount: 1, resultList: { result: [{ source: 'MED', id: '29913001', title: 'Publication' }] } };
    });
    assert.equal(article.id, query.term);
    assert.equal(indexed.id, query.term);
    await assert.rejects(providers.PubMed.search(query, async () => ({ esearchresult: { count: '1', idlist: ['39513526'] } })));
    await assert.rejects(providers['Europe PMC'].search(query, async () => ({
      hitCount: 1, resultList: { result: [{ source: 'MED', id: '39513526', title: 'Other publication' }] },
    })));
  }
});

test('canonical trial ID bypasses topic fields and rejects an unexpected NCT', async () => {
  for (const mode of ['disease', 'gene', 'drug'] as const) {
    const query = { mode, term: 'NCT02438982' };
    const [record] = await providers['ClinicalTrials.gov'].search(query, async url => {
      assert.equal(url.searchParams.get('filter.ids'), query.term);
      assert.equal(url.searchParams.has('query.cond'), false);
      assert.equal(url.searchParams.has('query.intr'), false);
      assert.equal(url.searchParams.has('query.term'), false);
      return { studies: [study] };
    });
    assert.equal(record.id, query.term);
    await assert.rejects(providers['ClinicalTrials.gov'].search({ mode, term: 'NCT00000001' }, async () => ({ studies: [study] })));
  }
});

test('NCT-indexed literature and PMID-indexed trials use explicit bibliographic links in both directions', async () => {
  await providers.PubMed.search({ mode: 'drug', term: 'NCT02438982' }, async url => {
    assert.equal(url.searchParams.get('term'), 'NCT02438982[si]');
    return { esearchresult: { count: '0', idlist: [] } };
  });
  const input = { mode: 'gene' as const, term: 'PMID:29913001' };
  const [trial] = await providers['ClinicalTrials.gov'].search(input, async url => {
    assert.equal(url.searchParams.get('query.term'), 'AREA[ReferencePMID]29913001');
    return { studies: [study] };
  });
  assert.equal(trial.id, 'NCT02438982');
  assert.match(trial.detail, /liens bibliographiques/i);
  await assert.rejects(providers['ClinicalTrials.gov'].search({ ...input, term: 'PMID:99999999' }, async () => ({ studies: [study] })));
});
