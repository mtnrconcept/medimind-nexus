
export interface MoleculeData {
    id: string;
    name: string;
    iupacName: string;
    formula: string;
    smiles: string;
    category: string;
    description: string;
    therapeuticArea?: string;
    molecularWeight?: number;
}

export const MOLECULE_CATALOG: MoleculeData[] = [
    {
        id: "aspirin",
        name: "Aspirine",
        iupacName: "2-acetoxybenzoic acid",
        formula: "C9H8O4",
        smiles: "CC(=O)OC1=CC=CC=C1C(=O)O",
        category: "AINS",
        description: "Médicament utilisé pour traiter la douleur, la fièvre ou l'inflammation.",
        therapeuticArea: "Cardiologie, Douleur",
        molecularWeight: 180.16
    },
    {
        id: "paracetamol",
        name: "Paracétamol",
        iupacName: "N-(4-hydroxyphenyl)acetamide",
        formula: "C8H9NO2",
        smiles: "CC(=O)NC1=CC=C(O)C=C1",
        category: "Analgésique",
        description: "Analgetique et antipyretique largement utilisé.",
        therapeuticArea: "Douleur, Fièvre",
        molecularWeight: 151.16
    },
    {
        id: "caffeine",
        name: "Caféine",
        iupacName: "1,3,7-trimethylpurine-2,6-dione",
        formula: "C8H10N4O2",
        smiles: "CN1C=NC2=C1C(=O)N(C)C(=O)N2C",
        category: "Stimulant",
        description: "Stimulant du système nerveux central de la classe des méthylxanthines.",
        therapeuticArea: "SNC",
        molecularWeight: 194.19
    },
    {
        id: "ibuprofen",
        name: "Ibuprofène",
        iupacName: "(RS)-2-(4-(2-methylpropyl)phenyl)propanoic acid",
        formula: "C13H18O2",
        smiles: "CC(C)CC1=CC=C(C=C1)C(C)C(=O)O",
        category: "AINS",
        description: "Anti-inflammatoire non stéroïdien utilisé pour soulager la douleur.",
        therapeuticArea: "Douleur, Inflammation",
        molecularWeight: 206.29
    },
    {
        id: "penicillin_v",
        name: "Pénicilline V",
        iupacName: "(2S,5R,6R)-3,3-dimethyl-7-oxo-6-[(2-phenoxyacetyl)amino]-4-thia-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
        formula: "C16H18N2O5S",
        smiles: "CC1(C(N2C(S1)C(C2=O)NC(=O)COC3=CC=CC=C3)C(=O)O)C",
        category: "Antibiotique",
        description: "Antibiotique de la famille des bêta-lactamines.",
        therapeuticArea: "Infectiologie",
        molecularWeight: 350.39
    },
    {
        id: "metformin",
        name: "Metformine",
        iupacName: "1,1-dimethylbiguanide",
        formula: "C4H11N5",
        smiles: "CN(C)C(=N)N=C(N)N",
        category: "Antidiabétique",
        description: "Médicament de première intention pour le traitement du diabète de type 2.",
        therapeuticArea: "Endocrinologie",
        molecularWeight: 129.16
    },
    {
        id: "sildenafil",
        name: "Sildénafil",
        iupacName: "5-[2-ethoxy-5-(4-methylpiperazin-1-yl)sulfonylphenyl]-1-methyl-3-propyl-4H-pyrazolo[4,3-d]pyrimidin-7-one",
        formula: "C22H30N6O4S",
        smiles: "CCCC1=NN(C)C2=C1N=C(NC2=O)C3=C(OCC)C=CC(=C3)S(=O)(=O)N4CCN(C)CC4",
        category: "Inhibiteur PDE5",
        description: "Utilisé pour le traitement de la dysfonction érectile et l'hypertension artérielle pulmonaire.",
        therapeuticArea: "Urologie, Cardiologie",
        molecularWeight: 474.58
    },
    {
        id: "morphine",
        name: "Morphine",
        iupacName: "(5α,6α)-17-methyl-7,8-didehydro-4,5-epoxymorphinan-3,6-diol",
        formula: "C17H19NO3",
        smiles: "CN1CCC23C4C1CC5=C3C(=C(C=C5)O)OC2C(C=C4)O",
        category: "Opioïde",
        description: "Puissant analgésique utilisé pour les douleurs intenses.",
        therapeuticArea: "Douleur",
        molecularWeight: 285.34
    },
    {
        id: "dopamine",
        name: "Dopamine",
        iupacName: "4-(2-aminoethyl)benzene-1,2-diol",
        formula: "C8H11NO2",
        smiles: "C1=CC(=C(C=C1CCN)O)O",
        category: "Neurotransmetteur",
        description: "Neurotransmetteur impliqué dans le circuit de la récompense.",
        therapeuticArea: "Neurologie",
        molecularWeight: 153.18
    },
    {
        id: "glucose",
        name: "Glucose",
        iupacName: "D-glucopyranose",
        formula: "C6H12O6",
        smiles: "C(C1C(C(C(C(O1)O)O)O)O)O",
        category: "Glucide",
        description: "Source d'énergie principale pour les cellules de l'organisme.",
        therapeuticArea: "Métabolisme",
        molecularWeight: 180.16
    }
];
