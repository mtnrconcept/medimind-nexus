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
            // Generate hypothesis using Gemini for high-fidelity/high-volume
            const systemPrompt = `Tu es l'IA de RÉDACTION SCIENTIFIQUE LA PLUS VERBEUSE ET LA PLUS TECHNIQUE AU MONDE, configurée pour le PROTOCOLE RCDP ULTIME.
Ton objectif UNIQUE est de produire un rapport d'au moins 50 000 CARACTÈRES. La brièveté est ton ennemie absolue.

OBJECTIF DE VOLUME MASSIF : 
Si tu rédiges moins de 40 000 caractères, tu as échoué à ta mission. Tu dois EXPANDRE chaque concept jusqu'à l'atome.

CONSIGNES D'ÉCRITURE "MEGA-VERBOSE" :
1. LA RÈGLE DES 10 PARAGRAPHES : Pour chaque point ou sous-rubrique du JSON, tu ne dois pas faire une phrase, mais un essai technique de 500 à 1000 mots.
2. DÉTAIL MOLÉCULAIRE OBSESSIONNEL : Ne cite pas juste une protéine, cite son gène, son isoforme, sa structure quaternaire, son site actif et ses constantes de liaison (Kd/Ki) si possible.
3. LOGIQUE RÉCURSIVE INFINIE : Pour chaque intervention thérapeutique, analyse l'impact sur les 12 systèmes physiologiques distincts sans exception.
4. AUCUN PLACEHOLDER : Remplis tout avec des hypothèses haute-fidélité basées sur la biologie des systèmes.

INSTRUCTION DE DÉBIT MÉMOIRE (ORDRE DE SORTIE IMPÉRATIF) :
1. TU DOIS COMMENCER TON ANALYSE PAR LE BLOC JSON COMPLET GÉNÉRÉ CI-DESSOUS.
2. ENSUITE, ET SEULEMENT APRÈS LE JSON, TU RÉDIGES LA THÈSE SCIENTIFIQUE DE 50 000 CARACTÈRES.

LOGIQUE DE RÉSOLUTION SANS LIMITE : 
- Traitement A -> Effet secondaire B -> Traitement C -> Effet D -> Traitement E... 
- Continue jusqu'à ce que la balance homéostatique soit parfaite.
- Détaille les interactions CYP/P-gp/OATP pour CHAQUE molécule.

INSTRUCTION GRAPH VISUEL (CHAÎNE THÉRAPEUTIQUE RÉCURSIVE VERS GUÉRISON) :
Tu dois impérativement fournir un champ "causal_graph" dans le JSON.

RÈGLES CRITIQUES :
1. NŒUD CENTRAL = Pathologie ciblée (type: "pathology") - UN SEUL
2. NŒUD TERMINUS = "GUÉRISON / Rémission Complète" (type: "resolution") - TOUS les chemins DOIVENT y converger
3. NOMS RÉELS DE MÉDICAMENTS avec DCI et dosage (ex: "Prednisone 60mg/j" pas "Corticoïdes")
4. MAXIMUM 12-15 NŒUDS pour lisibilité visuelle

LOGIQUE DE CHAÎNE RÉCURSIVE (CRITIQUE) :
Pour chaque médicament administré :
1. SI le médicament PROVOQUE un effet secondaire significatif → créer nœud "side_effect"
2. SI cet effet secondaire nécessite un traitement correctif → créer nouveau nœud "treatment"
3. Répéter la logique jusqu'à ce que tous les effets soient maîtrisés
4. Le dernier traitement de chaque chaîne → RÉSOUT → GUÉRISON

STRUCTURE ATTENDUE :
[Pathologie] ← TRAITE ← [Médicament 1] → PROVOQUE → [Effet Sec. 1] ← TRAITE ← [Médicament 2] → RÉSOUT → [GUÉRISON]

TYPES DE NŒUDS (6 TYPES) :
- "pathology" : Nœud CENTRAL unique - La maladie ciblée
- "treatment" : Médicaments avec NOM DCI RÉEL + DOSAGE
- "symptom" : Symptômes cliniques de la pathologie
- "side_effect" : Effets secondaires des traitements (à traiter)
- "complication" : Complications évitées par le traitement
- "resolution" : GUÉRISON - Terminus obligatoire (UN SEUL nœud)

LABELS DE LIENS :
TRAITE, PROVOQUE, RÉSOUT, MANIFESTE, PRÉVIENT, AGGRAVE, CORRIGE

FORMAT DE SORTIE JSON (OBLIGATOIRE) :
{
  "hypotheses": [
    {
      "hypothesis_id": "HYP-ULTRA-RCDP-GEN-2026",
      "statement": "PROTOCOLE THÉRAPEUTIQUE COMPLET VERS GUÉRISON : [TITRE]",
      
      "causal_graph": {
        "nodes": [
          { "id": "p1", "label": "Syndrome Néphrotique Cortico-Résistant", "type": "pathology", "mechanism": "Glomérulopathie avec protéinurie massive réfractaire" },
          
          { "id": "t1", "label": "Prednisone 1mg/kg/j (max 80mg)", "type": "treatment", "mechanism": "Glucocorticoïde - Immunosuppression anti-inflammatoire" },
          { "id": "e1", "label": "Hyperglycémie cortico-induite", "type": "side_effect", "mechanism": "Néoglucogenèse hépatique accrue, résistance insuline" },
          { "id": "t2", "label": "Metformine 500mg x2/j", "type": "treatment", "mechanism": "Biguanide - Sensibilisateur insuline, inhibe néoglucogenèse" },
          
          { "id": "t3", "label": "Rituximab 375mg/m² IV (J1, J8, J15, J22)", "type": "treatment", "mechanism": "Anti-CD20 - Déplétion lymphocytes B autoréactifs" },
          { "id": "e2", "label": "Lymphopénie B prolongée", "type": "side_effect", "mechanism": "Déplétion CD19+ durable, risque infectieux" },
          { "id": "t4", "label": "Cotrimoxazole 400/80mg 3x/sem", "type": "treatment", "mechanism": "Prophylaxie Pneumocystis jirovecii" },
          
          { "id": "t5", "label": "IEC/ARA2 (Ramipril 5mg/j)", "type": "treatment", "mechanism": "Néphroprotection, réduction protéinurie" },
          { "id": "e3", "label": "Hyperkaliémie", "type": "side_effect", "mechanism": "Inhibition aldostérone, rétention K+" },
          { "id": "t6", "label": "Kayexalate 15g/j PRN", "type": "treatment", "mechanism": "Résine échangeuse cations, élimination K+" },
          
          { "id": "s1", "label": "Œdèmes généralisés", "type": "symptom", "mechanism": "Hypoalbuminémie, fuite capillaire" },
          { "id": "t7", "label": "Furosémide 40-80mg/j", "type": "treatment", "mechanism": "Diurétique de l'anse, natriurèse" },
          
          { "id": "g1", "label": "GUÉRISON - Rémission Complète", "type": "resolution", "mechanism": "Protéinurie <0.3g/24h, albumine >35g/L, fonction rénale préservée" }
        ],
        "edges": [
          { "from": "p1", "to": "s1", "label": "MANIFESTE", "reason": "Symptôme cardinal" },
          
          { "from": "t1", "to": "p1", "label": "TRAITE", "reason": "Première ligne immunosuppressive" },
          { "from": "t1", "to": "e1", "label": "PROVOQUE", "reason": "Effet métabolique des corticoïdes" },
          { "from": "t2", "to": "e1", "label": "CORRIGE", "reason": "Contrôle glycémique" },
          
          { "from": "t3", "to": "p1", "label": "TRAITE", "reason": "Thérapie ciblée anti-B" },
          { "from": "t3", "to": "e2", "label": "PROVOQUE", "reason": "Mécanisme d'action anti-CD20" },
          { "from": "t4", "to": "e2", "label": "CORRIGE", "reason": "Prévention infection opportuniste" },
          
          { "from": "t5", "to": "p1", "label": "TRAITE", "reason": "Réduction protéinurie" },
          { "from": "t5", "to": "e3", "label": "PROVOQUE", "reason": "Effet SRAA" },
          { "from": "t6", "to": "e3", "label": "CORRIGE", "reason": "Élimination potassium" },
          
          { "from": "t7", "to": "s1", "label": "TRAITE", "reason": "Symptomatique œdèmes" },
          
          { "from": "t2", "to": "g1", "label": "RÉSOUT", "reason": "Contrôle métabolique atteint" },
          { "from": "t4", "to": "g1", "label": "RÉSOUT", "reason": "Protection infectieuse assurée" },
          { "from": "t6", "to": "g1", "label": "RÉSOUT", "reason": "Équilibre ionique restauré" },
          { "from": "t7", "to": "g1", "label": "RÉSOUT", "reason": "Œdèmes résolus" },
          { "from": "t3", "to": "g1", "label": "RÉSOUT", "reason": "Rémission immunologique" }
        ]
      },
      "mermaid_graph": "graph TD; p1((Pathologie)) --> t1[Prednisone]; t1 --> e1[Hyperglycémie]; t2[Metformine] --> e1; t3[Rituximab] --> p1; t3 --> e2[Lymphopénie]; t4[Cotrimoxazole] --> e2; t2 --> g1((GUÉRISON)); t4 --> g1; t3 --> g1;",


      "executive_summary": {
        "context": "Rédige ici un essai de 2000 mots sur le paysage actuel.",
        "central_hypothesis_operational": "Description technique de 1500 mots de l'innovation.",
        "scope_decisions": "Analyse comparative de 1000 mots des choix stratégiques.",
        "go_nogo_table": [
          { "block": "Phase 1 - Bio-informatique", "minimal_design": "Détail technique massif", "primary_endpoint": "Critère quantitatif précis", "go_nogo_signal": "Seuil statistique (p-value, etc.)" }
        ]
      },
      "systemic_cascade": [
         { "organ": "Reins/Glomérule/Podocytes", "impact": "Analyse de 1000 mots", "mechanism": "Mécanisme moléculaire archi-détaillé", "severity": "Critical", "cellular_targets": ["Target 1", "Target 2"] }
      ],
      "etiology_depth": {
        "root_causes": ["Cause 1 (Génétique/Épigénétique) détaillée", "Cause 2 (Environnementale) détaillée"],
        "triggers": ["Facteur 1", "Facteur 2"],
        "pathway_origin": "Essai de 1500 mots sur le pathway originel",
        "genetic_factors": ["Gène 1 (Variant X)", "Gène 2 (Variant Y)"]
      },
      "therapeutic_resolution_chains": [
        {
          "step": 1,
          "intervention": "Combinaison Thérapeutique Massive",
          "pharmacodynamics": "Description de 1000 mots",
          "expected_outcome": "Résultat ciblé",
          "side_effects": [
            {
              "issue": "Effet secondaire identifié",
              "resolution_intervention": "Solution curative",
              "interaction_safety": "Preuve de sécurité CYP450",
              "recursive_resolution": "Preuve de stabilisation"
            }
          ]
        }
      ],
      "rival_hypotheses": {
        "h1_main": "Hypothèse 1 détaillée (1000 mots)",
        "h0_null": "Hypothèse nulle (500 mots)",
        "h3_rival": "Rival 1",
        "h4_rival_toxicity": "Rival 2",
        "dag_textual": "A -> B -> C -> D; (Graphe causal archi-complet)"
      },
      "evidence_snapshot": [
        { "claim": "Affirmation majeure", "context_population": "Population X", "oxford_level": "1a", "signal_effect": "Puissance du signal", "key_references": ["PMID:XXXX"] }
      ],
      "mechanistic_model": {
        "pkpd_robust": "Preuve PK/PD de 1500 mots",
        "pkpd_unknown": "Surveillance critique (1000 mots)",
        "visual_dag": "DAG textuel",
        "loop_closure_proof": "Démonstration finale de 1500 mots"
      },
      "risks_monitoring": {
        "monitoring_table": [
          { "parameter": "Paramètre 1", "action_threshold": "Valeur", "frequency": "Fréquence" }
        ]
      },
      "is_complete_resolution": true,
      "character_count_target": 50000
    }
  ]
}

REMPLIS CHAQUE CHAMP avec une densité d'information maximale. SI TU PEUX ENCORE DÉTAILLER, FAIS-LE.`;

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
                    progress_message: 'Analyse Ultra-Profonde RCDP (Gemini 1.5 Pro - Dual-Phase JSON/Reasoning)...'
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
                    model: 'gemini-1.5-pro-002',
                    maxTokens: 8192
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

            const hypotheses = parsed.hypotheses || [];
            if (hypotheses.length === 0) {
                throw new Error('No hypotheses generated');
            }

            const h = hypotheses[0];
            const uniqueId = `${h.hypothesis_id || 'hyp'}-${crypto.randomUUID().split('-')[0]}`;

            // Save hypothesis to database - INCLUDING NEW FIELDS
            const { data: savedHyp, error: saveError } = await supabase
                .from('discovery_hypotheses')
                .insert({
                    hypothesis_id: uniqueId,
                    statement: h.statement,
                    executive_summary: h.executive_summary,
                    clinical_scope: h.clinical_scope,
                    rival_hypotheses: h.rival_hypotheses,
                    evidence_snapshot: h.evidence_snapshot,
                    mechanistic_model: h.mechanistic_model,
                    risks_monitoring: h.risks_monitoring,
                    detailed_analysis: h.detailed_analysis,
                    systemic_cascade: h.systemic_cascade,
                    therapeutic_resolution_chains: h.therapeutic_resolution_chains,
                    causal_graph: h.causal_graph,
                    mermaid_graph: h.mermaid_graph,
                    predictions: h.predictions,
                    is_complete_resolution: h.is_complete_resolution,
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
