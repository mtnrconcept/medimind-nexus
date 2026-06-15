
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/ai-client.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { prompt, model } = await req.json();

        if (!prompt) {
            throw new Error("Missing prompt");
        }

        // Default to a fast OpenAI reasoning model if not specified
        const targetModel = model || "gpt-5.4-mini";

        // Call the shared OpenAI client
        const response = await callAI(
            "Generate a valid SMILES string for a molecule matching the description.",
            prompt,
            {
                model: targetModel,
                reasoningEffort: 'low',
                temperature: 0.8,
                maxTokens: 100 // Molecules aren't usually super long
            }
        );

        // Extract SMILES from the text
        // Sometimes models are chatty, we want just the SMILES.
        // Basic heuristic: find the longest sequence of valid SMILES characters.
        // For now, return the raw text, the frontend can parse/clean it or we can do it here.
        // Let's assume the model tries to complete the SMILES.

        // Simple cleaning: remove newlines and extra spaces
        let smiles = response.text.trim().split('\n')[0];

        return new Response(JSON.stringify({
            smiles,
            raw: response.text,
            model: targetModel
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
