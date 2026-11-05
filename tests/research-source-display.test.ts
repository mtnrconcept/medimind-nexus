import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ResearchSourceList, ResearchTraceDetails } from '../src/components/patient/ResearchSourceList.tsx';

test('bibliographic evidence remains inspectable with its complete title, abstract and retrieval limits', () => {
  const title = 'A long synthetic study title retained beyond the previous fifty character display limit';
  const html = renderToStaticMarkup(createElement(ResearchSourceList, { sources: [{
    title, url: 'https://pubmed.ncbi.nlm.nih.gov/12345/', abstract: 'Synthetic abstract content.',
    pmid: '12345', provider: 'PubMed', journal: 'Synthetic Journal', year: '2026',
    publicationTypes: ['Randomized Controlled Trial'], abstractTruncated: true,
  }] }));
  for (const text of [title, 'Synthetic abstract content.', 'PMID 12345', 'Synthetic Journal', '2026',
    'Randomized Controlled Trial', 'Résumé abrégé']) assert.ok(html.includes(text), `Missing ${text}`);
  assert.match(html, /<details/);
  assert.match(html, /<summary/);
});

test('legacy references remain readable without invented abstracts, grades, or active unsafe URLs', () => {
  const html = renderToStaticMarkup(createElement(ResearchSourceList, { sources: [
    { title: '<script>fixture</script>', url: 'javascript:alert(1)' },
    { title: 'Credential-bearing URL', url: 'https://user:secret@example.test/path' },
    { title: 'Existing citation', url: 'https://pubmed.ncbi.nlm.nih.gov/12345/' },
  ] }));
  assert.doesNotMatch(html, /<script|href="javascript:|href="https:\/\/user:|<details|grade/i);
  assert.match(html, /&lt;script&gt;fixture&lt;\/script&gt;/);
  assert.match(html, /Existing citation/);
});

test('expanded queries and unavailable providers remain visible beside the results', () => {
  const html = renderToStaticMarkup(createElement(ResearchTraceDetails, {
    scopeNotes: ['Expanded to a pharmacological class; individual applicability is unknown.'],
    providers: [{ name: 'PubMed', query: 'synthetic query', status: 'unavailable', count: 0 }],
  }));
  assert.match(html, /synthetic query/);
  assert.match(html, /source indisponible/);
  assert.match(html, /individual applicability is unknown/);
});
