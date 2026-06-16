type InvokeAI = (functionName: string, body: unknown) => Promise<{ data: any; error: any }>;

export type AIJobProgress = {
  status: string;
  progress: number;
  message?: string | null;
};

type ResolveAIJobOptions = {
  maxWaitMs?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  onProgress?: (progress: AIJobProgress) => void;
  signal?: AbortSignal;
};

function createAbortError(): Error {
  const error = new Error('AI job polling aborted');
  error.name = 'AbortError';
  return error;
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) {
    reject(createAbortError());
    return;
  }

  const timeout = window.setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, ms);

  const onAbort = () => {
    window.clearTimeout(timeout);
    reject(createAbortError());
  };

  signal?.addEventListener('abort', onAbort, { once: true });
});

export async function resolveAIJob<T>(
  invokeAI: InvokeAI,
  functionName: string,
  initialData: any,
  options: ResolveAIJobOptions = {},
): Promise<T> {
  const jobId = initialData?.job?.id;
  const jobToken = initialData?.job?.token;

  if (!jobId || !jobToken) {
    return initialData as T;
  }

  const maxWaitMs = options.maxWaitMs ?? 1_200_000;
  const maxDelayMs = options.maxDelayMs ?? 5_000;
  const startedAt = Date.now();
  let delayMs = options.initialDelayMs ?? 1_200;

  options.onProgress?.({
    status: initialData.job.status ?? 'queued',
    progress: initialData.job.progress ?? 0,
    message: initialData.job.message,
  });

  while (Date.now() - startedAt < maxWaitMs) {
    if (options.signal?.aborted) {
      throw createAbortError();
    }

    await sleep(delayMs, options.signal);

    const { data, error } = await invokeAI(functionName, {
      action: 'status',
      jobId,
      jobToken,
    });

    if (error) {
      throw error;
    }

    const job = data?.job;
    if (!job) {
      throw new Error('AI job status response is invalid');
    }

    options.onProgress?.({
      status: job.status,
      progress: job.progress_percentage ?? 0,
      message: job.progress_message,
    });

    if (job.status === 'completed') {
      return (job.result_payload ?? data) as T;
    }

    if (job.status === 'failed') {
      throw new Error(job.error_message || 'AI job failed');
    }

    delayMs = Math.min(delayMs + 600, maxDelayMs);
  }

  throw new Error('AI job is still running after the interactive wait budget');
}
