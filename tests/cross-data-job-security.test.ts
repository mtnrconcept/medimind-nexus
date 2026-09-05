import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ANALYSIS_JOB_TTL_MS,
  buildAnalysisJobSecurityFields,
  canAccessAnalysisJob,
  type AnalysisRequestActor,
} from '../supabase/functions/cross-data-analyzer/job-security.ts';

const NOW_MS = Date.parse('2026-09-05T19:00:00.000Z');
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

const owner: AnalysisRequestActor = { service: false, userId: OWNER_ID };
const otherUser: AnalysisRequestActor = { service: false, userId: OTHER_ID };
const service: AnalysisRequestActor = { service: true, userId: null };

test('binds a user-created analysis job to its requester with a 24-hour expiry', () => {
  const fields = buildAnalysisJobSecurityFields(owner, NOW_MS);

  assert.equal(fields.requested_by, OWNER_ID);
  assert.equal(fields.expires_at, new Date(NOW_MS + ANALYSIS_JOB_TTL_MS).toISOString());
});

test('allows only the owner to read an unexpired analysis job', () => {
  const job = {
    requested_by: OWNER_ID,
    expires_at: new Date(NOW_MS + 60_000).toISOString(),
  };

  assert.equal(canAccessAnalysisJob(owner, job, NOW_MS), true);
  assert.equal(canAccessAnalysisJob(otherUser, job, NOW_MS), false);
  assert.equal(canAccessAnalysisJob({ service: false, userId: null }, job, NOW_MS), false);
});

test('rejects expired or ownerless jobs for users while preserving service access', () => {
  const expired = {
    requested_by: OWNER_ID,
    expires_at: new Date(NOW_MS - 1).toISOString(),
  };
  const ownerless = {
    requested_by: null,
    expires_at: new Date(NOW_MS + 60_000).toISOString(),
  };

  assert.equal(canAccessAnalysisJob(owner, expired, NOW_MS), false);
  assert.equal(canAccessAnalysisJob(owner, ownerless, NOW_MS), false);
  assert.equal(canAccessAnalysisJob(service, expired, NOW_MS), true);
  assert.equal(canAccessAnalysisJob(service, ownerless, NOW_MS), true);
});
