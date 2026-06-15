
import React, { useMemo, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import html2canvas from 'html2canvas';
import {
    ReactFlow,
    Background,
    Controls,
    Edge,
    Node,
    Handle,
    Position,
    ConnectionLineType,
    BackgroundVariant,
    MarkerType,
    useNodesState,
    useEdgesState
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Badge } from '@/components/ui/badge';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// =====================================================
// FLOWCHART NODE COMPONENTS
// =====================================================

// START NODE - Oval shape (Green) - For central pathology/problem
const StartNode = ({ data, selected }: { data: { label: string; type: string; mechanism?: string; subItems?: string[] }; selected: boolean }) => (
    <div className={`
        min-w-[180px] min-h-[80px] px-6 py-4
        bg-gradient-to-br from-emerald-500 to-emerald-700
        border-3 border-emerald-300
        rounded-[50px] shadow-[0_0_30px_rgba(16,185,129,0.5)]
        flex flex-col items-center justify-center text-center
        transition-all duration-300 cursor-pointer
        ${selected ? 'ring-4 ring-white/60 scale-105' : 'hover:scale-102 hover:shadow-[0_0_40px_rgba(16,185,129,0.6)]'}
    `}>
        <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-emerald-300 !border-2 !border-white" />
        <span className="text-white text-sm font-bold leading-tight uppercase tracking-wide max-w-[160px]">
            {data.label}
        </span>
        {data.subItems && data.subItems.length > 0 && (
            <div className="mt-1 text-[10px] text-emerald-100/80">
                {data.subItems.slice(0, 2).join(' • ')}
            </div>
        )}
    </div>
);

// DECISION NODE - Diamond shape (Orange) - For risk factors, branching conditions
const DecisionNode = ({ data, selected }: { data: { label: string; type: string; mechanism?: string; subItems?: string[] }; selected: boolean }) => (
    <div className={`
        relative w-[140px] h-[140px]
        flex items-center justify-center
        transition-all duration-300 cursor-pointer
        ${selected ? 'scale-105' : 'hover:scale-102'}
    `}>
        {/* Diamond shape using rotated square */}
        <div className={`
            absolute inset-0
            bg-gradient-to-br from-amber-400 to-orange-600
            border-3 border-amber-200
            rounded-lg rotate-45 transform origin-center
            shadow-[0_0_25px_rgba(245,158,11,0.4)]
            ${selected ? 'ring-4 ring-white/50' : ''}
        `} />

        {/* Content - counter-rotated */}
        <div className="relative z-10 text-center px-2">
            <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-amber-200 !border-2 !border-white !-top-[70px]" />
            <span className="text-white text-[11px] font-bold leading-tight uppercase tracking-tight max-w-[90px] block">
                {data.label}
            </span>
            <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-amber-200 !border-2 !border-white !-bottom-[70px]" />
            <Handle type="source" position={Position.Left} id="left" className="!w-3 !h-3 !bg-amber-200 !border-2 !border-white !-left-[70px]" />
            <Handle type="source" position={Position.Right} id="right" className="!w-3 !h-3 !bg-amber-200 !border-2 !border-white !-right-[70px]" />
        </div>
    </div>
);

// PROCESS NODE - Rectangle shape (Blue/Cyan) - For symptoms, mechanisms, treatments
const ProcessNode = ({ data, selected }: { data: { label: string; type: string; mechanism?: string; subItems?: string[] }; selected: boolean }) => {
    // Different colors based on subtype
    const getColors = (type: string) => {
        switch (type) {
            case 'treatment':
            case 'medication':
                return {
                    bg: 'from-cyan-500 to-cyan-700',
                    border: 'border-cyan-300',
                    shadow: 'shadow-[0_0_20px_rgba(6,182,212,0.4)]'
                };
            case 'symptom':
            case 'mechanism':
                return {
                    bg: 'from-blue-500 to-blue-700',
                    border: 'border-blue-300',
                    shadow: 'shadow-[0_0_20px_rgba(59,130,246,0.4)]'
                };
            case 'side_effect':
            case 'complication':
                return {
                    bg: 'from-rose-500 to-rose-700',
                    border: 'border-rose-300',
                    shadow: 'shadow-[0_0_20px_rgba(244,63,94,0.4)]'
                };
            default:
                return {
                    bg: 'from-slate-500 to-slate-700',
                    border: 'border-slate-300',
                    shadow: 'shadow-lg'
                };
        }
    };

    const colors = getColors(data.type);

    return (
        <div className={`
            min-w-[160px] min-h-[60px] px-4 py-3
            bg-gradient-to-br ${colors.bg}
            border-2 ${colors.border}
            rounded-lg ${colors.shadow}
            flex flex-col items-center justify-center text-center
            transition-all duration-300 cursor-pointer
            ${selected ? 'ring-4 ring-white/50 scale-105' : 'hover:scale-102'}
        `}>
            <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-white/80 !border-2 !border-slate-400" />
            <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-white/80 !border-2 !border-slate-400" />

            <span className="text-white text-xs font-semibold leading-tight max-w-[140px]">
                {data.label}
            </span>
            {data.mechanism && (
                <div className="mt-1 text-[9px] text-white/70 italic max-w-[130px]">
                    {data.mechanism.substring(0, 40)}...
                </div>
            )}

            <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-white/80 !border-2 !border-slate-400" />
            <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-white/80 !border-2 !border-slate-400" />
        </div>
    );
};

// END NODE - Rounded rectangle/Oval (Green) - For resolution/outcome
const EndNode = ({ data, selected }: { data: { label: string; type: string; mechanism?: string; subItems?: string[] }; selected: boolean }) => (
    <div className={`
        min-w-[180px] min-h-[70px] px-6 py-4
        bg-gradient-to-br from-green-500 to-teal-600
        border-3 border-green-300
        rounded-[40px] shadow-[0_0_30px_rgba(34,197,94,0.5)]
        flex flex-col items-center justify-center text-center
        transition-all duration-300 cursor-pointer
        ${selected ? 'ring-4 ring-white/60 scale-105' : 'hover:scale-102 hover:shadow-[0_0_40px_rgba(34,197,94,0.6)]'}
    `}>
        <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-green-300 !border-2 !border-white" />
        <Handle type="target" position={Position.Left} className="!w-3 !h-3 !bg-green-300 !border-2 !border-white" />
        <span className="text-white text-sm font-bold leading-tight uppercase tracking-wide max-w-[160px]">
            {data.label}
        </span>
    </div>
);

// Legacy clinical node for backward compatibility
const ClinicalNode = ({ data, selected }: { data: { label: string; type: string; mechanism?: string; subItems?: string[] }; selected: boolean }) => (
    <div className={`
        min-w-[120px] min-h-[50px] px-4 py-3
        bg-gradient-to-br from-slate-600 to-slate-800
        border-2 border-slate-400
        rounded-lg shadow-lg
        flex flex-col items-center justify-center text-center
        transition-all duration-300 cursor-pointer
        ${selected ? 'ring-4 ring-white/50 scale-105' : 'hover:scale-102'}
    `}>
        <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-white/30 !border-none" />
        <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-white/30 !border-none" />
        <span className="text-white text-xs font-semibold leading-tight max-w-[100px]">
            {data.label}
        </span>
        <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-white/30 !border-none" />
        <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-white/30 !border-none" />
    </div>
);

// Node types mapping
const nodeTypes = {
    start: StartNode,
    decision: DecisionNode,
    process: ProcessNode,
    end: EndNode,
    clinical: ClinicalNode, // Backward compatibility
};

interface CausalGraphProps {
    hypothesis: {
        hypothesis_id?: string;
        statement?: string;
        title?: string;
        causal_graph?: {
            nodes?: Array<{ id: string; label: string; type: string; mechanism?: string; subItems?: string[] }>;
            edges?: Array<{ from: string; to: string; label?: string; reason?: string }>;
        };
        systemic_cascade?: Array<{ organ: string; impact: string; mechanism?: string }>;
        therapeutic_resolution_chains?: Array<{
            intervention: string;
            pharmacodynamics?: string;
            side_effects?: Array<{ issue: string; resolution_intervention?: string; recursive_resolution?: string }>;
        }>;
    };
}

// Handle interface for external graph capture
export interface CausalGraphHandle {
    captureGraphImage: () => Promise<string | null>;
}

// Radial layout algorithm
function calculateRadialPosition(centerX: number, centerY: number, radius: number, angleIndex: number, totalItems: number, startAngle: number = 0): { x: number; y: number } {
    const angleStep = (2 * Math.PI) / Math.max(totalItems, 1);
    const angle = startAngle + (angleIndex * angleStep);
    return {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
    };
}

const CausalGraph = forwardRef<CausalGraphHandle, CausalGraphProps>(({ hypothesis }, ref) => {
    // Ref to the container for capturing screenshot
    const containerRef = useRef<HTMLDivElement>(null);

    // Expose capture function via ref
    useImperativeHandle(ref, () => ({
        captureGraphImage: async (): Promise<string | null> => {
            if (!containerRef.current) return null;
            try {
                const canvas = await html2canvas(containerRef.current, {
                    backgroundColor: '#0f172a', // Dark slate background
                    scale: 2, // Higher resolution
                    useCORS: true,
                    logging: false
                });
                return canvas.toDataURL('image/png');
            } catch (err) {
                console.error('Failed to capture graph:', err);
                return null;
            }
        }
    }), []);

    useEffect(() => {
        console.log('--- RADIAL CAUSAL GRAPH DEBUG ---');
        console.log('Hypothesis ID:', hypothesis.hypothesis_id);
        console.log('Causal Graph Data present:', !!hypothesis.causal_graph);
        if (hypothesis.causal_graph) {
            console.log('Nodes count:', hypothesis.causal_graph.nodes?.length);
            console.log('Edges count:', hypothesis.causal_graph.edges?.length);
        }
    }, [hypothesis]);

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedEdge, setSelectedEdge] = React.useState<any>(null);
    const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);

    const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
        event.preventDefault();
        // Look up full edge details including evidence
        const fullEdge = hypothesis.causal_graph?.edges?.find(e => e.from === edge.source && e.to === edge.target);

        setSelectedEdge({
            ...edge,
            data: {
                ...edge.data, // Default data
                ...fullEdge, // Enhanced data from hypothesis
                // Ensure legacy support or direct mapping
                evidenceIds: fullEdge?.evidenceIds || fullEdge?.evidence_ids || [],
                score: fullEdge?.score,
                safety: fullEdge?.safety,
                isOutcomeLink: fullEdge?.isOutcomeLink
            }
        });
        setIsDrawerOpen(true);
    }, [hypothesis]);

    useEffect(() => {
        const centerX = 600;
        const centerY = 400;
        const innerRadius = 200;
        const outerRadius = 380;
        const farRadius = 500;

        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];

        // =====================================================
        // HIERARCHICAL FLOWCHART LAYOUT
        // =====================================================

        // Layout constants
        const LAYER_HEIGHT = 160; // Vertical spacing between layers
        const NODE_WIDTH = 200;   // Horizontal spacing between nodes
        const START_Y = 50;       // Starting Y position

        // Helper: Determine flowchart node type based on data type
        const getFlowchartNodeType = (dataType: string): string => {
            switch (dataType?.toLowerCase()) {
                case 'pathology':
                case 'problem':
                case 'start':
                    return 'start';
                case 'resolution':
                case 'outcome':
                case 'end':
                    return 'end';
                case 'risk_factor':
                case 'decision':
                case 'condition':
                    return 'decision';
                default:
                    return 'process';
            }
        };

        // 1. Check for explicit causal_graph field
        if (hypothesis.causal_graph?.nodes && hypothesis.causal_graph.nodes.length > 0) {
            console.log('📊 Building hierarchical flowchart from explicit causal_graph');

            // Build adjacency list and identify root nodes
            const adjacency = new Map<string, string[]>();
            const inDegree = new Map<string, number>();
            const nodeMap = new Map<string, typeof hypothesis.causal_graph.nodes[0]>();

            // Initialize
            hypothesis.causal_graph.nodes.forEach(n => {
                nodeMap.set(n.id, n);
                adjacency.set(n.id, []);
                inDegree.set(n.id, 0);
            });

            // Build graph from edges
            const edgesToUse = hypothesis.causal_graph.edges || [];
            const labelToIdMap = new Map<string, string>();
            hypothesis.causal_graph.nodes.forEach(n => {
                if (n.label) labelToIdMap.set(n.label.toLowerCase(), n.id);
            });

            // Fuzzy matching helper
            const findNodeId = (label: string | undefined): string | undefined => {
                if (!label) return undefined;
                const lowerLabel = label.toLowerCase();
                if (labelToIdMap.has(lowerLabel)) return labelToIdMap.get(lowerLabel);
                for (const [nodeLabel, nodeId] of labelToIdMap.entries()) {
                    if (nodeLabel.includes(lowerLabel) || lowerLabel.includes(nodeLabel)) {
                        return nodeId;
                    }
                }
                return undefined;
            };

            // Auto-generate missing nodes from edges
            let autoNodeCounter = 0;
            edgesToUse.forEach(e => {
                const from = e.from || e.source;
                const to = e.to || e.target;

                [from, to].forEach(label => {
                    if (label && !findNodeId(label)) {
                        const nodeId = `auto-${autoNodeCounter++}`;
                        nodeMap.set(nodeId, { id: nodeId, label, type: 'process' });
                        adjacency.set(nodeId, []);
                        inDegree.set(nodeId, 0);
                        labelToIdMap.set(label.toLowerCase(), nodeId);
                    }
                });
            });

            // Process edges
            edgesToUse.forEach(e => {
                const fromId = findNodeId(e.from) || findNodeId(e.source);
                const toId = findNodeId(e.to) || findNodeId(e.target);
                if (fromId && toId && fromId !== toId) {
                    adjacency.get(fromId)?.push(toId);
                    inDegree.set(toId, (inDegree.get(toId) || 0) + 1);
                }
            });

            // Topological sort to determine layers (BFS-based)
            const layers: string[][] = [];
            const nodeLayer = new Map<string, number>();
            const visited = new Set<string>();

            // Find root nodes (in-degree = 0) or pathology nodes
            let queue: string[] = [];
            for (const [nodeId, deg] of inDegree.entries()) {
                const node = nodeMap.get(nodeId);
                if (deg === 0 || node?.type === 'pathology') {
                    queue.push(nodeId);
                    nodeLayer.set(nodeId, 0);
                    visited.add(nodeId);
                }
            }

            // If no roots found, use first pathology or first node
            if (queue.length === 0) {
                const firstNode = Array.from(nodeMap.keys())[0];
                if (firstNode) {
                    queue.push(firstNode);
                    nodeLayer.set(firstNode, 0);
                    visited.add(firstNode);
                }
            }

            // BFS to assign layers
            while (queue.length > 0) {
                const nextQueue: string[] = [];
                queue.forEach(nodeId => {
                    const currentLayer = nodeLayer.get(nodeId) || 0;
                    adjacency.get(nodeId)?.forEach(childId => {
                        if (!visited.has(childId)) {
                            visited.add(childId);
                            nodeLayer.set(childId, currentLayer + 1);
                            nextQueue.push(childId);
                        }
                    });
                });
                queue = nextQueue;
            }

            // Add unvisited nodes (disconnected components)
            for (const nodeId of nodeMap.keys()) {
                if (!visited.has(nodeId)) {
                    const maxLayer = Math.max(...Array.from(nodeLayer.values()), 0);
                    nodeLayer.set(nodeId, maxLayer + 1);
                }
            }

            // Group nodes by layer
            const layerNodes = new Map<number, string[]>();
            for (const [nodeId, layer] of nodeLayer.entries()) {
                if (!layerNodes.has(layer)) layerNodes.set(layer, []);
                layerNodes.get(layer)?.push(nodeId);
            }

            // Position nodes in hierarchical layout
            const maxLayer = Math.max(...Array.from(layerNodes.keys()), 0);

            layerNodes.forEach((nodeIds, layer) => {
                const layerWidth = nodeIds.length * NODE_WIDTH;
                const startX = centerX - layerWidth / 2 + NODE_WIDTH / 2;

                nodeIds.forEach((nodeId, idx) => {
                    const node = nodeMap.get(nodeId);
                    if (!node) return;

                    // Determine node type for flowchart
                    let flowchartType = getFlowchartNodeType(node.type);

                    // Force start type for first layer, end type for last layer
                    if (layer === 0 && node.type === 'pathology') flowchartType = 'start';
                    if (layer === maxLayer && (node.type === 'resolution' || node.type === 'outcome')) flowchartType = 'end';

                    newNodes.push({
                        id: nodeId,
                        type: flowchartType,
                        data: {
                            label: node.label,
                            type: node.type,
                            mechanism: node.mechanism,
                            subItems: node.subItems
                        },
                        position: {
                            x: startX + idx * NODE_WIDTH - 90,
                            y: START_Y + layer * LAYER_HEIGHT
                        }
                    });
                });
            });

            // Create edges with flowchart styling
            edgesToUse.forEach((e, idx) => {
                const sourceId = findNodeId(e.from) || findNodeId(e.source);
                const targetId = findNodeId(e.to) || findNodeId(e.target);

                if (sourceId && targetId) {
                    // Determine edge style based on relationship
                    const isPositive = e.label?.includes('TRAITE') || e.label?.includes('RÉSOUT') || e.label?.includes('améliore');
                    const isNegative = e.label?.includes('CAUSE') || e.label?.includes('aggrave') || e.label?.includes('↓');

                    newEdges.push({
                        id: `e-${idx}`,
                        source: sourceId,
                        target: targetId,
                        label: e.label,
                        type: 'smoothstep',
                        animated: isPositive,
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: isPositive ? '#22c55e' : isNegative ? '#ef4444' : '#64748b',
                            width: 20,
                            height: 20
                        },
                        style: {
                            strokeWidth: 3,
                            stroke: isPositive ? '#22c55e' : isNegative ? '#ef4444' : '#64748b'
                        },
                        labelStyle: {
                            fontSize: '10px',
                            fontWeight: 600,
                            fill: '#e2e8f0'
                        },
                        labelBgStyle: {
                            fill: '#1e293b',
                            fillOpacity: 0.95
                        },
                        labelBgPadding: [6, 4] as [number, number]
                    });
                }
            });

            console.log(`[CausalGraph Flowchart] Rendered ${newNodes.length} nodes across ${maxLayer + 1} layers, ${newEdges.length} edges`);
            setNodes(newNodes);
            setEdges(newEdges);
            return;

        } else {
            // 2. FALLBACK: Build DYNAMIC graph from hypothesis data
            console.warn('Building dynamic fallback graph from hypothesis data...');

            // Central pathology - USE THE ACTUAL HYPOTHESIS STATEMENT
            const rootLabel = hypothesis.statement || hypothesis.title || 'Pathologie Centrale';
            newNodes.push({
                id: 'root',
                type: 'clinical',
                data: { label: rootLabel.substring(0, 60) + (rootLabel.length > 60 ? '...' : ''), type: 'pathology' },
                position: { x: centerX - 70, y: centerY - 70 }
            });

            let nodeIndex = 0;

            // Build from systemic_cascade (symptoms/impacts of the disease)
            if (hypothesis.systemic_cascade && hypothesis.systemic_cascade.length > 0) {
                const cascadeCount = hypothesis.systemic_cascade.length;
                hypothesis.systemic_cascade.forEach((item: { organ: string; impact: string; mechanism?: string }, idx: number) => {
                    const nodeId = `cascade-${idx}`;
                    const angle = (-Math.PI / 2) + ((idx / cascadeCount) * Math.PI); // Spread on left side
                    const radius = innerRadius + (idx % 2) * 80;

                    newNodes.push({
                        id: nodeId,
                        type: 'clinical',
                        data: {
                            label: item.organ,
                            type: 'symptom',
                            subItems: [item.impact.substring(0, 50)]
                        },
                        position: {
                            x: centerX + radius * Math.cos(angle) - 50,
                            y: centerY + radius * Math.sin(angle) - 40
                        }
                    });
                    newEdges.push({
                        id: `e-root-${nodeId}`,
                        source: 'root',
                        target: nodeId,
                        type: 'smoothstep',
                        label: 'IMPACTE',
                        markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' },
                        style: { stroke: '#ef4444', strokeWidth: 2 },
                        labelStyle: { fontSize: '8px', fill: '#ef4444' }
                    });
                    nodeIndex++;
                });
            }

            // Build from therapeutic_resolution_chains
            if (hypothesis.therapeutic_resolution_chains && hypothesis.therapeutic_resolution_chains.length > 0) {
                const treatmentY = centerY - 200;
                let lastTreatmentId = 'root';

                hypothesis.therapeutic_resolution_chains.forEach((chain: {
                    intervention: string;
                    pharmacodynamics?: string;
                    side_effects?: Array<{ issue: string; resolution_intervention?: string }>;
                }, cIdx: number) => {
                    const treatmentId = `treatment-${cIdx}`;

                    newNodes.push({
                        id: treatmentId,
                        type: 'clinical',
                        data: {
                            label: chain.intervention?.substring(0, 40) || `Traitement ${cIdx + 1}`,
                            type: 'treatment'
                        },
                        position: { x: centerX + 150 + (cIdx * 180), y: treatmentY }
                    });

                    newEdges.push({
                        id: `e-${lastTreatmentId}-${treatmentId}`,
                        source: lastTreatmentId,
                        target: treatmentId,
                        type: 'smoothstep',
                        label: cIdx === 0 ? 'TRAITE' : 'PUIS',
                        animated: true,
                        markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
                        style: { stroke: '#3b82f6', strokeWidth: 2 },
                        labelStyle: { fontSize: '9px', fontWeight: 'bold', fill: '#3b82f6' }
                    });

                    lastTreatmentId = treatmentId;

                    // Add side effects if present
                    if (chain.side_effects && chain.side_effects.length > 0) {
                        chain.side_effects.forEach((se: { issue: string; resolution_intervention?: string }, sIdx: number) => {
                            const seId = `se-${cIdx}-${sIdx}`;
                            newNodes.push({
                                id: seId,
                                type: 'clinical',
                                data: { label: se.issue?.substring(0, 35) || 'Effet Secondaire', type: 'side-effect' },
                                position: { x: centerX + 150 + (cIdx * 180), y: treatmentY + 120 + (sIdx * 80) }
                            });
                            newEdges.push({
                                id: `e-${treatmentId}-${seId}`,
                                source: treatmentId,
                                target: seId,
                                type: 'smoothstep',
                                label: 'PROVOQUE',
                                markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' },
                                style: { stroke: '#f59e0b', strokeWidth: 2 },
                                labelStyle: { fontSize: '8px', fill: '#f59e0b' }
                            });

                            // Add resolution if present
                            if (se.resolution_intervention) {
                                const resId = `res-${cIdx}-${sIdx}`;
                                newNodes.push({
                                    id: resId,
                                    type: 'clinical',
                                    data: { label: se.resolution_intervention?.substring(0, 35) || 'Résolution', type: 'resolution' },
                                    position: { x: centerX + 300 + (cIdx * 180), y: treatmentY + 120 + (sIdx * 80) }
                                });
                                newEdges.push({
                                    id: `e-${seId}-${resId}`,
                                    source: seId,
                                    target: resId,
                                    type: 'smoothstep',
                                    label: 'RÉSOUT',
                                    animated: true,
                                    markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
                                    style: { stroke: '#10b981', strokeWidth: 2 },
                                    labelStyle: { fontSize: '8px', fill: '#10b981' }
                                });
                            }
                        });
                    }
                });

                // Add final resolution node
                newNodes.push({
                    id: 'final-resolution',
                    type: 'clinical',
                    data: { label: 'GUÉRISON / RÉMISSION', type: 'resolution' },
                    position: { x: centerX + 600, y: centerY }
                });
                newEdges.push({
                    id: 'e-last-final',
                    source: lastTreatmentId,
                    target: 'final-resolution',
                    type: 'smoothstep',
                    label: 'ABOUTIT_À',
                    animated: true,
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
                    style: { stroke: '#10b981', strokeWidth: 3 },
                    labelStyle: { fontSize: '9px', fontWeight: 'bold', fill: '#10b981' }
                });
            }

            // MINIMAL FALLBACK: If still no nodes beyond root, show a placeholder
            if (newNodes.length <= 1) {
                console.warn('No data available for graph reconstruction. Showing placeholder.');
                newNodes.push({
                    id: 'placeholder',
                    type: 'clinical',
                    data: {
                        label: '⏳ En attente des données IA...',
                        type: 'mechanism',
                        subItems: ['Lancez une nouvelle analyse', 'ou vérifiez la migration SQL']
                    },
                    position: { x: centerX + 200, y: centerY }
                });
                newEdges.push({
                    id: 'e-root-placeholder',
                    source: 'root',
                    target: 'placeholder',
                    type: 'smoothstep',
                    animated: true,
                    markerEnd: { type: MarkerType.ArrowClosed },
                    style: { stroke: '#94a3b8', strokeWidth: 2, strokeDasharray: '5,5' }
                });
            }
        }

        console.log('Dynamic graph complete:', { nodeCount: newNodes.length, edgeCount: newEdges.length });
        setNodes(newNodes);
        setEdges(newEdges);

    }, [hypothesis, setNodes, setEdges]);


    return (
        <>
            <div ref={containerRef} className="h-[800px] w-full bg-[#0f172a] rounded-2xl border border-slate-600 shadow-xl mt-8 overflow-hidden relative">
                {/* Paper texture overlay */}
                <div className="absolute inset-0 pointer-events-none opacity-30" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 100 100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }} />

                {/* Legend */}
                <div className="absolute top-4 left-4 z-10 p-4 bg-white/90 backdrop-blur border border-stone-200 rounded-xl shadow-lg">
                    <h3 className="text-sm font-bold text-stone-800 mb-3 uppercase tracking-wide">
                        Légende du Graphe
                    </h3>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[10px]">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-red-700 to-red-900 border border-red-400 shadow-sm" />
                            <span className="text-stone-700 font-medium">Pathologie ciblée</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 border border-blue-400 shadow-sm" />
                            <span className="text-stone-700 font-medium">Traitement</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 border border-slate-400 shadow-sm" />
                            <span className="text-stone-700 font-medium">Symptôme</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-yellow-600 to-amber-800 border border-yellow-400 shadow-sm" />
                            <span className="text-stone-700 font-medium">Effet secondaire</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-purple-700 to-purple-900 border border-purple-400 shadow-sm" />
                            <span className="text-stone-700 font-medium">Molécule</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-teal-600 to-teal-800 border border-teal-300 shadow-sm" />
                            <span className="text-stone-700 font-medium">Recherche</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full bg-gradient-to-br from-orange-600 to-orange-800 border border-orange-400 shadow-sm" />
                            <span className="text-stone-700 font-medium">Complication</span>
                        </div>
                        <div className="flex items-center gap-2 col-span-2">
                            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 border-2 border-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.4)]" />
                            <span className="text-emerald-700 font-bold">GUÉRISON</span>
                        </div>
                    </div>
                </div>



                <div className="absolute top-4 right-4 z-10">
                    <Badge className="bg-stone-800 text-stone-100 border-none px-3 py-1 text-[10px] font-mono">
                        {nodes.length} nœuds • {edges.length} liens
                    </Badge>
                </div>

                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onEdgeClick={onEdgeClick}
                    nodeTypes={nodeTypes}
                    fitView
                    minZoom={0.3}
                    maxZoom={2}
                    defaultEdgeOptions={{
                        type: 'smoothstep',
                    }}
                    className="bg-slate-950"
                >
                    <Background color="#334155" gap={20} variant={BackgroundVariant.Dots} />
                    <Controls className="!bg-white/80 !border-stone-200 !rounded-xl !overflow-hidden shadow-lg" />
                </ReactFlow>
            </div>

            {/* Sheet moved outside overflow-hidden container for proper z-index */}
            <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen} modal={true}>
                <SheetContent side="right" className="w-[400px] sm:w-[540px] bg-slate-900 border-l border-slate-800 text-slate-100 p-0 z-[61999] fixed">
                    <SheetHeader className="p-6 border-b border-slate-800">
                        <SheetTitle className="text-xl font-semibold text-emerald-400">
                            Evidence Drawer
                        </SheetTitle>
                        <SheetDescription className="text-slate-400">
                            Relation: <span className="text-white font-medium">{selectedEdge?.source}</span> → <span className="text-white font-medium">{selectedEdge?.target}</span>
                        </SheetDescription>
                        {selectedEdge?.label && (
                            <Badge variant="outline" className="mt-2 text-emerald-300 border-emerald-800 bg-emerald-950/30 w-fit">
                                {selectedEdge.label}
                            </Badge>
                        )}
                    </SheetHeader>
                    <ScrollArea className="h-[calc(100vh-200px)]">
                        <div className="p-6 space-y-6">

                            {/* Direction & Confidence Badge Row */}
                            <div className="flex items-center gap-3 flex-wrap">
                                {selectedEdge?.data?.direction && (
                                    <Badge className={`${selectedEdge.data.direction === 'positif' ? 'bg-emerald-600' : 'bg-red-600'} text-white`}>
                                        {selectedEdge.data.direction === 'positif' ? '↑ Effet Positif' : '↓ Effet Négatif'}
                                    </Badge>
                                )}
                                {selectedEdge?.data?.confidenceLevel && (
                                    <Badge variant="outline" className="text-amber-300 border-amber-700">
                                        Oxford: {selectedEdge.data.confidenceLevel}
                                    </Badge>
                                )}
                                {selectedEdge?.data?.claimId && (
                                    <Badge variant="secondary" className="bg-slate-800 text-slate-400 text-xs">
                                        {selectedEdge.data.claimId}
                                    </Badge>
                                )}
                            </div>

                            {/* Mechanism / Explanation */}
                            <div>
                                <h4 className="text-sm font-medium text-slate-400 mb-2 uppercase tracking-wider flex items-center gap-2">
                                    <span>⚙️</span> Mécanisme d'Action
                                </h4>
                                <p className="text-slate-200 bg-slate-950/50 p-4 rounded-lg border border-slate-800 leading-relaxed">
                                    {selectedEdge?.data?.mechanism || `${selectedEdge?.source} ${selectedEdge?.label} ${selectedEdge?.target}`}
                                </p>
                            </div>

                            {/* Clinical Context */}
                            {selectedEdge?.data?.context && (
                                <div>
                                    <h4 className="text-sm font-medium text-slate-400 mb-2 uppercase tracking-wider flex items-center gap-2">
                                        <span>🏥</span> Contexte Clinique
                                    </h4>
                                    <p className="text-slate-300 bg-slate-950/30 p-4 rounded-lg border border-slate-700 italic">
                                        {selectedEdge.data.context}
                                    </p>
                                </div>
                            )}

                            {/* Entity Types */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-950/50 p-3 rounded border border-slate-800">
                                    <div className="text-xs text-slate-500 mb-1">Source</div>
                                    <div className="text-sm font-medium text-cyan-400">{selectedEdge?.source}</div>
                                    <div className="text-xs text-slate-500">{selectedEdge?.data?.sourceType || 'unknown'}</div>
                                </div>
                                <div className="bg-slate-950/50 p-3 rounded border border-slate-800">
                                    <div className="text-xs text-slate-500 mb-1">Target</div>
                                    <div className="text-sm font-medium text-rose-400">{selectedEdge?.target}</div>
                                    <div className="text-xs text-slate-500">{selectedEdge?.data?.targetType || 'unknown'}</div>
                                </div>
                            </div>

                            {/* Confidence Metrics */}
                            <div>
                                <h4 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
                                    <span>📊</span> Métriques de Confiance
                                </h4>
                                <div className="grid grid-cols-2 gap-3">
                                    {selectedEdge?.data?.score !== undefined && (
                                        <div className="bg-slate-950/50 p-3 rounded border border-slate-800">
                                            <div className="text-xs text-slate-500">Score Agrégé</div>
                                            <div className="text-lg font-bold text-white">{(selectedEdge.data.score * 100).toFixed(0)}%</div>
                                        </div>
                                    )}
                                    {selectedEdge?.data?.plausibility !== undefined && selectedEdge.data.plausibility > 0 && (
                                        <div className="bg-slate-950/50 p-3 rounded border border-slate-800">
                                            <div className="text-xs text-slate-500">Plausibilité</div>
                                            <div className="text-lg font-bold text-blue-400">{(selectedEdge.data.plausibility * 100).toFixed(0)}%</div>
                                        </div>
                                    )}
                                    {selectedEdge?.data?.novelty !== undefined && selectedEdge.data.novelty > 0 && (
                                        <div className="bg-slate-950/50 p-3 rounded border border-slate-800">
                                            <div className="text-xs text-slate-500">Nouveauté</div>
                                            <div className="text-lg font-bold text-amber-400">{(selectedEdge.data.novelty * 100).toFixed(0)}%</div>
                                        </div>
                                    )}
                                    {selectedEdge?.data?.safety !== undefined && selectedEdge.data.safety > 0 && (
                                        <div className="bg-slate-950/50 p-3 rounded border border-slate-800">
                                            <div className="text-xs text-slate-500">Risque Sécurité</div>
                                            <div className={`text-lg font-bold ${selectedEdge.data.safety > 0.5 ? 'text-red-400' : 'text-emerald-400'}`}>
                                                {(selectedEdge.data.safety * 100).toFixed(0)}%
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* References */}
                            {selectedEdge?.data?.references && selectedEdge.data.references.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
                                        <span>📚</span> Références
                                    </h4>
                                    <div className="space-y-2">
                                        {selectedEdge.data.references.map((ref: string, idx: number) => (
                                            <div key={idx} className="text-sm text-blue-400 bg-slate-950/30 p-2 rounded border border-slate-700">
                                                {ref}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Evidence IDs */}
                            {selectedEdge?.data?.evidenceIds && selectedEdge.data.evidenceIds.length > 0 && (
                                <div>
                                    <h4 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wider flex items-center gap-2">
                                        <span>🔗</span> Evidence IDs
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedEdge.data.evidenceIds.map((eid: string) => (
                                            <Badge key={eid} variant="secondary" className="text-xs bg-slate-800 text-slate-300">
                                                {eid}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}

                        </div>
                    </ScrollArea>
                </SheetContent>
            </Sheet>
        </>
    );
});

CausalGraph.displayName = 'CausalGraph';

export default CausalGraph;
