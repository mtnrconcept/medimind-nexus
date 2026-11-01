import type { EvidenceRecord, Provider, ReadJson, ResearchQuery } from './contract.ts';

const limit = 6;
const numberId = /^[1-9]\d{0,10}$/;
const ontologyId = /^([A-Za-z][A-Za-z0-9]{1,15})[:_](\d{1,12})$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid source record');
  return value as Record<string, unknown>;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid result list');
  return value;
}

function field(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 500) : '';
}

function withParams(endpoint: string, params: Record<string, string>): URL {
  const url = new URL(endpoint);
  url.search = new URLSearchParams(params).toString();
  return url;
}

function checkedRows(value: unknown, count: unknown): unknown[] {
  const rows = list(value);
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < rows.length ||
      (count > 0 && rows.length === 0)) throw new Error('Invalid result count');
  return rows.slice(0, limit);
}

async function ontology(query: ResearchQuery, read: ReadJson): Promise<EvidenceRecord[]> {
  const accession = query.term.match(ontologyId)?.slice(1).join('_');
  const url = withParams('https://www.ebi.ac.uk/ols4/api/search', {
    q: accession || query.term, ontology: 'efo', type: 'class', rows: String(limit),
  });
  const result = object(object(await read(url)).response);
  const candidates = checkedRows(result.docs, result.numFound).map(item => {
    const doc = object(item);
    const id = field(doc.short_form);
    const title = field(doc.label);
    const iri = field(doc.iri);
    if (!ontologyId.test(id) || !title || doc.ontology_name !== 'efo' ||
        !/^https?:\/\/[^?#]+$/.test(iri) || !iri.endsWith('/' + id)) throw new Error('Invalid ontology term');
    const sameId = accession?.toLowerCase() === id.toLowerCase();
    const exactTerm = [title, ...(Array.isArray(doc.exact_synonyms) ? doc.exact_synonyms.map(field) : [])]
      .some(term => term.toLowerCase() === query.term.toLowerCase());
    const description = Array.isArray(doc.description) ? field(doc.description[0]) : '';
    const match = sameId ? 'Identifiant exact.' : exactTerm ? 'Libellé ou synonyme exact.' : 'Terme possible, vérifier la correspondance.';
    const record: EvidenceRecord = {
      id, title, kind: 'disease', url: 'https://www.ebi.ac.uk/ols4/ontologies/efo/classes/' + encodeURIComponent(encodeURIComponent(iri)),
      detail: ['Terme d’ontologie.', match, description].filter(Boolean).join(' '),
      ...(!sameId && { followUp: { mode: 'disease' as const, term: id } }),
    };
    return { record, exact: accession ? sameId : exactTerm };
  });
  const exact = candidates.filter(candidate => candidate.exact);
  return (accession || exact.length ? exact : candidates).map(candidate => candidate.record);
}

async function gwas(query: ResearchQuery, read: ReadJson): Promise<EvidenceRecord[]> {
  const accession = query.term.match(ontologyId)?.slice(1).join('_');
  const url = withParams('https://www.ebi.ac.uk/gwas/rest/api/v2/studies', {
    ...(accession ? { efo_id: accession } : { efo_trait: query.term }), size: String(limit),
  });
  const data = object(await read(url));
  const total = object(data.page).totalElements;
  // HAL omits _embedded on a legitimate no-hit search.
  if (total === 0 && data._embedded === undefined) return [];
  return checkedRows(object(data._embedded).studies, total).map(item => {
    const study = object(item);
    const id = field(study.accession_id);
    const title = field(study.disease_trait);
    if (!/^GCST\d{3,12}$/.test(id) || !title) throw new Error('Invalid GWAS study');
    const pmid = String(study.pubmed_id ?? '');
    return {
      id, title, kind: 'association', url: 'https://www.ebi.ac.uk/gwas/studies/' + id,
      detail: ['Étude d’association génétique.', field(study.initial_sample_size), 'Consulter le phénotype et la population de l’étude.'].filter(Boolean).join(' '),
      ...(numberId.test(pmid) && { related: [{ id: 'PMID:' + pmid, url: 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/' }] }),
    };
  });
}

function acceptsGeneSymbol(query: ResearchQuery): boolean {
  return /^[a-z][a-z0-9.-]{0,31}$/i.test(query.term) && !/^ENS[GPT]\d{11}(?:\.\d+)?$/i.test(query.term);
}

async function geneTable(query: ResearchQuery, read: ReadJson, variants: boolean): Promise<EvidenceRecord[]> {
  // The clinical tables support prefix matching; only accept an exact human gene symbol.
  if (!acceptsGeneSymbol(query)) throw new Error('Expected a gene symbol');
  const symbol = query.term.toUpperCase();
  const symbolField = variants ? 'GeneSymbol' : 'Symbol';
  const idField = variants ? 'VariationID' : 'GeneID';
  const path = variants ? 'variants/v4/search' : 'ncbi_genes/v3/search';
  const url = withParams('https://clinicaltables.nlm.nih.gov/api/' + path, {
    terms: symbol, sf: symbolField, q: symbolField + ':"' + symbol + '"', cf: idField,
    df: idField + ',' + symbolField + ',' + (variants ? 'Name' : 'description'), count: String(limit),
  });
  const payload = list(await read(url));
  const codes = list(payload[1]);
  const displayRows = checkedRows(payload[3], payload[0]);
  if (codes.length !== displayRows.length) throw new Error('Mismatched gene table');
  return displayRows.flatMap((item, index): EvidenceRecord[] => {
    const row = list(item);
    const id = field(row[0]);
    const rowSymbol = field(row[1]);
    const label = field(row[2]);
    if (!numberId.test(id) || codes[index] !== id || !rowSymbol || !label) throw new Error('Invalid clinical table row');
    if (symbol !== rowSymbol.toUpperCase()) return [];
    if (variants) {
      return [{ id: 'ClinVar:' + id, title: label, kind: 'variant', url: 'https://www.ncbi.nlm.nih.gov/clinvar/variation/' + id + '/',
        detail: 'Variant indexé pour ' + rowSymbol + ' dans le sous-ensemble GRCh37 / assemblage non renseigné. Consulter les classifications et leur niveau de revue dans ClinVar.' }];
    }
    return [{ id: 'GeneID:' + id, title: rowSymbol + ' — ' + label, kind: 'gene', url: 'https://www.ncbi.nlm.nih.gov/gene/' + id,
      detail: 'Identifiant du gène humain et symbole de référence NCBI.' }];
  });
}

async function pubchem(query: ResearchQuery, read: ReadJson): Promise<EvidenceRecord[]> {
  // Resolve actual compound IDs before requesting properties: unknown names are valid empty Entrez searches.
  const cid = /^(?:CID\s*:?\s*)?([1-9]\d{0,9})$/i.exec(query.term)?.[1];
  const search = withParams('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi', {
    db: 'pccompound', term: cid ? cid + '[UID]' : '"' + query.term + '"[CompleteSynonym]', retmode: 'json', retmax: String(limit),
  });
  const envelope = object(await read(search));
  const result = object(envelope.esearchresult);
  if (envelope.error || result.error || result.errorlist || !/^\d+$/.test(String(result.count))) throw new Error('Invalid compound search');
  const ids = checkedRows(result.idlist, Number(result.count));
  if (!ids.length) return [];
  if (!ids.every((id): id is string => typeof id === 'string' && numberId.test(id))) throw new Error('Invalid CID list');
  const properties = new URL('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/' + ids.join(',') + '/property/Title,MolecularFormula,MolecularWeight/JSON');
  const records = list(object(object(await read(properties)).PropertyTable).Properties).map(object);
  return ids.map(id => {
    const record = records.find(item => String(item.CID) === id);
    const title = field(record?.Title);
    if (!record || !title) throw new Error('Missing PubChem record');
    const formula = field(record.MolecularFormula);
    const weight = String(record.MolecularWeight ?? '');
    return {
      id: 'CID:' + id, title, kind: 'compound', url: 'https://pubchem.ncbi.nlm.nih.gov/compound/' + id,
      detail: ['Identité chimique.', formula, /^\d+(\.\d+)?$/.test(weight) ? weight + ' g/mol' : ''].filter(Boolean).join(' · '),
    };
  });
}

export const specialtySources: Provider[] = [
  { name: 'EFO / OLS', modes: ['disease'], search: ontology },
  { name: 'GWAS Catalog', modes: ['disease'], search: gwas },
  { name: 'NCBI Gene', modes: ['gene'], accepts: acceptsGeneSymbol, search: (query, read) => geneTable(query, read, false) },
  { name: 'ClinVar', modes: ['gene'], accepts: acceptsGeneSymbol, search: (query, read) => geneTable(query, read, true) },
  { name: 'PubChem', modes: ['drug'], search: pubchem },
];
