import { createClient } from 'npm:@supabase/supabase-js@2.86.2';
import { serveEvidence } from './engine.ts';
import { clinicalSources } from './clinical.ts';
import { molecularSources } from './molecular.ts';
import { specialtySources } from './specialty.ts';
import { genomicsSources } from './genomics.ts';
import { pluginSources } from './plugins.ts';

const providers = [...clinicalSources, ...molecularSources, ...specialtySources, ...genomicsSources, ...pluginSources];
const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5_000) }) },
});

Deno.serve(request => serveEvidence(request, async token => {
  const { data, error } = await auth.auth.getUser(token);
  if (error && (!error.status || error.status >= 500)) throw new Error('Auth unavailable');
  return !error && Boolean(data.user);
}, providers));
