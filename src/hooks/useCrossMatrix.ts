import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isTransientRequestFailure } from '@/lib/requestFailures';
import type { SelectedElement } from '../../supabase/functions/cross-data-analyzer/analysis-utils';

export interface MatrixJob<T> {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  stalled: boolean;
  updated_at: string;
  progress_message: string;
  progress_percentage: number;
  error_message: string | null;
  selection: Record<string, unknown>;
  result_payload: { analysis: T; elements: SelectedElement[]; cells: Record<string, unknown[]> };
}

export function useCrossMatrix<T>(patientId: string | undefined, enabled: boolean) {
  const [job, setJob] = useState<MatrixJob<T> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const request = useCallback(async (action: string, body: object = {}) => {
    const { data, error: failure } = await supabase.functions.invoke('cross-data-analyzer', {
      body: { ...body, action, patientId },
    });
    if (failure) {
      const details = await failure.context?.json?.().catch(() => null);
      // Preserve the SDK transport type so a disconnected status read can resume.
      throw Object.assign(new Error(details?.error || failure.message), {
        name: failure.name, status: failure.context?.status, cause: failure,
      });
    }
    if (!data || !('job' in data)) throw new Error('Le service de matrice progressive est indisponible.');
    return data.job as MatrixJob<T> | null;
  }, [patientId]);

  const watch = useCallback((id: string | undefined, attempt: number) => {
    async function update() {
      let delay = 2500;
      try {
        const row = await request('matrix.latest', { jobId: id });
        if (version.current !== attempt) return;
        setJob(prev => prev?.id === row?.id && prev?.updated_at === row?.updated_at && prev?.stalled === row?.stalled ? prev : row);
        setError(null);
        setBusy(false);
        if (!row || row.status === 'completed' || row.status === 'failed') return;
        // matrix.latest may just have awakened a stalled worker; keep observing it.
        if (row.stalled) delay = 10_000;
        id = row.id;
      } catch (err) {
        if (version.current !== attempt) return;
        setBusy(false);
        setError(err instanceof Error ? err.message : 'Connexion interrompue.');
        if (err instanceof Error && 'status' in err && (err.status === 401 || err.status === 403)) {
          setJob(null);
          return;
        }
        if (!isTransientRequestFailure(err)) return;
      }
      timer.current = setTimeout(update, delay);
    }
    void update();
  }, [request]);

  useEffect(() => {
    const lifecycle = version;
    const attempt = ++lifecycle.current;
    if (enabled) { setBusy(true); watch(undefined, attempt); }
    return () => { ++lifecycle.current; clearTimeout(timer.current); };
  }, [watch, enabled]);

  async function submit(action: 'matrix.start' | 'matrix.resume', body: object) {
    const attempt = ++version.current;
    clearTimeout(timer.current);
    setBusy(true);
    setError(null);
    try {
      const row = await request(action, body);
      if (version.current !== attempt) return;
      setJob(row);
      watch(row?.id, attempt);
    } catch (err) {
      if (version.current !== attempt) return;
      setError(err instanceof Error ? err.message : 'Demande indisponible.');
      // A lost launch response can still correspond to an accepted server job.
      if (!(err instanceof Error && 'status' in err && err.status)) {
        timer.current = setTimeout(() => watch(undefined, attempt), 2500);
      }
    } finally {
      if (version.current === attempt) setBusy(false);
    }
  }
  return { job, busy, error, submit };
}
