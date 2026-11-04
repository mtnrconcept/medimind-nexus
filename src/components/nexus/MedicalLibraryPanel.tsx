import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ExternalLink, Languages, Loader2, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { filterMedicalGlossary, filterResearchSkills, librarySearchAlias, type LibraryPaper } from '@/lib/medicalLibrary';
import type { ResearchQuery } from '../../../supabase/functions/scientific-evidence/contract';

type Props = { onResearch: (query: ResearchQuery) => void };
const PAGE_SIZE = 24;

export default function MedicalLibraryPanel({ onResearch }: Props) {
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [papers, setPapers] = useState<LibraryPaper[]>([]);
  const [total, setTotal] = useState(0);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState('');
  const skills = useMemo(() => filterResearchSkills(query), [query]);
  const glossary = useMemo(() => filterMedicalGlossary(query), [query]);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(async () => {
      setBusy(true);
      setError('');
      try {
        const { data, error: serviceError } = await supabase.rpc('search_discovery_literature' as never,
          { p_query: query.trim().slice(0, 120), p_alias: librarySearchAlias(query), p_limit: PAGE_SIZE, p_offset: offset } as never);
        if (!alive) return;
        if (serviceError) throw serviceError;
        const rows = (data ?? []) as unknown as LibraryPaper[];
        if (!Array.isArray(rows)) throw new Error('Réponse incorrecte');
        setPapers(rows);
        setTotal(rows[0]?.total_count ?? 0);
      } catch {
        if (alive) {
          setPapers([]);
          setTotal(0);
          setError('La bibliothèque locale est momentanément indisponible. Les ressources scientifiques restent accessibles ci-dessus.');
        }
      } finally { if (alive) setBusy(false); }
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, offset]);

  async function translatePage() {
    const pending = papers.filter(p => !p.title_fr && !translations[p.id]).slice(0, 24);
    if (!pending.length) return;
    setTranslating(true);
    try {
      // Only PUBLIC bibliographic titles; never send a patient note or the search query.
      const { data, error: serviceError } = await supabase.functions.invoke<{
        translations: string[]; details?: { translated: string; detectedLang: string }[]
      }>('translate', { body: { texts: pending.map(p => p.title), targetLang: 'fr' } });
      if (serviceError || !Array.isArray(data?.translations) || data.translations.length !== pending.length) {
        throw new Error('Traduction indisponible');
      }
      setTranslations(prev => ({
        ...prev,
        ...Object.fromEntries(pending.flatMap((paper, i) => {
          const translated = data.translations[i];
          const language = data.details?.[i]?.detectedLang;
          return typeof translated === 'string' && translated.trim() &&
            !['error','unknown'].includes(language ?? '') && translated.trim() !== paper.title
            ? [[paper.id, translated.trim()]] : [];
        })),
      }));
    } catch {
      setError('Traduction automatique temporairement indisponible. Les titres originaux restent consultables.');
    } finally { setTranslating(false); }
  }

  return (
    <section aria-labelledby="medicore-library-title" className="mt-6 space-y-4 rounded-2xl border bg-muted/20 p-4 sm:p-5">
      <header>
        <h3 id="medicore-library-title" className="flex items-center gap-2 text-lg font-semibold">
          <BookOpen className="h-5 w-5 text-primary" /> Bibliothèque scientifique et compétences de recherche
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">Notices PubMed/Europe PMC vérifiables, lexique français–anglais et méthodes de recherche. L’intitulé traduit automatiquement n’est pas validé médicalement.</p>
      </header>
      <div>
        <label htmlFor="medical-library-search" className="text-sm font-medium">Rechercher un terme médical, un PMID ou une compétence</label>
        <div className="mt-1 flex items-center gap-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input id="medical-library-search" value={query} maxLength={120} autoComplete="off"
            placeholder="Ex. syndrome néphrotique, varicelle, GRADE, NPHS1…"
            onChange={event => { setQuery(event.target.value); setOffset(0); }} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Recherche locale, insensible aux accents. Les alias français/anglais connus sont inclus ; les termes inconnus ne sont pas inventés.</p>
      </div>
      {error && <p role="status" className="rounded-md bg-background p-3 text-sm text-destructive">{error}</p>}
      <div className="rounded-lg border bg-card p-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4" /> Méthodes et compétences ({skills.length})</h4>
        <p className="mt-1 text-xs text-muted-foreground">Ces méthodes guident la consultation des sources ; ce ne sont pas des plugins externes exécutés.</p>
        <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
          {skills.map(skill => (
            <article key={skill.id} className="space-y-1 rounded-lg border p-3">
              <h5 className="text-sm font-semibold">{skill.title}</h5>
              <p className="text-xs text-muted-foreground">{skill.description}</p>
              <p className="text-xs">À vérifier : {skill.verification}</p>
              <Button variant="outline" size="sm" className="mt-1 h-auto whitespace-normal text-left"
                onClick={() => onResearch({ mode: skill.mode, term: skill.example })}>
                Explorer « {skill.example} »
              </Button>
            </article>
          ))}
          {!skills.length && <p className="p-2 text-sm text-muted-foreground">Aucune méthode correspondante.</p>}
        </div>
      </div>
      <div className="rounded-lg border bg-card p-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold"><Languages className="h-4 w-4" /> Lexique médical bilingue</h4>
        <div className="mt-2 flex max-h-36 flex-wrap gap-2 overflow-y-auto">
          {glossary.map((word, index) => (
            <span key={index} className="rounded-md border bg-muted/40 px-2 py-1 text-xs" title={word.aliases.join(', ')}>
              {word.fr} <span className="text-muted-foreground">· {word.en}</span>
            </span>
          ))}
          {!glossary.length && <p className="text-xs text-muted-foreground">Terme non répertorié dans le lexique vérifié.</p>}
        </div>
      </div>
      <div className="space-y-3 rounded-lg border bg-card p-3" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Publications indexées {busy ? '· recherche…' : total ? `· ${total} résultat(s)` : ''}</h4>
          <Button size="sm" variant="outline" onClick={() => void translatePage()} disabled={busy || translating || papers.every(p => Boolean(p.title_fr || translations[p.id]))}>
            {translating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Languages className="mr-1 h-4 w-4" />}
            Traduire les titres visibles
          </Button>
        </div>
        {busy && <p className="text-xs text-muted-foreground">Chargement de la bibliothèque…</p>}
        {!busy && papers.length === 0 && !error && <p className="text-xs text-muted-foreground">Aucune publication indexée pour cette requête. Cela ne démontre pas l’absence de preuves.</p>}
        <ol className="max-h-[580px] space-y-2 overflow-y-auto">
          {papers.map(paper => {
            const french = paper.title_fr || translations[paper.id];
            return (
              <li key={paper.id} className="space-y-1 rounded-md border p-3 text-sm">
                <a target="_blank" rel="noopener noreferrer" href={'https://pubmed.ncbi.nlm.nih.gov/' + paper.pmid + '/'}
                  className="inline-flex items-start gap-1 font-medium text-primary hover:underline">
                  {french || paper.title} <ExternalLink className="mt-1 h-3 w-3 shrink-0" />
                </a>
                {french && <p className="text-xs text-muted-foreground">Original : {paper.title}</p>}
                <p className="text-xs text-muted-foreground">
                  PMID {paper.pmid} · {paper.journal || 'Revue non précisée'} · {paper.publication_date?.slice(0,4) || 'Date inconnue'}
                  {paper.topic_fr && ' · ' + paper.topic_fr}
                  {french && ' · traduction automatique à vérifier'}
                </p>
              </li>
            );
          })}
        </ol>
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-end gap-2 border-t pt-2 text-xs">
            <span>{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total}</span>
            <Button size="sm" variant="outline" disabled={offset === 0 || busy}
              onClick={() => setOffset(n => Math.max(0, n - PAGE_SIZE))}>Précédent</Button>
            <Button size="sm" variant="outline" disabled={offset + PAGE_SIZE >= total || busy}
              onClick={() => setOffset(n => n + PAGE_SIZE)}>Suivant</Button>
          </div>
        )}
      </div>
    </section>
  );
}
