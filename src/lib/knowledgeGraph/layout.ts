import type { KnowledgeGraphModel, KnowledgeNode, GraphFamily } from './model';

export type Point3 = [number, number, number];
export interface PositionedNode {
  node: KnowledgeNode;
  position: Point3;
  radius: number;
  isCenter: boolean;
  isCore: boolean;
  showLabel: boolean;
}
export interface Constellation {
  family: GraphFamily;
  position: Point3;
  radius: [number, number];
  nodeIds: string[];
}
export interface ConstellationLayout {
  nodes: PositionedNode[];
  groups: Constellation[];
  positions: Map<string, Point3>;
  bounds: { width: number; height: number };
}

// Stable semantic sectors: filtering and streamed additions never shuffle families.
const SECTORS: Record<GraphFamily, [number, number]> = {
  research: [-470, 284], anatomy: [-202, 247], manifestations: [103, 302],
  pathologies: [416, 246], genetics: [490, 64], complications: [454, -132],
  examinations: [255, -283], molecules: [-10, -339], treatments: [-270, -232],
  daily_life: [-492, -289], interactions: [-508, -93], mechanisms: [-469, 90],
};

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return result >>> 0;
}

/** Layout is presentation only. It never creates a clinical relationship or changes evidence. */
export function buildConstellationLayout(graph: KnowledgeGraphModel, centerId: string): ConstellationLayout {
  const degrees = new Map<string, number>();
  const neighbors = new Set<string>();
  for (const edge of graph.edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
    if (edge.source === centerId) neighbors.add(edge.target);
    if (edge.target === centerId) neighbors.add(edge.source);
  }
  const byImportance = (a: KnowledgeNode, b: KnowledgeNode) =>
    (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0) || a.id.localeCompare(b.id);
  // The inner core shows structurally central direct neighbors, never inferred mechanisms.
  const core = graph.nodes.filter(node => node.id !== centerId && neighbors.has(node.id)
    && ['anatomy', 'manifestations', 'mechanisms', 'molecules'].includes(node.family))
    .sort(byImportance).slice(0, graph.nodes.length > 14 ? 6 : 0);
  const coreIds = new Set(core.map(node => node.id));
  const nodes: PositionedNode[] = [];
  const positions = new Map<string, Point3>();
  const groups: Constellation[] = [];
  const add = (node: KnowledgeNode, position: Point3, radius: number, isCore = false, showLabel = true) => {
    nodes.push({ node, position, radius, isCenter: node.id === centerId, isCore, showLabel });
    positions.set(node.id, position);
  };
  const center = graph.nodes.find(node => node.id === centerId);
  if (center) add(center, [0, 0, 36], 61);
  core.forEach((node, index) => {
    const angle = (123 - index * 60) * Math.PI / 180;
    add(node, [Math.cos(angle) * 155, Math.sin(angle) * 132, 22 + (index % 3) * 8], 20, true);
  });
  for (const [family, [cx, cy]] of Object.entries(SECTORS) as Array<[GraphFamily, [number, number]]>) {
    const members = graph.nodes.filter(node => node.id !== centerId && !coreIds.has(node.id) && node.family === family).sort(byImportance);
    if (!members.length) continue;
    const rx = Math.min(148, 90 + Math.sqrt(members.length) * 8);
    const ry = Math.min(98, 49 + Math.sqrt(members.length) * 5);
    const z = (hash(family) % 30) - 25;
    groups.push({ family, position: [cx, cy, z - 12], radius: [rx, ry], nodeIds: members.map(node => node.id) });
    members.forEach((node, index) => {
      const angle = index * 2.399963229728653 + (hash(family) % 360) * Math.PI / 180;
      const r = members.length === 1 ? 0 : Math.sqrt((index + 0.45) / members.length);
      const position: Point3 = [cx + Math.cos(angle) * rx * r * 0.87, cy + Math.sin(angle) * ry * r * 0.82,
        z + (hash(node.id) % 30)];
      add(node, position, index < 5 ? 10.5 : 6.5, false, index < 5);
    });
  }
  const width = Math.max(1400, ...nodes.map(n => Math.abs(n.position[0]) * 2 + 240));
  const height = Math.max(890, ...nodes.map(n => Math.abs(n.position[1]) * 2 + 190));
  return { nodes, groups, positions, bounds: { width, height } };
}

/** Shared curved geometry for 3D and the accessible SVG fallback. */
export function connectionPoints(start: Point3, end: Point3, key: string): Point3[] {
  const bend = (hash(key) % 2 ? 1 : -1) * Math.min(48, Math.hypot(end[0] - start[0], end[1] - start[1]) * 0.12);
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]) || 1;
  const middle: Point3 = [(start[0] + end[0]) / 2 - (end[1] - start[1]) / length * bend,
    (start[1] + end[1]) / 2 + (end[0] - start[0]) / length * bend,
    (start[2] + end[2]) / 2 - 18];
  return Array.from({ length: 19 }, (_, index) => {
    const t = index / 18, s = 1 - t;
    return [s * s * start[0] + 2 * s * t * middle[0] + t * t * end[0],
      s * s * start[1] + 2 * s * t * middle[1] + t * t * end[1],
      s * s * start[2] + 2 * s * t * middle[2] + t * t * end[2]];
  });
}
