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
import {
  BACKGROUND_AI_POLL_TIMEOUT_MS,
  BACKGROUND_AI_START_TIMEOUT_MS,
  resolveAIOutputTokens,
  resolveDirectAITimeout,
} from './ai-policy.ts';
import {
  buildOpenAIWebSearchRequest, extractOpenAIWebProvenance,
  type AIWebSearchOptions, type AIWebSearchProvenance,
} from './openai-web-search.ts';
export type { AIWebSearchOptions, AIWebSource, AIWebSearchProvenance } from './openai-web-search.ts';

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

export interface AIResponse extends Partial<AIWebSearchProvenance> {
  text: string;
  provider: 'openai' | 'none';
  model: string;
  reasoningEffort?: ClinicalReasoningEffort;
  clinicalSafety?: ClinicalRiskAssessment;
  clinicalRoute?: AIClinicalRouteMetadata;
}

export interface AIBackgroundResponse {
  id: string;
  status: string;
  provider: 'openai';
  model: string;
  reasoningEffort?: ClinicalReasoningEffort;
  clinicalSafety?: ClinicalRiskAssessment;
  clinicalRoute?: AIClinicalRouteMetadata;
  maxOutputTokens?: number;
}

export interface AIBackgroundPollResult extends AIBackgroundResponse, Partial<AIWebSearchProvenance> {
  text?: string;
  partialText?: string;
  incompleteReason?: string;
  errorMessage?: string;
  errorCode?: string;
}

/** A partial answer must remain distinguishable from a usable final result. */
export class AIIncompleteResponseError extends Error {
  readonly reason: string;
  readonly status: string;
  readonly responseId?: string;
  readonly partialText: string;
  readonly maxOutputTokens?: number;
  readonly resumable: boolean;

  constructor(reason: string, details: {
    responseId?: string;
    partialText?: string;
    maxOutputTokens?: number;
    status?: string;
  } = {}) {
    super(`OpenAI response is incomplete (reason: ${reason})`);
    this.name = 'AIIncompleteResponseError';
    this.reason = reason;
    this.status = details.status ?? 'incomplete';
    this.responseId = details.responseId;
    this.partialText = details.partialText ?? '';
    // Legacy callers log Error objects. Keep recoverable clinical text out of
    // ordinary error enumeration/inspection while retaining explicit access.
    Object.defineProperty(this, 'partialText', { enumerable: false });
    this.maxOutputTokens = details.maxOutputTokens;
    // A retry must be decided and persisted by the job owner, never by the HTTP client.
    this.resumable = reason === 'max_output_tokens';
  }
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
  /** Opt-in deadline for background receipt/status HTTP calls, not model execution. */
  backgroundRequestTimeoutMs?: number;
  model?: string;
  forceModel?: boolean;
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: ClinicalReasoningEffort;
  reasoningMode?: 'standard' | 'pro';
  responseFormat?: Record<string, unknown>;
  webSearch?: AIWebSearchOptions;
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

const DEFAULT_OPENAI_MODEL = 'gpt-6.1-sol';
const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
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
  // The clinical router (or explicit caller) owns model selection. OPENAI_MODEL is
  // only a default, never an override of a critical clinical safety decision.
  const requested = options.model || envModel;
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
  return resolveDirectAITimeout(options.timeoutMs, Deno.env.get('OPENAI_TIMEOUT_MS'));
}

function strongerReasoningEffort(
  requested: ClinicalReasoningEffort | undefined,
  routed: ClinicalReasoningEffort,
): ClinicalReasoningEffort {
  if (!requested) {
    return routed;
  }

  const order: ClinicalReasoningEffort[] = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];
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
    // System instructions can contain examples of dangerous drugs or conditions;
    // examples are not patient observations and must not alter patient risk.
    freeText: [
      options.clinicalInput?.freeText,
      options.clinicalContextText,
      userPromptToPlainText(userPrompt),
    ].filter(Boolean).join('\n\n'),
  });
  const route = selectClinicalModel({
    task: profile.task,
    riskAssessment: clinicalSafety,
    elementCount: profile.elementCount,
    hasExternalEvidence: options.hasExternalEvidence ?? profile.hasExternalEvidence,
  }, getClinicalModelEnv(getEnv));
  const selectedModel = options.forceModel ? options.model || route.model : route.model;
  const supportsMaxPro = /^gpt-(?:6(?:\.|-|$)|5\.6(?:\.|-|$))/i.test(selectedModel);
  // This explicit task collects pair evidence for later review. Inherited global
  // synthesis settings must not silently turn every pair into a max/pro analysis.
  const isPairResearch = options.clinicalTask === 'pair_relation_research';
  const wantedEffort = isPairResearch ? 'none' : strongerReasoningEffort(options.reasoningEffort, route.reasoningEffort);
  const supportedEffort = wantedEffort === 'max' && !supportsMaxPro ? 'xhigh' : wantedEffort;
  const routedOptions: AICallOptions = {
    ...options,
    model: selectedModel,
    reasoningEffort: supportedEffort,
    reasoningMode: !isPairResearch && supportsMaxPro && (route.reasoningMode === 'pro' || options.reasoningMode === 'pro') ? 'pro' : undefined,
    maxTokens: resolveAIOutputTokens({ ...options, reasoningEffort: supportedEffort }),
    // Routing controls clinical capability; the shared transport owns its deadline.
    // Preserve an explicitly shorter caller deadline, otherwise allow 120 seconds.
    timeoutMs: options.timeoutMs,
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

async function withOpenAIRequest<T>(
  url: string,
  apiKey: string,
  request: { method: 'POST' | 'GET'; body?: Record<string, unknown> },
  timeoutMs: number,
  consume: (response: Response, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const startedAt = Date.now();
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutError = new Error(`OpenAI ${request.method} request timed out after ${timeoutMs}ms`);
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    // The deadline covers headers, JSON/SSE body reads, and awaited chunk consumers.
    // Retrying a creation request here could pay for the same generation twice.
    return await Promise.race([deadline, (async () => {
      const response = await fetch(url, {
        method: request.method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        signal: controller.signal,
      });
      console.log(`[AI] OpenAI ${request.method} ${response.status} in ${Date.now() - startedAt}ms`);
      return await consume(response, controller.signal);
    })()]);
  } catch (error) {
    if (timedOut) throw timeoutError;
    throw error;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

export class OpenAIRequestError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;
  readonly code?: string;
  constructor(response: Response, label: string, body: string) {
    super(`OpenAI ${label} request failed (${response.status}): ${body}`);
    this.status = response.status;
    const retry = response.headers.get('retry-after');
    if (retry) {
      const delay = /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
      if (Number.isFinite(delay) && delay >= 0) this.retryAfterMs = delay;
    }
    try {
      const code = JSON.parse(body)?.error?.code;
      if (typeof code === 'string' && /^[a-zA-Z0-9_.-]{1,120}$/.test(code)) this.code = code;
    } catch { /* The caller must never persist the raw error body. */ }
  }
}

async function readOpenAIJson(response: Response, label: string): Promise<Record<string, unknown>> {
  if (!response.ok) {
    throw new OpenAIRequestError(response, label, await response.text());
  }
  const data: unknown = await response.json();
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`OpenAI ${label} returned an invalid response`);
  }
  return data as Record<string, unknown>;
}

function hasReasoningEffort(options: AICallOptions): boolean {
  return Boolean(options.reasoningEffort && options.reasoningEffort !== 'none');
}

function shouldUseResponsesAPI(model: string, options: AICallOptions): boolean {
  return Boolean(options.webSearch) || /^gpt-[56](?:\.|-|$)/i.test(model.trim()) || hasReasoningEffort(options);
}

function supportsResponsesTemperature(model: string): boolean {
  return !/^gpt-[56](?:\.|-|$)/i.test(model.trim());
}

function buildChatCompletionsBody(model: string, options: AICallOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    max_completion_tokens: resolveAIOutputTokens(options),
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
    max_output_tokens: resolveAIOutputTokens(options),
  };

  if (options.temperature !== undefined && supportsResponsesTemperature(model)) {
    body.temperature = options.temperature;
  }

  if (hasReasoningEffort(options)) {
    body.reasoning = {
      effort: options.reasoningEffort,
      ...(options.reasoningMode === 'pro' && /^gpt-(?:6(?:\.|-|$)|5\.6(?:\.|-|$))/i.test(model) ? { mode: 'pro' } : {}),
    };
  }

  if (options.responseFormat) {
    body.text = { format: options.responseFormat };
  }

  if (options.webSearch) {
    Object.assign(body, buildOpenAIWebSearchRequest(options.webSearch));
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

function extractResponsesError(data: Record<string, unknown>): string | undefined {
  const error = data.error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    return JSON.stringify(error);
  }

  const incompleteDetails = data.incomplete_details;
  if (incompleteDetails && typeof incompleteDetails === 'object') {
    return JSON.stringify(incompleteDetails);
  }

  return undefined;
}

function extractIncompleteReason(data: Record<string, unknown>): string | undefined {
  const details = data.incomplete_details as { reason?: unknown } | null;
  return details && typeof details.reason === 'string' ? details.reason : undefined;
}

function extractOutputBudget(data: Record<string, unknown>, fallback?: number): number | undefined {
  return typeof data.max_output_tokens === 'number' && Number.isFinite(data.max_output_tokens) && data.max_output_tokens > 0
    ? Math.floor(data.max_output_tokens)
    : fallback;
}

function incompleteResponse(
  data: Record<string, unknown>,
  fallbackText = '',
  fallbackBudget?: number,
): AIIncompleteResponseError {
  return new AIIncompleteResponseError(extractIncompleteReason(data) ?? 'unknown', {
    responseId: typeof data.id === 'string' ? data.id : undefined,
    partialText: extractResponsesText(data) || fallbackText,
    maxOutputTokens: extractOutputBudget(data, fallbackBudget),
  });
}

function requireCompletedResponse(data: Record<string, unknown>, fallbackText = '', fallbackBudget?: number): string {
  if (data.status === 'incomplete') throw incompleteResponse(data, fallbackText, fallbackBudget);
  if (data.error || (typeof data.status === 'string' && data.status !== 'completed')) {
    throw new Error(`OpenAI response ${data.status ?? 'failed'}: ${extractResponsesError(data) ?? 'generation did not complete'}`);
  }
  const text = extractResponsesText(data) || fallbackText;
  if (!text.trim()) throw new Error('OpenAI returned an empty response');
  return text;
}

type ChatChoice = { message?: { content?: string }; delta?: { content?: string }; finish_reason?: string | null };

function firstChatChoice(data: Record<string, unknown>): ChatChoice | undefined {
  return Array.isArray(data.choices) ? data.choices[0] as ChatChoice | undefined : undefined;
}

function requireCompletedChat(data: Record<string, unknown>, fallbackBudget: number): string {
  const choice = firstChatChoice(data);
  const text = choice?.message?.content ?? '';
  if (choice?.finish_reason && choice.finish_reason !== 'stop') {
    throw new AIIncompleteResponseError(choice.finish_reason === 'length' ? 'max_output_tokens' : choice.finish_reason, {
      responseId: typeof data.id === 'string' ? data.id : undefined, partialText: text, maxOutputTokens: fallbackBudget,
    });
  }
  if (data.error) throw new Error(`OpenAI response failed: ${extractResponsesError(data) ?? 'generation did not complete'}`);
  if (!text.trim()) throw new Error('OpenAI returned an empty response');
  return text;
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

  const data = await withOpenAIRequest(
    useResponsesAPI ? OPENAI_RESPONSES_URL : OPENAI_CHAT_COMPLETIONS_URL,
    apiKey,
    { method: 'POST', body },
    timeoutMs,
    response => readOpenAIJson(response, useResponsesAPI ? 'Responses' : 'Chat Completions'),
  );
  const budget = resolveAIOutputTokens(prepared.options);
  const text = useResponsesAPI
    ? requireCompletedResponse(data, '', budget)
    : requireCompletedChat(data, budget);

  return {
    text,
    provider: 'openai',
    model,
    reasoningEffort: prepared.options.reasoningEffort,
    clinicalSafety: prepared.clinicalSafety,
    clinicalRoute: prepared.clinicalRoute,
    ...(prepared.options.webSearch
      ? extractOpenAIWebProvenance(data, prepared.options.webSearch.allowedDomains) : {}),
  };
}

/**
 * Start a long-running Responses API request in OpenAI background mode.
 * The caller should persist the returned response id and poll it later.
 */
export async function startBackgroundAI(
  systemPrompt: string,
  userPrompt: string | AIMessage[],
  options: AICallOptions = {},
): Promise<AIBackgroundResponse> {
  const prepared = prepareClinicalAICall(systemPrompt, userPrompt, options);
  const { apiKey, model } = getOpenAIConfig(prepared.options);
  const body = {
    ...buildResponsesBody(model, prepared.options),
    input: buildResponsesInput(prepared.systemPrompt, userPrompt),
    background: true,
    store: true,
  };

  const data = await withOpenAIRequest(
    OPENAI_RESPONSES_URL,
    apiKey,
    { method: 'POST', body },
    Math.min(BACKGROUND_AI_START_TIMEOUT_MS, resolveDirectAITimeout(options.backgroundRequestTimeoutMs, String(BACKGROUND_AI_START_TIMEOUT_MS))),
    response => readOpenAIJson(response, 'background'),
  );
  const id = typeof data.id === 'string' ? data.id : '';
  const status = typeof data.status === 'string' ? data.status : 'unknown';

  if (!id) {
    throw new Error('OpenAI background response did not include an id');
  }

  return {
    id,
    status,
    provider: 'openai',
    model,
    reasoningEffort: prepared.options.reasoningEffort,
    clinicalSafety: prepared.clinicalSafety,
    clinicalRoute: prepared.clinicalRoute,
    maxOutputTokens: extractOutputBudget(data, resolveAIOutputTokens(prepared.options)),
  };
}

export async function retrieveBackgroundAI(
  responseId: string,
  options: AICallOptions = {},
): Promise<AIBackgroundPollResult> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const data = await withOpenAIRequest(
    `${OPENAI_RESPONSES_URL}/${encodeURIComponent(responseId)}${options.webSearch
      ? '?' + new URLSearchParams({ 'include[]': 'web_search_call.action.sources' }).toString() : ''}`,
    apiKey,
    { method: 'GET' },
    Math.min(BACKGROUND_AI_POLL_TIMEOUT_MS, resolveDirectAITimeout(options.backgroundRequestTimeoutMs, String(BACKGROUND_AI_POLL_TIMEOUT_MS))),
    response => readOpenAIJson(response, 'background retrieve'),
  );
  const status = typeof data.status === 'string' ? data.status : 'unknown';
  const model = typeof data.model === 'string'
    ? data.model
    : (options.model || Deno.env.get('OPENAI_MODEL') || DEFAULT_OPENAI_MODEL);
  const text = status === 'completed' ? requireCompletedResponse(data) : undefined;

  return {
    id: responseId,
    status,
    provider: 'openai',
    model,
    reasoningEffort: options.reasoningEffort,
    text,
    partialText: status === 'incomplete' ? extractResponsesText(data) : undefined,
    incompleteReason: extractIncompleteReason(data),
    maxOutputTokens: extractOutputBudget(data, options.maxTokens),
    errorMessage: extractResponsesError(data),
    errorCode: typeof (data.error as Record<string, unknown> | undefined)?.code === 'string' &&
      /^[a-zA-Z0-9_.-]{1,120}$/.test(String((data.error as Record<string, unknown>).code))
      ? String((data.error as Record<string, unknown>).code) : undefined,
    ...extractOpenAIWebProvenance(data, options.webSearch?.allowedDomains),
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

  const data = await withOpenAIRequest(OPENAI_EMBEDDINGS_URL, apiKey, { method: 'POST', body }, timeoutMs,
    response => readOpenAIJson(response, 'Embeddings'));
  const rows = Array.isArray(data.data) ? data.data as Array<{ index?: number | string; embedding?: unknown }> : [];
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

async function consumeOpenAIStream(
  response: Response,
  signal: AbortSignal,
  useResponsesAPI: boolean,
  onChunk: (text: string) => void | Promise<void>,
  maxOutputTokens: number,
  onCompleted?: (response: Record<string, unknown>) => void,
): Promise<string> {
  if (!response.ok || !response.body) {
    const apiName = useResponsesAPI ? 'Responses' : 'Chat Completions';
    throw new Error(`OpenAI ${apiName} stream failed (${response.status}): ${await response.text()}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  let responseId: string | undefined;
  let terminal = false;
  const abortRead = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', abortRead, { once: true });

  const acceptFrame = async (frame: string) => {
    const payload = frame.split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart()).join('\n').trim();
    if (!payload || payload === '[DONE]') return;
    // A complete malformed frame is an interrupted stream, not ignorable output.
    const parsed: unknown = JSON.parse(payload);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('OpenAI stream returned an invalid event');
    }
    const event = parsed as Record<string, unknown>;
    if (useResponsesAPI) {
      const snapshot = event.response && typeof event.response === 'object'
        ? event.response as Record<string, unknown> : {};
      if (typeof snapshot.id === 'string') responseId = snapshot.id;
      if (event.type === 'response.incomplete') {
        throw incompleteResponse({ id: responseId, ...snapshot }, fullText, maxOutputTokens);
      }
      if (event.type === 'response.failed' || event.type === 'response.cancelled') {
        throw new Error(`OpenAI response ${snapshot.status ?? event.type}: ${extractResponsesError(snapshot) ?? 'generation did not complete'}`);
      }
      if (event.type === 'error' || event.type === 'response.error') {
        throw new Error(`OpenAI stream failed: ${typeof event.message === 'string' ? event.message : extractResponsesError(event) ?? 'provider error'}`);
      }
      if (event.type === 'response.completed') {
        const finalText = requireCompletedResponse(snapshot, fullText, maxOutputTokens);
        onCompleted?.(snapshot);
        if (!fullText) await onChunk(finalText);
        fullText = finalText;
        terminal = true;
      } else if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
        fullText += event.delta;
        await onChunk(event.delta);
      }
      // In particular, output_text.done repeats the complete text and is not a delta.
      // Reasoning summaries, refusals and tool-argument deltas are not answer text.
    } else {
      if (typeof event.id === 'string') responseId = event.id;
      if (event.error) throw new Error(`OpenAI stream failed: ${extractResponsesError(event) ?? 'provider error'}`);
      const choice = firstChatChoice(event);
      if (typeof choice?.delta?.content === 'string') {
        fullText += choice.delta.content;
        await onChunk(choice.delta.content);
      }
      if (choice?.finish_reason === 'stop') terminal = true;
      else if (choice?.finish_reason) {
        throw new AIIncompleteResponseError(choice.finish_reason === 'length' ? 'max_output_tokens' : choice.finish_reason, {
          responseId, partialText: fullText, maxOutputTokens,
        });
      }
    }
  };

  const consumeFrames = async () => {
    let boundary: RegExpExecArray | null;
    while (!terminal && (boundary = /\r?\n\r?\n/.exec(buffer))) {
      const frame = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
      await acceptFrame(frame);
    }
  };

  try {
    while (!terminal && !signal.aborted) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        await consumeFrames();
        if (!terminal && buffer.trim()) await acceptFrame(buffer);
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      await consumeFrames();
    }
    if (!terminal) {
      throw new AIIncompleteResponseError('stream_ended', { responseId, partialText: fullText, maxOutputTokens });
    }
    if (!fullText.trim()) throw new Error('OpenAI returned an empty response');
    return fullText;
  } finally {
    signal.removeEventListener('abort', abortRead);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
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

  let webProvenance: AIWebSearchProvenance | undefined;
  const fullText = await withOpenAIRequest(
    useResponsesAPI ? OPENAI_RESPONSES_URL : OPENAI_CHAT_COMPLETIONS_URL,
    apiKey,
    { method: 'POST', body },
    timeoutMs,
    (response, signal) => consumeOpenAIStream(
      response, signal, useResponsesAPI, onChunk, resolveAIOutputTokens(prepared.options),
      prepared.options.webSearch ? snapshot => {
        webProvenance = extractOpenAIWebProvenance(snapshot, prepared.options.webSearch?.allowedDomains);
      } : undefined,
    ),
  );

  return {
    text: fullText,
    provider: 'openai',
    model,
    reasoningEffort: prepared.options.reasoningEffort,
    clinicalSafety: prepared.clinicalSafety,
    clinicalRoute: prepared.clinicalRoute,
    ...webProvenance,
  };
}
