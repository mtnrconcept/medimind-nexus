/** Search vocabulary, not a diagnostic ontology. Never changes a canonical label,
 * formulation, identifier, route, patient record or therapeutic recommendation. */
export interface MedicalSearchEntity { name: string; type?: string; substance?: string }
export interface MedicalTerm { fr: string; en: string; aliases: string[]; search?: string[] }
export const MEDICAL_TERMS: readonly MedicalTerm[] = [
  { fr: 'Syndrome néphrotique', en: 'nephrotic syndrome', aliases: ['syndrome nephrotique'] },
  { fr: 'Syndrome néphrotique, autre', en: 'nephrotic syndrome', aliases: ['Nephrotic syndrome, other'] },
  { fr: 'Varicelle', en: 'varicella', aliases: ['chickenpox', 'varicelle'], search: ['varicella', 'chickenpox'] },
  { fr: 'Varicelle sans complication', en: 'varicella', aliases: ['Varicella without complication'] },
  { fr: 'Varicelle avec complications', en: 'varicella', aliases: ['Varicella with other complications'] },
  { fr: 'Œdème des paupières', en: 'periorbital edema', aliases: ['oedeme des paupieres', 'edema of eyelid', 'eyelid edema', 'eyelid swelling'], search: ['periorbital edema', 'eyelid edema', 'periorbital oedema'] },
  { fr: 'Ciclosporine', en: 'cyclosporine', aliases: ['ciclosporin', 'cyclosporin', 'ciclosporine'], search: ['cyclosporine', 'ciclosporin', 'cyclosporin'] },
  { fr: 'Aciclovir', en: 'acyclovir', aliases: ['aciclovir', 'aciclovir sodique'], search: ['acyclovir', 'aciclovir'] },
  { fr: 'Prednisolone', en: 'prednisolone', aliases: [] },
  { fr: 'Prednisone', en: 'prednisone', aliases: [] },
  { fr: 'Rituximab', en: 'rituximab', aliases: [] },
  { fr: 'Tacrolimus', en: 'tacrolimus', aliases: [] },
  { fr: 'Mycophénolate mofétil', en: 'mycophenolate mofetil', aliases: ['mycophenolate', 'mycophenolate mofetil'] },
  { fr: 'Paracétamol', en: 'acetaminophen', aliases: ['paracetamol'], search: ['acetaminophen', 'paracetamol'] },
  { fr: 'Diabète de type 1', en: 'type 1 diabetes', aliases: ['diabete type 1', 'type 1 diabetes mellitus'] },
  { fr: 'Diabète de type 2', en: 'type 2 diabetes', aliases: ['diabete type 2', 'type 2 diabetes mellitus'] },
  { fr: 'Hypertension artérielle', en: 'hypertension', aliases: ['hypertension arterielle', 'high blood pressure'] },
  { fr: 'Insuffisance rénale chronique', en: 'chronic kidney disease', aliases: ['maladie renale chronique', 'chronic renal failure'] },
  { fr: 'Insuffisance rénale aiguë', en: 'acute kidney injury', aliases: ['acute renal failure'] },
  { fr: 'Protéinurie', en: 'proteinuria', aliases: ['proteinurie'] },
  { fr: 'Hématurie', en: 'hematuria', aliases: ['haematuria', 'hematurie'] },
  { fr: 'Hypoalbuminémie', en: 'hypoalbuminemia', aliases: ['hypoalbuminaemia'] },
  { fr: 'Œdème', en: 'edema', aliases: ['oedeme', 'oedema'] },
  { fr: 'Fièvre', en: 'fever', aliases: ['fievre', 'pyrexia'] },
  { fr: 'Toux', en: 'cough', aliases: ['toux'] },
  { fr: 'Dyspnée', en: 'dyspnea', aliases: ['dyspnoea', 'essoufflement'] },
  { fr: 'Douleur thoracique', en: 'chest pain', aliases: ['douleur thoracique'] },
  { fr: 'Douleur abdominale', en: 'abdominal pain', aliases: ['douleur abdominale'] },
  { fr: 'Céphalée', en: 'headache', aliases: ['cephalees', 'maux de tete'] },
  { fr: 'Nausées', en: 'nausea', aliases: ['nausee', 'nausees'] },
  { fr: 'Vomissements', en: 'vomiting', aliases: ['vomissement'] },
  { fr: 'Diarrhée', en: 'diarrhea', aliases: ['diarrhoea'] },
  { fr: 'Éruption cutanée', en: 'skin rash', aliases: ['eruption cutanee', 'rash'] },
  { fr: 'Prurit', en: 'pruritus', aliases: ['demangeaisons', 'itching'] },
  { fr: 'Asthme', en: 'asthma', aliases: ['asthme'] },
  { fr: 'Pneumonie', en: 'pneumonia', aliases: ['pneumonie'] },
  { fr: 'Insuffisance cardiaque', en: 'heart failure', aliases: ['insuffisance cardiaque'] },
  { fr: 'Fibrillation atriale', en: 'atrial fibrillation', aliases: ['fibrillation auriculaire'] },
  { fr: 'Infarctus du myocarde', en: 'myocardial infarction', aliases: ['infarctus du myocarde'] },
  { fr: 'Accident vasculaire cérébral', en: 'stroke', aliases: ['accident vasculaire cerebral'] },
  { fr: 'Polyarthrite rhumatoïde', en: 'rheumatoid arthritis', aliases: ['polyarthrite rhumatoide'] },
  { fr: 'Lupus érythémateux systémique', en: 'systemic lupus erythematosus', aliases: ['lupus systemique', 'lupus erythemateux dissemine'] },
  { fr: 'Maladie de Crohn', en: 'Crohn disease', aliases: ['maladie de crohn', "Crohn's disease"] },
  { fr: 'Rectocolite hémorragique', en: 'ulcerative colitis', aliases: ['colite ulcereuse'] },
  { fr: 'Sclérose en plaques', en: 'multiple sclerosis', aliases: ['sclerose en plaques'] },
  { fr: 'Maladie de Parkinson', en: 'Parkinson disease', aliases: ['maladie de parkinson', "Parkinson's disease"] },
  { fr: 'Maladie d’Alzheimer', en: 'Alzheimer disease', aliases: ['maladie alzheimer', "Alzheimer's disease"] },
  { fr: 'Dépression', en: 'depression', aliases: ['depression'] },
  { fr: 'Trouble déficitaire de l’attention avec hyperactivité', en: 'attention deficit hyperactivity disorder', aliases: ['tdah', 'adhd'] },
  { fr: 'Anémie', en: 'anemia', aliases: ['anaemia'] },
  { fr: 'Thrombopénie', en: 'thrombocytopenia', aliases: ['thrombocytopenie'] },
  { fr: 'Neutropénie', en: 'neutropenia', aliases: ['neutropenie'] },
  { fr: 'Immunodépression', en: 'immunosuppression', aliases: ['immunodepression', 'immunocompromised'] },
  { fr: 'Cancer du sein', en: 'breast cancer', aliases: ['cancer du sein', 'breast neoplasms'] },
  { fr: 'Cancer du poumon', en: 'lung cancer', aliases: ['cancer du poumon', 'lung neoplasms'] },
  { fr: 'Cancer colorectal', en: 'colorectal cancer', aliases: ['cancer colorectal'] },
  { fr: 'Ostéoporose', en: 'osteoporosis', aliases: ['osteoporose'] },
  { fr: 'Hypothyroïdie', en: 'hypothyroidism', aliases: ['hypothyroidie'] },
  { fr: 'Hyperthyroïdie', en: 'hyperthyroidism', aliases: ['hyperthyroidie'] },
  { fr: 'Épilepsie', en: 'epilepsy', aliases: ['epilepsie'] },
];

export function normalizeSearchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/ +/g, ' ');
}
function lookup(value: string): MedicalTerm | undefined {
  const normalized = normalizeSearchText(value);
  // Prefer an exact alias over a shared English canonical label (ICD qualifiers).
  return MEDICAL_TERMS.find(term => [term.fr, ...term.aliases].some(alias => normalizeSearchText(alias) === normalized))
    ?? MEDICAL_TERMS.find(term => normalizeSearchText(term.en) === normalized);
}
export function frenchMedicalLabel(value: string): string { return lookup(value)?.fr ?? value; }
export function medicalSearchTerms(entity: MedicalSearchEntity): string[] {
  const original = entity.name.trim();
  const direct = lookup(original);
  if (direct) return direct.search ?? [direct.en];
  if (entity.type === 'medication') {
    const substance = entity.substance?.trim();
    const terms: string[] = [];
    // Composition strings can include strengths and salts. Match a complete
    // known substance prefix; never interpret a brand as a different drug.
    for (const part of (substance || original).split(/\s*\+\s*/)) {
      const normalized = normalizeSearchText(part);
      const match = MEDICAL_TERMS.find(term => [term.en, term.fr, ...term.aliases].some(alias => {
        const key = normalizeSearchText(alias);
        return normalized === key || normalized.startsWith(key + ' ') && /^(?:[0-9]|accord\b|sodique\b|solution\b|comprime\b|capsule\b)/.test(normalized.slice(key.length + 1));
      }));
      if (match) terms.push(...(match.search ?? [match.en]));
    }
    if (terms.length) return [...new Set(terms)].slice(0, 5);
    if (substance && !/\d|[+]/.test(substance)) return [substance.slice(0, 160)];
  }
  return [original.slice(0, 160)];
}
export function matchesMedicalText(value: string, query: string): boolean {
  const needle = normalizeSearchText(query);
  const term = lookup(value);
  return [value, term?.fr ?? '', term?.en ?? '', ...(term?.aliases ?? [])]
    .some(candidate => normalizeSearchText(candidate).includes(needle));
}
