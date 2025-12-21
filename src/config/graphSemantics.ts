
// ============================================
// COLORS
// ============================================

export const RING_COLORS: Record<number, string> = {
    0: '#ef4444', // Pathology (Red)
    1: '#eab308', // Symptoms (Yellow)
    2: '#f97316', // Complications (Orange) - kept as distinct from red/yellow
    3: '#06b6d4', // Lab/Biomarkers (Cyan)
    4: '#3b82f6', // Treatment (Blue)
    5: '#22c55e', // Drugs (Green)
    6: '#8b5cf6', // Suggestions (Violet)
};

export const LANE_COLORS: Record<string, string> = {
    pathology: '#ef4444',    // Rouge - Pathologie
    drugs: '#22c55e',        // Vert - Médicaments
    drug: '#22c55e',         // Vert - Médicament
    medication: '#22c55e',   // Vert - Médicament
    treatment: '#3b82f6',    // Bleu - Traitement
    symptoms: '#eab308',     // Jaune - Symptômes
    symptom: '#eab308',      // Jaune - Symptôme
    biomarkers: '#06b6d4',   // Turquoise - Analyses
    lab: '#06b6d4',          // Turquoise - Analyses
    adverse_events: '#f97316', // Orange - Effets indésirables
    complication: '#f97316', // Orange - Complication
    mechanisms: '#8b5cf6',   // Violet - Mécanismes
    interactions: '#ef4444', // Rouge - Interactions dangereuses
    triggers: '#eab308',     // Jaune - Déclencheurs
    genetics: '#8b5cf6',     // Violet - Génétique
    exposures: '#f97316',    // Orange - Expositions
    frontiers: '#8b5cf6',    // Violet - Suggestions
    guideline: '#8b5cf6',    // Violet - Suggestions
    evidence: '#8b5cf6',     // Violet - Evidence
    lifestyle: '#8b5cf6',    // Violet - Style de vie
};

// Semantic node type colors (ontology) - User customized colors
// Médicament = Vert, Traitement = Bleu, Symptôme = Jaune, Pathologie = Rouge
// Analyses = Turquoise, Suggestion = Violet
export const NODE_TYPE_COLORS: Record<string, string> = {
    PATHOLOGY: '#ef4444',    // Rouge - Pathologie (comorbidité)
    SYMPTOM: '#eab308',      // Jaune - Symptôme
    TREATMENT: '#3b82f6',    // Bleu - Traitement
    DRUG: '#22c55e',         // Vert - Médicament
    MEDICATION: '#22c55e',   // Vert - Médicament (alias)
    COMPLICATION: '#f97316', // Orange - Complication
    CONDITION: '#ef4444',    // Rouge - Conditions (comorbidité)
    LAB: '#06b6d4',          // Turquoise - Analyses
    BIOMARKER: '#06b6d4',    // Turquoise - Analyses
    CAUSE: '#06b6d4',        // Turquoise - Causes (often biochemical)
    GUIDELINE: '#8b5cf6',    // Violet - Suggestions/Pistes d'actions
    EVIDENCE: '#8b5cf6',     // Violet - Evidence/Suggestions
    LIFESTYLE: '#8b5cf6',    // Violet - Style de vie/Suggestions
    SUGGESTION: '#8b5cf6',   // Violet - Suggestions
};

// Semantic edge type colors based on relationship semantics
export const EDGE_TYPE_COLORS: Record<string, { color: string; dashArray?: string; isDangerous?: boolean }> = {
    // Relations positives (Vert)
    TREATS: { color: '#22c55e' },
    IMPROVES: { color: '#22c55e' },
    PREVENTS: { color: '#22c55e' },
    MANAGED_BY: { color: '#22c55e', dashArray: '3,3' },
    // Associations symptômes-pathologie (Vert)
    SYMPTOM_OF: { color: '#22c55e' },
    ASSOCIATED_SYMPTOM: { color: '#22c55e' },
    // Relations médicament/traitement (Orange)  
    ASSOCIATED_WITH: { color: '#f97316' },
    CAUSES: { color: '#f97316' },
    SIDE_EFFECT: { color: '#f97316' },
    LEADS_TO: { color: '#f97316' },
    // Avertissements (Jaune/Orange)
    RISK_INCREASED_BY: { color: '#eab308' },
    CAUTION_WITH: { color: '#eab308' },
    MONITOR_WITH: { color: '#06b6d4', dashArray: '5,5' },
    INDICATED_IF: { color: '#3b82f6', dashArray: '5,3' },
    COMPLICATES: { color: '#f97316' },
    WORSENED_BY: { color: '#f97316' },
    // Interactions médicamenteuses dangereuses (Rouge)
    INTERACTS_WITH: { color: '#ef4444' },
    DRUG_INTERACTION: { color: '#ef4444' },
    // Contre-indications GRAVES (Rouge clignotant + tête de mort)
    CONTRAINDICATED_IF: { color: '#ef4444', isDangerous: true },
    CONTRAINDICATION: { color: '#ef4444', isDangerous: true },
    DANGEROUS: { color: '#ef4444', isDangerous: true },
    TOXIC: { color: '#ef4444', isDangerous: true },
};

// ============================================
// TIMING (ms converted to seconds in components)
// ============================================

export const TIMING = {
    CENTER_APPEAR: 0.5,
    RING_INTERVAL: 1.5,
    LINK_DURATION: 0.8,
    NODE_DURATION: 0.3,
};
