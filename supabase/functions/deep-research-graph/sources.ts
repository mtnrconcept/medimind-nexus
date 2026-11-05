import { readBoundedJson } from '../_shared/bounded-json.ts';
import { medicalSearchTerms } from '../_shared/medical-terminology.ts';
import { parsePubMedArticles } from '../cross-data-analyzer/pubmed-research.ts';
export type SourceState = "available" | "empty" | "unavailable" | "partial" | "skipped";

export interface SourceRecord {
    id: string;
    title: string;
    url: string;
    abstract?: string;
    year?: string;
    journal?: string;
    publication_types?: string[];
    abstract_truncated?: boolean;
}

export interface SourceStatus {
    source: string;
    status: SourceState;
    count: number;
    records: SourceRecord[];
    detail?: string;
    failed_tables?: string[];
    queries?: string[];
    query_statuses?: Array<{ topic: string; query: string; status: SourceState; count: number; detail?: string }>;
}

const timeoutMs = 6_000;
type Fetcher = (url: string, options: RequestInit) => Promise<Response>;

function object(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown> : undefined;
}

function status(source: string, state: SourceState, records: SourceRecord[] = [], detail?: string): SourceStatus {
    return { source, status: state, count: records.length, records, detail };
}

async function readBoundedText(response: Response, limit: number): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Missing source body');
    const decoder = new TextDecoder();
    let result = '', bytes = 0;
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > limit) { await reader.cancel(); throw new Error('Source body limit exceeded'); }
            result += decoder.decode(value, { stream: true });
        }
        return result + decoder.decode();
    } finally { reader.releaseLock(); }
}

export function buildGraphLiteratureQuery(topic: string): string {
    return '(' + medicalSearchTerms({ name: topic }).map(term =>
        '"' + term.replace(/["\\[\]{}|<>]/g, ' ').replace(/\s+/g, ' ').trim() + '"').join(' OR ') + ')';
}

async function pubmedSource(topic: string, fetcher: Fetcher, limit = 10): Promise<SourceStatus> {
    const source = "PubMed";
    const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";
    const query = buildGraphLiteratureQuery(topic);
    try {
        const search = await fetcher(base + "esearch.fcgi?" + new URLSearchParams({
            db: "pubmed", term: query, retmax: String(limit), retmode: "json", sort: "relevance"
        }), { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
        if (!search.ok) throw new Error("Search unavailable");
        const payload = object(await readBoundedJson(search, 2_000_000));
        const result = object(payload?.esearchresult);
        if (payload?.error || result?.error || (result?.errorlist && Object.keys(result.errorlist).length > 0)) {
            throw new Error("PubMed rejected the search");
        }
        if (!Array.isArray(result?.idlist) || !result.idlist.every(id => typeof id === "string" && /^\d{1,10}$/.test(id))) {
            throw new Error("Invalid PubMed search");
        }
        const ids = [...new Set(result.idlist as string[])].slice(0, limit);
        const matchCount = Number(result.count);
        const selectionLimited = Number.isSafeInteger(matchCount) && matchCount > ids.length;
        if (!ids.length) {
            if (result.count !== "0" && result.count !== 0) throw new Error("Unconfirmed PubMed result count");
            return status(source, "empty");
        }
        const response = await fetcher(base + "esummary.fcgi?" + new URLSearchParams({
            db: "pubmed", id: ids.join(","), retmode: "json"
        }), { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
        if (!response.ok) throw new Error("Summary unavailable");
        const details = object(object(await readBoundedJson(response, 2_000_000))?.result);
        let records: SourceRecord[] = ids.flatMap(id => {
            const article = object(details?.[id]);
            return article?.uid === id && typeof article.title === "string" && article.title.trim()
                ? [{ id, title: article.title.slice(0, 1000), url: "https://pubmed.ncbi.nlm.nih.gov/" + id + "/" }]
                : [];
        });
        if (!records.length) throw new Error("Missing PubMed summaries");
        let abstractsAvailable = false;
        try {
            const response = await fetcher(base + 'efetch.fcgi?' + new URLSearchParams({
                db: 'pubmed', id: ids.join(','), retmode: 'xml',
            }), { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
            if (!response.ok) throw new Error('Abstracts unavailable');
            const articles = parsePubMedArticles(await readBoundedText(response, 2_000_000), ids);
            const byId = new Map(articles.map(article => [article.pmid, article]));
            // Valid parsed XML excludes retracted/flagged articles. Do not keep
            // their metadata-only entries as usable clinical evidence.
            records = records.filter(record => byId.has(record.id)).map(record => {
                const article = byId.get(record.id)!;
                return { ...record, abstract: article.abstract, year: article.year, journal: article.journal,
                    publication_types: article.publicationTypes, abstract_truncated: article.abstractTruncated };
            });
            abstractsAvailable = records.length > 0 && records.every(record => Boolean(record.abstract) && !record.abstract_truncated);
        } catch { /* Keep inspectable metadata, explicitly mark unavailable abstracts below. */ }
        const detail = (abstractsAvailable ? 'Notices et résumés récupérés ; leur interprétation clinique reste à valider.'
            : 'Certaines notices ou certains résumés sont indisponibles, incomplets ou écartés. Un titre seul ne démontre aucune relation clinique.')
            + (selectionLimited ? ` Sélection de ${ids.length} notices sur ${matchCount} résultats de recherche ; poursuivre par expansion pour approfondir.` : '');
        return { ...status(source, records.length === ids.length && abstractsAvailable && !selectionLimited ? 'available' : 'partial', records, detail), queries: [query] };
    } catch {
        return status(source, "unavailable", [], "Recherche ou notices indisponibles.");
    }
}

async function fdaSource(medication: string, fetcher: Fetcher): Promise<SourceStatus> {
    const source = "OpenFDA";
    try {
        const base = "https://api.fda.gov/drug/event.json?";
        const url = base + new URLSearchParams({ search: 'patient.drug.medicinalproduct:"' + medication + '"', limit: "5" });
        const response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (!response.ok && response.status !== 404) throw new Error("OpenFDA unavailable");
        const data = object(await readBoundedJson(response, 2_000_000));
        const error = object(data?.error);
        if (response.status === 404 && error?.code === "NOT_FOUND" && /^no matches found!?$/i.test(String(error.message))) {
            return status(source, "empty");
        }
        if (!response.ok || !Array.isArray(data?.results)) throw new Error("Invalid FDA response");
        const results = data.results.slice(0, 5);
        const records: SourceRecord[] = results.flatMap(raw => {
            const report = object(raw);
            const id = report?.safetyreportid;
            if (typeof id !== "string" || !/^\d{1,20}$/.test(id)) return [];
            const reactions = object(report?.patient)?.reaction;
            const reaction = Array.isArray(reactions) ? object(reactions[0])?.reactionmeddrapt : null;
            return [{ id, title: typeof reaction === "string" ? reaction.slice(0, 250) : "Signalement FAERS",
                url: base + new URLSearchParams({ search: 'safetyreportid:"' + id + '"', limit: "1" }) }];
        });
        if (results.length && !records.length) throw new Error("Missing FDA report identifiers");
        return status(source, records.length < results.length ? "partial" : records.length ? "available" : "empty",
            records, "Signalements spontanés de pharmacovigilance. La causalité et la fréquence ne sont pas établies.");
    } catch {
        return status(source, "unavailable", [], "Signalements indisponibles.");
    }
}

export function validMedication(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0 && value.length <= 160 &&
        /^[\p{L}\p{M}\p{N} .()',+/%-]+$/u.test(value);
}

export async function collectExternalSources(topic: string, medication: string | undefined,
    includePubmed: boolean, includeFda: boolean, fetcher: Fetcher = fetch, pathologies: string[] = []) {
    const topics = [...new Set(pathologies.length > 1
        ? [...pathologies, ...(topic !== pathologies.join(' + ') && !pathologies.includes(topic) ? [topic] : [])] : [topic])];
    const deadline = Date.now() + 42_000;
    // Enforce the public NCBI request cadence across every query in this graph.
    let queue = Promise.resolve(), nextAt = 0;
    const pacedFetcher: Fetcher = async (url, options) => {
        if (Date.now() >= deadline) throw new Error('Graph source collection deadline');
        if (new URL(url).hostname === 'eutils.ncbi.nlm.nih.gov' && fetcher === fetch) {
            const reservation = queue.then(async () => {
                const delay = Math.max(0, nextAt - Date.now());
                if (delay) await new Promise(resolve => setTimeout(resolve, delay));
                nextAt = Date.now() + 400;
            });
            queue = reservation.catch(() => undefined);
            await reservation;
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error('Graph source collection deadline');
        return fetcher(url, { ...options, signal: AbortSignal.any([
            ...(options.signal ? [options.signal] : []), AbortSignal.timeout(remaining),
        ]) });
    };
    const collectPubmed = async () => {
        const results: SourceStatus[] = [];
        const perTopic = Math.max(2, Math.min(10, Math.floor(32 / topics.length)));
        // Groups of four keep source lookup latency bounded without unbounded fan-out.
        for (let offset = 0; offset < topics.length; offset += 4) {
            if (Date.now() >= deadline) {
                results.push(...topics.slice(offset).map(() => status('PubMed', 'unavailable', [], 'Délai de collecte atteint.')));
                break;
            }
            results.push(...await Promise.all(topics.slice(offset, offset + 4).map(term => pubmedSource(term, pacedFetcher, perTopic))));
        }
        const queryStatuses = results.map((result, index) => ({ topic: topics[index], query: buildGraphLiteratureQuery(topics[index]),
            status: result.status, count: result.count, detail: result.detail }));
        if (results.length === 1) return { ...results[0], queries: queryStatuses.map(result => result.query), query_statuses: queryStatuses };
        const records = [...new Map(results.flatMap(result => result.records).map(record => [record.id, record])).values()];
        const unavailable = results.filter(result => result.status === 'unavailable').length;
        const partial = results.some(result => result.status === 'partial');
        return { ...status('PubMed', unavailable === results.length ? 'unavailable' : unavailable || partial ? 'partial'
            : records.length ? 'available' : 'empty', records,
            `${results.length} requêtes thématiques ; ${unavailable} indisponible(s). Les absences de résultat ne prouvent pas une absence de risque.`),
            queries: topics.map(buildGraphLiteratureQuery), query_statuses: queryStatuses };
    };
    const [pubmed, fda] = await Promise.all([
        includePubmed ? collectPubmed() : status("PubMed", "skipped", [], "Désactivé."),
        includeFda && validMedication(medication) ? fdaSource(medication.trim(), fetcher)
            : status("OpenFDA", "skipped", [], includeFda ? "Aucun médicament explicite." : "Désactivé.")
    ]);
    return { pubmed, fda };
}

export function localSourceStatus(tables: Array<{ table: string; count: number; failed: boolean }>): SourceStatus {
    const failed = tables.filter(t => t.failed).map(t => t.table);
    const count = tables.reduce((sum, t) => sum + t.count, 0);
    const state = failed.length === tables.length ? "unavailable" : failed.length ? "partial" : count ? "available" : "empty";
    return { source: "Base locale", status: state, count, records: [], failed_tables: failed };
}

export function sourceProvenance(statuses: SourceStatus[]) {
    return {
        sources_consulted: statuses.filter(s => s.status !== "unavailable" && s.status !== "skipped").map(s => s.source),
        source_statuses: statuses,
    };
}
