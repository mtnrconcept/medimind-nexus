import * as React from 'react';
import { ArrowRight, Brain, ChevronDown, ExternalLink, Globe, Loader2, Stethoscope } from 'lucide-react';

/** Structural contract shared with the durable cross-analysis result. */
export interface AgentReview {
  model: string;
  pairModel?: string;
  reviewModel?: string;
  stage: 'pairs' | 'plan' | 'candidate_pairs' | 'final' | 'completed';
  coverage: {
    totalPairs: number;
    reviewedPairs: number;
    webSearchedPairs: number;
    uncertainPairs: number;
    candidatePairs: number;
    reviewedCandidatePairs: number;
  };
  plan?: {
    status: 'review_required' | 'insufficient_context' | 'no_change_supported';
    summary: string;
    globalRisks: string[];
    missingData: string[];
    options: Array<{
      id: string;
      title: string;
      rationale: string;
      expectedBenefits: string[];
      residualRisks: string[];
      monitoring: string[];
      requiredChecks: string[];
      sourceUrls: string[];
      changes: Array<{
        action: 'discuss_replace' | 'discuss_adjust' | 'discuss_add' | 'discuss_withdraw' | 'monitor' | 'maintain';
        target: string;
        replacement: string | null;
        rationale: string;
        sourceUrls: string[];
      }>;
    }>;
  };
}

const stageLabels: Record<AgentReview['stage'], string> = {
  pairs: 'Recherche et analyse des paires',
  plan: 'Préparation des options',
  candidate_pairs: 'Vérification des alternatives',
  final: 'Revue globale',
  completed: 'Revue IA terminée',
};

type PlanOption = NonNullable<AgentReview['plan']>['options'][number];
const actionLabels: Record<PlanOption['changes'][number]['action'], string> = {
  discuss_replace: 'Remplacement à discuter',
  discuss_adjust: 'Ajustement à discuter',
  discuss_add: 'Ajout à discuter',
  discuss_withdraw: 'Arrêt à discuter',
  monitor: 'Surveillance proposée',
  maintain: 'Maintien à réévaluer',
};

const count = (value: number) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
const modelLabel = (model: string | undefined) => /^gpt-6-astra(?:-|$)/i.test(model || '') ? 'GPT-6 Astra' : model || 'Modèle non renseigné';

function SourceLinks({ urls }: { urls: string[] }) {
  const links = new Map<string, string>();
  for (const raw of urls) {
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || url.username || url.password) continue;
      links.set(url.href, url.hostname.replace(/^www\./, ''));
    } catch {
      // A malformed model citation must not become an active browser link.
    }
  }
  if (!links.size) return <p className="text-xs text-muted-foreground">Source de cette proposition non précisée.</p>;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Sources citées</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {[...links].map(([href, hostname], index) => (
          <li key={href} className="min-w-0 max-w-full">
            <a href={href} target="_blank" rel="noopener noreferrer" title={href}
              aria-label={`Ouvrir la source ${index + 1} sur ${hostname} (nouvel onglet)`}
              className="inline-flex max-w-full items-start gap-1 text-xs text-primary underline underline-offset-4 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="break-all">{index + 1}. {hostname}</span>
              <ExternalLink aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReviewList({ title, items, emptyText = 'Informations non précisées dans cette revue.' }: {
  title: string;
  items: string[];
  emptyText?: string;
}) {
  return (
    <div className="min-w-0 space-y-2 rounded-lg bg-muted/40 p-3">
      <h6 className="text-xs font-semibold text-foreground">{title}</h6>
      {items.length ? (
        <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
          {items.map((item, index) => <li key={`${index}-${item}`} className="break-words">{item}</li>)}
        </ul>
      ) : <p className="text-xs leading-relaxed text-muted-foreground">{emptyText}</p>}
    </div>
  );
}

function TherapeuticOption({ option, index, provisional }: { option: PlanOption; index: number; provisional: boolean }) {
  return (
    <details open={index === 0} className="group overflow-hidden rounded-xl border bg-background">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary" aria-hidden="true">{index + 1}</span>
        <span className="min-w-0 flex-1 break-words text-sm font-semibold">{option.title}</span>
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{provisional ? 'Provisoire' : 'À valider'}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="space-y-4 border-t px-4 py-4">
        <p className="break-words whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{option.rationale}</p>
        {option.changes.length > 0 && (
          <div className="space-y-2">
            <h6 className="text-xs font-semibold">Éléments du schéma proposé</h6>
            <ul className="space-y-2">
              {option.changes.map((change, changeIndex) => (
                <li key={`${changeIndex}-${change.target}`} className="min-w-0 space-y-2 rounded-lg border-l-2 border-primary/40 bg-muted/30 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{actionLabels[change.action]}</p>
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span className="min-w-0 break-words">{change.target}</span>
                    {change.replacement && <>
                      <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                      <span className="sr-only">Remplacement envisagé par</span>
                      <span className="min-w-0 break-words">{change.replacement}</span>
                    </>}
                  </div>
                  <p className="break-words text-xs leading-relaxed text-muted-foreground">{change.rationale}</p>
                  <SourceLinks urls={change.sourceUrls} />
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <ReviewList title="Bénéfices attendus" items={option.expectedBenefits} emptyText="Bénéfice non établi dans cette revue." />
          <ReviewList title="Risques résiduels" items={option.residualRisks} emptyText="Risques non renseignés : à vérifier lors de la validation." />
          <ReviewList title="Surveillance proposée" items={option.monitoring} />
          <ReviewList title="Vérifications nécessaires" items={option.requiredChecks} />
        </div>
        <SourceLinks urls={option.sourceUrls} />
      </div>
    </details>
  );
}

export function AgentCrossAnalysisPanel({ review }: { review: AgentReview }) {
  const headingId = React.useId();
  const total = count(review.coverage.totalPairs);
  const examined = count(review.coverage.reviewedPairs);
  const searched = count(review.coverage.webSearchedPairs);
  const uncertain = count(review.coverage.uncertainPairs);
  const candidates = count(review.coverage.candidatePairs);
  const checkedCandidates = count(review.coverage.reviewedCandidatePairs);
  const covered = total > 0 && examined >= total && searched >= total && checkedCandidates >= candidates;
  const completed = review.stage === 'completed' && covered;
  const provisional = !completed;
  const stageLabel = review.stage === 'completed' && !covered ? 'Couverture incomplète' : stageLabels[review.stage];
  const modelName = modelLabel(review.model);
  const plan = review.plan;
  const progress = total > 0 ? Math.min(100, examined / total * 100) : 0;

  return (
    <section aria-labelledby={headingId} className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-primary/5 px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
            <Brain aria-hidden="true" className="h-5 w-5" />
          </span>
          <div>
            <h4 id={headingId} className="text-sm font-semibold">Analyse croisée par agent IA</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">OpenAI · {modelName}</p>
            {(review.pairModel || review.reviewModel) && <p className="mt-1 text-xs text-muted-foreground">
              {[review.pairModel ? `Relations : ${modelLabel(review.pairModel)}` : '',
                review.reviewModel ? `Revue : ${modelLabel(review.reviewModel)}` : ''].filter(Boolean).join(' · ')}
            </p>}
          </div>
        </div>
        <p role="status" aria-live="polite" className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {review.stage !== 'completed' && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 motion-safe:animate-spin" />}
          {stageLabel}
        </p>
      </div>

      <div className="space-y-4 p-4">
        <div className="space-y-3">
          <h5 className="text-xs font-semibold">Couverture de la sélection</h5>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Paires examinées', `${examined} / ${total}`],
              ['Paires avec recherche web', `${searched} / ${total}`],
              ['Paires incertaines', String(uncertain)],
              ['Vérifications des alternatives', `${checkedCandidates} / ${candidates}`],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-lg bg-muted/40 px-3 py-2.5">
                <dt className="text-[11px] leading-snug text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-base font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div role="progressbar" aria-label="Couverture des paires de la sélection" aria-valuemin={0}
            aria-valuemax={Math.max(1, total)} aria-valuenow={Math.min(examined, total)}
            aria-valuetext={`${examined} sur ${total} paires examinées`}
            className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
          </div>
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
            <Globe aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Une recherche sans lien établi ne prouve pas l’absence de risque. Les incertitudes restent visibles dans la revue.
          </p>
        </div>

        {plan ? (
          <div className="space-y-4 border-t pt-4">
            <div className="space-y-2">
              <h5 className="text-sm font-semibold">Schéma thérapeutique à discuter</h5>
              {provisional && <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
                <strong>Options provisoires.</strong> La couverture et la revue des alternatives doivent être terminées avant d’évaluer ces propositions.
              </p>}
              {plan.status === 'insufficient_context' && <p className="text-xs font-medium text-amber-800 dark:text-amber-200">Contexte clinique incomplet : les données manquantes doivent être précisées.</p>}
              {plan.status === 'no_change_supported' && <p className="text-xs font-medium text-muted-foreground">Aucune modification suffisamment étayée dans cette revue.</p>}
              <p className="break-words whitespace-pre-line text-sm leading-relaxed">{plan.summary}</p>
            </div>
            {(plan.globalRisks.length > 0 || plan.missingData.length > 0) && (
              <div className="grid gap-3 sm:grid-cols-2">
                {plan.globalRisks.length > 0 && <ReviewList title="Risques à prendre en compte" items={plan.globalRisks} />}
                {plan.missingData.length > 0 && <ReviewList title="Données manquantes" items={plan.missingData} />}
              </div>
            )}
            {plan.options.map((option, index) => <TherapeuticOption key={option.id} option={option} index={index} provisional={provisional} />)}
          </div>
        ) : <p className="border-t pt-4 text-sm text-muted-foreground">
          {completed ? 'Aucune proposition thérapeutique disponible dans cette revue.' : 'Les options thérapeutiques apparaîtront après l’examen de la sélection.'}
        </p>}

        <p className="flex items-start gap-2 border-t pt-3 text-xs leading-relaxed text-muted-foreground">
          <Stethoscope aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          Validation médicale requise avant toute modification de traitement, selon le contexte clinique et les sources citées.
        </p>
      </div>
    </section>
  );
}
