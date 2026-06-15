import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
    Activity, Brain, AlertTriangle, CheckCircle2,
    Search, Network, Info, ArrowRight, Star,
    ChevronDown, ChevronUp, ExternalLink, Zap,
    Clock
} from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Job {
    id: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    node_label: string;
    facet: string;
    depth: number;
    priority: number;
}

interface Claim {
    id: string;
    subject_text: string;
    predicate: string;
    object_text: string;
    object_type?: string;
    inference_rule: string;
    aggregate_score: number;
    evidence_quality: number;
    mechanistic_plausibility: number;
    recency_score: number;
    hypothesis_id?: string;
}

interface Contradiction {
    id: string;
    claim_support: Claim;
    claim_refute: Claim;
    explanation: string;
}

interface DiscoveryTabContentProps {
    frontierJobs: Job[];
    lbdClaims: Claim[];
    reasoningTraces: Record<string, any>[];
    contradictions: Contradiction[];
    isLoading: boolean;
    onPromoteClaim: (claim: Claim) => void;
}

export const DiscoveryTabContent: React.FC<DiscoveryTabContentProps> = ({
    frontierJobs: jobs,
    lbdClaims: claims,
    reasoningTraces: traces,
    contradictions,
    isLoading,
    onPromoteClaim: onPromote
}) => {
    const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
    const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

    const activeJobs = jobs.filter(j => j.status === 'running');
    const pendingJobs = jobs.filter(j => j.status === 'pending');

    return (
        <div className="grid grid-cols-12 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            {/* SIDE PANEL: QUEUE & CONTRADICTIONS */}
            <div className="col-span-12 lg:col-span-4 space-y-6">
                {/* FRONTIER QUEUE */}
                <Card className="nexus-card border-cyan-500/20 bg-slate-900/40 backdrop-blur-xl group overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 to-blue-500 opacity-50" />
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs uppercase tracking-widest font-black text-cyan-400 flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <Activity className="h-4 w-4 animate-pulse" /> Frontier Queue
                            </span>
                            <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                                {jobs.length} Active
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-[400px]">
                            <div className="p-4 space-y-3">
                                {activeJobs.map(job => (
                                    <div key={job.id} className="p-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5 relative overflow-hidden">
                                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
                                        <div className="relative flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-white truncate max-w-[180px]">
                                                {job.node_label || 'Exploring...'}
                                            </span>
                                            <Badge className="bg-cyan-500 text-[9px] h-4">RUNNING</Badge>
                                        </div>
                                        <div className="relative flex items-center gap-2 text-[10px] text-slate-400">
                                            <span className="capitalize">{job.facet}</span>
                                            <span>•</span>
                                            <span>Depth {job.depth}</span>
                                        </div>
                                        <Progress value={Math.random() * 100} className="h-0.5 mt-2 bg-slate-800" />
                                    </div>
                                ))}
                                {pendingJobs.map(job => (
                                    <div key={job.id} className="p-3 rounded-lg border border-white/5 bg-white/5 hover:border-white/10 transition-colors">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-medium text-slate-300 truncate">
                                                {job.node_label}
                                            </span>
                                            <span className="text-[9px] text-slate-500 uppercase font-bold">Pending</span>
                                        </div>
                                        <div className="text-[10px] text-slate-500 capitalize">{job.facet} • Priority {job.priority?.toFixed(2)}</div>
                                    </div>
                                ))}
                                {jobs.length === 0 && !isLoading && (
                                    <div className="text-center py-10 text-slate-500 text-xs italic">
                                        No exploration jobs in queue
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>

                {/* CONTRADICTION FEED */}
                <Card className="nexus-card border-red-500/20 bg-slate-900/40 backdrop-blur-xl">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs uppercase tracking-widest font-black text-rose-400 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" /> Conflict Analysis
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-[300px]">
                            <div className="p-4 space-y-4">
                                {contradictions.map(c => (
                                    <div key={c.id} className="space-y-2 p-3 rounded-lg bg-rose-500/5 border border-rose-500/20 border-l-4 border-l-rose-500">
                                        <div className="flex items-start gap-2">
                                            <div className="p-1 rounded bg-rose-500/20 mt-0.5">
                                                <AlertTriangle className="h-3 w-3 text-rose-400" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-[11px] font-bold text-slate-200 leading-tight">
                                                    Contradiction detected: {c.claim_support?.object_text}
                                                </p>
                                                <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                                                    {c.explanation}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                            <div className="p-2 rounded bg-green-500/5 border border-green-500/10 text-[9px]">
                                                <span className="text-green-400 font-bold block mb-1">SUPPORT</span>
                                                <span className="text-slate-500 line-clamp-1">Agg: {c.claim_support?.aggregate_score?.toFixed(2)}</span>
                                            </div>
                                            <div className="p-2 rounded bg-rose-500/5 border border-rose-500/10 text-[9px]">
                                                <span className="text-rose-400 font-bold block mb-1">REFUTE</span>
                                                <span className="text-slate-500 line-clamp-1">Agg: {c.claim_refute?.aggregate_score?.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {contradictions.length === 0 && (
                                    <div className="text-center py-10 text-slate-600 text-[10px] uppercase font-bold tracking-tighter">
                                        Zero active conflicts
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>

            {/* MAIN CONTENT: DISCOVERY FRONTIER */}
            <div className="col-span-12 lg:col-span-8 space-y-6">
                {/* HYPOTHESIS EXPLORER */}
                <Card className="nexus-card border-white/5 bg-slate-900/60 backdrop-blur-2xl">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 pb-4">
                        <CardTitle className="text-xs uppercase tracking-[0.2em] font-black text-slate-400 flex items-center gap-2">
                            <Zap className="h-4 w-4 text-amber-400" /> Discovery Frontier
                        </CardTitle>
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="h-7 text-[9px] uppercase font-bold border-white/10 hover:bg-white/5">
                                Filter Scores
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-[9px] uppercase font-bold bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                                Freshness
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <ScrollArea className="h-[750px] w-full">
                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                                {claims.map((claim) => (
                                    <div
                                        key={claim.id}
                                        className={cn(
                                            "nexus-card group relative p-5 border transition-all duration-300 cursor-pointer overflow-hidden",
                                            selectedClaimId === claim.id
                                                ? "border-cyan-500/50 bg-cyan-500/5 shadow-[0_0_30px_rgba(6,182,212,0.15)]"
                                                : "border-white/5 bg-white/[0.02] hover:border-white/20"
                                        )}
                                        onClick={() => setSelectedClaimId(claim.id)}
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="space-y-1">
                                                <Badge className="bg-slate-800 text-[9px] font-black uppercase text-slate-400 border-white/10">
                                                    {claim.inference_rule === 'direct_extraction' ? 'DIRECT' : 'INFERRED'}
                                                </Badge>
                                                <h4 className="text-sm font-bold text-white leading-tight">
                                                    {claim.subject_text} <span className="text-cyan-400 mx-1">{claim.predicate}</span> {claim.object_text}
                                                </h4>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-lg font-black text-cyan-400 leading-none">
                                                    {(claim.aggregate_score * 10).toFixed(1)}
                                                </div>
                                                <div className="text-[8px] uppercase font-bold text-slate-500">Agg. Score</div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-2 mb-4">
                                            <div className="space-y-1">
                                                <div className="flex justify-between text-[8px] uppercase text-slate-500">
                                                    <span>Quality</span>
                                                    <span>{Math.round(claim.evidence_quality * 100)}%</span>
                                                </div>
                                                <Progress value={claim.evidence_quality * 100} className="h-0.5 bg-white/5" />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex justify-between text-[8px] uppercase text-slate-500">
                                                    <span>Plausible</span>
                                                    <span>{Math.round(claim.mechanistic_plausibility * 100)}%</span>
                                                </div>
                                                <Progress value={claim.mechanistic_plausibility * 100} className="h-0.5 bg-white/5" />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex justify-between text-[8px] uppercase text-slate-500">
                                                    <span>Recency</span>
                                                    <span>{Math.round(claim.recency_score * 100)}%</span>
                                                </div>
                                                <Progress value={claim.recency_score * 100} className="h-0.5 bg-white/5" />
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                                            <div className="flex gap-2">
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full hover:bg-white/10">
                                                                <Info className="h-3.5 w-3.5 text-slate-400" />
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent className="bg-slate-900 border-white/10 text-[10px] p-2">
                                                            View Evidence Base
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                                <Button size="sm" variant="ghost" className="h-8 text-[9px] uppercase font-bold text-slate-400 hover:text-white">
                                                    View Trace
                                                </Button>
                                            </div>
                                            <Button
                                                size="sm"
                                                className="h-8 bg-cyan-600 hover:bg-cyan-500 text-[10px] uppercase font-black tracking-widest gap-2"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onPromote(claim);
                                                }}
                                            >
                                                Promote <ArrowRight className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>

            {/* REASONING TRACE OVERLAY (Full width at bottom or modal) */}
            {selectedClaimId && (
                <div className="col-span-12 nexus-card p-6 border-amber-500/20 bg-amber-500/5 animate-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs uppercase tracking-widest font-black text-amber-400 flex items-center gap-2">
                            <Brain className="h-4 w-4" /> Reasoning Trace Ledger
                        </h3>
                        <Button variant="ghost" size="sm" onClick={() => setSelectedClaimId(null)} className="h-6 text-[9px] uppercase font-bold text-slate-500">
                            Clear Trace
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-4">
                            <div className="text-[10px] uppercase font-bold text-slate-500 mb-2">Sources & Citations</div>
                            <div className="space-y-2">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="flex items-center justify-between p-2 rounded bg-black/20 border border-white/5 text-[10px]">
                                        <span className="text-slate-300 truncate max-w-[150px]">Mechanism of {selectedClaimId.substring(0, 6)}...</span>
                                        <ExternalLink className="h-3 w-3 text-cyan-500 cursor-pointer" />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="col-span-2 space-y-4 border-l border-white/5 pl-6">
                            <div className="text-[10px] uppercase font-bold text-slate-500 mb-2">Inference Pathway</div>
                            <div className="flex items-center gap-4">
                                <div className="p-2 rounded border border-white/10 bg-white/5 text-[10px] text-white">Subject Node</div>
                                <ArrowRight className="h-4 w-4 text-slate-600" />
                                <div className="p-2 rounded border border-cyan-500/30 bg-cyan-500/10 text-[10px] text-cyan-400">Normalizer Agent</div>
                                <ArrowRight className="h-4 w-4 text-slate-600" />
                                <div className="p-2 rounded border border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-400 font-bold">LBD Swanson ABC</div>
                                <ArrowRight className="h-4 w-4 text-slate-600" />
                                <div className="p-2 rounded border border-green-500/30 bg-green-500/10 text-[10px] text-green-400">Validated Claim</div>
                            </div>
                            <p className="text-[10px] text-slate-400 leading-relaxed max-w-2xl">
                                The inference was derived by mapping "{selectedClaimId}"'s inhibitory effect on protein X, combined with protein X's verified role in disease Y pathogenesis as documented in 4 meta-analyses.
                                <span className="text-amber-400 ml-1">Confidence Score: 0.84.</span>
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* CSS ANIMATIONS */}
            <style>{`
                @keyframes shimmer {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                .animate-shimmer {
                    animation: shimmer 3s linear infinite;
                }
            `}</style>
        </div>
    );
};
