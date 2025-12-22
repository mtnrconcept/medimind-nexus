// Committee-Grade Discovery Platform PDF Export
// Generates audit-ready reports for scientific committees and IRBs

import jsPDF from 'jspdf';

// ============================================
// INTERFACES
// ============================================

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

interface DetailedAnalysis {
    background_context?: string;
    pathophysiology?: string;
    [key: string]: any;
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

    // Legacy Fields
    detailed_analysis?: DetailedAnalysis;
    predictions?: string[];
    scores?: {
        novelty: number;
        plausibility: number;
        strength: number;
        feasibility: number;
        impact: number;
        total: number;
    };
}

interface PDFData {
    hypothesis: Hypothesis;
    query: string;
    date: string;
    author?: string;
    institution?: string;
    searchResults: any[];
    evidencePack?: {
        paper_count?: number;
        entities?: any[];
        relations?: any[];
    };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function cleanText(text: string | undefined): string {
    if (!text) return '';
    return text
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/__/g, '')
        .replace(/_/g, '')
        .replace(/^#+\s+/gm, '')
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/–/g, '-')
        .replace(/—/g, '-')
        .replace(/"/g, '"')
        .replace(/"/g, '"')
        .replace(/'/g, "'")
        .replace(/'/g, "'")
        .replace(/μM/g, 'microM')
        .replace(/µM/g, 'microM')
        .replace(/α/g, 'alpha')
        .replace(/β/g, 'beta')
        .replace(/γ/g, 'gamma')
        .replace(/δ/g, 'delta')
        .replace(/Δ/g, 'Delta')
        .replace(/^\s*[-•]\s*/gm, '')
        .trim();
}

// ============================================
// MAIN EXPORT FUNCTION
// ============================================

export function generateCommitteeGradePDF(data: PDFData): void {
    const doc = new jsPDF();
    doc.setLanguage("fr");

    let y = 20;
    const leftMargin = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - 40;

    // ========================================
    // PAGE 1: COVER PAGE
    // ========================================

    // Header
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageWidth, 60, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('MEDIMIND DISCOVERY', pageWidth / 2, 25, { align: 'center' });

    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text('Rapport de recherche - Hypothèse mécanistique', pageWidth / 2, 40, { align: 'center' });

    // Main title
    doc.setTextColor(30, 58, 138);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    const titleLines = doc.splitTextToSize(cleanText(data.query), contentWidth - 40);
    doc.text(titleLines, pageWidth / 2, 90, { align: 'center' });

    // Metadata box
    y = 120 + titleLines.length * 8;
    doc.setFillColor(249, 250, 251);
    doc.roundedRect(leftMargin, y, contentWidth, 50, 3, 3, 'F');

    doc.setTextColor(31, 41, 55);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Identifiant:', leftMargin + 10, y + 15);
    doc.setFont('helvetica', 'normal');
    doc.text(data.hypothesis.hypothesis_id, leftMargin + 45, y + 15);

    doc.setFont('helvetica', 'bold');
    doc.text('Date:', leftMargin + 10, y + 25);
    doc.setFont('helvetica', 'normal');
    doc.text(data.date, leftMargin + 45, y + 25);

    doc.setFont('helvetica', 'bold');
    doc.text('Statut:', leftMargin + 10, y + 35);
    doc.setFont('helvetica', 'normal');
    doc.text('Piste de recherche (usage non clinique)', leftMargin + 45, y + 35);

    // Warning box
    y += 60;
    doc.setFillColor(255, 243, 224);
    doc.roundedRect(leftMargin, y, contentWidth, 30, 3, 3, 'F');
    doc.setTextColor(194, 65, 12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('⚠ Avertissement', leftMargin + 5, y + 10);
    doc.setFont('helvetica', 'normal');
    const warningText = 'Ce rapport est généré par IA à des fins exploratoires. Traçabilité améliorée par rapport aux versions précédentes. Validation manuelle requise avant toute utilisation clinique.';
    const warningLines = doc.splitTextToSize(warningText, contentWidth - 10);
    doc.text(warningLines, leftMargin + 5, y + 17);

    // Footer
    doc.setTextColor(107, 114, 128);
    doc.setFontSize(9);
    doc.text('Généré par MediMind Discovery Platform', pageWidth / 2, pageHeight - 20, { align: 'center' });
    doc.text(data.date, pageWidth / 2, pageHeight - 12, { align: 'center' });

    // ========================================
    // PAGE 2: EXECUTIVE SUMMARY + GO/NO-GO
    // ========================================
    doc.addPage();
    y = 25;

    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageWidth, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('RÉSUMÉ EXÉCUTIF', leftMargin, 10);
    doc.text(data.hypothesis.hypothesis_id, pageWidth - 50, 10);

    doc.setTextColor(30, 58, 138);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('1. Résumé Exécutif', leftMargin, y);
    y += 12;

    const execSum = data.hypothesis.executive_summary;

    if (execSum) {
        // Context
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(31, 41, 55);
        doc.text('Contexte clinique', leftMargin, y);
        y += 7;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const contextLines = doc.splitTextToSize(cleanText(execSum.context), contentWidth);
        doc.text(contextLines, leftMargin, y);
        y += contextLines.length * 4 + 8;

        // Central Hypothesis
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Hypothèse centrale', leftMargin, y);
        y += 7;

        doc.setFillColor(239, 246, 255);
        const hypLines = doc.splitTextToSize(cleanText(execSum.central_hypothesis_operational), contentWidth - 10);
        doc.roundedRect(leftMargin, y - 3, contentWidth, hypLines.length * 4 + 10, 3, 3, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(hypLines, leftMargin + 5, y + 2);
        y += hypLines.length * 4 + 15;

        // Scope Decisions
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Décisions de périmètre', leftMargin, y);
        y += 7;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const scopeLines = doc.splitTextToSize(cleanText(execSum.scope_decisions), contentWidth);
        doc.text(scopeLines, leftMargin, y);
        y += scopeLines.length * 4 + 10;

        // GO/NO-GO TABLE
        if (execSum.go_nogo_table && execSum.go_nogo_table.length > 0) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text('Livrables expérimentaux minimaux (Tableau Go/No-Go)', leftMargin, y);
            y += 10;

            // Table header
            doc.setFillColor(30, 58, 138);
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.rect(leftMargin, y, 30, 8, 'F');
            doc.text('Bloc', leftMargin + 2, y + 5);
            doc.rect(leftMargin + 30, y, 50, 8, 'F');
            doc.text('Design minimal', leftMargin + 32, y + 5);
            doc.rect(leftMargin + 80, y, 45, 8, 'F');
            doc.text('Endpoint primaire', leftMargin + 82, y + 5);
            doc.rect(leftMargin + 125, y, 45, 8, 'F');
            doc.text('Signal Go/No-Go', leftMargin + 127, y + 5);
            y += 8;

            // Table rows
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(31, 41, 55);
            execSum.go_nogo_table.forEach((row, i) => {
                const rowColor = i % 2 === 0 ? 249 : 255;
                doc.setFillColor(rowColor, rowColor + 1, rowColor + 1);

                const designLines = doc.splitTextToSize(cleanText(row.minimal_design), 48);
                const endpointLines = doc.splitTextToSize(cleanText(row.primary_endpoint), 43);
                const signalLines = doc.splitTextToSize(cleanText(row.go_nogo_signal), 43);
                const rowHeight = Math.max(designLines.length, endpointLines.length, signalLines.length) * 3.5 + 4;

                doc.rect(leftMargin, y, 30, rowHeight, 'F');
                doc.rect(leftMargin + 30, y, 50, rowHeight, 'F');
                doc.rect(leftMargin + 80, y, 45, rowHeight, 'F');
                doc.rect(leftMargin + 125, y, 45, rowHeight, 'F');

                doc.setFontSize(7);
                doc.text(row.block, leftMargin + 2, y + 3);
                doc.text(designLines, leftMargin + 32, y + 3);
                doc.text(endpointLines, leftMargin + 82, y + 3);
                doc.text(signalLines, leftMargin + 127, y + 3);

                y += rowHeight;
            });
        }
    } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(107, 114, 128);
        doc.text('Executive Summary non disponible - structure en cours de mise à jour', leftMargin, y);
    }

    // ========================================
    // PAGE 3: CLINICAL SCOPE
    // ========================================
    doc.addPage();
    y = 25;

    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageWidth, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('PÉRIMÈTRE CLINIQUE', leftMargin, 10);

    doc.setTextColor(30, 58, 138);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('2. Périmètre clinique et définitions', leftMargin, y);
    y += 12;

    const clinScope = data.hypothesis.clinical_scope;

    if (clinScope) {
        // Operational Definitions
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(31, 41, 55);
        doc.text('Définitions opérationnelles', leftMargin, y);
        y += 7;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const defLines = doc.splitTextToSize(cleanText(clinScope.operational_definitions), contentWidth);
        doc.text(defLines, leftMargin, y);
        y += defLines.length * 4 + 10;

        // Recommended Comparators
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Comparateurs recommandés', leftMargin, y);
        y += 7;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const compLines = doc.splitTextToSize(cleanText(clinScope.recommended_comparators), contentWidth);
        doc.text(compLines, leftMargin, y);
    } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(107, 114, 128);
        doc.text('Périmètre clinique non disponible', leftMargin, y);
    }

    // ========================================
    // PAGE 4: EVIDENCE SNAPSHOT (OXFORD/EBM)
    // ========================================
    doc.addPage();
    y = 25;

    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageWidth, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text("SNAPSHOT DE L'ÉVIDENCE", leftMargin, 10);

    doc.setTextColor(30, 58, 138);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text("3. Snapshot de l'évidence (Ledger synthétique)", leftMargin, y);
    y += 12;

    const evidence = data.hypothesis.evidence_snapshot;

    if (evidence && evidence.length > 0) {
        // Table header
        doc.setFillColor(239, 246, 255);
        doc.roundedRect(leftMargin, y - 2, contentWidth, 10, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(31, 41, 55);
        doc.text('Claim (résumé)', leftMargin + 2, y + 4);
        doc.text('Contexte/Pop', leftMargin + 60, y + 4);
        doc.text('Oxford', leftMargin + 95, y + 4);
        doc.text('Signal/effet', leftMargin + 112, y + 4);
        doc.text('Réf', leftMargin + 155, y + 4);
        y += 12;

        // Table rows
        evidence.slice(0, 10).forEach((row, i) => {
            const rowColor = i % 2 === 0 ? 255 : 249;
            doc.setFillColor(rowColor, rowColor + 1, rowColor + 1);

            const claimLines = doc.splitTextToSize(cleanText(row.claim), 56);
            const contextLines = doc.splitTextToSize(cleanText(row.context_population), 33);
            const signalLines = doc.splitTextToSize(cleanText(row.signal_effect), 41);
            const refText = row.key_references.slice(0, 2).join(', ');
            const refLines = doc.splitTextToSize(refText, 13);

            const rowHeight = Math.max(claimLines.length, contextLines.length, signalLines.length, refLines.length) * 3 + 6;

            if (y + rowHeight > 270) {
                doc.addPage();
                y = 25;
            }

            doc.roundedRect(leftMargin, y - 2, contentWidth, rowHeight, 1, 1, 'F');

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(31, 41, 55);
            doc.text(claimLines, leftMargin + 2, y + 2);
            doc.text(contextLines, leftMargin + 60, y + 2);

            // Oxford level with color
            const oxfordColors: Record<string, number[]> = {
                '1a': [34, 197, 94],
                '1b': [34, 197, 94],
                '2a': [251, 191, 36],
                '2b': [251, 191, 36],
                '3': [249, 115, 22],
                '4': [239, 68, 68],
                '5': [156, 163, 175]
            };
            const color = oxfordColors[row.oxford_level] || [107, 114, 128];
            doc.setTextColor(color[0], color[1], color[2]);
            doc.setFont('helvetica', 'bold');
            doc.text(row.oxford_level, leftMargin + 95, y + 4);

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(31, 41, 55);
            doc.text(signalLines, leftMargin + 112, y + 2);
            doc.setFontSize(6);
            doc.text(refLines, leftMargin + 155, y + 2);

            y += rowHeight + 2;
        });
    } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(107, 114, 128);
        doc.text('Evidence Snapshot non disponible', leftMargin, y);
    }

    // ========================================
    // PAGE 5: RIVAL HYPOTHESES + DAG
    // ========================================
    doc.addPage();
    y = 25;

    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageWidth, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('HYPOTHÈSES MÉCANISTIQUES', leftMargin, 10);

    doc.setTextColor(30, 58, 138);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('4. Hypothèse mécanistique et hypothèses rivales', leftMargin, y);
    y += 12;

    const rivals = data.hypothesis.rival_hypotheses;

    if (rivals) {
        // H1 - Main
        doc.setFillColor(209, 250, 229);
        doc.roundedRect(leftMargin, y, contentWidth, 8, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(22, 163, 74);
        doc.text('H1 (Principale)', leftMargin + 3, y + 5);
        y += 10;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(31, 41, 55);
        const h1Lines = doc.splitTextToSize(cleanText(rivals.h1_main), contentWidth - 5);
        doc.text(h1Lines, leftMargin + 3, y);
        y += h1Lines.length * 4 + 8;

        // H2 - Secondary
        doc.setFillColor(224, 242, 254);
        doc.roundedRect(leftMargin, y, contentWidth, 8, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(14, 165, 233);
        doc.text('H2 (Secondaire)', leftMargin + 3, y + 5);
        y += 10;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(31, 41, 55);
        const h2Lines = doc.splitTextToSize(cleanText(rivals.h2_secondary), contentWidth - 5);
        doc.text(h2Lines, leftMargin + 3, y);
        y += h2Lines.length * 4 + 8;

        // H0 - Null
        doc.setFillColor(243, 244, 246);
        doc.roundedRect(leftMargin, y, contentWidth, 8, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(107, 114, 128);
        doc.text('H0 (Nulle)', leftMargin + 3, y + 5);
        y += 10;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(31, 41, 55);
        const h0Lines = doc.splitTextToSize(cleanText(rivals.h0_null), contentWidth - 5);
        doc.text(h0Lines, leftMargin + 3, y);
        y += h0Lines.length * 4 + 8;

        // H3 - Rival
        doc.setFillColor(254, 243, 199);
        doc.roundedRect(leftMargin, y, contentWidth, 8, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(245, 158, 11);
        doc.text('H3 (Rivale 1)', leftMargin + 3, y + 5);
        y += 10;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(31, 41, 55);
        const h3Lines = doc.splitTextToSize(cleanText(rivals.h3_rival), contentWidth - 5);
        doc.text(h3Lines, leftMargin + 3, y);
        y += h3Lines.length * 4 + 8;

        // H4 - Rival Toxicity
        doc.setFillColor(254, 226, 226);
        doc.roundedRect(leftMargin, y, contentWidth, 8, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(239, 68, 68);
        doc.text('H4 (Rivale toxicité)', leftMargin + 3, y + 5);
        y += 10;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(31, 41, 55);
        const h4Lines = doc.splitTextToSize(cleanText(rivals.h4_rival_toxicity), contentWidth - 5);
        doc.text(h4Lines, leftMargin + 3, y);
        y += h4Lines.length * 4 + 12;

        // DAG
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(30, 58, 138);
        doc.text('Carte causale (DAG)', leftMargin, y);
        y += 8;

        doc.setFillColor(249, 250, 251);
        const dagLines = doc.splitTextToSize(cleanText(rivals.dag_textual), contentWidth - 10);
        doc.roundedRect(leftMargin, y - 2, contentWidth, dagLines.length * 4 + 10, 3, 3, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(31, 41, 55);
        doc.text(dagLines, leftMargin + 5, y + 2);
    } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(107, 114, 128);
        doc.text('Hypothèses rivales non disponibles', leftMargin, y);
    }

    // ========================================
    // PAGE 6: MECHANISTIC MODEL
    // ========================================
    doc.addPage();
    y = 25;

    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageWidth, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('MODÈLE MÉCANISTIQUE', leftMargin, 10);

    doc.setTextColor(30, 58, 138);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('5. Modèle mécanistique (PK/PD, organes, cibles)', leftMargin, y);
    y += 12;

    const mechModel = data.hypothesis.mechanistic_model;

    if (mechModel) {
        // PK/PD Robust
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(31, 41, 55);
        doc.text('Éléments robustes (PK/PD)', leftMargin, y);
        y += 7;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const robustLines = doc.splitTextToSize(cleanText(mechModel.pkpd_robust), contentWidth);
        doc.text(robustLines, leftMargin, y);
        y += robustLines.length * 4 + 10;

        // PK/PD Unknown
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Éléments inconnus (à tester)', leftMargin, y);
        y += 7;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const unknownLines = doc.splitTextToSize(cleanText(mechModel.pkpd_unknown), contentWidth);
        doc.text(unknownLines, leftMargin, y);
        y += unknownLines.length * 4 + 10;

        // Organ-Risk Mapping Table
        if (mechModel.organ_risk_mapping && mechModel.organ_risk_mapping.length > 0) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text('Cartographie Organes-Risques', leftMargin, y);
            y += 10;

            // Table header
            doc.setFillColor(239, 246, 255);
            doc.roundedRect(leftMargin, y - 2, contentWidth, 10, 2, 2, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.text('Organe/Système', leftMargin + 2, y + 4);
            doc.text('Rôle', leftMargin + 60, y + 4);
            doc.text('Risque/Point de contrôle', leftMargin + 110, y + 4);
            y += 12;

            // Table rows
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            mechModel.organ_risk_mapping.forEach((row, i) => {
                const rowColor = i % 2 === 0 ? 255 : 249;
                doc.setFillColor(rowColor, rowColor + 1, rowColor + 1);

                const roleLines = doc.splitTextToSize(cleanText(row.role), 48);
                const riskLines = doc.splitTextToSize(cleanText(row.risk_checkpoint), 58);
                const rowHeight = Math.max(roleLines.length, riskLines.length) * 3.5 + 6;

                if (y + rowHeight > 270) {
                    doc.addPage();
                    y = 25;
                }

                doc.roundedRect(leftMargin, y - 2, contentWidth, rowHeight, 1, 1, 'F');
                doc.text(row.organ_system, leftMargin + 2, y + 3);
                doc.text(roleLines, leftMargin + 60, y + 3);
                doc.text(riskLines, leftMargin + 110, y + 3);

                y += rowHeight + 2;
            });
        }
    } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(107, 114, 128);
        doc.text('Modèle mécanistique non disponible', leftMargin, y);
    }

    // ========================================
    // PAGE 7: RISKS & MONITORING
    // ========================================
    doc.addPage();
    y = 25;

    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, pageWidth, 15, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('RISQUES & MONITORING', leftMargin, 10);

    doc.setTextColor(30, 58, 138);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('6. Risques, facteurs de confusion et plan de monitoring', leftMargin, y);
    y += 12;

    const risksMonitor = data.hypothesis.risks_monitoring;

    if (risksMonitor) {
        // Key Risks
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(31, 41, 55);
        doc.text('Risques clés identifiés', leftMargin, y);
        y += 7;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        risksMonitor.key_risks.forEach(risk => {
            doc.text(`• ${cleanText(risk)}`, leftMargin + 5, y);
            y += 5;
        });
        y += 5;

        // Monitoring Table
        if (risksMonitor.monitoring_table && risksMonitor.monitoring_table.length > 0) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.text('Tableau de monitoring minimal', leftMargin, y);
            y += 10;

            // Table header
            doc.setFillColor(239, 246, 255);
            doc.roundedRect(leftMargin, y - 2, contentWidth, 10, 2, 2, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.text('Paramètre', leftMargin + 2, y + 4);
            doc.text('Fréquence', leftMargin + 50, y + 4);
            doc.text("Seuil d'action", leftMargin + 95, y + 4);
            doc.text('Action requise', leftMargin + 135, y + 4);
            y += 12;

            // Table rows
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            risksMonitor.monitoring_table.forEach((row, i) => {
                const rowColor = i % 2 === 0 ? 255 : 249;
                doc.setFillColor(rowColor, rowColor + 1, rowColor + 1);

                const paramLines = doc.splitTextToSize(cleanText(row.parameter), 46);
                const freqLines = doc.splitTextToSize(cleanText(row.frequency), 43);
                const thresholdLines = doc.splitTextToSize(cleanText(row.action_threshold), 38);
                const actionLines = doc.splitTextToSize(cleanText(row.required_action), 33);
                const rowHeight = Math.max(paramLines.length, freqLines.length, thresholdLines.length, actionLines.length) * 3 + 6;

                if (y + rowHeight > 270) {
                    doc.addPage();
                    y = 25;
                }

                doc.roundedRect(leftMargin, y - 2, contentWidth, rowHeight, 1, 1, 'F');
                doc.text(paramLines, leftMargin + 2, y + 2);
                doc.text(freqLines, leftMargin + 50, y + 2);
                doc.text(thresholdLines, leftMargin + 95, y + 2);
                doc.text(actionLines, leftMargin + 135, y + 2);

                y += rowHeight + 2;
            });

            y += 8;
        }

        // Pharmacogenetic Recommendations
        if (risksMonitor.pharmacogenetic_recommendations) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(31, 41, 55);
            doc.text('Recommandations pharmacogénétiques', leftMargin, y);
            y += 7;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            const pharmaLines = doc.splitTextToSize(cleanText(risksMonitor.pharmacogenetic_recommendations), contentWidth);
            doc.text(pharmaLines, leftMargin, y);
        }
    } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(107, 114, 128);
        doc.text('Plan de monitoring non disponible', leftMargin, y);
    }

    // ========================================
    // FOOTER ON ALL PAGES
    // ========================================
    const pageCount = doc.internal.pages.length - 1;
    for (let i = 2; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setTextColor(107, 114, 128);
        doc.setFontSize(8);
        doc.text(`Page ${i}/${pageCount}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        doc.text(data.hypothesis.hypothesis_id, pageWidth - 25, pageHeight - 10, { align: 'right' });
    }

    // Save PDF
    const filename = `committee_report_${data.hypothesis.hypothesis_id}_${data.date.replace(/[^0-9]/g, '')}.pdf`;
    doc.save(filename);
}
