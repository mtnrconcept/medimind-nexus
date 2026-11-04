import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

test('the real systematic endpoint finishes every planned window without a browser and isolates the owner', async t => {
  t.mock.method(console, 'error', () => undefined);
  const rows = new Map<string, Array<Record<string, any>>>();
  const entities = Array.from({ length: 6 }, (_, index) => ({
    id: `external-${index}`, name: `Synthetic substance ${index}`, source: 'openfda', node_type: 'substance', properties: {},
  }));
  rows.set('cde_nodes', entities);
  rows.set('cde_analysis_runs', []);
  rows.set('cde_pair_analyses', []);
  rows.set('cde_analyzed_pairs', []);
  rows.set('ai_analysis_jobs', []);
  const databases = () => ({
    auth: { getUser: async (token: string) => ({ data: { user: { id: token === 'owner-a-jwt' ? 'owner-a' : 'owner-b' } }, error: null }) },
    from(table: string) {
      let action = 'select';
      let data: Record<string, any>[] = [];
      let settings: { ignoreDuplicates?: boolean } = {};
      const filters: Array<(row: Record<string, any>) => boolean> = [];
      const value = (row: Record<string, any>, key: string) => key.split(/->>?/).reduce((current, part) => current?.[part], row);
      const query = {
        select() { return query; }, abortSignal() { return query; },
        order() { return query; }, limit() { return query; }, or() { return query; },
        eq(key: string, wanted: unknown) { filters.push(row => value(row, key) === wanted); return query; },
        is(key: string, wanted: unknown) { filters.push(row => (value(row, key) ?? null) === wanted); return query; },
        in(key: string, values: unknown[]) { filters.push(row => values.includes(value(row, key))); return query; },
        insert(input: Record<string, any> | Record<string, any>[]) { action = 'insert'; data = Array.isArray(input) ? input : [input]; return query; },
        upsert(input: Record<string, any> | Record<string, any>[], options = {}) { action = 'upsert'; data = Array.isArray(input) ? input : [input]; settings = options; return query; },
        update(input: Record<string, any>) { action = 'update'; data = [input]; return query; },
        execute(single = false) {
          const collection = rows.get(table) ?? [];
          let found = collection.filter(row => filters.every(filter => filter(row)));
          let error: { code: string } | null = null;
          if (action === 'update') {
            for (const row of found) Object.assign(row, structuredClone(data[0]));
          } else if (action === 'insert' || action === 'upsert') {
            found = [];
            for (const input of data) {
              const existing = collection.find(row => table === 'cde_pair_analyses'
                ? row.run_id === input.run_id && row.substance_a_name === input.substance_a_name && row.substance_b_name === input.substance_b_name
                : table === 'cde_analyzed_pairs'
                  ? row.substance_a_name === input.substance_a_name && row.substance_b_name === input.substance_b_name
                  : input.id && row.id === input.id);
              if (existing) {
                if (action === 'insert') { error = { code: '23505' }; break; }
                if (!settings.ignoreDuplicates) Object.assign(existing, structuredClone(input));
                found.push(existing);
                continue;
              }
              const row = {
                id: crypto.randomUUID(), public_token: crypto.randomUUID(), created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(), provider_response_id: null, provider_status: null,
                ...structuredClone(input),
              };
              collection.push(row); found.push(row);
            }
            rows.set(table, collection);
          }
          return { data: structuredClone(single ? found[0] ?? null : found), error };
        },
        async single() { return query.execute(true); },
        async maybeSingle() { return query.execute(true); },
        then(resolve: (result: unknown) => unknown) { return Promise.resolve(query.execute()).then(resolve); },
      };
      return query;
    },
  });
  type Fixture = {
    handler?: (request: Request) => Promise<Response>;
    database: typeof databases;
    catalog: typeof entities;
    start: (system: string, prompt: string, options: { maxTokens?: number }) => Promise<Record<string, unknown>>;
    retrieve: (id: string) => Promise<Record<string, unknown>>;
  };
  const globals = globalThis as typeof globalThis & { __systematicServer?: Fixture; Deno?: unknown; EdgeRuntime?: unknown };
  const oldDeno = globals.Deno, oldRuntime = globals.EdgeRuntime;
  const work: Promise<void>[] = [];
  globals.Deno = { env: { get: (name: string) => name === 'SUPABASE_URL' ? 'https://project.invalid' : 'service-secret' } };
  globals.EdgeRuntime = { waitUntil: (promise: Promise<void>) => work.push(promise) };
  t.after(() => { globals.Deno = oldDeno; globals.EdgeRuntime = oldRuntime; delete globals.__systematicServer; });
  const responses = new Map<string, Record<string, unknown>>();
  let creations = 0;
  let incomplete = false;
  let ambiguous = false;
  let loseFinalAck = true;
  const fixture: Fixture = {
    database: databases, catalog: entities,
    async start(_system, prompt, options) {
      creations += 1;
      const id = `response-${creations}`;
      const names = [...prompt.matchAll(/^\d+\. \[[^\]]+\] (.+)$/gm)].map(match => match[1]);
      const metadata = { id, provider: 'openai', status: 'queued', model: 'synthetic-model', maxOutputTokens: options.maxTokens ?? 32_768 };
      responses.set(id, { ...metadata, status: incomplete ? 'incomplete' : 'completed',
        ...(incomplete ? { incompleteReason: 'max_output_tokens', partialText: '{"pairs":[' } : {
          text: JSON.stringify({ pairs: names.map(name => ({ entity_b_name: name, is_documented: false,
            discovery_type: 'interaction', plausibility_score: 0.4, severity: 'faible', reasoning: 'Synthetic hypothesis only.' })), synthesis: 'Synthetic fixture.' }),
        }),
      });
      if (ambiguous) throw new Error('Network failure after provider accepted POST');
      return metadata;
    },
    retrieve: async id => responses.get(id)!,
  };
  globals.__systematicServer = fixture;
  const bundle = await build({
    entryPoints: ['supabase/functions/cde-systematic-analyze/index.ts'], bundle: true,
    format: 'esm', platform: 'neutral', write: false, logLevel: 'silent',
    plugins: [{ name: 'synthetic-systematic-services', setup(plugin) {
      plugin.onResolve({ filter: /\/http\/server\.ts$/ }, () => ({ path: 'server', namespace: 'fixture' }));
      plugin.onResolve({ filter: /@supabase\/supabase-js/ }, () => ({ path: 'database', namespace: 'fixture' }));
      plugin.onResolve({ filter: /(?:^|\/)ai-client\.ts$/ }, () => ({ path: 'provider', namespace: 'fixture' }));
      plugin.onResolve({ filter: /medication-catalog\.ts$/ }, () => ({ path: 'catalog', namespace: 'fixture' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: {
        server: 'export const serve = handler => { globalThis.__systematicServer.handler = handler; };',
        database: 'export const createClient = () => globalThis.__systematicServer.database();',
        provider: 'export const startBackgroundAI = (...args) => globalThis.__systematicServer.start(...args); export const retrieveBackgroundAI = id => globalThis.__systematicServer.retrieve(id);',
        catalog: 'export const buildMedicationCatalog = async () => globalThis.__systematicServer.catalog; export const isInteractionDocumented = async () => false;',
      }[path]!, loader: 'js' }));
    } }],
  });
  await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const body = await request.clone().json();
    const response = await fixture.handler!(request);
    if (loseFinalAck && body.providerResponseId) {
      loseFinalAck = false;
      throw new TypeError('Lost finalizer acknowledgement after successful save');
    }
    return response;
  });
  const request = (body: unknown, owner = 'owner-a-jwt') => fixture.handler!(new Request('https://project.invalid/functions/v1/cde-systematic-analyze', {
    method: 'POST', headers: { authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  let observed = 0;
  const drain = async () => { while (observed < work.length) await work[observed++]; };

  const started = await request({ action: 'start' });
  assert.equal(started.status, 202);
  const receipt = await started.json();
  await drain(); // No user status request was needed to continue any step.
  const job = rows.get('ai_analysis_jobs')!.find(row => row.id === receipt.job.id)!;
  assert.equal(job.status, 'completed');
  assert.equal(creations, 5);
  assert.equal(job.result_payload.total_pairs, 14);
  assert.equal(job.result_payload.pairs_processed, 14);
  assert.equal(job.result_payload.pairs_analyzed, 14);
  assert.equal(job.result_payload.steps.length, 5);
  assert.equal(rows.get('cde_pair_analyses')!.length, 14);
  assert.equal(rows.get('cde_analyzed_pairs')!.length, 14);
  assert.ok(rows.get('cde_pair_analyses')!.every(row => row.substance_a_id === null && row.substance_b_id === null), 'External catalog IDs never enter UUID foreign keys');
  const run = rows.get('cde_analysis_runs')!.find(row => row.id === job.id)!;
  assert.equal(run.created_by, 'owner-a');
  assert.equal(run.status, 'completed');
  assert.equal(run.pairs_analyzed, 14);
  const wrongOwner = await request({ action: 'status', jobId: job.id, jobToken: receipt.job.token }, 'owner-b-jwt');
  assert.equal(wrongOwner.status, 404);
  assert.equal((await request({ runJob: true, jobId: job.id, jobToken: receipt.job.token, _workerLease: 'forged' })).status, 403);

  rows.set('cde_analyzed_pairs', []);
  incomplete = true;
  const incompleteReceipt = await (await request({ action: 'start' })).json();
  await drain();
  const failed = rows.get('ai_analysis_jobs')!.find(row => row.id === incompleteReceipt.job.id)!;
  assert.equal(failed.status, 'failed');
  assert.equal(creations, 8, 'Only two increased-budget retries follow the initial incomplete response');
  assert.equal(failed.result_payload.pairs_analyzed, 0);
  assert.equal(failed.result_payload.pairs_processed, 0);
  assert.ok(failed.provider_response_id);
  assert.equal(rows.get('cde_pair_analyses')!.filter(row => row.run_id === failed.id).length, 0);

  incomplete = false; ambiguous = true;
  const ambiguousReceipt = await (await request({ action: 'start' })).json();
  await drain();
  const ambiguousJob = rows.get('ai_analysis_jobs')!.find(row => row.id === ambiguousReceipt.job.id)!;
  assert.equal(ambiguousJob.status, 'failed');
  assert.equal(creations, 9, 'A lost creation acknowledgement is never retried');
  assert.equal(ambiguousJob.result_payload.pairs_processed, 0);
});
