/** Format only verified backend numbers. Missing and invalid values are unknown, not zero. */
export function displayCount(value: number | null | undefined): string {
  if (value == null || !Number.isSafeInteger(value) || value < 0) return '—';
  return new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 }).format(value);
}

export function displayPatientName(patient: {
  first_name?: string | null;
  last_name?: string | null;
  patient_id?: string | null;
}): string {
  const names = [patient.first_name?.trim(), patient.last_name?.trim()].filter(Boolean);
  if (names.length) return names.join(' ');
  return patient.patient_id?.trim() ? `Patient ${patient.patient_id.trim()}` : 'Patient';
}

export function getGreeting(hour: number): string {
  if (hour < 12) return 'Bonjour';
  if (hour < 18) return 'Bon après-midi';
  return 'Bonsoir';
}
