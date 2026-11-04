export const AI_INTERACTIVE_WAIT_MS = 60 * 60 * 1000;

export function aiObservationAbortError(): Error {
  const error = new Error('Le suivi a été détaché. Le traitement serveur n’a pas été annulé.');
  error.name = 'AbortError';
  return error;
}

export class AIObservationTimeoutError extends Error {
  readonly code = 'AI_JOB_OBSERVATION_TIMEOUT';
  readonly recoverable = true;
  constructor() {
    super('Le suivi interactif est en pause. Le traitement n’a pas été annulé ; son résultat reste accessible dans Activité IA.');
    this.name = 'AIObservationTimeoutError';
  }
}

/** A UI observation budget. Hidden, suspended and offline time is excluded. */
export class AIJobObservation {
  private elapsed = 0;
  private lastTick = Date.now();
  private pageHidden = false;
  private active = this.available();
  private listeners = new Set<() => void>();
  private cleanups: Array<() => void> = [];

  constructor(readonly maxWaitMs = AI_INTERACTIVE_WAIT_MS) {
    const bind = (target: EventTarget | undefined, name: string) => {
      if (!target?.addEventListener) return;
      const changed = () => {
        this.tick();
        if (name === 'pagehide' || name === 'freeze') this.pageHidden = true;
        if (name === 'pageshow' || name === 'resume') this.pageHidden = false;
        this.active = this.available();
        this.listeners.forEach(listener => listener());
      };
      target.addEventListener(name, changed);
      this.cleanups.push(() => target.removeEventListener(name, changed));
    };
    const browserWindow = typeof window === 'undefined' ? undefined : window;
    const browserDocument = typeof document === 'undefined' ? undefined : document;
    for (const event of ['online', 'offline', 'pageshow', 'pagehide']) bind(browserWindow, event);
    for (const event of ['visibilitychange', 'freeze', 'resume']) bind(browserDocument, event);
  }

  private available() {
    return !this.pageHidden
      && (typeof document === 'undefined' || document.visibilityState !== 'hidden')
      && (typeof navigator === 'undefined' || navigator.onLine !== false);
  }

  private tick() {
    const now = Date.now();
    if (this.active) this.elapsed += Math.max(0, now - this.lastTick);
    this.lastTick = now;
  }

  assertBudget() {
    this.tick();
    this.active = this.available();
    if (this.elapsed >= this.maxWaitMs) throw new AIObservationTimeoutError();
  }

  /** Resume immediately after returning online/visible, without reloading a page. */
  wait(delayMs: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        clearTimeout(timer);
        this.listeners.delete(changed);
        signal?.removeEventListener('abort', aborted);
      };
      const finish = () => { cleanup(); resolve(); };
      const aborted = () => { cleanup(); reject(aiObservationAbortError()); };
      const changed = () => {
        clearTimeout(timer);
        timer = undefined;
        if (this.available()) finish();
      };
      if (signal?.aborted) { aborted(); return; }
      signal?.addEventListener('abort', aborted, { once: true });
      this.listeners.add(changed);
      if (this.available()) timer = setTimeout(finish, Math.max(0, delayMs));
    });
  }

  dispose() {
    this.cleanups.forEach(cleanup => cleanup());
    this.cleanups = [];
    this.listeners.clear();
  }
}

/** Detaching a UI must not abort a request already accepted by the server. */
export function waitForAIRequest<T>(request: () => Promise<T>, signal?: AbortSignal, timeoutMs: number | null = 90_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); };
    const aborted = () => { cleanup(); reject(aiObservationAbortError()); };
    const timer = timeoutMs === null ? undefined : setTimeout(() => {
      cleanup();
      const error = new Error('Le serveur de suivi met trop de temps à répondre.');
      error.name = 'TimeoutError';
      reject(error);
    }, timeoutMs);
    if (signal?.aborted) { aborted(); return; }
    signal?.addEventListener('abort', aborted, { once: true });
    Promise.resolve().then(request).then(
      value => { cleanup(); resolve(value); },
      error => { cleanup(); reject(error); },
    );
  });
}
