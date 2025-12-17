import { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Brain, Zap, Network, Plus, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Neural Network 3D Visualization - White Background Edition
 * 
 * Fonctionnalités:
 * - Fond BLANC pour meilleure visibilité
 * - Liens colorés épais et visibles
 * - Drag-and-drop pour créer des liens entre nœuds
 */

interface KGNode {
    id: string;
    name: string;
    node_type: string;
    activation_score?: number;
    semantic_cluster?: number;
    properties?: Record<string, any>;
}

interface SemanticLink {
    id: string;
    source_node_id: string;
    target_node_id: string;
    similarity_score: number;
    weight: number;
    link_type: string;
}

interface KGEdge {
    id: string;
    source_node_id: string;
    target_node_id: string;
    relationship_type: string;
    weight?: number;
}

// Couleurs des types de nœuds - plus vives pour fond blanc
const NODE_COLORS: Record<string, string> = {
    substance: '#2563eb',   // Bleu vif
    medication: '#16a34a',  // Vert vif
    pathology: '#dc2626',   // Rouge vif
    symptom: '#ea580c',     // Orange vif
    treatment: '#7c3aed',   // Violet vif
    enzyme: '#db2777',      // Rose vif
    receptor: '#0891b2',    // Cyan vif
    default: '#64748b'
};

// Types de relations pour le modal
const RELATIONSHIP_TYPES = [
    { value: 'TREATS', label: '🟢 Traite', color: 'green' },
    { value: 'INDICATED_FOR', label: '🟢 Indiqué pour', color: 'green' },
    { value: 'BENEFICIAL', label: '🟢 Bénéfique', color: 'green' },
    { value: 'INTERACTS_WITH', label: '🟠 Interagit avec', color: 'orange' },
    { value: 'SIDE_EFFECT', label: '🟠 Effet secondaire', color: 'orange' },
    { value: 'CAUTION_WITH', label: '🟠 Précaution avec', color: 'orange' },
    { value: 'CONTRAINDICATED_WITH', label: '🔴 Contre-indiqué', color: 'red' },
    { value: 'DANGEROUS', label: '🔴 Dangereux', color: 'red' },
    { value: 'TOXIC', label: '🔴 Toxique', color: 'red' },
];

// Catégorie de couleur
function getLinkCategory(relationshipType: string): 'green' | 'orange' | 'red' | 'blue' {
    const type = relationshipType.toUpperCase().replace(/-/g, '_');

    if (type.includes('TREAT') || type.includes('INDICATED') || type.includes('SUITABLE') ||
        type.includes('BENEFICIAL') || type.includes('COMMON_SYMPTOM')) {
        return 'green';
    }

    if (type.includes('CONTRAINDIC') || type.includes('DANGER') || type.includes('SEVERE') ||
        type.includes('TOXIC') || type.includes('FATAL')) {
        return 'red';
    }

    if (type.includes('CAUTION') || type.includes('SIDE_EFFECT') || type.includes('INTERACT') ||
        type.includes('MODERATE') || type.includes('UNCOMMON')) {
        return 'orange';
    }

    return 'blue';
}

// Hash for positioning
function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

const GRID_SIZE = 12;
const CUBE_SIZE = 12;

// Composant pour les nœuds avec gestion du drag
function NodesMesh({
    nodes,
    positionMap,
    onNodeHover,
    onNodeClick,
    onDragStart,
    onDragEnd,
    hoveredNodeId,
    dragSourceId
}: {
    nodes: KGNode[];
    positionMap: Map<string, THREE.Vector3>;
    onNodeHover: (node: KGNode | null) => void;
    onNodeClick: (node: KGNode) => void;
    onDragStart: (node: KGNode) => void;
    onDragEnd: (node: KGNode | null) => void;
    hoveredNodeId: string | null;
    dragSourceId: string | null;
}) {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const { raycaster, camera, pointer, gl } = useThree();
    const isDragging = useRef(false);

    const geometry = useMemo(() => new THREE.SphereGeometry(0.15, 16, 16), []);

    const { positions, colors, nodeMap } = useMemo(() => {
        const positions: THREE.Vector3[] = [];
        const colors: THREE.Color[] = [];
        const nodeMap = new Map<number, KGNode>();

        nodes.forEach((node, index) => {
            const pos = positionMap.get(node.id);
            if (pos) {
                positions.push(pos);
            } else {
                const hash = hashCode(node.id);
                positions.push(new THREE.Vector3(
                    ((hash % GRID_SIZE) / GRID_SIZE - 0.5) * CUBE_SIZE,
                    (((hash >> 8) % GRID_SIZE) / GRID_SIZE - 0.5) * CUBE_SIZE,
                    (((hash >> 16) % GRID_SIZE) / GRID_SIZE - 0.5) * CUBE_SIZE
                ));
            }
            colors.push(new THREE.Color(NODE_COLORS[node.node_type] || NODE_COLORS.default));
            nodeMap.set(index, node);
        });

        return { positions, colors, nodeMap };
    }, [nodes, positionMap]);

    useEffect(() => {
        if (!meshRef.current) return;

        const mesh = meshRef.current;
        const matrix = new THREE.Matrix4();

        positions.forEach((pos, i) => {
            const node = nodeMap.get(i);
            const isHovered = node && node.id === hoveredNodeId;
            const isDragSource = node && node.id === dragSourceId;
            const scale = isHovered || isDragSource ? 2.5 : 1;
            matrix.makeScale(scale, scale, scale);
            matrix.setPosition(pos);
            mesh.setMatrixAt(i, matrix);

            if (isDragSource) {
                mesh.setColorAt(i, new THREE.Color('#fbbf24')); // Yellow for drag source
            } else if (isHovered) {
                mesh.setColorAt(i, new THREE.Color('#6366f1')); // Indigo for hover
            } else {
                mesh.setColorAt(i, colors[i]);
            }
        });

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }, [positions, colors, nodeMap, hoveredNodeId, dragSourceId]);

    // Find node under cursor
    const findNodeUnderCursor = useCallback(() => {
        if (!meshRef.current) return null;

        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObject(meshRef.current);

        if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
            return nodeMap.get(intersects[0].instanceId) || null;
        }
        return null;
    }, [raycaster, camera, pointer, nodeMap]);

    // Handle hover
    const handleMove = useCallback(() => {
        const node = findNodeUnderCursor();
        onNodeHover(node);
    }, [findNodeUnderCursor, onNodeHover]);

    useFrame(handleMove);

    // Mouse handlers
    const handlePointerDown = useCallback((e: any) => {
        e.stopPropagation();
        const node = findNodeUnderCursor();
        if (node) {
            isDragging.current = true;
            onDragStart(node);
            gl.domElement.style.cursor = 'grabbing';
        }
    }, [findNodeUnderCursor, onDragStart, gl]);

    const handlePointerUp = useCallback((e: any) => {
        if (isDragging.current) {
            const node = findNodeUnderCursor();
            onDragEnd(node);
            isDragging.current = false;
            gl.domElement.style.cursor = 'grab';
        }
    }, [findNodeUnderCursor, onDragEnd, gl]);

    return (
        <instancedMesh
            ref={meshRef}
            args={[geometry, undefined, nodes.length]}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
        >
            <meshStandardMaterial vertexColors roughness={0.4} metalness={0.1} />
        </instancedMesh>
    );
}

// Ligne de drag en cours
function DragLine({
    sourcePos,
    targetPos
}: {
    sourcePos: THREE.Vector3 | null;
    targetPos: THREE.Vector3 | null;
}) {
    if (!sourcePos || !targetPos) return null;

    return (
        <Line
            points={[sourcePos, targetPos]}
            color="#fbbf24"
            lineWidth={3}
            dashed
            dashSize={0.2}
            gapSize={0.1}
        />
    );
}

// Composant pour les liens colorés - PLUS ÉPAIS et VISIBLES
function ColoredEdges({
    edges,
    semanticLinks,
    positionMap,
    showSemanticLinks,
    hoveredNodeId
}: {
    edges: KGEdge[];
    semanticLinks: SemanticLink[];
    positionMap: Map<string, THREE.Vector3>;
    showSemanticLinks: boolean;
    hoveredNodeId: string | null;
}) {
    const linkGroups = useMemo(() => {
        const groups: Record<string, { points: THREE.Vector3[] }> = {
            green: { points: [] },
            orange: { points: [] },
            red: { points: [] },
            blue: { points: [] }
        };

        edges.forEach(edge => {
            const sourcePos = positionMap.get(edge.source_node_id);
            const targetPos = positionMap.get(edge.target_node_id);

            if (sourcePos && targetPos) {
                const category = getLinkCategory(edge.relationship_type);
                groups[category].points.push(sourcePos.clone(), targetPos.clone());
            }
        });

        if (showSemanticLinks) {
            semanticLinks.forEach(link => {
                const sourcePos = positionMap.get(link.source_node_id);
                const targetPos = positionMap.get(link.target_node_id);

                if (sourcePos && targetPos) {
                    groups.blue.points.push(sourcePos.clone(), targetPos.clone());
                }
            });
        }

        return groups;
    }, [edges, semanticLinks, positionMap, showSemanticLinks]);

    return (
        <>
            {/* Green links - Thérapeutique - ÉPAIS */}
            {linkGroups.green.points.length > 0 && (
                <lineSegments>
                    <bufferGeometry>
                        <bufferAttribute
                            attach="attributes-position"
                            count={linkGroups.green.points.length}
                            array={new Float32Array(linkGroups.green.points.flatMap(v => [v.x, v.y, v.z]))}
                            itemSize={3}
                        />
                    </bufferGeometry>
                    <lineBasicMaterial color="#16a34a" linewidth={3} />
                </lineSegments>
            )}

            {/* Orange links - Précaution */}
            {linkGroups.orange.points.length > 0 && (
                <lineSegments>
                    <bufferGeometry>
                        <bufferAttribute
                            attach="attributes-position"
                            count={linkGroups.orange.points.length}
                            array={new Float32Array(linkGroups.orange.points.flatMap(v => [v.x, v.y, v.z]))}
                            itemSize={3}
                        />
                    </bufferGeometry>
                    <lineBasicMaterial color="#ea580c" linewidth={3} />
                </lineSegments>
            )}

            {/* Red links - Danger */}
            {linkGroups.red.points.length > 0 && (
                <lineSegments>
                    <bufferGeometry>
                        <bufferAttribute
                            attach="attributes-position"
                            count={linkGroups.red.points.length}
                            array={new Float32Array(linkGroups.red.points.flatMap(v => [v.x, v.y, v.z]))}
                            itemSize={3}
                        />
                    </bufferGeometry>
                    <lineBasicMaterial color="#dc2626" linewidth={3} />
                </lineSegments>
            )}

            {/* Blue links - Sémantique */}
            {linkGroups.blue.points.length > 0 && (
                <lineSegments>
                    <bufferGeometry>
                        <bufferAttribute
                            attach="attributes-position"
                            count={linkGroups.blue.points.length}
                            array={new Float32Array(linkGroups.blue.points.flatMap(v => [v.x, v.y, v.z]))}
                            itemSize={3}
                        />
                    </bufferGeometry>
                    <lineBasicMaterial color="#6366f1" transparent opacity={0.5} linewidth={2} />
                </lineSegments>
            )}
        </>
    );
}

// Cube wireframe - plus visible sur fond blanc
function WireframeCube({ size }: { size: number }) {
    return (
        <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(size, size, size)]} />
            <lineBasicMaterial color="#cbd5e1" linewidth={2} />
        </lineSegments>
    );
}

// Grille au sol pour référence
function GridHelper() {
    return <gridHelper args={[CUBE_SIZE, 12, '#e2e8f0', '#f1f5f9']} rotation={[0, 0, 0]} />;
}

// Main component
export default function NeuralNetworkGraph() {
    const [nodes, setNodes] = useState<KGNode[]>([]);
    const [edges, setEdges] = useState<KGEdge[]>([]);
    const [semanticLinks, setSemanticLinks] = useState<SemanticLink[]>([]);
    const [positionMap, setPositionMap] = useState<Map<string, THREE.Vector3>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [hoveredNode, setHoveredNode] = useState<KGNode | null>(null);
    const [showSemanticLinks, setShowSemanticLinks] = useState(true);

    // Drag state
    const [dragSource, setDragSource] = useState<KGNode | null>(null);
    const [dragTarget, setDragTarget] = useState<KGNode | null>(null);

    // Link creation modal
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [selectedRelationType, setSelectedRelationType] = useState('');
    const [isCreatingLink, setIsCreatingLink] = useState(false);

    const [stats, setStats] = useState({
        nodes: 0,
        edges: 0,
        semanticLinks: 0,
        greenLinks: 0,
        orangeLinks: 0,
        redLinks: 0
    });

    // Load data
    useEffect(() => {
        async function loadData() {
            setIsLoading(true);

            try {
                const { data: nodesData, count: nodeCount } = await supabase
                    .from('cde_nodes')
                    .select('id, name, node_type, activation_score, semantic_cluster, properties', { count: 'exact' })
                    .limit(3000);

                setNodes((nodesData || []) as KGNode[]);

                const { data: edgesData, count: edgeCount } = await supabase
                    .from('cde_edges')
                    .select('id, source_node_id, target_node_id, relationship_type, weight', { count: 'exact' })
                    .limit(5000);

                setEdges((edgesData || []) as KGEdge[]);

                // Try loading semantic links (may fail if table doesn't exist yet)
                try {
                    const { data: linksData, count: linkCount } = await supabase
                        .from('cde_semantic_links')
                        .select('id, source_node_id, target_node_id, similarity_score, weight, link_type', { count: 'exact' })
                        .gte('weight', 0.5)
                        .limit(3000);

                    setSemanticLinks((linksData || []) as SemanticLink[]);
                    setStats(prev => ({ ...prev, semanticLinks: linkCount || 0 }));
                } catch (e) {
                    console.log('Semantic links table not available');
                }

                let greenLinks = 0, orangeLinks = 0, redLinks = 0;
                (edgesData || []).forEach((e: any) => {
                    const cat = getLinkCategory(e.relationship_type);
                    if (cat === 'green') greenLinks++;
                    else if (cat === 'orange') orangeLinks++;
                    else if (cat === 'red') redLinks++;
                });

                setStats(prev => ({
                    ...prev,
                    nodes: nodeCount || 0,
                    edges: edgeCount || 0,
                    greenLinks,
                    orangeLinks,
                    redLinks
                }));

            } catch (error) {
                console.error('Failed to load neural graph:', error);
            }

            setIsLoading(false);
        }

        loadData();
    }, []);

    // Calculate positions
    useEffect(() => {
        if (nodes.length === 0) return;

        const map = new Map<string, THREE.Vector3>();

        const clusters = new Map<number, KGNode[]>();
        nodes.forEach(node => {
            const cluster = node.semantic_cluster ?? Math.floor(Math.random() * 10);
            if (!clusters.has(cluster)) clusters.set(cluster, []);
            clusters.get(cluster)!.push(node);
        });

        const clusterKeys = Array.from(clusters.keys());
        clusterKeys.forEach((cluster, ci) => {
            const clusterNodes = clusters.get(cluster)!;
            const theta = (ci / clusterKeys.length) * Math.PI * 2;
            const clusterRadius = 4;

            const cx = Math.cos(theta) * clusterRadius;
            const cz = Math.sin(theta) * clusterRadius;
            const cy = (ci % 3 - 1) * 2;

            clusterNodes.forEach((node, ni) => {
                const innerTheta = (ni / clusterNodes.length) * Math.PI * 2;
                const innerRadius = 1 + Math.random() * 1.5;

                map.set(node.id, new THREE.Vector3(
                    cx + Math.cos(innerTheta) * innerRadius,
                    cy + Math.sin(ni * 0.5) * 0.5,
                    cz + Math.sin(innerTheta) * innerRadius
                ));
            });
        });

        setPositionMap(map);
    }, [nodes]);

    // Drag handlers
    const handleDragStart = useCallback((node: KGNode) => {
        setDragSource(node);
        setDragTarget(null);
    }, []);

    const handleDragEnd = useCallback((targetNode: KGNode | null) => {
        if (dragSource && targetNode && dragSource.id !== targetNode.id) {
            setDragTarget(targetNode);
            setShowLinkModal(true);
        }
        setDragSource(null);
    }, [dragSource]);

    // Create link
    const handleCreateLink = async () => {
        if (!dragSource || !dragTarget || !selectedRelationType) return;

        setIsCreatingLink(true);

        try {
            const { error } = await supabase
                .from('cde_edges')
                .insert({
                    source_node_id: dragSource.id,
                    target_node_id: dragTarget.id,
                    relationship_type: selectedRelationType,
                    weight: 0.5,
                    provenance: 'user_created'
                });

            if (error) throw error;

            // Add to local state
            const newEdge: KGEdge = {
                id: crypto.randomUUID(),
                source_node_id: dragSource.id,
                target_node_id: dragTarget.id,
                relationship_type: selectedRelationType,
                weight: 0.5
            };
            setEdges(prev => [...prev, newEdge]);

            // Update stats
            const cat = getLinkCategory(selectedRelationType);
            setStats(prev => ({
                ...prev,
                edges: prev.edges + 1,
                greenLinks: cat === 'green' ? prev.greenLinks + 1 : prev.greenLinks,
                orangeLinks: cat === 'orange' ? prev.orangeLinks + 1 : prev.orangeLinks,
                redLinks: cat === 'red' ? prev.redLinks + 1 : prev.redLinks
            }));

            toast.success(`Lien créé: ${dragSource.name} → ${dragTarget.name}`);
            setShowLinkModal(false);

        } catch (error: any) {
            console.error('Failed to create link:', error);
            toast.error('Erreur lors de la création du lien');
        }

        setIsCreatingLink(false);
        setSelectedRelationType('');
        setDragTarget(null);
    };

    // Get positions for drag line
    const sourcePos = dragSource ? positionMap.get(dragSource.id) || null : null;
    const targetPos = hoveredNode && dragSource ? positionMap.get(hoveredNode.id) || null : null;

    return (
        <div className="relative w-full h-[700px] bg-white rounded-xl overflow-hidden border border-gray-200 shadow-lg">
            {/* Stats panel */}
            <div className="absolute top-4 left-4 z-10 bg-white/95 text-gray-900 p-4 rounded-lg shadow-lg border border-gray-200">
                <div className="font-bold text-lg flex items-center gap-2 mb-3">
                    <Brain className="h-5 w-5 text-violet-600" />
                    Réseau Neuronal
                </div>

                <div className="space-y-1 text-sm">
                    <div>Nœuds: <span className="text-blue-600 font-semibold">{stats.nodes.toLocaleString()}</span></div>
                    <div>Liens: <span className="text-gray-600">{stats.edges.toLocaleString()}</span></div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-200 space-y-1 text-sm">
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-1 bg-green-600 rounded" />
                        Thérapeutique: <span className="text-green-600 font-semibold">{stats.greenLinks}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-1 bg-orange-600 rounded" />
                        Précaution: <span className="text-orange-600 font-semibold">{stats.orangeLinks}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-4 h-1 bg-red-600 rounded" />
                        Danger: <span className="text-red-600 font-semibold">{stats.redLinks}</span>
                    </div>
                </div>

                {isLoading && (
                    <div className="flex items-center gap-2 mt-3 text-amber-600">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Chargement...
                    </div>
                )}
            </div>

            {/* Legend */}
            <div className="absolute top-4 right-4 z-10 bg-white/95 text-gray-900 p-4 rounded-lg shadow-lg border border-gray-200 w-64">
                <div className="font-bold mb-3 flex items-center gap-2">
                    <Network className="h-4 w-4" />
                    Légende
                </div>

                <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-1.5 bg-green-600 rounded" />
                        <span>🟢 Traite / Bénéfique</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-1.5 bg-orange-500 rounded" />
                        <span>🟠 Effet secondaire</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-1.5 bg-red-600 rounded" />
                        <span>🔴 Dangereux</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-1.5 bg-indigo-500 rounded" />
                        <span>🔵 Sémantique</span>
                    </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-200">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={showSemanticLinks}
                            onChange={(e) => setShowSemanticLinks(e.target.checked)}
                            className="rounded border-gray-300"
                        />
                        <span className="text-sm">Liens sémantiques</span>
                    </label>
                </div>
            </div>

            {/* Drag instruction */}
            {dragSource && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 bg-amber-100 text-amber-800 px-4 py-2 rounded-lg shadow-lg border border-amber-300 flex items-center gap-2">
                    <Link2 className="h-5 w-5" />
                    <span>Glissez vers un autre nœud pour créer un lien</span>
                    <Badge className="bg-amber-200 text-amber-800">{dragSource.name}</Badge>
                </div>
            )}

            {/* Hovered node info */}
            {hoveredNode && !dragSource && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-white/95 text-gray-900 p-3 rounded-lg shadow-lg border border-gray-200">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-5 h-5 rounded-full shadow-inner"
                            style={{ backgroundColor: NODE_COLORS[hoveredNode.node_type] }}
                        />
                        <div>
                            <div className="font-bold">{hoveredNode.name}</div>
                            <div className="text-xs text-gray-500">{hoveredNode.node_type}</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="absolute bottom-4 left-4 z-10 bg-white/90 text-gray-700 p-2 rounded-lg text-xs shadow border border-gray-200">
                🖱️ Drag: Rotate | Scroll: Zoom | <span className="text-amber-600 font-semibold">Click+Drag nœud: Créer lien</span>
            </div>

            {/* 3D Canvas - FOND BLANC */}
            <Canvas
                camera={{ position: [15, 10, 15], fov: 60 }}
                gl={{ antialias: true }}
            >
                {/* Lumières pour fond blanc */}
                <ambientLight intensity={0.8} />
                <directionalLight position={[10, 10, 5]} intensity={0.8} />
                <directionalLight position={[-10, -10, -5]} intensity={0.4} />
                <pointLight position={[0, 10, 0]} intensity={0.3} />

                {/* FOND BLANC */}
                <color attach="background" args={['#ffffff']} />

                {/* Grille de référence */}
                <GridHelper />

                <WireframeCube size={CUBE_SIZE} />

                {nodes.length > 0 && positionMap.size > 0 && (
                    <>
                        <NodesMesh
                            nodes={nodes}
                            positionMap={positionMap}
                            onNodeHover={setHoveredNode}
                            onNodeClick={() => { }}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            hoveredNodeId={hoveredNode?.id || null}
                            dragSourceId={dragSource?.id || null}
                        />

                        <ColoredEdges
                            edges={edges}
                            semanticLinks={semanticLinks}
                            positionMap={positionMap}
                            showSemanticLinks={showSemanticLinks}
                            hoveredNodeId={hoveredNode?.id || null}
                        />

                        {/* Ligne de drag */}
                        {dragSource && (
                            <DragLine
                                sourcePos={sourcePos}
                                targetPos={targetPos}
                            />
                        )}
                    </>
                )}

                <OrbitControls
                    enableDamping
                    dampingFactor={0.05}
                    rotateSpeed={0.5}
                    zoomSpeed={0.8}
                    minDistance={5}
                    maxDistance={50}
                />
            </Canvas>

            {/* Modal de création de lien */}
            <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Link2 className="h-5 w-5 text-violet-600" />
                            Créer un lien
                        </DialogTitle>
                        <DialogDescription>
                            Définissez le type de relation entre ces deux éléments
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="flex items-center justify-center gap-4">
                            <div className="text-center">
                                <div
                                    className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center shadow-lg"
                                    style={{ backgroundColor: dragSource ? NODE_COLORS[dragSource.node_type] : '#ccc' }}
                                >
                                    <span className="text-white text-xs font-bold">
                                        {dragSource?.name.substring(0, 2).toUpperCase()}
                                    </span>
                                </div>
                                <div className="text-sm font-medium">{dragSource?.name}</div>
                                <div className="text-xs text-gray-500">{dragSource?.node_type}</div>
                            </div>

                            <div className="text-2xl text-gray-400">→</div>

                            <div className="text-center">
                                <div
                                    className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center shadow-lg"
                                    style={{ backgroundColor: dragTarget ? NODE_COLORS[dragTarget.node_type] : '#ccc' }}
                                >
                                    <span className="text-white text-xs font-bold">
                                        {dragTarget?.name.substring(0, 2).toUpperCase()}
                                    </span>
                                </div>
                                <div className="text-sm font-medium">{dragTarget?.name}</div>
                                <div className="text-xs text-gray-500">{dragTarget?.node_type}</div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">Type de relation</label>
                            <Select value={selectedRelationType} onValueChange={setSelectedRelationType}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Choisir le type de relation..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {RELATIONSHIP_TYPES.map(type => (
                                        <SelectItem key={type.value} value={type.value}>
                                            {type.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setShowLinkModal(false)}>
                            Annuler
                        </Button>
                        <Button
                            onClick={handleCreateLink}
                            disabled={!selectedRelationType || isCreatingLink}
                        >
                            {isCreatingLink ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                    Création...
                                </>
                            ) : (
                                <>
                                    <Plus className="h-4 w-4 mr-2" />
                                    Créer le lien
                                </>
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
