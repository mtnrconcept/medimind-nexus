// Hypothesis Processor - Background job processor for async hypothesis generation
// This Edge Function processes pending jobs without timeout constraints

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Job {
    id: string;
    query: string;
    query_intent: any;
    evidence_pack: any;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
        const supabase = createClient(supabaseUrl, supabaseKey);

        console.log('🔄 Checking for pending jobs...');

        // Find the oldest pending job
        const { data: jobs, error: fetchError } = await supabase
            .from('hypothesis_generation_jobs')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(1);

        if (fetchError) {
            console.error('Error fetching jobs:', fetchError);
            return new Response(JSON.stringify({ error: fetchError.message }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            });
        }

        if (!jobs || jobs.length === 0) {
            console.log('✅ No pending jobs');
            return new Response(JSON.stringify({ message: 'No pending jobs' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const job: Job = jobs[0];
        console.log(`📋 Processing job ${job.id}`);

        // Mark job as processing
        await supabase
            .from('hypothesis_generation_jobs')
            .update({
                status: 'processing',
                started_at: new Date().toISOString(),
                progress_percentage: 10,
                progress_message: 'Génération de l\'hypothèse avec Claude...'
            })
            .eq('id', job.id);

        try {
            // Generate hypothesis using Claude (copy from discovery-platform generateHypotheses function)
            const systemPrompt = `Tu es un expert scientifique médical chargé de générer un RAPPORT DE RECHERCHE COMMITTEE-GRADE sur une hypothèse thérapeutique.

FORMAT DE SORTIE (JSON strict):
{
  "hypotheses": [
    {
      "hypothesis_id": "HYP-{TOPIC}-{TIMESTAMP}",
      "statement": "Énoncé principal de l'hypothèse",
      "executive_summary": {
        "context": "...",
        "central_hypothesis_operational": "...",
        "scope_decisions": "...",
        "go_nogo_table": [...]
      },
      "clinical_scope": {...},
      "rival_hypotheses": {...},
      "evidence_snapshot": [...],
      "mechanistic_model": {...},
      "risks_monitoring": {...},
      "detailed_analysis": {...},
      "predictions": [...],
      "minimal_tests": [...],
      "risks_confounders": [...],
      "drug_repurposing_candidates": [...],
      "scores": {...},
      "evidence_citations": [...]
    }
  ]
}

CONSIGNES CRITIQUES:
1. NIVEAUX OXFORD/EBM (sois rigoureux): 1a=méta-analyse RCT, 1b=RCT seul, 2a=méta cohorts, 2b=cohorte, 3=cas-contrôle, 4=case series, 5=physio
2. TABLEAU GO/NO-GO: ENDPOINTS QUANTITATIFS obligatoires
3. HYPOTHÈSES RIVALES: Formule H3/H4 pour permettre DÉPARTAGE scientifique
4. DAG: Format textuel avec flèches (→, ↘) pour causalité
5. MONITORING: Timeline PRÉCISE (J0, J7...) + seuils QUANTITATIFS

CONTRAINTE CRITIQUE:
- detailed_analysis: MAX 2-3 phrases concises par sous-section
- Évite répétitions
- Privilégie tableaux/listes

GÉNÈRE UN RAPPORT AUDIT-READY POUR COMITÉ SCIENTIFIQUE/IRB.`;

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
                    progress_message: 'Analyse en cours avec Claude Opus 4...'
                })
                .eq('id', job.id);

            // Create broadcast channel for live streaming
            const broadcastChannel = supabase.channel(`hypothesis-stream-${job.id}`, {
                config: { broadcast: { self: true } }
            });

            // Call Claude API WITH STREAMING
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': anthropicKey,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-opus-4-20250514',
                    max_tokens: 30000,
                    stream: true,  // Enable streaming!
                    messages: [{ role: 'user', content: userPrompt }],
                    system: systemPrompt
                })
            });

            if (!response.ok) {
                throw new Error(`Claude API error: ${response.status}`);
            }

            // Process streaming response
            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No reader available');
            }

            const decoder = new TextDecoder();
            let buffer = '';
            let content = '';

            console.log('🔴 Starting live stream broadcast...');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process SSE events
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const event = JSON.parse(data);
                            if (event.type === 'content_block_delta' && event.delta?.text) {
                                const text = event.delta.text;
                                content += text;

                                // Broadcast chunk to frontend via Realtime
                                await broadcastChannel.send({
                                    type: 'broadcast',
                                    event: 'chunk',
                                    payload: { text }
                                });
                            }
                        } catch (e) {
                            // Skip invalid JSON
                        }
                    }
                }
            }

            console.log(`✅ Stream complete. Total length: ${content.length}`);

            // Close broadcast channel
            await broadcastChannel.send({
                type: 'broadcast',
                event: 'stream_complete',
                payload: { message: 'Streaming terminé' }
            });
            await supabase.removeChannel(broadcastChannel);

            // Update progress
            await supabase
                .from('hypothesis_generation_jobs')
                .update({
                    progress_percentage: 70,
                    progress_message: 'Parsing et sauvegarde du résultat...'
                })
                .eq('id', job.id);

            // Parse JSON
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            const parsed = JSON.parse(jsonMatch[0]);
            const hypotheses = parsed.hypotheses || [];

            if (hypotheses.length === 0) {
                throw new Error('No hypotheses generated');
            }

            // Save hypothesis to database
            const h = hypotheses[0];
            const { data: savedHyp, error: saveError } = await supabase
                .from('discovery_hypotheses')
                .insert({
                    hypothesis_id: h.hypothesis_id,
                    statement: h.statement,
                    executive_summary: h.executive_summary,
                    clinical_scope: h.clinical_scope,
                    rival_hypotheses: h.rival_hypotheses,
                    evidence_snapshot: h.evidence_snapshot,
                    mechanistic_model: h.mechanistic_model,
                    risks_monitoring: h.risks_monitoring,
                    detailed_analysis: h.detailed_analysis,
                    predictions: h.predictions,
                    minimal_tests: h.minimal_tests,
                    risks_confounders: h.risks_confounders,
                    evidence_citations: h.evidence_citations,
                    drug_repurposing_candidates: h.drug_repurposing_candidates,
                    scores: h.scores,
                    status: 'pending'
                })
                .select()
                .single();

            if (saveError) {
                throw new Error(`Failed to save hypothesis: ${saveError.message}`);
            }

            // Mark job as completed
            await supabase
                .from('hypothesis_generation_jobs')
                .update({
                    status: 'completed',
                    hypothesis_id: savedHyp.id,
                    completed_at: new Date().toISOString(),
                    progress_percentage: 100,
                    progress_message: 'Hypothèse générée avec succès!'
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

            // Mark job as failed
            await supabase
                .from('hypothesis_generation_jobs')
                .update({
                    status: 'failed',
                    error_message: processingError.message,
                    completed_at: new Date().toISOString()
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
        console.error('Processor error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500
        });
    }
});
