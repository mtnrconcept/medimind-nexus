export type ResearchMode = 'disease' | 'gene' | 'drug';
export interface ResearchQuery {
  mode: ResearchMode;
  term: string;
}
export interface EvidenceRecord {
  id: string;
  title: string;
  url: string;
  kind: 'publication' | 'trial' | 'association' | 'protein' | 'compound' | 'gene' | 'pathway' | 'structure' | 'variant' | 'disease';
  detail: string;
  related?: { id: string; url: string }[];
  followUp?: ResearchQuery;
}

export type ReadJson = (url: URL, init?: RequestInit) => Promise<unknown>;
export interface Provider {
  name: string;
  modes: ResearchMode[];
  citationLookup?: boolean;
  accepts?: (query: ResearchQuery) => boolean;
  search: (query: ResearchQuery, read: ReadJson) => Promise<EvidenceRecord[]>;
}
export interface SourceResult {
  name: string;
  status: 'matched' | 'empty' | 'unavailable';
  records: EvidenceRecord[];
}
export interface EvidenceReport {
  schemaVersion: 1;
  query: ResearchQuery;
  resolvedTerm?: string;
  retrievedAt: string;
  sources: SourceResult[];
}
