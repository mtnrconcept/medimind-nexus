import type { CausalLink, PairCandidate } from './analysis-utils.ts';

export const RELATION_ENGINE_VERSION = 2;
export const RELATION_KINDS = ['indication', 'adverse_effect', 'interaction', 'risk_factor', 'manifestation',
  'adjunctive_use', 'coadministration', 'association', 'symptom_cascade', 'symptom_relief',
  'contraindication', 'disease_worsening', 'uncertain'] as const;
export type RelationKind = typeof RELATION_KINDS[number];
export interface EvidenceSource {
  url: string; title: string; abstract?: string; publicationTypes?: string[];
  year?: string; provider?: string;
}
export interface EvidenceQuote { url: string; quote: string; support: 'direct' | 'contextual' }
export interface RelationMetadata {
  relationKind?: RelationKind;
  evidenceSupport?: 'direct' | 'contextual';
  validationVersion?: number;
  evidenceQuotes?: EvidenceQuote[];
  contextLimitations?: string[];
  evidenceOrigin?: 'openai_web_search' | 'verified_excerpt';
  citationVerification?: 'provider_trace' | 'verbatim';
  interactionEffect?: 'increase_effect' | 'decrease_effect' | 'increase_toxicity' | 'mixed' | 'unknown';
}
const text = (v: unknown): string => typeof v === 'string' ? v.trim() : '';
const key = (v: string): string => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g,' ').trim();
const match = (v: string, pattern: RegExp) => pattern.test(key(v));
const causal = new Set<RelationKind>(['indication','adverse_effect','interaction','risk_factor','manifestation',
  'symptom_relief','contraindication','disease_worsening']);

/** Checks traceability and obvious context conflicts, NOT medical truth.
 * It never creates a clinical relation, quote, efficacy claim or severity.
 * Quoted passages remain machine-selected evidence requiring human review. */
export function validateRelationEvidence(raw: unknown, normalized: CausalLink, pair: PairCandidate,
  sources: EvidenceSource[]): CausalLink | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  let kind = candidate.relationKind as RelationKind;
  if (!RELATION_KINDS.includes(kind) || kind === 'uncertain' || !Array.isArray(candidate.evidenceQuotes)) return null;
  const permitted = new Map(sources.filter(s => /^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/[1-9][0-9]{0,8}\/$/.test(s.url)).map(s => [s.url,s]));
  const quotes: EvidenceQuote[] = [];
  const cited: EvidenceSource[] = [];
  for (const value of candidate.evidenceQuotes.slice(0,4)) {
    if (!value || typeof value !== 'object') continue;
    const item = value as Record<string,unknown>;
    const source = permitted.get(text(item.url));
    const passage = text(item.quote);
    if (!source?.abstract || passage.length < 30 || passage.length > 900 ||
        !['direct','contextual'].includes(String(item.support)) || !key(source.abstract).includes(key(passage))) continue;
    quotes.push({url:source.url,quote:passage,support:item.support as EvidenceQuote['support']});
    cited.push(source);
  }
  if (!quotes.length) return null;
  const context = candidate.context && typeof candidate.context === 'object'
    ? candidate.context as Record<string,unknown> : {};
  const limits: string[] = [];
  let support: 'direct' | 'contextual' = quotes.every(q => q.support === 'direct') ? 'direct' : 'contextual';
  const medicines = [pair.left,pair.right].filter(e => e.type === 'medication' || e.type === 'treatment');
  if (context.condition !== 'same') { support='contextual'; limits.push('Contexte de maladie différent ou non établi.'); }
  if (medicines.length && context.route !== 'same') { support='contextual'; limits.push('Voie ou formulation non concordante ou non précisée.'); }
  if (context.population === 'different') { support='contextual'; limits.push('Population de la source différente.'); }
  const titles = cited.map(s=>s.title).join(' ');
  const passages = quotes.map(q=>q.quote).join(' ');
  const statements = [normalized.relationship,normalized.evidence].join(' ');
  // Cross-check concrete route markers independently of the model's context
  // declaration. ATC S01XA18 identifies the ophthalmological ciclosporin entry,
  // not the systemic L04AD01 product. Other ATC prefixes alone are not routes.
  for (const medicine of medicines) {
    const name = key(medicine.name);
    const ocular = medicine.atcCode === 'S01XA18' || /collyre|ophtalm|eye drop|ophthalmic/.test(name);
    const intravenous = /perfusion|intraveineu|intravenous|\biv\b/.test(name);
    const oral = /comprime|capsule|gelule|voie orale|oral tablet/.test(name);
    const required = ocular ? /ophthalmic|eye drop|topical.*cyclospor|collyre|ophtalm/ :
      intravenous ? /intravenous|intraveineu|\biv\b|infusion|perfusion/ : oral ? /oral|orally|comprime|capsule/ : null;
    if (!required || !match(passages,required)) {
      support='contextual';
      limits.push(required ? 'La voie de la présentation sélectionnée n’est pas étayée par le passage cité.'
        : 'Formulation ou voie sélectionnée insuffisamment précise : ne pas extrapoler un effet systémique ou local.');
    }
  }

  const lowDesign = cited.some(s => s.publicationTypes?.some(p => /case reports|in vitro|animal/i.test(p))) ||
    match(titles+' '+passages, /case report|case series|a case of|retrospective series|in vitro|zebrafish|murine|mice/);
  if (lowDesign && causal.has(kind)) { support='contextual'; limits.push('Observation isolée, série de cas ou résultat préclinique : pas de preuve causale générale.'); }
  const isVaricella = [pair.left,pair.right].some(e => e.type==='pathology' && match(e.name,/varicell|chickenpox/));
  const isImmunosuppressant = medicines.some(e => match(e.substance || e.name,/ciclospor|cyclospor|prednisolon|prednison/));
  if (isVaricella && isImmunosuppressant && kind==='indication') {
    kind='adjunctive_use'; support='contextual';
    limits.push('Une utilisation complémentaire dans une complication ne démontre pas un traitement antiviral de la varicelle.');
  }
  if (isVaricella && match(titles+' '+passages,/herpes zoster|ramsay hunt|stromal keratitis|post.?varicella/) &&
      !match(passages,/primary varicella|primary chickenpox|primary vzv/)) {
    support='contextual'; limits.push('Zona ou complication post-varicelle : ne pas extrapoler à la varicelle primaire.');
  }
  // Co-administration alone is not evidence of a pharmacological interaction.
  if (kind==='interaction' && !match(passages,/interact|pharmacokinet|pharmacodynam|drug.drug|plasma concentration|clearance|bioavailab/)) {
    kind='coadministration'; support='contextual'; limits.push('La citation décrit une association de traitements, sans démonstration d’interaction pharmacologique.');
  }
  // A time order supplied by the model cannot replace an adverse-event
  // attribution in the actual source passage.
  if (kind==='adverse_effect' && !match(passages,/adverse|side.effect|drug.induced|induced by|attribut|caused by|toxic|effet indesirable/)) {
    kind='association'; support='contextual'; limits.push('Le passage cité ne rapporte pas d’attribution du symptôme au médicament.');
  }
  if (kind==='adverse_effect' && context.temporality!=='after_exposure') {
    kind='association'; support='contextual'; limits.push('Chronologie non démontrée : le médicament ne peut être présenté comme la cause du symptôme.');
  }
  if (kind==='symptom_relief' && !match(passages,/relie[fv]|alleviat|soulage|soulagement|amelior|attenu|symptom.{0,60}(reduc|improv)/)) {
    support='contextual'; limits.push('Le passage cité ne décrit pas de soulagement symptomatique attribué au traitement.');
  }
  if (kind==='contraindication' && (!match(passages,/contraindicat|contre.?indicat|contre.?indiqu/) ||
      match(passages,/not (?:a )?contraindicat|no (?:absolute )?contraindicat|n.est pas contre.?indiqu|absence de contre.?indicat/))) {
    support='contextual'; limits.push('Une précaution ou un risque ne suffit pas à établir une contre-indication formelle.');
  }
  if (kind==='disease_worsening' && !match(passages,/worsen|exacerbat|aggravat|deteriorat|disease flare/)) {
    support='contextual'; limits.push('Le passage cité ne décrit pas d’aggravation de la maladie attribuée au traitement.');
  }
  if ((kind==='symptom_relief' || kind==='disease_worsening') && context.temporality!=='after_exposure') {
    support='contextual'; limits.push('Chronologie non démontrée : une amélioration ou aggravation ne peut être attribuée au traitement.');
  }
  if (causal.has(kind) && match(statements,/sans (preuve|demonstration|effet propre)|ne (prouve|demontre|permet) pas|not (demonstrat|establish)|co.?utilisation|co.?administration|traitements concomitants/)) {
    support='contextual'; limits.push('Le texte de la source décrit une association ou une limite, pas une causalité établie.');
  }
  if (kind==='indication' && !(medicines.length===1 && [pair.left,pair.right].some(e=>e.type==='pathology'))) return null;
  if (kind==='interaction' && medicines.length!==2) return null;
  if (kind==='adverse_effect' && !(medicines.length===1 && [pair.left,pair.right].some(e=>e.type==='symptom'||e.type==='pathology'))) return null;
  if (kind==='symptom_relief' || kind==='contraindication' || kind==='disease_worsening') {
    const targetType = kind==='symptom_relief' ? 'symptom' : 'pathology';
    const medicine = medicines[0];
    const target = [pair.left,pair.right].find(e=>e.type===targetType);
    if (medicines.length!==1 || !target || normalized.fromType!==medicine.type || normalized.toType!==targetType ||
        key(normalized.from)!==key(medicine.name) || key(normalized.to)!==key(target.name)) return null;
  }
  const result: CausalLink = { ...normalized, relationKind:kind, evidenceSupport:support,
    validationVersion:RELATION_ENGINE_VERSION, evidenceQuotes:quotes, contextLimitations:[...new Set(limits)],
    webSources:[...new Set(quotes.map(q=>q.url))] };
  // Model-generated flags and old normalizer defaults are not a validated
  // clinical decision. The typed relation and scope drive presentation.
  delete result.isAppropriate; delete result.effectType; delete result.dangerLevel;
  delete result.interactionType; delete result.symptomFrequency;
  delete result.therapeuticDetails; delete result.adverseDetails;
  result.relationship = relationPresentation(result).label;
  // A downgraded label must not leave the original affirmative claim in the
  // card or synthesis. The actual source passage remains available verbatim.
  if (support === 'contextual') result.evidence = contextualRelationExplanation(kind);
  return result;
}

export function relationPresentation(link: RelationMetadata): {label:string; description:string; tone:'neutral'|'caution'} {
  if (link.validationVersion!==RELATION_ENGINE_VERSION || !link.relationKind) return {
    label:'À réexaminer',description:'Ancienne classification sans contrôle du sens clinique et du passage source.',tone:'neutral'};
  const contextual=link.evidenceSupport!=='direct';
  const nativeTrace=link.citationVerification==='provider_trace';
  const labels: Record<RelationKind,string> = {
    indication:contextual?'Usage rapporté':'Indication étudiée',
    adverse_effect:contextual?(nativeTrace?'Effet indésirable possible':'Association observée'):'Effet indésirable rapporté',
    interaction:contextual?(nativeTrace?'Interaction possible':'Co-utilisation rapportée'):'Interaction rapportée',
    risk_factor:contextual?'Prudence à évaluer':'Facteur de risque rapporté',
    manifestation:contextual?'Association observée':'Manifestation décrite',
    adjunctive_use:'Usage complémentaire',coadministration:'Co-utilisation',association:'Association rapportée',uncertain:'Lien non établi',
    symptom_cascade:contextual?'Enchaînement possible':'Enchaînement symptomatique rapporté',
    symptom_relief:contextual?'Soulagement symptomatique possible':'Soulagement symptomatique rapporté',
    contraindication:contextual?'Prudence à évaluer':'Contre-indication rapportée',
    disease_worsening:contextual?'Aggravation possible':'Aggravation rapportée',
  };
  return {label:labels[link.relationKind],
    description:link.citationVerification === 'provider_trace'
      ? 'Source retrouvée par la recherche web ; interprétation de l’agent à vérifier, sans contrôle automatique du passage cité.'
      : contextual?'Source contextuelle : aucune preuve directe applicable à la paire sélectionnée.':'Passage source retrouvé ; interprétation clinique à vérifier.',
    tone:(['contraindication','disease_worsening'].includes(link.relationKind) ||
      (!contextual||nativeTrace)&&['adverse_effect','interaction','risk_factor'].includes(link.relationKind))?'caution':'neutral'};
}

export function contextualRelationExplanation(kind: RelationKind): string {
  const descriptions: Record<RelationKind,string> = {
    indication:'Un usage du médicament est décrit, mais cette source ne démontre pas une efficacité applicable à la maladie et à la présentation sélectionnées.',
    adverse_effect:'Une association est rapportée, sans permettre d’attribuer le symptôme au médicament dans ce contexte.',
    interaction:'Les deux médicaments sont mentionnés ensemble. Cela ne démontre pas à lui seul une interaction pharmacologique.',
    risk_factor:'Une situation de prudence est évoquée, mais le risque applicable à cette paire n’est pas établi par la source.',
    manifestation:'La source décrit une association clinique qui ne suffit pas à attribuer ce symptôme à cette pathologie.',
    adjunctive_use:'Le médicament est utilisé en complément pour une complication ou un contexte particulier. Cela ne signifie pas qu’il traite la maladie initiale.',
    coadministration:'Les médicaments sont administrés ensemble. Aucun effet propre, bénéfice combiné ou interaction ne peut être déduit de leur seule co-utilisation.',
    association:'Les éléments apparaissent dans la même observation. Le sens et la causalité de leur relation ne sont pas démontrés.',
    symptom_cascade:'Un enchaînement entre symptômes est envisagé ; son mécanisme et sa chronologie restent à confirmer.',
    symptom_relief:'Un soulagement du symptôme est envisagé, mais son attribution au traitement reste à confirmer. Cela ne démontre pas que le traitement agit sur la maladie responsable.',
    contraindication:'Une situation de prudence est évoquée ; la source ne suffit pas à établir une contre-indication formelle applicable à la maladie et à la présentation sélectionnées.',
    disease_worsening:'Une aggravation de la maladie est envisagée, mais sa survenue, sa chronologie et son attribution au traitement ne sont pas établies dans ce contexte.',
    uncertain:'Les informations disponibles ne permettent pas d’établir ce lien.',
  };
  return descriptions[kind];
}
