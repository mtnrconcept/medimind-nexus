import { readBoundedJson } from '../_shared/bounded-json.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { medicalSearchTerms, normalizeSearchText } from '../_shared/medical-terminology.ts';
import type { EvidenceReport, Provider, ReadJson, ResearchQuery, SourceResult } from './contract.ts';

const MAX_RECORDS = 12;
const CONCURRENCY = 4;
const SOURCE_TIMEOUT_MS = 9_000;
// Keep partial reports within the UI deadline even if every partner is slow.
const REPORT_TIMEOUT_MS = 20_000;
const allowedHosts = new Set([
  'eutils.ncbi.nlm.nih.gov', 'clinicaltrials.gov', 'www.ebi.ac.uk', 'www.prognyx.com',
  'api.platform.opentargets.org', 'rest.ensembl.org', 'rest.uniprot.org', 'alphafold.ebi.ac.uk',
  'clinicaltables.nlm.nih.gov', 'pubchem.ncbi.nlm.nih.gov', 'www.proteinatlas.org',
  'version-12-5.string-db.org', 'api.cpicpgx.org',
]);
const RESPONSE_LIMIT = 2 * 1024 * 1024;

export function parseResearchQuery(input: unknown): ResearchQuery {
  if (!input || typeof input !== 'object' || !('mode' in input) || !('term' in input) ||
      Object.keys(input).some(key => key !== 'mode' && key !== 'term')) {
    throw new Error('Expected a public research term and mode');
  }
  const { term, mode } = input;
  if (mode !== 'disease' && mode !== 'drug' && mode !== 'gene') throw new Error('Invalid research mode');
  if (typeof term !== 'string' || term.length > 120 || !/^[\p{L}\p{M}\p{N} ()'’:+.,_\-]+$/u.test(term) || !/[\p{L}\p{N}]/u.test(term)) {
    throw new Error('Invalid public research term');
  }
  const normalized = term.trim().replace(/ +/g, ' ');
  if (normalized.length < 2) throw new Error('Research term too short');
  return { mode, term: normalized };
}

export async function fetchPublicJson(url: URL, init?: RequestInit): Promise<unknown> {
  // URLs are constructed by the adapters. Never follow an upstream redirect to another host.
  if (url.protocol !== 'https:' || !allowedHosts.has(url.host) || url.username || url.password) throw new Error('Invalid scientific endpoint');
  const response = await fetch(url, { ...init, redirect: 'error' });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('Scientific source returned HTTP ' + response.status);
  }
  return readBoundedJson(response, RESPONSE_LIMIT);
}

export async function collectEvidence(query: ResearchQuery, providers: Provider[], read: ReadJson, callerSignal?: AbortSignal): Promise<EvidenceReport> {
  const citation = /^(?:NCT\d{8}|PMID: *[1-9]\d{0,8})$/i.test(query.term);
  const searchTerm = !citation && query.mode !== 'gene' ? medicalSearchTerms({ name: query.term, type: query.mode === 'drug' ? 'medication' : 'pathology' })[0] : undefined;
  const resolvedTerm = searchTerm && normalizeSearchText(searchTerm) !== normalizeSearchText(query.term) ? searchTerm : undefined;
  const sourceQuery = resolvedTerm ? { ...query, term: resolvedTerm } : query;
  const selected = providers.filter(provider => provider.modes.includes(query.mode) &&
    (!citation || provider.citationLookup) && (provider.accepts?.(query) ?? true));
  const budget = AbortSignal.timeout(REPORT_TIMEOUT_MS);
  const reportSignal = callerSignal ? AbortSignal.any([budget, callerSignal]) : budget;
  const sources: SourceResult[] = [];
  let next = 0;

  async function worker() {
    while (next < selected.length) {
      const index = next++;
      const provider = selected[index];
      const signal = AbortSignal.any([reportSignal, AbortSignal.timeout(SOURCE_TIMEOUT_MS)]);
      const boundedRead: ReadJson = (url, init) => read(url, { ...init, signal });
      try {
        signal.throwIfAborted();
        const candidates = await provider.search(sourceQuery, boundedRead);
        const unique = new Map(candidates.map(record => [record.id, record]));
        const records = Array.from(unique.values()).slice(0, MAX_RECORDS);
        sources[index] = { name: provider.name, status: records.length ? 'matched' : 'empty', records };
      } catch {
        sources[index] = { name: provider.name, status: 'unavailable', records: [] };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, selected.length) }, worker));
  return { schemaVersion: 1, query, ...(resolvedTerm ? { resolvedTerm } : {}), retrievedAt: new Date().toISOString(), sources };
}

const response = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function serveEvidence(
  request: Request,
  verifyUser: (token: string) => Promise<boolean>,
  providers: Provider[],
  read: ReadJson = fetchPublicJson,
): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Méthode non autorisée' }, 405);
  const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  try {
    if (!token || !await verifyUser(token)) return response({ error: 'Session requise' }, 401);
  } catch {
    return response({ error: 'Vérification de session indisponible' }, 503);
  }
  let query: ResearchQuery;
  try {
    query = parseResearchQuery(await readBoundedJson(request, 1024));
  } catch {
    return response({ error: 'Saisissez un terme scientifique public de 2 à 120 caractères.' }, 400);
  }
  return response(await collectEvidence(query, providers, read, request.signal), 200);
}
