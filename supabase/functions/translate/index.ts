import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TranslationRequest {
    texts: string[];
    targetLang: string;
}

interface TranslationResult {
    original: string;
    translated: string;
    detectedLang: string;
}

/**
 * Traduit un texte en détectant automatiquement la langue source
 * Utilise l'API Google Translate gratuite
 */
async function translateText(
    text: string,
    targetLang: string
): Promise<TranslationResult> {
    if (!text || text.trim() === '') {
        return { original: text, translated: text, detectedLang: 'unknown' };
    }

    try {
        // API Google Translate gratuite avec détection automatique (sl=auto)
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&dt=ld&q=${encodeURIComponent(text)}`;

        const response = await fetch(url);

        if (!response.ok) {
            console.error(`Translation API error: ${response.status}`);
            return { original: text, translated: text, detectedLang: 'error' };
        }

        const data = await response.json();

        // Extraire le texte traduit (format: [[["texte traduit", "texte original", ...]], ...])
        let translatedText = '';
        if (data[0] && Array.isArray(data[0])) {
            translatedText = data[0].map((segment: any) => segment[0]).join('');
        }

        // Extraire la langue détectée (format: [..., null, "fr", ...])
        let detectedLang = 'unknown';
        if (data[2]) {
            detectedLang = data[2];
        } else if (data[8] && data[8][0] && data[8][0][0]) {
            detectedLang = data[8][0][0];
        }

        // Si la langue détectée est la même que la cible, retourner le texte original
        if (detectedLang === targetLang) {
            return { original: text, translated: text, detectedLang };
        }

        return {
            original: text,
            translated: translatedText || text,
            detectedLang
        };

    } catch (error) {
        console.error('Translation error:', error);
        return { original: text, translated: text, detectedLang: 'error' };
    }
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { texts, targetLang }: TranslationRequest = await req.json();

        // Validation
        if (!texts || !Array.isArray(texts)) {
            return new Response(
                JSON.stringify({ error: 'Missing required field: texts (array of strings)' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!targetLang) {
            return new Response(
                JSON.stringify({ error: 'Missing required field: targetLang' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Mapper les codes de langue courants
        const langMap: Record<string, string> = {
            'fr': 'fr',
            'en': 'en',
            'de': 'de',
            'es': 'es',
            'it': 'it',
            'pt': 'pt',
            'nl': 'nl',
            'pl': 'pl',
            'ru': 'ru',
            'zh': 'zh-CN',
            'ja': 'ja',
            'ko': 'ko',
            'ar': 'ar'
        };

        const target = langMap[targetLang] || targetLang;

        // Traduire tous les textes en parallèle (avec limite de concurrence)
        const BATCH_SIZE = 10;
        const results: TranslationResult[] = [];

        for (let i = 0; i < texts.length; i += BATCH_SIZE) {
            const batch = texts.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(
                batch.map(text => translateText(text, target))
            );
            results.push(...batchResults);
        }

        // Retourner les traductions
        return new Response(
            JSON.stringify({
                translations: results.map(r => r.translated),
                details: results.map(r => ({
                    original: r.original,
                    translated: r.translated,
                    detectedLang: r.detectedLang
                }))
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('Translation service error:', error);
        return new Response(
            JSON.stringify({ error: error.message || 'Translation service error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
