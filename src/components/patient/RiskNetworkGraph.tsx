import { RELATION_ENGINE_VERSION, relationPresentation, type RelationMetadata } from '../../../supabase/functions/cross-data-analyzer/relation-contract';
import { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import {
    buildAutomaticPathologyGraph,
    canonicalGraphKey,
    collectCanonicalGraphEntities,
    graphEntityFromNode,
    graphSelectionIds,
    graphSelectionSignature,
    projectClinicalGraphLinks,
    restoreSnapshotGraphEntities,
    snapshotSelectionIds,
    type GraphAnalysisSnapshot,
    type GraphEntity,
    type GraphMembershipKind,
} from './crossGraphGroups';
import {
    ReactFlow,
    Node,
    Edge,
    Controls,
    Background,
    BackgroundVariant,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    MarkerType,
    Panel,
    EdgeProps,
    getBezierPath,
    BaseEdge,
    EdgeLabelRenderer,
    Handle,
    Position,
    type NodeProps,
    useNodesInitialized,
    useReactFlow,
    type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    TooltipProvider,
} from '@/components/ui/tooltip';
import {
    Network,
    Plus,
    Trash2,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Activity,
    Stethoscope,
    Pill,
    Search,
    Loader2,
    ShieldAlert,
    ArrowRight,
    Info,
    ChevronDown,
    BoxSelect,
    MousePointer2,
    SquareDashed,
    Lasso,
    Eye,
    EyeOff,
    Lightbulb,
    FileText,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { PairAssessment } from '../../../supabase/functions/cross-data-analyzer/analysis-utils';
import { toast } from 'sonner';
import {
    getAppropriatenessBadgeLabel,
    isAppropriatenessSuccess,
    isAppropriatenessWarning,
    supportsAppropriatenessBadge,
} from './crossDataDisplay';

// Types étendus avec severity/toxicity
interface Pathology {
    id: string;
    name: string;
    severity?: string | null;
    type: 'pathology';
}

interface Symptom {
    id: string;
    name: string;
    body_system?: string | null;
    type: 'symptom';
}

interface Treatment {
    id: string;
    name: string;
    type: 'treatment';
}

interface Medication {
    id: string;
    name: string;
    substance?: string | null;
    type: 'medication';
}

type MedicalItem = Pathology | Symptom | Treatment | Medication;

interface CausalLink extends RelationMetadata {
    from: string;
    to: string;
    fromType?: string;
    toType?: string;
    relationship: string;
    isAppropriate?: boolean;
    dangerLevel?: 'critical' | 'high' | 'moderate' | 'low';
    symptomFrequency?: 'principal' | 'frequent' | 'possible' | 'rare';
    effectType?: 'therapeutic' | 'adverse' | 'both';
    evidence?: string;
    probability?: 'high' | 'medium' | 'low';
    interactionType?: 'drug-drug' | 'drug-treatment' | 'pathology-danger';
    therapeuticDetails?: string;
    adverseDetails?: string;
    patientCount?: number;
    webSources?: string[];
}

interface Alternative {
    for: string;           // The problematic medication/treatment
    forType: string;       // Type: medication or treatment
    reason: string;        // Why it's problematic
    suggestions: string[]; // Alternative medications/treatments
    evidence?: string;
}

interface ProposedChange {
    action: 'replace' | 'remove' | 'add';
    target: string;
    targetType: 'medication' | 'treatment';
    reason: string;
    replacement?: string;
    replacementType?: 'medication' | 'treatment';
    improvementScore: number;
}

interface SchemaStats {
    redLinks: number;
    orangeLinks: number;
    greenLinks: number;
    totalDangerScore: number;
    inappropriateCount: number;
    adverseEffectCount: number;
}

interface SchemaComparison {
    currentScore: number | null;
    proposedScore: number | null;
    improvementPercent: number | null;
    currentStats: SchemaStats;
    proposedStats: SchemaStats;
    proposedChanges: ProposedChange[];
    benefitRiskRatio: { current: number | null; proposed: number | null };
    clinicalSummary: string;
}

interface TreatmentSchemaStep {
    action: 'keep' | 'replace' | 'remove' | 'add' | 'monitor';
    target: string;
    targetType: 'medication' | 'treatment' | 'monitoring';
    replacement?: string;
    rationale: string;
    monitoring?: string[];
    riskMitigation?: string[];
}

interface TreatmentSchema {
    title: string;
    priority: 'preferred' | 'alternative' | 'cautious';
    rationale: string;
    expectedBenefits: string[];
    residualRisks: string[];
    steps: TreatmentSchemaStep[];
    monitoringPlan: string[];
    patientWarnings: string[];
    confidence: 'high' | 'medium' | 'low';
}

interface AnalysisResult {
    causalLinks: CausalLink[];
    pairAssessments?: PairAssessment[];
    summary?: string;
    warnings: string[];
    recommendations?: string[];
    alternatives?: Alternative[];
    schemaComparison?: SchemaComparison;
    treatmentSchemas?: TreatmentSchema[];
}


interface AlertInfo {
    title: string;
    type: 'danger' | 'warning' | 'success' | 'info';
    description: string;
    links: CausalLink[];
}

// Interface pour les groupes de pathologie
interface PathologyGroup {
    id: string;
    name: string;
    pathologyId: string;
    pathologyName: string;
    memberIds: string[]; // IDs des médicaments/traitements/symptômes dans ce groupe
    color: string;
    automatic?: boolean;
}

function ClinicalEntityNode({ data }: NodeProps) {
    const kinds = (data.membershipKinds ?? []) as GraphMembershipKind[];
    const origin = kinds.includes('manifestation') && kinds.includes('adverse_effect') ? 'Plusieurs origines possibles'
        : kinds.includes('adverse_effect') ? 'Effet indésirable rapporté'
            : kinds.includes('manifestation') ? 'Manifestation décrite'
                : kinds.includes('adjunctive_use') ? 'Usage complémentaire'
                    : kinds.includes('indication') ? 'Indication étudiée' : null;
    return (
        <>
            <Handle type="target" position={Position.Top} />
            <div className="text-center break-words leading-snug">{String(data.label)}</div>
            {origin && <div className="mt-1 text-center text-[10px] font-normal opacity-80">{origin}</div>}
            {Number(data.sharedGroupCount) > 1 && (
                <div className="mt-1 rounded bg-violet-100 px-1 py-0.5 text-center text-[10px] font-medium text-violet-800">
                    Même élément · {Number(data.sharedGroupCount)} groupes
                </div>
            )}
            <Handle type="source" position={Position.Bottom} />
        </>
    );
}

function ClinicalPathologyGroupNode({ data }: NodeProps) {
    return <div className="pointer-events-none absolute inset-x-4 top-3 truncate text-left text-xs font-semibold" title={String(data.label)}>
        {String(data.label)}
    </div>;
}

const clinicalNodeTypes = { clinicalEntity: ClinicalEntityNode, clinicalPathologyGroup: ClinicalPathologyGroupNode };

function FitClinicalGraph({ layoutKey }: { layoutKey: string }) {
    const initialized = useNodesInitialized();
    const { fitView } = useReactFlow();
    const fittedLayout = useRef('');
    useEffect(() => {
        if (!initialized || !layoutKey || fittedLayout.current === layoutKey) return;
        fittedLayout.current = layoutKey;
        void fitView({ padding: 0.15, maxZoom: 1, duration: 200 });
    }, [initialized, layoutKey, fitView]);
    return null;
}

const interactionEffectLabels: Record<NonNullable<CausalLink['interactionEffect']>, string> = {
    increase_effect: 'Augmentation de l’effet', decrease_effect: 'Diminution de l’effet',
    increase_toxicity: 'Augmentation de la toxicité', mixed: 'Effets multiples', unknown: 'Effet non déterminé',
};

function hasRiskSignal(link: CausalLink): boolean {
    return link.validationVersion === RELATION_ENGINE_VERSION &&
        ['adverse_effect', 'interaction', 'risk_factor', 'contraindication', 'disease_worsening'].includes(link.relationKind || '');
}

function ClinicalLinkEvidence({ link }: { link: CausalLink }) {
    const sources = [...new Set(link.webSources || [])].flatMap(value => {
        try {
            const url = new URL(value);
            return url.protocol === 'https:' && !url.username && !url.password ? [{ url: url.href, host: url.hostname }] : [];
        } catch { return []; }
    });
    return (
        <div className="space-y-2 text-xs">
            <p className="text-muted-foreground">{relationPresentation(link).description}</p>
            {link.interactionEffect && <Badge variant="outline">{interactionEffectLabels[link.interactionEffect]}</Badge>}
            {!!link.contextLimitations?.length && (
                <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                    {link.contextLimitations.map((limit, index) => <li key={index}>{limit}</li>)}
                </ul>
            )}
            {sources.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">Sources consultables :</span>
                    {sources.map((source, index) => (
                        <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer"
                            className="text-primary underline underline-offset-2" title={source.url}>
                            {index + 1}. {source.host}
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}

function TreatmentSchemasGraphPanel({ schemas }: { schemas: TreatmentSchema[] }) {
    return (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <p className="text-sm font-medium text-green-800 dark:text-green-300 mb-2">
                <Lightbulb className="h-4 w-4 inline mr-1" />
                Schémas thérapeutiques alternatifs
            </p>
            <div className="space-y-3">
                {schemas.map((schema, idx) => (
                    <div key={`${schema.title}-${idx}`} className="p-2 bg-white dark:bg-gray-800 rounded border space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge className={`text-xs ${schema.priority === 'preferred'
                                ? 'bg-green-500 text-white'
                                : schema.priority === 'cautious'
                                    ? 'bg-orange-500 text-white'
                                    : 'bg-blue-500 text-white'
                                }`}>
                                {schema.priority === 'preferred' ? 'Préféré' : schema.priority === 'cautious' ? 'Prudent' : 'Alternative'}
                            </Badge>
                            <span className="text-sm font-medium">{schema.title}</span>
                            <Badge variant="outline" className="text-xs">Confiance {schema.confidence}</Badge>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400">{schema.rationale}</p>
                        <div className="space-y-1">
                            {schema.steps.slice(0, 4).map((step, stepIdx) => (
                                <div key={`${step.target}-${stepIdx}`} className="text-xs rounded bg-gray-50 dark:bg-gray-900 p-2">
                                    <span className="font-medium">
                                        {step.action === 'replace' ? 'Remplacer' :
                                            step.action === 'remove' ? 'Retirer' :
                                                step.action === 'add' ? 'Ajouter' :
                                                    step.action === 'keep' ? 'Conserver' : 'Surveiller'} {step.target}
                                    </span>
                                    {step.replacement && <span className="text-green-600"> → {step.replacement}</span>}
                                    <p className="text-gray-500 mt-1">{step.rationale}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Couleurs de liens selon le type de relation
const linkColors = {
    green: '#22c55e',    // Adapté, lien normal
    yellow: '#eab308',   // Effets secondaires bénins, interaction bénigne
    orange: '#f97316',   // Risque d'interaction
    red: '#ef4444',      // Interaction dangereuse
    blue: '#3b82f6',     // Lien informatif
};

interface MedicalNodeData extends Record<string, unknown> {
    label: string;
    type: 'pathology' | 'symptom' | 'treatment' | 'medication' | 'group';
    status?: 'neutral' | 'danger' | 'safe';
    groupId?: string;
    link?: CausalLink;
    isProposed?: boolean;
}

interface MedicalEdgeData extends Record<string, unknown> {
    link?: CausalLink;
    originalAnimated?: boolean;
    originalStrokeDasharray?: string;
    isProposed?: boolean;
}

// Fonction pour obtenir la couleur d'un nœud pathologie selon sa sévérité
const getPathologySeverityColor = (severity?: string | null) => {
    switch (severity?.toLowerCase()) {
        case 'mild':
        case 'légère':
            return { bg: '#dcfce7', border: '#22c55e', text: '#16a34a' }; // Vert
        case 'moderate':
        case 'modérée':
            return { bg: '#fef3c7', border: '#f59e0b', text: '#d97706' }; // Jaune/Orange
        case 'severe':
        case 'sévère':
            return { bg: '#fed7aa', border: '#f97316', text: '#ea580c' }; // Orange
        case 'critical':
        case 'critique':
            return { bg: '#fee2e2', border: '#ef4444', text: '#dc2626' }; // Rouge
        default:
            return { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' }; // Rouge clair par défaut
    }
};

// Fonction pour obtenir la couleur d'un nœud médicament/traitement
const getMedicationColor = () => {
    // Par défaut orange (les médicaments ont toujours un potentiel de toxicité)
    return { bg: '#ffedd5', border: '#f97316', text: '#ea580c' };
};

// Fonction pour obtenir la couleur d'un symptôme
const getSymptomColor = () => {
    return { bg: '#dbeafe', border: '#3b82f6', text: '#2563eb' };
};

// Interface Props pour recevoir les sélections externes
interface RiskNetworkGraphProps {
    externalPathologies?: Array<{ id: string; name: string; category?: string | null; specialty?: string | null; severity?: string | null }>;
    externalSymptoms?: Array<{ id: string; name: string; body_system?: string | null }>;
    externalTreatments?: Array<{ id: string; name: string; pathology_id?: string; type?: string | null }>;
    externalMedications?: Array<{ id: string; name: string; atc_code?: string | null; substance?: string | null }>;
    selectedPathologyIds?: string[];
    selectedSymptomIds?: string[];
    selectedTreatmentIds?: string[];
    selectedMedicationIds?: string[];
    analysisResultFromParent?: AnalysisResult | null;
    analysisSnapshot?: GraphAnalysisSnapshot | null;
    onSnapshotMatchChange?: (matches: boolean) => void;
    onAnalysisResultChange?: (result: AnalysisResult) => void;
    onAnalyzeWithOpenAI: (ids: {
        pathologyIds?: string[]; symptomIds?: string[];
        treatmentIds?: string[]; medicationIds?: string[];
        elements?: GraphEntity[];
    }) => Promise<void>;
    onGenerateTreatmentSchemas?: () => void;
    isGeneratingTreatmentSchemas?: boolean;
}

// Composant principal
export function RiskNetworkGraph({
    externalPathologies,
    externalSymptoms,
    externalTreatments,
    externalMedications,
    selectedPathologyIds,
    selectedSymptomIds,
    selectedTreatmentIds,
    selectedMedicationIds,
    analysisResultFromParent,
    analysisSnapshot,
    onSnapshotMatchChange,
    onAnalysisResultChange,
    onAnalyzeWithOpenAI,
    onGenerateTreatmentSchemas,
    isGeneratingTreatmentSchemas = false,
}: RiskNetworkGraphProps) {
    // États
    const [nodes, setNodes, onNodesChangeOriginal] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'pathology' | 'symptom' | 'treatment' | 'medication'>('pathology');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [alerts, setAlerts] = useState<AlertInfo[]>([]);
    const [showAlertDialog, setShowAlertDialog] = useState(false);
    const [currentAlert, setCurrentAlert] = useState<AlertInfo | null>(null);

    // Données médicales
    const [pathologies, setPathologies] = useState<Pathology[]>([]);
    const [symptoms, setSymptoms] = useState<Symptom[]>([]);
    const [treatments, setTreatments] = useState<Treatment[]>([]);
    const [medications, setMedications] = useState<Medication[]>([]);

    // État pour la popup de détails du lien
    const [hoveredLink, setHoveredLink] = useState<CausalLink | null>(null);
    const [showLinkDetails, setShowLinkDetails] = useState(false);

    // Map pour stocker les liens par ID d'edge
    const [edgeLinkMap, setEdgeLinkMap] = useState<Record<string, CausalLink>>({});

    // État pour l'affichage progressif des liens
    const [isLoadingLinks, setIsLoadingLinks] = useState(false);
    const restoredSnapshotJob = useRef<string | null>(null);
    const snapshotSelectionMatches = !analysisSnapshot || graphSelectionSignature({
        pathologyIds: selectedPathologyIds, symptomIds: selectedSymptomIds,
        treatmentIds: selectedTreatmentIds, medicationIds: selectedMedicationIds,
    }) === graphSelectionSignature(snapshotSelectionIds(analysisSnapshot.selection));
    const snapshotNodesMatch = !analysisSnapshot || JSON.stringify(collectCanonicalGraphEntities(nodes).map(canonicalGraphKey).sort()) ===
        JSON.stringify([...new Set(analysisSnapshot.elements.map(canonicalGraphKey))].sort());
    const analysisMatchesSnapshot = snapshotSelectionMatches && snapshotNodesMatch;
    const analysisResult = analysisMatchesSnapshot ? analysisResultFromParent ?? null : null;
    const displayedLinks = useMemo(() => analysisResult?.causalLinks ?? [], [analysisResult]);
    useEffect(() => { onSnapshotMatchChange?.(analysisMatchesSnapshot); }, [analysisMatchesSnapshot, onSnapshotMatchChange]);

    // État pour les cartes dépliées (accordéon)
    const [expandedLinks, setExpandedLinks] = useState<Set<string>>(new Set());

    // États pour les groupes de pathologie
    const [groups, setGroups] = useState<PathologyGroup[]>([]);
    const [isGroupMode, setIsGroupMode] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [showGroupDialog, setShowGroupDialog] = useState(false);
    const [newGroupPathologyId, setNewGroupPathologyId] = useState<string | null>(null);
    const [automaticGrouping, setAutomaticGrouping] = useState(true);
    const automaticLayoutKey = useRef('');
    const externalSelectionKey = useRef('');
    const pendingExternalProjection = useRef<string | null>(null);

    // ========================================
    // HELPERS & UTILITIES (INIT FIRST)
    // ========================================

    // Fonction de normalisation pour la comparaison (définie tôt pour éviter ReferenceError)
    const normalizeForComparison = useCallback((str: string) => {
        return str.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '');
    }, []);

    // Fonction pour obtenir les couleurs d'un item
    const getItemColors = useCallback((item: MedicalItem) => {
        switch (item.type) {
            case 'pathology':
                return getPathologySeverityColor((item as Pathology).severity);
            case 'symptom':
                return getSymptomColor();
            case 'treatment':
            case 'medication':
                return getMedicationColor();
            default:
                return { bg: '#f3f4f6', border: '#9ca3af', text: '#4b5563' };
        }
    }, []);

    // Couleurs disponibles pour les groupes
    const groupColors = useMemo(() => ['#8b5cf6', '#06b6d4', '#f59e0b', '#ec4899', '#10b981', '#6366f1'], []);
    const getNextGroupColor = useCallback(() => groupColors[groups.length % groupColors.length], [groups.length, groupColors]);

    // Sorting priority only; this is not a clinical risk score.
    const getDangerScore = useCallback((link: CausalLink): number => {
        if (hasRiskSignal(link) && link.evidenceSupport === 'direct') {
            if (link.dangerLevel === 'critical') return 5;
            if (link.dangerLevel === 'high') return 4;
            if (link.dangerLevel === 'moderate') return 3;
            return 2;
        }
        return hasRiskSignal(link) ? 1 : 0;
    }, []);

    // Helper pour obtenir le label d'adéquation selon les types d'entités
    const getAppropriatenessLabel = useCallback((link: CausalLink) => {
        const label = getAppropriatenessBadgeLabel(link);
        if (!label) return '';
        return link.isAppropriate ? `✓ ${label}` : `✗ ${label}`;
    }, []);

    // Helper: Convertir coordonnée écran (relative container) -> coordonnée graphe (World)
    const screenToFlow = useCallback((point: { x: number; y: number }, vp: { x: number; y: number; zoom: number }) => {
        return {
            x: (point.x - vp.x) / vp.zoom,
            y: (point.y - vp.y) / vp.zoom,
        };
    }, []);

    // Fonction géométrique: Point dans un polygone (Ray-casting)
    const isPointInPolygon = useCallback((point: { x: number, y: number }, vs: { x: number, y: number }[]) => {
        const { x, y } = point;
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            const xi = vs[i].x, yi = vs[i].y;
            const xj = vs[j].x, yj = vs[j].y;
            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }, []);


    // === ÉTAT DE VISIBILITÉ DES NŒUDS ===
    const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set());
    const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());

    // === ÉTAT POUR LE SCHÉMA PROPOSÉ ===
    const [showProposedSchema, setShowProposedSchema] = useState(false);
    const [proposedNodes, setProposedNodes, onProposedNodesChangeOriginal] = useNodesState([]);
    const [proposedEdges, setProposedEdges, onProposedEdgesChange] = useEdgesState([]);

    // Calcul des statistiques en temps réel basé sur les nœuds/liens visibles
    const liveStats = useMemo((): SchemaStats => {
        const visibleLinks = [...new Map(projectClinicalGraphLinks(displayedLinks, nodes, hiddenNodes)
            .map(edge => [edge.canonicalLinkId, edge.link])).values()];

        let redLinks = 0, orangeLinks = 0;
        const greenLinks = 0;
        let totalDangerScore = 0, inappropriateCount = 0, adverseEffectCount = 0;

        visibleLinks.forEach(link => {
            if (hasRiskSignal(link) && link.evidenceSupport === 'direct' && (link.dangerLevel === 'critical' || link.dangerLevel === 'high')) {
                redLinks++;
                totalDangerScore += link.dangerLevel === 'critical' ? 100 : 75;
            } else if (hasRiskSignal(link) && link.dangerLevel === 'moderate') {
                orangeLinks++;
                totalDangerScore += 50;
            } else if (hasRiskSignal(link)) {
                orangeLinks++;
            }

            if (isAppropriatenessWarning(link)) inappropriateCount++;
            if (link.relationKind === 'adverse_effect' && link.evidenceSupport === 'direct') adverseEffectCount++;
        });

        return { redLinks, orangeLinks, greenLinks, totalDangerScore, inappropriateCount, adverseEffectCount };
    }, [displayedLinks, nodes, hiddenNodes]);

    const isCanonicalHidden = useCallback((node: Node) => {
        const entity = graphEntityFromNode(node);
        if (!entity) return hiddenNodes.has(node.id);
        const key = canonicalGraphKey(entity);
        return nodes.filter(candidate => {
            const item = graphEntityFromNode(candidate);
            return item && canonicalGraphKey(item) === key;
        }).every(copy => hiddenNodes.has(copy.id) || (!!copy.parentId && hiddenNodes.has(copy.parentId)));
    }, [nodes, hiddenNodes]);

    // The element control affects every copy; the group control only affects
    // that container, so another copy can still carry an interaction alert.
    const toggleNodeVisibility = useCallback((nodeId: string) => {
        const node = nodes.find(candidate => candidate.id === nodeId);
        const entity = node ? graphEntityFromNode(node) : null;
        if (!node || !entity) return;
        const key = canonicalGraphKey(entity);
        const copies = nodes.filter(candidate => {
            const item = graphEntityFromNode(candidate);
            return item && canonicalGraphKey(item) === key;
        });
        setHiddenNodes(previous => {
            const next = new Set(previous);
            const show = copies.every(copy => previous.has(copy.id));
            copies.forEach(copy => show ? next.delete(copy.id) : next.add(copy.id));
            return next;
        });
    }, [nodes]);

    const toggleGroupVisibility = useCallback((groupId: string) => {
        const hidden = hiddenGroups.has(groupId);
        setHiddenGroups(previous => {
            const next = new Set(previous);
            if (hidden) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
        setHiddenNodes(previous => {
            const next = new Set(previous);
            if (hidden) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    }, [hiddenGroups]);

    // Obtenir les nœuds visibles uniquement
    const visibleNodes = useMemo(() => {
        return nodes.filter(n => !hiddenNodes.has(n.id) && (!n.parentId || !hiddenNodes.has(n.parentId)));
    }, [nodes, hiddenNodes]);

    const sortedDisplayedLinks = useMemo(() => {
        return [...displayedLinks].sort((a, b) => getDangerScore(b) - getDangerScore(a));
    }, [displayedLinks, getDangerScore]);

    // Générer le schéma proposé en appliquant les modifications
    // Ce useEffect se déclenche à chaque changement de hiddenNodes pour refléter les nœuds actuellement visibles
    useEffect(() => {
        // Ne regenerer le schéma proposé que si l'analyse ou les nœuds de base changent
        // On utilise les IDs des nœuds pour éviter de réinitialiser à chaque mouvement (changement de position)
        const visibleNodeIds = nodes.filter(n => !hiddenNodes.has(n.id) && n.data.type !== 'group').map(n => n.id).join(',');

        // Copier les nœuds visibles
        const visibleNodes = nodes.filter(n => !hiddenNodes.has(n.id) && (!n.parentId || !hiddenNodes.has(n.parentId)));

        // Si pas de nœuds visibles ou pas d'edges, pas de schéma proposé
        if (visibleNodes.length === 0 || edges.length === 0 || !analysisResult?.schemaComparison?.proposedChanges?.length) {
            setProposedNodes([]);
            setProposedEdges([]);
            setShowProposedSchema(false);
            return;
        }

        // Modifications optionnelles si elles existent
        const changes = analysisResult?.schemaComparison?.proposedChanges || [];

        // Pour le split canvas, on utilise les mêmes positions (pas d'offset)
        // Les nœuds sont dans un ReactFlow séparé donc pas besoin de conteneur parent
        let proposedNodesList = visibleNodes.map(n => ({
            ...n,
            id: `proposed-${n.id}`,
            parentId: n.parentId ? `proposed-${n.parentId}` : undefined,
            position: { ...n.position }, // Mêmes positions initiales
            draggable: true,
            selectable: true,
            connectable: false,
            data: {
                ...n.data,
                isProposedGhost: true,
            },
            style: {
                ...n.style,
                opacity: 0.9,
            },
        }));

        // Appliquer les modifications (remplacements/suppressions)
        changes.forEach(change => {
            if (change.action === 'remove') {
                proposedNodesList = proposedNodesList.filter(n =>
                    !String(n.data.label).toLowerCase().includes(change.target.toLowerCase())
                );
            } else if (change.action === 'replace' && change.replacement) {
                proposedNodesList = proposedNodesList.map(n => {
                    if (String(n.data.label).toLowerCase().includes(change.target.toLowerCase())) {
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                label: `✓ ${change.replacement}`,
                                isProposed: true,
                                isProposedGhost: true,
                                originalLabel: n.data.label,
                            },
                            style: {
                                ...n.style,
                                opacity: 1,
                                border: '3px solid #10b981',
                                boxShadow: '0 0 15px rgba(16, 185, 129, 0.4)',
                                background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                            },
                        };
                    }
                    return n;
                });
            }
        });

        // Copier les edges correspondants AVEC leurs couleurs et données originales
        // Debug: Log pour comprendre le problème
        console.log('[ProposedSchema] Génération edges:', {
            nodesCount: proposedNodesList.length,
            edgesCount: edges.length,
            nodeIds: proposedNodesList.map(n => n.id).slice(0, 5),
            edgeSourceTargets: edges.slice(0, 5).map(e => ({ source: e.source, target: e.target }))
        });

        const newEdges = edges
            .filter(e => {
                // Les IDs des edges originaux utilisent les IDs originaux des nœuds
                // Les proposedNodes ont des IDs préfixés avec 'proposed-'
                const expectedSourceId = `proposed-${e.source}`;
                const expectedTargetId = `proposed-${e.target}`;
                const sourceExists = proposedNodesList.some(n => n.id === expectedSourceId);
                const targetExists = proposedNodesList.some(n => n.id === expectedTargetId);

                if (!sourceExists || !targetExists) {
                    // Debug détaillé si filtré
                    console.log('[ProposedSchema] Edge filtré:', {
                        edgeId: e.id,
                        source: e.source,
                        target: e.target,
                        expectedSourceId,
                        expectedTargetId,
                        sourceExists,
                        targetExists
                    });
                }
                return sourceExists && targetExists;
            })
            .map(e => {
                // Trouver le lien original pour cette edge
                const originalLink = edgeLinkMap[e.id] || (e.data as MedicalEdgeData)?.link;

                return {
                    ...e,
                    id: `proposed-${e.id}`,
                    source: `proposed-${e.source}`,
                    target: `proposed-${e.target}`,
                    selectable: true,
                    focusable: true,
                    data: {
                        ...e.data,
                        link: originalLink,
                        isProposed: true,
                    },
                    // Conserver le style original
                    style: {
                        ...e.style,
                        opacity: 0.9,
                    },
                };
            });

        console.log('[ProposedSchema] Edges générées:', newEdges.length);
        setProposedNodes(proposedNodesList);
        setProposedEdges(newEdges);
    }, [analysisResult, nodes, edges, hiddenNodes, edgeLinkMap, setProposedNodes, setProposedEdges]);

    // Toggle une carte
    const toggleLinkExpand = (linkId: string) => {
        setExpandedLinks(prev => {
            const newSet = new Set(prev);
            if (newSet.has(linkId)) {
                newSet.delete(linkId);
            } else {
                newSet.add(linkId);
            }
            return newSet;
        });
    };

    // Charger les données (mêmes sources que CrossDataAnalyzer)
    useEffect(() => {
        const loadData = async () => {
            console.log('[RiskNetworkGraph] Chargement des données...');
            const [pathRes, sympRes, treatRes, medRes] = await Promise.all([
                supabase.from('pathologies').select('id, name, severity'),
                supabase.from('symptoms').select('id, name, body_system'),
                supabase.from('treatments').select('id, name'),
                supabase.from('medications').select('id, name, substance'),
            ]);

            setPathologies(pathRes.data?.map(p => ({ ...p, type: 'pathology' as const })) || []);
            setSymptoms(sympRes.data?.map(s => ({ ...s, type: 'symptom' as const })) || []);
            setTreatments(treatRes.data?.map(t => ({ ...t, type: 'treatment' as const })) || []);
            setMedications(medRes.data?.map(m => ({ ...m, type: 'medication' as const })) || []);

            console.log('[RiskNetworkGraph] Données chargées:', {
                pathologies: pathRes.data?.length,
                symptoms: sympRes.data?.length,
                treatments: treatRes.data?.length,
                medications: medRes.data?.length
            });
        };
        loadData();
    }, []);

    // Selection is authoritative for canonical entities; graph aliases are only
    // a projection. A moved/duplicated node must not trigger another insertion.
    useEffect(() => {
        if (!selectedPathologyIds && !selectedSymptomIds && !selectedTreatmentIds && !selectedMedicationIds) return;
        const catalogue: (GraphEntity & { severity?: string | null })[] = [
            ...(externalPathologies || pathologies).map(item => ({ ...item, type: 'pathology' as const })),
            ...(externalSymptoms || symptoms).map(item => ({ ...item, type: 'symptom' as const })),
            ...(externalTreatments || treatments).map(item => ({ ...item, type: 'treatment' as const })),
            ...(externalMedications || medications).map(item => ({ ...item, type: 'medication' as const })),
        ];
        const useSnapshot = analysisSnapshot && snapshotSelectionMatches;
        const selection: (GraphEntity & { severity?: string | null })[] = useSnapshot
            ? restoreSnapshotGraphEntities(analysisSnapshot, catalogue) : [
            ...(externalPathologies || pathologies).filter(item => selectedPathologyIds?.includes(item.id)).map(item => ({ ...item, type: 'pathology' as const })),
            ...(externalSymptoms || symptoms).filter(item => selectedSymptomIds?.includes(item.id)).map(item => ({ ...item, type: 'symptom' as const })),
            ...(externalTreatments || treatments).filter(item => selectedTreatmentIds?.includes(item.id)).map(item => ({ ...item, type: 'treatment' as const })),
            ...(externalMedications || medications).filter(item => selectedMedicationIds?.includes(item.id)).map(item => ({ ...item, type: 'medication' as const })),
        ];
        const signature = JSON.stringify([useSnapshot ? analysisSnapshot.jobId : null,
            selection.map(item => [item.type, item.id, item.name, item.severity])]);
        if (externalSelectionKey.current === signature) return;
        externalSelectionKey.current = signature;
        const selectedByKey = new Map(selection.map(item => [canonicalGraphKey(item), item]));
        const wanted = new Set(selectedByKey.keys());
        const replacingSnapshot = Boolean(useSnapshot && restoredSnapshotJob.current !== analysisSnapshot.jobId);
        if (useSnapshot) restoredSnapshotJob.current = analysisSnapshot.jobId;
        pendingExternalProjection.current = JSON.stringify([...selectedByKey].map(([key, item]) => [key, item.id]).sort(([a], [b]) => a.localeCompare(b)));
        setNodes(previous => {
            const retained = (replacingSnapshot ? [] : previous).filter(node => !node.data.fromExternalSelection || wanted.has(String(node.data.canonicalId))).map(node => {
                const item = selectedByKey.get(String(node.data.canonicalId));
                return item ? { ...node, data: { ...node.data, label: item.name, entityId: item.id,
                    severity: item.severity, fromExternalSelection: true } } : node;
            });
            const present = new Set(collectCanonicalGraphEntities(retained).map(canonicalGraphKey));
            const added = [...selectedByKey.values()].filter(item => !present.has(canonicalGraphKey(item))).map((item, index): Node => {
                const colors = getItemColors(item as MedicalItem);
                const canonicalId = canonicalGraphKey(item);
                return {
                    id: `clinical:${encodeURIComponent(canonicalId)}:unassigned`, type: 'clinicalEntity',
                    position: { x: 60 + (index % 4) * 240, y: 80 + Math.floor(index / 4) * 120 },
                    data: { label: item.name, type: item.type, entityId: item.id, canonicalId, severity: item.severity, fromExternalSelection: true },
                    style: { background: colors.bg, border: `2px solid ${colors.border}`, color: colors.text,
                        borderRadius: 12, padding: '12px 14px', width: 210, fontSize: 12, fontWeight: 500 },
                };
            });
            return [...retained, ...added];
        });
    }, [selectedPathologyIds, selectedSymptomIds, selectedTreatmentIds, selectedMedicationIds,
        externalPathologies, externalSymptoms, externalTreatments, externalMedications,
        pathologies, symptoms, treatments, medications, getItemColors, setNodes, analysisSnapshot, snapshotSelectionMatches]);

    // Synchroniser l'analyse depuis le parent
    useEffect(() => {
        setIsLoadingLinks(false);
    }, [analysisResultFromParent, analysisMatchesSnapshot]);

    useEffect(() => {
        const links = analysisResult?.causalLinks || [];
        const projected = projectClinicalGraphLinks(links, nodes, hiddenNodes);
        const mapped: Record<string, CausalLink> = {};
        const currentEdges: Edge[] = projected.map(({ id, source, target, canonicalLinkId, link }) => {
            const display = relationPresentation(link);
            const danger = hasRiskSignal(link) && link.evidenceSupport === 'direct' && (link.dangerLevel === 'critical' || link.dangerLevel === 'high');
            const color = danger ? '#dc2626' : hasRiskSignal(link) ? '#b45309' : '#64748b';
            mapped[id] = link;
            return { id, source, target, type: 'smoothstep', animated: false, label: display.label,
                style: { stroke: color, strokeWidth: danger ? 3 : 2, strokeDasharray: link.evidenceSupport === 'direct' ? undefined : '5 4' },
                markerEnd: link.evidenceSupport !== 'direct' || ['association', 'coadministration'].includes(link.relationKind || '')
                    ? undefined : { type: MarkerType.ArrowClosed, color },
                labelStyle: { fontSize: 10, fill: color }, data: { link, canonicalLinkId } };
        });
        setEdges(previous => [...previous.filter(edge => edge.data?.manual && nodes.some(node => node.id === edge.source) && nodes.some(node => node.id === edge.target)), ...currentEdges]);
        setEdgeLinkMap(mapped);
        // Alert counts belong to canonical relations, never to visual copies.
        const risks = [...new Map(projected.filter(edge => hasRiskSignal(edge.link))
            .map(edge => [edge.canonicalLinkId, edge.link])).values()];
        setAlerts(risks.map(link => ({
            title: `${link.from} → ${link.to}`,
            type: link.evidenceSupport === 'direct' && (link.dangerLevel === 'critical' || link.dangerLevel === 'high') ? 'danger' as const : 'warning' as const,
            description: `${link.evidence || ''} ${relationPresentation(link).description}`.trim(), links: [link],
        })));
    }, [analysisResult, nodes, hiddenNodes, setEdges]);

    // Visibility is a view preference, never a silent clinical exclusion.
    const analyzeConnections = useCallback(async (customIds?: {
        pathologyIds?: string[],
        symptomIds?: string[],
        treatmentIds?: string[],
        medicationIds?: string[]
    }) => {
        const nodesToAnalyze = nodes.filter(node => graphEntityFromNode(node));

        if (collectCanonicalGraphEntities(nodesToAnalyze).length < 2 && !customIds) {
            return;
        }

        setIsAnalyzing(true);
        setIsLoadingLinks(true);

        try {
            const canonicalSelection = graphSelectionIds(nodesToAnalyze);
            const pathologyIds = customIds?.pathologyIds || canonicalSelection.pathologyIds;
            const symptomIds = customIds?.symptomIds || canonicalSelection.symptomIds;
            const treatmentIds = customIds?.treatmentIds || canonicalSelection.treatmentIds;
            const medicationIds = customIds?.medicationIds || canonicalSelection.medicationIds;

            // The parent owns the authenticated, resumable Astra agent job.
            // There is no standalone fallback to another model or old endpoint.
            await onAnalyzeWithOpenAI({ pathologyIds, symptomIds, treatmentIds, medicationIds,
                ...(analysisSnapshot ? { elements: collectCanonicalGraphEntities(nodesToAnalyze) } : {}) });

        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'L’analyse agentique est temporairement indisponible.');
        } finally {
            setIsAnalyzing(false);
            setIsLoadingLinks(false);
        }
    }, [nodes, onAnalyzeWithOpenAI, analysisSnapshot]);

    // Re-examine every canonical entity, including hidden/unassigned elements.
    // Restricting this to group members would silently omit unclassified risks.
    const analyzeGroupConnections = useCallback(() => analyzeConnections(), [analyzeConnections]);

    // Debounce search term to avoid blocking UI
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 300); // 300ms delay

        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Items filtrés
    const filteredItems = useMemo(() => {
        const items = {
            pathology: pathologies,
            symptom: symptoms,
            treatment: treatments,
            medication: medications,
        }[activeTab];

        if (!debouncedSearchTerm) return items.slice(0, 50);

        const lowerTerm = debouncedSearchTerm.toLowerCase();
        return items
            .filter(item => item.name.toLowerCase().includes(lowerTerm))
            .slice(0, 50);
    }, [activeTab, debouncedSearchTerm, pathologies, symptoms, treatments, medications]);

    const addNode = useCallback((item: MedicalItem) => {
        const canonicalId = canonicalGraphKey(item);
        if (collectCanonicalGraphEntities(nodes).some(entity => canonicalGraphKey(entity) === canonicalId)) return;
        const colors = getItemColors(item);
        setNodes(previous => [...previous, {
            id: `clinical:${encodeURIComponent(canonicalId)}:unassigned`, type: 'clinicalEntity',
            data: { label: item.name, type: item.type, entityId: item.id, canonicalId,
                severity: item.type === 'pathology' ? item.severity : undefined },
            position: { x: 60 + (previous.length % 4) * 240, y: 80 + Math.floor(previous.length / 4) * 120 },
            style: { background: colors.bg, border: `2px solid ${colors.border}`, color: colors.text,
                borderRadius: 12, padding: '12px 14px', width: 210, fontSize: 12, fontWeight: 500 },
        }]);
    }, [nodes, setNodes, getItemColors]);

    // Removing an element removes all of its visual copies, without changing
    // any prescription or patient record.
    const removeNode = useCallback((nodeId: string) => {
        const selected = nodes.find(node => node.id === nodeId);
        const entity = selected ? graphEntityFromNode(selected) : null;
        if (!entity) return;
        const key = canonicalGraphKey(entity);
        const removed = new Set(nodes.filter(node => {
            const item = graphEntityFromNode(node);
            return item && canonicalGraphKey(item) === key;
        }).map(node => node.id));
        setNodes(previous => previous.filter(node => !removed.has(node.id)));
        setEdges(previous => previous.filter(edge => !removed.has(edge.source) && !removed.has(edge.target)));
        setGroups(previous => previous.map(group => ({ ...group, memberIds: group.memberIds.filter(id => !removed.has(id)) })));
    }, [nodes, setNodes, setEdges]);

    // Connexion manuelle entre nœuds
    // Connexion manuelle ou Inter-Groupes
    const onConnect = useCallback((connection: Connection) => {
        const sourceNode = nodes.find(n => n.id === connection.source);
        const targetNode = nodes.find(n => n.id === connection.target);

        // Détection si Group -> Group ou Group -> Node
        const isSourceGroup = sourceNode?.type === 'group' || sourceNode?.data?.type === 'group'; // Vérifier vos types exacts
        const isTargetGroup = targetNode?.type === 'group' || targetNode?.data?.type === 'group';

        if (isSourceGroup || isTargetGroup) {
            console.log('[RiskNetworkGraph] Connexion de groupe détectée -> Lancement Analyse Globale');
            // Allow the edge to be created visually to show the connection
            const newEdge: Edge = {
                ...connection,
                id: `${connection.source}-${connection.target}`,
                type: 'default',
                animated: true,
                style: { stroke: '#94a3b8', strokeWidth: 2, strokeDasharray: '5,5' },
                markerEnd: { type: MarkerType.ArrowClosed },
                data: { isGroupConnection: true, manual: true }
            } as Edge;
            setEdges(eds => addEdge(newEdge, eds));

            // Trigger analysis
            setTimeout(() => analyzeConnections(), 100);
            return;
        }

        // Connexion standard Noeud -> Noeud
        const newEdge: Edge = {
            ...connection,
            id: `${connection.source}-${connection.target}`,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#94a3b8', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed },
            label: 'Lien manuel à examiner', data: { manual: true },
        } as Edge;

        setEdges(eds => addEdge(newEdge, eds));

    }, [setEdges, nodes, analyzeConnections]);



    // --- Selection Tools State ---
    const [selectionMode, setSelectionMode] = useState<'pointer' | 'box' | 'lasso'>('pointer');
    const [lassoPoints, setLassoPoints] = useState<{ x: number; y: number }[]>([]);
    const [isDrawingLasso, setIsDrawingLasso] = useState(false);
    const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });



    // Gestionnaires d'événements pour le Lasso (attachés au layer SVG/Div)
    const onLassoMouseDown = (e: React.MouseEvent) => {
        if (selectionMode !== 'lasso') return;
        setIsDrawingLasso(true);
        setLassoPoints([{ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }]);
    };

    const onLassoMouseMove = (e: React.MouseEvent) => {
        if (!isDrawingLasso) return;
        setLassoPoints(prev => [...prev, { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY }]);
    };

    const onLassoMouseUp = () => {
        if (!isDrawingLasso) return;
        setIsDrawingLasso(false);

        if (lassoPoints.length < 3) return;

        // 1. Convertir les points du lasso (Screen) en World polygon
        const polygon = lassoPoints.map(p => screenToFlow(p, viewport));

        // 2. Vérifier chaque nœud
        const nodesInside = nodes.filter(node => {
            // On vérifie le centre du nœud ou sa position top-left
            // Soyons précis: on utilise le centre (approximatif width=150, height=50)
            // Mieux: juste la position x,y (top-left) c'est standard.
            // Pour être user-friendly, testons le centre.
            const parent = node.parentId ? nodes.find(candidate => candidate.id === node.parentId) : undefined;
            const center = { x: node.position.x + (parent?.position.x || 0) + (node.measured?.width || 210) / 2,
                y: node.position.y + (parent?.position.y || 0) + (node.measured?.height || 70) / 2 };
            return isPointInPolygon(center, polygon);
        });

        // 3. Sélectionner
        const newSelection = nodesInside.map(n => n.id);
        setSelectedNodes(newSelection);

        // Mettre à jour l'état visuel de ReactFlow (changement 'selected')
        setNodes(nds => nds.map(n => ({
            ...n,
            selected: newSelection.includes(n.id)
        })));

        // Feedback
        if (newSelection.length > 0) {
            toast.success(`${newSelection.length} éléments sélectionnés`);
        }
    };


    // --- Logique de REDIMENSIONNEMENT AUTOMATIQUE des groupes ---

    const handleGroupAutoResize = useCallback((nds: Node[], changes: NodeChange[]) => {
        const padding = 40;
        const parentIdsToUpdate = new Set<string>();

        // Identifier quels parents ont des enfants qui ont bougé
        changes.forEach(change => {
            if (change.type === 'position' && change.dragging) {
                const node = nds.find(n => n.id === change.id);
                if (node?.parentId) {
                    parentIdsToUpdate.add(node.parentId);
                }
            }
        });

        if (parentIdsToUpdate.size === 0) return nds;

        let updatedNodes = [...nds];

        parentIdsToUpdate.forEach(parentId => {
            const parent = updatedNodes.find(n => n.id === parentId);
            if (!parent) return;

            const children = updatedNodes.filter(n => n.parentId === parentId);
            if (children.length === 0) return;

            // Calculer la bounding box des enfants (positions relatives)
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

            children.forEach(child => {
                const x = child.position.x;
                const y = child.position.y;
                const w = child.measured?.width || 150;
                const h = child.measured?.height || 60;

                minX = Math.min(minX, x);
                minY = Math.min(minY, y);
                maxX = Math.max(maxX, x + w);
                maxY = Math.max(maxY, y + h);
            });

            // Ajustements si les enfants sortent par le haut/gauche (coords négatives)
            let shiftX = 0;
            let shiftY = 0;

            if (minX < padding) {
                shiftX = minX - padding;
            }
            if (minY < padding) {
                shiftY = minY - padding;
            }

            // Nouvelles dimensions
            const currentWidth = parseFloat(String(parent.style?.width || 0));
            const currentHeight = parseFloat(String(parent.style?.height || 0));
            const newWidth = maxX - minX + padding * 2;
            const newHeight = maxY - minY + padding * 2;

            // Ne mettre à jour que si nécessaire (évite les boucles infinies de re-render)
            const needsResize = Math.abs(newWidth - currentWidth) > 1 || Math.abs(newHeight - currentHeight) > 1;
            const needsShift = shiftX !== 0 || shiftY !== 0;

            if (needsResize || needsShift) {
                updatedNodes = updatedNodes.map(n => {
                    // Update Parent
                    if (n.id === parentId) {
                        return {
                            ...n,
                            position: {
                                x: n.position.x + shiftX,
                                y: n.position.y + shiftY
                            },
                            style: {
                                ...n.style,
                                width: newWidth,
                                height: newHeight
                            }
                        };
                    }
                    // Shift Children if parent moved
                    if (n.parentId === parentId && needsShift) {
                        return {
                            ...n,
                            position: {
                                x: n.position.x - shiftX,
                                y: n.position.y - shiftY
                            }
                        };
                    }
                    return n;
                });
            }
        });

        return updatedNodes;
    }, []);

    // Wrappers pour onNodesChange qui incluent le resize
    const onNodesChange = useCallback((changes: NodeChange[]) => {
        onNodesChangeOriginal(changes);
        setNodes(nds => handleGroupAutoResize(nds, changes));
    }, [onNodesChangeOriginal, handleGroupAutoResize, setNodes]);

    const onProposedNodesChange = useCallback((changes: NodeChange[]) => {
        onProposedNodesChangeOriginal(changes);
        setProposedNodes(nds => handleGroupAutoResize(nds, changes));
    }, [onProposedNodesChangeOriginal, handleGroupAutoResize, setProposedNodes]);


    // --- Gestion des sélections et groupes visuels ---

    const [selectedNodes, setSelectedNodes] = useState<string[]>([]);

    const onSelectionChange = useCallback(({ nodes }: { nodes: Node[] }) => {
        setSelectedNodes(nodes.map(n => n.id));
    }, []);

    // Grouper les nœuds sélectionnés (Style Blender)
    const groupSelectedNodes = useCallback(() => {
        if (selectedNodes.length < 2 || automaticGrouping) return;

        // Récupérer les objets nœuds complets
        const nodesToGroup = nodes.filter(n => selectedNodes.includes(n.id) && !n.parentId && graphEntityFromNode(n));
        if (nodesToGroup.length < 2) return; // Besoin d'au moins 2 nœuds top-level

        // Calculer la bounding box
        const minX = Math.min(...nodesToGroup.map(n => n.position.x));
        const minY = Math.min(...nodesToGroup.map(n => n.position.y));
        const maxX = Math.max(...nodesToGroup.map(n => n.position.x + (n.measured?.width || 150)));
        const maxY = Math.max(...nodesToGroup.map(n => n.position.y + (n.measured?.height || 50)));

        const padding = 40;
        const width = maxX - minX + padding * 2;
        const height = maxY - minY + padding * 2;

        const pathologyNode = nodesToGroup.find(n => n.data.type === 'pathology');
        const groupName = pathologyNode ? `Groupe ${pathologyNode.data.label}` : 'Nouveau Groupe';
        const groupId = `group-${Date.now()}`;
        const color = getNextGroupColor();

        // Créer le nœud Groupe Container
        const groupNode: Node = {
            id: groupId,
            type: 'default', // Changed from 'group' to 'default' to ensure handles are present
            position: { x: minX - padding, y: minY - padding },
            style: {
                width,
                height,
                backgroundColor: `${color}10`, // More transparent
                border: `2px dashed ${color}`, // Dashed to indicate container
                borderRadius: '12px',
                zIndex: -1,
                pointerEvents: 'all', // Ensure it can be clicked/connected
            },
            data: {
                label: groupName,
                isGroup: true, type: 'group' // Visual container only
            },
            draggable: true,
        };

        // Créer l'objet logique PathologyGroup
        const newPathologyGroup: PathologyGroup = {
            id: groupId,
            name: groupName,
            pathologyId: pathologyNode?.id || groupId,
            pathologyName: (pathologyNode?.data.label as string) || 'Groupe',
            memberIds: nodesToGroup.map(n => n.id),
            color: color,
        };

        setGroups(prev => [...prev, newPathologyGroup]);

        // Mettre à jour les nœuds pour les rendre enfants du groupe
        setNodes(nds => {
            // Ajouter le groupe au début du tableau pour qu'il soit rendu AVANT ses enfants
            // React Flow exige que les parents soient avant les enfants
            const newNodes = [groupNode, ...nds];

            // Mettre à jour les enfants
            return newNodes.map(n => {
                if (selectedNodes.includes(n.id) && !n.parentId) {
                    return {
                        ...n,
                        parentId: groupId,
                        // extent: 'parent', // Removed to avoid strict boundaries if that's causing issues
                        position: {
                            // Calculate relative position to the group's top-left
                            x: n.position.x - (minX - padding),
                            y: n.position.y - (minY - padding),
                        },
                        style: {
                            ...n.style,
                            boxShadow: 'none',
                        }
                    };
                }
                return n;
            });
        });

        // Desélectionner pour éviter les confusions
        setSelectedNodes([]);


    }, [selectedNodes, nodes, getNextGroupColor, setNodes, automaticGrouping]);

    // Ancien système (compatible pour l'instant) mais on privilégiera le nouveau
    const createGroupFromPathology = useCallback((pathologyId: string) => {
        setAutomaticGrouping(false);
        // ... (Logique maintenue pour compatibilité, ou redirigée)
        // Pour l'instant on garde l'ancienne fonction en fallback ou on l'adapte
        // Si on veut utiliser le nouveau système visuel, il faudrait sélectionner les nœuds connectés et appeler groupSelectedNodes
        // Mais groupSelectedNodes dépend de selectedNodes state.
        // Faisons une version directe :

        const pathologyNode = nodes.find(n => n.id === pathologyId);
        if (!pathologyNode) return;

        const connectedNodeIds = edges
            .filter(e => e.source === pathologyId || e.target === pathologyId)
            .map(e => e.source === pathologyId ? e.target : e.source);

        const nodesToGroup = nodes.filter(n => (n.id === pathologyId || connectedNodeIds.includes(n.id)) && !n.parentId);

        if (nodesToGroup.length < 2) return;

        // Calculer la bounding box
        const minX = Math.min(...nodesToGroup.map(n => n.position.x));
        const minY = Math.min(...nodesToGroup.map(n => n.position.y));
        const maxX = Math.max(...nodesToGroup.map(n => n.position.x + (n.measured?.width || 150)));
        const maxY = Math.max(...nodesToGroup.map(n => n.position.y + (n.measured?.height || 50)));

        const padding = 40;
        const width = maxX - minX + padding * 2;
        const height = maxY - minY + padding * 2;
        const color = getNextGroupColor();
        const groupId = `group-${pathologyId}-${Date.now()}`;

        const groupNode: Node = {
            id: groupId,
            type: 'default', // Changed to default
            position: { x: minX - padding, y: minY - padding },
            style: {
                width,
                height,
                backgroundColor: `${color}10`,
                border: `2px dashed ${color}`,
                borderRadius: '12px',
                zIndex: -1,
            },
            data: { label: `Groupe ${pathologyNode.data.label}`, isGroup: true, type: 'group' },
        };

        const newPathologyGroup: PathologyGroup = {
            id: groupId,
            name: `Groupe ${pathologyNode.data.label}`,
            pathologyId: pathologyNode.id,
            pathologyName: pathologyNode.data.label as string,
            memberIds: nodesToGroup.map(n => n.id),
            color: color,
        };

        setGroups(prev => [...prev, newPathologyGroup]);

        setNodes(nds => {
            // Ajouter le groupe au début (Parent avant Enfants)
            const newNodes = [groupNode, ...nds];
            return newNodes.map(n => {
                if (newPathologyGroup.memberIds.includes(n.id)) {
                    return {
                        ...n,
                        parentId: groupId,
                        // extent: 'parent',
                        position: {
                            x: n.position.x - (minX - padding),
                            y: n.position.y - (minY - padding),
                        }
                    };
                }
                return n;
            });
        });

    }, [nodes, edges, getNextGroupColor, setNodes]);

    // Ajouter un nœud à un groupe existant
    const addNodeToGroup = useCallback((nodeId: string, groupId: string) => {
        setAutomaticGrouping(false);
        setGroups(prev => prev.map(g => {
            if (g.id === groupId && !g.memberIds.includes(nodeId)) {
                return { ...g, memberIds: [...g.memberIds, nodeId] };
            }
            return g;
        }));

        // Mettre à jour le style du nœud
        const group = groups.find(g => g.id === groupId);
        if (group) {
            setNodes(nds => nds.map(n => {
                if (n.id === nodeId) {
                    return {
                        ...n,
                        data: { ...n.data, groupId: groupId },
                        style: {
                            ...n.style,
                            boxShadow: `0 0 0 3px ${group.color}`,
                        },
                    };
                }
                return n;
            }));
        }
    }, [groups, setNodes]);

    // Retirer un nœud d'un groupe
    const removeNodeFromGroup = useCallback((nodeId: string, groupId: string) => {
        setAutomaticGrouping(false);
        setGroups(prev => prev.map(g => {
            if (g.id === groupId) {
                return { ...g, memberIds: g.memberIds.filter(id => id !== nodeId) };
            }
            return g;
        }));

        // Réinitialiser le style du nœud
        setNodes(nds => nds.map(n => {
            if (n.id === nodeId) {
                const { groupId: _, ...restData } = n.data as MedicalNodeData;
                return {
                    ...n,
                    data: restData,
                    style: {
                        ...n.style,
                        boxShadow: 'none',
                    },
                };
            }
            return n;
        }));
    }, [setNodes]);

    // Supprimer un groupe
    const deleteGroup = useCallback((groupId: string) => {
        setAutomaticGrouping(false);
        const group = groups.find(g => g.id === groupId);
        if (!group) return;

        setGroups(prev => prev.filter(g => g.id !== groupId));

        setNodes(nds => {
            const groupNode = nds.find(n => n.id === groupId);

            // Si pas de nœud groupe (ancien système ou bug), juste reset le style
            if (!groupNode) {
                return nds.map(n => {
                    if (group.memberIds.includes(n.id)) {
                        const { groupId: _, ...restData } = n.data as MedicalNodeData;
                        return { ...n, data: restData, style: { ...n.style, boxShadow: 'none' } };
                    }
                    return n;
                });
            }

            // Si c'est un nœud groupe, on doit "libérer" les enfants
            const groupPos = groupNode.position;

            // 1. Filtrer pour enlever le nœud groupe
            const nodesWithoutGroup = nds.filter(n => n.id !== groupId);

            // 2. Mettre à jour les enfants : enlever parentId et corriger position
            return nodesWithoutGroup.map(n => {
                if (n.parentId === groupId) {
                    return {
                        ...n,
                        parentId: undefined,
                        extent: undefined,
                        position: {
                            // Convert back to absolute world coordinates
                            x: groupPos.x + n.position.x,
                            y: groupPos.y + n.position.y
                        }
                    };
                }
                // Fallback pour ancien système mixte
                if (group.memberIds.includes(n.id)) {
                    const { groupId: _, ...restData } = n.data as MedicalNodeData;
                    return { ...n, data: restData, style: { ...n.style, boxShadow: 'none' } };
                }
                return n;
            });
        });
    }, [groups, setNodes]);


    // Groups are a projection of reviewed relations. A visual copy retains
    // its canonical entityId and never becomes another selected medication.
    const applyAutomaticGroups = useCallback(() => {
        // Selection synchronization and grouping are separate effects. The
        // old render must not overwrite a newer selection queued by the first.
        if (pendingExternalProjection.current !== null) {
            const actual = JSON.stringify(collectCanonicalGraphEntities(nodes.filter(node => node.data.fromExternalSelection))
                .map(entity => [canonicalGraphKey(entity), entity.id]).sort(([a], [b]) => a.localeCompare(b)));
            if (actual !== pendingExternalProjection.current) return;
            pendingExternalProjection.current = null;
        }
        const plan = buildAutomaticPathologyGraph(collectCanonicalGraphEntities(nodes), analysisResult?.causalLinks || displayedLinks);
        const signature = JSON.stringify(plan);
        if (automaticLayoutKey.current === signature) return;
        automaticLayoutKey.current = signature;

        const previous = new Map(nodes.map(node => [node.id, node]));
        const templates = new Map<string, Node>();
        for (const node of nodes) {
            const entity = graphEntityFromNode(node);
            if (entity && !templates.has(canonicalGraphKey(entity))) templates.set(canonicalGraphKey(entity), node);
        }
        const positions = new Map<string, { x: number; y: number }>();
        const groupNodes: Node[] = [];
        const layoutGroups: PathologyGroup[] = [];
        let rowY = 60, rowHeight = 0;
        const groupWidth = 520;
        const keepMovedPosition = (node: Node | undefined, suggested: { x: number; y: number }) => {
            const priorLayout = node?.data.autoLayoutPosition as { x: number; y: number } | undefined;
            return node && priorLayout && (Math.abs(node.position.x - priorLayout.x) > 1 || Math.abs(node.position.y - priorLayout.y) > 1)
                ? node.position : suggested;
        };

        plan.groups.forEach((group, index) => {
            if (index > 0 && index % 2 === 0) { rowY += rowHeight + 70; rowHeight = 0; }
            const oldGroup = previous.get(group.id);
            // Keep existing members in their slots as new pairs arrive.
            const oldOrder = Array.isArray(oldGroup?.data.autoMemberIds) ? oldGroup.data.autoMemberIds as string[] : [];
            const members = [group.pathologyId,
                ...oldOrder.filter(id => id !== group.pathologyId && group.memberIds.includes(id)),
                ...group.memberIds.filter(id => id !== group.pathologyId && !oldOrder.includes(id)),
            ];
            const height = Math.max(170, 150 + Math.ceil((members.length - 1) / 2) * 120);
            const suggested = { x: 60 + (index % 2) * (groupWidth + 70), y: rowY };
            const position = keepMovedPosition(oldGroup, suggested);
            rowHeight = Math.max(rowHeight, height);
            const color = groupColors[index % groupColors.length];
            groupNodes.push({
                id: group.id, type: 'clinicalPathologyGroup', position, draggable: true,
                style: { width: groupWidth, height, background: `${color}0c`, border: `1.5px solid ${color}70`, borderRadius: 16, zIndex: -1 },
                data: { label: group.pathologyName, type: 'group', isGroup: true, automatic: true,
                    autoMemberIds: members, autoLayoutPosition: suggested },
            });
            members.forEach((id, memberIndex) => positions.set(id, memberIndex === 0 ? { x: 140, y: 42 }
                : { x: 35 + ((memberIndex - 1) % 2) * 240, y: 140 + Math.floor((memberIndex - 1) / 2) * 120 }));
            layoutGroups.push({ id: group.id, name: group.pathologyName, pathologyName: group.pathologyName,
                pathologyId: group.pathologyId, memberIds: members, color, automatic: true });
        });
        const looseY = plan.groups.length ? rowY + rowHeight + 90 : 80;
        let looseIndex = 0;
        const instanceNodes: Node[] = plan.instances.map(instance => {
            const old = previous.get(instance.id);
            const template = old || templates.get(instance.canonicalId);
            const suggested = positions.get(instance.id) || { x: 60 + (looseIndex % 4) * 250, y: looseY + Math.floor(looseIndex++ / 4) * 130 };
            const colors = getItemColors({ id: instance.entityId, name: instance.name, type: instance.type,
                severity: template?.data.severity } as MedicalItem);
            const manifestation = instance.membershipKinds.includes('manifestation');
            const adverse = instance.membershipKinds.includes('adverse_effect');
            const borderColor = manifestation && adverse ? '#8b5cf6' : adverse ? '#f97316' : colors.border;
            return {
                id: instance.id, type: 'clinicalEntity', parentId: instance.groupId,
                position: keepMovedPosition(old, suggested),
                data: { ...template?.data, label: instance.name, type: instance.type, entityId: instance.entityId,
                    canonicalId: instance.canonicalId, membershipKinds: instance.membershipKinds,
                    sharedGroupCount: instance.sharedGroupCount, autoLayoutPosition: suggested },
                style: { background: colors.bg, border: `2px ${adverse && !manifestation ? 'dashed' : 'solid'} ${borderColor}`,
                    color: colors.text, borderRadius: 12, padding: '12px 14px', width: instance.type === 'pathology' ? 240 : 210,
                    fontSize: 12, fontWeight: 500 },
            };
        });
        setNodes([...groupNodes, ...instanceNodes]);
        setGroups(layoutGroups);
        setHiddenNodes(hidden => {
            const next = new Set<string>();
            groupNodes.forEach(node => { if (hidden.has(node.id)) next.add(node.id); });
            for (const instance of plan.instances) {
                const copies = nodes.filter(node => String(node.data.canonicalId) === instance.canonicalId);
                if (hidden.has(instance.id) || (copies.length > 0 && copies.every(copy => hidden.has(copy.id)))) next.add(instance.id);
            }
            return next;
        });
        setHiddenGroups(hidden => new Set([...hidden].filter(id => layoutGroups.some(group => group.id === id))));
    }, [analysisResult, displayedLinks, nodes, groupColors, getItemColors, setNodes]);

    useEffect(() => {
        if (automaticGrouping) applyAutomaticGroups();
    }, [automaticGrouping, applyAutomaticGroups]);

    const autoGenerateGroups = useCallback(() => {
        automaticLayoutKey.current = '';
        setAutomaticGrouping(true);
        applyAutomaticGroups();
    }, [applyAutomaticGroups]);

    const useFreeLayout = useCallback(() => {
        setAutomaticGrouping(false);
        automaticLayoutKey.current = '';
        const entities = collectCanonicalGraphEntities(nodes);
        const flatNodes: Node[] = entities.map((entity, index) => {
            const canonicalId = canonicalGraphKey(entity);
            const template = nodes.find(node => String(node.data.canonicalId) === canonicalId);
            const colors = getItemColors({ ...entity, severity: template?.data.severity } as MedicalItem);
            return { id: `clinical:${encodeURIComponent(canonicalId)}:unassigned`, type: 'clinicalEntity',
                position: { x: 60 + (index % 4) * 250, y: 80 + Math.floor(index / 4) * 120 },
                data: { ...template?.data, label: entity.name, type: entity.type, entityId: entity.id,
                    canonicalId, membershipKinds: [], sharedGroupCount: 0 },
                style: { background: colors.bg, border: `2px solid ${colors.border}`, color: colors.text,
                    borderRadius: 12, padding: '12px 14px', width: 210, fontSize: 12, fontWeight: 500 } };
        });
        setNodes(flatNodes);
        setGroups([]);
        setHiddenNodes(new Set());
        setHiddenGroups(new Set());
        setSelectedNodes([]);
    }, [nodes, getItemColors, setNodes]);

    const canonicalNodes = useMemo(() => collectCanonicalGraphEntities(nodes).map(entity =>
        nodes.find(node => {
            const item = graphEntityFromNode(node);
            return item && canonicalGraphKey(item) === canonicalGraphKey(entity);
        })!), [nodes]);
    const visibleEntityCount = collectCanonicalGraphEntities(visibleNodes).length;
    const layoutKey = visibleNodes.map(node => `${node.id}:${node.parentId || ''}`).join('|');
    const sharedEntityCount = canonicalNodes.filter(node => Number(node.data.sharedGroupCount) > 1).length;
    const unassignedEntityCount = canonicalNodes.filter(node => !node.parentId && node.data.type !== 'pathology').length;

    // Icône par type
    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'pathology': return <Stethoscope className="h-4 w-4" />;
            case 'symptom': return <Activity className="h-4 w-4" />;
            case 'treatment': return <Pill className="h-4 w-4" />;
            case 'medication': return <Pill className="h-4 w-4" />;
            default: return null;
        }
    };

    // Obtenir la couleur du lien pour l'affichage
    const getLinkDisplayColor = (link: CausalLink) => hasRiskSignal(link)
        ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
        : 'border-slate-300 bg-slate-50 dark:bg-slate-900/20';

    return (
        <div className="flex flex-col gap-4">
            {analysisSnapshot && !analysisMatchesSnapshot && (
                <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                    <strong>Nouvelle sélection non analysée.</strong>{' '}
                    Les résultats de l’analyse enregistrée ne s’appliquent pas à cette sélection modifiée.
                    Lancez une analyse pour examiner tous les éléments et reconstruire leurs groupes.
                </div>
            )}
            {analysisResult?.pairAssessments?.length ? (
                <div role="status" className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                    <strong>OpenAI a examiné {analysisResult.pairAssessments.length} paire(s) dans l’analyse affichée.</strong>
                    {' '}Les hypothèses et preuves insuffisantes sont détaillées dans la vue matrice.
                    Seules les relations assorties de références consultables apparaissent comme liens du graphe,
                    et nécessitent une validation clinique.
                </div>
            ) : null}
            {canonicalNodes.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground" role="status">
                    <span>{automaticGrouping ? 'Regroupement automatique par pathologie' : 'Disposition libre'}</span>
                    {sharedEntityCount > 0 && <span>{sharedEntityCount} élément(s) présent(s) dans plusieurs groupes : une seule identité clinique.</span>}
                    {automaticGrouping && unassignedEntityCount > 0 && <span>{unassignedEntityCount} élément(s) non rattaché(s), conservé(s) dans l’analyse.</span>}
                </div>
            )}
            {/* Rangée supérieure: Sélection + Graphique */}
            <div className="flex gap-4 h-[700px]">
                {/* Panel de sélection des éléments */}
                <Card className="w-80 flex-shrink-0 flex flex-col overflow-hidden">
                    <CardHeader className="pb-2 flex-shrink-0">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Plus className="h-4 w-4" />
                            Ajouter des éléments
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col min-h-0 p-3 gap-3">
                        {/* === Section scrollable (recherche + liste) === */}
                        <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
                            {/* Recherche */}
                            <div className="relative shrink-0">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Rechercher..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-8"
                                />
                            </div>

                            {/* Tabs par type */}
                            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
                                <TabsList className="grid grid-cols-4 h-8 w-full">
                                    <TabsTrigger value="pathology" className="text-xs px-1">
                                        <Stethoscope className="h-3 w-3" />
                                    </TabsTrigger>
                                    <TabsTrigger value="symptom" className="text-xs px-1">
                                        <Activity className="h-3 w-3" />
                                    </TabsTrigger>
                                    <TabsTrigger value="treatment" className="text-xs px-1">
                                        <Pill className="h-3 w-3" />
                                    </TabsTrigger>
                                    <TabsTrigger value="medication" className="text-xs px-1">
                                        <Pill className="h-3 w-3" />
                                    </TabsTrigger>
                                </TabsList>

                                <TabsContent value={activeTab} className="mt-2 text-left">
                                    <div className="space-y-1">
                                        {filteredItems.map(item => (
                                            <Button
                                                key={item.id}
                                                variant="ghost"
                                                size="sm"
                                                className="w-full justify-start text-xs h-8 px-2"
                                                onClick={() => addNode(item)}
                                                disabled={canonicalNodes.some(n => n.data.canonicalId === canonicalGraphKey(item))}
                                            >
                                                {getTypeIcon(item.type)}
                                                <span className="truncate ml-2">{item.name}</span>
                                            </Button>
                                        ))}
                                    </div>
                                </TabsContent>
                            </Tabs>

                            {/* Nœuds actifs */}
                            <div className="border-t pt-3 shrink-0">
                                <p className="text-xs font-medium mb-2">Éléments sélectionnés ({canonicalNodes.length})</p>
                                <div className="space-y-1 max-h-[150px] overflow-y-auto">
                                    {canonicalNodes.map(node => {
                                        // Ne pas afficher les nœuds de groupe dans cette liste
                                        if (node.type === 'group') return null;

                                        return (
                                            <div
                                                key={node.id}
                                                className={`flex items-center justify-between text-xs transition-opacity ${isCanonicalHidden(node) ? 'opacity-40' : ''}`}
                                            >
                                                <Badge
                                                    variant="outline"
                                                    className="truncate max-w-[150px]"
                                                    style={{
                                                        borderColor: node.data.type === 'pathology' ? '#ef4444' :
                                                            node.data.type === 'symptom' ? '#3b82f6' :
                                                                '#f97316'
                                                    }}
                                                >
                                                    {node.data.label}
                                                </Badge>
                                                <div className="flex gap-0.5">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 w-6 p-0"
                                                        onClick={() => toggleNodeVisibility(node.id)}
                                                        title={isCanonicalHidden(node) ? "Montrer les copies" : "Cacher les copies"}
                                                    >
                                                        {isCanonicalHidden(node) ? (
                                                            <EyeOff className="h-3 w-3 text-gray-400" />
                                                        ) : (
                                                            <Eye className="h-3 w-3 text-gray-600" />
                                                        )}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 w-6 p-0"
                                                        onClick={() => removeNode(node.id)}
                                                        aria-label={`Retirer ${String(node.data.label)} de la sélection`}
                                                    >
                                                        <Trash2 className="h-3 w-3 text-red-500" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        {/* === FIN Section scrollable === */}

                        {/* === Section fixe en bas === */}
                        <div className="shrink-0 space-y-3 border-t pt-3">
                            {/* Bouton d'analyse */}
                            <Button
                                className="w-full"
                                onClick={() => (groups.length >= 2 ? analyzeGroupConnections() : analyzeConnections())}
                                disabled={canonicalNodes.length < 2 || isAnalyzing}
                            >
                                {isAnalyzing ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Analyse...
                                    </>
                                ) : (
                                    <>
                                        <Network className="h-4 w-4 mr-2" />
                                        Analyser tous les éléments
                                    </>
                                )}
                            </Button>

                            {/* Score en temps réel */}
                            {displayedLinks.length > 0 && (
                                <div className="mt-3 p-2 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-lg border">
                                    <p className="text-xs font-medium mb-2">Relations à examiner</p>
                                    <div className="flex gap-1 text-[10px]">
                                        <Badge variant="outline" className="text-red-600 border-red-300">{liveStats.redLinks} risque(s) élevé(s)</Badge>
                                        <Badge variant="outline" className="text-amber-700 border-amber-300">{liveStats.orangeLinks} prudence(s)</Badge>
                                    </div>
                                    <p className="mt-1 text-[10px] text-muted-foreground">Les copies ne multiplient pas les alertes. Aucun score clinique n’est déduit du nombre de liens.</p>

                                    {/* Toggle schéma proposé */}
                                    {proposedNodes.length > 0 && (
                                        <Button
                                            variant={showProposedSchema ? "default" : "outline"}
                                            size="sm"
                                            className="w-full mt-2 h-6 text-xs"
                                            onClick={() => setShowProposedSchema(!showProposedSchema)}
                                        >
                                            {showProposedSchema ? '👁️ Masquer proposé' : '✨ Voir schéma proposé'}
                                        </Button>
                                    )}
                                </div>
                            )}

                            {/* Section Groupes */}
                            <div className="border-t pt-3 mt-3 shrink-0">
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-medium">Groupes ({groups.length})</p>
                                    <div className="flex gap-1">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-6 text-xs"
                                            onClick={useFreeLayout}
                                            aria-pressed={!automaticGrouping}
                                            title="Revenir à un seul nœud par élément et organiser librement les groupes"
                                        >
                                            Libre
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-6 text-xs"
                                            onClick={groupSelectedNodes}
                                            disabled={automaticGrouping || selectedNodes.length < 2}
                                            title={automaticGrouping ? 'Passez en disposition libre pour créer un groupe manuel' : 'Grouper les nœuds sélectionnés'}
                                        >
                                            <BoxSelect className="h-3 w-3 mr-1" />
                                            Manuel
                                        </Button>
                                        <Button
                                            variant={automaticGrouping ? 'default' : 'outline'}
                                            size="sm"
                                            className="h-6 text-xs bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                                            onClick={autoGenerateGroups}
                                            disabled={canonicalNodes.length === 0}
                                            aria-pressed={automaticGrouping}
                                            title="Regrouper par pathologie et dupliquer les éléments partagés selon les relations analysées"
                                        >
                                            <Network className="h-3 w-3 mr-1" />
                                            Auto
                                        </Button>
                                    </div>
                                </div>

                                {/* Liste des groupes existants */}
                                {groups.length > 0 && (
                                    <div className="space-y-2 max-h-[150px] overflow-y-auto">
                                        {groups.map(group => (
                                            <div
                                                key={group.id}
                                                className={`p-2 rounded-lg border transition-opacity ${hiddenGroups.has(group.id) ? 'opacity-40' : ''}`}
                                                style={{ borderColor: group.color, backgroundColor: `${group.color}10` }}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs font-medium" style={{ color: group.color }}>
                                                        {group.name}
                                                    </span>
                                                    <div className="flex gap-0.5">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-5 w-5 p-0"
                                                            onClick={() => toggleGroupVisibility(group.id)}
                                                            title={hiddenGroups.has(group.id) ? "Montrer le groupe" : "Cacher le groupe"}
                                                        >
                                                            {hiddenGroups.has(group.id) ? (
                                                                <EyeOff className="h-3 w-3 text-gray-400" />
                                                            ) : (
                                                                <Eye className="h-3 w-3 text-gray-600" />
                                                            )}
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-5 w-5 p-0"
                                                            onClick={() => deleteGroup(group.id)}
                                                        >
                                                            <Trash2 className="h-3 w-3 text-red-500" />
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-1">
                                                    {group.memberIds.slice(0, 4).map(memberId => {
                                                        const node = nodes.find(n => n.id === memberId);
                                                        return node ? (
                                                            <Badge key={memberId} variant="outline" className="text-[10px] bg-white dark:bg-black">
                                                                {(node.data.label as string).slice(0, 10)}...
                                                            </Badge>
                                                        ) : null;
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                        {/* === FIN Section fixe === */}
                    </CardContent>
                </Card>

                {/* Zone de graphique */}
                <Card className="flex-1 flex flex-col overflow-hidden relative group">
                    {/* Toolbar de sélection (Centrée en haut) */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-white/90 dark:bg-gray-900/90 shadow-md border rounded-full p-1 flex items-center gap-1">
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant={selectionMode === 'pointer' ? "secondary" : "ghost"}
                                        size="icon"
                                        className="h-8 w-8 rounded-full"
                                        onClick={() => setSelectionMode('pointer')}
                                    >
                                        <MousePointer2 className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Sélection (Ctrl + Clic) / Navigation</p></TooltipContent>
                            </Tooltip>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant={selectionMode === 'box' ? "secondary" : "ghost"}
                                        size="icon"
                                        className="h-8 w-8 rounded-full"
                                        onClick={() => setSelectionMode('box')}
                                    >
                                        <SquareDashed className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Sélection rectangulaire</p></TooltipContent>
                            </Tooltip>

                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant={selectionMode === 'lasso' ? "secondary" : "ghost"}
                                        size="icon"
                                        className="h-8 w-8 rounded-full"
                                        onClick={() => setSelectionMode('lasso')}
                                    >
                                        <Lasso className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent><p>Lasso libre</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>

                    <CardContent className="p-0 h-full relative selection-wrapper">
                        {showProposedSchema ? (
                            /* === Mode Comparaison: 2 ReactFlow côte à côte === */
                            <div className="flex h-full">
                                {/* Schéma Actuel (Gauche) */}
                                <div className="w-1/2 h-full border-r-2 border-dashed border-gray-300 relative">
                                    <div className="absolute top-2 left-2 z-10 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-lg shadow border">
                                        <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
                                            📋 Schéma Actuel
                                        </span>
                                        <Badge variant="outline" className="ml-2">Non calculé</Badge>
                                    </div>
                                    <ReactFlow
                                        nodeTypes={clinicalNodeTypes}
                                        nodes={visibleNodes}
                                        edges={edges}
                                        onNodesChange={onNodesChange}
                                        onEdgesChange={onEdgesChange}
                                        onConnect={onConnect}
                                        onSelectionChange={onSelectionChange}
                                        onMove={(_, vp) => setViewport(vp)}
                                        panOnDrag={selectionMode === 'pointer'}
                                        selectionOnDrag={selectionMode === 'box'}
                                        panOnScroll={true}
                                        selectionKeyCode={selectionMode === 'pointer' ? "Control" : null}
                                        multiSelectionKeyCode="Control"
                                        onEdgeClick={(_, edge) => {
                                            const link = edgeLinkMap[edge.id] || (edge.data as MedicalEdgeData)?.link;
                                            if (link) {
                                                setHoveredLink(link);
                                                setShowLinkDetails(true);
                                            }
                                        }}
                                        fitView
                                        attributionPosition="bottom-left"
                                        className="bg-slate-50 dark:bg-slate-950"
                                    >
                                        <FitClinicalGraph layoutKey={layoutKey} />
                                        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
                                        <Controls position="bottom-left" />
                                    </ReactFlow>
                                </div>

                                {/* Schéma Proposé (Droite) */}
                                <div className="w-1/2 h-full relative bg-green-50/30 dark:bg-green-950/20">
                                    <div className="absolute top-2 left-2 z-10 bg-green-100 dark:bg-green-900/50 px-3 py-1 rounded-lg shadow border border-green-400">
                                        <span className="text-sm font-bold text-green-700 dark:text-green-300">
                                            ✨ Schéma Proposé
                                        </span>
                                        <Badge className="ml-2 bg-green-500">
                                            Non calculé
                                        </Badge>
                                    </div>
                                    <ReactFlow
                                        nodeTypes={clinicalNodeTypes}
                                        nodes={proposedNodes}
                                        edges={proposedEdges}
                                        onNodesChange={onProposedNodesChange}
                                        onEdgesChange={onProposedEdgesChange}
                                        nodesDraggable={true}
                                        nodesConnectable={false}
                                        elementsSelectable={true}
                                        panOnDrag={true}
                                        panOnScroll={true}
                                        onEdgeClick={(_, edge) => {
                                            // Récupérer le lien original (sans le préfixe 'proposed-')
                                            const originalEdgeId = edge.id.replace('proposed-', '');
                                            const link = edgeLinkMap[originalEdgeId] || (edge.data as MedicalEdgeData)?.link;
                                            if (link) {
                                                setHoveredLink(link);
                                                setShowLinkDetails(true);
                                            }
                                        }}
                                        fitView
                                        attributionPosition="bottom-right"
                                        className="bg-transparent"
                                    >
                                        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#22c55e30" />
                                        <Controls position="bottom-right" />
                                    </ReactFlow>
                                </div>
                            </div>
                        ) : (
                            /* === Mode Normal: 1 ReactFlow === */
                            <ReactFlow
                                nodeTypes={clinicalNodeTypes}
                                nodes={visibleNodes}
                                edges={edges}
                                onNodesChange={onNodesChange}
                                onEdgesChange={onEdgesChange}
                                onConnect={onConnect}
                                onSelectionChange={onSelectionChange}
                                onMove={(_, vp) => setViewport(vp)}

                                // Configuration Mode
                                panOnDrag={selectionMode === 'pointer'}
                                selectionOnDrag={selectionMode === 'box'}
                                panOnScroll={true}
                                selectionKeyCode={selectionMode === 'pointer' ? "Control" : null}
                                multiSelectionKeyCode="Control"

                                onEdgeClick={(_, edge) => {
                                    const link = edgeLinkMap[edge.id] || (edge.data as MedicalEdgeData)?.link;
                                    if (link) {
                                        setHoveredLink(link);
                                        setShowLinkDetails(true);
                                    }
                                }}
                                fitView
                                attributionPosition="bottom-left"
                                className="bg-slate-50 dark:bg-slate-950"
                            >
                                <FitClinicalGraph layoutKey={layoutKey} />
                                <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
                                <Controls />

                                {/* Lasso Overlay & Interaction Layer */}
                                {selectionMode === 'lasso' && (
                                    <div
                                        className="absolute inset-0 z-[100] cursor-crosshair"
                                        onMouseDown={onLassoMouseDown}
                                        onMouseMove={onLassoMouseMove}
                                        onMouseUp={onLassoMouseUp}
                                        onMouseLeave={onLassoMouseUp}
                                    >
                                        {isDrawingLasso && lassoPoints.length > 0 && (
                                            <svg className="w-full h-full pointer-events-none">
                                                <polygon
                                                    points={lassoPoints.map(p => `${p.x},${p.y}`).join(' ')}
                                                    fill="rgba(59, 130, 246, 0.2)"
                                                    stroke="rgba(59, 130, 246, 0.8)"
                                                    strokeWidth="2"
                                                    strokeDasharray="5,5"
                                                />
                                            </svg>
                                        )}
                                    </div>
                                )}

                                <Panel position="top-right" className="max-w-[220px] rounded-lg border bg-white/95 p-3 shadow-sm dark:bg-gray-900/95">
                                    <details className="text-[11px] leading-relaxed">
                                        <summary className="cursor-pointer font-semibold">Légende du graphe</summary>
                                        <div className="mt-2 space-y-2">
                                            <p><span className="inline-block w-5 border-t-2 border-slate-500 mr-2" />Relation sourcée à vérifier</p>
                                            <p><span className="inline-block w-5 border-t-2 border-dashed border-slate-500 mr-2" />Contexte différent ou incertain</p>
                                            <p><span className="inline-block w-5 border-t-2 border-amber-700 mr-2" />Effet indésirable, interaction ou risque</p>
                                            <p><span className="inline-block w-5 border-t-2 border-red-600 mr-2" />Risque élevé signalé</p>
                                            <p className="border-t pt-2">Un symptôme peut être relié à une maladie, à un traitement ou aux deux. Son origine doit être confirmée.</p>
                                            <p>« Même élément » identifie les copies d’un élément associé à plusieurs pathologies.</p>
                                            <p>Un élément hors groupe reste inclus dans l’analyse.</p>
                                        </div>
                                    </details>
                                </Panel>

                                {/* Indicateur d'analyse */}
                                {isAnalyzing && (
                                    <Panel position="top-center" className="bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Analyse en cours...
                                    </Panel>
                                )}

                                {/* Badge d'alertes */}
                                {alerts.length > 0 && (
                                    <Panel position="bottom-right" className="mb-4 mr-4">
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            onClick={() => {
                                                setCurrentAlert(alerts[0]);
                                                setShowAlertDialog(true);
                                            }}
                                            className="animate-pulse"
                                        >
                                            <ShieldAlert className="h-4 w-4 mr-2" />
                                            {alerts.length} Alerte{alerts.length > 1 ? 's' : ''}
                                        </Button>
                                    </Panel>
                                )}
                            </ReactFlow>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Rangée inférieure: Liens de causalité */}
            {(displayedLinks.length > 0 || isLoadingLinks) && (
                <Card className="mt-4">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Network className="h-4 w-4" />
                            Relations analysées
                            {isLoadingLinks && (
                                <span className="text-xs text-muted-foreground ml-2 flex items-center gap-1">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Chargement...
                                </span>
                            )}
                            {!isLoadingLinks && displayedLinks.length > 0 && (
                                <Badge variant="secondary" className="ml-2">{displayedLinks.length}</Badge>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <div className="h-[300px] overflow-y-auto pr-2">
                            <div className="space-y-2">
                                {sortedDisplayedLinks.map((link, index) => {
                                    const linkId = `${link.from}-${link.to}-${index}`;
                                    const isExpanded = expandedLinks.has(linkId);

                                    return (
                                        <div
                                            key={linkId}
                                            className={`rounded-lg border-l-4 transition-all duration-300 ease-out animate-in slide-in-from-top-2 fade-in ${getLinkDisplayColor(link)}`}
                                            style={{
                                                animationDelay: `${index * 50}ms`,
                                                animationFillMode: 'both'
                                            }}
                                        >
                                            {/* En-tête cliquable */}
                                            <div
                                                className="p-3 flex items-center gap-2 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                                onClick={() => toggleLinkExpand(linkId)}
                                            >
                                                {/* Flèche de dépliement */}
                                                <ChevronDown
                                                    className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                                />

                                                {/* Éléments liés */}
                                                <div className="flex items-center gap-1 flex-1 min-w-0">
                                                    <Badge variant="outline" className="text-xs shrink-0">
                                                        {link.fromType === 'pathology' ? '🏥' :
                                                            link.fromType === 'symptom' ? '🩺' :
                                                                link.fromType === 'medication' ? '💊' : '⚕️'}
                                                    </Badge>
                                                    <span className="font-medium text-sm truncate">{link.from}</span>
                                                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mx-1" />
                                                    <Badge variant="outline" className="text-xs shrink-0">
                                                        {link.toType === 'pathology' ? '🏥' :
                                                            link.toType === 'symptom' ? '🩺' :
                                                                link.toType === 'medication' ? '💊' : '⚕️'}
                                                    </Badge>
                                                    <span className="font-medium text-sm truncate">{link.to}</span>
                                                </div>

                                                {/* Badges d'indicateurs */}
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {link.dangerLevel && (
                                                        <Badge
                                                            className={`text-xs ${link.dangerLevel === 'critical' ? 'bg-red-500 text-white' :
                                                                link.dangerLevel === 'high' ? 'bg-orange-500 text-white' :
                                                                    link.dangerLevel === 'moderate' ? 'bg-yellow-500 text-black' :
                                                                        'bg-green-500 text-white'
                                                                }`}
                                                        >
                                                            {link.dangerLevel === 'critical' ? '⚠️' :
                                                                link.dangerLevel === 'high' ? '🔶' :
                                                                    link.dangerLevel === 'moderate' ? '🔸' : '✓'}
                                                        </Badge>
                                                    )}
                                                    {supportsAppropriatenessBadge(link) && (
                                                        <Badge
                                                            className={`text-xs ${link.isAppropriate ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}
                                                        >
                                                            {getAppropriatenessLabel(link).split(' ')[0]}
                                                        </Badge>
                                                    )}
                                                    {link.symptomFrequency && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            {link.symptomFrequency === 'principal' ? '★' :
                                                                link.symptomFrequency === 'frequent' ? '◆' :
                                                                    link.symptomFrequency === 'possible' ? '◇' : '○'}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Contenu déplié */}
                                            {isExpanded && (
                                                <div className="px-3 pb-3 pt-0 space-y-3 border-t border-black/10 dark:border-white/10">
                                                    {/* Relation */}
                                                    {link.relationship && (
                                                        <p className="text-sm text-muted-foreground">
                                                            {link.relationship}
                                                        </p>
                                                    )}

                                                    {/* Indicateurs détaillés */}
                                                    <div className="flex flex-wrap gap-2">
                                                        {link.dangerLevel && (
                                                            <Badge
                                                                className={`text-xs ${link.dangerLevel === 'critical' ? 'bg-red-500 text-white' :
                                                                    link.dangerLevel === 'high' ? 'bg-orange-500 text-white' :
                                                                        link.dangerLevel === 'moderate' ? 'bg-yellow-500 text-black' :
                                                                            'bg-green-500 text-white'
                                                                    }`}
                                                            >
                                                                {link.dangerLevel === 'critical' ? '⚠️ Critique' :
                                                                    link.dangerLevel === 'high' ? '🔶 Élevé' :
                                                                        link.dangerLevel === 'moderate' ? '🔸 Modéré' : '✓ Faible'}
                                                            </Badge>
                                                        )}
                                                        {supportsAppropriatenessBadge(link) && (
                                                            <Badge
                                                                className={`text-xs ${link.isAppropriate ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}
                                                            >
                                                                {getAppropriatenessLabel(link)}
                                                            </Badge>
                                                        )}
                                                        {link.symptomFrequency && (
                                                            <Badge variant="secondary" className="text-xs">
                                                                {link.symptomFrequency === 'principal' ? '★ Principal' :
                                                                    link.symptomFrequency === 'frequent' ? '◆ Fréquent' :
                                                                        link.symptomFrequency === 'possible' ? '◇ Possible' : '○ Rare'}
                                                            </Badge>
                                                        )}
                                                        {link.effectType && (
                                                            <Badge variant="outline" className="text-xs">
                                                                {link.effectType === 'therapeutic' ? '💊 Thérapeutique' :
                                                                    link.effectType === 'adverse' ? '⚠️ Indésirable' : '⚖️ Les deux'}
                                                            </Badge>
                                                        )}
                                                        {link.validationVersion === RELATION_ENGINE_VERSION && (
                                                            <Badge variant="outline" className="text-xs">
                                                                {relationPresentation(link).label}
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    {/* Evidence */}
                                                    {link.evidence && (
                                                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                                            <p className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-1">
                                                                📚 Explication médicale
                                                            </p>
                                                            <p className="text-xs text-blue-700 dark:text-blue-400">
                                                                {link.evidence}
                                                            </p>
                                                        </div>
                                                    )}

                                                    <ClinicalLinkEvidence link={link} />

                                                    {/* Détails thérapeutiques */}
                                                    {link.therapeuticDetails && (
                                                        <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded text-xs text-green-700 dark:text-green-400">
                                                            💊 {link.therapeuticDetails}
                                                        </div>
                                                    )}

                                                    {/* Détails indésirables */}
                                                    {link.adverseDetails && (
                                                        <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded text-xs text-orange-700 dark:text-orange-400">
                                                            ⚠️ {link.adverseDetails}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {isLoadingLinks && displayedLinks.length === 0 && (
                                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                                        <span>Analyse en cours...</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Panneau de Synthèse - Affiche avec analysisResult OU liens affichés */}
            {(analysisResult || displayedLinks.length > 0) && (
                <Card className="mt-4 border-l-4 border-l-purple-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <FileText className="h-4 w-4 text-purple-500" />
                            Synthèse Clinique
                            <Badge variant="secondary" className="ml-2">
                                {visibleEntityCount} éléments actifs
                            </Badge>
                            <Badge variant="outline" className="ml-1">Évaluation qualitative</Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-4">
                        {/* Stats en temps réel */}
                        <div className="p-3 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-lg border">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium">État actuel des liens</span>
                                <span className="text-xs text-muted-foreground">Un lien partagé est compté une fois</span>
                            </div>
                            <div className="flex gap-2 mt-2">
                                <Badge variant="outline" className="text-red-500 border-red-300">
                                    Risques élevés signalés : {liveStats.redLinks}
                                </Badge>
                                <Badge variant="outline" className="text-orange-500 border-orange-300">
                                    Relations de prudence : {liveStats.orangeLinks}
                                </Badge>

                            </div>
                        </div>

                        {/* Résumé */}
                        {analysisResult?.summary && (
                            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                                <p className="text-sm font-medium text-purple-800 dark:text-purple-300 mb-1">
                                    📋 Résumé
                                </p>
                                <p className="text-sm text-purple-700 dark:text-purple-400">
                                    {analysisResult.summary}
                                </p>
                            </div>
                        )}

                        {/* Avertissements */}
                        {analysisResult?.warnings && analysisResult.warnings.length > 0 && (
                            <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                                <p className="text-sm font-medium text-orange-800 dark:text-orange-300 mb-2">
                                    ⚠️ Avertissements ({analysisResult.warnings.length})
                                </p>
                                <ul className="space-y-1">
                                    {analysisResult.warnings.map((warning, idx) => (
                                        <li key={idx} className="text-sm text-orange-700 dark:text-orange-400 flex items-start gap-2">
                                            <span className="text-orange-500">•</span>
                                            {warning}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Recommandations */}
                        {analysisResult?.recommendations && analysisResult.recommendations.length > 0 && (
                            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                                <p className="text-sm font-medium text-green-800 dark:text-green-300 mb-2">
                                    💡 Recommandations ({analysisResult.recommendations.length})
                                </p>
                                <ul className="space-y-1">
                                    {analysisResult.recommendations.map((rec, idx) => (
                                        <li key={idx} className="text-sm text-green-700 dark:text-green-400 flex items-start gap-2">
                                            <span className="text-green-500">✓</span>
                                            {rec}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {onGenerateTreatmentSchemas && analysisResult && (
                            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20 flex flex-col gap-3">
                                <div>
                                    <p className="text-sm font-medium flex items-center gap-2">
                                        <Lightbulb className="h-4 w-4 text-primary" />
                                        Schémas thérapeutiques alternatifs
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Génération dédiée après l’analyse initiale avec GPT-5.5 Pro xhigh.
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    onClick={onGenerateTreatmentSchemas}
                                    disabled={isGeneratingTreatmentSchemas}
                                    className="w-full"
                                >
                                    {isGeneratingTreatmentSchemas ? (
                                        <>
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                            Génération...
                                        </>
                                    ) : (
                                        <>
                                            <Lightbulb className="h-4 w-4 mr-2" />
                                            {(analysisResult.treatmentSchemas?.length || 0) > 0 ? 'Régénérer les schémas' : 'Générer les schémas'}
                                        </>
                                    )}
                                </Button>
                            </div>
                        )}

                        {analysisResult?.treatmentSchemas && analysisResult.treatmentSchemas.length > 0 && (
                            <TreatmentSchemasGraphPanel schemas={analysisResult.treatmentSchemas} />
                        )}

                        {/* Alternatives suggérées (pour les dangers) */}
                        {analysisResult?.alternatives && analysisResult.alternatives.length > 0 && (
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                <p className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
                                    <Lightbulb className="h-4 w-4 inline mr-1" />
                                    Alternatives proposées
                                </p>
                                <div className="space-y-3">
                                    {analysisResult.alternatives.map((alt: { for: string; reason: string; suggestions?: string[] }, idx: number) => (
                                        <div key={idx} className="p-2 bg-white dark:bg-gray-800 rounded border">
                                            <p className="text-xs text-red-500 mb-1">
                                                ⚠️ Problème avec: <strong>{alt.for}</strong>
                                            </p>
                                            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                                                {alt.reason}
                                            </p>
                                            <div className="flex flex-wrap gap-1">
                                                {alt.suggestions?.map((suggestion: string, sIdx: number) => (
                                                    <Badge
                                                        key={sIdx}
                                                        variant="outline"
                                                        className="text-xs bg-blue-50 dark:bg-blue-900/30 cursor-pointer hover:bg-blue-100"
                                                    >
                                                        💊 {suggestion}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Si aucune info disponible */}
                        {!analysisResult?.summary &&
                            (!analysisResult?.warnings || analysisResult.warnings.length === 0) &&
                            (!analysisResult?.recommendations || analysisResult.recommendations.length === 0) &&
                            displayedLinks.length === 0 && (
                                <div className="text-center py-4 text-muted-foreground">
                                    <p className="text-sm">Aucune synthèse disponible pour cette analyse.</p>
                                </div>
                            )}
                    </CardContent>
                </Card>
            )}

            {/* Dialog des alertes */}
            <Dialog open={showAlertDialog} onOpenChange={setShowAlertDialog}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                            <AlertTriangle className="h-5 w-5" />
                            Alertes de Risque
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 max-h-[400px] overflow-y-auto">
                        {alerts.map((alert, idx) => (
                            <div
                                key={idx}
                                className={`p-4 rounded-lg border ${alert.type === 'danger'
                                    ? 'bg-red-50 border-red-200 dark:bg-red-900/20'
                                    : 'bg-orange-50 border-orange-200 dark:bg-orange-900/20'
                                    }`}
                            >
                                <div className="flex items-start gap-3">
                                    {alert.type === 'danger' ? (
                                        <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                                    ) : (
                                        <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                                    )}
                                    <div>
                                        <p className="font-semibold text-sm">{alert.title}</p>
                                        <p className="text-sm text-muted-foreground mt-1">{alert.description}</p>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {alerts.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                <Info className="h-10 w-10 mx-auto mb-3" />
                                <p>Aucune alerte visible dans cette analyse</p>
                                <p className="text-sm">L’absence d’alerte ne permet pas de conclure à l’absence de risque.</p>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog des détails du lien */}
            <Dialog open={showLinkDetails} onOpenChange={setShowLinkDetails}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Info className="h-5 w-5 text-primary" />
                            Détails de la relation
                        </DialogTitle>
                    </DialogHeader>
                    {hoveredLink && (
                        <div className="space-y-4">
                            {/* Relation */}
                            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                                <Badge variant="outline" className="px-3 py-1">
                                    {hoveredLink.fromType || 'Élément'}
                                </Badge>
                                <span className="font-medium">{hoveredLink.from}</span>
                                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                <Badge variant="outline" className="px-3 py-1">
                                    {hoveredLink.toType || 'Élément'}
                                </Badge>
                                <span className="font-medium">{hoveredLink.to}</span>
                            </div>

                            {/* Relation description */}
                            <div>
                                <p className="text-sm font-medium text-muted-foreground mb-1">Relation</p>
                                <p className="text-sm">{hoveredLink.relationship}</p>
                            </div>

                            {/* Indicateurs */}
                            <div className="grid grid-cols-2 gap-3">
                                {supportsAppropriatenessBadge(hoveredLink) && (
                                    <div className="p-3 rounded-lg border">
                                        <p className="text-xs text-muted-foreground mb-1">
                                            Adéquation thérapeutique
                                        </p>
                                        <Badge
                                            className={hoveredLink.isAppropriate
                                                ? 'bg-green-500/20 text-green-700 border-green-500/30'
                                                : 'bg-red-500/20 text-red-700 border-red-500/30'}
                                        >
                                            {getAppropriatenessLabel(hoveredLink)}
                                        </Badge>
                                    </div>
                                )}

                                {hoveredLink.dangerLevel && (
                                    <div className="p-3 rounded-lg border">
                                        <p className="text-xs text-muted-foreground mb-1">Niveau de danger</p>
                                        <Badge
                                            className={
                                                hoveredLink.dangerLevel === 'critical' ? 'bg-red-500/20 text-red-700' :
                                                    hoveredLink.dangerLevel === 'high' ? 'bg-orange-500/20 text-orange-700' :
                                                        hoveredLink.dangerLevel === 'moderate' ? 'bg-yellow-500/20 text-yellow-700' :
                                                            'bg-green-500/20 text-green-700'
                                            }
                                        >
                                            {hoveredLink.dangerLevel === 'critical' ? '🔴 Critique' :
                                                hoveredLink.dangerLevel === 'high' ? '🟠 Élevé' :
                                                    hoveredLink.dangerLevel === 'moderate' ? '🟡 Modéré' :
                                                        '🟢 Faible'}
                                        </Badge>
                                    </div>
                                )}

                                {hoveredLink.symptomFrequency && (
                                    <div className="p-3 rounded-lg border">
                                        <p className="text-xs text-muted-foreground mb-1">Fréquence du symptôme</p>
                                        <Badge variant="outline">
                                            {hoveredLink.symptomFrequency === 'principal' ? 'Principal' :
                                                hoveredLink.symptomFrequency === 'frequent' ? 'Fréquent' :
                                                    hoveredLink.symptomFrequency === 'possible' ? 'Possible' :
                                                        'Rare'}
                                        </Badge>
                                    </div>
                                )}

                                {hoveredLink.effectType && (
                                    <div className="p-3 rounded-lg border">
                                        <p className="text-xs text-muted-foreground mb-1">Type d'effet</p>
                                        <Badge variant="outline">
                                            {hoveredLink.effectType === 'therapeutic' ? '💊 Thérapeutique' :
                                                hoveredLink.effectType === 'adverse' ? '⚠️ Indésirable' :
                                                    '⚖️ Les deux'}
                                        </Badge>
                                    </div>
                                )}
                            </div>

                            {/* Evidence / Explication détaillée */}
                            {hoveredLink.evidence && (
                                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <p className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
                                        📚 Explication médicale
                                    </p>
                                    <p className="text-sm text-blue-700 dark:text-blue-400">
                                        {hoveredLink.evidence}
                                    </p>
                                </div>
                            )}
                            <ClinicalLinkEvidence link={hoveredLink} />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default RiskNetworkGraph;
