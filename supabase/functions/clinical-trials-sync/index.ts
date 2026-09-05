import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isValidNctId, mapClinicalTrialStudy } from "./mapper.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_BATCH_SIZE = 25;
const MAX_CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 2;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function uniqueNctIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (!isValidNctId(item) || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
    if (result.length >= MAX_BATCH_SIZE) break;
  }
  return result;
}

async function requireAuthenticatedUser(req: Request, supabase: any, serviceRoleKey: string): Promise<{ userId: string | null; service: boolean }> {
  const authorization = req.headers.get("authorization") || "";
  if (authorization === `Bearer ${serviceRoleKey}`) return { userId: null, service: true };

  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("AUTH_REQUIRED");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) throw new Error("AUTH_INVALID");
  return { userId: data.user.id, service: false };
}

async function fetchStudy(nctId: string): Promise<any> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`https://clinicaltrials.gov/api/v2/studies/${encodeURIComponent(nctId)}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (response.status === 404) throw new Error("Study not found in ClinicalTrials.gov");
      if (!response.ok) throw new Error(`ClinicalTrials.gov returned HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= MAX_ATTEMPTS) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("ClinicalTrials.gov request failed");
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function consume(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => consume()));
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: "Supabase function environment is incomplete" }, 500);

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const actor = await requireAuthenticatedUser(req, supabase, serviceRoleKey);
    const body = await req.json().catch(() => ({}));
    const nctIds = uniqueNctIds(body?.nct_ids);
    if (nctIds.length === 0) return jsonResponse({ error: "Provide at least one valid NCT identifier" }, 400);

    const results = await mapWithConcurrency(nctIds, MAX_CONCURRENCY, async (nctId) => {
      const fetchedAt = new Date().toISOString();
      try {
        const study = await fetchStudy(nctId);
        const mapped = mapClinicalTrialStudy(study, fetchedAt);
        const { error } = await supabase.from("clinical_trials").upsert(mapped, {
          onConflict: "nct_id",
          ignoreDuplicates: false,
        });
        if (error) throw new Error(error.message);
        return {
          nct_id: nctId,
          status: "success" as const,
          registry_status: mapped.status,
          last_updated: mapped.last_updated,
          fetched_at: mapped.fetched_at,
          source_url: mapped.source_url,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const { error: updateError } = await supabase
          .from("clinical_trials")
          .update({
            fetched_at: fetchedAt,
            sync_status: "error",
            sync_error: message.slice(0, 1000),
          })
          .eq("nct_id", nctId);
        if (updateError) console.warn(`[clinical-trials-sync] failed to record error for ${nctId}:`, updateError.message);
        return { nct_id: nctId, status: "error" as const, error: message };
      }
    });

    const succeeded = results.filter((item) => item.status === "success").length;
    return jsonResponse({
      requested: nctIds.length,
      succeeded,
      failed: nctIds.length - succeeded,
      actor: actor.service ? "service" : "authenticated_user",
      results,
      source: {
        name: "ClinicalTrials.gov",
        api_version: "v2",
        disclaimer: "Registry data are sponsor-submitted and do not establish study quality, treatment safety or efficacy, current availability, or individual eligibility.",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "AUTH_REQUIRED" || message === "AUTH_INVALID") return jsonResponse({ error: "Authentication required" }, 401);
    console.error("[clinical-trials-sync] error:", error);
    return jsonResponse({ error: message }, 500);
  }
});
