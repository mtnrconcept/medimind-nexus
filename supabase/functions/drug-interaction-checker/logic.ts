export type InteractionSeverity = 'unknown' | 'minor' | 'moderate' | 'major' | 'contraindicated';
export type InteractionSourceKind = 'curated' | 'official_label' | 'pharmacovigilance';
export type SourceHealth = 'available' | 'partial' | 'unavailable' | 'not_configured';

export interface InteractionEvidenceInput {
  drugA: string;
  drugB: string;
  source: string;
  sourceKind: InteractionSourceKind;
  severity: InteractionSeverity;
  description: string;
  clinicalAction: string;
  mechanism?: string;
  evidenceLevel?: string;
  url?: string;
}

export interface InteractionEvidence extends InteractionEvidenceInput {
  id: string;
}

export interface AggregatedInteraction {
  drug_a: string;
  drug_b: string;
  severity: InteractionSeverity;
  evidence: InteractionEvidence[];
  clinical_actions: string[];
}

export interface SourceStatus {
  source: string;
  authoritative: boolean;
  status: SourceHealth;
  detail?: string;
}

export interface InteractionSummary {
  verificationComplete: boolean;
  message: string;
  totalInteractions: number;
  majorInteractions: number;
  contraindicatedInteractions: number;
}

const severityRank: Record<InteractionSeverity, number> = {
  unknown: 0,
  minor: 1,
  moderate: 2,
  major: 3,
  contraindicated: 4,
};

function normalizeDrugName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr');
}

function displayDrugName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function pairKey(drugA: string, drugB: string): string {
  return [normalizeDrugName(drugA), normalizeDrugName(drugB)].sort().join('|');
}

export function normalizeSeverity(value: unknown): InteractionSeverity {
  const normalized = String(value || '').trim().toLowerCase();
  if (['contraindicated', 'contre-indique', 'contre-indiquée', 'contre-indiquee'].includes(normalized)) return 'contraindicated';
  if (['major', 'severe', 'serious', 'grave', 'critical'].includes(normalized)) return 'major';
  if (['moderate', 'modere', 'modérée', 'moderee'].includes(normalized)) return 'moderate';
  if (['minor', 'mild', 'leger', 'légère', 'legere'].includes(normalized)) return 'minor';
  return 'unknown';
}

export function severityFromText(text: string): InteractionSeverity {
  const value = text.toLowerCase();
  if (/\b(contraindicat|do not use|must not be used|avoid combination|association.*à éviter|association.*a eviter)\b/.test(value)) return 'contraindicated';
  if (/\b(major|serious interaction|severe interaction|interaction grave|risque grave|life[- ]threatening)\b/.test(value)) return 'major';
  if (/\b(moderate|monitor closely|surveillance rapprochée|surveillance rapprochee)\b/.test(value)) return 'moderate';
  if (/\b(minor|mild interaction|interaction légère|interaction legere)\b/.test(value)) return 'minor';
  return 'unknown';
}

function strongerSeverity(left: InteractionSeverity, right: InteractionSeverity): InteractionSeverity {
  return severityRank[right] > severityRank[left] ? right : left;
}

function effectiveEvidenceSeverity(evidence: InteractionEvidenceInput): InteractionSeverity {
  if (evidence.sourceKind === 'pharmacovigilance') return 'unknown';
  return normalizeSeverity(evidence.severity);
}

function evidenceId(evidence: InteractionEvidenceInput): string {
  const raw = [pairKey(evidence.drugA, evidence.drugB), evidence.source, evidence.sourceKind, evidence.description]
    .join('|')
    .toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `evidence-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function aggregateInteractionEvidence(inputs: InteractionEvidenceInput[]): AggregatedInteraction[] {
  const groups = new Map<string, AggregatedInteraction>();
  const seenEvidence = new Set<string>();

  for (const input of inputs) {
    const drugA = displayDrugName(input.drugA);
    const drugB = displayDrugName(input.drugB);
    if (!drugA || !drugB || normalizeDrugName(drugA) === normalizeDrugName(drugB)) continue;

    const key = pairKey(drugA, drugB);
    const id = evidenceId(input);
    if (seenEvidence.has(id)) continue;
    seenEvidence.add(id);

    const existing = groups.get(key) || {
      drug_a: drugA,
      drug_b: drugB,
      severity: 'unknown' as InteractionSeverity,
      evidence: [],
      clinical_actions: [],
    };

    existing.severity = strongerSeverity(existing.severity, effectiveEvidenceSeverity(input));
    existing.evidence.push({ ...input, drugA, drugB, severity: normalizeSeverity(input.severity), id });
    if (input.clinicalAction && !existing.clinical_actions.includes(input.clinicalAction)) {
      existing.clinical_actions.push(input.clinicalAction);
    }
    groups.set(key, existing);
  }

  return [...groups.values()].sort((left, right) => {
    const severityDelta = severityRank[right.severity] - severityRank[left.severity];
    if (severityDelta !== 0) return severityDelta;
    return pairKey(left.drug_a, left.drug_b).localeCompare(pairKey(right.drug_a, right.drug_b));
  });
}

export function buildInteractionSummary(
  interactions: AggregatedInteraction[],
  sourceStatuses: SourceStatus[],
): InteractionSummary {
  const authoritativeSources = sourceStatuses.filter((source) => source.authoritative);
  const verificationComplete = authoritativeSources.length > 0 && authoritativeSources.every((source) => source.status === 'available');
  const contraindicatedInteractions = interactions.filter((interaction) => interaction.severity === 'contraindicated').length;
  const majorInteractions = interactions.filter((interaction) => interaction.severity === 'major').length;

  let message: string;
  if (interactions.length === 0) {
    message = verificationComplete
      ? 'Aucune interaction documentée n’a été retrouvée dans les sources autoritatives consultées. Cela ne garantit pas une absence absolue de risque clinique.'
      : 'Vérification incomplète : aucune interaction ne peut être exclue car une ou plusieurs sources autoritatives sont indisponibles, partielles ou non configurées.';
  } else {
    const base = `${interactions.length} interaction(s) ou signal(aux) documenté(s) ont été regroupés avec conservation de toutes les preuves disponibles.`;
    message = verificationComplete
      ? base
      : `${base} Vérification incomplète : une ou plusieurs sources autoritatives n’ont pas pu être vérifiées intégralement.`;
  }

  return {
    verificationComplete,
    message,
    totalInteractions: interactions.length,
    majorInteractions,
    contraindicatedInteractions,
  };
}
