export type ClinicalRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ClinicalReasoningEffort = 'none' | 'low' | 'medium' | 'high' | 'xhigh';
export type ClinicalTask =
  | 'simple_lookup'
  | 'official_label_summary'
  | 'known_interaction'
  | 'suspected_interaction'
  | 'polypharmacy'
  | 'treatment_general'
  | 'treatment_complex'
  | 'final_safety_review';

export interface ClinicalEntity {
  name?: unknown;
  substance?: unknown;
  atc_code?: unknown;
  description?: unknown;
  indications?: unknown;
  contraindications?: unknown;
}

export interface ClinicalRiskInput {
  pathologies?: ClinicalEntity[];
  symptoms?: ClinicalEntity[];
  treatments?: ClinicalEntity[];
  medications?: ClinicalEntity[];
  patientCount?: number;
  selectedElementCount?: number;
  freeText?: string;
}

export interface ClinicalRiskAssessment {
  riskLevel: ClinicalRiskLevel;
  flags: string[];
  reasons: string[];
  highRiskTerms: string[];
  requiresHumanValidation: boolean;
  requiresSecondPass: boolean;
}

export interface ClinicalModelRouteInput {
  task: ClinicalTask;
  riskAssessment: ClinicalRiskAssessment;
  elementCount?: number;
  hasExternalEvidence?: boolean;
}

export interface ClinicalModelEnv {
  OPENAI_MODEL?: string;
  OPENAI_CLINICAL_SIMPLE_MODEL?: string;
  OPENAI_CLINICAL_STANDARD_MODEL?: string;
  OPENAI_CLINICAL_CRITICAL_MODEL?: string;
  OPENAI_CLINICAL_FINAL_REVIEW_MODEL?: string;
}

export interface ClinicalModelRoute {
  model: string;
  reasoningEffort: ClinicalReasoningEffort;
  timeoutMs: number;
  finalReviewRequired: boolean;
  routeReason: string;
}

export interface ClinicalPromptProfile {
  isClinical: boolean;
  task: ClinicalTask;
  elementCount: number;
  hasExternalEvidence: boolean;
}

export const CLINICAL_RESPONSE_CONTRACT = `## CONTRAT CLINIQUE VERIFIABLE
- La base de donnees interne, les notices officielles et les sources citees sont la source de verite; le modele ne doit pas inventer.
- Distinguer explicitement: preuve confirmee, interaction theorique, absence de donnee, donnees contradictoires.
- Toute affirmation clinique importante doit etre reliee a une preuve interne ou externe; sinon indiquer l'incertitude.
- En contexte critique, polypharmacie, grossesse, enfant, sujet age, insuffisance renale/hepatique ou medicament a marge etroite, exiger validation humaine.
- Ne jamais produire une prescription personnalisee definitive, une posologie nouvelle ou une modification de traitement sans validation medicale.
- Les recommandations doivent etre actionnables, prudentes et exprimees comme aide a la decision clinique.`;

const HIGH_RISK_MEDICATION_TERMS = [
  'warfarin',
  'coumadine',
  'coumadin',
  'acenocoumarol',
  'sintrom',
  'apixaban',
  'eliquis',
  'rivaroxaban',
  'xarelto',
  'dabigatran',
  'pradaxa',
  'edoxaban',
  'heparin',
  'heparine',
  'opioid',
  'opioide',
  'morphine',
  'oxycodone',
  'fentanyl',
  'tramadol',
  'benzodiazepine',
  'diazepam',
  'alprazolam',
  'lorazepam',
  'clonazepam',
  'amiodarone',
  'flecainide',
  'sotalol',
  'digoxin',
  'lithium',
  'methotrexate',
  'insulin',
  'insuline',
  'glibenclamide',
  'gliclazide',
  'glimepiride',
  'tacrolimus',
  'ciclosporin',
  'cyclosporine',
  'sandimmun',
  'prednisone',
  'prednisolone',
  'corticosteroid',
  'corticoide',
  'immunosuppress',
  'anti epileptic',
  'antiepileptique',
  'valproate',
  'carbamazepine',
  'phenytoin',
];

const VULNERABLE_CONTEXT_TERMS = [
  'grossesse',
  'pregnancy',
  'enceinte',
  'allaitement',
  'breastfeeding',
  'enfant',
  'child',
  'pediatric',
  'paediatric',
  'nourrisson',
  'bebe',
  'age',
  'elderly',
  'geriatric',
  'personne agee',
  'insuffisance renale',
  'renal failure',
  'renal impairment',
  'kidney failure',
  'dialyse',
  'insuffisance hepatique',
  'hepatic impairment',
  'cirrhose',
  'liver failure',
  'immunodeprime',
  'immunosuppression',
];

const CRITICAL_CONTEXT_TERMS = [
  'anaphylaxie',
  'anaphylaxis',
  'hemorragie',
  'bleeding',
  'suicidaire',
  'suicide',
  'overdose',
  'surdosage',
  'sepsis',
  'choc',
  'arrhythmie',
  'torsades',
  'qt long',
  'respiratory depression',
  'depression respiratoire',
  'neutropenie',
  'agranulocytose',
];

const CLINICAL_PROMPT_TERMS = [
  'medical',
  'clinical',
  'clinique',
  'patient',
  'patients',
  'pathologie',
  'pathology',
  'disease',
  'symptome',
  'symptom',
  'traitement',
  'treatment',
  'medicament',
  'medication',
  'drug',
  'molecule',
  'substance',
  'interaction',
  'contre indication',
  'contraindication',
  'effet indesirable',
  'side effect',
  'diagnostic',
  'therapeutic',
  'pharmacologie',
  'pharmacology',
  'pubmed',
  'swissmedic',
  'openfda',
  'ansm',
  'knowledge graph',
  'cde',
  'lbd',
  'hypothese',
  'hypothesis',
  'evidence',
  'preuve',
];

function normalizeClinicalText(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

function entityToText(entity: ClinicalEntity): string {
  const parts = [
    entity.name,
    entity.substance,
    entity.atc_code,
    entity.description,
    entity.indications,
  ];

  if (Array.isArray(entity.contraindications)) {
    parts.push(entity.contraindications.join(' '));
  } else {
    parts.push(entity.contraindications);
  }

  return parts.map(normalizeClinicalText).filter(Boolean).join(' ');
}

function matchTerms(text: string, terms: string[]): string[] {
  return terms.filter((term) => text.includes(normalizeClinicalText(term)));
}

function uniq(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function countDistinctClinicalTerms(text: string): number {
  return matchTerms(text, CLINICAL_PROMPT_TERMS).length;
}

function maxRisk(left: ClinicalRiskLevel, right: ClinicalRiskLevel): ClinicalRiskLevel {
  const order: ClinicalRiskLevel[] = ['low', 'medium', 'high', 'critical'];
  return order.indexOf(right) > order.indexOf(left) ? right : left;
}

export function profileClinicalPrompt(
  freeText: string,
  explicitTask?: ClinicalTask,
  elementCount = 0,
): ClinicalPromptProfile {
  const text = normalizeClinicalText(freeText);
  const isClinical = countDistinctClinicalTerms(text) >= 2;
  const hasExternalEvidence = /\b(pubmed|doi|pmid|source|sources|evidence|preuve|swissmedic|openfda|ansm|drugbank)\b/.test(text);
  const denseGraph = elementCount >= 6 || /\b(polypharmacie|polypharmacy|multi drug|multi medication|graphe dense|dense graph)\b/.test(text);
  let task: ClinicalTask = explicitTask || 'suspected_interaction';

  if (!explicitTask) {
    if (/\b(final review|seconde verification|validation finale|safety review)\b/.test(text)) {
      task = 'final_safety_review';
    } else if (denseGraph) {
      task = 'polypharmacy';
    } else if (/\b(schema therapeutique|treatment schema|therapeutic plan|plan therapeutique)\b/.test(text)) {
      task = 'treatment_complex';
    } else if (/\b(notice officielle|official label|monographie|label summary)\b/.test(text)) {
      task = 'official_label_summary';
    } else if (/\b(interaction connue|known interaction|contre indication|contraindication)\b/.test(text)) {
      task = 'known_interaction';
    } else if (/\b(questionnaire|simple lookup|recherche simple|lookup)\b/.test(text)) {
      task = 'simple_lookup';
    }
  }

  return {
    isClinical,
    task,
    elementCount,
    hasExternalEvidence,
  };
}

export function detectHighRiskContext(input: ClinicalRiskInput): ClinicalRiskAssessment {
  const medicationText = (input.medications || []).map(entityToText).join(' ');
  const allText = [
    medicationText,
    ...(input.pathologies || []).map(entityToText),
    ...(input.symptoms || []).map(entityToText),
    ...(input.treatments || []).map(entityToText),
    normalizeClinicalText(input.freeText),
  ].join(' ');

  const highRiskMedicationMatches = matchTerms(medicationText, HIGH_RISK_MEDICATION_TERMS);
  const vulnerableMatches = matchTerms(allText, VULNERABLE_CONTEXT_TERMS);
  const criticalMatches = matchTerms(allText, CRITICAL_CONTEXT_TERMS);
  const flags: string[] = [];
  const reasons: string[] = [];
  let riskLevel: ClinicalRiskLevel = 'low';

  if (highRiskMedicationMatches.length > 0) {
    riskLevel = maxRisk(riskLevel, 'high');
    flags.push('high_risk_medication');
    reasons.push(`Medicaments a risque detectes: ${uniq(highRiskMedicationMatches).join(', ')}`);
  }

  if (vulnerableMatches.length > 0) {
    riskLevel = maxRisk(riskLevel, 'high');
    flags.push('vulnerable_context');
    reasons.push(`Contexte patient vulnerable detecte: ${uniq(vulnerableMatches).join(', ')}`);
  }

  if (criticalMatches.length > 0) {
    riskLevel = maxRisk(riskLevel, 'critical');
    flags.push('critical_clinical_context');
    reasons.push(`Contexte critique detecte: ${uniq(criticalMatches).join(', ')}`);
  }

  if ((input.medications?.length || 0) >= 3 || (input.selectedElementCount || 0) >= 6) {
    riskLevel = maxRisk(riskLevel, 'high');
    flags.push('polypharmacy_or_dense_graph');
    reasons.push('Polypharmacie ou graphe clinique dense necessitant une verification renforcee.');
  }

  if ((input.patientCount || 0) >= 50) {
    riskLevel = maxRisk(riskLevel, 'medium');
    flags.push('large_patient_context');
    reasons.push('Volume patient eleve: limiter les conclusions non prouvees et verifier les agregats.');
  }

  return {
    riskLevel,
    flags: uniq(flags),
    reasons: uniq(reasons),
    highRiskTerms: uniq([...highRiskMedicationMatches, ...vulnerableMatches, ...criticalMatches]),
    requiresHumanValidation: riskLevel === 'high' || riskLevel === 'critical',
    requiresSecondPass: riskLevel === 'critical' || flags.includes('polypharmacy_or_dense_graph'),
  };
}

export function getClinicalModelEnv(getEnv: (key: string) => string | undefined): ClinicalModelEnv {
  return {
    OPENAI_MODEL: getEnv('OPENAI_MODEL'),
    OPENAI_CLINICAL_SIMPLE_MODEL: getEnv('OPENAI_CLINICAL_SIMPLE_MODEL'),
    OPENAI_CLINICAL_STANDARD_MODEL: getEnv('OPENAI_CLINICAL_STANDARD_MODEL'),
    OPENAI_CLINICAL_CRITICAL_MODEL: getEnv('OPENAI_CLINICAL_CRITICAL_MODEL'),
    OPENAI_CLINICAL_FINAL_REVIEW_MODEL: getEnv('OPENAI_CLINICAL_FINAL_REVIEW_MODEL'),
  };
}

export function selectClinicalModel(
  input: ClinicalModelRouteInput,
  env: ClinicalModelEnv = {},
): ClinicalModelRoute {
  const simpleModel = env.OPENAI_CLINICAL_SIMPLE_MODEL || 'gpt-5.4-mini';
  const standardModel = env.OPENAI_CLINICAL_STANDARD_MODEL || env.OPENAI_MODEL || 'gpt-5.5';
  const criticalModel = env.OPENAI_CLINICAL_CRITICAL_MODEL || standardModel;
  const finalReviewModel = env.OPENAI_CLINICAL_FINAL_REVIEW_MODEL || criticalModel;
  const elementCount = input.elementCount || 0;
  const isComplex =
    input.task === 'polypharmacy' ||
    input.task === 'treatment_complex' ||
    input.task === 'final_safety_review' ||
    input.riskAssessment.riskLevel === 'critical' ||
    elementCount >= 6;

  if (input.task === 'simple_lookup' && input.riskAssessment.riskLevel === 'low') {
    return {
      model: simpleModel,
      reasoningEffort: 'low',
      timeoutMs: 30_000,
      finalReviewRequired: false,
      routeReason: 'simple deterministic lookup with low clinical risk',
    };
  }

  if (
    input.task === 'official_label_summary' ||
    input.task === 'known_interaction' ||
    input.task === 'treatment_general'
  ) {
    return {
      model: standardModel,
      reasoningEffort: input.riskAssessment.riskLevel === 'low' ? 'medium' : 'high',
      timeoutMs: 60_000,
      finalReviewRequired: input.riskAssessment.requiresSecondPass,
      routeReason: 'standard clinical synthesis from known evidence',
    };
  }

  if (isComplex) {
    return {
      model: input.task === 'final_safety_review' ? finalReviewModel : criticalModel,
      reasoningEffort: input.riskAssessment.riskLevel === 'critical' ? 'xhigh' : 'high',
      timeoutMs: 120_000,
      finalReviewRequired: true,
      routeReason: 'complex or high-risk clinical reasoning requires strongest configured model',
    };
  }

  return {
    model: standardModel,
    reasoningEffort: input.hasExternalEvidence ? 'high' : 'medium',
    timeoutMs: 90_000,
    finalReviewRequired: input.riskAssessment.requiresSecondPass,
    routeReason: 'suspected interaction or cross-data synthesis',
  };
}

export function buildClinicalSystemPrompt(
  basePrompt: string,
  riskAssessment: ClinicalRiskAssessment,
): string {
  const riskBlock = `## EVALUATION DE RISQUE CLINIQUE PREALABLE
- Niveau: ${riskAssessment.riskLevel}
- Flags: ${riskAssessment.flags.length ? riskAssessment.flags.join(', ') : 'aucun'}
- Motifs: ${riskAssessment.reasons.length ? riskAssessment.reasons.join(' | ') : 'aucun motif critique detecte'}
- Validation humaine requise: ${riskAssessment.requiresHumanValidation ? 'oui' : 'non'}
- Seconde verification requise: ${riskAssessment.requiresSecondPass ? 'oui' : 'non'}`;

  return `${basePrompt}\n\n${CLINICAL_RESPONSE_CONTRACT}\n\n${riskBlock}`;
}

export function applyClinicalSafetyContract<T extends {
  warnings?: string[];
  recommendations?: string[];
  summary?: string;
  clinicalSafety?: ClinicalRiskAssessment;
}>(
  analysis: T,
  riskAssessment: ClinicalRiskAssessment,
): T {
  const warnings = Array.isArray(analysis.warnings) ? [...analysis.warnings] : [];
  const recommendations = Array.isArray(analysis.recommendations) ? [...analysis.recommendations] : [];

  if (riskAssessment.requiresHumanValidation) {
    warnings.unshift(
      `Validation medicale requise avant toute decision therapeutique (niveau de risque: ${riskAssessment.riskLevel}).`,
    );
  }

  if (riskAssessment.requiresSecondPass) {
    warnings.unshift('Verification clinique renforcee requise: contexte critique, polypharmacie ou graphe dense.');
  }

  if (!recommendations.some((item) => normalizeClinicalText(item).includes('source'))) {
    recommendations.push('Verifier les sources officielles et la base interne avant toute modification de traitement.');
  }

  if (!recommendations.some((item) => normalizeClinicalText(item).includes('validation'))) {
    recommendations.push('Faire valider les conclusions par un professionnel de sante habilite.');
  }

  return {
    ...analysis,
    warnings: uniq(warnings),
    recommendations: uniq(recommendations),
    clinicalSafety: riskAssessment,
  };
}
