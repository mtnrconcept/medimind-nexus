/** Static Edge Function bundle validation; external runtime URLs are not downloaded. */
import { build } from 'esbuild';

await build({
  entryPoints: ['supabase/functions/signal-detector/index.ts'],
  bundle: true,
  write: false,
  platform: 'neutral',
  format: 'esm',
  external: ['https://*'],
  logLevel: 'warning',
});
console.log('signal-detector Edge syntax and local dependency graph: OK');
