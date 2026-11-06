import { ALL_ANATOMY_PARTS, type AnatomyPart } from '../data/anatomyData';
import { locateAlert, meshOrgan } from './anatomicalTwin';

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/_/g, ' ').replace(/\s+/g, ' ');
}

// Only complete names/IDs from the existing catalogue are aliases. Ambiguous
// aliases remain unavailable; descriptions and patient prose are never searched.
const anatomyByAlias = new Map<string, AnatomyPart | null>();
for (const part of ALL_ANATOMY_PARTS) {
  for (const value of [part.id, part.name, part.nameEn]) {
    const alias = normalizeIdentifier(value);
    const previous = anatomyByAlias.get(alias);
    if (previous === undefined) anatomyByAlias.set(alias, part);
    else if (previous?.id !== part.id) anatomyByAlias.set(alias, null);
  }
}

/** Shared by material highlighting and picking, so the popup explains the same alerts. */
export function getMeshAlertSelection<T extends { organ?: string; level: string }>(
  name: string,
  system: string | undefined,
  alerts: T[],
): { label: string; alerts: T[] } | null {
  const fullName = normalizeIdentifier(name);
  if (!fullName) return null;

  // The supplied atlas uses "FJ3259 left femur" identifiers. Strip only this
  // known code prefix; keep side, structure and qualifiers in the complete name.
  const atlasName = /^(fj\d+)(?:\s+(.+))?$/.exec(fullName);
  const structureName = atlasName?.[2] || fullName;
  const part = anatomyByAlias.get(structureName);
  const identifiers = new Set([fullName, structureName]);
  if (atlasName) identifiers.add(atlasName[1]);
  const organ = meshOrgan(name, system);
  const region = locateAlert(organ);
  const matching = alerts.filter(alert => {
    if (alert.level === 'INFO' || !alert.organ?.trim()) return false;
    if (organ && locateAlert(alert.organ)?.id === organ) return true;
    const identifier = normalizeIdentifier(alert.organ);
    if (identifiers.has(identifier)) return true;
    return Boolean(part && anatomyByAlias.get(identifier)?.id === part.id);
  });
  if (!matching.length) return null;

  const displayName = name.replace(/^fj\d+[\s_]+/i, '').replace(/_/g, ' ').trim();
  return { label: part?.name || region?.label || displayName, alerts: matching };
}

export interface AtlasVisibilityObject {
  visible: boolean;
  parent: AtlasVisibilityObject | null;
}

/** Three's raycaster does not exclude meshes whose parent layer is hidden. */
export function isAtlasObjectVisible(object: AtlasVisibilityObject): boolean {
  for (let current: AtlasVisibilityObject | null = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

export type AtlasClickEvent = Pick<MouseEvent,
  'clientX' | 'clientY' | 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey'>;
export type AtlasPointerEvent = AtlasClickEvent & Pick<PointerEvent, 'pointerId'>;

/** Attach pointer methods in DOM capture, then consume once in the scene click handler. */
export function createAtlasClickGuard() {
  const pointers = new Set<number>();
  let gesture: {
    pointerId: number;
    startX: number;
    startY: number;
    blocked: boolean;
    released: boolean;
  } | null = null;

  const hasModifier = (event: AtlasClickEvent) => event.ctrlKey || event.metaKey || event.shiftKey;
  const observe = (event: AtlasClickEvent) => {
    if (!gesture) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    // Once blocked, an out-and-back drag cannot become a click on release.
    if (hasModifier(event) || !Number.isFinite(dx + dy) || dx * dx + dy * dy > 16) {
      gesture.blocked = true;
    }
  };

  return {
    pointerDown(event: AtlasPointerEvent): void {
      if (pointers.size === 0) {
        gesture = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          blocked: event.button !== 0 || hasModifier(event),
          released: false,
        };
        observe(event);
      } else if (gesture) {
        gesture.blocked = true;
      }
      pointers.add(event.pointerId);
    },
    pointerMove(event: AtlasPointerEvent): void {
      if (pointers.has(event.pointerId)) observe(event);
    },
    pointerUp(event: AtlasPointerEvent): void {
      if (!pointers.delete(event.pointerId) || !gesture) return;
      observe(event);
      if (event.button !== 0) gesture.blocked = true;
      if (event.pointerId === gesture.pointerId) gesture.released = true;
    },
    cancel(): void {
      pointers.clear();
      gesture = null;
    },
    consumeClick(event: AtlasClickEvent): boolean {
      observe(event);
      const allowed = Boolean(gesture?.released && !gesture.blocked && pointers.size === 0 && event.button === 0);
      gesture = null;
      return allowed;
    },
  };
}
