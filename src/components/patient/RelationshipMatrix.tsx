import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Stethoscope,
    Activity,
    Pill,
    Tablets,
    ArrowRight,
    Info,
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
    symptomFrequency?: 'principal' | 'frequent' | 'possible' | 'rare';
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

// Types de pastilles
type PillType = 'danger' | 'contraindicated' | 'interaction' | 'treats' | 'symptom' | null;

interface PillInfo {
    type: PillType;
    label: string;
    description: string;
    color: string;
    bgColor: string;
    link: CausalLink; // Lien complet pour le dialog
}

// Élément unifié pour la matrice
interface MatrixElement {
    id: string;
    name: string;
    type: 'pathology' | 'symptom' | 'treatment' | 'medication';
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

    // État pour le dialog de détails du lien
    const [selectedLink, setSelectedLink] = useState<CausalLink | null>(null);
    const [showLinkDialog, setShowLinkDialog] = useState(false);

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
            .replace(/[,.\\-_]/g, ' ')
            .replace(/\s+/g, ' ');
    };

    // Vérifier si deux noms correspondent (version stricte)
    const matchesElement = (linkName: string, elementName: string): boolean => {
        const linkNorm = normalizeForComparison(linkName);
        const elemNorm = normalizeForComparison(elementName);

        // Correspondance exacte
        if (linkNorm === elemNorm) return true;

        // Inclusions : assouplissement du ratio pour les noms longs (médicaments)
        // Si le nom du lien est contenu dans l'élément, c'est souvent un bon match (ex: "Metformine" dans "Metformine 1000mg")
        if (elemNorm.length >= 5) {
            // Si le lien est court (ex: AI output) et inclus dans l'élément long (DB)
            if (elemNorm.includes(linkNorm)) {
                // Ratio abaissé à 0.3 pour capturer "Metformine" (10) dans "Metformine...long..." (30+)
                if (linkNorm.length >= elemNorm.length * 0.3) return true;
                // Si le lien est au tout début (ex: marque ou substance au début)
                if (elemNorm.startsWith(linkNorm)) return true;
            }
            // Inverse (rare): élément inclus dans lien
            if (linkNorm.includes(elemNorm) && elemNorm.length >= linkNorm.length * 0.6) return true;
        }

        // Comparaison par mots
        const linkWords = linkNorm.split(' ').filter(w => w.length >= 3); // 3+ chars (inclut "type", "nom")
        const elemWords = elemNorm.split(' ').filter(w => w.length >= 3);

        if (linkWords.length === 0 || elemWords.length === 0) return false;

        // 1. Couverture de l'élément par le lien (ex: "Diabete type 2" vs "Diabete")
        const matchingElemWords = elemWords.filter(ew =>
            linkWords.some(lw => lw === ew || (lw.length >= 4 && ew.length >= 4 && (lw.includes(ew) || ew.includes(lw))))
        );
        const elemCoverage = matchingElemWords.length / elemWords.length;
        if (elemCoverage >= 0.7) return true;

        // 2. Couverture du lien par l'élément (NOUVEAU - CRITIQUE)
        // Ex: Link="Metformine", Elem="Metformine 1000mg sachet"
        // Link words ["metformine"] sont tous dans Elem words
        const matchingLinkWords = linkWords.filter(lw =>
            elemWords.some(ew => lw === ew || (lw.length >= 4 && ew.length >= 4 && (lw.includes(ew) || ew.includes(lw))))
        );
        const linkCoverage = matchingLinkWords.length / linkWords.length;

        // Si 100% des mots significatifs du lien sont trouvés dans l'élément, c'est un match
        if (linkCoverage >= 0.9) return true;

        return false;
    };

    // Créer la liste de tous les éléments sélectionnés
    const allElements = useMemo((): MatrixElement[] => {
        const elements: MatrixElement[] = [];

        // Pathologies
        pathologies.filter(p => selectedPathologies.includes(p.id)).forEach(p => {
            elements.push({ id: p.id, name: p.name, type: 'pathology' });
        });

        // Symptômes
        symptoms.filter(s => selectedSymptoms.includes(s.id)).forEach(s => {
            elements.push({ id: s.id, name: s.name, type: 'symptom' });
        });

        // Traitements
        treatments.filter(t => selectedTreatments.includes(t.id)).forEach(t => {
            elements.push({ id: t.id, name: t.name, type: 'treatment' });
        });

        // Médicaments
        medications.filter(m => selectedMedications.includes(m.id)).forEach(m => {
            elements.push({ id: m.id, name: m.name, type: 'medication' });
        });

        return elements;
    }, [pathologies, symptoms, treatments, medications, selectedPathologies, selectedSymptoms, selectedTreatments, selectedMedications]);

    // Obtenir la pastille pour une intersection
    const getPillForIntersection = (rowElement: MatrixElement, colElement: MatrixElement): PillInfo | null => {
        if (rowElement.id === colElement.id) return null; // Même élément

        const causalLinks = analysisResult?.causalLinks || [];

        // Chercher un lien entre les deux éléments EXACTEMENT (dans les deux directions)
        // Le lien doit correspondre à CES DEUX éléments spécifiques, pas à d'autres
        const link = causalLinks.find(l => {
            // Direction 1: row -> col
            const matchRowToCol = matchesElement(l.from, rowElement.name) && matchesElement(l.to, colElement.name);
            // Direction 2: col -> row
            const matchColToRow = matchesElement(l.from, colElement.name) && matchesElement(l.to, rowElement.name);

            if (!matchRowToCol && !matchColToRow) return false;

            // Validation supplémentaire : vérifier que les types correspondent aussi
            const fromMatchesRow = l.fromType === rowElement.type;
            const toMatchesCol = l.toType === colElement.type;
            const fromMatchesCol = l.fromType === colElement.type;
            const toMatchesRow = l.toType === rowElement.type;

            // Le lien doit correspondre aux types dans l'une des deux directions
            return (matchRowToCol && fromMatchesRow && toMatchesCol) ||
                (matchColToRow && fromMatchesCol && toMatchesRow);
        });

        if (!link) return null;

        // Déterminer le label de probabilité
        const probabilityLabel = link.probability === 'high' ? 'Forte' :
            link.probability === 'medium' ? 'Moyenne' :
                link.probability === 'low' ? 'Faible' : '';

        // 🔴 ROUGE - DANGER
        // Interaction dangereuse (dangerLevel critical ou high)
        if (link.dangerLevel === 'critical' || link.dangerLevel === 'high') {
            return {
                type: 'danger',
                label: link.dangerLevel === 'critical' ? '⚠️ Critique' : '🔶 Élevé',
                description: link.evidence || link.relationship || 'Interaction dangereuse',
                color: '#dc2626',
                bgColor: '#fef2f2',
                link
            };
        }

        // 🟠 ORANGE - CONTRE-INDIQUÉ
        // Médicament contre-indiqué pour pathologie, ou danger modéré
        if (link.isAppropriate === false || link.dangerLevel === 'moderate') {
            return {
                type: 'contraindicated',
                label: '✗ Contre-indiqué',
                description: link.evidence || link.relationship || 'Contre-indication',
                color: '#ea580c',
                bgColor: '#fff7ed',
                link
            };
        }

        // 🟡 JAUNE - INTERACTION POSSIBLE / EFFETS SECONDAIRES
        if (link.effectType === 'adverse' || link.effectType === 'both' ||
            link.dangerLevel === 'low' ||
            link.interactionType === 'drug-drug') {
            return {
                type: 'interaction',
                label: '⚡ Interaction',
                description: link.evidence || link.relationship || 'Interaction possible',
                color: '#ca8a04',
                bgColor: '#fefce8',
                link
            };
        }

        // 🟢 VERT - TRAITE / ADAPTÉ (médicament → pathologie)
        if (link.isAppropriate === true || link.effectType === 'therapeutic') {
            return {
                type: 'treats',
                label: '✓ Traite',
                description: link.therapeuticDetails || link.evidence || link.relationship || 'Traitement adapté',
                color: '#16a34a',
                bgColor: '#f0fdf4',
                link
            };
        }

        // 🟢 VERT - SYMPTÔME (pathologie → symptôme)
        if (link.symptomFrequency) {
            const frequencyLabel = link.symptomFrequency === 'principal' ? '★ Principal' :
                link.symptomFrequency === 'frequent' ? '◆ Fréquent' :
                    link.symptomFrequency === 'possible' ? '◇ Possible' : '○ Rare';
            const isNormal = link.symptomFrequency === 'principal' || link.symptomFrequency === 'frequent';
            return {
                type: 'symptom',
                label: frequencyLabel,
                description: link.evidence || link.relationship || 'Symptôme associé',
                color: isNormal ? '#16a34a' : '#ca8a04',
                bgColor: isNormal ? '#f0fdf4' : '#fefce8',
                link
            };
        }

        // Lien par défaut (informatif - avec probabilité si disponible)
        return {
            type: 'interaction',
            label: probabilityLabel || 'Lien',
            description: link.evidence || link.relationship || 'Relation détectée',
            color: '#3b82f6',
            bgColor: '#eff6ff',
            link
        };
    };

    // Obtenir l'icône pour un type d'élément
    const getTypeIcon = (type: MatrixElement['type']) => {
        switch (type) {
            case 'pathology':
                return <Stethoscope className="h-3 w-3 text-red-500" />;
            case 'symptom':
                return <Activity className="h-3 w-3 text-blue-500" />;
            case 'treatment':
                return <Tablets className="h-3 w-3 text-green-500" />;
            case 'medication':
                return <Pill className="h-3 w-3 text-orange-500" />;
        }
    };

    // Obtenir la couleur de fond pour le header selon le type
    const getTypeHeaderBg = (type: MatrixElement['type']) => {
        switch (type) {
            case 'pathology':
                return 'bg-red-50 dark:bg-red-900/20';
            case 'symptom':
                return 'bg-blue-50 dark:bg-blue-900/20';
            case 'treatment':
                return 'bg-green-50 dark:bg-green-900/20';
            case 'medication':
                return 'bg-orange-50 dark:bg-orange-900/20';
        }
    };

    if (allElements.length === 0) {
        return (
            <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                    Sélectionnez des éléments pour voir la matrice de relations
                </CardContent>
            </Card>
        );
    }

    return (
        <TooltipProvider>
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                        <span>Matrice des relations ({allElements.length} éléments)</span>
                        <div className="flex gap-2 text-xs">
                            <Badge className="bg-green-500/20 text-green-700 border-green-500/30">
                                ✓ Traite / Normal
                            </Badge>
                            <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/30">
                                ⚡ Interaction
                            </Badge>
                            <Badge className="bg-orange-500/20 text-orange-700 border-orange-500/30">
                                ⚠ Contre-indiqué
                            </Badge>
                            <Badge className="bg-red-500/20 text-red-700 border-red-500/30">
                                ⛔ Danger
                            </Badge>
                        </div>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ScrollArea className="w-full">
                        <div className="min-w-max">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        {/* Cellule vide en haut à gauche */}
                                        <TableHead className="w-[180px] sticky left-0 z-20 bg-background border-r">
                                            <span className="text-xs text-muted-foreground">↓ Ligne / Colonne →</span>
                                        </TableHead>
                                        {/* Headers colonnes */}
                                        {allElements.map((element) => (
                                            <TableHead
                                                key={`col-${element.id}`}
                                                className={`text-center min-w-[100px] max-w-[120px] p-2 ${getTypeHeaderBg(element.type)}`}
                                            >
                                                <div className="flex flex-col items-center gap-1">
                                                    {getTypeIcon(element.type)}
                                                    <span className="text-xs font-medium truncate max-w-[100px]" title={element.name}>
                                                        {element.name.length > 12 ? element.name.slice(0, 12) + '...' : element.name}
                                                    </span>
                                                </div>
                                            </TableHead>
                                        ))}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {allElements.map((rowElement) => (
                                        <TableRow key={`row-${rowElement.id}`}>
                                            {/* Header de ligne */}
                                            <TableCell
                                                className={`sticky left-0 z-10 font-medium border-r ${getTypeHeaderBg(rowElement.type)}`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {getTypeIcon(rowElement.type)}
                                                    <span className="text-xs truncate max-w-[140px]" title={rowElement.name}>
                                                        {rowElement.name}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            {/* Cellules d'intersection */}
                                            {allElements.map((colElement) => {
                                                const pill = getPillForIntersection(rowElement, colElement);
                                                const isDiagonal = rowElement.id === colElement.id;

                                                return (
                                                    <TableCell
                                                        key={`cell-${rowElement.id}-${colElement.id}`}
                                                        className={`text-center p-1 ${isDiagonal ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                                                    >
                                                        {isDiagonal ? (
                                                            <span className="text-gray-400">—</span>
                                                        ) : pill ? (
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Badge
                                                                        className="cursor-pointer text-[10px] px-2 py-0.5 transition-transform hover:scale-110"
                                                                        style={{
                                                                            backgroundColor: pill.bgColor,
                                                                            color: pill.color,
                                                                            borderColor: pill.color,
                                                                            borderWidth: '1px'
                                                                        }}
                                                                        onClick={() => {
                                                                            setSelectedLink(pill.link);
                                                                            setShowLinkDialog(true);
                                                                        }}
                                                                    >
                                                                        {pill.label}
                                                                    </Badge>
                                                                </TooltipTrigger>
                                                                <TooltipContent className="max-w-[300px]">
                                                                    <div className="space-y-1">
                                                                        <p className="font-semibold text-sm">
                                                                            {rowElement.name} ↔ {colElement.name}
                                                                        </p>
                                                                        <p className="text-xs">{pill.description}</p>
                                                                        <p className="text-xs text-muted-foreground italic">Cliquer pour plus de détails</p>
                                                                    </div>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        ) : (
                                                            <span className="text-gray-300">—</span>
                                                        )}
                                                    </TableCell>
                                                );
                                            })}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                </CardContent>
            </Card>

            {/* Dialog des détails du lien (même design que RiskNetworkGraph) */}
            <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Info className="h-5 w-5 text-primary" />
                            Détails du lien de causalité
                        </DialogTitle>
                    </DialogHeader>
                    {selectedLink && (
                        <div className="space-y-4">
                            {/* Relation visuelle */}
                            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg flex-wrap">
                                <Badge variant="outline" className="px-3 py-1">
                                    {selectedLink.fromType === 'pathology' ? '🏥' :
                                        selectedLink.fromType === 'symptom' ? '🩺' :
                                            selectedLink.fromType === 'medication' ? '💊' : '⚕️'}
                                    {' '}{selectedLink.fromType}
                                </Badge>
                                <span className="font-medium">{selectedLink.from}</span>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                <Badge variant="outline" className="px-3 py-1">
                                    {selectedLink.toType === 'pathology' ? '🏥' :
                                        selectedLink.toType === 'symptom' ? '🩺' :
                                            selectedLink.toType === 'medication' ? '💊' : '⚕️'}
                                    {' '}{selectedLink.toType}
                                </Badge>
                                <span className="font-medium">{selectedLink.to}</span>
                            </div>

                            {/* Description de la relation */}
                            <div>
                                <p className="text-sm font-medium text-muted-foreground mb-1">Relation</p>
                                <p className="text-sm">{selectedLink.relationship}</p>
                            </div>

                            {/* Indicateurs */}
                            <div className="grid grid-cols-2 gap-3">
                                {selectedLink.isAppropriate !== undefined && (
                                    <div className="p-3 rounded-lg border">
                                        <p className="text-xs text-muted-foreground mb-1">Adéquation</p>
                                        <Badge
                                            className={selectedLink.isAppropriate
                                                ? 'bg-green-500/20 text-green-700 border-green-500/30'
                                                : 'bg-red-500/20 text-red-700 border-red-500/30'}
                                        >
                                            {selectedLink.isAppropriate ? '✓ Adapté' : '✗ Contre-indiqué'}
                                        </Badge>
                                    </div>
                                )}

                                {selectedLink.dangerLevel && (
                                    <div className="p-3 rounded-lg border">
                                        <p className="text-xs text-muted-foreground mb-1">Niveau de danger</p>
                                        <Badge
                                            className={
                                                selectedLink.dangerLevel === 'critical' ? 'bg-red-500/20 text-red-700' :
                                                    selectedLink.dangerLevel === 'high' ? 'bg-orange-500/20 text-orange-700' :
                                                        selectedLink.dangerLevel === 'moderate' ? 'bg-yellow-500/20 text-yellow-700' :
                                                            'bg-green-500/20 text-green-700'
                                            }
                                        >
                                            {selectedLink.dangerLevel === 'critical' ? '🔴 Critique' :
                                                selectedLink.dangerLevel === 'high' ? '🟠 Élevé' :
                                                    selectedLink.dangerLevel === 'moderate' ? '🟡 Modéré' :
                                                        '🟢 Faible'}
                                        </Badge>
                                    </div>
                                )}

                                {selectedLink.symptomFrequency && (
                                    <div className="p-3 rounded-lg border">
                                        <p className="text-xs text-muted-foreground mb-1">Fréquence du symptôme</p>
                                        <Badge variant="outline">
                                            {selectedLink.symptomFrequency === 'principal' ? '★ Principal' :
                                                selectedLink.symptomFrequency === 'frequent' ? '◆ Fréquent' :
                                                    selectedLink.symptomFrequency === 'possible' ? '◇ Possible' :
                                                        '○ Rare'}
                                        </Badge>
                                    </div>
                                )}

                                {selectedLink.effectType && (
                                    <div className="p-3 rounded-lg border">
                                        <p className="text-xs text-muted-foreground mb-1">Type d'effet</p>
                                        <Badge variant="outline">
                                            {selectedLink.effectType === 'therapeutic' ? '💊 Thérapeutique' :
                                                selectedLink.effectType === 'adverse' ? '⚠️ Indésirable' :
                                                    '⚖️ Les deux'}
                                        </Badge>
                                    </div>
                                )}
                            </div>

                            {/* Evidence / Explication détaillée */}
                            {selectedLink.evidence && (
                                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <p className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
                                        📚 Explication médicale
                                    </p>
                                    <p className="text-sm text-blue-700 dark:text-blue-400">
                                        {selectedLink.evidence}
                                    </p>
                                </div>
                            )}

                            {/* Détails thérapeutiques et indésirables */}
                            {selectedLink.therapeuticDetails && (
                                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200">
                                    <p className="text-sm font-medium text-green-800 dark:text-green-300 mb-1">
                                        💊 Effet thérapeutique
                                    </p>
                                    <p className="text-sm text-green-700 dark:text-green-400">
                                        {selectedLink.therapeuticDetails}
                                    </p>
                                </div>
                            )}

                            {selectedLink.adverseDetails && (
                                <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200">
                                    <p className="text-sm font-medium text-orange-800 dark:text-orange-300 mb-1">
                                        ⚠️ Effet indésirable
                                    </p>
                                    <p className="text-sm text-orange-700 dark:text-orange-400">
                                        {selectedLink.adverseDetails}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </TooltipProvider>
    );
}
