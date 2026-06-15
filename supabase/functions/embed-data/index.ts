import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Utilisation d'une version plus récente et via esm.sh pour compatibilité Deno
import { pipeline, env } from 'https://esm.sh/@xenova/transformers@2.17.2';

// Configuration pour Deno Edge Functions
env.useBrowserCache = false;
env.allowLocalModels = false;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        console.log(`[DEBUG] Connecting to ${supabaseUrl}`);
        console.log(`[DEBUG] Key length: ${supabaseKey ? supabaseKey.length : 'MISSING'}`);

        // Force Service Role for RLS bypass
        const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            },
            global: {
                headers: { Authorization: `Bearer ${supabaseKey}` }
            }
        });

        console.log("Initialisation du pipeline d'extraction...");

        // Initialiser le modèle d'embedding
        // On utilise un modèle quantifié pour économiser la mémoire (default)
        const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
            quantized: true,
        });

        const tables = ['pathologies', 'symptoms', 'treatments', 'medications', 'substances'];
        let totalProcessed = 0;
        const batchSize = 20; // Increased to speed up processing

        const results: Record<string, number> = {};

        for (const table of tables) {
            // Count debug
            const { count: totalCount } = await supabase.from(table).select('*', { count: 'exact', head: true });
            console.log(`[DEBUG] Table ${table} contains ${totalCount} rows.`);

            // Sample fetch debug
            const { data: sample } = await supabase.from(table).select('id, name, embedding').limit(1);
            console.log(`[DEBUG] Sample row from ${table}:`, sample ? JSON.stringify(sample[0]) : 'None');

            // Find items without embedding
            const { data: items, error: fetchError } = await supabase
                .from(table)
                .select('id, name, description')
                .is('embedding', null)
                .limit(batchSize);

            if (fetchError) throw fetchError;

            if (!items || items.length === 0) {
                results[table] = 0;
                continue;
            }

            console.log(`Traitement de ${items.length} éléments pour ${table}...`);
            let processedCount = 0;

            for (const item of items) {
                try {
                    // Préparer le texte
                    const textToEmbed = `${item.name}: ${item.description || ''}`.trim().substring(0, 1000);

                    // Générer embedding
                    const output = await extractor(textToEmbed, { pooling: 'mean', normalize: true });
                    const embedding = Array.from(output.data);

                    // Sauvegarder
                    const { error: updateError } = await supabase
                        .from(table)
                        .update({ embedding })
                        .eq('id', item.id);

                    if (updateError) {
                        console.error(`Erreur update ${table} ${item.id}:`, updateError);
                    } else {
                        processedCount++;
                    }
                } catch (err) {
                    console.error(`Erreur embedding ${table} ${item.id}:`, err);
                }
            }
            results[table] = processedCount;
            totalProcessed += processedCount;
        }

        return new Response(
            JSON.stringify({
                success: true,
                processed: results,
                total: totalProcessed,
                debugCounts: results,
                message: totalProcessed > 0 ? "Lot traité. Relancez la fonction pour continuer." : "Tout est à jour (ou tables vides)."
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error("Erreur globale:", error);
        return new Response(
            JSON.stringify({ error: error.message || String(error) }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
