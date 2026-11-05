import { medicalSearchTerms, medicalSearchScope } from '../_shared/medical-terminology.ts';
import type { PairCandidate } from './analysis-utils.ts';

export type LiteratureStatus = 'matched' | 'empty' | 'unavailable';
export interface LiteratureArticle {
  title: string; url: string; abstract: string; pmid: string; provider: string;
  year?: string; journal?: string; abstractTruncated?: boolean; publicationTypes?: string[];
}
export interface LiteratureProviderStatus { name: string; status: LiteratureStatus; count?: number; error?: string; query?: string }
export interface PairResearchResult {
  query: string; status: LiteratureStatus; articles: LiteratureArticle[];
  providers: LiteratureProviderStatus[]; retrievedAt: string; scopeNotes?: string[];
}
export function buildPairSearchQuery(pair: PairCandidate): string {
  const term = (value: string) => '"' + value.replace(/["\\[\]{}|<>]/g, ' ').replace(/\s+/g, ' ').trim() + '"';
  const side = (entity: PairCandidate['left']) => '(' + medicalSearchTerms(entity).map(term).join(' OR ') + ')';
  return side(pair.left) + ' AND ' + side(pair.right);
}
function plain(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/&(?:#(x[0-9a-f]+|[0-9]+)|([a-z]+));/gi, (_all, numeric: string, name: string) => {
    if (numeric) {
      const point = numeric[0].toLowerCase() === 'x' ? parseInt(numeric.slice(1), 16) : parseInt(numeric, 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : ' ';
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[name.toLowerCase()] ?? ' ';
  }).replace(/\s+/g, ' ').trim();
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid scientific response');
  return value as Record<string, unknown>;
};
export function parsePubMedArticles(xml: string, expectedIds: string[]): LiteratureArticle[] {
  const records = [...xml.matchAll(/<PubmedArticle(?:\s[^>]*)?>([\s\S]*?)<\/PubmedArticle>/g)];
  if (!records.length) throw new Error('Missing PubMed articles');
  const result: LiteratureArticle[] = [];
  for (const [, block] of records) {
    const pmid = block.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1];
    if (!pmid || !expectedIds.includes(pmid)) throw new Error('Unexpected PubMed identifier');
    const title = plain(block.match(/<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/)?.[1] ?? '');
    if (!title) throw new Error('Missing PubMed title');
    if (/<PublicationType[^>]*>(?:Retracted Publication|Retraction of Publication|Expression of Concern)<\/PublicationType>/i.test(block)) continue;
    const abstract = [...block.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)]
      .map(([, attributes, body]) => [attributes.match(/Label="([^"]+)"/)?.[1], plain(body)].filter(Boolean).join(': ')).join(' ');
    result.push({ title, pmid, provider: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/',
      abstract: abstract.slice(0, 6000), abstractTruncated: abstract.length > 6000,
      publicationTypes: [...block.matchAll(/<PublicationType[^>]*>([\s\S]*?)<\/PublicationType>/g)].map(m => plain(m[1])),
      year: block.match(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/)?.[1],
      journal: plain(block.match(/<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/)?.[1] ?? '') });
  }
  return [...new Map(result.map(article => [article.pmid, article])).values()];
}

/** Only public scientific terms are sent to these fixed endpoints. No patient context. */
export function createLiteratureSearch(options: { apiKey?: string; fetcher?: typeof fetch; intervalMs?: number; timeoutMs?: number } = {}) {
  const fetcher = options.fetcher ?? fetch;
  const interval = options.intervalMs ?? (options.apiKey ? 120 : 400);
  let nextAt = 0;
  let queue = Promise.resolve();
  async function read(url: URL): Promise<string> {
    if (url.hostname === 'eutils.ncbi.nlm.nih.gov') {
      const reservation = queue.then(async () => {
        const delay = Math.max(0, nextAt - Date.now());
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        nextAt = Date.now() + interval;
      });
      queue = reservation.catch(() => undefined);
      await reservation;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Source timeout')); }, options.timeoutMs ?? 8000);
      }), (async () => {
        const response = await fetcher(url, { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/json, application/xml' } });
        if (!response.ok) { await response.body?.cancel(); throw new Error('Source HTTP ' + response.status); }
        if (!response.body) throw new Error('Empty scientific response');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let body = '', bytes = 0;
        const cancel = () => { void reader.cancel().catch(() => undefined); };
        controller.signal.addEventListener('abort', cancel, { once: true });
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > 2_000_000) throw new Error('Scientific response too large');
            body += decoder.decode(chunk.value, { stream: true });
          }
          controller.signal.throwIfAborted();
          return body + decoder.decode();
        } finally { controller.signal.removeEventListener('abort', cancel); void reader.cancel().catch(() => undefined); }
      })()]);
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
  function entrez(operation: string, params: Record<string, string>) {
    const url = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/' + operation + '.fcgi');
    url.search = new URLSearchParams({ db: 'pubmed', tool: 'Medicore', ...params, ...(options.apiKey ? { api_key: options.apiKey } : {}) }).toString();
    return url;
  }
  async function pubmed(query: string, limit: number) {
    const clinicalQuery = '(' + query + ') NOT (animals[MeSH Terms] NOT humans[MeSH Terms])';
    const response = object(JSON.parse(await read(entrez('esearch', { term: clinicalQuery, retmax: String(limit), retmode: 'json', sort: 'relevance' }))));
    const search = object(response.esearchresult);
    if (response.error || response.ERROR || search.error || search.ERROR || search.errorlist) throw new Error('PubMed error envelope');
    const ids = search.idlist;
    const count = Number(search.count);
    if (!Array.isArray(ids) || !Number.isSafeInteger(count) || count < 0 || ids.length > limit || count < ids.length || !ids.every(id => typeof id === 'string' && /^[1-9]\d{0,8}$/.test(id))) throw new Error('Invalid PubMed result');
    if (!ids.length && count !== 0) throw new Error('Missing PubMed search results');
    const articles = ids.length ? parsePubMedArticles(await read(entrez('efetch', { id: ids.join(','), retmode: 'xml' })), ids) : [];
    return { articles, count, query: clinicalQuery };
  }
  async function europePmc(query: string, limit: number) {
    const url = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
    const clinicalQuery = '(' + query + ') NOT (MESH_HEADING:Animals NOT MESH_HEADING:Humans)';
    url.search = new URLSearchParams({ query: clinicalQuery, resultType: 'core', pageSize: String(limit), format: 'json' }).toString();
    const response = object(JSON.parse(await read(url)));
    const records = object(response.resultList).result;
    if (!Array.isArray(records) || typeof response.hitCount !== 'number' || response.hitCount < records.length || (!records.length && response.hitCount !== 0)) throw new Error('Invalid Europe PMC result');
    const articles: LiteratureArticle[] = [];
    for (const candidate of records.slice(0, limit)) {
      const row = object(candidate);
      if (row.isRetracted === 'Y') continue;
      const pmid = typeof row.pmid === 'string' ? row.pmid : row.source === 'MED' ? row.id : undefined;
      // Restrict the fallback to identifiable PubMed publications. Preprints
      // and malformed accession links cannot become clinical evidence here.
      if (typeof pmid !== 'string' || !/^[1-9]\d{0,8}$/.test(pmid)) continue;
      if (row.source === 'MED' && row.id !== pmid) throw new Error('Mismatched Europe PMC identifier');
      if (typeof row.title !== 'string' || !row.title.trim()) throw new Error('Missing Europe PMC title');
      const abstract = typeof row.abstractText === 'string' ? plain(row.abstractText) : '';
      articles.push({ pmid, title: plain(row.title), abstract: abstract.slice(0, 6000), abstractTruncated: abstract.length > 6000,
        url: 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/', provider: 'Europe PMC',
        publicationTypes: Array.isArray((row.pubTypeList as { pubType?: unknown[] } | undefined)?.pubType)
          ? ((row.pubTypeList as { pubType: unknown[] }).pubType).filter((v): v is string => typeof v === 'string') : [],
        year: typeof row.pubYear === 'string' ? row.pubYear : undefined });
    }
    return { articles, count: response.hitCount, query: clinicalQuery };
  }
  return async (pair: PairCandidate | string, requestedLimit = 5): Promise<PairResearchResult> => {
    const query = typeof pair === 'string' ? pair : buildPairSearchQuery(pair);
    const providers: LiteratureProviderStatus[] = [];
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(8, Math.floor(requestedLimit))) : 5;
    let articles: LiteratureArticle[] = [];
    for (const [name, search] of [['PubMed', pubmed], ['Europe PMC', europePmc]] as const) {
      try {
        const result = await search(query, limit);
        providers.push({ name, status: result.articles.length ? 'matched' : 'empty', count: result.count, query: result.query });
        articles = result.articles;
        if (articles.length) break;
      } catch (error) {
        // Do not log requests, API keys, abstracts or exception objects.
        const message = error instanceof Error && /^Source (HTTP \d{3}|timeout)$/.test(error.message) ? error.message : 'Réponse scientifique indisponible ou invalide';
        providers.push({ name, status: 'unavailable', error: message });
      }
    }
    const scopeNotes = typeof pair === 'string' ? [] : [pair.left,pair.right].map(medicalSearchScope).filter(s => s.broadened).map(s => s.note);
    return { query, articles, providers, scopeNotes, retrievedAt: new Date().toISOString(),
      status: articles.length ? 'matched' : providers.some(provider => provider.status === 'unavailable') ? 'unavailable' : 'empty' };
  };
}
