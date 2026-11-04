import type { ClinicalReasoningEffort } from './clinical-brain.ts';

// Output limits include the model's reasoning, not only its visible answer.
// The configured GPT-5/6 models support up to 128,000 output tokens.
export const DEFAULT_AI_OUTPUT_TOKENS = 16_384;
export const MAX_AI_OUTPUT_TOKENS = 128_000;

// Keep individual foreground requests below Supabase's 150-second idle limit.
// Long generations run through background responses and durable job monitoring.
export const MAX_DIRECT_AI_TIMEOUT_MS = 120_000;
export const BACKGROUND_AI_START_TIMEOUT_MS = 45_000;
export const BACKGROUND_AI_POLL_TIMEOUT_MS = 30_000;

export function resolveAIOutputTokens(options: {
  maxTokens?: number;
  reasoningEffort?: ClinicalReasoningEffort;
} = {}): number {
  const floor = options.reasoningEffort === 'max' || options.reasoningEffort === 'xhigh'
    ? 65_536
    : options.reasoningEffort === 'high' || options.reasoningEffort === 'medium'
      ? 32_768
      : DEFAULT_AI_OUTPUT_TOKENS;
  const requested = Number.isFinite(options.maxTokens) && (options.maxTokens ?? 0) > 0
    ? Math.floor(options.maxTokens!)
    : floor;
  return Math.min(MAX_AI_OUTPUT_TOKENS, Math.max(floor, requested));
}

export function resolveDirectAITimeout(requested?: number, configured?: string): number {
  const value = requested ?? Number(configured);
  return Number.isFinite(value) && value > 0
    ? Math.min(MAX_DIRECT_AI_TIMEOUT_MS, Math.max(1, Math.floor(value)))
    : MAX_DIRECT_AI_TIMEOUT_MS;
}
