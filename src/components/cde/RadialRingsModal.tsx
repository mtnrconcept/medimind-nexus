// ============================================
// RADIAL RINGS 3D - TOP-DOWN VIEW WITH CLICKABLE LINKS
// ============================================
// Smooth nodes with enhanced glow, clickable links for AI explanation

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { X, Play, Pause, RotateCcw, Sparkles, Loader2, MessageSquare, ExternalLink, Plus, GitBranch, Search } from 'lucide-react';
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
    getNodeTypes?: (category: string) => string[]; // Helper to map UI categories to node types
    // Node grouping props
    nodeGroups?: Map<string, Set<string>>; // centerNodeId -> member node IDs
    groupCreationMode?: boolean;
    currentGroupCenter?: string | null;
    onAddToGroup?: (nodeId: string) => void;
    onStartGroupCreation?: (nodeId: string) => void;
    onFinishGroupCreation?: () => void;
    onDissolveGroup?: (centerId: string) => void;
}

function SVGFallback({ data, animationTime, onEdgeClick, onSetCentral, newlySpawnedNodes, edgeFilterMode = 'all', centralNodeId, filterSelectedNodeId, focusMode = true, activePathologies, visibleNodeCount = Infinity, nodeSpacing = 40, nodeSize: sizeScale = 1.0, hiddenNodeTypes = new Set(), hiddenRelationTypes = new Set(), getNodeTypes = () => [], nodeGroups = new Map(), groupCreationMode = false, currentGroupCenter = null, onAddToGroup, onStartGroupCreation, onFinishGroupCreation, onDissolveGroup }: SVGFallbackProps) {
    // Dragging state for center nodes (Hoisted)
    const [dragOffsets, setDragOffsets] = useState<Map<string, { x: number, y: number }>>(new Map());
    const [draggingNode, setDraggingNode] = useState<string | null>(null);

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
            setIsPanning(true);
            setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
    }, [pan, draggingNode]);

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

        // 2. Handle Canvas Panning
        if (isPanning) {
            setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
        }
    }, [isPanning, panStart, draggingNode, zoom, nodeGroups]);

    const handleMouseUp = useCallback(() => {
        setIsPanning(false);
        setDraggingNode(null); // Stop dragging node
    }, []);

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
        if (hiddenNodeTypes && hiddenNodeTypes.size > 0) {
            filteredNodes = filteredNodes.filter(node => {
                // Always keep central nodes
                if (node.ring === 0) return true;
                // Check if node's type is hidden via any of the UI categories
                const nodeType = node.node_type?.toUpperCase() || '';
                for (const category of hiddenNodeTypes) {
                    const typesInCategory = getNodeTypes(category);
                    if (typesInCategory.some(t => t === nodeType)) {
                        return false; // This node's type is hidden
                    }
                }
                return true;
            });
        }

        // Progressive reveal: only show nodes up to visibleNodeCount
        const nodes = filteredNodes.slice(0, visibleNodeCount);

        // Find ALL center nodes (ring 0) - Support for dual/multi pathologies
        // DUAL/MULTI GRAPH LAYOUT: Twin Graph Logic
        const centerNodes = nodes.filter(n => n.ring === 0);
        const isMultiGraph = centerNodes.length > 1;
        const foci = new Map<string, { x: number, y: number }>();
        const defaultCenter = { x: center, y: center };

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

        // Dynamic spacing derived from nodeSpacing prop (base 40)
        const spacingFactor = nodeSpacing / 40;

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

        // ANTI-COLLISION: Disabled per user request to maintain stable spacing
        // Nodes will respect their calculated orbital positions.
        /*
        const MIN_NODE_DISTANCE = 75; 
        const COLLISION_ITERATIONS = 15; 

        for (let iter = 0; iter < COLLISION_ITERATIONS; iter++) {
             // ... logic disabled ...
        }
        */

        return { nodePositions: positions, ringRadii: radii, uniqueNodes: nodes, idRedirects };
    }, [data, center, visibleNodeCount, nodeSpacing, activePathologies, hiddenNodeTypes, getNodeTypes]);

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
                            const posA = { x: basePosA.x + dragOffsetA.x, y: basePosA.y + dragOffsetA.y };
                            const posB = { x: basePosB.x + dragOffsetB.x, y: basePosB.y + dragOffsetB.y };


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

                        // Apply drag offset for any node that has been dragged
                        const dragOffset = dragOffsets.get(node.id) || { x: 0, y: 0 };
                        const pos = { x: basePos.x + dragOffset.x, y: basePos.y + dragOffset.y };

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

                        // Define visibility based on animation progress
                        const isVisible = nodeProgress > 0;

                        // Determine cursor style - all nodes are draggable
                        const cursorStyle = 'grab';

                        return (
                            <g
                                key={node.id}
                                className={`transition-opacity duration-500`}
                                style={{
                                    opacity: isVisible ? (isDimmed ? 0.2 : 1) : 0,
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
            // Linear expansion for 7-ring layout (User requested regular steps)
            const expansion = 1 + (ring * 0.1);
            const radius = ring === 0 ? 0 : (ring * ringRadius * expansion);
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
    pathology?: string; // Single pathology (legacy)
    pathologies?: string[]; // Multiple pathologies for comorbidity analysis
    mode?: 'THERAPY' | 'SAFETY' | 'ETIOLOGY' | 'RELAPSE';
    context?: Record<string, any>;
}

export default function RadialRingsModal({
    isOpen,
    onClose,
    pathology,
    pathologies = [],
    mode = 'ETIOLOGY',
    context
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

    // Highlighted nodes (neighbors of selected node)
    const [highlightedNodeIds, setHighlightedNodeIds] = useState<Set<string>>(new Set());

    // ============================================
    // NODE GROUPING FEATURE
    // Groups allow clustering nodes around a center node
    // When the center moves, all members move together
    // ============================================

    // Map: centerNodeId -> Set of member node IDs that orbit around it
    const [nodeGroups, setNodeGroups] = useState<Map<string, Set<string>>>(new Map());

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
            fetchData(allPathologies);
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
                        {/* Matrix Rain Background */}
                        <div className="absolute inset-0 opacity-30 pointer-events-none overflow-hidden">
                            {Array.from({ length: 30 }).map((_, i) => (
                                <div
                                    key={`matrix-col-${i}`}
                                    className="absolute text-cyan-400 font-mono text-xs leading-none select-none"
                                    style={{
                                        left: `${(i / 30) * 100}%`,
                                        animation: `matrixFall ${3 + Math.random() * 4}s linear infinite`,
                                        animationDelay: `${Math.random() * 3}s`,
                                        top: '-100%',
                                        writingMode: 'vertical-rl'
                                    }}
                                >
                                    {Array.from({ length: 30 }).map((_, j) => (
                                        <span
                                            key={j}
                                            style={{
                                                opacity: 1 - (j / 30) * 0.8,
                                                color: j === 0 ? '#22d3ee' : j < 3 ? '#06b6d4' : '#0e7490'
                                            }}
                                        >
                                            {String.fromCharCode(0x30A0 + Math.random() * 96)}
                                        </span>
                                    ))}
                                </div>
                            ))}
                        </div>

                        {/* Holographic Scan Effect */}
                        <div
                            className="absolute inset-0 pointer-events-none"
                            style={{
                                background: 'linear-gradient(0deg, transparent 0%, rgba(6, 182, 212, 0.15) 45%, rgba(34, 211, 238, 0.3) 50%, rgba(6, 182, 212, 0.15) 55%, transparent 100%)',
                                animation: 'holographicScan 3s ease-in-out infinite'
                            }}
                        />

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

                        {/* Main animation container */}
                        <div className="relative">
                            <svg width="300" height="300" viewBox="0 0 300 300">
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

                            {/* Loading text */}
                            <div className="absolute bottom-[-40px] left-0 right-0 text-center">
                                <p className="text-purple-400 font-medium tracking-wider animate-pulse">
                                    Construction du graphe
                                </p>
                                <p className="text-cyan-400/60 text-sm mt-1">
                                    Connexion des nœuds sémantiques...
                                </p>
                            </div>
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
                        getNodeTypes={getNodeTypes}
                        nodeGroups={nodeGroups}
                        groupCreationMode={groupCreationMode}
                        currentGroupCenter={currentGroupCenter}
                        onAddToGroup={addNodeToGroup}
                        onStartGroupCreation={startGroupCreation}
                        onFinishGroupCreation={finishGroupCreation}
                        onDissolveGroup={dissolveGroup}
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
