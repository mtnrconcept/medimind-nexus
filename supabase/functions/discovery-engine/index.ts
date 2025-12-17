import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * DISCOVERY ENGINE v3 - Moteur de Découverte IA avec Streaming Corrigé
 * 
 * CORRECTION: Utilise le mode non-streaming pour éviter la corruption de texte,
 * puis envoie le résultat par chunks propres au client.
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// DISCOVERY MODE SYSTEM PROMPT
const DISCOVERY_PROMPT = `Tu es MEDIMIND, un système d'IA médicale révolutionnaire spécialisé dans la GÉNÉRATION D'HYPOTHÈSES THÉRAPEUTIQUES INNOVANTES.

# MISSION CRITIQUE
Analyser une pathologie et générer des PISTES DE TRAITEMENT CURATIF QUI N'EXISTENT PAS ENCORE, en combinant créativement les connaissances existantes.

# RÈGLES DE QUALITÉ ABSOLUES
1. JAMAIS de texte tronqué ou incomplet
2. Phrases complètes uniquement
3. Mots entiers (pas de coupure mi-mot)
4. Formatage markdown propre
5. Tous les PMIDs doivent être réalistes (format: 8 chiffres)

# MÉTHODOLOGIE OBLIGATOIRE

## 1. RÉSUMÉ EXÉCUTIF
- **Pathologie analysée :** [nom complet]
- **Problématique :** [description complète]
- **Traitements actuels :** [liste des traitements palliatifs actuels]
- **Taux de guérison actuel :** [pourcentage]
- **Besoin médical critique :** [description du besoin non satisfait]

## 2. DONNÉES ANALYSÉES ET MÉCANISMES PATHOLOGIQUES

### 🔬 Physiopathologie détaillée
- Mécanismes moléculaires principaux
- Protéines clés impliquées
- Voies de signalisation perturbées

### 🎯 Cibles thérapeutiques identifiées
**Niveau 1 - Immunitaire :**
- [cibles immunitaires]

**Niveau 2 - Cellulaire :**
- [cibles cellulaires spécifiques]

**Niveau 3 - Régénératif :**
- [cibles de régénération]

## 3. HYPOTHÈSES THÉRAPEUTIQUES INNOVANTES

Pour CHAQUE hypothèse (générer exactement 4 hypothèses A, B, C, D) :

### 💡 HYPOTHÈSE [LETTRE] : [Titre complet et descriptif]

**Probabilité de succès : [XX]% [🟢 si >65% / 🟡 si 45-65% / 🔴 si <45%]**

**Classification :** [VALIDÉ / PLAUSIBLE / HYPOTHÈSE]
- VALIDÉ = composants avec preuves RCT existantes
- PLAUSIBLE = preuves précliniques solides
- HYPOTHÈSE = logique mécanistique sans preuve directe

**Énoncé :** 
[Description complète de l'hypothèse en 2-3 phrases]

**Fondement scientifique :**
- [Point 1 avec référence PMID si disponible]
- [Point 2]
- [Point 3]

**Protocole thérapeutique détaillé :**

*Phase 1 (Semaines 1-4) : [Nom de la phase]*
- Médicament A : [dose exacte], [voie], [fréquence]
- Médicament B : [dose exacte], [voie], [fréquence]
- Objectif : [objectif de cette phase]

*Phase 2 (Semaines 5-8) : [Nom de la phase]*
- [Détails similaires]

*Phase 3 (Semaines 9-24) : [Nom de la phase]*
- [Détails similaires]

**Preuves supportant l'hypothèse :**
1. [Étude/donnée 1]
2. [Étude/donnée 2]
3. [Étude/donnée 3]

**Contradictions potentielles et solutions :**
- Risque : [risque identifié] → Solution : [solution proposée]

**Tests de validation proposés :**
- *Préclinique :* [description avec durée, N, endpoints]
- *Clinique Phase I/II :* [description avec design, N, endpoints]

**Impact clinique potentiel :**
- Taux de guérison estimé : [X]%
- Réduction rechutes : [X]%
- Coût estimé : [montant]€

**Niveau de priorité : [TRÈS ÉLEVÉ ⭐⭐⭐ / ÉLEVÉ ⭐⭐ / MOYEN ⭐]**

---

## 4. SYNTHÈSE STRATÉGIQUE

### Tableau récapitulatif
| Hypothèse | Probabilité | Faisabilité | Coût | Score Global |
|-----------|-------------|-------------|------|--------------|
| A - [nom] | [X]% | [Élevée/Moyenne/Faible] | [Faible/Modéré/Élevé] | [X]/10 |
| B - [nom] | [X]% | ... | ... | [X]/10 |
| C - [nom] | [X]% | ... | ... | [X]/10 |
| D - [nom] | [X]% | ... | ... | [X]/10 |

### Recommandations prioritaires
1. **Court terme (1-3 ans) :** [recommandation]
2. **Moyen terme (3-7 ans) :** [recommandation]
3. **Long terme (7-15 ans) :** [recommandation]

## 5. ÉVALUATION DES RISQUES

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| [Risque 1] | [Faible/Moyenne/Élevée] | [Mineur/Majeur/Critique] | [Solution] |
| [Risque 2] | ... | ... | ... |

## 6. LIMITATIONS ET INCERTITUDES
- [Limitation 1]
- [Limitation 2]
- [Donnée manquante importante]

## 7. RÉFÉRENCES SCIENTIFIQUES
- [PMID:XXXXXXXX] [Titre de l'étude]
- [PMID:XXXXXXXX] [Titre de l'étude]
- [NCT:XXXXXXXX] [Titre de l'essai clinique]

## 8. DISCLAIMER MÉDICAL

> ⚠️ **AVERTISSEMENT CRITIQUE**
> 
> Cette analyse est générée par Intelligence Artificielle à des fins de **RECHERCHE et EXPLORATION SCIENTIFIQUE UNIQUEMENT**.
> 
> Elle **NE REMPLACE EN AUCUN CAS** :
> - Le jugement clinique d'un spécialiste qualifié
> - Une consultation médicale personnalisée
> - Les protocoles thérapeutiques établis
> 
> **TOUTES les hypothèses présentées sont EXPÉRIMENTALES et NON APPROUVÉES.**
> 
> Consultez impérativement votre médecin traitant.

---
*Analyse générée par MEDIMIND - Système d'IA de recherche médicale exploratoire*
`;

// ============= MEDICAL APIs =============

async function searchPubMed(query: string, apiKey?: string, maxResults: number = 12): Promise<any[]> {
    try {
        const encoded = encodeURIComponent(query);
        let url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encoded}&retmax=${maxResults}&retmode=json&sort=relevance`;
        if (apiKey) url += `&api_key=${apiKey}`;

        const searchRes = await fetch(url);
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
            const abstractMatches = [...chunk.matchAll(/<AbstractText[^>]*>(.*?)<\/AbstractText>/g)];
            const abstract = abstractMatches.map(m => m[1]).join(" ").replace(/<[^>]*>/g, '').substring(0, 400);

            if (pmid && title) {
                articles.push({ pmid, title, year: parseInt(year || '0'), abstract });
            }
        }
        return articles;
    } catch (e) {
        console.error("PubMed error:", e);
        return [];
    }
}

async function searchClinicalTrials(condition: string, maxResults: number = 15): Promise<any[]> {
    try {
        const url = `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(condition)}&pageSize=${maxResults}&format=json`;
        const res = await fetch(url);
        if (!res.ok) return [];

        const data = await res.json();
        return (data.studies || []).map((s: any) => {
            const p = s.protocolSection;
            return {
                nct_id: p?.identificationModule?.nctId,
                title: p?.identificationModule?.briefTitle,
                status: p?.statusModule?.overallStatus,
                phase: p?.designModule?.phases?.join(', ') || 'N/A',
                interventions: p?.armsInterventionsModule?.interventions?.slice(0, 3).map((i: any) => i.name).join(', ')
            };
        });
    } catch (e) {
        console.error("ClinicalTrials error:", e);
        return [];
    }
}

async function searchOpenFDA(drugName: string): Promise<any> {
    try {
        const aeUrl = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:"${encodeURIComponent(drugName)}"&limit=5`;
        const aeRes = await fetch(aeUrl);
        if (!aeRes.ok) return { adverse_events: [] };

        const aeData = await aeRes.json();
        return {
            adverse_events: (aeData.results || []).slice(0, 5).map((r: any) => ({
                reactions: r.patient?.reaction?.slice(0, 3).map((rx: any) => rx.reactionmeddrapt).join(', '),
                serious: r.serious
            }))
        };
    } catch (e) {
        return { adverse_events: [] };
    }
}

async function getLocalKnowledge(supabase: any, topic: string): Promise<any> {
    const data: any = { pathologies: [], medications: [], substances: [], interactions: [], kg_nodes: [] };

    try {
        const { data: pathologies } = await supabase
            .from('pathologies')
            .select('name, description, icd_code')
            .or(`name.ilike.%${topic}%,name_fr.ilike.%${topic}%`)
            .limit(1000);
        data.pathologies = pathologies || [];

        const { data: medications } = await supabase
            .from('medications')
            .select('name, mechanism, indications')
            .or(`name.ilike.%${topic}%,indications.ilike.%${topic}%`)
            .limit(2005);
        data.medications = medications || [];

        const { data: substances } = await supabase
            .from('substances')
            .select('name, mechanism_of_action, half_life')
            .or(`name.ilike.%${topic}%,mechanism_of_action.ilike.%${topic}%`)
            .limit(15);
        data.substances = substances || [];

        const { data: interactions } = await supabase
            .from('drug_interactions')
            .select('medication_name, interacting_drug, severity, mechanism')
            .or(`medication_name.ilike.%${topic}%`)
            .limit(2000);
        data.interactions = interactions || [];

        const { data: nodes } = await supabase
            .from('cde_nodes')
            .select('name, node_type')
            .ilike('name', `%${topic}%`)
            .limit(3000);
        data.kg_nodes = nodes || [];

    } catch (e) {
        console.error("Local DB error:", e);
    }

    return data;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { pathology, research_goal, additional_context } = await req.json();

        if (!pathology) {
            return new Response(
                JSON.stringify({ error: "pathology is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const claudeApiKey = Deno.env.get("CLAUDE_API_KEY") || Deno.env.get("ANTHROPIC_API_KEY");
        const ncbiApiKey = Deno.env.get("NCBI_API_KEY");
        const supabase = createClient(supabaseUrl, supabaseKey);

        if (!claudeApiKey) {
            return new Response(
                JSON.stringify({ error: "CLAUDE_API_KEY not configured" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`[DISCOVERY-ENGINE] Pathology: ${pathology}`);

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            async start(controller) {
                const sendEvent = (type: string, data: any) => {
                    const eventStr = `data: ${JSON.stringify({ type, ...data })}\n\n`;
                    controller.enqueue(encoder.encode(eventStr));
                };

                try {
                    // Step 1: Local DB
                    sendEvent('step', { id: 1, status: 'running', details: '📁 Base de connaissances locale...' });
                    const localData = await getLocalKnowledge(supabase, pathology);
                    const localCount = Object.values(localData).reduce((s: number, a: any) => s + (a?.length || 0), 0);
                    sendEvent('step', { id: 1, status: 'completed', details: `✅ ${localCount} entrées trouvées` });

                    // Step 2: PubMed Guidelines
                    sendEvent('step', { id: 2, status: 'running', details: '🔬 PubMed: Guidelines...' });
                    const guidelines = await searchPubMed(`${pathology} guideline`, ncbiApiKey, 8);
                    sendEvent('step', { id: 2, status: 'completed', details: `✅ ${guidelines.length} guidelines` });

                    // Step 3: PubMed RCTs
                    sendEvent('step', { id: 3, status: 'running', details: '🔬 PubMed: Essais cliniques...' });
                    const rcts = await searchPubMed(`${pathology} randomized trial`, ncbiApiKey, 10);
                    sendEvent('step', { id: 3, status: 'completed', details: `✅ ${rcts.length} RCTs` });

                    // Step 4: PubMed Mechanisms
                    sendEvent('step', { id: 4, status: 'running', details: '🔬 PubMed: Mécanismes...' });
                    const mechanisms = await searchPubMed(`${pathology} pathophysiology mechanism`, ncbiApiKey, 10);
                    sendEvent('step', { id: 4, status: 'completed', details: `✅ ${mechanisms.length} articles` });

                    // Step 5: ClinicalTrials
                    sendEvent('step', { id: 5, status: 'running', details: '🧪 ClinicalTrials.gov...' });
                    const trials = await searchClinicalTrials(pathology, 15);
                    sendEvent('step', { id: 5, status: 'completed', details: `✅ ${trials.length} essais` });

                    // Step 6: OpenFDA
                    sendEvent('step', { id: 6, status: 'running', details: '⚠️ OpenFDA: Pharmacovigilance...' });
                    const drugs = localData.medications.slice(0, 3).map((m: any) => m.name);
                    let fdaEvents: any[] = [];
                    for (const drug of drugs) {
                        const fda = await searchOpenFDA(drug);
                        fdaEvents.push(...(fda.adverse_events || []));
                    }
                    sendEvent('step', { id: 6, status: 'completed', details: `✅ ${fdaEvents.length} événements FDA` });

                    // Sources summary
                    const totalSources = {
                        local: localCount,
                        pubmed: guidelines.length + rcts.length + mechanisms.length,
                        trials: trials.length,
                        fda: fdaEvents.length,
                        total: localCount + guidelines.length + rcts.length + mechanisms.length + trials.length + fdaEvents.length
                    };
                    sendEvent('sources', totalSources);

                    // Step 7: Claude Analysis (NON-STREAMING pour éviter corruption)
                    sendEvent('step', { id: 7, status: 'running', details: '🧠 Claude: Génération de l\'analyse complète...' });

                    const context = `
# REQUÊTE DE DÉCOUVERTE

**Pathologie :** ${pathology}
**Objectif :** ${research_goal || "Trouver une piste de traitement CURATIF innovante"}
**Contexte :** ${additional_context || "Aucun contexte spécifique"}

---

# DONNÉES COLLECTÉES (${totalSources.total} sources)

## Base locale (${localCount} entrées)

### Pathologies
${localData.pathologies.map((p: any) => `- ${p.name}: ${p.description?.substring(0, 150) || 'N/A'}`).join('\n')}

### Médicaments pertinents
${localData.medications.slice(0, 15).map((m: any) => `- **${m.name}**: ${m.mechanism?.substring(0, 100) || 'N/A'}`).join('\n')}

### Substances
${localData.substances.slice(0, 10).map((s: any) => `- ${s.name}: ${s.mechanism_of_action?.substring(0, 100) || 'N/A'}`).join('\n')}

### Interactions médicamenteuses
${localData.interactions.slice(0, 10).map((i: any) => `- ${i.medication_name} + ${i.interacting_drug}: ${i.severity}`).join('\n')}

## PubMed - Guidelines (${guidelines.length})
${guidelines.map((g: any) => `- [PMID:${g.pmid}] ${g.title} (${g.year})`).join('\n')}

## PubMed - Essais randomisés (${rcts.length})
${rcts.map((r: any) => `- [PMID:${r.pmid}] ${r.title} (${r.year})`).join('\n')}

## PubMed - Mécanismes (${mechanisms.length})
${mechanisms.map((m: any) => `- [PMID:${m.pmid}] ${m.title}`).join('\n')}

## ClinicalTrials.gov (${trials.length})
${trials.map((t: any) => `- [${t.nct_id}] ${t.title} - Phase: ${t.phase} - Status: ${t.status}`).join('\n')}

## OpenFDA - Événements indésirables (${fdaEvents.length})
${fdaEvents.slice(0, 5).map((e: any) => `- Réactions: ${e.reactions} (Sérieux: ${e.serious})`).join('\n')}

---

# INSTRUCTIONS

Génère une analyse COMPLÈTE et DÉTAILLÉE selon le format de ton prompt système.
- Exactement 4 hypothèses (A, B, C, D) avec protocoles détaillés
- Probabilités de succès réalistes
- Tous les mots doivent être complets (pas de troncature)
- Formatage markdown propre
`;

                    // NON-STREAMING call to avoid text corruption
                    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "x-api-key": claudeApiKey,
                            "anthropic-version": "2023-06-01"
                        },
                        body: JSON.stringify({
                            model: "claude-sonnet-4-20250514",
                            max_tokens: 16000,
                            temperature: 0.3,
                            system: DISCOVERY_PROMPT,
                            messages: [{ role: "user", content: context }]
                        })
                    });

                    if (!claudeResponse.ok) {
                        const err = await claudeResponse.text();
                        throw new Error(`Claude API error: ${claudeResponse.status} - ${err}`);
                    }

                    const claudeData = await claudeResponse.json();
                    let fullText = "";
                    for (const block of claudeData.content || []) {
                        if (block.type === "text") {
                            fullText += block.text;
                        }
                    }

                    sendEvent('step', { id: 7, status: 'completed', details: '✅ Analyse générée' });

                    // Send text in chunks for "live" effect but without corruption
                    const chunkSize = 100; // characters per chunk
                    for (let i = 0; i < fullText.length; i += chunkSize) {
                        const chunk = fullText.substring(i, i + chunkSize);
                        sendEvent('text', { content: chunk });
                        // Small delay for visual effect
                        await new Promise(r => setTimeout(r, 10));
                    }

                    // Extract hypotheses
                    const hypothesesMatches = fullText.matchAll(/### 💡 HYPOTHÈSE ([A-Z]) : (.+?)(?=\n)/g);
                    for (const match of hypothesesMatches) {
                        const id = match[1];
                        const title = match[2].trim();
                        const section = fullText.substring(fullText.indexOf(match[0]), fullText.indexOf(match[0]) + 1000);
                        const probMatch = section.match(/Probabilité de succès\s*:\s*(\d+)%/);
                        const classMatch = section.match(/Classification\s*:\*?\*?\s*(VALIDÉ|PLAUSIBLE|HYPOTHÈSE)/);

                        sendEvent('hypothesis', {
                            id,
                            title,
                            probability: probMatch ? parseInt(probMatch[1]) : 50,
                            classification: classMatch?.[1] || 'HYPOTHÈSE'
                        });
                    }

                    sendEvent('done', { totalCharacters: fullText.length });

                } catch (err) {
                    console.error("Discovery error:", err);
                    sendEvent('error', { message: String(err) });
                } finally {
                    controller.close();
                }
            }
        });

        return new Response(stream, {
            headers: {
                ...corsHeaders,
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache"
            }
        });

    } catch (error) {
        console.error("Error:", error);
        return new Response(
            JSON.stringify({ error: "Discovery engine failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
