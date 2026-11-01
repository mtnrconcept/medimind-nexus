import { isValidNctId, mapClinicalTrialStudy } from '../clinical-trials-sync/mapper.ts';
import type { EvidenceRecord, Provider, ReadJson, ResearchQuery } from './contract.ts';

const limit = 6;
const pmidPattern = /^[1-9]\d{0,8}$/;
const pmidQuery = /^PMID:\s*([1-9]\d{0,8})$/i;
const pmcidPattern = /^PMC[1-9]\d{0,9}$/;

// Only a well-formed empty list constitutes an empty search. Other envelopes
// (including upstreams returning HTTP 200 with an error) must reach the caller.
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid record');
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid result list');
  return value;
}

function text(value: unknown, max = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function entries(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => text(item)).filter(Boolean) : [];
}

function pubmedLink(id: string) {
  return { id: `PMID:${id}`, url: `https://pubmed.ncbi.nlm.nih.gov/${id}/` };
}

function entrezUrl(operation: string, params: Record<string, string>) {
  const url = new URL(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/${operation}.fcgi`);
  url.search = new URLSearchParams({ db: 'pubmed', retmode: 'json', ...params }).toString();
  return url;
}

async function pubmed(query: ResearchQuery, read: ReadJson): Promise<EvidenceRecord[]> {
  const pmid = pmidQuery.exec(query.term)?.[1];
  const nct = query.term.toUpperCase();
  const term = pmid ? pmid + '[uid]' : isValidNctId(nct) ? nct + '[si]' : query.term;
  const response = object(await read(entrezUrl('esearch', { term, retmax: String(limit), sort: 'relevance' })));
  const search = object(response.esearchresult);
  if (response.error || response.ERROR || search.ERROR || search.error || search.errorlist) throw new Error('PubMed search error');
  const ids = array(search.idlist).slice(0, limit);
  if (!ids.length && String(search.count) !== '0') throw new Error('Missing PubMed results');
  if (!ids.length) return [];
  if (!ids.every((id): id is string => typeof id === 'string' && pmidPattern.test(id))) throw new Error('Invalid PMID');
  if (pmid && (ids.length !== 1 || ids[0] !== pmid)) throw new Error('Unexpected PubMed identifier');
  const summaries = object(object(await read(entrezUrl('esummary', { id: ids.join(',') }))).result);

  return ids.map(id => {
    const article = object(summaries[id]);
    const title = text(article.title, 500);
    if (article.uid !== id || !title || article.error) throw new Error('Unavailable PubMed summary');
    return {
      ...pubmedLink(id), kind: 'publication', title,
      detail: [text(article.pubdate), text(article.fulljournalname),
        entries(article.pubtype).join(', ')].filter(Boolean).join(' · ') || 'Notice bibliographique indexée.',
    };
  });
}

async function europePmc(query: ResearchQuery, read: ReadJson): Promise<EvidenceRecord[]> {
  const url = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
  const requestedPmid = pmidQuery.exec(query.term)?.[1];
  const term = requestedPmid ? 'SRC:MED AND EXT_ID:' + requestedPmid : query.term;
  url.search = new URLSearchParams({ query: term, resultType: 'core', pageSize: String(limit), format: 'json' }).toString();
  const response = object(await read(url));
  const results = array(object(response.resultList).result);
  const count = response.hitCount;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < results.length || (!results.length && count !== 0)) {
    throw new Error('Missing Europe PMC results');
  }

  return results.slice(0, limit).map(item => {
    const record = object(item);
    const title = text(record.title, 500);
    const source = text(record.source);
    const accession = text(record.id);
    if (!title || !/^[A-Z]{2,8}$/.test(source) || !/^[\w.-]{1,80}$/.test(accession) || accession === '.' || accession === '..') {
      throw new Error('Invalid Europe PMC record');
    }
    if (requestedPmid && (source !== 'MED' || accession !== requestedPmid)) throw new Error('Unexpected Europe PMC identifier');
    const pmid = text(record.pmid) || (source === 'MED' ? accession : '');
    const pmcid = text(record.pmcid) || (source === 'PMC' ? accession : '');
    if ((source === 'MED' && pmid !== accession) || (pmid && !pmidPattern.test(pmid))) throw new Error('Invalid Europe PMC PMID');
    if ((source === 'PMC' && pmcid !== accession) || (pmcid && !pmcidPattern.test(pmcid))) throw new Error('Invalid PMCID');
    const pubTypes = record.pubTypeList ? entries(object(record.pubTypeList).pubType) : [];
    const id = pmid ? `PMID:${pmid}` : pmcid ? `PMCID:${pmcid}` : `EPMC:${source}:${accession}`;
    const related = [];
    if (pmcid && pmid) related.push({ id: `PMCID:${pmcid}`, url: `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/` });
    const doi = text(record.doi);
    if (/^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(doi)) {
      related.push({ id: `DOI:${doi}`, url: `https://doi.org/${doi}` });
    }
    return {
      id, title, kind: 'publication', url: `https://europepmc.org/article/${source}/${accession}`,
      detail: [source === 'PPR' ? 'Prépublication' : 'Notice bibliographique', text(record.pubYear),
        pubTypes.join(', ')].filter(Boolean).join(' · '), related,
    };
  });
}

const trialFields = [
  'NCTId', 'BriefTitle', 'OfficialTitle', 'OverallStatus', 'Phase', 'InterventionName',
  'PrimaryOutcomeMeasure', 'PrimaryOutcomeTimeFrame', 'ReferencePMID', 'ReferenceType', 'HasResults',
];

async function clinicalTrials(query: ResearchQuery, read: ReadJson): Promise<EvidenceRecord[]> {
  const url = new URL('https://clinicaltrials.gov/api/v2/studies');
  const requestedNct = query.term.toUpperCase();
  const exact = isValidNctId(requestedNct);
  const requestedPmid = pmidQuery.exec(query.term)?.[1];
  const topicField = { disease: 'query.cond', drug: 'query.intr', gene: 'query.term' }[query.mode];
  const filter: Record<string, string> = exact ? { 'filter.ids': requestedNct } : requestedPmid
    ? { 'query.term': 'AREA[ReferencePMID]' + requestedPmid } : { [topicField]: query.term };
  url.search = new URLSearchParams({ ...filter, pageSize: String(limit), fields: trialFields.join(',') }).toString();
  const response = object(await read(url));

  return array(response.studies).slice(0, limit).map(item => {
    const study = object(item);
    const trial = mapClinicalTrialStudy(study);
    if (exact && trial.nct_id !== requestedNct) throw new Error('Unexpected ClinicalTrials.gov identifier');
    const protocol = object(study.protocolSection);
    const outcomes = object(protocol.outcomesModule ?? {}).primaryOutcomes;
    const primary = array(outcomes ?? []).slice(0, 2).map(outcome => {
      const value = object(outcome);
      return [text(value.measure), text(value.timeFrame)].filter(Boolean).join(' — ');
    }).filter(Boolean);
    const interventions = trial.interventions.slice(0, 3).map(value => text(object(value).name)).filter(Boolean);
    const resultStatus = study.hasResults === true ? 'Résultats déposés' :
      study.hasResults === false ? 'Résultats non déposés' : 'Dépôt des résultats non renseigné';
    const references = array(object(protocol.referencesModule ?? {}).references ?? []).map(object);
    if (requestedPmid && !references.some(reference => text(reference.pmid) === requestedPmid)) {
      throw new Error('Registry PMID link not present');
    }
    const relatedPmids = new Set<string>();
    for (const reference of references) {
      const pmid = text(reference.pmid);
      if ((reference.type === 'RESULT' || reference.type === 'DERIVED') && pmidPattern.test(pmid)) relatedPmids.add(pmid);
      if (relatedPmids.size >= limit) break;
    }
    return {
      id: trial.nct_id, url: trial.source_url, title: trial.title.slice(0, 500), kind: 'trial',
      detail: [resultStatus, trial.status, trial.phase,
        interventions.length && `Interventions : ${interventions.join(', ')}`,
        primary.length && `Critères principaux prévus : ${primary.join(' / ')}`,
        (relatedPmids.size || requestedPmid) && 'Liens bibliographiques du registre (déclarés ou repérés automatiquement).'].filter(Boolean).join(' · '),
      related: Array.from(relatedPmids, pubmedLink),
    };
  });
}

export const clinicalSources: Provider[] = [
  { name: 'PubMed', modes: ['disease', 'gene', 'drug'], citationLookup: true, search: pubmed },
  { name: 'Europe PMC', modes: ['disease', 'gene', 'drug'], citationLookup: true, search: europePmc },
  { name: 'ClinicalTrials.gov', modes: ['disease', 'gene', 'drug'], citationLookup: true, search: clinicalTrials },
];
