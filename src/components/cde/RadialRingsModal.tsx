// ============================================
// RADIAL RINGS 2D MODAL - D3.js FLUID ANIMATION
// ============================================
// SVG-based 2D visualization with progressive ring-by-ring animation
// Works without WebGL!

import { useState, useEffect, useRef, useCallback } from 'react';
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
// ANIMATION TIMING (in ms)
// ============================================

const TIMING = {
    CENTER_NODE_APPEAR: 500,
    RING_INTERVAL: 1500,
    LINK_GROW_DURATION: 800,
    NODE_APPEAR_DURATION: 300,
};

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
                            className={`flex-shrink-0 p-2 rounded-lg border text-left text-xs transition-all hover:scale-105 ${signal.confidence > 0.5
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
// RADIAL 2D VISUALIZATION
// ============================================

interface Radial2DVisualizationProps {
    data: RadialRingsData;
    animationTime: number;
    selectedNodeId: string | null;
    onNodeSelect: (id: string | null) => void;
}

function Radial2DVisualization({ data, animationTime, selectedNodeId, onNodeSelect }: Radial2DVisualizationProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);

    // Calculate center
    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    const ringRadius = Math.min(dimensions.width, dimensions.height) / 2.5 / 5;

    // Update dimensions on resize
    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const { width, height } = containerRef.current.getBoundingClientRect();
                setDimensions({ width, height: height - 100 });
            }
        };
        updateDimensions();
        window.addEventListener('resize', updateDimensions);
        return () => window.removeEventListener('resize', updateDimensions);
    }, []);

    // Calculate node positions
    const nodePositions = new Map<string, { x: number; y: number }>();
    const nodesByRing = new Map<number, RingNode[]>();
    const nodeMap = new Map<string, RingNode>();

    for (const node of data.knowledge_graph.nodes) {
        nodeMap.set(node.id, node);
        if (!nodesByRing.has(node.ring)) {
            nodesByRing.set(node.ring, []);
        }
        nodesByRing.get(node.ring)!.push(node);
    }

    for (const [ring, nodes] of nodesByRing.entries()) {
        const radius = ring === 0 ? 0 : ring * ringRadius;
        const angleStep = (Math.PI * 2) / Math.max(nodes.length, 1);

        nodes.forEach((node, i) => {
            const angle = angleStep * i - Math.PI / 2;
            const x = cx + Math.cos(angle) * radius;
            const y = cy + Math.sin(angle) * radius;
            nodePositions.set(node.id, { x, y });
        });
    }

    // Identify kill criteria edges
    const killCriteriaEdges = new Set<string>();
    for (const signal of data.micro_signals) {
        if (signal.confidence < 0.3 || signal.kill_criteria) {
            for (const edge of data.knowledge_graph.edges) {
                if (edge.translation_gap || edge.evidence_grade === 'D') {
                    killCriteriaEdges.add(edge.id);
                }
            }
        }
    }

    return (
        <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900">
            <svg width={dimensions.width} height={dimensions.height} className="w-full h-full">
                {/* Background circles */}
                {[1, 2, 3, 4].map(ring => {
                    const appearTime = TIMING.CENTER_NODE_APPEAR + ring * TIMING.RING_INTERVAL - 300;
                    const opacity = Math.min(1, Math.max(0, (animationTime - appearTime) / 500)) * 0.2;

                    return (
                        <circle
                            key={`ring-circle-${ring}`}
                            cx={cx}
                            cy={cy}
                            r={ring * ringRadius}
                            fill="none"
                            stroke={RING_COLORS[ring]}
                            strokeWidth={2}
                            strokeDasharray="10 5"
                            opacity={opacity}
                            style={{ transition: 'opacity 0.5s ease-out' }}
                        />
                    );
                })}

                {/* Edges */}
                {data.knowledge_graph.edges.map(edge => {
                    const startPos = nodePositions.get(edge.source);
                    const endPos = nodePositions.get(edge.target);
                    const sourceNode = nodeMap.get(edge.source);
                    const targetNode = nodeMap.get(edge.target);

                    if (!startPos || !endPos || !sourceNode || !targetNode) return null;

                    const sourceAppearTime = TIMING.CENTER_NODE_APPEAR + sourceNode.ring * TIMING.RING_INTERVAL;
                    const edgeStartTime = sourceAppearTime + 200;
                    const progress = Math.max(0, Math.min(1, (animationTime - edgeStartTime) / TIMING.LINK_GROW_DURATION));

                    if (progress <= 0) return null;

                    const hasKill = killCriteriaEdges.has(edge.id);
                    const color = hasKill ? '#ef4444' :
                        edge.evidence_grade === 'A' ? '#22c55e' :
                            edge.evidence_grade === 'B' ? '#3b82f6' :
                                edge.evidence_grade === 'C' ? '#f59e0b' : '#6b7280';

                    // Interpolate end point
                    const currentX = startPos.x + (endPos.x - startPos.x) * progress;
                    const currentY = startPos.y + (endPos.y - startPos.y) * progress;

                    return (
                        <g key={edge.id}>
                            {/* Glow effect */}
                            <line
                                x1={startPos.x}
                                y1={startPos.y}
                                x2={currentX}
                                y2={currentY}
                                stroke={color}
                                strokeWidth={hasKill ? 6 : 4}
                                opacity={0.3}
                                style={{ filter: 'blur(3px)' }}
                            />
                            {/* Main line */}
                            <line
                                x1={startPos.x}
                                y1={startPos.y}
                                x2={currentX}
                                y2={currentY}
                                stroke={color}
                                strokeWidth={hasKill ? 2 : 1}
                                opacity={0.8}
                            />
                            {/* Growing tip */}
                            {progress < 1 && (
                                <circle
                                    cx={currentX}
                                    cy={currentY}
                                    r={4}
                                    fill={color}
                                    opacity={0.9}
                                >
                                    <animate
                                        attributeName="r"
                                        values="4;6;4"
                                        dur="0.5s"
                                        repeatCount="indefinite"
                                    />
                                </circle>
                            )}
                        </g>
                    );
                })}

                {/* Nodes */}
                {data.knowledge_graph.nodes.map(node => {
                    const pos = nodePositions.get(node.id);
                    if (!pos) return null;

                    const appearTime = TIMING.CENTER_NODE_APPEAR + node.ring * TIMING.RING_INTERVAL;
                    const progress = Math.max(0, Math.min(1, (animationTime - appearTime) / TIMING.NODE_APPEAR_DURATION));

                    if (progress <= 0) return null;

                    const color = LANE_COLORS[node.lane] || RING_COLORS[node.ring] || '#94a3b8';
                    const baseRadius = 8 + node.proximity_score * 10;
                    const radius = baseRadius * progress;
                    const isSelected = selectedNodeId === node.id;
                    const isHovered = hoveredNode === node.id;

                    return (
                        <g
                            key={node.id}
                            style={{ cursor: 'pointer' }}
                            onClick={() => onNodeSelect(isSelected ? null : node.id)}
                            onMouseEnter={() => setHoveredNode(node.id)}
                            onMouseLeave={() => setHoveredNode(null)}
                        >
                            {/* Outer glow */}
                            <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={radius * 1.8}
                                fill={color}
                                opacity={0.15}
                                style={{ filter: 'blur(8px)' }}
                            />
                            {/* Pulse ring for center node */}
                            {node.ring === 0 && progress >= 1 && (
                                <circle
                                    cx={pos.x}
                                    cy={pos.y}
                                    r={radius}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth={2}
                                    opacity={0.5}
                                >
                                    <animate
                                        attributeName="r"
                                        values={`${radius};${radius * 2};${radius}`}
                                        dur="2s"
                                        repeatCount="indefinite"
                                    />
                                    <animate
                                        attributeName="opacity"
                                        values="0.5;0;0.5"
                                        dur="2s"
                                        repeatCount="indefinite"
                                    />
                                </circle>
                            )}
                            {/* Main node */}
                            <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={radius * (isSelected ? 1.3 : isHovered ? 1.1 : 1)}
                                fill={color}
                                stroke="white"
                                strokeWidth={isSelected ? 3 : 1}
                                opacity={0.9}
                                style={{ transition: 'r 0.2s ease-out' }}
                            />
                            {/* Inner highlight */}
                            <circle
                                cx={pos.x - radius * 0.3}
                                cy={pos.y - radius * 0.3}
                                r={radius * 0.3}
                                fill="white"
                                opacity={0.3}
                            />
                            {/* Label */}
                            {(isSelected || isHovered || node.ring === 0) && progress >= 1 && (
                                <g>
                                    <rect
                                        x={pos.x - node.name.length * 3.5 - 8}
                                        y={pos.y + radius + 8}
                                        width={node.name.length * 7 + 16}
                                        height={22}
                                        rx={4}
                                        fill="rgba(0,0,0,0.9)"
                                        stroke={color}
                                        strokeWidth={1}
                                    />
                                    <text
                                        x={pos.x}
                                        y={pos.y + radius + 23}
                                        textAnchor="middle"
                                        fill="white"
                                        fontSize={11}
                                        fontWeight={node.ring === 0 ? 'bold' : 'normal'}
                                    >
                                        {node.ring === 0 ? '🎯 ' : ''}{node.name.substring(0, 25)}
                                        {node.name.length > 25 ? '...' : ''}
                                    </text>
                                </g>
                            )}
                        </g>
                    );
                })}

                {/* Ring labels */}
                {['Centre', 'Ring 1', 'Ring 2', 'Ring 3', 'Ring 4'].map((label, ring) => {
                    if (ring === 0) return null;
                    const appearTime = TIMING.CENTER_NODE_APPEAR + ring * TIMING.RING_INTERVAL;
                    const opacity = Math.min(1, Math.max(0, (animationTime - appearTime) / 500)) * 0.5;

                    return (
                        <text
                            key={`label-${ring}`}
                            x={cx + ring * ringRadius}
                            y={cy - 10}
                            fill={RING_COLORS[ring]}
                            fontSize={10}
                            opacity={opacity}
                        >
                            {label}
                        </text>
                    );
                })}
            </svg>
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
    const animationRef = useRef<number>();
    const startTimeRef = useRef<number>(0);

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

    // Animation loop
    useEffect(() => {
        if (!data || isPaused || !isOpen) return;

        const animate = (timestamp: number) => {
            if (!startTimeRef.current) {
                startTimeRef.current = timestamp;
            }

            const elapsed = timestamp - startTimeRef.current;
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
        onClose();
    }, [onClose]);

    if (!isOpen) return null;

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
                            <span className="text-2xl">🎯</span> Radial Discovery
                            <span className="text-xs bg-green-600 px-2 py-0.5 rounded ml-2">2D Mode</span>
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
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={handleReplay}
                            className="bg-gray-800/90 hover:bg-gray-700 text-white p-2.5 rounded-lg transition-all hover:scale-105"
                            title="Rejouer l'animation"
                        >
                            <RotateCcw className="w-5 h-5" />
                        </button>
                        <button
                            onClick={() => setIsPaused(!isPaused)}
                            className="bg-gray-800/90 hover:bg-gray-700 text-white p-2.5 rounded-lg transition-all hover:scale-105"
                            title={isPaused ? 'Reprendre' : 'Pause'}
                        >
                            {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                        </button>
                        <button
                            onClick={handleClose}
                            className="bg-red-600/90 hover:bg-red-500 text-white p-2.5 rounded-lg transition-all hover:scale-105"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Legend */}
                <div className="absolute top-24 right-4 z-20 bg-gray-900/95 rounded-xl border border-gray-700/50 p-3 backdrop-blur-sm">
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
                            <p className="text-white text-lg font-medium">Construction du graphe...</p>
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

                {/* 2D Visualization */}
                {!isLoading && !error && data && (
                    <Radial2DVisualization
                        data={data}
                        animationTime={animationTime}
                        selectedNodeId={selectedNodeId}
                        onNodeSelect={setSelectedNodeId}
                    />
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
