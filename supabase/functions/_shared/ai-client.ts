/**
 * Shared OpenAI client for Supabase Edge Functions.
 */

import {
  buildClinicalSystemPrompt,
  detectHighRiskContext,
  getClinicalModelEnv,
  profileClinicalPrompt,
  selectClinicalModel,
  type ClinicalReasoningEffort,
  type ClinicalRiskAssessment,
  type ClinicalRiskInput,
  type ClinicalTask,
} from './clinical-brain.ts';

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

export interface AIResponse {
  text: string;
  provider: 'openai' | 'none';
  model: string;
  reasoningEffort?: ClinicalReasoningEffort;
  clinicalSafety?: ClinicalRiskAssessment;
  clinicalRoute?: AIClinicalRouteMetadata;
}

export interface AIClinicalRouteMetadata {
  task: ClinicalTask;
  riskLevel: ClinicalRiskAssessment['riskLevel'];
  flags: string[];
  finalReviewRequired: boolean;
  routeReason: string;
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

type ResponsesContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail?: 'low' | 'high' | 'auto' };

type ResponsesMessage = {
  role: 'system' | 'developer' | 'user' | 'assistant';
  content: string | ResponsesContentPart[];
};

export interface AICallOptions {
  model?: string;
  forceModel?: boolean;
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: ClinicalReasoningEffort;
  responseFormat?: Record<string, unknown>;
  timeoutMs?: number;
  clinicalTask?: ClinicalTask;
  clinicalInput?: ClinicalRiskInput;
  clinicalRiskAssessment?: ClinicalRiskAssessment;
  clinicalContextText?: string;
  elementCount?: number;
  hasExternalEvidence?: boolean;
  enforceClinicalContract?: boolean;
  skipClinicalBrain?: boolean;
}

export interface AIEmbeddingOptions {
  model?: string;
  dimensions?: number;
  timeoutMs?: number;
}

const DEFAULT_OPENAI_MODEL = 'gpt-5.5';
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const DEFAULT_OPENAI_TIMEOUT_MS = 90_000;
const MAX_CLINICAL_ROUTING_TEXT_CHARS = 20_000;
const CLINICAL_CONTRACT_MARKER = 'CONTRAT CLINIQUE VERIFIABLE';

function isKnownNonOpenAIModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return (
    normalized.startsWith('claude') ||
    normalized.includes('sonnet') ||
    normalized.includes('opus') ||
    normalized.includes('haiku') ||
    normalized.startsWith('anthropic/') ||
    normalized.startsWith('gemini') ||
    normalized.startsWith('google/') ||
    normalized.startsWith('mistral') ||
    normalized.startsWith('mixtral') ||
    normalized.startsWith('deepseek') ||
    normalized.startsWith('openrouter/') ||
    normalized.startsWith('cohere') ||
    normalized.startsWith('qwen') ||
    normalized.startsWith('llama') ||
    normalized.startsWith('meta/')
  );
}

function resolveOpenAIModel(options: AICallOptions, envModel?: string): string {
  const requested = options.forceModel
    ? options.model || envModel
    : envModel || options.model;
  const candidate = (requested || DEFAULT_OPENAI_MODEL).trim();

  if (isKnownNonOpenAIModel(candidate)) {
    const fallback = envModel && !isKnownNonOpenAIModel(envModel)
      ? envModel
      : DEFAULT_OPENAI_MODEL;
    console.warn(`[AI] Non-OpenAI model "${candidate}" requested; using "${fallback}" with OPENAI_API_KEY.`);
    return fallback;
  }

  return candidate || DEFAULT_OPENAI_MODEL;
}

function getOpenAIConfig(options: AICallOptions) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  const envModel = Deno.env.get('OPENAI_MODEL');
  const model = resolveOpenAIModel(options, envModel);

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  return { apiKey, model };
}

function resolveTimeoutMs(options: AICallOptions): number {
  const envValue = Number(Deno.env.get('OPENAI_TIMEOUT_MS'));
  const configured = options.timeoutMs ?? envValue;
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_OPENAI_TIMEOUT_MS;
}

function strongerReasoningEffort(
  requested: ClinicalReasoningEffort | undefined,
  routed: ClinicalReasoningEffort,
): ClinicalReasoningEffort {
  if (!requested) {
    return routed;
  }

  const order: ClinicalReasoningEffort[] = ['none', 'low', 'medium', 'high', 'xhigh'];
  return order.indexOf(requested) >= order.indexOf(routed) ? requested : routed;
}

function contentToPlainText(content: string | AIContentBlock[]): string {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .map((block) => {
      if (block.text) return block.text;
      if (block.type === 'image') return '[image]';
      if (block.type === 'document') return '[document]';
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function userPromptToPlainText(userPrompt: string | AIMessage[]): string {
  if (typeof userPrompt === 'string') {
    return userPrompt;
  }

  return userPrompt
    .map((message) => `${message.role}: ${contentToPlainText(message.content)}`)
    .join('\n');
}

function buildClinicalRoutingText(
  systemPrompt: string,
  userPrompt: string | AIMessage[],
  options: AICallOptions,
): string {
  return [
    options.clinicalContextText,
    systemPrompt,
    userPromptToPlainText(userPrompt),
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, MAX_CLINICAL_ROUTING_TEXT_CHARS);
}

function shouldUseClinicalBrain(
  systemPrompt: string,
  userPrompt: string | AIMessage[],
  options: AICallOptions,
): boolean {
  if (options.skipClinicalBrain) {
    return false;
  }

  if (
    options.enforceClinicalContract ||
    options.clinicalTask ||
    options.clinicalInput ||
    options.clinicalRiskAssessment
  ) {
    return true;
  }

  if (options.model?.trim().toLowerCase().startsWith('gpt-5')) {
    return true;
  }

  return profileClinicalPrompt(buildClinicalRoutingText(systemPrompt, userPrompt, options)).isClinical;
}

export function prepareClinicalAICall(
  systemPrompt: string,
  userPrompt: string | AIMessage[],
  options: AICallOptions,
  getEnv: (key: string) => string | undefined = (key) => Deno.env.get(key),
): {
  systemPrompt: string;
  options: AICallOptions;
  clinicalSafety?: ClinicalRiskAssessment;
  clinicalRoute?: AIClinicalRouteMetadata;
} {
  if (!shouldUseClinicalBrain(systemPrompt, userPrompt, options)) {
    return { systemPrompt, options };
  }

  const routingText = buildClinicalRoutingText(systemPrompt, userPrompt, options);
  const profile = profileClinicalPrompt(
    routingText,
    options.clinicalTask,
    options.elementCount || options.clinicalInput?.selectedElementCount || 0,
  );
  const clinicalSafety = options.clinicalRiskAssessment || detectHighRiskContext({
    ...options.clinicalInput,
    selectedElementCount: options.elementCount || options.clinicalInput?.selectedElementCount || profile.elementCount,
    freeText: [
      options.clinicalInput?.freeText,
      routingText,
    ].filter(Boolean).join('\n\n'),
  });
  const route = selectClinicalModel({
    task: profile.task,
    riskAssessment: clinicalSafety,
    elementCount: profile.elementCount,
    hasExternalEvidence: options.hasExternalEvidence ?? profile.hasExternalEvidence,
  }, getClinicalModelEnv(getEnv));
  const routedOptions: AICallOptions = {
    ...options,
    model: options.forceModel ? options.model : route.model,
    reasoningEffort: strongerReasoningEffort(options.reasoningEffort, route.reasoningEffort),
    timeoutMs: options.timeoutMs ?? route.timeoutMs,
  };
  const routedSystemPrompt = systemPrompt.includes(CLINICAL_CONTRACT_MARKER)
    ? systemPrompt
    : buildClinicalSystemPrompt(systemPrompt, clinicalSafety);

  console.log(
    `[AI] Clinical brain route task=${profile.task} risk=${clinicalSafety.riskLevel} model=${routedOptions.model} effort=${routedOptions.reasoningEffort}`,
  );

  return {
    systemPrompt: routedSystemPrompt,
    options: routedOptions,
    clinicalSafety,
    clinicalRoute: {
      task: profile.task,
      riskLevel: clinicalSafety.riskLevel,
      flags: clinicalSafety.flags,
      finalReviewRequired: route.finalReviewRequired,
      routeReason: route.routeReason,
    },
  };
}

async function fetchOpenAI(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    console.log(`[AI] OpenAI ${response.status} in ${Date.now() - startedAt}ms`);
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`OpenAI request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function hasReasoningEffort(options: AICallOptions): boolean {
  return Boolean(options.reasoningEffort && options.reasoningEffort !== 'none');
}

function shouldUseResponsesAPI(model: string, options: AICallOptions): boolean {
  return /^gpt-5(?:\.|-|$)/i.test(model.trim()) || hasReasoningEffort(options);
}

function supportsResponsesTemperature(model: string): boolean {
  return !/^gpt-5(?:\.|-|$)/i.test(model.trim());
}

function buildChatCompletionsBody(model: string, options: AICallOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    max_completion_tokens: options.maxTokens || 4096,
  };

  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  if (hasReasoningEffort(options)) {
    body.reasoning_effort = options.reasoningEffort;
  }

  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  return body;
}

function buildResponsesBody(model: string, options: AICallOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    max_output_tokens: options.maxTokens || 4096,
  };

  if (options.temperature !== undefined && supportsResponsesTemperature(model)) {
    body.temperature = options.temperature;
  }

  if (hasReasoningEffort(options)) {
    body.reasoning = { effort: options.reasoningEffort };
  }

  if (options.responseFormat) {
    body.text = { format: options.responseFormat };
  }

  return body;
}

function toOpenAIRole(role: string): 'user' | 'assistant' {
  return role === 'assistant' ? 'assistant' : 'user';
}

function toResponsesRole(role: string): ResponsesMessage['role'] {
  if (role === 'assistant' || role === 'system' || role === 'developer') {
    return role;
  }

  return 'user';
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

function contentBlockToResponses(block: AIContentBlock): ResponsesContentPart {
  if (block.type === 'image') {
    if (block.image_url?.url) {
      return { type: 'input_image', image_url: block.image_url.url, detail: 'auto' };
    }

    if (block.source?.data && block.source.media_type) {
      return {
        type: 'input_image',
        image_url: `data:${block.source.media_type};base64,${block.source.data}`,
        detail: 'auto',
      };
    }

    if (block.inline_data?.data && block.inline_data.mime_type) {
      return {
        type: 'input_image',
        image_url: `data:${block.inline_data.mime_type};base64,${block.inline_data.data}`,
        detail: 'auto',
      };
    }
  }

  if (block.type === 'document') {
    const source = block.source || block.document;
    if (source?.data) {
      return {
        type: 'input_text',
        text: `[Document ${source.media_type}, base64 omitted from prompt. Extracted text should be supplied separately when available.]`,
      };
    }
  }

  return { type: 'input_text', text: block.text || '' };
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

function formatResponsesContent(content: string | AIContentBlock[]): string | ResponsesContentPart[] {
  if (typeof content === 'string') {
    return content;
  }

  const parts = content.map(contentBlockToResponses).filter((part) => {
    return part.type !== 'input_text' || part.text.trim().length > 0;
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

function buildResponsesInput(systemPrompt: string, userPrompt: string | AIMessage[]): ResponsesMessage[] {
  const messages: ResponsesMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  if (typeof userPrompt === 'string') {
    messages.push({ role: 'user', content: userPrompt });
    return messages;
  }

  for (const message of userPrompt) {
    messages.push({
      role: toResponsesRole(message.role),
      content: formatResponsesContent(message.content),
    });
  }

  return messages;
}

function extractResponsesText(data: Record<string, unknown>): string {
  if (typeof data.output_text === 'string') {
    return data.output_text;
  }

  const chunks: string[] = [];
  const output = Array.isArray(data.output) ? data.output : [];

  for (const item of output) {
    if (!item || typeof item !== 'object') continue;

    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;

    for (const part of content) {
      if (!part || typeof part !== 'object') continue;

      const text = (part as { text?: unknown }).text;
      if (typeof text === 'string') {
        chunks.push(text);
      }
    }
  }

  return chunks.join('');
}

function extractResponsesStreamDelta(event: Record<string, unknown>): string {
  if (typeof event.delta === 'string') {
    return event.delta;
  }

  if (typeof event.text === 'string') {
    return event.text;
  }

  if (typeof event.output_text === 'string') {
    return event.output_text;
  }

  return '';
}

/**
 * Standard non-streaming AI call.
 */
export async function callAI(
  systemPrompt: string,
  userPrompt: string | AIMessage[],
  options: AICallOptions = {},
): Promise<AIResponse> {
  const prepared = prepareClinicalAICall(systemPrompt, userPrompt, options);
  const { apiKey, model } = getOpenAIConfig(prepared.options);
  const timeoutMs = resolveTimeoutMs(prepared.options);
  const useResponsesAPI = shouldUseResponsesAPI(model, prepared.options);
  const body = useResponsesAPI
    ? {
        ...buildResponsesBody(model, prepared.options),
        input: buildResponsesInput(prepared.systemPrompt, userPrompt),
      }
    : {
        ...buildChatCompletionsBody(model, prepared.options),
        messages: buildMessages(prepared.systemPrompt, userPrompt),
      };

  const response = await fetchOpenAI(
    useResponsesAPI ? OPENAI_RESPONSES_URL : OPENAI_CHAT_COMPLETIONS_URL,
    apiKey,
    body,
    timeoutMs,
  );

  if (!response.ok) {
    const errorText = await response.text();
    const apiName = useResponsesAPI ? 'Responses' : 'Chat Completions';
    throw new Error(`OpenAI ${apiName} request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = useResponsesAPI
    ? extractResponsesText(data)
    : data.choices?.[0]?.message?.content || '';

  if (!text.trim()) {
    const status = typeof data.status === 'string' ? data.status : 'unknown';
    const reason = typeof data.incomplete_details === 'object'
      ? JSON.stringify(data.incomplete_details)
      : 'no text output';
    throw new Error(`OpenAI returned an empty response (status: ${status}, reason: ${reason})`);
  }

  return {
    text,
    provider: 'openai',
    model,
    reasoningEffort: prepared.options.reasoningEffort,
    clinicalSafety: prepared.clinicalSafety,
    clinicalRoute: prepared.clinicalRoute,
  };
}

export async function createEmbeddings(
  input: string | string[],
  options: AIEmbeddingOptions = {},
): Promise<number[][]> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const model = options.model || 'text-embedding-3-small';
  const timeoutMs = resolveTimeoutMs({ timeoutMs: options.timeoutMs });
  const body: Record<string, unknown> = { model, input };
  if (options.dimensions) {
    body.dimensions = options.dimensions;
  }

  const response = await fetchOpenAI(OPENAI_EMBEDDINGS_URL, apiKey, body, timeoutMs);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Embeddings request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json() as { data?: Array<{ index?: number | string; embedding?: unknown }> };
  const rows = Array.isArray(data.data) ? data.data : [];
  return rows
    .sort((left, right) => Number(left.index || 0) - Number(right.index || 0))
    .map((row) => row.embedding)
    .filter((embedding): embedding is number[] => Array.isArray(embedding));
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
  options: AICallOptions = {},
): Promise<AIResponse> {
  const prepared = prepareClinicalAICall(systemPrompt, userPrompt, options);
  const { apiKey, model } = getOpenAIConfig(prepared.options);
  const timeoutMs = resolveTimeoutMs(prepared.options);
  const useResponsesAPI = shouldUseResponsesAPI(model, prepared.options);
  const body = useResponsesAPI
    ? {
        ...buildResponsesBody(model, prepared.options),
        input: buildResponsesInput(prepared.systemPrompt, userPrompt),
        stream: true,
      }
    : {
        ...buildChatCompletionsBody(model, prepared.options),
        messages: buildMessages(prepared.systemPrompt, userPrompt),
        stream: true,
      };

  const response = await fetchOpenAI(
    useResponsesAPI ? OPENAI_RESPONSES_URL : OPENAI_CHAT_COMPLETIONS_URL,
    apiKey,
    body,
    timeoutMs,
  );

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    const apiName = useResponsesAPI ? 'Responses' : 'Chat Completions';
    throw new Error(`OpenAI ${apiName} stream failed (${response.status}): ${errorText}`);
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
        const text = useResponsesAPI
          ? extractResponsesStreamDelta(event)
          : event.choices?.[0]?.delta?.content || '';
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
    reasoningEffort: prepared.options.reasoningEffort,
    clinicalSafety: prepared.clinicalSafety,
    clinicalRoute: prepared.clinicalRoute,
  };
}
