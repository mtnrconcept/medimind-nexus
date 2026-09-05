export const ANALYSIS_JOB_TTL_MS = 24 * 60 * 60 * 1_000;

export type AnalysisRequestActor = {
  service: boolean;
  userId: string | null;
};

export type AnalysisJobAccessRecord = {
  requested_by: string | null;
  expires_at: string | null;
};

export function buildAnalysisJobSecurityFields(
  actor: AnalysisRequestActor,
  nowMs = Date.now(),
): { requested_by: string | null; expires_at: string } {
  return {
    requested_by: actor.userId,
    expires_at: new Date(nowMs + ANALYSIS_JOB_TTL_MS).toISOString(),
  };
}

export function canAccessAnalysisJob(
  actor: AnalysisRequestActor,
  job: AnalysisJobAccessRecord,
  nowMs = Date.now(),
): boolean {
  if (actor.service) return true;
  if (!actor.userId || !job.requested_by || job.requested_by !== actor.userId) return false;

  const expiresAtMs = Date.parse(job.expires_at || '');
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
}
