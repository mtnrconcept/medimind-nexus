// ============================================
// RADIAL RINGS ENGINE - MICRO-SIGNAL DETECTOR
// ============================================
// Détecte les signaux faibles triangulés (≥2 angles)

import {
    RingNode, RingEdge, MicroSignal, TriangulationAngles
} from './types.ts';

// ============================================
// TRIANGULATION FUNCTIONS
// ============================================

/**
 * Check if an edge has epidemiological support
 */
function hasEpidemiologicalEvidence(
    edge: RingEdge,
    nodes: Map<string, RingNode>
): boolean {
    // Keywords suggesting epidemiological evidence
    const epidemioKeywords = ['cohort', 'population', 'prevalence', 'incidence', 'risk factor', 'case-control'];

    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);

    if (!source || !target) return false;

    // Check if any source mentions epidemiological study
    const allSources = [...(source.sources || []), ...(target.sources || [])];
    const justification = edge.justification.toLowerCase();

    return epidemioKeywords.some(kw => justification.includes(kw)) ||
        allSources.length > 2; // Multiple sources suggest epidemiological pattern
}

/**
 * Check if an edge has mechanistic support
 */
function hasMechanisticEvidence(
    edge: RingEdge,
    nodes: Map<string, RingNode>
): boolean {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);

    if (!source || !target) return false;

    // Check if involves mechanism lane
    if (source.lane === 'mechanisms' || target.lane === 'mechanisms') return true;

    // Check for mechanistic keywords
    const mechKeywords = ['pathway', 'upregulate', 'downregulate', 'inhibit', 'activate',
        'receptor', 'enzyme', 'signaling', 'cascade', 'mechanism'];

    const props = JSON.stringify({ ...source.properties, ...target.properties }).toLowerCase();
    return mechKeywords.some(kw => props.includes(kw));
}

/**
 * Check if an edge has pharmacological support
 */
function hasPharmacologicalEvidence(
    edge: RingEdge,
    nodes: Map<string, RingNode>
): boolean {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);

    if (!source || !target) return false;

    // Check if involves drug-related lanes
    const pharmaLanes = ['drugs', 'adverse_events', 'interactions'];
    return pharmaLanes.includes(source.lane) || pharmaLanes.includes(target.lane);
}

/**
 * Check if an edge has genetic/epigenetic support
 */
function hasGeneticEvidence(
    edge: RingEdge,
    nodes: Map<string, RingNode>
): boolean {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);

    if (!source || !target) return false;

    // Check if involves genetics or exposure lanes
    const geneticLanes = ['genetics', 'exposures'];
    if (geneticLanes.includes(source.lane) || geneticLanes.includes(target.lane)) return true;

    // Check for genetic keywords
    const geneticKeywords = ['gene', 'mutation', 'polymorphism', 'methylation', 'epigenetic',
        'histone', 'dna', 'rna', 'transcription', 'expression', 'allele'];

    const allText = `${source.name} ${target.name}`.toLowerCase();
    return geneticKeywords.some(kw => allText.includes(kw));
}

// ============================================
// HYPOTHESIS GENERATION
// ============================================

/**
 * Generate testable hypothesis from an edge
 */
function generateHypothesis(
    edge: RingEdge,
    nodes: Map<string, RingNode>
): string {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);

    if (!source || !target) return '';

    // Template based on relationship
    const templates: Record<string, string> = {
        'causes_AE': `Si ${source.name} cause vraiment ${target.name}, alors les patients exposés devraient montrer une incidence significativement plus élevée.`,
        'associated_with': `Si ${source.name} est associé à ${target.name}, alors une intervention sur ${source.name} devrait modifier ${target.name}.`,
        'upregulates': `Si ${source.name} active ${target.name}, alors l'inhibition de ${source.name} devrait réduire l'expression/activité de ${target.name}.`,
        'biomarker_of': `Si ${source.name} est un biomarqueur de ${target.name}, alors les niveaux de ${source.name} devraient corréler avec la sévérité de ${target.name}.`
    };

    return templates[edge.relationship] ||
        `Si ${source.name} → ${target.name} existe, alors une modification de ${source.name} devrait impacter ${target.name} de manière mesurable.`;
}

/**
 * Generate falsification test
 */
function generateFalsificationTest(
    edge: RingEdge,
    nodes: Map<string, RingNode>
): string {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);

    if (!source || !target) return '';

    // Based on lane combinations
    if (source.lane === 'exposures' && target.lane === 'genetics') {
        return `Étude cas-témoins: comparer méthylome/épigénome des enfants avec ${source.name} vs contrôles appariés. Chercher différences significatives dans régions liées à ${target.name}.`;
    }

    if (source.lane === 'drugs' && target.lane === 'adverse_events') {
        return `Analyse de disproportionnalité dans bases pharmacovigilance (FAERS/EudraVigilance). Calculer ROR/PRR pour ${source.name} → ${target.name}.`;
    }

    if (source.lane === 'genetics' && target.lane === 'mechanisms') {
        return `Étude in vitro: knockdown/knockout de ${source.name} et mesure de l'activité de ${target.name}. Confirmer par rescue experiment.`;
    }

    return `Étude observationnelle prospective: mesurer ${target.name} avant/après modification de ${source.name} dans une cohorte appropriée.`;
}

/**
 * Generate kill criteria
 */
function generateKillCriteria(
    edge: RingEdge,
    nodes: Map<string, RingNode>
): string {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);

    if (!source || !target) return '';

    return `Réfuter si: (1) Aucune différence significative (p > 0.05) entre groupes exposés/non-exposés, (2) Direction de l'effet opposée à celle prédite, (3) Effet expliqué par confondeurs identifiés.`;
}

/**
 * Generate expected biomarker
 */
function generateExpectedBiomarker(
    edge: RingEdge,
    nodes: Map<string, RingNode>
): string {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);

    if (!source || !target) return '';

    if (target.lane === 'biomarkers') return target.name;

    if (source.lane === 'exposures') {
        return `Profil méthylation différentielle dans régions liées à ${target.name}`;
    }

    if (target.lane === 'genetics') {
        return `Expression génique de ${target.name} (qPCR, RNA-seq)`;
    }

    return `Biomarqueur proxy pour ${target.name}`;
}

/**
 * Generate PubMed queries for further research
 */
function generatePubMedQueries(
    edge: RingEdge,
    nodes: Map<string, RingNode>
): string[] {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);

    if (!source || !target) return [];

    const queries: string[] = [];

    // Base query
    queries.push(`"${source.name}" "${target.name}"`);

    // If exposure → genetics
    if (source.lane === 'exposures') {
        queries.push(`paternal preconception "${source.properties?.agent || source.name}" offspring epigenetic`);
        queries.push(`"${source.properties?.agent || source.name}" sperm DNA methylation`);
    }

    // If involves mechanism
    if (source.lane === 'mechanisms' || target.lane === 'mechanisms') {
        queries.push(`"${source.name}" mechanism "${target.name}" pathway`);
    }

    // Domain-specific
    if (edge.relationship === 'causes_AE') {
        queries.push(`"${source.name}" adverse event "${target.name}" pharmacovigilance`);
    }

    return queries.slice(0, 5);
}

// ============================================
// MAIN DETECTION FUNCTION
// ============================================

/**
 * Detect micro-signals from weak edges with triangulation
 */
export function detectMicroSignals(
    edges: RingEdge[],
    nodes: RingNode[],
    minTriangulation: number = 2
): MicroSignal[] {
    console.log(`[MICRO-SIGNAL] Analyzing ${edges.length} edges for weak signals...`);

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const microSignals: MicroSignal[] = [];

    // Filter to weak/rare edges (candidates for micro-signals)
    const weakEdges = edges.filter(edge =>
        edge.evidence_grade === 'D' ||
        edge.translation_gap === true ||
        edge.weight < 0.4
    );

    console.log(`[MICRO-SIGNAL] Found ${weakEdges.length} weak edges`);

    for (const edge of weakEdges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);

        if (!source || !target) continue;

        // Calculate triangulation
        const angles: TriangulationAngles = {
            epidemio: hasEpidemiologicalEvidence(edge, nodeMap),
            mechanism: hasMechanisticEvidence(edge, nodeMap),
            pharma: hasPharmacologicalEvidence(edge, nodeMap),
            genetic: hasGeneticEvidence(edge, nodeMap)
        };

        const triangulationScore = Object.values(angles).filter(Boolean).length;

        // Only include if meets minimum triangulation
        if (triangulationScore >= minTriangulation) {
            const signal: MicroSignal = {
                id: `signal_${edge.id}`,
                observation: `${source.name} → ${target.name} (${edge.relationship})`,
                entity: source.name,
                mechanism_path: [source.name, edge.relationship, target.name],
                expected_biomarker: generateExpectedBiomarker(edge, nodeMap),
                testable_hypothesis: generateHypothesis(edge, nodeMap),
                falsification_test: generateFalsificationTest(edge, nodeMap),
                kill_criteria: generateKillCriteria(edge, nodeMap),
                triangulation_angles: angles,
                triangulation_score: triangulationScore,
                supporting_edges: [edge.id],
                confidence: (triangulationScore / 4) * (1 - (edge.translation_gap ? 0.3 : 0)),
                pubmed_queries: generatePubMedQueries(edge, nodeMap)
            };

            microSignals.push(signal);
        }
    }

    // Sort by triangulation score and confidence
    microSignals.sort((a, b) => {
        if (b.triangulation_score !== a.triangulation_score) {
            return b.triangulation_score - a.triangulation_score;
        }
        return b.confidence - a.confidence;
    });

    console.log(`[MICRO-SIGNAL] Detected ${microSignals.length} micro-signals (min triangulation: ${minTriangulation})`);

    return microSignals;
}

// ============================================
// SPECIAL CASE: PARENTAL EXPOSURE SIGNALS
// ============================================

/**
 * Specifically detect signals related to parental preconception exposures
 */
export function detectParentalExposureSignals(
    edges: RingEdge[],
    nodes: RingNode[]
): MicroSignal[] {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Find exposure nodes
    const exposureNodes = nodes.filter(n => n.lane === 'exposures');
    const geneticNodes = nodes.filter(n => n.lane === 'genetics');

    const signals: MicroSignal[] = [];

    for (const exposure of exposureNodes) {
        // Find edges connecting this exposure to genetic nodes
        const relatedEdges = edges.filter(e =>
            (e.source === exposure.id && geneticNodes.some(g => g.id === e.target)) ||
            (e.target === exposure.id && geneticNodes.some(g => g.id === e.source))
        );

        if (relatedEdges.length > 0) {
            // Create specialized micro-signal for parental exposure
            const signal: MicroSignal = {
                id: `signal_parental_${exposure.id}`,
                observation: `Exposition parentale préconceptionnelle: ${exposure.name}`,
                entity: exposure.name,
                mechanism_path: [
                    exposure.name,
                    'altération épigénétique germinale',
                    'transmission transgénérationnelle',
                    'dysfonction podocyte/immune chez descendant'
                ],
                expected_biomarker: 'Profil méthylation différentielle dans régions NPHS1/NPHS2/WT1/CD2AP',
                testable_hypothesis: `Si ${exposure.properties?.agent || exposure.name} altère l'épigénome spermatique, alors les enfants de pères exposés devraient montrer des marques épigénétiques spécifiques dans les gènes du podocyte.`,
                falsification_test: `Étude cas-témoins: comparer le méthylome sanguin (proxy) d'enfants atteints de syndrome néphrotique avec père ayant consommé ${exposure.properties?.agent || 'la substance'} vs contrôles appariés sans exposition paternelle.`,
                kill_criteria: `Réfuter si: (1) Aucune différence de méthylation significative, (2) Les régions différentielles ne chevauchent pas les gènes du podocyte ou du système immunitaire, (3) Base-rate idiopathique (>80%) explique mieux les données.`,
                triangulation_angles: {
                    epidemio: false,
                    mechanism: true,  // Preclinical data exists
                    pharma: false,
                    genetic: true     // Epigenetic mechanism proposed
                },
                triangulation_score: 2,
                supporting_edges: relatedEdges.map(e => e.id),
                confidence: 0.25,  // Low confidence - mostly preclinical
                pubmed_queries: [
                    `paternal preconception ${exposure.properties?.agent || 'drug'} offspring epigenetic`,
                    `${exposure.properties?.agent || 'substance'} sperm DNA methylation histone`,
                    `nephrotic syndrome child epigenetics podocyte immune`,
                    `transgenerational inheritance drug exposure kidney`
                ]
            };

            signals.push(signal);
        }
    }

    return signals;
}
