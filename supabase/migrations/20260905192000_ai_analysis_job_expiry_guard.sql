-- Ensure every AI analysis job expires even if a legacy producer omits the field.
-- Existing ownerless jobs remain ownerless because their requester cannot be reconstructed safely.

update public.ai_analysis_jobs
set expires_at = coalesce(created_at, now()) + interval '24 hours'
where expires_at is null;

alter table public.ai_analysis_jobs
  alter column expires_at set default (now() + interval '24 hours'),
  alter column expires_at set not null;
