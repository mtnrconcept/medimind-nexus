/** Exact recorded labels only; no abbreviation expansion or diagnostic inference. */
export function normalizeRecordedConditionLabel(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr')
    .replace(/[’‘]/g, "'").replace(/\s+/gu, ' ').trim();
}

export function isValidDate(raw: string | null | undefined): raw is string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const timestamp = Date.parse(raw + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === raw;
}

export function measurementTimestamp(raw: string | null | undefined): number | null {
  if (raw?.length === 10) return isValidDate(raw) ? Date.parse(raw + 'T00:00:00Z') : null;
  if (!raw || !isValidDate(raw.slice(0, 10)) || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(raw)) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : null;
}

export const finiteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const formatNumber = (value: number) => value.toLocaleString('fr-FR', { maximumSignificantDigits: 15 });

export function formatRecordedDate(value: string | null | undefined): string {
  const timestamp = measurementTimestamp(value);
  if (timestamp === null) return value ? `Date inexploitable (${value})` : 'Date non renseignée';
  return new Date(timestamp).toLocaleDateString('fr-FR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function historyKey(item: { name: string; conditionType?: string }): string {
  const label = normalizeRecordedConditionLabel(item.name);
  return label ? `${item.conditionType || 'unspecified'}:${label}` : '';
}

export function medicationKey(item: { substance?: string | null; atcCode?: string | null; medicationId?: string | null }): string {
  const substance = normalizeRecordedConditionLabel(item.substance);
  if (substance) return `substance:${substance}`;
  const atc = item.atcCode?.trim().toUpperCase();
  if (atc) return `atc:${atc}`;
  return item.medicationId ? `id:${item.medicationId.toLowerCase()}` : '';
}
