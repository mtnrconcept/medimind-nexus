import test from 'node:test';
import assert from 'node:assert/strict';

import { isValidNctId, mapClinicalTrialStudy } from '../supabase/functions/clinical-trials-sync/mapper.ts';

test('validates canonical NCT identifiers', () => {
  assert.equal(isValidNctId('NCT00198068'), true);
  assert.equal(isValidNctId('nct00198068'), false);
  assert.equal(isValidNctId('NCT123'), false);
});

test('maps ClinicalTrials.gov v2 fields with provenance and freshness', () => {
  const mapped = mapClinicalTrialStudy({
    protocolSection: {
      identificationModule: {
        nctId: 'NCT00198068',
        briefTitle: 'PROMISSE',
        organization: { fullName: 'Hospital for Special Surgery' },
      },
      statusModule: {
        overallStatus: 'RECRUITING',
        startDateStruct: { date: '2003-09', type: 'ACTUAL' },
        completionDateStruct: { date: '2027-03', type: 'ESTIMATED' },
        lastUpdatePostDateStruct: { date: '2026-04-28', type: 'ACTUAL' },
      },
      conditionsModule: { conditions: ['Systemic Lupus Erythematosus'] },
      designModule: { phases: [], enrollmentInfo: { count: 700, type: 'ESTIMATED' } },
      descriptionModule: { briefSummary: 'Example summary' },
      eligibilityModule: { sex: 'FEMALE', minimumAge: '18 Years', maximumAge: '45 Years' },
      contactsLocationsModule: { locations: [{ facility: 'Hospital for Special Surgery', city: 'New York', country: 'United States' }] },
    },
    hasResults: false,
  });

  assert.equal(mapped.nct_id, 'NCT00198068');
  assert.equal(mapped.title, 'PROMISSE');
  assert.equal(mapped.status, 'RECRUITING');
  assert.equal(mapped.last_updated, '2026-04-28');
  assert.equal(mapped.source_api_version, 'v2');
  assert.equal(mapped.has_posted_results, false);
  assert.match(mapped.source_url, /NCT00198068/);
  assert.equal(mapped.sync_status, 'success');
});
