/**
 * AlertsEngine - Centralized medical alert rules engine
 * 
 * This service provides a unified, configurable system for detecting
 * and prioritizing patient alerts based on lab results, treatment,
 * and medical history.
 */

import type { ExtendedLabResults, PatientAlert, AlertLevel } from '@/hooks/usePatientAlerts';

// ============================================
// TYPES & INTERFACES
// ============================================

export interface AlertRule {
    id: string;
    name: string;
    category: 'VITAL' | 'LAB' | 'INTERACTION' | 'CONTRAINDICATION' | 'SURVEILLANCE';
    level: AlertLevel;
    priority: number; // 1-10, 10 being highest priority
    condition: (context: AlertContext) => boolean;
    generateAlert: (context: AlertContext) => Omit<PatientAlert, 'id'>;
    enabled: boolean;
}

export interface AlertContext {
    labResults: ExtendedLabResults;
    treatment: string;
    medicalNotes: string;
    pathologyName?: string;
    age?: number;
    gender?: string;
}

export interface AlertThresholds {
    glucose: { hypo: number; hyperWarning: number; hyperCritical: number };
    bloodPressure: { sysWarning: number; sysCritical: number; diaWarning: number; diaCritical: number };
    temperature: { warning: number; critical: number };
    gfr: { warning: number; critical: number };
    potassium: { warning: number; critical: number };
    hemoglobin: { warning: number; critical: number };
    spo2: { warning: number; critical: number };
    alt: { warning: number; critical: number };
    crp: { warning: number; critical: number };
}

// ============================================
// DEFAULT THRESHOLDS (configurable)
// ============================================

export const DEFAULT_THRESHOLDS: AlertThresholds = {
    glucose: { hypo: 70, hyperWarning: 180, hyperCritical: 300 },
    bloodPressure: { sysWarning: 140, sysCritical: 180, diaWarning: 90, diaCritical: 110 },
    temperature: { warning: 38, critical: 39 },
    gfr: { warning: 60, critical: 30 },
    potassium: { warning: 5.5, critical: 6.0 },
    hemoglobin: { warning: 10, critical: 7 },
    spo2: { warning: 94, critical: 90 },
    alt: { warning: 50, critical: 200 },
    crp: { warning: 20, critical: 100 },
};

// ============================================
// DRUG INTERACTION DATABASE
// ============================================

interface DrugInteraction {
    drug1: string[];
    drug2: string[];
    level: AlertLevel;
    title: string;
    description: string;
    action: string;
    organ?: string;
}

const DRUG_INTERACTIONS: DrugInteraction[] = [
    {
        drug1: ['metformine', 'metformin'],
        drug2: ['iode', 'contraste', 'scanner'],
        level: 'CRITICAL',
        title: 'Metformine + Produit de contraste iodé',
        description: 'Risque d\'acidose lactique. Arrêter metformine 48h avant et après injection.',
        action: 'Suspendre Metformine 48h avant/après injection de produit de contraste.',
        organ: 'kidney'
    },
    {
        drug1: ['lisinopril', 'enalapril', 'ramipril', 'captopril', 'iec', 'inhibiteur'],
        drug2: ['potassium', 'k+', 'spironolactone'],
        level: 'WARNING',
        title: 'IEC + Supplémentation Potassium',
        description: 'Risque d\'hyperkaliémie. Surveillance du potassium requise.',
        action: 'Contrôler kaliémie régulièrement.',
        organ: 'heart'
    },
    {
        drug1: ['aspirine', 'aspirin', 'kardegic'],
        drug2: ['anticoagulant', 'warfarine', 'coumadine', 'xarelto', 'eliquis', 'pradaxa'],
        level: 'CRITICAL',
        title: 'Aspirine + Anticoagulant',
        description: 'Augmentation drastique du risque hémorragique.',
        action: 'Surveillance INR renforcée. Évaluer le bénéfice/risque.'
    },
    {
        drug1: ['methotrexate', 'méthotrexate'],
        drug2: ['ibuprofene', 'ibuprofène', 'ains', 'advil', 'nurofen', 'voltarene'],
        level: 'CRITICAL',
        title: 'Méthotrexate + AINS',
        description: 'Risque d\'insuffisance rénale aiguë et toxicité hématologique.',
        action: 'Remplacer AINS par Paracétamol.',
        organ: 'kidney'
    },
    {
        drug1: ['lisinopril', 'enalapril', 'ramipril', 'captopril', 'iec'],
        drug2: ['toux'],
        level: 'INFO',
        title: 'IEC + Toux sèche',
        description: 'Effet secondaire fréquent des IEC (5-20% des patients).',
        action: 'Envisager switch vers ARA2 (Losartan) si toux invalidante.'
    },
    {
        drug1: ['statine', 'atorvastatine', 'simvastatine', 'rosuvastatine'],
        drug2: ['myalgie', 'douleur musculaire', 'crampe'],
        level: 'WARNING',
        title: 'Statine + Myalgies',
        description: 'Effet secondaire courant. Surveiller CPK si douleurs importantes.',
        action: 'Dosage CPK. Considérer réduction de dose ou switch.'
    },
    {
        drug1: ['corticoïde', 'prednisone', 'cortisone', 'prednisolone'],
        drug2: ['diabète', 'glucose', 'hyperglycémie'],
        level: 'WARNING',
        title: 'Corticoïdes + Diabète',
        description: 'Les corticoïdes augmentent la glycémie.',
        action: 'Surveillance glycémique renforcée. Ajuster antidiabétiques.'
    },
    {
        drug1: ['digoxine', 'digoxin'],
        drug2: ['amiodarone', 'cordarone'],
        level: 'CRITICAL',
        title: 'Digoxine + Amiodarone',
        description: 'Risque de surdosage en digoxine. L\'amiodarone augmente les concentrations de digoxine de 50-100%.',
        action: 'Réduire la dose de digoxine de 50%. Surveiller digoxinémie.',
        organ: 'heart'
    },
    {
        drug1: ['lithium'],
        drug2: ['ibuprofene', 'ibuprofène', 'ains', 'diurétique', 'furosémide', 'iec'],
        level: 'CRITICAL',
        title: 'Lithium + AINS/Diurétiques/IEC',
        description: 'Risque d\'intoxication au lithium par diminution de son élimination rénale.',
        action: 'Éviter l\'association. Si indispensable, surveiller lithiémie fréquemment.',
        organ: 'kidney'
    },
    {
        drug1: ['clopidogrel', 'plavix'],
        drug2: ['omeprazole', 'esomeprazole'],
        level: 'WARNING',
        title: 'Clopidogrel + IPP',
        description: 'L\'oméprazole diminue l\'efficacité du clopidogrel.',
        action: 'Préférer pantoprazole ou rabéprazole si IPP nécessaire.'
    }
];

// ============================================
// ALLERGY CONTRAINDICATIONS
// ============================================

interface AllergyContraindication {
    allergen: string[];
    drugs: string[];
    title: string;
}

const ALLERGY_CONTRAINDICATIONS: AllergyContraindication[] = [
    {
        allergen: ['pénicilline', 'penicilline', 'amoxicilline'],
        drugs: ['amoxicilline', 'augmentin', 'clamoxyl', 'pénicilline', 'ampicilline'],
        title: 'Allergie Pénicilline'
    },
    {
        allergen: ['sulfamide', 'bactrim'],
        drugs: ['bactrim', 'sulfaméthoxazole', 'sulfamide'],
        title: 'Allergie Sulfamides'
    },
    {
        allergen: ['iode', 'contraste'],
        drugs: ['scanner', 'iode', 'contraste iodé'],
        title: 'Allergie Produits iodés'
    },
    {
        allergen: ['aspirine', 'ains'],
        drugs: ['aspirine', 'ibuprofene', 'ibuprofène', 'advil', 'nurofen', 'voltarene'],
        title: 'Allergie AINS/Aspirine'
    }
];

// ============================================
// ALERTS ENGINE CLASS
// ============================================

export class AlertsEngine {
    private thresholds: AlertThresholds;
    private customRules: AlertRule[] = [];

    constructor(thresholds: AlertThresholds = DEFAULT_THRESHOLDS) {
        this.thresholds = thresholds;
    }

    /**
     * Update thresholds dynamically
     */
    setThresholds(newThresholds: Partial<AlertThresholds>): void {
        this.thresholds = { ...this.thresholds, ...newThresholds };
    }

    /**
     * Add custom alert rules
     */
    addRule(rule: AlertRule): void {
        this.customRules.push(rule);
    }

    /**
     * Remove a custom rule by ID
     */
    removeRule(ruleId: string): void {
        this.customRules = this.customRules.filter(r => r.id !== ruleId);
    }

    /**
     * Main method: Generate all alerts for a patient context
     */
    generateAlerts(context: AlertContext): PatientAlert[] {
        const alerts: PatientAlert[] = [];

        // 1. Check drug interactions
        alerts.push(...this.checkDrugInteractions(context));

        // 2. Check allergy contraindications
        alerts.push(...this.checkAllergyContraindications(context));

        // 3. Check abnormal lab values
        alerts.push(...this.checkLabValues(context));

        // 4. Run custom rules
        alerts.push(...this.runCustomRules(context));

        // Sort by severity then by priority
        return this.sortAlerts(alerts);
    }

    /**
     * Check for drug-drug interactions
     */
    private checkDrugInteractions(context: AlertContext): PatientAlert[] {
        const alerts: PatientAlert[] = [];
        const combinedText = `${context.treatment.toLowerCase()} ${context.medicalNotes.toLowerCase()}`;

        DRUG_INTERACTIONS.forEach((interaction, index) => {
            const hasDrug1 = interaction.drug1.some(d => combinedText.includes(d));
            const hasDrug2 = interaction.drug2.some(d => combinedText.includes(d));

            if (hasDrug1 && hasDrug2) {
                alerts.push({
                    id: `interaction-${index}-${Date.now()}`,
                    level: interaction.level,
                    type: 'INTERACTION',
                    title: interaction.title,
                    description: interaction.description,
                    action: interaction.action,
                    organ: interaction.organ
                });
            }
        });

        return alerts;
    }

    /**
     * Check for allergy contraindications
     */
    private checkAllergyContraindications(context: AlertContext): PatientAlert[] {
        const alerts: PatientAlert[] = [];
        const notesLower = context.medicalNotes.toLowerCase();
        const treatmentLower = context.treatment.toLowerCase();

        ALLERGY_CONTRAINDICATIONS.forEach((rule, index) => {
            const hasAllergy = rule.allergen.some(
                a => notesLower.includes(`allergie ${a}`) || notesLower.includes(`allergique ${a}`)
            );
            const hasDrug = rule.drugs.some(d => treatmentLower.includes(d));

            if (hasAllergy && hasDrug) {
                alerts.push({
                    id: `allergy-${index}-${Date.now()}`,
                    level: 'CRITICAL',
                    type: 'CONTRAINDICATION',
                    title: rule.title,
                    description: `Traitement contre-indiqué en raison d'une allergie connue.`,
                    action: 'ARRÊT IMMÉDIAT. Prescrire une alternative thérapeutique.'
                });
            }
        });

        return alerts;
    }

    /**
     * Check for abnormal lab values
     */
    private checkLabValues(context: AlertContext): PatientAlert[] {
        const alerts: PatientAlert[] = [];
        const { labResults } = context;
        const t = this.thresholds;

        // Glucose - Hypoglycemia (CRITICAL)
        if (labResults.glucose_mg_dl > 0 && labResults.glucose_mg_dl < t.glucose.hypo) {
            alerts.push({
                id: `glucose-hypo-${Date.now()}`,
                level: 'CRITICAL',
                type: 'ABNORMAL_VALUE',
                title: 'Hypoglycémie',
                description: `Glycémie à ${labResults.glucose_mg_dl} mg/dL. Risque de malaise.`,
                organ: 'pancreas',
                action: 'Resucrage immédiat. Revoir posologie antidiabétiques.'
            });
        }
        // Glucose - Severe Hyperglycemia
        else if (labResults.glucose_mg_dl > t.glucose.hyperCritical) {
            alerts.push({
                id: `glucose-critical-${Date.now()}`,
                level: 'CRITICAL',
                type: 'ABNORMAL_VALUE',
                title: 'Hyperglycémie sévère',
                description: `Glycémie à ${labResults.glucose_mg_dl} mg/dL. Risque d'acidocétose.`,
                organ: 'pancreas',
                action: 'Hospitalisation urgente. Insulinothérapie IV.'
            });
        }
        // Glucose - Moderate Hyperglycemia
        else if (labResults.glucose_mg_dl > t.glucose.hyperWarning) {
            alerts.push({
                id: `glucose-warning-${Date.now()}`,
                level: 'WARNING',
                type: 'ABNORMAL_VALUE',
                title: 'Hyperglycémie modérée',
                description: `Glycémie à ${labResults.glucose_mg_dl} mg/dL.`,
                organ: 'pancreas',
                action: 'Revoir le traitement antidiabétique.'
            });
        }

        // Blood Pressure
        if (labResults.blood_pressure_sys > t.bloodPressure.sysCritical ||
            labResults.blood_pressure_dia > t.bloodPressure.diaCritical) {
            alerts.push({
                id: `bp-critical-${Date.now()}`,
                level: 'CRITICAL',
                type: 'ABNORMAL_VALUE',
                title: 'Hypertension artérielle sévère',
                description: `TA à ${labResults.blood_pressure_sys}/${labResults.blood_pressure_dia} mmHg.`,
                organ: 'heart',
                action: 'Traitement antihypertenseur urgent.'
            });
        } else if (labResults.blood_pressure_sys > t.bloodPressure.sysWarning ||
            labResults.blood_pressure_dia > t.bloodPressure.diaWarning) {
            alerts.push({
                id: `bp-warning-${Date.now()}`,
                level: 'WARNING',
                type: 'ABNORMAL_VALUE',
                title: 'Hypertension non contrôlée',
                description: `TA à ${labResults.blood_pressure_sys}/${labResults.blood_pressure_dia} mmHg.`,
                organ: 'heart',
                action: 'Optimiser le traitement antihypertenseur.'
            });
        }

        // Temperature
        if (labResults.temperature_c > t.temperature.critical) {
            alerts.push({
                id: `temp-critical-${Date.now()}`,
                level: 'CRITICAL',
                type: 'ABNORMAL_VALUE',
                title: 'Hyperthermie majeure',
                description: `Température à ${labResults.temperature_c}°C.`,
                action: 'Bilan infectieux complet. Antipyrétiques + hydratation.'
            });
        } else if (labResults.temperature_c > t.temperature.warning) {
            alerts.push({
                id: `temp-warning-${Date.now()}`,
                level: 'WARNING',
                type: 'ABNORMAL_VALUE',
                title: 'Fièvre',
                description: `Température à ${labResults.temperature_c}°C.`,
                action: 'Rechercher foyer infectieux.'
            });
        }

        // GFR (Renal function)
        if (labResults.gfr_ml_min && labResults.gfr_ml_min < t.gfr.critical) {
            alerts.push({
                id: `gfr-critical-${Date.now()}`,
                level: 'CRITICAL',
                type: 'COMPLICATION',
                title: 'Insuffisance rénale sévère',
                description: `DFG à ${labResults.gfr_ml_min} mL/min.`,
                organ: 'kidney',
                action: 'Consultation néphrologie. Adapter posologies.'
            });
        } else if (labResults.gfr_ml_min && labResults.gfr_ml_min < t.gfr.warning) {
            alerts.push({
                id: `gfr-warning-${Date.now()}`,
                level: 'WARNING',
                type: 'COMPLICATION',
                title: 'Insuffisance rénale modérée',
                description: `DFG à ${labResults.gfr_ml_min} mL/min.`,
                organ: 'kidney',
                action: 'Surveillance fonction rénale. Éviter néphrotoxiques.'
            });
        }

        // Potassium
        if (labResults.potassium_meq_l && labResults.potassium_meq_l > t.potassium.critical) {
            alerts.push({
                id: `k-critical-${Date.now()}`,
                level: 'CRITICAL',
                type: 'ABNORMAL_VALUE',
                title: 'Hyperkaliémie sévère',
                description: `Potassium à ${labResults.potassium_meq_l} mEq/L.`,
                organ: 'heart',
                action: 'ECG urgent. Traitement hypokaliémiant en urgence.'
            });
        } else if (labResults.potassium_meq_l && labResults.potassium_meq_l > t.potassium.warning) {
            alerts.push({
                id: `k-warning-${Date.now()}`,
                level: 'WARNING',
                type: 'ABNORMAL_VALUE',
                title: 'Hyperkaliémie',
                description: `Potassium à ${labResults.potassium_meq_l} mEq/L.`,
                action: 'Surveillance ECG. Revoir traitements hyperkaliémiants.'
            });
        }

        // Hemoglobin
        if (labResults.hemoglobin_g_dl && labResults.hemoglobin_g_dl < t.hemoglobin.critical) {
            alerts.push({
                id: `hb-critical-${Date.now()}`,
                level: 'CRITICAL',
                type: 'ABNORMAL_VALUE',
                title: 'Anémie sévère',
                description: `Hémoglobine à ${labResults.hemoglobin_g_dl} g/dL.`,
                action: 'Transfusion sanguine. Rechercher cause.'
            });
        } else if (labResults.hemoglobin_g_dl && labResults.hemoglobin_g_dl < t.hemoglobin.warning) {
            alerts.push({
                id: `hb-warning-${Date.now()}`,
                level: 'WARNING',
                type: 'ABNORMAL_VALUE',
                title: 'Anémie modérée',
                description: `Hémoglobine à ${labResults.hemoglobin_g_dl} g/dL.`,
                action: 'Bilan martial. Supplémentation si carence.'
            });
        }

        // SpO2
        if (labResults.spo2_percent && labResults.spo2_percent < t.spo2.critical) {
            alerts.push({
                id: `spo2-critical-${Date.now()}`,
                level: 'CRITICAL',
                type: 'ABNORMAL_VALUE',
                title: 'Hypoxémie sévère',
                description: `SpO2 à ${labResults.spo2_percent}%.`,
                organ: 'lungs',
                action: 'Oxygénothérapie urgente.'
            });
        } else if (labResults.spo2_percent && labResults.spo2_percent < t.spo2.warning) {
            alerts.push({
                id: `spo2-warning-${Date.now()}`,
                level: 'WARNING',
                type: 'ABNORMAL_VALUE',
                title: 'Désaturation',
                description: `SpO2 à ${labResults.spo2_percent}%.`,
                organ: 'lungs',
                action: 'Surveillance rapprochée. Oxygénothérapie si besoin.'
            });
        }

        // ALT (Liver function)
        if (labResults.alt_u_l && labResults.alt_u_l > t.alt.critical) {
            alerts.push({
                id: `alt-critical-${Date.now()}`,
                level: 'CRITICAL',
                type: 'ABNORMAL_VALUE',
                title: 'Cytolyse hépatique majeure',
                description: `ALAT à ${labResults.alt_u_l} U/L.`,
                organ: 'liver',
                action: 'Bilan hépatique complet. Échographie.'
            });
        } else if (labResults.alt_u_l && labResults.alt_u_l > t.alt.warning) {
            alerts.push({
                id: `alt-warning-${Date.now()}`,
                level: 'WARNING',
                type: 'ABNORMAL_VALUE',
                title: 'Élévation des transaminases',
                description: `ALAT à ${labResults.alt_u_l} U/L.`,
                organ: 'liver',
                action: 'Surveillance hépatique. Rechercher cause.'
            });
        }

        // CRP
        if (labResults.crp_mg_l && labResults.crp_mg_l > t.crp.critical) {
            alerts.push({
                id: `crp-critical-${Date.now()}`,
                level: 'CRITICAL',
                type: 'ABNORMAL_VALUE',
                title: 'Syndrome inflammatoire majeur',
                description: `CRP à ${labResults.crp_mg_l} mg/L.`,
                action: 'Bilan infectieux complet. Antibiothérapie probabiliste.'
            });
        } else if (labResults.crp_mg_l && labResults.crp_mg_l > t.crp.warning) {
            alerts.push({
                id: `crp-warning-${Date.now()}`,
                level: 'WARNING',
                type: 'ABNORMAL_VALUE',
                title: 'Syndrome inflammatoire',
                description: `CRP à ${labResults.crp_mg_l} mg/L.`,
                action: 'Rechercher foyer infectieux ou inflammatoire.'
            });
        }

        return alerts;
    }

    /**
     * Run custom alert rules
     */
    private runCustomRules(context: AlertContext): PatientAlert[] {
        const alerts: PatientAlert[] = [];

        this.customRules
            .filter(rule => rule.enabled)
            .forEach(rule => {
                if (rule.condition(context)) {
                    const alertData = rule.generateAlert(context);
                    alerts.push({
                        id: `custom-${rule.id}-${Date.now()}`,
                        ...alertData
                    });
                }
            });

        return alerts;
    }

    /**
     * Sort alerts by severity and priority
     */
    private sortAlerts(alerts: PatientAlert[]): PatientAlert[] {
        const severityOrder: Record<AlertLevel, number> = {
            CRITICAL: 0,
            WARNING: 1,
            INFO: 2
        };

        return alerts.sort((a, b) => severityOrder[a.level] - severityOrder[b.level]);
    }

    /**
     * Get summary statistics for alerts
     */
    getAlertsSummary(alerts: PatientAlert[]): {
        critical: number;
        warning: number;
        info: number;
        total: number;
        byType: Record<string, number>;
    } {
        const summary = {
            critical: 0,
            warning: 0,
            info: 0,
            total: alerts.length,
            byType: {} as Record<string, number>
        };

        alerts.forEach(alert => {
            switch (alert.level) {
                case 'CRITICAL': summary.critical++; break;
                case 'WARNING': summary.warning++; break;
                case 'INFO': summary.info++; break;
            }

            summary.byType[alert.type] = (summary.byType[alert.type] || 0) + 1;
        });

        return summary;
    }

    /**
     * Calculate risk score based on alerts
     */
    calculateRiskScore(alerts: PatientAlert[]): number {
        let score = 20; // Base score

        alerts.forEach(alert => {
            switch (alert.level) {
                case 'CRITICAL':
                    score += 25;
                    break;
                case 'WARNING':
                    score += 10;
                    break;
                case 'INFO':
                    score += 3;
                    break;
            }
        });

        return Math.min(score, 100);
    }
}

// Export singleton instance
export const alertsEngine = new AlertsEngine();

// Export utility functions for convenience
export const generateAlerts = (context: AlertContext): PatientAlert[] =>
    alertsEngine.generateAlerts(context);

export const getAlertsSummary = (alerts: PatientAlert[]) =>
    alertsEngine.getAlertsSummary(alerts);

export const calculateRiskScore = (alerts: PatientAlert[]) =>
    alertsEngine.calculateRiskScore(alerts);
