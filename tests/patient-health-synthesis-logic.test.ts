import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeHealthScore,
  deriveLabTrends,
  preventionStatusFromDates,
} from '../supabase/functions/patient-health-synthesis/logic.ts';

test('computes a deterministic health score from structured context', () => {
  const score = computeHealthScore({
    activePathologyCount: 2,
    activeSymptomCount: 1,
    severeAllergyCount: 0,
    abnormalLabCount: 2,
    confirmedInteractionCount: 1,
    activeMedicationCount: 5,
    socialRiskCount: 1,
  });
  assert.equal(score, 41);
});

test('does not infer a lab trend from a single measurement', () => {
  const trends = deriveLabTrends([
    { test: 'CRP', value: 20, unit: 'mg/L', date: '2026-09-01', is_abnormal: true },
  ]);
  assert.equal(trends.length, 1);
  assert.equal(trends[0].trend, 'indeterminate');
  assert.equal(trends[0].direction, 'indeterminate');
});

test('reports measurement direction without assigning clinical improvement or worsening', () => {
  const trends = deriveLabTrends([
    { test: 'Biomarqueur generique', value: 30, unit: 'U/L', date: '2026-09-02', is_abnormal: true },
    { test: 'Biomarqueur generique', value: 20, unit: 'U/L', date: '2026-09-01', is_abnormal: true },
  ]);
  assert.equal(trends[0].direction, 'rising');
  assert.equal(trends[0].trend, 'indeterminate');
});

test('keeps comparable measurements stable within tolerance', () => {
  const trends = deriveLabTrends([
    { test: 'Biomarqueur generique', value: 20.3, unit: 'U/L', date: '2026-09-02' },
    { test: 'Biomarqueur generique', value: 20, unit: 'U/L', date: '2026-09-01' },
  ]);
  assert.equal(trends[0].direction, 'stable');
  assert.equal(trends[0].trend, 'stable');
});

test('derives prevention status from due dates rather than presence alone', () => {
  assert.equal(preventionStatusFromDates('2026-09-01', '2025-09-01', '2026-09-05'), 'overdue');
  assert.equal(preventionStatusFromDates('2026-10-01', '2025-10-01', '2026-09-05'), 'due_soon');
  assert.equal(preventionStatusFromDates('2027-03-01', '2026-03-01', '2026-09-05'), 'up_to_date');
  assert.equal(preventionStatusFromDates(null, null, '2026-09-05'), 'never_done');
});
