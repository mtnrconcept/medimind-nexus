import type { EvidenceRecord, Provider, ReadJson, ResearchQuery } from './contract.ts';

const limit = 6;
const stringId = /^9606\.ENSP\d{11}$/;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid record');
  return value as Record<string, unknown>;
}

function rows(value: unknown) {
  if (!Array.isArray(value)) throw Error('Invalid source collection');
  return value.map(object);
}

function required(value: unknown, pattern?: RegExp): string {
  if (typeof value !== 'string' || !value.trim() || (pattern && !pattern.test(value))) throw Error('Invalid source field');
  return value.trim().slice(0, 300);
}

function pmids(values: unknown[]) {
  const ids = [...new Set(values.map(String).filter(value => /^[1-9]\d{0,8}$/.test(value)))];
  return ids.slice(0, limit).map(id => ({ id: 'PMID:' + id, url: 'https://pubmed.ncbi.nlm.nih.gov/' + id + '/' }));
}

async function expression({ term }: ResearchQuery, read: ReadJson): Promise<EvidenceRecord[]> {
  const url = new URL('https://www.proteinatlas.org/api/search_download.php');
  url.search = new URLSearchParams({ search: term, format: 'json', columns: 'g,eg,rnats,rnatsm', compress: 'no' }).toString();
  const hits = rows(await read(url)).map(hit => ({
    hit, symbol: required(hit.Gene), id: required(hit.Ensembl, /^ENSG\d{11}$/),
  }));
  const canonical = term.toUpperCase();
  return hits.filter(({ symbol, id }) => symbol.toUpperCase() === canonical || id === canonical)
    .slice(0, limit).map(({ hit, symbol, id }) => {
    const amounts = Object.entries(object(hit['RNA tissue specific nTPM'] ?? {})).slice(0, 6)
      .filter(([, value]) => /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(String(value)))
      .map(([tissue, value]) => `${tissue} ${value} nTPM`);
    return { id: 'HPA:' + id, title: symbol, kind: 'gene', url: 'https://www.proteinatlas.org/' + id,
      detail: ['Expression tissulaire de l’ARN humain.', hit['RNA tissue specificity'], ...amounts]
        .filter(part => typeof part === 'string' && part).join(' · ') };
  });
}

async function stringPartners({ term }: ResearchQuery, read: ReadJson): Promise<EvidenceRecord[]> {
  async function request(path: string, identifier: string, size: number) {
    const url = new URL('https://version-12-5.string-db.org/api/json/' + path);
    return rows(await read(url, { method: 'POST', body: new URLSearchParams({
      species: '9606', identifiers: identifier, limit: String(size), caller_identity: 'medicore',
      required_score: '700', network_type: 'functional',
    }) }));
  }
  const mappings = (await request('get_string_ids', term, limit)).slice(0, limit).map(mapping => {
    if (mapping.ncbiTaxonId !== 9606) throw Error('Unexpected STRING species');
    return { id: required(mapping.stringId, stringId), symbol: required(mapping.preferredName) };
  });
  const canonical = term.toUpperCase();
  const exact = mappings.filter(hit => hit.id === canonical || hit.symbol.toUpperCase() === canonical);
  if (exact.length !== 1) {
    return mappings.map(hit => ({
      id: 'STRING:' + hit.id, title: hit.symbol, kind: 'gene', url: 'https://string-db.org/network/' + hit.id,
      detail: 'Gène humain candidat. Sélectionnez son identifiant pour rechercher ses partenaires.',
      followUp: { mode: 'gene', term: hit.id },
    }));
  }
  const anchor = exact[0].id;
  const partners = await request('interaction_partners', anchor, limit);
  return partners.slice(0, limit).map(pair => {
    const a = required(pair.stringId_A, stringId), b = required(pair.stringId_B, stringId);
    if (pair.ncbiTaxonId !== 9606 || (a !== anchor && b !== anchor)) throw Error('Unexpected STRING partner');
    const score = pair.score;
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) throw Error('Invalid STRING score');
    const symbolA = required(pair.preferredName_A), symbolB = required(pair.preferredName_B);
    return { id: 'STRING:' + [a, b].sort().join(':'), title: symbolA + ' / ' + symbolB, kind: 'association',
      url: 'https://version-12-5.string-db.org/api/json/network?' + new URLSearchParams({
        identifiers: [a, b].join('\r'), species: '9606', required_score: '700', network_type: 'functional', caller_identity: 'medicore',
      }),
      detail: `Association fonctionnelle humaine (STRING v12.5). Score combiné : ${score}. Une liaison physique directe reste à établir.`,
      followUp: { mode: 'gene', term: a === anchor ? symbolB : symbolA } };
  });
}

async function gwasGene({ term }: ResearchQuery, read: ReadJson): Promise<EvidenceRecord[]> {
  const url = new URL('https://www.ebi.ac.uk/gwas/rest/api/v2/associations');
  url.search = new URLSearchParams({ mapped_gene: term.toUpperCase(), size: String(limit) }).toString();
  const response = object(await read(url));
  if (!response._embedded && object(response.page).totalElements === 0) return [];
  const associations = rows(object(response._embedded).associations);
  if (!associations.length && object(response.page).totalElements !== 0) throw Error('Missing GWAS results');
  return associations.slice(0, limit).map(hit => {
    const id = required(String(hit.association_id), /^[1-9]\d{0,15}$/);
    const accession = required(hit.accession_id, /^GCST\d+$/);
    if (!Array.isArray(hit.mapped_genes) || !hit.mapped_genes.some(value => typeof value === 'string' && value.toUpperCase() === term.toUpperCase())) {
      throw Error('Unmatched GWAS gene');
    }
    if (!Array.isArray(hit.reported_trait) || !hit.reported_trait.length) throw Error('Missing GWAS trait');
    const trait = required(hit.reported_trait[0]);
    const alleles = Array.isArray(hit.snp_effect_allele) ? hit.snp_effect_allele.filter(value => typeof value === 'string').slice(0, 3).join(', ') : '';
    const hasPvalue = Number.isInteger(hit.pvalue_exponent) && typeof hit.pvalue_mantissa === 'number' && hit.pvalue_mantissa > 0;
    return { id: 'GWAS:' + id, title: term + ' / ' + trait, kind: 'association',
      url: 'https://www.ebi.ac.uk/gwas/rest/api/v2/associations/' + id,
      detail: ['Association statistique cartographiée à ce gène. La causalité reste à vérifier.', alleles,
        hasPvalue && `p = ${hit.pvalue_mantissa} × 10^${hit.pvalue_exponent}`].filter(Boolean).join(' · '),
      related: [...pmids([hit.pubmed_id]), { id: accession, url: 'https://www.ebi.ac.uk/gwas/studies/' + accession }] };
  });
}

async function cpic({ term, mode }: ResearchQuery, read: ReadJson): Promise<EvidenceRecord[]> {
  const url = new URL('https://api.cpicpgx.org/v1/pair_view');
  const field = mode === 'drug' ? 'drugname' : 'genesymbol';
  const normalized = mode === 'drug' ? term.toLowerCase() : term.toUpperCase();
  url.search = new URLSearchParams({ [field]: 'eq.' + normalized, limit: String(limit), order: 'pairid.asc' }).toString();
  return rows(await read(url)).slice(0, limit).map(hit => {
    const id = required(String(hit.pairid), /^[1-9]\d{0,15}$/);
    const gene = required(hit.genesymbol), drug = required(hit.drugname);
    if (String(hit[field]).toLowerCase() !== term.toLowerCase()) throw Error('Unexpected CPIC pair');
    const official = typeof hit.guidelineurl === 'string' && /^https:\/\/www\.clinpgx\.org\/guideline\/PA\d+$/.test(hit.guidelineurl);
    const level = typeof hit.cpiclevel === 'string' ? 'niveau CPIC ' + hit.cpiclevel : '';
    return { id: 'CPIC:' + id, title: gene + ' / ' + drug, kind: 'association',
      url: official ? String(hit.guidelineurl) : 'https://api.cpicpgx.org/v1/pair_view?pairid=eq.' + id,
      detail: ['Paire gène–médicament référencée en pharmacogénomique.', level,
        hit.provisional === true && 'Classification provisoire.'].filter(Boolean).join(' · '),
      related: pmids(Array.isArray(hit.pmids) ? hit.pmids : []),
      followUp: mode === 'drug' ? { mode: 'gene', term: gene } : { mode: 'drug', term: drug } };
  });
}

export const genomicsSources: Provider[] = [
  { name: 'Human Protein Atlas', modes: ['gene'], search: expression },
  { name: 'STRING', modes: ['gene'], search: stringPartners },
  { name: 'GWAS Catalog', modes: ['gene'], search: gwasGene },
  { name: 'CPIC / ClinPGx', modes: ['gene', 'drug'], search: cpic },
];
