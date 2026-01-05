
import React, { useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
    FileText, Download, Printer, Share2,
    AlertTriangle, CheckCircle2, ShieldAlert,
    FlaskConical, Scale, Target, Copy
} from 'lucide-react';
import { toast } from 'sonner';

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
                                <h1 className="text-3xl font-bold text-slate-900 leading-tight mb-2">
                                    Scientific Advisory Report
                                </h1>
                                <p className="text-blue-600 font-medium text-lg">
                                    {hypothesis.statement}
                                </p>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-bold text-slate-500 uppercase tracking-wider">MediMind Nexus</div>
                                <div className="text-xs text-slate-400">AI-Augmented Research</div>
                            </div>
                        </div>
                    </div>

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
    return `
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
        </div>

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
                        <td>${row.block}</td>
                        <td>${row.minimal_design}</td>
                        <td>${row.primary_endpoint}</td>
                        <td><span class="badge ${row.go_nogo_signal.includes('GO') ? 'badge-green' : 'badge-red'}">${row.go_nogo_signal}</span></td>
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
                        <td>${row.claim}</td>
                        <td>${row.context_population}</td>
                        <td><span class="badge badge-blue">Level ${row.oxford_level}</span></td>
                        <td>${row.key_references?.join(', ') || ''}</td>
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
