import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Minus,
    Stethoscope,
    Activity,
    Pill,
    Tablets,
    Network,
    Zap,
    ShieldAlert
} from 'lucide-react';

interface Pathology {
    id: string;
    name: string;
    category?: string;
}

interface Symptom {
    id: string;
    name: string;
    body_system?: string;
}

interface Treatment {
    id: string;
    name: string;
    type?: string;
}

interface Medication {
    id: string;
    name: string;
    substance?: string;
    atc_code?: string;
}

interface CausalLink {
    from: string;
    fromType: 'symptom' | 'pathology' | 'treatment' | 'medication';
    to: string;
    toType: 'symptom' | 'pathology' | 'treatment' | 'medication';
    relationship: string;
    probability: 'high' | 'medium' | 'low';
    evidence: string;
    patientCount?: number;
    webSources?: string[];
    isAppropriate?: boolean;
    effectType?: 'therapeutic' | 'adverse' | 'both';
    therapeuticDetails?: string;
    adverseDetails?: string;
    dangerLevel?: 'critical' | 'high' | 'moderate' | 'low';
    interactionType?: 'drug-drug' | 'drug-treatment' | 'pathology-danger';
}

interface AnalysisResult {
    causalLinks?: CausalLink[];
    summary: string;
    warnings?: string[];
    recommendations?: string[];
    sources?: string[];
}

interface RelationshipMatrixProps {
    pathologies: Pathology[];
    symptoms: Symptom[];
    treatments: Treatment[];
    medications: Medication[];
    selectedPathologies: string[];
    selectedSymptoms: string[];
    selectedTreatments: string[];
    selectedMedications: string[];
    analysisResult: AnalysisResult | null;
}

type RelationType = 'positive' | 'negative' | 'warning' | 'danger' | 'none';

interface Relation {
    type: RelationType;
    target: string;
    description?: string;
    dangerLevel?: string;
}

// Nouvelle structure avec toutes les colonnes
interface ElementRow {
    id: string;
    name: string;
    elementType: 'pathology' | 'symptom' | 'treatment' | 'medication';

    // Colonnes bidirectionnelles
    treatedBy: Relation[];           // Médicaments/traitements qui traitent cet élément
    contraindicatedMeds: Relation[]; // Médicaments contre-indiqués (pour pathologies)
    causedByPathology: Relation[];   // Pathologies qui causent ce symptôme

    // Colonnes pour médicaments/traitements
    treats: Relation[];              // Ce que cet élément traite
    causesSymptoms: Relation[];      // Symptômes causés (effets indésirables)

    // Colonnes d'interactions
    drugInteractions: Relation[];    // Interactions médicamenteuses
    treatmentInteractions: Relation[]; // Interactions traitement
    dangerWithPathology: Relation[]; // Danger avec pathologie (ex: infection + immunosuppresseur)
}

export function RelationshipMatrix({
    pathologies,
    symptoms,
    treatments,
    medications,
    selectedPathologies,
    selectedSymptoms,
    selectedTreatments,
    selectedMedications,
    analysisResult
}: RelationshipMatrixProps) {

    // Normaliser les noms pour comparaison
    const normalizeForComparison = (name: string): string => {
        return name.toLowerCase()
            .trim()
            .replace(/[àáâãäå]/g, 'a')
            .replace(/[èéêë]/g, 'e')
            .replace(/[ìíîï]/g, 'i')
            .replace(/[òóôõö]/g, 'o')
            .replace(/[ùúûü]/g, 'u')
            .replace(/[ç]/g, 'c')
            .replace(/[œ]/g, 'oe')
            .replace(/[æ]/g, 'ae')
            .replace(/[,.\-_]/g, ' ')
            .replace(/\s+/g, ' ');
    };

    // Vérifier si deux noms correspondent (inclusion partielle)
    const matchesElement = (linkName: string, elementName: string): boolean => {
        const linkNorm = normalizeForComparison(linkName);
        const elemNorm = normalizeForComparison(elementName);

        // Correspondance exacte ou inclusion
        if (linkNorm === elemNorm) return true;
        if (linkNorm.includes(elemNorm) || elemNorm.includes(linkNorm)) return true;

        // Vérifier les mots clés principaux (au moins 3 caractères)
        const linkWords = linkNorm.split(' ').filter(w => w.length >= 3);
        const elemWords = elemNorm.split(' ').filter(w => w.length >= 3);

        // Si au moins 50% des mots correspondent
        const matchingWords = linkWords.filter(lw =>
            elemWords.some(ew => lw.includes(ew) || ew.includes(lw))
        );

        return matchingWords.length >= Math.min(1, Math.floor(linkWords.length * 0.5));
    };

    // Analyse bidirectionnelle des relations
    const analyzeElementRelations = (
        elementName: string,
        elementType: 'pathology' | 'symptom' | 'treatment' | 'medication',
        causalLinks: CausalLink[]
    ): Omit<ElementRow, 'id' | 'name' | 'elementType'> => {
        const result = {
            treatedBy: [] as Relation[],
            contraindicatedMeds: [] as Relation[],
            causedByPathology: [] as Relation[],
            treats: [] as Relation[],
            causesSymptoms: [] as Relation[],
            drugInteractions: [] as Relation[],
            treatmentInteractions: [] as Relation[],
            dangerWithPathology: [] as Relation[]
        };

        causalLinks.forEach(link => {
            const isSource = matchesElement(link.from, elementName);
            const isTarget = matchesElement(link.to, elementName);

            // ========== PATHOLOGIE ==========
            if (elementType === 'pathology') {
                // Pathologie comme CIBLE → qui la traite?
                if (isTarget && (link.fromType === 'medication' || link.fromType === 'treatment')) {
                    if (link.isAppropriate === true || link.effectType === 'therapeutic') {
                        result.treatedBy.push({
                            type: 'positive',
                            target: link.from,
                            description: link.therapeuticDetails || link.evidence || link.relationship
                        });
                    }
                    if (link.isAppropriate === false) {
                        const isDanger = link.dangerLevel === 'critical' || link.dangerLevel === 'high';
                        result.contraindicatedMeds.push({
                            type: isDanger ? 'danger' : 'negative',
                            target: link.from,
                            description: link.adverseDetails || link.evidence || link.relationship,
                            dangerLevel: link.dangerLevel
                        });
                    }
                }

                // Pathologie comme SOURCE → quels symptômes cause-t-elle?
                if (isSource && link.toType === 'symptom') {
                    result.causesSymptoms.push({
                        type: 'positive',
                        target: link.to,
                        description: link.evidence || link.relationship
                    });
                }

                // Danger avec médicaments (ex: varicelle + immunosuppresseur)
                if (isTarget && link.dangerLevel && (link.dangerLevel === 'critical' || link.dangerLevel === 'high')) {
                    result.dangerWithPathology.push({
                        type: 'danger',
                        target: link.from,
                        description: link.evidence || link.relationship,
                        dangerLevel: link.dangerLevel
                    });
                }
            }

            // ========== SYMPTÔME ==========
            if (elementType === 'symptom') {
                // Symptôme comme CIBLE → quelle pathologie le cause?
                if (isTarget && link.fromType === 'pathology') {
                    result.causedByPathology.push({
                        type: 'positive',
                        target: link.from,
                        description: link.evidence || `Symptôme typique de ${link.from}`
                    });
                }

                // Symptôme comme CIBLE → quel médicament le traite ou le cause?
                if (isTarget && (link.fromType === 'medication' || link.fromType === 'treatment')) {
                    if (link.effectType === 'therapeutic') {
                        result.treatedBy.push({
                            type: 'positive',
                            target: link.from,
                            description: link.therapeuticDetails || link.evidence
                        });
                    }
                    if (link.effectType === 'adverse') {
                        result.treatedBy.push({
                            type: 'warning',
                            target: link.from,
                            description: `Effet indésirable: ${link.adverseDetails || link.evidence}`
                        });
                    }
                }
            }

            // ========== MÉDICAMENT ==========
            if (elementType === 'medication') {
                // Médicament comme SOURCE → quelles pathologies traite-t-il?
                if (isSource && link.toType === 'pathology') {
                    if (link.isAppropriate === true || link.effectType === 'therapeutic') {
                        result.treats.push({
                            type: 'positive',
                            target: link.to,
                            description: link.therapeuticDetails || link.evidence || link.relationship
                        });
                    }
                    if (link.isAppropriate === false) {
                        result.contraindicatedMeds.push({
                            type: 'negative',
                            target: link.to,
                            description: link.adverseDetails || link.evidence
                        });
                    }
                }

                // Médicament comme SOURCE → quels symptômes cause-t-il?
                if (isSource && link.toType === 'symptom') {
                    const relType = link.effectType === 'adverse' ? 'warning' :
                        link.effectType === 'therapeutic' ? 'positive' : 'warning';
                    result.causesSymptoms.push({
                        type: relType,
                        target: link.to,
                        description: link.effectType === 'adverse'
                            ? (link.adverseDetails || link.evidence)
                            : (link.therapeuticDetails || link.evidence)
                    });
                }

                // Interactions médicamenteuses
                if ((isSource || isTarget) && link.fromType === 'medication' && link.toType === 'medication') {
                    const otherDrug = isSource ? link.to : link.from;
                    result.drugInteractions.push({
                        type: link.dangerLevel === 'critical' || link.dangerLevel === 'high' ? 'danger' : 'warning',
                        target: otherDrug,
                        description: link.evidence || link.relationship,
                        dangerLevel: link.dangerLevel
                    });
                }

                // Interactions traitement
                if ((isSource || isTarget) &&
                    ((link.fromType === 'medication' && link.toType === 'treatment') ||
                        (link.fromType === 'treatment' && link.toType === 'medication'))) {
                    const otherItem = isSource ? link.to : link.from;
                    result.treatmentInteractions.push({
                        type: 'warning',
                        target: otherItem,
                        description: link.evidence || link.relationship
                    });
                }

                // Danger avec pathologie (ex: immunosuppresseur + infection virale)
                if (isSource && link.toType === 'pathology' && link.dangerLevel) {
                    result.dangerWithPathology.push({
                        type: 'danger',
                        target: link.to,
                        description: link.evidence || link.relationship,
                        dangerLevel: link.dangerLevel
                    });
                }
            }

            // ========== TRAITEMENT ==========
            if (elementType === 'treatment') {
                // Traitement comme SOURCE → quelles pathologies traite-t-il?
                if (isSource && link.toType === 'pathology') {
                    if (link.isAppropriate === true || link.effectType === 'therapeutic') {
                        result.treats.push({
                            type: 'positive',
                            target: link.to,
                            description: link.therapeuticDetails || link.evidence || link.relationship
                        });
                    }
                    if (link.isAppropriate === false) {
                        result.contraindicatedMeds.push({
                            type: 'negative',
                            target: link.to,
                            description: link.adverseDetails || link.evidence
                        });
                    }
                }

                // Traitement comme SOURCE → quels symptômes cause-t-il?
                if (isSource && link.toType === 'symptom') {
                    result.causesSymptoms.push({
                        type: link.effectType === 'adverse' ? 'warning' : 'positive',
                        target: link.to,
                        description: link.effectType === 'adverse'
                            ? (link.adverseDetails || link.evidence)
                            : (link.therapeuticDetails || link.evidence)
                    });
                }

                // Interactions avec médicaments
                if ((isSource || isTarget) &&
                    ((link.fromType === 'treatment' && link.toType === 'medication') ||
                        (link.fromType === 'medication' && link.toType === 'treatment'))) {
                    const otherItem = isSource ? link.to : link.from;
                    result.treatmentInteractions.push({
                        type: 'warning',
                        target: otherItem,
                        description: link.evidence || link.relationship
                    });
                }
            }
        });

        // Supprimer les doublons de chaque catégorie
        const dedupeRelations = (relations: Relation[]): Relation[] => {
            const unique: Relation[] = [];
            relations.forEach(rel => {
                if (!unique.find(r => r.target === rel.target && r.type === rel.type)) {
                    unique.push(rel);
                }
            });
            return unique;
        };

        return {
            treatedBy: dedupeRelations(result.treatedBy),
            contraindicatedMeds: dedupeRelations(result.contraindicatedMeds),
            causedByPathology: dedupeRelations(result.causedByPathology),
            treats: dedupeRelations(result.treats),
            causesSymptoms: dedupeRelations(result.causesSymptoms),
            drugInteractions: dedupeRelations(result.drugInteractions),
            treatmentInteractions: dedupeRelations(result.treatmentInteractions),
            dangerWithPathology: dedupeRelations(result.dangerWithPathology)
        };
    };

    // Construire les lignes du tableau
    const selectedItems = useMemo(() => {
        const items: ElementRow[] = [];
        const rawCausalLinks = analysisResult?.causalLinks || [];

        // Créer une liste de tous les noms d'éléments sélectionnés pour le filtrage
        const selectedNames: string[] = [];

        selectedPathologies.forEach(id => {
            const p = pathologies.find(p => p.id === id);
            if (p) selectedNames.push(normalizeForComparison(p.name));
        });
        selectedSymptoms.forEach(id => {
            const s = symptoms.find(s => s.id === id);
            if (s) selectedNames.push(normalizeForComparison(s.name));
        });
        selectedTreatments.forEach(id => {
            const t = treatments.find(t => t.id === id);
            if (t) selectedNames.push(normalizeForComparison(t.name));
        });
        selectedMedications.forEach(id => {
            const m = medications.find(m => m.id === id);
            if (m) selectedNames.push(normalizeForComparison(m.name));
        });

        // Fonction pour vérifier si un nom de lien correspond à un élément sélectionné
        const isSelectedElement = (linkName: string): boolean => {
            const linkNorm = normalizeForComparison(linkName);
            return selectedNames.some(selName =>
                linkNorm.includes(selName) || selName.includes(linkNorm) ||
                linkNorm === selName
            );
        };

        // FILTRER les causalLinks: garder les liens où AU MOINS UN élément (from OU to) est sélectionné
        // Cela permet à l'IA de mentionner des éléments non sélectionnés dans les explications
        const causalLinks = rawCausalLinks.filter(link =>
            isSelectedElement(link.from) || isSelectedElement(link.to)
        );

        console.log(`[RelationshipMatrix] Liens pertinents: ${causalLinks.length}/${rawCausalLinks.length}`);

        // Fonction pour vérifier si un élément a au moins un lien
        const hasAnyRelation = (relations: Omit<ElementRow, 'id' | 'name' | 'elementType'>): boolean => {
            return (
                relations.treatedBy.length > 0 ||
                relations.contraindicatedMeds.length > 0 ||
                relations.causedByPathology.length > 0 ||
                relations.treats.length > 0 ||
                relations.causesSymptoms.length > 0 ||
                relations.drugInteractions.length > 0 ||
                relations.treatmentInteractions.length > 0 ||
                relations.dangerWithPathology.length > 0
            );
        };

        // Pathologies - n'ajouter que si elles ont des liens
        selectedPathologies.forEach(id => {
            const pathology = pathologies.find(p => p.id === id);
            if (pathology) {
                const relations = analyzeElementRelations(pathology.name, 'pathology', causalLinks);
                if (hasAnyRelation(relations)) {
                    items.push({
                        id: pathology.id,
                        name: pathology.name,
                        elementType: 'pathology',
                        ...relations
                    });
                }
            }
        });

        // Symptômes - n'ajouter que si ils ont des liens
        selectedSymptoms.forEach(id => {
            const symptom = symptoms.find(s => s.id === id);
            if (symptom) {
                const relations = analyzeElementRelations(symptom.name, 'symptom', causalLinks);
                if (hasAnyRelation(relations)) {
                    items.push({
                        id: symptom.id,
                        name: symptom.name,
                        elementType: 'symptom',
                        ...relations
                    });
                }
            }
        });

        // Traitements - n'ajouter que si ils ont des liens
        selectedTreatments.forEach(id => {
            const treatment = treatments.find(t => t.id === id);
            if (treatment) {
                const relations = analyzeElementRelations(treatment.name, 'treatment', causalLinks);
                if (hasAnyRelation(relations)) {
                    items.push({
                        id: treatment.id,
                        name: treatment.name,
                        elementType: 'treatment',
                        ...relations
                    });
                }
            }
        });

        // Médicaments - n'ajouter que si ils ont des liens
        selectedMedications.forEach(id => {
            const medication = medications.find(m => m.id === id);
            if (medication) {
                const relations = analyzeElementRelations(medication.name, 'medication', causalLinks);
                if (hasAnyRelation(relations)) {
                    items.push({
                        id: medication.id,
                        name: medication.name,
                        elementType: 'medication',
                        ...relations
                    });
                }
            }
        });

        return items;
    }, [pathologies, symptoms, treatments, medications, selectedPathologies, selectedSymptoms, selectedTreatments, selectedMedications, analysisResult, normalizeForComparison, analyzeElementRelations]);

    // Icône selon le type d'élément
    const getElementIcon = (type: ElementRow['elementType']) => {
        switch (type) {
            case 'pathology':
                return <Stethoscope className="h-4 w-4 text-red-500" />;
            case 'symptom':
                return <Activity className="h-4 w-4 text-blue-500" />;
            case 'treatment':
                return <Pill className="h-4 w-4 text-green-500" />;
            case 'medication':
                return <Tablets className="h-4 w-4 text-orange-500" />;
        }
    };

    // Badge selon le type
    const getTypeBadge = (type: ElementRow['elementType']) => {
        const labels = {
            pathology: 'Pathologie',
            symptom: 'Symptôme',
            treatment: 'Traitement',
            medication: 'Médicament'
        };
        const colors = {
            pathology: 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30',
            symptom: 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30',
            treatment: 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30',
            medication: 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30'
        };
        return <Badge className={colors[type]}>{labels[type]}</Badge>;
    };

    // Afficher les relations dans une cellule
    const renderRelationCell = (relations: Relation[]) => {
        if (relations.length === 0) {
            return (
                <div className="flex justify-center">
                    <Minus className="h-4 w-4 text-muted-foreground" />
                </div>
            );
        }

        return (
            <div className="flex flex-wrap gap-1 justify-center">
                {relations.map((rel, idx) => {
                    const isDanger = rel.type === 'danger' || rel.dangerLevel === 'critical' || rel.dangerLevel === 'high';
                    const bgClass = isDanger
                        ? 'bg-red-500/20 border border-red-500/40'
                        : rel.type === 'warning'
                            ? 'bg-orange-500/10 border border-orange-500/30'
                            : rel.type === 'positive'
                                ? 'bg-green-500/10 border border-green-500/30'
                                : 'bg-muted/50';

                    return (
                        <Tooltip key={idx}>
                            <TooltipTrigger asChild>
                                <div className={`flex items-center gap-1 px-2 py-1 rounded-md cursor-help ${bgClass}`}>
                                    {rel.type === 'positive' && <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />}
                                    {rel.type === 'negative' && <XCircle className="h-3 w-3 text-red-500 flex-shrink-0" />}
                                    {rel.type === 'warning' && <AlertTriangle className="h-3 w-3 text-orange-500 flex-shrink-0" />}
                                    {rel.type === 'danger' && <ShieldAlert className="h-3 w-3 text-red-600 flex-shrink-0" />}
                                    <span className={`text-xs truncate max-w-[80px] ${isDanger ? 'font-semibold text-red-600' : ''}`}>
                                        {rel.target}
                                    </span>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent className={isDanger ? 'bg-red-50 dark:bg-red-900/50 border-red-500 max-w-sm' : 'max-w-sm'}>
                                <div>
                                    {isDanger && (
                                        <p className="font-bold text-red-600 mb-1">⚠️ DANGER</p>
                                    )}
                                    <p className="text-sm">{rel.description || `Relation avec ${rel.target}`}</p>
                                </div>
                            </TooltipContent>
                        </Tooltip>
                    );
                })}
            </div>
        );
    };

    if (selectedItems.length === 0) {
        return null;
    }

    return (
        <Card className="mt-6">
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                    <Network className="h-5 w-5 text-primary" />
                    Matrice des Relations
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                    Visualisation complète des liens entre les éléments sélectionnés
                </p>
            </CardHeader>
            <CardContent>
                {/* Légende */}
                <div className="flex flex-wrap gap-3 mb-4 text-xs">
                    <div className="flex items-center gap-1 px-2 py-1 bg-green-500/10 border border-green-500/30 rounded">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        <span>Relation positive</span>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 bg-red-500/10 border border-red-500/30 rounded">
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                        <span>Contre-indication</span>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 bg-red-500/20 border border-red-500/50 rounded">
                        <ShieldAlert className="h-3.5 w-3.5 text-red-600" />
                        <span className="font-semibold text-red-600">DANGER</span>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 bg-orange-500/10 border border-orange-500/30 rounded">
                        <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                        <span>Vigilance</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-muted-foreground">Non applicable</span>
                    </div>
                </div>

                <ScrollArea className="w-full">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/30">
                                <TableHead className="w-[180px] font-semibold">Élément</TableHead>
                                <TableHead className="w-[90px] text-center font-semibold">Type</TableHead>
                                <TableHead className="text-center min-w-[120px]">
                                    <span className="flex items-center justify-center gap-1 text-green-600">
                                        <Tablets className="h-3 w-3" />
                                        Traité par
                                    </span>
                                </TableHead>
                                <TableHead className="text-center min-w-[120px]">
                                    <span className="flex items-center justify-center gap-1 text-red-600">
                                        <XCircle className="h-3 w-3" />
                                        Contre-indiqué
                                    </span>
                                </TableHead>
                                <TableHead className="text-center min-w-[120px]">
                                    <span className="flex items-center justify-center gap-1 text-purple-600">
                                        <Stethoscope className="h-3 w-3" />
                                        Causé par patho.
                                    </span>
                                </TableHead>
                                <TableHead className="text-center min-w-[120px]">
                                    <span className="flex items-center justify-center gap-1 text-green-600">
                                        <CheckCircle2 className="h-3 w-3" />
                                        Traite
                                    </span>
                                </TableHead>
                                <TableHead className="text-center min-w-[120px]">
                                    <span className="flex items-center justify-center gap-1 text-orange-600">
                                        <AlertTriangle className="h-3 w-3" />
                                        Cause sympt.
                                    </span>
                                </TableHead>
                                <TableHead className="text-center min-w-[120px]">
                                    <span className="flex items-center justify-center gap-1 text-purple-600">
                                        <Zap className="h-3 w-3" />
                                        Inter. méd.
                                    </span>
                                </TableHead>
                                <TableHead className="text-center min-w-[120px]">
                                    <span className="flex items-center justify-center gap-1 text-red-600">
                                        <ShieldAlert className="h-3 w-3" />
                                        Dangers
                                    </span>
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {selectedItems.map((item) => (
                                <TableRow key={`${item.elementType}-${item.id}`} className="hover:bg-muted/20">
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            {getElementIcon(item.elementType)}
                                            <span className="truncate max-w-[150px]" title={item.name}>
                                                {item.name}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {getTypeBadge(item.elementType)}
                                    </TableCell>
                                    {/* Traité par - Pour pathologies et symptômes */}
                                    <TableCell>
                                        {item.elementType === 'pathology' || item.elementType === 'symptom'
                                            ? renderRelationCell(item.treatedBy)
                                            : <Minus className="h-4 w-4 text-muted-foreground mx-auto" />
                                        }
                                    </TableCell>
                                    {/* Contre-indiqué - Pour pathologies (médicaments CI) et médicaments (patho CI) */}
                                    <TableCell>
                                        {item.elementType === 'pathology' || item.elementType === 'medication' || item.elementType === 'treatment'
                                            ? renderRelationCell(item.contraindicatedMeds)
                                            : <Minus className="h-4 w-4 text-muted-foreground mx-auto" />
                                        }
                                    </TableCell>
                                    {/* Causé par pathologie - Pour symptômes */}
                                    <TableCell>
                                        {item.elementType === 'symptom'
                                            ? renderRelationCell(item.causedByPathology)
                                            : <Minus className="h-4 w-4 text-muted-foreground mx-auto" />
                                        }
                                    </TableCell>
                                    {/* Traite - Pour médicaments et traitements */}
                                    <TableCell>
                                        {item.elementType === 'medication' || item.elementType === 'treatment'
                                            ? renderRelationCell(item.treats)
                                            : <Minus className="h-4 w-4 text-muted-foreground mx-auto" />
                                        }
                                    </TableCell>
                                    {/* Cause symptômes - Pour pathologies, médicaments, traitements */}
                                    <TableCell>
                                        {item.elementType !== 'symptom'
                                            ? renderRelationCell(item.causesSymptoms)
                                            : <Minus className="h-4 w-4 text-muted-foreground mx-auto" />
                                        }
                                    </TableCell>
                                    {/* Interactions médicamenteuses - Pour médicaments */}
                                    <TableCell>
                                        {item.elementType === 'medication'
                                            ? renderRelationCell([...item.drugInteractions, ...item.treatmentInteractions])
                                            : item.elementType === 'treatment'
                                                ? renderRelationCell(item.treatmentInteractions)
                                                : <Minus className="h-4 w-4 text-muted-foreground mx-auto" />
                                        }
                                    </TableCell>
                                    {/* Dangers - Pour tous */}
                                    <TableCell>
                                        {renderRelationCell(item.dangerWithPathology)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <ScrollBar orientation="horizontal" />
                </ScrollArea>

                {!analysisResult && (
                    <p className="text-sm text-muted-foreground text-center mt-4">
                        Lancez une analyse pour voir les relations détectées entre les éléments.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

export default RelationshipMatrix;
