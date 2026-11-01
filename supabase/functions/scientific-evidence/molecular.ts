import type { EvidenceRecord, Provider, ReadJson, ResearchQuery } from './contract.ts';

const resultLimit = 8;
const diseaseId = /^[A-Z][A-Z0-9]{1,15}_(?=[A-Z0-9]*\d)[A-Z0-9]+$/;
const ensemblId = /^ENSG\d{11}$/;
const compoundId = /^CHEMBL\d+$/;
const accession = /^(?:[OPQ]\d[A-Z0-9]{3}\d|[A-NR-Z]\d(?:[A-Z][A-Z0-9]{2}\d){1,2})$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid source object');
  return value as Record<string, unknown>;
}

function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw Error('Invalid source collection');
  return value.slice(0, resultLimit).map(object);
}

function field(row: Record<string, unknown>, key: string, pattern?: RegExp): string {
  const value = row[key];
  if (typeof value !== 'string' || !value.trim() || (pattern && !pattern.test(value))) {
    throw Error('Invalid source field: ' + key);
  }
  return value.trim();
}

async function openTargets(query: string, variables: Record<string, string>, read: ReadJson) {
  const response = object(await read(new URL('https://api.platform.opentargets.org/api/v4/graphql'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }),
  }));
  if (Array.isArray(response.errors) && response.errors.length) throw Error('Open Targets query failed');
  return object(response.data);
}

const findDisease = `query Search($term: String!) {
  search(queryString: $term, entityNames: ["disease"], page: { index: 0, size: 8 }) { hits { id name } }
}`;

const diseaseEvidence = `query Disease($id: String!) {
  disease(efoId: $id) {
    id name
    associatedTargets(enableIndirect: false, page: { index: 0, size: 5 }) { rows { score target { id approvedSymbol } } }
    compounds: drugAndClinicalCandidates {
      rows { drug { id name } clinicalReports { id origin trialOverallStatus trialWhyStopped } }
    }
  }
}`;

const platform = 'https://platform.opentargets.org';

async function targets({ term }: ResearchQuery, read: ReadJson): Promise<EvidenceRecord[]> {
  let id = term.toUpperCase().replace(':', '_');
  if (!diseaseId.test(id)) {
    const data = await openTargets(findDisease, { term }, read);
    const hits = rows(object(data.search).hits).map(hit => ({
      id: field(hit, 'id', diseaseId), name: field(hit, 'name'),
    }));
    const exact = hits.filter(hit => hit.name.toLowerCase() === term.toLowerCase());
    if (exact.length !== 1) {
      return hits.map(hit => ({
        id: hit.id, title: hit.name, kind: 'disease', url: platform + '/disease/' + hit.id,
        detail: 'Terme candidat. Sélectionnez son identifiant pour explorer les associations de cette maladie.',
        followUp: { mode: 'disease', term: hit.id },
      }));
    }
    id = exact[0].id;
  }

  const data = await openTargets(diseaseEvidence, { id }, read);
  if (data.disease === null) return [];
  const disease = object(data.disease);
  if (field(disease, 'id', diseaseId) !== id) throw Error('Unexpected disease identifier');
  const name = field(disease, 'name');
  const related = [{ id, url: platform + '/disease/' + id }];
  const records: EvidenceRecord[] = rows(object(disease.associatedTargets).rows).map(row => {
    const target = object(row.target);
    const gene = field(target, 'id', ensemblId);
    const symbol = field(target, 'approvedSymbol');
    if (typeof row.score !== 'number' || !Number.isFinite(row.score) || row.score < 0 || row.score > 1) {
      throw Error('Invalid Open Targets association score');
    }
    return {
      id: id + ':' + gene, title: name + ' · ' + symbol, kind: 'association',
      url: platform + '/evidence/' + gene + '/' + id,
      related: [...related, { id: gene, url: platform + '/target/' + gene }],
      detail: 'Score d’association Open Targets : ' + row.score.toFixed(3) + ' sur 1. Ce score agrège des indices biologiques et ne mesure pas une efficacité thérapeutique.',
      followUp: { mode: 'gene', term: symbol },
    };
  });
  // The upstream candidate field has no pagination. The transport caps bytes, and we inspect
  // a small sample of compounds and reports, taking one report per compound before a second.
  const samples = rows(object(disease.compounds).rows).flatMap(row => {
    if (row.drug === null) return [];
    const drug = object(row.drug);
    const drugId = field(drug, 'id', /^[A-Z][A-Z0-9_-]{1,60}$/);
    const drugName = field(drug, 'name');
    const drugUrl = platform + '/drug/' + drugId;
    const references = [...related, { id: drugId, url: drugUrl }];
    if (!Array.isArray(row.clinicalReports)) throw Error('Invalid clinical report collection');
    const reports = row.clinicalReports.map(object).filter(report => report.origin === 'CLINICAL_TRIAL').slice(0, resultLimit);
    const candidates: EvidenceRecord[] = reports.map(report => {
      const reportId = field(report, 'id', /^[a-zA-Z0-9._-]{1,120}$/);
      const nct = reportId.toUpperCase();
      const trialUrl = /^NCT\d{8}$/.test(nct) ? 'https://clinicaltrials.gov/study/' + nct : undefined;
      const status = typeof report.trialOverallStatus === 'string' ? ' Statut : ' + report.trialOverallStatus + '.' : '';
      const stopped = typeof report.trialWhyStopped === 'string' && report.trialWhyStopped ? ' Motif d’arrêt rapporté : ' + report.trialWhyStopped : '';
      return {
        id: id + ':' + drugId + ':' + reportId, title: drugName + ' · ' + name, kind: 'compound',
        url: trialUrl ?? drugUrl, related: trialUrl ? [...references, { id: nct, url: trialUrl }] : references,
        followUp: { mode: 'drug', term: drugName },
        detail: 'Essai référencé par Open Targets pour ce composé. Son enregistrement ne démontre pas un bénéfice.' + status + stopped,
      };
    });
    if (candidates.length === 0) candidates.push({
      id: id + ':' + drugId, title: drugName + ' · ' + name, kind: 'compound', url: drugUrl, related: references,
      followUp: { mode: 'drug', term: drugName },
      detail: 'Composé répertorié pour cette maladie par Open Targets. Cette fiche ne fournit pas de résultat clinique.',
    });
    return [candidates];
  });
  for (let study = 0; study < resultLimit && records.length < 12; study++) {
    for (const sample of samples) {
      if (sample[study] && records.length < 12) records.push(sample[study]);
    }
  }
  return records;
}

function queryUrl(base: string, params: Record<string, string>): URL {
  const url = new URL(base);
  url.search = new URLSearchParams(params).toString();
  return url;
}

async function genes({ term }: ResearchQuery, read: ReadJson): Promise<EvidenceRecord[]> {
  const symbol = term.toUpperCase();
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (ensemblId.test(symbol)) {
    const data = object(await read(new URL('https://rest.ensembl.org/lookup/id'), {
      method: 'POST', headers, body: JSON.stringify({ ids: [symbol] }),
    }));
    if (data[symbol] === null || Object.keys(data).length === 0) return [];
    const gene = object(data[symbol]);
    if (field(gene, 'id', ensemblId) !== symbol || gene.species !== 'homo_sapiens' || gene.object_type !== 'Gene') throw Error('Unexpected Ensembl gene');
    const name = field(gene, 'display_name');
    return [{ id: symbol, kind: 'gene', title: name, url: 'https://www.ensembl.org/id/' + symbol,
      detail: 'Gène humain identifié par Ensembl.', followUp: { mode: 'gene', term: name } }];
  }
  const url = queryUrl('https://rest.ensembl.org/xrefs/symbol/homo_sapiens/' + encodeURIComponent(symbol),
    { external_db: 'HGNC', object_type: 'gene' });
  const result = rows(await read(url, { headers }));
  return result.flatMap(row => {
    const id = field(row, 'id');
    if (row.type !== 'gene' || !ensemblId.test(id)) return [];
    return [{ id, kind: 'gene' as const, title: symbol + ' · ' + id, url: 'https://www.ensembl.org/id/' + id,
      detail: 'Correspondance du symbole HGNC avec une entrée de gène humain dans Ensembl.' }];
  });
}

async function proteins({ term }: ResearchQuery, read: ReadJson): Promise<EvidenceRecord[]> {
  const queryTerm = term.toUpperCase();
  // Quote free text and escape the two characters that can terminate a UniProt quoted value.
  const quoted = '"' + queryTerm.replace(/["\\]/g, '\\$&') + '"';
  const termFilter = accession.test(queryTerm) ? 'accession:' + queryTerm
    : 'gene_exact:' + (/^[A-Z0-9_]+$/.test(queryTerm) ? queryTerm : quoted);
  const url = queryUrl('https://rest.uniprot.org/uniprotkb/search', {
    query: '(' + termFilter + ') AND (organism_id:9606) AND (reviewed:true)',
    format: 'json', fields: 'accession,protein_name,organism_id', size: String(resultLimit),
  });
  const result = rows(object(await read(url)).results);
  return result.map(row => {
    const id = field(row, 'primaryAccession', accession);
    if (object(row.organism).taxonId !== 9606) throw Error('Unexpected UniProt species');
    const name = field(object(object(object(row.proteinDescription).recommendedName).fullName), 'value');
    return { id, kind: 'protein', title: name, url: 'https://www.uniprot.org/uniprotkb/' + id + '/entry',
      detail: 'Protéine humaine annotée dans UniProtKB/Swiss-Prot.' };
  });
}

async function structures(query: ResearchQuery, read: ReadJson): Promise<EvidenceRecord[]> {
  const matches = await proteins(query, read);
  // A symbol can map to several accessions. Preserve accession identity and bound upstream requests.
  const models = await Promise.all(matches.slice(0, 2).map(async protein => {
    const url = new URL('https://alphafold.ebi.ac.uk/api/prediction/' + protein.id);
    return rows(await read(url, { headers: { Accept: 'application/json', 'User-Agent': 'MediCore scientific research (+https://github.com/mtnrconcept/medimind-nexus)' } })).map((row): EvidenceRecord => {
      const isoform = field(row, 'uniprotAccession');
      const model = field(row, 'entryId', /^AF-[A-Z0-9-]+-F\d+$/);
      if (isoform.split('-')[0] !== protein.id || !/^[A-Z0-9]+(?:-\d+)?$/.test(isoform) || row.taxId !== 9606) throw Error('Unexpected structure identifier');
      return { id: model, kind: 'structure', title: protein.title + ' · ' + model,
        url: 'https://alphafold.ebi.ac.uk/entry/' + isoform, related: [{ id: protein.id, url: protein.url }],
        detail: 'Structure protéique prédite par calcul. Une prédiction structurale ne démontre pas l’efficacité d’un traitement.' };
    });
  }));
  return models.flat();
}

async function compounds({ term }: ResearchQuery, read: ReadJson): Promise<EvidenceRecord[]> {
  const id = term.toUpperCase();
  const exact = compoundId.test(id);
  const url = queryUrl('https://www.ebi.ac.uk/chembl/api/data/molecule' + (exact ? '.json' : '/search.json'), {
    ...(exact ? { molecule_chembl_id: id } : { q: term }),
    limit: String(resultLimit), only: 'molecule_chembl_id,pref_name,molecule_type',
  });
  return rows(object(await read(url)).molecules).map(row => {
    const match = field(row, 'molecule_chembl_id', compoundId);
    if (exact && id !== match) throw Error('Unexpected ChEMBL identifier');
    const title = typeof row.pref_name === 'string' && row.pref_name ? row.pref_name : match;
    return { id: match, kind: 'compound', title, url: 'https://www.ebi.ac.uk/chembl/explore/compound/' + match,
      detail: (exact ? 'Fiche du composé.' : 'Résultat de recherche par nom. Vérifiez l’identité du composé.') +
        (typeof row.molecule_type === 'string' ? ' Type ChEMBL : ' + row.molecule_type + '.' : '') };
  });
}

const isSymbol = (term: string) => /^[a-z0-9][a-z0-9.-]{0,35}$/i.test(term);

export const molecularSources: Provider[] = [
  { name: 'Open Targets', modes: ['disease'], search: targets },
  { name: 'Ensembl', modes: ['gene'], accepts: ({ term }) => isSymbol(term) && !accession.test(term.toUpperCase()), search: genes },
  { name: 'UniProt', modes: ['gene'], accepts: ({ term }) => isSymbol(term) && !ensemblId.test(term.toUpperCase()), search: proteins },
  { name: 'AlphaFold DB', modes: ['gene'], accepts: ({ term }) => isSymbol(term) && !ensemblId.test(term.toUpperCase()), search: structures },
  { name: 'ChEMBL', modes: ['drug'], search: compounds },
];
