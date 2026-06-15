/**
 * Pathology Filter Module for Systematic Analysis
 * Maps pathologies to relevant therapeutic classes and ATC codes
 */

export interface PathologyMapping {
    name: string;
    aliases: string[];
    atcPrefixes: string[];
    therapeuticClasses: string[];
    keywords: string[];
    priority: number; // 1-10, higher = more relevant
}

/**
 * Predefined pathology mappings to therapeutic classes
 */
export const PATHOLOGY_MAPPINGS: Record<string, PathologyMapping> = {
    // ONCOLOGY
    'cancer': {
        name: 'Cancer / Oncologie',
        aliases: ['cancer', 'oncologie', 'tumeur', 'néoplasie', 'carcinome', 'sarcome', 'leucémie', 'lymphome'],
        atcPrefixes: ['L01', 'L02', 'L03', 'L04'], // Antineoplastics, Endocrine therapy, Immunostimulants, Immunosuppressants
        therapeuticClasses: ['antineoplastic', 'immunotherapy', 'chemotherapy', 'targeted therapy', 'hormone therapy'],
        keywords: ['chimiothérapie', 'immunothérapie', 'métastase', 'cellules cancéreuses'],
        priority: 10
    },

    // CARDIOLOGY
    'cardiologie': {
        name: 'Cardiologie',
        aliases: ['cardiologie', 'cardiovasculaire', 'insuffisance cardiaque', 'hypertension', 'arythmie', 'infarctus'],
        atcPrefixes: ['C01', 'C02', 'C03', 'C07', 'C08', 'C09', 'C10'], // Cardiac therapy, Antihypertensives, Diuretics, Beta blockers, CCBs, RAAS, Lipid mods
        therapeuticClasses: ['antihypertensive', 'anticoagulant', 'antiarrhythmic', 'statin', 'diuretic', 'beta-blocker'],
        keywords: ['pression artérielle', 'rythme cardiaque', 'cholestérol', 'thrombose'],
        priority: 9
    },

    // DIABETOLOGY
    'diabete': {
        name: 'Diabétologie',
        aliases: ['diabète', 'diabete', 'glycémie', 'insuline', 'hba1c', 'hyperglycémie'],
        atcPrefixes: ['A10'], // Antidiabetics
        therapeuticClasses: ['antidiabetic', 'insulin', 'biguanide', 'sulfonylurea', 'GLP-1', 'SGLT2 inhibitor', 'DPP-4 inhibitor'],
        keywords: ['glycémie', 'insulinorésistance', 'pancréas', 'métabolisme glucidique'],
        priority: 9
    },

    // NEUROLOGY
    'neurologie': {
        name: 'Neurologie',
        aliases: ['neurologie', 'épilepsie', 'parkinson', 'alzheimer', 'sclérose', 'migraine', 'avc', 'stroke'],
        atcPrefixes: ['N02', 'N03', 'N04', 'N05', 'N06', 'N07'], // Analgesics, Antiepileptics, Anti-Parkinson, Psycholeptics, Psychoanaleptics, Other NS
        therapeuticClasses: ['antiepileptic', 'dopaminergic', 'cholinesterase inhibitor', 'anticonvulsant', 'neuroprotective'],
        keywords: ['neurones', 'cerveau', 'système nerveux', 'neurotransmetteur'],
        priority: 9
    },

    // PSYCHIATRY
    'psychiatrie': {
        name: 'Psychiatrie',
        aliases: ['psychiatrie', 'dépression', 'anxiété', 'schizophrénie', 'trouble bipolaire', 'toc'],
        atcPrefixes: ['N05A', 'N05B', 'N05C', 'N06A', 'N06B'], // Antipsychotics, Anxiolytics, Hypnotics, Antidepressants, Psychostimulants
        therapeuticClasses: ['antidepressant', 'antipsychotic', 'anxiolytic', 'mood stabilizer', 'SSRI', 'SNRI'],
        keywords: ['sérotonine', 'dopamine', 'humeur', 'psychotrope'],
        priority: 8
    },

    // INFECTIOLOGY
    'infectiologie': {
        name: 'Infectiologie',
        aliases: ['infection', 'infectieux', 'bactérie', 'virus', 'antibiotique', 'sepsis', 'vih', 'tuberculose'],
        atcPrefixes: ['J01', 'J02', 'J04', 'J05'], // Antibacterials, Antifungals, Antimycobacterials, Antivirals
        therapeuticClasses: ['antibiotic', 'antiviral', 'antifungal', 'antimicrobial'],
        keywords: ['pathogène', 'résistance', 'souche', 'culture'],
        priority: 8
    },

    // RHEUMATOLOGY
    'rhumatologie': {
        name: 'Rhumatologie',
        aliases: ['rhumatologie', 'arthrite', 'polyarthrite', 'lupus', 'spondylarthrite', 'goutte', 'ostéoporose'],
        atcPrefixes: ['M01', 'M04', 'M05', 'L04'], // NSAIDs, Antigout, Osteoporosis, Immunosuppressants
        therapeuticClasses: ['NSAID', 'DMARD', 'biologic', 'corticosteroid', 'bisphosphonate'],
        keywords: ['inflammation', 'articulation', 'auto-immun', 'os'],
        priority: 7
    },

    // NEPHROLOGY
    'nephrologie': {
        name: 'Néphrologie',
        aliases: ['néphrologie', 'nephro', 'renal', 'rein', 'dialyse', 'insuffisance rénale', 'syndrome néphrotique'],
        atcPrefixes: ['C03', 'B05', 'V03AE'], // Diuretics, Blood substitutes, Hyperkalemia drugs
        therapeuticClasses: ['diuretic', 'erythropoietin', 'phosphate binder', 'calcimimetic'],
        keywords: ['filtration glomérulaire', 'créatinine', 'protéinurie', 'dialyse'],
        priority: 7
    },

    // PEDIATRICS
    'pediatrie': {
        name: 'Pédiatrie',
        aliases: ['pédiatrie', 'enfant', 'nourrisson', 'nouveau-né', 'adolescent', 'pédiatrique'],
        atcPrefixes: [], // All classes, but doses adjusted
        therapeuticClasses: ['pediatric formulation', 'vaccine'],
        keywords: ['développement', 'croissance', 'posologie pédiatrique', 'adaptation dose'],
        priority: 6
    },

    // GASTROENTEROLOGY
    'gastroenterologie': {
        name: 'Gastro-entérologie',
        aliases: ['gastro', 'digestif', 'crohn', 'rch', 'reflux', 'cirrhose', 'hépatite', 'pancréatite'],
        atcPrefixes: ['A02', 'A03', 'A04', 'A05', 'A06', 'A07'], // Antacids, Antispasmodics, Antiemetics, Bile therapy, Laxatives, Antidiarrheals
        therapeuticClasses: ['PPI', 'H2 blocker', 'antispasmodic', 'antiemetic', 'laxative'],
        keywords: ['intestin', 'estomac', 'foie', 'acide gastrique'],
        priority: 7
    },

    // PULMONOLOGY
    'pneumologie': {
        name: 'Pneumologie',
        aliases: ['pneumologie', 'asthme', 'bpco', 'fibrose pulmonaire', 'embolie', 'pneumonie'],
        atcPrefixes: ['R01', 'R03', 'R05', 'R06', 'R07'], // Nasal, Antiasthmatics, Cough, Antihistamines, Other resp
        therapeuticClasses: ['bronchodilator', 'corticosteroid inhaled', 'leukotriene antagonist', 'mucolytic'],
        keywords: ['poumon', 'bronches', 'oxygène', 'ventilation'],
        priority: 7
    },

    // DERMATOLOGY
    'dermatologie': {
        name: 'Dermatologie',
        aliases: ['dermatologie', 'peau', 'psoriasis', 'eczéma', 'acné', 'urticaire', 'mélanome'],
        atcPrefixes: ['D01', 'D02', 'D04', 'D05', 'D06', 'D07', 'D10', 'D11'], // Antifungals topical, Emollients, Antipruritics, Antipsoriatics, Antibiotics topical, Corticosteroids topical, Acne, Other dermatologicals
        therapeuticClasses: ['topical corticosteroid', 'retinoid', 'antifungal topical', 'emollient'],
        keywords: ['épiderme', 'lésion cutanée', 'inflammation cutanée', 'application locale'],
        priority: 6
    }
};

/**
 * Analysis modes with predefined configurations
 */
export const ANALYSIS_MODES = {
    all: { label: 'Analyse Globale', pathologies: [], description: 'Toutes les substances sans filtre' },
    oncology: { label: 'Oncologie', pathologies: ['cancer'], description: 'Chimiothérapies et immunothérapies' },
    cardiology: { label: 'Cardiologie', pathologies: ['cardiologie'], description: 'Antihypertenseurs, anticoagulants' },
    neurology: { label: 'Neurologie', pathologies: ['neurologie', 'psychiatrie'], description: 'Psychotropes, antiépileptiques' },
    infectiology: { label: 'Infectiologie', pathologies: ['infectiologie'], description: 'Antibiotiques, antiviraux' },
    metabolic: { label: 'Métabolique', pathologies: ['diabete', 'cardiologie'], description: 'Diabète et syndrome métabolique' }
};

/**
 * Find the best matching pathology for a user query
 */
export function findPathologyMatch(query: string): PathologyMapping | null {
    const normalizedQuery = query.toLowerCase().trim();

    // Direct match on key
    if (PATHOLOGY_MAPPINGS[normalizedQuery]) {
        return PATHOLOGY_MAPPINGS[normalizedQuery];
    }

    // Search in aliases
    for (const [key, mapping] of Object.entries(PATHOLOGY_MAPPINGS)) {
        for (const alias of mapping.aliases) {
            if (normalizedQuery.includes(alias) || alias.includes(normalizedQuery)) {
                return mapping;
            }
        }
    }

    // Keyword search
    for (const [key, mapping] of Object.entries(PATHOLOGY_MAPPINGS)) {
        for (const keyword of mapping.keywords) {
            if (normalizedQuery.includes(keyword)) {
                return mapping;
            }
        }
    }

    return null;
}

/**
 * Filter and prioritize medications based on target pathology
 * @param medications Full medication list
 * @param pathologyQuery User's pathology query
 * @returns Filtered and sorted medications (most relevant first)
 */
export function filterMedicationsByPathology(
    medications: any[],
    pathologyQuery: string
): { filtered: any[], pathologyContext: PathologyMapping | null } {
    const pathologyContext = findPathologyMatch(pathologyQuery);

    if (!pathologyContext) {
        // No match - return all medications with custom context
        return {
            filtered: medications,
            pathologyContext: {
                name: pathologyQuery,
                aliases: [pathologyQuery.toLowerCase()],
                atcPrefixes: [],
                therapeuticClasses: [],
                keywords: [pathologyQuery.toLowerCase()],
                priority: 5
            }
        };
    }

    // Score each medication based on relevance
    const scored = medications.map(med => {
        let score = 0;
        const atcCode = med.atc_code || med.properties?.atc_code || '';
        const name = med.name.toLowerCase();

        // ATC prefix match (highest priority)
        for (const prefix of pathologyContext.atcPrefixes) {
            if (atcCode.startsWith(prefix)) {
                score += 100;
                break;
            }
        }

        // Therapeutic class match
        for (const tc of pathologyContext.therapeuticClasses) {
            if (name.includes(tc.toLowerCase()) ||
                (med.properties?.therapeutic_class || '').toLowerCase().includes(tc)) {
                score += 50;
            }
        }

        // Keyword match
        for (const kw of pathologyContext.keywords) {
            if (name.includes(kw.toLowerCase())) {
                score += 25;
            }
        }

        return { ...med, _relevanceScore: score };
    });

    // Sort by relevance score (descending), then by name
    scored.sort((a, b) => {
        if (b._relevanceScore !== a._relevanceScore) {
            return b._relevanceScore - a._relevanceScore;
        }
        return a.name.localeCompare(b.name);
    });

    // For pathology-targeted analysis, prioritize relevant meds but keep others
    // Put high-relevance meds first, then others
    const highRelevance = scored.filter(m => m._relevanceScore >= 50);
    const mediumRelevance = scored.filter(m => m._relevanceScore > 0 && m._relevanceScore < 50);
    const lowRelevance = scored.filter(m => m._relevanceScore === 0);

    console.log(`Pathology "${pathologyContext.name}": ${highRelevance.length} high, ${mediumRelevance.length} medium, ${lowRelevance.length} low relevance`);

    return {
        filtered: [...highRelevance, ...mediumRelevance, ...lowRelevance],
        pathologyContext
    };
}

/**
 * Build a pathology-aware system prompt
 */
export function buildPathologyPrompt(pathologyContext: PathologyMapping | null, basePrompt: string): string {
    if (!pathologyContext) {
        return basePrompt;
    }

    return `${basePrompt}

CONTEXTE PATHOLOGIQUE: ${pathologyContext.name}
Classes thérapeutiques prioritaires: ${pathologyContext.therapeuticClasses.join(', ')}
Codes ATC pertinents: ${pathologyContext.atcPrefixes.join(', ')}

INSTRUCTIONS SPÉCIFIQUES:
- Priorise les interactions pertinentes pour ${pathologyContext.name}
- Évalue les risques spécifiques à cette pathologie
- Considère les comorbidités fréquentes
- Note les ajustements posologiques potentiels
- Identifie les contre-indications absolues pour ce contexte`;
}

/**
 * Generate contextual user prompt for pathology-focused analysis
 */
export function buildPathologyUserPrompt(
    entityA: any,
    remainingEntities: any[],
    pathologyContext: PathologyMapping | null
): string {
    const entityType = entityA.node_type || 'substance';
    const entitiesList = remainingEntities.slice(0, 25).map((e: any, i: number) =>
        `${i + 1}. [${(e.node_type || 'substance').toUpperCase()}] ${e.name}${e._relevanceScore ? ` (pertinence: ${e._relevanceScore})` : ''}`
    ).join("\n");

    let contextSection = '';
    if (pathologyContext) {
        contextSection = `
CONTEXTE D'ANALYSE: ${pathologyContext.name}
Cette analyse cible spécifiquement les interactions pertinentes pour ${pathologyContext.name}.
Classes thérapeutiques d'intérêt: ${pathologyContext.therapeuticClasses.slice(0, 5).join(', ')}
`;
    }

    return `ENTITÉ PRINCIPALE: [${entityType.toUpperCase()}] ${entityA.name}
${(entityA.properties as any)?.atc_prefix ? `Code ATC: ${(entityA.properties as any).atc_prefix}` : ''}
${contextSection}
ENTITÉS À TESTER:
${entitiesList}

Analyse chaque paire et retourne un JSON:
{
  "pairs": [
    {
      "entity_b_name": "nom",
      "entity_b_type": "substance|pathology|medication",
      "is_documented": true/false,
      "discovery_type": "interaction|synergie|contre-indication|risque_combine|aggravation|benefice|aucun",
      "plausibility_score": 0.0-1.0,
      "severity": "faible|moderee|elevee|critique",
      "therapeutic_relevance": 0.0-1.0,
      "reasoning": "explication courte du mécanisme",
      "mechanism": "mécanisme pharmacologique/physiologique",
      "recommendation": "action recommandée"${pathologyContext ? `,
      "pathology_specific_note": "note spécifique à ${pathologyContext.name}"` : ''}
    }
  ],
  "synthesis": "résumé des découvertes non documentées pour ${entityA.name}${pathologyContext ? ` dans le contexte de ${pathologyContext.name}` : ''}"
}`;
}
