import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGraphLiteratureQuery, collectExternalSources } from '../supabase/functions/deep-research-graph/sources.ts';

const article = (id: string, abstract = 'Synthetic population-specific study context.', publicationType = 'Randomized Controlled Trial') =>
  '<PubmedArticle><MedlineCitation><PMID>' + id + '</PMID><Article><ArticleTitle>Synthetic study ' + id + '</ArticleTitle>' +
  '<Journal><Title>Test journal</Title><PubDate><Year>2025</Year></PubDate></Journal>' +
  '<Abstract><AbstractText Label="RESULTS">' + abstract + '</AbstractText></Abstract>' +
  '<PublicationTypeList><PublicationType>' + publicationType + '</PublicationType></PublicationTypeList></Article></MedlineCitation></PubmedArticle>';

function sourceFetcher(xml: string, ids = ['123'], count = ids.length) {
  return async (url: string) => {
    const endpoint = new URL(url).pathname;
    if (endpoint.endsWith('esearch.fcgi')) return Response.json({ esearchresult: { idlist: ids, count: String(count) } });
    if (endpoint.endsWith('esummary.fcgi')) return Response.json({ result: Object.fromEntries(ids.map(id => [id, { uid: id, title: 'Synthetic study ' + id }])) });
    return new Response('<PubmedArticleSet>' + xml + '</PubmedArticleSet>', { headers: { 'Content-Type': 'application/xml' } });
  };
}

test('graph literature retains retrieved abstracts, study metadata and French-to-English search aliases', async () => {
  const query = buildGraphLiteratureQuery('Syndrome néphrotique');
  assert.match(query, /nephrotic syndrome/);
  assert.equal(query, '("nephrotic syndrome")');
  const { pubmed } = await collectExternalSources('Syndrome néphrotique', undefined, true, false, sourceFetcher(article('123')));
  assert.equal(pubmed.status, 'available');
  assert.equal(pubmed.records[0].abstract, 'RESULTS: Synthetic population-specific study context.');
  assert.equal(pubmed.records[0].year, '2025');
  assert.equal(pubmed.records[0].journal, 'Test journal');
  assert.deepEqual(pubmed.records[0].publication_types, ['Randomized Controlled Trial']);
});

test('each selected pathology gets its own search and source failures identify the affected topic', async () => {
  const queries: string[] = [];
  const fetcher = async (url: string) => {
    const query = new URL(url).searchParams.get('term') ?? '';
    queries.push(query);
    return query.includes('heart failure') ? Response.json({}, { status: 503 })
      : Response.json({ esearchresult: { idlist: [], count: '0' } });
  };
  const { pubmed } = await collectExternalSources('Diabète de type 2', undefined, true, false, fetcher,
    ['Diabète de type 2', 'Insuffisance cardiaque']);
  assert.equal(queries.length, 2);
  assert.ok(queries.some(query => query.includes('type 2 diabetes')));
  assert.ok(queries.some(query => query.includes('heart failure')));
  assert.equal(pubmed.status, 'partial');
  assert.deepEqual(pubmed.query_statuses?.map(query => [query.topic, query.status]), [
    ['Diabète de type 2', 'empty'], ['Insuffisance cardiaque', 'unavailable'],
  ]);
});

test('retracted articles are excluded and incomplete abstracts are disclosed', async () => {
  const { pubmed } = await collectExternalSources('Synthetic condition', undefined, true, false,
    sourceFetcher(article('123', 'Retracted result.', 'Retracted Publication') + article('456', 'x'.repeat(6001)), ['123', '456']));
  assert.equal(pubmed.status, 'partial');
  assert.deepEqual(pubmed.records.map(record => record.id), ['456']);
  assert.equal(pubmed.records[0].abstract_truncated, true);
  assert.equal(pubmed.records[0].abstract?.length, 6000);
  assert.match(pubmed.detail ?? '', /incomplets|écartés/);
});

test('retrieval limits remain partial even when every selected article has an abstract', async () => {
  const { pubmed } = await collectExternalSources('Synthetic condition', undefined, true, false, sourceFetcher(article('123'), ['123'], 100));
  assert.equal(pubmed.status, 'partial');
  assert.match(pubmed.detail ?? '', /100/);
});

test('an unrequested identifier cannot contribute an abstract to a valid retrieved notice', async () => {
  const { pubmed } = await collectExternalSources('Synthetic condition', undefined, true, false, sourceFetcher(article('999', 'Unexpected content.')));
  assert.equal(pubmed.status, 'partial');
  assert.deepEqual(pubmed.records.map(record => record.id), ['123']);
  assert.equal(pubmed.records[0].abstract, undefined);
  assert.ok(!JSON.stringify(pubmed).includes('Unexpected content'));
});
