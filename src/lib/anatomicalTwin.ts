export const ANATOMICAL_VIEWS = [
  { id: 'front', label: 'Face', src: '/anatomy/squelette-face.png' },
  { id: 'back', label: 'Dos', src: '/anatomy/squelette-dos.png' },
  { id: 'left', label: 'Profil gauche', src: '/anatomy/squelette-profil-gauche.png' },
  { id: 'right', label: 'Profil droit', src: '/anatomy/squelette-profil-droit.png' },
] as const;
export type AnatomicalView = typeof ANATOMICAL_VIEWS[number]['id'];

export const ATLAS_LAYERS = [
  ['os', 'Os et dents'], ['digestif', 'Appareil digestif'], ['sensoriel', 'Organes sensoriels'],
  ['nerveux', 'Système nerveux'], ['ligaments', 'Ligaments'], ['fascias-tendons', 'Fascias et tendons'],
  ['muscles', 'Muscles'], ['arteres', 'Artères'], ['autres-structures', 'Autres structures'],
  ['endocrinien', 'Système endocrinien'], ['veines', 'Veines'], ['coeur', 'Cœur'],
  ['cartilages', 'Cartilages'], ['respiratoire', 'Appareil respiratoire'],
  ['organes-lymphoides', 'Organes lymphoïdes'], ['peau', 'Peau'],
  ['reproducteur-masculin', 'Appareil reproducteur masculin'], ['urinaire', 'Appareil urinaire'],
  ['membranes', 'Membranes'],
] as const;
export type AtlasLayerId = typeof ATLAS_LAYERS[number][0];
export const DEFAULT_ATLAS_LAYERS: AtlasLayerId[] = ['os', 'digestif', 'coeur', 'respiratoire', 'urinaire'];

// Match explicit anatomy names in the supplied atlas, never patient prose.
export function meshOrgan(name: string, system?: string): string | undefined {
  const value = name.toLowerCase().replace(/_/g, ' ');
  if (system === 'coeur') return 'heart';
  if (/\b(artery|vein|duct|mesentery)\b/.test(value)) return undefined;
  if (/\bkidney\b/.test(value)) return 'kidneys';
  if (/\b(heart|atrium|myocardium|myocardial)\b/.test(value)) return 'heart';
  if (/\b(lung|lungs|bronchial)\b/.test(value)) return 'lungs';
  if (/\bliver\b/.test(value)) return 'liver';
  if (/\bstomach\b/.test(value)) return 'stomach';
  if (/\bpancreas\b/.test(value)) return 'pancreas';
  if (/\b(brain|cerebrum|cerebellum|gyrus|thalamus|hippocampus)\b/.test(value)) return 'brain';
  if (/\b(intestine|colon|jejunum|ileum|duodenum)\b/.test(value)) return 'intestines';
}

// Normalized coordinates on the supplied frontal 1254px canvas. These are
// schematic regions, never measurements inferred from a patient's imaging.
const REGIONS = [
  { id: 'brain', label: 'Cerveau', x: 50, y: 7, width: 9, height: 10, aliases: ['brain', 'cerveau'] },
  { id: 'lungs', label: 'Poumons', x: 50, y: 26, width: 20, height: 16, aliases: ['lungs', 'lung', 'poumons', 'poumon'] },
  { id: 'heart', label: 'Cœur', x: 53, y: 28, width: 8, height: 9, aliases: ['heart', 'coeur', 'cœur'] },
  { id: 'liver', label: 'Foie', x: 45, y: 36, width: 12, height: 8, aliases: ['liver', 'foie'] },
  { id: 'stomach', label: 'Estomac', x: 55, y: 36, width: 9, height: 8, aliases: ['stomach', 'estomac'] },
  { id: 'pancreas', label: 'Pancréas', x: 50, y: 39, width: 12, height: 5, aliases: ['pancreas'] },
  { id: 'kidneys', label: 'Reins', x: 50, y: 40, width: 18, height: 9, aliases: ['kidney', 'kidneys', 'rein', 'reins'] },
  { id: 'intestines', label: 'Intestins', x: 50, y: 45, width: 14, height: 12, aliases: ['intestines', 'intestine', 'intestin', 'intestins'] },
] as const;

export function locateAlert(organ?: string) {
  const normalized = organ?.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return REGIONS.find(region => region.aliases.some(alias => alias === normalized));
}

export function groupLocalizedAlerts<T extends { organ?: string; level: string }>(alerts: T[]) {
  return REGIONS.flatMap(region => {
    const matching = alerts.filter(alert => locateAlert(alert.organ)?.id === region.id);
    return matching.length ? [{ region, alerts: matching, critical: matching.some(alert => alert.level === 'CRITICAL') }] : [];
  });
}
