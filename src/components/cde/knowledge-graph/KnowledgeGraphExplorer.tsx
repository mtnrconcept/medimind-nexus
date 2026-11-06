import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Box, ChevronDown, ChevronRight, Compass, ExternalLink, Filter, Focus,
  FolderOpen, Layers3, Link2, Loader2, Maximize, Minus, Network, Plus, RotateCcw, Save, Search, Sparkles, X } from 'lucide-react';
import type { RadialRingsData, RingNode } from '@/types/graph';
import { GRAPH_FAMILIES, getConnectedPath, getGraphDistances, normalizeKnowledgeGraph,
  type EdgeQualifier, type GraphFamily, type KnowledgeEdge, type KnowledgeNode } from '@/lib/knowledgeGraph/model';
import { buildConstellationLayout } from '@/lib/knowledgeGraph/layout';
import type { ResearchGraphData } from '@/lib/knowledgeGraph/researchStream';
import type { CameraCommand } from './KnowledgeGraphScene';
import './knowledge-graph.css';

const Scene = lazy(() => import('./KnowledgeGraphScene'));

export interface KnowledgeGraphViewState {
  version: 2;
  centerId: string;
  families: GraphFamily[];
  qualifiers: EdgeQualifier[];
  maxDepth: number | null;
  mode: '3d' | '2d';
  focus: boolean;
  showLabels: boolean;
}
export interface KnowledgeGraphExplorerProps {
  data: RadialRingsData;
  title?: string;
  isLoading?: boolean;
  progressMessage?: string;
  error?: string | null;
  onRetry?: () => void;
  onExpandNode?: (node: RingNode) => void;
  onDeepAnalysis?: () => void;
  onClose?: () => void;
  onSave?: (state: KnowledgeGraphViewState) => void;
  onLoad?: () => void;
  initialViewState?: Partial<KnowledgeGraphViewState>;
}

const QUALIFIERS: Array<{ id: EdgeQualifier; label: string; explanation: string }> = [
  { id: 'established', label: 'Établi', explanation: 'Relation étayée par les références fournies, dans son contexte.' },
  { id: 'association', label: 'Association', explanation: 'Association documentée ; elle ne démontre pas à elle seule une causalité.' },
  { id: 'research', label: 'Recherche', explanation: 'Hypothèse ou résultat exploratoire, avec ses limites.' },
  { id: 'unverified', label: 'À vérifier', explanation: 'Preuve suffisante non disponible pour qualifier ce lien.' },
];
const relationLabels: Record<string, string> = {
  CAUSES: 'Peut causer', MAY_CAUSE: 'Peut causer', LEADS_TO: 'Peut conduire à', CONTRIBUTES_TO: 'Contribue à',
  ASSOCIATED_WITH: 'Associé à', ASSOCIATED: 'Associé à', SYMPTOM_OF: 'Manifestation de', MANIFESTS_AS: 'Se manifeste par',
  HAS_SYMPTOM: 'A pour manifestation', COMPLICATES: 'Peut compliquer', COMPLICATION_OF: 'Complication de',
  TREATS: 'Traitement de', TREATED_BY: 'Peut être traité par', MANAGED_BY: 'Pris en charge par', IMPROVES: 'Peut améliorer',
  PREVENTS: 'Peut prévenir', SIDE_EFFECT: 'Effet indésirable possible', DRUG_INTERACTION: 'Interaction médicamenteuse',
  INTERACTS_WITH: 'Interagit avec', INTERACTS: 'Interagit avec', INCREASES_EXPOSURE: 'Peut augmenter l’exposition à',
  DECREASES_EXPOSURE: 'Peut diminuer l’exposition à', CONTRAINDICATED_IF: 'Contre-indication selon le contexte',
  CONTRAINDICATION: 'Contre-indication selon le contexte', MONITORED_BY: 'Surveillé par', MONITOR_WITH: 'Surveillé par',
  DIAGNOSED_BY: 'Exploré par', ASSESSED_BY: 'Évalué par', ETIOLOGY_INVESTIGATED_BY: 'Cause recherchée par',
  ENCODES: 'Code pour', EXPRESSED_IN: 'Exprimé dans', PART_OF: 'Fait partie de', LOCATED_IN: 'Situé dans',
  AFFECTS: 'Affecte', TARGETS: 'Cible', INHIBITS: 'Inhibe', ACTIVATES: 'Active', BINDS: 'Se lie à',
  RISK_FACTOR_FOR: 'Facteur de risque de', DIFFERENTIAL_OF: 'Diagnostic différentiel de', STUDIED_FOR: 'Étudié dans',
  ASSOCIATED_RISK: 'Risque associé', CORRELATES_WITH: 'Corrélé à', MEASURES: 'Mesure',
};
const labelRelation = (edge: KnowledgeEdge) => relationLabels[edge.relationship.toUpperCase()] ?? edge.relationship.replace(/_/g, ' ').toLocaleLowerCase('fr');
const normalizeText = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr').trim();
const familyConfig = (family: GraphFamily) => GRAPH_FAMILIES.find(item => item.id === family)!;
const qualifierLabel = (qualifier: EdgeQualifier) => QUALIFIERS.find(item => item.id === qualifier)?.label ?? 'À vérifier';
type GraphReference = KnowledgeEdge['evidence']['sources'][number];

function supportsWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}

function readViewState(value: Partial<KnowledgeGraphViewState> | undefined): Partial<KnowledgeGraphViewState> {
  if (!value || typeof value !== 'object') return {};
  const families = new Set(GRAPH_FAMILIES.map(item => item.id));
  const qualifiers = new Set(QUALIFIERS.map(item => item.id));
  return {
    ...(typeof value.centerId === 'string' ? { centerId: value.centerId } : {}),
    ...(Array.isArray(value.families) ? { families: value.families.filter(item => families.has(item)) } : {}),
    ...(Array.isArray(value.qualifiers) ? { qualifiers: value.qualifiers.filter(item => qualifiers.has(item)) } : {}),
    ...(value.maxDepth === null || Number.isInteger(value.maxDepth) && value.maxDepth >= 1 && value.maxDepth <= 20 ? { maxDepth: value.maxDepth } : {}),
    ...(value.mode === '3d' || value.mode === '2d' ? { mode: value.mode } : {}),
    ...(typeof value.focus === 'boolean' ? { focus: value.focus } : {}),
    ...(typeof value.showLabels === 'boolean' ? { showLabels: value.showLabels } : {}),
  };
}

function referenceUrl(reference: GraphReference): string | null {
  const value = reference.url || (reference.doi ? `https://doi.org/${reference.doi}` : reference.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${reference.pmid}/` : '');
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}

function References({ references }: { references: GraphReference[] }) {
  if (!references.length) return <p className="kg-muted">Aucune référence vérifiable fournie pour ce lien.</p>;
  return <ul className="kg-references">{references.map((reference, index) => {
    const url = referenceUrl(reference);
    const title = reference.title || reference.source || (reference.pmid ? `PubMed · ${reference.pmid}` : reference.doi) || `Référence ${index + 1}`;
    return <li key={`${reference.id || url}-${index}`}>
      {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="kg-source-link">{title}<ExternalLink size={14} aria-hidden="true" /></a> : <span>{title}</span>}
      <span className="kg-source-meta">{reference.source}{reference.year ? ` · ${reference.year}` : ''}
        {reference.verification_status === 'unverified' ? ' · Référence à vérifier' : reference.verification_status === 'unavailable' ? ' · Source indisponible' : ''}</span>
    </li>;
  })}</ul>;
}

function EvidenceDetails({ edge }: { edge: KnowledgeEdge }) {
  const items = edge.evidence_items?.length ? edge.evidence_items : [edge.evidence];
  return <div className="kg-evidence">
    {items.map((evidence, index) => <section key={index} className="kg-evidence-item">
      {items.length > 1 && <h4>Observation {index + 1}</h4>}
      {evidence.status === 'conflicting' && <p className="kg-evidence-note">Résultats contradictoires à examiner.</p>}
      {evidence.status === 'unavailable' && <p className="kg-evidence-note">Niveau de preuve non établi avec les éléments disponibles.</p>}
      {evidence.study_type && <p><span className="kg-muted">Type de preuve</span><br />{evidence.study_type}</p>}
      {evidence.population && <p><span className="kg-muted">Population / modèle</span><br />{evidence.population}</p>}
      {evidence.limitations?.length > 0 && <div><h4>Limites</h4><ul className="kg-limitations">{evidence.limitations.map((limit, i) => <li key={i}>{limit}</li>)}</ul></div>}
      <h4>Références du lien</h4><References references={evidence.sources} />
    </section>)}
  </div>;
}

/** Pure explorer: selecting or filtering never invokes a model or reads a patient record. */
export function KnowledgeGraphExplorer({ data, title = 'Graphe de connaissances', isLoading = false, progressMessage,
  error, onRetry, onExpandNode, onDeepAnalysis, onClose, onSave, onLoad, initialViewState }: KnowledgeGraphExplorerProps) {
  const graph = useMemo(() => normalizeKnowledgeGraph(data), [data]);
  const [view] = useState(() => readViewState(initialViewState));
  const [webglSupported] = useState(supportsWebGL);
  const defaultCenter = graph.nodes.find(node => normalizeText(node.name) === normalizeText(title))?.id
    ?? graph.root_ids[0] ?? graph.nodes.find(node => node.is_root === true)?.id ?? graph.nodes.find(node => node.ring === 0)?.id ?? graph.nodes[0]?.id ?? '';
  const [centerId, setCenterId] = useState(view.centerId || defaultCenter);
  const [families, setFamilies] = useState<Set<GraphFamily>>(() => new Set(view.families ?? GRAPH_FAMILIES.map(item => item.id)));
  const [qualifiers, setQualifiers] = useState<Set<EdgeQualifier>>(() => new Set(view.qualifiers ?? QUALIFIERS.map(item => item.id)));
  const [maxDepth, setMaxDepth] = useState<number | null>(view.maxDepth ?? null);
  const [mode, setMode] = useState<'3d' | '2d'>(webglSupported ? view.mode ?? '3d' : '2d');
  const [webglFailed, setWebglFailed] = useState(!webglSupported);
  const [focus, setFocus] = useState(view.focus ?? false);
  const [showLabels, setShowLabels] = useState(view.showLabels ?? false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showIndex, setShowIndex] = useState(false);
  const [command, setCommand] = useState<CameraCommand>({ type: 'fit', sequence: 0 });
  const details = useRef<HTMLDivElement>(null);
  const searchId = useId();
  const rootId = graph.nodes.some(node => node.id === centerId) ? centerId : defaultCenter;
  const center = graph.nodes.find(node => node.id === rootId);
  const lookup = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph]);
  const layout = useMemo(() => buildConstellationLayout(graph, rootId), [graph, rootId]);
  const distances = useMemo(() => getGraphDistances(graph, rootId), [graph, rootId]);
  const familyCounts = useMemo(() => {
    const result = new Map<GraphFamily, number>();
    graph.nodes.forEach(node => result.set(node.family, (result.get(node.family) ?? 0) + 1));
    return result;
  }, [graph]);
  // Distance is topology, not confidence; qualifiers independently filter real edges.
  const visibleNodes = useMemo(() => graph.nodes.filter(node => node.id === rootId || families.has(node.family)
    && (maxDepth === null || (distances.get(node.id) ?? Infinity) <= maxDepth)), [graph, rootId, families, maxDepth, distances]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map(node => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(() => graph.edges.filter(edge => qualifiers.has(edge.qualifier)
    && visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)), [graph, qualifiers, visibleNodeIds]);
  const selectedNode = selectedNodeId ? lookup.get(selectedNodeId) : null;
  const selectedEdge = graph.edges.find(edge => edge.id === selectedEdgeId);
  const selectedPath = useMemo(() => selectedNodeId ? getConnectedPath({ ...graph, edges: visibleEdges }, rootId, selectedNodeId) : null,
    [graph, visibleEdges, rootId, selectedNodeId]);
  const neighbors = useMemo(() => selectedNodeId ? visibleEdges.filter(edge => edge.source === selectedNodeId || edge.target === selectedNodeId) : [], [selectedNodeId, visibleEdges]);
  const highlightedNodes = useMemo(() => {
    if (selectedEdge) return new Set([selectedEdge.source, selectedEdge.target]);
    const ids = new Set(selectedPath?.nodeIds ?? []);
    if (selectedNodeId) ids.add(selectedNodeId);
    neighbors.forEach(edge => { ids.add(edge.source); ids.add(edge.target); });
    return ids;
  }, [selectedEdge, selectedPath, selectedNodeId, neighbors]);
  const highlightedEdges = useMemo(() => new Set(selectedEdge ? [selectedEdge.id] : [...(selectedPath?.edgeIds ?? []), ...neighbors.map(edge => edge.id)]), [selectedEdge, selectedPath, neighbors]);
  const searchResults = useMemo(() => {
    const term = normalizeText(query);
    if (!term) return [];
    return graph.nodes.filter(node => [node.name, ...(node.aliases ?? [])].some(name => normalizeText(name).includes(term))).slice(0, 10);
  }, [graph, query]);
  const disconnected = graph.nodes.filter(node => !distances.has(node.id)).length;
  const research = (data as Partial<ResearchGraphData>).research;
  const dataIssues = graph.diagnostics.danglingEdges.length + graph.diagnostics.invalidNodes.length;
  const changeCamera = (type: CameraCommand['type']) => setCommand(value => ({ type, sequence: value.sequence + 1 }));
  const resetFilters = () => { setFamilies(new Set(GRAPH_FAMILIES.map(item => item.id))); setQualifiers(new Set(QUALIFIERS.map(item => item.id))); setMaxDepth(null); };
  const selectNode = (id: string) => {
    setSelectedNodeId(id); setSelectedEdgeId(null); setQuery(''); setSidebarOpen(true);
  };
  const selectSearchResult = (node: KnowledgeNode) => {
    setFamilies(value => new Set([...value, node.family])); setMaxDepth(null); selectNode(node.id);
  };
  const selectEdge = (id: string) => { setSelectedEdgeId(id); setSelectedNodeId(null); setSidebarOpen(true); };
  const recenterOn = (id: string) => { setCenterId(id); setMaxDepth(null); changeCamera('fit'); };
  const toggleFamily = (family: GraphFamily) => setFamilies(previous => { const next = new Set(previous); if (next.has(family)) next.delete(family); else next.add(family); return next; });
  const toggleQualifier = (qualifier: EdgeQualifier) => setQualifiers(previous => { const next = new Set(previous); if (next.has(qualifier)) next.delete(qualifier); else next.add(qualifier); return next; });

  useEffect(() => {
    if (selectedNodeId && !visibleNodeIds.has(selectedNodeId)) setSelectedNodeId(null);
    if (selectedEdgeId && !visibleEdges.some(edge => edge.id === selectedEdgeId)) setSelectedEdgeId(null);
  }, [visibleNodeIds, visibleEdges, selectedNodeId, selectedEdgeId]);
  useEffect(() => {
    if (selectedNodeId || selectedEdgeId) details.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }, [selectedNodeId, selectedEdgeId]);

  return <div className="kg-explorer" data-testid="knowledge-graph-explorer">
    <header className="kg-header">
      <div className="kg-brand"><svg viewBox="0 0 34 30" width="32" height="30" aria-hidden="true"><path d="M4 24 10 7Q12 2 16 10L18 15 22 7Q25 1 28 10L32 24" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /></svg><span>MediCore</span></div>
      <div className="kg-heading"><h1>Graphe de connaissances</h1><span className="kg-view-badge">Vue {mode === '3d' ? '3D' : '2D'}</span></div>
      <div className="kg-search"><Search size={18} aria-hidden="true" />
        <input type="search" value={query} onChange={event => { setQuery(event.target.value); setSearchIndex(0); }}
          aria-label="Rechercher un nœud" aria-controls={searchResults.length ? searchId : undefined} autoComplete="off"
          placeholder="Rechercher un nœud…" onKeyDown={event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setSearchIndex(index => Math.min(index + 1, searchResults.length - 1)); }
            if (event.key === 'ArrowUp') { event.preventDefault(); setSearchIndex(index => Math.max(index - 1, 0)); }
            if (event.key === 'Enter' && searchResults[searchIndex]) selectSearchResult(searchResults[searchIndex]);
            if (event.key === 'Escape') { event.stopPropagation(); setQuery(''); }
          }} />
        {query && <div className="kg-search-results" id={searchId} aria-label="Résultats de recherche">
          {searchResults.length ? searchResults.map((node, index) => <button type="button" key={node.id} className={index === searchIndex ? 'is-active' : ''}
            onClick={() => selectSearchResult(node)}><span className="kg-dot" style={{ backgroundColor: familyConfig(node.family).color }} />
            <span>{node.name}<small>{familyConfig(node.family).label} · {node.node_type}</small></span><ArrowRight size={14} /></button>) : <p>Aucun nœud trouvé dans ce graphe.</p>}
        </div>}
      </div>
      {onDeepAnalysis && <button className="kg-analysis-button" aria-label="Analyse approfondie" disabled={isLoading || !graph.nodes.length} onClick={onDeepAnalysis}>
        {isLoading ? <Loader2 size={18} className="kg-spin" /> : <Sparkles size={18} />}<span>Analyse approfondie</span>
      </button>}
      {onClose && <button className="kg-icon-button" onClick={onClose} aria-label="Fermer le graphe"><X size={20} /></button>}
    </header>
    <main className="kg-main">
      <section className="kg-stage" aria-label="Carte de connaissances" data-testid="knowledge-graph-viewport"
        data-visible-nodes={visibleNodes.length} data-visible-edges={visibleEdges.length} data-mode={mode}>
        <div className="kg-stage-heading"><span className="kg-eyebrow">EXPLORATION SÉMANTIQUE</span><h2>{center?.name || title}</h2>
          <p>{graph.nodes.length} nœuds · {graph.edges.length} relations</p></div>
        <button className="kg-mobile-filter kg-secondary-button" onClick={() => setSidebarOpen(value => !value)} aria-expanded={sidebarOpen}>
          <Filter size={16} />Explorer</button>
        {graph.nodes.length ? <Suspense fallback={<div className="kg-center-state"><Loader2 className="kg-spin" />Chargement de la vue…</div>}>
          <Scene layout={layout} visibleNodeIds={visibleNodeIds} edges={visibleEdges} selectedNodeId={selectedNodeId} selectedEdgeId={selectedEdgeId}
            highlightedNodes={highlightedNodes} highlightedEdges={highlightedEdges} focus={focus} command={command} mode={mode} showLabels={showLabels}
            onSelectNode={selectNode} onSelectEdge={selectEdge} onSelectFamily={family => { setFamilies(new Set([family as GraphFamily])); setSidebarOpen(true); }}
            onBackground={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }} onFallback={() => { setMode('2d'); setWebglFailed(true); }} />
        </Suspense> : <div className="kg-center-state"><Network size={38} /><h3>{isLoading ? 'Construction du graphe' : 'Aucun concept disponible'}</h3>
          <p>{isLoading ? 'Les concepts et leurs références apparaîtront ici.' : 'Chargez un graphe ou lancez une recherche pour commencer.'}</p>
          {onRetry && !isLoading && <button className="kg-secondary-button" onClick={onRetry}>Relancer la recherche</button>}</div>}
        {isLoading && <div className="kg-progress" role="status"><Loader2 size={16} className="kg-spin" /><span>{progressMessage || 'Recherche de concepts et de relations sourcées…'}</span></div>}
        {error && <div className="kg-error" role="alert"><span>{error}</span>{onRetry && <button onClick={onRetry} disabled={isLoading}>Réessayer</button>}</div>}
        {webglFailed && <div className="kg-render-note">La vue 2D conserve les mêmes nœuds, liens et références. Le rendu 3D est indisponible sur ce navigateur.</div>}
        <div className="kg-stage-caption"><span className="kg-dot" /><span>La couleur indique la famille ; le tracé qualifie le lien.</span></div>
      </section>
      <aside className={`kg-sidebar ${sidebarOpen ? 'is-open' : ''}`} aria-label="Explorer le graphe">
        <div className="kg-sidebar-title"><Layers3 size={20} /><h2>Explorer le graphe</h2><button className="kg-icon-button kg-mobile-close" aria-label="Fermer les filtres" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
        <section className="kg-filter-card"><div className="kg-section-title"><h3>Familles de nœuds</h3><button onClick={resetFilters} title="Réinitialiser les filtres" aria-label="Réinitialiser les filtres"><RotateCcw size={14} /></button></div>
          <div className="kg-family-filters">{GRAPH_FAMILIES.map(family => <label key={family.id} className={!familyCounts.has(family.id) ? 'is-empty' : ''}>
            <input type="checkbox" checked={families.has(family.id)} onChange={() => toggleFamily(family.id)} aria-label={`Famille : ${family.label}`} />
            <span className="kg-dot" style={{ backgroundColor: family.color }} /><span>{family.label}</span><small>{familyCounts.get(family.id) ?? 0}</small>
          </label>)}</div>
          <div className="kg-section-title kg-with-divider"><h3>Qualification des liens</h3><span title="La qualification dépend des preuves du lien, indépendamment de la distance au centre." aria-label="La qualification est indépendante de la distance au centre">ⓘ</span></div>
          <div className="kg-qualifier-filters">{QUALIFIERS.map(item => <label key={item.id} title={item.explanation}>
            <input type="checkbox" checked={qualifiers.has(item.id)} onChange={() => toggleQualifier(item.id)} aria-label={`Lien : ${item.label}`} />
            <span className={`kg-line-key kg-line-key--${item.id}`} /><span>{item.label}</span>
          </label>)}</div>
          <div className="kg-section-title kg-with-divider"><h3>Profondeur des chemins</h3></div>
          <div className="kg-depth-control" role="group" aria-label="Profondeur des chemins">{[1, 2, 3, null].map(depth => <button key={depth ?? 'all'}
            aria-pressed={maxDepth === depth} className={maxDepth === depth ? 'is-active' : ''} onClick={() => setMaxDepth(depth)}>{depth === null ? 'Tout' : depth === 1 ? 'Direct' : `${depth} liens`}</button>)}</div>
          <p className="kg-muted kg-depth-note">Distance calculée sur les relations présentes.{disconnected > 0 && ` ${disconnected} nœud${disconnected > 1 ? 's' : ''} sans chemin connu, visible${disconnected > 1 ? 's' : ''} avec « Tout ».`}</p>
          <label className="kg-toggle"><input type="checkbox" checked={focus} onChange={event => setFocus(event.target.checked)} /><Focus size={14} /><span>Isoler visuellement la sélection</span></label>
        </section>
        <div ref={details} className="kg-details" aria-live="polite">
          {selectedEdge ? <section className="kg-detail-card kg-detail-card--edge">
            <h3><Link2 size={17} />Relation sélectionnée</h3><div className="kg-relation-heading">{lookup.get(selectedEdge.source)?.name}<span>{selectedEdge.direction === 'undirected' ? '↔' : '→'}</span>{lookup.get(selectedEdge.target)?.name}</div>
            <p className="kg-relation-type">{labelRelation(selectedEdge)}</p><span className={`kg-qualifier-badge kg-qualifier-badge--${selectedEdge.qualifier}`}>{qualifierLabel(selectedEdge.qualifier)}</span>
            {selectedEdge.rationale && <p>{selectedEdge.rationale}</p>}
            {selectedEdge.context && <p className="kg-context">{typeof selectedEdge.context === 'string' ? selectedEdge.context : Object.entries(selectedEdge.context).filter(([, value]) => typeof value === 'string').map(([key, value]) => `${key.replace(/_/g, ' ')} : ${value}`).join(' · ')}</p>}
            <EvidenceDetails edge={selectedEdge} />
            <div className="kg-node-shortcuts"><button onClick={() => selectNode(selectedEdge.source)}><ArrowLeft size={14} />{lookup.get(selectedEdge.source)?.name}</button><button onClick={() => selectNode(selectedEdge.target)}>{lookup.get(selectedEdge.target)?.name}<ArrowRight size={14} /></button></div>
          </section> : selectedNode ? <section className="kg-detail-card">
            <h3><span className="kg-dot" style={{ backgroundColor: familyConfig(selectedNode.family).color }} />{selectedNode.name}</h3>
            <p className="kg-node-family">{familyConfig(selectedNode.family).label} · {selectedNode.node_type}</p>
            {typeof selectedNode.properties.description === 'string' && <p>{selectedNode.properties.description}</p>}
            {selectedNode.aliases.length > 0 && <p className="kg-muted">Synonymes : {selectedNode.aliases.join(', ')}</p>}
            <div className="kg-selection-actions"><button className="kg-secondary-button" onClick={() => recenterOn(selectedNode.id)}><Compass size={15} />Centrer ici</button>
              {onExpandNode && <button className="kg-secondary-button" disabled={isLoading} onClick={() => onExpandNode(selectedNode)}><Plus size={15} />Explorer les liens</button>}</div>
            {selectedPath && selectedPath.edgeIds.length > 0 && <div className="kg-path"><h4>Chemin depuis le centre · {selectedPath.edgeIds.length} lien{selectedPath.edgeIds.length > 1 ? 's' : ''}</h4>
              <p className="kg-muted">Chemin de connexion, sans déduction de causalité.</p><ol>{selectedPath.nodeIds.map((id, index) => <li key={id}>
                {index > 0 && <button className="kg-path-edge" onClick={() => selectEdge(selectedPath.edgeIds[index - 1])}>Voir le lien <Link2 size={12} /></button>}
                <button onClick={() => selectNode(id)}>{lookup.get(id)?.name}</button></li>)}</ol></div>}
            {!selectedPath && selectedNode.id !== rootId && <p className="kg-muted">Aucun chemin visible jusqu’au centre avec les filtres actuels.</p>}
            <h4>Relations de ce nœud · {neighbors.length}</h4><ul className="kg-relations-list">{neighbors.map(edge => <li key={edge.id}><button onClick={() => selectEdge(edge.id)}>
              <span className={`kg-mini-line kg-line-key--${edge.qualifier}`} /><span>{lookup.get(edge.source)?.name} {edge.direction === 'undirected' ? '↔' : '→'} {lookup.get(edge.target)?.name}<small>{labelRelation(edge)} · {qualifierLabel(edge.qualifier)}</small></span><ChevronRight size={14} /></button></li>)}</ul>
            {selectedNode.references.length > 0 && <><h4>Références du concept</h4><References references={selectedNode.references} /></>}
          </section> : <section className="kg-detail-card kg-detail-intro"><Network size={24} /><h3>Du lien direct aux associations indirectes</h3><p>Sélectionnez un nœud pour suivre ses chemins, ou une relation pour lire son contexte et ses références.</p><p className="kg-muted">Carte de connaissances générales</p></section>}
        </div>
        <section className="kg-node-index"><button className="kg-index-toggle" aria-expanded={showIndex} onClick={() => setShowIndex(value => !value)}><BookOpen size={16} />Liste des nœuds ({visibleNodes.length}){showIndex ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
          {showIndex && <ul>{visibleNodes.map(node => <li key={node.id}><button onClick={() => selectNode(node.id)}><span className="kg-dot" style={{ backgroundColor: familyConfig(node.family).color }} />{node.name}<small>{node.node_type}</small></button></li>)}</ul>}
        </section>
        {(research?.source_statuses?.length > 0 || research?.limitations?.length > 0 || dataIssues > 0) && <details className="kg-provenance">
          <summary>Sources et état de la recherche {research?.status === 'partial' || research?.status === 'unavailable' ? '· Partiel' : ''}</summary>
          <p>Une référence retrouvée atteste sa provenance. La qualification de chaque relation reste liée à son contenu et à son contexte.</p>
          {research?.summary && <p>{research.summary}</p>}
          {research?.source_statuses?.map((source, index) => <div key={`${source.source}-${index}`}><strong>{source.source}</strong><span>{({ available: 'Consultée', partial: 'Partielle', empty: 'Aucun résultat retourné', unavailable: 'Indisponible', skipped: 'Non consultée' } as Record<string, string>)[source.status] || 'État inconnu'} · {source.count} notice{source.count > 1 ? 's' : ''}</span>{source.detail && <p>{source.detail}</p>}</div>)}
          {research?.limitations?.map((limitation, index) => <p key={index}>{limitation}</p>)}
          {dataIssues > 0 && <p>{dataIssues} élément{dataIssues > 1 ? 's' : ''} non affiché{dataIssues > 1 ? 's' : ''} : identifiant manquant ou relation incomplète.</p>}
        </details>}
      </aside>
    </main>
    <footer className="kg-toolbar"><div className="kg-toolbar-group"><button onClick={() => changeCamera('out')} aria-label="Réduire le zoom"><Minus size={18} /></button><button onClick={() => changeCamera('in')} aria-label="Augmenter le zoom"><Plus size={18} /></button></div>
      <button className="kg-toolbar-action" aria-label="Recentrer" onClick={() => changeCamera('fit')}><Maximize size={17} /><span>Recentrer</span></button>
      <button className="kg-toolbar-action" onClick={() => { if (mode === '2d' && !supportsWebGL()) { setWebglFailed(true); return; } setMode(value => value === '3d' ? '2d' : '3d'); setWebglFailed(false); }} aria-label={`Passer en vue ${mode === '3d' ? '2D' : '3D'}`}><Box size={17} /><span>Vue {mode === '3d' ? '2D' : '3D'}</span></button>
      <label className="kg-label-toggle"><input type="checkbox" checked={showLabels} onChange={event => setShowLabels(event.target.checked)} />Toutes les étiquettes</label>
      <span className="kg-toolbar-count" role="status">{visibleNodes.length}/{graph.nodes.length} nœuds · {visibleEdges.length} liens visibles</span>
      <span className="kg-gesture-hint">{mode === '3d' ? 'Glisser : tourner · Ctrl + glisser : déplacer' : 'Glisser : déplacer · Molette : zoomer'}</span>
      <div className="kg-toolbar-end">{onSave && <button onClick={() => onSave({ version: 2, centerId: rootId, families: [...families], qualifiers: [...qualifiers], maxDepth, mode, focus, showLabels })} aria-label="Sauvegarder le graphe" title="Sauvegarder le graphe"><Save size={18} /></button>}
        {onLoad && <button onClick={onLoad} aria-label="Charger un graphe" title="Charger un graphe"><FolderOpen size={18} /></button>}
        <span><Network size={17} />Carte de connaissances</span></div>
    </footer>
  </div>;
}
