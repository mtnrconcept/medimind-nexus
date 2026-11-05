import { relationPresentation, type RelationMetadata } from '../../../supabase/functions/cross-data-analyzer/relation-contract';
import { frenchMedicalLabel } from '../../../supabase/functions/_shared/medical-terminology';
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
import {
    matrixEvidenceLabel,
    isAppropriatenessSuccess,
    isAppropriatenessWarning,
    supportsAppropriatenessBadge,
} from './crossDataDisplay';

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

interface CausalLink extends RelationMetadata {
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
    pairAssessments?: PairAssessment[];
    webResearch?: { query: string; pairHash?: string; status?: 'matched' | 'empty' | 'unavailable'; sources?: { title: string; url: string }[] }[];
}

import { buildPairHash, typedElementKey, type PairAssessment, type SelectedElement } from '../../../supabase/functions/cross-data-analyzer/analysis-utils';
interface RelationshipMatrixProps {
    snapshot?: { elements: SelectedElement[]; cells: Record<string, unknown[]> };
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
    analysisResult, snapshot
}: RelationshipMatrixProps) {

    // État pour le dialog de détails du lien
    const [selectedLink, setSelectedLink] = useState<CausalLink | null>(null);
    const [showLinkDialog, setShowLinkDialog] = useState(false);
    const [selectedAssessment, setSelectedAssessment] = useState<{ left: string; right: string; item: PairAssessment } | null>(null);
    const [selectedResearch, setSelectedResearch] = useState<{ query: string; sources: { title: string; url: string }[] } | null>(null);

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

    // Exact identity only: two formulations must never be collapsed by fuzzy names.
    const matchesElement = (a: string,b: string) => normalizeForComparison(a) === normalizeForComparison(b);

    // Créer la liste de tous les éléments sélectionnés
    const allElements = useMemo((): MatrixElement[] => {
        if (snapshot) return snapshot.elements.map(e => ({ ...e, id: typedElementKey(e) }));
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
    }, [snapshot, pathologies, symptoms, treatments, medications, selectedPathologies, selectedSymptoms, selectedTreatments, selectedMedications]);

    // Obtenir la pastille pour une intersection
    const getPillForIntersection = (rowElement: MatrixElement, colElement: MatrixElement): PillInfo | null => {
        if (rowElement.id === colElement.id) return null; // Même élément

        const pair = buildPairHash(rowElement.name, rowElement.type, colElement.name, colElement.type);
        const causalLinks = snapshot ? (snapshot.cells[pair] || []) as CausalLink[] : analysisResult?.causalLinks || [];

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

        const display = relationPresentation(link);
        return {
            type: 'interaction', label: display.label,
            description: display.description + ' ' + (link.contextLimitations || []).join(' '),
            color: display.tone === 'caution' ? '#92400e' : '#334155',
            bgColor: display.tone === 'caution' ? '#fff7ed' : '#f1f5f9', link,
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
                        <div className="flex flex-wrap gap-2 text-xs">
                            <Badge variant="outline">Relation étudiée ≠ efficacité prouvée</Badge>
                            <Badge variant="outline">Contexte / co-utilisation</Badge>
                            <Badge variant="outline">Lien non établi</Badge>
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
                                                        {frenchMedicalLabel(element.name).length > 20 ? frenchMedicalLabel(element.name).slice(0,20) + '…' : frenchMedicalLabel(element.name)}
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
                                                        {frenchMedicalLabel(rowElement.name)}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            {/* Cellules d'intersection */}
                                            {allElements.map((colElement) => {
                                                const pill = getPillForIntersection(rowElement, colElement);
                                                const isDiagonal = rowElement.id === colElement.id;
                                                const research = analysisResult?.webResearch?.find(r => (r.pairHash ?? r.query) ===
                                                    buildPairHash(rowElement.name, rowElement.type, colElement.name, colElement.type));
                                                const assessment = analysisResult?.pairAssessments?.find(item => item.pairHash ===
                                                    buildPairHash(rowElement.name, rowElement.type, colElement.name, colElement.type));

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
                                                                            {frenchMedicalLabel(rowElement.name)} ↔ {colElement.name}
                                                                        </p>
                                                                        <p className="text-xs">{pill.description}</p>
                                                                        <p className="text-xs text-muted-foreground italic">Cliquer pour plus de détails</p>
                                                                    </div>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        ) : assessment ? (
                                                            <button type="button" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-foreground hover:bg-amber-500/20"
                                                                title="Interprétation OpenAI, non validée cliniquement"
                                                                onClick={() => setSelectedAssessment({ left: rowElement.name, right: colElement.name, item: assessment })}>
                                                                {assessment.headline || (assessment.verdict === 'hypothesis' ? 'Piste non confirmée' : 'Lien non établi')}
                                                            </button>
                                                        ) : research?.sources?.length ? (
                                                            <button type="button" className="rounded-md border border-primary/30 px-2 py-1 text-[11px] text-primary hover:bg-primary/10"
                                                                title="Publications de contexte, relation clinique non établie"
                                                                onClick={() => setSelectedResearch({ query: research.query, sources: research.sources! })}>
                                                                {research.sources.length} sources · analyse à terminer
                                                            </button>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">{snapshot ?
                                                                matrixEvidenceLabel(research,
                                                                    buildPairHash(rowElement.name, rowElement.type, colElement.name, colElement.type) in snapshot.cells) : '-'}</span>
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

            <Dialog open={selectedAssessment !== null} onOpenChange={open => { if (!open) setSelectedAssessment(null); }}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Analyse OpenAI · {selectedAssessment?.left} ↔ {selectedAssessment?.right}</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm">{selectedAssessment?.item.explanation}</p>
                    <p className="text-sm text-muted-foreground">Limites : {selectedAssessment?.item.limitations}</p>
                    <p className="rounded-md bg-muted p-3 text-xs">
                        Cette interprétation du modèle n'est pas une preuve de lien causal, d'innocuité ou d'efficacité.
                        Les références bibliographiques et le contexte clinique doivent être vérifiés.
                    </p>
                </DialogContent>
            </Dialog>

            <Dialog open={selectedResearch !== null} onOpenChange={open => { if (!open) setSelectedResearch(null); }}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Publications à examiner · relation non établie</DialogTitle>
                    </DialogHeader>
                    <p className="break-words text-xs text-muted-foreground">
                        Requête scientifique : {selectedResearch?.query}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        Ces références peuvent être contextuelles ou hors sujet. Elles ne constituent pas une preuve
                        d'interaction, de causalité, de sécurité ou d'efficacité.
                    </p>
                    <ol className="max-h-80 space-y-3 overflow-y-auto">
                        {selectedResearch?.sources.map(source => (
                            <li key={source.url} className="rounded-lg border p-3 text-sm">
                                <a href={source.url} target="_blank" rel="noopener noreferrer"
                                    className="break-words text-primary underline underline-offset-2">
                                    {source.title}
                                </a>
                            </li>
                        ))}
                    </ol>
                </DialogContent>
            </Dialog>

            {/* Dialog des détails du lien (même design que RiskNetworkGraph) */}
            <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Info className="h-5 w-5 text-primary" />
                            Relation bibliographique et limites
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
                                    {' '}{{pathology:'Pathologie',symptom:'Symptôme',medication:'Médicament',treatment:'Traitement'}[selectedLink.fromType]}
                                </Badge>
                                <span className="font-medium">{selectedLink.from}</span>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                <Badge variant="outline" className="px-3 py-1">
                                    {selectedLink.toType === 'pathology' ? '🏥' :
                                        selectedLink.toType === 'symptom' ? '🩺' :
                                            selectedLink.toType === 'medication' ? '💊' : '⚕️'}
                                    {' '}{{pathology:'Pathologie',symptom:'Symptôme',medication:'Médicament',treatment:'Traitement'}[selectedLink.toType]}
                                </Badge>
                                <span className="font-medium">{selectedLink.to}</span>
                            </div>

                            {/* Description de la relation */}
                            <div>
                                <p className="text-sm font-medium text-muted-foreground mb-1">Relation</p>
                                <p className="text-sm">{selectedLink.relationship}</p>
                            </div>

                            <div className="rounded-lg border p-3 text-sm">
                                <strong>{relationPresentation(selectedLink).label}</strong>
                                <p className="mt-1 text-muted-foreground">{relationPresentation(selectedLink).description}</p>
                                {selectedLink.contextLimitations?.map(note => <p key={note} className="mt-1 text-xs">{note}</p>)}
                                {selectedLink.evidenceQuotes?.map((quote,index) => (
                                    <blockquote key={index} className="mt-3 border-l-2 pl-3 text-xs">
                                        <p>{quote.quote}</p>
                                        <a href={quote.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">Consulter le passage source</a>
                                    </blockquote>
                                ))}
                            </div>
                            {/* Indicateurs */}
                            <div className="grid grid-cols-2 gap-3">
                                {supportsAppropriatenessBadge(selectedLink) && (
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
                                        📚 Observation bibliographique
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
