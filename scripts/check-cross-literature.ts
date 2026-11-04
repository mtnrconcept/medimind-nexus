import { buildPairCandidates } from '../supabase/functions/cross-data-analyzer/analysis-utils.ts';
import { createLiteratureSearch } from '../supabase/functions/cross-data-analyzer/pubmed-research.ts';
const pairs = buildPairCandidates([
  { name: 'Varicella without complication', type: 'pathology' },
  { name: 'Nephrotic syndrome, other', type: 'pathology' },
  { name: 'Œdème des paupières', type: 'symptom' },
  { name: 'ciclosporin', type: 'medication', substance: 'ciclosporin', atcCode: 'S01XA18' },
  { name: 'ACICLOVIR ACCORD 25 mg/mL, solution à diluer pour perfusion', type: 'medication', substance: 'ACICLOVIR 25 mg1 mL de solution + ACICLOVIR SODIQUE' },
  { name: 'Prednisolone', type: 'medication', substance: 'prednisolone' },
]);
const search = createLiteratureSearch();
let matched = 0, unavailable = 0, empty = 0;
for (const pair of pairs) {
  const result = await search(pair, 3);
  if (result.status === 'matched') matched++;
  else if (result.status === 'empty') empty++;
  else unavailable++;
  console.log(JSON.stringify({ query: result.query, status: result.status, articles: result.articles.map(a => ({ pmid: a.pmid, title: a.title, hasAbstract: Boolean(a.abstract) })), providers: result.providers }));
}
console.log(JSON.stringify({ pairs: pairs.length, matched, empty, unavailable }));
