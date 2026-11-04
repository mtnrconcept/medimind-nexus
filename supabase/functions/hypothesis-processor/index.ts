// Hypothesis reasoning runs at OpenAI; short, leased workers persist its result.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { retrieveBackgroundAI, startBackgroundAI } from "../_shared/ai-client.ts";
import {
    prepareBackgroundJobRequest, updateBackgroundJobRecord,
    type BackgroundJobRow, type NativeJobPayload,
} from "../_shared/background-job-monitor.ts";
import {
    advanceHypothesisProvider, extractHypothesisJSON, hypothesisClaimId, hypothesisLegacyPatch, publishHypothesisOnce,
} from "../_shared/hypothesis-jobs.ts";
import { jsonrepair } from "https://esm.sh/jsonrepair@3.1.0";

console.log("Hypothesis Processor Function Started");

// Declare Deno for TypeScript
declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
};

interface Job {
    id: string;
    query: string;
    query_intent: Record<string, any>;
    evidence_pack: { snippets?: Array<{ paper_id: string; passage: string }> };
    status: string;
    hypothesis_id?: string;
    progress_percentage?: number;
    progress_message?: string;
    error_message?: string;
    created_at?: string;
}

interface ValidationData {
    hypothesis_id?: string;
    statement?: string;
    clinical_scope?: {
        candidate_subtypes?: string[];
        uncertainties?: string[];
    };
    evidence_index?: Array<{
        passages?: string[];
    }>;
    claim_graph?: {
        claims?: Array<{
            claim_id: string;
            support_evidence_ids?: string[];
            triple?: {
                source?: { label: string; type?: string; norm_ids?: string[] };
                target?: { label: string; type?: string; norm_ids?: string[] };
            };
        }>;
        outcomes?: Array<{
            outcome?: { label: string };
        }>;
        core_claim_ids?: string[];
    };
    reasoning_trace?: {
        retrieval_log?: any[];
        normalization_log?: any[];
        inference_steps?: any[];
    };
    executive_summary?: any;
    contradictions?: any;
    novelty_findings?: any;
    validation_plan?: any;
    scores?: any;
}

serve(async (req: Request) => {
    // 1. Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabase = createClient(supabaseUrl, supabaseKey);

        const incoming = await req.json().catch(() => null) as (NativeJobPayload & { legacyJobId?: string }) | null;
        if (!incoming || typeof incoming !== 'object') {
            return new Response(JSON.stringify({ error: 'Invalid request' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
            });
        }
        const prepared = await prepareBackgroundJobRequest(req, incoming, {
            supabase, supabaseUrl, serviceRoleKey: supabaseKey,
            functionName: 'hypothesis-processor', corsHeaders, allowLegacyToken: false,
            async syncJob(mirror: BackgroundJobRow, signal?: AbortSignal) {
                const { error } = await supabase.from('hypothesis_generation_jobs')
                    .update(hypothesisLegacyPatch(mirror)).eq('id', mirror.id)
                    .abortSignal(signal ?? AbortSignal.timeout(5_000));
                if (error) throw new Error('Synchronisation de la progression indisponible.');
            },
        });
        if (prepared.response) return prepared.response;
        // Only a one-time service worker lease can create or publish hypotheses.
        // Authenticated owners may use action=status through the shared helper.
        if (!prepared.actor.service || !prepared.payload.runJob) {
            return new Response(JSON.stringify({ error: 'Service worker lease required' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403,
            });
        }
        const { jobId, legacyJobId, providerResponseId, _backgroundMaxTokens } = prepared.payload;
        if (!jobId || legacyJobId !== jobId) throw new Error('Référence de tâche incohérente.');
        const { data: loadedJob, error: fetchError } = await supabase
            .from('hypothesis_generation_jobs').select('*').eq('id', jobId).maybeSingle();
        if (fetchError || !loadedJob) {
            await updateBackgroundJobRecord(supabase, jobId, {
                status: 'failed', error_message: 'La demande d’hypothèse est introuvable.',
                completed_at: new Date().toISOString(),
            });
            throw new Error('La demande d’hypothèse est introuvable.');
        }
        const job = loadedJob as Job;

        let publishing = false;
        try {
            // Generate hypothesis using the shared OpenAI clinical route
            const systemPrompt = `Tu es l'IA de DÉCOUVERTE SCIENTIFIQUE "ULTRA V3", configurée pour une rigueur académique absolue.
Ta mission est de produire une hypothèse de recherche hautement structurée selon le format JSON ULTRA V3.

CHECKLIST DE VALIDATION "HARD FAIL" (Tes sorties seront rejetées si elles ne respectent pas ceci) :
1. clinical_scope : DOIT être complet et EXHAUSTIF. uncertainties DOIT lister au moins 5 éléments majeurs.
2. evidence_index : MINIMUM 20 preuves distinctes. Chaque preuve DOIT avoir au moins un passage extrait (quote).
3. claim_graph : MINIMUM 30 noeuds (claims). topology DOIT être complexe et récursive. Chaque core claim DOIT avoir au moins 2 preuves support.
4. contradictions : scores.coverage.contradictions_checked DOIT être true. Analyse CRITIQUE et SÉVÈRE requise.
5. NO "CURE" CLAIMS : Interdiction d'affirmer une certitude de guérison. Utilise "rémission", "amélioration statistiquement significative" avec critères.
6. reasoning_trace : retrieval_log, normalization_log et inference_steps DOIVENT être DÉTAILLÉS (min 10 étapes).
7. RIGUEUR CITATION : Chaque claim DOIT être relié à au moins un ID de l'evidence_index.
8. VOLUME DE CONTENU : Le rapport final doit être "BOOK-LENGTH" (>40 000 caractères). Chaque section (Executive Summary, Detailed Analysis, Rival Hypotheses) doit être traitée comme un chapitre de thèse. NE SOIS PAS SUCCINCT. SOIS VERBEUX ET SCIENTIFIQUEMENT DENSE.
9. CLINICAL RESOLUTION TOPOLOGY: Le graph DOIT raconter l'histoire complète "Maladie -> Outcome".
   - Start Node: Pathologie (ex: Nephrotic Syndrome)
   - Intermediate Nodes: Symptômes majeurs, Complications
   - Comorbidity Nodes: Tu DOIS inclure des "Deadly Intersections" (ex: Varicella + Corticoids = Danger).
   - Adaptation Nodes: Noeuds de décision (ex: "Resistance? -> Switch Treatment").
11. PREUVE-FIRST: Chaque lien (edge) du graph DOIT pointer vers une preuve spécifique. INTERDICTION D'HALLUCINER DES LIENS SANS PREUVES.
STRUCTURE JSON ULTRA V3 ATTENDUE (Committee-Grade Report):
{
  "id": "string (UUID)",
  "hypothesis_id": "string (ex: HYP-NEPHRO-PRECISION-2026-X)",
  "statement": "string (Phrase précise et actionnable)",
  "clinical_scope": {
    "primary_entity": { "label": "string", "type": "PATHOLOGY", "norm_ids": ["string"] },
    "population": { "age_group": "string", "setting": "string" },
    "candidate_subtypes": [
      {
        "entity": { "label": "string", "type": "PATHOLOGY", "norm_ids": ["string"] },
        "probability": 0.0,
        "criteria": ["string"]
      }
    ],
    "key_biomarkers": [{ "entity": { "label": "string", "type": "BIOMARKER" }, "role": "string" }],
    "uncertainties": ["string"]
  },
  "executive_summary": {
    "context": "string",
    "go_nogo_table": [
      {
        "block": "string",
        "minimal_design": "string",
        "primary_endpoint": "string",
        "decision_signal": "string"
      }
    ],
    "scope_decisions": "string"
  },
  "evidence_index": [
    {
      "evidence_id": "EV-0001",
      "source_type": "string",
      "title": "string",
      "url_or_id": "string (PMID:X or DOI:Y)",
      "level": "string",
      "passages": [{ "quote": "string", "location": "string", "extraction_confidence": 0.0 }]
    }
  ],
  "claim_graph": {
    "claims": [
      {
        "claim_id": "CLM-0001",
        "triple": {
            "source": { "label": "string", "type": "string" },
            "rel": "string",
            "target": { "label": "string", "type": "string" }
        },
        "scores": { "evidence_quality": 0.0, "safety_risk": 0.0, "aggregate": 0.0 },
        "support_evidence_ids": ["EV-0001"],
        "refute_evidence_ids": [],
        "conditions": ["string"],
        "notes": "string"
      }
    ],
    "outcomes": [
      {
        "outcome": { "label": "string", "type": "OUTCOME", "norm_ids": ["string"] },
        "criteria": ["string"],
        "linked_claim_ids": ["CLM-0001"]
      }
    ]
  },
  "contradictions": [
    {
      "claim_id": "CLM-0001",
      "summary": "string",
      "refute_evidence_ids": ["EV-00X"],
      "impact": "high|medium|low"
    }
  ],
  "novelty_findings": [
    {
      "finding_id": "NOV-0001",
      "hypothesis": "string",
      "novelty_score": 0.0,
      "validation_plan_id": "VAL-0001"
    }
  ],
  "validation_plan": [
    {
      "id": "VAL-0001",
      "goal": "string",
      "minimal_tests": ["string"],
      "endpoints": ["string"],
      "failure_modes": ["string"],
      "linked_claim_ids": ["CLM-0001"]
    }
  ],
  "reasoning_trace": {
    "retrieval_log": [{ "query": "string", "n_docs": 0, "timestamp": "string" }],
    "normalization_log": [{ "raw": "string", "mapped_entity": { "label": "string" }, "decision": "string" }],
    "inference_steps": [{ "rule": "string", "inputs": ["EV-00X"], "outputs": ["CLM-00Y"], "rationale": "string" }]
  },
  "scores": {
    "overall_confidence": 0.0,
    "overall_novelty": 0.0,
    "overall_risk": 0.0,
    "coverage": { "claims": 0, "evidences": 0, "contradictions_checked": true }
  }
}
Tu DOIS générer un JSON valide suivant EXACTEMENT cette structure.
NOTES CRITIQUES:
- evidence_index doit contenir au moins 5 preuves réelles avec citations (quotes).
- claim_graph doit lier CHAQUE claim à des evidence_ids.
- PAS DE NOEUD "GUÉRISON" -> Utilise "OUTCOME".
- Remplis "contradictions" sérieusement.
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
  "scores": {
      "novelty_score": 0.0,
      "technical_rigor": 0.0,
      "clinical_utility": 0.0,
      "overall_confidence": 0.0
  },
  "claim_graph": {
      "claims": [{
          "triple": { "source": { "label": "string", "type": "string" }, "rel": "string", "target": { "label": "string", "type": "string" } },
          "evidence_key": "string", // MUST match a snippet ID (e.g. "PMID:12345" or "[1]")
          "confidence": 0.0
      }]
  }
}

DÉTAILLE CHAQUE CHAMP. L'exactitude et la traçabilité sont tes seules priorités.
IMPORTANT: Chaque claim du graph DOIT avoir une 'evidence_key' valide pointant vers un des snippets fournis.`;

            let userPrompt = `GÉNÈRE UN RAPPORT COMMITTEE-GRADE basé sur les preuves ci-dessous.

CONTEXTE:
- Maladie/Cible: ${job.query_intent?.disease || 'Non spécifié'}
- Focus: ${job.query_intent?.focus || 'Général'}`;

            const snippets = job.evidence_pack?.snippets || [];
            userPrompt += `\n\nPREUVES (${snippets.length} extraits):\n` +
                snippets.slice(0, 30).map((s: { paper_id: string; passage: string }, i: number) =>
                    `\n[${i + 1}] ${s.paper_id}: "${s.passage.slice(0, 500)}..."\n`
                ).join('');

            userPrompt += `\n\nINSTRUCTIONS:
1. Génère UNE SEULE hypothèse avec TOUTES les sections du format
2. Tableau Go/No-Go: endpoints QUANTITATIFS obligatoires
3. Hypothèses rivales: H1, H2, H0, H3, H4 pour départage
4. Evidence Snapshot: classifie CHAQUE claim avec niveau Oxford/EBM rigoureux
5. Monitoring: timelines PRÉCISES (J0, J7...) + seuils quantitatifs

Retourne JSON strict selon le format spécifié.`;

            if (!providerResponseId) {
                await updateBackgroundJobRecord(supabase, job.id, {
                    status: 'processing', started_at: new Date().toISOString(),
                    progress_percentage: 30,
                    progress_message: 'Préparation de l’analyse approfondie RCDP (GPT-5.5).',
                });
            }
            const providerStep = await advanceHypothesisProvider({
                providerResponseId, maxTokens: _backgroundMaxTokens,
            }, {
                start: maxTokens => startBackgroundAI(systemPrompt, userPrompt, {
                    model: 'gpt-5.5', reasoningEffort: 'high', maxTokens,
                }),
                retrieve: responseId => retrieveBackgroundAI(responseId, {
                    model: 'gpt-5.5', reasoningEffort: 'high',
                }),
                update: (patch, budget) => updateBackgroundJobRecord(supabase, job.id, patch, budget),
            });
            if (!providerStep.ready) {
                return new Response(JSON.stringify({ accepted: true, job_id: job.id, status: 'processing' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 202,
                });
            }
            const content = providerStep.text;
            await updateBackgroundJobRecord(supabase, job.id, {
                progress_percentage: 90, progress_message: 'Validation et sauvegarde du résultat complet...',
            });

            const jsonString = extractHypothesisJSON(content);

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

            const h = parsed as ValidationData;



            // ===== ULTRA V3 HARD-FAIL VALIDATION =====
            const validateV3 = (data: ValidationData) => {
                const errors: string[] = [];
                if (typeof data.statement !== 'string' || !data.statement.trim()) errors.push('statement missing');

                // 1. Scope
                if (!data.clinical_scope) errors.push('clinical_scope missing');
                else {
                    if (!data.clinical_scope.candidate_subtypes || data.clinical_scope.candidate_subtypes.length === 0)
                        errors.push('candidate_subtypes empty');
                    if (!data.clinical_scope.uncertainties || data.clinical_scope.uncertainties.length === 0)
                        errors.push('uncertainties empty');
                }

                // 2. Evidence-Based
                const evidenceLen = data.evidence_index?.length || 0;
                if (!data.evidence_index || evidenceLen < 5)
                    errors.push(`evidence_index insufficient(${evidenceLen} / 5)`);
                else {
                    data.evidence_index.forEach((ev, idx: number) => {
                        if (!ev.passages || ev.passages.length === 0)
                            errors.push(`Evidence[${idx}] has no passages`);
                    });
                }

                // 3. Claim Graph
                if (!data.claim_graph || !data.claim_graph.claims || data.claim_graph.claims.length < 5)
                    errors.push('claim_graph claims insufficient (<5)');

                // Ensure Outcomes exist (Committee-Grade requirement)
                if (!data.claim_graph?.outcomes || data.claim_graph.outcomes.length < 1) {
                    errors.push('claim_graph.outcomes missing or empty (Must replace "Guérison")');
                }

                const coreClaimIds: string[] = data.claim_graph?.core_claim_ids || [];
                coreClaimIds.forEach((cid: string) => {
                    const claim = data.claim_graph?.claims?.find(c => c.claim_id === cid);
                    if (claim && (!claim.support_evidence_ids || claim.support_evidence_ids.length < 1))
                        errors.push(`Core claim ${cid} has insufficient support evidence(<1)`);
                });

                // 4. Contradictions & Trace
                // (Relaxed check for V3 scoring schema)

                const trace = data.reasoning_trace;
                if (!trace) errors.push('reasoning_trace missing');
                else {
                    if (!trace.retrieval_log || trace.retrieval_log.length < 1) errors.push('retrieval_log insufficient');
                    if (!trace.normalization_log || trace.normalization_log.length < 1) errors.push('normalization_log insufficient');
                    if (!trace.inference_steps || trace.inference_steps.length < 1) errors.push('inference_steps insufficient');
                }

                // 5. No Guaranteed Cure & Outcome Validity
                const forbiddenKeywords = ['guérison garantie', 'certitude absolue', 'guérison totale'];
                const fullText = JSON.stringify(data).toLowerCase();
                if (forbiddenKeywords.some(kw => fullText.includes(kw)))
                    errors.push('Contains forbidden absolute certainty terms (guérison garantie, etc.)');

                // Validate Outcomes are "Outcome" type
                if (data.claim_graph?.outcomes) {
                    data.claim_graph.outcomes.forEach((o, idx: number) => {
                        if (o.outcome?.label?.toLowerCase().includes('guérison')) {
                            errors.push(`Outcome[${idx}] label contains forbidden 'Guérison' term. Use specific clinical outcomes.`);
                        }
                    });
                }

                return errors;
            };

            const validationErrors = validateV3(h);
            if (validationErrors.length > 0) {
                console.error('❌ ULTRA V3 Validation Failed:', validationErrors);
                throw new Error(`Validation Violation: ${validationErrors.join(', ')} `);
            }

            // A crash after INSERT must recover the same clinical record, never
            // create another report. Both PKs are verified UUID columns in prod.
            publishing = true;
            const { data: owner, error: ownerError } = await supabase.from('ai_analysis_jobs')
                .select('requested_by').eq('id', job.id).eq('function_name', 'hypothesis-processor').single();
            if (ownerError || !owner?.requested_by) throw new Error('Propriétaire de la tâche indisponible.');
            const savedHyp = await publishHypothesisOnce<{ id: string }>(job.id, {
                async insertIfAbsent() {
                    const { data, error } = await supabase.from('discovery_hypotheses').upsert({
                        id: job.id,
                        hypothesis_id: `${h.hypothesis_id || 'HYP'}-${job.id}`,
                        user_id: owner.requested_by,
                        statement: h.statement,
                        executive_summary: h.executive_summary,
                        clinical_scope: h.clinical_scope,
                        evidence_snapshot: h.evidence_index,
                        contradictions: h.contradictions,
                        novelty_findings: h.novelty_findings,
                        validation_plan: h.validation_plan,
                        detailed_analysis: h.reasoning_trace,
                        scores: h.scores,
                        status: 'pending',
                    }, { onConflict: 'id', ignoreDuplicates: true }).select('id').maybeSingle();
                    if (error) throw new Error('Enregistrement de l’hypothèse indisponible.');
                    return data;
                },
                async load() {
                    const { data, error } = await supabase.from('discovery_hypotheses')
                        .select('id').eq('id', job.id).eq('user_id', owner.requested_by).maybeSingle();
                    if (error) throw new Error('Vérification de la publication indisponible.');
                    return data;
                },
            });

            // ===== PHASE 2: Persist structured graph nodes/edges from V3 claim_graph =====
            try {
                const claimGraph = h.claim_graph;
                if (claimGraph?.claims && savedHyp?.id) {
                    console.log(`📊 Persisting ${claimGraph.claims.length} V3 claims into graph layer...`);

                    // Collect all raw entity labels for normalization
                    const rawLabels: string[] = [];
                    claimGraph.claims.forEach((claim: any) => {
                        if (claim.triple?.source?.label) rawLabels.push(claim.triple.source.label);
                        if (claim.triple?.target?.label) rawLabels.push(claim.triple.target.label);
                    });

                    // Batch normalize
                    // Assuming normalizeEntities is defined elsewhere and returns a Map
                    const normalizeEntities = async (labels: string[]) => {
                        // Placeholder for actual normalization logic
                        // This would typically call an external service or a local utility
                        const map = new Map<string, { label: string; type: string; id: string }>();
                        labels.forEach(label => map.set(label, { label: label, type: 'unknown', id: 'Unknown' }));
                        return map;
                    };
                    const normalizationMap = await normalizeEntities(rawLabels);

                    const nodesMap = new Map<string, { label: string; type: string; norm_ids: string[] }>();
                    claimGraph.claims.forEach((claim: any) => {
                        if (!claim.triple) return;

                        const s = claim.triple.source;
                        const t = claim.triple.target;

                        // Helper to get normalized data
                        const getNorm = (raw: { label: string; type?: string; norm_ids?: string[] }) => {
                            const norm = normalizationMap.get(raw.label);
                            return {
                                label: norm?.label || raw.label,
                                type: (norm?.type !== 'unknown' && norm?.type) ? norm!.type : (raw.type || 'unknown'),
                                norm_ids: (norm?.id && norm?.id !== 'Unknown') ? [norm!.id] : (raw.norm_ids || [])
                            };
                        };

                        if (s?.label && !nodesMap.has(s.label)) nodesMap.set(s.label, getNorm(s));
                        if (t?.label && !nodesMap.has(t.label)) nodesMap.set(t.label, getNorm(t));
                    });


                    // Update discovery_hypotheses with the graph data for immediate UI availability
                    interface UIGraph {
                        nodes: any[];
                        edges: any[];
                    }
                    const uiGraph: UIGraph = {
                        nodes: [],
                        edges: []
                    };

                    try {
                        const claimNodes = claimGraph.claims.map((claim: any, idx: number) => ({
                            id: `clm${idx}`,
                            label: claim.triple.source.label,
                            type: claim.triple.source.type || 'unknown'
                        }));
                        const outcomeNodes = (claimGraph.outcomes || []).map((out: any, idx: number) => ({
                            id: `out${idx}`,
                            label: out.outcome.label,
                            type: 'OUTCOME'
                        }));

                        uiGraph.nodes = [...claimNodes, ...outcomeNodes];

                        const claimEdges = claimGraph.claims.map((claim: any) => ({
                            source: claim.triple.source.label,
                            target: claim.triple.target.label,
                            label: claim.triple.rel,
                            data: {
                                // Evidence references
                                evidenceIds: claim.support_evidence_ids || [],
                                // Scores
                                score: claim.scores?.aggregate || 0.5,
                                safety: claim.scores?.safety_risk || 0,
                                novelty: claim.scores?.novelty || 0,
                                plausibility: claim.scores?.plausibility || 0,
                                // Mechanism explanation
                                mechanism: claim.mechanism_of_action || claim.context || `${claim.triple.source.label} ${claim.triple.rel} ${claim.triple.target.label}`,
                                context: claim.population_context || claim.clinical_context || '',
                                // Confidence level (Oxford)
                                confidenceLevel: claim.oxford_level || claim.evidence_level || 'Non défini',
                                // Direction
                                direction: claim.direction || (claim.triple.rel?.includes('INHIBITS') || claim.triple.rel?.includes('REDUCES') ? 'négatif' : 'positif'),
                                // Raw claim ID for reference
                                claimId: claim.claim_id || `claim-${Math.random().toString(36).substr(2, 9)}`,
                                // Source type
                                sourceType: claim.triple.source.type || 'unknown',
                                targetType: claim.triple.target.type || 'unknown',
                                // References (PMIDs, DOIs)
                                references: claim.key_references || claim.references || []
                            }
                        }));
                        const outcomeEdges: any[] = [];
                        (claimGraph.outcomes || []).forEach((out: any) => {
                            (out.linked_claim_ids || []).forEach((cid: string) => {
                                const claim = (claimGraph.claims || []).find((c: any) => c.claim_id === cid);
                                if (claim?.triple?.target) {
                                    outcomeEdges.push({
                                        source: claim.triple.target.label,
                                        target: out.outcome.label,
                                        label: 'CONTRIBUTES_TO',
                                        data: {
                                            evidenceIds: claim.support_evidence_ids || [], // Inherit evidence from the claim
                                            score: 0.9,
                                            isOutcomeLink: true
                                        }
                                    });
                                }
                            });
                        });

                        uiGraph.edges = [...claimEdges, ...outcomeEdges];

                        await supabase.from('discovery_hypotheses').update({
                            causal_graph: uiGraph
                        }).eq('id', savedHyp.id);
                    } catch (e: any) {
                        console.warn('⚠️ UI Graph construction failed, skipping JSON update');
                    }

                    const nodeKeys = new Map<string, string>(); // Raw Label -> node_key
                    const nodeInserts: any[] = [];
                    let nodeIdx = 0;

                    // Add Claim Nodes
                    for (const [rawLabel, nodeData] of nodesMap.entries()) {
                        const key = `n${nodeIdx}`;
                        nodeKeys.set(rawLabel, key);
                        nodeInserts.push({
                            hypothesis_id: savedHyp.id,
                            node_key: key,
                            node_type: (nodeData.type || 'unknown').toLowerCase(),
                            label: nodeData.label,
                            mechanism: `V3 Entity: ${nodeData.label}`,
                            attributes: { norm_ids: nodeData.norm_ids }
                        });
                        nodeIdx++;
                    }

                    // Add Outcome Nodes
                    (claimGraph.outcomes || []).forEach((out: any, idx: number) => {
                        const key = `out${idx}`;
                        const label = out.outcome.label;
                        if (!nodeKeys.has(label)) {
                            nodeKeys.set(label, key);
                            nodeInserts.push({
                                hypothesis_id: savedHyp.id,
                                node_key: key,
                                node_type: 'outcome',
                                label: label,
                                mechanism: 'V3 Clinical Outcome',
                                attributes: {
                                    norm_ids: out.outcome.norm_ids,
                                    criteria: out.criteria
                                }
                            });
                        }
                    });

                    const edgeInserts = claimGraph.claims.map((claim: any) => {
                        const sRaw = claim.triple.source.label;
                        const tRaw = claim.triple.target.label;

                        const sKey = nodeKeys.get(sRaw) || 'unknown';
                        const tKey = nodeKeys.get(tRaw) || 'unknown';

                        // Join evidence IDs for storage
                        const evidenceRef = (claim.support_evidence_ids || []).join(',');

                        return {
                            hypothesis_id: savedHyp.id,
                            source_key: sKey,
                            target_key: tKey,
                            edge_type: claim.triple.rel,
                            label: claim.triple.rel,
                            reason: claim.notes || 'V3 Logic',
                            evidence_pmid: evidenceRef || null,
                            weight: claim.scores?.aggregate || 0.5
                        };
                    });

                    // Add Outcome Edges
                    (claimGraph.outcomes || []).forEach((out: any) => {
                        (out.linked_claim_ids || []).forEach((cid: string) => {
                            const claim = (claimGraph.claims || []).find((c: any) => c.claim_id === cid);
                            if (claim?.triple?.target) {
                                const sKey = nodeKeys.get(claim.triple.target.label); // Link from result of claim
                                const tKey = nodeKeys.get(out.outcome.label);

                                if (sKey && tKey) {
                                    edgeInserts.push({
                                        hypothesis_id: savedHyp.id,
                                        source_key: sKey,
                                        target_key: tKey,
                                        edge_type: 'CONTRIBUTES_TO',
                                        label: 'CONTRIBUTES_TO',
                                        reason: 'Outcome Linkage',
                                        evidence_pmid: null,
                                        weight: 0.9
                                    });
                                }
                            }
                        });
                    });

                    console.log(`📊 Persisting ${nodeInserts.length} nodes and ${edgeInserts.length} edges...`);

                }

                // --- NEW: PERSIST LBD CLAIMS (Required for Contradiction Detector) ---
                if (claimGraph && claimGraph.claims && claimGraph.claims.length > 0) {
                    try {
                        const lbdClaimsInserts = await Promise.all(claimGraph.claims.map(async (c: any, index: number) => ({
                            id: await hypothesisClaimId(job.id, index),
                            hypothesis_id: savedHyp.id,
                            subject_text: c.triple?.subject?.label || c.triple?.source?.label || 'Unknown',
                            subject_type: c.triple?.subject?.type || c.triple?.source?.type || 'Unknown',
                            predicate: c.triple?.predicate || c.triple?.rel || 'RELATED_TO',
                            object_text: c.triple?.target?.label || 'Unknown',
                            object_type: c.triple?.target?.type || 'Unknown',
                            aggregate_score: c.confidence_score || 0.5,
                            evidence_quality: c.confidence_score || 0.5, // approximate
                            mechanistic_plausibility: c.confidence_score || 0.5, // approximate
                            inference_rule: 'AI_GENERATION_V3',
                            status: 'active'
                        })));

                        const { data: insertedClaims, error: claimsError } = await supabase
                            .from('lbd_claims')
                            .upsert(lbdClaimsInserts, { onConflict: 'id', ignoreDuplicates: true }).select('id');

                        if (claimsError) {
                            console.warn('⚠️ LBD Claims insert failed:', claimsError.message);
                        } else if (insertedClaims?.length) {
                            console.log(`Inserted ${insertedClaims.length} LBD claims`);

                            // --- TRIGGER CONTRADICTION DETECTOR ---
                            console.log('🚀 Triggering LBD Contradiction Detector...');
                            const detector = fetch(`${supabaseUrl}/functions/v1/lbd-contradiction-detector`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${supabaseKey}`, apikey: supabaseKey,
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({ hypothesis_id: savedHyp.id, pathology_label: job.query }),
                                signal: AbortSignal.timeout(45_000),
                            }).then(async response => {
                                await response.body?.cancel();
                                if (!response.ok) console.warn('Contradiction detector could not confirm processing.');
                            }).catch(() => console.warn('Contradiction detector dispatch interrupted.'));
                            (globalThis as typeof globalThis & { EdgeRuntime?: { waitUntil(p: Promise<void>): void } })
                                .EdgeRuntime?.waitUntil(detector);

                        }
                    } catch (claimErr: any) {
                        console.warn('⚠️ Error processing LBD claims:', claimErr.message);
                    }
                }

            } catch (graphError: any) {
                console.warn('⚠️ Graph persistence failed:', graphError.message);
            }

            const result = {
                success: true, job_id: job.id, hypothesis_id: savedHyp.id, hypothesis: h,
            };
            await updateBackgroundJobRecord(supabase, job.id, {
                status: 'completed', provider_status: 'completed',
                completed_at: new Date().toISOString(),
                progress_percentage: 100, progress_message: 'Hypothèse ULTRA V3 générée avec succès!',
                result_payload: result, error_message: null,
            });
            return new Response(JSON.stringify(result), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });

        } catch (processingError: unknown) {
            if (publishing && providerResponseId) {
                // Persistence is retryable against the same provider response;
                // deterministic IDs make a lost DB acknowledgment harmless.
                await updateBackgroundJobRecord(supabase, job.id, {
                    provider_status: 'in_progress',
                    progress_message: 'Reprise de la sauvegarde du résultat IA conservé.',
                }).catch(() => console.warn('Hypothesis publication awaits lease recovery.'));
                return new Response(JSON.stringify({ accepted: true, job_id: job.id, status: 'processing' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 202,
                });
            }
            const message = processingError instanceof Error ? processingError.message : 'La génération a échoué.';
            console.error(`Hypothesis job ${job.id} could not be finalized.`);
            await updateBackgroundJobRecord(supabase, job.id, {
                status: 'failed', error_message: message, completed_at: new Date().toISOString(),
                progress_message: 'La génération n’a pas produit de résultat validé.',
            });
            return new Response(JSON.stringify({ error: message, job_id: job.id }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
            });
        }

    } catch (error: any) {
        console.error('❌ CRITICAL Processor Error:', error);
        return new Response(JSON.stringify({
            error: error.message,
            type: 'CRITICAL_PROCESSOR_ERROR'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
