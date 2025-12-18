// ============================================
// RADIAL RINGS 3D MODAL
// ============================================
// Animated 3D visualization of Radial Rings Discovery Engine
// - Progressive node addition in concentric rings
// - Luminous connections (green = valid, red = kill criteria)
// - Modal overlay with close button

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { X, Play, Pause, RotateCcw, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// ============================================
// TYPES
// ============================================

interface RingNode {
    id: string;
    ring: number;
    lane: string;
    name: string;
    properties: Record<string, any>;
    proximity_score: number;
    evidence_grade: string;
    translation_gap: boolean;
}

interface RingEdge {
    id: string;
    source: string;
    target: string;
    relationship: string;
    evidence_grade: string;
    translation_gap: boolean;
    weight: number;
    hasKillCriteria?: boolean;
}

interface MicroSignal {
    id: string;
    observation: string;
    confidence: number;
    triangulation_score: number;
    kill_criteria?: string;
}

interface RadialRingsData {
    knowledge_graph: {
        nodes: RingNode[];
        edges: RingEdge[];
    };
    micro_signals: MicroSignal[];
    hypotheses: any[];
}

// ============================================
// RING COLORS
// ============================================

const RING_COLORS: Record<number, string> = {
    0: '#ef4444', // Red - Pathology center
    1: '#22c55e', // Green - Treatments
    2: '#f59e0b', // Orange - Effects
    3: '#8b5cf6', // Purple - Etiology
    4: '#06b6d4', // Cyan - Frontiers
};

const LANE_COLORS: Record<string, string> = {
    pathology: '#ef4444',
    drugs: '#22c55e',
    symptoms: '#f59e0b',
    biomarkers: '#3b82f6',
    adverse_events: '#f97316',
    mechanisms: '#ec4899',
    interactions: '#14b8a6',
    triggers: '#a855f7',
    genetics: '#6366f1',
    exposures: '#84cc16',
    frontiers: '#06b6d4',
};

// ============================================
// ANIMATED NODE COMPONENT
// ============================================

interface AnimatedNodeProps {
    node: RingNode;
    position: THREE.Vector3;
    delay: number;
    isAnimating: boolean;
    isSelected: boolean;
    onClick: () => void;
}

function AnimatedNode({ node, position, delay, isAnimating, isSelected, onClick }: AnimatedNodeProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const [scale, setScale] = useState(0);
    const [glowIntensity, setGlowIntensity] = useState(0);

    const color = useMemo(() => LANE_COLORS[node.lane] || RING_COLORS[node.ring] || '#94a3b8', [node]);
    const targetScale = isSelected ? 0.3 : 0.15 + node.proximity_score * 0.1;

    useEffect(() => {
        if (isAnimating) {
            setScale(0);
            const timer = setTimeout(() => {
                setScale(targetScale);
                setGlowIntensity(1);
            }, delay);
            return () => clearTimeout(timer);
        } else {
            setScale(targetScale);
        }
    }, [isAnimating, delay, targetScale]);

    useFrame((state, delta) => {
        if (!meshRef.current) return;

        // Smooth scale animation
        const currentScale = meshRef.current.scale.x;
        const newScale = THREE.MathUtils.lerp(currentScale, scale, delta * 3);
        meshRef.current.scale.setScalar(newScale);

        // Pulse effect for selected
        if (isSelected) {
            const pulse = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.1;
            meshRef.current.scale.multiplyScalar(pulse);
        }

        // Glow fade
        setGlowIntensity(prev => Math.max(0, prev - delta * 0.5));
    });

    return (
        <group position={position}>
            {/* Main node sphere */}
            <mesh ref={meshRef} onClick={onClick}>
                <sphereGeometry args={[1, 16, 16]} />
                <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={isSelected ? 0.5 : glowIntensity * 0.3}
                />
            </mesh>

            {/* Glow effect on spawn */}
            {glowIntensity > 0.1 && (
                <mesh scale={1 + glowIntensity * 0.5}>
                    <sphereGeometry args={[1, 16, 16]} />
                    <meshBasicMaterial
                        color={color}
                        transparent
                        opacity={glowIntensity * 0.3}
                    />
                </mesh>
            )}

            {/* Label on hover/select */}
            {isSelected && (
                <Html position={[0, 0.5, 0]} center>
                    <div className="bg-black/80 text-white px-2 py-1 rounded text-xs whitespace-nowrap max-w-[150px] truncate">
                        {node.name}
                    </div>
                </Html>
            )}
        </group>
    );
}

// ============================================
// ANIMATED EDGE COMPONENT
// ============================================

interface AnimatedEdgeProps {
    start: THREE.Vector3;
    end: THREE.Vector3;
    hasKillCriteria: boolean;
    delay: number;
    isAnimating: boolean;
    evidenceGrade: string;
}

function AnimatedEdge({ start, end, hasKillCriteria, delay, isAnimating, evidenceGrade }: AnimatedEdgeProps) {
    const lineRef = useRef<any>(null);
    const [progress, setProgress] = useState(0);
    const [pulsePosition, setPulsePosition] = useState(0);

    const color = hasKillCriteria ? '#ef4444' :
        evidenceGrade === 'A' ? '#22c55e' :
            evidenceGrade === 'B' ? '#3b82f6' :
                evidenceGrade === 'C' ? '#f59e0b' : '#6b7280';

    useEffect(() => {
        if (isAnimating) {
            setProgress(0);
            const timer = setTimeout(() => {
                const animInterval = setInterval(() => {
                    setProgress(p => {
                        if (p >= 1) {
                            clearInterval(animInterval);
                            return 1;
                        }
                        return p + 0.05;
                    });
                }, 30);
            }, delay);
            return () => clearTimeout(timer);
        } else {
            setProgress(1);
        }
    }, [isAnimating, delay]);

    useFrame((state) => {
        // Pulse animation along the line
        setPulsePosition((state.clock.elapsedTime * 0.5) % 1);
    });

    // Interpolated end point during animation
    const animatedEnd = useMemo(() => {
        return new THREE.Vector3().lerpVectors(start, end, progress);
    }, [start, end, progress]);

    // Pulse point position
    const pulsePoint = useMemo(() => {
        return new THREE.Vector3().lerpVectors(start, end, pulsePosition);
    }, [start, end, pulsePosition]);

    if (progress === 0) return null;

    return (
        <group>
            {/* Main line */}
            <Line
                points={[start, animatedEnd]}
                color={color}
                lineWidth={hasKillCriteria ? 3 : 1.5}
                transparent
                opacity={0.6}
            />

            {/* Pulse particle traveling along line */}
            {progress === 1 && (
                <mesh position={pulsePoint}>
                    <sphereGeometry args={[0.05, 8, 8]} />
                    <meshBasicMaterial
                        color={hasKillCriteria ? '#ff0000' : '#00ff00'}
                        transparent
                        opacity={0.8}
                    />
                </mesh>
            )}
        </group>
    );
}

// ============================================
// RING CIRCLE COMPONENT
// ============================================

interface RingCircleProps {
    ring: number;
    radius: number;
    delay: number;
    isAnimating: boolean;
}

function RingCircle({ ring, radius, delay, isAnimating }: RingCircleProps) {
    const [opacity, setOpacity] = useState(0);

    useEffect(() => {
        if (isAnimating) {
            setOpacity(0);
            const timer = setTimeout(() => {
                setOpacity(0.3);
            }, delay);
            return () => clearTimeout(timer);
        } else {
            setOpacity(0.3);
        }
    }, [isAnimating, delay]);

    const points = useMemo(() => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 64; i++) {
            const angle = (i / 64) * Math.PI * 2;
            pts.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
        }
        return pts;
    }, [radius]);

    if (opacity === 0) return null;

    return (
        <Line
            points={points}
            color={RING_COLORS[ring]}
            lineWidth={2}
            transparent
            opacity={opacity}
            dashed
            dashSize={0.2}
            gapSize={0.1}
        />
    );
}

// ============================================
// RADIAL SCENE COMPONENT
// ============================================

interface RadialSceneProps {
    data: RadialRingsData | null;
    isAnimating: boolean;
    selectedNodeId: string | null;
    onNodeSelect: (nodeId: string | null) => void;
}

function RadialScene({ data, isAnimating, selectedNodeId, onNodeSelect }: RadialSceneProps) {
    const { camera } = useThree();

    // Calculate positions for nodes in radial layout
    const { nodePositions, maxRing } = useMemo(() => {
        if (!data?.knowledge_graph?.nodes) return { nodePositions: new Map(), maxRing: 0 };

        const positions = new Map<string, THREE.Vector3>();
        const nodesByRing = new Map<number, RingNode[]>();
        let maxRing = 0;

        // Group nodes by ring
        for (const node of data.knowledge_graph.nodes) {
            if (!nodesByRing.has(node.ring)) {
                nodesByRing.set(node.ring, []);
            }
            nodesByRing.get(node.ring)!.push(node);
            maxRing = Math.max(maxRing, node.ring);
        }

        // Calculate positions in concentric circles
        for (const [ring, nodes] of nodesByRing.entries()) {
            const radius = ring === 0 ? 0 : ring * 2.5;
            const angleStep = (Math.PI * 2) / Math.max(nodes.length, 1);

            nodes.forEach((node, i) => {
                const angle = angleStep * i;
                const jitter = (Math.random() - 0.5) * 0.3; // Small random offset
                const x = Math.cos(angle) * (radius + jitter);
                const z = Math.sin(angle) * (radius + jitter);
                const y = (Math.random() - 0.5) * 0.5; // Small Y variation

                positions.set(node.id, new THREE.Vector3(x, y, z));
            });
        }

        return { nodePositions: positions, maxRing };
    }, [data]);

    // Identify kill criteria edges
    const edgesWithKillCriteria = useMemo(() => {
        if (!data?.knowledge_graph?.edges || !data?.micro_signals) return new Set<string>();

        const killCriteriaIds = new Set<string>();

        for (const signal of data.micro_signals) {
            // If signal has low confidence or kill criteria mentioned, mark supporting edges
            if (signal.confidence < 0.3 || signal.kill_criteria) {
                // Mark edges related to this signal as having kill criteria
                for (const edge of data.knowledge_graph.edges) {
                    if (edge.translation_gap || edge.evidence_grade === 'D') {
                        killCriteriaIds.add(edge.id);
                    }
                }
            }
        }

        return killCriteriaIds;
    }, [data]);

    if (!data?.knowledge_graph) return null;

    return (
        <>
            {/* Ambient lighting */}
            <ambientLight intensity={0.3} />
            <pointLight position={[10, 10, 10]} intensity={1} color="#ffffff" />
            <pointLight position={[-10, -10, -10]} intensity={0.5} color="#8b5cf6" />

            {/* Background */}
            <color attach="background" args={['#030712']} />

            {/* Ring circles (visual guides) */}
            {Array.from({ length: maxRing + 1 }).map((_, ring) => (
                <RingCircle
                    key={`ring-${ring}`}
                    ring={ring}
                    radius={ring * 2.5}
                    delay={ring * 300}
                    isAnimating={isAnimating}
                />
            ))}

            {/* Nodes */}
            {data.knowledge_graph.nodes.map((node, i) => {
                const position = nodePositions.get(node.id);
                if (!position) return null;

                return (
                    <AnimatedNode
                        key={node.id}
                        node={node}
                        position={position}
                        delay={node.ring * 500 + i * 50}
                        isAnimating={isAnimating}
                        isSelected={selectedNodeId === node.id}
                        onClick={() => onNodeSelect(selectedNodeId === node.id ? null : node.id)}
                    />
                );
            })}

            {/* Edges */}
            {data.knowledge_graph.edges.map((edge, i) => {
                const startPos = nodePositions.get(edge.source);
                const endPos = nodePositions.get(edge.target);
                if (!startPos || !endPos) return null;

                const hasKillCriteria = edgesWithKillCriteria.has(edge.id);

                return (
                    <AnimatedEdge
                        key={edge.id}
                        start={startPos}
                        end={endPos}
                        hasKillCriteria={hasKillCriteria}
                        delay={1500 + i * 30}
                        isAnimating={isAnimating}
                        evidenceGrade={edge.evidence_grade}
                    />
                );
            })}

            {/* Ring labels */}
            {['PATHOLOGIE', 'TRAITEMENTS', 'EFFETS', 'ÉTIOLOGIE', 'FRONTIÈRES'].map((label, ring) => (
                <Html
                    key={label}
                    position={[0, -0.5, ring * 2.5 + 1]}
                    center
                >
                    <div
                        className="text-xs font-bold px-1 rounded opacity-50"
                        style={{ color: RING_COLORS[ring] }}
                    >
                        {label}
                    </div>
                </Html>
            ))}

            {/* Camera controls */}
            <OrbitControls
                enableDamping
                dampingFactor={0.05}
                rotateSpeed={0.5}
                zoomSpeed={0.8}
                minDistance={5}
                maxDistance={30}
                autoRotate={!selectedNodeId}
                autoRotateSpeed={0.5}
            />
        </>
    );
}

// ============================================
// SIGNAL PANEL COMPONENT
// ============================================

interface SignalPanelProps {
    signals: MicroSignal[];
    onSignalClick: (signalId: string) => void;
}

function SignalPanel({ signals, onSignalClick }: SignalPanelProps) {
    if (signals.length === 0) return null;

    return (
        <div className="absolute bottom-4 left-4 right-4 z-20">
            <div className="bg-gray-900/95 rounded-lg border border-gray-700 p-3">
                <h4 className="text-sm font-bold text-purple-400 mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Micro-Signaux Détectés ({signals.length})
                </h4>
                <div className="flex gap-2 overflow-x-auto pb-2">
                    {signals.slice(0, 5).map(signal => (
                        <button
                            key={signal.id}
                            onClick={() => onSignalClick(signal.id)}
                            className={`flex-shrink-0 p-2 rounded-lg border text-left text-xs transition-colors ${signal.confidence > 0.5
                                    ? 'border-green-500/50 bg-green-900/30 hover:bg-green-900/50'
                                    : 'border-red-500/50 bg-red-900/30 hover:bg-red-900/50'
                                }`}
                        >
                            <div className="font-medium truncate max-w-[150px]">{signal.observation}</div>
                            <div className="flex items-center gap-2 mt-1 text-gray-400">
                                <span>Triangulation: {signal.triangulation_score}/4</span>
                                <span className={signal.confidence > 0.5 ? 'text-green-400' : 'text-red-400'}>
                                    {Math.round(signal.confidence * 100)}%
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ============================================
// MAIN MODAL COMPONENT
// ============================================

interface RadialRingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    pathology: string;
    mode?: 'THERAPY' | 'SAFETY' | 'ETIOLOGY' | 'RELAPSE';
    context?: Record<string, any>;
}

export default function RadialRingsModal({
    isOpen,
    onClose,
    pathology,
    mode = 'ETIOLOGY',
    context
}: RadialRingsModalProps) {
    const [data, setData] = useState<RadialRingsData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAnimating, setIsAnimating] = useState(true);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    // Fetch data when modal opens
    useEffect(() => {
        if (isOpen && pathology) {
            fetchRadialRings();
        }
    }, [isOpen, pathology]);

    const fetchRadialRings = async () => {
        setIsLoading(true);
        setError(null);
        setData(null);
        setIsAnimating(true);

        try {
            const response = await supabase.functions.invoke('radial-rings-engine', {
                body: {
                    pathology,
                    mode,
                    budget: 'medium',
                    context
                }
            });

            if (response.error) throw response.error;

            setData(response.data);
            setIsAnimating(true);

        } catch (err) {
            console.error('Radial rings error:', err);
            setError(String(err));
        } finally {
            setIsLoading(false);
        }
    };

    const handleReplay = () => {
        setIsAnimating(false);
        setTimeout(() => setIsAnimating(true), 100);
    };

    const handleSignalClick = (signalId: string) => {
        // Find nodes related to this signal and highlight them
        console.log('Signal clicked:', signalId);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/90 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal content */}
            <div className="relative w-full h-full max-w-full max-h-full">
                {/* Header */}
                <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-start">
                    <div className="bg-gray-900/95 rounded-lg border border-gray-700 p-4">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            🔬 Radial Rings Discovery
                        </h2>
                        <p className="text-gray-400 text-sm mt-1">
                            {pathology} • Mode: {mode}
                        </p>
                        {data && (
                            <div className="flex gap-4 mt-2 text-xs">
                                <span className="text-green-400">
                                    {data.knowledge_graph.nodes.length} nœuds
                                </span>
                                <span className="text-blue-400">
                                    {data.knowledge_graph.edges.length} connexions
                                </span>
                                <span className="text-purple-400">
                                    {data.micro_signals.length} signaux
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleReplay}
                            className="bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-lg transition-colors"
                            title="Rejouer l'animation"
                        >
                            <RotateCcw className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setIsAnimating(!isAnimating)}
                            className="bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-lg transition-colors"
                            title={isAnimating ? 'Pause' : 'Play'}
                        >
                            {isAnimating ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                        </button>
                        <button
                            onClick={onClose}
                            className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Legend */}
                <div className="absolute top-4 right-4 z-20 mt-20 bg-gray-900/95 rounded-lg border border-gray-700 p-3">
                    <h4 className="text-xs font-bold text-gray-400 mb-2">LÉGENDE</h4>
                    <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-green-500" />
                            <span className="text-green-400">Signal valide (Evidence A/B)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-yellow-500" />
                            <span className="text-yellow-400">Signal faible (Evidence C)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-500" />
                            <span className="text-red-400">Kill criteria (bloqué)</span>
                        </div>
                    </div>
                </div>

                {/* Loading state */}
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center z-30">
                        <div className="bg-gray-900/95 rounded-lg border border-gray-700 p-8 text-center">
                            <div className="animate-spin w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
                            <p className="text-white text-lg">Construction des anneaux...</p>
                            <p className="text-gray-400 text-sm mt-2">Connexion à OpenFDA, ClinicalTrials...</p>
                        </div>
                    </div>
                )}

                {/* Error state */}
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center z-30">
                        <div className="bg-red-900/50 border border-red-500 rounded-lg p-8 text-center max-w-md">
                            <p className="text-red-400 text-lg">Erreur</p>
                            <p className="text-gray-300 text-sm mt-2">{error}</p>
                            <button
                                onClick={fetchRadialRings}
                                className="mt-4 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
                            >
                                Réessayer
                            </button>
                        </div>
                    </div>
                )}

                {/* 3D Canvas */}
                <Canvas
                    camera={{ position: [0, 8, 15], fov: 60 }}
                    gl={{ antialias: true, alpha: true }}
                    className="absolute inset-0"
                >
                    <RadialScene
                        data={data}
                        isAnimating={isAnimating}
                        selectedNodeId={selectedNodeId}
                        onNodeSelect={setSelectedNodeId}
                    />
                </Canvas>

                {/* Micro-signals panel */}
                {data && (
                    <SignalPanel
                        signals={data.micro_signals}
                        onSignalClick={handleSignalClick}
                    />
                )}
            </div>
        </div>
    );
}
