
import React, { useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
    FileText, Download, Printer, Share2,
    AlertTriangle, CheckCircle2, ShieldAlert,
    FlaskConical, Scale, Target, Copy, Shield, Zap, Workflow, ListTree, Dna
} from 'lucide-react';
import { toast } from 'sonner';
import CausalGraph from './CausalGraph';

// Base64 helper for mermaid.ink
const encodeMermaid = (code: string) => {
    try {
        if (!code) return '';
        return btoa(unescape(encodeURIComponent(code)));
    } catch (e) {
        console.error('Error encoding mermaid:', e);
        return '';
    }
};

const PREMIUM_HEADER_URL = '/C:/Users/Raph/.gemini/antigravity/brain/41db1a14-23b3-4deb-8609-0cd0514ce8a1/scientific_report_header_premium_1767585690056.png';





export interface Hypothesis {
    hypothesis_id: string;
    created_at?: string;
    title?: string;
    statement: string;
    executive_summary?: any; // allow hybrid string/object structure for legacy/V3 compatibility
    clinical_scope?: {
        candidate_subtypes?: string[];
        uncertainties?: string[];
    };
    mechanistic_model?: {
        loop_closure_proof?: string;
        cellular_dynamics?: string;
        molecular_interactions?: string;
        systemic_cascade?: string;
        therapeutic_targets?: Array<{
            target: string;
            mechanism: string;
            confidence: number;
        }>;
        pkpd_robust?: string;
        pkpd_unknown?: string;
    };
    // Top-level fields sometimes mapped from JSON
    systemic_cascade?: string;
    etiology_depth?: string;
    therapeutic_resolution_chains?: string;
    is_complete_resolution?: boolean;
    risks_monitoring?: string;

    evidence_index?: Array<{
        title: string;
        authors: string;
        journal: string;
        year: string;
        url: string;
        passages: string[];
        relevance_score: number;
    }>;
    evidence_snapshot?: any[]; // Legacy support
    claim_graph?: {
        claims?: Array<{
            claim_id: string;
            triple?: {
                source?: { label: string; type?: string; norm_ids?: string[] };
                target?: { label: string; type?: string; norm_ids?: string[] };
                predicate?: string;
                rel?: string;
                subject?: { label: string; type?: string };
            };
            support_evidence_ids?: string[];
            confidence_score?: number;
            notes?: string;
        }>;
        outcomes?: Array<{
            outcome?: { label: string; norm_ids?: string[] };
            criteria?: string;
        }>;
        core_claim_ids?: string[];
    };
    causal_graph?: {
        nodes: any[];
        edges: any[];
    };
    contradictions?: Array<{
        claim_a_text: string;
        claim_b_text: string;
        explanation: string;
        resolution: string;
        severity: string;
    }>;
    reasoning_trace?: {
        retrieval_log?: any[];
        normalization_log?: any[];
        inference_steps?: any[];
    };
    scores?: {
        novelty: number;
        plausibility: number;
        strength: number;
        feasibility: number;
        impact: number;
        total: number;
    };
    rival_hypotheses?: Array<{
        trigger: string;
        hypothesis: string;
        likelihood: string;
        differentiation: string;
    }>;
    validation_plan?: string;
    novelty_findings?: string;
    evidence_citations?: string[];
}

interface HypothesisReportProps {
    hypothesis: Hypothesis;
    onClose?: () => void;
}


export default function HypothesisReport({ hypothesis, onClose }: HypothesisReportProps) {
    const reportRef = useRef<HTMLDivElement>(null);
    const [showRawJson, setShowRawJson] = React.useState(false);

    // --- ULTRA V3 HARD FAIL VALIDATION ---
    const validateReport = (h: Hypothesis) => {
        const errors: string[] = [];
        const warnings: string[] = [];

        // 1. Scope
        if (!h.clinical_scope?.candidate_subtypes || h.clinical_scope.candidate_subtypes.length === 0)
            errors.push("CRITICAL: Clinical Scope (Candidate Subtypes) is missing.");

        // 2. Evidence Count
        const evidenceCount = (h.evidence_index?.length || h.evidence_snapshot?.length || 0);
        if (evidenceCount < 5)
            errors.push(`CRITICAL: Insufficient Evidence. Found ${evidenceCount}/5 required sources.`);

        // 3. Graph Complexity
        // Check if graph exists in either V3 format (claim_graph) or legacy (causal_graph)
        // Adjust check to be lenient if it's an older report but strict for new V3
        if (h.claim_graph?.claims?.length < 5 && (!h.causal_graph?.nodes || h.causal_graph.nodes.length < 5)) {
            errors.push("CRITICAL: Causal Graph is too simple (< 5 nodes). Research depth insufficient.");
        }

        // 4. Forbidden Terms
        const forbidden = ["guérison garantie", "certitude absolue", "100% cure"];
        const strRep = JSON.stringify(h).toLowerCase();
        forbidden.forEach(term => {
            if (strRep.includes(term)) errors.push(`CRITICAL: Forbidden term detected: "${term}". Use probabilistic language.`);
        });

        // 5. Outcome Check (V3 Committee Requirement)
        if (h.claim_graph && (!h.claim_graph.outcomes || h.claim_graph.outcomes.length === 0)) {
            // Only flag this if it looks like a V3 report (has claim_graph)
            errors.push("CRITICAL: No 'Outcome' nodes defined in Claim Graph. 'Cure' nodes are deprecated.");
        }

        return { valid: errors.length === 0, errors, warnings };
    };

    const validation = validateReport(hypothesis);

    const handlePrint = () => {
        // ... (existing print logic)
        const content = reportRef.current;
        if (!content) return;
        // ...
        const printWindow = window.open('', '', 'height=800,width=1200');
        if (!printWindow) return;
        printWindow.document.write('<html><head><title>Rapport Hypothèse - MediMind Nexus</title>');
        printWindow.document.write(`
            <style>
                @media print {
                     body { font-family: system-ui, -apple-system, sans-serif; color: #1a202c; -webkit-print-color-adjust: exact; }
                     /* ... (rest of styles) */
                }
            </style>
        `);
        // ... (continue print logic)
        printWindow.document.write(generatePrintableHTML(hypothesis));
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500);
    };

    // BLOCKING UI IF INVALID
    // Enforce strictly for Committee Grade, but allows bypass in dev if needed (comment out to bypass)
    // if (!validation.valid && process.env.NODE_ENV === 'development') { 
    //    // console.warn("Validation failed but bypassed in DEV");
    // }

    // STRICT ENFORCEMENT ALWAYS FOR NOW
    if (!validation.valid) {
        return (
            <div className="bg-slate-50 dark:bg-slate-900 border border-red-200 dark:border-red-900 rounded-xl overflow-hidden shadow-xl max-h-[85vh] flex flex-col p-8 items-center justify-center text-center">
                <div className="bg-red-100 p-6 rounded-full mb-6 relative">
                    <ShieldAlert className="w-16 h-16 text-red-600 animate-pulse" />
                    <div className="absolute inset-0 bg-red-400/20 rounded-full animate-ping" />
                </div>

                <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">
                    Report Generation Blocked
                </h2>
                <p className="text-slate-500 mb-8 max-w-md">
                    The generated hypothesis did not meet the "Committee-Grade" V3 quality standards.
                    It has been rejected by the automated safety & rigor filters.
                </p>

                <Card className="w-full max-w-lg border-red-200 bg-red-50/50 mb-8">
                    <CardHeader>
                        <CardTitle className="text-red-700 flex items-center gap-2 justify-center text-lg">
                            <AlertTriangle className="w-5 h-5" /> Validation Failures
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-left">
                        {validation.errors.map((err, i) => (
                            <div key={i} className="flex items-start gap-3 p-3 bg-white rounded border border-red-100 shadow-sm">
                                <span className="text-red-500 font-bold">•</span>
                                <span className="text-sm font-medium text-slate-700">{err}</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                <div className="flex gap-4">
                    <Button variant="outline" onClick={() => setShowRawJson(!showRawJson)}>
                        {showRawJson ? 'Hide Diagnostics' : 'View Raw JSON Diagnostics'}
                    </Button>
                    {onClose && <Button variant="destructive" onClick={onClose}>Close & Retry</Button>}
                </div>

                {showRawJson && (
                    <div className="mt-6 w-full max-w-3xl text-left">
                        <div className="bg-slate-950 text-slate-300 p-4 rounded-lg font-mono text-xs overflow-auto max-h-[300px]">
                            <pre>{JSON.stringify(hypothesis, null, 2)}</pre>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xl max-h-[85vh] flex flex-col">
            {/* Toolbar */}
            <div className="p-4 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <Badge variant="outline" className="border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-1">
                        COMMITTEE-GRADE REPORT (V3 VERIFIED)
                    </Badge>
                    <span className="text-sm text-slate-500 font-mono">
                        {hypothesis.hypothesis_id}
                    </span>
                    <span className="text-xs text-slate-400">
                        • {new Date(hypothesis.created_at).toLocaleDateString()}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
                        <Printer className="w-4 h-4" />
                        Imprimer / PDF
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(hypothesis, null, 2));
                        toast.success('JSON copié');
                    }}>
                        <Copy className="w-4 h-4" />
                        JSON
                    </Button>
                    {onClose && (
                        <Button variant="ghost" size="sm" onClick={onClose}>
                            Fermer
                        </Button>
                    )}
                </div>
            </div>

            {/* Report Content */}
            <div className="overflow-y-auto p-8 bg-white" ref={reportRef}>
                <div className="max-w-4xl mx-auto space-y-8 text-slate-900">

                    {/* Header */}
                    <div className="border-b-4 border-blue-900 pb-6 mb-8">
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <h1 className="text-3xl font-bold text-slate-900 leading-tight">
                                        Scientific Advisory Report
                                    </h1>
                                    {hypothesis.is_complete_resolution && (
                                        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none gap-1 py-1">
                                            <Shield className="w-3 h-3" /> FULLY CLOSED LOOP
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-blue-600 font-medium text-lg italic">
                                    {hypothesis.statement}
                                </p>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-bold text-slate-500 uppercase tracking-wider">MediMind Nexus</div>
                                <div className="text-xs text-slate-400">RCDP Engine v2.5</div>
                            </div>
                        </div>
                    </div>

                    {/* Visual Interaction Network (New Section) */}
                    <section>
                        <h2 className="text-lg font-bold text-slate-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                            <Workflow className="w-5 h-5 text-blue-600" /> Multi-Scale Visual Interaction Network
                        </h2>
                        <CausalGraph hypothesis={hypothesis} />
                        <p className="text-[10px] text-slate-400 mt-2 italic">
                            * Ce graphe est interactif. Vous pouvez glisser les nœuds pour explorer les causalités récursives.
                        </p>
                    </section>


                    {/* Systemic Cascade Section */}
                    {hypothesis.systemic_cascade && (
                        <section className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                            <h2 className="text-lg font-bold text-blue-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                                <ListTree className="w-5 h-5 text-blue-600" /> Systemic Pathophysiological Cascade
                            </h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {hypothesis.systemic_cascade.map((item: any, i: number) => (
                                    <div key={i} className="bg-white p-3 rounded border border-slate-200 shadow-sm">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-bold text-slate-900 text-xs uppercase">{item.organ}</span>
                                            <Badge variant="outline" className={
                                                item.severity === 'Critical' ? 'text-red-600 border-red-200 bg-red-50' :
                                                    item.severity === 'High' ? 'text-orange-600 border-orange-200 bg-orange-50' :
                                                        'text-blue-600 border-blue-200 bg-blue-50'
                                            }>
                                                {item.severity}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-slate-700 font-medium mb-1">{item.impact}</p>
                                        <p className="text-[10px] text-slate-500 leading-tight italic">{item.mechanism}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Etiology Depth Section */}
                    {hypothesis.etiology_depth && (
                        <section className="p-6 rounded-lg border border-emerald-100 bg-emerald-50/30">
                            <h2 className="text-lg font-bold text-emerald-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                                <Dna className="w-5 h-5 text-emerald-600" /> Etiological Depth & Root Analysis
                            </h2>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white p-4 rounded-lg border border-emerald-100">
                                        <span className="text-[10px] font-bold text-emerald-700 uppercase block mb-2">Root Causes (Biological Origin)</span>
                                        <ul className="list-disc list-inside text-xs text-slate-700 space-y-1">
                                            {hypothesis.etiology_depth.root_causes?.map((cause: string, i: number) => (
                                                <li key={i}>{cause}</li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div className="bg-white p-4 rounded-lg border border-emerald-100">
                                        <span className="text-[10px] font-bold text-emerald-700 uppercase block mb-2">Environmental & Set-off Triggers</span>
                                        <ul className="list-disc list-inside text-xs text-slate-700 space-y-1">
                                            {hypothesis.etiology_depth.triggers?.map((trigger: string, i: number) => (
                                                <li key={i}>{trigger}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                                <div className="p-3 bg-white rounded border border-emerald-100">
                                    <span className="text-[10px] font-bold text-emerald-700 uppercase block mb-1">Primary Pathway Origin</span>
                                    <p className="text-sm font-mono text-emerald-900">{hypothesis.etiology_depth.pathway_origin}</p>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Recursive Resolution Loop Section */}
                    {hypothesis.therapeutic_resolution_chains && (
                        <section className="p-6 rounded-lg border border-indigo-200 bg-indigo-50/30">
                            <h2 className="text-lg font-bold text-indigo-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                                <Workflow className="w-5 h-5 text-indigo-600" /> Recursive Therapeutic Resolution Loops
                            </h2>
                            <div className="space-y-6">
                                {hypothesis.therapeutic_resolution_chains.map((chain: any, i: number) => (
                                    <div key={i} className="relative pl-8">
                                        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-indigo-200"></div>
                                        <div className="absolute left-[-4px] top-2 w-2.5 h-2.5 rounded-full bg-indigo-500"></div>

                                        <div className="bg-white p-4 rounded-lg border border-indigo-100 shadow-sm mb-4">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-[10px] font-bold text-indigo-600 uppercase">Step {chain.step}: Primary Intervention</span>
                                                <Badge className="bg-indigo-100 text-indigo-700 border-none">TARGETING CORE</Badge>
                                            </div>
                                            <h3 className="text-md font-bold text-slate-900 mb-1">{chain.intervention}</h3>
                                            <p className="text-xs text-slate-600 italic">Expected Outcome: {chain.expected_outcome}</p>
                                        </div>

                                        {chain.side_effects?.map((se: any, j: number) => (
                                            <div key={j} className="ml-4 mt-3 relative pl-6 border-l-2 border-dashed border-orange-200">
                                                <div className="absolute left-[-5px] top-3 w-2 h-2 rounded-full bg-orange-400"></div>
                                                <div className="bg-orange-50/50 p-3 rounded-lg border border-orange-100">
                                                    <div className="flex items-center gap-2 text-[10px] font-bold text-orange-700 uppercase mb-1">
                                                        <Zap className="w-3 h-3" /> Side Effect Detected: {se.issue}
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3 mt-2">
                                                        <div className="bg-white p-2 rounded border border-orange-100">
                                                            <span className="text-[9px] font-bold text-slate-500 block">Resolution</span>
                                                            <p className="text-xs text-slate-800 font-bold">{se.resolution_intervention}</p>
                                                        </div>
                                                        <div className="bg-emerald-50 p-2 rounded border border-emerald-100">
                                                            <span className="text-[9px] font-bold text-emerald-600 block">Interaction Safety</span>
                                                            <p className="text-xs text-emerald-800">{se.interaction_safety}</p>
                                                        </div>
                                                    </div>
                                                    <p className="text-[10px] text-slate-500 mt-2 italic">Loop Closure: {se.recursive_resolution}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}

                                {hypothesis.mechanistic_model?.loop_closure_proof && (
                                    <div className="mt-6 p-4 bg-emerald-900 text-emerald-50 rounded-lg shadow-inner">
                                        <div className="flex items-center gap-2 mb-2 font-bold uppercase tracking-widest text-xs">
                                            <CheckCircle2 className="w-4 h-4" /> Loop Closure Proof
                                        </div>
                                        <p className="text-sm leading-relaxed">{hypothesis.mechanistic_model.loop_closure_proof}</p>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {/* Executive Summary */}
                    <section className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                        <h2 className="text-lg font-bold text-blue-900 uppercase tracking-wide mb-4 flex items-center gap-2">
                            <FileText className="w-5 h-5" /> Executive Summary
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <span className="font-bold text-slate-700 block text-sm uppercase mb-1">Contexte Clinique</span>
                                <p className="text-sm text-slate-700 border-l-2 border-blue-300 pl-3">
                                    {hypothesis.executive_summary?.context || 'N/A'}
                                </p>
                            </div>
                            <div>
                                <span className="font-bold text-slate-700 block text-sm uppercase mb-1">Hypothèse Opérationnelle</span>
                                <p className="text-sm text-slate-800 font-medium bg-white p-3 rounded border border-slate-200">
                                    {hypothesis.executive_summary?.central_hypothesis_operational || hypothesis.statement || 'N/A'}
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="font-bold text-slate-700 block text-sm uppercase mb-1">Périmètre & Limitations</span>
                                    <p className="text-xs text-slate-600">
                                        {hypothesis.executive_summary?.scope_decisions || 'N/A'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Go/No-Go Table */}
                    <section>
                        <h2 className="text-lg font-bold text-blue-900 uppercase tracking-wide mb-4 border-b border-slate-200 pb-2 flex items-center gap-2">
                            <Scale className="w-5 h-5" /> Go/No-Go Decision Matrix
                        </h2>
                        <div className="overflow-hidden rounded-lg border border-slate-200">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-xs">
                                    <tr>
                                        <th className="p-3 border-r border-slate-200">Development Block</th>
                                        <th className="p-3 border-r border-slate-200">Minimal Design</th>
                                        <th className="p-3 border-r border-slate-200">Primary Endpoint</th>
                                        <th className="p-3">Decision Signal</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {hypothesis.executive_summary?.go_nogo_table?.map((row: any, i: number) => (
                                        <tr key={i} className="hover:bg-slate-50">
                                            <td className="p-3 font-medium border-r border-slate-200">{row.block}</td>
                                            <td className="p-3 border-r border-slate-200">{row.minimal_design}</td>
                                            <td className="p-3 border-r border-slate-200 text-blue-700 font-medium">{row.primary_endpoint}</td>
                                            <td className="p-3">
                                                <Badge variant="outline" className="bg-slate-100 text-slate-800 border-slate-300">
                                                    {row.go_nogo_signal}
                                                </Badge>
                                            </td>
                                        </tr>
                                    )) || (
                                            <tr><td colSpan={4} className="p-4 text-center text-slate-400">Aucune donnée disponible</td></tr>
                                        )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    {/* Rival Hypotheses */}
                    <section className="bg-white">
                        <h2 className="text-lg font-bold text-blue-900 uppercase tracking-wide mb-4 border-b border-slate-200 pb-2 flex items-center gap-2">
                            <Target className="w-5 h-5" /> Rival & Null Hypotheses
                        </h2>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                                <span className="text-xs font-bold text-green-700 uppercase block mb-1">H1 (Main Hypothesis)</span>
                                <p className="text-sm text-green-900">{hypothesis.rival_hypotheses?.h1_main || hypothesis.statement}</p>
                            </div>
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                <span className="text-xs font-bold text-slate-500 uppercase block mb-1">H0 (Null Hypothesis)</span>
                                <p className="text-sm text-slate-700">{hypothesis.rival_hypotheses?.h0_null || 'Aucun effet observé.'}</p>
                            </div>
                            <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                                <span className="text-xs font-bold text-orange-700 uppercase block mb-1">H3 (Alternative Mechanism)</span>
                                <p className="text-sm text-orange-900">{hypothesis.rival_hypotheses?.h3_rival || 'N/A'}</p>
                            </div>
                            <div className="bg-red-50 p-4 rounded-lg border border-red-100">
                                <span className="text-xs font-bold text-red-700 uppercase block mb-1">H4 (Toxicity/Risk)</span>
                                <p className="text-sm text-red-900">{hypothesis.rival_hypotheses?.h4_rival_toxicity || 'N/A'}</p>
                            </div>
                        </div>
                        {hypothesis.rival_hypotheses?.dag_textual && (
                            <div className="mt-4 p-4 bg-slate-50 rounded border border-slate-200">
                                <span className="text-xs font-bold text-slate-500 uppercase block mb-2">Causal DAG (Directed Acyclic Graph)</span>
                                <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap">
                                    {hypothesis.rival_hypotheses.dag_textual}
                                </pre>
                            </div>
                        )}
                    </section>

                    {/* Contradiction Analysis (Phase 9) */}
                    {hypothesis.contradictions && hypothesis.contradictions.length > 0 && (
                        <section className="bg-red-50 p-6 rounded-lg border border-red-200">
                            <h2 className="text-lg font-bold text-red-900 uppercase tracking-wide mb-4 border-b border-red-200 pb-2 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5" /> Automated Contradiction Detection
                            </h2>
                            <div className="space-y-4">
                                {hypothesis.contradictions.map((c: any, i: number) => (
                                    <div key={i} className="bg-white p-4 rounded border border-red-100 shadow-sm">
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-xs font-bold text-red-600 uppercase">Conflict #{i + 1}</span>
                                            <Badge variant="outline" className="border-red-200 text-red-700 bg-red-50">
                                                {c.resolution || 'Unresolved'}
                                            </Badge>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3 text-xs">
                                            <div className="p-2 bg-slate-50 border border-slate-100 rounded">
                                                <span className="block font-bold text-slate-500 mb-1">Claim A (Support: {c.support_weight})</span>
                                                <p className="text-slate-800 italic">"{c.claim_a_text || 'Text unavailable'}"</p>
                                            </div>
                                            <div className="p-2 bg-slate-50 border border-slate-100 rounded">
                                                <span className="block font-bold text-slate-500 mb-1">Claim B (Refute: {c.refute_weight})</span>
                                                <p className="text-slate-800 italic">"{c.claim_b_text || 'Text unavailable'}"</p>
                                            </div>
                                        </div>
                                        <p className="text-sm text-slate-700 border-l-2 border-red-300 pl-3">
                                            {c.explanation}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Evidence Snapshot / V3 Evidence Index */}
                    <section>
                        <h2 className="text-lg font-bold text-blue-900 uppercase tracking-wide mb-4 border-b border-slate-200 pb-2 flex items-center gap-2">
                            <FlaskConical className="w-5 h-5" /> Evidence Snapshot (Oxford Levels)
                        </h2>
                        <div className="overflow-hidden rounded-lg border border-slate-200">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-xs">
                                    <tr>
                                        <th className="p-3 border-r border-slate-200 w-1/3">Claim / Assertion</th>
                                        <th className="p-3 border-r border-slate-200">Title / Source</th>
                                        <th className="p-3 border-r border-slate-200 w-24">Level</th>
                                        <th className="p-3">Signal / Highlights</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {/* Handle both V2 evidence_snapshot and V3 evidence_index */}
                                    {(hypothesis.evidence_snapshot || hypothesis.evidence_index)?.map((row: any, i: number) => (
                                        <tr key={i} className="hover:bg-slate-50">
                                            <td className="p-3 border-r border-slate-200 font-medium text-slate-800">
                                                {row.claim || row.title || 'N/A'}
                                            </td>
                                            <td className="p-3 border-r border-slate-200 text-slate-600 text-xs">
                                                {row.context_population || row.source_type || 'N/A'}
                                            </td>
                                            <td className="p-3 border-r border-slate-200">
                                                <Badge className={
                                                    ['1a', '1b'].includes(row.oxford_level || row.level) ? 'bg-green-100 text-green-800 hover:bg-green-200' :
                                                        ['2a', '2b'].includes(row.oxford_level || row.level) ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' :
                                                            'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }>
                                                    Level {row.oxford_level || row.level || '?'}
                                                </Badge>
                                            </td>
                                            <td className="p-3 text-slate-700 text-xs">
                                                {row.signal_effect || (row.passages && row.passages[0]?.quote) || 'N/A'}
                                            </td>
                                        </tr>
                                    )) || (
                                            <tr><td colSpan={4} className="p-4 text-center text-slate-400">Aucune donnée disponible</td></tr>
                                        )}
                                </tbody>
                            </table>
                        </div>
                    </section>


                    {/* Mechanistic & Risks */}
                    <div className="grid grid-cols-2 gap-8">
                        <section>
                            <h2 className="text-lg font-bold text-blue-900 uppercase tracking-wide mb-4 border-b border-slate-200 pb-2 flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5" /> Mechanistic Model
                            </h2>
                            <div className="space-y-3">
                                <div className="p-3 bg-blue-50 rounded border border-blue-100">
                                    <span className="text-xs font-bold text-blue-700 uppercase block">PK/PD Confirmed</span>
                                    <p className="text-sm text-blue-900">{hypothesis.mechanistic_model?.pkpd_robust || 'N/A'}</p>
                                </div>
                                <div className="p-3 bg-slate-50 rounded border border-slate-200">
                                    <span className="text-xs font-bold text-slate-600 uppercase block">Unknowns / Black Box</span>
                                    <p className="text-sm text-slate-800">{hypothesis.mechanistic_model?.pkpd_unknown || 'N/A'}</p>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 className="text-lg font-bold text-red-900 uppercase tracking-wide mb-4 border-b border-red-100 pb-2 flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5" /> Risks & Monitoring
                            </h2>
                            <div className="space-y-2">
                                {hypothesis.risks_monitoring?.monitoring_table?.slice(0, 3).map((risk: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center p-2 border-b border-slate-100 last:border-0">
                                        <span className="text-sm font-medium text-slate-700">{risk.parameter}</span>
                                        <Badge variant="outline" className="text-xs border-red-200 text-red-700 bg-red-50">
                                            {risk.action_threshold}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                    {/* Footer */}
                    <div className="border-t-2 border-slate-200 pt-6 mt-12 mb-8 text-center text-slate-400 text-xs">
                        <p>Generated by MediMind Nexus AI Core</p>
                        <p>Confidential - For Research Purposes Only</p>
                    </div>

                </div>
            </div>
        </div>
    );
}

// Function to generate pure HTML for printing
function generatePrintableHTML(h: any) {
    const encodedMermaid = h.mermaid_graph ? btoa(unescape(encodeURIComponent(h.mermaid_graph))) : '';
    const diagramUrl = encodedMermaid ? `https://mermaid.ink/img/${encodedMermaid}` : null;

    // In a real browser context, we can use the relative path or base64
    // For local dev, we might need a placeholder or the actual path if file:// is allowed
    const headerImg = PREMIUM_HEADER_URL;

    return `
        <div style="text-align: center; margin-bottom: 30px;">
            <img src="${headerImg}" style="width: 100%; border-radius: 8px; margin-bottom: 10px;" />
        </div>

        <div class="header">
            <div>
                <h1>${h.hypothesis_id}</h1>
                <p>${new Date(h.created_at).toLocaleDateString()}</p>
            </div>
            <div>
                <h2>SCIENTIFIC ADVISORY REPORT (V3 ULTRA)</h2>
            </div>
        </div>

        <div class="section-box" style="background: #eff6ff; border-color: #bfdbfe;">
            <h3>HYPOTHESIS STATEMENT</h3>
            <p style="font-size: 14px; font-weight: bold; color: #1e3a8a;">${h.statement}</p>
            ${h.is_complete_resolution ? '<div style="background: #10b981; color: white; padding: 4px 12px; border-radius: 999px; font-size: 12px; display: inline-block; margin-top: 8px;">FULLY CLOSED LOOP RESOLUTION</div>' : ''}
        </div>

        ${diagramUrl ? `
            <h2>CAUSAL SCHEMA</h2>
            <div style="text-align: center; margin: 20px 0; background: white; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <img src="${diagramUrl}" style="max-width: 100%; height: auto;" />
                <p style="font-size: 9px; color: #64748b; margin-top: 10px;">Generated by MediMind AI • Causal Nodal Network v3.0</p>
            </div>
        ` : ''}

        ${h.novelty_findings && h.novelty_findings.length > 0 ? `
            <h2>NOVELTY & STRATEGIC DIFFERENTIATION</h2>
            <div class="section-box" style="background: #faf5ff; border-color: #e9d5ff;">
                ${h.novelty_findings.map((f: any) => `
                    <div style="margin-bottom: 8px; border-bottom: 1px solid #f3e8ff; padding-bottom: 4px;">
                        <span style="font-size: 10px; font-weight: bold; color: #7e22ce;">${f.aspect}</span>
                        <p style="font-size: 11px; margin: 2px 0;">${f.finding}</p>
                        <p style="font-size: 9px; color: #9333ea; font-style: italic;">Differentiation: ${f.differentiation_vs_existing}</p>
                    </div>
                `).join('')}
            </div>
        ` : ''}

        ${h.systemic_cascade ? `
            <h2>SYSTEMIC IMPACT CASCADE</h2>
            <div class="grid">
                ${h.systemic_cascade.map((item: any) => `
                    <div class="section-box">
                        <div style="display: flex; justify-content: space-between;">
                             <strong>${item.organ}</strong>
                             <span class="badge ${item.severity === 'Critical' ? 'badge-red' : 'badge-blue'}">${item.severity}</span>
                        </div>
                        <p style="font-weight: bold; margin-top: 4px;">${item.impact}</p>
                        <p style="font-size: 10px; color: #64748b;">${item.mechanism}</p>
                    </div>
                `).join('')}
            </div>
        ` : ''}

        <div class="page-break"></div>

        <h2>EXECUTIVE SUMMARY</h2>
        <div class="grid">
            <div class="section-box">
                <strong>Context</strong>
                <p>${h.executive_summary?.context || 'N/A'}</p>
            </div>
            <div class="section-box">
                <strong>Operational Scope</strong>
                <p>${h.executive_summary?.scope_decisions || 'N/A'}</p>
            </div>
        </div>

        <h2>GO/NO-GO DECISION MATRIX</h2>
        <table>
            <thead>
                <tr>
                    <th>Block</th>
                    <th>Minimal Design</th>
                    <th>Primary Endpoint</th>
                    <th>Signal Goal</th>
                </tr>
            </thead>
            <tbody>
                ${h.executive_summary?.go_nogo_table?.map((row: any) => `
                    <tr>
                        <td>${row.block || ''}</td>
                        <td>${row.minimal_design || ''}</td>
                        <td>${row.primary_endpoint || ''}</td>
                        <td><span class="badge ${(row.go_nogo_signal || '').includes('GO') ? 'badge-green' : 'badge-red'}">${row.go_nogo_signal || 'N/A'}</span></td>
                    </tr>
                `).join('') || '<tr><td colspan="4">No data</td></tr>'}
            </tbody>
        </table>

        <h2>EVIDENCE SNAPSHOT (V3 VALIDATED)</h2>
        <table>
            <thead>
                <tr>
                    <th>Claim / Assertion</th>
                    <th>Source / PubMed</th>
                    <th>Level</th>
                    <th>Snapshot Proof</th>
                </tr>
            </thead>
            <tbody>
                ${(h.evidence_snapshot || h.evidence_index)?.map((row: any) => `
                    <tr>
                        <td>${row.claim || row.title || ''}</td>
                        <td>${row.context_population || row.pmid || 'Reference'}</td>
                        <td><span class="badge badge-blue">Level ${row.oxford_level || row.level || '?'}</span></td>
                        <td>${row.signal_effect || (row.passages && row.passages[0]?.quote) || 'Validated'}</td>
                    </tr>
                `).join('') || '<tr><td colspan="4">No data</td></tr>'}
            </tbody>
        </table>

        ${h.contradictions && h.contradictions.length > 0 ? `
            <h2>CONTRADICTIONS & RISK MITIGATION</h2>
            <div class="section-box" style="background: #fff1f2; border-color: #fecdd3;">
                <ul style="list-style: none; padding: 0;">
                    ${h.contradictions.map((c: any) => `
                        <li style="margin-bottom: 12px; border-left: 2px solid #ef4444; padding-left: 12px;">
                            <strong style="color: #be123c; font-size: 11px;">Conflict: ${c.claim_a_text} VS ${c.claim_b_text}</strong>
                            <p style="font-size: 10px; margin: 4px 0;">${c.explanation}</p>
                            <p style="font-size: 10px; color: #15803d; font-weight: bold;">Resolution: ${c.resolution}</p>
                        </li>
                    `).join('')}
                </ul>
            </div>
        ` : ''}
        
        <div class="page-break"></div>

        <h2>MECHANISTIC MODEL & RISKS</h2>
        <div class="grid">
             <div class="section-box">
                <strong>PK/PD Robust</strong>
                <p>${h.mechanistic_model?.pkpd_robust}</p>
            </div>
             <div class="section-box">
                <strong>Risks & Monitoring</strong>
                <ul>
                    ${h.risks_monitoring?.monitoring_table?.map((r: any) => `
                        <li><strong>${r.parameter}:</strong> Limit ${r.action_threshold}</li>
                    `).join('') || ''}
                </ul>
            </div>
        </div>
    `;
}
