import { useEffect, useMemo, useReducer, useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertTriangle, Activity, Beaker, BookOpen, CheckCircle2, Clock3, HeartPulse,
  Pause, Play, RotateCcw, Search, ShieldAlert, Stethoscope, Users, Workflow,
} from 'lucide-react';
import {
  applySyntheticLabEvent, buildCohortAnalysis, detectPatientSignals, findClinicalTwins,
  type PatientMicroAlert,
} from '@/lib/microSignals/engine';
import { CLOZAPINE, CRP, HS_TROPONIN_I, type SyntheticPatient } from '@/lib/microSignals/synthetic';
import { demoReducer, makeDemoState, STREAM_SIZE } from '@/lib/microSignals/demo-state';

const sourceLinks = [
  { id: 'PMID:21524186', title: 'Ronaldson et al. (2011) · Protocole myocardite / clozapine', href: 'https://pubmed.ncbi.nlm.nih.gov/21524186/' },
  { id: 'PMID:35048875', title: 'Étude de registre (2022) · Période critique et spécificité', href: 'https://pubmed.ncbi.nlm.nih.gov/35048875/' },
  { id: 'PMID:40452212', title: 'Consensus multidisciplinaire (2025) · Dépistage et suivi', href: 'https://pubmed.ncbi.nlm.nih.gov/40452212/' },
  { id: 'LOINC:89579-7', title: 'LOINC · Troponine I ultrasensible et LSN propre au test', href: 'https://loinc.org/89579-7/' },
];

function numericLab(patient: SyntheticPatient, code: string) {
  return patient.labs.filter(l => l.code === code).sort((a, b) => a.observedAt.localeCompare(b.observedAt));
}

function SignalBadge({ alert }: { alert: PatientMicroAlert }) {
  return (
    <Badge variant={alert.level === 'urgent_review' ? 'destructive' : 'outline'}>
      {alert.level === 'urgent_review' ? 'Revue rapide' : 'Vigilance'}
    </Badge>
  );
}

const MicroSignalsLab = () => {
  const [state, dispatch] = useReducer(demoReducer, undefined, makeDemoState);
  const [isPlaying, setPlaying] = useState(false);
  const [selectedId, setSelectedId] = useState('SIM-P003');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'signal' | 'exposed' | 'comparator'>('all');

  useEffect(() => {
    if (!isPlaying || state.cursor >= STREAM_SIZE) return;
    const timer = window.setInterval(() => dispatch({ type: 'tick' }), 4000);
    return () => window.clearInterval(timer);
  }, [isPlaying, state.cursor]);
  useEffect(() => {
    if (state.cursor >= STREAM_SIZE) setPlaying(false);
  }, [state.cursor]);

  const analysis = useMemo(() => buildCohortAnalysis(state.patients), [state.patients]);
  const selected = state.patients.find(p => p.id === selectedId) || state.patients[0];
  const selectedAlerts = useMemo(() => detectPatientSignals(selected), [selected]);
  const twins = useMemo(() => findClinicalTwins(state.patients, selected.id).slice(0, 8), [state.patients, selected.id]);
  const exposed = selected.medications.some(m => m.code === CLOZAPINE);
  const displayed = useMemo(() => state.patients.filter(p => {
    const matches = `${p.id} ${p.pseudonym} ${p.medications.map(m => m.name).join(' ')} ${p.diagnoses.map(d => d.label).join(' ')}`
      .toLocaleLowerCase('fr').includes(search.trim().toLocaleLowerCase('fr'));
    if (!matches) return false;
    if (filter === 'exposed') return p.medications.some(m => m.code === CLOZAPINE);
    if (filter === 'comparator') return !p.medications.some(m => m.code === CLOZAPINE);
    if (filter === 'signal') return analysis.patientAlerts.some(a => a.patientId === p.id);
    return true;
  }), [analysis.patientAlerts, filter, search, state.patients]);
  const criticalCount = new Set(analysis.patientAlerts.filter(a => a.level === 'urgent_review').map(a => a.patientId)).size;
  const crp = numericLab(selected, CRP);
  const troponin = numericLab(selected, HS_TROPONIN_I);

  return (
    <AppLayout>
      <main className="mx-auto max-w-[1550px] space-y-5 px-2 pb-24 sm:px-4" aria-label="Laboratoire de microsignaux synthétiques">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/10 via-background to-violet-500/5 p-5">
          <div className="space-y-2">
            <Badge variant="secondary" className="gap-2"><Beaker className="h-3.5 w-3.5" /> 100 % SYNTHÉTIQUE — SIMULATION</Badge>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Laboratoire des microsignaux</h1>
            <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
              50 parcours fictifs · étude de cas clozapine / myocardite · signaux biologiques précoces · rapprochement temporel inter-patients.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => { setPlaying(false); dispatch({ type: 'reset' }); }}>
              <RotateCcw className="mr-2 h-4 w-4" /> Réinitialiser
            </Button>
            <Button size="sm" onClick={() => setPlaying(p => !p)} disabled={state.cursor >= STREAM_SIZE}>
              {isPlaying ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
              {isPlaying ? 'Suspendre le flux' : 'Flux simulé'}
            </Button>
            <Button variant="secondary" size="sm" disabled={state.cursor >= STREAM_SIZE} onClick={() => dispatch({ type: 'tick' })}>
              Observation suivante
            </Button>
          </div>
        </div>

        <Alert className="border-amber-500/40 bg-amber-500/5">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Jeu d’entraînement uniquement — aucun dossier patient réel consulté</AlertTitle>
          <AlertDescription>
            {analysis.caveat} Le flux est simulé dans ce navigateur, et le recalcul s’effectue sur chaque nouvelle observation. Aucun diagnostic ni modification thérapeutique automatique : revue médicale requise.
          </AlertDescription>
        </Alert>

        <section aria-label="Indicateurs de la cohorte" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label:'Dossiers simulés', value: analysis.cohortSize, sub:'identités et trajectoires fictives', icon:Users },
            { label:'Clozapine / comparateurs', value:`${analysis.exposed} / ${analysis.comparators}`, sub:'même indication, traitements différents', icon:Workflow },
            { label:'Dossiers avec revue rapide', value:criticalCount, sub:'seuils simulés CRP / troponine', icon:HeartPulse },
            { label:'Observations injectées', value:`${state.cursor} / ${STREAM_SIZE}`, sub:'recalcul immédiat, pas de service réel', icon:Activity },
          ].map(item => (
            <Card key={item.label} className="bg-card/80">
              <CardContent className="flex items-start justify-between gap-2 p-4">
                <div><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-1 text-3xl font-semibold tabular-nums">{item.value}</p><p className="mt-1 text-xs text-muted-foreground">{item.sub}</p></div>
                <item.icon className="h-5 w-5 shrink-0 text-primary/70" />
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(290px,370px)_minmax(0,1fr)]">
          <Card className="min-w-0">
            <CardHeader className="space-y-2 pb-3">
              <CardTitle className="flex items-center justify-between text-lg">Cohorte <Badge variant="outline">{displayed.length} / 50</Badge></CardTitle>
              <CardDescription>Uniquement des identifiants SIM. Filtrez par exposition ou par signal détecté.</CardDescription>
              <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input aria-label="Chercher un dossier synthétique" className="pl-9" placeholder="ID, pathologie, traitement…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-1">
                {(['all','signal','exposed','comparator'] as const).map(key => (
                  <Button key={key} type="button" size="sm" variant={filter === key ? 'default' : 'outline'} onClick={() => setFilter(key)}>
                    {{ all:'Tous',signal:'Avec signal',exposed:'Clozapine',comparator:'Comparateurs' }[key]}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <ScrollArea className="h-[610px] pr-3">
                {displayed.map(patient => {
                  const urgent=analysis.patientAlerts.some(a => a.patientId === patient.id && a.level === 'urgent_review');
                  const watched=analysis.patientAlerts.some(a => a.patientId === patient.id);
                  return <button key={patient.id} type="button"
                    aria-pressed={selected.id === patient.id}
                    onClick={() => setSelectedId(patient.id)}
                    className={`mb-2 flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left transition-colors hover:border-primary/50 ${selected.id===patient.id?'border-primary bg-primary/5':'border-border'}`}>
                    <span className="min-w-0"><span className="block text-xs font-mono text-muted-foreground">{patient.id}</span>
                      <span className="block truncate text-sm font-medium">{patient.pseudonym}</span>
                      <span className="block text-xs text-muted-foreground">{patient.demographics.nationality} · {patient.demographics.ageAtIndex} ans · {patient.medications[0]?.name}</span></span>
                    {urgent?<Badge variant="destructive">Revue</Badge>:watched?<Badge variant="outline">Signal</Badge>:<CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  </button>;
                })}
                {displayed.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Aucun cas fictif ne correspond.</p>}
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="min-w-0 space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><CardTitle className="flex items-center gap-2 text-lg"><Stethoscope className="h-5 w-5" /> {selected.pseudonym}</CardTitle>
                    <CardDescription>{selected.id} · {selected.demographics.nationality} · {selected.demographics.sex} · {selected.demographics.ageAtIndex} ans au début du suivi · {selected.demographics.site}</CardDescription></div>
                  <Badge variant={exposed?'secondary':'outline'}>{exposed ? 'Exposé clozapine' : 'Comparateur olanzapine'}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="clinical" className="w-full">
                  <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
                    <TabsTrigger value="clinical">Dossier</TabsTrigger><TabsTrigger value="labs">Biomarqueurs</TabsTrigger><TabsTrigger value="timeline">Chronologie</TabsTrigger><TabsTrigger value="twins">Patients similaires</TabsTrigger>
                  </TabsList>
                  <TabsContent value="clinical" className="space-y-4 pt-3">
                    <div className="grid gap-4 md:grid-cols-2">
                      <section><h3 className="mb-2 text-sm font-semibold">Pathologies</h3>
                        {selected.diagnoses.map((d,i)=><div key={`${d.code}-${i}`} className="mb-2 rounded-lg border p-2 text-sm">
                          <div className="flex items-center justify-between gap-2"><span>{d.label}</span><Badge variant="outline">{d.status==='confirmed'?'Confirmée (factice)':'Suspectée'}</Badge></div>
                          <p className="mt-1 text-xs text-muted-foreground">{d.code} · {d.diagnosedAt}</p></div>)}
                      </section>
                      <section><h3 className="mb-2 text-sm font-semibold">Traitements et expositions</h3>
                        {selected.medications.map((m,i)=><div key={`${m.code}-${i}`} className="mb-2 rounded-lg border p-2 text-sm">
                          <p className="font-medium">{m.name}</p><p>{m.dose} · {m.frequency}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Début {m.startedAt} · {m.indication}</p></div>)}
                      </section>
                      <section className="text-sm"><h3 className="mb-2 font-semibold">Contexte et prévention</h3>
                        <p>Naissance : {selected.demographics.dateOfBirth}</p><p>Taille / poids : {selected.demographics.heightCm} cm / {selected.demographics.weightKg} kg</p>
                        <p>Habitudes : {selected.lifestyle.activity}, sommeil {selected.lifestyle.sleepHours} h</p>
                        <p>Antécédents familiaux : {selected.familyHistory.map(f=>f.condition).join(', ')}</p>
                        <p>Allergies : {selected.allergies.map(a=>a.status==='unknown'?'Non documentées':a.substance).join(', ')}</p>
                        <p>Vaccination : {selected.vaccinations.map(v=>`${v.vaccine} (${v.status==='recorded'?'déclarée':'inconnue'})`).join(', ')}</p>
                      </section>
                      <section className="text-sm"><h3 className="mb-2 font-semibold">Consultations et ECG</h3>
                        <p>{selected.encounters.length} consultations, {selected.ecgs.length} ECG simulés</p>
                        <p className="mt-2 text-muted-foreground">{selected.encounters.at(-1)?.assessment}</p>
                        <p className="mt-2 text-muted-foreground">{selected.ecgs.at(-1)?.finding}</p>
                      </section>
                    </div>
                  </TabsContent>
                  <TabsContent value="labs" className="space-y-4 pt-3">
                    <p className="text-sm text-muted-foreground">CRP (mg/L) et troponine I ultrasensible (ng/L). La LSN est propre à chaque test ; les valeurs de cette cohorte sont fabriquées.</p>
                    {[{name:'CRP',values:crp},{name:'hs-cTnI',values:troponin}].map(group=><div key={group.name}>
                      <h3 className="mb-2 text-sm font-medium">{group.name}</h3>
                      <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="bg-muted/40"><tr><th className="p-2">Date</th><th className="p-2">Résultat</th><th className="p-2">LSN</th><th className="p-2">Évaluation du seuil</th></tr></thead><tbody>
                        {group.values.map(l=><tr key={l.id} className="border-t"><td className="whitespace-nowrap p-2">{l.observedAt}</td><td className="p-2 font-medium tabular-nums">{l.value} {l.unit}</td><td className="p-2 tabular-nums">{l.upperReference}</td>
                          <td className="p-2">{l.value>2*l.upperReference ? 'Élevé >2× LSN' : l.value>l.upperReference ? 'Au-dessus LSN' : 'Sous LSN fictive'}</td></tr>)}
                      </tbody></table></div>
                    </div>)}
                  </TabsContent>
                  <TabsContent value="timeline" className="pt-3"><ScrollArea className="h-[370px]">
                    <div className="space-y-2">{selected.timeline.map(e=><div key={e.id} className="grid grid-cols-[100px_1fr] gap-2 rounded-lg border p-2 text-sm">
                      <time className="font-mono text-xs text-muted-foreground">{e.date}</time><span>{e.text}</span></div>)}</div>
                  </ScrollArea></TabsContent>
                  <TabsContent value="twins" className="space-y-2 pt-3"><p className="text-xs text-muted-foreground">Rapprochement sur pathologies et traitements communs; ni le nom ni la nationalité n'entrent dans le score. Similarités simulées, non prédictives.</p>
                    {twins.map(t=><button key={t.id} onClick={()=>setSelectedId(t.id)} className="block w-full rounded-lg border p-3 text-left text-sm hover:bg-muted/50">
                      <div className="flex flex-wrap items-center justify-between gap-1"><span className="font-medium">{t.id} · {t.pseudonym}</span><Badge variant="outline">{t.similarity} % recouvrement</Badge></div>
                      <p className="mt-1 text-xs text-muted-foreground">{t.sharedFeatures.join(' · ')}</p><p className="text-xs">{t.outcome}</p></button>)}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4" /> Alertes longitudinales du dossier</CardTitle>
              <CardDescription>Fenêtre 42 jours depuis la première exposition. Les anomalies ne sont pas des diagnostics.</CardDescription></CardHeader>
              <CardContent className="space-y-3">
                {selectedAlerts.length===0?<p className="text-sm text-muted-foreground">Aucun seuil du protocole simulé n'a été franchi. Cela ne démontre pas l'absence de risque.</p>:selectedAlerts.map(a=><div key={a.code} className="rounded-lg border p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{a.label}</span><SignalBadge alert={a} /></div>
                  <p className="text-sm text-muted-foreground">{a.explanation}</p>
                  <p className="mt-2 text-xs">Première observation : {a.firstObservedAt}</p>
                  {a.missing.length>0&&<p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Données manquantes/incompatibles : {a.missing.join(', ')}</p>}
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{a.evidence.map(e=><li key={e}>{e}</li>)}</ul>
                </div>)}
              </CardContent></Card>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Croisement des 50 dossiers simulés</CardTitle>
            <CardDescription>Comparaison exposés / non exposés et regroupements cliniques datés.</CardDescription></CardHeader><CardContent className="space-y-4">
            {analysis.alerts.length ? analysis.alerts.map(a=><div key={a.id} className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
              <Badge variant="outline" className="mb-2">Hypothèse de surveillance</Badge><h3 className="font-semibold">{a.title}</h3><p className="mt-1 text-sm text-muted-foreground">{a.explanation}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg bg-background p-2">Sous clozapine <b>{a.exposedCases} / {a.exposedTotal}</b></div><div className="rounded-lg bg-background p-2">Comparateurs <b>{a.comparatorCases} / {a.comparatorTotal}</b></div></div>
              <div className="mt-2 space-y-1 rounded-lg border p-3 text-xs">
                <p><strong>{analysis.earlyWarningsBeforeDiagnosis}</strong> dossiers synthétiques ont une alerte antérieure au diagnostic fictif.
                {analysis.medianSimulatedLeadDays !== null && <> Antériorité médiane dans la simulation : <strong>{analysis.medianSimulatedLeadDays} jours</strong>.</>}</p>
                <p><strong>{analysis.warningsWithoutConfirmedOutcome}</strong> parcours exposés ont également au moins une alerte sans diagnostic confirmé dans la fenêtre fictive : les faux signaux restent possibles.</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Ces proportions sont des nombres de scénarios fictifs, jamais une incidence ni une probabilité réelle.</p>
            </div>):<p className="text-sm text-muted-foreground">Taille ou appui temporel insuffisant pour afficher un regroupement.</p>}
            {analysis.clusters.map(c=><div key={c.id} className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"><div><p className="font-medium">{c.medication} + {c.sharedIndication}</p><p className="text-xs text-muted-foreground">{c.patientCount} parcours · {c.confirmedCases} issues simulées confirmées</p></div><Badge variant="secondary">Groupe d'exposition</Badge></div>)}
          </CardContent></Card>
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5" /> Flux continu d'observations (simulation)</CardTitle><CardDescription>Une nouvelle valeur entraîne un recalcul déterministe immédiat. Aucune donnée ne sort du navigateur.</CardDescription></CardHeader>
            <CardContent className="space-y-3">{state.history.length===0?<p className="text-sm text-muted-foreground">Activez « Flux simulé » ou « Observation suivante » pour simuler de nouvelles analyses CRP / troponine.</p>:
              state.history.map(e=><div key={e.id} className="rounded-lg border-l-2 border-primary bg-muted/30 px-3 py-2 text-sm"><p>{e.label}</p><p className="text-xs text-muted-foreground">Observation fictive datée du {e.at} · recalcul effectué</p></div>)}
              <p className="text-xs text-muted-foreground">Limite : le flux n'est pas un service de surveillance en production. Il ne lit pas les dossiers réels et ne continue pas lorsque cette page est fermée.</p>
            </CardContent></Card>
        </section>

        <Card><CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="h-5 w-5" /> Sources médicales et limites</CardTitle>
          <CardDescription>Références documentant l'association et les pratiques de surveillance, pas les cas fictifs ni une performance de détection.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {sourceLinks.map(s=><a key={s.id} href={s.href} target="_blank" rel="noreferrer noopener" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50">
              <span>{s.title}</span><Badge variant="outline">{s.id}</Badge></a>)}
            <p className="pt-2 text-sm text-muted-foreground">Les diagnostics de myocardite sont attribués dans les scénarios par un clinicien fictif. Une CRP élevée ou une tachycardie isolée peut refléter une infection et ne suffit pas à conclure. Aucun calcul d'incidence ou de risque relatif n'est valide sur un échantillon intentionnellement enrichi. Les LSN doivent être propres à l'essai analytique réel.</p>
          </CardContent></Card>
      </main>
    </AppLayout>
  );
};

export default MicroSignalsLab;
