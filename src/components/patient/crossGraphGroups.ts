import { normalizeMedicalName, type MedicalEntityType, type SelectedElement } from '../../../supabase/functions/cross-data-analyzer/analysis-utils.ts';
import { RELATION_ENGINE_VERSION, RELATION_KINDS, type RelationMetadata } from '../../../supabase/functions/cross-data-analyzer/relation-contract.ts';

export interface GraphEntity {
  id: string;
  name: string;
  type: MedicalEntityType;
}

export interface GraphAnalysisSnapshot {
  jobId: string;
  elements: SelectedElement[];
  selection: Record<string, unknown>;
}

export interface GraphSelectionIds {
  pathologyIds: string[]; symptomIds: string[]; treatmentIds: string[]; medicationIds: string[];
}

const selectionFields = [
  ['pathology', 'pathologyIds', 'externalPathologies'], ['symptom', 'symptomIds', 'externalSymptoms'],
  ['treatment', 'treatmentIds', 'externalTreatments'], ['medication', 'medicationIds', 'externalMedications'],
] as const;

export function snapshotExternalEntities(selection: Record<string, unknown>): GraphEntity[] {
  return selectionFields.flatMap(([type, , externalKey]) => {
    const values = selection[externalKey];
    return Array.isArray(values) ? values.flatMap(value => {
      if (!value || typeof value !== 'object' || typeof value.id !== 'string' || typeof value.name !== 'string') return [];
      return [{ id: value.id, name: value.name, type }];
    }) : [];
  });
}

/** Restore IDs once per job in the parent, including persisted external concepts. */
export function snapshotSelectionIds(selection: Record<string, unknown>): GraphSelectionIds {
  const restored: GraphSelectionIds = { pathologyIds: [], symptomIds: [], treatmentIds: [], medicationIds: [] };
  const external = snapshotExternalEntities(selection);
  for (const [type, idsKey] of selectionFields) {
    const values = selection[idsKey];
    restored[idsKey] = [...new Set([...(Array.isArray(values) ? values.filter((id): id is string => typeof id === 'string') : []),
      ...external.filter(entity => entity.type === type).map(entity => entity.id)])];
  }
  return restored;
}

export function graphSelectionSignature(selection: Partial<GraphSelectionIds>): string {
  return JSON.stringify(selectionFields.map(([, idsKey]) => [...new Set(selection[idsKey] || [])].sort()));
}

/** The snapshot label/type is authoritative, even if a catalogue row changed or
 * an external concept is no longer loaded. Unresolved IDs are never sent as DB IDs. */
export function restoreSnapshotGraphEntities(snapshot: GraphAnalysisSnapshot, catalogue: GraphEntity[]): GraphEntity[] {
  const ids = snapshotSelectionIds(snapshot.selection);
  const candidates = [...snapshotExternalEntities(snapshot.selection), ...catalogue];
  return uniqueEntities(snapshot.elements.map(element => {
    const key = canonicalGraphKey(element);
    const field = selectionFields.find(([type]) => type === element.type)![1];
    const match = candidates.find(candidate => ids[field].includes(candidate.id) && canonicalGraphKey(candidate) === key);
    return { ...match, id: match?.id || `snapshot-${stableLinkHash(key)}`, name: element.name, type: element.type };
  }));
}

/** Preserve available DB metadata, but explicitly re-submit missing/renamed
 * snapshot concepts as external names rather than invented database IDs. */
export function reconcileGraphSelectionRequest<T extends Record<string, unknown>>(request: T, entities: GraphEntity[], catalogue: GraphEntity[]): T & Record<string, unknown> {
  const result: Record<string, unknown> = { ...request };
  for (const [type, idsKey, externalKey] of selectionFields) {
    const unresolved = entities.filter(entity => entity.type === type && !catalogue.some(candidate =>
      candidate.type === type && candidate.id === entity.id && canonicalGraphKey(candidate) === canonicalGraphKey(entity)));
    const unresolvedIds = new Set(unresolved.map(entity => entity.id));
    result[idsKey] = (Array.isArray(result[idsKey]) ? result[idsKey] as string[] : []).filter(id => !unresolvedIds.has(id));
    result[externalKey] = [...(Array.isArray(result[externalKey]) ? result[externalKey] as {id: string; name: string}[] : [])
      .filter(entity => !unresolvedIds.has(entity.id)), ...unresolved.map(({ id, name }) => ({ id, name }))];
  }
  return result as T & Record<string, unknown>;
}

export interface GraphRelation extends RelationMetadata {
  from: string;
  to: string;
  fromType?: string;
  toType?: string;
  relationship?: string;
  evidence?: string;
  webSources?: string[];
}

export interface GraphNodeIdentity {
  id: string;
  parentId?: string;
  data: Record<string, unknown>;
}

export type GraphMembershipKind = 'pathology' | 'indication' | 'manifestation' | 'adjunctive_use' | 'adverse_effect';

export interface GraphEntityInstance {
  id: string;
  canonicalId: string;
  entityId: string;
  name: string;
  type: MedicalEntityType;
  groupId?: string;
  membershipKinds: GraphMembershipKind[];
  sharedGroupCount: number;
}

export interface AutomaticPathologyGroup {
  id: string;
  pathologyId: string;
  pathologyCanonicalId: string;
  pathologyName: string;
  memberIds: string[];
}

const entityTypes: readonly string[] = ['pathology', 'symptom', 'treatment', 'medication'];
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const isMedicalType = (type: unknown): type is MedicalEntityType => typeof type === 'string' && entityTypes.includes(type);

/** Matches the same typed, whole-label identity used by the analysis matrix.
 * Visual copies must never be sent to the API as additional clinical entities. */
export function canonicalGraphKey(entity: Pick<GraphEntity, 'type' | 'name'>): string {
  return `${entity.type}:${normalizeMedicalName(entity.name)}`;
}

export function graphEntityFromNode(node: GraphNodeIdentity): GraphEntity | null {
  if (!isMedicalType(node.data.type) || typeof node.data.label !== 'string' || !node.data.label.trim()) return null;
  return {
    id: typeof node.data.entityId === 'string' ? node.data.entityId : node.id,
    name: node.data.label,
    type: node.data.type,
  };
}

function uniqueEntities(entities: GraphEntity[]): GraphEntity[] {
  const unique = new Map<string, GraphEntity>();
  for (const entity of entities) {
    if (!entity.id || !entity.name.trim() || !isMedicalType(entity.type)) continue;
    const key = canonicalGraphKey(entity);
    const previous = unique.get(key);
    // Sorting the representative makes restored and incrementally built graphs
    // stable even if two imported records share the same typed clinical label.
    if (!previous || compare(entity.id, previous.id) < 0) unique.set(key, entity);
  }
  return [...unique.entries()].sort(([a], [b]) => compare(a, b)).map(([, entity]) => entity);
}

export function collectCanonicalGraphEntities(nodes: GraphNodeIdentity[]): GraphEntity[] {
  return uniqueEntities(nodes.flatMap(node => {
    const entity = graphEntityFromNode(node);
    return entity ? [entity] : [];
  }));
}

export function graphSelectionIds(nodes: GraphNodeIdentity[]) {
  const selection = { pathologyIds: [] as string[], symptomIds: [] as string[], treatmentIds: [] as string[], medicationIds: [] as string[] };
  const fieldByType = { pathology: 'pathologyIds', symptom: 'symptomIds', treatment: 'treatmentIds', medication: 'medicationIds' } as const;
  for (const entity of collectCanonicalGraphEntities(nodes)) {
    const values = selection[fieldByType[entity.type]];
    if (!values.includes(entity.id)) values.push(entity.id);
  }
  return selection;
}

function isReviewedRelation(link: GraphRelation): boolean {
  return link.validationVersion === RELATION_ENGINE_VERSION &&
    !!link.relationKind && RELATION_KINDS.includes(link.relationKind) && link.relationKind !== 'uncertain' &&
    isMedicalType(link.fromType) && isMedicalType(link.toType);
}

function linkEntityKey(name: string, type: string | undefined): string | null {
  return isMedicalType(type) ? canonicalGraphKey({ name, type }) : null;
}

const groupIdFor = (canonicalId: string) => `auto-pathology:${encodeURIComponent(canonicalId)}`;
const instanceIdFor = (canonicalId: string, groupId?: string) =>
  `clinical:${encodeURIComponent(canonicalId)}:${groupId ? encodeURIComponent(groupId) : 'unassigned'}`;

function stableLinkHash(value: string): string {
  let hash = 14695981039346656037n;
  for (const character of value) {
    hash ^= BigInt(character.codePointAt(0)!);
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  }
  return hash.toString(16);
}

/** A visual membership is derived only from an explicit reviewed relation.
 * Contextual/uncertain indications and danger links never become treatment
 * memberships. Adjunctive use keeps its separate, non-indication role. */
export function buildAutomaticPathologyGraph(entities: GraphEntity[], links: GraphRelation[]): {
  groups: AutomaticPathologyGroup[];
  instances: GraphEntityInstance[];
} {
  const canonical = uniqueEntities(entities);
  const byKey = new Map(canonical.map(entity => [canonicalGraphKey(entity), entity]));
  const memberships = new Map<string, Map<string, Set<GraphMembershipKind>>>();
  const pathologies = canonical.filter(entity => entity.type === 'pathology');
  const addMember = (pathologyKey: string, memberKey: string, kind: GraphMembershipKind) => {
    const members = memberships.get(pathologyKey);
    if (!members) return;
    const kinds = members.get(memberKey) ?? new Set<GraphMembershipKind>();
    kinds.add(kind);
    members.set(memberKey, kinds);
  };
  for (const pathology of pathologies) {
    const key = canonicalGraphKey(pathology);
    memberships.set(key, new Map([[key, new Set<GraphMembershipKind>(['pathology'])]]));
  }

  const reviewed = links.filter(isReviewedRelation);
  for (const link of reviewed) {
    const fromKey = linkEntityKey(link.from, link.fromType)!;
    const toKey = linkEntityKey(link.to, link.toType)!;
    const from = byKey.get(fromKey), to = byKey.get(toKey);
    if (!from || !to) continue;
    const pathologyKey = from.type === 'pathology' ? fromKey : to.type === 'pathology' ? toKey : null;
    if (!pathologyKey) continue;
    const otherKey = pathologyKey === fromKey ? toKey : fromKey;
    const other = byKey.get(otherKey)!;
    if (other.type === 'medication' || other.type === 'treatment') {
      if (link.relationKind === 'indication' && link.evidenceSupport === 'direct') {
        addMember(pathologyKey, otherKey, 'indication');
      } else if (link.relationKind === 'adjunctive_use' && link.evidenceSupport) {
        addMember(pathologyKey, otherKey, 'adjunctive_use');
      }
    } else if (other.type === 'symptom' && link.relationKind === 'manifestation' && link.evidenceSupport === 'direct') {
      addMember(pathologyKey, otherKey, 'manifestation');
    }
  }

  // A second pass makes drug-related symptom placement independent of the
  // order in which the agent returns batches. It does not infer disease causality.
  for (const link of reviewed) {
    if (link.relationKind !== 'adverse_effect' || link.evidenceSupport !== 'direct') continue;
    const fromKey = linkEntityKey(link.from, link.fromType)!;
    const toKey = linkEntityKey(link.to, link.toType)!;
    const from = byKey.get(fromKey), to = byKey.get(toKey);
    if (!from || !to || !['medication', 'treatment'].includes(from.type) || to.type !== 'symptom') continue;
    for (const [pathologyKey, members] of memberships) {
      if (members.has(fromKey)) addMember(pathologyKey, toKey, 'adverse_effect');
    }
  }

  const instances: GraphEntityInstance[] = [];
  const groups: AutomaticPathologyGroup[] = pathologies.map(pathology => {
    const pathologyCanonicalId = canonicalGraphKey(pathology);
    const id = groupIdFor(pathologyCanonicalId);
    return { id, pathologyCanonicalId, pathologyName: pathology.name,
      pathologyId: instanceIdFor(pathologyCanonicalId, id), memberIds: [] };
  });
  for (const entity of canonical) {
    const canonicalId = canonicalGraphKey(entity);
    const parentKeys = [...memberships].filter(([, members]) => members.has(canonicalId)).map(([key]) => key);
    const placements: (string | undefined)[] = parentKeys.length ? parentKeys : [undefined];
    for (const parentKey of placements) {
      const groupId = parentKey ? groupIdFor(parentKey) : undefined;
      const instance: GraphEntityInstance = {
        id: instanceIdFor(canonicalId, groupId), canonicalId, entityId: entity.id,
        name: entity.name, type: entity.type, ...(groupId ? { groupId } : {}),
        membershipKinds: parentKey ? [...memberships.get(parentKey)!.get(canonicalId)!].sort(compare) : [],
        sharedGroupCount: parentKeys.length,
      };
      instances.push(instance);
      groups.find(group => group.id === groupId)?.memberIds.push(instance.id);
    }
  }
  return { groups, instances };
}

/** Expand a clinical relation only into useful visual edges. Shared groups get
 * one edge each; otherwise one inter-group edge represents the canonical link.
 * Hidden copies are excluded before choosing endpoints, preserving another
 * visible representation of the same interaction. */
export function projectClinicalGraphLinks<T extends GraphRelation>(links: T[], nodes: GraphNodeIdentity[], hidden: ReadonlySet<string> = new Set()): {
  id: string; source: string; target: string; canonicalLinkId: string; link: T;
}[] {
  const byCanonical = new Map<string, GraphNodeIdentity[]>();
  for (const node of nodes) {
    const entity = graphEntityFromNode(node);
    if (!entity || hidden.has(node.id) || (node.parentId && hidden.has(node.parentId))) continue;
    const key = canonicalGraphKey(entity);
    const copies = byCanonical.get(key) ?? [];
    copies.push(node);
    byCanonical.set(key, copies);
  }
  for (const copies of byCanonical.values()) copies.sort((a, b) => compare(a.id, b.id));

  const result: ReturnType<typeof projectClinicalGraphLinks<T>> = [];
  const seen = new Set<string>();
  for (const link of links) {
    if (!isReviewedRelation(link)) continue;
    const fromKey = linkEntityKey(link.from, link.fromType)!;
    const toKey = linkEntityKey(link.to, link.toType)!;
    if (fromKey === toKey) continue;
    const sources = byCanonical.get(fromKey) ?? [], targets = byCanonical.get(toKey) ?? [];
    if (!sources.length || !targets.length) continue;
    // One pair can contain several mechanisms, even with the same relation
    // kind. Only exact clinical findings are collapsed across visual aliases.
    const canonicalLinkId = JSON.stringify([fromKey, toKey, link.relationKind, link.interactionEffect ?? null,
      normalizeMedicalName(link.relationship), normalizeMedicalName(link.evidence), [...new Set(link.webSources || [])].sort(compare)]);
    const colocated = sources.flatMap(source => targets.filter(target => source.parentId && source.parentId === target.parentId)
      .map(target => ({ source, target })));
    const placements = colocated.length ? colocated : [{ source: sources[0], target: targets[0] }];
    for (const { source, target } of placements) {
      const identity = JSON.stringify([canonicalLinkId, source.id, target.id]);
      if (seen.has(identity)) continue;
      seen.add(identity);
      const id = `reviewed:${stableLinkHash(identity)}`;
      result.push({ id, source: source.id, target: target.id, canonicalLinkId, link });
    }
  }
  return result;
}
