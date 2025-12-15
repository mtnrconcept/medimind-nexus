import { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { supabase } from '@/integrations/supabase/client';

// Node interface
interface KGNode {
    id: string;
    name: string;
    node_type: string;
    category_id?: string;
    properties?: Record<string, any>;
}

// Edge interface
interface KGEdge {
    id: string;
    source_node_id: string;
    target_node_id: string;
    relationship_type: string;
}

// Node type colors matching the 2D view
const NODE_COLORS: Record<string, string> = {
    substance: '#3b82f6',
    medication: '#22c55e',
    pathology: '#ef4444',
    symptom: '#f59e0b',
    treatment: '#8b5cf6',
    enzyme: '#ec4899',
    receptor: '#06b6d4',
    allergen: '#f97316',
    food: '#84cc16',
    vaccine: '#14b8a6',
    organ: '#64748b',
    default: '#94a3b8'
};

// Grid configuration for Blender-like vertex alignment
const GRID_SIZE = 10; // 10x10x10 grid = 1000 possible positions
const CUBE_SIZE = 10; // Physical size of the cube

// Hash function for deterministic positioning
function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

// Calculate semantic positions based on edges (connectivity clustering)
interface SemanticPositionCalculator {
    nodePositions: Map<string, THREE.Vector3>;
    calculate: () => void;
}

function createSemanticPositionCalculator(
    nodes: KGNode[],
    edges: KGEdge[],
    gridSize: number = GRID_SIZE,
    cubeSize: number = CUBE_SIZE
): SemanticPositionCalculator {
    const nodePositions = new Map<string, THREE.Vector3>();

    // Build adjacency map for connectivity
    const adjacency = new Map<string, Set<string>>();
    nodes.forEach(n => adjacency.set(n.id, new Set()));

    edges.forEach(edge => {
        adjacency.get(edge.source_node_id)?.add(edge.target_node_id);
        adjacency.get(edge.target_node_id)?.add(edge.source_node_id);
    });

    // Calculate "semantic coordinate" for each node based on its connections
    // Nodes with shared connections will have similar coordinates
    function calculate() {
        const nodeIndex = new Map<string, number>();
        nodes.forEach((n, i) => nodeIndex.set(n.id, i));

        // Step 1: Calculate connectivity-based position seeds
        // Highly connected nodes get central positions, isolated nodes get peripheral
        const connectivity = new Map<string, number>();
        nodes.forEach(node => {
            const neighbors = adjacency.get(node.id);
            connectivity.set(node.id, neighbors?.size || 0);
        });

        // Step 2: Cluster nodes by shared neighbors (semantic similarity)
        // Use a simplified spectral-like approach: nodes sharing neighbors = similar position
        nodes.forEach(node => {
            const neighbors = adjacency.get(node.id) || new Set();
            const hash = hashCode(node.id);

            // Base position from hash (deterministic)
            let x = (hash % gridSize) / gridSize - 0.5;
            let y = ((hash >> 8) % gridSize) / gridSize - 0.5;
            let z = ((hash >> 16) % gridSize) / gridSize - 0.5;

            // If node has connections, pull position towards neighbors' "center"
            if (neighbors.size > 0) {
                let avgX = 0, avgY = 0, avgZ = 0;
                let count = 0;

                // Calculate average position of neighbors (using their hashes as seeds)
                neighbors.forEach(neighborId => {
                    const nHash = hashCode(neighborId);
                    avgX += (nHash % gridSize) / gridSize - 0.5;
                    avgY += ((nHash >> 8) % gridSize) / gridSize - 0.5;
                    avgZ += ((nHash >> 16) % gridSize) / gridSize - 0.5;
                    count++;
                });

                if (count > 0) {
                    avgX /= count;
                    avgY /= count;
                    avgZ /= count;

                    // Pull towards neighbors (the more connections, the stronger the pull)
                    const pullStrength = Math.min(0.7, neighbors.size * 0.1);
                    x = x * (1 - pullStrength) + avgX * pullStrength;
                    y = y * (1 - pullStrength) + avgY * pullStrength;
                    z = z * (1 - pullStrength) + avgZ * pullStrength;
                }
            }

            // Snap to grid (Blender-like vertex alignment)
            const gridStep = 1 / gridSize;
            x = Math.round(x / gridStep) * gridStep;
            y = Math.round(y / gridStep) * gridStep;
            z = Math.round(z / gridStep) * gridStep;

            // Add small offset based on node type to prevent overlap at same grid point
            const typeOffset = (Object.keys(NODE_COLORS).indexOf(node.node_type) || 0) * 0.01;
            x += typeOffset;

            // Scale to cube size
            nodePositions.set(node.id, new THREE.Vector3(
                x * cubeSize,
                y * cubeSize,
                z * cubeSize
            ));
        });
    }

    return { nodePositions, calculate };
}

// Get position for a node from precomputed positions
function getNodePosition(
    nodeId: string,
    positionMap: Map<string, THREE.Vector3>,
    fallbackNode?: KGNode
): THREE.Vector3 {
    const pos = positionMap.get(nodeId);
    if (pos) return pos;

    // Fallback: use hash-based position
    const hash = hashCode(nodeId);
    return new THREE.Vector3(
        ((hash % GRID_SIZE) / GRID_SIZE - 0.5) * CUBE_SIZE,
        (((hash >> 8) % GRID_SIZE) / GRID_SIZE - 0.5) * CUBE_SIZE,
        (((hash >> 16) % GRID_SIZE) / GRID_SIZE - 0.5) * CUBE_SIZE
    );
}

// Nodes mesh component using InstancedMesh for performance
interface NodesMeshProps {
    nodes: KGNode[];
    positionMap: Map<string, THREE.Vector3>;
    onNodeClick: (node: KGNode, event: any) => void;
    selectedNodeIds: string[];
}

function NodesMesh({ nodes, positionMap, onNodeClick, selectedNodeIds }: NodesMeshProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const { raycaster, camera, pointer } = useThree();

    // Create geometry and material
    const geometry = useMemo(() => new THREE.SphereGeometry(0.08, 8, 8), []);

    // Calculate positions and colors for all nodes
    const { positions, colors, nodeMap } = useMemo(() => {
        const positions: THREE.Vector3[] = [];
        const colors: THREE.Color[] = [];
        const nodeMap = new Map<number, KGNode>();

        nodes.forEach((node, index) => {
            // Use semantic position from map, or fallback
            positions.push(getNodePosition(node.id, positionMap, node));
            colors.push(new THREE.Color(NODE_COLORS[node.node_type] || NODE_COLORS.default));
            nodeMap.set(index, node);
        });

        return { positions, colors, nodeMap };
    }, [nodes, positionMap]);

    // Update instance matrices and colors
    useEffect(() => {
        if (!meshRef.current) return;

        const mesh = meshRef.current;
        const matrix = new THREE.Matrix4();
        const color = new THREE.Color();

        positions.forEach((pos, i) => {
            // Scale up selected nodes
            const node = nodeMap.get(i);
            const isSelected = node && selectedNodeIds.includes(node.id);
            const scale = isSelected ? 2 : 1;
            matrix.makeScale(scale, scale, scale);
            matrix.setPosition(pos);
            mesh.setMatrixAt(i, matrix);

            // Set color (brighter if selected)
            if (isSelected) {
                mesh.setColorAt(i, new THREE.Color('#ffffff'));
            } else {
                mesh.setColorAt(i, colors[i]);
            }
        });

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }, [positions, colors, selectedNodeIds, nodeMap]);

    // Handle click
    const handleClick = useCallback((event: any) => {
        if (!meshRef.current) return;

        raycaster.setFromCamera(pointer, camera);
        const intersects = raycaster.intersectObject(meshRef.current);

        if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
            const node = nodeMap.get(intersects[0].instanceId);
            if (node) onNodeClick(node, event);
        }
    }, [raycaster, camera, pointer, nodeMap, onNodeClick]);

    return (
        <instancedMesh
            ref={meshRef}
            args={[geometry, undefined, nodes.length]}
            onClick={handleClick}
        >
            <meshPhongMaterial vertexColors />
        </instancedMesh>
    );
}

// Edges component
interface EdgesMeshProps {
    edges: KGEdge[];
    positionMap: Map<string, THREE.Vector3>;
    selectedNodeId: string | null;
}

function EdgesMesh({ edges, positionMap, selectedNodeId }: EdgesMeshProps) {
    // Filter edges to show only those connected to selected node (or all if none selected)
    const visibleEdges = useMemo(() => {
        if (!selectedNodeId) {
            // Show subset of edges for performance
            return edges.slice(0, 1000);
        }
        return edges.filter(e =>
            e.source_node_id === selectedNodeId ||
            e.target_node_id === selectedNodeId
        );
    }, [edges, selectedNodeId]);

    // Create line segments
    const lineSegments = useMemo(() => {
        const points: THREE.Vector3[] = [];

        visibleEdges.forEach(edge => {
            const sourcePos = positionMap.get(edge.source_node_id);
            const targetPos = positionMap.get(edge.target_node_id);

            if (sourcePos && targetPos) {
                points.push(sourcePos.clone());
                points.push(targetPos.clone());
            }
        });

        return points;
    }, [visibleEdges, positionMap]);

    if (lineSegments.length === 0) return null;

    return (
        <lineSegments>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={lineSegments.length}
                    array={new Float32Array(lineSegments.flatMap(v => [v.x, v.y, v.z]))}
                    itemSize={3}
                />
            </bufferGeometry>
            <lineBasicMaterial
                color={selectedNodeId ? "#ffffff" : "#4b5563"}
                transparent
                opacity={selectedNodeId ? 0.8 : 0.2}
                linewidth={1}
            />
        </lineSegments>
    );
}

// Wireframe cube component
function WireframeCube({ size }: { size: number }) {
    return (
        <lineSegments>
            <edgesGeometry args={[new THREE.BoxGeometry(size, size, size)]} />
            <lineBasicMaterial color="#374151" transparent opacity={0.3} />
        </lineSegments>
    );
}

// Axis labels
function AxisLabels({ size }: { size: number }) {
    const halfSize = size / 2 + 1;
    return (
        <>
            <Html position={[0, halfSize, 0]} center>
                <div className="text-purple-400 text-xs font-bold bg-black/50 px-1 rounded">
                    TREATMENTS ↑
                </div>
            </Html>
            <Html position={[-halfSize, 0, 0]} center>
                <div className="text-red-400 text-xs font-bold bg-black/50 px-1 rounded">
                    ← PATHOLOGIES
                </div>
            </Html>
            <Html position={[halfSize, 0, 0]} center>
                <div className="text-yellow-400 text-xs font-bold bg-black/50 px-1 rounded">
                    SYMPTOMS →
                </div>
            </Html>
            <Html position={[0, 0, halfSize]} center>
                <div className="text-green-400 text-xs font-bold bg-black/50 px-1 rounded">
                    MEDICATIONS
                </div>
            </Html>
            <Html position={[0, 0, -halfSize]} center>
                <div className="text-blue-400 text-xs font-bold bg-black/50 px-1 rounded">
                    SUBSTANCES
                </div>
            </Html>
        </>
    );
}

// Selected node info panel with multi-select and link analysis
interface NodeInfoPanelProps {
    selectedNodes: KGNode[];
    onRemoveNode: (nodeId: string) => void;
    onClearSelection: () => void;
    onAnalyzeLink: () => void;
    isAnalyzing: boolean;
    analysisResult: LinkAnalysisResult | null;
}

interface LinkAnalysisResult {
    relationship: 'beneficial' | 'contraindicated' | 'danger' | 'neutral' | 'unknown';
    confidence: number;
    reasoning: string;
    recommendations: string[];
}

function NodeInfoPanel({
    selectedNodes,
    onRemoveNode,
    onClearSelection,
    onAnalyzeLink,
    isAnalyzing,
    analysisResult
}: NodeInfoPanelProps) {
    if (selectedNodes.length === 0) return null;

    const relationshipColors: Record<string, string> = {
        beneficial: 'text-green-400 bg-green-900/50',
        contraindicated: 'text-orange-400 bg-orange-900/50',
        danger: 'text-red-400 bg-red-900/50',
        neutral: 'text-gray-400 bg-gray-700/50',
        unknown: 'text-blue-400 bg-blue-900/50'
    };

    const relationshipIcons: Record<string, string> = {
        beneficial: '✅',
        contraindicated: '⚠️',
        danger: '🚫',
        neutral: '➖',
        unknown: '❓'
    };

    return (
        <div className="absolute top-4 right-4 bg-gray-900/95 text-white p-4 rounded-lg w-80 border border-gray-700 max-h-[90%] overflow-y-auto">
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    🎯 Nœuds sélectionnés ({selectedNodes.length})
                </h3>
                <button onClick={onClearSelection} className="text-gray-400 hover:text-white text-sm">
                    Effacer tout
                </button>
            </div>

            {/* Selected nodes list */}
            <div className="space-y-2 mb-4">
                {selectedNodes.map(node => (
                    <div
                        key={node.id}
                        className="flex items-start justify-between p-2 bg-gray-800/50 rounded border border-gray-700"
                    >
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: NODE_COLORS[node.node_type] || NODE_COLORS.default }}
                                />
                                <span className="font-medium text-sm truncate">{node.name}</span>
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                                Type: {node.node_type}
                            </div>
                            {node.properties && Object.keys(node.properties).length > 0 && (
                                <div className="text-xs text-gray-500 mt-1">
                                    {Object.entries(node.properties).slice(0, 2).map(([k, v]) => (
                                        <div key={k}>{k}: {String(v).slice(0, 20)}...</div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => onRemoveNode(node.id)}
                            className="text-gray-500 hover:text-red-400 ml-2"
                        >
                            ✕
                        </button>
                    </div>
                ))}
            </div>

            {/* Link analysis section */}
            {selectedNodes.length >= 2 && (
                <div className="border-t border-gray-700 pt-3">
                    <button
                        onClick={onAnalyzeLink}
                        disabled={isAnalyzing}
                        className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                        {isAnalyzing ? (
                            <>
                                <span className="animate-spin">⚡</span>
                                Analyse en cours...
                            </>
                        ) : (
                            <>
                                🔬 Analyser le lien thérapeutique
                            </>
                        )}
                    </button>

                    <p className="text-xs text-gray-400 mt-2 text-center">
                        Analyse les interactions entre les {selectedNodes.length} éléments
                    </p>
                </div>
            )}

            {/* Analysis result */}
            {analysisResult && (
                <div className="border-t border-gray-700 pt-3 mt-3">
                    <div className={`p-3 rounded-lg ${relationshipColors[analysisResult.relationship]}`}>
                        <div className="flex items-center gap-2 font-bold text-lg mb-2">
                            <span>{relationshipIcons[analysisResult.relationship]}</span>
                            <span className="capitalize">{analysisResult.relationship}</span>
                            <span className="text-sm font-normal ml-auto">
                                {Math.round(analysisResult.confidence * 100)}% confiance
                            </span>
                        </div>
                        <p className="text-sm mb-3">{analysisResult.reasoning}</p>

                        {analysisResult.recommendations.length > 0 && (
                            <div className="space-y-1">
                                <p className="text-xs font-semibold">Recommandations:</p>
                                {analysisResult.recommendations.map((rec, i) => (
                                    <p key={i} className="text-xs">• {rec}</p>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Instructions */}
            <div className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-700">
                💡 Ctrl+clic pour sélectionner plusieurs nœuds
            </div>
        </div>
    );
}

// Main 3D Knowledge Graph component
export default function KnowledgeGraph3D() {
    const [nodes, setNodes] = useState<KGNode[]>([]);
    const [edges, setEdges] = useState<KGEdge[]>([]);
    const [positionMap, setPositionMap] = useState<Map<string, THREE.Vector3>>(new Map());
    const [isLoading, setIsLoading] = useState(true);
    const [selectedNodes, setSelectedNodes] = useState<KGNode[]>([]);
    const [stats, setStats] = useState({ nodes: 0, edges: 0 });

    // Link analysis state
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<LinkAnalysisResult | null>(null);

    const cubeSize = CUBE_SIZE;

    // Load all nodes
    useEffect(() => {
        async function loadData() {
            setIsLoading(true);

            try {
                // Get total count first
                const { count: nodeCount } = await supabase
                    .from('cde_nodes')
                    .select('*', { count: 'exact', head: true });

                const { count: edgeCount } = await supabase
                    .from('cde_edges')
                    .select('*', { count: 'exact', head: true });

                setStats({ nodes: nodeCount || 0, edges: edgeCount || 0 });

                // Load nodes in batches for performance
                const batchSize = 5000;
                const allNodes: KGNode[] = [];
                let offset = 0;

                while (offset < (nodeCount || 0)) {
                    const { data } = await supabase
                        .from('cde_nodes')
                        .select('id, name, node_type, properties')
                        .range(offset, offset + batchSize - 1);

                    if (data) allNodes.push(...data as KGNode[]);
                    offset += batchSize;
                }

                setNodes(allNodes);

                // Load edges
                const { data: edgesData } = await supabase
                    .from('cde_edges')
                    .select('id, source_node_id, target_node_id, relationship_type')
                    .limit(5000);

                setEdges((edgesData || []) as KGEdge[]);

            } catch (error) {
                console.error('Failed to load graph data:', error);
            }

            setIsLoading(false);
        }

        loadData();
    }, []);

    // Calculate semantic positions when nodes and edges change
    useEffect(() => {
        if (nodes.length > 0) {
            console.log('Calculating semantic positions for', nodes.length, 'nodes...');
            const calculator = createSemanticPositionCalculator(nodes, edges);
            calculator.calculate();
            setPositionMap(calculator.nodePositions);
            console.log('Semantic positions calculated!');
        }
    }, [nodes, edges]);

    // Handle node click (Ctrl+click for multi-select)
    const handleNodeClick = useCallback((node: KGNode, event: any) => {
        const isCtrlClick = event?.ctrlKey || event?.metaKey;

        setSelectedNodes(prev => {
            const isAlreadySelected = prev.some(n => n.id === node.id);

            if (isAlreadySelected) {
                // Remove from selection
                return prev.filter(n => n.id !== node.id);
            } else if (isCtrlClick) {
                // Add to selection
                return [...prev, node];
            } else {
                // Replace selection
                return [node];
            }
        });

        // Clear previous analysis when selection changes
        setAnalysisResult(null);
    }, []);

    // Remove node from selection
    const handleRemoveNode = useCallback((nodeId: string) => {
        setSelectedNodes(prev => prev.filter(n => n.id !== nodeId));
        setAnalysisResult(null);
    }, []);

    // Clear all selection
    const handleClearSelection = useCallback(() => {
        setSelectedNodes([]);
        setAnalysisResult(null);
    }, []);

    // Analyze therapeutic link between selected nodes
    const handleAnalyzeLink = useCallback(async () => {
        if (selectedNodes.length < 2) return;

        setIsAnalyzing(true);
        setAnalysisResult(null);

        try {
            const nodeNames = selectedNodes.map(n => n.name);
            const nodeTypes = selectedNodes.map(n => n.node_type);

            // Call the focused-research function for analysis
            const response = await supabase.functions.invoke('focused-research', {
                body: {
                    query: `Analyze the therapeutic relationship between: ${nodeNames.join(', ')}. 
                           Classify as: beneficial, contraindicated, danger, neutral, or unknown.
                           Provide confidence level and recommendations.`,
                    context: {
                        nodes: selectedNodes.map(n => ({ name: n.name, type: n.node_type, properties: n.properties })),
                        analysisType: 'link_analysis'
                    }
                }
            });

            if (response.error) throw response.error;

            // Parse the AI response to extract structured data
            const aiResponse = response.data?.analysis || response.data?.response || '';

            // Simple classification based on response content
            let relationship: 'beneficial' | 'contraindicated' | 'danger' | 'neutral' | 'unknown' = 'unknown';
            let confidence = 0.5;

            const lowerResponse = aiResponse.toLowerCase();
            if (lowerResponse.includes('bénéfique') || lowerResponse.includes('beneficial') || lowerResponse.includes('synergi')) {
                relationship = 'beneficial';
                confidence = 0.8;
            } else if (lowerResponse.includes('contre-indiq') || lowerResponse.includes('contraindic')) {
                relationship = 'contraindicated';
                confidence = 0.75;
            } else if (lowerResponse.includes('danger') || lowerResponse.includes('toxique') || lowerResponse.includes('fatal')) {
                relationship = 'danger';
                confidence = 0.9;
            } else if (lowerResponse.includes('neutre') || lowerResponse.includes('neutral') || lowerResponse.includes('pas d\'interaction')) {
                relationship = 'neutral';
                confidence = 0.6;
            }

            setAnalysisResult({
                relationship,
                confidence,
                reasoning: aiResponse.slice(0, 500),
                recommendations: aiResponse.includes('•')
                    ? aiResponse.split('•').slice(1, 4).map((s: string) => s.trim().slice(0, 100))
                    : []
            });

        } catch (error) {
            console.error('Link analysis failed:', error);
            setAnalysisResult({
                relationship: 'unknown',
                confidence: 0,
                reasoning: 'Analyse impossible. Vérifiez votre connexion ou réessayez.',
                recommendations: []
            });
        }

        setIsAnalyzing(false);
    }, [selectedNodes]);

    return (
        <div className="relative w-full h-[700px] bg-gray-950 rounded-xl overflow-hidden">
            {/* Stats overlay */}
            <div className="absolute top-4 left-4 z-10 bg-gray-900/80 text-white p-3 rounded-lg text-sm">
                <div className="font-bold text-emerald-400 mb-1">🧊 3D Knowledge Graph</div>
                <div>Nodes: <span className="text-blue-400">{stats.nodes.toLocaleString()}</span></div>
                <div>Edges: <span className="text-purple-400">{stats.edges.toLocaleString()}</span></div>
                <div>Loaded: <span className="text-green-400">{nodes.length.toLocaleString()}</span></div>
                {isLoading && <div className="text-yellow-400 animate-pulse">Loading...</div>}
            </div>

            {/* Controls help */}
            <div className="absolute bottom-4 left-4 z-10 bg-gray-900/80 text-white p-2 rounded-lg text-xs">
                <div className="text-gray-400">🖱️ Drag: Rotate | Scroll: Zoom | Ctrl+Click: Multi-select</div>
            </div>

            {/* Selected node panel */}
            <NodeInfoPanel
                selectedNodes={selectedNodes}
                onRemoveNode={handleRemoveNode}
                onClearSelection={handleClearSelection}
                onAnalyzeLink={handleAnalyzeLink}
                isAnalyzing={isAnalyzing}
                analysisResult={analysisResult}
            />

            {/* 3D Canvas */}
            <Canvas
                camera={{ position: [15, 10, 15], fov: 60 }}
                gl={{ antialias: true }}
            >
                {/* Lighting */}
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} intensity={1} />
                <pointLight position={[-10, -10, -10]} intensity={0.5} />

                {/* Background */}
                <color attach="background" args={['#0a0a0a']} />

                {/* Wireframe cube container */}
                <WireframeCube size={cubeSize} />

                {/* Axis labels */}
                <AxisLabels size={cubeSize} />

                {/* Nodes */}
                {nodes.length > 0 && positionMap.size > 0 && (
                    <NodesMesh
                        nodes={nodes}
                        positionMap={positionMap}
                        onNodeClick={handleNodeClick}
                        selectedNodeIds={selectedNodes.map(n => n.id)}
                    />
                )}

                {/* Edges */}
                {edges.length > 0 && positionMap.size > 0 && (
                    <EdgesMesh
                        edges={edges}
                        positionMap={positionMap}
                        selectedNodeId={selectedNodes.length > 0 ? selectedNodes[0].id : null}
                    />
                )}

                {/* Camera controls */}
                <OrbitControls
                    enableDamping
                    dampingFactor={0.05}
                    rotateSpeed={0.5}
                    zoomSpeed={0.8}
                    minDistance={5}
                    maxDistance={50}
                />
            </Canvas>
        </div>
    );
}
