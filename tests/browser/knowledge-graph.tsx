import React, { useState, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { KnowledgeGraphExplorer } from '@/components/cde/knowledge-graph/KnowledgeGraphExplorer';
import { knowledgeGraphFixture, createDenseKnowledgeGraphFixture, createGeneRootKnowledgeGraphFixture } from './knowledge-graph-fixture';
import '@/index.css';

type ViewState = Parameters<NonNullable<ComponentProps<typeof KnowledgeGraphExplorer>['onSave']>>[0];

declare global {
  interface Window {
    __knowledgeGraphHarness: {
      actions: string[];
      savedView: ViewState | null;
    };
  }
}

window.__knowledgeGraphHarness = { actions: [], savedView: null };
const parameters = new URLSearchParams(window.location.search);

// Test-only capability simulation. No production module is modified.
if (parameters.get('webgl') === 'off') {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (contextId: string, options?: unknown) {
    if (['webgl', 'webgl2', 'experimental-webgl'].includes(contextId)) return null;
    return getContext.call(this, contextId, options);
  } as typeof getContext;
}

const data = parameters.get('dataset') === 'dense'
  ? createDenseKnowledgeGraphFixture()
  : parameters.get('dataset') === 'gene-root'
    ? createGeneRootKnowledgeGraphFixture()
  : parameters.get('state') === 'empty'
    ? { knowledge_graph: { nodes: [], edges: [] }, micro_signals: [], hypotheses: [] }
    : knowledgeGraphFixture;

export function Harness() {
  const [closed, setClosed] = useState(false);
  const [restoredView, setRestoredView] = useState<Partial<ViewState>>();
  const [revision, setRevision] = useState(0);
  const record = (action: string) => { window.__knowledgeGraphHarness.actions.push(action); };

  // tests/browser is intentionally outside Tailwind's production content globs.
  // Match the production modal's explicit viewport constraint without relying on
  // a test-only utility class being present in the generated stylesheet.
  return <main className="flex min-h-0 flex-col bg-[#070b18] text-slate-100" style={{ height: '100dvh' }}>
    <div role="note" data-testid="synthetic-fixture-banner" className="shrink-0 border-b border-slate-700/60 bg-slate-950 px-4 py-2 text-xs text-slate-300">
      <strong className="font-medium text-amber-300">Démonstration synthétique</strong>
      {' · Aucun dossier patient · Aucune requête IA · Références publiques illustratives'}
    </div>
    <div className="relative min-h-0 flex-1">
      {closed ? <p role="status" className="p-8">Démonstration fermée.</p> : <KnowledgeGraphExplorer
        key={revision}
        data={data}
        title="Syndrome néphrotique · démonstration"
        isLoading={parameters.get('state') === 'loading'}
        progressMessage="Chargement synthétique : aucun appel réseau."
        error={parameters.get('state') === 'error' ? 'Erreur synthétique : données existantes conservées.' : undefined}
        onRetry={() => record('retry')}
        initialViewState={restoredView}
        onExpandNode={selected => record(`expand:${selected.id}`)}
        onDeepAnalysis={() => record('deep-analysis')}
        onClose={() => { record('close'); setClosed(true); }}
        onSave={view => { record('save'); window.__knowledgeGraphHarness.savedView = view; }}
        onLoad={() => {
          record('load');
          if (window.__knowledgeGraphHarness.savedView) {
            setRestoredView(window.__knowledgeGraphHarness.savedView);
            setRevision(value => value + 1);
          }
        }}
      />}
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Harness />);
