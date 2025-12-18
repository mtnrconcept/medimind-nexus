// ============================================
// RADIAL RINGS 3D - CINEMATIC CAMERA ANIMATION
// ============================================
// Camera follows link growth like driving through the graph

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { X, Play, Pause, RotateCcw, Sparkles, Loader2, Camera } from 'lucide-react';
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
// COLORS
// ============================================

const RING_COLORS: Record<number, string> = {
    0: '#ef4444',
    1: '#22c55e',
    2: '#f59e0b',
    3: '#8b5cf6',
    4: '#06b6d4',
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
// TIMING (seconds)
// ============================================

const TIMING = {
    INTRO_DURATION: 2,       // Close-up on pathology
    LINK_TRAVEL_TIME: 1.5,   // Time to travel along each link
    PAUSE_AT_NODE: 0.5,      // Pause when reaching a node
    RING_TRANSITION: 0.8,    // Time between rings
};

// ============================================
// CAMERA HEIGHT (eye level)
// ============================================

const CAMERA_HEIGHT = 0.3;
const CAMERA_DISTANCE = 0.8;

// ============================================
// SIMPLE NODE COMPONENT (optimized)
// ============================================

interface SimpleNodeProps {
    position: THREE.Vector3;
    color: string;
    size: number;
    visible: boolean;
    isCenter: boolean;
    name: string;
    showLabel: boolean;
}

function SimpleNode({ position, color, size, visible, isCenter, name, showLabel }: SimpleNodeProps) {
    const meshRef = useRef<THREE.Mesh>(null);

    useFrame((state) => {
        if (!meshRef.current || !visible) return;
        // Gentle breathing
        const breathe = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.03;
        meshRef.current.scale.setScalar(size * breathe);
    });

    if (!visible) return null;

    return (
        <group position={position}>
            {/* Glow */}
            <mesh scale={size * 2}>
                <sphereGeometry args={[1, 12, 12]} />
                <meshBasicMaterial color={color} transparent opacity={0.15} />
            </mesh>

            {/* Main sphere */}
            <mesh ref={meshRef} scale={size}>
                <sphereGeometry args={[1, 16, 16]} />
                <meshBasicMaterial color={color} />
            </mesh>

            {/* Center pulse */}
            {isCenter && (
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[size * 1.2, size * 1.4, 32]} />
                    <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} />
                </mesh>
            )}

            {/* Label */}
            {showLabel && (
                <Html position={[0, size + 0.2, 0]} center>
                    <div
                        className="px-2 py-1 rounded text-xs whitespace-nowrap pointer-events-none"
                        style={{
                            backgroundColor: 'rgba(0,0,0,0.85)',
                            border: `1px solid ${color}`,
                            color: 'white'
                        }}
                    >
                        {isCenter && '🎯 '}{name.substring(0, 25)}{name.length > 25 ? '...' : ''}
                    </div>
                </Html>
            )}
        </group>
    );
}

// ============================================
// SIMPLE EDGE COMPONENT (optimized)
// ============================================

interface SimpleEdgeProps {
    start: THREE.Vector3;
    end: THREE.Vector3;
    progress: number;
    color: string;
}

function SimpleEdge({ start, end, progress, color }: SimpleEdgeProps) {
    if (progress <= 0) return null;

    const currentEnd = useMemo(() => {
        return new THREE.Vector3().lerpVectors(start, end, Math.min(1, progress));
    }, [start, end, progress]);

    return (
        <group>
            {/* Glow line */}
            <Line
                points={[start, currentEnd]}
                color={color}
                lineWidth={3}
                transparent
                opacity={0.4}
            />
            {/* Main line */}
            <Line
                points={[start, currentEnd]}
                color={color}
                lineWidth={1.5}
            />
            {/* Growing tip */}
            {progress > 0 && progress < 1 && (
                <mesh position={currentEnd}>
                    <sphereGeometry args={[0.05, 8, 8]} />
                    <meshBasicMaterial color={color} />
                </mesh>
            )}
        </group>
    );
}

// ============================================
// RING GUIDE CIRCLES
// ============================================

function RingGuide({ ring, radius, visible }: { ring: number; radius: number; visible: boolean }) {
    const points = useMemo(() => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 64; i++) {
            const angle = (i / 64) * Math.PI * 2;
            pts.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
        }
        return pts;
    }, [radius]);

    if (!visible || radius === 0) return null;

    return (
        <Line
            points={points}
            color={RING_COLORS[ring]}
            lineWidth={1}
            transparent
            opacity={0.25}
            dashed
            dashSize={0.4}
            gapSize={0.2}
        />
    );
}

// ============================================
// CINEMATIC CAMERA CONTROLLER
// ============================================

interface CinematicCameraProps {
    animationTime: number;
    nodePositions: Map<string, THREE.Vector3>;
    edges: RingEdge[];
    nodeMap: Map<string, RingNode>;
    maxRing: number;
    isManualControl: boolean;
}

function CinematicCamera({ animationTime, nodePositions, edges, nodeMap, maxRing, isManualControl }: CinematicCameraProps) {
    const { camera } = useThree();
    const targetPosRef = useRef(new THREE.Vector3(0, CAMERA_HEIGHT, CAMERA_DISTANCE));
    const targetLookRef = useRef(new THREE.Vector3(0, 0, 0));

    useFrame(() => {
        if (isManualControl) return;

        // Calculate which phase we're in based on animation time
        let targetPos = new THREE.Vector3();
        let targetLook = new THREE.Vector3();

        if (animationTime < TIMING.INTRO_DURATION) {
            // Phase 1: Close-up on center pathology
            const introProgress = animationTime / TIMING.INTRO_DURATION;
            const centerPos = nodePositions.get([...nodePositions.keys()][0]) || new THREE.Vector3();

            // Orbit slowly while zoomed in
            const angle = introProgress * Math.PI * 0.3;
            targetPos.set(
                Math.sin(angle) * 1.2,
                CAMERA_HEIGHT + 0.3,
                Math.cos(angle) * 1.2
            );
            targetLook.copy(centerPos);

        } else {
            // Phase 2+: Follow links ring by ring
            const postIntro = animationTime - TIMING.INTRO_DURATION;
            const ringTime = TIMING.LINK_TRAVEL_TIME + TIMING.PAUSE_AT_NODE;
            const totalEdgeTime = ringTime * Math.max(1, edges.length / 4);

            // Determine current ring being explored
            const currentRingFloat = postIntro / (totalEdgeTime / maxRing);
            const currentRing = Math.min(Math.floor(currentRingFloat), maxRing);
            const ringProgress = currentRingFloat - currentRing;

            // Get edges from center to current ring
            const relevantEdges = edges.filter(e => {
                const source = nodeMap.get(e.source);
                const target = nodeMap.get(e.target);
                return source && target && source.ring <= currentRing && target.ring <= currentRing + 1;
            });

            if (relevantEdges.length > 0) {
                // Pick an edge to follow based on progress
                const edgeIndex = Math.floor(ringProgress * relevantEdges.length) % relevantEdges.length;
                const edge = relevantEdges[edgeIndex];
                const startPos = nodePositions.get(edge.source);
                const endPos = nodePositions.get(edge.target);

                if (startPos && endPos) {
                    // Camera travels alongside the edge
                    const edgeProgress = (ringProgress * relevantEdges.length) % 1;
                    const travelPos = new THREE.Vector3().lerpVectors(startPos, endPos, edgeProgress);

                    // Camera positioned to the side of the path, like a car
                    const direction = new THREE.Vector3().subVectors(endPos, startPos).normalize();
                    const right = new THREE.Vector3(-direction.z, 0, direction.x);

                    targetPos.copy(travelPos).add(right.multiplyScalar(CAMERA_DISTANCE));
                    targetPos.y = CAMERA_HEIGHT;

                    // Look ahead along the path
                    targetLook.copy(travelPos).add(direction.multiplyScalar(0.5));
                    targetLook.y = 0;
                }
            } else {
                // Fallback: orbit around current ring
                const ringRadius = (currentRing + 1) * 3;
                const angle = postIntro * 0.2;
                targetPos.set(
                    Math.sin(angle) * (ringRadius + 2),
                    CAMERA_HEIGHT + currentRing * 0.5,
                    Math.cos(angle) * (ringRadius + 2)
                );
                targetLook.set(0, 0, 0);
            }
        }

        // Smooth interpolation
        targetPosRef.current.lerp(targetPos, 0.03);
        targetLookRef.current.lerp(targetLook, 0.03);

        camera.position.copy(targetPosRef.current);
        camera.lookAt(targetLookRef.current);
    });

    return null;
}

// ============================================
// MAIN 3D SCENE
// ============================================

interface RadialSceneProps {
    data: RadialRingsData;
    animationTime: number;
    isManualControl: boolean;
}

function RadialScene({ data, animationTime, isManualControl }: RadialSceneProps) {
    const ringRadius = 3;

    // Calculate node positions
    const { nodePositions, maxRing, nodeMap } = useMemo(() => {
        const positions = new Map<string, THREE.Vector3>();
        const nodesByRing = new Map<number, RingNode[]>();
        const nodeMap = new Map<string, RingNode>();
        let maxRing = 0;

        for (const node of data.knowledge_graph.nodes) {
            nodeMap.set(node.id, node);
            if (!nodesByRing.has(node.ring)) {
                nodesByRing.set(node.ring, []);
            }
            nodesByRing.get(node.ring)!.push(node);
            maxRing = Math.max(maxRing, node.ring);
        }

        for (const [ring, nodes] of nodesByRing.entries()) {
            const radius = ring === 0 ? 0 : ring * ringRadius;
            const angleStep = (Math.PI * 2) / Math.max(nodes.length, 1);

            nodes.forEach((node, i) => {
                const angle = angleStep * i - Math.PI / 2;
                positions.set(node.id, new THREE.Vector3(
                    Math.cos(angle) * radius,
                    0,
                    Math.sin(angle) * radius
                ));
            });
        }

        return { nodePositions: positions, maxRing, nodeMap };
    }, [data, ringRadius]);

    // Calculate visibility based on animation time
    const getNodeVisible = useCallback((ring: number) => {
        if (ring === 0) return animationTime >= TIMING.INTRO_DURATION * 0.3;
        const ringStartTime = TIMING.INTRO_DURATION + (ring - 1) * (TIMING.LINK_TRAVEL_TIME + TIMING.PAUSE_AT_NODE);
        return animationTime >= ringStartTime + TIMING.LINK_TRAVEL_TIME;
    }, [animationTime]);

    const getEdgeProgress = useCallback((sourceRing: number) => {
        if (sourceRing === 0) {
            const startTime = TIMING.INTRO_DURATION;
            return Math.max(0, (animationTime - startTime) / TIMING.LINK_TRAVEL_TIME);
        }
        const ringStartTime = TIMING.INTRO_DURATION + sourceRing * (TIMING.LINK_TRAVEL_TIME + TIMING.PAUSE_AT_NODE);
        return Math.max(0, (animationTime - ringStartTime) / TIMING.LINK_TRAVEL_TIME);
    }, [animationTime]);

    const getRingVisible = useCallback((ring: number) => {
        const ringStartTime = TIMING.INTRO_DURATION + (ring - 1) * (TIMING.LINK_TRAVEL_TIME + TIMING.PAUSE_AT_NODE);
        return animationTime >= ringStartTime;
    }, [animationTime]);

    return (
        <>
            <color attach="background" args={['#050508']} />

            {/* Cinematic Camera */}
            <CinematicCamera
                animationTime={animationTime}
                nodePositions={nodePositions}
                edges={data.knowledge_graph.edges}
                nodeMap={nodeMap}
                maxRing={maxRing}
                isManualControl={isManualControl}
            />

            {/* Ring guides */}
            {Array.from({ length: maxRing + 1 }).map((_, ring) => (
                <RingGuide
                    key={ring}
                    ring={ring}
                    radius={ring * ringRadius}
                    visible={getRingVisible(ring)}
                />
            ))}

            {/* Edges */}
            {data.knowledge_graph.edges.map((edge) => {
                const startPos = nodePositions.get(edge.source);
                const endPos = nodePositions.get(edge.target);
                const sourceNode = nodeMap.get(edge.source);

                if (!startPos || !endPos || !sourceNode) return null;

                const color = edge.evidence_grade === 'A' ? '#22c55e' :
                    edge.evidence_grade === 'B' ? '#3b82f6' :
                        edge.evidence_grade === 'C' ? '#f59e0b' : '#6b7280';

                return (
                    <SimpleEdge
                        key={edge.id}
                        start={startPos}
                        end={endPos}
                        progress={getEdgeProgress(sourceNode.ring)}
                        color={color}
                    />
                );
            })}

            {/* Nodes */}
            {data.knowledge_graph.nodes.map((node) => {
                const position = nodePositions.get(node.id);
                if (!position) return null;

                const color = LANE_COLORS[node.lane] || RING_COLORS[node.ring] || '#94a3b8';
                const size = 0.12 + node.proximity_score * 0.06;
                const visible = getNodeVisible(node.ring);

                return (
                    <SimpleNode
                        key={node.id}
                        position={position}
                        color={color}
                        size={size}
                        visible={visible}
                        isCenter={node.ring === 0}
                        name={node.name}
                        showLabel={node.ring === 0 || animationTime > 8}
                    />
                );
            })}
        </>
    );
}

// ============================================
// SIGNAL PANEL
// ============================================

function SignalPanel({ signals }: { signals: MicroSignal[] }) {
    if (signals.length === 0) return null;

    return (
        <div className="absolute bottom-4 left-4 right-4 z-20">
            <div className="bg-gray-900/95 rounded-lg border border-gray-700 p-3 backdrop-blur-sm">
                <h4 className="text-sm font-bold text-purple-400 mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Micro-Signaux ({signals.length})
                </h4>
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {signals.slice(0, 5).map(signal => (
                        <div
                            key={signal.id}
                            className={`flex-shrink-0 p-2 rounded-lg border text-xs ${signal.confidence > 0.5
                                    ? 'border-green-500/50 bg-green-900/30'
                                    : 'border-red-500/50 bg-red-900/30'
                                }`}
                        >
                            <div className="font-medium truncate max-w-[120px] text-white">{signal.observation}</div>
                            <div className="text-gray-400 mt-1">
                                {Math.round(signal.confidence * 100)}%
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ============================================
// MAIN MODAL
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
    const [isManualControl, setIsManualControl] = useState(false);
    const animationRef = useRef<number>();
    const startTimeRef = useRef<number>(0);

    // Fetch data
    useEffect(() => {
        if (isOpen && pathology) {
            fetchData();
        }
        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [isOpen, pathology]);

    // Animation loop
    useEffect(() => {
        if (!data || isPaused || !isOpen) return;

        const animate = (ts: number) => {
            if (!startTimeRef.current) startTimeRef.current = ts;
            setAnimationTime((ts - startTimeRef.current) / 1000);
            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);
        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [data, isPaused, isOpen]);

    const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        setData(null);
        setAnimationTime(0);
        startTimeRef.current = 0;
        setIsManualControl(false);

        try {
            const response = await supabase.functions.invoke('radial-rings-engine', {
                body: { pathology, mode, budget: 'medium', context }
            });
            if (response.error) throw response.error;
            setData(response.data);
        } catch (err) {
            setError(String(err));
        } finally {
            setIsLoading(false);
        }
    };

    const handleReplay = () => {
        setAnimationTime(0);
        startTimeRef.current = 0;
        setIsPaused(false);
        setIsManualControl(false);
    };

    const handleClose = useCallback(() => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        setData(null);
        onClose();
    }, [onClose]);

    const toggleManualControl = () => {
        setIsManualControl(!isManualControl);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black" onClick={handleClose} />

            <div className="relative w-full h-full">
                {/* Header */}
                <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-start">
                    <div className="bg-gray-900/90 rounded-xl border border-gray-700/50 p-4 backdrop-blur-sm">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            🎯 Radial Discovery 3D
                        </h2>
                        <p className="text-purple-400 text-sm mt-1">{pathology}</p>
                        {data && (
                            <div className="flex gap-3 mt-2 text-xs">
                                <span className="text-green-400">{data.knowledge_graph.nodes.length} nœuds</span>
                                <span className="text-blue-400">{data.knowledge_graph.edges.length} liens</span>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={toggleManualControl}
                            className={`p-2.5 rounded-lg transition-all ${isManualControl ? 'bg-purple-600' : 'bg-gray-800/90 hover:bg-gray-700'} text-white`}
                            title={isManualControl ? 'Mode cinématique' : 'Mode manuel'}
                        >
                            <Camera className="w-5 h-5" />
                        </button>
                        <button
                            onClick={handleReplay}
                            className="bg-gray-800/90 hover:bg-gray-700 text-white p-2.5 rounded-lg"
                            title="Rejouer"
                        >
                            <RotateCcw className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setIsPaused(!isPaused)}
                            className="bg-gray-800/90 hover:bg-gray-700 text-white p-2.5 rounded-lg"
                            title={isPaused ? 'Lecture' : 'Pause'}
                        >
                            {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                        </button>
                        <button
                            onClick={handleClose}
                            className="bg-red-600/90 hover:bg-red-500 text-white p-2.5 rounded-lg"
                            title="Fermer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Legend */}
                <div className="absolute top-28 right-4 z-20 bg-gray-900/90 rounded-xl border border-gray-700/50 p-3 text-xs">
                    {['Centre', 'Traitements', 'Effets', 'Étiologie', 'Frontières'].map((label, i) => (
                        <div key={i} className="flex items-center gap-2 mb-1">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: RING_COLORS[i] }} />
                            <span style={{ color: RING_COLORS[i] }}>{label}</span>
                        </div>
                    ))}
                </div>

                {/* Loading */}
                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-30">
                        <div className="text-center">
                            <Loader2 className="w-16 h-16 text-purple-500 animate-spin mx-auto mb-4" />
                            <p className="text-white">Construction du graphe...</p>
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-30">
                        <div className="bg-red-900/50 border border-red-500 rounded-xl p-8 text-center">
                            <p className="text-red-400">Erreur: {error}</p>
                            <button onClick={fetchData} className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg">
                                Réessayer
                            </button>
                        </div>
                    </div>
                )}

                {/* 3D Canvas */}
                {!isLoading && !error && data && (
                    <Canvas
                        camera={{ position: [0, CAMERA_HEIGHT, CAMERA_DISTANCE], fov: 60 }}
                        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
                        dpr={[1, 1.5]}
                        frameloop="always"
                    >
                        <RadialScene
                            data={data}
                            animationTime={animationTime}
                            isManualControl={isManualControl}
                        />
                    </Canvas>
                )}

                {/* Signals */}
                {data && <SignalPanel signals={data.micro_signals} />}

                {/* Controls hint */}
                {isManualControl && (
                    <div className="absolute bottom-20 left-4 text-xs text-gray-400 bg-gray-900/80 px-3 py-2 rounded-lg">
                        🖱️ Mode manuel actif - Cliquez dans la scène pour naviguer
                    </div>
                )}
            </div>
        </div>
    );
}
