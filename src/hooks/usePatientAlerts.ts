import { useMemo } from 'react';
import type { Json } from '@/integrations/supabase/types';

export interface ExtendedLabResults {
  // Basic vitals
  glucose_mg_dl: number;
  blood_pressure_sys: number;
  blood_pressure_dia: number;
  temperature_c: number;
  // Hematology
  hemoglobin_g_dl?: number;
  platelets_k_ul?: number;
  wbc_k_ul?: number;
  // Renal function
  creatinine_mg_dl?: number;
  gfr_ml_min?: number;
  // Lipid panel
  cholesterol_total_mg_dl?: number;
  cholesterol_hdl_mg_dl?: number;
  cholesterol_ldl_mg_dl?: number;
  triglycerides_mg_dl?: number;
  // Liver function
  alt_u_l?: number;
  ast_u_l?: number;
  bilirubin_mg_dl?: number;
  // Inflammatory
  crp_mg_l?: number;
  esr_mm_h?: number;
  // Respiratory
  spirometry_fev1_percent?: number;
  peak_flow_l_min?: number;
  feNO_ppb?: number;
  spo2_percent?: number;
  // Allergy
  ige_total_ku_l?: number;
  eosinophils_percent?: number;
  // Bone/Vitamins
  vitamin_d_ng_ml?: number;
  calcium_mg_dl?: number;
  bone_density_t_score_spine?: number;
  bone_density_t_score_hip?: number;
  // Thyroid
  tsh_miu_l?: number;
  t4_ng_dl?: number;
  // Cardiac
  troponin_ng_ml?: number;
  bnp_pg_ml?: number;
  // Electrolytes
  sodium_meq_l?: number;
  potassium_meq_l?: number;
  chloride_meq_l?: number;
}

export type AlertLevel = 'CRITICAL' | 'WARNING' | 'INFO';

export interface PatientAlert {
  id: string;
  level: AlertLevel;
  type: 'CONTRAINDICATION' | 'INTERACTION' | 'COMPLICATION' | 'ABNORMAL_VALUE' | 'SURVEILLANCE';
  title: string;
  description: string;
  organ?: string;
  action?: string;
}

interface DrugInteraction {
  drug1: string[];
  drug2: string[];
  level: AlertLevel;
  title: string;
  description: string;
  action: string;
}

const DRUG_INTERACTIONS: DrugInteraction[] = [
  {
    drug1: ['metformine', 'metformin'],
    drug2: ['iode', 'contraste', 'scanner'],
    level: 'CRITICAL',
    title: 'Metformine + Produit de contraste iodé',
    description: 'Risque d\'acidose lactique. Arrêter metformine 48h avant et après injection.',
    action: 'Suspendre Metformine 48h avant/après injection de produit de contraste.'
  },
  {
    drug1: ['lisinopril', 'enalapril', 'ramipril', 'captopril', 'iec', 'inhibiteur'],
    drug2: ['potassium', 'k+', 'spironolactone'],
    level: 'WARNING',
    title: 'IEC + Supplémentation Potassium',
    description: 'Risque d\'hyperkaliémie. Surveillance du potassium requise.',
    action: 'Contrôler kaliémie régulièrement.'
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
    action: 'Remplacer AINS par Paracétamol.'
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
  }
];

const ALLERGY_CONTRAINDICATIONS: { allergen: string[]; drugs: string[]; title: string }[] = [
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
  }
];

export const parseExtendedLabResults = (json: Json | null): ExtendedLabResults => {
  const defaultResults: ExtendedLabResults = {
    glucose_mg_dl: 0,
    blood_pressure_sys: 0,
    blood_pressure_dia: 0,
    temperature_c: 0,
  };

  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return defaultResults;
  }

  const obj = json as Record<string, Json>;
  const result: ExtendedLabResults = { ...defaultResults };

  Object.keys(obj).forEach(key => {
    if (typeof obj[key] === 'number' && key in result) {
      (result as unknown as Record<string, number>)[key] = obj[key] as number;
    }
  });

  return result;
};

export const usePatientAlerts = (
  labResults: ExtendedLabResults,
  treatment: string,
  medicalNotes: string,
  pathologyName?: string
): PatientAlert[] => {
  return useMemo(() => {
    const alerts: PatientAlert[] = [];
    const treatmentLower = treatment.toLowerCase();
    const notesLower = medicalNotes.toLowerCase();
    const combinedText = `${treatmentLower} ${notesLower}`;

    // Check drug interactions
    DRUG_INTERACTIONS.forEach((interaction, index) => {
      const hasDrug1 = interaction.drug1.some(d => combinedText.includes(d));
      const hasDrug2 = interaction.drug2.some(d => combinedText.includes(d));
      
      if (hasDrug1 && hasDrug2) {
        alerts.push({
          id: `interaction-${index}`,
          level: interaction.level,
          type: 'INTERACTION',
          title: interaction.title,
          description: interaction.description,
          action: interaction.action
        });
      }
    });

    // Check allergy contraindications
    ALLERGY_CONTRAINDICATIONS.forEach((allergyRule, index) => {
      const hasAllergy = allergyRule.allergen.some(a => notesLower.includes(`allergie ${a}`) || notesLower.includes(`allergique ${a}`));
      const hasDrug = allergyRule.drugs.some(d => treatmentLower.includes(d));
      
      if (hasAllergy && hasDrug) {
        alerts.push({
          id: `allergy-${index}`,
          level: 'CRITICAL',
          type: 'CONTRAINDICATION',
          title: allergyRule.title,
          description: `Traitement contre-indiqué en raison d'une allergie connue.`,
          action: 'ARRÊT IMMÉDIAT. Prescrire une alternative thérapeutique.'
        });
      }
    });

    // Check abnormal lab values
    const { 
      glucose_mg_dl, blood_pressure_sys, blood_pressure_dia, temperature_c,
      hemoglobin_g_dl, creatinine_mg_dl, gfr_ml_min, potassium_meq_l,
      sodium_meq_l, alt_u_l, ast_u_l, tsh_miu_l, spo2_percent,
      cholesterol_ldl_mg_dl, triglycerides_mg_dl, crp_mg_l
    } = labResults;

    // Critical glucose
    if (glucose_mg_dl > 300) {
      alerts.push({
        id: 'glucose-critical',
        level: 'CRITICAL',
        type: 'ABNORMAL_VALUE',
        title: 'Hyperglycémie sévère',
        description: `Glycémie à ${glucose_mg_dl} mg/dL. Risque d'acidocétose ou syndrome hyperosmolaire.`,
        organ: 'pancreas',
        action: 'Hospitalisation urgente. Insulinothérapie IV.'
      });
    } else if (glucose_mg_dl > 180) {
      alerts.push({
        id: 'glucose-warning',
        level: 'WARNING',
        type: 'ABNORMAL_VALUE',
        title: 'Hyperglycémie modérée',
        description: `Glycémie à ${glucose_mg_dl} mg/dL. Contrôle glycémique insuffisant.`,
        organ: 'pancreas',
        action: 'Revoir le traitement antidiabétique.'
      });
    } else if (glucose_mg_dl < 70 && glucose_mg_dl > 0) {
      alerts.push({
        id: 'glucose-hypo',
        level: 'CRITICAL',
        type: 'ABNORMAL_VALUE',
        title: 'Hypoglycémie',
        description: `Glycémie à ${glucose_mg_dl} mg/dL. Risque de malaise hypoglycémique.`,
        organ: 'pancreas',
        action: 'Resucrage immédiat. Revoir posologie antidiabétiques.'
      });
    }

    // Blood pressure
    if (blood_pressure_sys > 180 || blood_pressure_dia > 110) {
      alerts.push({
        id: 'bp-critical',
        level: 'CRITICAL',
        type: 'ABNORMAL_VALUE',
        title: 'Hypertension artérielle sévère',
        description: `TA à ${blood_pressure_sys}/${blood_pressure_dia} mmHg. Risque d'AVC ou IDM.`,
        organ: 'heart',
        action: 'Traitement antihypertenseur urgent. Surveillance continue.'
      });
    } else if (blood_pressure_sys > 140 || blood_pressure_dia > 90) {
      alerts.push({
        id: 'bp-warning',
        level: 'WARNING',
        type: 'ABNORMAL_VALUE',
        title: 'Hypertension non contrôlée',
        description: `TA à ${blood_pressure_sys}/${blood_pressure_dia} mmHg.`,
        organ: 'heart',
        action: 'Optimiser le traitement antihypertenseur.'
      });
    }

    // Temperature
    if (temperature_c > 39) {
      alerts.push({
        id: 'temp-critical',
        level: 'CRITICAL',
        type: 'ABNORMAL_VALUE',
        title: 'Hyperthermie majeure',
        description: `Température à ${temperature_c}°C. Rechercher infection sévère.`,
        action: 'Bilan infectieux complet. Antipyrétiques + hydratation.'
      });
    } else if (temperature_c > 38) {
      alerts.push({
        id: 'temp-warning',
        level: 'WARNING',
        type: 'ABNORMAL_VALUE',
        title: 'Fièvre',
        description: `Température à ${temperature_c}°C.`,
        action: 'Rechercher foyer infectieux.'
      });
    }

    // Renal function
    if (gfr_ml_min && gfr_ml_min < 30) {
      alerts.push({
        id: 'gfr-critical',
        level: 'CRITICAL',
        type: 'COMPLICATION',
        title: 'Insuffisance rénale sévère',
        description: `DFG à ${gfr_ml_min} mL/min. Ajuster les posologies des médicaments néphrotoxiques.`,
        organ: 'kidney',
        action: 'Consultation néphrologie. Adapter posologies.'
      });
    } else if (gfr_ml_min && gfr_ml_min < 60) {
      alerts.push({
        id: 'gfr-warning',
        level: 'WARNING',
        type: 'COMPLICATION',
        title: 'Insuffisance rénale modérée',
        description: `DFG à ${gfr_ml_min} mL/min.`,
        organ: 'kidney',
        action: 'Surveillance fonction rénale. Éviter néphrotoxiques.'
      });
    }

    // Potassium
    if (potassium_meq_l && potassium_meq_l > 6) {
      alerts.push({
        id: 'k-critical',
        level: 'CRITICAL',
        type: 'ABNORMAL_VALUE',
        title: 'Hyperkaliémie sévère',
        description: `Potassium à ${potassium_meq_l} mEq/L. Risque d'arythmie cardiaque.`,
        organ: 'heart',
        action: 'ECG urgent. Traitement hypokaliémiant en urgence.'
      });
    } else if (potassium_meq_l && potassium_meq_l > 5.5) {
      alerts.push({
        id: 'k-warning',
        level: 'WARNING',
        type: 'ABNORMAL_VALUE',
        title: 'Hyperkaliémie',
        description: `Potassium à ${potassium_meq_l} mEq/L.`,
        action: 'Surveillance ECG. Revoir traitements hyperkaliémiants.'
      });
    }

    // Hemoglobin
    if (hemoglobin_g_dl && hemoglobin_g_dl < 7) {
      alerts.push({
        id: 'hb-critical',
        level: 'CRITICAL',
        type: 'ABNORMAL_VALUE',
        title: 'Anémie sévère',
        description: `Hémoglobine à ${hemoglobin_g_dl} g/dL. Indication de transfusion.`,
        action: 'Transfusion sanguine. Rechercher cause du saignement.'
      });
    } else if (hemoglobin_g_dl && hemoglobin_g_dl < 10) {
      alerts.push({
        id: 'hb-warning',
        level: 'WARNING',
        type: 'ABNORMAL_VALUE',
        title: 'Anémie modérée',
        description: `Hémoglobine à ${hemoglobin_g_dl} g/dL.`,
        action: 'Bilan martial. Supplémentation si carence.'
      });
    }

    // SpO2
    if (spo2_percent && spo2_percent < 90) {
      alerts.push({
        id: 'spo2-critical',
        level: 'CRITICAL',
        type: 'ABNORMAL_VALUE',
        title: 'Hypoxémie sévère',
        description: `SpO2 à ${spo2_percent}%. Insuffisance respiratoire.`,
        organ: 'lungs',
        action: 'Oxygénothérapie urgente. Rechercher étiologie.'
      });
    } else if (spo2_percent && spo2_percent < 94) {
      alerts.push({
        id: 'spo2-warning',
        level: 'WARNING',
        type: 'ABNORMAL_VALUE',
        title: 'Désaturation',
        description: `SpO2 à ${spo2_percent}%.`,
        organ: 'lungs',
        action: 'Surveillance rapprochée. Oxygénothérapie si besoin.'
      });
    }

    // Liver function
    if (alt_u_l && alt_u_l > 200) {
      alerts.push({
        id: 'alt-critical',
        level: 'CRITICAL',
        type: 'ABNORMAL_VALUE',
        title: 'Cytolyse hépatique majeure',
        description: `ALAT à ${alt_u_l} U/L. Rechercher hépatite aiguë.`,
        organ: 'liver',
        action: 'Bilan hépatique complet. Échographie hépatique.'
      });
    } else if (alt_u_l && alt_u_l > 50) {
      alerts.push({
        id: 'alt-warning',
        level: 'WARNING',
        type: 'ABNORMAL_VALUE',
        title: 'Élévation des transaminases',
        description: `ALAT à ${alt_u_l} U/L.`,
        organ: 'liver',
        action: 'Surveillance hépatique. Rechercher cause médicamenteuse.'
      });
    }

    // CRP inflammation
    if (crp_mg_l && crp_mg_l > 100) {
      alerts.push({
        id: 'crp-critical',
        level: 'CRITICAL',
        type: 'ABNORMAL_VALUE',
        title: 'Syndrome inflammatoire majeur',
        description: `CRP à ${crp_mg_l} mg/L. Suspicion d'infection sévère.`,
        action: 'Bilan infectieux complet. Antibiothérapie probabiliste.'
      });
    } else if (crp_mg_l && crp_mg_l > 20) {
      alerts.push({
        id: 'crp-warning',
        level: 'WARNING',
        type: 'ABNORMAL_VALUE',
        title: 'Syndrome inflammatoire',
        description: `CRP à ${crp_mg_l} mg/L.`,
        action: 'Rechercher foyer infectieux ou inflammatoire.'
      });
    }

    // Surveillance items (INFO level)
    if (cholesterol_ldl_mg_dl && cholesterol_ldl_mg_dl > 130) {
      alerts.push({
        id: 'ldl-info',
        level: 'INFO',
        type: 'SURVEILLANCE',
        title: 'LDL-cholestérol élevé',
        description: `LDL à ${cholesterol_ldl_mg_dl} mg/dL. Risque cardiovasculaire.`,
        action: 'Renforcer mesures hygiéno-diététiques. Discuter statine.'
      });
    }

    // Sort by severity
    const severityOrder: Record<AlertLevel, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    alerts.sort((a, b) => severityOrder[a.level] - severityOrder[b.level]);

    return alerts;
  }, [labResults, treatment, medicalNotes, pathologyName]);
};
