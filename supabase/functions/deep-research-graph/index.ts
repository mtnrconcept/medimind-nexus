import { createClient } from "npm:@supabase/supabase-js@2.86.2";
import { callAI } from "../_shared/ai-client.ts";
import { handleResearchRequest } from "./handler.ts";

Deno.serve(req => {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
            headers: { Authorization: req.headers.get("Authorization") ?? "" },
            fetch: (url, init) => fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(6000) }),
        },
    });
    return handleResearchRequest(req, {
        callAI,
        async isAuthenticated(token) {
            const { data, error } = await client.auth.getUser(token);
            if (error && (!error.status || error.status >= 500)) throw new Error("Authentication unavailable");
            return !error && Boolean(data.user?.id);
        },
        async readInteractions(medicationIds, signal) {
            const { data, error } = await client.from("drug_interactions")
                .select("id,medication_id,interacting_drug,severity,description").in("medication_id", medicationIds)
                .limit(30).abortSignal(signal);
            if (error || !data) throw new Error("Local interactions unavailable");
            return data;
        },
        async readTable(table, pattern, signal) {
            const { data, error } = await client.from(table.table).select("id,name,description")
                .or("name.ilike." + pattern + "," + table.field + ".ilike." + pattern)
                .limit(table.limit).abortSignal(signal);
            if (error || !data) throw new Error("Local lookup unavailable");
            return data;
        },
    });
});
