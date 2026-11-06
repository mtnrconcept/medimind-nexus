import { Component, Suspense, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { GRAPH_FAMILIES, type KnowledgeEdge } from '@/lib/knowledgeGraph/model';
import { connectionPoints, type ConstellationLayout, type PositionedNode } from '@/lib/knowledgeGraph/layout';

export interface CameraCommand { type: 'fit' | 'in' | 'out'; sequence: number }
export interface GraphSceneProps {
  layout: ConstellationLayout;
  visibleNodeIds: Set<string>;
  edges: KnowledgeEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  highlightedNodes: Set<string>;
  highlightedEdges: Set<string>;
  focus: boolean;
  command: CameraCommand;
  mode: '3d' | '2d';
  showLabels: boolean;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onSelectFamily: (family: string) => void;
  onBackground: () => void;
  onFallback: () => void;
}

const colorOf = (family: string) => GRAPH_FAMILIES.find(item => item.id === family)?.color ?? '#94a3b8';
const labelOf = (family: string) => GRAPH_FAMILIES.find(item => item.id === family)?.label ?? family;
const isDashed = (edge: KnowledgeEdge) => edge.qualifier !== 'established';
const edgeColor = (edge: KnowledgeEdge, active: boolean) => active ? '#f9a8d4' : edge.qualifier === 'research' ? '#a78bfa' : '#7398b5';

class CanvasBoundary extends Component<{ children: ReactNode; onFallback: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFallback(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function CameraRig({ command, bounds }: { command: CameraCommand; bounds: ConstellationLayout['bounds'] }) {
  const { camera, size, invalidate } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const fit = useRef(1);
  const latestBounds = useRef(bounds);
  latestBounds.current = bounds;
  useEffect(() => {
    const extent = latestBounds.current;
    fit.current = Math.min(size.width / extent.width, size.height / extent.height) * 0.94;
    camera.zoom = fit.current;
    camera.position.set(24, 16, 1200);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
    invalidate();
  }, [camera, size.width, size.height, invalidate]);
  useEffect(() => {
    if (command.type === 'fit') {
      const extent = latestBounds.current;
      fit.current = Math.min(size.width / extent.width, size.height / extent.height) * 0.94;
      camera.zoom = fit.current;
      camera.position.set(24, 16, 1200);
      camera.up.set(0, 1, 0);
      controls.current?.target.set(0, 0, 0);
      camera.lookAt(0, 0, 0);
    } else camera.zoom = THREE.MathUtils.clamp(camera.zoom * (command.type === 'in' ? 1.25 : 0.8), 0.12, 6);
    camera.updateProjectionMatrix();
    controls.current?.update();
    invalidate();
  }, [command, camera, invalidate, size.width, size.height]);
  return <OrbitControls ref={controls} makeDefault enableDamping={false} enablePan screenSpacePanning
    minZoom={0.12} maxZoom={6} rotateSpeed={0.5} zoomSpeed={0.8}
    mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }} />;
}

function SphereNode({ item, selected, dimmed, showLabel, onSelect }: {
  item: PositionedNode; selected: boolean; dimmed: boolean; showLabel: boolean; onSelect: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = item.isCenter ? '#f46c73' : colorOf(item.node.family);
  const radius = item.radius * (selected ? 1.15 : 1);
  return <group position={item.position}>
    <mesh onClick={event => { event.stopPropagation(); onSelect(); }}
      onPointerOver={event => { event.stopPropagation(); setHovered(true); }} onPointerOut={() => setHovered(false)}>
      <sphereGeometry args={[radius, item.isCenter ? 40 : 20, item.isCenter ? 32 : 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected || hovered ? 0.6 : 0.22}
        metalness={0.15} roughness={0.28} transparent opacity={dimmed ? 0.22 : 1} />
    </mesh>
    <mesh scale={selected ? 1.55 : 1.35} raycast={() => null}>
      <sphereGeometry args={[radius, 16, 12]} />
      <meshBasicMaterial color={color} transparent opacity={dimmed ? 0.015 : selected ? 0.13 : 0.06} depthWrite={false} />
    </mesh>
    {(item.isCenter || item.isCore || selected || hovered || showLabel) && <Html center
      position={[...item.labelOffset, radius + 2]}
      zIndexRange={[30, 5]} style={{ pointerEvents: 'none', opacity: dimmed && !hovered ? 0.25 : 1 }}>
      <button type="button" onClick={event => { event.stopPropagation(); onSelect(); }}
        onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}
        title={item.node.name} aria-label={`Sélectionner ${item.node.name}`}
        className={`kg-node-label ${item.isCenter ? 'kg-node-label--center' : item.isCore ? 'kg-node-label--core' : ''} ${selected ? 'is-selected' : ''}`}
        style={{ pointerEvents: 'auto', '--node-color': color,
          transform: item.labelAnchor === 'start' ? 'translateX(50%)' : item.labelAnchor === 'end' ? 'translateX(-50%)' : undefined } as React.CSSProperties}>
        {item.node.name}
      </button>
    </Html>}
  </group>;
}

function RelationLine({ edge, layout, active, dimmed, onSelect }: {
  edge: KnowledgeEdge; layout: ConstellationLayout; active: boolean; dimmed: boolean; onSelect: () => void;
}) {
  const start = layout.positions.get(edge.source), end = layout.positions.get(edge.target);
  const points = useMemo(() => start && end ? connectionPoints(start, end, edge.id) : [], [start, end, edge.id]);
  const direction = useMemo(() => {
    if (points.length < 2) return new THREE.Quaternion();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(...points[14]).sub(new THREE.Vector3(...points[13])).normalize());
  }, [points]);
  if (!start || !end) return null;
  return <group>
    <Line points={points} color={edgeColor(edge, active)} lineWidth={active ? 2.5 : 0.8}
      transparent opacity={dimmed ? 0.04 : active ? 0.95 : edge.qualifier === 'unverified' ? 0.16 : 0.3}
      dashed={isDashed(edge)} dashSize={edge.qualifier === 'association' ? 7 : 1.8} gapSize={edge.qualifier === 'association' ? 4 : 4.5}
      onClick={event => { event.stopPropagation(); onSelect(); }} />
    {active && edge.direction !== 'undirected' && <mesh position={points[14]} quaternion={direction} raycast={() => null}>
      <coneGeometry args={[3.2, 9, 8]} /><meshBasicMaterial color="#f9a8d4" />
    </mesh>}
  </group>;
}

/** Fixed-size HTML labels need an extra screen-space pass when the 3D camera
 * rotates or zooms out. The graph itself is never filtered by this pass. */
function SceneNodes(props: GraphSceneProps) {
  const [labelIds, setLabelIds] = useState<Set<string>>(() => new Set());
  const previous = useRef('');
  useFrame(({ camera, size }) => {
    if (props.showLabels) return;
    const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];
    const next: string[] = [];
    const mobile = size.width < 700;
    const project = (position: number[]) => {
      const point = new THREE.Vector3(...position).project(camera);
      return { x: (point.x + 1) * size.width / 2, y: (1 - point.y) * size.height / 2 };
    };
    for (const group of props.layout.groups) {
      if (!group.nodeIds.some(id => props.visibleNodeIds.has(id))) continue;
      const point = project([group.position[0], group.position[1] + group.radius[1] + 15, group.position[2] + 2]);
      const width = labelOf(group.family).length * (mobile ? 5 : 6) + 34;
      boxes.push({ x: point.x - width / 2, y: point.y - 13, width, height: 26 });
    }
    const ordered = props.layout.nodes.filter(item => props.visibleNodeIds.has(item.node.id))
      .sort((a, b) => Number(b.node.id === props.selectedNodeId) - Number(a.node.id === props.selectedNodeId)
        || Number(b.isCenter) - Number(a.isCenter) || Number(b.isCore) - Number(a.isCore));
    for (const item of ordered) {
      const forced = item.isCenter || item.isCore || item.node.id === props.selectedNodeId;
      if (!item.showLabel && !forced) continue;
      const point = project([item.position[0] + item.labelOffset[0], item.position[1] + item.labelOffset[1], item.position[2] + item.radius + 2]);
      const width = item.isCenter ? (mobile ? 105 : 180) : Math.min(mobile ? 96 : 135, item.node.name.length * (mobile ? 4.5 : 5.7) + 12);
      const height = item.isCenter ? 58 : 22;
      const x = point.x - (item.labelAnchor === 'middle' ? width / 2 : item.labelAnchor === 'end' ? width : 0);
      const box = { x: x - 3, y: point.y - height / 2, width: width + 6, height };
      if (!forced && boxes.some(other => box.x < other.x + other.width && box.x + box.width > other.x
        && box.y < other.y + other.height && box.y + box.height > other.y)) continue;
      boxes.push(box);
      next.push(item.node.id);
    }
    const signature = next.join('|');
    if (signature !== previous.current) { previous.current = signature; setLabelIds(new Set(next)); }
  });
  return <>{props.layout.nodes.filter(item => props.visibleNodeIds.has(item.node.id)).map(item => <SphereNode key={item.node.id} item={item}
    selected={props.selectedNodeId === item.node.id} dimmed={props.focus && props.highlightedNodes.size > 0 && !props.highlightedNodes.has(item.node.id)}
    showLabel={props.showLabels || labelIds.has(item.node.id)} onSelect={() => props.onSelectNode(item.node.id)} />)}</>;
}

function WebGLScene(props: GraphSceneProps) {
  const { layout, visibleNodeIds, focus, highlightedNodes, highlightedEdges } = props;
  return <CanvasBoundary onFallback={props.onFallback}>
    <Canvas orthographic camera={{ position: [24, 16, 1200], near: 0.1, far: 5000, zoom: 0.8 }}
      dpr={[1, 1.75]} frameloop="demand" gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => { gl.domElement.setAttribute('aria-label', 'Graphe de connaissances en trois dimensions');
        gl.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); props.onFallback(); }, { once: true }); }}
      onPointerMissed={event => {
        // R3F listens on the parent containing both the canvas and Html labels.
        // A label click must not be treated as an empty-space canvas click.
        if (event.type === 'click' && event.target instanceof HTMLCanvasElement) props.onBackground();
      }}>
      <ambientLight intensity={0.95} /><directionalLight position={[-350, 600, 900]} intensity={2.2} />
      <pointLight position={[300, -200, 450]} intensity={0.65} />
      <CameraRig command={props.command} bounds={layout.bounds} />
      <Suspense fallback={null}>
        {layout.groups.filter(group => group.nodeIds.some(id => visibleNodeIds.has(id))).map(group => <group key={group.family} position={group.position}>
          <mesh scale={[group.radius[0], group.radius[1], 1]} raycast={() => null}>
            <circleGeometry args={[1, 64]} /><meshBasicMaterial color={colorOf(group.family)} transparent opacity={0.055} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <Line points={Array.from({ length: 65 }, (_, i): [number, number, number] => [Math.cos(i / 64 * Math.PI * 2) * group.radius[0],
            Math.sin(i / 64 * Math.PI * 2) * group.radius[1], -1])} color={colorOf(group.family)} transparent opacity={0.17} lineWidth={0.8} />
          <Html center position={[0, group.radius[1] + 15, 2]} zIndexRange={[22, 4]}>
            <button className="kg-cluster-label" style={{ '--cluster-color': colorOf(group.family) } as React.CSSProperties}
              onClick={event => { event.stopPropagation(); props.onSelectFamily(group.family); }}
              onPointerDown={event => event.stopPropagation()} onPointerUp={event => event.stopPropagation()}
              title={`Explorer la famille ${labelOf(group.family)}`}>
              {labelOf(group.family)} <span>{group.nodeIds.filter(id => visibleNodeIds.has(id)).length}</span>
            </button>
          </Html>
        </group>)}
        {props.edges.map(edge => <RelationLine key={edge.id} edge={edge} layout={layout}
          active={props.selectedEdgeId === edge.id || highlightedEdges.has(edge.id)}
          dimmed={focus && highlightedEdges.size > 0 && !highlightedEdges.has(edge.id)} onSelect={() => props.onSelectEdge(edge.id)} />)}
        <SceneNodes {...props} />
      </Suspense>
    </Canvas>
  </CanvasBoundary>;
}

function FlatScene(props: GraphSceneProps) {
  const id = useId().replace(/:/g, '');
  const svg = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const { layout, visibleNodeIds } = props;
  const { width, height } = layout.bounds;
  useEffect(() => {
    if (props.command.type === 'fit') { setZoom(1); setPan({ x: 0, y: 0 }); }
    else setZoom(value => Math.min(5, Math.max(0.3, value * (props.command.type === 'in' ? 1.25 : 0.8))));
  }, [props.command]);
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => { event.preventDefault(); setZoom(value => Math.min(5, Math.max(0.3, value * Math.exp(-event.deltaY * 0.001)))); };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);
  return <svg ref={svg} className="kg-svg" viewBox={`${-width / 2} ${-height / 2} ${width} ${height}`}
    role="group" aria-label="Graphe de connaissances en deux dimensions" onContextMenu={e => e.preventDefault()}
    onPointerDown={event => {
      if ((event.target as Element).closest('[data-interactive]')) return;
      drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y };
      event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={event => {
      if (!drag.current || !svg.current) return;
      const rect = svg.current.getBoundingClientRect();
      const ratio = Math.max(width / rect.width, height / rect.height);
      setPan({ x: drag.current.px + (event.clientX - drag.current.x) * ratio, y: drag.current.py + (event.clientY - drag.current.y) * ratio });
    }} onPointerUp={event => {
      if (drag.current && Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) < 4) props.onBackground();
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }} onPointerCancel={() => { drag.current = null; }}>
    <defs>
      {[...GRAPH_FAMILIES, { id: 'center', color: '#f46c73' }].map(family => <radialGradient key={family.id} id={`${id}-${family.id}`} cx="30%" cy="22%" r="77%">
        <stop offset="0" stopColor="#fff" stopOpacity="0.92" /><stop offset="0.22" stopColor={family.color} />
        <stop offset="1" stopColor={family.color} stopOpacity="0.4" />
      </radialGradient>)}
      <marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#f9a8d4" />
      </marker>
    </defs>
    <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
      {layout.groups.filter(group => group.nodeIds.some(nodeId => visibleNodeIds.has(nodeId))).map(group => <g key={group.family}>
        <ellipse cx={group.position[0]} cy={-group.position[1]} rx={group.radius[0]} ry={group.radius[1]}
          fill={colorOf(group.family)} fillOpacity=".055" stroke={colorOf(group.family)} strokeOpacity=".2" />
        <g data-interactive role="button" tabIndex={0} aria-label={`Explorer la famille ${labelOf(group.family)}`}
          onClick={() => props.onSelectFamily(group.family)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.onSelectFamily(group.family); } }}>
          <text x={group.position[0]} y={-group.position[1] - group.radius[1] - 12} textAnchor="middle" fill={colorOf(group.family)} className="kg-svg-cluster">
            {labelOf(group.family).toLocaleUpperCase('fr')}
          </text>
        </g>
      </g>)}
      {props.edges.map(edge => {
        const start = layout.positions.get(edge.source), end = layout.positions.get(edge.target);
        if (!start || !end) return null;
        const active = props.selectedEdgeId === edge.id || props.highlightedEdges.has(edge.id);
        const points = connectionPoints(start, end, edge.id);
        const d = points.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${-p[1]}`).join(' ');
        return <g key={edge.id} data-interactive onClick={() => props.onSelectEdge(edge.id)}>
          <title>{edge.relationship}</title>
          <path d={d} fill="none" stroke="transparent" strokeWidth="14" className="kg-svg-edge-hit" />
          <path d={d} fill="none" stroke={edgeColor(edge, active)} strokeWidth={active ? 2.5 : 0.9}
            opacity={active ? 1 : props.focus && props.highlightedEdges.size ? 0.06 : 0.28}
            strokeDasharray={edge.qualifier === 'established' ? undefined : edge.qualifier === 'association' ? '7 4' : '2 5'}
            pointerEvents="none" />
          {active && edge.direction !== 'undirected' && <path d={`M${points[13][0]},${-points[13][1]} L${points[14][0]},${-points[14][1]}`}
            fill="none" stroke="transparent" strokeWidth="1.6" markerEnd={`url(#${id}-arrow)`} pointerEvents="none" />}
        </g>;
      })}
      {layout.nodes.filter(item => visibleNodeIds.has(item.node.id)).map(item => {
        const selected = props.selectedNodeId === item.node.id;
        const dim = props.focus && props.highlightedNodes.size > 0 && !props.highlightedNodes.has(item.node.id);
        const color = item.isCenter ? '#f46c73' : colorOf(item.node.family);
        return <g key={item.node.id} data-interactive tabIndex={0} role="button" aria-label={`Sélectionner ${item.node.name}`}
          className="kg-svg-node" transform={`translate(${item.position[0]},${-item.position[1]})`} opacity={dim ? 0.2 : 1}
          onClick={() => props.onSelectNode(item.node.id)} onKeyDown={event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.onSelectNode(item.node.id); }
          }}>
          <title>{item.node.name}</title>
          <circle r={item.radius * 1.6} fill={color} opacity={selected ? 0.18 : 0.07} />
          <circle r={item.radius * (selected ? 1.12 : 1)} fill={`url(#${id}-${item.isCenter ? 'center' : item.node.family})`}
            stroke={selected ? '#f8fafc' : color} strokeOpacity={selected ? 1 : 0.7} />
          {(props.showLabels || item.showLabel || selected || item.isCenter || item.isCore) && <text
            x={item.labelOffset[0]} y={item.isCenter ? -5 : -item.labelOffset[1] + 4}
            textAnchor={item.labelAnchor}
            className={`kg-svg-label ${item.isCenter ? 'kg-svg-label--center' : ''}`}>
            {item.isCenter && item.node.name.length > 19
              ? <>{item.node.name.split(' ').slice(0, Math.ceil(item.node.name.split(' ').length / 2)).join(' ')}<tspan x="0" dy="24">{item.node.name.split(' ').slice(Math.ceil(item.node.name.split(' ').length / 2)).join(' ')}</tspan></>
              : item.node.name.length > 27 && !selected ? item.node.name.slice(0, 25) + '…' : item.node.name}
          </text>}
        </g>;
      })}
    </g>
  </svg>;
}

export default function KnowledgeGraphScene(props: GraphSceneProps) {
  return props.mode === '3d' ? <WebGLScene {...props} /> : <FlatScene {...props} />;
}
