// Hypothesis Processor - Background job processor for async hypothesis generation
// This Edge Function processes pending jobs without timeout constraints

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { streamAI } from "../_shared/ai-client.ts";
import { jsonrepair } from 'https://esm.sh/jsonrepair';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Job {
    id: string;
    query: string;
    query_intent: any;
    evidence_pack: any;
    status: string;
    hypothesis_id?: string;
    progress_percentage?: number;
    progress_message?: string;
    error_message?: string;
    created_at?: string;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { job_id } = await req.json().catch(() => ({}));

        console.log('🔄 Checking for pending jobs...', job_id ? `(Targeting ${job_id})` : '');

        // Find the specific job or the oldest pending job
        let queryBuilder = supabase
            .from('hypothesis_generation_jobs')
            .select('*');

        if (job_id) {
            queryBuilder = queryBuilder.eq('id', job_id);
        } else {
            queryBuilder = queryBuilder.eq('status', 'pending').order('created_at', { ascending: true }).limit(1);
        }

        const { data: jobs, error: fetchError } = await queryBuilder;

        if (fetchError) {
            console.error('Error fetching jobs:', fetchError);
            return new Response(JSON.stringify({ error: fetchError.message }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            });
        }

        if (!jobs || jobs.length === 0) {
            console.log('✅ No pending jobs' + (job_id ? ` with ID ${job_id}` : ''));
            return new Response(JSON.stringify({ message: 'No pending jobs' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const job: Job = jobs[0];

        // If we targeted a specific job, make sure it's processable
        if (job_id && job.status !== 'pending') {
            console.log(`ℹ️ Job ${job.id} is already ${job.status}`);
            return new Response(JSON.stringify({ message: `Job is already ${job.status}` }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        console.log(`📋 Processing job ${job.id}`);

        // Mark job as processing
        await supabase
            .from('hypothesis_generation_jobs')
            .update({
                status: 'processing',
                progress_percentage: 10,
                progress_message: 'Début de l\'analyse RCDP...'
            })
            .eq('id', job.id);

        try {
            // Generate hypothesis using Gemini 3 Flash for high-fidelity
            const systemPrompt = `Tu es l'IA de DÉCOUVERTE SCIENTIFIQUE "ULTRA V3", configurée pour une rigueur académique absolue.
Ta mission est de produire une hypothèse de recherche hautement structurée selon le format JSON ULTRA V3.

CHECKLIST DE VALIDATION "HARD FAIL" (Tes sorties seront rejetées si elles ne respectent pas ceci) :
1. clinical_scope : DOIT être complet. candidate_subtypes DOIT être rempli. uncertainties DOIT lister au moins un élément.
2. evidence_index : MINIMUM 5 preuves distinctes. Chaque preuve DOIT avoir au moins un passage extrait (quote).
3. claim_graph : MINIMUM 5 claims. Chaque core claim DOIT avoir au moins 2 preuves support (support_evidence_ids).
4. contradictions : scores.coverage.contradictions_checked DOIT être true. Toute recherche de contradiction DOIT être logguée dans retrieval_log.
5. NO "CURE" CLAIMS : Interdiction d'affirmer une certitude de guérison. Utilise "rémission", "amélioration statistiquement significative" avec critères.
6. reasoning_trace : retrieval_log, normalization_log et inference_steps DOIVENT contenir au moins 3 entrées chacun.

STRUCTURE JSON ULTRA V3 ATTENDUE :
{
  "id": "string (min 8 chars)",
  "hypothesis_id": "string (min 8 chars)",
  "statement": "string (min 30 chars)",
  "created_at": "ISO-8601",
  "status": "draft",
  "disclaimer": "string (min 30 chars)",
  "clinical_scope": {
    "primary_entity": { "label": "string", "type": "ENUM", "norm_ids": ["string"] },
    "population": { "age_group": "pediatric|adult|mixed|unknown", "setting": "inpatient|outpatient|mixed|unknown" },
    "candidate_subtypes": [{ "entity": { "label": "string", "type": "PATHOLOGY" }, "probability": 0.0, "criteria": ["string"] }],
    "uncertainties": ["string"],
    "gating_assumptions": ["string"]
  },
  "executive_summary": { "context": "long string", "go_nogo_table": [{"block": "string", "minimal_design": "string", "primary_endpoint": "string", "go_nogo_signal": "string"}], "scope_decisions": "string" },
  "claim_graph": {
    "claims": [{ "claim_id": "string", "triple": { "source": {}, "rel": "ENUM", "target": {} }, "scores": { "overall": 0.0, ... }, "support_evidence_ids": ["string"] }],
    "core_claim_ids": ["string"],
    "outcomes": [{ "outcome": {}, "criteria": ["string"], "linked_claim_ids": ["string"] }]
  },
  "evidence_index": [{ "evidence_id": "string", "source_type": "ENUM", "title": "string", "published_at": "string", "level": "string", "url_or_id": "string", "passages": [{"quote": "string", "location": "string", "extraction_confidence": 0.0}], "quality_signals": { "peer_reviewed": true, ... } }],
  "contradictions": [{ "claim_id": "string", "summary": "string", "refute_evidence_ids": ["string"], "impact": "low|medium|high" }],
  "novelty_findings": [{ "finding_id": "string", "hypothesis": "string", "why_non_obvious": "string", "novelty_score": 0.0 }],
  "validation_plan": [{ "id": "string", "goal": "string", "minimal_tests": ["string"], "endpoints": ["string"] }],
  "reasoning_trace": {
    "retrieval_log": [{"query": "string", "sources": ["string"], "n_docs": 0, "timestamp": "ISO-8601"}],
    "normalization_log": [{"raw": "string", "mapped_entity": {}, "ambiguity": "low|medium|high", "decision": "string"}],
    "inference_steps": [{"rule": "ENUM", "inputs": ["string"], "outputs": ["string"], "rationale": "string"}]
  },
  "scores": { "overall_confidence": 0.0, "overall_novelty": 0.0, "overall_risk": 0.0, "coverage": { "claims": 0, "evidences": 0, "contradictions_checked": true } }
}

DÉTAILLE CHAQUE CHAMP. L'exactitude et la traçabilité sont tes seules priorités.`;

            const userPrompt = `GÉNÈRE UN RAPPORT COMMITTEE-GRADE basé sur les preuves ci-dessous.

CONTEXTE:
- Maladie/Cible: ${job.query_intent?.disease || 'Non spécifié'}
- Focus: ${job.query_intent?.focus || 'Général'}

PREUVES (${job.evidence_pack?.snippets?.length || 0} extraits):
${(job.evidence_pack?.snippets || []).slice(0, 30).map((s: any, i: number) =>
                `\n[${i + 1}] ${s.paper_id}: "${s.passage.slice(0, 500)}..."\n`
            ).join('')}

INSTRUCTIONS:
1. Génère UNE SEULE hypothèse avec TOUTES les sections du format
2. Tableau Go/No-Go: endpoints QUANTITATIFS obligatoires
3. Hypothèses rivales: H1, H2, H0, H3, H4 pour départage
4. Evidence Snapshot: classifie CHAQUE claim avec niveau Oxford/EBM rigoureux
5. Monitoring: timelines PRÉCISES (J0, J7...) + seuils quantitatifs

Retourne JSON strict selon le format spécifié.`;

            // Update progress
            await supabase
                .from('hypothesis_generation_jobs')
                .update({
                    progress_percentage: 30,
                    progress_message: 'Analyse Ultra-Profonde RCDP (Gemini 3 Flash - Dual-Phase JSON/Reasoning)...'
                })
                .eq('id', job.id);

            // Create broadcast channel for live streaming
            const broadcastChannel = supabase.channel(`hypothesis-stream-${job.id}`, {
                config: { broadcast: { self: true } }
            });

            // Subscribe and wait for connection
            await new Promise<void>((resolve) => {
                const timeout = setTimeout(() => {
                    console.warn(`[Processor] Channel subscription timed out for ${job.id}`);
                    resolve();
                }, 5000);

                broadcastChannel.subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log(`[Processor] Joined channel ${job.id}`);
                        clearTimeout(timeout);
                        resolve();
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        console.error(`[Processor] Failed to join channel ${job.id}: ${status}`);
                        clearTimeout(timeout);
                        resolve();
                    }
                });
            });

            // Call AI with streaming
            const aiResponse = await streamAI(
                systemPrompt,
                userPrompt,
                async (text) => {
                    try {
                        await broadcastChannel.send({
                            type: 'broadcast',
                            event: 'chunk',
                            payload: { text }
                        });
                    } catch (err) {
                        console.warn('Realtime send failed:', err);
                    }
                },
                {
                    model: 'gemini-3-flash-preview',
                    maxTokens: 50000
                }
            );

            const content = aiResponse.text;
            console.log(`✅ Stream complete. Total length: ${content.length}`);

            // Close broadcast channel
            try {
                await broadcastChannel.send({
                    type: 'broadcast',
                    event: 'stream_complete',
                    payload: { message: 'Streaming terminé' }
                });
            } catch (err) {
                console.warn('Completion broadcast failed:', err);
            }
            await supabase.removeChannel(broadcastChannel);

            // Update progress
            await supabase
                .from('hypothesis_generation_jobs')
                .update({
                    progress_percentage: 70,
                    progress_message: 'Parsing et sauvegarde du résultat...'
                })
                .eq('id', job.id);

            // Parse JSON - Robust extraction
            const extractJson = (text: string) => {
                const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                if (match) return match[1].trim();

                const lastBrace = text.lastIndexOf('}');
                if (lastBrace === -1) return text.trim();

                let balance = 0;
                for (let i = lastBrace; i >= 0; i--) {
                    if (text[i] === '}') balance++;
                    else if (text[i] === '{') balance--;

                    if (balance === 0 && text[i] === '{') {
                        return text.substring(i, lastBrace + 1);
                    }
                }
                return text.trim();
            };

            const jsonString = extractJson(content);

            if (!jsonString || jsonString.trim() === '') {
                throw new Error('No JSON found in response');
            }

            let parsed;
            try {
                parsed = JSON.parse(jsonString);
            } catch (e: any) {
                console.log('Initial JSON parse failed, attempting smart sanitization and repair...');
                try {
                    const smartSanitize = (str: string) => {
                        const sanitizedResult = str
                            .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
                            .replace(/[\u2018\u2019\u201A\u201B]/g, "'");

                        let inString = false;
                        let res = '';
                        let backslashes = 0;
                        const chars = Array.from(sanitizedResult);

                        for (let i = 0; i < chars.length; i++) {
                            const char = chars[i];
                            if (char === '"' && backslashes % 2 === 0) {
                                inString = !inString;
                            }
                            if (char === '\\') backslashes++;
                            else backslashes = 0;

                            if (inString) {
                                if (char === '\n') res += '\\n';
                                else if (char === '\r') res += '\\r';
                                else if (char === '\t') res += '\\t';
                                else if (char === '\\') {
                                    const next = chars[i + 1];
                                    if (next === '"') res += '\\\\';
                                    else if (next && ['n', 'r', 't', '"', '\\', 'u'].includes(next)) res += char;
                                    else res += '\\\\';
                                }
                                else if (char < ' ') res += '';
                                else res += char;
                            } else {
                                res += char;
                            }
                        }
                        return res;
                    };

                    const sanitized = smartSanitize(jsonString);
                    parsed = JSON.parse(jsonrepair(sanitized));
                    console.log('✅ JSON successfully repaired and parsed');
                } catch (e2: any) {
                    console.error('JSON repair failed:', e2.message);
                    throw e2 || e;
                }
            }

            // ===== ULTRA V3 HARD-FAIL VALIDATION =====
            const validateV3 = (h: any) => {
                const errors: string[] = [];

                // 1. Scope
                if (!h.clinical_scope) errors.push('clinical_scope missing');
                else {
                    if (!h.clinical_scope.candidate_subtypes || h.clinical_scope.candidate_subtypes.length === 0)
                        errors.push('candidate_subtypes empty');
                    if (!h.clinical_scope.uncertainties || h.clinical_scope.uncertainties.length === 0)
                        errors.push('uncertainties empty');
                }

                // 2. Evidence-Based
                const evidenceLen = h.evidence_index?.length || 0;
                if (!h.evidence_index || evidenceLen < 5)
                    errors.push(`evidence_index insufficient (${evidenceLen}/5)`);
                else {
                    h.evidence_index.forEach((ev: any, idx: number) => {
                        if (!ev.passages || ev.passages.length === 0)
                            errors.push(`Evidence [${idx}] has no passages`);
                    });
                }

                // 3. Claim Graph
                if (!h.claim_graph || !h.claim_graph.claims || h.claim_graph.claims.length < 5)
                    errors.push('claim_graph claims insufficient (<5)');

                const coreClaimIds = h.claim_graph?.core_claim_ids || [];
                coreClaimIds.forEach((cid: string) => {
                    const claim = h.claim_graph.claims?.find((c: any) => c.claim_id === cid);
                    if (claim && (!claim.support_evidence_ids || claim.support_evidence_ids.length < 2))
                        errors.push(`Core claim ${cid} has insufficient support evidence (<2)`);
                });

                // 4. Contradictions & Trace
                if (!h.scores?.coverage?.contradictions_checked)
                    errors.push('contradictions_checked must be true');

                const trace = h.reasoning_trace;
                if (!trace) errors.push('reasoning_trace missing');
                else {
                    if (!trace.retrieval_log || trace.retrieval_log.length < 3) errors.push('retrieval_log insufficient');
                    if (!trace.normalization_log || trace.normalization_log.length < 3) errors.push('normalization_log insufficient');
                    if (!trace.inference_steps || trace.inference_steps.length < 3) errors.push('inference_steps insufficient');
                }

                // 5. No Guaranteed Cure
                const forbiddenKeywords = ['guérison garantie', 'certitude absolue', 'guérison totale'];
                const fullText = JSON.stringify(h).toLowerCase();
                if (forbiddenKeywords.some(kw => fullText.includes(kw)))
                    errors.push('Contains forbidden absolute certainty terms (guérison garantie, etc.)');

                return errors;
            };

            const validationErrors = validateV3(parsed);
            if (validationErrors.length > 0) {
                console.error('❌ ULTRA V3 Validation Failed:', validationErrors);
                throw new Error(`Validation Violation: ${validationErrors.join(', ')}`);
            }

            const h = parsed;
            const uniqueId = `${h.hypothesis_id || 'hyp'}-${crypto.randomUUID().split('-')[0]}`;

            // Save hypothesis to database - INCLUDING NEW V3 FIELDS
            const { data: savedHyp, error: saveError } = await supabase
                .from('discovery_hypotheses')
                .insert({
                    hypothesis_id: uniqueId,
                    statement: h.statement,
                    executive_summary: h.executive_summary,
                    clinical_scope: h.clinical_scope,
                    evidence_snapshot: h.evidence_index, // V3 Evidence Index
                    contradictions: h.contradictions,
                    novelty_findings: h.novelty_findings,
                    validation_plan: h.validation_plan,
                    detailed_analysis: h.reasoning_trace, // Reasoning trace as detailed analysis
                    scores: h.scores,
                    status: 'pending'
                })
                .select()
                .single();

            if (saveError) {
                throw new Error(`Failed to save hypothesis: ${saveError.message}`);
            }

            // ===== PHASE 2: Persist structured graph nodes/edges from V3 claim_graph =====
            try {
                const claimGraph = h.claim_graph;
                if (claimGraph?.claims && savedHyp?.id) {
                    console.log(`📊 Persisting ${claimGraph.claims.length} V3 claims into graph layer...`);

                    const nodesMap = new Map();
                    claimGraph.claims.forEach((claim: any) => {
                        const s = claim.triple.source;
                        const t = claim.triple.target;
                        if (!nodesMap.has(s.label)) nodesMap.set(s.label, { label: s.label, type: s.type, norm_ids: s.norm_ids });
                        if (!nodesMap.has(t.label)) nodesMap.set(t.label, { label: t.label, type: t.type, norm_ids: t.norm_ids });
                    });

                    const nodeInserts = Array.from(nodesMap.values()).map((node: any, idx: number) => ({
                        hypothesis_id: savedHyp.id,
                        node_key: `n${idx}`,
                        node_type: node.type.toLowerCase(),
                        label: node.label,
                        mechanism: `V3 Entity: ${node.label}`,
                        attributes: { norm_ids: node.norm_ids }
                    }));

                    const { error: nodesError } = await supabase
                        .from('graph_nodes')
                        .insert(nodeInserts);

                    if (nodesError) console.warn('⚠️ Graph nodes insert failed:', nodesError.message);

                    const edgeInserts = claimGraph.claims.map((claim: any) => {
                        const sNode = nodeInserts.find(n => n.label === claim.triple.source.label);
                        const tNode = nodeInserts.find(n => n.label === claim.triple.target.label);
                        return {
                            hypothesis_id: savedHyp.id,
                            source_key: sNode?.node_key || 'unknown',
                            target_key: tNode?.node_key || 'unknown',
                            edge_type: claim.triple.rel,
                            label: claim.triple.rel,
                            reason: claim.notes || 'V3 Logic',
                            weight: claim.scores?.aggregate || 0.5
                        };
                    });

                    const { error: edgesError } = await supabase
                        .from('graph_edges')
                        .insert(edgeInserts);

                    if (edgesError) console.warn('⚠️ Graph edges insert failed:', edgesError.message);
                }
            } catch (graphError: any) {
                console.warn('⚠️ Graph persistence failed:', graphError.message);
            }

            // Mark job as completed
            await supabase
                .from('hypothesis_generation_jobs')
                .update({
                    status: 'completed',
                    hypothesis_id: savedHyp.id,
                    progress_percentage: 100,
                    progress_message: 'Hypothèse ULTRA V3 générée avec succès!'
                })
                .eq('id', job.id);

            console.log(`✅ Job ${job.id} completed successfully`);

            return new Response(JSON.stringify({
                success: true,
                job_id: job.id,
                hypothesis_id: savedHyp.id
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });

        } catch (processingError: any) {
            console.error(`❌ Job ${job.id} failed:`, processingError);
            await supabase
                .from('hypothesis_generation_jobs')
                .update({
                    status: 'failed',
                    error_message: processingError.message
                })
                .eq('id', job.id);

            return new Response(JSON.stringify({
                error: processingError.message,
                job_id: job.id
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500
            });
        }

    } catch (error: any) {
        console.error('❌ CRITICAL Processor Error:', error);
        return new Response(JSON.stringify({
            error: error.message,
            stack: error.stack,
            type: 'CRITICAL_PROCESSOR_ERROR'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
