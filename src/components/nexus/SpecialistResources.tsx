import { ExternalLink } from 'lucide-react';

// These links open a source's own interface; opening the directory does not query a provider.
const collections: { title: string; purpose: string; links: [string, string][] }[] = [
  {
    title: 'Publications, essais et oncologie',
    purpose: 'Lire la publication originale, retrouver un protocole ou examiner les annotations spécialisées en oncologie.',
    links: [
      ['PubMed', 'https://pubmed.ncbi.nlm.nih.gov/'], ['PubMed Central', 'https://pmc.ncbi.nlm.nih.gov/'],
      ['Europe PMC', 'https://europepmc.org/'], ['ClinicalTrials.gov', 'https://clinicaltrials.gov/'],
      ['bioRxiv', 'https://www.biorxiv.org/'], ['medRxiv', 'https://www.medrxiv.org/'],
      ['CIViC', 'https://civicdb.org/'], ['cBioPortal', 'https://www.cbioportal.org/'], ['Prognyx', 'https://www.prognyx.com/mcp'],
    ],
  }, {
    title: 'Maladies, variations et cohortes',
    purpose: 'Préciser le phénotype, la population et le type d’association avant de comparer les données.',
    links: [
      ['Open Targets', 'https://platform.opentargets.org/'], ['EFO / OLS', 'https://www.ebi.ac.uk/ols4/ontologies/efo'],
      ['ClinVar', 'https://www.ncbi.nlm.nih.gov/clinvar/'], ['GWAS Catalog', 'https://www.ebi.ac.uk/gwas/'],
      ['gnomAD', 'https://gnomad.broadinstitute.org/'], ['Genebass', 'https://app.genebass.org/'],
      ['EpiGraphDB', 'https://epigraphdb.org/'], ['European Variation Archive', 'https://www.ebi.ac.uk/eva/'],
      ['FinnGen', 'https://r12.finngen.fi/'], ['BioBank Japan', 'https://pheweb.jp/'],
      ['TPMI', 'https://pheweb.ibms.sinica.edu.tw/'], ['UKB-TOPMed', 'https://pheweb.org/UKB-TOPMed/'],
      ['IPD-IMGT/HLA', 'https://www.ebi.ac.uk/ipd/imgt/hla/'],
    ],
  }, {
    title: 'Gènes, expression et tissus',
    purpose: 'Résoudre un identifiant, localiser une expression ou accéder au jeu de données expérimental.',
    links: [
      ['Ensembl', 'https://www.ensembl.org/'], ['NCBI Entrez', 'https://www.ncbi.nlm.nih.gov/search/'],
      ['NCBI Datasets', 'https://www.ncbi.nlm.nih.gov/datasets/'], ['NCBI Clinical Tables', 'https://clinicaltables.nlm.nih.gov/'],
      ['GTEx', 'https://gtexportal.org/'], ['ENCODE', 'https://www.encodeproject.org/'],
      ['Bgee', 'https://www.bgee.org/'], ['CELLxGENE', 'https://cellxgene.cziscience.com/'],
      ['eQTL Catalogue · fichiers', 'https://www.ebi.ac.uk/eqtl/Data_access/'], ['RNAcentral', 'https://rnacentral.org/'],
      ['BioStudies / ArrayExpress', 'https://www.ebi.ac.uk/biostudies/'], ['Human Protein Atlas', 'https://www.proteinatlas.org/'],
      ['Genomic Intelligence', 'https://docs.genomicintelligence.ai/rest-api'],
    ],
  }, {
    title: 'Protéines, structures et voies biologiques',
    purpose: 'Distinguer les mesures expérimentales des prédictions structurales et des associations fonctionnelles.',
    links: [
      ['UniProt', 'https://www.uniprot.org/'], ['RCSB PDB', 'https://www.rcsb.org/'],
      ['AlphaFold DB', 'https://alphafold.ebi.ac.uk/'], ['Reactome', 'https://reactome.org/'],
      ['STRING', 'https://string-db.org/'], ['QuickGO', 'https://www.ebi.ac.uk/QuickGO/'],
      ['PRIDE', 'https://www.ebi.ac.uk/pride/archive/'], ['ProteomeXchange', 'https://www.proteomexchange.org/'],
      ['Proto · outils biologiques', 'https://proto.evodesign.org/docs/mcp/installation'],
    ],
  }, {
    title: 'Molécules, pharmacologie et métabolisme',
    purpose: 'Retrouver une structure chimique, une mesure de liaison, une annotation pharmacogénétique ou un jeu de données.',
    links: [
      ['ChEMBL', 'https://www.ebi.ac.uk/chembl/'], ['PubChem', 'https://pubchem.ncbi.nlm.nih.gov/'],
      ['ChEBI', 'https://www.ebi.ac.uk/chebi/'], ['BindingDB', 'https://www.bindingdb.org/'],
      ['ClinPGx / PharmGKB', 'https://www.clinpgx.org/'], ['Rhea', 'https://www.rhea-db.org/'],
      ['PeptidePrices · certificats analytiques', 'https://peptideprices.net/coa-library'],
      ['MetaboLights', 'https://www.ebi.ac.uk/metabolights/'], ['MGnify', 'https://www.ebi.ac.uk/metagenomics/'],
    ],
  },
];

export default function SpecialistResources() {
  return (
    <details className="rounded-lg border bg-muted/20 px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">Explorer les ressources spécialisées</summary>
      <p className="my-3 text-muted-foreground">
        Ces liens ouvrent les sites des fournisseurs. Seules les sources indiquées dans le dossier de recherche ont été interrogées pour votre requête.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {collections.map(group => (
          <section key={group.title}>
            <h3 className="font-medium">{group.title}</h3>
            <p className="mb-2 text-xs text-muted-foreground">{group.purpose}</p>
            <ul className="flex flex-wrap gap-x-3 gap-y-2">
              {group.links.map(([name, url]) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-2">
                    {name}<ExternalLink size={12} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}
