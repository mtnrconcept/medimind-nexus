import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/ai-client.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// KNOWLEDGE EXTRACTOR
// NER + Relation Extraction + Evidence Classification
// Uses OpenAI for advanced extraction
// ============================================

// Entity types for medical NER
const ENTITY_TYPES = {
    GENE: {
        patterns: [
            /\b([A-Z][A-Z0-9]{1,10})\b/g, // Gene symbols like BRCA1, TP53
            /\b(gene|locus|allele)\s+([A-Za-z0-9\-]+)/gi,
        ],
        color: '#8b5cf6'
    },
    PROTEIN: {
        patterns: [
            /\b(IL-\d+[a-z]?|TNF-?α?|NF-κB|NLRP3|TREM2|TLR\d|CD\d+|STAT\d|JAK\d|MAPK|ERK|AKT|mTOR|Bcl-?\d|caspase-?\d|cytochrome|kinase|receptor|enzyme)\b/gi,
        ],
        color: '#06b6d4'
    },
    DRUG: {
        patterns: [
            /\b(\w+mab|\w+nib|\w+pril|\w+sartan|\w+statin|\w+prazole|\w+azole|\w+mycin|\w+cillin)\b/gi,
            /\b(aspirin|ibuprofen|metformin|insulin|dopamine|serotonin|levodopa|carbidopa)\b/gi,
        ],
        color: '#f59e0b'
    },
    DISEASE: {
        patterns: [
            /\b(Parkinson|Alzheimer|Huntington|ALS|sclerosis|diabetes|cancer|carcinoma|leukemia|lymphoma|melanoma|arthritis|lupus|Crohn|colitis|asthma|COPD|hypertension|stroke|infarction|fibrosis|cirrhosis|hepatitis|nephropathy|neuropathy)\b/gi,
            /\b(\w+itis|\w+osis|\w+emia|\w+oma)\b/gi,
        ],
        color: '#ef4444'
    },
    PATHWAY: {
        patterns: [
            /\b(pathway|signaling|cascade|axis|loop|cycle|glycolysis|gluconeogenesis|oxidative phosphorylation|Krebs|TCA|pentose|β-oxidation|apoptosis|autophagy|necrosis|ferroptosis|pyroptosis|inflammasome|complement)\b/gi,
        ],
        color: '#22c55e'
    },
    PHENOTYPE: {
        patterns: [
            /\b(inflammation|necrosis|atrophy|hypertrophy|hyperplasia|dysplasia|metaplasia|fibrosis|edema|hemorrhage|ischemia|hypoxia|oxidative stress|mitochondrial dysfunction|synaptic loss|neurodegeneration|demyelination)\b/gi,
        ],
        color: '#ec4899'
    },
    CELL_TYPE: {
        patterns: [
            /\b(neuron|astrocyte|microglia|oligodendrocyte|macrophage|lymphocyte|T[ -]?cell|B[ -]?cell|NK[ -]?cell|monocyte|neutrophil|eosinophil|basophil|mast cell|dendritic cell|fibroblast|epithelial|endothelial|stem cell)\b/gi,
        ],
        color: '#14b8a6'
    },
    MOLECULE: {
        patterns: [
            /\b(ATP|ADP|AMP|NAD\+?|NADH|FADH?2?|CoA|acetyl-CoA|glucose|pyruvate|lactate|glutamate|GABA|dopamine|serotonin|norepinephrine|acetylcholine|adenosine|calcium|potassium|sodium|iron|zinc|copper)\b/gi,
        ],
        color: '#a855f7'
    }
};

// Relation types
const RELATION_PATTERNS = {
    INHIBITS: {
        patterns: [/\b(inhibit|block|suppress|antagonize|downregulate|reduce|decrease|attenuate|prevent|impair)\w*\b/gi],
        type: 'negative'
    },
    ACTIVATES: {
        patterns: [/\b(activate|stimulate|induce|enhance|upregulate|increase|promote|trigger|amplify|potentiate)\w*\b/gi],
        type: 'positive'
    },
    BINDS: {
        patterns: [/\b(bind|interact|associate|attach|dock|complex)\w*\b/gi],
        type: 'neutral'
    },
    REGULATES: {
        patterns: [/\b(regulat|modulat|control|mediat|orchestrat)\w*\b/gi],
        type: 'neutral'
    },
    CAUSES: {
        patterns: [/\b(caus|lead|result|induc|trigger|produc|generat)\w*\s+(in|to)\b/gi],
        type: 'causal'
    },
    TREATS: {
        patterns: [/\b(treat|therap|ameliorat|improv|alleviat|cur|remed|heal)\w*\b/gi],
        type: 'therapeutic'
    },
    BIOMARKER_FOR: {
        patterns: [/\b(biomarker|marker|indicator|predictor|signature|diagnostic)\s+(of|for)\b/gi],
        type: 'diagnostic'
    },
    ASSOCIATED_WITH: {
        patterns: [/\b(associat|correlat|link|relat|connect)\w*\s+(with|to)\b/gi],
        type: 'association'
    }
};

// Evidence level patterns
const EVIDENCE_PATTERNS = {
    META_ANALYSIS: {
        patterns: [/\b(meta-analysis|systematic review|pooled analysis|meta analysis)\b/gi],
        level: 'meta_analysis',
        strength: 5
    },
    CLINICAL_TRIAL: {
        patterns: [/\b(randomized|RCT|clinical trial|phase [I-IV]|double-blind|placebo-controlled|prospective|cohort)\b/gi],
        level: 'clinical',
        strength: 4
    },
    OBSERVATIONAL: {
        patterns: [/\b(observational|retrospective|case-control|cross-sectional|epidemiological)\b/gi],
        level: 'clinical',
        strength: 3
    },
    IN_VIVO: {
        patterns: [/\b(in vivo|animal model|mouse|rat|primate|rodent|xenograft)\b/gi],
        level: 'in_vivo',
        strength: 2
    },
    IN_VITRO: {
        patterns: [/\b(in vitro|cell line|cell culture|primary cells|organoid)\b/gi],
        level: 'in_vitro',
        strength: 1
    }
};

// Node types for the color system (WHAT)
type NodeType = 'MEDICATION' | 'TREATMENT' | 'SYMPTOM' | 'PATHOLOGY' | 'COMPLICATION' | 'ANALYSIS' | 'SUGGESTION';

// Label states for qualification (STATE)
type LabelState = 'VALIDATED' | 'SUBOPTIMAL' | 'MONITORING' | 'HIGH_RISK' | 'CONTRAINDICATED' | 'HYPOTHESIS' | 'NEUTRAL';

// Edge relations for links (RELATION/RISK)
type EdgeRelation = 'TREATS_NO_SE' | 'TREATS_PARTIAL' | 'PREVENTIVE' | 'MEASURES' | 'SIDE_EFFECT' | 'POSSIBLE_SE' | 'CONTRAINDICATION' | 'CRITICAL_CI' | 'ASSOCIATED';

interface Entity {
    text: string;
    type: string;              // Legacy type from NER
    node_type: NodeType;       // New: color system node type
    label_state: LabelState;   // New: qualification state
    start: number;
    end: number;
    confidence: number;
    risk_score?: number;       // New: risk level 0-1
    priority_score?: number;   // New: combined priority 0-1
}

interface Relation {
    subject: Entity | { text: string };
    predicate: string;         // Legacy predicate
    edge_relation: EdgeRelation; // New: typed edge relation
    object: Entity | { text: string };
    evidence_text: string;
    confidence: number;
    risk_level?: number;       // New: 0-5 scale
    is_critical?: boolean;     // New: CI_CRITICAL flag
}

interface EvidenceLevel {
    level: 'meta_analysis' | 'clinical' | 'in_vivo' | 'in_vitro' | 'unknown';
    strength: number;
    indicators: string[];
}

interface ScoringOutput {
    confidence_score: number;
    risk_score: number;
    action_score: number;
    priority_score: number;
}

interface ExtractionResult {
    entities: Entity[];
    relations: Relation[];
    evidence_level: EvidenceLevel;
    scoring?: ScoringOutput;   // New: global scoring
    summary: {
        entity_counts: Record<string, number>;
        relation_counts: Record<string, number>;
        node_type_counts?: Record<string, number>;   // New
        label_state_counts?: Record<string, number>; // New
        edge_relation_counts?: Record<string, number>; // New
    };
}

// Simple pattern-based NER
function extractEntitiesSimple(text: string): Entity[] {
    const entities: Entity[] = [];
    const seen = new Set<string>();

    for (const [type, config] of Object.entries(ENTITY_TYPES)) {
        for (const pattern of config.patterns) {
            // Reset regex state
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const entityText = match[1] || match[0];
                const key = `${type}:${entityText.toLowerCase()}`;

                if (!seen.has(key) && entityText.length > 1) {
                    seen.add(key);
                    const nodeType = mapToNodeType(type);
                    entities.push({
                        text: entityText,
                        type,
                        node_type: nodeType,
                        label_state: 'NEUTRAL', // Default, will be refined later
                        start: match.index,
                        end: match.index + entityText.length,
                        confidence: 0.7,
                        risk_score: 0.1
                    });
                }
            }
        }
    }

    return entities;
}

// Extract relations between entities
function extractRelations(text: string, entities: Entity[]): Relation[] {
    const relations: Relation[] = [];
    const sentences = text.split(/[.!?]+/);

    for (const sentence of sentences) {
        const sentenceEntities = entities.filter(e =>
            sentence.toLowerCase().includes(e.text.toLowerCase())
        );

        if (sentenceEntities.length < 2) continue;

        // Check for relation patterns in sentence
        for (const [relationType, config] of Object.entries(RELATION_PATTERNS)) {
            for (const pattern of config.patterns) {
                pattern.lastIndex = 0;
                if (pattern.test(sentence)) {
                    // Create relations between entity pairs
                    for (let i = 0; i < sentenceEntities.length; i++) {
                        for (let j = i + 1; j < sentenceEntities.length; j++) {
                            // Prefer subject-object based on position in sentence
                            const subjectIdx = sentence.toLowerCase().indexOf(sentenceEntities[i].text.toLowerCase());
                            const objectIdx = sentence.toLowerCase().indexOf(sentenceEntities[j].text.toLowerCase());

                            const [subject, object] = subjectIdx < objectIdx
                                ? [sentenceEntities[i], sentenceEntities[j]]
                                : [sentenceEntities[j], sentenceEntities[i]];

                            const edgeRelation = mapToEdgeRelation(relationType, 0.6);
                            relations.push({
                                subject,
                                predicate: relationType,
                                edge_relation: edgeRelation,
                                object,
                                evidence_text: sentence.trim(),
                                confidence: 0.6,
                                risk_level: edgeRelation === 'CRITICAL_CI' ? 5 :
                                    edgeRelation === 'CONTRAINDICATION' ? 4 :
                                        edgeRelation === 'SIDE_EFFECT' ? 2 : 1,
                                is_critical: edgeRelation === 'CRITICAL_CI'
                            });
                        }
                    }
                    break; // One relation type per sentence
                }
            }
        }
    }

    return relations;
}

// Classify evidence level
function classifyEvidenceLevel(text: string): EvidenceLevel {
    const indicators: string[] = [];
    let maxStrength = 0;
    let level: EvidenceLevel['level'] = 'unknown';

    for (const [, config] of Object.entries(EVIDENCE_PATTERNS)) {
        for (const pattern of config.patterns) {
            pattern.lastIndex = 0;
            const matches = text.match(pattern);
            if (matches) {
                indicators.push(...matches);
                if (config.strength > maxStrength) {
                    maxStrength = config.strength;
                    level = config.level as EvidenceLevel['level'];
                }
            }
        }
    }

    return {
        level,
        strength: maxStrength,
        indicators: [...new Set(indicators)]
    };
}

// Map legacy types to new NodeType system
function mapToNodeType(legacyType: string): NodeType {
    const mapping: Record<string, NodeType> = {
        'DRUG': 'MEDICATION',
        'MEDICATION': 'MEDICATION',
        'TREATMENT': 'TREATMENT',
        'THERAPY': 'TREATMENT',
        'DISEASE': 'PATHOLOGY',
        'PATHOLOGY': 'PATHOLOGY',
        'PHENOTYPE': 'SYMPTOM',
        'SYMPTOM': 'SYMPTOM',
        'COMPLICATION': 'COMPLICATION',
        'SIDE_EFFECT': 'COMPLICATION',
        'GENE': 'ANALYSIS',
        'PROTEIN': 'ANALYSIS',
        'PATHWAY': 'ANALYSIS',
        'MOLECULE': 'ANALYSIS',
        'CELL_TYPE': 'ANALYSIS'
    };
    return mapping[legacyType.toUpperCase()] || 'SUGGESTION';
}

// Map legacy predicates to EdgeRelation
function mapToEdgeRelation(predicate: string, confidence: number): EdgeRelation {
    const mapping: Record<string, EdgeRelation> = {
        'TREATS': confidence > 0.8 ? 'TREATS_NO_SE' : 'TREATS_PARTIAL',
        'INHIBITS': 'TREATS_PARTIAL',
        'ACTIVATES': 'ASSOCIATED',
        'CAUSES': 'SIDE_EFFECT',
        'BIOMARKER_FOR': 'MEASURES',
        'ASSOCIATED_WITH': 'ASSOCIATED',
        'REGULATES': 'ASSOCIATED',
        'BINDS': 'ASSOCIATED',
        'PREVENTS': 'PREVENTIVE',
        'CONTRAINDICATES': 'CONTRAINDICATION',
        'CRITICAL_CI': 'CRITICAL_CI'
    };
    return mapping[predicate.toUpperCase()] || 'ASSOCIATED';
}

// Infer label state based on context
function inferLabelState(entityType: NodeType, relations: Relation[]): LabelState {
    // Check if entity is involved in any critical/high-risk relations
    const hasHighRisk = relations.some(r =>
        r.edge_relation === 'CRITICAL_CI' || r.edge_relation === 'CONTRAINDICATION'
    );
    if (hasHighRisk) return 'CONTRAINDICATED';

    const hasSideEffect = relations.some(r =>
        r.edge_relation === 'SIDE_EFFECT'
    );
    if (hasSideEffect) return 'MONITORING';

    const hasTreatment = relations.some(r =>
        r.edge_relation === 'TREATS_NO_SE' || r.edge_relation === 'TREATS_PARTIAL'
    );
    if (hasTreatment) return 'VALIDATED';

    // Default based on entity type
    if (entityType === 'SUGGESTION') return 'HYPOTHESIS';
    return 'NEUTRAL';
}

// Calculate scoring for extraction result
function calculateExtractedScoring(entities: Entity[], relations: Relation[]): ScoringOutput {
    let totalConfidence = 0;
    let totalRisk = 0;
    let count = 0;

    // Aggregate from entities
    for (const entity of entities) {
        totalConfidence += entity.confidence;
        totalRisk += entity.risk_score || 0;
        count++;
    }

    // Check for critical edges
    const hasCritical = relations.some(r => r.edge_relation === 'CRITICAL_CI');
    const hasContraindication = relations.some(r => r.edge_relation === 'CONTRAINDICATION');

    const avgConfidence = count > 0 ? totalConfidence / count : 0.5;
    let riskScore = count > 0 ? totalRisk / count : 0;

    // Boost risk for critical relations
    if (hasCritical) riskScore = Math.max(riskScore, 0.9);
    else if (hasContraindication) riskScore = Math.max(riskScore, 0.7);

    const actionScore = riskScore * (1 - avgConfidence);
    const priorityScore = (riskScore * 0.4) + (actionScore * 0.4) + ((1 - avgConfidence) * 0.2);

    return {
        confidence_score: avgConfidence,
        risk_score: riskScore,
        action_score: actionScore,
        priority_score: priorityScore
    };
}

// AI-enhanced extraction for complex cases (OpenAI with OpenAI)
async function extractWithAI(text: string): Promise<ExtractionResult | null> {
    const systemPrompt = `Tu es un expert en extraction d'informations biomédicales pour un graphe de connaissances médical.

Analyse le texte et extrait avec le NOUVEAU SYSTÈME DE COULEURS:

1. ENTITÉS avec:
   - text: le texte de l'entité
   - type: GENE|PROTEIN|DRUG|DISEASE|PATHWAY|PHENOTYPE|MOLECULE|CELL_TYPE
   - node_type: MEDICATION|TREATMENT|SYMPTOM|PATHOLOGY|COMPLICATION|ANALYSIS|SUGGESTION
   - label_state: VALIDATED|SUBOPTIMAL|MONITORING|HIGH_RISK|CONTRAINDICATED|HYPOTHESIS|NEUTRAL
   - confidence: 0.0-1.0

2. RELATIONS avec:
   - subject/object: texte de l'entité
   - predicate: INHIBITS|ACTIVATES|CAUSES|TREATS|ASSOCIATED_WITH|PREVENTS|CONTRAINDICATES
   - edge_relation: TREATS_NO_SE|TREATS_PARTIAL|PREVENTIVE|MEASURES|SIDE_EFFECT|POSSIBLE_SE|CONTRAINDICATION|CRITICAL_CI|ASSOCIATED
   - risk_level: 0-5 (0=safe, 5=critical danger)
   - confidence: 0.0-1.0

3. NIVEAU DE PREUVE: meta_analysis|clinical|in_vivo|in_vitro|unknown

Règles de qualification (label_state):
- VALIDATED: traitement prouvé efficace, recommandé
- SUBOPTIMAL: fonctionne mais pas idéal
- MONITORING: nécessite surveillance
- HIGH_RISK: risque élevé mais utilisable
- CONTRAINDICATED: interdit, danger
- HYPOTHESIS: en cours de validation
- NEUTRAL: information neutre

Règles de relation (edge_relation):
- TREATS_NO_SE: traite sans effet indésirable
- TREATS_PARTIAL: traite partiellement
- PREVENTIVE: prévient
- MEASURES: mesure/diagnostique
- SIDE_EFFECT: cause un effet indésirable
- POSSIBLE_SE: peut causer un effet indésirable
- CONTRAINDICATION: contre-indication
- CRITICAL_CI: contre-indication critique (danger mortel)
- ASSOCIATED: simplement associé

FORMAT JSON strict:
{
  "entities": [{"text": "...", "type": "...", "node_type": "...", "label_state": "...", "confidence": 0.0-1.0}],
  "relations": [{"subject": "...", "predicate": "...", "edge_relation": "...", "object": "...", "risk_level": 0-5, "confidence": 0.0-1.0}],
  "evidence_level": {"level": "...", "strength": 1-5}
}`;

    try {
        const aiResponse = await callAI(
            systemPrompt,
            `Extrait les entités et relations avec le système de couleurs de ce texte:\n\n${text.slice(0, 3000)}`,
            { model: "gpt-5.5" }
        );

        const content = aiResponse.text;
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);

            // Ensure all entities have new fields
            const entities: Entity[] = (parsed.entities || []).map((e: any) => ({
                text: e.text,
                type: e.type || 'UNKNOWN',
                node_type: e.node_type || mapToNodeType(e.type || 'UNKNOWN'),
                label_state: e.label_state || 'NEUTRAL',
                start: 0,
                end: 0,
                confidence: e.confidence || 0.7,
                risk_score: e.label_state === 'CONTRAINDICATED' ? 0.9 :
                    e.label_state === 'HIGH_RISK' ? 0.7 :
                        e.label_state === 'MONITORING' ? 0.4 : 0.1
            }));

            // Ensure all relations have new fields
            const relations: Relation[] = (parsed.relations || []).map((r: any) => ({
                subject: { text: r.subject },
                predicate: r.predicate || 'ASSOCIATED_WITH',
                edge_relation: r.edge_relation || mapToEdgeRelation(r.predicate || 'ASSOCIATED_WITH', r.confidence || 0.5),
                object: { text: r.object },
                evidence_text: '',
                confidence: r.confidence || 0.7,
                risk_level: r.risk_level ?? (r.edge_relation === 'CRITICAL_CI' ? 5 : r.edge_relation === 'CONTRAINDICATION' ? 4 : 1),
                is_critical: r.edge_relation === 'CRITICAL_CI'
            }));

            return {
                entities,
                relations,
                evidence_level: parsed.evidence_level || { level: 'unknown', strength: 0, indicators: [] },
                scoring: calculateExtractedScoring(entities, relations),
                summary: {
                    entity_counts: {},
                    relation_counts: {},
                    node_type_counts: {},
                    label_state_counts: {},
                    edge_relation_counts: {}
                }
            };
        }
    } catch (e) {
        console.error('AI extraction error:', e);
    }

    return null;
}

// Python NLP Service extraction using scispaCy
async function extractWithPython(text: string): Promise<ExtractionResult | null> {
    const pythonNlpUrl = Deno.env.get("PYTHON_NLP_URL");
    if (!pythonNlpUrl) {
        console.log('PYTHON_NLP_URL not set, falling back to regex');
        return null;
    }

    try {
        console.log('🐍 Calling Python NLP service...');

        const response = await fetch(`${pythonNlpUrl}/extract/full`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: text.slice(0, 10000) })  // Limit text size
        });

        if (!response.ok) {
            console.error('Python NLP error:', response.status);
            return null;
        }

        const data = await response.json();

        // Transform to match our ExtractionResult format
        const entities: Entity[] = (data.entities || []).map((e: any) => ({
            text: e.text,
            type: e.type,
            start: e.start,
            end: e.end,
            confidence: e.confidence,
            umls_cui: e.umls_cui  // Extra: UMLS linking from scispaCy
        }));

        const relations: Relation[] = (data.relations || []).map((r: any) => ({
            subject: { text: r.subject, type: 'UNKNOWN', start: 0, end: 0, confidence: 0.7 },
            predicate: r.predicate,
            object: { text: r.object, type: 'UNKNOWN', start: 0, end: 0, confidence: 0.7 },
            evidence_text: r.evidence_text,
            confidence: r.confidence
        }));

        const evidence_level: EvidenceLevel = {
            level: data.evidence_level || 'unknown',
            strength: data.evidence_level === 'meta_analysis' ? 5 :
                data.evidence_level === 'clinical' ? 4 :
                    data.evidence_level === 'in_vivo' ? 2 :
                        data.evidence_level === 'in_vitro' ? 1 : 0,
            indicators: []
        };

        console.log(`✅ Python NLP: ${entities.length} entities, ${relations.length} relations`);

        return {
            entities,
            relations,
            evidence_level,
            summary: data.summary || {
                entity_counts: {},
                relation_counts: {}
            }
        };

    } catch (e) {
        console.error('Python NLP service error:', e);
        return null;
    }
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { text, use_claude = false, use_python = true, include_relations = true } = await req.json();

        if (!text) {
            return new Response(
                JSON.stringify({ error: "Text is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        let result: ExtractionResult;

        // Priority: Python > OpenAI > Regex
        if (use_python) {
            const pythonResult = await extractWithPython(text);
            if (pythonResult) {
                result = pythonResult;
            } else if (use_claude) {
                // Fallback to OpenAI
                const aiResult = await extractWithAI(text);
                if (aiResult) {
                    result = {
                        ...aiResult,
                        summary: {
                            entity_counts: {},
                            relation_counts: {}
                        }
                    };
                    for (const entity of aiResult.entities || []) {
                        result.summary.entity_counts[entity.type] =
                            (result.summary.entity_counts[entity.type] || 0) + 1;
                    }
                    for (const relation of aiResult.relations || []) {
                        result.summary.relation_counts[relation.predicate] =
                            (result.summary.relation_counts[relation.predicate] || 0) + 1;
                    }
                } else {
                    // Fallback to regex
                    const entities = extractEntitiesSimple(text);
                    const relations = include_relations ? extractRelations(text, entities) : [];
                    const evidence_level = classifyEvidenceLevel(text);
                    result = {
                        entities, relations, evidence_level,
                        summary: {
                            entity_counts: entities.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {} as Record<string, number>),
                            relation_counts: relations.reduce((acc, r) => { acc[r.predicate] = (acc[r.predicate] || 0) + 1; return acc; }, {} as Record<string, number>)
                        }
                    };
                }
            } else {
                // Fallback to regex
                const entities = extractEntitiesSimple(text);
                const relations = include_relations ? extractRelations(text, entities) : [];
                const evidence_level = classifyEvidenceLevel(text);
                result = {
                    entities, relations, evidence_level,
                    summary: {
                        entity_counts: entities.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {} as Record<string, number>),
                        relation_counts: relations.reduce((acc, r) => { acc[r.predicate] = (acc[r.predicate] || 0) + 1; return acc; }, {} as Record<string, number>)
                    }
                };
            }
        } else if (use_claude) {
            const aiResult = await extractWithAI(text);
            if (aiResult) {
                result = {
                    ...aiResult,
                    summary: {
                        entity_counts: {},
                        relation_counts: {}
                    }
                };

                // Count entities
                for (const entity of aiResult.entities || []) {
                    result.summary.entity_counts[entity.type] =
                        (result.summary.entity_counts[entity.type] || 0) + 1;
                }

                // Count relations
                for (const relation of aiResult.relations || []) {
                    result.summary.relation_counts[relation.predicate] =
                        (result.summary.relation_counts[relation.predicate] || 0) + 1;
                }
            } else {
                // Fallback to pattern-based
                const entities = extractEntitiesSimple(text);
                const relations = include_relations ? extractRelations(text, entities) : [];
                const evidence_level = classifyEvidenceLevel(text);

                result = {
                    entities,
                    relations,
                    evidence_level,
                    summary: {
                        entity_counts: entities.reduce((acc, e) => {
                            acc[e.type] = (acc[e.type] || 0) + 1;
                            return acc;
                        }, {} as Record<string, number>),
                        relation_counts: relations.reduce((acc, r) => {
                            acc[r.predicate] = (acc[r.predicate] || 0) + 1;
                            return acc;
                        }, {} as Record<string, number>)
                    }
                };
            }
        } else {
            // Fast pattern-based extraction
            const entities = extractEntitiesSimple(text);
            const relations = include_relations ? extractRelations(text, entities) : [];
            const evidence_level = classifyEvidenceLevel(text);

            result = {
                entities,
                relations,
                evidence_level,
                summary: {
                    entity_counts: entities.reduce((acc, e) => {
                        acc[e.type] = (acc[e.type] || 0) + 1;
                        return acc;
                    }, {} as Record<string, number>),
                    relation_counts: relations.reduce((acc, r) => {
                        acc[r.predicate] = (acc[r.predicate] || 0) + 1;
                        return acc;
                    }, {} as Record<string, number>)
                }
            };
        }

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Knowledge extractor error:", error);
        return new Response(
            JSON.stringify({ error: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
