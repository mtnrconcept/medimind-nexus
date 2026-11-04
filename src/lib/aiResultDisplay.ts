import type { AIToolJob, AIToolResult, AIToolStatus } from './aiTransport';

export interface AIResultDisplay { text: string; structured: unknown[] }

export interface SystematicStepResult {
  substance_analyzed: string;
  entity_type?: string;
  pairs_count?: number;
  discoveries_count?: number;
  synthesis?: string;
  research_steps?: unknown[];
  full_analysis?: unknown[];
  entities_tested?: string[];
}
export interface SystematicRunResult {
  success: boolean;
  completed: boolean;
  run_id: string;
  total_substances: number;
  total_pairs: number;
  pairs_analyzed: number;
  discoveries_found: number;
  current_substance_index: number;
  steps: SystematicStepResult[];
  target_pathology?: string | null;
}

/** Derive the UI from a canonical snapshot so resuming never duplicates saved steps. */
export function describeSystematicRun(result: SystematicRunResult) {
  const steps = Array.isArray(result.steps) ? result.steps : [];
  return {
    discoveries: steps.filter(step => step.synthesis).map(step => ({
      substance: step.substance_analyzed,
      discoveries: typeof step.discoveries_count === 'number' ? step.discoveries_count : null,
      synthesis: step.synthesis,
      research_steps: step.research_steps,
      full_analysis: step.full_analysis,
      entities_tested: step.entities_tested,
    })),
    logs: steps.map((step, index) => ({
      timestamp: `Étape ${index + 1}`,
      step: step.substance_analyzed,
      detail: [typeof step.pairs_count === 'number' ? `${step.pairs_count} paires analysées` : 'Étape enregistrée',
        typeof step.discoveries_count === 'number' ? `${step.discoveries_count} découvertes signalées` : 'Nombre de découvertes non précisé'].join(' · '),
      type: 'result' as const,
    })),
  };
}

/** Recover saved stream frames even when a worker stopped before writing its final body. */
export class AIEventReplay {
  cursor = 0;
  private body = '';

  accept(status: AIToolStatus): AIToolJob {
    for (const event of [...(status.events ?? [])].sort((a, b) => a.seq - b.seq)) {
      if (event.seq <= this.cursor) continue;
      this.body += event.data;
      this.cursor = event.seq;
    }
    const result = status.job.result_payload;
    // The final server body is authoritative and already contains these frames.
    if (result?.body || !this.body) return status.job;
    return {
      ...status.job,
      result_payload: { httpStatus: result?.httpStatus ?? 200, contentType: 'text/event-stream', body: this.body },
    };
  }
}

/** Display saved output without interpreting it as instructions or treating progress as evidence. */
export function describeAIResult(result: AIToolResult): AIResultDisplay {
  if (result.contentType.includes('text/event-stream')) {
    const chunks: string[] = [];
    const structured: unknown[] = [];
    for (const frame of result.body.split(/\r?\n\r?\n/)) {
      const payload = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!payload || payload === '[DONE]') continue;
      try {
        const data = JSON.parse(payload);
        const text = data.choices?.[0]?.delta?.content
          ?? (data.type === 'text' ? data.content : undefined)
          ?? (data.type === 'response.output_text.delta' ? data.delta : undefined);
        if (typeof text === 'string') chunks.push(text);
        else if (!['step_update', 'progress', 'status', 'done', 'ping'].includes(data.type)) structured.push(data);
        else if (data.type === 'done' && Object.keys(data).length > 1) structured.push(data);
      } catch { structured.push(payload); }
    }
    return { text: chunks.join(''), structured };
  }
  if (result.contentType.includes('json')) {
    try {
      const data = JSON.parse(result.body);
      if (typeof data === 'string') return { text: data, structured: [] };
      const text = data?.content ?? data?.text ?? data?.output ?? data?.global_synthesis ?? data?.summary;
      return { text: typeof text === 'string' ? text : '', structured: [data] };
    } catch { return { text: result.body, structured: [] }; }
  }
  return { text: result.body, structured: [] };
}
