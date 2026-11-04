import { AIJobObservation, AI_INTERACTIVE_WAIT_MS, aiObservationAbortError, waitForAIRequest } from './aiJobObservation';
import { saveAIJobReference, type AIJobRecoveryScope } from './aiJobRecovery';
import { isTransientRequestFailure } from './requestFailures';

type InvokeAI = (functionName: string, body: unknown) => Promise<{ data: any; error: any }>;

export type AIJobProgress = { status: string; progress: number; message?: string | null };

export type ResolveAIJobOptions = {
  maxWaitMs?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  statusRequestTimeoutMs?: number;
  onProgress?: (progress: AIJobProgress) => void;
  signal?: AbortSignal;
  recovery?: AIJobRecoveryScope;
};

export async function resolveAIJob<T>(
  invokeAI: InvokeAI,
  functionName: string,
  initialData: any,
  options: ResolveAIJobOptions = {},
): Promise<T> {
  const jobId = initialData?.job?.id;
  const jobToken = initialData?.job?.token;
  if (!jobId || !jobToken) return initialData as T;

  if (options.recovery) {
    await saveAIJobReference({ functionName, id: jobId, createdAt: Date.now() }, options.recovery);
  }
  const observation = new AIJobObservation(options.maxWaitMs ?? AI_INTERACTIVE_WAIT_MS);
  const maxDelayMs = options.maxDelayMs ?? 5_000;
  let delayMs = options.initialDelayMs ?? 1_200;
  let retries = 0;
  let progress = initialData.job.progress_percentage ?? initialData.job.progress ?? 0;
  options.onProgress?.({ status: initialData.job.status ?? 'queued', progress, message: initialData.job.progress_message ?? initialData.job.message });

  try {
    while (true) {
      if (options.signal?.aborted) throw aiObservationAbortError();
      observation.assertBudget();
      await observation.wait(delayMs, options.signal);
      observation.assertBudget();

      let data: any;
      try {
        const response = await waitForAIRequest(
          () => invokeAI(functionName, { action: 'status', jobId, jobToken }),
          options.signal, options.statusRequestTimeoutMs,
        );
        if (response.error) throw response.error;
        data = response.data;
        retries = 0;
      } catch (error) {
        if (options.signal?.aborted || !isTransientRequestFailure(error)) throw error;
        retries += 1;
        options.onProgress?.({ status: 'reconnecting', progress, message: 'Connexion momentanément indisponible. Le suivi reprendra automatiquement ; le traitement n’a pas été annulé.' });
        delayMs = Math.min(maxDelayMs * 3, Math.max(options.initialDelayMs ?? 1_200, delayMs) * Math.min(2 ** Math.min(retries, 4), 8));
        continue;
      }

      const job = data?.job;
      if (!job || typeof job.status !== 'string') throw new Error('AI job status response is invalid');
      progress = job.progress_percentage ?? job.progress ?? progress;
      options.onProgress?.({ status: job.status, progress, message: job.progress_message ?? job.message });
      if (job.status === 'completed') return (job.result_payload ?? data) as T;
      if (['failed', 'cancelled', 'canceled'].includes(job.status)) throw new Error(job.error_message || 'AI job failed');
      delayMs = Math.min((options.initialDelayMs ?? 1_200) + 600, maxDelayMs);
    }
  } finally {
    observation.dispose();
  }
}
