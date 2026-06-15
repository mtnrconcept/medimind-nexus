import { callAI } from "./ai-client.ts";
import { jsonrepair } from 'https://esm.sh/jsonrepair';

export interface CanonicalEntity {
    raw: string;
    id: string; // MeSH:D000001 or RxNorm:12345
    label: string;
    type: string; // disease, drug, mechanism, etc.
}

/**
 * Normalizes a list of entity labels to their canonical forms (MeSH/RxNorm).
 * Uses a specialized AI prompt to ensure consistency and deduplication.
 */
export async function normalizeEntities(entities: string[]): Promise<Map<string, CanonicalEntity>> {
    // 1. Deduplicate input
    const uniqueEntities = [...new Set(entities.filter(e => e && e.trim().length > 0))];

    if (uniqueEntities.length === 0) return new Map();

    const systemPrompt = `You are a Medical Librarian Expert (MeSH/RxNorm).
Your goal is to normalize a list of raw medical terms into their canonical standard IDs and Preferred Labels.
- For DRUGS: Use RxNorm (preferred) or MeSH.
- For DISEASES: Use MeSH.
- For MECHANISMS/PROTEINS: Use MeSH or HGNC symbol.

STRICTLY RETURN ONLY VALID JSON. No markdown, no commentary, no triple backticks.
Format:
{
  "aspirin": { "id": "RxNorm:1191", "label": "Aspirin", "type": "drug" },
  "cancer du sein": { "id": "MeSH:D001943", "label": "Breast Neoplasms", "type": "disease" }
}
If a term is too vague or unknown, map it to itself with ID "Unknown".`;

    const userPrompt = `Normalize these terms:\n${JSON.stringify(uniqueEntities)}`;

    console.log(`📚 Normalizing ${uniqueEntities.length} entities...`);

    try {
        const response = await callAI(systemPrompt, userPrompt, {
            model: 'gpt-5.4-mini',
            reasoningEffort: 'low',
            temperature: 0.1, // High determinism
            maxTokens: 2000
        });

        // Robust parsing: strip potential markdown and use jsonrepair
        let cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
        // Catch-all for simple braces finder if response is noisy
        const braceMatch = cleanText.match(/\{[\s\S]*\}/);
        if (braceMatch) cleanText = braceMatch[0];

        let parsed;
        try {
            parsed = JSON.parse(jsonrepair(cleanText));
        } catch (e) {
            console.error("JSON Repair failed, trying raw parse...");
            parsed = JSON.parse(cleanText);
        }

        const resultMap = new Map<string, CanonicalEntity>();

        // Map back to original list to ensure all inputs are handled
        uniqueEntities.forEach(raw => {
            const norm = parsed[raw];
            if (norm) {
                resultMap.set(raw, {
                    raw,
                    id: norm.id || 'Unknown',
                    label: norm.label || raw,
                    type: norm.type || 'unknown'
                });
            } else {
                // Fallback
                resultMap.set(raw, { raw, id: 'Unknown', label: raw, type: 'unknown' });
            }
        });

        return resultMap;

    } catch (error) {
        console.error("❌ Entity normalization failed:", error);
        // Fallback: return identity map
        const fallbackMap = new Map<string, CanonicalEntity>();
        uniqueEntities.forEach(e => fallbackMap.set(e, { raw: e, id: 'Unknown', label: e, type: 'unknown' }));
        return fallbackMap;
    }
}
