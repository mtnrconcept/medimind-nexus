// ============================================
// RADIAL RINGS DISCOVERY ENGINE - MAIN ORCHESTRATOR
// ============================================
// Moteur de découverte par anneaux concentriques avec détection de micro-signaux

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
    RadialRingsRequest, RadialRingsResponse, RadialKnowledgeGraph,
    RadialHypothesis, RingNode, RingEdge, MicroSignal,
    CounterHypothesis, RING_LANE_CONFIG, RingLevel
} from './types.ts';
import { buildAllRings } from './rings-builder.ts';
import { generateAllEdges, findWeakEdges } from './edge-generator.ts';
import { detectMicroSignals, detectParentalExposureSignals } from './micro-signal-detector.ts';
import { generateCounterHypotheses, adjustConfidenceWithCounterHypotheses } from './counter-hypothesis.ts';
import { callAI } from '../_shared/ai-client.ts';

// ============================================
// CORS HEADERS
// ============================================

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================
// HYPOTHESIS GENERATION (Claude AI)
// ============================================

async function generateHypothesesWithAI(
    microSignals: MicroSignal[],
    counterHypotheses: Map<string, CounterHypothesis[]>,
    nodes: RingNode[],
    pathology: string
): Promise<RadialHypothesis[]> {
    if (microSignals.length === 0) {
        return [];
    }

    try {
        const prompt = `Tu es un expert en génération d'hypothèses médicales falsifiables.

Pathologie: ${pathology}

Micro-signaux détectés (signaux faibles triangulés):
${microSignals.map((s, i) => `
${i + 1}. ${s.observation}
   - Triangulation: ${s.triangulation_score}/4 angles
   - Hypothèse: ${s.testable_hypothesis}
   - Test: ${s.falsification_test}
   - Kill criteria: ${s.kill_criteria}
`).join('')}

Contre-hypothèses à considérer:
${[...counterHypotheses.entries()].map(([signalId, counters]) =>
            counters.map(c => `- ${c.claim} (Evidence: ${c.evidence_grade})`).join('\n')
        ).join('\n')}

Pour chaque micro-signal, génère une hypothèse structurée:
1. Titre court et descriptif
2. Probabilité de succès (0-100%)
3. Pourquoi cette hypothèse malgré les contre-hypothèses
4. Prochaine étape de recherche

Réponds en JSON: { "hypotheses": [{"title": "...", "probability": X, "rationale": "...", "next_step": "..."}] }`;

        const aiResponse = await callAI(
            "Tu es un expert en génération d'hypothèses médicales falsifiables. Réponds uniquement en JSON.",
            prompt,
            {
                model: "claude-3-5-sonnet-20240620",
                maxTokens: 4000,
                temperature: 0.3
            }
        );

        const textContent = aiResponse.text;
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return parsed.hypotheses.map((h: any, i: number) => ({
                id: `hyp_${i + 1}`,
                title: h.title,
                description: h.rationale,
                mechanism_chain: microSignals[i]?.mechanism_path || [],
                involved_nodes: [],
                involved_edges: microSignals[i]?.supporting_edges || [],
                probability: h.probability,
                evidence_grade: h.probability > 50 ? 'C' : 'D',
                translation_gap: true,
                validation_test: microSignals[i]?.falsification_test || h.next_step,
                if_validated: h.next_step,
                if_refuted: `Exclure cette piste`,
                micro_signal_id: microSignals[i]?.id,
                counter_hypotheses: counterHypotheses.get(microSignals[i]?.id) || []
            }));
        }
    } catch (error) {
        console.error("[RADIAL-RINGS] AI Hypothesis generation error:", error);
    }

    // Fallback if AI fails
    return microSignals.map((signal, i) => ({
        id: `hyp_${i + 1}`,
        title: signal.observation,
        description: signal.testable_hypothesis,
        mechanism_chain: signal.mechanism_path,
        involved_nodes: [],
        involved_edges: signal.supporting_edges,
        probability: Math.round(signal.confidence * 100),
        evidence_grade: 'D' as any,
        translation_gap: true,
        validation_test: signal.falsification_test,
        if_validated: `Valider avec études ciblées`,
        if_refuted: `Exclure comme facteur`,
        micro_signal_id: signal.id,
        counter_hypotheses: counterHypotheses.get(signal.id) || []
    }));
}

// ============================================
// ORGANIZE KNOWLEDGE GRAPH
// ============================================

function organizeKnowledgeGraph(
    nodes: RingNode[],
    edges: RingEdge[]
): RadialKnowledgeGraph {
    const rings: RadialKnowledgeGraph['rings'] = [];

    for (let ring = 0 as RingLevel; ring <= 4; ring++) {
        const ringNodes = nodes.filter(n => n.ring === ring);
        const lanes: Record<string, RingNode[]> = {};

        for (const lane of RING_LANE_CONFIG[ring] || []) {
            lanes[lane] = ringNodes.filter(n => n.lane === lane);
        }

        rings.push({ ring: ring as RingLevel, lanes: lanes as any });
    }

    return { nodes, edges, rings };
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const request: RadialRingsRequest = await req.json();

        // Validation
        if (!request.pathology) {
            return new Response(
                JSON.stringify({ error: "pathology is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Defaults
        const mode = request.mode || 'ETIOLOGY';
        const budget = request.budget || 'medium';

        console.log(`[RADIAL-RINGS] Starting analysis: ${request.pathology}`);
        console.log(`[RADIAL-RINGS] Mode: ${mode}, Budget: ${budget}`);

        // Initialize Supabase
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // STEP 1: Build all rings
        console.log("[RADIAL-RINGS] Step 1/5: Building rings...");
        const nodes = await buildAllRings(request, supabase);

        // STEP 2: Generate edges with pruning
        console.log("[RADIAL-RINGS] Step 2/5: Generating edges...");
        const edges = generateAllEdges(nodes, budget, mode);

        // STEP 3: Detect micro-signals
        console.log("[RADIAL-RINGS] Step 3/5: Detecting micro-signals...");
        const generalSignals = detectMicroSignals(edges, nodes, 2);
        const parentalSignals = detectParentalExposureSignals(edges, nodes);
        const allMicroSignals = [...generalSignals, ...parentalSignals];

        // STEP 4: Generate counter-hypotheses
        console.log("[RADIAL-RINGS] Step 4/5: Generating counter-hypotheses...");
        const counterHypotheses = generateCounterHypotheses(
            allMicroSignals,
            request.pathology,
            3
        );

        // Adjust confidence scores
        for (const signal of allMicroSignals) {
            const counters = counterHypotheses.get(signal.id) || [];
            signal.confidence = adjustConfidenceWithCounterHypotheses(signal, counters);
        }

        // STEP 5: Generate hypotheses
        console.log("[RADIAL-RINGS] Step 5/5: Generating hypotheses...");
        const hypotheses = await generateHypothesesWithAI(
            allMicroSignals.slice(0, 5), // Top 5 signals
            counterHypotheses,
            nodes,
            request.pathology
        );

        // Organize knowledge graph
        const knowledgeGraph = organizeKnowledgeGraph(nodes, edges);

        // Generate PubMed queries
        const pubmedQueries = allMicroSignals
            .flatMap(s => s.pubmed_queries)
            .filter((q, i, arr) => arr.indexOf(q) === i)
            .slice(0, 10);

        // Build response
        const response: RadialRingsResponse = {
            request_id: crypto.randomUUID(),
            analyzed_at: new Date().toISOString(),
            knowledge_graph: knowledgeGraph,
            micro_signals: allMicroSignals,
            hypotheses,
            stats: {
                total_nodes: nodes.length,
                total_edges: edges.length,
                edges_by_ring: {
                    0: edges.filter(e => nodes.find(n => n.id === e.source)?.ring === 0).length,
                    1: edges.filter(e => nodes.find(n => n.id === e.source)?.ring === 1).length,
                    2: edges.filter(e => nodes.find(n => n.id === e.source)?.ring === 2).length,
                    3: edges.filter(e => nodes.find(n => n.id === e.source)?.ring === 3).length,
                    4: edges.filter(e => nodes.find(n => n.id === e.source)?.ring === 4).length
                },
                micro_signals_detected: allMicroSignals.length,
                hypotheses_generated: hypotheses.length
            },
            pubmed_queries: pubmedQueries,
            clinical_trials_queries: [
                `${request.pathology} novel therapy`,
                `${request.pathology} gene therapy`,
                `${request.pathology} targeted treatment`
            ]
        };

        console.log(`[RADIAL-RINGS] Complete: ${nodes.length} nodes, ${edges.length} edges, ${allMicroSignals.length} signals`);

        return new Response(JSON.stringify(response), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("[RADIAL-RINGS] Error:", error);
        return new Response(
            JSON.stringify({ error: "Radial rings analysis failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
