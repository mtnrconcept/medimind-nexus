import { useEffect, useReducer, useRef, useState } from 'react';
import { BookOpen, Download, ExternalLink, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import ResearchNotebook from '@/components/nexus/ResearchNotebook';
import { createNotebook, downloadJson, MAX_NOTEBOOK_ITEMS, notebookReducer, recordKey } from '@/lib/researchNotebook';
import SpecialistResources from '@/components/nexus/SpecialistResources';
import MedicalLibraryPanel from '@/components/nexus/MedicalLibraryPanel';
import type { EvidenceRecord, EvidenceReport, ResearchMode, ResearchQuery } from '../../../supabase/functions/scientific-evidence/contract';

const modes: Record<ResearchMode, { label: string; example: string }> = {
  disease: { label: 'Maladie', example: 'nephrotic syndrome' },
  gene: { label: 'Gène', example: 'NPHS1' },
  drug: { label: 'Médicament', example: 'rituximab' },
};

const kindLabels: Record<EvidenceRecord['kind'], string> = {
  publication: 'Publication', trial: 'Essai enregistré', association: 'Association',
  protein: 'Protéine', compound: 'Composé', gene: 'Gène', disease: 'Entité clinique',
  pathway: 'Voie biologique', structure: 'Structure', variant: 'Variant',
};

const statusLabels: Record<EvidenceReport['sources'][number]['status'], string> = {
  matched: 'Références trouvées', empty: 'Aucun résultat', unavailable: 'Indisponible',
};

function SourceLink({ url, label }: { url: string; label: string }) {
  if (!url.startsWith('https://')) return <span>{label}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-baseline gap-1 break-words text-primary hover:underline">
      <span>{label}</span><ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
    </a>
  );
}

function ReportView({ report, onSearch, retained, onRetain }: {
  report: EvidenceReport;
  onSearch: (query: ResearchQuery) => void;
  retained: Set<string>;
  onRetain: (record: EvidenceRecord) => void;
}) {
  const firstMatch = report.sources.find(source => source.status === 'matched');
  const listedIds = new Set(report.sources.flatMap(source => source.records.map(record => record.id)));
  return (
    <section className="mt-6 space-y-4 border-t pt-5" aria-label="Résultats de recherche scientifique">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-semibold">{modes[report.query.mode].label} · {report.query.term}</h3>
          {report.resolvedTerm && <p className="text-xs text-muted-foreground">Terme de recherche normalisé : <strong>{report.resolvedTerm}</strong>. Le terme original est conservé.</p>}
          <p className="text-sm text-muted-foreground">Sources interrogées le <time dateTime={report.retrievedAt}>{new Date(report.retrievedAt).toLocaleString('fr-CH')}</time></p>
        </div>
        <Button variant="outline" size="sm" onClick={() => downloadJson(report, `medicore-recherche-${report.query.mode}-${report.retrievedAt.slice(0, 10)}.json`)}>
          <Download className="mr-2 h-4 w-4" /> Exporter le dossier JSON
        </Button>
      </div>
      <p className="rounded-lg bg-muted p-3 text-sm">
        Une association biologique suggère une hypothèse. Pour évaluer un effet thérapeutique, examinez la population,
        le comparateur, le critère principal et les résultats publiés. Un essai enregistré et une publication liée peuvent
        décrire les mêmes participants. Une citation peut aussi renvoyer à des travaux de contexte.
      </p>
      <div className="space-y-3">
        {report.sources.map(source => (
          <details key={source.name} open={source === firstMatch} className="rounded-lg border">
            <summary className="cursor-pointer px-3 py-3 text-sm leading-6">
              <span className="font-semibold">{source.name}</span>
              <span className="ml-2 text-muted-foreground">{statusLabels[source.status]}{source.status === 'matched' && ` (${source.records.length})`}</span>
            </summary>
            {source.status === 'matched' ? (
              <ul className="divide-y border-t">
                {source.records.map(record => (
                  <li key={record.id} className="min-w-0 space-y-1 px-3 py-3 text-sm">
                    <p className="break-words text-xs text-muted-foreground">{kindLabels[record.kind]} · {record.id}</p>
                    <p className="font-medium"><SourceLink url={record.url} label={record.title} /></p>
                    {record.detail && <p className="break-words">{record.detail}</p>}
                    {record.related?.length > 0 && (
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                        <span className="text-muted-foreground">Références liées</span>
                        {record.related.map(link => (
                          <span key={link.id}>
                            <SourceLink url={link.url} label={link.id} />
                            {listedIds.has(link.id) && ' (déjà présente dans ce dossier)'}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" disabled={retained.has(recordKey(record)) || retained.size >= MAX_NOTEBOOK_ITEMS}
                        onClick={() => onRetain(record)}>
                        {retained.has(recordKey(record)) ? 'Au carnet' : retained.size >= MAX_NOTEBOOK_ITEMS ? 'Carnet plein' : 'Ajouter au carnet'}
                      </Button>
                      {record.followUp && (
                        <Button size="sm" variant="outline" className="h-auto max-w-full whitespace-normal text-left"
                          onClick={() => record.followUp && onSearch(record.followUp)}>
                          Explorer · {modes[record.followUp.mode].label} · {record.followUp.term}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 pb-3 text-sm text-muted-foreground">
                {source.status === 'empty'
                  ? 'La source a répondu sans correspondance pour cette requête.'
                  : 'La source n’a pas pu être interrogée. Son contenu reste inconnu.'}
              </p>
            )}
          </details>
        ))}
      </div>
      {report.sources.some(source => source.status === 'unavailable') && (
        <Button variant="outline" size="sm" onClick={() => onSearch(report.query)}>Relancer cette recherche</Button>
      )}
    </section>
  );
}

export default function ScientificEvidencePanel() {
  const [notebook, dispatch] = useReducer(notebookReducer, undefined, createNotebook);
  const [mode, setMode] = useState<ResearchMode>('disease');
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<EvidenceReport | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);

  function clearResults() {
    activeRequest.current?.abort();
    setLoading(false);
    setError('');
    setReport(null);
  }

  async function search(query: ResearchQuery) {
    clearResults();
    setMode(query.mode);
    setTerm(query.term);
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    try {
      const { data, error: serviceError } = await supabase.functions.invoke<EvidenceReport>('scientific-evidence', {
        body: { mode: query.mode, term: query.term }, signal: controller.signal, timeout: 45000,
      });
      if (controller.signal.aborted) return;
      if (serviceError || data?.schemaVersion !== 1 || data.query?.mode !== query.mode ||
          data.query.term !== query.term.trim().replace(/ +/g, ' ') || !Array.isArray(data.sources) || !data.sources.length) {
        const status = serviceError?.context?.status;
        setError(status === 401 || status === 403
          ? 'Votre session ne permet pas cette recherche. Reconnectez-vous puis réessayez.'
          : status === 400
            ? 'Le terme est refusé. Utilisez un seul nom scientifique public ou un identifiant reconnu.'
            : 'Le service de recherche n’a pas retourné de dossier exploitable. Vous pouvez réessayer.');
        return;
      }
      setReport(data);
      dispatch({ type: 'refresh', report: data });
    } catch {
      if (!controller.signal.aborted) setError('La connexion a été interrompue. Vous pouvez relancer la recherche.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <section aria-labelledby="scientific-evidence-heading" className="mb-8 rounded-2xl border bg-card p-4 text-card-foreground shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><BookOpen className="h-5 w-5" aria-hidden="true" /></div>
        <div>
          <h2 id="scientific-evidence-heading" className="text-xl font-semibold">Recherche scientifique sourcée</h2>
          <p className="mt-1 text-sm text-muted-foreground">Consultez les registres et les publications associés à un terme biomédical. Chaque référence renvoie à sa source.</p>
        </div>
      </div>
      <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); void search({ mode, term: term.trim() }); }}>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Objet de la recherche</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(modes) as ResearchMode[]).map(key => (
              <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <input type="radio" name="scientific-research-mode" value={key} checked={mode === key} onChange={() => { clearResults(); setMode(key); setTerm(''); }} />
                {modes[key].label}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label className="text-sm font-medium" htmlFor="scientific-research-term">Nom scientifique ou identifiant public</label>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row">
            <Input id="scientific-research-term" value={term} minLength={2} maxLength={120} required autoComplete="off"
              placeholder={`Ex. ${modes[mode].example}`} aria-describedby="scientific-query-privacy"
              onChange={event => { clearResults(); setTerm(event.target.value); }} />
            <Button type="submit" disabled={loading || term.trim().length < 2}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              {loading ? 'Recherche en cours…' : error ? 'Réessayer' : 'Rechercher'}
            </Button>
          </div>
          <p id="scientific-query-privacy" className="mt-2 text-xs text-muted-foreground">
            Le terme saisi est transmis aux sources scientifiques externes. Utilisez un terme public, sans nom de patient, date de naissance ni extrait de dossier.
          </p>
        </div>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
      <p role="status" className="sr-only">{loading ? 'Recherche en cours.' : report ? `Dossier disponible pour ${report.query.term}.` : ''}</p>
      <a href="#research-notebook-heading" className="mt-3 inline-block text-sm text-primary hover:underline">Voir le carnet d’hypothèse ({notebook.items.length})</a>
      {report && <ReportView key={report.retrievedAt} report={report} onSearch={search} retained={new Set(notebook.items.map(item => item.key))}
        onRetain={record => dispatch({ type: 'retain', report, record })} />}
      <MedicalLibraryPanel onResearch={query => { void search(query); }} />
      <ResearchNotebook notebook={notebook} dispatch={dispatch} />
      <SpecialistResources />
    </section>
  );
}
