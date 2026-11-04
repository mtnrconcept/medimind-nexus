export const TRANSPORT_MODE = 'tool_transport';
export const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
// SSE framing is much larger than the generated text. Allow the increased model
// budgets without retaining an unbounded response in the Edge worker's memory.
export const MAX_RESULT_BYTES = 16 * 1024 * 1024;
export const RESULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const WORKER_STALE_MS = 7 * 60 * 1000;
// This project is on Supabase Free (150s worker wall time). Leave time to persist
// a terminal status; multi-step/native jobs relay between separate invocations.
export const TOOL_WORKER_BUDGET_MS = 130_000;

export type ToolResult = { httpStatus: number; contentType: string; body: string };
export type ToolJob = {
  id: string;
  public_token: string;
  requested_by: string;
  function_name: string;
  analysis_mode: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress_percentage: number;
  progress_message: string | null;
  error_message: string | null;
  request_payload: { requestHash?: string; scopeKey?: string; contentType?: string; [key: string]: unknown };
  result_payload: ToolResult | Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
};
export type ToolEvent = { seq: number; data: string };

export function publicJob(job: ToolJob, includeResult = true, now = Date.now()) {
  return {
    id: job.id, function_name: job.function_name, status: job.status,
    progress_percentage: job.progress_percentage, progress_message: job.progress_message,
    error_message: job.error_message, created_at: job.created_at, updated_at: job.updated_at,
    expires_at: job.expires_at, scopeKey: job.request_payload.scopeKey || '', analysis_mode: job.analysis_mode,
    ...(includeResult ? { result_payload: job.analysis_mode === TRANSPORT_MODE ? job.result_payload : job.result_payload && {
      httpStatus: 200, contentType: 'application/json', body: JSON.stringify(job.result_payload),
    } } : {}),
    stalled: ['queued', 'processing'].includes(job.status) && now - Date.parse(job.updated_at) > WORKER_STALE_MS,
  };
}

export const isUUID = (value: string | null): value is string =>
  Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));

/** Emits complete SSE frames, including split UTF-8/newline boundaries. */
export class SSEFrames {
  private buffer = '';
  complete = false;
  failed = false;

  push(text: string): string[] {
    this.buffer += text;
    const frames: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(this.buffer))) {
      const end = match.index + match[0].length;
      const frame = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end);
      this.inspect(frame);
      frames.push(frame);
    }
    return frames;
  }

  finish(): string[] {
    if (!this.buffer.trim()) { this.buffer = ''; return []; }
    // A stream may end immediately after its final data line, without a blank line.
    const frame = this.buffer + '\n\n';
    this.buffer = '';
    this.inspect(frame);
    return [frame];
  }

  private inspect(frame: string) {
    const lines = frame.split(/\r?\n/);
    const eventName = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n').trim();
    if (!data) return;
    if (data === '[DONE]') { this.complete = true; return; }
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(data); } catch { this.failed = true; return; }
    const kind = eventName || payload.type;
    if (kind === 'done' || kind === 'complete' || kind === 'completed') this.complete = true;
    if (kind === 'error' || payload.error) this.failed = true;
  }
}
