import { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Clock3, Loader2, RefreshCw, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { aiTransport } from '@/integrations/supabase/client';
import { AIJobObservation, waitForAIRequest } from '@/lib/aiJobObservation';
import { isTransientRequestFailure } from '@/lib/requestFailures';
import { AIEventReplay, describeAIResult } from '@/lib/aiResultDisplay';
import type { AIToolJob } from '@/lib/aiTransport';
import type { ScraperBatchResult } from '../../../supabase/functions/ai-tool-jobs/batch';

const labels: Record<string, string> = {
  'ai-assistant': 'Assistant patient', 'cross-data-analyzer': 'Analyse croisée',
  'patient-health-synthesis': 'Synthèse de santé', 'deep-research': 'Recherche approfondie',
  'cde-analyze': 'Analyse de découverte', 'cde-systematic-analyze': 'Recherche systématique',
  'adversarial-reviewer': 'Relecture critique', 'analyze-kg-links': 'Analyse approfondie des liens',
  'analyze-user-links': 'Analyse des liens', 'causal-reasoning': 'Raisonnement causal',
  'continuous-discovery-pipeline': 'Découverte continue', 'deep-research-graph': 'Graphe de recherche',
  'detect-side-effects': 'Analyse des effets secondaires', 'discovery-engine': 'Moteur de découverte',
  'discovery-platform': 'Recherche et hypothèses', 'discovery-search': 'Recherche scientifique',
  'document-analyzer': 'Analyse de document', 'embed-data': 'Indexation documentaire',
  'expand-graph': 'Exploration du graphe', 'focused-research': 'Recherche ciblée',
  'generate-embeddings': 'Indexation documentaire', 'generate-molecule': 'Génération de molécule',
  'graph-chat': 'Assistant du graphe', 'hypothesis-generator': 'Génération d’hypothèses',
  'hypothesis-processor': 'Génération d’hypothèses', 'knowledge-extractor': 'Extraction des connaissances',
  'lbd-analogy-finder': 'Recherche d’analogies', 'lbd-contradiction-detector': 'Analyse des contradictions',
  'lbd-expand-node': 'Exploration des connaissances', 'lbd-orchestrator': 'Recherche documentaire',
  'lbd-swanson-abc': 'Recherche de relations', 'live-research': 'Veille scientifique',
  'medical-scraper': 'Enrichissement des données', 'neural-kg': 'Graphe de connaissances',
  'pathology-analyzer': 'Analyse de pathologie', 'radial-rings-engine': 'Exploration scientifique',
  'scientific-analysis': 'Analyse scientifique', 'symptom-questionnaire': 'Questionnaire de symptômes',
  'systematic-research': 'Revue systématique', 'targeted-research': 'Recherche ciblée',
  'translate': 'Traduction', 'translate-database': 'Traduction des données',
  'validate-hypothesis': 'Vérification d’hypothèse',
};
const terminal = (job: AIToolJob) => ['completed', 'failed', 'cancelled'].includes(job.status);
const available = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;
const label = (job: AIToolJob) => job.analysis_mode === 'scraper_batch' ? 'Collecte de pages médicales'
  : job.analysis_mode === 'hypothesis_generation' ? 'Génération d’hypothèses' : labels[job.function_name ?? ''] ?? 'Traitement IA';

export default function AIActivityPanel() {
  const { user } = useAuth();
  const owner = user?.id;
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<{ owner?: string; jobs: AIToolJob[] }>({ jobs: [] });
  const [listError, setListError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ owner: string; job: AIToolJob } | null>(null);
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const jobs = list.owner === owner ? list.jobs : [];
  const selected = detail !== null && detail.owner === owner && detail.job.id === selectedId ? detail.job : null;
  const pending = jobs.filter(job => !terminal(job) && !job.stalled).length;
  const display = useMemo(() => selected?.result_payload?.body ? describeAIResult(selected.result_payload) : null, [selected]);
  const selectedBatch = selected?.analysis_mode === 'scraper_batch' && typeof display?.structured[0] === 'object'
    ? display.structured[0] as ScraperBatchResult : null;

  useEffect(() => {
    setOpen(false);
    setSelectedId(null);
    setDetail(null);
    setListError('');
    setDetailError('');
    setStoppingId(null);
  }, [owner]);

  useEffect(() => {
    if (!owner) return;
    let mounted = true;
    let running = false;
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const update = async () => {
      if (!mounted || running || !available()) return;
      running = true;
      dirty = false;
      let shouldPoll = open;
      clearTimeout(timer);
      try {
        const data = await waitForAIRequest(() => aiTransport.list(owner), controller.signal);
        if (!mounted) return;
        setList({ owner, jobs: data.jobs });
        setListError('');
        shouldPoll ||= data.jobs.some(job => !terminal(job));
      } catch (error) {
        shouldPoll = isTransientRequestFailure(error);
        if (mounted) setListError(isTransientRequestFailure(error)
          ? 'Connexion interrompue. Vos tâches restent enregistrées.'
          : 'L’activité IA est momentanément indisponible.');
      } finally {
        running = false;
        if (mounted && (dirty || shouldPoll)) timer = setTimeout(update, dirty ? 0 : open ? 5_000 : 15_000);
      }
    };
    const wake = () => { dirty = true; if (available()) void update(); };
    const unsubscribe = aiTransport.subscribe(wake);
    for (const event of ['online', 'pageshow']) window.addEventListener(event, wake);
    document.addEventListener('visibilitychange', wake);
    void update();
    return () => {
      mounted = false;
      controller.abort();
      clearTimeout(timer);
      unsubscribe();
      for (const event of ['online', 'pageshow']) window.removeEventListener(event, wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [owner, open, refresh]);

  useEffect(() => {
    if (!owner || !open || !selectedId) return;
    const controller = new AbortController();
    const observation = new AIJobObservation();
    const replay = new AIEventReplay();
    setDetailLoading(true);
    setDetailError('');
    void (async () => {
      let delay = 0;
      try {
        while (!controller.signal.aborted) {
          observation.assertBudget();
          await observation.wait(delay, controller.signal);
          try {
            const data = await waitForAIRequest(() => aiTransport.status(selectedId, replay.cursor, owner), controller.signal);
            if (controller.signal.aborted) return;
            setDetail({ owner, job: replay.accept(data) });
            setDetailError('');
            setDetailLoading(false);
            if (terminal(data.job) && !data.hasMore) return;
            delay = data.hasMore ? 0 : data.job.stalled ? 15_000 : 3_000;
          } catch (error) {
            if (controller.signal.aborted) return;
            if (!isTransientRequestFailure(error)) throw error;
            setDetailError('Connexion interrompue. Reprise du suivi en cours…');
            delay = 5_000;
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) setDetailError(error instanceof Error ? error.message : 'Résultat momentanément indisponible.');
      } finally {
        observation.dispose();
        if (!controller.signal.aborted) setDetailLoading(false);
      }
    })();
    return () => { controller.abort(); observation.dispose(); };
  }, [owner, open, selectedId, refresh]);

  if (!owner) return null;

  const stopSelectedBatch = async () => {
    if (!selected || selected.analysis_mode !== 'scraper_batch') return;
    setStoppingId(selected.id);
    try {
      await aiTransport.stopBatch(selected.id, { owner });
      setRefresh(value => value + 1);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'L’arrêt n’a pas été confirmé. Réessayez.');
    } finally { setStoppingId(null); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="fixed bottom-4 right-4 z-[20000] gap-2 rounded-full border-primary/25 bg-card px-4 shadow-lg" aria-label={'Activité IA' + (pending ? ', ' + pending + ' tâches en cours' : '')}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Activity className="h-4 w-4 text-primary" />}
          Activité IA
          {pending > 0 && <Badge variant="secondary" className="ml-1 h-5 min-w-5 justify-center px-1.5">{pending}</Badge>}
        </Button>
      </DialogTrigger>
      <DialogContent className="z-[20001] flex max-h-[85vh] max-w-5xl flex-col gap-4 overflow-hidden p-5 sm:p-6">
        <DialogHeader>
          <DialogTitle>Activité IA</DialogTitle>
          <DialogDescription>Retrouvez vos générations et leurs résultats après un changement d’onglet ou un retour dans l’application.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>{pending > 0 ? pending + ' traitement' + (pending > 1 ? 's' : '') + ' en cours' : 'Vos derniers traitements'}</span>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => setRefresh(value => value + 1)}><RefreshCw className="h-3.5 w-3.5" /> Actualiser</Button>
        </div>
        {listError && <p role="status" className="rounded-lg bg-muted p-3 text-sm">{listError}</p>}
        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto md:grid-cols-[280px_minmax(0,1fr)]">
          <div className="max-h-52 space-y-2 overflow-y-auto pr-1 md:max-h-[55vh]">
            {jobs.length === 0 && <p className="py-6 text-sm text-muted-foreground">Aucun traitement récent à afficher.</p>}
            {jobs.map(job => (
              <button key={job.id} type="button" onClick={() => setSelectedId(job.id)} className={'flex w-full items-start gap-2.5 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ' + (selectedId === job.id ? 'border-primary/40 bg-primary/5' : 'border-border hover:bg-muted')} aria-pressed={selectedId === job.id}>
                {job.status === 'completed' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : job.status === 'failed' || job.status === 'cancelled' || job.stalled ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                <span className="min-w-0 space-y-1">
                  <span className="block text-sm font-medium">{label(job)}</span>
                  <span className="block text-xs text-muted-foreground">{job.stalled ? 'Suivi interrompu, résultat à vérifier' : job.status === 'completed' ? 'Terminé' : job.status === 'failed' ? 'À vérifier' : job.status === 'cancelled' ? 'Annulé' : 'En cours · ' + Math.round(job.progress_percentage ?? 0) + ' %'}</span>
                  {job.created_at && <time className="block text-[11px] text-muted-foreground" dateTime={job.created_at}>{new Date(job.created_at).toLocaleString('fr-CH', { dateStyle: 'short', timeStyle: 'short' })}</time>}
                </span>
              </button>
            ))}
          </div>
          <section className="min-w-0 rounded-xl border border-border bg-muted/20 p-4 md:max-h-[55vh] md:overflow-y-auto" aria-live="polite" aria-label="Résultat du traitement">
            {!selectedId ? <p className="py-6 text-sm text-muted-foreground">Sélectionnez un traitement pour consulter son avancée et son résultat.</p> : (
              <>
                {detailLoading && !selected && <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Chargement du traitement…</p>}
                {detailError && <p role="status" className="mb-3 text-sm text-destructive">{detailError}</p>}
                {selected && (
                  <div className="space-y-4">
                    <h3 className="font-semibold">{label(selected)}</h3>
                    {selectedBatch && <p className="text-sm">{selectedBatch.completed}/{selectedBatch.total} URL réussies · {selectedBatch.failed} en erreur · {selectedBatch.skipped} non lancées.</p>}
                    {selected.analysis_mode === 'scraper_batch' && !terminal(selected) && (
                      <div className="space-y-2">
                        <Button variant="destructive" size="sm" disabled={stoppingId === selected.id || selectedBatch?.stopped} onClick={stopSelectedBatch}>
                          {selectedBatch?.stopped ? 'Arrêt demandé' : stoppingId === selected.id ? 'Demande en cours…' : 'Arrêter les URL restantes'}
                        </Button>
                        <p className="text-xs text-muted-foreground">Les URL déjà acceptées se terminent. Fermer cette fenêtre masque seulement le suivi.</p>
                      </div>
                    )}
                    {!terminal(selected) && !selected.stalled && <p className="text-sm text-muted-foreground">{selected.progress_message || 'Le traitement se poursuit en arrière-plan.'}</p>}
                    {selected.stalled && <p role="status" className="rounded-lg bg-muted p-3 text-sm"><strong>Suivi interrompu, résultat à vérifier.</strong> Les éléments disponibles restent consultables ci-dessous.</p>}
                    {selected.status === 'failed' && <p role="alert" className={'rounded-lg p-3 text-sm ' + (selectedBatch?.stopped ? 'bg-muted' : 'bg-destructive/10 text-destructive')}>{selected.error_message || 'Le traitement n’a pas abouti. Les éléments déjà enregistrés sont conservés.'}</p>}
                    {display?.text && <div className="prose prose-sm max-w-none break-words dark:prose-invert"><ReactMarkdown>{display.text}</ReactMarkdown></div>}
                    {display && display.structured.length > 0 && <details open={!display.text} className="text-sm"><summary className="cursor-pointer font-medium">Données du résultat</summary><pre className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-background p-3 text-xs">{JSON.stringify(display.structured.length === 1 ? display.structured[0] : display.structured, null, 2)}</pre></details>}
                    {selected.status === 'completed' && !display && <p className="text-sm text-muted-foreground">Traitement terminé. Le résultat sera disponible dans un instant.</p>}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
