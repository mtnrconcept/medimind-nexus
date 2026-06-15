export type MedicalEntityType = 'symptom' | 'pathology' | 'treatment' | 'medication';
export type Probability = 'high' | 'medium' | 'low';
export type DangerLevel = 'critical' | 'high' | 'moderate' | 'low';
export type EffectType = 'therapeutic' | 'adverse' | 'both';
export type InteractionType = 'drug-drug' | 'drug-treatment' | 'pathology-danger';
export type SymptomFrequency = 'principal' | 'frequent' | 'possible' | 'rare';

export interface CausalLink {
  from: string;
  fromType: MedicalEntityType;
  to: string;
  toType: MedicalEntityType;
  relationship: string;
  probability: Probability;
  evidence: string;
  patientCount: number;
  webSources: string[];
  isAppropriate?: boolean;
  effectType?: EffectType;
  therapeuticDetails?: string;
  adverseDetails?: string;
  dangerLevel?: DangerLevel;
  interactionType?: InteractionType;
  symptomFrequency?: SymptomFrequency;
}

export interface Alternative {
  for: string;
  forType: string;
  reason: string;
  suggestions: string[];
  evidence?: string;
}

export interface ProposedChange {
  action: 'replace' | 'remove' | 'add';
  target: string;
  targetType: 'medication' | 'treatment';
  reason: string;
  replacement?: string;
  replacementType?: 'medication' | 'treatment';
  improvementScore: number;
}

export interface SchemaStats {
  redLinks: number;
  orangeLinks: number;
  greenLinks: number;
  totalDangerScore: number;
  inappropriateCount: number;
  adverseEffectCount: number;
}

export interface SchemaComparison {
  currentScore: number;
  proposedScore: number;
  improvementPercent: number;
  currentStats: SchemaStats;
  proposedStats: SchemaStats;
  proposedChanges: ProposedChange[];
  benefitRiskRatio: { current: number; proposed: number };
  clinicalSummary: string;
}

export interface TreatmentSchemaStep {
  action: 'keep' | 'replace' | 'remove' | 'add' | 'monitor';
  target: string;
  targetType: 'medication' | 'treatment' | 'monitoring';
  replacement?: string;
  rationale: string;
  monitoring?: string[];
  riskMitigation?: string[];
}

export interface TreatmentSchema {
  title: string;
  priority: 'preferred' | 'alternative' | 'cautious';
  rationale: string;
  expectedBenefits: string[];
  residualRisks: string[];
  steps: TreatmentSchemaStep[];
  monitoringPlan: string[];
  patientWarnings: string[];
  confidence: Probability;
}

export interface AnalysisResult {
  causalLinks: CausalLink[];
  summary: string;
  warnings: string[];
  recommendations: string[];
  alternatives: Alternative[];
  schemaComparison?: SchemaComparison;
  treatmentSchemas?: TreatmentSchema[];
  webResearch: {
    query: string;
    findings: string[];
    sources: { title: string; url: string }[];
  }[];
}

export interface SelectedElement {
  name: string;
  type: MedicalEntityType;
}

interface BuildEvidenceLinksInput {
  pathologies: any[];
  symptoms: any[];
  treatments: any[];
  medications: any[];
  symptomLinks: any[];
}

export const OPENAI_CROSS_DATA_MODEL = 'gpt-5.5-pro';
export const OPENAI_CROSS_DATA_REASONING_EFFORT = 'xhigh';

const VALID_TYPES: MedicalEntityType[] = ['symptom', 'pathology', 'treatment', 'medication'];
const VALID_PROBABILITIES: Probability[] = ['high', 'medium', 'low'];
const VALID_DANGER_LEVELS: DangerLevel[] = ['critical', 'high', 'moderate', 'low'];
const VALID_EFFECT_TYPES: EffectType[] = ['therapeutic', 'adverse', 'both'];
const VALID_INTERACTION_TYPES: InteractionType[] = ['drug-drug', 'drug-treatment', 'pathology-danger'];
const VALID_SYMPTOM_FREQUENCIES: SymptomFrequency[] = ['principal', 'frequent', 'possible', 'rare'];

export function normalizeMedicalName(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}

function typedKey(name: string, type: string): string {
  return `${type}:${normalizeMedicalName(name)}`;
}

export function directionalLinkKey(link: Pick<CausalLink, 'from' | 'fromType' | 'to' | 'toType'>): string {
  return `${typedKey(link.from, link.fromType)}->${typedKey(link.to, link.toType)}`;
}

function undirectedLinkKey(link: Pick<CausalLink, 'from' | 'fromType' | 'to' | 'toType'>): string {
  return [typedKey(link.from, link.fromType), typedKey(link.to, link.toType)].sort().join('<>');
}

function coerceEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function coerceString(value: unknown, fallback = ''): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function isSameEntity(aName: string, aType: string, bName: string, bType: string): boolean {
  return aType === bType && normalizeMedicalName(aName) === normalizeMedicalName(bName);
}

function buildSelectedIndex(elements: SelectedElement[]): Map<string, SelectedElement> {
  const index = new Map<string, SelectedElement>();
  for (const element of elements) {
    if (!element.name || !VALID_TYPES.includes(element.type)) continue;
    index.set(typedKey(element.name, element.type), element);
  }
  return index;
}

function findSelectedElement(index: Map<string, SelectedElement>, name: unknown, type: unknown): SelectedElement | null {
  if (typeof type !== 'string' || !VALID_TYPES.includes(type as MedicalEntityType)) return null;
  return index.get(typedKey(String(name || ''), type)) || null;
}

function evidenceRank(link: CausalLink): number {
  let score = 0;
  if (link.dangerLevel === 'critical') score += 100;
  if (link.dangerLevel === 'high') score += 80;
  if (link.dangerLevel === 'moderate') score += 45;
  if (link.isAppropriate === false) score += 70;
  if (link.interactionType === 'drug-drug') score += 45;
  if (link.probability === 'high') score += 25;
  if (link.probability === 'medium') score += 10;
  if (link.webSources.length > 0) score += 8;
  if (link.evidence.length > 80) score += 6;
  return score;
}

export function normalizeCausalLink(rawLink: unknown, selectedElements: SelectedElement[]): CausalLink | null {
  const raw = rawLink as Partial<CausalLink> | null;
  if (!raw || typeof raw !== 'object') return null;

  const index = buildSelectedIndex(selectedElements);
  const from = findSelectedElement(index, raw.from, raw.fromType);
  const to = findSelectedElement(index, raw.to, raw.toType);
  if (!from || !to) return null;
  if (isSameEntity(from.name, from.type, to.name, to.type)) return null;

  const normalized: CausalLink = {
    from: from.name,
    fromType: from.type,
    to: to.name,
    toType: to.type,
    relationship: coerceString(raw.relationship, 'Relation clinique a verifier'),
    probability: coerceEnum(raw.probability, VALID_PROBABILITIES, 'medium'),
    evidence: coerceString(raw.evidence, 'Relation clinique retenue par analyse croisee.'),
    patientCount: typeof raw.patientCount === 'number' && Number.isFinite(raw.patientCount)
      ? Math.max(0, Math.round(raw.patientCount))
      : 0,
    webSources: Array.isArray(raw.webSources) ? raw.webSources.filter((source): source is string => typeof source === 'string') : [],
  };

  if (typeof raw.isAppropriate === 'boolean') normalized.isAppropriate = raw.isAppropriate;
  if (raw.effectType) normalized.effectType = coerceEnum(raw.effectType, VALID_EFFECT_TYPES, 'adverse');
  if (raw.therapeuticDetails) normalized.therapeuticDetails = coerceString(raw.therapeuticDetails);
  if (raw.adverseDetails) normalized.adverseDetails = coerceString(raw.adverseDetails);
  if (raw.dangerLevel) normalized.dangerLevel = coerceEnum(raw.dangerLevel, VALID_DANGER_LEVELS, 'moderate');
  if (raw.interactionType) normalized.interactionType = coerceEnum(raw.interactionType, VALID_INTERACTION_TYPES, 'pathology-danger');
  if (raw.symptomFrequency) normalized.symptomFrequency = coerceEnum(raw.symptomFrequency, VALID_SYMPTOM_FREQUENCIES, 'possible');

  if (normalized.fromType === 'pathology' && normalized.toType === 'symptom') {
    delete normalized.isAppropriate;
    delete normalized.effectType;
    delete normalized.dangerLevel;
    delete normalized.interactionType;
    normalized.symptomFrequency ||= 'possible';
  }

  const isMedicationOrTreatment = normalized.fromType === 'medication' || normalized.fromType === 'treatment';
  const isTherapeuticAppropriatenessLink = isMedicationOrTreatment && normalized.toType === 'pathology';

  if (!isTherapeuticAppropriatenessLink) {
    delete normalized.isAppropriate;
  }

  if (isTherapeuticAppropriatenessLink) {
    normalized.effectType ||= normalized.isAppropriate === false ? 'adverse' : 'therapeutic';
    if (normalized.isAppropriate === false) {
      normalized.dangerLevel ||= 'moderate';
      normalized.interactionType ||= 'pathology-danger';
    }
  }

  if (normalized.fromType === 'medication' && normalized.toType === 'symptom') {
    normalized.effectType ||= 'adverse';
  }

  if (normalized.fromType === 'medication' && normalized.toType === 'medication') {
    normalized.interactionType ||= 'drug-drug';
    normalized.dangerLevel ||= normalized.probability === 'high' ? 'high' : 'moderate';
  }

  return normalized;
}

export function mergeAndValidateLinks(
  selectedElements: SelectedElement[],
  ...linkGroups: Array<unknown[] | undefined>
): CausalLink[] {
  const merged = new Map<string, CausalLink>();

  for (const links of linkGroups) {
    for (const rawLink of links || []) {
      const link = normalizeCausalLink(rawLink, selectedElements);
      if (!link) continue;
      const key = link.interactionType === 'drug-drug' ? undirectedLinkKey(link) : directionalLinkKey(link);
      const existing = merged.get(key);
      if (!existing || evidenceRank(link) > evidenceRank(existing)) merged.set(key, link);
    }
  }

  return [...merged.values()].sort((a, b) => evidenceRank(b) - evidenceRank(a));
}

export function computeSchemaStats(links: CausalLink[]): SchemaStats {
  const stats: SchemaStats = {
    redLinks: 0,
    orangeLinks: 0,
    greenLinks: 0,
    totalDangerScore: 0,
    inappropriateCount: 0,
    adverseEffectCount: 0,
  };

  for (const link of links) {
    if (link.dangerLevel === 'critical') {
      stats.redLinks += 1;
      stats.totalDangerScore += 100;
    } else if (link.dangerLevel === 'high') {
      stats.redLinks += 1;
      stats.totalDangerScore += 75;
    } else if (link.dangerLevel === 'moderate') {
      stats.orangeLinks += 1;
      stats.totalDangerScore += 40;
    } else if (link.dangerLevel === 'low') {
      stats.orangeLinks += 1;
      stats.totalDangerScore += 15;
    }

    if (link.isAppropriate === false) stats.inappropriateCount += 1;
    if (link.effectType === 'adverse' || link.effectType === 'both') stats.adverseEffectCount += 1;

    if (
      link.isAppropriate === true ||
      link.effectType === 'therapeutic' ||
      link.symptomFrequency === 'principal' ||
      link.symptomFrequency === 'frequent'
    ) {
      stats.greenLinks += 1;
    }
  }

  return stats;
}

export function scoreFromStats(stats: SchemaStats): number {
  return Math.max(0, Math.min(100, Math.round(100 - (stats.redLinks * 20 + stats.orangeLinks * 10 + stats.inappropriateCount * 15))));
}

function buildFallbackChange(link: CausalLink): ProposedChange | null {
  if (link.fromType !== 'medication' && link.fromType !== 'treatment') return null;
  if (link.dangerLevel !== 'critical' && link.dangerLevel !== 'high' && link.isAppropriate !== false) return null;
  return {
    action: 'replace',
    target: link.from,
    targetType: link.fromType,
    reason: link.evidence || link.relationship,
    replacement: 'Alternative a valider selon indication, comorbidites et recommandations locales',
    replacementType: link.fromType,
    improvementScore: link.dangerLevel === 'critical' ? 70 : 45,
  };
}

function ratioFromStats(stats: SchemaStats): number {
  return Number((stats.greenLinks / Math.max(stats.redLinks + stats.orangeLinks, 1)).toFixed(1));
}

export function ensureSchemaComparison(analysis: AnalysisResult): SchemaComparison {
  const currentStats = computeSchemaStats(analysis.causalLinks || []);
  const fallbackChanges = (analysis.causalLinks || []).map(buildFallbackChange).filter((change): change is ProposedChange => Boolean(change));
  const modelChanges = analysis.schemaComparison?.proposedChanges || [];
  const proposedChanges = modelChanges.length > 0 ? modelChanges : fallbackChanges;
  const currentScore = scoreFromStats(currentStats);
  const redReduction = proposedChanges.filter((change) => change.action === 'replace' || change.action === 'remove').length;
  const proposedStats: SchemaStats = analysis.schemaComparison?.proposedStats || {
    ...currentStats,
    redLinks: Math.max(0, currentStats.redLinks - redReduction),
    orangeLinks: Math.max(0, currentStats.orangeLinks - Math.max(0, redReduction - currentStats.redLinks)),
    greenLinks: currentStats.greenLinks + redReduction,
    totalDangerScore: Math.max(0, currentStats.totalDangerScore - redReduction * 50),
    inappropriateCount: Math.max(0, currentStats.inappropriateCount - redReduction),
    adverseEffectCount: Math.max(0, currentStats.adverseEffectCount - redReduction),
  };
  const proposedScore = analysis.schemaComparison?.proposedScore ?? scoreFromStats(proposedStats);
  const improvementPercent = currentScore > 0 ? Number((((proposedScore - currentScore) / currentScore) * 100).toFixed(1)) : proposedScore;

  return {
    currentScore: analysis.schemaComparison?.currentScore ?? currentScore,
    proposedScore,
    improvementPercent: analysis.schemaComparison?.improvementPercent ?? improvementPercent,
    currentStats: analysis.schemaComparison?.currentStats || currentStats,
    proposedStats,
    proposedChanges,
    benefitRiskRatio: analysis.schemaComparison?.benefitRiskRatio || {
      current: ratioFromStats(currentStats),
      proposed: ratioFromStats(proposedStats),
    },
    clinicalSummary: analysis.schemaComparison?.clinicalSummary ||
      'Les propositions priorisent la suppression des contre-indications, interactions fortes et effets indesirables evitables.',
  };
}

function frequencyFromPercent(percent: unknown, isPrimary: unknown): SymptomFrequency {
  const value = typeof percent === 'number' ? percent : Number(percent);
  if (isPrimary === true || value >= 90) return 'principal';
  if (value >= 50) return 'frequent';
  if (value >= 10) return 'possible';
  return 'rare';
}

function nameMatches(a: unknown, b: unknown): boolean {
  const left = normalizeMedicalName(a);
  const right = normalizeMedicalName(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

export function buildSelectedElements(pathologies: any[], symptoms: any[], treatments: any[], medications: any[]): SelectedElement[] {
  return [
    ...pathologies.map((item) => ({ name: item.name, type: 'pathology' as const })),
    ...symptoms.map((item) => ({ name: item.name, type: 'symptom' as const })),
    ...treatments.map((item) => ({ name: item.name, type: 'treatment' as const })),
    ...medications.map((item) => ({ name: item.name, type: 'medication' as const })),
  ].filter((element) => Boolean(element.name));
}

export function buildEvidenceLinks(input: BuildEvidenceLinksInput): CausalLink[] {
  const { pathologies, symptoms, treatments, medications, symptomLinks } = input;
  const links: CausalLink[] = [];

  for (const symptomLink of symptomLinks || []) {
    const selectedPathology = pathologies.find((pathology) => nameMatches(pathology.name, symptomLink.pathologies?.name));
    const selectedSymptom = symptoms.find((symptom) => nameMatches(symptom.name, symptomLink.symptoms?.name));
    if (!selectedPathology || !selectedSymptom) continue;
    links.push({
      from: selectedPathology.name,
      fromType: 'pathology',
      to: selectedSymptom.name,
      toType: 'symptom',
      relationship: 'Association pathologie-symptome confirmee par la base clinique',
      probability: symptomLink.is_primary || Number(symptomLink.frequency_percent) >= 50 ? 'high' : 'medium',
      evidence: `Association DB: frequence ${symptomLink.frequency_percent ?? 'N/A'}%, symptome primaire: ${symptomLink.is_primary ? 'oui' : 'non'}.`,
      patientCount: 0,
      webSources: [],
      symptomFrequency: frequencyFromPercent(symptomLink.frequency_percent, symptomLink.is_primary),
    });
  }

  for (const treatment of treatments || []) {
    const selectedPathology = pathologies.find((pathology) => nameMatches(pathology.name, treatment.pathologies?.name) || pathology.id === treatment.pathology_id);
    if (!selectedPathology) continue;
    links.push({
      from: treatment.name,
      fromType: 'treatment',
      to: selectedPathology.name,
      toType: 'pathology',
      relationship: 'Traitement rattache a la pathologie selectionnee',
      probability: 'high',
      evidence: `Traitement reference pour ${selectedPathology.name}${treatment.description ? `: ${treatment.description}` : '.'}`,
      patientCount: 0,
      webSources: [],
      isAppropriate: true,
      effectType: 'therapeutic',
      therapeuticDetails: treatment.description || `Traitement indique pour ${selectedPathology.name}.`,
    });
  }

  for (const medication of medications || []) {
    for (const contraindication of medication.contraindications || []) {
      const selectedPathology = pathologies.find((pathology) => nameMatches(pathology.name, contraindication.condition || contraindication.name));
      if (!selectedPathology) continue;
      links.push({
        from: medication.name,
        fromType: 'medication',
        to: selectedPathology.name,
        toType: 'pathology',
        relationship: 'Contre-indication ou precaution forte identifiee',
        probability: 'high',
        evidence: `Contre-indication DB: ${contraindication.condition || contraindication.name}. ${contraindication.description || ''}`.trim(),
        patientCount: 0,
        webSources: [],
        isAppropriate: false,
        effectType: 'adverse',
        dangerLevel: contraindication.severity === 'critical' ? 'critical' : 'high',
        interactionType: 'pathology-danger',
        adverseDetails: contraindication.description || `Risque clinique avec ${selectedPathology.name}.`,
      });
    }

    for (const sideEffect of medication.side_effects || []) {
      const selectedSymptom = symptoms.find((symptom) => nameMatches(symptom.name, sideEffect.name));
      if (!selectedSymptom) continue;
      const dangerLevel = sideEffect.severity === 'severe' || sideEffect.severity === 'critical'
        ? 'high'
        : sideEffect.severity === 'moderate'
          ? 'moderate'
          : 'low';
      links.push({
        from: medication.name,
        fromType: 'medication',
        to: selectedSymptom.name,
        toType: 'symptom',
        relationship: 'Effet indesirable connu correspondant au symptome selectionne',
        probability: sideEffect.frequency === 'common' || sideEffect.frequency === 'very_common' ? 'high' : 'medium',
        evidence: `Effet secondaire DB: ${sideEffect.name}${sideEffect.severity ? `, severite ${sideEffect.severity}` : ''}.`,
        patientCount: 0,
        webSources: [],
        effectType: 'adverse',
        dangerLevel,
        adverseDetails: sideEffect.description || `${selectedSymptom.name} est signale comme effet indesirable possible.`,
      });
    }

    for (const interaction of medication.drug_interactions || []) {
      const otherMedication = medications.find((candidate) =>
        !nameMatches(candidate.name, medication.name) &&
        (nameMatches(candidate.name, interaction.interacting_drug) || nameMatches(candidate.substance, interaction.interacting_drug))
      );
      if (!otherMedication) continue;
      links.push({
        from: medication.name,
        fromType: 'medication',
        to: otherMedication.name,
        toType: 'medication',
        relationship: 'Interaction medicamenteuse connue',
        probability: 'high',
        evidence: `Interaction DB avec ${interaction.interacting_drug}: ${interaction.description || interaction.effect || 'interaction documentee'}.`,
        patientCount: 0,
        webSources: [],
        dangerLevel: interaction.severity === 'major' || interaction.severity === 'critical' ? 'critical' : 'high',
        interactionType: 'drug-drug',
        adverseDetails: interaction.description || interaction.effect || 'Interaction a surveiller.',
      });
    }
  }

  return mergeAndValidateLinks(buildSelectedElements(pathologies, symptoms, treatments, medications), links);
}

export function ensureAnalysisShape(rawAnalysis: Partial<AnalysisResult> | null | undefined): AnalysisResult {
  return {
    causalLinks: Array.isArray(rawAnalysis?.causalLinks) ? rawAnalysis.causalLinks as CausalLink[] : [],
    summary: coerceString(rawAnalysis?.summary, "Analyse terminee. Les liens affiches ont ete controles par les regles de validation clinique."),
    warnings: Array.isArray(rawAnalysis?.warnings) ? rawAnalysis.warnings.filter((value): value is string => typeof value === 'string') : [],
    recommendations: Array.isArray(rawAnalysis?.recommendations) ? rawAnalysis.recommendations.filter((value): value is string => typeof value === 'string') : [],
    alternatives: Array.isArray(rawAnalysis?.alternatives) ? rawAnalysis.alternatives as Alternative[] : [],
    schemaComparison: rawAnalysis?.schemaComparison,
    treatmentSchemas: ensureTreatmentSchemasShape(rawAnalysis?.treatmentSchemas),
    webResearch: Array.isArray(rawAnalysis?.webResearch) ? rawAnalysis.webResearch : [],
  };
}

export function ensureTreatmentSchemasShape(rawSchemas: unknown): TreatmentSchema[] {
  if (!Array.isArray(rawSchemas)) return [];

  return rawSchemas
    .map((rawSchema): TreatmentSchema | null => {
      const schema = rawSchema as Partial<TreatmentSchema> | null;
      if (!schema || typeof schema !== 'object') return null;

      const steps = Array.isArray(schema.steps)
        ? schema.steps
          .map((rawStep): TreatmentSchemaStep | null => {
            const step = rawStep as Partial<TreatmentSchemaStep> | null;
            if (!step || typeof step !== 'object') return null;
            const target = coerceString(step.target);
            const rationale = coerceString(step.rationale);
            if (!target || !rationale) return null;

            return {
              action: coerceEnum(step.action, ['keep', 'replace', 'remove', 'add', 'monitor'], 'monitor'),
              target,
              targetType: coerceEnum(step.targetType, ['medication', 'treatment', 'monitoring'], 'monitoring'),
              replacement: step.replacement ? coerceString(step.replacement) : undefined,
              rationale,
              monitoring: Array.isArray(step.monitoring) ? step.monitoring.filter((item): item is string => typeof item === 'string') : [],
              riskMitigation: Array.isArray(step.riskMitigation) ? step.riskMitigation.filter((item): item is string => typeof item === 'string') : [],
            };
          })
          .filter((step): step is TreatmentSchemaStep => Boolean(step))
        : [];

      if (steps.length === 0) return null;

      return {
        title: coerceString(schema.title, 'Schéma thérapeutique alternatif'),
        priority: coerceEnum(schema.priority, ['preferred', 'alternative', 'cautious'], 'alternative'),
        rationale: coerceString(schema.rationale, 'Schéma proposé à partir des liens de risque détectés.'),
        expectedBenefits: Array.isArray(schema.expectedBenefits) ? schema.expectedBenefits.filter((item): item is string => typeof item === 'string') : [],
        residualRisks: Array.isArray(schema.residualRisks) ? schema.residualRisks.filter((item): item is string => typeof item === 'string') : [],
        steps,
        monitoringPlan: Array.isArray(schema.monitoringPlan) ? schema.monitoringPlan.filter((item): item is string => typeof item === 'string') : [],
        patientWarnings: Array.isArray(schema.patientWarnings) ? schema.patientWarnings.filter((item): item is string => typeof item === 'string') : [],
        confidence: coerceEnum(schema.confidence, VALID_PROBABILITIES, 'medium'),
      };
    })
    .filter((schema): schema is TreatmentSchema => Boolean(schema));
}
