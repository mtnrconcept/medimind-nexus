/** Native Responses search controls and provenance; never inspect generated JSON for citations. */
export interface AIWebSearchOptions {
  allowedDomains: readonly string[];
  searchContextSize?: 'low' | 'medium' | 'high';
  externalWebAccess?: boolean;
  required?: boolean;
  maxToolCalls?: number;
}

export interface AIWebSource {
  title: string;
  url: string;
}

export interface AIWebSearchProvenance {
  /** URLs returned by completed search tools or native URL-citation annotations. */
  webSources: AIWebSource[];
  /** Completed native web operations, not a count claimed in the answer. */
  webSearchCalls: number;
  webSourcesTruncated: boolean;
}

const MAX_ALLOWED_DOMAINS = 100;
const MAX_TOOL_CALLS = 50;
const DEFAULT_TOOL_CALLS = 12;
const MAX_WEB_SOURCES = 256;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeWebSearchDomains(raw: readonly string[]): string[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_ALLOWED_DOMAINS) {
    throw new Error('OpenAI web search requires between 1 and 100 allowed domains.');
  }
  const domains = raw.map(value => {
    const domain = typeof value === 'string' ? value.trim().toLowerCase() : '';
    const labels = domain.split('.');
    if (domain.length > 253 || labels.length < 2 ||
        !labels.every(label => DOMAIN_LABEL.test(label)) ||
        !/^[a-z]/.test(labels[labels.length - 1]) ||
        ['localhost', 'local', 'internal'].includes(labels[labels.length - 1])) {
      // Do not silently discard a malformed filter and accidentally broaden research.
      throw new Error('OpenAI web search domains must be public host names without a scheme, path or wildcard.');
    }
    return domain;
  });
  return [...new Set(domains)];
}

export function buildOpenAIWebSearchRequest(options: AIWebSearchOptions): Record<string, unknown> {
  const domains = normalizeWebSearchDomains(options.allowedDomains);
  const context = options.searchContextSize ?? 'high';
  if (!['low', 'medium', 'high'].includes(context) ||
      (options.externalWebAccess !== undefined && typeof options.externalWebAccess !== 'boolean') ||
      (options.required !== undefined && typeof options.required !== 'boolean')) {
    throw new Error('OpenAI web search controls are invalid.');
  }
  const requestedCalls = options.maxToolCalls ?? DEFAULT_TOOL_CALLS;
  if (!Number.isFinite(requestedCalls) || requestedCalls < 1) {
    throw new Error('OpenAI web search requires a positive tool-call limit.');
  }
  return {
    tools: [{
      type: 'web_search',
      filters: { allowed_domains: domains },
      search_context_size: context,
      external_web_access: options.externalWebAccess ?? true,
    }],
    tool_choice: options.required === true ? 'required' : 'auto',
    include: ['web_search_call.action.sources'],
    max_tool_calls: Math.min(MAX_TOOL_CALLS, Math.floor(requestedCalls)),
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function sourceUrl(value: unknown, allowedDomains?: readonly string[]): string | null {
  if (typeof value !== 'string' || value.length > 8192) return null;
  const text = value.trim();
  if (!text || [...text].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return null;
  try {
    const url = new URL(text);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const hasCredentials = Boolean(url.username) || Boolean(url.password);
    if (!['https:', 'http:'].includes(url.protocol) || hasCredentials || url.port ||
        !host.includes('.') || host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host) ||
        ['localhost', 'local', 'internal'].some(suffix => host === suffix || host.endsWith('.' + suffix))) return null;
    if (allowedDomains && !allowedDomains.some(domain => host === domain || host.endsWith('.' + domain))) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function extractOpenAIWebProvenance(
  response: Record<string, unknown>,
  allowedDomains?: readonly string[],
): AIWebSearchProvenance {
  const domains = allowedDomains === undefined ? undefined : normalizeWebSearchDomains(allowedDomains);
  const sources = new Map<string, AIWebSource>();
  const completedIds = new Set<string>();
  let webSearchCalls = 0;
  let webSourcesTruncated = false;
  const addSource = (raw: unknown) => {
    const source = record(raw);
    if (!source) return;
    const url = sourceUrl(source.url, domains);
    if (!url) return;
    const title = typeof source.title === 'string' && source.title.trim()
      ? source.title.trim().slice(0, 500) : url;
    const existing = sources.get(url);
    if (existing) {
      // Sources may have no title; a native citation can supply it later.
      if (existing.title === url && title !== url) existing.title = title;
      return;
    }
    if (sources.size >= MAX_WEB_SOURCES) { webSourcesTruncated = true; return; }
    sources.set(url, { title, url });
  };

  const output = Array.isArray(response.output) ? response.output : [];
  for (const rawItem of output) {
    const item = record(rawItem);
    if (!item) continue;
    if (item.type === 'web_search_call' && item.status === 'completed') {
      if (typeof item.id !== 'string' || !completedIds.has(item.id)) {
        webSearchCalls++;
        if (typeof item.id === 'string') completedIds.add(item.id);
      }
      const action = record(item.action);
      if (Array.isArray(action?.sources)) {
        for (const source of action.sources) {
          const entry = record(source);
          if (entry && (entry.type === undefined || entry.type === 'url')) addSource(entry);
        }
      }
    }
    if (item.type !== 'message' || item.role !== 'assistant' || !Array.isArray(item.content)) continue;
    for (const rawPart of item.content) {
      const part = record(rawPart);
      if (part?.type !== 'output_text' || !Array.isArray(part.annotations)) continue;
      for (const rawAnnotation of part.annotations) {
        const annotation = record(rawAnnotation);
        if (annotation?.type === 'url_citation') addSource(annotation);
      }
    }
  }
  return { webSources: [...sources.values()], webSearchCalls, webSourcesTruncated };
}
