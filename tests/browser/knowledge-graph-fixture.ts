import type { RadialRingsData, RingEdge, RingNode } from '../../src/types/graph';

/**
 * Synthetic presentation fixture. These are illustrative concepts, never a
 * patient record, an AI response, a clinical assessment, or an exhaustive map.
 * Sources below are real publications used to exercise reference rendering.
 * Scores are neutral compatibility values and must not become clinical scores.
 */
type Family = 'anatomy' | 'pathologies' | 'manifestations' | 'treatments' |
  'genetics' | 'molecules' | 'complications' | 'examinations' | 'interactions' |
  'research' | 'mechanisms' | 'daily_life';

type Qualifier = 'established' | 'association' | 'research' | 'unverified';
type Reference = {
  id: string;
  url: string;
  title: string;
  source: string;
  verification_status: 'verified' | 'unverified';
};

const references = {
  nephrin: {
    id: 'pmid:38804512',
    url: 'https://pubmed.ncbi.nlm.nih.gov/38804512/',
    title: 'Autoantibodies Targeting Nephrin in Podocytopathies',
    source: 'PubMed · NEJM · 2024',
    verification_status: 'verified',
  },
  plasmin: {
    id: 'pmid:19073825',
    url: 'https://pubmed.ncbi.nlm.nih.gov/19073825/',
    title: 'Plasmin in nephrotic urine activates the epithelial sodium channel',
    source: 'PubMed · JASN · 2009',
    verification_status: 'verified',
  },
  microbiota: {
    id: 'pmid:29533950',
    url: 'https://pubmed.ncbi.nlm.nih.gov/29533950/',
    title: 'Gut Microbiota Dysbiosis in Children with Relapsing Idiopathic Nephrotic Syndrome',
    source: 'PubMed · 2018',
    verification_status: 'verified',
  },
} satisfies Record<string, Reference>;

type DemoNode = RingNode & { family: Family; canonical_id: string; references?: Reference[] };
type DemoEdge = RingEdge & {
  qualifier: Qualifier;
  evidence: {
    status: 'supported' | 'limited' | 'hypothesis' | 'unavailable';
    study_type?: string;
    population?: string;
    limitations: string[];
    sources: Reference[];
  };
  context: string;
};

const demoDescription = 'Concept illustratif de démonstration. Aucune donnée de patient et aucune interprétation clinique individuelle.';

function node(id: string, name: string, family: Family, nodeType: string, ring = 1): DemoNode {
  return {
    id,
    name,
    family,
    canonical_id: `synthetic:${id}`,
    node_type: nodeType,
    ring,
    lane: family,
    properties: { description: demoDescription, synthetic: true },
    proximity_score: 0,
    evidence_grade: 'unverified',
    translation_gap: false,
  };
}

function edge(
  id: string,
  source: string,
  target: string,
  relationship = 'ASSOCIATED_WITH',
  qualifier: Qualifier = 'unverified',
  reference?: Reference,
): DemoEdge {
  return {
    id,
    source,
    target,
    relationship,
    qualifier,
    evidence_grade: 'unverified',
    translation_gap: qualifier === 'research',
    weight: 1,
    context: 'Démonstration synthétique de présentation, hors dossier patient.',
    evidence: {
      status: qualifier === 'unverified' ? 'unavailable' : qualifier === 'research' ? 'hypothesis' : qualifier === 'association' ? 'limited' : 'supported',
      limitations: ['Cette fixture vérifie une interface et ne constitue pas une analyse clinique.'],
      sources: reference ? [reference] : [],
    },
  };
}

const nodes: DemoNode[] = [
  node('syndrome', 'Syndrome néphrotique', 'pathologies', 'PATHOLOGY', 0),
  node('minimal-change', 'Lésions glomérulaires minimes', 'pathologies', 'PATHOLOGY', 2),
  node('fsgs', 'Hyalinose segmentaire et focale', 'pathologies', 'PATHOLOGY', 2),
  node('membranous', 'Néphropathie extramembraneuse', 'pathologies', 'PATHOLOGY', 2),
  node('kidney', 'Rein', 'anatomy', 'ORGAN'),
  node('glomerulus', 'Glomérule', 'anatomy', 'ANATOMY', 2),
  node('podocyte', 'Podocyte', 'anatomy', 'CELL', 3),
  node('slit-diaphragm', 'Diaphragme de fente', 'anatomy', 'STRUCTURE', 4),
  node('basement-membrane', 'Membrane basale glomérulaire', 'anatomy', 'TISSUE', 3),
  node('collecting-duct', 'Canal collecteur', 'anatomy', 'ANATOMY', 2),
  node('proteinuria', 'Protéinurie', 'manifestations', 'SYMPTOM'),
  node('oedema', 'Œdème', 'manifestations', 'SYMPTOM'),
  node('hypoalbuminemia', 'Hypoalbuminémie', 'manifestations', 'SYMPTOM', 2),
  node('foamy-urine', 'Urines mousseuses', 'manifestations', 'SYMPTOM', 2),
  node('fatigue', 'Fatigue', 'manifestations', 'SYMPTOM', 2),
  node('prednisolone', 'Prednisolone', 'treatments', 'DRUG'),
  node('cyclosporine', 'Ciclosporine', 'treatments', 'DRUG'),
  node('tacrolimus', 'Tacrolimus', 'treatments', 'DRUG'),
  node('rituximab', 'Rituximab', 'treatments', 'DRUG'),
  node('mycophenolate', 'Mycophénolate mofétil', 'treatments', 'DRUG'),
  node('sodium-management', 'Gestion des apports sodés', 'treatments', 'TREATMENT'),
  // The repeated display name intentionally verifies distinct gene/protein IDs.
  node('gene-nephrin', 'Néphrine', 'genetics', 'GENE', 6),
  node('nphs2', 'NPHS2', 'genetics', 'GENE', 2),
  node('wt1', 'WT1', 'genetics', 'GENE', 2),
  node('lamb2', 'LAMB2', 'genetics', 'GENE', 3),
  node('protein-nephrin', 'Néphrine', 'molecules', 'PROTEIN', 5),
  node('albumin', 'Albumine', 'molecules', 'PROTEIN', 2),
  node('plasmin', 'Plasmine', 'molecules', 'PROTEIN', 3),
  node('enac', 'Canal ENaC', 'molecules', 'RECEPTOR', 4),
  node('angptl4', 'ANGPTL4', 'molecules', 'PROTEIN', 2),
  node('anti-nephrin', 'Autoanticorps anti-néphrine', 'molecules', 'ANTIBODY', 3),
  node('thrombosis', 'Thrombose', 'complications', 'COMPLICATION'),
  node('infection', 'Infection', 'complications', 'COMPLICATION'),
  node('acute-kidney-injury', 'Insuffisance rénale aiguë', 'complications', 'COMPLICATION', 2),
  node('urinary-protein-creatinine', 'Rapport protéinurie/créatininurie', 'examinations', 'LAB'),
  node('albumin-test', 'Albuminémie', 'examinations', 'LAB'),
  node('biopsy', 'Biopsie rénale', 'examinations', 'EXAMINATION'),
  node('genetic-testing', 'Analyse génétique', 'examinations', 'EXAMINATION', 2),
  node('interaction-review', 'Revue des interactions', 'interactions', 'INTERACTION'),
  node('monitoring', 'Surveillance du traitement', 'interactions', 'INTERACTION', 2),
  node('microbiota', 'Microbiote intestinal', 'research', 'RESEARCH', 2),
  node('supar', 'suPAR', 'research', 'BIOMARKER', 2),
  node('cd80', 'CD80', 'research', 'BIOMARKER', 3),
  node('filtration-barrier', 'Perméabilité du filtre rénal', 'mechanisms', 'MECHANISM', 2),
  node('sodium-retention', 'Rétention de sodium', 'mechanisms', 'MECHANISM', 3),
  node('immune-response', 'Réponse immunitaire', 'mechanisms', 'MECHANISM', 2),
  node('weight-tracking', 'Suivi du poids', 'daily_life', 'LIFESTYLE'),
  node('urinary-dipstick', 'Bandelette urinaire', 'daily_life', 'LIFESTYLE', 2),
  node('adherence', 'Suivi du traitement', 'daily_life', 'LIFESTYLE', 2),
  node('isolated-control', 'Signal témoin isolé', 'research', 'RESEARCH', 5),
];

nodes.find(item => item.id === 'gene-nephrin')!.properties = {
  description: 'Gène NPHS1 : nom affiché volontairement partagé avec la protéine pour tester la conservation des identités.',
  synthetic: true,
};
nodes.find(item => item.id === 'protein-nephrin')!.properties = {
  description: 'Protéine néphrine : entité distincte du gène NPHS1 dans cette fixture synthétique.',
  synthetic: true,
};
nodes.find(item => item.id === 'anti-nephrin')!.references = [references.nephrin];
nodes.find(item => item.id === 'microbiota')!.references = [references.microbiota];

const edges: DemoEdge[] = [
  edge('root-kidney', 'syndrome', 'kidney'),
  edge('kidney-glomerulus', 'kidney', 'glomerulus', 'CONTAINS'),
  edge('glomerulus-podocyte', 'glomerulus', 'podocyte', 'CONTAINS'),
  edge('podocyte-slit', 'podocyte', 'slit-diaphragm', 'HAS_STRUCTURE'),
  edge('slit-nephrin', 'slit-diaphragm', 'protein-nephrin', 'CONTAINS', 'established', references.nephrin),
  edge('gene-protein', 'gene-nephrin', 'protein-nephrin', 'ENCODES'),
  edge('glomerulus-membrane', 'glomerulus', 'basement-membrane', 'HAS_STRUCTURE'),
  edge('kidney-collecting', 'kidney', 'collecting-duct', 'CONTAINS'),
  edge('root-proteinuria', 'syndrome', 'proteinuria', 'HAS_MANIFESTATION'),
  edge('root-oedema', 'syndrome', 'oedema', 'HAS_MANIFESTATION'),
  edge('proteinuria-albumin', 'proteinuria', 'hypoalbuminemia', 'ASSOCIATED_WITH'),
  edge('proteinuria-foamy', 'proteinuria', 'foamy-urine', 'ASSOCIATED_WITH'),
  edge('oedema-fatigue', 'oedema', 'fatigue'),
  edge('podocyte-proteinuria-a', 'podocyte', 'proteinuria', 'ASSOCIATED_WITH'),
  // Distinct relationship and reverse direction must both survive normalization.
  edge('podocyte-proteinuria-b', 'podocyte', 'proteinuria', 'CONTRIBUTES_TO'),
  edge('proteinuria-podocyte', 'proteinuria', 'podocyte', 'INVESTIGATED_WITH'),
  ...['minimal-change', 'fsgs', 'membranous'].map(id => edge(`root-${id}`, 'syndrome', id)),
  ...['prednisolone', 'cyclosporine', 'tacrolimus', 'rituximab', 'mycophenolate', 'sodium-management'].map(id => edge(`root-${id}`, id, 'syndrome', 'THERAPEUTIC_CONTEXT')),
  edge('nphs2-root', 'nphs2', 'syndrome', 'GENETIC_CONTEXT'),
  edge('wt1-root', 'wt1', 'syndrome', 'GENETIC_CONTEXT'),
  edge('lamb2-wt1', 'lamb2', 'wt1', 'SHARES_RESEARCH_CONTEXT'),
  edge('albumin-proteinuria', 'albumin', 'proteinuria'),
  edge('plasmin-collecting', 'collecting-duct', 'plasmin', 'RESEARCH_CONTEXT'),
  edge('plasmin-enac', 'plasmin', 'enac', 'ACTIVATES', 'research', references.plasmin),
  edge('enac-retention', 'enac', 'sodium-retention', 'CONTRIBUTES_TO', 'research', references.plasmin),
  edge('angptl4-root', 'angptl4', 'syndrome', 'RESEARCH_CONTEXT'),
  edge('antibody-podocyte', 'anti-nephrin', 'podocyte', 'TARGETS', 'research', references.nephrin),
  ...['thrombosis', 'infection', 'acute-kidney-injury'].map(id => edge(`root-${id}`, 'syndrome', id, 'COMPLICATION_CONTEXT')),
  ...['urinary-protein-creatinine', 'albumin-test', 'biopsy', 'genetic-testing'].map(id => edge(`root-${id}`, id, 'syndrome', 'EXAMINATION_CONTEXT')),
  edge('interactions-cyclosporine', 'interaction-review', 'cyclosporine', 'MONITORING_CONTEXT'),
  edge('monitoring-interactions', 'monitoring', 'interaction-review'),
  edge('microbiota-root', 'microbiota', 'syndrome', 'ASSOCIATED_WITH', 'association', references.microbiota),
  edge('supar-fsgs', 'supar', 'fsgs', 'RESEARCH_CONTEXT'),
  edge('cd80-supar', 'cd80', 'supar', 'SHARES_RESEARCH_CONTEXT'),
  edge('barrier-proteinuria', 'filtration-barrier', 'proteinuria', 'MECHANISTIC_CONTEXT'),
  edge('immune-anti-nephrin', 'immune-response', 'anti-nephrin', 'RESEARCH_CONTEXT', 'research', references.nephrin),
  ...['weight-tracking', 'urinary-dipstick', 'adherence'].map(id => edge(`root-${id}`, 'syndrome', id, 'FOLLOW_UP_CONTEXT')),
];

export const knowledgeGraphFixture: RadialRingsData = {
  knowledge_graph: { nodes, edges },
  micro_signals: [],
  hypotheses: [],
};

/** A legacy ring-zero disease must not replace the explicitly selected gene root. */
export function createGeneRootKnowledgeGraphFixture(): RadialRingsData {
  return {
    ...knowledgeGraphFixture,
    knowledge_graph: {
      nodes: nodes.map(item => ({ ...item, is_root: item.id === 'gene-nephrin',
        ...(item.id === 'gene-nephrin' ? { ring: 6 } : {}) })),
      edges,
    },
  };
}

/** Deliberately non-medical labels make stress-test additions unmistakable. */
export function createDenseKnowledgeGraphFixture(): RadialRingsData {
  const families: Family[] = ['anatomy', 'pathologies', 'manifestations', 'treatments', 'genetics', 'molecules', 'complications', 'examinations', 'interactions', 'research', 'mechanisms', 'daily_life'];
  const extraNodes = Array.from({ length: 180 }, (_, index) =>
    node(`synthetic-extra-${index}`, `Concept synthétique ${String(index + 1).padStart(3, '0')}`, families[index % families.length], 'SYNTHETIC', 2 + index % 4));
  return {
    knowledge_graph: {
      nodes: [...nodes, ...extraNodes],
      edges: [...edges, ...extraNodes.map((item, index) =>
        edge(`synthetic-edge-${index}`, index % 3 === 0 ? 'syndrome' : nodes[1 + index % (nodes.length - 2)].id, item.id))],
    },
    micro_signals: [],
    hypotheses: [],
  };
}
