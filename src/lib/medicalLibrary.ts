import { MEDICAL_TERMS, medicalSearchTerms, normalizeSearchText } from '../../supabase/functions/_shared/medical-terminology';

export interface LibraryPaper {
  id: string;
  pmid: string;
  title: string;
  title_fr: string | null;
  journal: string | null;
  publication_date: string | null;
  source: string | null;
  topic_fr: string | null;
  translation_status: string | null;
  total_count: number;
}

export type LibraryResearchMode = 'disease' | 'gene' | 'drug';
export interface ResearchSkill {
  id: string;
  title: string;
  description: string;
  mode: LibraryResearchMode;
  example: string;
  keywords: string[];
  verification: string;
}

/** Method cards, not ChatGPT-installed plugins; they suggest reproducible
 * research methods and never submit patient data or execute untrusted code. */
export const RESEARCH_SKILLS: readonly ResearchSkill[] = [
  { id: 'pico', title: 'Question clinique PICO', description: 'Décomposer population, intervention, comparateur et critères de jugement.', mode: 'disease', example: 'nephrotic syndrome', keywords: ['pico','question','population','recherche'], verification: 'Exiger les critères de jugement et les comparateurs.' },
  { id: 'systematic', title: 'Revue systématique', description: 'Repérer les revues et examiner la stratégie bibliographique.', mode: 'disease', example: 'rheumatoid arthritis', keywords: ['systematic review','prisma','méta analyse','revue'], verification: 'Vérifier protocole, sélection des études et risques de biais.' },
  { id: 'randomized', title: 'Essais contrôlés randomisés', description: 'Comparer les critères d’inclusion et les résultats des essais.', mode: 'disease', example: 'type 2 diabetes', keywords: ['rct','essai','randomisé','clinical trial'], verification: 'Chercher le protocole et les résultats, pas seulement l’enregistrement.' },
  { id: 'grade', title: 'Niveau de certitude GRADE', description: 'Distinguer la certitude des preuves de l’ampleur des effets.', mode: 'disease', example: 'asthma', keywords: ['grade','certitude','preuves','évidence'], verification: 'Examiner biais, incohérence, imprécision et applicabilité.' },
  { id: 'pharmacovigilance', title: 'Pharmacovigilance', description: 'Examiner les signaux et leur contexte de notification.', mode: 'drug', example: 'cyclosporine', keywords: ['faers','effets secondaires','toxicité','adr'], verification: 'Une déclaration spontanée ne prouve pas une causalité.' },
  { id: 'interactions', title: 'Interactions médicamenteuses', description: 'Chercher mécanisme, voie, dose et qualité de l’information.', mode: 'drug', example: 'aciclovir', keywords: ['interaction','medicament','incompatibilité','drug'], verification: 'Vérifier formulation, voie d’administration et population.' },
  { id: 'pharmacogenomics', title: 'Pharmacogénétique', description: 'Rechercher les annotations gène–médicament.', mode: 'gene', example: 'CYP2D6', keywords: ['cpic','pharmgkb','pharmacogénétique','genotype'], verification: 'Évaluer la validité clinique et les recommandations officielles.' },
  { id: 'clinvar', title: 'Variants et ClinVar', description: 'Distinguer classification des variants et preuves fonctionnelles.', mode: 'gene', example: 'NPHS1', keywords: ['clinvar','variant','mutation','genetique'], verification: 'Contrôler version, consensus et conflits d’interprétation.' },
  { id: 'gwas', title: 'Associations génétiques', description: 'Explorer les associations GWAS et la robustesse des résultats.', mode: 'gene', example: 'APOE', keywords: ['gwas','gène','association','genome'], verification: 'Ne pas confondre association statistique et causalité.' },
  { id: 'protein', title: 'Structures protéiques', description: 'Explorer les protéines et leurs modèles structuraux.', mode: 'gene', example: 'CFTR', keywords: ['uniprot','structure','alphafold','protein'], verification: 'Signaler les modèles prédictifs et leur confiance.' },
  { id: 'drug-target', title: 'Cibles thérapeutiques', description: 'Croiser maladie, cibles et composés dans les sources publiques.', mode: 'disease', example: 'multiple sclerosis', keywords: ['opentargets','cible','target','chémbl'], verification: 'Une association cible-maladie ne valide pas un traitement.' },
  { id: 'clinical-trials', title: 'Registres d’essais cliniques', description: 'Retrouver les protocoles, statuts et publications associées.', mode: 'disease', example: 'rare disease', keywords: ['clinicaltrials','nct','essai clinique','registre'], verification: 'Un essai enregistré sans résultats ne prouve aucune efficacité.' },
  { id: 'pediatric', title: 'Preuves en pédiatrie', description: 'Examiner les études et critères propres aux populations pédiatriques.', mode: 'disease', example: 'nephrotic syndrome', keywords: ['enfant','pédiatrie','pediatric','néphrotique'], verification: 'Ne pas extrapoler les résultats adultes sans justification.' },
  { id: 'real-world', title: 'Données observationnelles', description: 'Examiner cohortes, registres et facteurs de confusion.', mode: 'disease', example: 'chronic kidney disease', keywords: ['cohorte','real world','observational','registry'], verification: 'Contrôler facteurs de confusion et sélection des patients.' },
  { id: 'causality', title: 'Hypothèse de causalité', description: 'Formuler une hypothèse réfutable et rechercher les résultats contradictoires.', mode: 'disease', example: 'hypertension', keywords: ['causalité','causality','hypothèse','contradiction'], verification: 'Distinguer signal, association, corrélation et preuve causale.' },
  { id: 'repurposing', title: 'Repositionnement de molécules', description: 'Identifier des pistes documentées sans les transformer en recommandations.', mode: 'drug', example: 'rituximab', keywords: ['repurposing','repositionnement','molécule'], verification: 'Ne jamais déduire l’efficacité d’une cible seule.' },
  { id: 'retractions', title: 'Traçabilité et rétractations', description: 'Vérifier les identifiants et les mises à jour des publications.', mode: 'disease', example: 'nephrotic syndrome', keywords: ['pmid','doi','retractation','citation'], verification: 'Consulter le statut le plus récent sur l’éditeur ou PubMed.' },
];

/** Searches keep the original input and augment it only with known aliases.
 * Unknown medical entities are not translated or guessed. */
export function librarySearchAlias(query: string): string {
  const text = query.trim().slice(0, 120);
  const normalized = normalizeSearchText(text);
  if (!normalized || normalized.length < 3) return '';
  const mapped = medicalSearchTerms({ name: text });
  if (mapped.length && normalizeSearchText(mapped[0]) !== normalized) return mapped[0].slice(0, 120);
  const term = MEDICAL_TERMS.find(row => [row.fr, row.en, ...row.aliases].some(alias => {
    const normalizedAlias = normalizeSearchText(alias);
    return normalizedAlias.startsWith(normalized) && normalized.length >= 4;
  }));
  return term ? term.en : '';
}

export function filterResearchSkills(query: string): ResearchSkill[] {
  const value = normalizeSearchText(query);
  if (!value) return [...RESEARCH_SKILLS];
  return RESEARCH_SKILLS.filter(skill => [skill.title, skill.description, skill.mode, skill.example, ...skill.keywords]
    .some(text => normalizeSearchText(text).includes(value)));
}

export function filterMedicalGlossary(query: string) {
  const value = normalizeSearchText(query);
  if (!value || value.length < 2) return MEDICAL_TERMS.slice(0, 12);
  return MEDICAL_TERMS.filter(term => [term.fr, term.en, ...term.aliases]
    .some(text => normalizeSearchText(text).includes(value))).slice(0, 24);
}
