import { useId, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ClinicalPatientProfile, Component, RankedPatientMatch } from '@/lib/patientSimilarity/clinicalSimilarity';
import type { ConditionComparison, ConditionOccurrence } from '@/lib/patientSimilarity/comparisonEvidence';
import { finiteNumber, formatNumber, formatRecordedDate, measurementTimestamp } from '@/lib/patientSimilarity/comparisonFacts';
import { describeMeasurementState, type Measurement, type MeasurementComparison, type MeasurementSide } from '@/lib/patientSimilarity/measurementComparison';

const rounded = (value: number) => value.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const percent = (value: number) => `${rounded(value * 100)} %`;
const notRecorded = <span className="text-muted-foreground">Non renseigné dans ce dossier</span>;
const conditionTypes: Record<string, string> = { disease: 'Maladie', surgery: 'Chirurgie', hospitalization: 'Hospitalisation', injury: 'Traumatisme', other: 'Autre antécédent' };
const rules: Record<Component, { name: string; explanation: string }> = {
  coDiagnoses: { name: 'Diagnostics associés', explanation: 'Identifiants communs / identifiants distincts des deux dossiers. La pathologie sélectionnée est exclue.' },
  medicalHistory: { name: 'Antécédents', explanation: 'Libellés complets et types communs / éléments distincts. Un antécédent sélectionné est retiré de cette dimension.' },
  medications: { name: 'Traitements', explanation: 'Substances communes / substances distinctes ; à défaut, code ATC puis identifiant. Doses, durées et statut actif sont présentés en contexte, sans entrer dans ce score.' },
  laboratory: { name: 'Biologie', explanation: 'Moyenne des proximités numériques : max(0 ; 1 − |A − B| / max(|A|, |B|)). Deux zéros donnent 100 %. Même libellé et même unité requis ; dernière paire datée sans ambiguïté. Les références ne remplacent pas les valeurs.' },
  symptoms: { name: 'Symptômes', explanation: 'Identifiants communs / identifiants distincts. Dates de début, intensité et résolution sont présentées en contexte.' },
  chronology: { name: 'Chronologie', explanation: 'Pour les antécédents communs datés avant ou à la date du diagnostic comparé : moyenne de max(0 ; 1 − écart des délais / 3 650 jours). Première date renseignée par antécédent ; les événements ultérieurs restent visibles mais sont exclus du score chronologique.' },
  age: { name: 'Proximité d’âge', explanation: 'max(0 ; 1 − différence d’âge / 40 ans), uniquement si les deux âges sont renseignés. L’âge au début de la maladie n’est pas déduit.' },
};

function EvidenceTable({ label, sourceCode, peerCode, children, lastColumn = 'Concordance et écarts' }: {
  label: string; sourceCode: string; peerCode: string; children: ReactNode; lastColumn?: string;
}) {
  return (
    <div className="max-h-[480px] overflow-auto rounded-lg border focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" role="region" aria-label={label} tabIndex={0}>
      <table className="w-full min-w-[720px] table-fixed text-left text-xs">
        <caption className="sr-only">{label}</caption>
        <thead className="sticky top-0 z-10 bg-muted text-foreground shadow-sm">
          <tr>
            <th scope="col" className="w-[20%] p-3 font-semibold">Élément documenté</th>
            <th scope="col" className="w-[28%] p-3 font-semibold">Dossier actuel <span className="block break-words font-normal text-muted-foreground">{sourceCode}</span></th>
            <th scope="col" className="w-[28%] p-3 font-semibold">Dossier comparé <span className="block break-words font-normal text-muted-foreground">{peerCode}</span></th>
            <th scope="col" className="w-[24%] p-3 font-semibold">{lastColumn}</th>
          </tr>
        </thead>
        <tbody className="[&_td]:p-3 [&_td]:align-top [&_td]:break-words [&_th]:break-words [&_tr]:border-t">{children}</tbody>
      </table>
    </div>
  );
}

function ConditionDates({ occurrences, showOffset }: { occurrences: ConditionOccurrence[]; showOffset: boolean }) {
  if (!occurrences.length) return notRecorded;
  return <ul className="space-y-3">{occurrences.map((o, i) => (
    <li key={i} className="space-y-1">
      <p className="font-semibold">{formatRecordedDate(o.date)}</p>
      <p>{o.name}</p>
      <p className="text-muted-foreground">{o.origin}{o.conditionType ? ` · ${conditionTypes[o.conditionType] ?? o.conditionType}` : ''}</p>
      {showOffset && o.daysFromIndex !== null && <p className="text-primary">
        {o.daysFromIndex === 0 ? 'Même date que le diagnostic comparé' : `${formatNumber(Math.abs(o.daysFromIndex))} jours ${o.daysFromIndex < 0 ? 'avant' : 'après'} le diagnostic comparé`}
      </p>}
    </li>
  ))}</ul>;
}

function ConditionRow({ row, recordedLabel }: { row: ConditionComparison; recordedLabel: boolean }) {
  const both = row.source.length > 0 && row.peer.length > 0;
  return <tr className={row.kind === 'selected' ? 'bg-primary/5' : undefined}>
    <th scope="row" className="p-3 align-top font-medium">
      {row.name}
      <span className="mt-1 block text-xs font-normal text-muted-foreground">{row.kind === 'selected' ? 'Pathologie comparée' : row.kind === 'diagnosis' ? 'Diagnostic du catalogue' : 'Antécédent personnel'}</span>
    </th>
    <td><ConditionDates occurrences={row.source} showOffset={row.kind !== 'selected'} /></td>
    <td><ConditionDates occurrences={row.peer} showOffset={row.kind !== 'selected'} /></td>
    <td>{both ? <>
      <p className="font-medium text-primary">Documenté dans les deux dossiers</p>
      <p className="mt-1 text-muted-foreground">{row.kind === 'history' ? 'Même libellé complet et même type d’antécédent.' : row.kind === 'selected' && recordedLabel ? 'Même libellé complet ; confirmation diagnostique à vérifier.' : 'Même identifiant du catalogue.'}</p>
    </> : <p className="text-muted-foreground">Renseigné uniquement dans le dossier {row.source.length ? 'actuel' : 'comparé'}. Cela ne permet pas de conclure à son absence dans l’autre dossier.</p>}</td>
  </tr>;
}

function measurementDate(raw: string | null | undefined): string {
  const timestamp = measurementTimestamp(raw);
  if (timestamp === null || !raw?.includes('T')) return formatRecordedDate(raw);
  return `${new Date(timestamp).toLocaleString('fr-FR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })} UTC`;
}

function MeasurementValue({ record, laboratory }: { record: Measurement; laboratory: boolean }) {
  const min = record.referenceMin, max = record.referenceMax;
  return <div className="space-y-1">
    <p className="font-semibold tabular-nums">{finiteNumber(record.value) ? formatNumber(record.value) : 'Valeur non renseignée ou inexploitable'}{record.unit ? ` ${record.unit}` : ' · unité non renseignée'}</p>
    <p className="text-muted-foreground">{measurementDate(record.measuredAt)}</p>
    {laboratory && <>
      <p>Références : {finiteNumber(min) && finiteNumber(max) ? `${formatNumber(min)} à ${formatNumber(max)}` : finiteNumber(min) ? `≥ ${formatNumber(min)} (borne supérieure inconnue)` : finiteNumber(max) ? `≤ ${formatNumber(max)} (borne inférieure inconnue)` : 'non renseignées'}{(finiteNumber(min) || finiteNumber(max)) && record.unit ? ` ${record.unit}` : ''}</p>
      <p className="text-muted-foreground">{describeMeasurementState(record)}</p>
    </>}
  </div>;
}

function MeasurementCell({ side, laboratory }: { side: MeasurementSide; laboratory: boolean }) {
  if (!side.records.length) return notRecorded;
  return <div className="space-y-2">
    {side.selected ? <MeasurementValue record={side.selected} laboratory={laboratory} /> : <p className="text-amber-700 dark:text-amber-400">{side.excludedReason}</p>}
    {side.undatedCount > 0 && <p className="text-muted-foreground">{side.undatedCount} mesure(s) sans date exploitable.</p>}
    {(side.records.length > 1 || !side.selected) && <details>
      <summary className="cursor-pointer text-primary underline-offset-4 hover:underline">Tous les résultats ({side.records.length})</summary>
      <ul className="mt-2 max-h-64 space-y-3 overflow-y-auto border-l-2 pl-2">{side.records.map((r, i) => <li key={i}><MeasurementValue record={r} laboratory={laboratory} /></li>)}</ul>
    </details>}
  </div>;
}

function MeasurementTable({ rows, sourceCode, peerCode, laboratory }: { rows: MeasurementComparison[]; sourceCode: string; peerCode: string; laboratory: boolean }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Aucune {laboratory ? 'analyse biologique' : 'constante clinique'} renseignée.</p>;
  return <EvidenceTable label={laboratory ? 'Valeurs des bilans biologiques' : 'Valeurs des constantes cliniques'} sourceCode={sourceCode} peerCode={peerCode}>
    {rows.map(row => <tr key={row.key}>
      <th scope="row" className="p-3 align-top font-medium">{row.name}</th>
      <td><MeasurementCell side={row.source} laboratory={laboratory} /></td>
      <td><MeasurementCell side={row.peer} laboratory={laboratory} /></td>
      <td className="space-y-2">
        {row.delta !== null ? <>
          <p className="font-semibold tabular-nums">Écart : {row.delta > 0 ? '+' : ''}{formatNumber(row.delta)} {row.unit}</p>
          <p className="text-muted-foreground">Comparé − actuel</p>
          <p>Écart relatif : {percent(row.relativeDifference!)}</p>
          {laboratory && <p className="text-primary">Proximité numérique : {percent(row.numericSimilarity!)}</p>}
        </> : <p className="text-amber-700 dark:text-amber-400">Non comparable : {row.excludedReason}.</p>}
        {row.timeGapDays !== null && <p className="text-muted-foreground">Dates espacées de {rounded(row.timeGapDays)} jour(s).</p>}
      </td>
    </tr>)}
  </EvidenceTable>;
}

function TreatmentRecords({ records }: { records: ClinicalPatientProfile['medications'] }) {
  if (!records.length) return notRecorded;
  return <ul className="space-y-3">{records.map((r, i) => <li key={i} className="space-y-1">
    {r.name && <p className="font-medium">{r.name}</p>}
    <p>Dose : <strong>{r.dosage || 'non renseignée'}</strong> · Fréquence : {r.frequency || 'non renseignée'}</p>
    <p>Début : {formatRecordedDate(r.startDate)}</p>
    <p>Fin : {formatRecordedDate(r.endDate)}</p>
    <p className="text-muted-foreground">{r.isActive === true ? 'Actif selon le dossier' : r.isActive === false ? 'Inactif selon le dossier' : 'Statut non renseigné'}</p>
  </li>)}</ul>;
}

function SymptomRecords({ records }: { records: ClinicalPatientProfile['symptoms'] }) {
  if (!records.length) return notRecorded;
  return <ul className="space-y-3">{records.map((r, i) => <li key={i} className="space-y-1">
    <p>Début : <strong>{formatRecordedDate(r.onsetDate)}</strong></p>
    <p>Intensité : {r.severity || 'non renseignée'} · Fréquence : {r.frequency || 'non renseignée'}</p>
    <p className="text-muted-foreground">{r.isResolved === true ? 'Résolu selon le dossier' : r.isResolved === false ? 'Non résolu selon le dossier' : 'Résolution non renseignée'}</p>
  </li>)}</ul>;
}

function ScoreMethod({ match }: { match: RankedPatientMatch }) {
  const score = match.scoreDetails;
  return <div className="space-y-4 text-sm">
    <p>{match.matchBasis === 'pathology-id'
      ? 'Entrée dans la comparaison : même identifiant de pathologie du catalogue.'
      : 'Entrée dans la comparaison : même libellé complet de maladie, après normalisation de la casse, des accents et des espaces. Cette correspondance ne confirme pas un diagnostic identique.'}</p>
    <div className="max-h-[480px] overflow-auto rounded-lg border" role="region" aria-label="Calcul détaillé du classement" tabIndex={0}>
      <table className="w-full min-w-[780px] table-fixed text-left text-xs">
        <caption className="sr-only">Poids, observations et contribution de chaque dimension</caption>
        <thead className="sticky top-0 z-10 bg-muted"><tr>
          <th scope="col" className="w-[42%] p-3">Dimension et règle</th><th scope="col" className="p-3">Poids</th><th scope="col" className="p-3">Actuel / comparé</th><th scope="col" className="p-3">Communs ou paires</th><th scope="col" className="p-3">Concordance</th><th scope="col" className="p-3">Points pondérés</th>
        </tr></thead>
        <tbody>{score.dimensions.map(d => <tr key={d.component} className="border-t [&_td]:p-3 [&_td]:align-top">
          <th scope="row" className="p-3 align-top font-medium">{rules[d.component].name}<p className="mt-1 font-normal leading-relaxed text-muted-foreground">{rules[d.component].explanation}</p></th>
          <td>{d.weight} %</td><td>{d.sourceCount} / {d.peerCount}</td><td>{d.commonCount}</td><td>{d.score === null ? 'Non calculable' : percent(d.score)}</td><td>{d.weightedPoints === null ? 'Exclu' : rounded(d.weightedPoints)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <p className="text-xs text-muted-foreground">Les nombres correspondent aux éléments distincts utilisables dans chaque dimension. Une dimension sans données d’un côté est exclue, et non considérée comme une différence clinique. Les points affichés sont arrondis ; le calcul utilise les valeurs non arrondies.</p>
    <div className="rounded-lg bg-primary/5 p-4 space-y-2">
      <p><strong>Couverture pondérée : {score.availableWeight} / 100.</strong> Il s’agit du poids des dimensions calculables, pas du pourcentage de champs remplis dans les dossiers.</p>
      <p>Somme des points pondérés : {rounded(score.weightedSum)}. Coefficient de couverture : min(1 ; {score.availableWeight} / 60) = {rounded(score.coverageMultiplier)}.</p>
      <p className="font-semibold">{score.availableWeight ? `Indice = arrondi(100 × ${rounded(score.weightedSum)} / ${score.availableWeight} × ${rounded(score.coverageMultiplier)}) = ${match.score}/100.` : 'Aucune dimension calculable : indice affiché à 0/100, sans conclusion sur la ressemblance clinique.'}</p>
    </div>
    <p className="text-xs text-muted-foreground">Les poids et les échelles de 40 ans et 3 650 jours sont des choix heuristiques de classement. Ils ne constituent pas des seuils cliniques validés. La biologie compare des valeurs, sans correction automatique du délai, du stade de la maladie ou des méthodes de laboratoire. Les constantes cliniques, les doses et les dates de traitement servent à examiner le contexte et ne modifient pas cet indice.</p>
  </div>;
}

export function PatientComparisonDetails({ match, initiallyOpen = false }: { match: RankedPatientMatch; initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  const id = useId();
  const d = match.details;
  const pairedLabs = d.labs.filter(r => r.numericSimilarity !== null).length;
  const commonConditions = d.conditions.filter(r => r.source.length && r.peer.length).length;
  return <div className="min-w-0 space-y-3" data-testid="comparison-evidence">
    <div className="grid gap-2 sm:grid-cols-2 text-xs">
      {[{ label: 'Dossier actuel', code: d.sourceCode, date: d.sourceIndexDate, age: d.sourceAge }, { label: 'Dossier comparé', code: d.peerCode, date: d.peerIndexDate, age: d.peerAge }].map(side => <div key={side.label} className="rounded-md border bg-background p-3">
        <p className="font-medium">{side.label} · {side.code}</p>
        <p className="mt-1">Premier diagnostic renseigné pour {d.criterion.name} : <strong>{formatRecordedDate(side.date)}</strong></p>
        <p className="mt-1 text-muted-foreground">Âge renseigné : {finiteNumber(side.age) && side.age >= 0 ? `${side.age} ans` : 'inconnu'}.</p>
      </div>)}
    </div>
    <details open={open} onToggle={e => setOpen(e.currentTarget.open)} className="min-w-0 rounded-lg border bg-background">
      <summary className="cursor-pointer p-3 text-sm font-semibold text-primary" aria-controls={id}>
        Comparaison détaillée <span className="font-normal text-muted-foreground">· {commonConditions} autre(s) élément(s) commun(s) · {pairedLabs} bilan(s) comparable(s)</span>
      </summary>
      {open && <div id={id} className="min-w-0 space-y-4 border-t p-3 sm:p-4">
        <p className="text-xs text-muted-foreground">Les dates ci-dessous sont celles des diagnostics enregistrés. Le début réel de la maladie peut être antérieur et n’est pas déduit. Les dates de début des symptômes, lorsqu’elles existent, figurent dans l’onglet Traitements et symptômes.</p>
        <Tabs defaultValue="conditions" className="min-w-0">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 lg:grid-cols-5">
            <TabsTrigger value="conditions" className="whitespace-normal px-2 text-xs">Dates et maladies</TabsTrigger>
            <TabsTrigger value="measurements" className="whitespace-normal px-2 text-xs">Bilans et variables</TabsTrigger>
            <TabsTrigger value="treatments" className="whitespace-normal px-2 text-xs">Traitements et symptômes</TabsTrigger>
            <TabsTrigger value="method" className="whitespace-normal px-2 text-xs">Logique du score</TabsTrigger>
            <TabsTrigger value="research" className="whitespace-normal px-2 text-xs">Pistes de recherche</TabsTrigger>
          </TabsList>
          <TabsContent value="conditions" className="min-w-0 space-y-3 pt-2">
            <p className="text-sm">{d.conditions.length} autre(s) diagnostic(s) ou antécédent(s) documenté(s), avec leur chronologie par rapport à la pathologie comparée.</p>
            <EvidenceTable label="Dates des diagnostics et autres maladies" sourceCode={d.sourceCode} peerCode={d.peerCode}>
              {[d.indexCondition, ...d.conditions].map(row => <ConditionRow key={row.key} row={row} recordedLabel={match.matchBasis === 'recorded-label'} />)}
            </EvidenceTable>
            <p className="text-xs text-muted-foreground">Les entrées du catalogue restent distinctes des antécédents non codés. Une même maladie peut donc apparaître avec ces deux sources ; leurs dates et leur confirmation sont à vérifier dans le dossier.</p>
          </TabsContent>
          <TabsContent value="measurements" className="min-w-0 space-y-4 pt-2">
            <div className="space-y-2"><h4 className="font-semibold text-sm">Bilans sanguins et autres analyses</h4>
              <p className="text-xs text-muted-foreground">Dernière mesure datée de chaque analyse, avec l’historique disponible. L’écart relatif utilise la plus grande valeur absolue comme dénominateur. Une proximité numérique ne signifie pas une équivalence clinique ; les dates, références et méthodes peuvent différer.</p>
              <MeasurementTable rows={d.labs} sourceCode={d.sourceCode} peerCode={d.peerCode} laboratory />
            </div>
            <div className="space-y-2"><h4 className="font-semibold text-sm">Constantes et variables cliniques <Badge variant="outline">Contexte · hors score</Badge></h4>
              <MeasurementTable rows={d.variables} sourceCode={d.sourceCode} peerCode={d.peerCode} laboratory={false} />
            </div>
          </TabsContent>
          <TabsContent value="treatments" className="min-w-0 space-y-4 pt-2">
            <div className="space-y-2"><h4 className="font-semibold text-sm">Traitements documentés</h4>
              {d.treatments.length ? <EvidenceTable label="Traitements, doses et périodes" sourceCode={d.sourceCode} peerCode={d.peerCode}>
                {d.treatments.map(t => <tr key={t.key}><th scope="row" className="p-3 align-top font-medium">{t.name}</th><td><TreatmentRecords records={t.source} /></td><td><TreatmentRecords records={t.peer} /></td><td className="text-muted-foreground">{t.source.length && t.peer.length ? 'Substance ou code commun ; vérifier les doses, les périodes et l’indication.' : 'Documenté d’un seul côté ; l’exposition de l’autre patient n’est pas connue.'}</td></tr>)}
              </EvidenceTable> : <p className="text-sm text-muted-foreground">Aucun traitement renseigné.</p>}
            </div>
            <div className="space-y-2"><h4 className="font-semibold text-sm">Symptômes et dates de début</h4>
              {d.symptoms.length ? <EvidenceTable label="Symptômes, début et intensité" sourceCode={d.sourceCode} peerCode={d.peerCode}>
                {d.symptoms.map(s => <tr key={s.key}><th scope="row" className="p-3 align-top font-medium">{s.name}</th><td><SymptomRecords records={s.source} /></td><td><SymptomRecords records={s.peer} /></td><td className="text-muted-foreground">{s.source.length && s.peer.length ? 'Même identifiant de symptôme. Intensité et évolution à comparer.' : 'Renseigné dans un seul dossier.'}</td></tr>)}
              </EvidenceTable> : <p className="text-sm text-muted-foreground">Aucun symptôme renseigné.</p>}
            </div>
          </TabsContent>
          <TabsContent value="method" className="min-w-0 pt-2"><ScoreMethod match={match} /></TabsContent>
          <TabsContent value="research" className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground">Questions exploratoires formulées à partir de ces deux dossiers. Elles ne sont pas des résultats bibliographiques vérifiés ni des conclusions causales.</p>
            {d.researchLeads.map((lead, i) => <article key={lead.title} className="space-y-2 rounded-lg border p-3 text-sm">
              <h4 className="font-semibold">{i + 1}. {lead.title}</h4>
              <p><strong>Observation :</strong> {lead.observation}</p>
              <p className="text-primary"><strong>Question à explorer :</strong> {lead.question}</p>
              <p className="text-muted-foreground"><strong>Vérifications et recherche documentaire :</strong> {lead.verification}</p>
            </article>)}
            {d.dataGaps.length > 0 && <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-2">
              <h4 className="font-semibold">Données à compléter ou à vérifier</h4>
              <ul className="list-disc space-y-1 pl-4">{d.dataGaps.map((gap, i) => <li key={i}>{gap}</li>)}</ul>
            </div>}
          </TabsContent>
        </Tabs>
      </div>}
    </details>
  </div>;
}
