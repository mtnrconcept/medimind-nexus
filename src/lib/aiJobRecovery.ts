export interface AIJobRecoveryScope { userId: string; key: string }

/** Only opaque references are persisted: no prompts, results, files or credentials. */
export interface AIJobReference {
  functionName: string;
  id?: string;
  requestId?: string;
  createdAt: number;
  completed?: boolean;
}

const PREFIX = 'medicore:ai-reference:v1:';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const generations = new Map<string, number>();

function storage(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return; }
}

export async function hashAIReference(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

const userPrefix = (userId: string) => PREFIX + encodeURIComponent(userId) + ':';
async function storageKey(functionName: string, scope: AIJobRecoveryScope) {
  if (!scope.userId || !scope.key) return;
  return userPrefix(scope.userId) + functionName + ':' + await hashAIReference(scope.key);
}

export async function readAIJobReference(functionName: string, scope: AIJobRecoveryScope): Promise<AIJobReference | null> {
  const generation = generations.get(scope.userId);
  try {
    const key = await storageKey(functionName, scope);
    if (!key || generation !== generations.get(scope.userId)) return null;
    const raw = storage()?.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as AIJobReference;
    if (value.functionName !== functionName || typeof value.createdAt !== 'number'
      || Date.now() - value.createdAt > MAX_AGE_MS
      || (typeof value.id !== 'string' && typeof value.requestId !== 'string')) return null;
    return value;
  } catch { return null; }
}

export async function saveAIJobReference(reference: AIJobReference, scope: AIJobRecoveryScope): Promise<void> {
  const generation = generations.get(scope.userId);
  try {
    const key = await storageKey(reference.functionName, scope);
    if (!key || generation !== generations.get(scope.userId)) return;
    // Explicit allowlist prevents accidental persistence of a provider response or JWT.
    storage()?.setItem(key, JSON.stringify({
      functionName: reference.functionName, id: reference.id, requestId: reference.requestId,
      createdAt: reference.createdAt, completed: reference.completed,
    } satisfies AIJobReference));
  } catch { /* Storage may be disabled; authenticated server history remains available. */ }
}

export function clearAIJobReferences(userId: string): void {
  generations.set(userId, (generations.get(userId) ?? 0) + 1);
  try {
    const target = storage();
    if (!target) return;
    const prefix = userPrefix(userId);
    for (let index = target.length - 1; index >= 0; index -= 1) {
      const key = target.key(index);
      if (key?.startsWith(prefix)) target.removeItem(key);
    }
  } catch { /* Signing out must still succeed when storage is unavailable. */ }
}
