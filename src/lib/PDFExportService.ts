/**
 * PDFExportService - PDF Generation for Patient Reports
 * 
 * Generates professional medical PDF reports including:
 * - Patient summary
 * - Vital signs and lab results
 * - Active alerts
 * - AI recommendations with validation status
 * - Timeline of events
 * 
 * Uses jspdf for PDF generation with custom templates
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ============================================
// TYPES
// ============================================

export interface PatientExportData {
    patient: {
        id: string;
        patientId: string;
        firstName?: string;
        lastName?: string;
        name?: string;
        age: number;
        gender: string;
        nationality?: string;
        heightCm: number;
        weightKg: number;
        dateOfBirth?: string;
        email?: string;
        phone?: string;
        address?: string;
        city?: string;
        postalCode?: string;
    };
    pathologies?: Array<{
        name: string;
        status: string;
        severity?: string;
    }>;
    // Complete medical history
    medicalHistory?: Array<{
        name: string;
        date: string;
        ageAtDiagnosis?: string;
        status: 'resolved' | 'chronic' | 'active' | string;
        icdCode?: string;
    }>;
    vaccines?: Array<{
        name: string;
        date: string;
        lot?: string;
        booster?: string;
    }>;
    accidents?: Array<{
        type: string;
        date: string;
        description: string;
        severity: 'minor' | 'moderate' | 'severe' | string;
        sequelae?: string;
    }>;
    labResults?: Record<string, number | undefined>;
    alerts?: Array<{
        level: string;
        title: string;
        description: string;
        action?: string;
    }>;
    recommendations?: Array<{
        type: string;
        title: string;
        description: string;
        status: string;
        reviewedAt?: string;
        reviewerNotes?: string;
    }>;
    treatment?: string;
    medicalNotes?: string;
}

export interface ExportOptions {
    sections: {
        summary: boolean;
        demographics: boolean;
        vitals: boolean;
        labResults: boolean;
        alerts: boolean;
        recommendations: boolean;
        treatment: boolean;
        notes: boolean;
        medicalHistory: boolean;
        vaccines: boolean;
        accidents: boolean;
    };
    dateRange?: {
        start: Date;
        end: Date;
    };
    includeConfidential: boolean;
    language: 'fr' | 'en';
    format: 'A4' | 'Letter';
}

// ============================================
// CONSTANTS
// ============================================

const COLORS = {
    primary: [0, 102, 204] as [number, number, number],
    secondary: [102, 102, 102] as [number, number, number],
    critical: [220, 53, 69] as [number, number, number],
    warning: [255, 193, 7] as [number, number, number],
    success: [40, 167, 69] as [number, number, number],
    muted: [150, 150, 150] as [number, number, number],
    lightBg: [248, 249, 250] as [number, number, number],
};

const LABELS = {
    fr: {
        title: 'Rapport Patient MediMind Nexus',
        summary: 'Résumé du Patient',
        demographics: 'Données Démographiques',
        vitals: 'Signes Vitaux',
        labResults: 'Résultats de Laboratoire',
        alerts: 'Alertes Actives',
        recommendations: 'Recommandations IA',
        treatment: 'Traitement en Cours',
        notes: 'Notes Médicales',
        medicalHistory: 'Historique Médical',
        vaccines: 'Vaccins',
        accidents: 'Accidents et Incidents',
        generatedAt: 'Généré le',
        page: 'Page',
        of: 'sur',
        age: 'Âge',
        gender: 'Genre',
        nationality: 'Nationalité',
        height: 'Taille',
        weight: 'Poids',
        bmi: 'IMC',
        dateOfBirth: 'Date de naissance',
        email: 'Email',
        phone: 'Téléphone',
        address: 'Adresse',
        male: 'Homme',
        female: 'Femme',
        pathologies: 'Pathologies',
        status: 'Statut',
        pending: 'En attente',
        accepted: 'Acceptée',
        rejected: 'Rejetée',
        modified: 'Modifiée',
        resolved: 'Résolu',
        chronic: 'Chronique',
        active: 'Actif',
        minor: 'Mineur',
        moderate: 'Modéré',
        severe: 'Grave',
        icdCode: 'Code CIM',
        lot: 'Lot',
        booster: 'Rappel',
        sequelae: 'Séquelles',
        reviewerNotes: 'Notes du validateur',
        confidential: 'CONFIDENTIEL - DONNÉES MÉDICALES',
        noData: 'Aucune donnée disponible',
    },
    en: {
        title: 'MediMind Nexus Patient Report',
        summary: 'Patient Summary',
        demographics: 'Demographics',
        vitals: 'Vital Signs',
        labResults: 'Laboratory Results',
        alerts: 'Active Alerts',
        recommendations: 'AI Recommendations',
        treatment: 'Current Treatment',
        notes: 'Medical Notes',
        medicalHistory: 'Medical History',
        vaccines: 'Vaccines',
        accidents: 'Accidents and Incidents',
        generatedAt: 'Generated on',
        page: 'Page',
        of: 'of',
        age: 'Age',
        gender: 'Gender',
        nationality: 'Nationality',
        height: 'Height',
        weight: 'Weight',
        bmi: 'BMI',
        dateOfBirth: 'Date of Birth',
        email: 'Email',
        phone: 'Phone',
        address: 'Address',
        male: 'Male',
        female: 'Female',
        pathologies: 'Pathologies',
        status: 'Status',
        pending: 'Pending',
        accepted: 'Accepted',
        rejected: 'Rejected',
        modified: 'Modified',
        resolved: 'Resolved',
        chronic: 'Chronic',
        active: 'Active',
        minor: 'Minor',
        moderate: 'Moderate',
        severe: 'Severe',
        icdCode: 'ICD Code',
        lot: 'Lot',
        booster: 'Booster',
        sequelae: 'Sequelae',
        reviewerNotes: 'Reviewer notes',
        confidential: 'CONFIDENTIAL - MEDICAL DATA',
        noData: 'No data available',
    },
};

const LAB_RESULT_LABELS: Record<string, { fr: string; en: string; unit: string }> = {
    // Basic vitals
    glucose_mg_dl: { fr: 'Glycémie', en: 'Glucose', unit: 'mg/dL' },
    blood_pressure_sys: { fr: 'TA Systolique', en: 'Systolic BP', unit: 'mmHg' },
    blood_pressure_dia: { fr: 'TA Diastolique', en: 'Diastolic BP', unit: 'mmHg' },
    temperature_c: { fr: 'Température', en: 'Temperature', unit: '°C' },

    // Hematology
    hemoglobin_g_dl: { fr: 'Hémoglobine', en: 'Hemoglobin', unit: 'g/dL' },
    platelets_k_ul: { fr: 'Plaquettes', en: 'Platelets', unit: 'K/µL' },
    wbc_k_ul: { fr: 'Leucocytes', en: 'WBC', unit: 'K/µL' },

    // Renal function
    creatinine_mg_dl: { fr: 'Créatinine', en: 'Creatinine', unit: 'mg/dL' },
    gfr_ml_min: { fr: 'DFG', en: 'GFR', unit: 'mL/min' },

    // Electrolytes
    potassium_meq_l: { fr: 'Potassium', en: 'Potassium', unit: 'mEq/L' },
    sodium_meq_l: { fr: 'Sodium', en: 'Sodium', unit: 'mEq/L' },
    chloride_meq_l: { fr: 'Chlorure', en: 'Chloride', unit: 'mEq/L' },
    calcium_mg_dl: { fr: 'Calcium', en: 'Calcium', unit: 'mg/dL' },

    // Liver function
    alt_u_l: { fr: 'ALAT', en: 'ALT', unit: 'U/L' },
    ast_u_l: { fr: 'ASAT', en: 'AST', unit: 'U/L' },
    bilirubin_mg_dl: { fr: 'Bilirubine', en: 'Bilirubin', unit: 'mg/dL' },

    // Lipid panel
    cholesterol_total_mg_dl: { fr: 'Cholestérol total', en: 'Total Cholesterol', unit: 'mg/dL' },
    cholesterol_hdl_mg_dl: { fr: 'HDL', en: 'HDL', unit: 'mg/dL' },
    cholesterol_ldl_mg_dl: { fr: 'LDL', en: 'LDL', unit: 'mg/dL' },
    triglycerides_mg_dl: { fr: 'Triglycérides', en: 'Triglycerides', unit: 'mg/dL' },

    // Inflammatory markers
    crp_mg_l: { fr: 'CRP', en: 'CRP', unit: 'mg/L' },
    esr_mm_h: { fr: 'VS', en: 'ESR', unit: 'mm/h' },

    // Respiratory
    spo2_percent: { fr: 'SpO2', en: 'SpO2', unit: '%' },
    spirometry_fev1_percent: { fr: 'VEMS', en: 'FEV1', unit: '%' },
    peak_flow_l_min: { fr: 'DEP', en: 'Peak Flow', unit: 'L/min' },
    feNO_ppb: { fr: 'FeNO', en: 'FeNO', unit: 'ppb' },

    // Allergy
    ige_total_ku_l: { fr: 'IgE totales', en: 'Total IgE', unit: 'kU/L' },
    eosinophils_percent: { fr: 'Éosinophiles', en: 'Eosinophils', unit: '%' },

    // Bone/Vitamins
    vitamin_d_ng_ml: { fr: 'Vitamine D', en: 'Vitamin D', unit: 'ng/mL' },
    bone_density_t_score_spine: { fr: 'DMO colonne', en: 'BMD Spine', unit: 'T-score' },
    bone_density_t_score_hip: { fr: 'DMO hanche', en: 'BMD Hip', unit: 'T-score' },

    // Thyroid
    tsh_miu_l: { fr: 'TSH', en: 'TSH', unit: 'mIU/L' },
    t4_ng_dl: { fr: 'T4', en: 'T4', unit: 'ng/dL' },

    // Cardiac
    troponin_ng_ml: { fr: 'Troponine', en: 'Troponin', unit: 'ng/mL' },
    bnp_pg_ml: { fr: 'BNP', en: 'BNP', unit: 'pg/mL' },

    // HbA1c
    hba1c_percent: { fr: 'HbA1c', en: 'HbA1c', unit: '%' },
};

// ============================================
// HELPER FUNCTIONS
// ============================================

const calculateBMI = (heightCm: number, weightKg: number): number => {
    if (!heightCm || !weightKg) return 0;
    const heightM = heightCm / 100;
    return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
};

const formatDate = (date: Date, lang: 'fr' | 'en'): string => {
    return date.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const getStatusLabel = (status: string, lang: 'fr' | 'en'): string => {
    const labels = LABELS[lang];
    switch (status.toLowerCase()) {
        case 'pending': return labels.pending;
        case 'accepted': return labels.accepted;
        case 'rejected': return labels.rejected;
        case 'modified': return labels.modified;
        default: return status;
    }
};

// ============================================
// PDF GENERATOR CLASS
// ============================================

export class PDFExportService {
    private doc: jsPDF;
    private currentY: number = 20;
    private pageWidth: number;
    private pageHeight: number;
    private margins = { top: 20, right: 15, bottom: 20, left: 15 };
    private labels: typeof LABELS.fr;
    private lang: 'fr' | 'en';

    constructor(options: ExportOptions) {
        this.lang = options.language;
        this.labels = LABELS[options.language];

        this.doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: options.format,
        });

        this.pageWidth = this.doc.internal.pageSize.getWidth();
        this.pageHeight = this.doc.internal.pageSize.getHeight();
    }

    private addHeader(): void {
        // Logo placeholder (could be replaced with actual logo)
        this.doc.setFillColor(...COLORS.primary);
        this.doc.rect(this.margins.left, 10, 8, 8, 'F');

        // Title
        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(16);
        this.doc.setTextColor(...COLORS.primary);
        this.doc.text(this.labels.title, this.margins.left + 12, 16);

        // Generation date
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(10);
        this.doc.setTextColor(...COLORS.secondary);
        this.doc.text(
            `${this.labels.generatedAt}: ${formatDate(new Date(), this.lang)}`,
            this.pageWidth - this.margins.right,
            16,
            { align: 'right' }
        );

        // Separator line
        this.doc.setDrawColor(...COLORS.primary);
        this.doc.setLineWidth(0.5);
        this.doc.line(this.margins.left, 22, this.pageWidth - this.margins.right, 22);

        this.currentY = 30;
    }

    private addFooter(pageNumber: number, totalPages: number): void {
        const footerY = this.pageHeight - 10;

        // Confidential notice
        this.doc.setFont('helvetica', 'italic');
        this.doc.setFontSize(8);
        this.doc.setTextColor(...COLORS.muted);
        this.doc.text(this.labels.confidential, this.margins.left, footerY);

        // Page number
        this.doc.text(
            `${this.labels.page} ${pageNumber} ${this.labels.of} ${totalPages}`,
            this.pageWidth - this.margins.right,
            footerY,
            { align: 'right' }
        );
    }

    private checkPageBreak(neededSpace: number): void {
        if (this.currentY + neededSpace > this.pageHeight - this.margins.bottom) {
            this.doc.addPage();
            this.currentY = this.margins.top;
        }
    }

    private addSectionTitle(title: string): void {
        this.checkPageBreak(15);

        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(12);
        this.doc.setTextColor(...COLORS.primary);
        this.doc.text(title, this.margins.left, this.currentY);

        this.doc.setDrawColor(...COLORS.lightBg);
        this.doc.setLineWidth(0.3);
        this.doc.line(
            this.margins.left,
            this.currentY + 2,
            this.pageWidth - this.margins.right,
            this.currentY + 2
        );

        this.currentY += 8;
    }

    private addText(text: string, indent: number = 0): void {
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(10);
        this.doc.setTextColor(0, 0, 0);

        const maxWidth = this.pageWidth - this.margins.left - this.margins.right - indent;
        const lines = this.doc.splitTextToSize(text, maxWidth);

        this.checkPageBreak(lines.length * 5);

        this.doc.text(lines, this.margins.left + indent, this.currentY);
        this.currentY += lines.length * 5;
    }

    private addKeyValue(key: string, value: string | number, indent: number = 0): void {
        this.checkPageBreak(6);

        this.doc.setFont('helvetica', 'bold');
        this.doc.setFontSize(10);
        this.doc.setTextColor(...COLORS.secondary);
        this.doc.text(`${key}:`, this.margins.left + indent, this.currentY);

        this.doc.setFont('helvetica', 'normal');
        this.doc.setTextColor(0, 0, 0);
        this.doc.text(String(value), this.margins.left + indent + 40, this.currentY);

        this.currentY += 6;
    }

    // Public method to generate the PDF
    public generate(data: PatientExportData, options: ExportOptions): Blob {
        this.addHeader();

        // Summary section
        if (options.sections.summary || options.sections.demographics) {
            this.addSectionTitle(this.labels.summary);

            if (data.patient.name) {
                this.addKeyValue('Patient', data.patient.name);
            }
            this.addKeyValue('ID', data.patient.patientId);
            this.addKeyValue(this.labels.age, `${data.patient.age} ans`);
            this.addKeyValue(
                this.labels.gender,
                data.patient.gender === 'M' ? this.labels.male : this.labels.female
            );
            if (data.patient.nationality) {
                this.addKeyValue(this.labels.nationality, data.patient.nationality);
            }
            this.addKeyValue(this.labels.height, `${data.patient.heightCm} cm`);
            this.addKeyValue(this.labels.weight, `${data.patient.weightKg} kg`);
            this.addKeyValue(this.labels.bmi, calculateBMI(data.patient.heightCm, data.patient.weightKg));

            this.currentY += 5;
        }

        // Pathologies
        if (data.pathologies && data.pathologies.length > 0) {
            this.addSectionTitle(this.labels.pathologies);

            const pathologyData = data.pathologies.map(p => [
                p.name,
                p.status || '-',
                p.severity || '-'
            ]);

            autoTable(this.doc, {
                startY: this.currentY,
                head: [['Pathologie', 'Statut', 'Sévérité']],
                body: pathologyData,
                theme: 'striped',
                headStyles: { fillColor: COLORS.primary },
                margin: { left: this.margins.left, right: this.margins.right },
            });

            this.currentY = (this.doc as any).lastAutoTable.finalY + 10;
        }

        // Alerts
        if (options.sections.alerts && data.alerts && data.alerts.length > 0) {
            this.addSectionTitle(this.labels.alerts);

            data.alerts.forEach(alert => {
                this.checkPageBreak(20);

                // Alert level indicator
                let levelColor = COLORS.muted;
                if (alert.level === 'CRITICAL') levelColor = COLORS.critical;
                else if (alert.level === 'WARNING') levelColor = COLORS.warning;

                this.doc.setFillColor(...levelColor);
                this.doc.circle(this.margins.left + 3, this.currentY - 1, 2, 'F');

                this.doc.setFont('helvetica', 'bold');
                this.doc.setFontSize(10);
                this.doc.setTextColor(0, 0, 0);
                this.doc.text(alert.title, this.margins.left + 8, this.currentY);
                this.currentY += 5;

                if (alert.description) {
                    this.addText(alert.description, 8);
                }

                if (alert.action) {
                    this.doc.setFont('helvetica', 'italic');
                    this.doc.setFontSize(9);
                    this.doc.setTextColor(...COLORS.primary);
                    this.doc.text(`→ ${alert.action}`, this.margins.left + 8, this.currentY);
                    this.currentY += 6;
                }

                this.currentY += 3;
            });
        }

        // Lab Results
        if (options.sections.labResults && data.labResults) {
            this.addSectionTitle(this.labels.labResults);

            const labData: string[][] = [];
            Object.entries(data.labResults).forEach(([key, value]) => {
                if (value !== undefined && LAB_RESULT_LABELS[key]) {
                    const label = LAB_RESULT_LABELS[key];
                    labData.push([
                        label[this.lang],
                        String(value),
                        label.unit
                    ]);
                }
            });

            if (labData.length > 0) {
                autoTable(this.doc, {
                    startY: this.currentY,
                    head: [['Paramètre', 'Valeur', 'Unité']],
                    body: labData,
                    theme: 'striped',
                    headStyles: { fillColor: COLORS.primary },
                    margin: { left: this.margins.left, right: this.margins.right },
                });

                this.currentY = (this.doc as any).lastAutoTable.finalY + 10;
            }
        }

        // Recommendations
        if (options.sections.recommendations && data.recommendations && data.recommendations.length > 0) {
            this.addSectionTitle(this.labels.recommendations);

            data.recommendations.forEach((rec, index) => {
                this.checkPageBreak(25);

                // Status badge
                let statusColor = COLORS.muted;
                if (rec.status === 'accepted') statusColor = COLORS.success;
                else if (rec.status === 'rejected') statusColor = COLORS.critical;
                else if (rec.status === 'modified') statusColor = COLORS.primary;

                this.doc.setFont('helvetica', 'bold');
                this.doc.setFontSize(10);
                this.doc.setTextColor(0, 0, 0);
                this.doc.text(`${index + 1}. ${rec.title}`, this.margins.left, this.currentY);

                // Status text
                this.doc.setFont('helvetica', 'normal');
                this.doc.setFontSize(9);
                this.doc.setTextColor(...statusColor);
                this.doc.text(
                    `[${getStatusLabel(rec.status, this.lang)}]`,
                    this.pageWidth - this.margins.right,
                    this.currentY,
                    { align: 'right' }
                );

                this.currentY += 5;

                this.doc.setTextColor(0, 0, 0);
                this.addText(rec.description, 5);

                if (rec.reviewerNotes) {
                    this.doc.setFont('helvetica', 'italic');
                    this.doc.setFontSize(9);
                    this.doc.setTextColor(...COLORS.secondary);
                    this.doc.text(
                        `${this.labels.reviewerNotes}: ${rec.reviewerNotes}`,
                        this.margins.left + 5,
                        this.currentY
                    );
                    this.currentY += 5;
                }

                this.currentY += 3;
            });
        }

        // Treatment
        if (options.sections.treatment && data.treatment) {
            this.addSectionTitle(this.labels.treatment);
            this.addText(data.treatment);
            this.currentY += 5;
        }

        // Medical Notes
        if (options.sections.notes && data.medicalNotes && options.includeConfidential) {
            this.addSectionTitle(this.labels.notes);
            this.addText(data.medicalNotes);
            this.currentY += 5;
        }

        // Medical History
        if (options.sections.medicalHistory && data.medicalHistory && data.medicalHistory.length > 0) {
            this.addSectionTitle(this.labels.medicalHistory);

            const statusLabel = (status: string) => {
                switch (status) {
                    case 'resolved': return this.labels.resolved;
                    case 'chronic': return this.labels.chronic;
                    case 'active': return this.labels.active;
                    default: return status;
                }
            };

            autoTable(this.doc, {
                startY: this.currentY,
                head: [['Pathologie', this.labels.icdCode, 'Date', 'Âge', this.labels.status]],
                body: data.medicalHistory.map(h => [
                    h.name,
                    h.icdCode || '-',
                    h.date,
                    h.ageAtDiagnosis || '-',
                    statusLabel(h.status),
                ]),
                styles: { fontSize: 8 },
                headStyles: { fillColor: COLORS.primary, textColor: [255, 255, 255] },
                alternateRowStyles: { fillColor: COLORS.lightBg },
                margin: { left: this.margins.left, right: this.margins.right },
            });
            this.currentY = (this.doc as any).lastAutoTable.finalY + 10;
        }

        // Vaccines
        if (options.sections.vaccines && data.vaccines && data.vaccines.length > 0) {
            this.checkPageBreak(50);
            this.addSectionTitle(this.labels.vaccines);

            autoTable(this.doc, {
                startY: this.currentY,
                head: [['Vaccin', 'Date', this.labels.lot, this.labels.booster]],
                body: data.vaccines.map(v => [
                    v.name,
                    v.date,
                    v.lot || '-',
                    v.booster || '-',
                ]),
                styles: { fontSize: 8 },
                headStyles: { fillColor: COLORS.success, textColor: [255, 255, 255] },
                alternateRowStyles: { fillColor: COLORS.lightBg },
                margin: { left: this.margins.left, right: this.margins.right },
            });
            this.currentY = (this.doc as any).lastAutoTable.finalY + 10;
        }

        // Accidents
        if (options.sections.accidents && data.accidents && data.accidents.length > 0) {
            this.checkPageBreak(50);
            this.addSectionTitle(this.labels.accidents);

            const severityLabel = (severity: string) => {
                switch (severity) {
                    case 'minor': return this.labels.minor;
                    case 'moderate': return this.labels.moderate;
                    case 'severe': return this.labels.severe;
                    default: return severity;
                }
            };

            autoTable(this.doc, {
                startY: this.currentY,
                head: [['Type', 'Date', 'Description', 'Sévérité', this.labels.sequelae]],
                body: data.accidents.map(a => [
                    a.type,
                    a.date,
                    a.description,
                    severityLabel(a.severity),
                    a.sequelae || '-',
                ]),
                styles: { fontSize: 8 },
                headStyles: { fillColor: COLORS.warning, textColor: [0, 0, 0] },
                alternateRowStyles: { fillColor: COLORS.lightBg },
                margin: { left: this.margins.left, right: this.margins.right },
                columnStyles: { 2: { cellWidth: 60 } },
            });
            this.currentY = (this.doc as any).lastAutoTable.finalY + 10;
        }

        // Add page numbers
        const totalPages = this.doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            this.doc.setPage(i);
            this.addFooter(i, totalPages);
        }

        return this.doc.output('blob');
    }

    // Static method to download the PDF
    public static async downloadReport(
        data: PatientExportData,
        options: ExportOptions,
        filename?: string
    ): Promise<void> {
        const service = new PDFExportService(options);
        const blob = service.generate(data, options);

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || `rapport-patient-${data.patient.patientId}-${Date.now()}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

export default PDFExportService;
