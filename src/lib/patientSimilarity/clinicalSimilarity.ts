/**
 * Explainable similarity of documented clinical histories. The index is not a
 * statistical correlation, a risk probability, or a diagnostic recommendation.
 * Exact pathology matching relies exclusively on the canonical UUID.
 */
export interface RecordedPathology {
  pathologyId: string;
  name?: string | null;
  diagnosedAt?: string | null;
}

export interface PathologyChoice {
  id: string;
  name: string;
  icdCode?: string | null;
  source: 'catalogue' | 'history';
}

export interface RecordedMedicalHistory {
  id: string;
  name: string;
  conditionType: string;
  diagnosisDate?: string | null;
}

export interface ClinicalPatientProfile {
  id: string;
  patientCode: string;
  age: number | null;
  diagnoses: RecordedPathology[];
  history: Array<{ id?: string; name: string; conditionType?: string; diagnosisDate?: string | null }>;
  medications: Array<{ substance?: string | null; atcCode?: string | null; medicationId?: string | null }>;
  labs: Array<{
    name: string;
    unit: string | null;
    value: number | null;
    measuredAt?: string | null;
    referenceMin?: number | null;
    referenceMax?: number | null;
    isAbnormal?: boolean | null;
  }>;
  symptoms: Array<{ id: string }>;
}

type Component = 'coDiagnoses' | 'medicalHistory' | 'medications' | 'laboratory' | 'symptoms' | 'chronology' | 'age';

export type ComponentScores = Record<Component, number | null>;

export interface RankedPatientMatch {
  patientId: string;
  patientCode: string;
  age: number | null;
  score: number;
  coveragePercent: number;
  evidenceLevel: 'documented' | 'partial' | 'insufficient';
  sharedFactors: string[];
  componentScores: ComponentScores;
  samePathology: boolean;
  matchBasis: 'pathology-id' | 'recorded-label';
  statisticalCorrelation: false;
}

const WEIGHTS: Record<Component, number> = {
  coDiagnoses: 25,
  medicalHistory: 25,
  medications: 20,
  laboratory: 15,
  symptoms: 5,
  chronology: 5,
  age: 5,
};

function normalized(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Full recorded label only: no substring, abbreviation, translation or diagnostic inference. */
export function normalizeRecordedConditionLabel(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr')
    .replace(/[’‘]/g, "'").replace(/\s+/gu, ' ').trim();
}

function isValidDate(raw: string | null | undefined): raw is string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const timestamp = Date.parse(raw + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === raw;
}

/** The selector contains only diagnoses actually associated with this dossier. */
export function buildPathologyChoices(
  primary: { id?: string | null; name?: string | null; icdCode?: string | null } | null,
  secondary: Array<{ id?: string | null; name?: string | null; icdCode?: string | null }> = [],
  medicalHistory: RecordedMedicalHistory[] = [],
): PathologyChoice[] {
  const seen = new Map<string, PathologyChoice>();
  for (const item of [...(primary ? [primary] : []), ...secondary]) {
    if (!item.id || !item.name?.trim()) continue;
    if (!seen.has(item.id)) seen.set(item.id, { id: item.id, name: item.name.trim(), icdCode: item.icdCode, source: 'catalogue' });
  }
  const historyLabels = new Set<string>();
  // Stable row IDs allow the gateway to re-read and authorize the selection.
  for (const item of [...medicalHistory].sort((a, b) => a.id.localeCompare(b.id))) {
    const label = normalizeRecordedConditionLabel(item.name);
    if (!item.id || item.conditionType !== 'disease' || !label || historyLabels.has(label)) continue;
    historyLabels.add(label);
    const id = `history:${item.id}`;
    seen.set(id, { id, name: item.name.trim(), source: 'history' });
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr') || a.id.localeCompare(b.id));
}

function jaccard(a: Set<string>, b: Set<string>): number | null {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return null;
  let common = 0;
  for (const key of a) if (b.has(key)) common++;
  return common / union.size;
}

function diseases(profile: ClinicalPatientProfile, selected: string) {
  return new Set(profile.diagnoses.map(d => d.pathologyId).filter(id => !!id && id !== selected));
}

function histories(profile: ClinicalPatientProfile) {
  return new Set(profile.history.map(x => normalized(x.name)).filter(Boolean));
}

function medications(profile: ClinicalPatientProfile) {
  return new Set(profile.medications.map(x => {
    const substance = normalized(x.substance);
    if (substance) return `s:${substance}`;
    const atc = normalized(x.atcCode);
    if (atc) return `atc:${atc}`;
    return x.medicationId ? `id:${x.medicationId.toLowerCase()}` : '';
  }).filter(Boolean));
}

function symptoms(profile: ClinicalPatientProfile) {
  return new Set(profile.symptoms.map(x => x.id).filter(Boolean));
}

type LabState = 'high' | 'low' | 'normal' | 'abnormal';
function labState(l: ClinicalPatientProfile['labs'][number]): LabState | null {
  if (l.value === null || !Number.isFinite(l.value)) return null;
  const min = l.referenceMin !== null && l.referenceMin !== undefined && Number.isFinite(l.referenceMin) ? l.referenceMin : null;
  const max = l.referenceMax !== null && l.referenceMax !== undefined && Number.isFinite(l.referenceMax) ? l.referenceMax : null;
  if (min !== null && max !== null && min > max) return null; // Invalid laboratory metadata.

  const rangeState = min !== null && l.value < min ? 'low'
    : max !== null && l.value > max ? 'high'
      : min !== null || max !== null ? 'normal' : null;
  if (rangeState !== null) {
    if (l.isAbnormal === true && rangeState === 'normal') return null;
    if (l.isAbnormal === false && rangeState !== 'normal') return null;
    return rangeState;
  }
  if (l.isAbnormal === true) return 'abnormal';
  if (l.isAbnormal === false) return 'normal';
  return null;
}

function latestLabStates(profile: ClinicalPatientProfile) {
  const map = new Map<string, { label: string; unit: string; state: LabState; date: string }>();
  for (const l of profile.labs) {
    const label = normalized(l.name);
    const unit = normalized(l.unit);
    if (!label || !unit) continue;
    const state = labState(l);
    if (!state) continue;
    const date = isValidDate(l.measuredAt) ? l.measuredAt : '';
    const key = `${label}\u0000${unit}`;
    if (!map.has(key) || date > map.get(key)!.date) map.set(key, { label: l.name, unit: l.unit!, state, date });
  }
  return map;
}

function compareLabs(source: ClinicalPatientProfile, other: ClinicalPatientProfile) {
  const a = latestLabStates(source), b = latestLabStates(other);
  const scores: number[] = [], shared: string[] = [];
  for (const [key, sourceLab] of a) {
    const peerLab = b.get(key);
    if (!peerLab) continue;
    if (sourceLab.state === peerLab.state) {
      scores.push(1);
      shared.push(`Biologie concordante : ${sourceLab.label} (${sourceLab.unit}, ${sourceLab.state === 'high' ? 'haut' : sourceLab.state === 'low' ? 'bas' : sourceLab.state === 'normal' ? 'dans les références' : 'anormal'})`);
    } else if (sourceLab.state === 'abnormal' && ['high', 'low'].includes(peerLab.state) || peerLab.state === 'abnormal' && ['high', 'low'].includes(sourceLab.state)) {
      scores.push(0.5);
    } else {
      scores.push(0);
    }
  }
  return { score: scores.length ? scores.reduce((sum, x) => sum + x, 0) / scores.length : null, shared };
}

function indexDate(profile: ClinicalPatientProfile, chosen: string): number | null {
  const dates = profile.diagnoses.filter(d => d.pathologyId === chosen && isValidDate(d.diagnosedAt)).map(d => Date.parse(d.diagnosedAt! + 'T00:00:00Z'));
  return dates.length ? Math.min(...dates) : null;
}

function historyTimeline(profile: ClinicalPatientProfile, chosen: string) {
  const date = indexDate(profile, chosen);
  const result = new Map<string, number>();
  if (date === null) return result;
  for (const h of profile.history) {
    if (!isValidDate(h.diagnosisDate)) continue;
    const historyDate = Date.parse(h.diagnosisDate + 'T00:00:00Z');
    if (historyDate > date) continue; // Do not imply a future condition was a preceding risk factor.
    const key = normalized(h.name);
    if (key && !result.has(key)) result.set(key, (date - historyDate) / 86400000);
  }
  return result;
}

function compareChronology(source: ClinicalPatientProfile, other: ClinicalPatientProfile, selected: string): number | null {
  const a = historyTimeline(source, selected);
  const b = historyTimeline(other, selected);
  const scores: number[] = [];
  for (const [key, days] of a) {
    if (!b.has(key)) continue;
    scores.push(Math.max(0, 1 - Math.abs(days - b.get(key)!) / 3650));
  }
  return scores.length ? scores.reduce((sum, x) => sum + x, 0) / scores.length : null;
}

function commonLabels<T>(items: T[], key: (item: T) => string, target: Set<string>, label: (item: T) => string, prefix: string) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const k = key(item);
    if (!k || !target.has(k) || seen.has(k)) continue;
    seen.add(k);
    result.push(`${prefix} : ${label(item)}`);
  }
  return result;
}

function scoreProfile(source: ClinicalPatientProfile, other: ClinicalPatientProfile, selected: string): RankedPatientMatch {
  const sourceDiseases = diseases(source, selected), otherDiseases = diseases(other, selected);
  const sourceHistory = histories(source), otherHistory = histories(other);
  const sourceMedication = medications(source), otherMedication = medications(other);
  const sourceSymptoms = symptoms(source), otherSymptoms = symptoms(other);
  const labs = compareLabs(source, other);
  const ageKnown = typeof source.age === 'number' && Number.isFinite(source.age) && source.age >= 0 && typeof other.age === 'number' && Number.isFinite(other.age) && other.age >= 0;
  const componentScores: ComponentScores = {
    coDiagnoses: jaccard(sourceDiseases, otherDiseases),
    medicalHistory: jaccard(sourceHistory, otherHistory),
    medications: jaccard(sourceMedication, otherMedication),
    laboratory: labs.score,
    symptoms: jaccard(sourceSymptoms, otherSymptoms),
    chronology: compareChronology(source, other, selected),
    age: ageKnown ? Math.max(0, 1 - Math.abs(source.age! - other.age!) / 40) : null,
  };

  let availableWeight = 0;
  let weightedValue = 0;
  for (const [component, weight] of Object.entries(WEIGHTS) as [Component, number][]) {
    const s = componentScores[component];
    if (s === null) continue;
    availableWeight += weight;
    weightedValue += weight * s;
  }
  // Coverage penalty prevents a single matching age or lab measurement from suggesting a high resemblance.
  const coverageMultiplier = Math.min(1, availableWeight / 60);
  const score = availableWeight > 0 ? Math.round(100 * weightedValue / availableWeight * coverageMultiplier) : 0;
  const sharedFactors = [
    ...commonLabels(source.diagnoses, x => x.pathologyId !== selected ? x.pathologyId : '', otherDiseases, x => x.name?.trim() || 'Diagnostic codé', 'Autre diagnostic commun'),
    ...commonLabels(source.history, x => normalized(x.name), otherHistory, x => x.name, 'Antécédent commun'),
    ...commonLabels(source.medications, x => {
      const s = normalized(x.substance);if(s)return `s:${s}`;
      const atc = normalized(x.atcCode);if(atc)return `atc:${atc}`;
      return x.medicationId ? `id:${x.medicationId.toLowerCase()}` : '';
    }, otherMedication, x => x.substance?.trim() || x.atcCode?.trim() || 'Médicament codé', 'Traitement commun'),
    ...labs.shared,
  ].slice(0, 12);

  return {
    patientId: other.id,
    patientCode: other.patientCode,
    age: other.age,
    score: Math.max(0, Math.min(100, score)),
    coveragePercent: availableWeight,
    evidenceLevel: availableWeight >= 65 ? 'documented' : availableWeight >= 35 ? 'partial' : 'insufficient',
    sharedFactors,
    componentScores,
    samePathology: true,
    matchBasis: 'pathology-id',
    statisticalCorrelation: false,
  };
}

/** Rank only peers with the same canonical pathology ID; always exclude the source. */
export function rankExactPathologyMatches(source: ClinicalPatientProfile, selectedPathologyId: string, candidates: ClinicalPatientProfile[]): RankedPatientMatch[] {
  if (!source.diagnoses.some(d => d.pathologyId === selectedPathologyId)) return [];
  const unique = new Map<string, ClinicalPatientProfile>();
  for (const candidate of candidates) {
    if (candidate.id === source.id || unique.has(candidate.id)) continue;
    if (!candidate.diagnoses.some(d => d.pathologyId === selectedPathologyId)) continue;
    unique.set(candidate.id, candidate);
  }
  return [...unique.values()]
    .map(other => scoreProfile(source, other, selectedPathologyId))
    .sort((a, b) => b.score - a.score || b.coveragePercent - a.coveragePercent || a.patientCode.localeCompare(b.patientCode, 'fr') || a.patientId.localeCompare(b.patientId));
}

/**
 * Uncoded entries can be compared by their complete recorded label. This is
 * explicitly weaker than a shared canonical diagnosis and never establishes one.
 */
export function rankRecordedConditionMatches(source: ClinicalPatientProfile, selectedName: string, candidates: ClinicalPatientProfile[]): RankedPatientMatch[] {
  const label = normalizeRecordedConditionLabel(selectedName);
  const matchesHistory = (h: ClinicalPatientProfile['history'][number]) => h.conditionType === 'disease' && normalizeRecordedConditionLabel(h.name) === label;
  const matchesDiagnosis = (d: RecordedPathology) => normalizeRecordedConditionLabel(d.name) === label;
  if (!label || !source.history.some(matchesHistory)) return [];

  const comparisonKey = `recorded-label:${label}`;
  const forComparison = (profile: ClinicalPatientProfile): ClinicalPatientProfile => ({
    ...profile,
    // Temporary scoring anchors retain recorded dates. They are never persisted
    // or returned as coded diagnoses. The chosen item is not counted twice.
    diagnoses: [
      ...profile.diagnoses.filter(d => !matchesDiagnosis(d)),
      ...profile.diagnoses.filter(matchesDiagnosis).map(d => ({ pathologyId: comparisonKey, diagnosedAt: d.diagnosedAt })),
      ...profile.history.filter(matchesHistory).map(h => ({ pathologyId: comparisonKey, diagnosedAt: h.diagnosisDate })),
    ],
    history: profile.history.filter(h => !matchesHistory(h)),
  });
  const own = forComparison(source);
  const unique = new Map<string, ClinicalPatientProfile>();
  for (const candidate of candidates) {
    if (candidate.id === source.id || unique.has(candidate.id)) continue;
    if (!candidate.history.some(matchesHistory) && !candidate.diagnoses.some(matchesDiagnosis)) continue;
    unique.set(candidate.id, candidate);
  }
  return [...unique.values()]
    .map(other => ({
      ...scoreProfile(own, forComparison(other), comparisonKey),
      samePathology: false,
      matchBasis: 'recorded-label' as const,
    }))
    .sort((a, b) => b.score - a.score || b.coveragePercent - a.coveragePercent || a.patientCode.localeCompare(b.patientCode, 'fr') || a.patientId.localeCompare(b.patientId));
}
