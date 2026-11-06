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

const interactionEffects: Readonly<Record<string, string>> = {
  increase_effect: 'Potentialisation / augmentation de l’effet',
  decrease_effect: 'Diminution de l’effet',
  cancel_effect: 'Annulation d’effet rapportée',
  increase_toxicity: 'Augmentation de la toxicité',
  mixed: 'Effets multiples',
  unknown: 'Effet non déterminé',
};

/** Preserve the reported effect; a decrease never implies complete cancellation. */
export function interactionEffectLabel(effect: string | undefined): string | null {
  return effect && Object.prototype.hasOwnProperty.call(interactionEffects, effect) ? interactionEffects[effect] : null;
}

/** Bibliographic links may navigate only to HTTPS pages, never active URLs or embedded credentials. */
export function clinicalSourceUrls(values: readonly string[] | undefined): string[] {
  return [...new Set((Array.isArray(values) ? values : []).flatMap(value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password ? [url.href] : [];
    } catch { return []; }
  }))];
}
