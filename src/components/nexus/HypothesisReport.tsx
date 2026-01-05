
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




interface HypothesisReportProps {
    hypothesis: any; // Using any for flexibility with the complex JSON structure
    onClose?: () => void;
}

export default function HypothesisReport({ hypothesis, onClose }: HypothesisReportProps) {
    const reportRef = useRef<HTMLDivElement>(null);

    const handlePrint = () => {
        // Create a hidden iframe for printing to ensure styles are consistent
        const content = reportRef.current;
        if (!content) return;

        const printWindow = window.open('', '', 'height=800,width=1200');
        if (!printWindow) {
            toast.error("Impossible d'ouvrir la fenêtre d'impression");
            return;
        }

        printWindow.document.write('<html><head><title>Rapport Hypothèse - MediMind Nexus</title>');
        // Add minimal print styles
        printWindow.document.write(`
            <style>
                @media print {
                    body { font-family: system-ui, -apple-system, sans-serif; color: #1a202c; -webkit-print-color-adjust: exact; }
                    .page-break { page-break-before: always; }
                    .no-print { display: none !important; }
                    .print-only { display: block !important; }
                    h1 { font-size: 24px; color: #1e3a8a; margin-bottom: 20px; }
                    h2 { font-size: 18px; color: #1e40af; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-top: 24px; }
                    h3 { font-size: 16px; font-weight: 600; color: #475569; margin-top: 16px; }
                    p { font-size: 12px; line-height: 1.5; margin-bottom: 8px; }
                    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 11px; }
                    th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
                    th { background-color: #f1f5f9; font-weight: 600; }
                    .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 600; background: #e2e8f0; color: #475569; }
                    .badge-green { background: #dcfce7; color: #166534; }
                    .badge-blue { background: #dbeafe; color: #1e40af; }
                    .badge-red { background: #fee2e2; color: #991b1b; }
                    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; border-bottom: 2px solid #1e3a8a; padding-bottom: 16px; }
                    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
                    .section-box { border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin-bottom: 16px; background: #f8fafc; }
                }
            </style>
        `);
        printWindow.document.write('</head><body>');

        // Construct printable HTML from the JSON data directly to ensure clean formatting
        // (Instead of just cloning the DOM which might include screen-specific styles/buttons)
        printWindow.document.write(generatePrintableHTML(hypothesis));

        printWindow.document.write('</body></html>');
        printWindow.document.close();

        // Wait for content to load then print
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 500);
    };

    return (
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xl max-h-[85vh] flex flex-col">
            {/* Toolbar */}
            <div className="p-4 bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <Badge variant="outline" className="border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-1">
                        COMMITTEE-GRADE REPORT
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
                                    {hypothesis.executive_summary?.central_hypothesis_operational || 'N/A'}
                                </p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="font-bold text-slate-700 block text-sm uppercase mb-1">Décope & Limitations</span>
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

                    {/* Evidence Snapshot */}
                    <section>
                        <h2 className="text-lg font-bold text-blue-900 uppercase tracking-wide mb-4 border-b border-slate-200 pb-2 flex items-center gap-2">
                            <FlaskConical className="w-5 h-5" /> Evidence Snapshot (Oxford Levels)
                        </h2>
                        <div className="overflow-hidden rounded-lg border border-slate-200">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-xs">
                                    <tr>
                                        <th className="p-3 border-r border-slate-200 w-1/3">Claim / Assertion</th>
                                        <th className="p-3 border-r border-slate-200">Population / Context</th>
                                        <th className="p-3 border-r border-slate-200 w-24">Level</th>
                                        <th className="p-3">Signal / Effect Size</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {hypothesis.evidence_snapshot?.map((row: any, i: number) => (
                                        <tr key={i} className="hover:bg-slate-50">
                                            <td className="p-3 border-r border-slate-200 font-medium text-slate-800">{row.claim}</td>
                                            <td className="p-3 border-r border-slate-200 text-slate-600">{row.context_population}</td>
                                            <td className="p-3 border-r border-slate-200">
                                                <Badge className={
                                                    ['1a', '1b'].includes(row.oxford_level) ? 'bg-green-100 text-green-800 hover:bg-green-200' :
                                                        ['2a', '2b'].includes(row.oxford_level) ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' :
                                                            'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }>
                                                    Level {row.oxford_level}
                                                </Badge>
                                            </td>
                                            <td className="p-3 text-slate-700 text-xs">{row.signal_effect}</td>
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
                <h2>SCIENTIFIC REPORT</h2>
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
                <p style="font-size: 9px; color: #64748b; margin-top: 10px;">Generated by MediMind AI • Causal Nodal Network v2.5</p>
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

        ${h.etiology_depth ? `
            <h2>ETIOLOGICAL DEPTH & ROOT ANALYSIS</h2>
            <div class="section-box" style="background: #ecfdf5; border-color: #a7f3d0;">
                <div class="grid">
                    <div>
                        <strong style="font-size: 10px; color: #047857; text-transform: uppercase;">Root Causes (Biological Origin)</strong>
                        <ul style="list-style: disc; margin-left: 20px; font-size: 11px; color: #1a202c;">
                            ${h.etiology_depth.root_causes?.map((cause: string) => `<li>${cause}</li>`).join('')}
                        </ul>
                    </div>
                    <div>
                        <strong style="font-size: 10px; color: #047857; text-transform: uppercase;">Environmental & Set-off Triggers</strong>
                        <ul style="list-style: disc; margin-left: 20px; font-size: 11px; color: #1a202c;">
                            ${h.etiology_depth.triggers?.map((trigger: string) => `<li>${trigger}</li>`).join('')}
                        </ul>
                    </div>
                </div>
                <div style="margin-top: 12px; padding: 8px; background: white; border: 1px solid #d1fae5; border-radius: 4px;">
                    <strong style="font-size: 10px; color: #047857; text-transform: uppercase;">Primary Pathway Origin</strong>
                    <p style="font-size: 12px; font-family: monospace; color: #065f46;">${h.etiology_depth.pathway_origin}</p>
                </div>
            </div>
        ` : ''}

        ${h.therapeutic_resolution_chains ? `
            <h2>RECURSIVE THERAPEUTIC RESOLUTION</h2>
            ${h.therapeutic_resolution_chains.map((chain: any) => `
                <div class="section-box" style="border-left: 4px solid #4f46e5;">
                    <div style="font-size: 10px; font-weight: bold; color: #4f46e5; text-transform: uppercase;">Step ${chain.step}: Intervention</div>
                    <p style="font-size: 16px; font-weight: bold; margin: 4px 0;">${chain.intervention}</p>
                    <p style="font-size: 11px; margin-bottom: 8px;"><em>Expected: ${chain.expected_outcome}</em></p>
                    
                    ${chain.side_effects?.map((se: any) => `
                        <div style="margin-left: 16px; padding: 8px; background: #fff7ed; border: 1px solid #ffedd5; border-radius: 4px; margin-top: 8px;">
                            <div style="font-size: 9px; font-weight: bold; color: #c2410c; text-transform: uppercase;">Side Effect: ${se.issue}</div>
                            <div style="display: flex; gap: 8px; margin-top: 4px;">
                                <div style="flex: 1; background: white; padding: 4px; border-radius: 2px;">
                                    <span style="font-size: 8px; color: #64748b;">Correction:</span>
                                    <div style="font-size: 11px; font-weight: bold;">${se.resolution_intervention}</div>
                                </div>
                                <div style="flex: 1; background: #ecfdf5; padding: 4px; border-radius: 2px;">
                                    <span style="font-size: 8px; color: #059669;">Safety:</span>
                                    <div style="font-size: 10px;">${se.interaction_safety}</div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `).join('')}
            
            ${h.mechanistic_model?.loop_closure_proof ? `
                <div class="section-box" style="background: #022c22; color: #ecfdf5;">
                    <strong style="font-size: 12px; color: #10b981; display: block; margin-bottom: 4px;">LOOP CLOSURE PROOF</strong>
                    <p style="font-size: 12px; margin: 0;">${h.mechanistic_model.loop_closure_proof}</p>
                </div>
            ` : ''}
        ` : ''}

        <div class="page-break"></div>

        <h2>EXECUTIVE SUMMARY</h2>
        <div class="grid">
            <div class="section-box">
                <strong>Context</strong>
                <p>${h.executive_summary?.context}</p>
            </div>
            <div class="section-box">
                <strong>Operational Hypothesis</strong>
                <p>${h.executive_summary?.central_hypothesis_operational}</p>
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

        <h2>RIVAL HYPOTHESES</h2>
        <div class="grid">
            <div class="section-box">
                <strong>H1 (Main)</strong>
                <p>${h.rival_hypotheses?.h1_main}</p>
            </div>
             <div class="section-box">
                <strong>H0 (Null)</strong>
                <p>${h.rival_hypotheses?.h0_null}</p>
            </div>
        </div>
        <div class="section-box">
            <strong>Causal DAG</strong>
            <pre style="font-family: monospace; font-size: 10px;">${h.rival_hypotheses?.dag_textual}</pre>
        </div>

        <h2>EVIDENCE SNAPSHOT</h2>
        <table>
            <thead>
                <tr>
                    <th>Claim</th>
                    <th>Context</th>
                    <th>Level</th>
                    <th>Reference</th>
                </tr>
            </thead>
            <tbody>
                ${h.evidence_snapshot?.map((row: any) => `
                    <tr>
                        <td>${row.claim || ''}</td>
                        <td>${row.context_population || ''}</td>
                        <td><span class="badge badge-blue">Level ${row.oxford_level || 'N/A'}</span></td>
                        <td>${row.key_references?.join(', ') || 'N/A'}</td>
                    </tr>
                `).join('') || '<tr><td colspan="4">No data</td></tr>'}
            </tbody>
        </table>
        
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
