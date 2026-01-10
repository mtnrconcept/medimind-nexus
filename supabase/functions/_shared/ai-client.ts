/**
 * Shared AI Client for Supabase Edge Functions
 * Handles Anthropic (Claude) requests with automatic fallback to Google Gemini.
 */

declare const Deno: {
    env: {
        get(key: string): string | undefined;
    };
};

export interface AIResponse {
    text: string;
    provider: 'anthropic' | 'google' | 'huggingface' | 'none';
    model: string;
}

export interface AIContentBlock {
    type: 'text' | 'image' | 'document';
    text?: string;
    image_url?: { url: string }; // Standard format
    source?: {           // Anthropic specific (images & documents)
        type: 'base64';
        media_type: string;
        data: string;
    };
    document?: {         // Alternative Anthropic format
        type: 'base64';
        media_type: 'application/pdf';
        data: string;
    };
    inline_data?: {      // Gemini specific
        mime_type: string;
        data: string;
    };
}

export interface AIMessage {
    role: string;
    content: string | AIContentBlock[];
}

/**
 * Standard non-streaming AI call with fallback
 */
export async function callAI(
    systemPrompt: string,
    userPrompt: string | AIMessage[],
    options: {
        model?: string;
        maxTokens?: number;
        temperature?: number;
    } = {}
): Promise<AIResponse> {
    const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY') || Deno.env.get('ANTHROPIC_API_KEY');
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    const HF_TOKEN = Deno.env.get('HUGGING_FACE_ACCESS_TOKEN') || Deno.env.get('HUGGING_FACE_TOKEN');

    const model = options.model || 'claude-3-5-sonnet-20240620';

    // 0. Check for Hugging Face specific request FIRST
    const isHFModel = options.model?.includes('/') || options.model === 'biogpt';

    if (HF_TOKEN && isHFModel) {
        const hfModel = options.model === 'biogpt' ? 'microsoft/BioGPT-Large' : (options.model || 'microsoft/BioGPT-Large');
        try {
            console.log(`[AI-Client] Calling Hugging Face (${hfModel})...`);

            // Construct a single string prompt since BioGPT is a completion model
            let fullPrompt = `${systemPrompt}\n\n`;
            if (typeof userPrompt === 'string') {
                fullPrompt += `User: ${userPrompt}\nAnswer:`;
            } else {
                userPrompt.forEach(m => {
                    const content = typeof m.content === 'string' ? m.content : m.content.map(c => c.text).join(' ');
                    fullPrompt += `${m.role === 'user' ? 'User' : 'Assistant'}: ${content}\n`;
                });
                fullPrompt += 'Answer:';
            }

            const response = await fetch(`https://api-inference.huggingface.co/models/${hfModel}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${HF_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    inputs: fullPrompt,
                    parameters: {
                        max_new_tokens: 250, // BioGPT is often short context
                        temperature: options.temperature ?? 0.7,
                        return_full_text: false
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                // HF generic output is usually [{ generated_text: "..." }]
                const text = Array.isArray(data) ? data[0]?.generated_text : (data.generated_text || JSON.stringify(data));
                return {
                    text: text || '',
                    provider: 'huggingface',
                    model: hfModel
                };
            }

            const errorText = await response.text();
            console.warn(`[AI-Client] Hugging Face failed: ${errorText}`);

        } catch (error) {
            console.error(`[AI-Client] Hugging Face error:`, error);
        }
        // If HF fails, we could technically fall back, but usually if a specific model was requested we stop or let it fall through.
        // For now, let it fall through to other providers if needed, or return error?
        // Let's assume if it was a specific HF model request, and it failed, we shouldn't send that logic to Claude.
        return {
            text: JSON.stringify({ error: "Hugging Face model failed." }),
            provider: 'huggingface',
            model: hfModel
        };
    }

    // Updated to use the most powerful stable model as primary
    const geminiModel = 'gemini-1.5-pro';
    // Fallback to the latest experimental flash model for speed if needed
    const geminiProModel = 'gemini-2.0-flash-exp';

    // Helper to format messages for Anthropic
    const formatAnthropicMessages = (prompt: string | AIMessage[]) => {
        if (typeof prompt === 'string') {
            return [{ role: 'user', content: prompt }];
        }
        return prompt.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: typeof m.content === 'string'
                ? m.content
                : m.content.map(block => {
                    if ((block.type === 'image' || block.type === 'document') && (block.source || block.document)) {
                        return {
                            type: block.type === 'document' ? 'document' : 'image',
                            source: block.source || block.document
                        };
                    }
                    return { type: 'text', text: block.text || '' };
                })
        }));
    };

    // Helper to format messages for Gemini
    const formatGeminiContents = (prompt: string | AIMessage[]) => {
        if (typeof prompt === 'string') {
            return [{ role: 'user', parts: [{ text: prompt }] }];
        }
        return prompt.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: typeof m.content === 'string'
                ? [{ text: m.content }]
                : m.content.map(block => {
                    if (block.type === 'image' || block.type === 'document') {
                        // Check if it's already in Gemini format or convert from Anthropic format
                        if (block.inline_data) return { inline_data: block.inline_data };
                        const source = block.source || block.document;
                        if (source) return {
                            inline_data: {
                                mime_type: source.media_type,
                                data: source.data
                            }
                        };
                    }
                    return { text: block.text || '' };
                })
        }));
    };

    // 1. Try Anthropic first if key is available
    if (CLAUDE_API_KEY) {
        try {
            console.log(`[AI-Client] Calling Anthropic (${model})...`);
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': CLAUDE_API_KEY,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    model: model,
                    max_tokens: options.maxTokens || 80000,
                    temperature: options.temperature ?? 0.7,
                    system: systemPrompt,
                    messages: formatAnthropicMessages(userPrompt),
                }),
            });

            if (response.ok) {
                const data = await response.json();
                return {
                    text: data.content?.[0]?.text || '',
                    provider: 'anthropic',
                    model: model
                };
            }

            const errorText = await response.text();
            console.warn(`[AI-Client] Anthropic failed with status ${response.status}: ${errorText}. Falling back to Gemini...`);
        } catch (error) {
            console.error(`[AI-Client] Anthropic error:`, error);
        }
    }

    // 2. Fallback to Gemini if Anthropic failed or key is missing
    if (GEMINI_API_KEY) {
        try {
            console.log(`[AI-Client] Calling Gemini (${geminiModel})...`);
            let url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`;

            let response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: formatGeminiContents(userPrompt),
                    systemInstruction: {
                        parts: [{ text: systemPrompt }]
                    },
                    generationConfig: {
                        maxOutputTokens: options.maxTokens || 120000,
                        temperature: options.temperature ?? 0.7,
                    }
                }),
            });

            // If primary Gemini fails, try Pro identifier
            if (!response.ok) {
                const errText = await response.text();
                console.warn(`[AI-Client] Gemini ${geminiModel} failed (${response.status}): ${errText}. Trying ${geminiProModel}...`);

                url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiProModel}:generateContent?key=${GEMINI_API_KEY}`;
                response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: formatGeminiContents(userPrompt),
                        systemInstruction: {
                            parts: [{ text: systemPrompt }]
                        },
                        generationConfig: {
                            maxOutputTokens: options.maxTokens || 120000,
                            temperature: options.temperature ?? 0.7,
                        }
                    }),
                });
            }


            if (response.ok) {
                const data = await response.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                return {
                    text,
                    provider: 'google',
                    model: geminiModel
                };
            }

            const errorText = await response.text();
            console.error(`[AI-Client] Gemini error:`, errorText);
        } catch (error) {
            console.error(`[AI-Client] Gemini fallback error:`, error);
        }
    }

    // 3. Fallback to Hugging Face (Specific Models or BioGPT default)
    // REMOVED - Logic moved to top.

    // Fallthrough error
    return {
        text: JSON.stringify({ notes: "Erreur: Aucun fournisseur d'IA n'a pu répondre." }),
        provider: 'none',
        model: 'none'
    };

    return {
        text: JSON.stringify({ notes: "Erreur: Aucun fournisseur d'IA n'a pu répondre (Anthropic/Gemini indisponibles ou balance épuisée)." }),
        provider: 'none',
        model: 'none'
    };
}

/**
 * Robust JSON cleaner for AI responses.
 * Removes Markdown code blocks and fixes common syntax errors.
 */
export function cleanJsonString(input: string): string {
    let cleaned = input.trim();

    // 1. Remove Markdown code blocks ```json ... ```
    cleaned = cleaned.replace(/^```(?:json)?|```$/g, '').trim();

    // 2. Remove any text before the first { and after the last }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    // 3. Fix common trailing commas (e.g. "item", } -> "item" })
    cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

    return cleaned;
}

/**
 * Streaming AI call with fallback
 */
export async function streamAI(
    systemPrompt: string,
    userPrompt: string | AIMessage[],
    onChunk: (text: string) => void | Promise<void>,
    options: {
        model?: string;
        maxTokens?: number;
        temperature?: number;
    } = {}
): Promise<AIResponse> {
    const CLAUDE_API_KEY = Deno.env.get('CLAUDE_API_KEY') || Deno.env.get('ANTHROPIC_API_KEY');
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');

    const model = options.model || 'claude-3-5-sonnet-20240620';
    const geminiModel = 'gemini-1.5-pro';
    const geminiProModel = 'gemini-2.0-flash-exp';



    // Helper to format messages for Anthropic
    const formatAnthropicMessages = (prompt: string | AIMessage[]) => {
        if (typeof prompt === 'string') {
            return [{ role: 'user', content: prompt }];
        }
        return prompt.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: typeof m.content === 'string'
                ? m.content
                : m.content.map(block => {
                    if (block.type === 'image' && block.source) {
                        return {
                            type: 'image',
                            source: block.source
                        };
                    }
                    return { type: 'text', text: block.text || '' };
                })
        }));
    };

    // Helper to format messages for Gemini
    const formatGeminiContents = (prompt: string | AIMessage[]) => {
        if (typeof prompt === 'string') {
            return [{ role: 'user', parts: [{ text: prompt }] }];
        }
        return prompt.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: typeof m.content === 'string'
                ? [{ text: m.content }]
                : m.content.map(block => {
                    if (block.type === 'image') {
                        if (block.inline_data) return { inline_data: block.inline_data };
                        if (block.source) return {
                            inline_data: {
                                mime_type: block.source.media_type,
                                data: block.source.data
                            }
                        };
                    }
                    return { text: block.text || '' };
                })
        }));
    };

    // 1. Try Anthropic first if key is available
    if (CLAUDE_API_KEY) {
        try {
            console.log(`[AI-Client] Calling Anthropic Stream (${model})...`);
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': CLAUDE_API_KEY,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                },
                body: JSON.stringify({
                    model: model,
                    max_tokens: options.maxTokens || 80000,
                    temperature: options.temperature ?? 0.7,
                    system: systemPrompt,
                    stream: true,
                    messages: formatAnthropicMessages(userPrompt),
                }),
            });

            if (response.ok && response.body) {
                let fullText = '';
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
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
                                    fullText += text;
                                    await onChunk(text);
                                }
                            } catch (e) { /* ignore */ }
                        }
                    }
                }

                return { text: fullText, provider: 'anthropic', model: model };
            }
            const errorText = await response.text();
            console.warn(`[AI-Client] Anthropic Stream failed status ${response.status}: ${errorText}. Falling back to Gemini...`);
        } catch (error) {
            console.error(`[AI-Client] Anthropic Stream error:`, error);
        }
    }

    // 2. Fallback to Gemini if Anthropic failed or key is missing
    if (GEMINI_API_KEY) {
        try {
            console.log(`[AI-Client] Calling Gemini Stream (${geminiModel})...`);
            let url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

            let response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: formatGeminiContents(userPrompt),
                    systemInstruction: {
                        parts: [{ text: systemPrompt }]
                    },
                    generationConfig: {
                        maxOutputTokens: options.maxTokens || 120000,
                        temperature: options.temperature ?? 0.7,
                    }
                }),
            });

            // Fallback for streaming
            if (!response.ok) {
                console.warn(`[AI-Client] Gemini Stream ${geminiModel} failed, trying ${geminiProModel}...`);
                url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiProModel}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
                response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: formatGeminiContents(userPrompt),
                        systemInstruction: {
                            parts: [{ text: systemPrompt }]
                        },
                        generationConfig: {
                            maxOutputTokens: options.maxTokens || 120000,
                            temperature: options.temperature ?? 0.7,
                        }
                    }),
                });
            }


            if (response.ok && response.body) {
                let fullText = '';
                let streamBuffer = '';
                const reader = response.body.getReader();
                const decoder = new TextDecoder();

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    streamBuffer += decoder.decode(value, { stream: true });

                    // Robust cumulative text extraction
                    let combinedText = '';
                    const textRegex = /"text":\s*"((?:[^"\\]|\\.)*)"/g;
                    let match;
                    while ((match = textRegex.exec(streamBuffer)) !== null) {
                        const part = match[1]
                            .replace(/\\n/g, '\n')
                            .replace(/\\r/g, '\r')
                            .replace(/\\t/g, '\t')
                            .replace(/\\"/g, '"')
                            .replace(/\\\\/g, '\\');
                        combinedText += part;
                    }

                    if (combinedText.length > fullText.length) {
                        const newText = combinedText.slice(fullText.length);
                        fullText = combinedText;
                        await onChunk(newText);
                    }
                }

                return { text: fullText, provider: 'google', model: geminiModel };
            }

            const errorText = await response.text();
            console.error(`[AI-Client] Gemini Stream error: ${errorText}`);
        } catch (error) {
            console.error(`[AI-Client] Gemini Stream error:`, error);
        }
    }

    throw new Error('No AI provider available for streaming');
}
