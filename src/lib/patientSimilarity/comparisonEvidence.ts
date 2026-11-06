import type { ClinicalPatientProfile, RecordedPathology } from './clinicalSimilarity';
import { formatNumber, formatRecordedDate, historyKey, isValidDate, medicationKey, normalizeRecordedConditionLabel } from './comparisonFacts';
import { compareMeasurements, type MeasurementComparison } from './measurementComparison';

export type ComparisonCriterion = { kind: 'pathology-id'; id: string; name: string } | { kind: 'recorded-label'; name: string };
export interface ConditionOccurrence {
  name: string;
  date: string | null;
  origin: 'Diagnostic du catalogue' | 'Antécédent personnel';
  conditionType?: string;
  daysFromIndex: number | null;
}
export interface ConditionComparison {
  key: string;
  name: string;
  kind: 'selected' | 'diagnosis' | 'history';
  source: ConditionOccurrence[];
  peer: ConditionOccurrence[];
}
export interface TreatmentComparison {
  key: string;
  name: string;
  source: ClinicalPatientProfile['medications'];
  peer: ClinicalPatientProfile['medications'];
}
export interface SymptomComparison {
  key: string;
  name: string;
  source: ClinicalPatientProfile['symptoms'];
  peer: ClinicalPatientProfile['symptoms'];
}
export interface ResearchLead {
  title: string;
  observation: string;
  question: string;
  verification: string;
}
export interface PatientComparisonEvidence {
  sourceCode: string;
  peerCode: string;
  sourceAge: number | null;
  peerAge: number | null;
  criterion: ComparisonCriterion;
  indexCondition: ConditionComparison;
  sourceIndexDate: string | null;
  peerIndexDate: string | null;
  conditions: ConditionComparison[];
  labs: MeasurementComparison[];
  variables: MeasurementComparison[];
  treatments: TreatmentComparison[];
  symptoms: SymptomComparison[];
  researchLeads: ResearchLead[];
  dataGaps: string[];
}

function occurrences(profile: ClinicalPatientProfile, criterion: ComparisonCriterion): Array<{ key: string; kind: ConditionComparison['kind']; occurrence: Omit<ConditionOccurrence, 'daysFromIndex'> }> {
  const selectedDiagnosis = (d: RecordedPathology) => criterion.kind === 'pathology-id'
    ? d.pathologyId === criterion.id : normalizeRecordedConditionLabel(d.name) === normalizeRecordedConditionLabel(criterion.name);
  return [
    ...profile.diagnoses.map(d => ({
      key: selectedDiagnosis(d) ? 'selected' : `diagnosis:${d.pathologyId}`,
      kind: selectedDiagnosis(d) ? 'selected' as const : 'diagnosis' as const,
      occurrence: { name: d.name?.trim() || 'Diagnostic codé sans libellé', date: d.diagnosedAt ?? null, origin: 'Diagnostic du catalogue' as const },
    })),
    ...profile.history.map(h => {
      const selected = criterion.kind === 'recorded-label' && h.conditionType === 'disease'
        && normalizeRecordedConditionLabel(h.name) === normalizeRecordedConditionLabel(criterion.name);
      return { key: selected ? 'selected' : `history:${historyKey(h)}`, kind: selected ? 'selected' as const : 'history' as const,
        occurrence: { name: h.name, date: h.diagnosisDate ?? null, origin: 'Antécédent personnel' as const, conditionType: h.conditionType } };
    }),
  ];
}

function firstDate(rows: Array<{ occurrence: { date: string | null }; kind: string }>): string | null {
  return rows.filter(r => r.kind === 'selected').map(r => r.occurrence.date).filter(isValidDate).sort()[0] ?? null;
}

function pairedRecords<T>(source: T[], peer: T[], keyFor: (r: T) => string, nameFor: (r: T) => string) {
  const rows = new Map<string, { key: string; name: string; source: T[]; peer: T[] }>();
  for (const side of ['source', 'peer'] as const) {
    for (const record of side === 'source' ? source : peer) {
      const key = keyFor(record);
      if (!key) continue;
      const row = rows.get(key) ?? { key, name: nameFor(record), source: [], peer: [] };
      row[side].push(record);
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

function researchQuestions(evidence: PatientComparisonEvidence): ResearchLead[] {
  const leads: ResearchLead[] = [];
  const selected = evidence.criterion.name;
  const otherDisease = evidence.conditions.find(c => c.source.length && c.peer.length
    && (c.kind === 'diagnosis' || c.source.some(o => o.conditionType === 'disease') && c.peer.some(o => o.conditionType === 'disease')));
  if (otherDisease) {
    leads.push({
      title: 'Maladies associées et ordre des diagnostics',
      observation: `« ${selected} » et « ${otherDisease.name} » sont documentés dans les deux dossiers. Pour ${otherDisease.name} : dossier actuel ${otherDisease.source.map(o => formatRecordedDate(o.date)).join(', ')} ; dossier comparé ${otherDisease.peer.map(o => formatRecordedDate(o.date)).join(', ')}.`,
      question: `Dans une cohorte plus large de dossiers comportant « ${selected} », l’ordre des diagnostics de « ${otherDisease.name} » est-il associé à des trajectoires différentes ?`,
      verification: 'Vérifier les dates et la confirmation des diagnostics, puis rechercher des études longitudinales. Distinguer début des symptômes, diagnostic et date de saisie ; tenir compte de l’âge et des traitements.',
    });
  }
  const lab = evidence.labs.filter(r => r.numericSimilarity !== null).sort((a, b) => b.relativeDifference! - a.relativeDifference! || a.name.localeCompare(b.name, 'fr'))[0];
  if (lab) {
    leads.push({
      title: `Trajectoire biologique : ${lab.name}`,
      observation: `${lab.name} : ${formatNumber(lab.source.selected!.value!)} ${lab.source.selected!.unit} le ${formatRecordedDate(lab.source.selected!.measuredAt)} dans le dossier actuel ; ${formatNumber(lab.peer.selected!.value!)} ${lab.peer.selected!.unit} le ${formatRecordedDate(lab.peer.selected!.measuredAt)} dans le dossier comparé.`,
      question: `La ${lab.delta === 0 ? 'concordance' : 'différence'} observée pour « ${lab.name} » se retrouve-t-elle sur plusieurs prélèvements et à un stade comparable de « ${selected} » ?`,
      verification: 'Comparer les séries datées, les méthodes de laboratoire, les références et les traitements au moment du prélèvement. Rechercher ensuite des travaux sur ce marqueur dans cette maladie ; deux valeurs isolées ne décrivent pas une évolution.',
    });
  }
  const treatment = evidence.treatments.find(t => t.source.length && t.peer.length);
  if (treatment) {
    leads.push({
      title: 'Contexte des traitements',
      observation: `« ${treatment.name} » est enregistré dans les deux dossiers ; les posologies, fréquences et périodes disponibles figurent dans la comparaison.`,
      question: 'Les trajectoires restent-elles comparables lorsque l’on tient compte de la dose, de la durée, de l’indication et des autres traitements ?',
      verification: 'Vérifier l’exposition réelle et les dates avant toute analyse. Rechercher des études ajustées sur ces facteurs ; un traitement commun ne démontre ni son effet ni un lien causal.',
    });
  }
  if (!leads.length) {
    leads.push({
      title: 'Documenter la trajectoire avant d’élargir la recherche',
      observation: `Les deux dossiers comportent « ${selected} », mais aucune autre maladie, mesure biologique exploitable ou substance commune ne permet ici d’étayer une piste plus précise.`,
      question: 'Quelles dates, mesures répétées et maladies associées permettraient de caractériser des trajectoires comparables ?',
      verification: 'Compléter les éléments manquants signalés ci-dessous, puis formuler une question sur une cohorte plus large et rechercher les publications correspondantes.',
    });
  }
  return leads;
}

export function buildComparisonEvidence(source: ClinicalPatientProfile, peer: ClinicalPatientProfile, criterion: ComparisonCriterion): PatientComparisonEvidence {
  const sourceRows = occurrences(source, criterion), peerRows = occurrences(peer, criterion);
  const sourceIndexDate = firstDate(sourceRows), peerIndexDate = firstDate(peerRows);
  const rows = new Map<string, ConditionComparison>();
  for (const side of ['source', 'peer'] as const) {
    const date = side === 'source' ? sourceIndexDate : peerIndexDate;
    for (const item of side === 'source' ? sourceRows : peerRows) {
      const row = rows.get(item.key) ?? { key: item.key, name: item.kind === 'selected' ? criterion.name : item.occurrence.name, kind: item.kind, source: [], peer: [] };
      const daysFromIndex = date && isValidDate(item.occurrence.date)
        ? (Date.parse(item.occurrence.date + 'T00:00:00Z') - Date.parse(date + 'T00:00:00Z')) / 86400000 : null;
      const occurrence = { ...item.occurrence, daysFromIndex };
      // Identical duplicated source records do not obscure the timeline; different dates stay visible.
      if (!row[side].some(r => r.date === occurrence.date && r.name === occurrence.name && r.origin === occurrence.origin)) row[side].push(occurrence);
      rows.set(item.key, row);
    }
  }
  for (const row of rows.values()) for (const side of ['source', 'peer'] as const) row[side].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.name.localeCompare(b.name, 'fr'));
  const evidence: PatientComparisonEvidence = {
    sourceCode: source.patientCode, peerCode: peer.patientCode, sourceAge: source.age, peerAge: peer.age, criterion,
    indexCondition: rows.get('selected') ?? { key: 'selected', name: criterion.name, kind: 'selected', source: [], peer: [] },
    sourceIndexDate, peerIndexDate,
    conditions: [...rows.values()].filter(r => r.kind !== 'selected').sort((a, b) => Number(!!b.source.length && !!b.peer.length) - Number(!!a.source.length && !!a.peer.length) || a.name.localeCompare(b.name, 'fr')),
    labs: compareMeasurements(source.labs, peer.labs),
    variables: compareMeasurements(source.variables ?? [], peer.variables ?? []),
    treatments: pairedRecords<ClinicalPatientProfile['medications'][number]>(source.medications, peer.medications, medicationKey, r => r.substance?.trim() || r.name?.trim() || r.atcCode?.trim() || 'Médicament codé sans libellé'),
    symptoms: pairedRecords(source.symptoms, peer.symptoms, r => r.id, r => r.name?.trim() || 'Symptôme codé sans libellé'),
    researchLeads: [], dataGaps: [],
  };
  if (!sourceIndexDate) evidence.dataGaps.push('Date du diagnostic comparé non renseignée ou inexploitable dans le dossier actuel.');
  if (!peerIndexDate) evidence.dataGaps.push('Date du diagnostic comparé non renseignée ou inexploitable dans le dossier comparé.');
  for (const row of [...evidence.labs, ...evidence.variables]) {
    if (row.excludedReason) evidence.dataGaps.push(`${row.name} : ${row.excludedReason.toLocaleLowerCase('fr')}.`);
    if (row.source.undatedCount || row.peer.undatedCount) evidence.dataGaps.push(`${row.name} : ${row.source.undatedCount} mesure(s) sans date exploitable dans le dossier actuel, ${row.peer.undatedCount} dans le dossier comparé.`);
  }
  if (!evidence.labs.length) evidence.dataGaps.push('Aucun bilan biologique renseigné dans ces deux dossiers.');
  if (!evidence.variables.length) evidence.dataGaps.push('Aucune constante clinique renseignée dans ces deux dossiers.');
  evidence.researchLeads = researchQuestions(evidence);
  return evidence;
}
