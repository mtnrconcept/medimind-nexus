// ============================================
// RADIAL RINGS ENGINE - COUNTER-HYPOTHESIS GENERATOR
// ============================================
// Génère des contre-hypothèses pour anti-biais (base-rate discipline)

import {
    MicroSignal, CounterHypothesis, EvidenceGrade, RingNode
} from './types.ts';

// ============================================
// BASE RATE DATABASE
// ============================================

// Known base rates for common conditions
const BASE_RATES: Record<string, { rate: number; source: string }> = {
    'nephrotic_syndrome_idiopathic': { rate: 0.80, source: 'KDIGO 2025 Guidelines' },
    'nephrotic_syndrome_steroid_sensitive': { rate: 0.85, source: 'IPNA Consensus' },
    'nephrotic_syndrome_minimal_change': { rate: 0.75, source: 'CJASN 2017' },
    'nephrotic_syndrome_genetic': { rate: 0.15, source: 'Pediatric Nephrology' },
    'relapse_after_infection': { rate: 0.40, source: 'Clinical series' },
    'relapse_after_vaccination': { rate: 0.05, source: 'Case reports only' }
};

// ============================================
// CONFOUNDER TEMPLATES
// ============================================

interface ConfounderTemplate {
    name: string;
    description: string;
    conditions: string[];
    evidence: EvidenceGrade;
}

const COMMON_CONFOUNDERS: ConfounderTemplate[] = [
    {
        name: 'Infection virale intercurrente',
        description: 'Les infections ORL virales sont des triggers bien documentés de rechute de syndrome néphrotique, avec une prévalence élevée chez les enfants.',
        conditions: ['nephrotic_syndrome', 'relapse'],
        evidence: 'A'
    },
    {
        name: 'Atopie / terrain allergique',
        description: 'L\'atopie est associée au syndrome néphrotique à changements minimes chez l\'enfant, représentant un facteur de risque connu.',
        conditions: ['nephrotic_syndrome', 'minimal_change'],
        evidence: 'B'
    },
    {
        name: 'Variabilité génétique inter-individuelle',
        description: 'Les mutations germinales dans NPHS1, NPHS2, WT1 expliquent 10-30% des cas résistants aux stéroïdes.',
        conditions: ['nephrotic_syndrome', 'steroid_resistant'],
        evidence: 'A'
    },
    {
        name: 'Exposition environnementale directe',
        description: 'Exposition directe de l\'enfant à des toxines environnementales (pollution, pesticides) plutôt qu\'exposition parentale préconceptionnelle.',
        conditions: ['nephrotic_syndrome', 'toxicity'],
        evidence: 'C'
    },
    {
        name: 'Biais de rappel parental',
        description: 'Les parents d\'enfants malades ont tendance à sur-reporter des expositions passées, créant un biais de rappel.',
        conditions: ['all'],
        evidence: 'B'
    }
];

// ============================================
// ALTERNATIVE MECHANISM TEMPLATES
// ============================================

interface AlternativeMechanism {
    name: string;
    mechanism: string;
    applicableTo: string[];
    evidenceStrength: EvidenceGrade;
}

const ALTERNATIVE_MECHANISMS: AlternativeMechanism[] = [
    {
        name: 'Dysrégulation immunitaire primaire',
        mechanism: 'Déséquilibre Th1/Th2 ou défaut de cellules T régulatrices indépendant de facteurs épigénétiques hérités.',
        applicableTo: ['immune', 'T_cell', 'cytokine'],
        evidenceStrength: 'A'
    },
    {
        name: 'Facteur circulant non identifié',
        mechanism: 'Un facteur de perméabilité plasmatique non caractérisé altère directement la barrière de filtration glomérulaire.',
        applicableTo: ['podocyte', 'permeability', 'filtration'],
        evidenceStrength: 'B'
    },
    {
        name: 'Dysfonction podocytaire intrinsèque',
        mechanism: 'Mutation somatique acquise ou stress cellulaire direct sur les podocytes, sans contribution épigénétique germinale.',
        applicableTo: ['podocyte', 'cytoskeleton', 'barrier'],
        evidenceStrength: 'B'
    },
    {
        name: 'Microbiome dysbiosis',
        mechanism: 'Altération du microbiome intestinal modifiant la réponse immunitaire et la perméabilité intestinale.',
        applicableTo: ['immune', 'inflammation', 'gut'],
        evidenceStrength: 'C'
    }
];

// ============================================
// COUNTER-HYPOTHESIS GENERATION
// ============================================

/**
 * Generate base rate counter-hypothesis
 */
function generateBaseRateCounterHypothesis(
    signal: MicroSignal,
    pathologyContext: string
): CounterHypothesis | null {
    // Find applicable base rate
    let bestMatch: { key: string; rate: number; source: string } | null = null;

    for (const [key, value] of Object.entries(BASE_RATES)) {
        if (pathologyContext.toLowerCase().includes(key.split('_')[0])) {
            if (!bestMatch || value.rate > bestMatch.rate) {
                bestMatch = { key, ...value };
            }
        }
    }

    if (!bestMatch) return null;

    return {
        id: `counter_baserate_${signal.id}`,
        claim: `Cause idiopathique (taux de base: ${(bestMatch.rate * 100).toFixed(0)}%)`,
        type: 'base_rate',
        why_stronger: `La majorité des cas de cette pathologie sont idiopathiques (${(bestMatch.rate * 100).toFixed(0)}%). Une cause identifiable n'est trouvée que dans ${((1 - bestMatch.rate) * 100).toFixed(0)}% des cas. Le signal détecté doit donc expliquer plus que le bruit de fond.`,
        why_weaker: `Si le micro-signal montre une association spécifique et reproductible, il pourrait identifier un sous-groupe au sein des cas "idiopathiques".`,
        base_rate: bestMatch.rate,
        refs: [bestMatch.source],
        evidence_grade: 'A'
    };
}

/**
 * Generate confounder counter-hypotheses
 */
function generateConfounderCounterHypotheses(
    signal: MicroSignal,
    pathologyContext: string
): CounterHypothesis[] {
    const counters: CounterHypothesis[] = [];

    for (const confounder of COMMON_CONFOUNDERS) {
        // Check if confounder is applicable
        const isApplicable = confounder.conditions.includes('all') ||
            confounder.conditions.some(c => pathologyContext.toLowerCase().includes(c));

        if (isApplicable) {
            counters.push({
                id: `counter_conf_${signal.id}_${confounder.name.substring(0, 20)}`,
                claim: confounder.name,
                type: 'confounder',
                why_stronger: confounder.description,
                why_weaker: `Ce confondeur ne serait pas applicable si le signal montre une spécificité pour l'exposition identifiée (${signal.entity}) après ajustement pour ce facteur.`,
                refs: [],
                evidence_grade: confounder.evidence
            });
        }
    }

    return counters.slice(0, 3); // Limit to top 3 confounders
}

/**
 * Generate alternative mechanism counter-hypotheses
 */
function generateAlternativeMechanismCounterHypotheses(
    signal: MicroSignal
): CounterHypothesis[] {
    const counters: CounterHypothesis[] = [];
    const signalText = JSON.stringify(signal).toLowerCase();

    for (const mechanism of ALTERNATIVE_MECHANISMS) {
        // Check if mechanism is relevant based on signal content
        const isRelevant = mechanism.applicableTo.some(term =>
            signalText.includes(term.toLowerCase())
        );

        if (isRelevant) {
            counters.push({
                id: `counter_mech_${signal.id}_${mechanism.name.substring(0, 20)}`,
                claim: mechanism.name,
                type: 'alternative_mechanism',
                why_stronger: mechanism.mechanism,
                why_weaker: `Cette hypothèse alternative n'expliquerait pas la spécificité de l'association avec ${signal.entity} si celle-ci est confirmée par des études de réplication.`,
                refs: [],
                evidence_grade: mechanism.evidenceStrength
            });
        }
    }

    return counters.slice(0, 2); // Limit to 2 alternative mechanisms
}

/**
 * Check for contradicting evidence
 */
function generateContradictingEvidenceCounter(
    signal: MicroSignal
): CounterHypothesis | null {
    // If translation gap exists, flag it
    if (signal.triangulation_angles.epidemio === false) {
        return {
            id: `counter_contra_${signal.id}`,
            claim: 'Absence de preuve épidémiologique humaine',
            type: 'contradicting_evidence',
            why_stronger: `Le signal est basé uniquement sur des données précliniques ou mécanistiques. Aucune étude épidémiologique n'a confirmé cette association chez l'humain, suggérant un "translation gap" significatif.`,
            why_weaker: `L'absence de preuve n'est pas preuve d'absence. Des études épidémiologiques ciblées pourraient révéler une association masquée par la rareté du phénotype.`,
            refs: [],
            evidence_grade: 'D'
        };
    }

    return null;
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Generate all counter-hypotheses for a set of micro-signals
 */
export function generateCounterHypotheses(
    microSignals: MicroSignal[],
    pathologyContext: string,
    maxCountersPerSignal: number = 3
): Map<string, CounterHypothesis[]> {
    console.log(`[COUNTER-HYPOTHESIS] Generating counter-hypotheses for ${microSignals.length} signals...`);

    const counterMap = new Map<string, CounterHypothesis[]>();

    for (const signal of microSignals) {
        const counters: CounterHypothesis[] = [];

        // 1. Base rate counter
        const baseRateCounter = generateBaseRateCounterHypothesis(signal, pathologyContext);
        if (baseRateCounter) counters.push(baseRateCounter);

        // 2. Confounder counters
        const confounderCounters = generateConfounderCounterHypotheses(signal, pathologyContext);
        counters.push(...confounderCounters);

        // 3. Alternative mechanism counters
        const mechCounters = generateAlternativeMechanismCounterHypotheses(signal);
        counters.push(...mechCounters);

        // 4. Contradicting evidence
        const contraCounter = generateContradictingEvidenceCounter(signal);
        if (contraCounter) counters.push(contraCounter);

        // Sort by evidence strength and limit
        counters.sort((a, b) => {
            const gradeOrder: EvidenceGrade[] = ['A', 'B', 'C', 'D'];
            return gradeOrder.indexOf(a.evidence_grade) - gradeOrder.indexOf(b.evidence_grade);
        });

        counterMap.set(signal.id, counters.slice(0, maxCountersPerSignal));
    }

    console.log(`[COUNTER-HYPOTHESIS] Generated ${[...counterMap.values()].flat().length} total counter-hypotheses`);

    return counterMap;
}

/**
 * Score a micro-signal against its counter-hypotheses
 * Returns adjusted confidence score
 */
export function adjustConfidenceWithCounterHypotheses(
    signal: MicroSignal,
    counters: CounterHypothesis[]
): number {
    let adjustedConfidence = signal.confidence;

    for (const counter of counters) {
        // Base rate penalty
        if (counter.type === 'base_rate' && counter.base_rate) {
            // If base rate is high (>0.7), significantly penalize exotic hypotheses
            if (counter.base_rate > 0.7) {
                adjustedConfidence *= (1 - counter.base_rate * 0.5);
            }
        }

        // Evidence strength penalty
        const evidencePenalty: Record<EvidenceGrade, number> = {
            'A': 0.15,
            'B': 0.10,
            'C': 0.05,
            'D': 0.02
        };
        adjustedConfidence -= evidencePenalty[counter.evidence_grade];
    }

    // Boost if triangulation is strong despite counter-hypotheses
    if (signal.triangulation_score >= 3) {
        adjustedConfidence += 0.1;
    }

    return Math.max(0.05, Math.min(0.95, adjustedConfidence));
}
