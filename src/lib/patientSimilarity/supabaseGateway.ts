import { supabase } from '@/integrations/supabase/client';
import type { AuthorizedMatchGateway, MatchIdentity } from './authorizedMatches';
import type { ClinicalPatientProfile, RecordedPathology } from './clinicalSimilarity';

// PostgREST limits response size by default, so always page and keep stable ordering.
const PAGE_SIZE = 200;
const MAX_ROWS_PER_QUERY = 10_000;
const IDS_PER_BATCH = 70;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

async function readPages<T>(request: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < MAX_ROWS_PER_QUERY; offset += PAGE_SIZE) {
    const result = await request(offset, offset + PAGE_SIZE - 1);
    if (result.error) throw new Error('Impossible de consulter les dossiers autorisés.');
    const chunk = result.data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return rows;
  }
  throw new Error('Résultat trop volumineux pour une comparaison exhaustive. Contactez un administrateur pour affiner la recherche.');
}

async function readBatches<T>(
  ids: string[],
  request: (batch: string[], from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < ids.length; offset += IDS_PER_BATCH) {
    const batch = ids.slice(offset, offset + IDS_PER_BATCH);
    rows.push(...await readPages((from, to) => request(batch, from, to)));
  }
  return rows;
}

type RawPatient = { id: string; patient_id: string; age: number | null; pathology_id: string | null };
type PathologyRow = { patient_id: string; pathology_id: string; diagnosis_date: string | null };

type HistoryRow = { patient_id: string; condition_name: string; diagnosis_date: string | null };
type MedicationRelation = { name: string | null; substance: string | null; atc_code: string | null };
type MedicationRow = { patient_id: string; medication_id: string; medications: MedicationRelation | MedicationRelation[] | null };
type LabRow = {
  patient_id: string; test_name: string; test_date: string | null;
  value: number | null; unit: string | null; reference_min: number | null;
  reference_max: number | null; is_abnormal: boolean | null;
};
type SymptomRow = { patient_id: string; symptom_id: string };
type PathologyName = { id: string; name: string };

function identity(p: RawPatient): MatchIdentity {
  return { id: p.id, patientCode: p.patient_id, age: p.age, pathologyId: p.pathology_id };
}

/** Uses only the user-session publishable Supabase client; every patient-related table is RLS-protected. */
export function createSupabaseMatchGateway(): AuthorizedMatchGateway {
  return {
    async getSourcePatient(id) {
      // Auth must be verified server-side by Supabase, not assumed from the UI route.
      const { data: session, error: authError } = await supabase.auth.getUser();
      if (authError || !session.user) throw new Error('Session expirée. Veuillez vous reconnecter.');
      const { data, error } = await supabase.from('patients')
        .select('id,patient_id,age,pathology_id').eq('id', id).maybeSingle();
      if (error) throw new Error('Impossible de vérifier votre accès au dossier.');
      return data ? identity(data) : null;
    },

    async listSourcePathologies(patientId) {
      const rows = await readPages((from, to) => supabase.from('patient_pathologies')
        .select('patient_id,pathology_id,diagnosis_date').eq('patient_id', patientId)
        .order('id', { ascending: true }).range(from, to));
      return rows.map((r: PathologyRow) => ({ pathologyId: r.pathology_id, diagnosedAt: r.diagnosis_date }));
    },

    async listPrimaryMatches(pathologyId) {
      const rows = await readPages((from, to) => supabase.from('patients')
        .select('id,patient_id,age,pathology_id').eq('pathology_id', pathologyId)
        .order('id', { ascending: true }).range(from, to));
      return rows.map(identity);
    },

    async listSecondaryMatchIds(pathologyId) {
      const rows = await readPages((from, to) => supabase.from('patient_pathologies')
        .select('patient_id').eq('pathology_id', pathologyId)
        .order('id', { ascending: true }).range(from, to));
      return rows.map(x => x.patient_id);
    },

    async listVisiblePatients(ids) {
      if (!ids.length) return [];
      const rows = await readBatches(ids, (batch, from, to) => supabase.from('patients')
        .select('id,patient_id,age,pathology_id').in('id', batch)
        .order('id', { ascending: true }).range(from, to));
      return rows.map(identity);
    },

    async loadProfiles(authorizedIds) {
      if (!authorizedIds.length) return [];
      // The profiles are loaded only after patients-RLS has independently approved all candidate IDs.
      const [people, pathologies, histories, meds, labs, symptoms] = await Promise.all([
        readBatches(authorizedIds, (batch, from, to) => supabase.from('patients')
          .select('id,patient_id,age,pathology_id').in('id', batch)
          .order('id', { ascending: true }).range(from, to)),
        readBatches(authorizedIds, (batch, from, to) => supabase.from('patient_pathologies')
          .select('patient_id,pathology_id,diagnosis_date').in('patient_id', batch)
          .order('id', { ascending: true }).range(from, to)),
        readBatches(authorizedIds, (batch, from, to) => supabase.from('patient_medical_history')
          .select('patient_id,condition_name,diagnosis_date').in('patient_id', batch)
          .order('id', { ascending: true }).range(from, to)),
        readBatches(authorizedIds, (batch, from, to) => supabase.from('patient_medications')
          .select('patient_id,medication_id,medications(name,substance,atc_code)').in('patient_id', batch)
          .order('id', { ascending: true }).range(from, to)),
        readBatches(authorizedIds, (batch, from, to) => supabase.from('patient_lab_results')
          .select('patient_id,test_name,test_date,value,unit,reference_min,reference_max,is_abnormal').in('patient_id', batch)
          .order('id', { ascending: true }).range(from, to)),
        readBatches(authorizedIds, (batch, from, to) => supabase.from('patient_symptoms')
          .select('patient_id,symptom_id').in('patient_id', batch)
          .order('id', { ascending: true }).range(from, to)),
      ]);

      const diagnosisIds = [...new Set([
        ...people.map(x => x.pathology_id),
        ...pathologies.map(x => x.pathology_id),
      ].filter((x): x is string => typeof x === 'string' && x.length > 0))];
      const pathologyNames = new Map<string, string>();
      for (let i = 0; i < diagnosisIds.length; i += IDS_PER_BATCH) {
        const batch = diagnosisIds.slice(i, i + IDS_PER_BATCH);
        const labels = await readPages((from, to) => supabase.from('pathologies')
          .select('id,name').in('id', batch).order('id', { ascending: true }).range(from, to));
        for (const row of labels as PathologyName[]) pathologyNames.set(row.id, row.name);
      }

      function group<T extends { patient_id: string }>(rows: T[]): Map<string, T[]> {
        const map = new Map<string, T[]>();
        for (const r of rows) {
          const list = map.get(r.patient_id) ?? [];
          list.push(r);
          map.set(r.patient_id, list);
        }
        return map;
      }
      const perPatient = {
        pathologies: group(pathologies as PathologyRow[]),
        history: group(histories as HistoryRow[]),
        medications: group(meds as MedicationRow[]),
        labs: group(labs as LabRow[]),
        symptoms: group(symptoms as SymptomRow[]),
      };

      return (people as RawPatient[]).map(p => {
        const diagnoses: RecordedPathology[] = (perPatient.pathologies.get(p.id) ?? []).map(x => ({
          pathologyId: x.pathology_id,
          name: pathologyNames.get(x.pathology_id),
          diagnosedAt: x.diagnosis_date,
        }));
        if (p.pathology_id && !diagnoses.some(x => x.pathologyId === p.pathology_id)) {
          diagnoses.push({ pathologyId: p.pathology_id, name: pathologyNames.get(p.pathology_id) });
        }
        const profile: ClinicalPatientProfile = {
          id: p.id,
          patientCode: p.patient_id,
          age: p.age,
          diagnoses,
          history: (perPatient.history.get(p.id) ?? []).map(x => ({ name: x.condition_name, diagnosisDate: x.diagnosis_date })),
          medications: (perPatient.medications.get(p.id) ?? []).map(x => {
            const relation = Array.isArray(x.medications) ? x.medications[0] : x.medications;
            return { substance: relation?.substance || relation?.name, atcCode: relation?.atc_code, medicationId: x.medication_id };
          }),
          labs: (perPatient.labs.get(p.id) ?? []).map(x => ({
            name: x.test_name, measuredAt: x.test_date, unit: x.unit,
            value: x.value === null ? null : Number(x.value),
            referenceMin: x.reference_min === null ? null : Number(x.reference_min),
            referenceMax: x.reference_max === null ? null : Number(x.reference_max),
            isAbnormal: x.is_abnormal,
          })),
          symptoms: (perPatient.symptoms.get(p.id) ?? []).map(x => ({ id: x.symptom_id })),
        };
        return profile;
      });
    },
  };
}
