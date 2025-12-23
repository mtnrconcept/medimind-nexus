// ============================================
// RADIAL RINGS 3D - TOP-DOWN VIEW WITH CLICKABLE LINKS
// ============================================
// Smooth nodes with enhanced glow, clickable links for AI explanation

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { X, Play, Pause, RotateCcw, Sparkles, Loader2, MessageSquare, ExternalLink, Plus, GitBranch, Search, Save, MousePointer2, Lasso, Circle as CircleIcon, Square } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { RingNode, RingEdge, MicroSignal, RadialRingsData } from '@/types/graph';
import { RING_COLORS, LANE_COLORS, NODE_TYPE_COLORS, EDGE_TYPE_COLORS, TIMING } from '@/config/graphSemantics';
import { isWebGLAvailable, getSemanticEdgeColor, isNodeType, transformNode, transformEdge, getEdgeKey, dedupeEdges } from '@/utils/graphUtils';

// ============================================
// TYPES
// ============================================

// Types imported from @/types/graph

// ============================================
// COLORS
// ============================================

// Semantic Colors imported from @/config/graphSemantics

// ============================================
// TIMING (ms converted to seconds in components)
// ============================================

// Timing imported from @/config/graphSemantics

// ============================================
// WEBGL CHECK (comprehensive - tests shader compilation)
// ============================================

// WebGL Check imported from @/utils/graphUtils

// ============================================
// 2D SVG FALLBACK VISUALIZATION
// ============================================

// ============================================
// MATRIX BACKGROUND - Canvas-based Matrix Rain Effect
// ============================================

function MatrixBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Set canvas size to container size
        const updateSize = () => {
            const parent = canvas.parentElement;
            if (parent) {
                canvas.width = parent.clientWidth;
                canvas.height = parent.clientHeight;
            }
        };
        updateSize();

        // Character sets
        const katakana = 'アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン';
        const latin = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const nums = '0123456789';
        const alphabet = katakana + latin + nums;

        const fontSize = 16;
        let columns = Math.floor(canvas.width / fontSize);

        // Initialize rain drops - each column starts at different position
        const rainDrops: number[] = [];
        for (let x = 0; x < columns; x++) {
            rainDrops[x] = Math.random() * -100; // Start above the screen at random positions
        }

        let animationFrameId: number;

        const draw = () => {
            // Fade effect - creates the trail
            context.fillStyle = 'rgba(0, 0, 0, 0.05)';
            context.fillRect(0, 0, canvas.width, canvas.height);

            // Cyan/green gradient for cyberpunk feel
            context.font = `${fontSize}px monospace`;

            for (let i = 0; i < rainDrops.length; i++) {
                // Random character
                const text = alphabet.charAt(Math.floor(Math.random() * alphabet.length));

                // Position
                const x = i * fontSize;
                const y = rainDrops[i] * fontSize;

                // Color gradient - brighter at the head, fading tail
                const brightness = Math.max(0, Math.min(1, (canvas.height - y) / canvas.height));
                if (y < fontSize * 2) {
                    // Head of the drop - bright cyan/white
                    context.fillStyle = '#22d3ee';
                } else if (y < fontSize * 5) {
                    // Near head - cyan
                    context.fillStyle = '#06b6d4';
                } else {
                    // Body - darker green/cyan
                    context.fillStyle = `rgba(14, 116, 144, ${0.3 + brightness * 0.5})`;
                }

                context.fillText(text, x, y);

                // Reset drop to top when it reaches bottom
                if (y > canvas.height && Math.random() > 0.975) {
                    rainDrops[i] = 0;
                }
                rainDrops[i]++;
            }
        };

        // Animation loop using setInterval for consistent speed
        const intervalId = setInterval(draw, 30);

        // Handle resize
        const handleResize = () => {
            updateSize();
            // Recalculate columns and reinitialize drops
            columns = Math.floor(canvas.width / fontSize);
            rainDrops.length = 0;
            for (let x = 0; x < columns; x++) {
                rainDrops[x] = Math.random() * -100;
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('resize', handleResize);
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 pointer-events-none"
            style={{ opacity: 0.4 }}
        />
    );
}

// ============================================
// LOADING PROGRESS BAR - Futuristic animated progress with step descriptions
// ============================================

const LOADING_STEPS = [
    { label: "Connexion à l'API Claude", icon: "🔌", duration: 1500 },
    { label: "Analyse sémantique de la pathologie", icon: "🧠", duration: 2000 },
    { label: "Extraction des entités médicales", icon: "🔬", duration: 2500 },
    { label: "Identification des médicaments associés", icon: "💊", duration: 2000 },
    { label: "Recherche des symptômes corrélés", icon: "🩺", duration: 1800 },
    { label: "Analyse des interactions médicamenteuses", icon: "⚠️", duration: 2200 },
    { label: "Détection des contre-indications", icon: "🚫", duration: 1500 },
    { label: "Construction des liens sémantiques", icon: "🔗", duration: 2000 },
    { label: "Calcul des scores de pertinence", icon: "📊", duration: 1800 },
    { label: "Optimisation de la topologie du graphe", icon: "🌐", duration: 2000 },
    { label: "Génération des positions des nœuds", icon: "📍", duration: 1500 },
    { label: "Finalisation du Knowledge Graph", icon: "✨", duration: 1000 },
];

function LoadingProgressBar() {
    const [currentStep, setCurrentStep] = useState(0);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        // Progress animation - smooth continuous progress
        const progressInterval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) return 100;
                // Slow down as we approach 100%
                const increment = prev < 70 ? 1.5 : prev < 90 ? 0.8 : 0.3;
                return Math.min(100, prev + increment);
            });
        }, 100);

        // Step cycling - change step every 2-3 seconds
        const stepInterval = setInterval(() => {
            setCurrentStep(prev => (prev + 1) % LOADING_STEPS.length);
        }, 1500);

        return () => {
            clearInterval(progressInterval);
            clearInterval(stepInterval);
        };
    }, []);

    const step = LOADING_STEPS[currentStep];

    return (
        <div className="absolute bottom-[-80px] left-1/2 transform -translate-x-1/2 w-[320px]">
            {/* Title */}
            <p className="text-purple-400 font-medium tracking-wider text-center mb-3 animate-pulse">
                Construction du Knowledge Graph
            </p>

            {/* Futuristic Progress Bar Container */}
            <div className="relative">
                {/* Background track */}
                <div className="h-2 bg-gray-800/80 rounded-full overflow-hidden border border-cyan-500/20">
                    {/* Animated gradient background */}
                    <div
                        className="absolute inset-0 opacity-30"
                        style={{
                            background: 'linear-gradient(90deg, transparent 0%, rgba(6, 182, 212, 0.3) 50%, transparent 100%)',
                            animation: 'shimmer 2s infinite linear',
                            backgroundSize: '200% 100%'
                        }}
                    />

                    {/* Main progress fill */}
                    <div
                        className="h-full rounded-full relative overflow-hidden transition-all duration-300 ease-out"
                        style={{
                            width: `${progress}%`,
                            background: 'linear-gradient(90deg, #06b6d4 0%, #a855f7 50%, #22d3ee 100%)',
                            boxShadow: '0 0 20px rgba(6, 182, 212, 0.5), 0 0 40px rgba(168, 85, 247, 0.3)'
                        }}
                    >
                        {/* Glowing pulse effect on the progress bar */}
                        <div
                            className="absolute inset-0"
                            style={{
                                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                                animation: 'progressPulse 1.5s infinite'
                            }}
                        />
                    </div>

                    {/* Leading edge glow */}
                    <div
                        className="absolute top-0 h-full w-4 rounded-full"
                        style={{
                            left: `calc(${progress}% - 8px)`,
                            background: 'radial-gradient(circle, rgba(34, 211, 238, 0.8) 0%, transparent 70%)',
                            filter: 'blur(2px)',
                            transition: 'left 0.3s ease-out'
                        }}
                    />
                </div>

                {/* Percentage indicator */}
                <div className="absolute -right-12 top-1/2 -translate-y-1/2 text-cyan-400 font-mono text-xs font-bold">
                    {Math.round(progress)}%
                </div>
            </div>

            {/* Step description */}
            <div className="mt-3 flex items-center justify-center gap-2 h-6">
                <span className="text-lg" style={{ animation: 'bounce 1s infinite' }}>
                    {step.icon}
                </span>
                <p
                    className="text-cyan-400/80 text-sm font-mono"
                    style={{
                        animation: 'fadeInOut 2.5s infinite',
                        textShadow: '0 0 10px rgba(6, 182, 212, 0.5)'
                    }}
                >
                    {step.label}
                </p>
            </div>

            {/* Step counter */}
            <div className="mt-2 flex justify-center gap-1">
                {LOADING_STEPS.map((_, i) => (
                    <div
                        key={i}
                        className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === currentStep
                            ? 'bg-cyan-400 scale-125 shadow-lg shadow-cyan-400/50'
                            : i < currentStep
                                ? 'bg-purple-500/60'
                                : 'bg-gray-600/40'
                            }`}
                    />
                ))}
            </div>

            {/* CSS Animations */}
            <style>{`
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                @keyframes progressPulse {
                    0%, 100% { opacity: 0.3; transform: translateX(-100%); }
                    50% { opacity: 0.8; transform: translateX(100%); }
                }
                @keyframes fadeInOut {
                    0%, 100% { opacity: 0.6; }
                    50% { opacity: 1; }
                }
                @keyframes bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-3px); }
                }
            `}</style>
        </div>
    );
}

interface SVGFallbackProps {
    data: RadialRingsData;
    animationTime: number;
    onEdgeClick: (edge: RingEdge, source: RingNode, target: RingNode, multiNodes?: RingNode[]) => void;
    onSetCentral?: (nodeId: string) => void;
    newlySpawnedNodes?: Set<string>;
    edgeFilterMode?: 'all' | 'central-only' | 'selected-only';
    centralNodeId?: string | null;
    filterSelectedNodeId?: string | null;
    focusMode?: boolean;
    activePathologies?: Set<string>; // Comorbidity filter: which pathologies to show
    visibleNodeCount?: number; // Progressive reveal: how many nodes to show
    nodeSpacing?: number; // Density control (default 40)
    nodeSize?: number; // Size scale (default 1.0)
    hiddenNodeTypes?: Set<string>; // Types to hide
    hiddenRelationTypes?: Set<string>; // Relation types to hide
    hiddenNodes?: Set<string>; // Individual nodes to hide (from chat commands)
    getNodeTypes?: (category: string) => string[]; // Helper to map UI categories to node types
    // Node grouping props
    nodeGroups?: Map<string, Set<string>>; // centerNodeId -> member node IDs
    groupCreationMode?: boolean;
    currentGroupCenter?: string | null;
    onAddToGroup?: (nodeId: string) => void;
    onStartGroupCreation?: (nodeId: string) => void;
    onFinishGroupCreation?: () => void;
    onDissolveGroup?: (centerId: string) => void;
    // Custom positions for programmatic node repositioning (from chat commands)
    customNodePositions?: Map<string, { x: number, y: number }>;
    // Deep Analysis mode - golden highlighting for optimal treatment nodes
    deepAnalysisMode?: boolean;
    goldenNodeIds?: Set<string>;
    onSaveGraph?: (graphData: any) => void;
}

function SVGFallback({ data, animationTime, onEdgeClick, onSetCentral, newlySpawnedNodes, edgeFilterMode = 'all', centralNodeId, filterSelectedNodeId, focusMode = true, activePathologies, visibleNodeCount = Infinity, nodeSpacing = 40, nodeSize: sizeScale = 1.0, hiddenNodeTypes = new Set(), hiddenRelationTypes = new Set(), hiddenNodes = new Set(), getNodeTypes = () => [], nodeGroups = new Map(), groupCreationMode = false, currentGroupCenter = null, onAddToGroup, onStartGroupCreation, onFinishGroupCreation, onDissolveGroup, customNodePositions = new Map(), deepAnalysisMode = false, goldenNodeIds = new Set(), onSaveGraph }: SVGFallbackProps) {
    // Dragging state for center nodes (Hoisted)
    const [dragOffsets, setDragOffsets] = useState<Map<string, { x: number, y: number }>>(new Map());
    const [draggingNode, setDraggingNode] = useState<string | null>(null);

    // Layout Mode State
    type LayoutMode = 'radial' | 'grid' | 'hierarchical' | 'organic';
    const [layoutMode, setLayoutMode] = useState<LayoutMode>('radial');

    // Layout Parameters State
    const [layoutParams, setLayoutParams] = useState({
        gridCols: 0, // 0 = Auto
        nodeSpacing: nodeSpacing, // Base spacing (default from prop)
        levelHeight: 180, // Hierarchical level height
        organicStrength: 350 // Organic spread distance
    });

    // State to ignore chat-based custom positions (Reset feature)
    const [ignoreCustomPositions, setIgnoreCustomPositions] = useState(false);
    const [showLayoutSettings, setShowLayoutSettings] = useState(false);

    // Graph Explorer State
    const [showExplorer, setShowExplorer] = useState(false);
    const [localHiddenTypes, setLocalHiddenTypes] = useState<Set<string>>(new Set());
    const [userHiddenNodes, setUserHiddenNodes] = useState<Set<string>>(new Set());
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

    // Save Graph State
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveGraphName, setSaveGraphName] = useState('');
    const [saveDescription, setSaveDescription] = useState('');

    const handleSaveConfirm = () => {
        if (!onSaveGraph) return;

        // Construct view state
        const viewState = {
            layoutMode,
            layoutParams,
            hiddenNodeTypes: Array.from(hiddenNodeTypes),
            hiddenRelationTypes: Array.from(hiddenRelationTypes),
            hiddenNodes: Array.from(hiddenNodes),
            centralNodeId,
            customNodePositions: Object.fromEntries(customNodePositions),
            localHiddenTypes: Array.from(localHiddenTypes),
            userHiddenNodes: Array.from(userHiddenNodes),
            collapsedCategories: Array.from(collapsedCategories),
            nodeSpacing,
            nodeSize: sizeScale
        };

        const payload = {
            name: saveGraphName,
            description: saveDescription,
            graph_data: data.knowledge_graph, // Only save the graph structure
            view_state: viewState
        };

        onSaveGraph(payload);
        setShowSaveModal(false);
        setSaveGraphName('');
        setSaveDescription('');
    };

    // Track if actual dragging occurred (to distinguish from click)
    const didDragRef = useRef(false);

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

    // Edge hover state for tooltip
    const [hoveredEdge, setHoveredEdge] = useState<{
        edge: RingEdge;
        sourceNode: RingNode;
        targetNode: RingNode;
        x: number;
        y: number;
    } | null>(null);

    // Animation state
    const [animationProgress, setAnimationProgress] = useState(0);

    // NODE ACTION MODAL state
    const [showNodeActionModal, setShowNodeActionModal] = useState(false);
    const [actionNode, setActionNode] = useState<RingNode | null>(null);
    const [multiSelectMode, setMultiSelectMode] = useState(false);
    const [selectedNodesForAnalysis, setSelectedNodesForAnalysis] = useState<Set<string>>(new Set());

    // Selection Tool State
    // type SelectionMode = 'cursor' | 'lasso' | 'circle' | 'rectangle'; // Defined in state generic
    const [selectionMode, setSelectionMode] = useState<'cursor' | 'lasso' | 'circle' | 'rectangle'>('cursor');
    const [multiSelectedNodeIds, setMultiSelectedNodeIds] = useState<Set<string>>(new Set());
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionPoints, setSelectionPoints] = useState<{ x: number, y: number }[]>([]);
    const selectionStartRef = useRef<{ x: number, y: number } | null>(null);

    // Sync external selection (from search) to trigger click behavior (Modal, etc.)
    useEffect(() => {
        if (filterSelectedNodeId && data) {
            const node = data.knowledge_graph.nodes.find(n => n.id === filterSelectedNodeId);
            if (node) {
                setActionNode(node);
                setShowNodeActionModal(true);
                setSelectedNodeId(node.id); // Sync local state
            }
        }
    }, [filterSelectedNodeId, data]);


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

    // Handle drag/pan state
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // If we are already dragging a node (set via onMouseDown on the node itself), don't pan
        if (draggingNode) return;

        if (e.button === 0 && !e.ctrlKey) { // Left click without Ctrl
            // NEW: Handle Selection Mode
            if (selectionMode !== 'cursor') {
                const rect = containerRef.current?.getBoundingClientRect();
                if (rect) {
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    selectionStartRef.current = { x, y };
                    setSelectionPoints([{ x, y }]);
                    setIsSelecting(true);

                    // Clear Previous if shift not held (Standard behavior)
                    if (!e.shiftKey) {
                        setMultiSelectedNodeIds(new Set());
                    }
                }
                return;
            }

            setIsPanning(true);
            setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
    }, [pan, draggingNode, selectionMode]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        // 1. Handle Node Dragging
        if (draggingNode) {
            e.preventDefault();
            e.stopPropagation();

            // Calculate new offset in SVG coordinates
            // We need to map screen delta to SVG delta (considering zoom)
            const rect = containerRef.current?.getBoundingClientRect();
            if (!rect) return;

            // Calculate delta
            const deltaX = e.movementX / zoom;
            const deltaY = e.movementY / zoom;

            // Mark that actual dragging occurred (to prevent click triggering)
            if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
                didDragRef.current = true;
            }

            setDragOffsets(prev => {
                const newMap = new Map(prev);

                // Apply delta to the dragged node
                const current = prev.get(draggingNode) || { x: 0, y: 0 };
                newMap.set(draggingNode, {
                    x: current.x + deltaX,
                    y: current.y + deltaY
                });

                // If this node is a group center, also move all group members
                if (nodeGroups.has(draggingNode)) {
                    const members = nodeGroups.get(draggingNode)!;
                    members.forEach(memberId => {
                        const memberCurrent = prev.get(memberId) || { x: 0, y: 0 };
                        newMap.set(memberId, {
                            x: memberCurrent.x + deltaX,
                            y: memberCurrent.y + deltaY
                        });
                    });
                }

                return newMap;
            });
            return;
        }

        // 2. Handle Selection Drawing
        if (isSelecting) {
            const rect = containerRef.current?.getBoundingClientRect();
            if (rect) {
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                setSelectionPoints(prev => [...prev, { x, y }]);
            }
            return;
        }

        // 3. Handle Canvas Panning
        if (isPanning) {
            setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
        }
    }, [isPanning, panStart, draggingNode, zoom, nodeGroups, isSelecting]);

    const handleMouseUp = useCallback((e: React.MouseEvent | MouseEvent | any) => {
        // Handle explicit event passing or fallback
        const shiftKey = e?.shiftKey ?? false;

        if (isSelecting) {
            // FINISH SELECTION
            setIsSelecting(false);
            setSelectionPoints([]); // Clear visual path

            const container = containerRef.current;
            if (!container) return;
            const rect = container.getBoundingClientRect();

            // Calculate selection bounds/shape in SCREEN space relative to container
            let selectedIds = new Set<string>();

            // Helper: Convert Graph Space (x,y) to Screen Space (relative to container)
            const toScreen = (gx: number, gy: number) => ({
                x: gx * zoom + pan.x + center,
                y: gy * zoom + pan.y + center
            });

            const start = selectionStartRef.current || { x: 0, y: 0 };
            const end = selectionPoints.length > 0 ? selectionPoints[selectionPoints.length - 1] : start;

            nodePositions.forEach((pos, nodeId) => {
                // Check if node is visible/not hidden
                if (hiddenNodes.has(nodeId)) return;

                const screenPos = toScreen(pos.x, pos.y);
                let isInside = false;

                if (selectionMode === 'rectangle') {
                    const minX = Math.min(start.x, end.x);
                    const maxX = Math.max(start.x, end.x);
                    const minY = Math.min(start.y, end.y);
                    const maxY = Math.max(start.y, end.y);
                    isInside = screenPos.x >= minX && screenPos.x <= maxX &&
                        screenPos.y >= minY && screenPos.y <= maxY;
                }
                else if (selectionMode === 'circle') {
                    const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
                    const dist = Math.sqrt(Math.pow(screenPos.x - start.x, 2) + Math.pow(screenPos.y - start.y, 2));
                    isInside = dist <= radius;
                }
                else if (selectionMode === 'lasso' && selectionPoints.length > 2) {
                    // Ray casting algorithm for point in polygon
                    let inside = false;
                    for (let i = 0, j = selectionPoints.length - 1; i < selectionPoints.length; j = i++) {
                        const xi = selectionPoints[i].x, yi = selectionPoints[i].y;
                        const xj = selectionPoints[j].x, yj = selectionPoints[j].y;

                        const intersect = ((yi > screenPos.y) !== (yj > screenPos.y))
                            && (screenPos.x < (xj - xi) * (screenPos.y - yi) / (yj - yi) + xi);
                        if (intersect) inside = !inside;
                    }
                    isInside = inside;
                }

                if (isInside) {
                    selectedIds.add(nodeId);
                }
            });

            // Update selection state
            if (shiftKey) {
                // Add to existing
                setMultiSelectedNodeIds(prev => {
                    const next = new Set(prev);
                    selectedIds.forEach(id => next.add(id));
                    return next;
                });
            } else {
                // Replace
                setMultiSelectedNodeIds(selectedIds);
            }

            // If we selected only one, also set the main selectedNodeId for details
            if (selectedIds.size === 1) {
                const id = Array.from(selectedIds)[0];
                setSelectedNodeId(id);
            }

            return;
        }

        setIsPanning(false);
        setDraggingNode(null); // Stop dragging node
    }, [isSelecting, selectionPoints, selectionMode, zoom, pan, nodePositions, hiddenNodes]);

    // Calculate node positions - NON-OVERLAPPING RADIAL LAYOUT
    // Dynamic ring sizing based on node count to prevent overlaps
    // Positions are ALWAYS recalculated to allow dynamic ring expansion when new nodes arrive
    const { nodePositions, ringRadii, uniqueNodes, idRedirects } = useMemo(() => {
        const positions = new Map<string, { x: number; y: number }>();
        const radii = new Map<number, number>(); // Store calculated radius for each ring
        const idRedirects = new Map<string, string>(); // Map dropped IDs to kept IDs

        // 1. ADVANCED DEDUPLICATION
        // Prioritize Center nodes (ring 0) and nodes with more data
        const sortedNodes = [...data.knowledge_graph.nodes].sort((a, b) => {
            // Priority 1: Ring 0 (Centers)
            if (a.ring === 0 && b.ring !== 0) return -1;
            if (b.ring === 0 && a.ring !== 0) return 1;
            // Priority 2: Detail length (heuristic for quality)
            return (b.properties?.description?.length || 0) - (a.properties?.description?.length || 0);
        });

        const seenIds = new Set<string>();
        const seenNames = new Map<string, string>(); // Name -> ID

        const deduplicatedNodes = sortedNodes.filter(node => {
            // 1. Check ID collision
            if (seenIds.has(node.id)) return false;

            // 2. Check Name collision (Semantic duplicate)
            const normalizedName = node.name.toLowerCase().trim();
            if (seenNames.has(normalizedName)) {
                // Duplicate found! Map this node's ID to the existing one
                const keptId = seenNames.get(normalizedName)!;
                idRedirects.set(node.id, keptId);
                return false;
            }

            seenIds.add(node.id);
            seenNames.set(normalizedName, node.id);
            return true;
        });

        // Filter by active pathologies (comorbidity mode)
        let filteredNodes = activePathologies && activePathologies.size > 0
            ? deduplicatedNodes.filter(node => {
                // Always show nodes without parent_pathology, or nodes whose parent is active
                if (!node.parent_pathology) return true;
                return activePathologies.has(node.parent_pathology);
            })
            : deduplicatedNodes;

        // Filter by hidden node types (checkbox filters)
        // NEVER filter out central nodes (ring 0) to keep the graph connected
        // Filter by hidden node types (checkbox filters + explorer types)
        // NEVER filter out central nodes (ring 0) to keep the graph connected
        if ((hiddenNodeTypes && hiddenNodeTypes.size > 0) || localHiddenTypes.size > 0) {
            filteredNodes = filteredNodes.filter(node => {
                // Always keep central nodes
                if (node.ring === 0) return true;
                const nodeType = node.node_type?.toUpperCase() || '';

                // Check local types (exact match from Explorer)
                if (localHiddenTypes.has(nodeType)) return false;

                // Check prop hidden types (categories)
                if (hiddenNodeTypes && hiddenNodeTypes.size > 0) {
                    for (const category of hiddenNodeTypes) {
                        const typesInCategory = getNodeTypes(category);
                        if (typesInCategory.some(t => t === nodeType)) {
                            return false; // This node's type is hidden
                        }
                    }
                }
                return true;
            });
        }

        // Filter by individual hidden nodes (from Explorer)
        if (userHiddenNodes.size > 0) {
            filteredNodes = filteredNodes.filter(node => !userHiddenNodes.has(node.id));
        }

        // Progressive reveal: only show nodes up to visibleNodeCount
        const nodes = filteredNodes.slice(0, visibleNodeCount);

        // Find ALL center nodes (ring 0) - Support for dual/multi pathologies
        // DUAL/MULTI GRAPH LAYOUT: Twin Graph Logic
        const centerNodes = nodes.filter(n => n.ring === 0);
        const peripheralNodes = nodes.filter(n => n.ring !== 0);
        const isMultiGraph = centerNodes.length > 1;
        const foci = new Map<string, { x: number, y: number }>();
        const defaultCenter = { x: center, y: center };

        if (layoutMode === 'radial') {
            if (isMultiGraph) {
                if (centerNodes.length === 2) {
                    // Side-by-Side (Left-Right) - WIDE SEPARATION for Twin Graph Strict Mode
                    const offset = svgSize * 0.35;
                    foci.set(centerNodes[0].id, { x: center - offset, y: center });
                    foci.set(centerNodes[1].id, { x: center + offset, y: center });
                } else {
                    // Triangle / Circle for 3+
                    const radius = svgSize * 0.3;
                    const angleStep = (Math.PI * 2) / centerNodes.length;
                    centerNodes.forEach((node, i) => {
                        const angle = i * angleStep - Math.PI / 2;
                        foci.set(node.id, {
                            x: center + Math.cos(angle) * radius,
                            y: center + Math.sin(angle) * radius
                        });
                    });
                }
            } else if (centerNodes[0]) {
                foci.set(centerNodes[0].id, defaultCenter);
            }

            // Place centers (including user drag offsets)
            centerNodes.forEach(node => {
                const basePos = foci.get(node.id) || defaultCenter;
                const dragOffset = dragOffsets.get(node.id) || { x: 0, y: 0 };

                // Update the focus point itself so rings follow the center!
                foci.set(node.id, { x: basePos.x + dragOffset.x, y: basePos.y + dragOffset.y });
                positions.set(node.id, { x: basePos.x + dragOffset.x, y: basePos.y + dragOffset.y });
            });
            radii.set(0, 0); // Center ring has 0 radius

            // ============================================
            // CATEGORY-BASED RING LAYOUT
            // Each ring contains only one category type
            // Larger rings = more capacity (proportional to circumference)
            // ============================================

            // Define category order (innermost to outermost)
            // Pathologies are central (ring 0), others are organized by clinical relevance
            const CATEGORY_ORDER = [
                'DRUG', 'MEDICATION',     // Ring 1: Médicaments
                'TREATMENT',              // Ring 2: Traitements
                'SYMPTOM',                // Ring 3: Symptômes
                'COMPLICATION',           // Ring 4: Complications
                'LAB',                    // Ring 5: Analyses
                'GUIDELINE', 'EVIDENCE', 'LIFESTYLE'  // Ring 6: Suggestions
            ];

            // Map categories to ring numbers
            const getCategoryRing = (nodeType: string): number => {
                const type = nodeType?.toUpperCase() || '';
                if (type === 'PATHOLOGY') return 0; // Central
                if (['DRUG', 'MEDICATION'].includes(type)) return 1;
                if (type === 'TREATMENT') return 2;
                if (type === 'SYMPTOM') return 3;
                if (type === 'COMPLICATION') return 4;
                if (type === 'LAB') return 5;
                if (['GUIDELINE', 'EVIDENCE', 'LIFESTYLE'].includes(type)) return 6;
                return 7; // Unknown types go to outer ring
            };

            // Get category color label for ring
            const getCategoryLabel = (ring: number): string => {
                switch (ring) {
                    case 1: return '💊 Médicaments';
                    case 2: return '🩺 Traitements';
                    case 3: return '🤒 Symptômes';
                    case 4: return '⚠️ Complications';
                    case 5: return '🔬 Analyses';
                    case 6: return '📋 Suggestions';
                    default: return '❓ Autres';
                }
            };

            // Get all non-center nodes and group by category ring
            const peripheralNodes = nodes.filter(n => n.ring !== 0);
            const nodesByCategoryRing = new Map<number, RingNode[]>();

            peripheralNodes.forEach(node => {
                const catRing = getCategoryRing(node.node_type || '');
                if (catRing === 0) return; // Skip pathologies (already placed)
                if (!nodesByCategoryRing.has(catRing)) nodesByCategoryRing.set(catRing, []);
                nodesByCategoryRing.get(catRing)!.push(node);
            });

            // Sort category rings
            const sortedCategoryRings = Array.from(nodesByCategoryRing.keys()).sort((a, b) => a - b);

            // Dynamic spacing derived from layoutParams
            const spacingFactor = layoutParams.nodeSpacing / 40;

            const BASE_RADIUS = 80 * spacingFactor;        // First ring radius
            const RING_SPACING = 60 * spacingFactor;       // Spacing between category rings
            const MIN_NODE_SPACING_ANGLE = 0.15;           // Minimum angle between nodes (radians)

            let currentRadius = BASE_RADIUS;

            // Layout each category ring
            sortedCategoryRings.forEach(catRing => {
                const catNodes = nodesByCategoryRing.get(catRing)!;
                if (catNodes.length === 0) return;

                // Calculate capacity based on ring circumference
                // Larger rings can fit more nodes at the same angular spacing
                const circumference = 2 * Math.PI * currentRadius;
                const idealNodeSpacing = 45; // pixels between nodes
                const maxNodesAtThisRadius = Math.floor(circumference / idealNodeSpacing);

                // If we have more nodes than fit, create multiple concentric sub-rings
                const nodesPerSubRing = Math.max(8, maxNodesAtThisRadius);
                const numSubRings = Math.ceil(catNodes.length / nodesPerSubRing);
                const SUB_RING_SPACING = 35 * spacingFactor;

                // Sub-group by parent pathology for multi-graph mode
                const nodesByParent = new Map<string, RingNode[]>();
                catNodes.forEach(n => {
                    let parentId = 'unknown';
                    if (n.parent_pathology) {
                        const parent = centerNodes.find(c => c.name === n.parent_pathology);
                        if (parent && foci.has(parent.id)) parentId = parent.id;
                    }
                    if (parentId === 'unknown') {
                        parentId = centerNodes[0]?.id || 'unknown';
                    }
                    if (!nodesByParent.has(parentId)) nodesByParent.set(parentId, []);
                    nodesByParent.get(parentId)!.push(n);
                });

                // Layout each parent group
                Array.from(nodesByParent.entries()).forEach(([parentId, pNodes]) => {
                    const focus = foci.get(parentId) || defaultCenter;

                    // Distribute across sub-rings if needed
                    for (let i = 0; i < pNodes.length; i += nodesPerSubRing) {
                        const subRingIndex = Math.floor(i / nodesPerSubRing);
                        const chunk = pNodes.slice(i, i + nodesPerSubRing);
                        const subRingRadius = currentRadius + (subRingIndex * SUB_RING_SPACING);

                        // Evenly distribute nodes around the ring
                        const angleStep = (Math.PI * 2) / Math.max(1, chunk.length);
                        const angleOffset = catRing * Math.PI / 6; // Stagger start angle per category

                        chunk.forEach((node, j) => {
                            const angle = j * angleStep + angleOffset - Math.PI / 2;
                            positions.set(node.id, {
                                x: focus.x + Math.cos(angle) * subRingRadius,
                                y: focus.y + Math.sin(angle) * subRingRadius
                            });
                        });
                    }
                });

                // Store the radius for ring visualization
                radii.set(catRing, currentRadius);

                // Move to next ring (account for sub-rings)
                currentRadius += RING_SPACING + (numSubRings - 1) * SUB_RING_SPACING;
            });
        } // END RADIAL LAYOUT

        // --- 2. GRID LAYOUT ---
        else if (layoutMode === 'grid') {
            const GRID_COLS = layoutParams.gridCols > 0 ? layoutParams.gridCols : Math.ceil(Math.sqrt(nodes.length * 1.6));
            const CELL_SIZE_X = layoutParams.nodeSpacing * 3.5;
            const CELL_SIZE_Y = layoutParams.nodeSpacing * 2.5;
            const startX = center - (GRID_COLS * CELL_SIZE_X) / 2;
            const startY = center - (Math.ceil(nodes.length / GRID_COLS) * CELL_SIZE_Y) / 2;

            const sortedGridNodes = [
                ...centerNodes,
                ...peripheralNodes.sort((a, b) => (a.node_type || '').localeCompare(b.node_type || ''))
            ];

            sortedGridNodes.forEach((node, i) => {
                const col = i % GRID_COLS;
                const row = Math.floor(i / GRID_COLS);
                const dragOffset = dragOffsets.get(node.id) || { x: 0, y: 0 };
                positions.set(node.id, {
                    x: startX + col * CELL_SIZE_X + dragOffset.x,
                    y: startY + row * CELL_SIZE_Y + dragOffset.y
                });
            });
        }

        // --- 3. HIERARCHICAL LAYOUT ---
        else if (layoutMode === 'hierarchical') {
            const LEVEL_HEIGHT = layoutParams.levelHeight;
            const NODE_WIDTH = layoutParams.nodeSpacing * 2.75;
            const levelGroups = [
                centerNodes,
                peripheralNodes.filter(n => ['SYMPTOM', 'TREATMENT', 'DRUG'].includes(n.node_type?.toUpperCase() || '')),
                peripheralNodes.filter(n => !['SYMPTOM', 'TREATMENT', 'DRUG'].includes(n.node_type?.toUpperCase() || ''))
            ];
            const totalHeight = (levelGroups.length - 1) * LEVEL_HEIGHT;
            const startY = center - totalHeight / 2;

            levelGroups.forEach((group, levelIdx) => {
                const rowWidth = group.length * NODE_WIDTH;
                const startX = center - rowWidth / 2 + NODE_WIDTH / 2;
                group.forEach((node, i) => {
                    const dragOffset = dragOffsets.get(node.id) || { x: 0, y: 0 };
                    positions.set(node.id, {
                        x: startX + i * NODE_WIDTH + dragOffset.x,
                        y: startY + levelIdx * LEVEL_HEIGHT + dragOffset.y
                    });
                });
            });
        }

        // --- 4. ORGANIC LAYOUT ---
        else if (layoutMode === 'organic') {
            centerNodes.forEach(node => {
                const dragOffset = dragOffsets.get(node.id) || { x: 0, y: 0 };
                positions.set(node.id, { x: center + dragOffset.x, y: center + dragOffset.y });
            });
            peripheralNodes.forEach((node, i) => {
                const dragOffset = dragOffsets.get(node.id) || { x: 0, y: 0 };
                // Deterministic random
                const hash = node.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
                const rand = (seed: number) => Math.abs(Math.sin(seed * 9999));
                const typeCode = (node.node_type || '').length;
                const baseAngle = (typeCode * 60) * (Math.PI / 180);
                const finalAngle = baseAngle + (rand(hash) - 0.5) * 2;
                const dist = 150 + rand(hash + 1) * layoutParams.organicStrength;
                positions.set(node.id, {
                    x: center + Math.cos(finalAngle) * dist + dragOffset.x,
                    y: center + Math.sin(finalAngle) * dist + dragOffset.y
                });
            });
        }

        // ANTI-COLLISION: Disabled per user request to maintain stable spacing
        // Nodes will respect their calculated orbital positions.
        /*
        const MIN_NODE_DISTANCE = 55; 
        const COLLISION_ITERATIONS = 15; 
 
        for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
             // ... logic disabled ...
        }
        */

        return { nodePositions: positions, ringRadii: radii, uniqueNodes: nodes, idRedirects };
        return { nodePositions: positions, ringRadii: radii, uniqueNodes: nodes, idRedirects };
    }, [data, center, visibleNodeCount, layoutParams, activePathologies, hiddenNodeTypes, getNodeTypes, layoutMode, dragOffsets, localHiddenTypes, userHiddenNodes]);

    const nodeMap = useMemo(() => {
        const map = new Map<string, RingNode>();
        uniqueNodes.forEach(n => map.set(n.id, n));
        return map;
    }, [uniqueNodes]);

    const maxRing = Math.max(...uniqueNodes.map(n => n.ring));

    // ============================================
    // SEMANTIC EDGE COLORING SYSTEM
    // Based on user specifications:
    // - Symptômes associés à pathologie = Vert (#22c55e)
    // - Symptôme lié à médicament/traitement = Orange (#f97316)
    // - Interaction entre médicaments = Rouge (#ef4444)
    // - Contre-indication médicament/pathologie = Rouge clignotant + ☠️
    // ============================================

    // Helper functions isNodeType and getSemanticEdgeColor are now imported from @/utils/graphUtils
    // getRelationshipColor wrapper preserved for compatibility but uses imported logic


    // Legacy function for backwards compatibility
    const getRelationshipColor = (relationship: string, evidenceGrade: string): { color: string; type: 'positive' | 'danger' | 'contraindication' | 'warning' | 'neutral' } => {
        const result = getSemanticEdgeColor(undefined, undefined, relationship, evidenceGrade);
        return { color: result.color, type: result.type === 'deadly' ? 'danger' : result.type };
    };

    // Calculate highlighted nodes with their colors based on selection
    const connectionColors = useMemo(() => {
        const colors = new Map<string, { color: string; type: string }>();
        if (!selectedNodeId) return colors;

        // Check all edges for connections to the selected node
        // IMPORTANT: Apply same ID redirects as edge rendering to match deduplicated nodes
        data.knowledge_graph.edges.forEach(edge => {
            // Apply ID redirects (same as edge rendering does)
            const resolvedSource = idRedirects.get(edge.source) || edge.source;
            const resolvedTarget = idRedirects.get(edge.target) || edge.target;

            let targetId: string | null = null;

            if (resolvedSource === selectedNodeId) {
                targetId = resolvedTarget;
            } else if (resolvedTarget === selectedNodeId) {
                targetId = resolvedSource;
            }

            if (targetId) {
                const relationColor = getRelationshipColor(edge.relationship, edge.evidence_grade);
                colors.set(targetId, relationColor);
            }
        });

        // NOTE: We do NOT add all nodes with neutral color here
        // Only nodes with actual edges to selected node should be highlighted
        // This allows focus mode to hide unconnected nodes

        return colors;
    }, [selectedNodeId, data, idRedirects]);

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

        // In group creation mode, add clicked node to the group
        if (groupCreationMode && currentGroupCenter) {
            if (node.id !== currentGroupCenter && onAddToGroup) {
                onAddToGroup(node.id);
            }
            return;
        }

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
    }, [multiSelectMode, groupCreationMode, currentGroupCenter, onAddToGroup]);

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
            {/* Graph Explorer Toggle */}
            <button
                onClick={() => setShowExplorer(!showExplorer)}
                className="absolute top-4 left-4 z-20 bg-gray-900/80 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg flex items-center gap-2 hover:bg-white/10 transition-colors backdrop-blur-sm shadow-lg"
            >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-sm font-medium">Contenu</span>
            </button>

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

                {/* SVG Definitions with CSS animations for performance */}
                <defs>
                    <clipPath id="circle-clip">
                        <circle cx={center} cy={center} r={svgSize / 2} />
                    </clipPath>
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                        <feMerge>
                            <feMergeNode in="coloredBlur" />
                            <feMergeNode in="SourceGraphic" />
                        </feMerge>
                    </filter>
                    <filter id="hologram-noise">
                        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch" />
                        <feColorMatrix type="saturate" values="0" />
                        <feComponentTransfer>
                            <feFuncR type="linear" slope="0.5" />
                            <feFuncG type="linear" slope="0.5" />
                            <feFuncB type="linear" slope="0.5" />
                            <feFuncA type="linear" slope="0.2" />
                        </feComponentTransfer>
                        <feComposite operator="in" in2="SourceGraphic" />
                    </filter>
                </defs>

                {/* Edges - OPTIMIZED: Only render defined edges, not all pairs */}
                {
                    (() => {
                        const allEdges: JSX.Element[] = [];
                        const totalEdges = data.knowledge_graph.edges.length;

                        // Deduplicate edges by normalized key AND re-map using idRedirects
                        const seenEdges = new Set<string>();

                        // First, remap all edges to use the KEPT node IDs (if a node was merged)
                        const mappedEdges = data.knowledge_graph.edges.map(edge => ({
                            ...edge,
                            source: idRedirects.get(edge.source) || edge.source,
                            target: idRedirects.get(edge.target) || edge.target
                        })).filter(edge => edge.source !== edge.target); // Remove self-loops created by merge

                        let uniqueEdges = mappedEdges.filter(edge => {
                            const key = [edge.source, edge.target].sort().join('-');
                            if (seenEdges.has(key)) return false;
                            seenEdges.add(key);
                            return true;
                        });

                        // Apply edge filter based on mode
                        if (edgeFilterMode === 'central-only' && centralNodeId) {
                            uniqueEdges = uniqueEdges.filter(edge =>
                                edge.source === centralNodeId || edge.target === centralNodeId
                            );
                        } else if (edgeFilterMode === 'selected-only' && (filterSelectedNodeId || selectedNodeId)) {
                            const nodeToFilter = filterSelectedNodeId || selectedNodeId;
                            uniqueEdges = uniqueEdges.filter(edge =>
                                edge.source === nodeToFilter || edge.target === nodeToFilter
                            );
                        }

                        // Filter by hidden relation types (checkbox filters)
                        if (hiddenRelationTypes && hiddenRelationTypes.size > 0) {
                            uniqueEdges = uniqueEdges.filter(edge => {
                                const rel = edge.relationship?.toUpperCase() || '';
                                return !hiddenRelationTypes.has(rel);
                            });
                        }

                        uniqueEdges.forEach((edge, edgeIndex) => {
                            const basePosA = nodePositions.get(edge.source);
                            const basePosB = nodePositions.get(edge.target);
                            // We use nodeMap for quick property access - need to ensure it's built from uniqueNodes
                            const nodeA = uniqueNodes.find(n => n.id === edge.source);
                            const nodeB = uniqueNodes.find(n => n.id === edge.target);

                            if (!basePosA || !basePosB || !nodeA || !nodeB) return;

                            // Apply drag offsets to edge endpoints
                            const dragOffsetA = dragOffsets.get(edge.source) || { x: 0, y: 0 };
                            const dragOffsetB = dragOffsets.get(edge.target) || { x: 0, y: 0 };
                            // Apply custom positions (from chat commands) and drag offsets
                            const customPosA = customNodePositions.get(edge.source);
                            const customPosB = customNodePositions.get(edge.target);

                            const posA = (!ignoreCustomPositions && customPosA)
                                ? { x: customPosA.x + dragOffsetA.x, y: customPosA.y + dragOffsetA.y }
                                : { x: basePosA.x + dragOffsetA.x, y: basePosA.y + dragOffsetA.y };

                            const posB = (!ignoreCustomPositions && customPosB)
                                ? { x: customPosB.x + dragOffsetB.x, y: customPosB.y + dragOffsetB.y }
                                : { x: basePosB.x + dragOffsetB.x, y: basePosB.y + dragOffsetB.y };


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

                            // ============================================
                            // SEMANTIC EDGE COLORING
                            // Uses node types to determine relationship color
                            // ============================================
                            const semanticColor = getSemanticEdgeColor(nodeA, nodeB, edge.relationship, edge.evidence_grade);
                            const color = semanticColor.color;
                            const isDangerousEdge = semanticColor.isDangerous;
                            const showSkullSymbol = semanticColor.showSkull;

                            // Opacity based on selection state, animation, and focus mode
                            let opacity = 0.6;
                            if (selectedNodeId && focusMode) {
                                // In focus mode, completely hide edges not connected to selected node
                                if (!isConnectedToSelected) return;
                                opacity = 1;
                            }
                            opacity *= edgeProgress;

                            const strokeWidth = isConnectedToSelected ? 4 : (isDangerousEdge ? 3 : 2);

                            // Calculate line length for effects
                            const dx = posB.x - posA.x;
                            const dy = posB.y - posA.y;
                            const length = Math.sqrt(dx * dx + dy * dy);

                            // Animated line drawing effect
                            const visibleLength = length * edgeProgress;
                            const dashArray = `${visibleLength} ${length - visibleLength}`;

                            // Mid point for skull symbol
                            const midX = (posA.x + posB.x) / 2;
                            const midY = (posA.y + posB.y) / 2;

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
                                    >
                                        {/* BLINKING ANIMATION for dangerous edges */}
                                        {isDangerousEdge && edgeProgress >= 1 && (
                                            <animate
                                                attributeName="opacity"
                                                values={`${opacity * 0.3};${opacity};${opacity * 0.3}`}
                                                dur="0.5s"
                                                repeatCount="indefinite"
                                            />
                                        )}
                                    </line>

                                    {/* DANGEROUS EDGE: Pulsing glow effect - CSS animated */}
                                    {isDangerousEdge && edgeProgress >= 1 && (
                                        <>
                                            {/* Outer pulsing glow */}
                                            <line
                                                x1={posA.x} y1={posA.y}
                                                x2={posB.x} y2={posB.y}
                                                stroke="#ef4444"
                                                strokeWidth={strokeWidth + 4}
                                                strokeLinecap="round"
                                                className="danger-pulse"
                                            />
                                            {/* Bright core that blinks */}
                                            <line
                                                x1={posA.x} y1={posA.y}
                                                x2={posB.x} y2={posB.y}
                                                stroke="#ff6b6b"
                                                strokeWidth={strokeWidth}
                                                strokeLinecap="round"
                                                className="danger-pulse-bright"
                                            />
                                        </>
                                    )}

                                    {/* SKULL SYMBOL ☠️ for deadly contraindications - CSS animated */}
                                    {showSkullSymbol && edgeProgress >= 1 && (
                                        <g>
                                            {/* Skull background circle */}
                                            <circle
                                                cx={midX}
                                                cy={midY}
                                                r={12}
                                                fill="#1f2937"
                                                stroke="#ef4444"
                                                strokeWidth={2}
                                                className="skull-pulse"
                                            />
                                            {/* Skull emoji */}
                                            <text
                                                x={midX}
                                                y={midY + 4}
                                                textAnchor="middle"
                                                fontSize="14"
                                                fill="#ef4444"
                                            >
                                                ☠️
                                                <animate
                                                    attributeName="opacity"
                                                    values="0.5;1;0.5"
                                                    dur="0.5s"
                                                    repeatCount="indefinite"
                                                />
                                            </text>
                                        </g>
                                    )}

                                    {/* Electric current effect on ALL edges after animation (non-dangerous) - OPTIMIZED: Only for selected/connected */}
                                    {edgeProgress >= 1 && !isDangerousEdge && isConnectedToSelected && (
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

                                    {/* DANGEROUS edge electric effect - red themed */}
                                    {edgeProgress >= 1 && isDangerousEdge && (
                                        <>
                                            {/* Red warning spark */}
                                            <circle
                                                r={4}
                                                fill="#ef4444"
                                                opacity={1}
                                            >
                                                <animateMotion
                                                    dur="0.4s"
                                                    repeatCount="indefinite"
                                                    path={`M${posA.x},${posA.y} L${posB.x},${posB.y}`}
                                                />
                                                <animate
                                                    attributeName="opacity"
                                                    values="0.3;1;0.3"
                                                    dur="0.4s"
                                                    repeatCount="indefinite"
                                                />
                                            </circle>
                                        </>
                                    )}

                                    {/* Clickable overlay with hover detection */}
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
                                        onMouseEnter={(e) => {
                                            const rect = containerRef.current?.getBoundingClientRect();
                                            if (rect) {
                                                setHoveredEdge({
                                                    edge,
                                                    sourceNode: nodeA,
                                                    targetNode: nodeB,
                                                    x: e.clientX - rect.left,
                                                    y: e.clientY - rect.top - 10
                                                });
                                            }
                                        }}
                                        onMouseMove={(e) => {
                                            const rect = containerRef.current?.getBoundingClientRect();
                                            if (rect && hoveredEdge) {
                                                setHoveredEdge(prev => prev ? {
                                                    ...prev,
                                                    x: e.clientX - rect.left,
                                                    y: e.clientY - rect.top - 10
                                                } : null);
                                            }
                                        }}
                                        onMouseLeave={() => setHoveredEdge(null)}
                                    />
                                </g>
                            );
                        });

                        return allEdges;
                    })()
                }

                {/* Nodes with staggered ease-in-out animation */}
                {
                    uniqueNodes.map((node, nodeIndex) => {
                        const basePos = nodePositions.get(node.id);
                        if (!basePos || !getNodeVisible(node.ring)) return null;

                        // Skip nodes that are explicitly hidden via chat commands
                        if (hiddenNodes.has(node.id)) return null;

                        // Apply custom positions (from chat commands) and drag offset
                        const customPos = !ignoreCustomPositions ? customNodePositions.get(node.id) : undefined;
                        const dragOffset = dragOffsets.get(node.id) || { x: 0, y: 0 };
                        const pos = customPos
                            ? { x: customPos.x + dragOffset.x, y: customPos.y + dragOffset.y }
                            : { x: basePos.x + dragOffset.x, y: basePos.y + dragOffset.y };

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
                        const size = (8 + node.proximity_score * 6) * ringScale * sizeScale; // Apply user scale

                        // Determine node state
                        const isSelected = node.id === selectedNodeId;
                        const isHighlighted = highlightedNodeIds.has(node.id);
                        const isDimmed = focusMode && selectedNodeId && !isSelected && !isHighlighted;
                        if (isDimmed) return null; // Hide unconnected nodes in focus mode

                        // Merge existing analysis selection with new Tool selection
                        const isMultiSelected = selectedNodesForAnalysis.has(node.id) || multiSelectedNodeIds.has(node.id);

                        const isNewlySpawned = newlySpawnedNodes?.has(node.id) || false;

                        // Get relationship-based color from connectionColors
                        const connectionColor = connectionColors.get(node.id);

                        // Check if this is a golden (optimal treatment) node in deep analysis mode
                        const isGoldenNode = deepAnalysisMode && goldenNodeIds.has(node.id);
                        const isDimmedByAnalysis = deepAnalysisMode && !isGoldenNode;

                        // Determine node color based on state and relationship
                        let color: string;
                        if (isGoldenNode) {
                            color = '#fbbf24'; // Gold for optimal treatment nodes
                        } else if (isMultiSelected) {
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

                        // In deep analysis mode, non-golden nodes have 20% opacity
                        const baseOpacity = isDimmedByAnalysis ? 0.2 : 1;
                        const glowOpacity = (isGoldenNode ? 0.7 : (isSelected ? 0.5 : (isHighlighted ? 0.4 : (isDimmed ? 0.03 : 0.15)))) * nodeProgress * baseOpacity;
                        const mainOpacity = (isDimmed ? 0.2 : 1) * nodeProgress * baseOpacity;
                        const nodeSize = (isGoldenNode ? size * 1.8 : (isSelected ? size * 1.5 : (isHighlighted ? size * 1.2 : size))) * popScale;

                        // Define visibility based on animation progress
                        const isVisible = nodeProgress > 0;

                        // Determine cursor style - all nodes are draggable
                        const cursorStyle = 'grab';

                        return (
                            <g
                                key={node.id}
                                className={`transition-opacity duration-500 ${isGoldenNode ? 'golden-pulse' : ''}`}
                                style={{
                                    opacity: isVisible ? (isDimmedByAnalysis ? 0.2 : (isDimmed ? 0.2 : 1)) : 0,
                                    cursor: cursorStyle
                                }}
                                onClick={(e) => {
                                    // Don't trigger click if dragging occurred
                                    if (didDragRef.current) {
                                        didDragRef.current = false;
                                        return;
                                    }
                                    e.stopPropagation();
                                    handleNodeClick(node, e);
                                }}
                                onDoubleClick={(e) => handleNodeDoubleClick(node, e)}
                                onMouseDown={(e) => {
                                    // Enable dragging for ALL nodes
                                    if (e.button === 0) {
                                        e.stopPropagation();
                                        didDragRef.current = false; // Reset drag flag
                                        setDraggingNode(node.id);
                                    }
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
                                {/* Selection ring for selected node - CSS animated */}
                                {isSelected && (
                                    <circle
                                        cx={pos.x} cy={pos.y} r={nodeSize * 2.5}
                                        fill="none"
                                        stroke="#a855f7"
                                        strokeWidth="3"
                                        strokeDasharray="6 3"
                                        opacity="0.8"
                                        className="dash-march"
                                    />
                                )}
                                {/* Purple ring for MULTI-SELECT or GROUP member nodes */}
                                {(isMultiSelected || (groupCreationMode && currentGroupCenter && nodeGroups.get(currentGroupCenter)?.has(node.id))) && (
                                    <circle
                                        cx={pos.x} cy={pos.y} r={nodeSize * 2.2}
                                        fill="none"
                                        stroke="#a855f7"
                                        strokeWidth="3"
                                        strokeDasharray="4 2"
                                        opacity="0.9"
                                        className="dash-march"
                                    />
                                )}
                                {/* Group CENTER indicator - solid purple ring */}
                                {(groupCreationMode && node.id === currentGroupCenter) && (
                                    <circle
                                        cx={pos.x} cy={pos.y} r={nodeSize * 2.8}
                                        fill="none"
                                        stroke="#a855f7"
                                        strokeWidth="4"
                                        opacity="1"
                                    />
                                )}
                                {/* Pulsing glow for highlighted danger nodes - CSS animated */}
                                {isHighlighted && connectionColor?.type === 'danger' && (
                                    <circle cx={pos.x} cy={pos.y} r={nodeSize * 2.5} fill="#ef4444" className="glow-pulse" />
                                )}
                                {/* COSMIC ENERGY BURST for newly spawned nodes - CSS animated */}
                                {isNewlySpawned && (
                                    <>
                                        {/* Outer pulsing cosmic glow - uses CSS animation */}
                                        <circle
                                            cx={pos.x} cy={pos.y} r={nodeSize * 3}
                                            fill="none" stroke="#a855f7" strokeWidth="2"
                                            className="spawn-ring"
                                            style={{ transformOrigin: `${pos.x}px ${pos.y}px` }}
                                        />
                                        {/* Inner rotating energy ring - CSS animated */}
                                        <circle
                                            cx={pos.x} cy={pos.y} r={nodeSize * 2.5}
                                            fill="none" stroke="#06b6d4" strokeWidth="3" strokeDasharray="8 4"
                                            className="rotate-ring"
                                            opacity="0.7"
                                        />
                                        {/* Bright core flash - CSS animated */}
                                        <circle
                                            cx={pos.x} cy={pos.y} r={nodeSize * 1.5}
                                            fill="white"
                                            className="flash-bright"
                                        />
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
                    })
                }
            </svg>

            {/* Layout Controls */}
            <div className="absolute bottom-20 left-4 bg-gray-900/80 border border-gray-700 rounded-lg p-2 flex flex-col gap-2 backdrop-blur-sm z-10 w-10">
                <button
                    onClick={() => setLayoutMode('radial')}
                    className={`p-1.5 rounded transition-colors ${layoutMode === 'radial' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:bg-white/10'}`}
                    title="Radial (Rings)"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <circle cx="12" cy="12" r="8" strokeWidth={2} />
                        <circle cx="12" cy="12" r="2" fill="currentColor" />
                    </svg>
                </button>
                <button
                    onClick={() => setLayoutMode('organic')}
                    className={`p-1.5 rounded transition-colors ${layoutMode === 'organic' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:bg-white/10'}`}
                    title="Organique (Force)"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                </button>
                <button
                    onClick={() => setLayoutMode('grid')}
                    className={`p-1.5 rounded transition-colors ${layoutMode === 'grid' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:bg-white/10'}`}
                    title="Grille"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                </button>
                <button
                    onClick={() => setLayoutMode('hierarchical')}
                    className={`p-1.5 rounded transition-colors ${layoutMode === 'hierarchical' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:bg-white/10'}`}
                    title="Hiérarchique (Arbre)"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                </button>

                <div className="h-px bg-gray-700 my-1 w-full" />

                {/* Settings Toggle */}
                <button
                    onClick={() => setShowLayoutSettings(!showLayoutSettings)}
                    className={`p-1.5 rounded transition-colors ${showLayoutSettings ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-white/10'}`}
                    title="Paramètres de disposition"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>

                {/* Reset Positions */}
                <button
                    onClick={() => {
                        setDragOffsets(new Map());
                        setIgnoreCustomPositions(true);
                        // Reset flag logic usually requires persistence or handling in useMemo, 
                        // but here we just toggle it to force re-render/re-calc if logic used it.
                        // For now, clearing dragOffsets is the main "Reset" for manual moves.
                    }}
                    className="p-1.5 rounded transition-colors text-red-400 hover:bg-red-900/30 hover:text-red-300"
                    title="Réinitialiser les positions"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </button>

                {/* Save Graph Button */}
                {onSaveGraph && (
                    <button
                        onClick={() => setShowSaveModal(true)}
                        className="p-1.5 rounded transition-colors text-emerald-400 hover:bg-emerald-900/30 hover:text-emerald-300"
                        title="Sauvegarder ce graphe"
                    >
                        <Save className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* Save Graph Modal */}
            {showSaveModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div
                        className="bg-gray-900 border border-emerald-500/50 rounded-xl p-6 w-96 shadow-2xl relative"
                        onPointerDown={(e) => e.stopPropagation()}
                        onWheel={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setShowSaveModal(false)}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-10 h-10 rounded-full bg-emerald-900/50 flex items-center justify-center border border-emerald-500/30">
                                <Save className="w-5 h-5 text-emerald-400" />
                            </div>
                            <h3 className="text-lg font-bold text-white">Sauvegarder le Graphe</h3>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Nom du graphe</label>
                                <input
                                    type="text"
                                    value={saveGraphName}
                                    onChange={(e) => setSaveGraphName(e.target.value)}
                                    placeholder="Ex: Analyse Cardiovasculaire"
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">Description (optionnelle)</label>
                                <textarea
                                    value={saveDescription}
                                    onChange={(e) => setSaveDescription(e.target.value)}
                                    placeholder="Notes sur cette session..."
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 transition-colors h-20 resize-none"
                                />
                            </div>

                            <button
                                onClick={handleSaveConfirm}
                                disabled={!saveGraphName.trim()}
                                className="w-full mt-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition-all shadow-lg shadow-emerald-900/20"
                            >
                                Sauvegarder
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Layout Settings Panel */}
            {showLayoutSettings && (
                <div
                    className="absolute bottom-20 left-20 bg-gray-900/95 border border-gray-700 rounded-lg p-4 shadow-xl backdrop-blur w-64 z-20"
                    onPointerDown={(e) => e.stopPropagation()}
                    onWheel={(e) => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-semibold text-gray-200">Paramètres</h3>
                        <button onClick={() => setShowLayoutSettings(false)} className="text-gray-500 hover:text-white">✕</button>
                    </div>

                    {/* Common: Spacing */}
                    <div className="mb-3">
                        <label className="text-xs text-gray-400 block mb-1">Espacement ({layoutParams.nodeSpacing}px)</label>
                        <input
                            type="range" min="10" max="150" step="5"
                            value={layoutParams.nodeSpacing}
                            onChange={(e) => setLayoutParams(p => ({ ...p, nodeSpacing: parseInt(e.target.value) }))}
                            className="w-full accent-cyan-500 bg-gray-700 h-1 rounded appearance-none"
                        />
                    </div>

                    {/* Grid Specific */}
                    {layoutMode === 'grid' && (
                        <div className="mb-3">
                            <label className="text-xs text-gray-400 block mb-1">Colonnes ({layoutParams.gridCols === 0 ? 'Auto' : layoutParams.gridCols})</label>
                            <input
                                type="range" min="0" max="20" step="1"
                                value={layoutParams.gridCols}
                                onChange={(e) => setLayoutParams(p => ({ ...p, gridCols: parseInt(e.target.value) }))}
                                className="w-full accent-cyan-500 bg-gray-700 h-1 rounded appearance-none"
                            />
                        </div>
                    )}

                    {/* Hierarchical Specific */}
                    {layoutMode === 'hierarchical' && (
                        <div className="mb-3">
                            <label className="text-xs text-gray-400 block mb-1">Hauteur de niveau ({layoutParams.levelHeight}px)</label>
                            <input
                                type="range" min="10" max="300" step="10"
                                value={layoutParams.levelHeight}
                                onChange={(e) => setLayoutParams(p => ({ ...p, levelHeight: parseInt(e.target.value) }))}
                                className="w-full accent-cyan-500 bg-gray-700 h-1 rounded appearance-none"
                            />
                        </div>
                    )}

                    {/* Organic Specific */}
                    {layoutMode === 'organic' && (
                        <div className="mb-3">
                            <label className="text-xs text-gray-400 block mb-1">Force de dispersion ({layoutParams.organicStrength})</label>
                            <input
                                type="range" min="10" max="500" step="10"
                                value={layoutParams.organicStrength}
                                onChange={(e) => setLayoutParams(p => ({ ...p, organicStrength: parseInt(e.target.value) }))}
                                className="w-full accent-cyan-500 bg-gray-700 h-1 rounded appearance-none"
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Sidebar Explorer */}
            <div
                className={`absolute top-0 left-0 h-full w-80 bg-gray-950/95 border-r border-gray-800 shadow-2xl z-30 transform transition-transform duration-300 overflow-hidden flex flex-col ${showExplorer ? 'translate-x-0' : '-translate-x-full'}`}
                onPointerDown={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <svg className="w-5 h-5 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        Explorateur
                    </h2>
                    <button onClick={() => setShowExplorer(false)} className="text-gray-500 hover:text-white transition-colors">✕</button>
                </div>

                {/* Content List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {/* Render Categories */}
                    {Array.from(new Set(data.knowledge_graph.nodes.map(n => n.node_type || 'Inconnu'))).sort().map(type => {
                        const nodesOfType = data.knowledge_graph.nodes.filter(n => (n.node_type || 'Inconnu') === type).sort((a, b) => a.name.localeCompare(b.name));
                        const isCollapsed = collapsedCategories.has(type);
                        const isTypeHidden = localHiddenTypes.has(type.toUpperCase());

                        return (
                            <div key={type} className="border border-gray-800 rounded bg-gray-900/30 overflow-hidden">
                                <div className="flex items-center gap-2 p-2 hover:bg-white/5 transition-colors">
                                    <button
                                        onClick={() => {
                                            const newSet = new Set(collapsedCategories);
                                            if (isCollapsed) newSet.delete(type); else newSet.add(type);
                                            setCollapsedCategories(newSet);
                                        }}
                                        className="text-gray-400 hover:text-white transition-colors p-1"
                                    >
                                        <svg className={`w-4 h-4 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>

                                    <input
                                        type="checkbox"
                                        checked={!isTypeHidden}
                                        onChange={() => {
                                            const newSet = new Set(localHiddenTypes);
                                            const typeKey = type.toUpperCase();
                                            if (newSet.has(typeKey)) newSet.delete(typeKey); else newSet.add(typeKey);
                                            setLocalHiddenTypes(newSet);
                                        }}
                                        className="rounded border-gray-600 bg-gray-800 accent-cyan-500 w-4 h-4 cursor-pointer"
                                    />

                                    <span className="text-xs font-semibold text-gray-300 flex-1 truncate uppercase tracking-wider">{type}</span>
                                    <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded font-mono border border-gray-700">{nodesOfType.length}</span>
                                </div>

                                {/* Node List */}
                                {!isCollapsed && (
                                    <div className="border-t border-gray-800/50 bg-black/20 animate-in slide-in-from-top-1 duration-200">
                                        {nodesOfType.map(node => {
                                            const isHidden = userHiddenNodes.has(node.id);
                                            // Determine node status color
                                            const statusColor = node.ring === 0 ? 'bg-purple-500' : 'bg-cyan-500';

                                            return (
                                                <div key={node.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 pl-9 border-l-2 border-transparent hover:border-cyan-500/30 group transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        checked={!isHidden}
                                                        onChange={() => {
                                                            const newSet = new Set(userHiddenNodes);
                                                            if (newSet.has(node.id)) newSet.delete(node.id); else newSet.add(node.id);
                                                            setUserHiddenNodes(newSet);
                                                        }}
                                                        className="rounded border-gray-700 bg-gray-800 accent-cyan-500 w-3.5 h-3.5 cursor-pointer opacity-70 group-hover:opacity-100 transition-opacity"
                                                    />
                                                    <span className={`text-xs truncate transition-all flex-1 ${isHidden ? 'text-gray-600 line-through' : 'text-gray-400 group-hover:text-white'}`} title={node.name}>
                                                        {node.name}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

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
                {/* Node colors legend */}
                <div className="text-xs mt-1 flex flex-wrap gap-2 justify-end">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span>Pathologie</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span>Symptôme</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span>Traitement</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500"></span>Médicament</span>
                </div>
                {/* Edge colors legend */}
                <div className="text-xs mt-1 flex flex-wrap gap-2 justify-end">
                    <span>🟢 Sympt→Patho</span>
                    <span>🟠 Sympt→Médic</span>
                    <span>🔴 Médic↔Médic</span>
                    <span>☠️ Contre-indic</span>
                </div>
                <p className="text-xs mt-1 text-purple-400">🖱️ Double-clic: définir comme centre</p>
            </div>

            {/* Tooltip on hover */}
            {
                hoveredNode && (
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
                )
            }

            {/* NODE ACTION MODAL */}
            {
                showNodeActionModal && actionNode && (
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

                                {/* Option 4: Create a group around this node */}
                                {!nodeGroups.has(actionNode.id) ? (
                                    <button
                                        onClick={() => {
                                            setShowNodeActionModal(false);
                                            if (onStartGroupCreation) {
                                                onStartGroupCreation(actionNode.id);
                                            }
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-3 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/30 rounded-lg text-left transition-colors"
                                    >
                                        <span className="text-2xl">📦</span>
                                        <div>
                                            <div className="font-medium text-white">Créer un groupe autour de ce nœud</div>
                                            <div className="text-xs text-gray-400">Les nœuds du groupe bougent ensemble</div>
                                        </div>
                                    </button>
                                ) : (
                                    <>
                                        {/* Button to add more nodes to existing group */}
                                        <button
                                            onClick={() => {
                                                setShowNodeActionModal(false);
                                                if (onStartGroupCreation) {
                                                    onStartGroupCreation(actionNode.id);
                                                }
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-3 bg-green-600/20 hover:bg-green-600/40 border border-green-500/30 rounded-lg text-left transition-colors"
                                        >
                                            <span className="text-2xl">➕</span>
                                            <div>
                                                <div className="font-medium text-white">Ajouter des nœuds au groupe</div>
                                                <div className="text-xs text-gray-400">{nodeGroups.get(actionNode.id)?.size || 0} nœuds actuellement dans ce groupe</div>
                                            </div>
                                        </button>

                                        {/* Button to dissolve group */}
                                        <button
                                            onClick={() => {
                                                setShowNodeActionModal(false);
                                                if (onDissolveGroup) {
                                                    onDissolveGroup(actionNode.id);
                                                }
                                            }}
                                            className="w-full flex items-center gap-3 px-4 py-3 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 rounded-lg text-left transition-colors"
                                        >
                                            <span className="text-2xl">💔</span>
                                            <div>
                                                <div className="font-medium text-white">Dissoudre le groupe</div>
                                                <div className="text-xs text-gray-400">Les nœuds redeviennent indépendants</div>
                                            </div>
                                        </button>
                                    </>
                                )}
                            </div>

                            <button
                                onClick={() => setShowNodeActionModal(false)}
                                className="mt-4 w-full py-2 text-sm text-gray-400 hover:text-white transition-colors"
                            >
                                Annuler
                            </button>
                        </div>
                    </div>
                )
            }

            {/* EDGE HOVER TOOLTIP */}
            {
                hoveredEdge && (
                    <div
                        className="absolute z-50 pointer-events-none animate-in fade-in-0 zoom-in-95 duration-150"
                        style={{
                            left: hoveredEdge.x,
                            top: hoveredEdge.y,
                            transform: 'translate(-50%, -100%)'
                        }}
                    >
                        <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-600 rounded-xl px-4 py-3 shadow-2xl">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-3 h-3 rounded-full" style={{
                                    backgroundColor: NODE_TYPE_COLORS[hoveredEdge.sourceNode.node_type?.toUpperCase() || ''] || '#94a3b8'
                                }} />
                                <span className="text-white font-medium text-sm">{hoveredEdge.sourceNode.name}</span>
                            </div>
                            <div className="flex items-center gap-2 px-2">
                                <div className="text-lg">↓</div>
                                <span className="text-xs font-bold px-2 py-1 rounded" style={{
                                    backgroundColor: hoveredEdge.edge.relationship.includes('CONTRA') || hoveredEdge.edge.relationship.includes('DANGER')
                                        ? '#ef444430'
                                        : hoveredEdge.edge.relationship.includes('TREAT') || hoveredEdge.edge.relationship.includes('IMPROVE')
                                            ? '#22c55e30'
                                            : '#f9731630',
                                    color: hoveredEdge.edge.relationship.includes('CONTRA') || hoveredEdge.edge.relationship.includes('DANGER')
                                        ? '#ef4444'
                                        : hoveredEdge.edge.relationship.includes('TREAT') || hoveredEdge.edge.relationship.includes('IMPROVE')
                                            ? '#22c55e'
                                            : '#f97316'
                                }}>
                                    {hoveredEdge.edge.relationship.replace(/_/g, ' ')}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <div className="w-3 h-3 rounded-full" style={{
                                    backgroundColor: NODE_TYPE_COLORS[hoveredEdge.targetNode.node_type?.toUpperCase() || ''] || '#94a3b8'
                                }} />
                                <span className="text-white font-medium text-sm">{hoveredEdge.targetNode.name}</span>
                            </div>
                            <div className="text-[10px] text-gray-500 mt-2 text-center">Cliquez pour analyse IA</div>
                        </div>
                    </div>
                )
            }

            {/* MULTI-SELECT MODE BAR */}
            {
                multiSelectMode && (
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
                )
            }

            {/* GROUP CREATION MODE BAR */}
            {
                groupCreationMode && currentGroupCenter && (
                    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-40 bg-gray-800/95 rounded-xl border border-amber-500/50 px-6 py-4 shadow-xl backdrop-blur-sm">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <span className="text-2xl">📦</span>
                                <div className="text-white">
                                    <span className="text-amber-400 font-bold">{(nodeGroups.get(currentGroupCenter)?.size || 0)}</span> nœuds dans le groupe
                                </div>
                            </div>
                            <div className="h-6 w-px bg-gray-600" />
                            <button
                                onClick={() => {
                                    if (onFinishGroupCreation) {
                                        onFinishGroupCreation();
                                    }
                                }}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                            >
                                ✓ Terminer le groupe
                            </button>
                            <button
                                onClick={() => {
                                    if (onDissolveGroup && currentGroupCenter) {
                                        onDissolveGroup(currentGroupCenter);
                                    }
                                    if (onFinishGroupCreation) {
                                        onFinishGroupCreation();
                                    }
                                }}
                                className="px-3 py-2 text-gray-400 hover:text-red-400 transition-colors"
                            >
                                ✕ Annuler
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-2">Cliquez sur les nœuds pour les ajouter au groupe</p>
                    </div>
                )
            }
        </div >
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

    // Chat state
    const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [isChatExpanded, setIsChatExpanded] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    // Reset chat when modal closes/reopens
    useEffect(() => {
        if (!isOpen) {
            setChatMessages([]);
            setChatInput('');
            setIsChatExpanded(false);
        }
    }, [isOpen]);

    // Auto-scroll chat to bottom
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatMessages]);

    // Send chat message
    const sendChatMessage = async () => {
        if (!chatInput.trim() || isChatLoading) return;

        const userMessage = chatInput.trim();
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsChatLoading(true);

        try {
            const { data, error } = await supabase.functions.invoke('graph-chat', {
                body: {
                    mode: 'analysis_qa',
                    message: userMessage,
                    context: {
                        analysisContent: explanation,
                        sourceNode: sourceNode?.name,
                        targetNode: targetNode?.name,
                        pathology,
                        conversationHistory: chatMessages
                    }
                }
            });

            if (error) throw error;

            setChatMessages(prev => [...prev, { role: 'assistant', content: data.message || 'Désolé, je n\'ai pas pu générer une réponse.' }]);
        } catch (err) {
            console.error('Chat error:', err);
            setChatMessages(prev => [...prev, { role: 'assistant', content: '❌ Erreur de communication avec l\'assistant. Veuillez réessayer.' }]);
        } finally {
            setIsChatLoading(false);
        }
    };

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

            <div className="relative bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[85vh] shadow-2xl flex flex-col overflow-hidden">
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
                <div className="p-4 overflow-y-auto flex-1 min-h-0">
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

                {/* Chat Section */}
                <div className="px-4 pb-4 flex-shrink-0">
                    {/* Expand/Collapse button */}
                    <button
                        onClick={() => setIsChatExpanded(!isChatExpanded)}
                        className="w-full py-2 px-3 bg-gray-800/50 hover:bg-gray-700/50 border border-gray-600/50 rounded-lg flex items-center justify-center gap-2 transition-all text-sm"
                    >
                        <MessageSquare className="w-4 h-4 text-cyan-400" />
                        <span className="text-gray-300">
                            {isChatExpanded ? 'Fermer le chat' : '💬 Des questions sur cette analyse ?'}
                        </span>
                    </button>

                    {/* Chat panel */}
                    {isChatExpanded && (
                        <div className="mt-3 border border-gray-600/50 rounded-lg bg-gray-800/30 overflow-hidden">
                            {/* Messages container */}
                            <div
                                ref={chatContainerRef}
                                className="max-h-[200px] overflow-y-auto p-3 space-y-3"
                            >
                                {chatMessages.length === 0 ? (
                                    <p className="text-gray-500 text-sm text-center py-4">
                                        Posez une question sur cette analyse...
                                    </p>
                                ) : (
                                    chatMessages.map((msg, i) => (
                                        <div
                                            key={i}
                                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            <div
                                                className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${msg.role === 'user'
                                                    ? 'bg-purple-600/50 text-white border border-purple-500/30'
                                                    : 'bg-gray-700/50 text-gray-200 border border-gray-600/30'
                                                    }`}
                                            >
                                                {msg.content}
                                            </div>
                                        </div>
                                    ))
                                )}
                                {isChatLoading && (
                                    <div className="flex justify-start">
                                        <div className="bg-gray-700/50 text-gray-400 px-3 py-2 rounded-lg text-sm border border-gray-600/30 flex items-center gap-2">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Réflexion...
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Input area */}
                            <div className="p-2 border-t border-gray-600/50 flex gap-2">
                                <input
                                    type="text"
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendChatMessage()}
                                    placeholder="Votre question..."
                                    className="flex-1 px-3 py-2 bg-gray-900/50 border border-gray-600/50 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
                                    disabled={isChatLoading}
                                />
                                <button
                                    onClick={sendChatMessage}
                                    disabled={isChatLoading || !chatInput.trim()}
                                    className="px-3 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all"
                                >
                                    <MessageSquare className="w-4 h-4" />
                                </button>
                            </div>
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
            // Linear expansion for 7-ring layout (User requested regular steps)
            // Linear expansion for 7-ring layout (User requested regular steps)
            const radius = ring === 0 ? 0 : (ring * ringRadius);
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
// GRAPH INTERACTIVE CHAT - Floating command chat panel
// ============================================

interface GraphChatProps {
    isOpen: boolean;
    graphNodes: RingNode[];
    graphEdges: RingEdge[];
    pathology: string;
    // Existing callbacks
    onCreateGroup: (nodeType: string, groupName: string, nodeNames?: string[]) => void;
    onFilterVisibility: (nodeName: string) => void;
    onAddNode: (nodeName: string) => void;
    onHighlightNode: (nodeName: string) => void;
    onResetView: () => void;
    // New callbacks
    onShowOnlyNodes: (nodeNames: string[]) => void;
    onShowOnlyNodeTypes: (nodeTypes: string[]) => void;
    onHideNodes: (nodeNames: string[]) => void;
    onArrangeLayout: (layout: 'corners' | 'grid' | 'radial') => void;
    onAutoGroupByType: () => void;
    onHideGroup: (groupName: string) => void;
    onShowOnlyGroup: (groupName: string) => void;
    onSetCentral: (nodeName: string) => void;
}

function GraphInteractiveChat({
    isOpen,
    graphNodes,
    graphEdges,
    pathology,
    onCreateGroup,
    onFilterVisibility,
    onAddNode,
    onHighlightNode,
    onResetView,
    onShowOnlyNodes,
    onShowOnlyNodeTypes,
    onHideNodes,
    onArrangeLayout,
    onAutoGroupByType,
    onHideGroup,
    onShowOnlyGroup,
    onSetCentral
}: GraphChatProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Reset on close
    useEffect(() => {
        if (!isOpen) {
            setIsExpanded(false);
            setMessages([]);
            setInput('');
        }
    }, [isOpen]);

    const sendCommand = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setIsLoading(true);

        try {
            const { data, error } = await supabase.functions.invoke('graph-chat', {
                body: {
                    mode: 'graph_command',
                    message: userMessage,
                    context: {
                        graphState: {
                            nodes: graphNodes.map(n => ({ id: n.id, name: n.name, node_type: n.node_type, ring: n.ring })),
                            edges: graphEdges.slice(0, 50).map(e => ({ id: e.id, source: e.source, target: e.target, relationship: e.relationship }))
                        },
                        pathology,
                        conversationHistory: messages
                    }
                }
            });

            if (error) throw error;

            const response = data.message || 'Commande exécutée.';
            setMessages(prev => [...prev, { role: 'assistant', content: response }]);

            // Execute action if present
            if (data.action) {
                const { type, params = {} } = data.action;
                switch (type) {
                    case 'CREATE_GROUP':
                        if (params?.nodeType) onCreateGroup(params.nodeType, params.groupName || params.nodeType, params?.nodeNames);
                        else if (params?.nodeNames?.length) onCreateGroup('custom', params.groupName || 'Groupe personnalisé', params.nodeNames);
                        break;
                    case 'FILTER_VISIBILITY':
                        if (params?.nodeName) onFilterVisibility(params.nodeName);
                        break;
                    case 'ADD_NODE':
                        if (params?.nodeName) onAddNode(params.nodeName);
                        break;
                    case 'HIGHLIGHT_NODE':
                        if (params?.nodeName) onHighlightNode(params.nodeName);
                        break;
                    case 'RESET_VIEW':
                        onResetView();
                        break;
                    // New action types
                    case 'SHOW_ONLY_NODES':
                        if (params?.nodeNames?.length) onShowOnlyNodes(params.nodeNames);
                        break;
                    case 'SHOW_ONLY_NODE_TYPES':
                        if (params?.nodeTypes?.length) onShowOnlyNodeTypes(params.nodeTypes);
                        break;
                    case 'HIDE_NODES':
                        if (params?.nodeNames?.length) onHideNodes(params.nodeNames);
                        break;
                    case 'ARRANGE_LAYOUT':
                        if (params?.layout) onArrangeLayout(params.layout);
                        break;
                    case 'AUTO_GROUP_BY_TYPE':
                        onAutoGroupByType();
                        break;
                    case 'HIDE_GROUP':
                        if (params?.groupName) onHideGroup(params.groupName);
                        break;
                    case 'SHOW_ONLY_GROUP':
                        if (params?.groupName) onShowOnlyGroup(params.groupName);
                        break;
                    case 'SET_CENTRAL':
                        if (params?.nodeName) onSetCentral(params.nodeName);
                        break;
                    // INFO_RESPONSE just displays the message
                }
            }
        } catch (err) {
            console.error('Graph chat error:', err);
            setMessages(prev => [...prev, { role: 'assistant', content: '❌ Erreur de communication. Réessayez.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="absolute bottom-4 right-4 z-50">
            {/* Toggle button */}
            {!isExpanded && (
                <button
                    onClick={() => setIsExpanded(true)}
                    className="w-14 h-14 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 border border-purple-400/30"
                    title="Chat avec le graphe"
                >
                    <MessageSquare className="w-6 h-6 text-white" />
                </button>
            )}

            {/* Expanded chat panel */}
            {isExpanded && (
                <div className="w-[380px] bg-gray-900/95 backdrop-blur-md rounded-xl border border-purple-500/30 shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="p-3 bg-gradient-to-r from-purple-900/50 to-indigo-900/50 border-b border-gray-700/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-purple-600/30 rounded-lg flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-purple-400" />
                            </div>
                            <div>
                                <h4 className="text-sm font-medium text-white">Assistant Graphe</h4>
                                <p className="text-[10px] text-gray-400">Contrôlez le graphe en langage naturel</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsExpanded(false)}
                            className="p-1.5 hover:bg-gray-700/50 rounded-lg transition-colors"
                        >
                            <X className="w-4 h-4 text-gray-400" />
                        </button>
                    </div>

                    {/* Quick commands */}
                    <div className="p-2 border-b border-gray-700/50 flex gap-1.5 flex-wrap">
                        {[
                            { label: '💊 Regrouper médicaments', cmd: 'Crée un groupe avec tous les médicaments' },
                            { label: '🔗 Voir interactions', cmd: 'Montre les interactions avec la pathologie centrale' },
                            { label: '🔄 Réinitialiser', cmd: 'Réinitialise la vue du graphe' }
                        ].map((quick, i) => (
                            <button
                                key={i}
                                onClick={() => { setInput(quick.cmd); }}
                                className="px-2 py-1 text-[10px] bg-gray-800/50 hover:bg-purple-600/30 border border-gray-600/30 rounded-full text-gray-300 transition-colors"
                            >
                                {quick.label}
                            </button>
                        ))}
                    </div>

                    {/* Messages */}
                    <div className="h-[200px] overflow-y-auto p-3 space-y-2">
                        {messages.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 text-sm">
                                <p>💬 Donnez une commande au graphe</p>
                                <p className="text-xs mt-2 text-gray-600">Ex: "Crée un groupe avec tous les symptômes"</p>
                            </div>
                        ) : (
                            messages.map((msg, i) => (
                                <div
                                    key={i}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${msg.role === 'user'
                                            ? 'bg-purple-600/40 text-white border border-purple-500/30'
                                            : 'bg-gray-800/60 text-gray-200 border border-gray-600/30'
                                            }`}
                                    >
                                        {msg.content}
                                    </div>
                                </div>
                            ))
                        )}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-gray-800/60 text-cyan-400 px-3 py-2 rounded-lg text-sm border border-cyan-500/20 flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Analyse...
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-2 border-t border-gray-700/50 flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendCommand()}
                            placeholder="Ex: Ajoute Aspirine au graphe..."
                            className="flex-1 px-3 py-2 bg-gray-800/50 border border-gray-600/50 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                            disabled={isLoading}
                        />
                        <button
                            onClick={sendCommand}
                            disabled={isLoading || !input.trim()}
                            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-all font-medium text-sm"
                        >
                            Envoyer
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================
// MAIN MODAL
// ============================================

interface RadialRingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    pathology?: string; // Single pathology (legacy)
    pathologies?: string[]; // Multiple pathologies for comorbidity analysis
    mode?: 'THERAPY' | 'SAFETY' | 'ETIOLOGY' | 'RELAPSE';
    context?: Record<string, any>;
    onSave?: (savedGraph: any) => void;
    initialData?: RadialRingsData;
    initialViewState?: any;
}

export default function RadialRingsModal({
    isOpen,
    onClose,
    pathology,
    pathologies = [],
    mode = 'ETIOLOGY',
    context,
    onSave,
    initialData,
    initialViewState
}: RadialRingsModalProps) {
    // Support both single pathology and array of pathologies
    const allPathologies = pathologies.length > 0 ? pathologies : (pathology ? [pathology] : []);
    const primaryPathology = allPathologies[0] || '';
    const isComorbidityMode = allPathologies.length > 1;

    const [data, setData] = useState<RadialRingsData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fromCache, setFromCache] = useState(false);
    const [animationTime, setAnimationTime] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [centralNode, setCentralNode] = useState<string>(primaryPathology); // Current center

    // Edge selection for explanation modal
    const [selectedEdge, setSelectedEdge] = useState<RingEdge | null>(null);
    const [selectedEdgeSource, setSelectedEdgeSource] = useState<RingNode | null>(null);
    const [selectedEdgeTarget, setSelectedEdgeTarget] = useState<RingNode | null>(null);
    const [multiNodesForAnalysis, setMultiNodesForAnalysis] = useState<RingNode[]>([]);
    const [showLinkModal, setShowLinkModal] = useState(false);

    // Edge filter mode: 'all' shows all edges, 'central-only' = central node, 'selected-only' = selected node
    const [edgeFilterMode, setEdgeFilterMode] = useState<'all' | 'central-only' | 'selected-only'>('all');

    // Dragging state for center nodes
    const [dragOffsets, setDragOffsets] = useState<Map<string, { x: number, y: number }>>(new Map());
    const [draggingNode, setDraggingNode] = useState<string | null>(null);

    // Refs for interaction
    const containerRef = useRef<HTMLDivElement>(null);
    const [centralNodeId, setCentralNodeId] = useState<string | null>(null);
    const [filterSelectedNodeId, setFilterSelectedNodeId] = useState<string | null>(null);

    // Focus mode: dim unconnected nodes and edges when a node is selected
    const [focusMode, setFocusMode] = useState(true);

    // Comorbidity mode: track which pathologies are active for filtering
    const [activePathologies, setActivePathologies] = useState<Set<string>>(new Set(allPathologies));

    // Progressive reveal: nodes appear one by one
    const [visibleNodeCount, setVisibleNodeCount] = useState(0);

    // Streaming: track newly spawned nodes for holographic animation
    const [newlySpawnedNodes, setNewlySpawnedNodes] = useState<Set<string>>(new Set());

    // Queue for smooth rendering (0.2s delay per node)
    const nodeQueueRef = useRef<RingNode[]>([]);
    const queueIntervalRef = useRef<NodeJS.Timeout | null>(null);

    // View Controls
    const [nodeSpacing, setNodeSpacing] = useState(40); // Repulsion strength factor
    const [nodeSizeScale, setNodeSizeScale] = useState(1.0);
    const [hiddenNodeTypes, setHiddenNodeTypes] = useState<Set<string>>(new Set());
    const [hiddenRelationTypes, setHiddenRelationTypes] = useState<Set<string>>(new Set());
    const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set()); // Individual node hiding
    const [customNodePositions, setCustomNodePositions] = useState<Map<string, { x: number, y: number }>>(new Map()); // Chat-controlled positions

    // Initialize state from initialViewState if provided
    useEffect(() => {
        if (initialViewState) {
            if (initialViewState.layoutParams) {
                // We might need to lift layoutParams state up or handle it here if it was exposed
                // Assuming layoutParams state exists or we interact with setters if exposed
            }
            if (initialViewState.hiddenNodes) setHiddenNodes(new Set(initialViewState.hiddenNodes as string[]));
            if (initialViewState.customNodePositions) {
                const map = new Map<string, { x: number, y: number }>();
                Object.entries(initialViewState.customNodePositions).forEach(([k, v]: [string, any]) => map.set(k, v));
                setCustomNodePositions(map);
            }
            if (initialViewState.cameraPosition) {
                // If we had camera control exposed, we'd set it here
            }
        }
    }, [initialViewState]);

    // ============================================
    // DEEP ANALYSIS FEATURE
    // Analyze graph and highlight optimal treatment schema in gold
    // ============================================
    const [isDeepAnalyzing, setIsDeepAnalyzing] = useState(false);
    const [deepAnalysisMode, setDeepAnalysisMode] = useState(false);
    const [goldenNodeIds, setGoldenNodeIds] = useState<Set<string>>(new Set());
    const [deepAnalysisResult, setDeepAnalysisResult] = useState<string | null>(null);

    // Highlighted nodes (neighbors of selected node)
    const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());

    // ============================================
    // NODE GROUPING FEATURE
    // Groups allow clustering nodes around a center node
    // When the center moves, all members move together
    // ============================================

    // Map: centerNodeId -> Set of member node IDs that orbit around it
    const [nodeGroups, setNodeGroups] = useState<Map<string, Set<string>>>(new Map());

    // ============================================
    // SELECTION TOOLS STATE
    // ============================================
    const [selectionMode, setSelectionMode] = useState<'cursor' | 'lasso' | 'circle' | 'rectangle'>('cursor');
    const [multiSelectedNodeIds, setMultiSelectedNodeIds] = useState<Set<string>>(new Set());
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectionPoints, setSelectionPoints] = useState<{ x: number; y: number }[]>([]);
    const selectionStartRef = useRef<{ x: number; y: number } | null>(null);

    // Group creation mode: when true, clicking nodes adds them to the current group
    const [groupCreationMode, setGroupCreationMode] = useState(false);
    const [currentGroupCenter, setCurrentGroupCenter] = useState<string | null>(null);

    // Helper: Find which group (if any) a node belongs to
    const getNodeGroupCenter = useCallback((nodeId: string): string | null => {
        for (const [centerId, members] of nodeGroups.entries()) {
            if (centerId === nodeId || members.has(nodeId)) {
                return centerId;
            }
        }
        return null;
    }, [nodeGroups]);

    // Create a new group with selected node as center
    const startGroupCreation = useCallback((centerId: string) => {
        setGroupCreationMode(true);
        setCurrentGroupCenter(centerId);
        // Initialize group with just the center
        setNodeGroups(prev => {
            const next = new Map(prev);
            if (!next.has(centerId)) {
                next.set(centerId, new Set());
            }
            return next;
        });
    }, []);

    // Add a node to the current group being created
    const addNodeToGroup = useCallback((nodeId: string) => {
        if (!currentGroupCenter || nodeId === currentGroupCenter) return;

        // Remove from any existing group first
        setNodeGroups(prev => {
            const next = new Map(prev);
            // Remove from old group if exists
            for (const [, members] of next.entries()) {
                members.delete(nodeId);
            }
            // Add to current group
            const members = next.get(currentGroupCenter) || new Set();
            members.add(nodeId);
            next.set(currentGroupCenter, members);
            return next;
        });
    }, [currentGroupCenter]);

    // Finish group creation mode
    const finishGroupCreation = useCallback(() => {
        setGroupCreationMode(false);
        setCurrentGroupCenter(null);
    }, []);

    // Dissolve a group
    const dissolveGroup = useCallback((centerId: string) => {
        setNodeGroups(prev => {
            const next = new Map(prev);
            next.delete(centerId);
            return next;
        });
    }, []);

    // Create a group with multiple nodes at once (for chat commands)
    const createGroupWithNodes = useCallback((centerNodeId: string, memberNodeIds: string[]) => {
        setNodeGroups(prev => {
            const next = new Map(prev);
            const members = new Set(memberNodeIds.filter(id => id !== centerNodeId));
            next.set(centerNodeId, members);
            return next;
        });
    }, []);

    // ============================================
    // DEEP ANALYSIS - AI-powered optimal treatment schema
    // ============================================
    const handleDeepAnalysis = useCallback(async () => {
        if (!data || isDeepAnalyzing) return;

        setIsDeepAnalyzing(true);
        setDeepAnalysisMode(false);
        setGoldenNodeIds(new Set());
        setDeepAnalysisResult(null);

        try {
            // Prepare graph context for AI analysis
            const nodesContext = data.knowledge_graph.nodes.map(n => ({
                id: n.id,
                name: n.name,
                type: n.node_type,
                ring: n.ring
            }));

            const edgesContext = data.knowledge_graph.edges.slice(0, 100).map(e => ({
                source: typeof e.source === 'object' ? (e.source as any).id : e.source,
                target: typeof e.target === 'object' ? (e.target as any).id : e.target,
                relationship: e.relationship,
                evidence: e.evidence_grade
            }));

            // Call AI to analyze optimal treatment
            const { data: aiResponse, error } = await supabase.functions.invoke('causal-reasoning', {
                body: {
                    query: `Analyse ce graphe de connaissances médicales pour la pathologie "${primaryPathology}".

NŒUDS DISPONIBLES:
${nodesContext.map(n => `- ${n.name} (${n.type}, ID: ${n.id})`).join('\n')}

RELATIONS:
${edgesContext.map(e => `- ${e.source} → ${e.target}: ${e.relationship}`).join('\n')}

MISSION CRITIQUE:
1. Identifie le MEILLEUR SCHÉMA DE TRAITEMENT pour guérir ou gérer cette pathologie
2. Sélectionne les nœuds les plus importants (médicaments, traitements, mécanismes clés)
3. Ignore les nœuds non pertinents ou dangereux (contre-indications)

RÉPONDS EN JSON STRICT:
{
    "optimal_node_ids": ["id1", "id2", ...],
    "treatment_summary": "Résumé du schéma thérapeutique optimal",
    "rationale": "Explication de pourquoi ces nœuds sont optimaux"
}

IMPORTANT: Retourne UNIQUEMENT les IDs des nœuds qui forment le schéma thérapeutique optimal. Maximum 10 nœuds.`,
                    context: {
                        pathology: primaryPathology,
                        graph_size: { nodes: nodesContext.length, edges: edgesContext.length }
                    }
                }
            });

            if (error) throw error;

            // Parse AI response
            const analysisText = aiResponse?.analysis || aiResponse?.explanation || '';
            const jsonMatch = analysisText.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                const optimalIds = new Set(parsed.optimal_node_ids || []);

                setGoldenNodeIds(optimalIds);
                setDeepAnalysisResult(parsed.treatment_summary || 'Schéma thérapeutique optimal identifié');
                setDeepAnalysisMode(true);

                console.log(`[Deep Analysis] Identified ${optimalIds.size} optimal nodes:`, parsed.optimal_node_ids);
            } else {
                throw new Error('Invalid AI response format');
            }

        } catch (err) {
            console.error('[Deep Analysis] Error:', err);
            setDeepAnalysisResult('Erreur lors de l\'analyse. Réessayez.');
        } finally {
            setIsDeepAnalyzing(false);
        }
    }, [data, primaryPathology, isDeepAnalyzing]);

    // Exit deep analysis mode
    const exitDeepAnalysisMode = useCallback(() => {
        setDeepAnalysisMode(false);
        setGoldenNodeIds(new Set());
        setDeepAnalysisResult(null);
    }, []);

    // Search & Isolate State
    const [searchQuery, setSearchQuery] = useState('');

    const searchResults = useMemo(() => {
        if (!searchQuery || !data) return [];
        return data.knowledge_graph.nodes
            .filter(n => (n.name || n.id).toLowerCase().includes(searchQuery.toLowerCase()))
            .slice(0, 5);
    }, [data, searchQuery]);

    const handleSearchSelect = (nodeId: string) => {
        setSelectedNodeId(nodeId);
        setFocusMode(true);
        setSearchQuery('');

        // Calculate highlighted (connected) nodes so they remain visible in Focus Mode
        if (data) {
            const connectedIds = new Set<string>();
            data.knowledge_graph.edges.forEach(edge => {
                const s = typeof edge.source === 'object' ? (edge.source as any).id : edge.source;
                const t = typeof edge.target === 'object' ? (edge.target as any).id : edge.target;

                if (s === nodeId) connectedIds.add(String(t));
                if (t === nodeId) connectedIds.add(String(s));
            });
            setHighlightedNodeIds(connectedIds);
        }
    };

    const toggleNodeType = (type: string) => {
        setHiddenNodeTypes(prev => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    };

    const toggleRelationType = (type: string) => {
        setHiddenRelationTypes(prev => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    };

    // Helper to map UI categories to internal types
    const getNodeTypes = (category: string): string[] => {
        switch (category) {
            case 'Médicament': return ['DRUG', 'MEDICATION'];
            case 'Traitement': return ['TREATMENT'];
            case 'Symptôme': return ['SYMPTOM'];
            case 'Pathologie': return ['PATHOLOGY'];
            case 'Complication': return ['COMPLICATION'];
            case 'Analyses': return ['LAB'];
            case 'Suggestion': return ['GUIDELINE', 'EVIDENCE', 'LIFESTYLE'];
            default: return [category];
        }
    };

    const getRelationTypes = (category: string): string[] => {
        switch (category) {
            case 'Traite': return ['TREATS', 'IMPROVES', 'PREVENTS', 'MANAGEMENT'];
            case 'Effet indésirable': return ['SIDE_EFFECT', 'CAUSES'];
            case 'Effet léger': return ['MILD_EFFECT'];
            case 'Contre-indiqué': return ['CONTRAINDICATION', 'DANGEROUS', 'TOXIC'];
            case 'Interaction': return ['INTERACTS'];
            default: return [category];
        }
    };

    // Extract all unique relation types from data
    const availableRelationTypes = useMemo(() => {
        if (!data) return [];
        const types = new Set<string>();
        data.knowledge_graph.edges.forEach(e => {
            if (e.relationship) types.add(e.relationship);
        });
        return Array.from(types).sort();
    }, [data]);

    const filteredGraphData = useMemo(() => {
        if (!data) return { nodes: [], edges: [] };

        // 1. First pass: Filter nodes by Node Type
        const potentialNodes = data.knowledge_graph.nodes.filter(n => {
            const categories = ['Médicament', 'Traitement', 'Symptôme', 'Pathologie', 'Complication', 'Analyses', 'Suggestion'];
            for (const cat of categories) {
                if (hiddenNodeTypes.has(cat)) {
                    const internalTypes = getNodeTypes(cat);
                    const nodeType = (n.node_type || '').toUpperCase();
                    if (internalTypes.includes(nodeType)) return false;
                }
            }
            return true;
        });
        const potentialNodeIds = new Set(potentialNodes.map(n => n.id));

        // 2. Filter Edges by Relation Type (Dynamic) AND visible nodes
        const activeEdges = data.knowledge_graph.edges.filter(e => {
            // Node visibility check
            if (!potentialNodeIds.has(typeof e.source === 'object' ? (e.source as any).id : e.source)) return false;
            if (!potentialNodeIds.has(typeof e.target === 'object' ? (e.target as any).id : e.target)) return false;

            // Relation visibility check - DIRECT CHECK against raw types
            if (e.relationship && hiddenRelationTypes.has(e.relationship)) return false;

            return true;
        });

        // 3. Second pass: Filter Nodes that have NO active edges (Strict Mode)
        // Unless it's the central node (Ring 0)
        const connectedNodeIds = new Set<string>();
        activeEdges.forEach(e => {
            connectedNodeIds.add(typeof e.source === 'object' ? (e.source as any).id : e.source);
            connectedNodeIds.add(typeof e.target === 'object' ? (e.target as any).id : e.target);
        });

        const activeNodes = potentialNodes.filter(n => {
            // Always keep central node
            if (n.ring === 0) return true;
            // Keep node if it's connected
            return connectedNodeIds.has(n.id);
        });

        return { nodes: activeNodes, edges: activeEdges };
    }, [data, hiddenNodeTypes, hiddenRelationTypes]);

    const displayData = useMemo(() => {
        if (!data) return null;
        return {
            ...data,
            knowledge_graph: {
                nodes: filteredGraphData.nodes,
                edges: filteredGraphData.edges
            }
        };
    }, [data, filteredGraphData]);

    const animationRef = useRef<number>();
    const startTimeRef = useRef<number>(0);
    const revealIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);

    // Check WebGL on mount
    useEffect(() => {
        setWebglAvailable(isWebGLAvailable());
    }, []);

    useEffect(() => {
        if (isOpen && allPathologies.length > 0) {
            setCentralNode(primaryPathology);
            if (initialData) {
                setData(initialData);
                setFromCache(true);
                // Also trigger rapid "spawn" effect for loaded nodes so they appear
                if (initialData.knowledge_graph?.nodes) {
                    // Ensure nodes are in queue or just set visible immediately
                    setVisibleNodeCount(initialData.knowledge_graph.nodes.length);
                }
            } else {
                fetchData(allPathologies);
            }
        }
        return () => { if (animationRef.current) cancelAnimationFrame(animationRef.current); };
    }, [isOpen, allPathologies.join(',')]);

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

    // Progressive node reveal: nodes appear one by one for holographic effect
    useEffect(() => {
        if (!data?.knowledge_graph.nodes.length) return;

        // Clear any existing interval
        if (revealIntervalRef.current) {
            clearInterval(revealIntervalRef.current);
        }

        // Reset visible count
        setVisibleNodeCount(0);
        const totalNodes = data.knowledge_graph.nodes.length;

        // Reveal nodes progressively
        revealIntervalRef.current = setInterval(() => {
            setVisibleNodeCount(prev => {
                if (prev >= totalNodes) {
                    if (revealIntervalRef.current) clearInterval(revealIntervalRef.current);
                    return prev;
                }
                return prev + 1;
            });
        }, 40); // 40ms between each node = ~25 nodes/second

        return () => {
            if (revealIntervalRef.current) clearInterval(revealIntervalRef.current);
        };
    }, [data]);

    // transformNode and transformEdge are now imported from @/utils/graphUtils

    // Process node queue for smooth rendering
    useEffect(() => {
        queueIntervalRef.current = setInterval(() => {
            if (nodeQueueRef.current.length > 0) {
                const nextNode = nodeQueueRef.current.shift();
                if (nextNode) {
                    setData(prev => {
                        // If no data yet (should rarely happen with instant load), create structure
                        if (!prev) return {
                            knowledge_graph: { nodes: [nextNode], edges: [] },
                            micro_signals: [],
                            hypotheses: []
                        };

                        // Avoid duplicates and handle central node replacement
                        let nodes = prev.knowledge_graph.nodes;

                        // If successful fetch brings the real central node (Ring 0), remove the placeholder
                        if (nextNode.ring === 0 && nextNode.id !== 'central-init') {
                            nodes = nodes.filter(n => n.id !== 'central-init');
                        }

                        if (nodes.some(n => n.id === nextNode.id)) return prev;

                        return {
                            ...prev,
                            knowledge_graph: {
                                ...prev.knowledge_graph,
                                nodes: [...nodes, nextNode]
                            }
                        };
                    });

                    // Trigger holographic animation
                    setNewlySpawnedNodes(prev => new Set([...prev, nextNode.id]));
                    setTimeout(() => {
                        setNewlySpawnedNodes(prev => {
                            const next = new Set(prev);
                            next.delete(nextNode.id);
                            return next;
                        });
                    }, 2000);
                }
            }
        }, 200);

        return () => {
            if (queueIntervalRef.current) clearInterval(queueIntervalRef.current);
        };
    }, []);

    const fetchData = async (pathologies: string[]) => {
        // Initialize with central nodes for ALL pathologies (Dual Graph Init)
        const initialNodes: RingNode[] = pathologies.map((p, i) => ({
            id: `central-init-${i}`,
            ring: 0,
            lane: 'pathology',
            name: p,
            node_type: 'PATHOLOGY',
            properties: { description: 'Initialisation...', source: 'System' },
            proximity_score: 1,
            evidence_grade: 'A',
            translation_gap: false,
            parent_pathology: p
        }));

        setData({
            knowledge_graph: { nodes: initialNodes, edges: [] },
            micro_signals: [],
            hypotheses: []
        });

        setIsLoading(true);
        setError(null);
        setFromCache(false);
        setAnimationTime(0);
        startTimeRef.current = 0;
        setNewlySpawnedNodes(new Set());
        nodeQueueRef.current = [];

        try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token || supabaseKey;

            // Worker function to fetch and stream a single pathology graph
            const fetchPathologyStream = async (pathology: string) => {
                const response = await fetch(`${supabaseUrl}/functions/v1/deep-research-graph`, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                        'apikey': supabaseKey
                    },
                    method: 'POST',
                    body: JSON.stringify({
                        topic: pathology,
                        pathologies: [pathology],
                        isComorbidityAnalysis: false, // Independent generation for full twin graphs
                        max_nodes: 100,
                        include_pubmed: true,
                        include_fda: true,
                        streaming: true
                    })
                });

                if (!response.ok) {
                    let errorMessage = `HTTP ${response.status}`;
                    try {
                        const errorData = await response.json();
                        errorMessage = errorData.details || errorData.error || errorMessage;
                    } catch (e) {
                        try {
                            const errorText = await response.text();
                            if (errorText) errorMessage = errorText;
                        } catch (textErr) { }
                    }
                    throw new Error(errorMessage);
                }
                if (!response.body) throw new Error('No response body');

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        const cleanedLine = line.trim();
                        if (!cleanedLine.startsWith('data: ')) continue;
                        try {
                            const eventData = JSON.parse(cleanedLine.slice(6));

                            // Handle Node Events
                            if (eventData.type === 'cached' || eventData.type === 'node') {
                                const nodes = eventData.type === 'cached' ? eventData.nodes : [eventData.node];
                                nodes.forEach((n: any) => {
                                    // CRITICAL: Tag node with current pathology for Twin Layout distribution
                                    n.parent_pathology = pathology;
                                    const trNode = transformNode(n, allPathologies, primaryPathology);
                                    nodeQueueRef.current.push(trNode);
                                });

                                if (eventData.type === 'cached') {
                                    setFromCache(true);
                                    const edges = eventData.edges.map(transformEdge);
                                    setData(prev => prev ? ({
                                        ...prev,
                                        knowledge_graph: {
                                            ...prev.knowledge_graph,
                                            edges: [...prev.knowledge_graph.edges, ...edges]
                                        }
                                    }) : null);
                                }
                            }
                            // Handle Edge Events
                            else if (eventData.type === 'edges') {
                                const newEdges = eventData.edges.map(transformEdge);
                                setData(prev => prev ? ({
                                    ...prev,
                                    knowledge_graph: {
                                        ...prev.knowledge_graph,
                                        edges: [...prev.knowledge_graph.edges, ...newEdges]
                                    }
                                }) : null);
                            }
                        } catch (e) { console.warn(e); }
                    }
                }
            };

            // Execute parallel fetches for all pathologies
            await Promise.all(pathologies.map(p => fetchPathologyStream(p)));
            setIsLoading(false);

        } catch (err) {
            console.error('[DEEP-RESEARCH] Error:', err);
            setError(String(err));
            setIsLoading(false);
        }
    };

    // Expand graph progressively from a node (MIND MAP BEHAVIOR)
    // Uses deep-research-graph for comprehensive expansion with progressive animation
    const [isExpanding, setIsExpanding] = useState(false);
    const [expandingNodeName, setExpandingNodeName] = useState<string | null>(null);

    const handleSetCentral = async (nodeId: string) => {
        if (!data) return;
        const node = data.knowledge_graph.nodes.find(n => n.id === nodeId);
        if (!node) return;

        setIsExpanding(true);
        setExpandingNodeName(node.name);
        // NOTE: Do NOT set isLoading here - we want to keep the graph visible during expansion

        try {
            // Prepare existing nodes for cross-link analysis
            // Send node names and types so Claude can identify relevant cross-links
            const existingNodesForCrossLink = data.knowledge_graph.nodes
                .filter(n => n.id !== nodeId) // Exclude the node we're expanding from
                .map(n => ({
                    name: n.name,
                    node_type: n.node_type || n.lane || 'UNKNOWN'
                }));

            console.log(`[EXPAND] Sending ${existingNodesForCrossLink.length} existing nodes for cross-link analysis`);

            // Call deep-research-graph for comprehensive expansion
            const response = await supabase.functions.invoke('deep-research-graph', {
                body: {
                    topic: node.name,
                    max_nodes: 100,
                    include_pubmed: true,
                    include_fda: true,
                    // NEW: Send existing nodes for cross-link analysis
                    existing_nodes: existingNodesForCrossLink
                }
            });

            if (response.error) throw response.error;

            const result = response.data;
            console.log('[EXPAND] Deep research result:', result);

            // Map node types to rings
            // Map node types to rings - Consistent with transformNode
            // Transform new nodes using centralized logic
            const newNodes: RingNode[] = result.nodes.map((n: any) => {
                n.parent_pathology = node.parent_pathology; // Interit parent pathology
                return transformNode(n, allPathologies, primaryPathology);
            });

            // Build maps for resolving node references
            // Claude may reference nodes by ID (c0, d1, s1) or by name (for cross-links to existing nodes)
            const newNodeIdToName = new Map<string, string>();
            const newNodeNameToId = new Map<string, string>();
            newNodes.forEach(n => {
                newNodeIdToName.set(n.id, n.name);
                newNodeNameToId.set(n.name.toLowerCase(), n.id);
            });

            // Also map existing nodes by name for cross-link resolution
            const existingNodeNameToId = new Map<string, string>();
            data.knowledge_graph.nodes.forEach(n => {
                existingNodeNameToId.set(n.name.toLowerCase(), n.id);
            });

            // Combine both maps for edge resolution
            const allNodeNameToId = new Map<string, string>([...existingNodeNameToId, ...newNodeNameToId]);

            // Transform new edges with cross-link resolution
            const newEdges: RingEdge[] = result.edges.map((e: any) => {
                // Resolve source: could be an ID (c0, d1) or a node name (for cross-links)
                let sourceId = e.source_id;
                let targetId = e.target_id;

                // Try to resolve by name if the ID doesn't match a new node
                if (!newNodeIdToName.has(sourceId)) {
                    const resolvedId = allNodeNameToId.get(sourceId.toLowerCase());
                    if (resolvedId) sourceId = resolvedId;
                }
                if (!newNodeIdToName.has(targetId)) {
                    const resolvedId = allNodeNameToId.get(targetId.toLowerCase());
                    if (resolvedId) targetId = resolvedId;
                }

                return {
                    id: `${sourceId}-${targetId}`,
                    source: sourceId,
                    target: targetId,
                    relationship: e.edge_type,
                    weight: e.weight || 0.5,
                    evidence_grade: e.weight > 0.8 ? 'A' : e.weight > 0.5 ? 'B' : 'C',
                    translation_gap: false
                };
            });

            // Merge with existing nodes, avoiding duplicates
            const existingNodeNames = new Set(data.knowledge_graph.nodes.map(n => n.name.toLowerCase()));
            const nodesToAdd = newNodes.filter(n => !existingNodeNames.has(n.name.toLowerCase()));

            // Add nodes progressively with COSMIC STREAMING animation
            let currentNodes = [...data.knowledge_graph.nodes];
            let currentEdges = [...data.knowledge_graph.edges];

            // Clear any previous spawn markers
            setNewlySpawnedNodes(new Set());

            // Add nodes one by one with visible streaming delay
            // ONLY use edges from Claude API - no automatic RELATED_TO edges
            for (let i = 0; i < nodesToAdd.length; i++) {
                const newNode = nodesToAdd[i];
                currentNodes = [...currentNodes, newNode];

                // Mark this node as newly spawned for cosmic animation
                setNewlySpawnedNodes(prev => new Set([...prev, newNode.id]));

                // Add ONLY edges from Claude that now have both endpoints (real semantic links)
                const currentNodeIds = new Set(currentNodes.map(n => n.id));
                const relevantEdges = newEdges.filter(e =>
                    currentNodeIds.has(e.source) &&
                    currentNodeIds.has(e.target) &&
                    !currentEdges.some(ce => ce.id === e.id ||
                        (ce.source === e.source && ce.target === e.target) ||
                        (ce.source === e.target && ce.target === e.source))
                );

                if (relevantEdges.length > 0) {
                    console.log(`[EXPAND] Adding ${relevantEdges.length} semantic edges from Claude`);
                }
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

            // FINAL PASS: Add any remaining cross-links that may have been missed
            const finalNodeIds = new Set(currentNodes.map(n => n.id));
            const remainingCrossLinks = newEdges.filter(e =>
                finalNodeIds.has(e.source) &&
                finalNodeIds.has(e.target) &&
                !currentEdges.some(ce => ce.id === e.id ||
                    (ce.source === e.source && ce.target === e.target) ||
                    (ce.source === e.target && ce.target === e.source))
            );

            if (remainingCrossLinks.length > 0) {
                console.log(`[EXPAND] Final pass: Adding ${remainingCrossLinks.length} remaining cross-links`);
                currentEdges = [...currentEdges, ...remainingCrossLinks];
                setData({
                    ...data,
                    knowledge_graph: { nodes: currentNodes, edges: currentEdges }
                });
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
            await fetchData([node.name]);
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
                {/* Header - Responsive */}
                <div className="absolute top-2 sm:top-4 left-2 sm:left-4 right-2 sm:right-4 z-20 flex justify-between items-start gap-2">
                    <div className="bg-gray-900/95 rounded-lg sm:rounded-xl border border-gray-700/50 p-2 sm:p-4 backdrop-blur-sm max-w-[60%] sm:max-w-none">
                        <h2 className="text-sm sm:text-xl font-bold text-white flex items-center gap-1 sm:gap-2">
                            🕸️ <span className="hidden xs:inline">Mind Map</span> Sémantique
                        </h2>
                        <p className="text-purple-400 text-xs sm:text-sm mt-0.5 sm:mt-1 truncate">{centralNode}</p>
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
                                <div className="flex gap-2 sm:gap-3 mt-1 sm:mt-2 text-[10px] sm:text-xs">
                                    <span className="text-green-400">{uniqueNodeCount} nœuds</span>
                                    <span className="text-blue-400">{uniqueEdgeCount} liens</span>
                                </div>
                            );
                        })()}
                        {/* Hide help text on mobile */}
                        <div className="hidden md:block text-gray-500 text-xs mt-2 space-y-0.5">
                            <p>🖱️ <span className="text-gray-400">1 clic</span> = sélectionner + voir connexions</p>
                            <p>🖱️ <span className="text-gray-400">2ème clic</span> = analyse IA du lien</p>
                            <p>🖱️ <span className="text-gray-400">Double-clic</span> = ajouter des nœuds liés</p>
                        </div>
                    </div>

                    {/* Control buttons - Responsive */}
                    <div className="flex gap-1 sm:gap-2">
                        <button onClick={handleReplay} className="bg-gray-800/90 hover:bg-gray-700 text-white p-1.5 sm:p-2.5 rounded-lg touch-manipulation" title="Rejouer">
                            <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                        <button onClick={() => setIsPaused(!isPaused)} className="bg-gray-800/90 hover:bg-gray-700 text-white p-1.5 sm:p-2.5 rounded-lg touch-manipulation" title={isPaused ? 'Lecture' : 'Pause'}>
                            {isPaused ? <Play className="w-4 h-4 sm:w-5 sm:h-5" /> : <Pause className="w-4 h-4 sm:w-5 sm:h-5" />}
                        </button>
                        <button onClick={handleClose} className="bg-red-600/90 hover:bg-red-500 text-white p-1.5 sm:p-2.5 rounded-lg touch-manipulation" title="Fermer">
                            <X className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                    </div>
                </div>

                {/* Groups Panel - Left Side - Responsive */}
                {nodeGroups.size > 0 && (
                    <div className="absolute top-20 sm:top-28 left-1 sm:left-4 z-20 bg-gray-900/95 rounded-lg sm:rounded-xl border border-amber-500/30 p-2 sm:p-3 text-[10px] sm:text-xs min-w-[140px] sm:min-w-[180px] max-w-[160px] sm:max-w-[220px] max-h-[40vh] sm:max-h-[60vh] overflow-y-auto backdrop-blur-sm">
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-700/50">
                            <span className="text-lg">📦</span>
                            <h3 className="text-white font-medium">Groupes ({nodeGroups.size})</h3>
                        </div>

                        <div className="space-y-2">
                            {Array.from(nodeGroups.entries()).map(([centerId, members]) => {
                                const centerNode = data?.knowledge_graph.nodes.find(n => n.id === centerId);
                                const centerName = centerNode?.name || centerId;

                                return (
                                    <div
                                        key={centerId}
                                        className="bg-gray-800/80 rounded-lg p-2 border border-gray-700/50 hover:border-amber-500/50 transition-colors"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-white font-medium text-[11px] truncate" title={centerName}>
                                                    🎯 {centerName}
                                                </div>
                                                <div className="text-gray-400 text-[10px]">
                                                    {members.size} nœud{members.size > 1 ? 's' : ''} groupé{members.size > 1 ? 's' : ''}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Group members list */}
                                        {members.size > 0 && (
                                            <div className="mt-2 pt-2 border-t border-gray-700/50">
                                                <div className="text-[9px] text-gray-500 mb-1">Membres:</div>
                                                <div className="flex flex-wrap gap-1">
                                                    {Array.from(members).slice(0, 5).map(memberId => {
                                                        const memberNode = data?.knowledge_graph.nodes.find(n => n.id === memberId);
                                                        return (
                                                            <span
                                                                key={memberId}
                                                                className="px-1.5 py-0.5 bg-gray-700 rounded text-[9px] text-gray-300 truncate max-w-[80px]"
                                                                title={memberNode?.name || memberId}
                                                            >
                                                                {memberNode?.name?.slice(0, 10) || memberId.slice(0, 8)}...
                                                            </span>
                                                        );
                                                    })}
                                                    {members.size > 5 && (
                                                        <span className="px-1.5 py-0.5 bg-gray-600 rounded text-[9px] text-gray-400">
                                                            +{members.size - 5}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Action buttons */}
                                        <div className="flex gap-1 mt-2">
                                            <button
                                                onClick={() => startGroupCreation(centerId)}
                                                className="flex-1 px-2 py-1 bg-green-600/30 hover:bg-green-600/50 text-green-300 text-[9px] rounded transition-colors"
                                                title="Ajouter des nœuds"
                                            >
                                                ➕ Ajouter
                                            </button>
                                            <button
                                                onClick={() => dissolveGroup(centerId)}
                                                className="flex-1 px-2 py-1 bg-red-600/30 hover:bg-red-600/50 text-red-300 text-[9px] rounded transition-colors"
                                                title="Dissoudre le groupe"
                                            >
                                                💔 Dissoudre
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-3 pt-2 border-t border-gray-700/50 text-[9px] text-gray-500">
                            💡 Déplacez le nœud central pour bouger tout le groupe
                        </div>
                    </div>
                )}

                {/* Semantic Legend - Responsive */}
                <div className="absolute top-20 sm:top-28 right-1 sm:right-4 z-20 bg-gray-900/95 rounded-lg sm:rounded-xl border border-gray-700/50 p-2 sm:p-3 text-[10px] sm:text-xs max-w-[140px] sm:max-w-[200px] max-h-[50vh] sm:max-h-[80vh] overflow-y-auto overflow-x-visible backdrop-blur-sm">

                    {/* Node Search */}
                    <div className="mb-3 relative">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2 top-1.5 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Rechercher..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg py-1 pl-7 pr-2 text-white text-[10px] focus:ring-1 focus:ring-purple-500 outline-none"
                            />
                        </div>

                        {/* Search Results Dropdown */}
                        {searchQuery && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 rounded-lg border border-gray-700 shadow-xl z-50 overflow-hidden">
                                {searchResults.length > 0 ? (
                                    searchResults.map(node => (
                                        <button
                                            key={node.id}
                                            onClick={() => handleSearchSelect(node.id)}
                                            className="w-full text-left px-3 py-2 hover:bg-gray-700 text-gray-300 transition-colors flex items-center gap-2 border-b border-gray-700/50 last:border-0"
                                        >
                                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: NODE_TYPE_COLORS[node.node_type || ''] || '#fff' }} />
                                            <span className="truncate">{node.name}</span>
                                        </button>
                                    ))
                                ) : (
                                    <div className="px-3 py-2 text-gray-500 text-center italic">Aucun résultat</div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Streaming Indicator */}
                    {isLoading && data && (
                        <div className="flex items-center gap-2 mb-3 bg-indigo-500/10 p-2 rounded-lg border border-indigo-500/20">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                            </span>
                            <span className="text-cyan-400 font-bold animate-pulse">En direct...</span>
                        </div>
                    )}

                    {/* Focus Mode Toggle */}
                    <div className="border-t border-gray-700/50 pt-2 mt-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={focusMode}
                                onChange={(e) => setFocusMode(e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-offset-0"
                            />
                            <span className="text-gray-400 text-[10px]">🔦 Mode focus</span>
                        </label>
                        <p className="text-[9px] text-gray-500 mt-1">Assombrit les nœuds non-connectés</p>
                    </div>

                    {/* View Controls */}
                    <div className="border-t border-gray-700/50 pt-2 mt-2">
                        <div className="text-gray-500 uppercase tracking-wider text-[10px] mb-2">Affichage</div>

                        {/* Density Slider */}
                        <div className="mb-2">
                            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                <span>Espacement</span>
                                <span>{Math.round(nodeSpacing)}</span>
                            </div>
                            <input
                                type="range"
                                min="20"
                                max="200"
                                value={nodeSpacing}
                                onChange={(e) => setNodeSpacing(Number(e.target.value))}
                                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>

                        {/* Size Slider */}
                        <div className="mb-2">
                            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                                <span>Taille</span>
                                <span>{nodeSizeScale.toFixed(1)}x</span>
                            </div>
                            <input
                                type="range"
                                min="0.5"
                                max="2.0"
                                step="0.1"
                                value={nodeSizeScale}
                                onChange={(e) => setNodeSizeScale(Number(e.target.value))}
                                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    </div>

                    {/* Node Type Filters */}
                    <div className="border-t border-gray-700/50 pt-2 mt-2">
                        <div className="flex justify-between items-center mb-2">
                            <div className="text-gray-500 uppercase tracking-wider text-[10px]">Types de nœuds</div>
                            <button
                                onClick={() => {
                                    const allTypes = ['Médicament', 'Traitement', 'Symptôme', 'Pathologie', 'Complication', 'Analyses', 'Suggestion'];
                                    const allHidden = allTypes.every(t => hiddenNodeTypes.has(t));
                                    if (allHidden) {
                                        // Tout sélectionner (vider le set)
                                        setHiddenNodeTypes(new Set());
                                    } else {
                                        // Tout désélectionner (tout cacher)
                                        setHiddenNodeTypes(new Set(allTypes));
                                    }
                                }}
                                className="text-[9px] text-purple-400 hover:text-purple-300 transition-colors"
                            >
                                {['Médicament', 'Traitement', 'Symptôme', 'Pathologie', 'Complication', 'Analyses', 'Suggestion'].every(t => hiddenNodeTypes.has(t))
                                    ? '☑ Tout sélectionner'
                                    : '☐ Tout désélectionner'}
                            </button>
                        </div>
                        <div className="grid grid-cols-1 gap-1">
                            {['Médicament', 'Traitement', 'Symptôme', 'Pathologie', 'Complication', 'Analyses', 'Suggestion'].map(type => (
                                <label
                                    key={type}
                                    className={`flex items-center gap-2 px-2 py-1 rounded text-[9px] cursor-pointer transition-all ${!hiddenNodeTypes.has(type)
                                        ? 'bg-gray-800/50 text-gray-300'
                                        : 'bg-gray-900/30 text-gray-600 opacity-50'
                                        }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={!hiddenNodeTypes.has(type)}
                                        onChange={() => toggleNodeType(type)}
                                        className="w-3 h-3 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-offset-0"
                                    />
                                    <span
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: !hiddenNodeTypes.has(type) ? (NODE_TYPE_COLORS[getNodeTypes(type)[0]] || '#94a3b8') : '#6b7280' }}
                                    />
                                    <span className={hiddenNodeTypes.has(type) ? 'line-through' : ''}>{type}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Relation Type Filters (Dynamic) */}
                    <div className="border-t border-gray-700/50 pt-2 mt-2">
                        <div className="flex justify-between items-center mb-2">
                            <div className="text-gray-500 uppercase tracking-wider text-[10px]">Types de relations</div>
                            {availableRelationTypes.length > 0 && (
                                <button
                                    onClick={() => {
                                        const allHidden = availableRelationTypes.every(t => hiddenRelationTypes.has(t));
                                        if (allHidden) {
                                            // Tout sélectionner (vider le set)
                                            setHiddenRelationTypes(new Set());
                                        } else {
                                            // Tout désélectionner (tout cacher)
                                            setHiddenRelationTypes(new Set(availableRelationTypes));
                                        }
                                    }}
                                    className="text-[9px] text-purple-400 hover:text-purple-300 transition-colors"
                                >
                                    {availableRelationTypes.every(t => hiddenRelationTypes.has(t))
                                        ? '☑ Tout sélectionner'
                                        : '☐ Tout désélectionner'}
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 gap-1 max-h-[200px] overflow-y-auto">
                            {availableRelationTypes.map(type => {
                                // Determine color
                                let color = '#94a3b8'; // default slate
                                const t = type.toUpperCase();
                                if (t.includes('TREAT') || t.includes('IMPROVE') || t.includes('VACCIN') || t.includes('DIAGNOS')) color = '#22c55e'; // Green
                                else if (t.includes('SIDE') || t.includes('EFFECT') || t.includes('CAUSE')) color = '#f97316'; // Orange
                                else if (t.includes('CONTRA') || t.includes('DANGER') || t.includes('INTERACT')) color = '#ef4444'; // Red
                                else if (t.includes('MILD') || t.includes('RISK')) color = '#eab308'; // Yellow

                                return (
                                    <label
                                        key={type}
                                        className={`flex items-center gap-2 px-2 py-1 rounded text-[9px] cursor-pointer transition-all ${!hiddenRelationTypes.has(type)
                                            ? 'bg-gray-800/50 text-gray-300'
                                            : 'bg-gray-900/30 text-gray-600 opacity-50'
                                            }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={!hiddenRelationTypes.has(type)}
                                            onChange={() => toggleRelationType(type)}
                                            className="w-3 h-3 rounded border-gray-600 bg-gray-800 text-purple-600 focus:ring-purple-500 focus:ring-offset-0"
                                        />
                                        <div
                                            className="w-3 h-0.5"
                                            style={{ backgroundColor: !hiddenRelationTypes.has(type) ? color : '#6b7280' }}
                                        />
                                        <span className={`truncate ${hiddenRelationTypes.has(type) ? 'line-through' : ''}`} title={type}>{type}</span>
                                    </label>
                                );
                            })}
                            {availableRelationTypes.length === 0 && (
                                <div className="text-[9px] text-gray-600 italic px-2">Aucune relation</div>
                            )}
                        </div>
                    </div>

                    {/* Edge Filter Toggle */}
                    <div className="border-t border-gray-700/50 pt-2 mt-2">
                        <div className="text-gray-500 uppercase tracking-wider text-[10px] mb-2">Filtre liens</div>
                        <div className="flex flex-col gap-1">
                            <button
                                onClick={() => setEdgeFilterMode('all')}
                                className={`px-2 py-1 rounded text-[10px] transition-all text-left ${edgeFilterMode === 'all'
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                    }`}
                            >
                                🔗 Tous les liens
                            </button>
                            <button
                                onClick={() => setEdgeFilterMode('central-only')}
                                className={`px-2 py-1 rounded text-[10px] transition-all text-left ${edgeFilterMode === 'central-only'
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                    }`}
                            >
                                🎯 Nœud central
                            </button>
                            <button
                                onClick={() => setEdgeFilterMode('selected-only')}
                                className={`px-2 py-1 rounded text-[10px] transition-all text-left ${edgeFilterMode === 'selected-only'
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                                    }`}
                            >
                                👆 Nœud sélectionné
                            </button>
                        </div>
                    </div>

                    {/* Comorbidity Pathology Filter - only show if multiple pathologies */}
                    {isComorbidityMode && allPathologies.length > 1 && (
                        <div className="border-t border-gray-700/50 pt-2 mt-2">
                            <p className="text-[10px] font-medium text-amber-400 mb-2">⚠️ Filtre Comorbidités</p>
                            <div className="flex flex-col gap-1.5">
                                {allPathologies.map((pathology, idx) => (
                                    <label key={idx} className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={activePathologies.has(pathology)}
                                            onChange={(e) => {
                                                const newSet = new Set(activePathologies);
                                                if (e.target.checked) {
                                                    newSet.add(pathology);
                                                } else {
                                                    newSet.delete(pathology);
                                                }
                                                setActivePathologies(newSet);
                                            }}
                                            className="w-3.5 h-3.5 rounded border-gray-600 bg-gray-800 text-red-600 focus:ring-red-500 focus:ring-offset-0"
                                        />
                                        <span className="text-gray-300 text-[10px]">{pathology}</span>
                                    </label>
                                ))}
                            </div>
                            <p className="text-[9px] text-gray-500 mt-1.5">
                                {activePathologies.size === allPathologies.length
                                    ? '✅ Liens d\'interaction visibles'
                                    : `${activePathologies.size}/${allPathologies.length} pathologies`
                                }
                            </p>
                        </div>
                    )}
                </div>

                {/* Loading */}
                {/* Futuristic Loading Animation - Electric Circuit Theme */}
                {/* Show when loading AND graph has minimal content (placeholder only) */}
                {isLoading && (!data || data.knowledge_graph.nodes.length <= 1) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-30 overflow-hidden">
                        {/* Canvas-based Matrix Rain Background */}
                        <MatrixBackground />

                        {/* Radar Sweep Effect - Submarine Style */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div
                                className="absolute"
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    background: 'conic-gradient(from 0deg, transparent 0deg, transparent 340deg, rgba(6, 182, 212, 0.4) 355deg, rgba(34, 211, 238, 0.6) 360deg)',
                                    animation: 'radarSweep 3s linear infinite',
                                    borderRadius: '50%',
                                    maxWidth: '600px',
                                    maxHeight: '600px',
                                }}
                            />
                            {/* Radar rings */}
                            {[1, 2, 3, 4].map(i => (
                                <div
                                    key={i}
                                    className="absolute border border-cyan-500/20 rounded-full"
                                    style={{
                                        width: `${i * 25}%`,
                                        height: `${i * 25}%`,
                                        maxWidth: `${i * 150}px`,
                                        maxHeight: `${i * 150}px`,
                                    }}
                                />
                            ))}
                            {/* Center dot */}
                            <div className="absolute w-3 h-3 bg-cyan-400 rounded-full animate-pulse"
                                style={{ boxShadow: '0 0 20px rgba(34, 211, 238, 0.8)' }}
                            />
                        </div>

                        {/* Subtle CRT Scanlines */}
                        <div
                            className="absolute inset-0 pointer-events-none opacity-10"
                            style={{
                                background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)'
                            }}
                        />

                        {/* Background grid pattern */}
                        <div className="absolute inset-0 opacity-20">
                            <svg width="100%" height="100%">
                                <defs>
                                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#3b82f6" strokeWidth="0.5" />
                                    </pattern>
                                </defs>
                                <rect width="100%" height="100%" fill="url(#grid)" />
                            </svg>
                        </div>

                        {/* Neural Network Background */}
                        <div className="absolute inset-0 overflow-hidden pointer-events-none">
                            <svg width="100%" height="100%" className="opacity-30">
                                <defs>
                                    <filter id="networkGlow" x="-50%" y="-50%" width="200%" height="200%">
                                        <feGaussianBlur stdDeviation="2" result="blur" />
                                        <feMerge>
                                            <feMergeNode in="blur" />
                                            <feMergeNode in="SourceGraphic" />
                                        </feMerge>
                                    </filter>
                                </defs>
                                {/* Network nodes and connections */}
                                {[
                                    { x: 50, y: 80, connections: [[120, 150], [80, 180]] },
                                    { x: 120, y: 150, connections: [[200, 120], [180, 200]] },
                                    { x: 80, y: 180, connections: [[150, 220]] },
                                    { x: 200, y: 120, connections: [[280, 90], [260, 180]] },
                                    { x: 280, y: 90, connections: [[350, 130]] },
                                    { x: 260, y: 180, connections: [[320, 220]] },
                                    { x: 350, y: 130, connections: [[400, 100]] },
                                    { x: 320, y: 220, connections: [[380, 260]] },
                                    { x: 400, y: 100, connections: [] },
                                    { x: 380, y: 260, connections: [] },
                                    { x: 150, y: 220, connections: [[220, 280]] },
                                    { x: 220, y: 280, connections: [[300, 300]] },
                                    { x: 300, y: 300, connections: [] },
                                    { x: 30, y: 200, connections: [[80, 180]] },
                                    { x: 420, y: 200, connections: [[380, 260]] },
                                ].map((node, i) => (
                                    <g key={i}>
                                        {node.connections.map((target, j) => (
                                            <line
                                                key={j}
                                                x1={node.x}
                                                y1={node.y}
                                                x2={target[0]}
                                                y2={target[1]}
                                                stroke="#0891b2"
                                                strokeWidth="0.5"
                                                opacity="0.4"
                                                filter="url(#networkGlow)"
                                            />
                                        ))}
                                        <circle
                                            cx={node.x}
                                            cy={node.y}
                                            r="4"
                                            fill="#0e7490"
                                            filter="url(#networkGlow)"
                                            opacity="0.6"
                                        >
                                            <animate attributeName="opacity" values="0.3;0.8;0.3" dur={`${2 + i * 0.3}s`} repeatCount="indefinite" />
                                        </circle>
                                    </g>
                                ))}
                            </svg>
                        </div>

                        {/* 3D Rotating Realistic Brain with Intense Neon */}
                        <div className="relative z-10" style={{ perspective: '1000px' }}>
                            <svg
                                width="320"
                                height="280"
                                viewBox="0 0 320 280"
                                style={{
                                    animation: 'rotateBrain 10s ease-in-out infinite',
                                    transformStyle: 'preserve-3d',
                                    filter: 'drop-shadow(0 0 30px rgba(6, 182, 212, 0.6)) drop-shadow(0 0 60px rgba(6, 182, 212, 0.3))'
                                }}
                            >
                                <defs>
                                    {/* Intense cyan neon glow */}
                                    <filter id="brainNeon" x="-100%" y="-100%" width="300%" height="300%">
                                        <feGaussianBlur stdDeviation="3" result="blur1" />
                                        <feGaussianBlur stdDeviation="6" result="blur2" />
                                        <feGaussianBlur stdDeviation="12" result="blur3" />
                                        <feMerge>
                                            <feMergeNode in="blur3" />
                                            <feMergeNode in="blur2" />
                                            <feMergeNode in="blur1" />
                                            <feMergeNode in="SourceGraphic" />
                                        </feMerge>
                                    </filter>

                                    {/* Brain inner glow gradient */}
                                    <radialGradient id="brainInnerGlow" cx="40%" cy="40%" r="70%">
                                        <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.15" />
                                        <stop offset="50%" stopColor="#0891b2" stopOpacity="0.08" />
                                        <stop offset="100%" stopColor="#0e7490" stopOpacity="0.02" />
                                    </radialGradient>

                                    {/* Electric pulse gradient */}
                                    <linearGradient id="pulseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
                                        <stop offset="50%" stopColor="#67e8f9" stopOpacity="1" />
                                        <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                                    </linearGradient>
                                </defs>

                                {/* Brain silhouette fill */}
                                <path
                                    d="M 160 30
                                       C 100 30, 50 60, 35 100
                                       C 20 140, 25 170, 35 195
                                       C 45 220, 70 235, 90 245
                                       C 110 255, 130 258, 150 258
                                       L 155 258
                                       C 155 265, 160 270, 170 270
                                       C 180 270, 185 265, 185 258
                                       L 190 258
                                       C 210 258, 230 255, 250 245
                                       C 270 235, 295 220, 305 195
                                       C 315 170, 320 140, 305 100
                                       C 290 60, 240 30, 180 30
                                       C 175 28, 165 28, 160 30 Z"
                                    fill="url(#brainInnerGlow)"
                                    stroke="#22d3ee"
                                    strokeWidth="2.5"
                                    filter="url(#brainNeon)"
                                >
                                    <animate attributeName="stroke-opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite" />
                                </path>

                                {/* Temporal lobe (bottom left) */}
                                <path
                                    d="M 75 200 C 60 210, 50 230, 65 245 C 80 255, 100 250, 115 245"
                                    fill="none" stroke="#22d3ee" strokeWidth="2" filter="url(#brainNeon)" opacity="0.9"
                                />

                                {/* Cerebellum (back bottom) */}
                                <path
                                    d="M 240 235 Q 260 250, 280 235 Q 295 220, 285 200"
                                    fill="none" stroke="#22d3ee" strokeWidth="2" filter="url(#brainNeon)" opacity="0.8"
                                />
                                <path
                                    d="M 250 225 Q 265 235, 275 225"
                                    fill="none" stroke="#06b6d4" strokeWidth="1.5" filter="url(#brainNeon)" opacity="0.6"
                                />

                                {/* Gyri and Sulci - Detailed brain folds */}
                                {/* Top section */}
                                <path d="M 80 80 Q 110 60, 140 75 Q 170 90, 200 70 Q 230 55, 260 75" fill="none" stroke="#22d3ee" strokeWidth="2" filter="url(#brainNeon)" opacity="0.9" />
                                <path d="M 70 105 Q 100 85, 130 100 Q 160 115, 190 95 Q 220 80, 255 95" fill="none" stroke="#06b6d4" strokeWidth="1.8" filter="url(#brainNeon)" opacity="0.85" />

                                {/* Middle section */}
                                <path d="M 55 130 Q 85 115, 120 130 Q 155 145, 190 125 Q 225 110, 265 125" fill="none" stroke="#22d3ee" strokeWidth="2" filter="url(#brainNeon)" opacity="0.9" />
                                <path d="M 50 155 Q 80 140, 115 155 Q 150 170, 185 150 Q 220 135, 270 150" fill="none" stroke="#06b6d4" strokeWidth="1.8" filter="url(#brainNeon)" opacity="0.8" />

                                {/* Lower section */}
                                <path d="M 55 180 Q 90 165, 125 180 Q 160 195, 195 175 Q 230 160, 280 175" fill="none" stroke="#22d3ee" strokeWidth="1.8" filter="url(#brainNeon)" opacity="0.85" />
                                <path d="M 70 205 Q 105 190, 140 205 Q 175 220, 210 200 Q 245 185, 285 195" fill="none" stroke="#06b6d4" strokeWidth="1.5" filter="url(#brainNeon)" opacity="0.75" />

                                {/* Frontal lobe details */}
                                <path d="M 45 95 Q 50 80, 65 75" fill="none" stroke="#67e8f9" strokeWidth="1.5" filter="url(#brainNeon)" opacity="0.7" />
                                <path d="M 40 120 Q 45 105, 55 100" fill="none" stroke="#67e8f9" strokeWidth="1.5" filter="url(#brainNeon)" opacity="0.6" />
                                <path d="M 38 145 Q 42 130, 50 125" fill="none" stroke="#67e8f9" strokeWidth="1.5" filter="url(#brainNeon)" opacity="0.5" />

                                {/* Occipital lobe details (back) */}
                                <path d="M 290 95 Q 300 90, 295 105" fill="none" stroke="#67e8f9" strokeWidth="1.5" filter="url(#brainNeon)" opacity="0.7" />
                                <path d="M 295 120 Q 305 115, 302 135" fill="none" stroke="#67e8f9" strokeWidth="1.5" filter="url(#brainNeon)" opacity="0.6" />
                                <path d="M 300 150 Q 310 155, 305 170" fill="none" stroke="#67e8f9" strokeWidth="1.5" filter="url(#brainNeon)" opacity="0.5" />

                                {/* Central sulcus */}
                                <path d="M 180 45 Q 175 80, 185 120 Q 190 160, 175 200" fill="none" stroke="#0891b2" strokeWidth="1.2" filter="url(#brainNeon)" opacity="0.5" />

                                {/* Electric pulses traveling through brain */}
                                <circle r="3" fill="#67e8f9" filter="url(#brainNeon)">
                                    <animateMotion dur="3s" repeatCount="indefinite">
                                        <mpath href="#pulse-path-1" />
                                    </animateMotion>
                                    <animate attributeName="opacity" values="0;1;1;0" dur="3s" repeatCount="indefinite" />
                                </circle>
                                <path id="pulse-path-1" d="M 80 80 Q 140 100, 200 70 Q 260 50, 280 95" fill="none" stroke="none" />

                                <circle r="2" fill="#22d3ee" filter="url(#brainNeon)">
                                    <animateMotion dur="2.5s" repeatCount="indefinite" begin="0.8s">
                                        <mpath href="#pulse-path-2" />
                                    </animateMotion>
                                    <animate attributeName="opacity" values="0;1;1;0" dur="2.5s" repeatCount="indefinite" begin="0.8s" />
                                </circle>
                                <path id="pulse-path-2" d="M 55 155 Q 120 170, 185 150 Q 250 130, 290 160" fill="none" stroke="none" />

                                <circle r="2.5" fill="#a5f3fc" filter="url(#brainNeon)">
                                    <animateMotion dur="4s" repeatCount="indefinite" begin="1.5s">
                                        <mpath href="#pulse-path-3" />
                                    </animateMotion>
                                    <animate attributeName="opacity" values="0;1;1;0" dur="4s" repeatCount="indefinite" begin="1.5s" />
                                </circle>
                                <path id="pulse-path-3" d="M 70 205 Q 140 220, 210 200 Q 260 180, 285 195" fill="none" stroke="none" />

                                {/* Synapse sparks */}
                                {[[100, 90], [160, 85], [220, 75], [90, 145], [150, 160], [210, 140], [130, 210], [190, 195]].map((pos, i) => (
                                    <circle key={i} cx={pos[0]} cy={pos[1]} r="2" fill="#a5f3fc" filter="url(#brainNeon)">
                                        <animate attributeName="r" values="1;3;1" dur={`${0.5 + i * 0.1}s`} repeatCount="indefinite" begin={`${i * 0.15}s`} />
                                        <animate attributeName="opacity" values="0.3;1;0.3" dur={`${0.5 + i * 0.1}s`} repeatCount="indefinite" begin={`${i * 0.15}s`} />
                                    </circle>
                                ))}
                            </svg>

                            {/* Loading text with futuristic progress bar */}
                            <LoadingProgressBar />
                        </div>

                        {/* Original electric circuit SVG - now below the brain */}
                        <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 opacity-30">
                            <svg width="200" height="80" viewBox="0 0 200 80">
                                <defs>
                                    {/* Electric glow filter */}
                                    <filter id="electricGlow" x="-50%" y="-50%" width="200%" height="200%">
                                        <feGaussianBlur stdDeviation="3" result="glow" />
                                        <feMerge>
                                            <feMergeNode in="glow" />
                                            <feMergeNode in="glow" />
                                            <feMergeNode in="SourceGraphic" />
                                        </feMerge>
                                    </filter>

                                    {/* Animated gradient for electric paths */}
                                    <linearGradient id="electricPath" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" stopColor="#06b6d4" stopOpacity="0">
                                            <animate attributeName="offset" values="-1;1" dur="1.5s" repeatCount="indefinite" />
                                        </stop>
                                        <stop offset="50%" stopColor="#a855f7" stopOpacity="1">
                                            <animate attributeName="offset" values="-0.5;1.5" dur="1.5s" repeatCount="indefinite" />
                                        </stop>
                                        <stop offset="100%" stopColor="#06b6d4" stopOpacity="0">
                                            <animate attributeName="offset" values="0;2" dur="1.5s" repeatCount="indefinite" />
                                        </stop>
                                    </linearGradient>

                                    {/* Radial pulse */}
                                    <radialGradient id="nodePulse" cx="50%" cy="50%" r="50%">
                                        <stop offset="0%" stopColor="#a855f7" stopOpacity="1" />
                                        <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
                                    </radialGradient>
                                </defs>

                                {/* Outer rotating ring */}
                                <circle cx="150" cy="150" r="120" fill="none" stroke="#1e3a5f" strokeWidth="1" strokeDasharray="8 4">
                                    <animateTransform attributeName="transform" type="rotate" from="0 150 150" to="360 150 150" dur="20s" repeatCount="indefinite" />
                                </circle>

                                {/* Middle rotating ring */}
                                <circle cx="150" cy="150" r="90" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="12 6" opacity="0.6">
                                    <animateTransform attributeName="transform" type="rotate" from="360 150 150" to="0 150 150" dur="15s" repeatCount="indefinite" />
                                </circle>

                                {/* Inner pulsing ring */}
                                <circle cx="150" cy="150" r="60" fill="none" stroke="#a855f7" strokeWidth="2" opacity="0.8">
                                    <animate attributeName="r" values="55;65;55" dur="2s" repeatCount="indefinite" />
                                    <animate attributeName="opacity" values="0.5;1;0.5" dur="2s" repeatCount="indefinite" />
                                </circle>

                                {/* Electric connection lines */}
                                {/* Line 1: Top-left to center */}
                                <path d="M 60 60 Q 100 80 150 150" fill="none" stroke="url(#electricPath)" strokeWidth="2" filter="url(#electricGlow)">
                                    <animate attributeName="stroke-dasharray" values="0 200;200 0" dur="2s" repeatCount="indefinite" />
                                </path>

                                {/* Line 2: Top-right to center */}
                                <path d="M 240 60 Q 200 80 150 150" fill="none" stroke="url(#electricPath)" strokeWidth="2" filter="url(#electricGlow)">
                                    <animate attributeName="stroke-dasharray" values="0 200;200 0" dur="2.3s" repeatCount="indefinite" />
                                </path>

                                {/* Line 3: Bottom-left to center */}
                                <path d="M 60 240 Q 100 220 150 150" fill="none" stroke="url(#electricPath)" strokeWidth="2" filter="url(#electricGlow)">
                                    <animate attributeName="stroke-dasharray" values="0 200;200 0" dur="1.8s" repeatCount="indefinite" />
                                </path>

                                {/* Line 4: Bottom-right to center */}
                                <path d="M 240 240 Q 200 220 150 150" fill="none" stroke="url(#electricPath)" strokeWidth="2" filter="url(#electricGlow)">
                                    <animate attributeName="stroke-dasharray" values="0 200;200 0" dur="2.5s" repeatCount="indefinite" />
                                </path>

                                {/* Circuit path - horizontal */}
                                <path d="M 30 150 L 70 150 L 80 140 L 100 160 L 120 150 L 130 150" fill="none" stroke="#22d3ee" strokeWidth="1.5" opacity="0.6">
                                    <animate attributeName="stroke-dasharray" values="0 150;150 0;150 0" dur="3s" repeatCount="indefinite" />
                                </path>
                                <path d="M 170 150 L 180 150 L 190 160 L 210 140 L 220 150 L 270 150" fill="none" stroke="#22d3ee" strokeWidth="1.5" opacity="0.6">
                                    <animate attributeName="stroke-dasharray" values="0 150;150 0;150 0" dur="3s" repeatCount="indefinite" begin="0.5s" />
                                </path>

                                {/* Outer nodes (corners) */}
                                {/* Node 1: Top-left */}
                                <circle cx="60" cy="60" r="8" fill="#1e1b4b" stroke="#a855f7" strokeWidth="2">
                                    <animate attributeName="r" values="6;10;6" dur="1.5s" repeatCount="indefinite" />
                                </circle>
                                <circle cx="60" cy="60" r="4" fill="#a855f7">
                                    <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />
                                </circle>

                                {/* Node 2: Top-right */}
                                <circle cx="240" cy="60" r="8" fill="#1e1b4b" stroke="#06b6d4" strokeWidth="2">
                                    <animate attributeName="r" values="6;10;6" dur="1.5s" repeatCount="indefinite" begin="0.3s" />
                                </circle>
                                <circle cx="240" cy="60" r="4" fill="#06b6d4">
                                    <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" begin="0.3s" />
                                </circle>

                                {/* Node 3: Bottom-left */}
                                <circle cx="60" cy="240" r="8" fill="#1e1b4b" stroke="#22c55e" strokeWidth="2">
                                    <animate attributeName="r" values="6;10;6" dur="1.5s" repeatCount="indefinite" begin="0.6s" />
                                </circle>
                                <circle cx="60" cy="240" r="4" fill="#22c55e">
                                    <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" begin="0.6s" />
                                </circle>

                                {/* Node 4: Bottom-right */}
                                <circle cx="240" cy="240" r="8" fill="#1e1b4b" stroke="#f97316" strokeWidth="2">
                                    <animate attributeName="r" values="6;10;6" dur="1.5s" repeatCount="indefinite" begin="0.9s" />
                                </circle>
                                <circle cx="240" cy="240" r="4" fill="#f97316">
                                    <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" begin="0.9s" />
                                </circle>

                                {/* Center node - main pulsing core */}
                                <circle cx="150" cy="150" r="25" fill="url(#nodePulse)" filter="url(#electricGlow)">
                                    <animate attributeName="r" values="20;30;20" dur="2s" repeatCount="indefinite" />
                                </circle>
                                <circle cx="150" cy="150" r="15" fill="#1e1b4b" stroke="#a855f7" strokeWidth="3">
                                    <animate attributeName="stroke-width" values="2;4;2" dur="1s" repeatCount="indefinite" />
                                </circle>
                                <circle cx="150" cy="150" r="8" fill="#a855f7">
                                    <animate attributeName="r" values="6;10;6" dur="1s" repeatCount="indefinite" />
                                </circle>

                                {/* Orbiting particles */}
                                <circle cx="150" cy="90" r="3" fill="#22d3ee" filter="url(#electricGlow)">
                                    <animateTransform attributeName="transform" type="rotate" from="0 150 150" to="360 150 150" dur="3s" repeatCount="indefinite" />
                                </circle>
                                <circle cx="150" cy="210" r="2" fill="#a855f7" filter="url(#electricGlow)">
                                    <animateTransform attributeName="transform" type="rotate" from="180 150 150" to="540 150 150" dur="4s" repeatCount="indefinite" />
                                </circle>
                                <circle cx="90" cy="150" r="2.5" fill="#22c55e" filter="url(#electricGlow)">
                                    <animateTransform attributeName="transform" type="rotate" from="90 150 150" to="450 150 150" dur="3.5s" repeatCount="indefinite" />
                                </circle>

                                {/* Electric sparks at connection points */}
                                <circle cx="110" cy="110" r="2" fill="#fff">
                                    <animate attributeName="opacity" values="0;1;0" dur="0.3s" repeatCount="indefinite" />
                                    <animate attributeName="r" values="1;3;1" dur="0.3s" repeatCount="indefinite" />
                                </circle>
                                <circle cx="190" cy="110" r="2" fill="#fff">
                                    <animate attributeName="opacity" values="0;1;0" dur="0.4s" repeatCount="indefinite" begin="0.15s" />
                                    <animate attributeName="r" values="1;3;1" dur="0.4s" repeatCount="indefinite" begin="0.15s" />
                                </circle>
                                <circle cx="110" cy="190" r="2" fill="#fff">
                                    <animate attributeName="opacity" values="0;1;0" dur="0.35s" repeatCount="indefinite" begin="0.1s" />
                                    <animate attributeName="r" values="1;3;1" dur="0.35s" repeatCount="indefinite" begin="0.1s" />
                                </circle>
                                <circle cx="190" cy="190" r="2" fill="#fff">
                                    <animate attributeName="opacity" values="0;1;0" dur="0.45s" repeatCount="indefinite" begin="0.2s" />
                                    <animate attributeName="r" values="1;3;1" dur="0.45s" repeatCount="indefinite" begin="0.2s" />
                                </circle>
                            </svg>

                            {/* Loading text with futuristic progress bar */}
                            <LoadingProgressBar />
                        </div>

                        {/* Floating particles background */}
                        <div className="absolute inset-0 pointer-events-none overflow-hidden">
                            {[...Array(20)].map((_, i) => (
                                <div
                                    key={i}
                                    className="absolute w-1 h-1 rounded-full bg-purple-500/40"
                                    style={{
                                        left: `${Math.random() * 100}%`,
                                        top: `${Math.random() * 100}%`,
                                        animation: `float ${3 + Math.random() * 4}s ease-in-out infinite`,
                                        animationDelay: `${Math.random() * 2}s`
                                    }}
                                />
                            ))}
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
                            <button onClick={() => fetchData(allPathologies)} className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg">Réessayer</button>
                        </div>
                    </div>
                )}

                {/* Show graph when: not initial loading, no error, has data, OR during expansion */}
                {((!isLoading && !error && data) || (isExpanding && data)) && (
                    <SVGFallback
                        data={displayData || data}
                        animationTime={animationTime}
                        onEdgeClick={handleEdgeSelect}
                        onSetCentral={handleSetCentral}
                        newlySpawnedNodes={newlySpawnedNodes}
                        edgeFilterMode={edgeFilterMode}
                        centralNodeId={data.knowledge_graph.nodes.find(n => n.ring === 0)?.id || null}
                        filterSelectedNodeId={filterSelectedNodeId}
                        focusMode={focusMode}
                        activePathologies={activePathologies}
                        visibleNodeCount={visibleNodeCount}
                        nodeSpacing={nodeSpacing}
                        nodeSize={nodeSizeScale}
                        hiddenNodeTypes={hiddenNodeTypes}
                        hiddenRelationTypes={hiddenRelationTypes}
                        hiddenNodes={hiddenNodes}
                        getNodeTypes={getNodeTypes}
                        nodeGroups={nodeGroups}
                        groupCreationMode={groupCreationMode}
                        currentGroupCenter={currentGroupCenter}
                        onAddToGroup={addNodeToGroup}
                        onStartGroupCreation={startGroupCreation}
                        onFinishGroupCreation={finishGroupCreation}
                        onDissolveGroup={dissolveGroup}
                        customNodePositions={customNodePositions}
                        deepAnalysisMode={deepAnalysisMode}
                        goldenNodeIds={goldenNodeIds}
                        onSaveGraph={onSave}
                    />
                )}

                {/* ========================================== */}
                {/* DEEP ANALYSIS BUTTON & UI */}
                {/* ========================================== */}
                {data && !isLoading && !error && (
                    <>
                        {/* Deep Analysis Button */}
                        {!deepAnalysisMode && !isDeepAnalyzing && (
                            <button
                                onClick={handleDeepAnalysis}
                                className="absolute top-4 right-4 z-50 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:via-yellow-400 hover:to-amber-500 text-black font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-amber-500/30 flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                                title="Analyser le graphe pour identifier le schéma de traitement optimal"
                            >
                                <svg className="w-5 h-5 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                                Analyse Approfondie
                            </button>
                        )}

                        {/* Loading Animation Overlay */}
                        {isDeepAnalyzing && (
                            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
                                <div className="relative">
                                    {/* Scanning animation rings */}
                                    <div className="w-32 h-32 rounded-full border-4 border-amber-500/30 animate-ping absolute inset-0" />
                                    <div className="w-32 h-32 rounded-full border-2 border-amber-400/50 animate-spin" style={{ animationDuration: '3s' }} />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-yellow-500 rounded-full animate-pulse flex items-center justify-center shadow-lg shadow-amber-500/50">
                                            <svg className="w-8 h-8 text-black" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                                <p className="mt-8 text-lg font-semibold text-amber-400 animate-pulse">
                                    Analyse en cours...
                                </p>
                                <p className="mt-2 text-sm text-gray-400">
                                    Identification du schéma thérapeutique optimal
                                </p>
                            </div>
                        )}

                        {/* SELECTION TOOLBAR */}
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-900/90 backdrop-blur border border-gray-700 rounded-lg p-1.5 flex gap-1 shadow-xl z-20"
                            onPointerDown={(e) => e.stopPropagation()}>
                            <button
                                onClick={() => setSelectionMode('cursor')}
                                className={`p-2 rounded-md transition-all ${selectionMode === 'cursor' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
                                title="Curseur (Déplacement)"
                            >
                                <MousePointer2 className="w-4 h-4" />
                            </button>
                            <div className="w-[1px] bg-gray-700 mx-1 my-1" />
                            <button
                                onClick={() => setSelectionMode('rectangle')}
                                className={`p-2 rounded-md transition-all ${selectionMode === 'rectangle' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/20' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
                                title="Sélection Rectangle"
                            >
                                <Square className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setSelectionMode('circle')}
                                className={`p-2 rounded-md transition-all ${selectionMode === 'circle' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/20' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
                                title="Sélection Cercle"
                            >
                                <CircleIcon className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setSelectionMode('lasso')}
                                className={`p-2 rounded-md transition-all ${selectionMode === 'lasso' ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/20' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
                                title="Sélection Lasso"
                            >
                                <Lasso className="w-4 h-4" />
                            </button>
                        </div>

                        {/* SELECTION OVERLAY (SVG) */}
                        {isSelecting && selectionPoints.length > 0 && (
                            <div className="absolute inset-0 pointer-events-none z-30">
                                <svg width="100%" height="100%" style={{ filter: 'drop-shadow(0 0 4px #06b6d4)' }}>
                                    {selectionMode === 'lasso' && (
                                        <polyline
                                            points={selectionPoints.map(p => `${p.x},${p.y}`).join(' ')}
                                            fill="rgba(6, 182, 212, 0.1)"
                                            stroke="#06b6d4"
                                            strokeWidth="2"
                                            strokeDasharray="4 2"
                                        />
                                    )}
                                    {selectionMode === 'rectangle' && selectionStartRef.current && (
                                        <rect
                                            x={Math.min(selectionStartRef.current.x, selectionPoints[selectionPoints.length - 1].x)}
                                            y={Math.min(selectionStartRef.current.y, selectionPoints[selectionPoints.length - 1].y)}
                                            width={Math.abs(selectionPoints[selectionPoints.length - 1].x - selectionStartRef.current.x)}
                                            height={Math.abs(selectionPoints[selectionPoints.length - 1].y - selectionStartRef.current.y)}
                                            fill="rgba(6, 182, 212, 0.1)"
                                            stroke="#06b6d4"
                                            strokeWidth="2"
                                            strokeDasharray="4 2"
                                        />
                                    )}
                                    {selectionMode === 'circle' && selectionStartRef.current && (
                                        <circle
                                            cx={selectionStartRef.current.x}
                                            cy={selectionStartRef.current.y}
                                            r={Math.sqrt(Math.pow(selectionPoints[selectionPoints.length - 1].x - selectionStartRef.current.x, 2) + Math.pow(selectionPoints[selectionPoints.length - 1].y - selectionStartRef.current.y, 2))}
                                            fill="rgba(6, 182, 212, 0.1)"
                                            stroke="#06b6d4"
                                            strokeWidth="2"
                                            strokeDasharray="4 2"
                                        />
                                    )}
                                </svg>
                            </div>
                        )}

                        {/* Deep Analysis Result Panel */}
                        {deepAnalysisMode && deepAnalysisResult && (
                            <div className="absolute top-4 right-4 z-50 max-w-sm bg-gradient-to-br from-amber-900/90 to-amber-800/90 backdrop-blur-md border border-amber-500/50 rounded-xl p-4 shadow-xl shadow-amber-500/20">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-yellow-500 rounded-full flex items-center justify-center shadow-lg shadow-amber-500/50">
                                        <svg className="w-5 h-5 text-black" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h4 className="text-amber-400 font-bold text-sm">Schéma Optimal</h4>
                                        <p className="text-amber-200/70 text-xs">{goldenNodeIds.size} nœuds identifiés</p>
                                    </div>
                                </div>
                                <p className="text-sm text-amber-100 mb-3 leading-relaxed">{deepAnalysisResult}</p>
                                <button
                                    onClick={exitDeepAnalysisMode}
                                    className="w-full bg-amber-600/50 hover:bg-amber-500/50 text-amber-100 text-sm py-2 rounded-lg transition-colors"
                                >
                                    Fermer l'analyse
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* Signals */}
                {data && <SignalPanel signals={data.micro_signals} />}

                {/* Graph Interactive Chat */}
                {data && (
                    <GraphInteractiveChat
                        isOpen={!isLoading && !error}
                        graphNodes={data.knowledge_graph.nodes}
                        graphEdges={data.knowledge_graph.edges}
                        pathology={pathology}
                        onCreateGroup={(nodeType, groupName) => {
                            // Find all nodes of the given type and create a group
                            const matchingNodes = data.knowledge_graph.nodes.filter(
                                n => n.node_type?.toUpperCase().includes(nodeType.toUpperCase()) ||
                                    n.node_type?.toLowerCase().includes(nodeType.toLowerCase())
                            );
                            console.log(`[Graph Chat] Creating group for type "${nodeType}", found ${matchingNodes.length} nodes`);
                            if (matchingNodes.length > 0) {
                                // Use atomic group creation
                                createGroupWithNodes(
                                    matchingNodes[0].id,
                                    matchingNodes.map(n => n.id)
                                );
                            }
                        }}
                        onFilterVisibility={(nodeName) => {
                            // Find the node and show only connected nodes
                            const node = data.knowledge_graph.nodes.find(
                                n => n.name.toLowerCase().includes(nodeName.toLowerCase())
                            );
                            console.log(`[Graph Chat] Filtering visibility for "${nodeName}", found: ${node?.name}`);
                            if (node) {
                                // Enable focus mode on this node
                                setSelectedNodeId(node.id);
                                setFocusMode(true);
                                // Calculate highlighted (connected) nodes
                                const connectedIds = new Set<string>();
                                data.knowledge_graph.edges.forEach(edge => {
                                    const s = typeof edge.source === 'object' ? (edge.source as any).id : edge.source;
                                    const t = typeof edge.target === 'object' ? (edge.target as any).id : edge.target;
                                    if (s === node.id) connectedIds.add(String(t));
                                    if (t === node.id) connectedIds.add(String(s));
                                });
                                setHighlightedNodeIds(connectedIds);
                            }
                        }}
                        onAddNode={(nodeName) => {
                            // Trigger expansion with the new node name as concept
                            handleSetCentral(nodeName);
                        }}
                        onHighlightNode={(nodeName) => {
                            // Find and highlight the node
                            const node = data.knowledge_graph.nodes.find(
                                n => n.name.toLowerCase().includes(nodeName.toLowerCase())
                            );
                            if (node) {
                                setFilterSelectedNodeId(node.id);
                            }
                        }}
                        onResetView={() => {
                            // Reset all filters
                            setFilterSelectedNodeId(null);
                            setEdgeFilterMode('all');
                            setHiddenNodeTypes(new Set());
                            setHiddenRelationTypes(new Set());
                            setHiddenNodes(new Set());
                            setFocusMode(false);
                            setHighlightedNodeIds(new Set());
                            // Dissolve all groups
                            nodeGroups.forEach((_, centerId) => dissolveGroup(centerId));
                        }}
                        onShowOnlyNodes={(nodeNames) => {
                            // Show only the specified nodes, hide all others
                            const visibleNodeIds = new Set<string>();
                            nodeNames.forEach(name => {
                                const node = data.knowledge_graph.nodes.find(
                                    n => n.name.toLowerCase().includes(name.toLowerCase())
                                );
                                if (node) visibleNodeIds.add(node.id);
                            });
                            // Hide all nodes NOT in the visible set
                            const toHide = new Set<string>();
                            data.knowledge_graph.nodes.forEach(n => {
                                if (!visibleNodeIds.has(n.id)) toHide.add(n.id);
                            });
                            setHiddenNodes(toHide);
                            console.log(`[Graph Chat] Showing only ${visibleNodeIds.size} nodes, hiding ${toHide.size}`);
                        }}
                        onShowOnlyNodeTypes={(nodeTypes) => {
                            // Show only the specified node types
                            const allTypes = new Set(data.knowledge_graph.nodes.map(n => n.node_type?.toUpperCase()));
                            const typesToShow = new Set(nodeTypes.map(t => t.toUpperCase()));
                            const typesToHide = new Set<string>();
                            allTypes.forEach(t => {
                                if (t && !typesToShow.has(t)) typesToHide.add(t);
                            });
                            setHiddenNodeTypes(typesToHide);
                            console.log(`[Graph Chat] Showing types: ${Array.from(typesToShow).join(', ')}`);
                        }}
                        onHideNodes={(nodeNames) => {
                            // Hide the specified nodes
                            const toHide = new Set(hiddenNodes);
                            nodeNames.forEach(name => {
                                const node = data.knowledge_graph.nodes.find(
                                    n => n.name.toLowerCase().includes(name.toLowerCase())
                                );
                                if (node) toHide.add(node.id);
                            });
                            setHiddenNodes(toHide);
                            console.log(`[Graph Chat] Hiding ${nodeNames.length} nodes`);
                        }}
                        onArrangeLayout={(layout) => {
                            console.log(`[Graph Chat] Arranging layout: ${layout}`);

                            if (layout === 'corners' || layout === 'grid') {
                                // Group nodes by type
                                const nodesByType = new Map<string, RingNode[]>();
                                data.knowledge_graph.nodes.forEach(n => {
                                    const type = n.node_type || 'OTHER';
                                    if (!nodesByType.has(type)) nodesByType.set(type, []);
                                    nodesByType.get(type)!.push(n);
                                });

                                // Define corner positions (SVG coordination: center is 300, total is 600)
                                const corners = [
                                    { x: 100, y: 100 },  // Top-left
                                    { x: 500, y: 100 },  // Top-right
                                    { x: 100, y: 500 },  // Bottom-left
                                    { x: 500, y: 500 },  // Bottom-right
                                    { x: 300, y: 100 },  // Top-center
                                    { x: 300, y: 500 },  // Bottom-center
                                    { x: 100, y: 300 },  // Left-center
                                    { x: 500, y: 300 },  // Right-center
                                ];

                                const newPositions = new Map<string, { x: number, y: number }>();
                                const types = Array.from(nodesByType.keys());

                                types.forEach((type, typeIndex) => {
                                    const nodes = nodesByType.get(type)!;
                                    const corner = corners[typeIndex % corners.length];
                                    const nodeCount = nodes.length;

                                    // Arrange nodes in a grid around the corner
                                    const cols = Math.ceil(Math.sqrt(nodeCount));
                                    const spacing = 30;

                                    nodes.forEach((node, nodeIndex) => {
                                        const row = Math.floor(nodeIndex / cols);
                                        const col = nodeIndex % cols;
                                        newPositions.set(node.id, {
                                            x: corner.x + (col - cols / 2) * spacing,
                                            y: corner.y + (row - Math.ceil(nodeCount / cols) / 2) * spacing
                                        });
                                    });
                                });

                                setCustomNodePositions(newPositions);
                                console.log(`[Graph Chat] Positioned ${newPositions.size} nodes in ${types.length} corners`);
                            } else if (layout === 'radial') {
                                // Reset to default radial layout
                                setCustomNodePositions(new Map());
                                console.log(`[Graph Chat] Reset to radial layout`);
                            }
                        }}
                        onAutoGroupByType={() => {
                            // Create groups for each node type
                            const nodesByType = new Map<string, RingNode[]>();
                            data.knowledge_graph.nodes.forEach(n => {
                                const type = n.node_type || 'OTHER';
                                if (!nodesByType.has(type)) nodesByType.set(type, []);
                                nodesByType.get(type)!.push(n);
                            });
                            // Create groups
                            nodesByType.forEach((nodes, type) => {
                                if (nodes.length > 1) {
                                    createGroupWithNodes(nodes[0].id, nodes.map(n => n.id));
                                }
                            });
                            console.log(`[Graph Chat] Created ${nodesByType.size} groups by type`);
                        }}
                        onHideGroup={(groupName) => {
                            // Hide all nodes in a group (by name matching)
                            const typeName = groupName.toUpperCase();
                            const toHide = new Set(hiddenNodes);
                            data.knowledge_graph.nodes.forEach(n => {
                                if (n.node_type?.toUpperCase().includes(typeName)) {
                                    toHide.add(n.id);
                                }
                            });
                            setHiddenNodes(toHide);
                            console.log(`[Graph Chat] Hiding group "${groupName}"`);
                        }}
                        onShowOnlyGroup={(groupName) => {
                            // Show only nodes in a specific group
                            const typeName = groupName.toUpperCase();
                            const toHide = new Set<string>();
                            data.knowledge_graph.nodes.forEach(n => {
                                if (!n.node_type?.toUpperCase().includes(typeName)) {
                                    toHide.add(n.id);
                                }
                            });
                            setHiddenNodes(toHide);
                            console.log(`[Graph Chat] Showing only group "${groupName}"`);
                        }}
                        onSetCentral={(nodeName) => {
                            // Set a node as central and regenerate the graph
                            console.log(`[Graph Chat] Setting "${nodeName}" as central node`);
                            handleSetCentral(nodeName);
                        }}
                    />
                )}
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
