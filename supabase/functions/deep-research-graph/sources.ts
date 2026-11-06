import { readBoundedJson, readBoundedText } from '../_shared/bounded-json.ts';
import { parsePubMedArticles } from '../cross-data-analyzer/pubmed-research.ts';
export type SourceState = "available" | "empty" | "unavailable" | "partial" | "skipped";

export interface SourceRecord {
    id: string;
    title: string;
    url: string;
    abstract?: string;
    publication_types?: string[];
    year?: string;
    content_level?: 'abstract' | 'metadata' | 'report' | 'web';
}

export interface SourceStatus {
    source: string;
    status: SourceState;
    count: number;
    records: SourceRecord[];
    detail?: string;
    failed_tables?: string[];
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

async function pubmedSource(topic: string, fetcher: Fetcher): Promise<SourceStatus> {
    const source = "PubMed";
    const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/";
    try {
        const search = await fetcher(base + "esearch.fcgi?" + new URLSearchParams({
            db: "pubmed", term: topic, retmax: "10", retmode: "json", sort: "relevance"
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
        const ids = [...new Set(result.idlist as string[])].slice(0, 10);
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
                ? [{ id, title: article.title.slice(0, 1000), url: "https://pubmed.ncbi.nlm.nih.gov/" + id + "/", content_level: 'metadata' as const }]
                : [];
        });
        if (!records.length) throw new Error("Missing PubMed summaries");
        // A title is a search match, not evidence for a clinical relation. Retrieve
        // abstracts before asking the model to judge the actual claim/population.
        try {
            const abstracts = await fetcher(base + 'efetch.fcgi?' + new URLSearchParams({
                db: 'pubmed', id: records.map(record => record.id).join(','), retmode: 'xml',
            }), { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
            if (!abstracts.ok) throw new Error('Abstracts unavailable');
            const xml = await readBoundedText(abstracts, 2_000_000);
            const articles = parsePubMedArticles(xml, records.map(record => record.id));
            const returnedIds = new Set([...xml.matchAll(/<PMID[^>]*>(\d+)<\/PMID>/g)].map(match => match[1]));
            records = records.flatMap(record => {
                const article = articles.find(item => item.pmid === record.id);
                // parsePubMedArticles excludes retractions and expressions of concern.
                if (!article && returnedIds.has(record.id)) return [];
                return [{ ...record, ...(article ? { title: article.title, abstract: article.abstract,
                    publication_types: article.publicationTypes, year: article.year,
                    content_level: article.abstract ? 'abstract' as const : 'metadata' as const } : {}) }];
            });
        } catch { /* Keep verified metadata with an explicit evidence limitation. */ }
        const complete = records.length === ids.length && records.every(record => record.content_level === 'abstract');
        return status(source, complete ? 'available' : 'partial', records,
            complete ? 'Notices et résumés consultés ; chaque relation doit rester interprétée dans son contexte.'
                : 'Certaines notices ou certains résumés sont indisponibles. Un titre seul ne valide pas une relation.');
    } catch {
        return status(source, "unavailable", [], "Recherche ou notices indisponibles.");
    }
}

async function fdaSource(medication: string, fetcher: Fetcher): Promise<SourceStatus> {
    const source = "OpenFDA";
    try {
        const base = "https://api.fda.gov/drug/event.json?";
        const url = base + new URLSearchParams({ search: 'patient.drug.medicinalproduct:"' + medication + '"', limit: "5" });
        const response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
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
                url: base + new URLSearchParams({ search: 'safetyreportid:"' + id + '"', limit: "1" }), content_level: 'report' }];
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
    includePubmed: boolean, includeFda: boolean, fetcher: Fetcher = fetch) {
    const [pubmed, fda] = await Promise.all([
        includePubmed ? pubmedSource(topic, fetcher) : status("PubMed", "skipped", [], "Désactivé."),
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
