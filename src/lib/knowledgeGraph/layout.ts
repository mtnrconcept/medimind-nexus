import type { KnowledgeGraphModel, KnowledgeNode, GraphFamily } from './model';

export type Point3 = [number, number, number];
export interface PositionedNode {
  node: KnowledgeNode;
  position: Point3;
  radius: number;
  isCenter: boolean;
  isCore: boolean;
  showLabel: boolean;
  labelOffset: [number, number];
  labelAnchor: 'start' | 'middle' | 'end';
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
    nodes.push({ node, position, radius, isCenter: node.id === centerId, isCore, showLabel,
      labelOffset: node.id === centerId || isCore ? [0, 0] : [radius + 8, 0],
      labelAnchor: node.id === centerId || isCore ? 'middle' : 'start' });
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
  // Labels are an overview layer, independent of the node/edge data. Reserve
  // room for titles and the core first, then try the four sides of each node.
  // A crowded label remains available on selection and in the searchable index.
  type Box = { left: number; right: number; bottom: number; top: number };
  const overlaps = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;
  const boxes: Box[] = groups.map(group => ({ left: group.position[0] - Math.min(140, group.family.length * 7 + 50),
    right: group.position[0] + Math.min(140, group.family.length * 7 + 50),
    bottom: group.position[1] + group.radius[1] + 4, top: group.position[1] + group.radius[1] + 31 }));
  for (const item of nodes.filter(item => item.isCenter || item.isCore)) {
    const halfWidth = item.isCenter ? 85 : Math.min(100, item.node.name.length * 3.6 + 8);
    boxes.push({ left: item.position[0] - halfWidth, right: item.position[0] + halfWidth,
      bottom: item.position[1] - (item.isCenter ? 55 : 12), top: item.position[1] + (item.isCenter ? 55 : 12) });
  }
  for (const item of nodes.filter(item => !item.isCenter && !item.isCore && item.showLabel)) {
    const labelWidth = Math.min(180, item.node.name.length * 6.7 + 10);
    const gap = item.radius + 9;
    const candidates: Array<{ offset: [number, number]; anchor: PositionedNode['labelAnchor'] }> = [
      { offset: [gap, 0], anchor: 'start' }, { offset: [-gap, 0], anchor: 'end' },
      { offset: [0, gap + 4], anchor: 'middle' }, { offset: [0, -gap - 4], anchor: 'middle' },
    ];
    item.showLabel = false;
    for (const candidate of candidates) {
      const x = item.position[0] + candidate.offset[0], y = item.position[1] + candidate.offset[1];
      const left = x - (candidate.anchor === 'middle' ? labelWidth / 2 : candidate.anchor === 'end' ? labelWidth : 0);
      const box = { left: left - 4, right: left + labelWidth + 4, bottom: y - 10, top: y + 10 };
      const coversNode = nodes.some(other => other !== item && other.position[0] + other.radius > box.left
        && other.position[0] - other.radius < box.right && other.position[1] + other.radius > box.bottom
        && other.position[1] - other.radius < box.top);
      if (coversNode || boxes.some(occupied => overlaps(box, occupied))) continue;
      item.labelOffset = candidate.offset;
      item.labelAnchor = candidate.anchor;
      item.showLabel = true;
      boxes.push(box);
      break;
    }
  }
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
