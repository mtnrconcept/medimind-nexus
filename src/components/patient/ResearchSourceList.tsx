import React from 'react';

export interface ResearchCitation {
  title: string;
  url: string;
  abstract?: string;
  pmid?: string;
  provider?: string;
  journal?: string;
  year?: string;
  publicationTypes?: string[];
  abstractTruncated?: boolean;
}

export interface ResearchTrace {
  scopeNotes?: string[];
  providers?: { name: string; status: string; count?: number; query?: string }[];
}

function sourceURL(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch { /* Invalid legacy sources remain readable as plain text. */ }
}

/** Keep the original bibliographic content inspectable without inventing a quality grade. */
export function ResearchSourceList({ sources, className = '' }: { sources: ResearchCitation[]; className?: string }) {
  return <ol className={`space-y-3 ${className}`}>
    {sources.filter(Boolean).map((source, index) => {
      const url = sourceURL(source.url);
      const title = source.title || 'Référence sans titre';
      const metadata = [source.provider, source.journal, source.year, source.pmid ? `PMID ${source.pmid}` : null]
        .filter(value => typeof value === 'string' && value.trim());
      const types = (source.publicationTypes ?? []).filter(value => typeof value === 'string' && value.trim());
      return <li key={`${source.url}:${index}`} className="min-w-0 rounded-lg border bg-background/60 p-3 text-sm">
        {url ? <a href={url} target="_blank" rel="noopener noreferrer"
          className="break-words font-medium text-primary underline decoration-primary/40 underline-offset-2 focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
          {title}
        </a> : <span className="break-words font-medium">{title}</span>}
        {metadata.length > 0 && <p className="mt-1 break-words text-xs text-muted-foreground">{metadata.join(' · ')}</p>}
        {types.length > 0 && <p className="mt-1 break-words text-xs text-muted-foreground">Type de publication : {types.join(', ')}</p>}
        {source.abstract && <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
            Lire le résumé disponible
          </summary>
          <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">{source.abstract}</p>
          {source.abstractTruncated && <p className="mt-2 text-xs text-muted-foreground">
            Résumé abrégé lors de la récupération ; consulter la publication pour le texte complet.
          </p>}
        </details>}
      </li>;
    })}
  </ol>;
}

export function ResearchTraceDetails({ scopeNotes = [], providers = [] }: ResearchTrace) {
  if (!scopeNotes.length && !providers.some(provider => provider.query)) return null;
  return <details className="mb-3 text-xs text-muted-foreground">
    <summary className="cursor-pointer font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
      Requêtes exécutées et limites de recherche
    </summary>
    <ul className="mt-2 space-y-2">
      {providers.filter(provider => provider.query).map((provider, index) => <li key={`${provider.name}:${index}`} className="break-words">
        <span className="font-medium">{provider.name}</span> : {provider.query}
        {provider.status === 'unavailable' && ' — source indisponible'}
        {provider.status === 'empty' && ' — aucun résultat exploitable'}
      </li>)}
      {scopeNotes.map((note, index) => <li key={index} className="break-words">{note}</li>)}
    </ul>
  </details>;
}
