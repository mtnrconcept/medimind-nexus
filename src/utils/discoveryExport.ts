// Discovery Platform PDF Export Utility
// Generates formatted reports for hypotheses and research sessions

import jsPDF from 'jspdf';

interface DetailedAnalysis {
    background_context?: string;
    pathophysiology?: string;
    mechanism_of_action?: string;
    molecular_targets?: string;
    organ_functions?: string;
    contraindications_interactions?: string;
    unexplored_avenues?: string;
    literature_synthesis?: string;
    clinical_implications?: string;
    research_gaps?: string;
    key_evidence_summary?: string[];
}

// Committee-Grade Interfaces
interface GoNoGoRow {
    block: 'In vitro' | 'In vivo' | 'Clinique';
    minimal_design: string;
    primary_endpoint: string;
    go_nogo_signal: string;
}

interface ExecutiveSummary {
    context: string;
    central_hypothesis_operational: string;
    scope_decisions: string;
    go_nogo_table: GoNoGoRow[];
}

interface ClinicalScope {
    operational_definitions: string;
    recommended_comparators: string;
}

interface RivalHypotheses {
    h1_main: string;
    h2_secondary: string;
    h0_null: string;
    h3_rival: string;
    h4_rival_toxicity: string;
    dag_textual: string;
}

interface EvidenceSnapshotRow {
    claim: string;
    context_population: string;
    oxford_level: '1a' | '1b' | '2a' | '2b' | '3' | '4' | '5' | 'À confirmer';
    signal_effect: string;
    key_references: string[];
}

interface OrganRiskMapping {
    organ_system: string;
    role: string;
    risk_checkpoint: string;
}

interface MechanisticModel {
    pkpd_robust: string;
    pkpd_unknown: string;
    organ_risk_mapping: OrganRiskMapping[];
}

interface MonitoringRow {
    parameter: string;
    frequency: string;
    action_threshold: string;
    required_action: string;
}

interface RisksMonitoring {
    key_risks: string[];
    monitoring_table: MonitoringRow[];
    pharmacogenetic_recommendations: string;
}

interface Hypothesis {
    hypothesis_id: string;
    statement: string;

    // Committee-Grade Fields
    executive_summary?: ExecutiveSummary;
    clinical_scope?: ClinicalScope;
    rival_hypotheses?: RivalHypotheses;
    evidence_snapshot?: EvidenceSnapshotRow[];
    mechanistic_model?: MechanisticModel;
    risks_monitoring?: RisksMonitoring;

    // Existing Fields
    predictions?: string[];
    minimal_tests?: Array<{ type: string; description: string }>;
    risks_confounders?: string[];
    drug_repurposing_candidates?: string[];
    scores?: {
        novelty: number;
        plausibility: number;
        strength: number;
        feasibility: number;
        impact: number;
        total: number;
    };
    evidence_citations?: string[];
    detailed_analysis?: DetailedAnalysis;
    status: string;
}

interface EvidenceItem {
    pmid?: string;
    doi?: string;
    title: string;
    abstract?: string;
    journal?: string;
    date?: string;
}

interface ResearchSession {
    query: string;
    date: string;
    papers_count: number;
    hypotheses: Hypothesis[];
    evidence: EvidenceItem[];
    adversarial_review?: {
        counter_arguments: string[];
        conclusion: string;
        summary: string;
    };
}

// Color palette
const COLORS = {
    primary: '#3B82F6',
    secondary: '#6366F1',
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    text: '#1F2937',
    textLight: '#6B7280',
    border: '#E5E7EB',
    background: '#F9FAFB'
};

export function generateHypothesisPDF(hypothesis: Hypothesis, evidence: EvidenceItem[]): void {
    const doc = new jsPDF();
    let y = 20;
    const leftMargin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - 40;

    // Header
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 0, pageWidth, 35, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Rapport d\'Hypothèse', leftMargin, 15);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`ID: ${hypothesis.hypothesis_id}`, leftMargin, 25);
    doc.text(`Date: ${new Date().toLocaleDateString('fr-FR')}`, pageWidth - 60, 25);

    y = 50;

    // Hypothesis Statement
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Énoncé de l\'Hypothèse', leftMargin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const statementLines = doc.splitTextToSize(hypothesis.statement, contentWidth);
    doc.text(statementLines, leftMargin, y);
    y += statementLines.length * 5 + 10;

    // Scores Section
    if (hypothesis.scores) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Scores d\'Évaluation', leftMargin, y);
        y += 10;

        const scores = [
            { label: 'Nouveauté', value: hypothesis.scores.novelty },
            { label: 'Plausibilité', value: hypothesis.scores.plausibility },
            { label: 'Force de Preuve', value: hypothesis.scores.strength },
            { label: 'Faisabilité', value: hypothesis.scores.feasibility },
            { label: 'Impact', value: hypothesis.scores.impact },
        ];

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');

        scores.forEach((score, i) => {
            const x = leftMargin + (i % 3) * 60;
            const row = Math.floor(i / 3);
            const scoreY = y + row * 15;

            doc.text(`${score.label}:`, x, scoreY);
            doc.setFont('helvetica', 'bold');
            doc.text(`${score.value}/10`, x + 35, scoreY);
            doc.setFont('helvetica', 'normal');
        });

        y += 25;

        // Total score with emphasis
        doc.setFillColor(239, 246, 255);
        doc.roundedRect(leftMargin, y - 5, 80, 15, 3, 3, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(`Score Total: ${hypothesis.scores.total.toFixed(1)}/10`, leftMargin + 5, y + 5);
        y += 20;
    }

    // Predictions
    if (hypothesis.predictions && hypothesis.predictions.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Prédictions Testables', leftMargin, y);
        y += 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);

        hypothesis.predictions.forEach((pred, i) => {
            const predLines = doc.splitTextToSize(`${i + 1}. ${pred}`, contentWidth - 10);
            doc.text(predLines, leftMargin + 5, y);
            y += predLines.length * 4 + 3;
        });
        y += 5;
    }

    // Minimal Tests
    if (hypothesis.minimal_tests && hypothesis.minimal_tests.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Tests Minimaux Recommandés', leftMargin, y);
        y += 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);

        hypothesis.minimal_tests.forEach((test, i) => {
            doc.setFont('helvetica', 'bold');
            doc.text(`${i + 1}. [${test.type}]`, leftMargin + 5, y);
            doc.setFont('helvetica', 'normal');

            const testLines = doc.splitTextToSize(test.description, contentWidth - 20);
            doc.text(testLines, leftMargin + 10, y + 5);
            y += testLines.length * 4 + 8;
        });
        y += 5;
    }

    // Risks and Confounders
    if (hypothesis.risks_confounders && hypothesis.risks_confounders.length > 0) {
        // Check if we need a new page
        if (y > 250) {
            doc.addPage();
            y = 20;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Risques et Confondeurs', leftMargin, y);
        y += 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);

        hypothesis.risks_confounders.forEach((risk, i) => {
            const riskLines = doc.splitTextToSize(`• ${risk}`, contentWidth - 10);
            doc.text(riskLines, leftMargin + 5, y);
            y += riskLines.length * 4 + 2;
        });
        y += 5;
    }

    // Evidence Citations
    if (hypothesis.evidence_citations && hypothesis.evidence_citations.length > 0) {
        if (y > 230) {
            doc.addPage();
            y = 20;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Citations de Preuves', leftMargin, y);
        y += 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(59, 130, 246);

        hypothesis.evidence_citations.slice(0, 10).forEach((citation, i) => {
            doc.text(`${i + 1}. ${citation}`, leftMargin + 5, y);
            y += 5;
        });

        if (hypothesis.evidence_citations.length > 10) {
            doc.setTextColor(107, 114, 128);
            doc.text(`... et ${hypothesis.evidence_citations.length - 10} autres citations`, leftMargin + 5, y);
        }
    }

    // Footer
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(107, 114, 128);
        doc.text(
            `Généré par MediMind Discovery Platform - Page ${i}/${pageCount}`,
            pageWidth / 2,
            doc.internal.pageSize.getHeight() - 10,
            { align: 'center' }
        );
    }

    // Save
    doc.save(`hypothesis_${hypothesis.hypothesis_id}.pdf`);
}

export function generateResearchReportPDF(session: ResearchSession): void {
    const doc = new jsPDF();
    let y = 20;
    const leftMargin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - 40;

    // Header
    doc.setFillColor(99, 102, 241);
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('Rapport de Recherche', leftMargin, 18);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Requête: ${session.query}`, leftMargin, 30);
    doc.text(`Date: ${session.date}`, pageWidth - 60, 30);

    y = 55;

    // Summary Statistics
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Résumé', leftMargin, y);
    y += 10;

    doc.setFillColor(249, 250, 251);
    doc.roundedRect(leftMargin, y - 5, contentWidth, 25, 3, 3, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`• ${session.papers_count} articles analysés`, leftMargin + 10, y + 5);
    doc.text(`• ${session.hypotheses.length} hypothèses générées`, leftMargin + 10, y + 15);
    y += 35;

    // Hypotheses
    if (session.hypotheses.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('Hypothèses Générées', leftMargin, y);
        y += 10;

        session.hypotheses.forEach((hyp, i) => {
            if (y > 260) {
                doc.addPage();
                y = 20;
            }

            // Hypothesis box
            doc.setFillColor(239, 246, 255);
            doc.roundedRect(leftMargin, y - 3, contentWidth, 30, 2, 2, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(59, 130, 246);
            doc.text(`${hyp.hypothesis_id}`, leftMargin + 5, y + 5);

            if (hyp.scores) {
                doc.text(`Score: ${hyp.scores.total.toFixed(1)}/10`, pageWidth - 50, y + 5);
            }

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(31, 41, 55);
            const hypLines = doc.splitTextToSize(hyp.statement, contentWidth - 15);
            doc.text(hypLines, leftMargin + 5, y + 15);

            y += 35;
        });
    }

    // Adversarial Review
    if (session.adversarial_review) {
        if (y > 220) {
            doc.addPage();
            y = 20;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(245, 158, 11);
        doc.text('Revue Adversariale', leftMargin, y);
        y += 10;

        doc.setTextColor(31, 41, 55);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);

        const summaryLines = doc.splitTextToSize(session.adversarial_review.summary, contentWidth);
        doc.text(summaryLines, leftMargin, y);
        y += summaryLines.length * 5 + 10;

        doc.setFont('helvetica', 'bold');
        doc.text(`Conclusion: ${session.adversarial_review.conclusion}`, leftMargin, y);
    }

    // Evidence Sources
    if (session.evidence.length > 0) {
        if (y > 200) {
            doc.addPage();
            y = 20;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(31, 41, 55);
        doc.text('Sources de Preuves', leftMargin, y);
        y += 10;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);

        session.evidence.slice(0, 15).forEach((ev, i) => {
            if (y > 280) {
                doc.addPage();
                y = 20;
            }

            doc.setTextColor(59, 130, 246);
            const pmidText = ev.pmid ? `PMID: ${ev.pmid}` : (ev.doi ? `DOI: ${ev.doi}` : '');
            doc.text(`${i + 1}. ${pmidText}`, leftMargin, y);

            doc.setTextColor(31, 41, 55);
            const titleLines = doc.splitTextToSize(ev.title, contentWidth - 15);
            doc.text(titleLines, leftMargin + 5, y + 5);

            y += titleLines.length * 4 + 8;
        });
    }

    // Footer
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(107, 114, 128);
        doc.text(
            `MediMind Discovery Platform - Recherche: "${session.query}" - Page ${i}/${pageCount}`,
            pageWidth / 2,
            doc.internal.pageSize.getHeight() - 10,
            { align: 'center' }
        );
    }

    // Save
    const filename = `research_report_${session.date.replace(/[^0-9]/g, '')}.pdf`;
    doc.save(filename);
}

export function generateMarkdownReport(session: ResearchSession): string {
    let md = `# Rapport de Recherche\n\n`;
    md += `**Requête:** ${session.query}\n`;
    md += `**Date:** ${session.date}\n\n`;
    md += `---\n\n`;

    md += `## Résumé\n\n`;
    md += `- 📄 **${session.papers_count}** articles analysés\n`;
    md += `- 💡 **${session.hypotheses.length}** hypothèses générées\n\n`;

    if (session.hypotheses.length > 0) {
        md += `## Hypothèses\n\n`;

        session.hypotheses.forEach((hyp, i) => {
            md += `### ${hyp.hypothesis_id}\n\n`;
            md += `> ${hyp.statement}\n\n`;

            if (hyp.scores) {
                md += `**Scores:**\n`;
                md += `| Critère | Score |\n`;
                md += `|---------|-------|\n`;
                md += `| Nouveauté | ${hyp.scores.novelty}/10 |\n`;
                md += `| Plausibilité | ${hyp.scores.plausibility}/10 |\n`;
                md += `| Force | ${hyp.scores.strength}/10 |\n`;
                md += `| Faisabilité | ${hyp.scores.feasibility}/10 |\n`;
                md += `| Impact | ${hyp.scores.impact}/10 |\n`;
                md += `| **Total** | **${hyp.scores.total.toFixed(1)}/10** |\n\n`;
            }

            if (hyp.predictions?.length) {
                md += `**Prédictions:**\n`;
                hyp.predictions.forEach((pred, j) => {
                    md += `${j + 1}. ${pred}\n`;
                });
                md += `\n`;
            }

            md += `---\n\n`;
        });
    }

    if (session.adversarial_review) {
        md += `## Revue Adversariale\n\n`;
        md += `${session.adversarial_review.summary}\n\n`;
        md += `**Conclusion:** ${session.adversarial_review.conclusion}\n\n`;
    }

    if (session.evidence.length > 0) {
        md += `## Sources\n\n`;
        session.evidence.forEach((ev, i) => {
            const id = ev.pmid ? `PMID:${ev.pmid}` : (ev.doi || '');
            md += `${i + 1}. **${id}** - ${ev.title}\n`;
        });
    }

    md += `\n---\n\n`;
    md += `*Généré par MediMind Discovery Platform*\n`;

    return md;
}

// LAB PACKET EXPORT - Comprehensive research handoff document
interface LabPacketData extends ResearchSession {
    extraction?: {
        entities: Array<{ text: string; type: string; confidence: number }>;
        relations: Array<{ subject: string; predicate: string; object: string }>;
        evidence_level: { level: string; strength: number };
    };
    patterns?: Array<{
        entity1: string;
        entity2: string;
        frequency: number;
        relations: string[];
        scores: { novelty: number; strength: number; actionability: number; total: number };
    }>;
    graph_nodes?: Array<{ id: string; label: string; type: string }>;
}

export function generateLabPacketPDF(data: LabPacketData): void {
    const doc = new jsPDF();
    let y = 20;
    const leftMargin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const contentWidth = pageWidth - 40;

    // Cover Page Header
    doc.setFillColor(34, 197, 94); // Green
    doc.rect(0, 0, pageWidth, 50, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('Lab Packet', leftMargin, 25);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Dossier de Recherche Complet', leftMargin, 38);
    doc.text(data.date, pageWidth - 50, 38);

    y = 65;

    // Research Query
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Requête de Recherche', leftMargin, y);
    y += 8;

    doc.setFillColor(240, 253, 244);
    doc.roundedRect(leftMargin, y - 3, contentWidth, 15, 3, 3, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(data.query, leftMargin + 5, y + 7);
    y += 25;

    // Statistics Overview
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Statistiques', leftMargin, y);
    y += 10;

    const stats = [
        { label: 'Articles Analysés', value: data.papers_count },
        { label: 'Hypothèses', value: data.hypotheses.length },
        { label: 'Entités Extraites', value: data.extraction?.entities.length || 0 },
        { label: 'Relations', value: data.extraction?.relations.length || 0 },
        { label: 'Patterns', value: data.patterns?.length || 0 },
    ];

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    stats.forEach((stat, i) => {
        const x = leftMargin + (i % 3) * 60;
        const row = Math.floor(i / 3);
        doc.text(`${stat.label}: `, x, y + row * 10);
        doc.setFont('helvetica', 'bold');
        doc.text(`${stat.value}`, x + 35, y + row * 10);
        doc.setFont('helvetica', 'normal');
    });
    y += 25;

    // Top Patterns Section
    if (data.patterns && data.patterns.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('Patterns de Co-occurrence Prioritaires', leftMargin, y);
        y += 10;

        doc.setFontSize(9);
        data.patterns.slice(0, 5).forEach((pattern, i) => {
            doc.setFillColor(i === 0 ? 220 : 249, i === 0 ? 252 : 250, i === 0 ? 231 : 251);
            doc.roundedRect(leftMargin, y - 3, contentWidth, 12, 2, 2, 'F');

            doc.setFont('helvetica', 'bold');
            doc.text(`${i + 1}. ${pattern.entity1} ↔ ${pattern.entity2}`, leftMargin + 5, y + 5);

            doc.setFont('helvetica', 'normal');
            doc.text(`Score: ${(pattern.scores.total * 10).toFixed(1)}/10`, pageWidth - 50, y + 5);

            y += 15;
        });
        y += 5;
    }

    // Key Entities
    if (data.extraction?.entities && data.extraction.entities.length > 0) {
        if (y > 220) {
            doc.addPage();
            y = 20;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('Entités Clés Identifiées', leftMargin, y);
        y += 10;

        const entityGroups = data.extraction.entities.reduce((acc, e) => {
            if (!acc[e.type]) acc[e.type] = [];
            acc[e.type].push(e.text);
            return acc;
        }, {} as Record<string, string[]>);

        doc.setFontSize(9);
        Object.entries(entityGroups).slice(0, 6).forEach(([type, entities]) => {
            doc.setFont('helvetica', 'bold');
            doc.text(`${type}:`, leftMargin, y);
            doc.setFont('helvetica', 'normal');
            const entityText = entities.slice(0, 5).join(', ') + (entities.length > 5 ? ` (+${entities.length - 5})` : '');
            const lines = doc.splitTextToSize(entityText, contentWidth - 30);
            doc.text(lines, leftMargin + 25, y);
            y += lines.length * 4 + 4;
        });
        y += 5;
    }

    // Hypotheses Summary
    if (data.hypotheses.length > 0) {
        if (y > 200) {
            doc.addPage();
            y = 20;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('Hypothèses Générées', leftMargin, y);
        y += 10;

        data.hypotheses.forEach((hyp, i) => {
            if (y > 260) {
                doc.addPage();
                y = 20;
            }

            doc.setFillColor(239, 246, 255);
            const hypLines = doc.splitTextToSize(hyp.statement, contentWidth - 20);
            const boxHeight = hypLines.length * 4 + 15;
            doc.roundedRect(leftMargin, y - 3, contentWidth, boxHeight, 2, 2, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(59, 130, 246);
            doc.text(hyp.hypothesis_id, leftMargin + 5, y + 5);

            if (hyp.scores) {
                doc.text(`${hyp.scores.total.toFixed(1)}/10`, pageWidth - 45, y + 5);
            }

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(31, 41, 55);
            doc.text(hypLines, leftMargin + 5, y + 12);

            y += boxHeight + 5;
        });
    }

    // Evidence Sources Page
    if (data.evidence.length > 0) {
        doc.addPage();
        y = 20;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(31, 41, 55);
        doc.text('Sources et Références', leftMargin, y);
        y += 12;

        doc.setFontSize(8);
        data.evidence.slice(0, 20).forEach((ev, i) => {
            if (y > 275) {
                doc.addPage();
                y = 20;
            }

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(59, 130, 246);
            const idText = ev.pmid ? `PMID:${ev.pmid}` : (ev.doi || `#${i + 1}`);
            doc.text(`${i + 1}. ${idText}`, leftMargin, y);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(31, 41, 55);
            const titleLines = doc.splitTextToSize(ev.title, contentWidth - 10);
            doc.text(titleLines, leftMargin + 5, y + 5);

            if (ev.journal) {
                doc.setTextColor(107, 114, 128);
                doc.text(`${ev.journal} | ${ev.date || ''}`, leftMargin + 5, y + 5 + titleLines.length * 4);
            }

            y += titleLines.length * 4 + 12;
        });
    }

    // Footer
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(107, 114, 128);
        doc.text(
            `Lab Packet - "${data.query}" - Page ${i}/${pageCount}`,
            pageWidth / 2,
            doc.internal.pageSize.getHeight() - 10,
            { align: 'center' }
        );
    }

    doc.save(`lab_packet_${data.date.replace(/[^0-9]/g, '')}.pdf`);
}

// Enhanced Markdown with all data
export function generateLabPacketMarkdown(data: LabPacketData): string {
    let md = `# 🧪 Lab Packet\n\n`;
    md += `**Requête:** ${data.query}\n`;
    md += `**Date:** ${data.date}\n\n`;
    md += `---\n\n`;

    // Stats
    md += `## 📊 Statistiques\n\n`;
    md += `| Métrique | Valeur |\n`;
    md += `|----------|--------|\n`;
    md += `| Articles analysés | ${data.papers_count} |\n`;
    md += `| Hypothèses générées | ${data.hypotheses.length} |\n`;
    md += `| Entités extraites | ${data.extraction?.entities.length || 0} |\n`;
    md += `| Relations identifiées | ${data.extraction?.relations.length || 0} |\n`;
    md += `| Patterns découverts | ${data.patterns?.length || 0} |\n\n`;

    // Extraction
    if (data.extraction) {
        md += `## 🔬 Extraction de Connaissances\n\n`;
        md += `**Niveau de preuve:** ${data.extraction.evidence_level.level} (${data.extraction.evidence_level.strength}/5)\n\n`;

        // Group entities by type
        const grouped = data.extraction.entities.reduce((acc, e) => {
            if (!acc[e.type]) acc[e.type] = [];
            acc[e.type].push(e.text);
            return acc;
        }, {} as Record<string, string[]>);

        md += `### Entités\n\n`;
        Object.entries(grouped).forEach(([type, entities]) => {
            md += `- **${type}:** ${entities.slice(0, 10).join(', ')}${entities.length > 10 ? ` (+${entities.length - 10})` : ''}\n`;
        });
        md += `\n`;

        if (data.extraction.relations.length > 0) {
            md += `### Relations Clés\n\n`;
            data.extraction.relations.slice(0, 10).forEach(rel => {
                md += `- ${rel.subject} → *${rel.predicate}* → ${rel.object}\n`;
            });
            md += `\n`;
        }
    }

    // Patterns
    if (data.patterns && data.patterns.length > 0) {
        md += `## 🔗 Patterns de Co-occurrence\n\n`;
        md += `| Entité 1 | Entité 2 | Relations | Score |\n`;
        md += `|----------|----------|-----------|-------|\n`;
        data.patterns.slice(0, 10).forEach(p => {
            md += `| ${p.entity1} | ${p.entity2} | ${p.relations.join(', ')} | ${(p.scores.total * 10).toFixed(1)}/10 |\n`;
        });
        md += `\n`;
    }

    // Hypotheses
    if (data.hypotheses.length > 0) {
        md += `## 💡 Hypothèses\n\n`;
        data.hypotheses.forEach(hyp => {
            md += `### ${hyp.hypothesis_id}\n\n`;
            md += `> ${hyp.statement}\n\n`;
            if (hyp.scores) {
                md += `**Score:** ${hyp.scores.total.toFixed(1)}/10 `;
                md += `(N:${hyp.scores.novelty} P:${hyp.scores.plausibility} F:${hyp.scores.feasibility} I:${hyp.scores.impact})\n\n`;
            }
            if (hyp.predictions?.length) {
                md += `**Prédictions:**\n`;
                hyp.predictions.forEach((p, i) => md += `${i + 1}. ${p}\n`);
                md += `\n`;
            }
        });
    }

    // Sources
    if (data.evidence.length > 0) {
        md += `## 📚 Sources\n\n`;
        data.evidence.forEach((ev, i) => {
            const id = ev.pmid ? `PMID:${ev.pmid}` : (ev.doi || '');
            md += `${i + 1}. **${id}** - ${ev.title}\n`;
            if (ev.journal) md += `   - *${ev.journal}* | ${ev.date || ''}\n`;
        });
    }

    md += `\n---\n\n`;
    md += `*Lab Packet généré par MediMind Discovery Platform*\n`;

    return md;
}

// ============================================
// CONGRESS-QUALITY RESEARCH REPORT
// Professional presentation-ready PDF
// ============================================

export interface CongressReportData {
    title: string;
    query: string;
    date: string;
    author?: string;
    institution?: string;
    hypothesis: Hypothesis;
    searchResults: EvidenceItem[];
    evidencePack?: {
        query_intent: any;
        paper_count: number;
        snippet_count: number;
        entities?: Array<{ text: string; type: string }>;
        relations?: Array<{ source: string; target: string; label: string }>;
        snippets?: Array<{ passage: string; paper_id: string }>;
        papers?: Array<{ pmid: string; title: string; journal: string; publication_date: string; authors: string[] }>;
    };
    adversarialReview?: {
        counter_arguments: string[];
        limitations: string[];
        conclusion: string;
    };
}

// Helper to strip Markdown and clean text for PDF
function cleanText(text: string | undefined): string {
    if (!text) return '';
    return text
        // Remove bold/italic markers
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/__/g, '')
        .replace(/_/g, '')
        // Remove header markers
        .replace(/^#+\s+/gm, '')
        // Remove link syntax [text](url) -> text
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
        // Remove code blocks
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        // Fix common special chars not handled well by standard fonts
        .replace(/–/g, '-')
        .replace(/—/g, '-')
        .replace(/"/g, '"')
        .replace(/"/g, '"')
        .replace(/'/g, "'")
        .replace(/'/g, "'")
        // Scientific units normalization
        .replace(/μM/g, 'microM') // Greek mu to micro
        .replace(/µM/g, 'microM') // Micro symbol
        .replace(/mg\/L/g, 'mg/L')
        // Greek letters normalization (for better PDF compatibility)
        .replace(/α/g, 'alpha')
        .replace(/β/g, 'beta')
        .replace(/γ/g, 'gamma')
        .replace(/δ/g, 'delta')
        .replace(/Δ/g, 'Delta')
        // Remove bullet points if at start of line (PDF handles layout)
        .replace(/^\s*[-•]\s*/gm, '')
        .trim();
}

export function generateCongressReportPDF(data: CongressReportData): void {
    const doc = new jsPDF();
    // Add font support for French characters
    doc.setLanguage("fr");

    let y = 20;
    const leftMargin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - 40;

    // ========================================
    // PAGE 1: COVER PAGE
    // ========================================
    doc.setFillColor(30, 58, 138); // Navy blue
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    // Decorative elements
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 100, pageWidth, 2, 'F');
    doc.rect(0, 103, pageWidth, 1, 'F');

    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    const titleLines = doc.splitTextToSize(cleanText(data.title) || 'Rapport de Recherche Scientifique', contentWidth);
    doc.text(titleLines, pageWidth / 2, 130, { align: 'center' });

    // Subtitle
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text('Rapport d\'Analyse et d\'Hypothèse', pageWidth / 2, 160, { align: 'center' });

    // Query box
    doc.setFillColor(59, 130, 246, 0.2);
    doc.roundedRect(40, 175, contentWidth - 20, 30, 3, 3, 'F');
    doc.setFontSize(12);
    doc.text(`Thème de Recherche:`, pageWidth / 2, 188, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const queryLines = doc.splitTextToSize(`"${data.query}"`, contentWidth - 40);
    doc.text(queryLines, pageWidth / 2, 198, { align: 'center' });

    // Author / Institution
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    if (data.author) doc.text(data.author, pageWidth / 2, 240, { align: 'center' });
    if (data.institution) doc.text(data.institution, pageWidth / 2, 250, { align: 'center' });

    // Date
    doc.setFontSize(10);
    doc.text(data.date, pageWidth / 2, 270, { align: 'center' });

    // Footer
    doc.setFontSize(9);
    doc.text('Généré par MediMind Discovery Platform', pageWidth / 2, pageHeight - 20, { align: 'center' });

    // ========================================
    // PAGE 2: EXECUTIVE SUMMARY
    // ========================================
    doc.addPage();
    y = 25;

    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageWidth, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('RAPPORT DE RECHERCHE', leftMargin, 10);
    doc.text(data.hypothesis.hypothesis_id, pageWidth - 50, 10);

    doc.setTextColor(30, 58, 138);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Résumé Exécutif', leftMargin, y + 10);
    y += 20;

    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(0.5);
    doc.line(leftMargin, y, pageWidth - leftMargin, y);
    y += 10;

    // Key Statistics Box
    doc.setFillColor(239, 246, 255);
    doc.roundedRect(leftMargin, y, contentWidth, 35, 3, 3, 'F');

    doc.setTextColor(31, 41, 55);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Statistiques Clés', leftMargin + 5, y + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    // P0: Fix extraction stats display
    const entitiesCount = data.evidencePack?.entities?.length || 0;
    const relationsCount = data.evidencePack?.relations?.length || 0;
    const extractionStatus = (entitiesCount === 0 && relationsCount === 0)
        ? ' (Extraction incomplete)'
        : '';

    const stats = [
        `Articles analyses: ${data.evidencePack?.paper_count || data.searchResults.length}`,
        `Entites identifiees: ${entitiesCount}${extractionStatus}`,
        `Relations extraites: ${relationsCount}${extractionStatus}`,
        `Score Global: ${data.hypothesis.scores?.total?.toFixed(1) || 'N/A'}/10`
    ];
    stats.forEach((stat, i) => {
        doc.text(stat, leftMargin + 5 + (i % 2) * 85, y + 18 + Math.floor(i / 2) * 10);
    });
    y += 45;

    // Hypothesis Statement
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.text('Hypothèse Principale', leftMargin, y);
    y += 8;

    doc.setFillColor(249, 250, 251);
    doc.setFillColor(249, 250, 251);
    const hypLines = doc.splitTextToSize(cleanText(data.hypothesis.statement), contentWidth - 15);
    const hypBoxHeight = hypLines.length * 5 + 10;
    doc.roundedRect(leftMargin, y - 3, contentWidth, hypBoxHeight, 3, 3, 'F');

    doc.setDrawColor(59, 130, 246);
    doc.setLineWidth(2);
    doc.line(leftMargin, y - 3, leftMargin, y + hypBoxHeight - 3);

    doc.setTextColor(31, 41, 55);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(hypLines, leftMargin + 10, y + 5);
    y += hypBoxHeight + 10;

    // Scores Grid
    if (data.hypothesis.scores) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(30, 58, 138);
        doc.text('Évaluation Multi-Critères', leftMargin, y);
        y += 10;

        const scoreData = [
            { label: 'Nouveauté', value: data.hypothesis.scores.novelty, color: [59, 130, 246] },
            { label: 'Plausibilité', value: data.hypothesis.scores.plausibility, color: [34, 197, 94] },
            { label: 'Force de Preuve', value: data.hypothesis.scores.strength, color: [245, 158, 11] },
            { label: 'Faisabilité', value: data.hypothesis.scores.feasibility, color: [139, 92, 246] },
            { label: 'Impact Potentiel', value: data.hypothesis.scores.impact, color: [236, 72, 153] },
        ];

        scoreData.forEach((score, i) => {
            const x = leftMargin + (i % 3) * 57;
            const row = Math.floor(i / 3);
            const scoreY = y + row * 22;

            // Score box
            doc.setFillColor(score.color[0], score.color[1], score.color[2]);
            doc.roundedRect(x, scoreY, 52, 18, 2, 2, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(score.label, x + 3, scoreY + 7);

            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(`${score.value}/10`, x + 3, scoreY + 15);
        });
        y += 50;
    }

    // ========================================
    // PAGE 3: METHODOLOGY
    // ========================================
    doc.addPage();
    y = 25;

    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageWidth, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('METHODOLOGIE DE RECHERCHE', leftMargin, 10);

    doc.setTextColor(30, 58, 138);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Methodologie', leftMargin, y + 10);
    y += 20;

    doc.setDrawColor(30, 58, 138);
    doc.line(leftMargin, y, pageWidth - leftMargin, y);
    y += 10;

    // P1: PRISMA-style search strategy
    doc.setTextColor(31, 41, 55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Strategie de Recherche', leftMargin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const searchStrategy = [
        `Requete: "${cleanText(data.query)}"`,
        `Bases de donnees: PubMed, Europe PMC, ClinicalTrials.gov`,
        `Periode: Articles recents`,
        `Filtres: Langue (anglais, francais), Type (essais, meta-analyses)`,
        `Resultats: ${data.evidencePack?.paper_count || data.searchResults.length} articles`
    ];
    searchStrategy.forEach(line => {
        doc.text(`- ${line}`, leftMargin + 5, y);
        y += 5;
    });
    y += 8;

    // P0: Extraction QA with warning
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 58, 138);
    doc.text('Extraction de Connaissances - QA', leftMargin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(31, 41, 55);

    const extractionEntitiesCount = data.evidencePack?.entities?.length || 0;
    const extractionRelationsCount = data.evidencePack?.relations?.length || 0;

    if (extractionEntitiesCount === 0 && extractionRelationsCount === 0) {
        // P0: Guard rail - warn if extraction is incomplete
        doc.setFillColor(255, 243, 224);
        doc.roundedRect(leftMargin, y - 2, contentWidth, 22, 2, 2, 'F');
        doc.setTextColor(194, 65, 12);
        doc.setFont('helvetica', 'bold');
        doc.text('WARNING: Extraction incomplete', leftMargin + 5, y + 4);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(31, 41, 55);
        doc.text('Analyse basee sur le contenu brut. Resultats exploratoires,', leftMargin + 5, y + 10);
        doc.text('validation manuelle necessaire.', leftMargin + 5, y + 16);
        y += 28;
    } else {
        doc.text(`Entites biomedicales: ${extractionEntitiesCount}`, leftMargin + 5, y);
        y += 5;

        if (data.evidencePack?.entities && data.evidencePack.entities.length > 0) {
            // Group by type
            const entityGroups: Record<string, number> = {};
            data.evidencePack.entities.slice(0, 50).forEach((e: any) => {
                const type = e.type || 'autre';
                entityGroups[type] = (entityGroups[type] || 0) + 1;
            });
            Object.entries(entityGroups).slice(0, 5).forEach(([type, count]) => {
                doc.text(`  ${type}: ${count}`, leftMargin + 10, y);
                y += 4;
            });
        }
        y += 3;
        doc.text(`Relations semantiques: ${extractionRelationsCount}`, leftMargin + 5, y);
        y += 10;
    }

    // Model info
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 58, 138);
    doc.text('Generation d\'Hypotheses', leftMargin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(31, 41, 55);
    const modelInfo = `Claude Opus 4 (Anthropic) analyse les preuves pour identifier patterns mecanistiques et generer hypotheses testables. Evaluation sur 5 criteres: Nouveaute, Plausibilite, Force de Preuve, Faisabilite, Impact.`;
    const modelLines = doc.splitTextToSize(modelInfo, contentWidth - 10);
    doc.text(modelLines, leftMargin + 5, y);
    y += modelLines.length * 4 + 10;

    // ========================================
    // PAGE 4: SCIENTIFIC REASONING - NEW!
    // ========================================
    doc.addPage();
    y = 25;

    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageWidth, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('RAISONNEMENT SCIENTIFIQUE', leftMargin, 10);

    doc.setTextColor(30, 58, 138);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Raisonnement Scientifique', leftMargin, y + 10);
    y += 20;

    doc.setDrawColor(30, 58, 138);
    doc.line(leftMargin, y, pageWidth - leftMargin, y);
    y += 10;

    // Introduction
    doc.setTextColor(31, 41, 55);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const reasoningIntro = `Cette section détaille le cheminement logique qui a conduit à la formulation de l'hypothèse, en s'appuyant sur les preuves extraites de la littérature scientifique.`;
    const introLines = doc.splitTextToSize(reasoningIntro, contentWidth);
    doc.text(introLines, leftMargin, y);
    y += introLines.length * 4 + 8;

    // Key Entities Identified
    if (data.evidencePack?.entities && data.evidencePack.entities.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(59, 130, 246);
        doc.text('1. Entités Clés Identifiées', leftMargin, y);
        y += 8;

        // Group entities by type
        const entityGroups: Record<string, string[]> = {};
        data.evidencePack.entities.forEach(e => {
            const type = e.type || 'autre';
            if (!entityGroups[type]) entityGroups[type] = [];
            if (!entityGroups[type].includes(e.text)) {
                entityGroups[type].push(e.text);
            }
        });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(31, 41, 55);

        Object.entries(entityGroups).slice(0, 5).forEach(([type, entities]) => {
            if (y > 260) { doc.addPage(); y = 25; }
            doc.setFillColor(240, 249, 255);
            doc.roundedRect(leftMargin, y - 3, contentWidth, 12, 2, 2, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(30, 64, 175);
            doc.text(`${type.toUpperCase()}:`, leftMargin + 3, y + 5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(31, 41, 55);
            const entityText = entities.slice(0, 6).join(', ') + (entities.length > 6 ? ` (+${entities.length - 6})` : '');
            doc.text(entityText, leftMargin + 30, y + 5);
            y += 15;
        });
        y += 5;
    }

    // Key Relations/Connections
    if (data.evidencePack?.relations && data.evidencePack.relations.length > 0) {
        if (y > 200) { doc.addPage(); y = 25; }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(34, 197, 94);
        doc.text('2. Relations Découvertes', leftMargin, y);
        y += 8;

        doc.setFontSize(9);
        doc.setTextColor(31, 41, 55);

        const relText = `L'analyse a permis d'identifier ${data.evidencePack.relations.length} relations entre les entités biomédicales. Ces connexions révèlent des patterns mécanistiques:`;
        const relIntroLines = doc.splitTextToSize(relText, contentWidth);
        doc.setFont('helvetica', 'normal');
        doc.text(relIntroLines, leftMargin, y);
        y += relIntroLines.length * 4 + 5;

        data.evidencePack.relations.slice(0, 8).forEach((rel, i) => {
            if (y > 265) { doc.addPage(); y = 25; }
            doc.setFillColor(240, 253, 244);
            doc.roundedRect(leftMargin, y - 2, contentWidth, 10, 2, 2, 'F');
            doc.setTextColor(22, 101, 52);
            doc.text(`→ ${rel.source} — ${rel.label || 'associé à'} — ${rel.target}`, leftMargin + 3, y + 4);
            y += 12;
        });
        y += 5;
    }

    // Evidence Snippets from Literature
    if (data.evidencePack?.snippets && data.evidencePack.snippets.length > 0) {
        if (y > 180) { doc.addPage(); y = 25; }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(139, 92, 246);
        doc.text('3. Preuves Textuelles Clés', leftMargin, y);
        y += 8;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(31, 41, 55);

        const snippetIntro = `Extraits significatifs de la littérature supportant l'hypothèse:`;
        doc.text(snippetIntro, leftMargin, y);
        y += 6;

        data.evidencePack.snippets.slice(0, 5).forEach((snippet, i) => {
            if (y > 250) { doc.addPage(); y = 25; }

            doc.setFillColor(245, 243, 255);
            const passageText = snippet.passage.slice(0, 300) + (snippet.passage.length > 300 ? '...' : '');
            const snippetLines = doc.splitTextToSize(`"${passageText}"`, contentWidth - 15);
            const snippetHeight = snippetLines.length * 3.5 + 8;
            doc.roundedRect(leftMargin, y - 2, contentWidth, snippetHeight, 2, 2, 'F');

            doc.setTextColor(88, 28, 135);
            doc.setFont('helvetica', 'italic');
            doc.text(snippetLines, leftMargin + 5, y + 4);

            doc.setTextColor(107, 114, 128);
            doc.setFont('helvetica', 'normal');
            doc.text(`— Source: ${snippet.paper_id || 'Article ' + (i + 1)}`, leftMargin + 5, y + snippetHeight - 2);

            y += snippetHeight + 5;
        });
        y += 5;
    }

    // Synthesis: How evidence leads to hypothesis
    if (y > 180) { doc.addPage(); y = 25; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(236, 72, 153);
    doc.text('4. Synthèse: De la Preuve à l\'Hypothèse', leftMargin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(31, 41, 55);

    const synthesisText = `En combinant les ${data.evidencePack?.entities?.length || 'multiples'} entités identifiées et les ${data.evidencePack?.relations?.length || 'nombreuses'} relations extraites, l'analyse IA a détecté un pattern convergent suggérant l'hypothèse suivante:\n\n"${data.hypothesis.statement}"\n\nCette hypothèse atteint un score de plausibilité de ${data.hypothesis.scores?.plausibility || 'N/A'}/10, une force de preuve de ${data.hypothesis.scores?.strength || 'N/A'}/10, et un score de nouveauté de ${data.hypothesis.scores?.novelty || 'N/A'}/10, indiquant ${data.hypothesis.scores?.novelty && data.hypothesis.scores.novelty >= 7 ? 'une contribution originale à la connaissance' : 'une piste de recherche prometteuse'}.`;

    const synthesisLines = doc.splitTextToSize(synthesisText, contentWidth);
    doc.text(synthesisLines, leftMargin, y);
    y += synthesisLines.length * 4 + 10;

    // ========================================
    // THESIS-LEVEL DETAILED ANALYSIS PAGES
    // ========================================
    const analysis = data.hypothesis.detailed_analysis;

    if (analysis) {
        // Helper function to render a thesis section
        const renderThesisSection = (title: string, content: string | undefined, color: number[]) => {
            if (!content) return;

            if (y > 220) {
                doc.addPage();
                y = 25;
                doc.setFillColor(30, 58, 138);
                doc.rect(0, 0, pageWidth, 15, 'F');
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(10);
                doc.text('ANALYSE APPROFONDIE (suite)', leftMargin, 10);
                y = 30;
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(color[0], color[1], color[2]);
            doc.text(title, leftMargin, y);
            y += 8;

            doc.setDrawColor(color[0], color[1], color[2]);
            doc.setLineWidth(0.5);
            doc.line(leftMargin, y - 3, leftMargin + 80, y - 3);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            doc.setTextColor(31, 41, 55);
            const sectionLines = doc.splitTextToSize(cleanText(content), contentWidth);

            // Check if we need a page break mid-content
            const lineHeight = 4;
            let currentY = y;
            sectionLines.forEach((line: string, idx: number) => {
                if (currentY > 275) {
                    doc.addPage();
                    currentY = 25;
                    doc.setFillColor(30, 58, 138);
                    doc.rect(0, 0, pageWidth, 15, 'F');
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(10);
                    doc.text('ANALYSE APPROFONDIE (suite)', leftMargin, 10);
                    currentY = 30;
                    doc.setTextColor(31, 41, 55);
                    doc.setFontSize(11);
                }
                doc.text(line, leftMargin, currentY);
                currentY += lineHeight;
            });
            y = currentY + 10;
        };

        // PAGE: THESIS ANALYSIS - CONTEXT & PATHOPHYSIOLOGY
        doc.addPage();
        y = 25;

        doc.setFillColor(30, 58, 138);
        doc.rect(0, 0, pageWidth, 15, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text('ANALYSE APPROFONDIE - NIVEAU THÈSE', leftMargin, 10);

        doc.setTextColor(30, 58, 138);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('Analyse Approfondie', leftMargin, y + 10);
        y += 20;

        doc.setDrawColor(30, 58, 138);
        doc.line(leftMargin, y, pageWidth - leftMargin, y);
        y += 15;

        // 1. Background Context
        renderThesisSection('I. Contexte et Problématique', cleanText(analysis.background_context), [30, 64, 175]);

        // 2. Pathophysiology
        renderThesisSection('II. Physiopathologie', cleanText(analysis.pathophysiology), [139, 92, 246]);

        // 3. Mechanism of Action
        renderThesisSection('III. Mécanisme d\'Action Proposé', cleanText(analysis.mechanism_of_action), [16, 185, 129]);

        // 4. Molecular Targets (NEW)
        renderThesisSection('IV. Cibles Moléculaires', cleanText(analysis.molecular_targets), [219, 39, 119]);

        // 5. Organ Functions (NEW)
        renderThesisSection('V. Fonctions des Organes', cleanText(analysis.organ_functions), [8, 145, 178]);

        // 6. Literature Synthesis
        renderThesisSection('VI. Synthèse de la Littérature', cleanText(analysis.literature_synthesis), [245, 158, 11]);

        // 7. Clinical Implications
        renderThesisSection('VII. Implications Cliniques', cleanText(analysis.clinical_implications), [236, 72, 153]);

        // 8. Contraindications & Interactions (NEW)
        renderThesisSection('VIII. Contre-indications & Interactions', cleanText(analysis.contraindications_interactions), [220, 38, 38]);

        // 9. Unexplored Avenues (NEW)
        renderThesisSection('IX. Pistes Inexplorées & Innovation', cleanText(analysis.unexplored_avenues), [124, 58, 237]);

        // 10. Research Gaps
        renderThesisSection('X. Lacunes de Recherche', cleanText(analysis.research_gaps), [239, 68, 68]);

        // 11. Key Evidence Summary
        if (analysis.key_evidence_summary && analysis.key_evidence_summary.length > 0) {
            if (y > 200) { doc.addPage(); y = 25; }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(34, 197, 94);
            doc.text('XI. Résumé des Preuves Clés', leftMargin, y);
            y += 10;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(31, 41, 55);

            analysis.key_evidence_summary.forEach((evidence, i) => {
                if (y > 270) { doc.addPage(); y = 25; }
                doc.setFillColor(240, 253, 244);
                const evidenceLines = doc.splitTextToSize(`${i + 1}. ${cleanText(evidence)}`, contentWidth - 10);
                doc.roundedRect(leftMargin, y - 2, contentWidth, evidenceLines.length * 4 + 6, 2, 2, 'F');
                doc.text(evidenceLines, leftMargin + 5, y + 3);
                y += evidenceLines.length * 4 + 10;
            });
        }
    }

    // ========================================
    // PAGE: ANALYSIS & PREDICTIONS
    // ========================================
    doc.addPage();
    y = 25;

    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageWidth, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('ANALYSE DÉTAILLÉE', leftMargin, 10);

    doc.setTextColor(30, 58, 138);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Analyse Détaillée', leftMargin, y + 10);
    y += 20;

    doc.setDrawColor(30, 58, 138);
    doc.line(leftMargin, y, pageWidth - leftMargin, y);
    y += 10;

    // ========================================
    // P1: EVIDENCE LEDGER
    // ========================================
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(30, 58, 138);
    doc.text('Evidence Ledger', leftMargin, y);
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(31, 41, 55);

    doc.text('Tracabilite des assertions scientifiques avec leurs sources.', leftMargin, y);
    y += 8;

    // Table header
    doc.setFillColor(239, 246, 255);
    doc.roundedRect(leftMargin, y - 2, contentWidth, 10, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Assertion', leftMargin + 2, y + 4);
    doc.text('Source', leftMargin + 100, y + 4);
    doc.text('Niveau', leftMargin + 145, y + 4);
    y += 12;

    // Evidence citations table
    if (data.hypothesis.evidence_citations && data.hypothesis.evidence_citations.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);

        data.hypothesis.evidence_citations.slice(0, 8).forEach((citation, i) => {
            if (y > 260) { doc.addPage(); y = 25; }

            const parts = citation.split(' - ');
            const sourceId = parts[0] || `Ref ${i + 1}`;
            const description = parts[1] || citation;

            const claimText = cleanText(description).slice(0, 75) + (description.length > 75 ? '...' : '');
            const claimLines = doc.splitTextToSize(claimText, 95);
            const rowHeight = Math.max(claimLines.length * 3.5 + 4, 10);

            doc.setFillColor(i % 2 === 0 ? 255 : 249, i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 251);
            doc.roundedRect(leftMargin, y - 2, contentWidth, rowHeight, 1, 1, 'F');

            doc.setTextColor(31, 41, 55);
            doc.text(claimLines, leftMargin + 2, y + 2);
            doc.text(sourceId, leftMargin + 100, y + 2);

            const level = sourceId.includes('PMID') || sourceId.includes('DOI') ? 'Peer-rev' : 'Exploratoire';
            doc.text(level, leftMargin + 145, y + 2);

            y += rowHeight + 2;
        });
    } else {
        doc.setFillColor(255, 243, 224);
        doc.roundedRect(leftMargin, y - 2, contentWidth, 12, 2, 2, 'F');
        doc.setTextColor(194, 65, 12);
        doc.setFont('helvetica', 'italic');
        doc.text('Citations en cours de structuration', leftMargin + 5, y + 5);
        doc.setTextColor(31, 41, 55);
        y += 18;
    }

    y += 10;

    // Predictions
    if (data.hypothesis.predictions && data.hypothesis.predictions.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(34, 197, 94);
        doc.text('Prédictions Testables', leftMargin, y);
        y += 10;

        // P1: Calibration note
        doc.setFillColor(240, 249, 255);
        doc.roundedRect(leftMargin, y - 2, contentWidth, 12, 2, 2, 'F');
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(30, 64, 175);
        doc.text('Note: Valeurs quantitatives estimees. Confirmer par etudes PK pilotes.', leftMargin + 5, y + 5);
        y += 15;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(31, 41, 55);

        data.hypothesis.predictions.forEach((pred, i) => {
            if (y > 260) { doc.addPage(); y = 25; }
            doc.setFillColor(240, 253, 244);
            const predLines = doc.splitTextToSize(cleanText(pred), contentWidth - 20);
            doc.roundedRect(leftMargin, y - 3, contentWidth, predLines.length * 4 + 8, 2, 2, 'F');
            doc.setTextColor(22, 163, 74);
            doc.text(`${i + 1}.`, leftMargin + 3, y + 3);
            doc.setTextColor(31, 41, 55);
            doc.text(predLines, leftMargin + 12, y + 3);
            y += predLines.length * 4 + 12;
        });
        y += 5;
    }

    // Minimal Tests
    if (data.hypothesis.minimal_tests && data.hypothesis.minimal_tests.length > 0) {
        if (y > 200) { doc.addPage(); y = 25; }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(139, 92, 246);
        doc.text('Tests Minimaux Recommandés', leftMargin, y);
        y += 10;

        data.hypothesis.minimal_tests.forEach((test, i) => {
            if (y > 260) { doc.addPage(); y = 25; }
            doc.setFillColor(245, 243, 255);
            doc.roundedRect(leftMargin, y - 3, contentWidth, 20, 2, 2, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(139, 92, 246);
            doc.text(`[${test.type || 'TEST'}]`, leftMargin + 3, y + 5);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(31, 41, 55);
            const testLines = doc.splitTextToSize(test.description, contentWidth - 30);
            doc.text(testLines, leftMargin + 25, y + 5);
            y += 25;
        });
        y += 5;
    }

    // Risks & Confounders
    if (data.hypothesis.risks_confounders && data.hypothesis.risks_confounders.length > 0) {
        if (y > 200) { doc.addPage(); y = 25; }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(245, 158, 11);
        doc.text('Risques et Facteurs de Confusion', leftMargin, y);
        y += 10;

        data.hypothesis.risks_confounders.forEach((risk, i) => {
            if (y > 270) { doc.addPage(); y = 25; }
            doc.setFillColor(255, 251, 235);
            const riskLines = doc.splitTextToSize(cleanText(risk), contentWidth - 15);
            doc.roundedRect(leftMargin, y - 3, contentWidth, riskLines.length * 4 + 6, 2, 2, 'F');
            doc.setTextColor(180, 83, 9);
            doc.text('⚠', leftMargin + 3, y + 3);
            doc.setTextColor(31, 41, 55);
            doc.setFontSize(9);
            doc.text(riskLines, leftMargin + 10, y + 3);
            y += riskLines.length * 4 + 10;
        });
    }

    // Drug Repurposing Candidates
    if (data.hypothesis.drug_repurposing_candidates && data.hypothesis.drug_repurposing_candidates.length > 0) {
        if (y > 230) { doc.addPage(); y = 25; }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(14, 165, 233); // Light Blue
        doc.text('Candidats au Repositionnement', leftMargin, y);
        y += 10;

        data.hypothesis.drug_repurposing_candidates.forEach((drug, i) => {
            if (y > 270) { doc.addPage(); y = 25; }
            doc.setFillColor(240, 249, 255);
            doc.roundedRect(leftMargin, y - 3, contentWidth, 12, 2, 2, 'F');
            doc.setTextColor(2, 132, 199);
            doc.setFontSize(10);
            doc.text('💊', leftMargin + 3, y + 5);
            doc.setTextColor(31, 41, 55);
            doc.text(drug, leftMargin + 12, y + 5);
            y += 18;
        });
    }

    // ========================================
    // P1: SAFETY & ETHICS SECTION
    // ========================================
    if (y > 160) { doc.addPage(); y = 25; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(220, 38, 38);
    doc.text('Safety & Ethics', leftMargin, y);
    y += 10;

    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(1);
    doc.line(leftMargin, y - 3, leftMargin + 60, y - 3);
    y += 5;

    // Risk Register
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(180, 83, 9);
    doc.text('Risk Register', leftMargin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(31, 41, 55);

    const safetyRisks = [
        { risk: 'Interactions (DDI)', mitigation: 'Screening PK pre-intervention' },
        { risk: 'Toxicite hemato', mitigation: 'NFS hebdo, alertes' },
        { risk: 'Auto-immun (ANCA)', mitigation: 'ANCA baseline + suivi' },
        { risk: 'Sur-immunosuppression', mitigation: 'Adaptation posologie' }
    ];

    safetyRisks.forEach((item, i) => {
        if (y > 260) { doc.addPage(); y = 25; }

        doc.setFillColor(254, 243, 199);
        doc.roundedRect(leftMargin, y - 2, contentWidth, 14, 2, 2, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(146, 64, 14);
        doc.text(`${i + 1}. ${item.risk}`, leftMargin + 3, y + 4);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 53, 15);
        doc.setFontSize(8);
        doc.text(`Mitigation: ${item.mitigation}`, leftMargin + 8, y + 10);
        doc.setFontSize(9);

        y += 18;
    });

    y += 8;

    // Stopping Rules
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(220, 38, 38);
    doc.text('Stopping Rules', leftMargin, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    const stoppingRules = [
        'Neutropenie < 1000/mm3',
        'ANCA x3 baseline + symptomes',
        'Insuffisance renale aigue',
        'Evenement indesirable grave'
    ];

    stoppingRules.forEach((rule) => {
        if (y > 270) { doc.addPage(); y = 25; }
        doc.setFillColor(254, 226, 226);
        doc.roundedRect(leftMargin, y - 2, contentWidth, 8, 2, 2, 'F');
        doc.setTextColor(185, 28, 28);
        doc.text(`STOP si: ${rule}`, leftMargin + 3, y + 4);
        doc.setTextColor(31, 41, 55);
        y += 12;
    });

    y += 10;


    // ========================================
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 2; i <= pageCount; i++) { // Skip cover page
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(107, 114, 128);
        doc.text(
            `MediMind Discovery Platform | ${data.hypothesis.hypothesis_id} | Page ${i - 1}/${pageCount - 1}`,
            pageWidth / 2,
            pageHeight - 10,
            { align: 'center' }
        );
    }

    // Save
    const filename = `congress_report_${data.hypothesis.hypothesis_id}_${data.date.replace(/[^0-9]/g, '')}.pdf`;
    doc.save(filename);
}
