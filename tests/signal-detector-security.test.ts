import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSignalRequest, extractBearerToken, normalizeSignalLab } from '../supabase/functions/signal-detector/security.ts';

const validId='11111111-1111-4111-8111-111111111111';

test('patient signal requests require an explicit valid UUID and a bounded lookback window', () => {
  assert.deepEqual(parseSignalRequest({patient_id:validId}),{patient_id:validId,lookback_days:90,sensitivity:'medium'});
  assert.equal(parseSignalRequest({patient_id:validId,lookback_days:365,sensitivity:'high'}).lookback_days,365);
  for(const bad of [{}, {patient_id:'1'}, {patient_id:validId,lookback_days:0}, {patient_id:validId,lookback_days:10000}, {patient_id:validId,lookback_days:2.5}, {patient_id:validId,sensitivity:'very_high'}]){
    assert.throws(()=>parseSignalRequest(bad));
  }
});

test('signal detector only accepts a real bearer session', () => {
  assert.equal(extractBearerToken('Bearer token.with.sig'),'token.with.sig');
  assert.equal(extractBearerToken('Basic creds'),null);
  assert.equal(extractBearerToken(undefined),null);
  assert.equal(extractBearerToken('Bearer '),null);
});

test('uses real patient_lab_results columns and does not interpret unknown units as normal', () => {
  const good=normalizeSignalLab({test_name:'CRP',test_date:'2026-01-12',value:62,unit:'mg/L',reference_min:0,reference_max:5});
  assert.deepEqual(good,{parameter:'CRP',date:'2026-01-12',value:62,unit:'mg/L',ref_min:0,ref_max:5});
  assert.equal(normalizeSignalLab({test_name:'CRP',test_date:'2026-01-12',value:62,unit:'mg/dL'}),null);
  assert.equal(normalizeSignalLab({test_name:'CRP',test_date:'2026-01-12',value:'not a number',unit:'mg/L'}),null);
  assert.equal(normalizeSignalLab({parameter_name:'CRP',measured_at:'2026-01-12',value:62} as unknown as Parameters<typeof normalizeSignalLab>[0]),null);
});

test('deployed edge function must check patient RLS before reading labs and avoid service-role impersonation', () => {
  const code=readFileSync(new URL('../supabase/functions/signal-detector/index.ts',import.meta.url),'utf8');
  assert.match(code,/\.auth\.getUser\(/);
  assert.match(code,/\.from\(['"]patients['"]\)/);
  assert.match(code,/\.from\(['"]patient_lab_results['"]\)/);
  assert.match(code,/\.gte\(['"]test_date['"]/);
  assert.doesNotMatch(code,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(code,/\.gte\(['"]measured_at['"]/);
  assert.doesNotMatch(code,/lab\.parameter_name/);
});

test('biomarker matching is exact so NT-proBNP cannot be mistaken for BNP', () => {
  const code=readFileSync(new URL('../supabase/functions/signal-detector/index.ts',import.meta.url),'utf8');
  assert.doesNotMatch(code,/param\.toLowerCase\(\)\.includes\(key\.toLowerCase\(\)\)/);
  assert.match(code,/param\.toLocaleLowerCase\('fr'\)\s*===\s*key\.toLocaleLowerCase\('fr'\)/);
});
