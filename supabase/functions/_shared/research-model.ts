import type { AICallOptions } from './ai-client.ts';
import { resolveAIOutputTokens } from './ai-policy.ts';

export const RESEARCH_MODEL = 'gpt-6-astra';

/** Primary biomedical sources already used by the cross-analysis agent. */
export const MEDICAL_WEB_DOMAINS = [
  'swissmedic.ch', 'swissmedicinfo-pro.ch', 'swissmedicinfo.ch', 'compendium.ch',
  'ema.europa.eu', 'fda.gov', 'accessdata.fda.gov', 'dailymed.nlm.nih.gov',
  'pubmed.ncbi.nlm.nih.gov', 'pmc.ncbi.nlm.nih.gov', 'europepmc.org',
  'nice.org.uk', 'has-sante.fr', 'ansm.sante.fr', 'base-donnees-publique.medicaments.gouv.fr',
  'who.int', 'cdc.gov', 'clinicaltrials.gov', 'kdigo.org', 'escardio.org',
  'eular.org', 'ginasthma.org', 'hug.ch', 'hcuge.ch', 'atcddd.fhi.no',
] as const;

type ResearchOptions = Omit<AICallOptions, 'model' | 'forceModel' | 'skipClinicalBrain' | 'enforceClinicalContract'>;

/**
 * Scientific synthesis must not depend on a keyword guessed from its prompt to
 * receive Astra. Keep the clinical contract/risk assessment enabled; only model
 * selection is fixed. Extraction, translation and simple lookups do not use this.
 * The caller still owns source retrieval, its output contract and durable jobs.
 */
export function researchAIOptions(options: ResearchOptions = {}): AICallOptions {
  const reasoningEffort = options.reasoningEffort === 'max' || options.reasoningEffort === 'xhigh'
    ? options.reasoningEffort : 'high';
  return {
    ...options,
    model: RESEARCH_MODEL,
    forceModel: true,
    clinicalTask: options.clinicalTask ?? 'research_synthesis',
    enforceClinicalContract: true,
    skipClinicalBrain: false,
    reasoningEffort,
    maxTokens: resolveAIOutputTokens({ ...options, reasoningEffort }),
  };
}
