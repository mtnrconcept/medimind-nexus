export type PreventionStatus = 'up_to_date' | 'due_soon' | 'overdue' | 'never_done';
export type LabTrend = 'stable' | 'indeterminate';
export type LabDirection = 'rising' | 'falling' | 'stable' | 'indeterminate';

export interface HealthScoreInput {
  activePathologyCount: number;
  activeSymptomCount: number;
  severeAllergyCount: number;
  abnormalLabCount: number;
  confirmedInteractionCount: number;
  activeMedicationCount: number;
  socialRiskCount: number;
}

export interface LabMeasurement {
  test: unknown;
  value: unknown;
  unit?: unknown;
  date?: unknown;
  is_abnormal?: unknown;
}

export interface DerivedLabTrend {
  test: string;
  unit: string | null;
  latestValue: number | null;
  previousValue: number | null;
  latestDate: string | null;
  previousDate: string | null;
  abnormal: boolean;
  direction: LabDirection;
  trend: LabTrend;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function count(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function computeHealthScore(input: HealthScoreInput): number {
  let score = 82;
  score -= count(input.activePathologyCount) * 6;
  score -= count(input.activeSymptomCount) * 3;
  score -= count(input.severeAllergyCount) * 5;
  score -= count(input.abnormalLabCount) * 3;
  score -= count(input.confirmedInteractionCount) * 8;
  if (count(input.activeMedicationCount) >= 5) score -= 8;
  score -= count(input.socialRiskCount) * 4;
  return clamp(Math.round(score), 20, 92);
}

export function riskLevelFromScore(score: number): 'low' | 'moderate' | 'high' | 'critical' {
  if (score < 35) return 'critical';
  if (score < 55) return 'high';
  if (score < 75) return 'moderate';
  return 'low';
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function numeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: unknown): number {
  const stringValue = text(value);
  if (!stringValue) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(stringValue);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function deriveLabTrends(rows: LabMeasurement[]): DerivedLabTrend[] {
  const groups = new Map<string, LabMeasurement[]>();
  for (const row of rows || []) {
    const testName = text(row.test);
    if (!testName) continue;
    const key = testName.toLocaleLowerCase('fr');
    groups.set(key, [...(groups.get(key) || []), row]);
  }

  const result: DerivedLabTrend[] = [];
  for (const values of groups.values()) {
    const sorted = [...values].sort((a, b) => dateValue(b.date) - dateValue(a.date));
    const latest = sorted[0];
    const latestTest = text(latest.test)!;
    const latestUnit = text(latest.unit);
    const latestNumeric = numeric(latest.value);
    const previous = sorted.find((row, index) => {
      if (index === 0) return false;
      const unit = text(row.unit);
      return unit === latestUnit && numeric(row.value) !== null;
    });
    const previousNumeric = previous ? numeric(previous.value) : null;

    let direction: LabDirection = 'indeterminate';
    let trend: LabTrend = 'indeterminate';
    if (latestNumeric !== null && previousNumeric !== null) {
      const tolerance = Math.max(Math.abs(previousNumeric) * 0.03, 1e-9);
      const delta = latestNumeric - previousNumeric;
      if (Math.abs(delta) <= tolerance) {
        direction = 'stable';
        trend = 'stable';
      } else {
        direction = delta > 0 ? 'rising' : 'falling';
      }
    }

    result.push({
      test: latestTest,
      unit: latestUnit,
      latestValue: latestNumeric,
      previousValue: previousNumeric,
      latestDate: text(latest.date),
      previousDate: previous ? text(previous.date) : null,
      abnormal: latest.is_abnormal === true,
      direction,
      trend,
    });
  }

  return result.sort((a, b) => a.test.localeCompare(b.test));
}

export function preventionStatusFromDates(
  nextDue: unknown,
  lastDone: unknown,
  today = new Date().toISOString().slice(0, 10),
): PreventionStatus {
  const dueText = text(nextDue);
  if (!dueText) return text(lastDone) ? 'up_to_date' : 'never_done';
  const due = Date.parse(`${dueText.slice(0, 10)}T00:00:00Z`);
  const now = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(due) || !Number.isFinite(now)) return text(lastDone) ? 'up_to_date' : 'never_done';
  const days = (due - now) / 86_400_000;
  if (days < 0) return 'overdue';
  if (days <= 90) return 'due_soon';
  return 'up_to_date';
}
