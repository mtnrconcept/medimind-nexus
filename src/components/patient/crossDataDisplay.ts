export interface CrossDataDisplayLink {
  fromType?: string;
  toType?: string;
  isAppropriate?: boolean;
}

export function isTherapeuticAppropriatenessLink(link: CrossDataDisplayLink): boolean {
  return (
    (link.fromType === 'medication' || link.fromType === 'treatment') &&
    link.toType === 'pathology'
  );
}

export function supportsAppropriatenessBadge(link: CrossDataDisplayLink): boolean {
  return isTherapeuticAppropriatenessLink(link) && typeof link.isAppropriate === 'boolean';
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
