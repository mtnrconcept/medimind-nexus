import type { EvidenceRecord, Provider, ReadJson, ResearchQuery } from './contract.ts';

const REGISTRY_LIMIT = 5;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid Prognyx response');
  return value as Record<string, unknown>;
}

function trialRecord(value: unknown): EvidenceRecord {
  const trial = object(value);
  if (typeof trial.nct !== 'string' || !/^NCT\d{8}$/.test(trial.nct) ||
      typeof trial.title !== 'string' || !trial.title.trim()) throw new Error('Invalid registry record');
  const url = 'https://clinicaltrials.gov/study/' + trial.nct;
  if (trial.url !== url) throw new Error('Registry identifier and link disagree');
  const status = typeof trial.status === 'string' && /^[A-Z_]{2,40}$/.test(trial.status) ? trial.status : '';
  const phases = Array.isArray(trial.phases) ? trial.phases.filter((phase): phase is string =>
    typeof phase === 'string' && /^(EARLY_)?PHASE[1-4]$|^NA$/.test(phase)).slice(0, 4) : [];
  return {
    id: trial.nct, url, title: trial.title.trim().slice(0, 500), kind: 'trial',
    detail: ['Protocole déclaré au registre ClinicalTrials.gov, retrouvé via Prognyx.', status, ...phases]
      .filter(Boolean).join(' · '),
  };
}

async function searchRegistry(query: ResearchQuery, read: ReadJson): Promise<EvidenceRecord[]> {
  // The public Prognyx endpoint supports a stateless JSON tools/call with no credentials.
  const envelope = object(await read(new URL('https://www.prognyx.com/api/mcp'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-03-26',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'search_registry', arguments: { query: query.term, limit: REGISTRY_LIMIT } },
    }),
  }));
  if (envelope.jsonrpc !== '2.0' || envelope.id !== 1 || 'error' in envelope) throw new Error('Prognyx RPC unavailable');
  const result = object(envelope.result);
  if (result.isError !== false) throw new Error('Prognyx tool unavailable');
  const data = object(result.structuredContent);
  if (data.state === 'empty') {
    if ((data.total !== undefined && data.total !== 0) ||
        (data.trials !== undefined && (!Array.isArray(data.trials) || data.trials.length))) {
      throw new Error('Inconsistent empty registry response');
    }
    return [];
  }
  if (data.state !== 'ready' || !Array.isArray(data.trials) || !data.trials.length || data.trials.length > REGISTRY_LIMIT ||
      typeof data.total !== 'number' || !Number.isSafeInteger(data.total) || data.total < data.trials.length) {
    throw new Error('Registry results unavailable');
  }
  return data.trials.map(trialRecord);
}

export const pluginSources: Provider[] = [
  { name: 'Prognyx', modes: ['disease', 'gene', 'drug'], search: searchRegistry },
];
