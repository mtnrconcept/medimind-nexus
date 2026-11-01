import type { EvidenceRecord, EvidenceReport, ResearchQuery } from '../../supabase/functions/scientific-evidence/contract';

export const MAX_NOTEBOOK_ITEMS = 20;
export const NOTEBOOK_TEXT_LIMIT = 1200;
export const roleLabels = {
  unreviewed: 'À examiner', supports: 'Appuie l’hypothèse', contradicts: 'Contredit l’hypothèse',
};
type Role = keyof typeof roleLabels;

interface Provenance {
  source: string;
  query: ResearchQuery;
  retrievedAt: string;
  record: EvidenceRecord;
}

interface NotebookItem {
  key: string;
  role: Role;
  provenance: Provenance[];
}

export interface Notebook {
  hypothesis: string;
  refutationCriterion: string;
  items: NotebookItem[];
}
export type NotebookAction =
  | { type: 'retain'; report: EvidenceReport; record: EvidenceRecord }
  | { type: 'refresh'; report: EvidenceReport }
  | { type: 'field'; field: 'hypothesis' | 'refutationCriterion'; value: string }
  | { type: 'role'; key: string; role: Role }
  | { type: 'remove'; key: string }
  | { type: 'reset' };

export function createNotebook(): Notebook {
  return { hypothesis: '', refutationCriterion: '', items: [] };
}

// Providers emit canonical primary IDs. Related IDs remain links, never identity aliases.
export function recordKey(record: EvidenceRecord) {
  return record.kind + ':' + record.id;
}

function withProvenance(item: NotebookItem, report: EvidenceReport): NotebookItem {
  const additions: Provenance[] = [];
  for (const source of report.sources) {
    const record = source.records.find(candidate => recordKey(candidate) === item.key);
    const seen = item.provenance.some(origin => origin.source === source.name && origin.retrievedAt === report.retrievedAt &&
      origin.query.mode === report.query.mode && origin.query.term === report.query.term);
    if (record && !seen) additions.push({ source: source.name, query: report.query, retrievedAt: report.retrievedAt, record });
  }
  return additions.length ? { ...item, provenance: [...item.provenance, ...additions] } : item;
}

export function notebookReducer(state: Notebook, action: NotebookAction): Notebook {
  switch (action.type) {
    case 'reset':
      return createNotebook();
    case 'field':
      return { ...state, [action.field]: action.value.slice(0, NOTEBOOK_TEXT_LIMIT) };
    case 'role':
      return { ...state, items: state.items.map(item => item.key === action.key ? { ...item, role: action.role } : item) };
    case 'remove':
      return { ...state, items: state.items.filter(item => item.key !== action.key) };
    case 'refresh':
      return { ...state, items: state.items.map(item => withProvenance(item, action.report)) };
    case 'retain': {
      const key = recordKey(action.record);
      const existing = state.items.find(item => item.key === key);
      if (existing) return { ...state, items: state.items.map(item => item === existing ? withProvenance(item, action.report) : item) };
      if (state.items.length >= MAX_NOTEBOOK_ITEMS) return state;
      const item = withProvenance({ key, role: 'unreviewed', provenance: [] }, action.report);
      return item.provenance.length ? { ...state, items: [...state.items, item] } : state;
    }
  }
}

export function exportNotebook(state: Notebook, exportedAt: string) {
  return { schemaVersion: 1, type: 'medicore-research-notebook', exportedAt,
    interpretation: 'Les rôles sont attribués par la personne qui mène la recherche. Une référence peut être indexée par plusieurs sources.',
    roleLabels, ...state };
}

export function downloadJson(value: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
