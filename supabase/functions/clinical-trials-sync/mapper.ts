export const CLINICAL_TRIALS_API_VERSION = 'v2';

export type DatePrecision = 'day' | 'month' | 'year' | 'unknown';

export interface MappedClinicalTrial {
  nct_id: string;
  title: string;
  brief_summary: string | null;
  status: string | null;
  phase: string | null;
  conditions: string[];
  interventions: unknown[];
  enrollment: number | null;
  start_date: string | null;
  completion_date: string | null;
  sponsor: string | null;
  min_age: string | null;
  max_age: string | null;
  gender: string | null;
  locations: unknown[];
  last_updated: string | null;
  fetched_at: string;
  start_date_precision: DatePrecision;
  completion_date_precision: DatePrecision;
  source_url: string;
  source_api_version: string;
  has_posted_results: boolean;
  sync_status: 'success';
  sync_error: null;
  raw_payload: unknown;
}

export function isValidNctId(value: unknown): value is string {
  return typeof value === 'string' && /^NCT\d{8}$/.test(value);
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

function toInteger(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

export function registryDatePrecision(value: unknown): DatePrecision {
  const text = asText(value);
  if (!text) return 'unknown';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return 'day';
  if (/^\d{4}-\d{2}$/.test(text)) return 'month';
  if (/^\d{4}$/.test(text)) return 'year';
  return 'unknown';
}

export function normalizeRegistryDate(value: unknown): string | null {
  const text = asText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`;
  if (/^\d{4}$/.test(text)) return `${text}-01-01`;
  return null;
}

function phaseText(value: unknown): string | null {
  const values = asArray<unknown>(value)
    .map((item) => asText(item))
    .filter((item): item is string => Boolean(item));
  return values.length ? values.join(', ') : null;
}

export function mapClinicalTrialStudy(study: unknown, fetchedAt = new Date().toISOString()): MappedClinicalTrial {
  const root = asRecord(study);
  const protocol = asRecord(root.protocolSection);
  const identification = asRecord(protocol.identificationModule);
  const status = asRecord(protocol.statusModule);
  const description = asRecord(protocol.descriptionModule);
  const conditions = asRecord(protocol.conditionsModule);
  const design = asRecord(protocol.designModule);
  const eligibility = asRecord(protocol.eligibilityModule);
  const contacts = asRecord(protocol.contactsLocationsModule);
  const interventionsModule = asRecord(protocol.armsInterventionsModule);
  const sponsorModule = asRecord(protocol.sponsorCollaboratorsModule);

  const nctId = asText(identification.nctId);
  if (!isValidNctId(nctId)) {
    throw new Error('ClinicalTrials.gov payload is missing a valid NCT identifier');
  }

  const title = asText(identification.briefTitle) || asText(identification.officialTitle);
  if (!title) {
    throw new Error(`ClinicalTrials.gov payload ${nctId} is missing a title`);
  }

  const startRaw = asRecord(status.startDateStruct).date;
  const completionRaw = asRecord(status.completionDateStruct).date;
  const registryUpdateRaw = asRecord(status.lastUpdatePostDateStruct).date;
  const leadSponsor = asRecord(sponsorModule.leadSponsor);
  const organization = asRecord(identification.organization);
  const enrollmentInfo = asRecord(design.enrollmentInfo);

  const mappedConditions = asArray<unknown>(conditions.conditions)
    .map((item) => asText(item))
    .filter((item): item is string => Boolean(item));

  return {
    nct_id: nctId,
    title,
    brief_summary: asText(description.briefSummary),
    status: asText(status.overallStatus),
    phase: phaseText(design.phases),
    conditions: mappedConditions,
    interventions: asArray(interventionsModule.interventions),
    enrollment: toInteger(enrollmentInfo.count),
    start_date: normalizeRegistryDate(startRaw),
    completion_date: normalizeRegistryDate(completionRaw),
    sponsor: asText(leadSponsor.name) || asText(organization.fullName),
    min_age: asText(eligibility.minimumAge),
    max_age: asText(eligibility.maximumAge),
    gender: asText(eligibility.sex),
    locations: asArray(contacts.locations),
    last_updated: normalizeRegistryDate(registryUpdateRaw),
    fetched_at: fetchedAt,
    start_date_precision: registryDatePrecision(startRaw),
    completion_date_precision: registryDatePrecision(completionRaw),
    source_url: `https://clinicaltrials.gov/study/${nctId}`,
    source_api_version: CLINICAL_TRIALS_API_VERSION,
    has_posted_results: root.hasResults === true,
    sync_status: 'success',
    sync_error: null,
    raw_payload: study,
  };
}
