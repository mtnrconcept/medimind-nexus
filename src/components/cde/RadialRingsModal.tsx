import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { FolderOpen, Loader2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import type { RadialRingsData } from '@/types/graph';
import { KnowledgeGraphExplorer, type KnowledgeGraphViewState } from './knowledge-graph/KnowledgeGraphExplorer';
import { useKnowledgeGraphSession } from './knowledge-graph/useKnowledgeGraphSession';

interface SavedGraphPayload {
  name: string;
  description: string;
  graph_data: RadialRingsData;
  view_state: KnowledgeGraphViewState;
}
interface RadialRingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pathology?: string;
  pathologies?: string[];
  mode?: 'THERAPY' | 'SAFETY' | 'ETIOLOGY' | 'RELAPSE';
  context?: Record<string, unknown>;
  onSave?: (savedGraph: SavedGraphPayload) => unknown | Promise<unknown>;
  onLoad?: (savedGraph: Database['public']['Tables']['saved_graphs']['Row']) => void;
  initialData?: RadialRingsData;
  initialViewState?: Partial<KnowledgeGraphViewState>;
}
type SavedGraphSummary = Pick<Database['public']['Tables']['saved_graphs']['Row'], 'id' | 'name' | 'description' | 'updated_at'>;

/** Compatibility entry point for Discovery, ContinuousDiscovery and advanced research. */
export default function RadialRingsModal({ isOpen, onClose, pathology, pathologies = [], onSave, onLoad, initialData, initialViewState }: RadialRingsModalProps) {
  const topics = pathologies.length ? pathologies : pathology ? [pathology] : [];
  const session = useKnowledgeGraphSession({ isOpen, pathologies: topics, initialData });
  const [viewState, setViewState] = useState(initialViewState);
  const [viewRevision, setViewRevision] = useState(0);
  const [saveOpen, setSaveOpen] = useState(false);
  const [loadOpen, setLoadOpen] = useState(false);
  const [graphName, setGraphName] = useState(topics.join(' · '));
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedGraphs, setSavedGraphs] = useState<SavedGraphSummary[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSavedId, setSelectedSavedId] = useState<string | undefined>();
  const pendingView = useRef<KnowledgeGraphViewState | null>(null);
  const loadGeneration = useRef(0);
  const identityGeneration = useRef(0);
  const expectedLoadedData = useRef<unknown>(undefined);
  const topicKey = JSON.stringify(topics);
  const graphIdentity = useRef({ topicKey, initialData });

  useEffect(() => { if (initialViewState) setViewState(initialViewState); }, [initialViewState]);
  useEffect(() => {
    if (graphIdentity.current.topicKey === topicKey && graphIdentity.current.initialData === initialData) return;
    graphIdentity.current = { topicKey, initialData };
    if (expectedLoadedData.current && expectedLoadedData.current === initialData) {
      expectedLoadedData.current = undefined;
      return;
    }
    expectedLoadedData.current = undefined;
    identityGeneration.current += 1; loadGeneration.current += 1;
    // A new subject is a new document; never overwrite a previously loaded graph's ID.
    setSelectedSavedId(undefined); setGraphName((JSON.parse(topicKey) as string[]).join(' · ')); setDescription('');
    setViewState(initialViewState); setViewRevision(value => value + 1);
    pendingView.current = null; setSaveOpen(false); setLoadOpen(false); setSaving(false); setLoadingSaved(false);
  }, [topicKey, initialData, initialViewState]);

  const beginSave = (state: KnowledgeGraphViewState) => {
    pendingView.current = state;
    if (!graphName.trim()) setGraphName(session.data.knowledge_graph.nodes.find(node => node.ring === 0)?.name || 'Graphe de connaissances');
    setSaveError(null); setSaveOpen(true);
  };
  const save = async () => {
    if (!pendingView.current || !graphName.trim() || saving) return;
    const identity = identityGeneration.current;
    setSaving(true); setSaveError(null);
    try {
      const payload: SavedGraphPayload = { name: graphName.trim(), description: description.trim(),
        graph_data: session.data, view_state: pendingView.current };
      if (onSave) await onSave(payload);
      else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Connectez-vous pour sauvegarder ce graphe.');
        const { data, error } = await supabase.from('saved_graphs').upsert({
          ...(selectedSavedId ? { id: selectedSavedId } : {}), user_id: user.id, name: payload.name,
          description: payload.description, graph_data: JSON.parse(JSON.stringify(payload.graph_data)) as Json,
          view_state: JSON.parse(JSON.stringify(payload.view_state)) as Json,
          updated_at: new Date().toISOString(),
        }).select('id').single();
        if (error) throw error;
        if (identity === identityGeneration.current) setSelectedSavedId(data.id);
        toast.success('Graphe et références sauvegardés.');
      }
      if (identity === identityGeneration.current) setSaveOpen(false);
    } catch (cause) { if (identity === identityGeneration.current) setSaveError(cause instanceof Error ? cause.message : 'La sauvegarde n’a pas abouti.'); }
    finally { if (identity === identityGeneration.current) setSaving(false); }
  };
  const listSaved = async () => {
    const generation = ++loadGeneration.current;
    setLoadOpen(true); setLoadingSaved(true); setLoadError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Connectez-vous pour retrouver vos graphes.');
      const { data, error } = await supabase.from('saved_graphs').select('id,name,description,updated_at')
        .eq('user_id', user.id).order('updated_at', { ascending: false }).limit(50);
      if (error) throw error;
      if (generation === loadGeneration.current) setSavedGraphs(data ?? []);
    } catch (cause) { if (generation === loadGeneration.current) setLoadError(cause instanceof Error ? cause.message : 'La liste des graphes est indisponible.'); }
    finally { if (generation === loadGeneration.current) setLoadingSaved(false); }
  };
  const loadSaved = async (id: string) => {
    if (loadingSaved) return;
    const generation = ++loadGeneration.current;
    setLoadingSaved(true); setLoadError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Votre session a expiré.');
      const { data, error } = await supabase.from('saved_graphs').select('*').eq('id', id).eq('user_id', user.id).single();
      if (error) throw error;
      if (generation !== loadGeneration.current) return;
      session.loadGraph(data.graph_data);
      setViewState(data.view_state && typeof data.view_state === 'object' && !Array.isArray(data.view_state) ? data.view_state as Partial<KnowledgeGraphViewState> : undefined);
      setViewRevision(value => value + 1);
      setGraphName(data.name); setDescription(data.description || ''); setSelectedSavedId(data.id);
      if (onLoad) { expectedLoadedData.current = data.graph_data; onLoad(data); }
      setLoadOpen(false);
    } catch (cause) { if (generation === loadGeneration.current) setLoadError(cause instanceof Error ? cause.message : 'Ce graphe n’a pas pu être chargé.'); }
    finally { if (generation === loadGeneration.current) setLoadingSaved(false); }
  };

  return <>
    <Dialog.Root open={isOpen} onOpenChange={open => { if (!open) onClose(); }}>
      <Dialog.Portal><Dialog.Overlay className="kg-modal-overlay" />
        <Dialog.Content className="kg-modal" aria-describedby="kg-dialog-description" onInteractOutside={event => event.preventDefault()}>
          <Dialog.Title className="sr-only">Graphe de connaissances médicales</Dialog.Title>
          <Dialog.Description id="kg-dialog-description" className="sr-only">Exploration par familles, chemins et références. Les boutons d’exploration lancent une recherche complémentaire.</Dialog.Description>
          <KnowledgeGraphExplorer key={viewRevision} data={session.data} title={topics[0] || graphName}
            isLoading={session.isLoading} progressMessage={session.progressMessage} error={session.error}
            onRetry={session.retry} onExpandNode={session.expandNode} onDeepAnalysis={session.deepAnalysis}
            onClose={onClose} onSave={beginSave} onLoad={() => void listSaved()} initialViewState={viewState} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <Dialog.Root open={saveOpen} onOpenChange={open => { if (!saving) setSaveOpen(open); }}>
      <Dialog.Portal><Dialog.Overlay className="kg-form-overlay" /><Dialog.Content className="kg-form-dialog">
        <Dialog.Title><Save size={20} />Sauvegarder le graphe</Dialog.Title>
        <Dialog.Description>Les concepts, les références de chaque relation et les filtres seront conservés.</Dialog.Description>
        <form onSubmit={event => { event.preventDefault(); void save(); }}>
          <label htmlFor="kg-save-name">Nom du graphe</label><input id="kg-save-name" autoFocus required maxLength={200} value={graphName} onChange={event => setGraphName(event.target.value)} />
          <label htmlFor="kg-save-description">Description</label><textarea id="kg-save-description" maxLength={2000} rows={3} value={description} onChange={event => setDescription(event.target.value)} />
          {session.isLoading && <p className="kg-form-note">La recherche continue. Cette sauvegarde contiendra les éléments déjà reçus.</p>}
          {saveError && <p role="alert" className="kg-form-error">{saveError}</p>}
          <div className="kg-form-actions"><button type="button" disabled={saving} onClick={() => setSaveOpen(false)}>Annuler</button><button type="submit" disabled={saving || !graphName.trim()}>{saving && <Loader2 size={16} className="kg-spin" />}Sauvegarder</button></div>
        </form>
        <Dialog.Close className="kg-form-close" aria-label="Fermer la sauvegarde" disabled={saving}><X size={18} /></Dialog.Close>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
    <Dialog.Root open={loadOpen} onOpenChange={open => { setLoadOpen(open); if (!open) { loadGeneration.current += 1; setLoadingSaved(false); } }}>
      <Dialog.Portal><Dialog.Overlay className="kg-form-overlay" /><Dialog.Content className="kg-form-dialog">
        <Dialog.Title><FolderOpen size={20} />Charger un graphe</Dialog.Title>
        <Dialog.Description>Vos 50 graphes les plus récemment enregistrés. Les anciennes sauvegardes sont converties à l’ouverture.</Dialog.Description>
        {loadingSaved && <p role="status" className="kg-form-note"><Loader2 size={16} className="kg-spin" />Chargement…</p>}
        {loadError && <div role="alert" className="kg-form-error">{loadError}<button onClick={() => void listSaved()}>Réessayer</button></div>}
        {!loadingSaved && !loadError && savedGraphs.length === 0 && <p className="kg-form-note">Aucun graphe enregistré.</p>}
        <ul className="kg-saved-list">{savedGraphs.map(graph => <li key={graph.id}><button disabled={loadingSaved} onClick={() => void loadSaved(graph.id)}>
          <strong>{graph.name}</strong>{graph.description && <span>{graph.description}</span>}<small>{graph.updated_at ? new Date(graph.updated_at).toLocaleDateString('fr') : ''}</small>
        </button></li>)}</ul>
        <Dialog.Close className="kg-form-close" aria-label="Fermer le chargement"><X size={18} /></Dialog.Close>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  </>;
}
