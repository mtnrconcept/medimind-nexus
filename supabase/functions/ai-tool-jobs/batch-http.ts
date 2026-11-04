import {
  prepareScraperBatchChild, runScraperBatch, shouldRelayScraperBatch, startScraperBatch, stopScraperBatch,
  type ScraperBatchRuntime,
} from './batch.ts';
import { executeTool, type TransportDependencies } from './handler.ts';
import { isUUID, MAX_REQUEST_BYTES, publicJob, TOOL_WORKER_BUDGET_MS, TRANSPORT_MODE } from './protocol.ts';

const actions = new Set(['batch.start', 'batch.stop', 'batch.monitor', 'batch.child']);
const MAX_MANIFEST_BYTES = MAX_REQUEST_BYTES;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, x-ai-request-id, x-ai-scope',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});

async function readManifest(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > MAX_MANIFEST_BYTES) {
    throw Object.assign(new Error('Le manifeste est trop volumineux.'), { status: 413 });
  }
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    throw Object.assign(new Error('Un manifeste JSON est requis.'), { status: 400 });
  }
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_MANIFEST_BYTES) throw Object.assign(new Error('Le manifeste est trop volumineux.'), { status: 413 });
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    }
  }
  try { return JSON.parse(text); } catch { throw Object.assign(new Error('Le manifeste JSON est invalide.'), { status: 400 }); }
}

export function createScraperBatchHTTP(
  runtime: ScraperBatchRuntime,
  transport: TransportDependencies,
  serviceRoleKey: string,
) {
  const now = transport.now || Date.now;
  const keepAlive = (work: Promise<void>) => transport.waitUntil(work.catch(() => {
    transport.log?.('[AI scraper batch] Worker unavailable; durable state retained.');
  }));
  return {
    handles(request: Request) { return actions.has(new URL(request.url).searchParams.get('action') || ''); },
    async wake(id: string) { await runtime.relayMonitor(id, 0); },
    async handle(request: Request): Promise<Response> {
      const deadlineAt = now() + TOOL_WORKER_BUDGET_MS;
      if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
      if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);
      const url = new URL(request.url);
      const action = url.searchParams.get('action') || '';
      const authorization = request.headers.get('authorization') || '';
      const privateAction = action === 'batch.monitor' || action === 'batch.child';
      try {
        if (privateAction) {
          // These routes cannot delegate a caller-supplied URL or arbitrary tool.
          if (authorization !== 'Bearer ' + serviceRoleKey) return json({ error: 'Service authorization required.' }, 403);
          const parsed = await readManifest(request);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ error: 'Étape invalide.' }, 400);
          const input = parsed as { jobId?: string; parentId?: string; index?: number; notBefore?: number };
          if (action === 'batch.monitor') {
            if (!isUUID(input.jobId ?? null)) return json({ error: 'Identifiant invalide.' }, 400);
            const delay = Math.min(90_000, Math.max(0, Number(input.notBefore || 0) - now()));
            if (delay > 0) {
              // Cooldowns/lease recovery use their own short invocation. They
              // never append a 90s sleep to an already running parent monitor.
              const target = now() + delay;
              keepAlive((async () => {
                await new Promise<void>(resolve => setTimeout(resolve, Math.min(delay, 45_000)));
                // A failed metadata read cannot prove that another controller
                // took over. Preserve the existing relay in that case.
                if (await shouldRelayScraperBatch(runtime, input.jobId!, target).catch(() => true)) {
                  await runtime.relayMonitor(input.jobId!, Math.max(0, target - now()));
                }
              })());
            } else keepAlive(runScraperBatch(runtime, input.jobId!));
          } else {
            if (!isUUID(input.parentId ?? null) || !Number.isSafeInteger(input.index) || input.index! < 0 || input.index! >= 500) {
              return json({ error: 'Étape invalide.' }, 400);
            }
            const child = await prepareScraperBatchChild(runtime, input.parentId!, input.index!);
            if (child) {
              if (child.job.function_name !== 'medical-scraper' || child.job.analysis_mode !== TRANSPORT_MODE ||
                  child.job.request_payload.batchParentId !== input.parentId) {
                throw new Error('Invalid scraper child delegation');
              }
              // Authorization was checked when accepting the admin's manifest.
              // The child body is reconstructed exclusively from that saved plan.
              keepAlive(executeTool(transport, child.job, serviceRoleKey, child.body, child.contentType, deadlineAt));
            }
          }
          return json({ accepted: true }, 202);
        }

        if (action !== 'batch.start' && action !== 'batch.stop') return json({ error: 'Action invalide.' }, 400);
        const token = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
        if (!token) return json({ error: 'Connexion requise.' }, 401);
        const owner = await transport.authenticate(token);
        if (!owner) return json({ error: 'Session invalide.' }, 401);
        if (action === 'batch.stop') {
          const id = url.searchParams.get('jobId');
          if (!isUUID(id)) return json({ error: 'Identifiant invalide.' }, 400);
          const job = await stopScraperBatch(runtime, id, owner);
          keepAlive(runtime.relayMonitor(job.id, 0));
          return json({ job: publicJob(job, true, now()) });
        }
        const requestId = request.headers.get('x-ai-request-id');
        const scope = request.headers.get('x-ai-scope') || '';
        if (!isUUID(requestId) || scope.length > 256 || /[\r\n]/.test(scope)) return json({ error: 'Référence invalide.' }, 400);
        const job = await startScraperBatch(runtime, await readManifest(request), owner, requestId, scope);
        keepAlive(runtime.relayMonitor(job.id, 0));
        return json({ job: publicJob(job, true, now()), requestId }, 202);
      } catch (error) {
        const status = Number((error as { status?: unknown })?.status);
        if ([400, 403, 404, 409, 413].includes(status)) {
          return json({ error: error instanceof Error ? error.message : 'Demande invalide.' }, status);
        }
        transport.log?.('[AI scraper batch] Request unavailable.');
        return json({ error: 'Le suivi de cet import est temporairement indisponible.' }, 503);
      }
    },
  };
}
