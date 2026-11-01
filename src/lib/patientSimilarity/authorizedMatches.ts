import { rankExactPathologyMatches, type ClinicalPatientProfile, type RecordedPathology, type RankedPatientMatch } from './clinicalSimilarity.ts';

/** RLS-filtered identity with no contact details or unrelated patient notes. */
export interface MatchIdentity {
  id: string;
  patientCode: string;
  age: number | null;
  pathologyId: string | null;
}

/** All gateway methods must use the requesting user's Supabase JWT and RLS. */
export interface AuthorizedMatchGateway {
  getSourcePatient: (patientId: string) => Promise<MatchIdentity | null>;
  listSourcePathologies: (patientId: string) => Promise<RecordedPathology[]>;
  listPrimaryMatches: (pathologyId: string) => Promise<MatchIdentity[]>;
  listSecondaryMatchIds: (pathologyId: string) => Promise<string[]>;
  /** A separate `patients` RLS read is mandatory before any clinical enrichment. */
  listVisiblePatients: (candidateIds: string[]) => Promise<MatchIdentity[]>;
  loadProfiles: (authorizedIds: string[]) => Promise<ClinicalPatientProfile[]>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CANDIDATE_IDS = 5000;

/**
 * Checks both source diagnosis ownership and candidate visibility before
 * retrieving any peer's history. A read-only, user-scoped operation.
 */
export async function loadAuthorizedPathologyMatches(
  gateway: AuthorizedMatchGateway,
  sourcePatientId: string,
  selectedPathologyId: string,
): Promise<RankedPatientMatch[]> {
  if (!UUID_PATTERN.test(sourcePatientId) || !UUID_PATTERN.test(selectedPathologyId)) {
    throw new Error('Identifiant de patient ou de pathologie invalide.');
  }

  const source = await gateway.getSourcePatient(sourcePatientId);
  if (!source || source.id !== sourcePatientId) {
    throw new Error('Accès au dossier patient refusé ou dossier introuvable.');
  }
  const sourceLinkedDiagnoses = await gateway.listSourcePathologies(sourcePatientId);
  const ownsPathology = source.pathologyId === selectedPathologyId || sourceLinkedDiagnoses.some(x => x.pathologyId === selectedPathologyId);
  if (!ownsPathology) throw new Error('Cette pathologie ne figure pas parmi les diagnostics du patient.');

  const [primaryPatients, linkedIds] = await Promise.all([
    gateway.listPrimaryMatches(selectedPathologyId),
    gateway.listSecondaryMatchIds(selectedPathologyId),
  ]);
  const candidates = new Set<string>();
  for (const p of primaryPatients) if (p.pathologyId === selectedPathologyId && p.id !== sourcePatientId) candidates.add(p.id);
  for (const id of linkedIds) if (id !== sourcePatientId) candidates.add(id);
  if (candidates.size > MAX_CANDIDATE_IDS) throw new Error('Trop de dossiers à comparer. La recherche exhaustive nécessite une pagination spécialisée.');
  if (candidates.size === 0) return [];

  // Never count or display a matched join-table ID until patients RLS approves it.
  const visible = await gateway.listVisiblePatients([...candidates]);
  const authorizedIds = new Set(visible.filter(p => candidates.has(p.id)).map(p => p.id));
  if (authorizedIds.size === 0) return [];

  const profiles = await gateway.loadProfiles([sourcePatientId, ...authorizedIds]);
  const ownProfile = profiles.find(p => p.id === sourcePatientId);
  if (!ownProfile) throw new Error('Accès aux données cliniques du patient indisponible.');
  const sourceDiagnoses: RecordedPathology[] = [...ownProfile.diagnoses, ...sourceLinkedDiagnoses];
  if (source.pathologyId) sourceDiagnoses.push({ pathologyId: source.pathologyId });
  const sourceWithDiagnoses = { ...ownProfile, diagnoses: sourceDiagnoses };

  const exactPrimaryIds = new Set(primaryPatients.filter(p => p.pathologyId === selectedPathologyId).map(p => p.id));
  const exactSecondaryIds = new Set(linkedIds);
  const peers = profiles
    .filter(p => authorizedIds.has(p.id))
    .map(p => ({
      ...p,
      diagnoses: (exactPrimaryIds.has(p.id) || exactSecondaryIds.has(p.id)) && !p.diagnoses.some(d => d.pathologyId === selectedPathologyId)
        ? [...p.diagnoses, { pathologyId: selectedPathologyId }]
        : p.diagnoses,
    }));
  return rankExactPathologyMatches(sourceWithDiagnoses, selectedPathologyId, peers);
}
