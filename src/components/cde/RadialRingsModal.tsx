// ============================================
// RADIAL RINGS 3D - TOP-DOWN VIEW WITH CLICKABLE LINKS
// ============================================
// Smooth nodes with enhanced glow, clickable links for AI explanation

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { X, Play, Pause, RotateCcw, Sparkles, Loader2, MessageSquare, ExternalLink, Plus, GitBranch } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

// ============================================
// TYPES
// ============================================

interface RingNode {
    id: string;
    ring: number;
    lane: string;
    name: string;
    node_type?: string;
    properties: Record<string, any>;
    proximity_score: number;
    evidence_grade: string;
    translation_gap: boolean;
    // Ontology facets
    category_id?: string;
    subcategory?: string;
    tags?: string[];
    is_inherited?: boolean; // True if node came from previous expansion
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

// Semantic node type colors (ontology)
const NODE_TYPE_COLORS: Record<string, string> = {
    PATHOLOGY: '#ef4444',    // Red
    DRUG: '#22c55e',         // Green
    SYMPTOM: '#f59e0b',      // Yellow
    COMPLICATION: '#f97316', // Orange
    CONDITION: '#a855f7',    // Purple
    LAB: '#3b82f6',          // Blue
    GUIDELINE: '#06b6d4',    // Cyan
    EVIDENCE: '#6366f1',     // Indigo
};

// Semantic edge type colors (ontology)
const EDGE_TYPE_COLORS: Record<string, { color: string; dashArray?: string }> = {
    TREATS: { color: '#22c55e' },           // Green - positive
    ASSOCIATED_WITH: { color: '#6b7280' },  // Gray - neutral
    CAUSES: { color: '#f97316' },           // Orange - causal
    LEADS_TO: { color: '#f59e0b' },         // Yellow - progression
    RISK_INCREASED_BY: { color: '#eab308' },// Yellow - warning
    INDICATED_IF: { color: '#3b82f6', dashArray: '5,3' }, // Blue dashed
    CONTRAINDICATED_IF: { color: '#ef4444' }, // Red - danger
    MANAGED_BY: { color: '#22c55e', dashArray: '3,3' },   // Green dashed
    COMPLICATES: { color: '#f97316' },      // Orange - complication
    MONITOR_WITH: { color: '#06b6d4', dashArray: '5,5' }, // Cyan dashed
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
// WEBGL CHECK (comprehensive - tests shader compilation)
// ============================================

function isWebGLAvailable(): boolean {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return false;

        // Test if shaders can actually compile
        const webgl = gl as WebGLRenderingContext;

        // Create a simple vertex shader
        const vertShader = webgl.createShader(webgl.VERTEX_SHADER);
        if (!vertShader) return false;

        webgl.shaderSource(vertShader, 'attribute vec4 p;void main(){gl_Position=p;}');
        webgl.compileShader(vertShader);

        if (!webgl.getShaderParameter(vertShader, webgl.COMPILE_STATUS)) {
            webgl.deleteShader(vertShader);
            return false;
        }

        // Create a simple fragment shader
        const fragShader = webgl.createShader(webgl.FRAGMENT_SHADER);
        if (!fragShader) {
            webgl.deleteShader(vertShader);
            return false;
        }

        webgl.shaderSource(fragShader, 'precision mediump float;void main(){gl_FragColor=vec4(1.0);}');
        webgl.compileShader(fragShader);

        if (!webgl.getShaderParameter(fragShader, webgl.COMPILE_STATUS)) {
            webgl.deleteShader(vertShader);
            webgl.deleteShader(fragShader);
            return false;
        }

        // Create and link program
        const program = webgl.createProgram();
        if (!program) {
            webgl.deleteShader(vertShader);
            webgl.deleteShader(fragShader);
            return false;
        }

        webgl.attachShader(program, vertShader);
        webgl.attachShader(program, fragShader);
        webgl.linkProgram(program);

        const success = webgl.getProgramParameter(program, webgl.LINK_STATUS);

        // Cleanup
        webgl.deleteProgram(program);
        webgl.deleteShader(vertShader);
        webgl.deleteShader(fragShader);

        return !!success;
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
    onEdgeClick: (edge: RingEdge, source: RingNode, target: RingNode, multiNodes?: RingNode[]) => void;
    onSetCentral?: (nodeId: string) => void;
    newlySpawnedNodes?: Set<string>;
}

function SVGFallback({ data, animationTime, onEdgeClick, onSetCentral, newlySpawnedNodes }: SVGFallbackProps) {
    const svgSize = 600;
    const center = svgSize / 2;

    // Zoom and pan state
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    // Node selection state
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    // Hover/Tooltip state
    const [hoveredNode, setHoveredNode] = useState<RingNode | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    // Animation state
    const [animationProgress, setAnimationProgress] = useState(0);

    // NODE ACTION MODAL state
    const [showNodeActionModal, setShowNodeActionModal] = useState(false);
    const [actionNode, setActionNode] = useState<RingNode | null>(null);
    const [multiSelectMode, setMultiSelectMode] = useState(false);
    const [selectedNodesForAnalysis, setSelectedNodesForAnalysis] = useState<Set<string>>(new Set());


    // Entry animation effect
    useEffect(() => {
        setAnimationProgress(0);
        const startTime = Date.now();
        // Dynamic duration based on node count: minimum 2s, +20ms per node beyond 20
        const nodeCount = data.knowledge_graph.nodes.length;
        const duration = Math.max(2000, 2000 + (nodeCount - 20) * 20);

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(1, elapsed / duration);
            setAnimationProgress(progress);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    }, [data]);

    // Handle zoom with wheel - use native event listener for passive: false
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheelNative = (e: WheelEvent) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            setZoom(z => Math.min(3, Math.max(0.5, z * delta)));
        };

        container.addEventListener('wheel', handleWheelNative, { passive: false });
        return () => container.removeEventListener('wheel', handleWheelNative);
    }, []);

    // Handle pan with mouse drag
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 0 && !e.ctrlKey) { // Left click without Ctrl
            setIsPanning(true);
            setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
    }, [pan]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (isPanning) {
            setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
        }
    }, [isPanning, panStart]);

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
    }, []);

    // Calculate node positions - NON-OVERLAPPING RADIAL LAYOUT
    // Dynamic ring sizing based on node count to prevent overlaps
    // Positions are ALWAYS recalculated to allow dynamic ring expansion when new nodes arrive
    const { nodePositions, ringRadii, uniqueNodes } = useMemo(() => {
        const positions = new Map<string, { x: number; y: number }>();
        const radii = new Map<number, number>(); // Store calculated radius for each ring

        // DEDUPLICATE nodes by ID - keep first occurrence
        const seenIds = new Set<string>();
        const deduplicatedNodes = data.knowledge_graph.nodes.filter(node => {
            if (seenIds.has(node.id)) return false;
            seenIds.add(node.id);
            return true;
        });
        const nodes = deduplicatedNodes;

        // Find the center node (ring 0)
        const centerNode = nodes.find(n => n.ring === 0);

        // Place center node at center
        if (centerNode) {
            positions.set(centerNode.id, { x: center, y: center });
        }
        radii.set(0, 0); // Center ring has 0 radius

        // Get all non-center nodes
        const peripheralNodes = nodes.filter(n => n.ring !== 0);
        const nodeCount = peripheralNodes.length;

        if (nodeCount === 0) {
            return { nodePositions: positions, ringRadii: radii, uniqueNodes: nodes };
        }

        // Group nodes by their ring
        const nodesByRing = new Map<number, RingNode[]>();
        peripheralNodes.forEach(node => {
            const ring = node.ring || 1; // Default to ring 1
            if (!nodesByRing.has(ring)) nodesByRing.set(ring, []);
            nodesByRing.get(ring)!.push(node);
        });

        // Sort rings
        const sortedRings = Array.from(nodesByRing.keys()).sort((a, b) => a - b);

        // Constants for spacing calculation
        const BASE_NODE_SIZE = 14; // Base node visual size
        const LABEL_WIDTH = 60; // Estimated label width
        const MIN_SPACING = BASE_NODE_SIZE + LABEL_WIDTH + 20; // Minimum space between node centers
        const BASE_RING_RADIUS = 80; // Base radius for first ring

        // Track the previous ring's outer boundary for proper ring separation
        let previousRingOuterRadius = 30; // Center node's effective radius

        sortedRings.forEach(ring => {
            const ringNodes = nodesByRing.get(ring)!;
            const ringNodeCount = ringNodes.length;

            if (ringNodeCount === 0) return;

            // Calculate minimum circumference needed for all nodes to fit without overlap
            const minCircumference = ringNodeCount * MIN_SPACING;
            const minRadiusForSpacing = minCircumference / (2 * Math.PI);

            // Calculate minimum radius based on ring number (base positioning)
            const minRadiusForRing = ring * BASE_RING_RADIUS;

            // Ensure proper separation from previous ring
            const minRadiusFromPrevious = previousRingOuterRadius + MIN_SPACING / 2;

            // Use the largest required radius
            const effectiveRadius = Math.max(minRadiusForSpacing, minRadiusForRing, minRadiusFromPrevious);

            // Store the radius for this ring (for ring guide circles)
            radii.set(ring, effectiveRadius);

            // Distribute nodes evenly around the ring
            const angleStep = (Math.PI * 2) / ringNodeCount;

            // Stagger starting angle per ring for better visual distribution
            const ringStartAngle = -Math.PI / 2 + (ring * Math.PI / 6);

            ringNodes.forEach((node, i) => {
                const angle = ringStartAngle + angleStep * i;

                positions.set(node.id, {
                    x: center + Math.cos(angle) * effectiveRadius,
                    y: center + Math.sin(angle) * effectiveRadius
                });
            });

            // Update previous ring boundary for next iteration
            previousRingOuterRadius = effectiveRadius + MIN_SPACING / 2;
        });


        return { nodePositions: positions, ringRadii: radii, uniqueNodes: nodes };
    }, [data, center]);

    const nodeMap = useMemo(() => {
        const map = new Map<string, RingNode>();
        uniqueNodes.forEach(n => map.set(n.id, n));
        return map;
    }, [uniqueNodes]);

    const maxRing = Math.max(...uniqueNodes.map(n => n.ring));

    // Determine relationship type and color for edges
    const getRelationshipColor = (relationship: string, evidenceGrade: string): { color: string; type: 'positive' | 'danger' | 'contraindication' | 'warning' | 'neutral' } => {
        const rel = relationship.toLowerCase();

        // Positive/Beneficial relationships
        if (rel.includes('traite') || rel.includes('améliore') || rel.includes('bénéfique') ||
            rel.includes('thérapeutique') || rel.includes('efficace') || rel.includes('protège') ||
            rel.includes('prévient') || rel.includes('réduit') || rel.includes('soulage') ||
            rel.includes('positive') || rel.includes('synergie')) {
            return { color: '#22c55e', type: 'positive' }; // Green
        }

        // Danger/Severe interaction
        if (rel.includes('danger') || rel.includes('toxique') || rel.includes('mortel') ||
            rel.includes('grave') || rel.includes('sévère') || rel.includes('fatal') ||
            rel.includes('aggrave') || evidenceGrade === 'A' && rel.includes('risque')) {
            return { color: '#ef4444', type: 'danger' }; // Red
        }

        // Contraindication
        if (rel.includes('contre-indic') || rel.includes('interdit') || rel.includes('éviter') ||
            rel.includes('incompatible') || rel.includes('ne pas') || rel.includes('exclu')) {
            return { color: '#f97316', type: 'contraindication' }; // Orange
        }

        // Warning/Slight risk
        if (rel.includes('précaution') || rel.includes('prudence') || rel.includes('surveiller') ||
            rel.includes('attention') || rel.includes('modéré') || rel.includes('possible') ||
            rel.includes('risque') || rel.includes('interaction')) {
            return { color: '#eab308', type: 'warning' }; // Yellow
        }

        // Neutral/Unknown - use evidence grade for color
        if (evidenceGrade === 'A') return { color: '#22c55e', type: 'positive' };
        if (evidenceGrade === 'B') return { color: '#3b82f6', type: 'neutral' };
        if (evidenceGrade === 'C') return { color: '#eab308', type: 'warning' };
        return { color: '#6b7280', type: 'neutral' }; // Gray
    };

    // Calculate highlighted nodes with their colors based on selection
    const connectionColors = useMemo(() => {
        const colors = new Map<string, { color: string; type: string }>();
        if (!selectedNodeId) return colors;

        // Check all edges for connections to the selected node
        data.knowledge_graph.edges.forEach(edge => {
            let targetId: string | null = null;

            if (edge.source === selectedNodeId) {
                targetId = edge.target;
            } else if (edge.target === selectedNodeId) {
                targetId = edge.source;
            }

            if (targetId) {
                const relationColor = getRelationshipColor(edge.relationship, edge.evidence_grade);
                colors.set(targetId, relationColor);
            }
        });

        // For nodes without explicit edges (in complete graph), assign neutral
        data.knowledge_graph.nodes.forEach(n => {
            if (n.id !== selectedNodeId && !colors.has(n.id)) {
                colors.set(n.id, { color: '#6b7280', type: 'neutral' });
            }
        });

        return colors;
    }, [selectedNodeId, data]);

    const highlightedNodeIds = useMemo(() => {
        if (!selectedNodeId) return new Set<string>();
        return new Set(connectionColors.keys());
    }, [selectedNodeId, connectionColors]);

    const getNodeVisible = (ring: number) => {
        const appearTime = TIMING.CENTER_APPEAR + ring * TIMING.RING_INTERVAL;
        return animationTime >= appearTime;
    };

    // Handle node click - MIND MAP BEHAVIOR
    // Opens action modal with options
    const handleNodeClick = useCallback((node: RingNode, e: React.MouseEvent) => {
        e.stopPropagation();

        // In multi-select mode, toggle node selection for analysis
        if (multiSelectMode) {
            setSelectedNodesForAnalysis(prev => {
                const newSet = new Set(prev);
                if (newSet.has(node.id)) {
                    newSet.delete(node.id);
                } else {
                    newSet.add(node.id);
                }
                return newSet;
            });
            return;
        }

        // Normal mode: open action modal
        setActionNode(node);
        setShowNodeActionModal(true);
        setSelectedNodeId(node.id);
    }, [multiSelectMode]);

    // Handle double click → expand graph from this node
    const handleNodeDoubleClick = useCallback((node: RingNode, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();

        // Only expand from non-center nodes
        if (node.ring !== 0 && onSetCentral) {
            onSetCentral(node.id);
        }
    }, [onSetCentral]);

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 flex items-center justify-center bg-gray-900 overflow-hidden cursor-grab"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        >
            <svg
                width={svgSize}
                height={svgSize}
                className="overflow-visible"
                style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    transition: isPanning ? 'none' : 'transform 0.1s ease-out'
                }}
            >
                {/* Ring guides with staggered animation - use dynamic radii */}
                {Array.from(ringRadii.entries()).map(([ring, radius]) => {
                    if (ring === 0 || radius === 0) return null;
                    // Each ring appears after the previous one
                    const ringAppearTime = ring * 0.15; // 15% of animation per ring
                    const ringProgress = Math.max(0, Math.min(1, (animationProgress - ringAppearTime) / 0.2));
                    const scale = 0.5 + ringProgress * 0.5; // Scale from 0.5 to 1

                    return (
                        <circle
                            key={`ring-${ring}`}
                            cx={center}
                            cy={center}
                            r={radius * scale}
                            fill="none"
                            stroke={RING_COLORS[ring] || '#6b7280'}
                            strokeWidth="1"
                            strokeDasharray="8 4"
                            opacity={0.3 * ringProgress}
                            style={{
                                transition: 'opacity 0.3s ease-out'
                            }}
                        />
                    );
                })}

                {/* SVG Definitions for animations */}
                <defs>
                    {/* Electric current gradient */}
                    <linearGradient id="electricGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#06b6d4" stopOpacity="0">
                            <animate attributeName="offset" values="0;1" dur="1.5s" repeatCount="indefinite" />
                        </stop>
                        <stop offset="30%" stopColor="#22d3ee" stopOpacity="1">
                            <animate attributeName="offset" values="0.3;1.3" dur="1.5s" repeatCount="indefinite" />
                        </stop>
                        <stop offset="50%" stopColor="#ffffff" stopOpacity="1">
                            <animate attributeName="offset" values="0.5;1.5" dur="1.5s" repeatCount="indefinite" />
                        </stop>
                        <stop offset="70%" stopColor="#22d3ee" stopOpacity="1">
                            <animate attributeName="offset" values="0.7;1.7" dur="1.5s" repeatCount="indefinite" />
                        </stop>
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity="0">
                            <animate attributeName="offset" values="1;2" dur="1.5s" repeatCount="indefinite" />
                        </stop>
                    </linearGradient>

                    {/* Glow filter */}
                    <filter id="nodeGlow" x="-100%" y="-100%" width="300%" height="300%">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>

                    {/* Bright glow filter for spawn */}
                    <filter id="spawnGlow" x="-200%" y="-200%" width="500%" height="500%">
                        <feGaussianBlur stdDeviation="8" result="blur" />
                        <feMerge>
                            <feMergeNode in="blur" />
                            <feMergeNode in="blur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>

                    {/* Electric glow filter for edges */}
                    <filter id="electricGlow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="2" result="blur" />
                        <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.8  0 0 0 0 1  0 0 0 1 0" result="blueGlow" />
                        <feMerge>
                            <feMergeNode in="blueGlow" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                </defs>

                {/* Edges - OPTIMIZED: Only render defined edges, not all pairs */}
                {(() => {
                    const allEdges: JSX.Element[] = [];
                    const totalEdges = data.knowledge_graph.edges.length;

                    // Deduplicate edges by normalized key
                    const seenEdges = new Set<string>();
                    const uniqueEdges = data.knowledge_graph.edges.filter(edge => {
                        const key = [edge.source, edge.target].sort().join('-');
                        if (seenEdges.has(key)) return false;
                        seenEdges.add(key);
                        return true;
                    });

                    uniqueEdges.forEach((edge, edgeIndex) => {
                        const posA = nodePositions.get(edge.source);
                        const posB = nodePositions.get(edge.target);
                        const nodeA = nodeMap.get(edge.source);
                        const nodeB = nodeMap.get(edge.target);

                        if (!posA || !posB || !nodeA || !nodeB) return;

                        // Check visibility (both nodes must be visible)
                        if (!getNodeVisible(nodeA.ring) || !getNodeVisible(nodeB.ring)) return;

                        // Edge animation progress - staggered based on edge index
                        const edgeStagger = (edgeIndex / totalEdges) * 0.6;
                        const edgeAppearTime = 0.15 + edgeStagger;
                        const edgeProgress = Math.max(0, Math.min(1, (animationProgress - edgeAppearTime) / 0.25));
                        if (edgeProgress <= 0) return;

                        // Check if this edge is connected to selected node
                        const isConnectedToSelected = selectedNodeId
                            ? (nodeA.id === selectedNodeId || nodeB.id === selectedNodeId)
                            : false;

                        // Determine which node is NOT the selected one (for color lookup)
                        const otherNodeId = nodeA.id === selectedNodeId ? nodeB.id :
                            nodeB.id === selectedNodeId ? nodeA.id : null;

                        // Determine color based on relationship type
                        let color: string;
                        if (isConnectedToSelected && otherNodeId) {
                            const connectionColor = connectionColors.get(otherNodeId);
                            color = connectionColor?.color || '#6b7280';
                        } else {
                            color = edge.evidence_grade === 'A' ? '#22c55e' :
                                edge.evidence_grade === 'B' ? '#3b82f6' :
                                    edge.evidence_grade === 'C' ? '#f59e0b' : '#6b7280';
                        }

                        // Opacity based on selection state and animation
                        let opacity = 0.6;
                        if (selectedNodeId) {
                            opacity = isConnectedToSelected ? 1 : 0.1;
                        }
                        opacity *= edgeProgress;

                        const strokeWidth = isConnectedToSelected ? 4 : 2;

                        // Calculate line length for electric effect
                        const dx = posB.x - posA.x;
                        const dy = posB.y - posA.y;
                        const length = Math.sqrt(dx * dx + dy * dy);

                        // Animated line drawing effect
                        const visibleLength = length * edgeProgress;
                        const dashArray = `${visibleLength} ${length - visibleLength}`;

                        allEdges.push(
                            <g key={`edge-${edgeIndex}-${edge.id}`}>
                                {/* Background line (drawn progressively) */}
                                <line
                                    x1={posA.x} y1={posA.y}
                                    x2={posB.x} y2={posB.y}
                                    stroke={color}
                                    strokeWidth={strokeWidth}
                                    strokeDasharray={dashArray}
                                    opacity={opacity * 0.6}
                                    strokeLinecap="round"
                                />

                                {/* Electric current effect on ALL edges after animation */}
                                {edgeProgress >= 1 && (
                                    <>
                                        {/* Subtle glow behind electric current */}
                                        <line
                                            x1={posA.x} y1={posA.y}
                                            x2={posB.x} y2={posB.y}
                                            stroke={isConnectedToSelected ? color : '#06b6d4'}
                                            strokeWidth={isConnectedToSelected ? 6 : 3}
                                            opacity={isConnectedToSelected ? 0.4 : 0.15}
                                            strokeLinecap="round"
                                            filter="url(#electricGlow)"
                                        />
                                        {/* Animated electric dash - subtle on inactive, bright on active */}
                                        <line
                                            x1={posA.x} y1={posA.y}
                                            x2={posB.x} y2={posB.y}
                                            stroke={isConnectedToSelected ? 'white' : '#22d3ee'}
                                            strokeWidth={isConnectedToSelected ? 2 : 1}
                                            strokeDasharray={isConnectedToSelected ? '4 12' : '2 8'}
                                            opacity={isConnectedToSelected ? 0.9 : 0.4}
                                            strokeLinecap="round"
                                        >
                                            <animate
                                                attributeName="stroke-dashoffset"
                                                values="0;-20"
                                                dur={isConnectedToSelected ? '0.4s' : '1s'}
                                                repeatCount="indefinite"
                                            />
                                        </line>
                                        {/* Spark particle - fast on active edges, slow on others */}
                                        <circle
                                            r={isConnectedToSelected ? 3 : 1.5}
                                            fill={isConnectedToSelected ? 'white' : '#22d3ee'}
                                            opacity={isConnectedToSelected ? 0.9 : 0.5}
                                        >
                                            <animateMotion
                                                dur={isConnectedToSelected ? '0.6s' : '2s'}
                                                repeatCount="indefinite"
                                                path={`M${posA.x},${posA.y} L${posB.x},${posB.y}`}
                                            />
                                        </circle>
                                    </>
                                )}

                                {/* Clickable overlay */}
                                <line
                                    x1={posA.x} y1={posA.y}
                                    x2={posB.x} y2={posB.y}
                                    stroke="transparent"
                                    strokeWidth="12"
                                    className="cursor-pointer"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEdgeClick(edge, nodeA, nodeB);
                                    }}
                                />
                            </g>
                        );
                    });

                    return allEdges;
                })()}

                {/* Nodes with staggered ease-in-out animation */}
                {uniqueNodes.map((node, nodeIndex) => {
                    const pos = nodePositions.get(node.id);
                    if (!pos || !getNodeVisible(node.ring)) return null;

                    // Calculate stagger delay based on total node count to fit all in animation
                    const totalNodes = data.knowledge_graph.nodes.length;
                    const maxStaggerTime = 0.7; // All nodes start appearing by 70% of animation
                    const staggerDelay = (nodeIndex / totalNodes) * maxStaggerTime;
                    const nodeAppearTime = 0.05 + staggerDelay;
                    const rawProgress = (animationProgress - nodeAppearTime) / 0.2;
                    // Ease-in-out cubic bezier approximation
                    const easeInOut = (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
                    const nodeProgress = Math.max(0, Math.min(1, easeInOut(Math.max(0, Math.min(1, rawProgress)))));

                    // Don't render if not visible yet
                    if (nodeProgress <= 0) return null;

                    // Use semantic node type color if available, fallback to lane/ring colors
                    const baseColor = NODE_TYPE_COLORS[node.node_type?.toUpperCase()] || LANE_COLORS[node.lane] || RING_COLORS[node.ring] || '#94a3b8';
                    // Reduce size for ring 1 nodes to prevent overlap
                    const ringScale = node.ring === 1 ? 0.6 : 1;
                    const size = (8 + node.proximity_score * 6) * ringScale;

                    // Determine node state
                    const isSelected = node.id === selectedNodeId;
                    const isHighlighted = highlightedNodeIds.has(node.id);
                    const isDimmed = selectedNodeId && !isSelected && !isHighlighted;
                    const isMultiSelected = selectedNodesForAnalysis.has(node.id);
                    const isNewlySpawned = newlySpawnedNodes?.has(node.id) || false;

                    // Get relationship-based color from connectionColors
                    const connectionColor = connectionColors.get(node.id);

                    // Determine node color based on state and relationship
                    let color: string;
                    if (isMultiSelected && multiSelectMode) {
                        color = '#22c55e'; // Green for multi-selected
                    } else if (isSelected) {
                        color = '#a855f7'; // Purple for selected
                    } else if (isHighlighted && connectionColor) {
                        color = connectionColor.color; // Use relationship color
                    } else {
                        color = baseColor;
                    }

                    // Apply pop animation effect
                    const popScale = nodeProgress < 1 ? 0.8 + 0.4 * Math.sin(nodeProgress * Math.PI * 0.5) : 1;

                    const glowOpacity = (isSelected ? 0.5 : (isHighlighted ? 0.4 : (isDimmed ? 0.03 : 0.15))) * nodeProgress;
                    const mainOpacity = (isDimmed ? 0.2 : 1) * nodeProgress;
                    const nodeSize = (isSelected ? size * 1.5 : (isHighlighted ? size * 1.2 : size)) * popScale;

                    return (
                        <g
                            key={node.id}
                            onClick={(e) => handleNodeClick(node, e)}
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                if (onSetCentral) onSetCentral(node.id);
                            }}
                            onMouseEnter={(e) => {
                                setHoveredNode(node);
                                const rect = containerRef.current?.getBoundingClientRect();
                                if (rect) {
                                    setTooltipPos({
                                        x: e.clientX - rect.left,
                                        y: e.clientY - rect.top - 60
                                    });
                                }
                            }}
                            onMouseLeave={() => setHoveredNode(null)}
                            className="cursor-pointer"
                            style={{ transition: 'all 0.3s ease-out' }}
                        >
                            {/* Entry animation - multiple expanding light rings */}
                            {nodeProgress < 1 && (
                                <>
                                    {/* Outer expanding ring */}
                                    <circle
                                        cx={pos.x}
                                        cy={pos.y}
                                        r={nodeSize * 5 * nodeProgress}
                                        fill="none"
                                        stroke={color}
                                        strokeWidth={3 * (1 - nodeProgress)}
                                        opacity={0.8 * (1 - nodeProgress)}
                                    />
                                    {/* Middle expanding ring */}
                                    <circle
                                        cx={pos.x}
                                        cy={pos.y}
                                        r={nodeSize * 3 * nodeProgress}
                                        fill="none"
                                        stroke={color}
                                        strokeWidth={2 * (1 - nodeProgress)}
                                        opacity={0.6 * (1 - nodeProgress)}
                                    />
                                    {/* Inner bright flash */}
                                    <circle
                                        cx={pos.x}
                                        cy={pos.y}
                                        r={nodeSize * 2 * (1 - nodeProgress * 0.5)}
                                        fill={color}
                                        opacity={0.7 * (1 - nodeProgress)}
                                    />
                                    {/* Center bright point */}
                                    <circle
                                        cx={pos.x}
                                        cy={pos.y}
                                        r={nodeSize * 0.8}
                                        fill="white"
                                        opacity={0.9 * (1 - nodeProgress)}
                                    />
                                </>
                            )}
                            {/* Selection ring for selected node */}
                            {isSelected && (
                                <circle
                                    cx={pos.x} cy={pos.y} r={nodeSize * 2.5}
                                    fill="none"
                                    stroke="#a855f7"
                                    strokeWidth="3"
                                    strokeDasharray="6 3"
                                    opacity="0.8"
                                >
                                    <animate attributeName="stroke-dashoffset" values="0;18" dur="1s" repeatCount="indefinite" />
                                </circle>
                            )}
                            {/* Pulsing glow for highlighted danger nodes */}
                            {isHighlighted && connectionColor?.type === 'danger' && (
                                <circle cx={pos.x} cy={pos.y} r={nodeSize * 2.5} fill="#ef4444" opacity="0.3">
                                    <animate attributeName="opacity" values="0.3;0.1;0.3" dur="1s" repeatCount="indefinite" />
                                </circle>
                            )}
                            {/* COSMIC ENERGY BURST for newly spawned nodes */}
                            {isNewlySpawned && (
                                <>
                                    {/* Outer pulsing cosmic glow */}
                                    <circle cx={pos.x} cy={pos.y} r={nodeSize * 4} fill="none" stroke="#a855f7" strokeWidth="2">
                                        <animate attributeName="r" values={`${nodeSize * 2};${nodeSize * 6}`} dur="1.5s" repeatCount="indefinite" />
                                        <animate attributeName="opacity" values="0.8;0" dur="1.5s" repeatCount="indefinite" />
                                    </circle>
                                    {/* Inner rotating energy ring */}
                                    <circle cx={pos.x} cy={pos.y} r={nodeSize * 3} fill="none" stroke="#06b6d4" strokeWidth="3" strokeDasharray="8 4">
                                        <animate attributeName="stroke-dashoffset" values="0;-24" dur="0.5s" repeatCount="indefinite" />
                                        <animate attributeName="opacity" values="0.7;0.3;0.7" dur="1s" repeatCount="indefinite" />
                                    </circle>
                                    {/* Bright core flash */}
                                    <circle cx={pos.x} cy={pos.y} r={nodeSize * 1.8} fill="white" opacity="0.6">
                                        <animate attributeName="opacity" values="0.8;0.2;0.8" dur="0.8s" repeatCount="indefinite" />
                                    </circle>
                                    {/* Energy particle 1 */}
                                    <circle r="4" fill="#a855f7" opacity="0.9">
                                        <animateMotion dur="1.2s" repeatCount="indefinite" path={`M${pos.x},${pos.y} m-${nodeSize * 3},0 a${nodeSize * 3},${nodeSize * 3} 0 1,1 ${nodeSize * 6},0 a${nodeSize * 3},${nodeSize * 3} 0 1,1 -${nodeSize * 6},0`} />
                                    </circle>
                                    {/* Energy particle 2 */}
                                    <circle r="3" fill="#06b6d4" opacity="0.8">
                                        <animateMotion dur="0.9s" repeatCount="indefinite" begin="0.3s" path={`M${pos.x},${pos.y} m-${nodeSize * 2.5},0 a${nodeSize * 2.5},${nodeSize * 2.5} 0 1,0 ${nodeSize * 5},0 a${nodeSize * 2.5},${nodeSize * 2.5} 0 1,0 -${nodeSize * 5},0`} />
                                    </circle>
                                </>
                            )}
                            {/* Outer glow - enhanced during animation */}
                            <circle
                                cx={pos.x}
                                cy={pos.y}
                                r={nodeSize * 2 * (nodeProgress < 1 ? 1 + (1 - nodeProgress) : 1)}
                                fill={color}
                                opacity={glowOpacity * (nodeProgress < 1 ? 2 : 1)}
                            />
                            {/* Inner glow */}
                            <circle cx={pos.x} cy={pos.y} r={nodeSize * 1.4} fill={color} opacity={glowOpacity * 2} />
                            {/* Main node */}
                            <circle cx={pos.x} cy={pos.y} r={nodeSize} fill={color} opacity={mainOpacity} />
                            {/* Specular highlight */}
                            <circle
                                cx={pos.x - nodeSize * 0.25}
                                cy={pos.y - nodeSize * 0.25}
                                r={nodeSize * 0.3}
                                fill="white"
                                opacity={mainOpacity * 0.5 * (nodeProgress < 1 ? 1.5 : 1)}
                            />

                            {/* Permanent label for ALL nodes */}
                            <g style={{ pointerEvents: 'none' }}>
                                {/* Label background pill */}
                                <rect
                                    x={pos.x - Math.min(node.name.length * 3.5, 50)}
                                    y={pos.y + nodeSize + 4}
                                    width={Math.min(node.name.length * 7, 100)}
                                    height={16}
                                    rx={8}
                                    fill={baseColor}
                                    opacity={mainOpacity * 0.9}
                                />
                                {/* Label text */}
                                <text
                                    x={pos.x}
                                    y={pos.y + nodeSize + 15}
                                    textAnchor="middle"
                                    fill="white"
                                    fontSize={node.ring === 0 ? "11" : "9"}
                                    fontWeight={node.ring === 0 || isSelected ? "bold" : "500"}
                                    style={{
                                        textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                                        letterSpacing: '-0.3px'
                                    }}
                                >
                                    {node.ring === 0 ? '🎯 ' : ''}{node.name.length > 15 ? node.name.substring(0, 13) + '…' : node.name}
                                </text>
                            </g>

                            {/* Selection indicator */}
                            {isSelected && (
                                <text
                                    x={pos.x}
                                    y={pos.y - nodeSize - 8}
                                    textAnchor="middle"
                                    fill="#a855f7"
                                    fontSize="10"
                                    fontWeight="bold"
                                >
                                    🔍 Sélectionné
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>

            {/* Zoom controls */}
            <div className="absolute bottom-8 left-4 flex gap-2">
                <button
                    onClick={() => setZoom(z => Math.min(3, z * 1.2))}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm"
                >
                    +
                </button>
                <button
                    onClick={() => setZoom(z => Math.max(0.5, z / 1.2))}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm"
                >
                    -
                </button>
                <button
                    onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
                    className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm"
                >
                    Reset
                </button>
                <span className="text-gray-500 text-xs ml-2 self-center">{Math.round(zoom * 100)}%</span>
            </div>

            <div className="absolute bottom-8 right-4 text-right text-gray-400 text-sm">
                <p>🎯 1er clic: sélectionner | 2ème clic: analyser le lien IA</p>
                <p className="text-xs mt-1">🟢 Bénéfique | 🔴 Danger | 🟠 Contre-indiqué | 🟡 Précaution</p>
                <p className="text-xs mt-1 text-purple-400">🖱️ Double-clic: définir comme centre</p>
            </div>

            {/* Tooltip on hover */}
            {hoveredNode && (
                <div
                    className="absolute pointer-events-none z-50 bg-gray-900/95 border border-gray-600 rounded-lg px-4 py-3 shadow-xl max-w-xs"
                    style={{
                        left: tooltipPos.x,
                        top: tooltipPos.y,
                        transform: 'translateX(-50%)'
                    }}
                >
                    <div className="flex items-center gap-2 mb-2">
                        <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: LANE_COLORS[hoveredNode.lane] || RING_COLORS[hoveredNode.ring] || '#94a3b8' }}
                        />
                        <span className="font-bold text-white text-sm">{hoveredNode.name}</span>
                    </div>
                    <div className="text-xs text-gray-300 space-y-1">
                        <p><span className="text-gray-500">Type:</span> {hoveredNode.node_type || hoveredNode.lane}</p>
                        <p><span className="text-gray-500">Anneau:</span> {hoveredNode.ring}</p>
                        <p><span className="text-gray-500">Score:</span> {(hoveredNode.proximity_score * 100).toFixed(0)}%</p>
                    </div>
                    <div className="mt-2 pt-2 border-t border-gray-700 text-xs text-purple-400">
                        Double-clic → nouveau centre
                    </div>
                </div>
            )}

            {/* NODE ACTION MODAL */}
            {showNodeActionModal && actionNode && (
                <div
                    className="absolute inset-0 bg-black/50 flex items-center justify-center z-50"
                    onClick={() => setShowNodeActionModal(false)}
                >
                    <div
                        className="bg-gray-800 rounded-xl border border-gray-700 p-6 max-w-md w-full mx-4 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <span
                                className="w-4 h-4 rounded-full"
                                style={{ backgroundColor: NODE_TYPE_COLORS[actionNode.node_type?.toUpperCase()] || LANE_COLORS[actionNode.lane] || '#94a3b8' }}
                            />
                            <h3 className="text-lg font-bold text-white">{actionNode.name}</h3>
                        </div>

                        <p className="text-sm text-gray-400 mb-4">
                            Type: {actionNode.node_type || actionNode.lane} | Anneau: {actionNode.ring}
                        </p>

                        <div className="space-y-3">
                            {/* Option 1: Set as new center */}
                            <button
                                onClick={() => {
                                    setShowNodeActionModal(false);
                                    if (onSetCentral && actionNode.ring !== 0) {
                                        onSetCentral(actionNode.id);
                                    }
                                }}
                                disabled={actionNode.ring === 0}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 rounded-lg text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="text-2xl">🎯</span>
                                <div>
                                    <div className="font-medium text-white">Définir comme nouveau centre</div>
                                    <div className="text-xs text-gray-400">Explore le graphe depuis ce nœud</div>
                                </div>
                            </button>

                            {/* Option 2: Analyze with central node */}
                            <button
                                onClick={() => {
                                    setShowNodeActionModal(false);
                                    const centerNode = data.knowledge_graph.nodes.find(n => n.ring === 0);
                                    if (centerNode && actionNode.id !== centerNode.id) {
                                        const syntheticEdge: RingEdge = {
                                            id: `${actionNode.id}-${centerNode.id}`,
                                            source: actionNode.id,
                                            target: centerNode.id,
                                            relationship: 'analyse demandée',
                                            evidence_grade: 'D',
                                            translation_gap: false,
                                            weight: 0.5
                                        };
                                        onEdgeClick(syntheticEdge, actionNode, centerNode);
                                    }
                                }}
                                disabled={actionNode.ring === 0}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 rounded-lg text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="text-2xl">🔍</span>
                                <div>
                                    <div className="font-medium text-white">Analyser le lien avec le nœud central</div>
                                    <div className="text-xs text-gray-400">Analyse IA de la relation</div>
                                </div>
                            </button>

                            {/* Option 3: Analyze with other nodes */}
                            <button
                                onClick={() => {
                                    setShowNodeActionModal(false);
                                    setMultiSelectMode(true);
                                    setSelectedNodesForAnalysis(new Set([actionNode.id]));
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-green-600/20 hover:bg-green-600/40 border border-green-500/30 rounded-lg text-left transition-colors"
                            >
                                <span className="text-2xl">🔗</span>
                                <div>
                                    <div className="font-medium text-white">Analyser le lien avec d'autres nœuds</div>
                                    <div className="text-xs text-gray-400">Sélectionnez plusieurs nœuds pour analyse</div>
                                </div>
                            </button>
                        </div>

                        <button
                            onClick={() => setShowNodeActionModal(false)}
                            className="mt-4 w-full py-2 text-sm text-gray-400 hover:text-white transition-colors"
                        >
                            Annuler
                        </button>
                    </div>
                </div>
            )}

            {/* MULTI-SELECT MODE BAR */}
            {multiSelectMode && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-40 bg-gray-800/95 rounded-xl border border-green-500/50 px-6 py-4 shadow-xl backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                        <div className="text-white">
                            <span className="text-green-400 font-bold">{selectedNodesForAnalysis.size}</span> nœuds sélectionnés
                        </div>
                        <div className="h-6 w-px bg-gray-600" />
                        <button
                            onClick={() => {
                                if (selectedNodesForAnalysis.size >= 2) {
                                    // Get nodes for analysis
                                    const nodesToAnalyze = data.knowledge_graph.nodes.filter(n =>
                                        selectedNodesForAnalysis.has(n.id)
                                    );
                                    if (nodesToAnalyze.length >= 2) {
                                        // Create synthetic multi-node edge for analysis
                                        const syntheticEdge: RingEdge = {
                                            id: `multi-${Date.now()}`,
                                            source: nodesToAnalyze[0].id,
                                            target: nodesToAnalyze[nodesToAnalyze.length - 1].id,
                                            relationship: `Analyse multi-noeuds: ${nodesToAnalyze.map(n => n.name).join(' ↔ ')}`,
                                            evidence_grade: 'D',
                                            translation_gap: false,
                                            weight: 0.5
                                        };
                                        // Pass ALL selected nodes for comprehensive analysis
                                        onEdgeClick(syntheticEdge, nodesToAnalyze[0], nodesToAnalyze[nodesToAnalyze.length - 1], nodesToAnalyze);
                                    }
                                }
                                setMultiSelectMode(false);
                                setSelectedNodesForAnalysis(new Set());
                            }}
                            disabled={selectedNodesForAnalysis.size < 2}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                        >
                            <Sparkles className="w-4 h-4" />
                            Lancer l'analyse
                        </button>
                        <button
                            onClick={() => {
                                setMultiSelectMode(false);
                                setSelectedNodesForAnalysis(new Set());
                            }}
                            className="px-3 py-2 text-gray-400 hover:text-white transition-colors"
                        >
                            ✕
                        </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-2">Cliquez sur les nœuds pour les sélectionner</p>
                </div>
            )}
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
    multiNodes?: RingNode[]; // All nodes for multi-node analysis
    pathology: string;
    onSetCentral?: (nodeId: string) => void;
}

function LinkExplanationModal({ isOpen, onClose, edge, sourceNode, targetNode, multiNodes, pathology, onSetCentral }: LinkModalProps) {
    const [explanation, setExplanation] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [fromCache, setFromCache] = useState(false);

    // Determine if this is a multi-node analysis
    const isMultiNodeAnalysis = multiNodes && multiNodes.length > 2;
    const allNodeNames = isMultiNodeAnalysis ? multiNodes.map(n => n.name) : [sourceNode?.name, targetNode?.name].filter(Boolean);

    useEffect(() => {
        if (isOpen && edge && sourceNode && targetNode) {
            fetchExplanation();
        }
    }, [isOpen, edge, sourceNode, targetNode, multiNodes]);

    const fetchExplanation = async () => {
        if (!edge || !sourceNode || !targetNode) return;

        setIsLoading(true);
        setExplanation('');
        setFromCache(false);

        // Normalize node names for consistent cache lookup (alphabetical order)
        const [normSource, normTarget] = [sourceNode.name, targetNode.name].sort();

        try {
            // Step 1: Check cache first
            const { data: cached, error: cacheError } = await supabase
                .from('link_explanations_cache' as any)
                .select('id, explanation')
                .eq('source_name', normSource)
                .eq('target_name', normTarget)
                .eq('pathology', pathology)
                .maybeSingle();

            if (cached && !cacheError) {
                // Cache hit! Use cached explanation
                setExplanation((cached as any).explanation);
                setFromCache(true);
                setIsLoading(false);

                // Increment hit count in background (fire and forget)
                supabase.rpc('increment_link_cache_hit' as any, { cache_id: (cached as any).id }).then(() => { }, () => { });
                return;
            }

            // Step 2: Cache miss - call AI
            // Build query based on whether this is multi-node or standard 2-node analysis
            const queryPrompt = isMultiNodeAnalysis
                ? `Analyse en détail les relations thérapeutiques et cliniques entre TOUS ces concepts médicaux dans le contexte de "${pathology}":

${multiNodes!.map((n, i) => `${i + 1}. ${n.name} (${n.node_type})`).join('\n')}

Fournis une analyse complète incluant:
1. Les interactions entre TOUS ces concepts (pas seulement par paires)
2. Les synergies potentielles
3. Les contre-indications croisées
4. Les implications thérapeutiques globales
5. Les risques cumulatifs
6. Une recommandation clinique intégrée`
                : `Explique en détail le lien entre "${sourceNode.name}" et "${targetNode.name}" dans le contexte de la pathologie "${pathology}". 
                    
Type de relation: ${edge.relationship}
Grade d'évidence: ${edge.evidence_grade}
Gap de translation: ${edge.translation_gap ? 'Oui' : 'Non'}

Fournis:
1. Une explication scientifique détaillée du mécanisme
2. Les preuves cliniques disponibles
3. Les implications thérapeutiques potentielles
4. Les limitations ou incertitudes connues`;

            const response = await supabase.functions.invoke('causal-reasoning', {
                body: {
                    query: queryPrompt,
                    context: {
                        sourceNode: sourceNode.name,
                        targetNode: targetNode.name,
                        multiNodes: isMultiNodeAnalysis ? multiNodes!.map(n => ({ name: n.name, type: n.node_type })) : undefined,
                        relationship: edge.relationship,
                        evidence_grade: edge.evidence_grade,
                        pathology
                    }
                }
            });

            if (response.error) throw response.error;
            const aiExplanation = response.data?.analysis || response.data?.explanation || 'Analyse non disponible.';
            setExplanation(aiExplanation);

            // Step 3: Save to cache for future use (fire and forget)
            supabase
                .from('link_explanations_cache' as any)
                .upsert({
                    source_name: normSource,
                    target_name: normTarget,
                    pathology: pathology,
                    relationship: edge.relationship,
                    evidence_grade: edge.evidence_grade,
                    explanation: aiExplanation
                }, {
                    onConflict: 'source_name,target_name,pathology'
                })
                .then(
                    () => console.log('Cache saved successfully'),
                    () => console.log('Cache save skipped')
                );

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
                        {fromCache && (
                            <span className="px-2 py-1 bg-cyan-900/50 text-cyan-400 border border-cyan-500/30 rounded text-xs ml-auto">
                                ⚡ Cache
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

                {/* Footer with action button */}
                <div className="p-4 border-t border-gray-700 bg-gray-800/50">
                    <button
                        onClick={() => {
                            if (onSetCentral && sourceNode) {
                                onSetCentral(sourceNode.id);
                                onClose();
                            }
                        }}
                        className="w-full py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg"
                    >
                        <GitBranch className="w-4 h-4" />
                        Ajouter des nœuds liés à "{sourceNode?.name}"
                    </button>
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

    // Deduplicate edges by their source-target pair to prevent React key warnings
    const uniqueEdges = useMemo(() => {
        const seen = new Set<string>();
        return data.knowledge_graph.edges.filter(edge => {
            // Create a normalized key (sorted to handle bidirectional edges)
            const key = [edge.source, edge.target].sort().join('-');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [data.knowledge_graph.edges]);

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

            {/* Edges (clickable) - using deduplicated edges */}
            {uniqueEdges.map((edge, idx) => {
                const startPos = nodePositions.get(edge.source);
                const endPos = nodePositions.get(edge.target);
                const sourceNode = nodeMap.get(edge.source);
                const targetNode = nodeMap.get(edge.target);

                if (!startPos || !endPos || !sourceNode || !targetNode) return null;

                return (
                    <ClickableEdge
                        key={`${edge.id}-${idx}`}
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
    const [centralNode, setCentralNode] = useState<string>(pathology); // Current center

    // Edge selection for explanation modal
    const [selectedEdge, setSelectedEdge] = useState<RingEdge | null>(null);
    const [selectedEdgeSource, setSelectedEdgeSource] = useState<RingNode | null>(null);
    const [selectedEdgeTarget, setSelectedEdgeTarget] = useState<RingNode | null>(null);
    const [multiNodesForAnalysis, setMultiNodesForAnalysis] = useState<RingNode[]>([]);
    const [showLinkModal, setShowLinkModal] = useState(false);

    const animationRef = useRef<number>();
    const startTimeRef = useRef<number>(0);
    const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);

    // Check WebGL on mount
    useEffect(() => {
        setWebglAvailable(isWebGLAvailable());
    }, []);

    useEffect(() => {
        if (isOpen && pathology) {
            setCentralNode(pathology);
            fetchData(pathology);
        }
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

    const fetchData = async (centralPathology: string) => {
        setIsLoading(true);
        setError(null);
        setData(null);
        setAnimationTime(0);
        startTimeRef.current = 0;

        try {
            // Use deep-research-graph with Claude Opus for comprehensive research
            const response = await supabase.functions.invoke('deep-research-graph', {
                body: {
                    topic: centralPathology,
                    max_nodes: 100,
                    include_pubmed: true,
                    include_fda: true
                }
            });

            if (response.error) throw response.error;

            const result = response.data;
            console.log('[DEEP-RESEARCH] Result:', result);

            // Transform deep-research-graph response to RadialRingsData format
            // Map node types to rings for visual grouping
            const typeToRing: Record<string, number> = {
                'PATHOLOGY': 0,    // Center
                'DRUG': 1,         // Inner ring
                'SYMPTOM': 2,      // Second ring
                'COMPLICATION': 2, // Second ring
                'LAB': 3,          // Third ring
                'LIFESTYLE': 3,    // Third ring
                'GUIDELINE': 4,    // Outer ring
                'EVIDENCE': 4      // Outer ring
            };

            const transformedNodes: RingNode[] = result.nodes.map((node: any, index: number) => ({
                id: node.id,
                ring: typeToRing[node.node_type] ?? 2,
                lane: node.node_type?.toLowerCase() || 'unknown',
                name: node.label,
                node_type: node.node_type,
                properties: { description: node.description, source: node.source },
                proximity_score: node.weight || 0.7,
                evidence_grade: node.weight > 0.8 ? 'A' : node.weight > 0.5 ? 'B' : 'C',
                translation_gap: false,
                category_id: node.category_id,
                subcategory: node.subcategory,
                tags: node.tags
            }));

            const transformedEdges: RingEdge[] = result.edges.map((edge: any) => ({
                id: `${edge.source_id}-${edge.target_id}`,
                source: edge.source_id,
                target: edge.target_id,
                relationship: edge.edge_type,
                weight: edge.weight || 0.5,
                evidence_grade: edge.weight > 0.8 ? 'A' : edge.weight > 0.5 ? 'B' : 'C',
                translation_gap: false
            }));

            setData({
                knowledge_graph: { nodes: transformedNodes, edges: transformedEdges },
                micro_signals: [],
                hypotheses: []
            });

        } catch (err) {
            console.error('[DEEP-RESEARCH] Error:', err);
            setError(String(err));
        } finally {
            setIsLoading(false);
        }
    };

    // Expand graph progressively from a node (MIND MAP BEHAVIOR)
    // Uses deep-research-graph for comprehensive expansion with progressive animation
    const [isExpanding, setIsExpanding] = useState(false);
    const [expandingNodeName, setExpandingNodeName] = useState<string | null>(null);
    const [newlySpawnedNodes, setNewlySpawnedNodes] = useState<Set<string>>(new Set());

    const handleSetCentral = async (nodeId: string) => {
        if (!data) return;
        const node = data.knowledge_graph.nodes.find(n => n.id === nodeId);
        if (!node) return;

        setIsExpanding(true);
        setExpandingNodeName(node.name);
        // NOTE: Do NOT set isLoading here - we want to keep the graph visible during expansion

        try {
            // Call deep-research-graph for comprehensive expansion
            const response = await supabase.functions.invoke('deep-research-graph', {
                body: {
                    topic: node.name,
                    max_nodes: 100,
                    include_pubmed: true,
                    include_fda: true
                }
            });

            if (response.error) throw response.error;

            const result = response.data;
            console.log('[EXPAND] Deep research result:', result);

            // Map node types to rings
            const typeToRing: Record<string, number> = {
                'PATHOLOGY': 0,
                'DRUG': 1,
                'SYMPTOM': 2,
                'COMPLICATION': 2,
                'LAB': 3,
                'LIFESTYLE': 3,
                'GUIDELINE': 4,
                'EVIDENCE': 4
            };

            // Transform new nodes
            const newNodes: RingNode[] = result.nodes.map((n: any) => ({
                id: n.id,
                ring: typeToRing[n.node_type] ?? 2,
                lane: n.node_type?.toLowerCase() || 'unknown',
                name: n.label,
                node_type: n.node_type,
                properties: { description: n.description, source: n.source },
                proximity_score: n.weight || 0.7,
                evidence_grade: n.weight > 0.8 ? 'A' : n.weight > 0.5 ? 'B' : 'C',
                translation_gap: false
            }));

            // Transform new edges
            const newEdges: RingEdge[] = result.edges.map((e: any) => ({
                id: `${e.source_id}-${e.target_id}`,
                source: e.source_id,
                target: e.target_id,
                relationship: e.edge_type,
                weight: e.weight || 0.5,
                evidence_grade: e.weight > 0.8 ? 'A' : e.weight > 0.5 ? 'B' : 'C',
                translation_gap: false
            }));

            // Merge with existing nodes, avoiding duplicates
            const existingNodeNames = new Set(data.knowledge_graph.nodes.map(n => n.name.toLowerCase()));
            const nodesToAdd = newNodes.filter(n => !existingNodeNames.has(n.name.toLowerCase()));

            // Add nodes progressively with COSMIC STREAMING animation
            let currentNodes = [...data.knowledge_graph.nodes];
            let currentEdges = [...data.knowledge_graph.edges];

            // Clear any previous spawn markers
            setNewlySpawnedNodes(new Set());

            // Add nodes one by one with visible streaming delay
            for (let i = 0; i < nodesToAdd.length; i++) {
                const newNode = nodesToAdd[i];
                currentNodes = [...currentNodes, newNode];

                // Mark this node as newly spawned for cosmic animation
                setNewlySpawnedNodes(prev => new Set([...prev, newNode.id]));

                // CREATE EDGE FROM SOURCE NODE TO NEW NODE
                // This ensures all expanded nodes are connected to the source
                const sourceToNewEdge: RingEdge = {
                    id: `${nodeId}-${newNode.id}`,
                    source: nodeId,
                    target: newNode.id,
                    relationship: 'RELATED_TO',
                    weight: 0.7,
                    evidence_grade: 'B',
                    translation_gap: false
                };

                // Check if this edge doesn't already exist
                if (!currentEdges.some(e => e.id === sourceToNewEdge.id ||
                    (e.source === nodeId && e.target === newNode.id) ||
                    (e.source === newNode.id && e.target === nodeId))) {
                    currentEdges = [...currentEdges, sourceToNewEdge];
                }

                // Also add any edges from backend that now have both endpoints
                const currentNodeIds = new Set(currentNodes.map(n => n.id));
                const relevantEdges = newEdges.filter(e =>
                    currentNodeIds.has(e.source) &&
                    currentNodeIds.has(e.target) &&
                    !currentEdges.some(ce => ce.id === e.id)
                );
                currentEdges = [...currentEdges, ...relevantEdges];

                // Update state to trigger re-render (progressive appearance)
                setData({
                    ...data,
                    knowledge_graph: { nodes: currentNodes, edges: currentEdges }
                });

                // STREAMING DELAY: 120ms per node for visible cosmic spawn effect
                if (i < nodesToAdd.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 120));
                }
            }

            // Clear spawn markers after 2 seconds (cosmic glow fades)
            setTimeout(() => {
                setNewlySpawnedNodes(new Set());
            }, 2000);

            // Update central node display
            setCentralNode(node.name);
            console.log(`[EXPAND] Added ${nodesToAdd.length} nodes with cosmic streaming`);

        } catch (err) {
            console.error('[EXPAND] Error:', err);
            // Fallback to full reload if expansion fails
            setCentralNode(node.name);
            await fetchData(node.name);
        } finally {
            setIsLoading(false);
            setIsExpanding(false);
            setExpandingNodeName(null);
        }
    };

    const handleEdgeSelect = (edge: RingEdge | null, source: RingNode | null, target: RingNode | null, multiNodes?: RingNode[]) => {
        setSelectedEdge(edge);
        setSelectedEdgeSource(source);
        setSelectedEdgeTarget(target);
        setMultiNodesForAnalysis(multiNodes || []);
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
                            🕸️ Mind Map Sémantique
                        </h2>
                        <p className="text-purple-400 text-sm mt-1">{centralNode}</p>
                        {data && (() => {
                            // Calculate unique counts matching SVGFallback deduplication
                            const seenNodeIds = new Set<string>();
                            const uniqueNodeCount = data.knowledge_graph.nodes.filter(n => {
                                if (seenNodeIds.has(n.id)) return false;
                                seenNodeIds.add(n.id);
                                return true;
                            }).length;

                            const seenEdgeKeys = new Set<string>();
                            const uniqueEdgeCount = data.knowledge_graph.edges.filter(e => {
                                const key = [e.source, e.target].sort().join('-');
                                if (seenEdgeKeys.has(key)) return false;
                                seenEdgeKeys.add(key);
                                return true;
                            }).length;

                            return (
                                <div className="flex gap-3 mt-2 text-xs">
                                    <span className="text-green-400">{uniqueNodeCount} nœuds</span>
                                    <span className="text-blue-400">{uniqueEdgeCount} liens</span>
                                </div>
                            );
                        })()}
                        <div className="text-gray-500 text-xs mt-2 space-y-0.5">
                            <p>🖱️ <span className="text-gray-400">1 clic</span> = sélectionner + voir connexions</p>
                            <p>🖱️ <span className="text-gray-400">2ème clic</span> = analyse IA du lien</p>
                            <p>🖱️ <span className="text-gray-400">Double-clic</span> = ajouter des nœuds liés</p>
                        </div>
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

                {/* Semantic Legend */}
                <div className="absolute top-28 right-4 z-20 bg-gray-900/90 rounded-xl border border-gray-700/50 p-3 text-xs max-w-[200px]">
                    {/* Node Types */}
                    <div className="mb-2">
                        <div className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">Types de nœuds</div>
                        {[
                            { type: 'PATHOLOGY', label: 'Pathologie', color: NODE_TYPE_COLORS.PATHOLOGY },
                            { type: 'DRUG', label: 'Médicament', color: NODE_TYPE_COLORS.DRUG },
                            { type: 'SYMPTOM', label: 'Symptôme', color: NODE_TYPE_COLORS.SYMPTOM },
                            { type: 'COMPLICATION', label: 'Complication', color: NODE_TYPE_COLORS.COMPLICATION },
                        ].map(({ type, label, color }) => (
                            <div key={type} className="flex items-center gap-2 mb-0.5">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                                <span className="text-gray-400">{label}</span>
                            </div>
                        ))}
                    </div>

                    {/* Edge Types */}
                    <div className="border-t border-gray-700/50 pt-2">
                        <div className="text-gray-500 uppercase tracking-wider text-[10px] mb-1">Relations</div>
                        {[
                            { type: 'TREATS', label: 'Traite', color: EDGE_TYPE_COLORS.TREATS.color },
                            { type: 'INTERACTS_WITH', label: 'Interaction', color: '#f97316' },
                            { type: 'CONTRAINDICATED_IF', label: 'Contre-indiqué', color: EDGE_TYPE_COLORS.CONTRAINDICATED_IF.color },
                            { type: 'COMPLICATES', label: 'Complique', color: EDGE_TYPE_COLORS.COMPLICATES.color },
                            { type: 'ASSOCIATED_WITH', label: 'Associé à', color: EDGE_TYPE_COLORS.ASSOCIATED_WITH.color },
                        ].map(({ type, label, color }) => (
                            <div key={type} className="flex items-center gap-2 mb-0.5">
                                <div className="w-4 h-0.5" style={{ backgroundColor: color }} />
                                <span className="text-gray-400">{label}</span>
                            </div>
                        ))}
                    </div>
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

                {/* Expansion overlay - shows on top of graph during node addition */}
                {isExpanding && (
                    <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-40 bg-gray-900/90 backdrop-blur-sm rounded-full px-6 py-3 border border-purple-500/50 shadow-xl">
                        <div className="flex items-center gap-3">
                            <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />
                            <span className="text-white text-sm">Expansion depuis <span className="text-purple-400 font-medium">{expandingNodeName}</span>...</span>
                        </div>
                    </div>
                )}
                {/* Error */}
                {error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-30">
                        <div className="bg-red-900/50 border border-red-500 rounded-xl p-8 text-center">
                            <p className="text-red-400">Erreur: {error}</p>
                            <button onClick={() => fetchData(pathology)} className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg">Réessayer</button>
                        </div>
                    </div>
                )}

                {/* Show graph when: not initial loading, no error, has data, OR during expansion */}
                {((!isLoading && !error && data) || (isExpanding && data)) && (
                    <SVGFallback
                        data={data}
                        animationTime={animationTime}
                        onEdgeClick={handleEdgeSelect}
                        onSetCentral={handleSetCentral}
                        newlySpawnedNodes={newlySpawnedNodes}
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
                multiNodes={multiNodesForAnalysis}
                pathology={pathology}
                onSetCentral={handleSetCentral}
            />
        </div>
    );
}
