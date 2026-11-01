import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateSyntheticCohort } from '../src/lib/microSignals/synthetic.ts';

const cohort = generateSyntheticCohort();
const destination = fileURLToPath(new URL('../fixtures/clinical/microsignals-cohort-50.json', import.meta.url));
const individualDirectory = fileURLToPath(new URL('../fixtures/clinical/patients/', import.meta.url));
mkdirSync(individualDirectory, { recursive: true });
writeFileSync(destination, `${JSON.stringify(cohort, null, 2)}\n`, 'utf8');
for (const patient of cohort) {
  writeFileSync(`${individualDirectory}/${patient.id}.json`, `${JSON.stringify(patient, null, 2)}\n`, 'utf8');
}
console.log(`Wrote ${cohort.length} independent synthetic dossiers and manifest to ${destination}`);
