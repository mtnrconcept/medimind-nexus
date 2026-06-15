import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI } from "../_shared/ai-client.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ValidationResult {
    step_index: number;
    claim: string;
    claim_type: string;
    is_valid: boolean;
    confidence_score: number;
    error_type?: string;
    error_details?: string;
    correct_information?: string;
    verification_method: string;
    verification_sources: any[];
}

// Search PubMed to verify a claim
// Search PubMed to verify a claim
async function verifyClaimWithPubMed(claim: string, apiKey?: string): Promise<{ found: boolean; sources: any[] }> {
    try {
        // Extract key terms from claim
        const searchQuery = claim
            .replace(/[^\w\s]/g, ' ')
            .split(' ')
            .filter(word => word.length > 3)
            .slice(0, 5)
            .join(' AND ');

        let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchQuery)}&retmax=3&retmode=json`;
        if (apiKey) searchUrl += `&api_key=${apiKey}`;

        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();
        const ids = searchData?.esearchresult?.idlist || [];

        if (ids.length === 0) {
            return { found: false, sources: [] };
        }

        let fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`;
        if (apiKey) fetchUrl += `&api_key=${apiKey}`;

        const fetchResponse = await fetch(fetchUrl);
        const xmlText = await fetchResponse.text();
        const sources: any[] = [];
        const articles = xmlText.split('</PubmedArticle>');

        for (const articleXml of articles) {
            if (!articleXml.includes('<PubmedArticle>')) continue;

            const idMatch = articleXml.match(/<PMID[^>]*>(.*?)<\/PMID>/);
            const id = idMatch ? idMatch[1] : '';
            if (!id) continue;

            const titleMatch = articleXml.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/);
            const title = titleMatch ? titleMatch[1] : "Sans titre";

            const journalMatch = articleXml.match(/<Title>(.*?)<\/Title>/);
            const journal = journalMatch ? journalMatch[1] : "";

            const yearMatch = articleXml.match(/<Year>(.*?)<\/Year>/);
            const year = yearMatch ? yearMatch[1] : "";

            sources.push({
                type: 'pubmed',
                title: title,
                url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
                journal: journal,
                year: year
            });
        }

        return { found: sources.length > 0, sources };
    } catch (error) {
        console.error('PubMed verification error:', error);
        return { found: false, sources: [] };
    }
}

// Main validation function using AI cross-check
async function validateWithAI(
    discovery: any,
    claudeApiKey: string
): Promise<ValidationResult[]> {
    const systemPrompt = `Tu es un expert en pharmacologie clinique et vérificateur scientifique rigoureux.

Ton rôle est de VÉRIFIER la validité d'une hypothèse médicale en analysant CHAQUE étape du raisonnement.

Pour CHAQUE étape:
1. Identifie le CLAIM principal (l'affirmation factuelle)
2. Classifie le type: 'pharmacokinetic', 'pharmacodynamic', 'mechanism', 'epidemiological', 'clinical'
3. Vérifie si le claim est:
   - VRAI et vérifiable (données FDA, études publiées)
   - PLAUSIBLE mais non prouvé
   - FAUX ou contredit par les données connues
4. Attribue un score de confiance 0-1
5. Si FAUX, indique l'erreur et l'information correcte

ATTENTION aux erreurs courantes:
- Confusion substrats/inhibiteurs de transporteurs (P-gp, BCRP, OATP)
- Affirmations pharmacocinétiques non vérifiées (toujours checker FDA labels)
- Mécanismes d'action incorrects
- Extrapolations abusives in vitro → in vivo

Réponds UNIQUEMENT en JSON valide:
{
  "validations": [
    {
      "step_index": 1,
      "claim": "L'affirmation vérifiable extraite",
      "claim_type": "pharmacokinetic|pharmacodynamic|mechanism|epidemiological|clinical",
      "is_valid": true|false,
      "confidence_score": 0.0-1.0,
      "error_type": null|"factual_error"|"unsupported_claim"|"mechanism_error"|"contradiction",
      "error_details": "Explication de l'erreur si applicable",
      "correct_information": "Information correcte si erreur",
      "supporting_evidence": "Preuve supportant la validation"
    }
  ],
  "overall_assessment": {
    "is_scientifically_sound": true|false,
    "major_issues": ["liste des problèmes majeurs"],
    "recommendation": "validate|needs_review|reject"
  }
}`;

    const userPrompt = `Vérifie cette hypothèse médicale:

**TITRE**: ${discovery.title}

**HYPOTHÈSE**: ${discovery.hypothesis}

**CHAÎNE DE RAISONNEMENT**:
${(discovery.reasoning_chain || []).map((step: string, i: number) => `${i + 1}. ${step}`).join('\n')}

**SOURCES CITÉES**:
${JSON.stringify(discovery.sources || [], null, 2)}

Analyse CHAQUE étape du raisonnement et vérifie sa validité scientifique.
Sois particulièrement vigilant sur les affirmations pharmacologiques (transporteurs, enzymes, interactions).`;

    try {
        const aiResponse = await callAI(
            systemPrompt,
            userPrompt,
            {
                model: "claude-sonnet-4-20250514",
                maxTokens: 4096
            }
        );

        const content = aiResponse.text || "";

        // Parse JSON response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("Could not parse validation response");
        }

        const validationData = JSON.parse(jsonMatch[0]);

        return (validationData.validations || []).map((v: any) => ({
            step_index: v.step_index,
            claim: v.claim,
            claim_type: v.claim_type,
            is_valid: v.is_valid,
            confidence_score: v.confidence_score,
            error_type: v.error_type,
            error_details: v.error_details,
            correct_information: v.correct_information,
            verification_method: 'ai_cross_check',
            verification_sources: v.supporting_evidence ? [{ type: 'ai', evidence: v.supporting_evidence }] : [],
        }));
    } catch (error) {
        console.error('AI validation error:', error);
        return [];
    }
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { discoveryId } = await req.json();

        if (!discoveryId) {
            throw new Error("discoveryId is required");
        }

        // Get discovery card
        const { data: discovery, error: fetchError } = await supabase
            .from('discovery_cards')
            .select('*')
            .eq('id', discoveryId)
            .single();

        if (fetchError || !discovery) {
            throw new Error("Discovery not found");
        }

        console.log(`Validating discovery: ${discovery.title}`);

        // Update status to validating
        await supabase
            .from('discovery_cards')
            .update({ validation_status: 'validating' })
            .eq('id', discoveryId);

        // Step 1: AI cross-check validation
        const aiValidations = await validateWithAI(discovery, "");

        // Step 2: PubMed verification for each claim
        const ncbiApiKey = Deno.env.get("NCBI_API_KEY");
        for (const validation of aiValidations) {
            const pubmedResult = await verifyClaimWithPubMed(validation.claim, ncbiApiKey);
            if (pubmedResult.found) {
                validation.verification_sources = [
                    ...validation.verification_sources,
                    ...pubmedResult.sources
                ];
                // Boost confidence if PubMed sources found
                validation.confidence_score = Math.min(1, validation.confidence_score + 0.1);
            }
        }

        // Step 3: Save validation logs
        const validationLogs = aiValidations.map(v => ({
            discovery_id: discoveryId,
            step_index: v.step_index,
            claim: v.claim,
            claim_type: v.claim_type,
            verification_method: v.verification_method,
            verification_sources: v.verification_sources,
            is_valid: v.is_valid,
            confidence_score: v.confidence_score,
            error_type: v.error_type,
            error_details: v.error_details,
            correct_information: v.correct_information,
            verified_by: 'ai'
        }));

        if (validationLogs.length > 0) {
            const { error: insertError } = await supabase
                .from('discovery_validation_logs')
                .insert(validationLogs);

            if (insertError) {
                console.error('Error inserting validation logs:', insertError);
            }
        }

        // Step 4: Update discovery validation status
        const { data: statusResult } = await supabase
            .rpc('update_discovery_validation_status', { p_discovery_id: discoveryId });

        // Get updated discovery
        const { data: updatedDiscovery } = await supabase
            .from('discovery_cards')
            .select('*, discovery_validation_logs(*)')
            .eq('id', discoveryId)
            .single();

        // Collect validation errors for response
        const errors = aiValidations
            .filter(v => !v.is_valid)
            .map(v => v.error_details || `Étape ${v.step_index}: ${v.claim}`);

        return new Response(
            JSON.stringify({
                success: true,
                discoveryId,
                validation_status: updatedDiscovery?.validation_status,
                validation_result: updatedDiscovery?.validation_result,
                steps_validated: aiValidations.length,
                errors_found: errors.length,
                errors,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("Validate hypothesis error:", error);
        return new Response(
            JSON.stringify({
                error: error instanceof Error ? error.message : "Unknown error"
            }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }
});
