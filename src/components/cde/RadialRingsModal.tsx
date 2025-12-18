// ============================================
// RADIAL RINGS 3D - TOP-DOWN VIEW WITH CLICKABLE LINKS
// ============================================
// Smooth nodes with enhanced glow, clickable links for AI explanation

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { X, Play, Pause, RotateCcw, Sparkles, Loader2, MessageSquare, ExternalLink } from 'lucide-react';
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
// TIMING (ms converted to seconds in components)
// ============================================

const TIMING = {
    CENTER_APPEAR: 0.5,
    RING_INTERVAL: 1.5,
    LINK_DURATION: 0.8,
    NODE_DURATION: 0.3,
};

// ============================================
// WEBGL CHECK
// ============================================

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
// 2D SVG FALLBACK VISUALIZATION
// ============================================

interface SVGFallbackProps {
    data: RadialRingsData;
    animationTime: number;
    onEdgeClick: (edge: RingEdge, source: RingNode, target: RingNode) => void;
}

function SVGFallback({ data, animationTime, onEdgeClick }: SVGFallbackProps) {
    const svgSize = 600;
    const center = svgSize / 2;
    const ringRadius = 80;

    // Calculate node positions
    const nodePositions = useMemo(() => {
        const positions = new Map<string, { x: number; y: number }>();
        const nodesByRing = new Map<number, RingNode[]>();

        for (const node of data.knowledge_graph.nodes) {
            if (!nodesByRing.has(node.ring)) nodesByRing.set(node.ring, []);
            nodesByRing.get(node.ring)!.push(node);
        }

        for (const [ring, nodes] of nodesByRing.entries()) {
            const radius = ring === 0 ? 0 : ring * ringRadius;
            const angleStep = (Math.PI * 2) / Math.max(nodes.length, 1);
            nodes.forEach((node, i) => {
                const angle = angleStep * i - Math.PI / 2;
                positions.set(node.id, {
                    x: center + Math.cos(angle) * radius,
                    y: center + Math.sin(angle) * radius
                });
            });
        }
        return positions;
    }, [data, center, ringRadius]);

    const nodeMap = useMemo(() => {
        const map = new Map<string, RingNode>();
        data.knowledge_graph.nodes.forEach(n => map.set(n.id, n));
        return map;
    }, [data]);

    const maxRing = Math.max(...data.knowledge_graph.nodes.map(n => n.ring));

    const getNodeVisible = (ring: number) => {
        const appearTime = TIMING.CENTER_APPEAR + ring * TIMING.RING_INTERVAL;
        return animationTime >= appearTime;
    };

    const getEdgeProgress = (sourceRing: number) => {
        const startTime = TIMING.CENTER_APPEAR + sourceRing * TIMING.RING_INTERVAL + 0.2;
        return Math.max(0, Math.min(1, (animationTime - startTime) / TIMING.LINK_DURATION));
    };

    return (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
            <svg width={svgSize} height={svgSize} className="overflow-visible">
                {/* Ring guides */}
                {Array.from({ length: maxRing + 1 }).map((_, ring) => (
                    ring > 0 && (
                        <circle
                            key={`ring-${ring}`}
                            cx={center}
                            cy={center}
                            r={ring * ringRadius}
                            fill="none"
                            stroke={RING_COLORS[ring]}
                            strokeWidth="1"
                            strokeDasharray="8 4"
                            opacity={0.3}
                        />
                    )
                ))}

                {/* Edges */}
                {data.knowledge_graph.edges.map((edge) => {
                    const startPos = nodePositions.get(edge.source);
                    const endPos = nodePositions.get(edge.target);
                    const sourceNode = nodeMap.get(edge.source);
                    const targetNode = nodeMap.get(edge.target);

                    if (!startPos || !endPos || !sourceNode || !targetNode) return null;

                    const progress = getEdgeProgress(sourceNode.ring);
                    if (progress <= 0) return null;

                    const currentEnd = {
                        x: startPos.x + (endPos.x - startPos.x) * Math.min(1, progress),
                        y: startPos.y + (endPos.y - startPos.y) * Math.min(1, progress)
                    };

                    const color = edge.evidence_grade === 'A' ? '#22c55e' :
                        edge.evidence_grade === 'B' ? '#3b82f6' :
                            edge.evidence_grade === 'C' ? '#f59e0b' : '#6b7280';

                    return (
                        <g key={edge.id}>
                            {/* Glow */}
                            <line
                                x1={startPos.x} y1={startPos.y}
                                x2={currentEnd.x} y2={currentEnd.y}
                                stroke={color}
                                strokeWidth="4"
                                opacity="0.3"
                            />
                            {/* Main line */}
                            <line
                                x1={startPos.x} y1={startPos.y}
                                x2={currentEnd.x} y2={currentEnd.y}
                                stroke={color}
                                strokeWidth="2"
                                className="cursor-pointer hover:opacity-80"
                                onClick={() => onEdgeClick(edge, sourceNode, targetNode)}
                            />
                        </g>
                    );
                })}

                {/* Nodes */}
                {data.knowledge_graph.nodes.map((node) => {
                    const pos = nodePositions.get(node.id);
                    if (!pos || !getNodeVisible(node.ring)) return null;

                    const color = LANE_COLORS[node.lane] || RING_COLORS[node.ring] || '#94a3b8';
                    const size = 10 + node.proximity_score * 8;

                    return (
                        <g key={node.id}>
                            {/* Outer glow */}
                            <circle cx={pos.x} cy={pos.y} r={size * 2} fill={color} opacity="0.15" />
                            {/* Inner glow */}
                            <circle cx={pos.x} cy={pos.y} r={size * 1.4} fill={color} opacity="0.3" />
                            {/* Main */}
                            <circle cx={pos.x} cy={pos.y} r={size} fill={color} />
                            {/* Highlight */}
                            <circle cx={pos.x - size * 0.25} cy={pos.y - size * 0.25} r={size * 0.25} fill="white" opacity="0.4" />
                            {/* Label for center */}
                            {node.ring === 0 && (
                                <text x={pos.x} y={pos.y + size + 16} textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">
                                    🎯 {node.name.substring(0, 20)}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>

            <div className="absolute bottom-8 text-center text-gray-400 text-sm">
                <p>Mode 2D (WebGL non disponible)</p>
                <p className="text-xs mt-1">💡 Cliquez sur les liens pour les analyser</p>
            </div>
        </div>
    );
}

// ============================================
// ENHANCED GLOWING NODE (smooth with shadows)
// ============================================

interface GlowNodeProps {
    node: RingNode;
    position: THREE.Vector3;
    animationTime: number;
    isSelected: boolean;
    onClick: () => void;
}

function GlowNode({ node, position, animationTime, isSelected, onClick }: GlowNodeProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const glowRef = useRef<THREE.Mesh>(null);
    const outerGlowRef = useRef<THREE.Mesh>(null);

    const color = useMemo(() => LANE_COLORS[node.lane] || RING_COLORS[node.ring] || '#94a3b8', [node]);
    const colorObj = useMemo(() => new THREE.Color(color), [color]);

    const appearTime = TIMING.CENTER_APPEAR + node.ring * TIMING.RING_INTERVAL;
    const progress = Math.max(0, Math.min(1, (animationTime - appearTime) / TIMING.NODE_DURATION));

    const baseSize = 0.15 + node.proximity_score * 0.1;

    useFrame((state) => {
        if (!meshRef.current || progress < 1) return;

        // Smooth breathing animation
        const breathe = 1 + Math.sin(state.clock.elapsedTime * 1.5 + node.ring * 0.5) * 0.04;
        const scale = baseSize * breathe * (isSelected ? 1.25 : 1);
        meshRef.current.scale.setScalar(scale);

        // Inner glow pulse
        if (glowRef.current) {
            const pulse = 0.4 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
            (glowRef.current.material as THREE.MeshBasicMaterial).opacity = pulse;
            glowRef.current.scale.setScalar(scale * 1.6);
        }

        // Outer glow
        if (outerGlowRef.current) {
            const outerPulse = 0.15 + Math.sin(state.clock.elapsedTime * 1.5) * 0.05;
            (outerGlowRef.current.material as THREE.MeshBasicMaterial).opacity = outerPulse;
            outerGlowRef.current.scale.setScalar(scale * 2.5);
        }
    });

    if (progress <= 0) return null;

    const currentSize = baseSize * progress;

    return (
        <group position={position}>
            {/* Outer glow (soft, large) */}
            <mesh ref={outerGlowRef} scale={currentSize * 2.5}>
                <sphereGeometry args={[1, 24, 24]} />
                <meshBasicMaterial
                    color={colorObj}
                    transparent
                    opacity={0.12}
                    depthWrite={false}
                />
            </mesh>

            {/* Inner glow */}
            <mesh ref={glowRef} scale={currentSize * 1.6}>
                <sphereGeometry args={[1, 24, 24]} />
                <meshBasicMaterial
                    color={colorObj}
                    transparent
                    opacity={0.35}
                    depthWrite={false}
                />
            </mesh>

            {/* Main sphere (smooth shaded) */}
            <mesh
                ref={meshRef}
                scale={currentSize}
                onClick={(e) => { e.stopPropagation(); onClick(); }}
            >
                <sphereGeometry args={[1, 32, 32]} />
                <meshBasicMaterial color={colorObj} />
            </mesh>

            {/* Highlight spot (for 3D depth effect) */}
            <mesh position={[-currentSize * 0.25, currentSize * 0.25, currentSize * 0.35]} scale={currentSize * 0.2}>
                <sphereGeometry args={[1, 8, 8]} />
                <meshBasicMaterial color="white" transparent opacity={0.4} />
            </mesh>

            {/* Center pulse ring */}
            {node.ring === 0 && progress >= 1 && (
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[currentSize * 1.3, currentSize * 1.5, 48]} />
                    <meshBasicMaterial color={colorObj} transparent opacity={0.5} side={THREE.DoubleSide} />
                </mesh>
            )}

            {/* Label */}
            {(isSelected || node.ring === 0) && progress >= 1 && (
                <Html position={[0, currentSize + 0.25, 0]} center>
                    <div
                        className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap pointer-events-none shadow-2xl"
                        style={{
                            backgroundColor: 'rgba(10, 10, 20, 0.95)',
                            border: `2px solid ${color}`,
                            color: 'white',
                            boxShadow: `0 0 20px ${color}40`
                        }}
                    >
                        {node.ring === 0 && <span className="mr-1">🎯</span>}
                        {node.name.substring(0, 30)}{node.name.length > 30 ? '...' : ''}
                    </div>
                </Html>
            )}
        </group>
    );
}

// ============================================
// CLICKABLE EDGE COMPONENT
// ============================================

interface ClickableEdgeProps {
    edge: RingEdge;
    start: THREE.Vector3;
    end: THREE.Vector3;
    sourceNode: RingNode;
    targetNode: RingNode;
    animationTime: number;
    isSelected: boolean;
    onClick: () => void;
}

function ClickableEdge({ edge, start, end, sourceNode, targetNode, animationTime, isSelected, onClick }: ClickableEdgeProps) {
    const lineRef = useRef<any>(null);
    const [hovered, setHovered] = useState(false);

    const edgeStartTime = TIMING.CENTER_APPEAR + sourceNode.ring * TIMING.RING_INTERVAL + 0.2;
    const progress = Math.max(0, Math.min(1, (animationTime - edgeStartTime) / TIMING.LINK_DURATION));

    const color = edge.evidence_grade === 'A' ? '#22c55e' :
        edge.evidence_grade === 'B' ? '#3b82f6' :
            edge.evidence_grade === 'C' ? '#f59e0b' :
                edge.translation_gap ? '#ef4444' : '#6b7280';

    const currentEnd = useMemo(() => {
        return new THREE.Vector3().lerpVectors(start, end, Math.min(1, progress));
    }, [start, end, progress]);

    const midPoint = useMemo(() => {
        return new THREE.Vector3().lerpVectors(start, end, 0.5);
    }, [start, end]);

    if (progress <= 0) return null;

    return (
        <group>
            {/* Glow line */}
            <Line
                points={[start, currentEnd]}
                color={color}
                lineWidth={isSelected || hovered ? 6 : 3}
                transparent
                opacity={isSelected ? 0.8 : 0.3}
            />

            {/* Main line */}
            <Line
                ref={lineRef}
                points={[start, currentEnd]}
                color={color}
                lineWidth={isSelected || hovered ? 3 : 1.5}
                transparent
                opacity={isSelected ? 1 : 0.7}
            />

            {/* Clickable hit area (invisible cylinder along the edge) */}
            {progress >= 1 && (
                <mesh
                    position={midPoint}
                    rotation={[0, Math.atan2(end.x - start.x, end.z - start.z), Math.PI / 2]}
                    onClick={(e) => { e.stopPropagation(); onClick(); }}
                    onPointerOver={() => setHovered(true)}
                    onPointerOut={() => setHovered(false)}
                >
                    <cylinderGeometry args={[0.08, 0.08, start.distanceTo(end), 8]} />
                    <meshBasicMaterial transparent opacity={0} />
                </mesh>
            )}

            {/* Growing tip */}
            {progress > 0 && progress < 1 && (
                <mesh position={currentEnd}>
                    <sphereGeometry args={[0.06, 12, 12]} />
                    <meshBasicMaterial color={color} />
                </mesh>
            )}

            {/* Hover indicator */}
            {hovered && progress >= 1 && (
                <Html position={[midPoint.x, midPoint.y + 0.2, midPoint.z]} center>
                    <div className="px-2 py-1 bg-gray-900/95 border border-gray-600 rounded text-xs text-white whitespace-nowrap cursor-pointer shadow-lg">
                        <MessageSquare className="w-3 h-3 inline mr-1" />
                        Cliquez pour analyser
                    </div>
                </Html>
            )}
        </group>
    );
}

// ============================================
// RING CIRCLE GUIDE
// ============================================

function RingCircle({ ring, radius, animationTime }: { ring: number; radius: number; animationTime: number }) {
    const appearTime = TIMING.CENTER_APPEAR + ring * TIMING.RING_INTERVAL - 0.3;
    const opacity = Math.max(0, Math.min(0.25, (animationTime - appearTime) / 0.5));

    const points = useMemo(() => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 64; i++) {
            const angle = (i / 64) * Math.PI * 2;
            pts.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
        }
        return pts;
    }, [radius]);

    if (opacity <= 0 || radius === 0) return null;

    return (
        <Line
            points={points}
            color={RING_COLORS[ring]}
            lineWidth={1.5}
            transparent
            opacity={opacity}
            dashed
            dashSize={0.4}
            gapSize={0.2}
        />
    );
}

// ============================================
// LINK EXPLANATION MODAL
// ============================================

interface LinkModalProps {
    isOpen: boolean;
    onClose: () => void;
    edge: RingEdge | null;
    sourceNode: RingNode | null;
    targetNode: RingNode | null;
    pathology: string;
}

function LinkExplanationModal({ isOpen, onClose, edge, sourceNode, targetNode, pathology }: LinkModalProps) {
    const [explanation, setExplanation] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen && edge && sourceNode && targetNode) {
            fetchExplanation();
        }
    }, [isOpen, edge, sourceNode, targetNode]);

    const fetchExplanation = async () => {
        if (!edge || !sourceNode || !targetNode) return;

        setIsLoading(true);
        setExplanation('');

        try {
            const response = await supabase.functions.invoke('causal-reasoning', {
                body: {
                    query: `Explique en détail le lien entre "${sourceNode.name}" et "${targetNode.name}" dans le contexte de la pathologie "${pathology}". 
                    
Type de relation: ${edge.relationship}
Grade d'évidence: ${edge.evidence_grade}
Gap de translation: ${edge.translation_gap ? 'Oui' : 'Non'}

Fournis:
1. Une explication scientifique détaillée du mécanisme
2. Les preuves cliniques disponibles
3. Les implications thérapeutiques potentielles
4. Les limitations ou incertitudes connues`,
                    context: {
                        sourceNode: sourceNode.name,
                        targetNode: targetNode.name,
                        relationship: edge.relationship,
                        evidence_grade: edge.evidence_grade,
                        pathology
                    }
                }
            });

            if (response.error) throw response.error;
            setExplanation(response.data?.analysis || response.data?.explanation || 'Analyse non disponible.');

        } catch (err) {
            console.error('Link explanation error:', err);
            setExplanation(`**Connexion: ${sourceNode.name} → ${targetNode.name}**\n\nRelation: ${edge.relationship}\nGrade: ${edge.evidence_grade}\n\n_L'analyse IA détaillée n'a pas pu être chargée. Cette connexion représente une relation identifiée dans la littérature scientifique entre ces deux concepts._`);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen || !edge || !sourceNode || !targetNode) return null;

    const color = LANE_COLORS[sourceNode.lane] || RING_COLORS[sourceNode.ring] || '#8b5cf6';

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80" onClick={onClose} />

            <div className="relative bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="p-4 border-b border-gray-700 bg-gray-800/50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: color + '30', border: `2px solid ${color}` }}>
                                <ExternalLink className="w-5 h-5" style={{ color }} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Analyse du lien</h3>
                                <p className="text-sm text-gray-400">
                                    {sourceNode.name} → {targetNode.name}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
                            <X className="w-5 h-5 text-gray-400" />
                        </button>
                    </div>

                    {/* Edge metadata */}
                    <div className="flex gap-3 mt-3">
                        <span className={`px-2 py-1 rounded text-xs ${edge.evidence_grade === 'A' ? 'bg-green-900/50 text-green-400 border border-green-500/30' :
                            edge.evidence_grade === 'B' ? 'bg-blue-900/50 text-blue-400 border border-blue-500/30' :
                                edge.evidence_grade === 'C' ? 'bg-orange-900/50 text-orange-400 border border-orange-500/30' :
                                    'bg-gray-800 text-gray-400 border border-gray-600'
                            }`}>
                            Grade {edge.evidence_grade}
                        </span>
                        <span className="px-2 py-1 bg-purple-900/50 text-purple-400 border border-purple-500/30 rounded text-xs">
                            {edge.relationship}
                        </span>
                        {edge.translation_gap && (
                            <span className="px-2 py-1 bg-red-900/50 text-red-400 border border-red-500/30 rounded text-xs">
                                Gap de translation
                            </span>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto max-h-[60vh]">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="text-center">
                                <Loader2 className="w-10 h-10 text-purple-500 animate-spin mx-auto mb-3" />
                                <p className="text-gray-400">Analyse IA en cours...</p>
                            </div>
                        </div>
                    ) : (
                        <div className="prose prose-invert prose-sm max-w-none">
                            {explanation.split('\n').map((line, i) => {
                                if (line.startsWith('**') && line.endsWith('**')) {
                                    return <h4 key={i} className="text-white font-bold mt-4 mb-2">{line.replace(/\*\*/g, '')}</h4>;
                                }
                                if (line.startsWith('- ')) {
                                    return <li key={i} className="text-gray-300 ml-4">{line.substring(2)}</li>;
                                }
                                if (line.startsWith('_') && line.endsWith('_')) {
                                    return <p key={i} className="text-gray-500 italic">{line.replace(/_/g, '')}</p>;
                                }
                                if (line.trim()) {
                                    return <p key={i} className="text-gray-300 mb-2">{line}</p>;
                                }
                                return null;
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================
// MAIN 3D SCENE
// ============================================

interface RadialSceneProps {
    data: RadialRingsData;
    animationTime: number;
    selectedNodeId: string | null;
    selectedEdgeId: string | null;
    onNodeSelect: (id: string | null) => void;
    onEdgeSelect: (edge: RingEdge | null, source: RingNode | null, target: RingNode | null) => void;
}

function RadialScene({ data, animationTime, selectedNodeId, selectedEdgeId, onNodeSelect, onEdgeSelect }: RadialSceneProps) {
    const ringRadius = 3.5;

    const { nodePositions, maxRing, nodeMap } = useMemo(() => {
        const positions = new Map<string, THREE.Vector3>();
        const nodesByRing = new Map<number, RingNode[]>();
        const nodeMap = new Map<string, RingNode>();
        let maxRing = 0;

        for (const node of data.knowledge_graph.nodes) {
            nodeMap.set(node.id, node);
            if (!nodesByRing.has(node.ring)) nodesByRing.set(node.ring, []);
            nodesByRing.get(node.ring)!.push(node);
            maxRing = Math.max(maxRing, node.ring);
        }

        for (const [ring, nodes] of nodesByRing.entries()) {
            const radius = ring === 0 ? 0 : ring * ringRadius;
            const angleStep = (Math.PI * 2) / Math.max(nodes.length, 1);
            nodes.forEach((node, i) => {
                const angle = angleStep * i - Math.PI / 2;
                positions.set(node.id, new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
            });
        }

        return { nodePositions: positions, maxRing, nodeMap };
    }, [data, ringRadius]);

    return (
        <>
            <color attach="background" args={['#050508']} />

            {/* OrbitControls for top-down view */}
            <OrbitControls
                enableDamping
                dampingFactor={0.05}
                rotateSpeed={0.5}
                zoomSpeed={0.8}
                minDistance={5}
                maxDistance={40}
                autoRotate={!selectedNodeId && !selectedEdgeId}
                autoRotateSpeed={0.3}
                maxPolarAngle={Math.PI / 2.2}
                minPolarAngle={0.3}
            />

            {/* Ring guides */}
            {Array.from({ length: maxRing + 1 }).map((_, ring) => (
                <RingCircle key={ring} ring={ring} radius={ring * ringRadius} animationTime={animationTime} />
            ))}

            {/* Edges (clickable) */}
            {data.knowledge_graph.edges.map((edge) => {
                const startPos = nodePositions.get(edge.source);
                const endPos = nodePositions.get(edge.target);
                const sourceNode = nodeMap.get(edge.source);
                const targetNode = nodeMap.get(edge.target);

                if (!startPos || !endPos || !sourceNode || !targetNode) return null;

                return (
                    <ClickableEdge
                        key={edge.id}
                        edge={edge}
                        start={startPos}
                        end={endPos}
                        sourceNode={sourceNode}
                        targetNode={targetNode}
                        animationTime={animationTime}
                        isSelected={selectedEdgeId === edge.id}
                        onClick={() => onEdgeSelect(edge, sourceNode, targetNode)}
                    />
                );
            })}

            {/* Nodes (enhanced glow) */}
            {data.knowledge_graph.nodes.map((node) => {
                const position = nodePositions.get(node.id);
                if (!position) return null;

                return (
                    <GlowNode
                        key={node.id}
                        node={node}
                        position={position}
                        animationTime={animationTime}
                        isSelected={selectedNodeId === node.id}
                        onClick={() => onNodeSelect(node.id)}
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
                            <div className="text-gray-400 mt-1">{Math.round(signal.confidence * 100)}%</div>
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
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    // Edge selection for explanation modal
    const [selectedEdge, setSelectedEdge] = useState<RingEdge | null>(null);
    const [selectedEdgeSource, setSelectedEdgeSource] = useState<RingNode | null>(null);
    const [selectedEdgeTarget, setSelectedEdgeTarget] = useState<RingNode | null>(null);
    const [showLinkModal, setShowLinkModal] = useState(false);

    const animationRef = useRef<number>();
    const startTimeRef = useRef<number>(0);
    const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);

    // Check WebGL on mount
    useEffect(() => {
        setWebglAvailable(isWebGLAvailable());
    }, []);

    useEffect(() => {
        if (isOpen && pathology) fetchData();
        return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
    }, [isOpen, pathology]);

    useEffect(() => {
        if (!data || isPaused || !isOpen) return;
        const animate = (ts: number) => {
            if (!startTimeRef.current) startTimeRef.current = ts;
            setAnimationTime((ts - startTimeRef.current) / 1000);
            animationRef.current = requestAnimationFrame(animate);
        };
        animationRef.current = requestAnimationFrame(animate);
        return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
    }, [data, isPaused, isOpen]);

    const fetchData = async () => {
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
            setError(String(err));
        } finally {
            setIsLoading(false);
        }
    };

    const handleEdgeSelect = (edge: RingEdge | null, source: RingNode | null, target: RingNode | null) => {
        setSelectedEdge(edge);
        setSelectedEdgeSource(source);
        setSelectedEdgeTarget(target);
        setShowLinkModal(true);
    };

    const handleReplay = () => {
        setAnimationTime(0);
        startTimeRef.current = 0;
        setIsPaused(false);
    };

    const handleClose = useCallback(() => {
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        setData(null);
        setShowLinkModal(false);
        onClose();
    }, [onClose]);

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
                        <p className="text-gray-500 text-xs mt-2">💡 Cliquez sur un lien pour l'analyser avec l'IA</p>
                    </div>

                    <div className="flex gap-2">
                        <button onClick={handleReplay} className="bg-gray-800/90 hover:bg-gray-700 text-white p-2.5 rounded-lg" title="Rejouer">
                            <RotateCcw className="w-5 h-5" />
                        </button>
                        <button onClick={() => setIsPaused(!isPaused)} className="bg-gray-800/90 hover:bg-gray-700 text-white p-2.5 rounded-lg" title={isPaused ? 'Lecture' : 'Pause'}>
                            {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                        </button>
                        <button onClick={handleClose} className="bg-red-600/90 hover:bg-red-500 text-white p-2.5 rounded-lg" title="Fermer">
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
                            <button onClick={fetchData} className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg">Réessayer</button>
                        </div>
                    </div>
                )}

                {/* 3D Canvas (only if WebGL available) */}
                {!isLoading && !error && data && webglAvailable === true && (
                    <Canvas
                        camera={{ position: [0, 18, 12], fov: 55 }}
                        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
                        dpr={[1, 1.5]}
                    >
                        <RadialScene
                            data={data}
                            animationTime={animationTime}
                            selectedNodeId={selectedNodeId}
                            selectedEdgeId={selectedEdge?.id || null}
                            onNodeSelect={setSelectedNodeId}
                            onEdgeSelect={handleEdgeSelect}
                        />
                    </Canvas>
                )}

                {/* 2D SVG Fallback (when WebGL unavailable) */}
                {!isLoading && !error && data && webglAvailable === false && (
                    <SVGFallback
                        data={data}
                        animationTime={animationTime}
                        onEdgeClick={handleEdgeSelect}
                    />
                )}

                {/* Signals */}
                {data && <SignalPanel signals={data.micro_signals} />}
            </div>

            {/* Link Explanation Modal */}
            <LinkExplanationModal
                isOpen={showLinkModal}
                onClose={() => setShowLinkModal(false)}
                edge={selectedEdge}
                sourceNode={selectedEdgeSource}
                targetNode={selectedEdgeTarget}
                pathology={pathology}
            />
        </div>
    );
}
