import { finiteNumber, measurementTimestamp, normalizeRecordedConditionLabel } from './comparisonFacts';

export interface Measurement {
  name: string;
  value: number | null;
  unit: string | null;
  measuredAt?: string | null;
  referenceMin?: number | null;
  referenceMax?: number | null;
  isAbnormal?: boolean | null;
}

export interface MeasurementSide {
  records: Measurement[];
  selected: Measurement | null;
  excludedReason: string | null;
  undatedCount: number;
}

export interface MeasurementComparison {
  key: string;
  name: string;
  source: MeasurementSide;
  peer: MeasurementSide;
  unit: string | null;
  delta: number | null;
  relativeDifference: number | null;
  timeGapDays: number | null;
  numericSimilarity: number | null;
  excludedReason: string | null;
}

// Keep unit case and scale: mg/L, mg/dL, g/L, mmol/L and mol/L are never conflated.
function unitKey(unit: string | null): string {
  return (unit ?? '').trim().replace(/\s+/gu, '').replace(/μ/g, 'µ');
}

function metadataIssue(record: Measurement): string | null {
  if (!finiteNumber(record.value)) return 'Valeur absente ou inexploitable';
  if (!unitKey(record.unit)) return 'Unité non renseignée';
  const { referenceMin: min, referenceMax: max, value } = record;
  if (min != null && !finiteNumber(min) || max != null && !finiteNumber(max)) return 'Référence inexploitable';
  if (finiteNumber(min) && finiteNumber(max) && min > max) return 'Intervalle de référence incohérent';
  const outside = finiteNumber(min) && value < min || finiteNumber(max) && value > max;
  const insideCompleteRange = finiteNumber(min) && finiteNumber(max) && value >= min && value <= max;
  if (outside && record.isAbnormal === false || insideCompleteRange && record.isAbnormal === true) return 'Indicateur d’anomalie et références contradictoires';
  return null;
}

export function describeMeasurementState(record: Measurement): string {
  const issue = metadataIssue(record);
  if (issue) return issue;
  const min = record.referenceMin, max = record.referenceMax, value = record.value!;
  if (finiteNumber(min) && value < min) return 'Sous la référence renseignée';
  if (finiteNumber(max) && value > max) return 'Au-dessus de la référence renseignée';
  if (finiteNumber(min) && finiteNumber(max)) return 'Dans l’intervalle renseigné';
  if (record.isAbnormal === true) return 'Signalé anormal dans le dossier';
  if (record.isAbnormal === false) return 'Signalé non anormal dans le dossier';
  if (finiteNumber(min) || finiteNumber(max)) return 'Borne respectée ; intervalle incomplet';
  return 'Références non renseignées';
}

function measurementSignature(record: Measurement): string {
  return JSON.stringify([record.value, unitKey(record.unit), record.referenceMin ?? null, record.referenceMax ?? null, record.isAbnormal ?? null]);
}

function latestRecorded(records: Measurement[]): MeasurementSide {
  const sorted = [...records].sort((a, b) => (measurementTimestamp(b.measuredAt) ?? -Infinity) - (measurementTimestamp(a.measuredAt) ?? -Infinity)
    || measurementSignature(a).localeCompare(measurementSignature(b)));
  const undatedCount = sorted.filter(r => measurementTimestamp(r.measuredAt) === null).length;
  if (!sorted.length) return { records: [], selected: null, excludedReason: 'Aucune mesure renseignée', undatedCount };
  const latestTime = measurementTimestamp(sorted[0].measuredAt);
  const latest = sorted.filter(r => measurementTimestamp(r.measuredAt) === latestTime);
  if (new Set(latest.map(measurementSignature)).size > 1) {
    return { records: sorted, selected: null, excludedReason: latestTime === null ? 'Plusieurs mesures sans date exploitable' : 'Résultats différents à la date la plus récente', undatedCount };
  }
  const selected = latest[0];
  // Select by date BEFORE validating the value. Never substitute an older result.
  return { records: sorted, selected, excludedReason: latestTime === null ? 'Date de mesure non renseignée ou inexploitable' : metadataIssue(selected), undatedCount };
}

/** All observations stay visible; only the latest unambiguous dated pair enters the score. */
export function compareMeasurements(source: Measurement[], peer: Measurement[]): MeasurementComparison[] {
  const groups = new Map<string, { name: string; source: Measurement[]; peer: Measurement[] }>();
  for (const side of ['source', 'peer'] as const) {
    for (const record of side === 'source' ? source : peer) {
      const key = normalizeRecordedConditionLabel(record.name);
      if (!key) continue;
      const group = groups.get(key) ?? { name: record.name, source: [], peer: [] };
      group[side].push(record);
      groups.set(key, group);
    }
  }
  return [...groups.entries()].map(([key, group]): MeasurementComparison => {
    const a = latestRecorded(group.source), b = latestRecorded(group.peer);
    const unit = a.selected?.unit ?? b.selected?.unit ?? null;
    let excludedReason = a.excludedReason || b.excludedReason;
    if (!excludedReason && unitKey(a.selected!.unit) !== unitKey(b.selected!.unit)) excludedReason = 'Unités différentes : aucune conversion automatique';
    const timeA = measurementTimestamp(a.selected?.measuredAt), timeB = measurementTimestamp(b.selected?.measuredAt);
    const timeGapDays = timeA !== null && timeB !== null ? Math.abs(timeB - timeA) / 86400000 : null;
    const difference = excludedReason ? null : b.selected!.value! - a.selected!.value!;
    if (difference !== null && !Number.isFinite(difference)) excludedReason = 'Écart numérique hors plage exploitable';
    const delta = excludedReason ? null : difference;
    const scale = excludedReason ? null : Math.max(Math.abs(a.selected!.value!), Math.abs(b.selected!.value!));
    const relativeDifference = delta === null || scale === null ? null : scale === 0 ? 0 : Math.abs(delta) / scale;
    return { key, name: group.name, source: a, peer: b, unit, delta, relativeDifference, timeGapDays,
      numericSimilarity: relativeDifference === null ? null : Math.max(0, 1 - relativeDifference), excludedReason };
  }).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export function meanMeasurementSimilarity(rows: MeasurementComparison[]): number | null {
  const usable = rows.flatMap(r => r.numericSimilarity === null ? [] : [r.numericSimilarity]);
  return usable.length ? usable.reduce((sum, s) => sum + s, 0) / usable.length : null;
}
