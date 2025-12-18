// ============================================
// RADIAL RINGS 3D MODAL - WebGL FLUID ANIMATION
// ============================================
// 3D visualization with progressive ring-by-ring animation
// Same design as 2D version but with 3D navigation

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { X, Play, Pause, RotateCcw, Sparkles, Loader2 } from 'lucide-react';
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
// RING COLORS (EXACT SAME AS 2D VERSION)
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
// ANIMATION TIMING (EXACT SAME AS 2D VERSION - in ms)
// ============================================

const TIMING = {
    CENTER_NODE_APPEAR: 500,
    RING_INTERVAL: 1500,
    LINK_GROW_DURATION: 800,
    NODE_APPEAR_DURATION: 300,
};

// Check if WebGL is available
function isWebGLAvailable(): boolean {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        return !!gl;
    } catch {
        return false;
    }
}

// ============================================
// 3D GLOWING NODE COMPONENT
// ============================================

interface GlowingNode3DProps {
    node: RingNode;
    position: THREE.Vector3;
    animationTime: number;
    isSelected: boolean;
    isHovered: boolean;
    onClick: () => void;
    onHover: (hovered: boolean) => void;
}

function GlowingNode3D({ node, position, animationTime, isSelected, isHovered, onClick, onHover }: GlowingNode3DProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const glowRef = useRef<THREE.Mesh>(null);
    const pulseRef = useRef<THREE.Mesh>(null);

    const color = useMemo(() => LANE_COLORS[node.lane] || RING_COLORS[node.ring] || '#94a3b8', [node]);

    // Calculate when this node should appear based on its ring (convert ms to seconds)
    const appearTime = (TIMING.CENTER_NODE_APPEAR + node.ring * TIMING.RING_INTERVAL) / 1000;
    const progress = Math.max(0, Math.min(1, (animationTime - appearTime) / (TIMING.NODE_APPEAR_DURATION / 1000)));

    // Size based on proximity score
    const baseSize = 0.12 + node.proximity_score * 0.08;
    const size = baseSize * progress;

    useFrame((state) => {
        if (!meshRef.current || progress < 1) return;

        // Gentle breathing animation (same as 2D version)
        const breathe = 1 + Math.sin(state.clock.elapsedTime * 2 + node.ring) * 0.05;
        meshRef.current.scale.setScalar(baseSize * breathe * (isSelected ? 1.3 : isHovered ? 1.1 : 1));

        // Glow pulse
        if (glowRef.current) {
            const glowPulse = 0.25 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
            (glowRef.current.material as THREE.MeshBasicMaterial).opacity = glowPulse;
        }

        // Pulse ring for center node (like 2D animate elements)
        if (pulseRef.current && node.ring === 0) {
            const pulseScale = 1 + (state.clock.elapsedTime % 2) / 2;
            pulseRef.current.scale.setScalar(pulseScale);
            (pulseRef.current.material as THREE.MeshBasicMaterial).opacity = 0.5 - (pulseScale - 1) * 0.5;
        }
    });

    if (progress <= 0) return null;

    return (
        <group position={position}>
            {/* Outer glow (like 2D filter: blur effect) */}
            <mesh ref={glowRef} scale={size * 1.8}>
                <sphereGeometry args={[1, 16, 16]} />
                <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={0.15}
                    side={THREE.BackSide}
                />
            </mesh>

            {/* Pulse ring for center node */}
            {node.ring === 0 && progress >= 1 && (
                <mesh ref={pulseRef} rotation={[Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[size, size * 1.1, 32]} />
                    <meshBasicMaterial
                        color={color}
                        transparent
                        opacity={0.5}
                        side={THREE.DoubleSide}
                    />
                </mesh>
            )}

            {/* Main node sphere */}
            <mesh
                ref={meshRef}
                onClick={onClick}
                onPointerOver={() => onHover(true)}
                onPointerOut={() => onHover(false)}
                scale={size}
            >
                <sphereGeometry args={[1, 32, 32]} />
                <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={isSelected ? 0.6 : 0.3}
                    metalness={0.2}
                    roughness={0.5}
                />
            </mesh>

            {/* Inner highlight (like 2D white highlight) */}
            <mesh position={[-size * 0.3, size * 0.3, size * 0.3]} scale={size * 0.3}>
                <sphereGeometry args={[1, 8, 8]} />
                <meshBasicMaterial color="white" transparent opacity={0.3} />
            </mesh>

            {/* Label */}
            {(isSelected || isHovered || node.ring === 0) && progress >= 1 && (
                <Html position={[0, size + 0.15, 0]} center>
                    <div
                        className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap shadow-xl pointer-events-none"
                        style={{
                            backgroundColor: 'rgba(0,0,0,0.9)',
                            border: `1px solid ${color}`,
                            color: 'white'
                        }}
                    >
                        {node.ring === 0 && <span>🎯 </span>}
                        {node.name.substring(0, 30)}{node.name.length > 30 ? '...' : ''}
                    </div>
                </Html>
            )}
        </group>
    );
}

// ============================================
// 3D GROWING EDGE COMPONENT
// ============================================

interface GrowingEdge3DProps {
    start: THREE.Vector3;
    end: THREE.Vector3;
    sourceRing: number;
    animationTime: number;
    hasKillCriteria: boolean;
    evidenceGrade: string;
}

function GrowingEdge3D({ start, end, sourceRing, animationTime, hasKillCriteria, evidenceGrade }: GrowingEdge3DProps) {
    const pulseRef = useRef<THREE.Mesh>(null);
    const tipRef = useRef<THREE.Mesh>(null);

    // Edge starts growing when source ring appears (convert ms to seconds)
    const sourceAppearTime = (TIMING.CENTER_NODE_APPEAR + sourceRing * TIMING.RING_INTERVAL + 200) / 1000;
    const progress = Math.max(0, Math.min(1, (animationTime - sourceAppearTime) / (TIMING.LINK_GROW_DURATION / 1000)));

    // Color based on evidence and kill criteria (same as 2D)
    const color = hasKillCriteria ? '#ef4444' :
        evidenceGrade === 'A' ? '#22c55e' :
            evidenceGrade === 'B' ? '#3b82f6' :
                evidenceGrade === 'C' ? '#f59e0b' : '#6b7280';

    // Calculate current endpoint based on progress
    const currentEnd = useMemo(() => {
        return new THREE.Vector3().lerpVectors(start, end, progress);
    }, [start, end, progress]);

    // Animate traveling pulse
    useFrame((state) => {
        if (progress < 1 || !pulseRef.current) return;

        const pulseProgress = (state.clock.elapsedTime * 0.5) % 1;
        const pulsePos = new THREE.Vector3().lerpVectors(start, end, pulseProgress);
        pulseRef.current.position.copy(pulsePos);
    });

    if (progress <= 0) return null;

    return (
        <group>
            {/* Glow effect (blur simulation) */}
            <Line
                points={[start, currentEnd]}
                color={color}
                lineWidth={hasKillCriteria ? 6 : 4}
                transparent
                opacity={0.3}
            />

            {/* Main line */}
            <Line
                points={[start, currentEnd]}
                color={color}
                lineWidth={hasKillCriteria ? 2 : 1}
                transparent
                opacity={0.8}
            />

            {/* Growing tip (while animating) */}
            {progress > 0 && progress < 1 && (
                <mesh ref={tipRef} position={currentEnd}>
                    <sphereGeometry args={[0.04, 8, 8]} />
                    <meshBasicMaterial color={color} transparent opacity={0.9} />
                </mesh>
            )}

            {/* Traveling pulse particle (after complete) */}
            {progress >= 1 && (
                <mesh ref={pulseRef}>
                    <sphereGeometry args={[0.03, 8, 8]} />
                    <meshBasicMaterial color={color} transparent opacity={0.8} />
                </mesh>
            )}
        </group>
    );
}

// ============================================
// 3D RING CIRCLE COMPONENT
// ============================================

interface RingCircle3DProps {
    ring: number;
    radius: number;
    animationTime: number;
}

function RingCircle3D({ ring, radius, animationTime }: RingCircle3DProps) {
    const appearTime = (TIMING.CENTER_NODE_APPEAR + ring * TIMING.RING_INTERVAL - 300) / 1000;
    const progress = Math.max(0, Math.min(1, (animationTime - appearTime) / 0.5));

    const points = useMemo(() => {
        const pts: THREE.Vector3[] = [];
        const segments = 64;
        for (let i = 0; i <= segments; i++) {
            const angle = (i / segments) * Math.PI * 2;
            pts.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
        }
        return pts;
    }, [radius]);

    if (progress <= 0 || radius === 0) return null;

    return (
        <Line
            points={points}
            color={RING_COLORS[ring]}
            lineWidth={2}
            transparent
            opacity={progress * 0.3}
            dashed
            dashSize={0.3}
            gapSize={0.15}
        />
    );
}

// ============================================
// MAIN 3D SCENE COMPONENT
// ============================================

interface Radial3DSceneProps {
    data: RadialRingsData;
    animationTime: number;
    selectedNodeId: string | null;
    hoveredNodeId: string | null;
    onNodeSelect: (nodeId: string | null) => void;
    onNodeHover: (nodeId: string | null) => void;
}

function Radial3DScene({ data, animationTime, selectedNodeId, hoveredNodeId, onNodeSelect, onNodeHover }: Radial3DSceneProps) {
    const ringRadius = 3; // Distance between rings

    // Calculate node positions in 3D radial layout
    const { nodePositions, maxRing, nodeMap } = useMemo(() => {
        const positions = new Map<string, THREE.Vector3>();
        const nodesByRing = new Map<number, RingNode[]>();
        const nodeMap = new Map<string, RingNode>();
        let maxRing = 0;

        // Group nodes by ring
        for (const node of data.knowledge_graph.nodes) {
            nodeMap.set(node.id, node);
            if (!nodesByRing.has(node.ring)) {
                nodesByRing.set(node.ring, []);
            }
            nodesByRing.get(node.ring)!.push(node);
            maxRing = Math.max(maxRing, node.ring);
        }

        // Calculate positions in concentric circles
        for (const [ring, nodes] of nodesByRing.entries()) {
            const radius = ring === 0 ? 0 : ring * ringRadius;
            const angleStep = (Math.PI * 2) / Math.max(nodes.length, 1);

            nodes.forEach((node, i) => {
                const angle = angleStep * i - Math.PI / 2; // Start from top
                const jitter = (Math.random() - 0.5) * 0.2;
                const x = Math.cos(angle) * (radius + jitter);
                const z = Math.sin(angle) * (radius + jitter);
                const y = (Math.random() - 0.5) * 0.3; // Slight Y variation for 3D effect

                positions.set(node.id, new THREE.Vector3(x, y, z));
            });
        }

        return { nodePositions: positions, maxRing, nodeMap };
    }, [data]);

    // Identify kill criteria edges
    const killCriteriaEdges = useMemo(() => {
        const killSet = new Set<string>();
        for (const signal of data.micro_signals) {
            if (signal.confidence < 0.3 || signal.kill_criteria) {
                for (const edge of data.knowledge_graph.edges) {
                    if (edge.translation_gap || edge.evidence_grade === 'D') {
                        killSet.add(edge.id);
                    }
                }
            }
        }
        return killSet;
    }, [data]);

    return (
        <>
            {/* Lighting */}
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={1} color="#ffffff" />
            <pointLight position={[-10, -5, -10]} intensity={0.5} color="#8b5cf6" />
            <pointLight position={[0, 10, 0]} intensity={0.3} color="#22c55e" />

            {/* Background */}
            <color attach="background" args={['#0a0a0f']} />

            {/* Fog for depth */}
            <fog attach="fog" args={['#0a0a0f', 15, 40]} />

            {/* Ring circles (visual guides) */}
            {Array.from({ length: maxRing + 1 }).map((_, ring) => (
                <RingCircle3D
                    key={`ring-${ring}`}
                    ring={ring}
                    radius={ring * ringRadius}
                    animationTime={animationTime}
                />
            ))}

            {/* Edges */}
            {data.knowledge_graph.edges.map((edge) => {
                const startPos = nodePositions.get(edge.source);
                const endPos = nodePositions.get(edge.target);
                const sourceNode = nodeMap.get(edge.source);

                if (!startPos || !endPos || !sourceNode) return null;

                return (
                    <GrowingEdge3D
                        key={edge.id}
                        start={startPos}
                        end={endPos}
                        sourceRing={sourceNode.ring}
                        animationTime={animationTime}
                        hasKillCriteria={killCriteriaEdges.has(edge.id)}
                        evidenceGrade={edge.evidence_grade}
                    />
                );
            })}

            {/* Nodes */}
            {data.knowledge_graph.nodes.map((node) => {
                const position = nodePositions.get(node.id);
                if (!position) return null;

                return (
                    <GlowingNode3D
                        key={node.id}
                        node={node}
                        position={position}
                        animationTime={animationTime}
                        isSelected={selectedNodeId === node.id}
                        isHovered={hoveredNodeId === node.id}
                        onClick={() => onNodeSelect(selectedNodeId === node.id ? null : node.id)}
                        onHover={(hovered) => onNodeHover(hovered ? node.id : null)}
                    />
                );
            })}

            {/* Camera controls - ALLOWS NAVIGATION THROUGH NODES */}
            <OrbitControls
                enableDamping
                dampingFactor={0.05}
                rotateSpeed={0.5}
                zoomSpeed={0.8}
                minDistance={2}  // Can get close to nodes
                maxDistance={30}
                autoRotate={!selectedNodeId}
                autoRotateSpeed={0.2}
                maxPolarAngle={Math.PI * 0.85}
                minPolarAngle={Math.PI * 0.15}
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
            <div className="bg-gray-900/95 rounded-lg border border-gray-700 p-3 backdrop-blur-sm">
                <h4 className="text-sm font-bold text-purple-400 mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Micro-Signaux Détectés ({signals.length})
                </h4>
                <div className="flex gap-2 overflow-x-auto pb-2">
                    {signals.slice(0, 5).map(signal => (
                        <button
                            key={signal.id}
                            onClick={() => onSignalClick(signal.id)}
                            className={`flex-shrink-0 p-2 rounded-lg border text-left text-xs transition-all hover:scale-105 ${signal.confidence > 0.5
                                    ? 'border-green-500/50 bg-green-900/30 hover:bg-green-900/50'
                                    : 'border-red-500/50 bg-red-900/30 hover:bg-red-900/50'
                                }`}
                        >
                            <div className="font-medium truncate max-w-[150px] text-white">{signal.observation}</div>
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
// 2D FALLBACK (when WebGL unavailable)
// ============================================

function Fallback2D({ data }: { data: RadialRingsData }) {
    return (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <div className="text-center p-8">
                <div className="text-6xl mb-4">🔬</div>
                <h3 className="text-xl font-bold text-white mb-2">WebGL non disponible</h3>
                <p className="text-gray-400 mb-4">
                    La visualisation 3D nécessite WebGL activé.
                </p>
                <div className="text-sm text-gray-500">
                    Nœuds: {data.knowledge_graph.nodes.length} |
                    Liens: {data.knowledge_graph.edges.length} |
                    Signaux: {data.micro_signals.length}
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
    const [animationTime, setAnimationTime] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
    const animationRef = useRef<number>();
    const startTimeRef = useRef<number>(0);

    // Check WebGL on mount
    useEffect(() => {
        setWebglAvailable(isWebGLAvailable());
    }, []);

    // Fetch data when modal opens
    useEffect(() => {
        if (isOpen && pathology) {
            fetchRadialRings();
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [isOpen, pathology]);

    // Animation loop (time in SECONDS for three.js)
    useEffect(() => {
        if (!data || isPaused || !isOpen) return;

        const animate = (timestamp: number) => {
            if (!startTimeRef.current) {
                startTimeRef.current = timestamp;
            }

            const elapsed = (timestamp - startTimeRef.current) / 1000; // Convert to seconds
            setAnimationTime(elapsed);

            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [data, isPaused, isOpen]);

    const fetchRadialRings = async () => {
        setIsLoading(true);
        setError(null);
        setData(null);
        setAnimationTime(0);
        startTimeRef.current = 0;

        try {
            const response = await supabase.functions.invoke('radial-rings-engine', {
                body: { pathology, mode, budget: 'medium', context }
            });

            if (response.error) throw response.error;
            setData(response.data);

        } catch (err) {
            console.error('Radial rings error:', err);
            setError(String(err));
        } finally {
            setIsLoading(false);
        }
    };

    const handleReplay = () => {
        setAnimationTime(0);
        startTimeRef.current = 0;
        setIsPaused(false);
    };

    const handleClose = useCallback(() => {
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }
        setData(null);
        setAnimationTime(0);
        setSelectedNodeId(null);
        setHoveredNodeId(null);
        onClose();
    }, [onClose]);

    if (!isOpen) return null;

    const showCanvas = !isLoading && !error && data && webglAvailable;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/95"
                onClick={handleClose}
            />

            {/* Modal content */}
            <div className="relative w-full h-full">
                {/* Header */}
                <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-start">
                    <div className="bg-gray-900/95 rounded-xl border border-gray-700/50 p-4 backdrop-blur-sm">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <span className="text-2xl">🎯</span> Radial Discovery 3D
                        </h2>
                        <p className="text-purple-400 text-sm mt-1 font-medium">
                            {pathology}
                        </p>
                        {data && (
                            <div className="flex gap-4 mt-2 text-xs">
                                <span className="text-green-400 bg-green-900/30 px-2 py-0.5 rounded">
                                    {data.knowledge_graph.nodes.length} nœuds
                                </span>
                                <span className="text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded">
                                    {data.knowledge_graph.edges.length} liens
                                </span>
                                <span className="text-purple-400 bg-purple-900/30 px-2 py-0.5 rounded">
                                    {data.micro_signals.length} signaux
                                </span>
                            </div>
                        )}
                        <div className="text-xs text-gray-500 mt-2">
                            🖱️ Clic + glisser pour pivoter | Molette pour zoomer | Clic droit pour déplacer
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleReplay}
                            className="bg-gray-800/90 hover:bg-gray-700 text-white p-2.5 rounded-lg transition-all hover:scale-105"
                            title="Rejouer l'animation"
                            aria-label="Rejouer l'animation"
                        >
                            <RotateCcw className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setIsPaused(!isPaused)}
                            className="bg-gray-800/90 hover:bg-gray-700 text-white p-2.5 rounded-lg transition-all hover:scale-105"
                            title={isPaused ? 'Reprendre' : 'Pause'}
                            aria-label={isPaused ? 'Reprendre' : 'Pause'}
                        >
                            {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                        </button>
                        <button
                            onClick={handleClose}
                            className="bg-red-600/90 hover:bg-red-500 text-white p-2.5 rounded-lg transition-all hover:scale-105"
                            title="Fermer"
                            aria-label="Fermer la visualisation"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Legend */}
                <div className="absolute top-28 right-4 z-20 bg-gray-900/95 rounded-xl border border-gray-700/50 p-3 backdrop-blur-sm">
                    <h4 className="text-xs font-bold text-gray-400 mb-2">ANNEAUX</h4>
                    <div className="space-y-1.5 text-xs">
                        {['Centre', 'Traitements', 'Effets', 'Étiologie', 'Frontières'].map((label, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: RING_COLORS[i] }}
                                />
                                <span style={{ color: RING_COLORS[i] }}>{label}</span>
                            </div>
                        ))}
                    </div>
                    <div className="border-t border-gray-700 mt-2 pt-2">
                        <div className="flex items-center gap-2 text-xs">
                            <div className="w-8 h-0.5 bg-green-500" />
                            <span className="text-green-400">Validé</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs mt-1">
                            <div className="w-8 h-0.5 bg-red-500" />
                            <span className="text-red-400">Kill criteria</span>
                        </div>
                    </div>
                </div>

                {/* Loading state */}
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center z-30 bg-gray-900">
                        <div className="text-center">
                            <Loader2 className="w-16 h-16 text-purple-500 animate-spin mx-auto mb-4" />
                            <p className="text-white text-lg font-medium">Construction du graphe 3D...</p>
                            <p className="text-gray-400 text-sm mt-2">Interrogation OpenFDA, ClinicalTrials...</p>
                        </div>
                    </div>
                )}

                {/* Error state */}
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center z-30 bg-gray-900">
                        <div className="bg-red-900/50 border border-red-500 rounded-xl p-8 text-center max-w-md">
                            <p className="text-red-400 text-lg font-medium">Erreur</p>
                            <p className="text-gray-300 text-sm mt-2">{error}</p>
                            <button
                                onClick={fetchRadialRings}
                                className="mt-4 bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg transition-colors"
                            >
                                Réessayer
                            </button>
                        </div>
                    </div>
                )}

                {/* 3D Canvas */}
                {showCanvas && (
                    <Canvas
                        camera={{ position: [0, 10, 15], fov: 55 }}
                        gl={{
                            antialias: true,
                            alpha: false,
                            powerPreference: 'high-performance',
                            stencil: false,
                            depth: true
                        }}
                        className="absolute inset-0"
                        dpr={[1, 2]}
                    >
                        <Radial3DScene
                            data={data}
                            animationTime={animationTime}
                            selectedNodeId={selectedNodeId}
                            hoveredNodeId={hoveredNodeId}
                            onNodeSelect={setSelectedNodeId}
                            onNodeHover={setHoveredNodeId}
                        />
                    </Canvas>
                )}

                {/* 2D Fallback when WebGL unavailable */}
                {!isLoading && !error && data && !webglAvailable && (
                    <Fallback2D data={data} />
                )}

                {/* Background when no content */}
                {!isLoading && !error && !data && (
                    <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
                        <p className="text-gray-500">Chargement...</p>
                    </div>
                )}

                {/* Micro-signals panel */}
                {data && (
                    <SignalPanel
                        signals={data.micro_signals}
                        onSignalClick={(id) => console.log('Signal:', id)}
                    />
                )}
            </div>
        </div>
    );
}
