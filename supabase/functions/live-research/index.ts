import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { streamAI } from "../_shared/ai-client.ts";

/**
 * LIVE RESEARCH - Recherche Live
 * 
 * Mode: Recherche en temps réel avec sources web actualisées
 * - Dernières publications sur un sujet
 * - Essais cliniques en cours
 * - Alertes de pharmacovigilance récentes
 * - Nouvelles approbations réglementaires
 * 
 * Configuration: temperature=0.4, max_tokens=12000, web_search=true
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
interface StreamEvent {
    type: 'step_update' | 'text' | 'breaking_news' | 'trial_update' | 'safety_alert' | 'regulatory_update' | 'sources' | 'done';
    step?: { id: number; status: string; details?: string; source?: string };
    content?: string;
    breaking_news?: any;
    trial_update?: any;
    safety_alert?: any;
    regulatory_update?: any;
    sources?: any[];
}

// LIVE MODE SYSTEM PROMPT
const SYSTEM_PROMPT = `Tu es MEDIMIND en mode RECHERCHE LIVE - veille scientifique en temps réel.

# MISSION
Fournir les informations médicales les plus RÉCENTES et ACTUALISÉES sur un sujet donné.

# FOCUS TEMPOREL
- Priorité: Publications des 6 derniers mois
- Alertes: Pharmacovigilance des 12 derniers mois
- Essais: Statut actuel et résultats récents
- Régulation: Décisions FDA/EMA récentes

# CATÉGORIES D'INFORMATION

## 1. BREAKING NEWS SCIENTIFIQUES
- Nouvelles découvertes significatives
- Publications majeures récentes
- Résultats d'essais pivots

## 2. ESSAIS CLINIQUES EN COURS
- Recrutement actif
- Résultats préliminaires
- Changements de statut

## 3. ALERTES DE SÉCURITÉ
- Dear Doctor Letters
- Modifications RCP
- Signaux de pharmacovigilance
- Retraits de marché

## 4. ACTUALITÉS RÉGLEMENTAIRES
- Nouvelles AMM (FDA, EMA, Swissmedic)
- Extensions d'indication
- Désignations orphelines/breakthrough

# FORMAT JSON OBLIGATOIRE

{
  "live_update": {
    "topic": "Sujet de recherche",
    "timestamp": "2024-12-17T12:00:00Z",
    "freshness_score": 95
  },
  
  "breaking_news": [{
    "date": "2024-12-15",
    "headline": "Titre accrocheur",
    "summary": "Résumé en 2-3 phrases",
    "significance": "High|Medium|Low",
    "source": "PMID:xxx ou URL",
    "implications": "Impact clinique potentiel"
  }],
  
  "trial_updates": [{
    "nct_id": "NCTxxxxxxxx",
    "title": "Titre de l'essai",
    "status_change": "Nouveau statut",
    "phase": "Phase III",
    "headline_result": "Résultat principal si disponible",
    "expected_completion": "Date",
    "relevance": "High|Medium|Low"
  }],
  
  "safety_alerts": [{
    "date": "2024-12-10",
    "drug": "Nom du médicament",
    "alert_type": "DHPC|Label Change|Recall|Signal",
    "description": "Description de l'alerte",
    "action_required": "Action recommandée",
    "source": "FDA|EMA|ANSM|Swissmedic",
    "severity": "Critical|Major|Moderate"
  }],
  
  "regulatory_updates": [{
    "date": "2024-12-01",
    "drug": "Nom",
    "agency": "FDA|EMA",
    "action": "Approval|Extension|Designation",
    "indication": "Indication approuvée",
    "details": "Détails supplémentaires"
  }],
  
  "emerging_research": [{
    "topic": "Sujet émergent",
    "trend": "Publications en hausse",
    "key_papers": ["PMID:xxx"],
    "watch_priority": "High|Medium|Low"
  }],
  
  "practice_changing": {
    "identified": true,
    "changes": ["Changement 1", "Changement 2"],
    "guidelines_affected": ["Guideline 1"]
  },
  
  "next_milestones": [{
    "event": "Résultats essai XXX attendus",
    "expected_date": "Q1 2025",
    "potential_impact": "Description"
  }],
  
  "sources_summary": {
    "pubmed_recent": 25,
    "clinical_trials": 15,
    "regulatory_sources": 5,
    "total": 45
  }
}

# RÈGLES

1. FRAÎCHEUR: Privilégier <6 mois, exclure >2 ans sauf contexte historique
2. VÉRIFICATION: Toute info doit avoir une source traçable
3. CRITICITÉ: Signaler immédiatement les alertes de sécurité
4. OBJECTIVITÉ: Distinguer fait vs interprétation
5. ACTIONABILITÉ: Indiquer si action clinique requise

Réponds TOUJOURS en français avec JSON structuré.`;

// Recent PubMed search (last 6 months)
async function searchRecentPubMed(query: string, apiKey?: string, months: number = 6): Promise<any[]> {
    try {
        const dateFilter = `("${months} months"[PDat])`;
        const fullQuery = encodeURIComponent(`${query} AND ${dateFilter}`);

        let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${fullQuery}&retmax=30&retmode=json&sort=date`;
        if (apiKey) searchUrl += `&api_key=${apiKey}`;

        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) return [];

        const searchData = await searchRes.json();
        const ids = searchData?.esearchresult?.idlist || [];
        if (ids.length === 0) return [];

        let fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`;
        if (apiKey) fetchUrl += `&api_key=${apiKey}`;

        const fetchRes = await fetch(fetchUrl);
        const xmlText = await fetchRes.text();

        const articles: any[] = [];
        const chunks = xmlText.split('</PubmedArticle>');

        for (const chunk of chunks) {
            const pmid = chunk.match(/<PMID[^>]*>(.*?)<\/PMID>/)?.[1];
            const title = chunk.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/)?.[1]?.replace(/<[^>]*>/g, '');
            const year = chunk.match(/<Year>(.*?)<\/Year>/)?.[1];
            const month = chunk.match(/<Month>(.*?)<\/Month>/)?.[1];
            const day = chunk.match(/<Day>(.*?)<\/Day>/)?.[1];
            const journal = chunk.match(/<Title>(.*?)<\/Title>/)?.[1];
            const abstractMatches = [...chunk.matchAll(/<AbstractText[^>]*>(.*?)<\/AbstractText>/g)];
            const abstract = abstractMatches.map(m => m[1]).join(" ").replace(/<[^>]*>/g, '').substring(0, 500);

            // Check for significance keywords
            const isSignificant = /breakthrough|first|novel|pivotal|phase III|approval|warning|safety|recall/i.test(title + ' ' + abstract);

            if (pmid && title) {
                articles.push({
                    pmid,
                    title,
                    date: `${year}-${month || '01'}-${day || '01'}`,
                    journal,
                    abstract,
                    isSignificant
                });
            }
        }

        // Sort by date (most recent first)
        articles.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return articles;
    } catch (e) {
        console.error("Recent PubMed search error:", e);
        return [];
    }
}

// Active Clinical Trials
async function searchActiveTrials(searchTerm: string): Promise<any[]> {
    try {
        const url = `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(searchTerm)}&pageSize=25&format=json&filter.overallStatus=RECRUITING,ACTIVE_NOT_RECRUITING,ENROLLING_BY_INVITATION&sort=LastUpdatePostDate:desc`;

        const res = await fetch(url);
        if (!res.ok) return [];

        const data = await res.json();
        return (data.studies || []).map((s: any) => {
            const p = s.protocolSection;
            return {
                nct_id: p?.identificationModule?.nctId,
                title: p?.identificationModule?.briefTitle,
                status: p?.statusModule?.overallStatus,
                phase: p?.designModule?.phases?.join(', '),
                enrollment: p?.designModule?.enrollmentInfo?.count,
                last_update: p?.statusModule?.lastUpdatePostDateStruct?.date,
                start_date: p?.statusModule?.startDateStruct?.date,
                primary_completion: p?.statusModule?.primaryCompletionDateStruct?.date,
                sponsor: p?.sponsorCollaboratorsModule?.leadSponsor?.name,
                interventions: p?.armsInterventionsModule?.interventions?.map((i: any) => i.name).join(', '),
                conditions: p?.conditionsModule?.conditions?.join(', ')
            };
        });
    } catch (e) {
        console.error("Active trials error:", e);
        return [];
    }
}

// Recently completed trials with results
async function searchCompletedTrialsWithResults(searchTerm: string): Promise<any[]> {
    try {
        const url = `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(searchTerm)}&pageSize=15&format=json&filter.overallStatus=COMPLETED&filter.resultsPosted=true&sort=ResultsFirstPostDate:desc`;

        const res = await fetch(url);
        if (!res.ok) return [];

        const data = await res.json();
        return (data.studies || []).map((s: any) => {
            const p = s.protocolSection;
            return {
                nct_id: p?.identificationModule?.nctId,
                title: p?.identificationModule?.briefTitle,
                phase: p?.designModule?.phases?.join(', '),
                enrollment: p?.designModule?.enrollmentInfo?.count,
                results_date: s.resultsSection ? 'Available' : 'Pending',
                sponsor: p?.sponsorCollaboratorsModule?.leadSponsor?.name
            };
        });
    } catch (e) {
        console.error("Completed trials error:", e);
        return [];
    }
}

// FDA Drug Safety Communications (simulated - would need FDA API access)
async function searchFDASafety(drugName: string): Promise<any[]> {
    try {
        // OpenFDA adverse events - recent
        const url = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:"${encodeURIComponent(drugName)}"+AND+receivedate:[20240101+TO+20241231]&count=patient.reaction.reactionmeddrapt.exact&limit=15`;

        const res = await fetch(url);
        if (!res.ok) return [];

        const data = await res.json();
        return (data.results || []).map((r: any) => ({
            reaction: r.term,
            count: r.count,
            source: 'FDA FAERS'
        }));
    } catch (e) {
        console.error("FDA safety error:", e);
        return [];
    }
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { topic, time_range, include_safety } = await req.json();

        if (!topic) {
            return new Response(
                JSON.stringify({ error: "topic is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const ncbiApiKey = Deno.env.get("NCBI_API_KEY");
        // API keys for AI are handled by callAI/streamAI
        const supabase = createClient(supabaseUrl, supabaseKey);

        console.log(`[LIVE-RESEARCH] Topic: ${topic}`);

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                const sendEvent = (event: StreamEvent) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                };

                try {
                    const months = time_range || 6;

                    // Step 1: Recent Publications
                    sendEvent({ type: 'step_update', step: { id: 1, status: 'running', details: `📰 Publications récentes (${months} mois)...`, source: 'PubMed' } });

                    const recentPubs = await searchRecentPubMed(topic, ncbiApiKey, months);
                    const significantPubs = recentPubs.filter(p => p.isSignificant);

                    sendEvent({
                        type: 'step_update', step: {
                            id: 1, status: 'completed',
                            details: `✅ ${recentPubs.length} articles, ${significantPubs.length} significatifs`,
                            source: 'PubMed Recent'
                        }
                    });

                    // Step 2: Active Trials
                    sendEvent({ type: 'step_update', step: { id: 2, status: 'running', details: '🔬 Essais cliniques actifs...', source: 'ClinicalTrials.gov' } });

                    const [activeTrials, completedTrials] = await Promise.all([
                        searchActiveTrials(topic),
                        searchCompletedTrialsWithResults(topic)
                    ]);

                    sendEvent({
                        type: 'step_update', step: {
                            id: 2, status: 'completed',
                            details: `✅ ${activeTrials.length} actifs, ${completedTrials.length} avec résultats`,
                            source: 'ClinicalTrials.gov'
                        }
                    });

                    // Step 3: Safety Signals
                    let safetySignals: any[] = [];
                    if (include_safety !== false) {
                        sendEvent({ type: 'step_update', step: { id: 3, status: 'running', details: '⚠️ Signaux de sécurité...', source: 'FDA FAERS' } });

                        safetySignals = await searchFDASafety(topic);

                        sendEvent({
                            type: 'step_update', step: {
                                id: 3, status: 'completed',
                                details: `✅ ${safetySignals.length} signaux FDA analysés`,
                                source: 'FDA FAERS'
                            }
                        });
                    }

                    // Step 4: OpenAI Analysis
                    sendEvent({ type: 'step_update', step: { id: 4, status: 'running', details: '🧠 Synthèse actualités OpenAI...', source: 'OpenAI' } });

                    const liveContext = `
# VEILLE SCIENTIFIQUE LIVE: ${topic}
Date de la recherche: ${new Date().toISOString()}
Fenêtre temporelle: ${months} derniers mois

---

# PUBLICATIONS RÉCENTES (${recentPubs.length} articles)

## Articles SIGNIFICATIFS (${significantPubs.length})
${significantPubs.map(p => `🔥 [PMID:${p.pmid}] "${p.title}" (${p.date})
${p.journal}
${p.abstract?.substring(0, 300)}...`).join('\n\n')}

## Autres publications récentes
${recentPubs.filter(p => !p.isSignificant).slice(0, 15).map(p => `[PMID:${p.pmid}] "${p.title}" (${p.date})`).join('\n')}

---

# ESSAIS CLINIQUES ACTIFS (${activeTrials.length})
${activeTrials.map(t => `[${t.nct_id}] "${t.title}"
Phase: ${t.phase || 'N/A'} | Statut: ${t.status} | N=${t.enrollment || '?'}
Sponsor: ${t.sponsor || 'N/A'}
Dernière MAJ: ${t.last_update || 'N/A'}
Interventions: ${t.interventions || 'N/A'}`).join('\n\n')}

---

# ESSAIS RÉCEMMENT TERMINÉS AVEC RÉSULTATS (${completedTrials.length})
${completedTrials.map(t => `[${t.nct_id}] "${t.title}"
Phase: ${t.phase || 'N/A'} | N=${t.enrollment || '?'}
Résultats: ${t.results_date}`).join('\n\n')}

---

# SIGNAUX DE PHARMACOVIGILANCE FDA (${safetySignals.length})
${safetySignals.map(s => `- ${s.reaction}: ${s.count} cas rapportés`).join('\n')}

---

# INSTRUCTIONS

Analyse ces données RÉCENTES et produis:
1. BREAKING NEWS: Découvertes/publications majeures
2. TRIAL UPDATES: Changements d'essais importants
3. SAFETY ALERTS: Signaux de sécurité à surveiller
4. REGULATORY: Actualités réglementaires si mentionnées
5. EMERGING: Tendances émergentes
6. NEXT MILESTONES: Événements à anticiper

Priorise la FRAÎCHEUR et la PERTINENCE CLINIQUE.
`;

                    const aiResponse = await streamAI(
                        SYSTEM_PROMPT,
                        liveContext,
                        (chunk) => {
                            sendEvent({ type: 'text', content: chunk });
                        },
                        {
                            model: "gpt-5.5",
                            maxTokens: 12000,
                            temperature: 0.4
                        }
                    );

                    const textContent = aiResponse.text;

                    sendEvent({ type: 'step_update', step: { id: 4, status: 'completed', details: '✅ Veille actualisée', source: 'OpenAI' } });

                    // Extract and emit structured updates
                    try {
                        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
                        if (jsonMatch) {
                            const parsed = JSON.parse(jsonMatch[0]);

                            if (parsed.breaking_news) {
                                for (const news of parsed.breaking_news) {
                                    sendEvent({ type: 'breaking_news', breaking_news: news });
                                }
                            }

                            if (parsed.trial_updates) {
                                for (const trial of parsed.trial_updates) {
                                    sendEvent({ type: 'trial_update', trial_update: trial });
                                }
                            }

                            if (parsed.safety_alerts) {
                                for (const alert of parsed.safety_alerts) {
                                    sendEvent({ type: 'safety_alert', safety_alert: alert });
                                }
                            }

                            if (parsed.regulatory_updates) {
                                for (const update of parsed.regulatory_updates) {
                                    sendEvent({ type: 'regulatory_update', regulatory_update: update });
                                }
                            }
                        }
                    } catch { }

                    // Summary
                    sendEvent({
                        type: 'sources', sources: [
                            { type: 'Publications récentes', count: recentPubs.length },
                            { type: 'Essais actifs', count: activeTrials.length },
                            { type: 'Essais avec résultats', count: completedTrials.length },
                            { type: 'Signaux FDA', count: safetySignals.length }
                        ]
                    });

                    sendEvent({ type: 'done' });

                } catch (err) {
                    console.error("Live research error:", err);
                    sendEvent({ type: 'step_update', step: { id: 1, status: 'error', details: String(err) } });
                } finally {
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
        });

    } catch (error) {
        console.error("Error:", error);
        return new Response(
            JSON.stringify({ error: "Live research failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
