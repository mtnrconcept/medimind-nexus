export interface CrossDataDisplayLink {
  fromType?: string;
  toType?: string;
  isAppropriate?: boolean;
  relationKind?: string;
  validationVersion?: number;
  evidenceSupport?: string;
}

export function isTherapeuticAppropriatenessLink(link: CrossDataDisplayLink): boolean {
  return (
    (link.fromType === 'medication' || link.fromType === 'treatment') &&
    link.toType === 'pathology'
  );
}

export function supportsAppropriatenessBadge(link: CrossDataDisplayLink): boolean {
  // A model's appropriateness boolean is never a prescribing decision.
  return false;
}

export function isAppropriatenessWarning(link: CrossDataDisplayLink): boolean {
  return supportsAppropriatenessBadge(link) && link.isAppropriate === false;
}

export function isAppropriatenessSuccess(link: CrossDataDisplayLink): boolean {
  return supportsAppropriatenessBadge(link) && link.isAppropriate === true;
}

export function getAppropriatenessBadgeLabel(link: CrossDataDisplayLink): string | null {
  if (!supportsAppropriatenessBadge(link)) return null;
  return link.isAppropriate ? 'Adapté' : 'Contre-indiqué';
}

export interface PairResearchDisplay { status?: 'matched' | 'empty' | 'unavailable'; sources?: unknown[] }
export function matrixEvidenceLabel(research: PairResearchDisplay | undefined, examined: boolean): string {
  if (research?.status === 'unavailable') return 'Source indisponible';
  if (!examined) return 'En attente';
  if (!research?.sources?.length) return 'Preuves insuffisantes';
  return 'Lien non conclu';
}
export function canDisplayRiskScore(links: unknown[] | undefined, score: number | null | undefined): boolean {
  // No clinically calibrated score exists in this tool.
  return false;
}
