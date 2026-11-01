/** Input parsing and canonical lab mapping for the RLS-bound signal endpoint. */
export interface ValidSignalRequest {
  patient_id: string;
  lookback_days: number;
  sensitivity: 'low' | 'medium' | 'high';
}

export function extractBearerToken(authorization: string | null | undefined): string | null {
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization || '');
  return match?.[1] || null;
}

export function parseSignalRequest(value: unknown): ValidSignalRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid request');
  const data = value as Record<string, unknown>;
  if (typeof data.patient_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.patient_id)) {
    throw new Error('Invalid patient identifier');
  }
  const days = data.lookback_days === undefined ? 90 : data.lookback_days;
  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 365) throw new Error('Invalid lookback range');
  const sensitivity = data.sensitivity === undefined ? 'medium' : data.sensitivity;
  if (sensitivity !== 'low' && sensitivity !== 'medium' && sensitivity !== 'high') throw new Error('Invalid sensitivity');
  return { patient_id: data.patient_id, lookback_days: days, sensitivity };
}

interface RawSignalLab {
  test_name?: unknown;
  test_date?: unknown;
  value?: unknown;
  unit?: unknown;
  reference_min?: unknown;
  reference_max?: unknown;
}
export interface SignalLab {
  parameter: string;
  date: string;
  value: number;
  unit: string;
  ref_min?: number;
  ref_max?: number;
}

// Lab thresholds are meaningless without an exact canonical unit. This list is
// intentionally conservative until an approved LOINC/UCUM normalizer is integrated.
const UNITS: Record<string, string> = {
  'alat': 'U/L', 'asat': 'U/L', 'ggt': 'U/L', 'bilirubine': 'µmol/L', 'pal': 'U/L',
  'créatinine': 'µmol/L', 'urée': 'mmol/L', 'dfg': 'mL/min',
  'hémoglobine': 'g/L', 'leucocytes': 'G/L', 'plaquettes': 'G/L', 'neutrophiles': 'G/L',
  'glycémie': 'mmol/L', 'hba1c': '%', 'potassium': 'mmol/L', 'sodium': 'mmol/L',
  'troponine': 'ng/L', 'bnp': 'pg/mL', 'nt-probnp': 'pg/mL', 'crp': 'mg/L', 'vs': 'mm/h',
};

export function normalizeSignalLab(raw: RawSignalLab): SignalLab | null {
  if (typeof raw.test_name !== 'string' || typeof raw.test_date !== 'string' || typeof raw.unit !== 'string' ||
      typeof raw.value !== 'number' || !Number.isFinite(raw.value)) return null;
  const name = raw.test_name.trim();
  const standard = UNITS[name.toLocaleLowerCase('fr')];
  if (!standard || raw.unit !== standard || !/^\d{4}-\d{2}-\d{2}$/.test(raw.test_date)) return null;
  const valid = new Date(`${raw.test_date}T00:00:00.000Z`);
  if (Number.isNaN(valid.getTime()) || valid.toISOString().slice(0,10) !== raw.test_date) return null;
  const result: SignalLab = { parameter: name, date: raw.test_date, value: raw.value, unit: raw.unit };
  if (typeof raw.reference_min === 'number' && Number.isFinite(raw.reference_min)) result.ref_min = raw.reference_min;
  if (typeof raw.reference_max === 'number' && Number.isFinite(raw.reference_max)) result.ref_max = raw.reference_max;
  return result;
}
