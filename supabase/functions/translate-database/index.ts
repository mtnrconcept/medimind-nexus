import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/**
 * Traduit un texte vers le français en utilisant Google Translate
 */
async function translateToFrench(text: string): Promise<string> {
    if (!text || text.trim() === '') return text;

    // Vérifier si le texte est déjà en français (heuristique simple)
    const frenchIndicators = ['é', 'è', 'ê', 'ë', 'à', 'â', 'ô', 'î', 'ï', 'ù', 'û', 'ç', 'œ', 'æ'];
    const hasFrenchChars = frenchIndicators.some(char => text.toLowerCase().includes(char));

    // Si le texte contient des caractères français et a moins de 3 mots anglais courants, on le garde
    const englishWords = ['the', 'of', 'and', 'with', 'for', 'type', 'due', 'other', 'unspecified'];
    const lowerText = text.toLowerCase();
    const englishWordCount = englishWords.filter(w => lowerText.includes(w)).length;

    if (hasFrenchChars && englishWordCount < 2) {
        return text; // Probablement déjà en français
    }

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=fr&dt=t&q=${encodeURIComponent(text)}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.error(`Translation failed for: ${text}`);
            return text;
        }

        const data = await response.json();
        let translated = '';
        if (data[0] && Array.isArray(data[0])) {
            translated = data[0].map((segment: any) => segment[0]).join('');
        }

        return translated || text;
    } catch (error) {
        console.error('Translation error:', error);
        return text;
    }
}

/**
 * Traduit un lot de textes
 */
async function translateBatch(texts: string[]): Promise<string[]> {
    const results: string[] = [];

    // Traduire par petits lots pour éviter les rate limits
    for (let i = 0; i < texts.length; i++) {
        const translated = await translateToFrench(texts[i]);
        results.push(translated);

        // Pause entre les requêtes pour éviter le rate limiting
        if (i % 10 === 9) {
            await new Promise(r => setTimeout(r, 100));
        }
    }

    return results;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const { table, batchSize = 100, offset = 0 } = await req.json();

        if (!table || !['pathologies', 'symptoms', 'treatments', 'medications', 'side_effects'].includes(table)) {
            return new Response(
                JSON.stringify({ error: 'Invalid table. Must be one of: pathologies, symptoms, treatments, medications, side_effects' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log(`Translating ${table} (offset: ${offset}, batch: ${batchSize})`);

        // Récupérer les enregistrements à traduire
        const { data: records, error: fetchError } = await supabase
            .from(table)
            .select('id, name')
            .range(offset, offset + batchSize - 1)
            .order('id');

        if (fetchError) {
            throw new Error(`Failed to fetch ${table}: ${fetchError.message}`);
        }

        if (!records || records.length === 0) {
            return new Response(
                JSON.stringify({
                    success: true,
                    translated: 0,
                    hasMore: false,
                    message: 'No more records to translate'
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Traduire les noms
        const names = records.map(r => r.name);
        const translatedNames = await translateBatch(names);

        // Mettre à jour les enregistrements
        let updatedCount = 0;
        for (let i = 0; i < records.length; i++) {
            const originalName = records[i].name;
            const translatedName = translatedNames[i];

            // Ne mettre à jour que si la traduction est différente
            if (translatedName && translatedName !== originalName) {
                const { error: updateError } = await supabase
                    .from(table)
                    .update({ name: translatedName })
                    .eq('id', records[i].id);

                if (!updateError) {
                    updatedCount++;
                } else {
                    console.error(`Failed to update ${records[i].id}: ${updateError.message}`);
                }
            }
        }

        // Vérifier s'il y a plus de données
        const { count } = await supabase
            .from(table)
            .select('*', { count: 'exact', head: true });

        const hasMore = (offset + batchSize) < (count || 0);

        console.log(`Translated ${updatedCount}/${records.length} records in ${table}`);

        return new Response(
            JSON.stringify({
                success: true,
                translated: updatedCount,
                processed: records.length,
                nextOffset: offset + batchSize,
                hasMore,
                totalRecords: count,
                progress: Math.round(((offset + records.length) / (count || 1)) * 100)
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('Translation batch error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
