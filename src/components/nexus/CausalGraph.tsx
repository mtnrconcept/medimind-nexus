
import React, { useMemo, useEffect } from 'react';
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
    MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Badge } from '@/components/ui/badge';

// Custom Node Components
const ClinicalNode = ({ data, selected }: any) => {
    const getColors = (type: string) => {
        switch (type) {
            case 'pathology': return 'bg-red-950 border-red-500 text-red-50 shadow-red-500/20';
            case 'symptom': return 'bg-orange-950 border-orange-500 text-orange-50 shadow-orange-500/20';
            case 'medication': return 'bg-blue-950 border-blue-500 text-blue-50 shadow-blue-500/20';
            case 'side-effect': return 'bg-amber-950 border-amber-500 text-amber-50 shadow-amber-500/20';
            case 'resolution': return 'bg-emerald-950 border-emerald-500 text-emerald-50 shadow-emerald-500/20';
            default: return 'bg-slate-900 border-slate-700 text-slate-100 shadow-slate-500/10';
        }
    };

    return (
        <div className={`px-5 py-3 rounded-xl border-2 shadow-2xl min-w-[180px] max-w-[280px] transition-all duration-300 ${getColors(data.type)} ${selected ? 'ring-4 ring-white/30 scale-110' : ''}`}>
            <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-slate-600 border-2 border-slate-900" />
            <div className="flex flex-col gap-1.5 pt-1">
                <div className="flex justify-between items-center bg-white/5 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest mb-1">
                    <span>{data.type}</span>
                    {selected && <span className="animate-pulse text-white font-mono">ON_SELECT</span>}
                </div>
                <span className="text-xs font-black leading-tight tracking-tight uppercase break-words">{data.label}</span>
                {data.mechanism && (
                    <div className="text-[9px] italic opacity-70 leading-relaxed border-t border-white/10 pt-1.5 mt-1.5 line-clamp-3">
                        {data.mechanism}
                    </div>
                )}
            </div>
            <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-slate-600 border-2 border-slate-900" />
        </div>
    );
};

const nodeTypes = {
    clinical: ClinicalNode,
};

interface CausalGraphProps {
    hypothesis: any;
}

export default function CausalGraph({ hypothesis }: CausalGraphProps) {
    useEffect(() => {
        console.log('--- CAUSAL GRAPH DEBUG ---');
        console.log('Hypothesis ID:', hypothesis.hypothesis_id);
        console.log('Causal Graph Data present:', !!hypothesis.causal_graph);
        if (hypothesis.causal_graph) {
            console.log('Nodes count:', hypothesis.causal_graph.nodes?.length);
            console.log('Edges count:', hypothesis.causal_graph.edges?.length);
        }
    }, [hypothesis]);

    const { nodes, edges } = useMemo(() => {
        // 1. Check for explicit causal_graph field (New Schema)
        if (hypothesis.causal_graph && hypothesis.causal_graph.nodes && hypothesis.causal_graph.nodes.length > 0) {
            const explicitNodes: Node[] = hypothesis.causal_graph.nodes.map((n: any, idx: number) => ({
                id: n.id || `n-${idx}`,
                type: 'clinical',
                data: {
                    label: n.label,
                    type: n.type || 'default',
                    mechanism: n.mechanism
                },
                position: n.position || {
                    x: 500 + Math.cos(idx * 0.8) * 400,
                    y: 400 + Math.sin(idx * 0.8) * 300
                },
            }));

            const explicitEdges: Edge[] = (hypothesis.causal_graph.edges || []).map((e: any, idx: number) => ({
                id: `e-${idx}`,
                source: e.from,
                target: e.to,
                label: e.label,
                animated: true,
                type: ConnectionLineType.SmoothStep,
                markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6', width: 20, height: 20 },
                style: { strokeWidth: 2, stroke: '#3b82f6' },
                labelStyle: { fontSize: '10px', fontWeight: 'black', fill: '#60a5fa' },
                data: { reason: e.reason }
            }));

            return { nodes: explicitNodes, edges: explicitEdges };
        }

        // 2. FALLBACK to robust reconstruction if explicit data is missing
        console.warn('Causal graph explicit data missing, attempting reconstruction...', {
            statement: !!hypothesis.statement,
            cascadeLength: hypothesis.systemic_cascade?.length,
            chainsLength: hypothesis.therapeutic_resolution_chains?.length
        });

        const nodes: Node[] = [];
        const edges: Edge[] = [];
        const centerX = 500;
        let currentY = 50; // Started slightly lower
        const ySpacing = 220;
        const xOffset = 380;

        // Root Pathology - ALWAYS PUSHED
        const rootId = 'root';
        const rootLabel = hypothesis.statement || hypothesis.title || 'Pathologie Centrale';

        nodes.push({
            id: rootId,
            type: 'clinical',
            data: {
                label: rootLabel.substring(0, 120) + (rootLabel.length > 120 ? '...' : ''),
                type: 'pathology',
                mechanism: 'Point d\'entrée de l\'analyse physio-pathologique'
            },
            position: { x: centerX, y: currentY },
        });

        let lastMainNodeId = rootId;
        currentY += ySpacing;

        // Reconstruct from systemic cascade (side effects of the pathology)
        if (hypothesis.systemic_cascade && hypothesis.systemic_cascade.length > 0) {
            hypothesis.systemic_cascade.forEach((item: any, idx: number) => {
                const nodeId = `sys-${idx}`;
                nodes.push({
                    id: nodeId,
                    type: 'clinical',
                    data: {
                        label: `${item.organ}: ${item.impact}`,
                        type: 'symptom',
                        mechanism: item.mechanism
                    },
                    position: { x: centerX + (idx % 2 === 0 ? -xOffset : xOffset), y: 150 + (idx * 120) },
                });

                edges.push({
                    id: `e-root-${nodeId}`,
                    source: 'root',
                    target: nodeId,
                    style: { stroke: '#ef4444', strokeWidth: 2, opacity: 0.6 },
                    label: 'IMPACTE',
                    labelStyle: { fontSize: '8px', fill: '#f87171' }
                });
            });
        }

        // Reconstruct from therapeutic chains
        if (hypothesis.therapeutic_resolution_chains && hypothesis.therapeutic_resolution_chains.length > 0) {
            hypothesis.therapeutic_resolution_chains.forEach((chain: any, cIdx: number) => {
                const treatmentId = `treat-${cIdx}`;
                nodes.push({
                    id: treatmentId,
                    type: 'clinical',
                    data: {
                        label: chain.intervention,
                        type: 'medication',
                        mechanism: chain.pharmacodynamics
                    },
                    position: { x: centerX, y: currentY },
                });

                edges.push({
                    id: `e-${lastMainNodeId}-${treatmentId}`,
                    source: lastMainNodeId,
                    target: treatmentId,
                    animated: true,
                    style: { stroke: '#3b82f6', strokeWidth: 3 },
                    label: 'INTERVENTION',
                    markerEnd: { type: MarkerType.ArrowClosed, color: '#3b82f6' },
                    labelStyle: { fontSize: '10px', fontWeight: 'bold', fill: '#60a5fa' }
                });

                lastMainNodeId = treatmentId;
                currentY += ySpacing;

                if (chain.side_effects) {
                    chain.side_effects.forEach((se: any, sIdx: number) => {
                        const seId = `se-${cIdx}-${sIdx}`;
                        const resId = `res-${cIdx}-${sIdx}`;

                        nodes.push({
                            id: seId,
                            type: 'clinical',
                            data: { label: se.issue, type: 'side-effect' },
                            position: { x: centerX + xOffset, y: currentY },
                        });

                        edges.push({
                            id: `e-${treatmentId}-${seId}`,
                            source: treatmentId,
                            target: seId,
                            style: { stroke: '#fbbf24', strokeWidth: 2 },
                            label: 'PROVOQUE',
                            labelStyle: { fontSize: '8px', fill: '#fbbf24' }
                        });

                        nodes.push({
                            id: resId,
                            type: 'clinical',
                            data: { label: se.resolution_intervention, type: 'resolution', mechanism: se.recursive_resolution },
                            position: { x: centerX + xOffset, y: currentY + (ySpacing / 2) },
                        });

                        edges.push({
                            id: `e-${seId}-${resId}`,
                            source: seId,
                            target: resId,
                            animated: true,
                            style: { stroke: '#10b981', strokeWidth: 2 },
                            label: 'RÉSOUD',
                            markerEnd: { type: MarkerType.ArrowClosed, color: '#10b981' },
                            labelStyle: { fontSize: '8px', fill: '#10b981' }
                        });

                        // Continue the main line from the resolution if present, otherwise from the treatment
                        lastMainNodeId = resId;
                    });
                    currentY += ySpacing;
                }
            });
        }

        // FAILSAFE: If reconstruction produced nothing, add demo nodes
        if (nodes.length <= 1) {
            console.warn('Reconstruction yielded only root node. Adding demo pathway for visual verification.');
            const demoId = 'demo-1';
            nodes.push({
                id: demoId,
                type: 'clinical',
                data: {
                    label: '⚠️ Données insuffisantes pour reconstruction',
                    type: 'medication',
                    mechanism: 'Veuillez lancer une nouvelle analyse avec le prompt RCDP v2.5 ou vérifier que les colonnes causal_graph et mermaid_graph existent dans la table discovery_hypotheses.'
                },
                position: { x: centerX, y: currentY + ySpacing },
            });

            edges.push({
                id: 'e-root-demo',
                source: 'root',
                target: demoId,
                animated: true,
                style: { stroke: '#f59e0b', strokeWidth: 3 },
                label: 'DIAGNOSTIC',
                markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b' },
                labelStyle: { fontSize: '10px', fontWeight: 'bold', fill: '#fbbf24' }
            });
        }

        console.log('Fallback reconstruction complete:', { nodeCount: nodes.length, edgeCount: edges.length });

        return { nodes, edges };
    }, [hypothesis]);


    return (
        <div className="h-[750px] w-full bg-[#020617] rounded-3xl border border-slate-800 shadow-[inset_0_0_120px_rgba(30,58,138,0.15)] mt-8 overflow-hidden relative group">
            <div className="absolute top-6 left-6 z-10 p-5 bg-slate-900/40 backdrop-blur-2xl border border-white/5 rounded-3xl shadow-2xl transition-all group-hover:bg-slate-900/60">
                <div className="flex items-center gap-3 mb-1">
                    <div className="w-3 h-3 rounded-full bg-emerald-500 animate-[pulse_2s_infinite]" />
                    <h3 className="text-sm font-black text-white uppercase tracking-tight">
                        Advanced Causal Discovery Engine
                    </h3>
                </div>
                <p className="text-[10px] text-emerald-400 font-black uppercase tracking-[0.3em] opacity-80">RCDP v2.5 Interactive Interface</p>

                <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2">
                    <div className="flex items-center gap-2 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                        <div className="w-2 h-2 rounded-full bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.5)]" /> Pathologie
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                        <div className="w-2 h-2 rounded-full bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.5)]" /> Traitement
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                        <div className="w-2 h-2 rounded-full bg-amber-600 shadow-[0_0_8px_rgba(217,119,6,0.5)]" /> Effet Sec.
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                        <div className="w-2 h-2 rounded-full bg-emerald-600 shadow-[0_0_8px_rgba(5,150,105,0.5)]" /> Résolution
                    </div>
                </div>
            </div>

            <div className="absolute top-6 right-6 z-10">
                <Badge className="bg-white/5 hover:bg-white/10 text-slate-400 border-white/10 backdrop-blur-md px-3 py-1 text-[10px] font-mono lowercase tracking-tighter">
                    NODE COUNT: {nodes.length} | EDGE COUNT: {edges.length}
                </Badge>
            </div>

            <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                colorMode="dark"
                minZoom={0.05}
                maxZoom={4}
            >
                <Background gap={40} color="#1e293b" size={1} variant={BackgroundVariant.Lines} />
                <Controls className="!bg-slate-900/60 !border-white/5 !rounded-2xl !overflow-hidden fill-white backdrop-blur-md shadow-2xl scale-90 origin-bottom-left" />
            </ReactFlow>

            {/* Grid Overlay for Premium Feel */}
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,_transparent_0%,_#020617_90%)] opacity-60" />
        </div>
    );
}
