import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// KNOWLEDGE EXTRACTOR
// NER + Relation Extraction + Evidence Classification
// Uses Claude for advanced extraction
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

interface Entity {
    text: string;
    type: string;
    start: number;
    end: number;
    confidence: number;
}

interface Relation {
    subject: Entity;
    predicate: string;
    object: Entity;
    evidence_text: string;
    confidence: number;
}

interface EvidenceLevel {
    level: 'meta_analysis' | 'clinical' | 'in_vivo' | 'in_vitro' | 'unknown';
    strength: number;
    indicators: string[];
}

interface ExtractionResult {
    entities: Entity[];
    relations: Relation[];
    evidence_level: EvidenceLevel;
    summary: {
        entity_counts: Record<string, number>;
        relation_counts: Record<string, number>;
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
                    entities.push({
                        text: entityText,
                        type,
                        start: match.index,
                        end: match.index + entityText.length,
                        confidence: 0.7
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

                            relations.push({
                                subject,
                                predicate: relationType,
                                object,
                                evidence_text: sentence.trim(),
                                confidence: 0.6
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

// Claude-enhanced extraction for complex cases
async function extractWithClaude(text: string): Promise<ExtractionResult | null> {
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) return null;

    const systemPrompt = `Tu es un expert en extraction d'informations biomédicales.
Analyse le texte et extrait:
1. ENTITÉS: gènes, protéines, maladies, médicaments, voies de signalisation, phénotypes
2. RELATIONS: inhibition, activation, association, causalité, traitement
3. NIVEAU DE PREUVE: meta-analyse, essai clinique, in vivo, in vitro

FORMAT JSON strict:
{
  "entities": [{"text": "...", "type": "GENE|PROTEIN|DRUG|DISEASE|PATHWAY|PHENOTYPE", "confidence": 0.0-1.0}],
  "relations": [{"subject": "...", "predicate": "INHIBITS|ACTIVATES|CAUSES|TREATS|ASSOCIATED_WITH", "object": "...", "confidence": 0.0-1.0}],
  "evidence_level": {"level": "meta_analysis|clinical|in_vivo|in_vitro|unknown", "strength": 1-5}
}`;

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropicKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 2048,
                messages: [{ role: 'user', content: `Extrait les entités et relations de ce texte:\n\n${text.slice(0, 3000)}` }],
                system: systemPrompt
            })
        });

        if (!response.ok) return null;

        const data = await response.json();
        const content = data.content?.[0]?.text || '';

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.error('Claude extraction error:', e);
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

        // Priority: Python > Claude > Regex
        if (use_python) {
            const pythonResult = await extractWithPython(text);
            if (pythonResult) {
                result = pythonResult;
            } else if (use_claude) {
                // Fallback to Claude
                const claudeResult = await extractWithClaude(text);
                if (claudeResult) {
                    result = {
                        ...claudeResult,
                        summary: {
                            entity_counts: {},
                            relation_counts: {}
                        }
                    };
                    for (const entity of claudeResult.entities || []) {
                        result.summary.entity_counts[entity.type] =
                            (result.summary.entity_counts[entity.type] || 0) + 1;
                    }
                    for (const relation of claudeResult.relations || []) {
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
            const claudeResult = await extractWithClaude(text);
            if (claudeResult) {
                result = {
                    ...claudeResult,
                    summary: {
                        entity_counts: {},
                        relation_counts: {}
                    }
                };

                // Count entities
                for (const entity of claudeResult.entities || []) {
                    result.summary.entity_counts[entity.type] =
                        (result.summary.entity_counts[entity.type] || 0) + 1;
                }

                // Count relations
                for (const relation of claudeResult.relations || []) {
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
