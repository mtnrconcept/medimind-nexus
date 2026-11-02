export function outputBudget(initial: number, retry: boolean): number {
  // The clinical router may already reserve 25,000 tokens on the first attempt.
  return retry ? 32_000 : initial;
}

export function isOutputLimit(status: string, details?: string): boolean {
  if (status !== 'incomplete' || !details) return false;
  try {
    return JSON.parse(details)?.reason === 'max_output_tokens';
  } catch {
    return false;
  }
}
