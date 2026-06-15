/**
 * Shared OpenAI client for Supabase Edge Functions.
 */

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

export interface AIResponse {
  text: string;
  provider: 'openai' | 'none';
  model: string;
}

export interface AIContentBlock {
  type: 'text' | 'image' | 'document';
  text?: string;
  image_url?: { url: string };
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
  document?: {
    type: 'base64';
    media_type: 'application/pdf';
    data: string;
  };
  inline_data?: {
    mime_type: string;
    data: string;
  };
}

export interface AIMessage {
  role: string;
  content: string | AIContentBlock[];
}

type OpenAIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type OpenAIMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenAIContentPart[];
};

function getOpenAIConfig(options: { model?: string; maxTokens?: number; temperature?: number }) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  const model = Deno.env.get('OPENAI_MODEL') || options.model || 'gpt-5.5';

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const body: Record<string, unknown> = {
    model,
    max_completion_tokens: options.maxTokens || 4096,
  };

  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  return { apiKey, model, body };
}

function toOpenAIRole(role: string): 'user' | 'assistant' {
  return role === 'assistant' ? 'assistant' : 'user';
}

function contentBlockToOpenAI(block: AIContentBlock): OpenAIContentPart {
  if (block.type === 'image') {
    if (block.image_url?.url) {
      return { type: 'image_url', image_url: { url: block.image_url.url } };
    }

    if (block.source?.data && block.source.media_type) {
      return {
        type: 'image_url',
        image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` },
      };
    }

    if (block.inline_data?.data && block.inline_data.mime_type) {
      return {
        type: 'image_url',
        image_url: { url: `data:${block.inline_data.mime_type};base64,${block.inline_data.data}` },
      };
    }
  }

  if (block.type === 'document') {
    const source = block.source || block.document;
    if (source?.data) {
      return {
        type: 'text',
        text: `[Document ${source.media_type}, base64 omitted from prompt. Extracted text should be supplied separately when available.]`,
      };
    }
  }

  return { type: 'text', text: block.text || '' };
}

function formatContent(content: string | AIContentBlock[]): string | OpenAIContentPart[] {
  if (typeof content === 'string') {
    return content;
  }

  const parts = content.map(contentBlockToOpenAI).filter((part) => {
    return part.type !== 'text' || part.text.trim().length > 0;
  });

  return parts.length > 0 ? parts : '';
}

function buildMessages(systemPrompt: string, userPrompt: string | AIMessage[]): OpenAIMessage[] {
  const messages: OpenAIMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  if (typeof userPrompt === 'string') {
    messages.push({ role: 'user', content: userPrompt });
    return messages;
  }

  for (const message of userPrompt) {
    messages.push({
      role: toOpenAIRole(message.role),
      content: formatContent(message.content),
    });
  }

  return messages;
}

/**
 * Standard non-streaming AI call.
 */
export async function callAI(
  systemPrompt: string,
  userPrompt: string | AIMessage[],
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  } = {},
): Promise<AIResponse> {
  const { apiKey, model, body } = getOpenAIConfig(options);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...body,
      messages: buildMessages(systemPrompt, userPrompt),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return {
    text: data.choices?.[0]?.message?.content || '',
    provider: 'openai',
    model,
  };
}

/**
 * Robust JSON cleaner for AI responses.
 */
export function cleanJsonString(input: string): string {
  let cleaned = input.trim();
  cleaned = cleaned.replace(/^```(?:json)?|```$/g, '').trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
}

/**
 * Streaming AI call.
 */
export async function streamAI(
  systemPrompt: string,
  userPrompt: string | AIMessage[],
  onChunk: (text: string) => void | Promise<void>,
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  } = {},
): Promise<AIResponse> {
  const { apiKey, model, body } = getOpenAIConfig(options);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...body,
      messages: buildMessages(systemPrompt, userPrompt),
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    throw new Error(`OpenAI stream failed (${response.status}): ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;

      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;

      try {
        const event = JSON.parse(payload);
        const text = event.choices?.[0]?.delta?.content || '';
        if (text) {
          fullText += text;
          await onChunk(text);
        }
      } catch {
        // Ignore partial or non-JSON SSE lines.
      }
    }
  }

  return {
    text: fullText,
    provider: 'openai',
    model,
  };
}
