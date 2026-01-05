
import React, { useMemo, useEffect, useCallback } from 'react';
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

// Node styling based on type - matching the radial graph structure
const ClinicalNode = ({ data, selected }: { data: { label: string; type: string; mechanism?: string; subItems?: string[] }; selected: boolean }) => {
    const getNodeStyle = (type: string) => {
        switch (type) {
            case 'pathology':
                // Central node - red, larger, glowing
                return {
                    bg: 'bg-gradient-to-br from-red-700 to-red-900',
                    border: 'border-red-400',
                    text: 'text-white',
                    size: 'min-w-[140px] min-h-[140px] rounded-full',
                    shadow: 'shadow-[0_0_40px_rgba(239,68,68,0.4)]'
                };
            case 'symptom':
                // Gray/slate for symptoms
                return {
                    bg: 'bg-gradient-to-br from-slate-600 to-slate-800',
                    border: 'border-slate-400',
                    text: 'text-slate-100',
                    size: 'min-w-[100px] rounded-full',
                    shadow: 'shadow-lg'
                };
            case 'molecule':
                // Purple for molecular targets
                return {
                    bg: 'bg-gradient-to-br from-purple-700 to-purple-900',
                    border: 'border-purple-400',
                    text: 'text-purple-100',
                    size: 'min-w-[90px] rounded-full',
                    shadow: 'shadow-[0_0_20px_rgba(147,51,234,0.3)]'
                };
            case 'treatment':
            case 'medication':
                // Blue for treatments/medications
                return {
                    bg: 'bg-gradient-to-br from-blue-600 to-blue-800',
                    border: 'border-blue-400',
                    text: 'text-blue-100',
                    size: 'min-w-[100px] rounded-full',
                    shadow: 'shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                };
            case 'side_effect':
                // Yellow/amber for side effects
                return {
                    bg: 'bg-gradient-to-br from-yellow-600 to-amber-800',
                    border: 'border-yellow-400',
                    text: 'text-yellow-100',
                    size: 'min-w-[80px] rounded-full',
                    shadow: 'shadow-lg'
                };
            case 'complication':
                // Orange for complications
                return {
                    bg: 'bg-gradient-to-br from-orange-600 to-orange-800',
                    border: 'border-orange-400',
                    text: 'text-orange-100',
                    size: 'min-w-[90px] rounded-full',
                    shadow: 'shadow-lg'
                };
            case 'research':
                // Teal/cyan for research projects
                return {
                    bg: 'bg-gradient-to-br from-teal-600 to-teal-800',
                    border: 'border-teal-300',
                    text: 'text-teal-100',
                    size: 'min-w-[100px] rounded-full',
                    shadow: 'shadow-[0_0_25px_rgba(20,184,166,0.3)]'
                };
            case 'resolution':
                // Green for resolution (kept for backward compatibility)
                return {
                    bg: 'bg-gradient-to-br from-emerald-600 to-emerald-800',
                    border: 'border-emerald-300',
                    text: 'text-white',
                    size: 'min-w-[120px] min-h-[80px] rounded-full',
                    shadow: 'shadow-[0_0_30px_rgba(16,185,129,0.4)]'
                };
            case 'mechanism':
            case 'evaluation':
            case 'monitoring':
                // Cyan for mechanisms/monitoring (kept for backward compatibility)
                return {
                    bg: 'bg-gradient-to-br from-cyan-700 to-cyan-900',
                    border: 'border-cyan-400',
                    text: 'text-cyan-100',
                    size: 'min-w-[80px] rounded-full',
                    shadow: 'shadow-lg'
                };
            default:
                return {
                    bg: 'bg-gradient-to-br from-slate-700 to-slate-900',
                    border: 'border-slate-500',
                    text: 'text-slate-100',
                    size: 'min-w-[80px] rounded-full',
                    shadow: 'shadow-lg'
                };
        }
    };


    const style = getNodeStyle(data.type);

    return (
        <div className={`
            ${style.size} ${style.bg} ${style.text} ${style.shadow}
            border-2 ${style.border}
            flex flex-col items-center justify-center p-3 text-center
            transition-all duration-300 cursor-pointer
            ${selected ? 'ring-4 ring-white/50 scale-110' : 'hover:scale-105'}
        `}>
            <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-white/30 !border-none" />
            <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-white/30 !border-none" />
            <Handle type="target" position={Position.Right} className="!w-2 !h-2 !bg-white/30 !border-none" />

            <span className="text-[10px] font-black leading-tight uppercase tracking-tight break-words max-w-[120px]">
                {data.label}
            </span>

            {data.subItems && data.subItems.length > 0 && (
                <div className="mt-1 text-[8px] opacity-70 leading-tight">
                    {data.subItems.slice(0, 3).join(' • ')}
                </div>
            )}

            <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-white/30 !border-none" />
            <Handle type="source" position={Position.Left} className="!w-2 !h-2 !bg-white/30 !border-none" />
            <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-white/30 !border-none" />
        </div>
    );
};

const nodeTypes = {
    clinical: ClinicalNode,
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

// Radial layout algorithm
function calculateRadialPosition(centerX: number, centerY: number, radius: number, angleIndex: number, totalItems: number, startAngle: number = 0): { x: number; y: number } {
    const angleStep = (2 * Math.PI) / Math.max(totalItems, 1);
    const angle = startAngle + (angleIndex * angleStep);
    return {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
    };
}

export default function CausalGraph({ hypothesis }: CausalGraphProps) {
    useEffect(() => {
        console.log('--- RADIAL CAUSAL GRAPH DEBUG ---');
        console.log('Hypothesis ID:', hypothesis.hypothesis_id);
        console.log('Causal Graph Data present:', !!hypothesis.causal_graph);
        if (hypothesis.causal_graph) {
            console.log('Nodes count:', hypothesis.causal_graph.nodes?.length);
            console.log('Edges count:', hypothesis.causal_graph.edges?.length);
        }
    }, [hypothesis]);

    const { nodes, edges } = useMemo(() => {
        const centerX = 600;
        const centerY = 400;
        const innerRadius = 200;
        const outerRadius = 380;
        const farRadius = 500;

        // 1. Check for explicit causal_graph field
        if (hypothesis.causal_graph?.nodes && hypothesis.causal_graph.nodes.length > 0) {
            // Compute radial positions for explicit nodes
            const nodeCount = hypothesis.causal_graph.nodes.length;
            const pathologyNodes = hypothesis.causal_graph.nodes.filter(n => n.type === 'pathology');
            const otherNodes = hypothesis.causal_graph.nodes.filter(n => n.type !== 'pathology' && n.type !== 'resolution');
            const resolutionNodes = hypothesis.causal_graph.nodes.filter(n => n.type === 'resolution');

            const explicitNodes: Node[] = [];

            // Place pathology at center
            pathologyNodes.forEach((n, idx) => {
                explicitNodes.push({
                    id: n.id,
                    type: 'clinical',
                    data: { label: n.label, type: n.type, mechanism: n.mechanism, subItems: n.subItems },
                    position: { x: centerX - 70, y: centerY - 70 }
                });
            });

            // Place other nodes radially
            otherNodes.forEach((n, idx) => {
                const pos = calculateRadialPosition(centerX, centerY, innerRadius + (idx % 2) * 120, idx, otherNodes.length, -Math.PI / 2);
                explicitNodes.push({
                    id: n.id,
                    type: 'clinical',
                    data: { label: n.label, type: n.type, mechanism: n.mechanism, subItems: n.subItems },
                    position: { x: pos.x - 50, y: pos.y - 40 }
                });
            });

            // Place resolution nodes on the far right
            resolutionNodes.forEach((n, idx) => {
                explicitNodes.push({
                    id: n.id,
                    type: 'clinical',
                    data: { label: n.label, type: n.type, mechanism: n.mechanism, subItems: n.subItems },
                    position: { x: centerX + farRadius, y: centerY - 50 + (idx * 120) }
                });
            });

            const explicitEdges: Edge[] = (hypothesis.causal_graph.edges || []).map((e, idx) => ({
                id: `e-${idx}`,
                source: e.from,
                target: e.to,
                label: e.label,
                type: 'smoothstep',
                animated: e.label === 'RÉSOUT' || e.label === 'TRAITE',
                markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b', width: 15, height: 15 },
                style: { strokeWidth: 2, stroke: '#475569' },
                labelStyle: { fontSize: '9px', fontWeight: 'bold', fill: '#94a3b8' },
                labelBgStyle: { fill: '#1e293b', fillOpacity: 0.9 },
                labelBgPadding: [4, 2] as [number, number]
            }));

            return { nodes: explicitNodes, edges: explicitEdges };
        }

        // 2. FALLBACK: Build DYNAMIC graph from hypothesis data
        console.warn('Building dynamic fallback graph from hypothesis data...');
        const nodes: Node[] = [];
        const edges: Edge[] = [];

        // Central pathology - USE THE ACTUAL HYPOTHESIS STATEMENT
        const rootLabel = hypothesis.statement || hypothesis.title || 'Pathologie Centrale';
        nodes.push({
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

                nodes.push({
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
                edges.push({
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

                nodes.push({
                    id: treatmentId,
                    type: 'clinical',
                    data: {
                        label: chain.intervention?.substring(0, 40) || `Traitement ${cIdx + 1}`,
                        type: 'treatment'
                    },
                    position: { x: centerX + 150 + (cIdx * 180), y: treatmentY }
                });

                edges.push({
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
                        nodes.push({
                            id: seId,
                            type: 'clinical',
                            data: { label: se.issue?.substring(0, 35) || 'Effet Secondaire', type: 'side-effect' },
                            position: { x: centerX + 150 + (cIdx * 180), y: treatmentY + 120 + (sIdx * 80) }
                        });
                        edges.push({
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
                            nodes.push({
                                id: resId,
                                type: 'clinical',
                                data: { label: se.resolution_intervention?.substring(0, 35) || 'Résolution', type: 'resolution' },
                                position: { x: centerX + 300 + (cIdx * 180), y: treatmentY + 120 + (sIdx * 80) }
                            });
                            edges.push({
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
            nodes.push({
                id: 'final-resolution',
                type: 'clinical',
                data: { label: 'GUÉRISON / RÉMISSION', type: 'resolution' },
                position: { x: centerX + 600, y: centerY }
            });
            edges.push({
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
        if (nodes.length <= 1) {
            console.warn('No data available for graph reconstruction. Showing placeholder.');
            nodes.push({
                id: 'placeholder',
                type: 'clinical',
                data: {
                    label: '⏳ En attente des données IA...',
                    type: 'mechanism',
                    subItems: ['Lancez une nouvelle analyse', 'ou vérifiez la migration SQL']
                },
                position: { x: centerX + 200, y: centerY }
            });
            edges.push({
                id: 'e-root-placeholder',
                source: 'root',
                target: 'placeholder',
                type: 'smoothstep',
                animated: true,
                markerEnd: { type: MarkerType.ArrowClosed },
                style: { stroke: '#94a3b8', strokeWidth: 2, strokeDasharray: '5,5' }
            });
        }

        console.log('Dynamic graph complete:', { nodeCount: nodes.length, edgeCount: edges.length });

        return { nodes, edges };
    }, [hypothesis]);

    return (
        <div className="h-[800px] w-full bg-[#f5f0e8] rounded-2xl border border-stone-300 shadow-xl mt-8 overflow-hidden relative">
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
                nodeTypes={nodeTypes}
                fitView
                minZoom={0.3}
                maxZoom={2}
                defaultEdgeOptions={{
                    type: 'smoothstep',
                }}
            >
                <Background gap={30} color="#d4c8b8" size={1} variant={BackgroundVariant.Lines} />
                <Controls className="!bg-white/80 !border-stone-200 !rounded-xl !overflow-hidden shadow-lg" />
            </ReactFlow>
        </div>
    );
}
