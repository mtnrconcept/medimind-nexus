import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, CircleAlert, Loader2, RefreshCw, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildPathologyChoices, type PathologyChoice, type RankedPatientMatch } from '@/lib/patientSimilarity/clinicalSimilarity';
import { loadAuthorizedPathologyMatches } from '@/lib/patientSimilarity/authorizedMatches';
import { createSupabaseMatchGateway } from '@/lib/patientSimilarity/supabaseGateway';

interface Props {
  patientId: string;
  primaryPathology?: { id: string; name: string; icd_code?: string | null } | null;
  recordedPathologies?: Array<{ pathologies?: { id?: string; name?: string; icd_code?: string | null } | null }>;
  medicalHistory?: Array<{ id: string; condition_name: string; condition_type: string; diagnosis_date?: string | null }>;
  onRefresh?: () => Promise<void>;
}

const coverageText = (level: RankedPatientMatch['evidenceLevel']) => level === 'documented'
  ? 'Comparaison documentée' : level === 'partial' ? 'Comparaison partielle' : 'Données insuffisantes';

const componentNames: Record<keyof RankedPatientMatch['componentScores'], string> = {
  coDiagnoses: 'Diagnostics associés',
  medicalHistory: 'Antécédents',
  medications: 'Traitements',
  laboratory: 'Biologie',
  symptoms: 'Symptômes',
  chronology: 'Chronologie',
  age: 'Proximité d’âge',
};

export function PatientPathologySimilarity({ patientId, primaryPathology, recordedPathologies, medicalHistory, onRefresh }: Props) {
  const choices = useMemo<PathologyChoice[]>(() => buildPathologyChoices(
    primaryPathology ? { id: primaryPathology.id, name: primaryPathology.name, icdCode: primaryPathology.icd_code } : null,
    (recordedPathologies ?? []).filter(x => x.pathologies?.id).map(x => ({
      id: x.pathologies!.id, name: x.pathologies!.name, icdCode: x.pathologies!.icd_code,
    })),
    (medicalHistory ?? []).map(h => ({ id: h.id, name: h.condition_name, conditionType: h.condition_type, diagnosisDate: h.diagnosis_date })),
  ), [primaryPathology, recordedPathologies, medicalHistory]);
  const [selected, setSelected] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [results, setResults] = useState<RankedPatientMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const selectedChoice = choices.find(p => p.id === selected);
  const isRecordedLabel = selectedChoice?.source === 'history';

  const refreshSources = async () => {
    setRefreshing(true);
    setError('');
    setResults([]);
    try {
      await onRefresh?.();
      setRefresh(x => x + 1);
    } catch {
      setError('Impossible d’actualiser les pathologies du dossier. Veuillez réessayer.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (!selected || !choices.some(x => x.id === selected)) {
      if (selected) setSelected('');
      setResults([]);
      setError('');
      setLoading(false);
      return () => { active = false; };
    }
    setResults([]);
    setError('');
    setLoading(true);
    void loadAuthorizedPathologyMatches(createSupabaseMatchGateway(), patientId, selected)
      .then(found => { if (active) setResults(found); })
      .catch(err => {
        if (!active) return;
        setError(err instanceof Error && /Session expirée|Trop de dossiers|Résultat trop volumineux|antécédent/i.test(err.message)
          ? err.message
          : 'Impossible de comparer les dossiers autorisés. Veuillez réessayer.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [patientId, selected, refresh, choices]);

  return (
    <Card className="border-primary/20 bg-card/90" aria-label="Comparaison des patients par pathologie">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          Patients présentant la même pathologie
        </CardTitle>
        <CardDescription>
          Choisissez une pathologie du catalogue ou une entrée enregistrée parmi les maladies des antécédents personnels.
          Classement par ressemblance de l’historique clinique documenté,
          sans extrapolation diagnostique ni lien de causalité.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {choices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune pathologie ni maladie des antécédents personnels n’est enregistrée dans ce dossier.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-lg space-y-2">
              <Label htmlFor="patient-pathology-match-select">Pathologie ou antécédent à comparer</Label>
              <Select value={selected} onValueChange={setSelected} disabled={refreshing}>
                <SelectTrigger id="patient-pathology-match-select" aria-label="Choisir une pathologie du patient" className="[&>span]:truncate [&>span]:text-left">
                  <SelectValue placeholder="Sélectionner une pathologie…" />
                </SelectTrigger>
                <SelectContent className="max-h-80 w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">
                  {(['catalogue', 'history'] as const).map(source => {
                    const group = choices.filter(p => p.source === source);
                    return group.length > 0 && (
                      <SelectGroup key={source}>
                        <SelectLabel>{source === 'catalogue' ? 'Pathologies du catalogue' : 'Antécédents personnels — maladies'}</SelectLabel>
                        {group.map(p => (
                          <SelectItem key={p.id} value={p.id} className="items-start">
                            <span className="block whitespace-normal break-words">{p.name}{p.icdCode ? ` (${p.icdCode})` : ''}</span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{choices.length} éléments du dossier disponibles.</p>
            </div>
          </div>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => void refreshSources()} disabled={loading || refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2${refreshing ? ' animate-spin' : ''}`} /> Actualiser
        </Button>
        {isRecordedLabel && (
          <p className="text-xs text-muted-foreground">
            Cet élément provient des antécédents personnels. La recherche utilise son libellé complet dans les dossiers accessibles.
            Un même libellé ne confirme pas à lui seul un diagnostic identique.
          </p>
        )}
        {!selectedChoice && error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {selectedChoice && (
          <div className="space-y-3" aria-live="polite" aria-busy={loading}>
            {loading || refreshing ? (
              <div className="flex gap-2 items-center text-sm text-muted-foreground py-5">
                <Loader2 className="h-4 w-4 animate-spin" /> Recherche des dossiers autorisés et calcul des similarités…
              </div>
            ) : error ? (
              <div role="alert" className="flex gap-2 items-start rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
                <CircleAlert className="h-4 w-4 shrink-0" />{error}
              </div>
            ) : results.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">
                {isRecordedLabel
                  ? 'Aucun autre dossier accessible ne comporte ce même libellé de maladie dans ses pathologies ou antécédents personnels.'
                  : 'Aucun autre dossier accessible ne comporte exactement cette pathologie codée.'}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge variant="secondary">{results.length} {results.length === 1 ? 'dossier correspondant accessible' : 'dossiers correspondants accessibles'}</Badge>
                  <span className="text-xs text-muted-foreground">
                    Classement décroissant · {isRecordedLabel ? 'correspondance du libellé documenté' : 'même pathologie du catalogue'}
                  </span>
                </div>
                <div className="max-h-[550px] overflow-y-auto space-y-2 pr-1">
                  {results.map((match, position) => (
                    <div key={match.patientId} className="rounded-lg border border-border/70 bg-background/50 p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">#{position + 1}</Badge>
                          <span className="font-semibold text-sm">Patient {match.patientCode}</span>
                          {match.age !== null && <span className="text-xs text-muted-foreground">{match.age} ans</span>}
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <Badge variant="secondary"><Activity className="h-3 w-3 mr-1" />{match.score}/100</Badge>
                          <Badge variant="outline">{coverageText(match.evidenceLevel)}</Badge>
                          <Link to={`/patients/${match.patientId}`}>
                            <Button size="sm" variant="outline" className="gap-1">Voir le dossier <ArrowRight className="h-3.5 w-3.5" /></Button>
                          </Link>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Complétude des dimensions comparables : {match.coveragePercent} %.
                        {match.sharedFactors.length === 0 ? ' Aucun autre élément clinique commun suffisamment documenté.' : ''}
                      </p>
                      {match.sharedFactors.length > 0 && (
                        <ul className="list-disc pl-4 text-xs text-foreground/80 space-y-1">
                          {match.sharedFactors.slice(0, 5).map((factor, idx) => <li key={`${match.patientId}-${idx}`}>{factor}</li>)}
                        </ul>
                      )}
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer hover:text-foreground">Détail du classement</summary>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {(Object.entries(match.componentScores) as [keyof RankedPatientMatch['componentScores'], number | null][])
                            .filter(([, value]) => value !== null)
                            .map(([key, value]) => (
                              <Badge key={key} variant="outline" className="font-normal">
                                {componentNames[key]} : {Math.round(value! * 100)} %
                              </Badge>
                            ))}
                        </div>
                        <p className="mt-2">Une dimension absente n’est pas supposée normale et réduit la solidité de la comparaison.</p>
                      </details>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground border-t pt-3">
          Indice indicatif de ressemblance (0–100), pas une corrélation statistique, une probabilité de risque ou une preuve de causalité.
          Les pathologies du catalogue sont comparées par identifiant ; les maladies des antécédents non codés, par libellé complet.
          Seuls les dossiers auxquels vous avez accès sont affichés.
          L’absence de données ne signifie jamais l’absence d’anomalie.
        </p>
      </CardContent>
    </Card>
  );
}
