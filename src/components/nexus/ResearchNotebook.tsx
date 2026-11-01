import { useState, type Dispatch } from 'react';
import { Download, NotebookPen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { downloadJson, exportNotebook, MAX_NOTEBOOK_ITEMS, NOTEBOOK_TEXT_LIMIT, roleLabels, type Notebook, type NotebookAction } from '@/lib/researchNotebook';

export default function ResearchNotebook({ notebook, dispatch }: { notebook: Notebook; dispatch: Dispatch<NotebookAction> }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const hasContent = Boolean(notebook.items.length || notebook.hypothesis || notebook.refutationCriterion);
  const fields = [
    { key: 'hypothesis', label: 'Hypothèse à tester', hint: 'Dans quelle population, quelle intervention devrait produire quel effet, par rapport à quel comparateur ?' },
    { key: 'refutationCriterion', label: 'Critère qui réfuterait l’hypothèse', hint: 'Précisez un résultat mesurable, un seuil et un délai qui vous conduiraient à écarter cette hypothèse.' },
  ] as const;

  function exportDossier() {
    const timestamp = new Date().toISOString();
    downloadJson(exportNotebook(notebook, timestamp), `medicore-carnet-${timestamp.slice(0, 10)}.json`);
  }

  return (
    <section aria-labelledby="research-notebook-heading" className="mt-6 space-y-4 border-t pt-5">
      <div>
        <h3 id="research-notebook-heading" className="flex items-center gap-2 text-lg font-semibold">
          <NotebookPen className="h-5 w-5 text-primary" aria-hidden="true" /> Carnet d’hypothèse
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Gardez vos références en passant d’une maladie à un gène ou à un médicament. Le carnet reste en mémoire
          tant que cette page est ouverte. Exportez-le avant de la quitter. Saisissez uniquement des informations publiques.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {fields.map(field => (
          <div key={field.key}>
            <label htmlFor={'notebook-' + field.key} className="text-sm font-medium">{field.label}</label>
            <Textarea id={'notebook-' + field.key} value={notebook[field.key]} maxLength={NOTEBOOK_TEXT_LIMIT}
              className="mt-1" rows={3} placeholder={field.hint}
              onChange={event => dispatch({ type: 'field', field: field.key, value: event.target.value })} />
          </div>
        ))}
      </div>
      <div>
        <h4 className="text-sm font-semibold">Références retenues · {notebook.items.length} / {MAX_NOTEBOOK_ITEMS}</h4>
        <p className="mt-1 text-xs text-muted-foreground">Vous attribuez vous-même le rôle de chaque référence. Les liens entre un essai et ses publications restent visibles.</p>
        {!notebook.items.length && <p className="mt-2 text-sm">Utilisez « Ajouter au carnet » sur une référence pour la comparer aux autres.</p>}
        <ul className="mt-2 space-y-2">
          {notebook.items.map(item => {
            const first = item.provenance[0].record;
            return (
              <li key={item.key} className="space-y-2 rounded-lg border p-3 text-sm">
                <p className="break-words font-medium">{first.title}</p>
                <p className="break-words text-xs text-muted-foreground">{first.id}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex flex-wrap items-center gap-2">
                    Mon appréciation
                    <select value={item.role} className="max-w-full rounded-md border bg-background p-2"
                      onChange={event => dispatch({ type: 'role', key: item.key, role: event.target.value as keyof typeof roleLabels })}>
                      {Object.entries(roleLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </label>
                  <Button variant="ghost" size="sm" onClick={() => dispatch({ type: 'remove', key: item.key })}>Retirer</Button>
                </div>
                <details>
                  <summary className="cursor-pointer text-sm">Provenance et liens ({item.provenance.length})</summary>
                  <ul className="mt-2 space-y-2 border-l pl-3">
                    {item.provenance.map(origin => (
                      <li key={JSON.stringify([origin.source, origin.query, origin.retrievedAt])} className="break-words">
                        <p><a href={origin.record.url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{origin.source}</a> · {origin.query.term} · <time dateTime={origin.retrievedAt}>{new Date(origin.retrievedAt).toLocaleString('fr-CH')}</time></p>
                        <p className="text-xs text-muted-foreground">{origin.record.detail}</p>
                        {origin.record.related?.map(link => <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="mr-3 text-xs text-primary hover:underline">{link.id}</a>)}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={!hasContent} onClick={exportDossier}><Download className="mr-2 h-4 w-4" /> Exporter le carnet JSON</Button>
        {!confirmReset ? (
          <Button variant="ghost" size="sm" disabled={!hasContent} onClick={() => setConfirmReset(true)}>Vider le carnet</Button>
        ) : (
          <>
            <Button variant="destructive" size="sm" onClick={() => { dispatch({ type: 'reset' }); setConfirmReset(false); }}>Confirmer l’effacement</Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmReset(false)}>Annuler</Button>
          </>
        )}
      </div>
    </section>
  );
}
