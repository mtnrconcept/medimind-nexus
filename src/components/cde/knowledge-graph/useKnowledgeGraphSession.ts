import { useCallback, useEffect, useRef, useState } from 'react';
import { useAI } from '@/contexts/AIContext';
import { aiFetch, supabase } from '@/integrations/supabase/client';
import type { RadialRingsData, RingNode } from '@/types/graph';
import { normalizeKnowledgeGraph } from '@/lib/knowledgeGraph/model';
import { asResearchGraph, readResearchResponse, ResearchPageAccumulator, type ResearchGraphData } from '@/lib/knowledgeGraph/researchStream';

interface Run {
  body: Record<string, unknown>;
  base: ResearchGraphData;
  scope: string;
  focusId?: string;
}

function seedGraph(pathologies: string[]): ResearchGraphData {
  return asResearchGraph({ knowledge_graph: { nodes: pathologies.map((name, index) => ({ id: `query-${index}`, name,
    node_type: 'PATHOLOGY', family: 'pathologies', ring: 0, is_root: true, parent_pathology: name,
    properties: { description: 'Point de départ de la recherche.' } })), edges: [] }, micro_signals: [], hypotheses: [] });
}

export function useKnowledgeGraphSession({ isOpen, pathologies, initialData }: {
  isOpen: boolean; pathologies: string[]; initialData?: RadialRingsData;
}) {
  const { llmMode, invokeAI } = useAI();
  const ai = useRef({ llmMode, invokeAI });
  ai.current = { llmMode, invokeAI };
  const [data, setData] = useState<ResearchGraphData>(() => asResearchGraph(initialData ?? {}));
  const dataRef = useRef(data);
  const [isLoading, setIsLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const lastRun = useRef<Run | null>(null);
  const initialized = useRef('');
  const previousInitial = useRef<unknown>(undefined);
  const key = JSON.stringify([...new Set(pathologies.map(value => value.trim()).filter(Boolean))].slice(0, 12));

  const publish = useCallback((next: ResearchGraphData) => { dataRef.current = next; if (mounted.current) setData(next); }, []);

  const run = useCallback(async (request: Run) => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const runId = ++generation.current;
    lastRun.current = request;
    setIsLoading(true); setError(null); setProgressMessage('Recherche des sources et des concepts…');
    const scopeHash = [...request.scope].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261) >>> 0;
    const accumulator = new ResearchPageAccumulator(request.base, `page-${scopeHash.toString(36)}-${runId}`, request.focusId);
    let flush: ReturnType<typeof setTimeout> | undefined;
    const isCurrent = () => generation.current === runId && !controller.signal.aborted && mounted.current;
    const onEvent = (event: Record<string, unknown>) => {
      if (!isCurrent()) return;
      accumulator.accept(event);
      if (event.type === 'progress' && typeof event.message === 'string') setProgressMessage(event.message);
      if (event.type === 'node') setProgressMessage('Ajout des concepts et conservation de leurs références…');
      if (event.type === 'complete') { if (flush) clearTimeout(flush); flush = undefined; publish(accumulator.snapshot(true)); }
      else if (!flush) flush = setTimeout(() => { flush = undefined; if (isCurrent()) publish(accumulator.snapshot()); }, 100);
    };
    try {
      if (ai.current.llmMode === 'local') {
        const result = await ai.current.invokeAI('deep-research-graph', { ...request.body, streaming: false, max_nodes: 35 });
        if (result.error) throw result.error;
        const response = result.data;
        if (!Array.isArray(response?.nodes) || !Array.isArray(response?.edges)) throw new Error('Le modèle local n’a pas retourné de graphe exploitable.');
        // A local model cannot verify public sources. Never trust generated reference claims.
        onEvent({ ...response, nodes: response.nodes.map((node: Record<string, unknown>) => ({ ...node, references: [], sources: [], citations: [], evidence: undefined,
            url: undefined, doi: undefined, pmid: undefined, source: 'Modèle local', properties: { description: node.description } })),
          edges: response.edges.map((edge: Record<string, unknown>) => ({ ...edge, qualifier: 'unverified', sources: [], citations: [], references: [], evidence_items: [], properties: {},
            evidence: { status: 'unavailable', sources: [], limitations: ['Références non consultées par le modèle local.'] } })),
          research_status: 'partial', source_statuses: [{ source: 'Références externes', status: 'skipped', count: 0 }],
          limitations: ['Graphe proposé par le modèle local : chaque relation reste à vérifier.'] });
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Connectez-vous pour lancer une recherche.');
        const response = await aiFetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/deep-research-graph`, {
          method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
            'x-ai-scope': 'knowledge-graph-v2' },
          body: JSON.stringify(request.body),
        });
        await readResearchResponse(response, onEvent, controller.signal);
      }
      if (isCurrent()) {
        const final = accumulator.snapshot(true);
        publish(final);
        setProgressMessage(final.research.status === 'complete' ? 'Recherche terminée.' : 'Résultat partiel conservé.');
        if (final.research.status === 'unavailable') setError('La synthèse est indisponible. L’état des sources et les concepts reçus sont conservés.');
      }
    } catch (cause) {
      if (isCurrent()) {
        publish(accumulator.snapshot(true));
        setError(cause instanceof Error ? cause.message : 'La recherche a été interrompue. Les éléments reçus restent disponibles.');
      }
    } finally {
      if (flush) clearTimeout(flush);
      if (generation.current === runId) { active.current = null; if (mounted.current) setIsLoading(false); }
    }
  }, [publish]);

  const loadGraph = useCallback((input: unknown) => {
    // Detach this observer; an accepted durable server job continues in the activity panel.
    active.current?.abort(); active.current = null; generation.current += 1; lastRun.current = null;
    publish(asResearchGraph(input)); setError(null); setIsLoading(false); setProgressMessage('');
  }, [publish]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (active.current) initialized.current = ''; active.current?.abort(); active.current = null; generation.current += 1; };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (initialData && previousInitial.current !== initialData) {
      previousInitial.current = initialData; initialized.current = key; loadGraph(initialData); return;
    }
    if (initialized.current === key) return;
    const paths = JSON.parse(key) as string[];
    if (!paths.length) return;
    initialized.current = key;
    const base = seedGraph(paths);
    loadGraph(base);
    void run({ body: { topic: paths[0], pathologies: paths, max_nodes: 150, max_depth: 3,
      include_pubmed: true, include_fda: true, streaming: true }, base, scope: 'initial' });
  }, [isOpen, key, initialData, loadGraph, publish, run]);

  const expandNode = useCallback((node: RingNode) => {
    const base = dataRef.current;
    const normalized = normalizeKnowledgeGraph(base);
    const ordered = [...normalized.nodes].sort((a, b) => Number(b.id === node.id) - Number(a.id === node.id));
    void run({ base, focusId: node.id, scope: `expand-${node.id}-${normalized.nodes.length}`,
      body: { topic: node.name, topic_type: node.node_type, max_nodes: 100, max_depth: 3,
        ...(node.node_type === 'DRUG' || node.node_type === 'MEDICATION' ? { medication: node.name } : {}),
        include_pubmed: true, include_fda: true, streaming: true,
        existing_nodes: ordered.slice(0, 150).map(item => ({ id: item.id, name: item.name, node_type: item.node_type,
          canonical_id: item.canonical_id, family: item.family })) } });
  }, [run]);

  const deepAnalysis = useCallback(() => {
    const base = dataRef.current;
    const graph = normalizeKnowledgeGraph(base);
    const root = graph.nodes.find(node => graph.root_ids.includes(node.id)) ?? graph.nodes[0];
    if (!root) return;
    void run({ base, focusId: root.id, scope: `deeper-${graph.nodes.length}-${graph.edges.length}`,
      body: { topic: root.name, topic_type: root.node_type, max_nodes: 150, max_depth: 4,
        include_pubmed: true, include_fda: true, streaming: true,
        existing_nodes: graph.nodes.slice(0, 150).map(item => ({ id: item.id, name: item.name, node_type: item.node_type,
          canonical_id: item.canonical_id, family: item.family })) } });
  }, [run]);

  return { data, isLoading, progressMessage, error, expandNode, deepAnalysis, loadGraph,
    retry: () => { if (lastRun.current) void run({ ...lastRun.current, base: dataRef.current }); } };
}
