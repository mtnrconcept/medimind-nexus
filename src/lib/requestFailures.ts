/** Classify transport failures, never application/authorization failures. */
export function requestFailureStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return;
  const value = error as { status?: unknown; context?: { status?: unknown }; response?: { status?: unknown } };
  const status = value.context?.status ?? value.response?.status ?? value.status;
  return typeof status === 'number' && status > 0 ? status : undefined;
}

export function isTransientRequestFailure(error: unknown): boolean {
  const status = requestFailureStatus(error);
  if (status !== undefined) return [408, 425, 429, 500, 502, 503, 504].includes(status);
  if (!error || typeof error !== 'object') return false;
  const value = error as { name?: unknown; message?: unknown; code?: unknown };
  if (['FunctionsFetchError', 'FunctionsRelayError', 'TimeoutError'].includes(String(value.name))) return true;
  if (['ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH', 'ECONNREFUSED'].includes(String(value.code))) return true;
  return /failed to fetch|fetch failed|network(?:error| request failed| error)|load failed|timed?\s*out|timeout/i.test(String(value.message ?? ''));
}
