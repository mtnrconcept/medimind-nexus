import { useCallback, useState, useMemo, useEffect } from 'react';
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
import { useAI } from '@/contexts/AIContext';
import { toast } from 'sonner';

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

interface CausalLink {
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
    currentScore: number;
    proposedScore: number;
    improvementPercent: number;
    currentStats: SchemaStats;
    proposedStats: SchemaStats;
    proposedChanges: ProposedChange[];
    benefitRiskRatio: { current: number; proposed: number };
    clinicalSummary: string;
}

interface AnalysisResult {
    causalLinks: CausalLink[];
    summary?: string;
    warnings: string[];
    recommendations?: string[];
    alternatives?: Alternative[];
    schemaComparison?: SchemaComparison;
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
    onAnalysisResultChange?: (result: AnalysisResult) => void;
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
    onAnalysisResultChange,
}: RiskNetworkGraphProps = {}) {
    const { invokeAI } = useAI();
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
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

    // État pour la popup de détails du lien
    const [hoveredLink, setHoveredLink] = useState<CausalLink | null>(null);
    const [showLinkDetails, setShowLinkDetails] = useState(false);

    // Map pour stocker les liens par ID d'edge
    const [edgeLinkMap, setEdgeLinkMap] = useState<Record<string, CausalLink>>({});

    // État pour l'affichage progressif des liens
    const [displayedLinks, setDisplayedLinks] = useState<CausalLink[]>([]);
    const [isLoadingLinks, setIsLoadingLinks] = useState(false);

    // État pour les cartes dépliées (accordéon)
    const [expandedLinks, setExpandedLinks] = useState<Set<string>>(new Set());

    // États pour les groupes de pathologie
    const [groups, setGroups] = useState<PathologyGroup[]>([]);
    const [isGroupMode, setIsGroupMode] = useState(false);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [showGroupDialog, setShowGroupDialog] = useState(false);
    const [newGroupPathologyId, setNewGroupPathologyId] = useState<string | null>(null);

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

    // Fonction pour calculer le score de dangerosité d'un lien
    const getDangerScore = useCallback((link: CausalLink): number => {
        let score = 0;
        if (link.dangerLevel === 'critical') score += 100;
        else if (link.dangerLevel === 'high') score += 75;
        else if (link.dangerLevel === 'moderate') score += 50;
        else if (link.dangerLevel === 'low') score += 25;
        if (link.isAppropriate === false) score += 60;
        if (link.effectType === 'adverse') score += 40;
        else if (link.effectType === 'both') score += 20;
        if (link.interactionType === 'drug-drug') score += 30;
        if (link.interactionType === 'pathology-danger') score += 50;
        return score;
    }, []);

    // Helper pour obtenir le label d'adéquation selon les types d'entités
    const getAppropriatenessLabel = useCallback((link: CausalLink) => {
        const isMedicationInvolved = link.fromType === 'medication' || link.toType === 'medication' ||
            link.fromType === 'treatment' || link.toType === 'treatment';

        const isPathologyToSymptom = (link.fromType === 'pathology' && link.toType === 'symptom');

        if (isPathologyToSymptom) {
            return link.isAppropriate ? '✓ Classique/Confirmé' : '✗ Atypique/Incohérent';
        }

        if (isMedicationInvolved) {
            return link.isAppropriate ? '✓ Adapté' : '✗ Contre-indiqué';
        }

        // Fallback par défaut
        return link.isAppropriate ? '✓ Adapté' : '✗ Non indiqué';
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
        const visibleLinks = displayedLinks.filter(link => {
            // Vérifier si les nœuds source et cible sont visibles
            const fromNode = nodes.find(n =>
                String(n.data.label).toLowerCase().includes(link.from.toLowerCase()) ||
                link.from.toLowerCase().includes(String(n.data.label).toLowerCase())
            );
            const toNode = nodes.find(n =>
                String(n.data.label).toLowerCase().includes(link.to.toLowerCase()) ||
                link.to.toLowerCase().includes(String(n.data.label).toLowerCase())
            );

            if (!fromNode || !toNode) return false;
            return !hiddenNodes.has(fromNode.id) && !hiddenNodes.has(toNode.id);
        });

        let redLinks = 0, orangeLinks = 0, greenLinks = 0;
        let totalDangerScore = 0, inappropriateCount = 0, adverseEffectCount = 0;

        visibleLinks.forEach(link => {
            if (link.dangerLevel === 'critical' || link.dangerLevel === 'high') {
                redLinks++;
                totalDangerScore += link.dangerLevel === 'critical' ? 100 : 75;
            } else if (link.dangerLevel === 'moderate') {
                orangeLinks++;
                totalDangerScore += 50;
            } else if (link.isAppropriate === true || !link.dangerLevel) {
                greenLinks++;
            }

            if (link.isAppropriate === false) inappropriateCount++;
            if (link.effectType === 'adverse') adverseEffectCount++;
        });

        return { redLinks, orangeLinks, greenLinks, totalDangerScore, inappropriateCount, adverseEffectCount };
    }, [displayedLinks, nodes, hiddenNodes]);

    // Calcul du score en temps réel
    const liveScore = useMemo(() => {
        return Math.max(0, 100 - (liveStats.redLinks * 20 + liveStats.orangeLinks * 10 + liveStats.inappropriateCount * 15));
    }, [liveStats]);

    // Ratio bénéfice/risque en temps réel
    const liveBenefitRiskRatio = useMemo(() => {
        return liveStats.greenLinks / (liveStats.redLinks + liveStats.orangeLinks + 1);
    }, [liveStats]);


    // Fonction pour cacher/montrer un nœud
    const toggleNodeVisibility = useCallback((nodeId: string) => {
        setHiddenNodes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(nodeId)) {
                newSet.delete(nodeId);
            } else {
                newSet.add(nodeId);
            }
            return newSet;
        });
    }, []);

    // Fonction pour cacher/montrer un groupe entier (inclut la pathologie principale)
    const toggleGroupVisibility = useCallback((groupId: string) => {
        const group = groups.find(g => g.id === groupId);
        if (!group) return;

        setHiddenGroups(prev => {
            const newSet = new Set(prev);
            const isHidden = newSet.has(groupId);

            // Collecter tous les IDs à cacher/montrer (membres + pathologie + groupe lui-même)
            const allIdsToToggle = [
                ...group.memberIds,
                group.pathologyId, // La pathologie principale du groupe
                groupId, // Le nœud groupe lui-même
            ];

            if (isHidden) {
                newSet.delete(groupId);
                // Montrer tous les éléments du groupe
                setHiddenNodes(prevNodes => {
                    const updatedNodes = new Set(prevNodes);
                    allIdsToToggle.forEach(id => updatedNodes.delete(id));
                    return updatedNodes;
                });
            } else {
                newSet.add(groupId);
                // Cacher tous les éléments du groupe
                setHiddenNodes(prevNodes => {
                    const updatedNodes = new Set(prevNodes);
                    allIdsToToggle.forEach(id => updatedNodes.add(id));
                    return updatedNodes;
                });
            }
            return newSet;
        });
    }, [groups]);

    // Obtenir les nœuds visibles uniquement
    const visibleNodes = useMemo(() => {
        return nodes.filter(n => !hiddenNodes.has(n.id));
    }, [nodes, hiddenNodes]);

    // Mettre à jour le style des edges quand des nœuds sont cachés
    useEffect(() => {
        if (hiddenNodes.size === 0) {
            // Restaurer tous les edges à leur style normal
            setEdges(eds => eds.map(edge => ({
                ...edge,
                animated: edge.data?.originalAnimated ?? edge.animated,
                style: {
                    ...edge.style,
                    opacity: 1,
                    strokeDasharray: edge.data?.originalStrokeDasharray ?? undefined,
                },
            })));
        } else {
            // Griser les edges connectés à des nœuds cachés
            setEdges(eds => eds.map(edge => {
                const sourceHidden = hiddenNodes.has(edge.source);
                const targetHidden = hiddenNodes.has(edge.target);
                const isAffected = sourceHidden || targetHidden;

                return {
                    ...edge,
                    animated: isAffected ? false : (edge.data?.originalAnimated ?? edge.animated),
                    style: {
                        ...edge.style,
                        opacity: isAffected ? 0.15 : 1,
                        strokeDasharray: isAffected ? '5,5' : (edge.data?.originalStrokeDasharray ?? undefined),
                    },
                    data: {
                        ...edge.data,
                        // Sauvegarder les valeurs originales si pas déjà fait
                        originalAnimated: edge.data?.originalAnimated ?? edge.animated,
                        originalStrokeDasharray: edge.data?.originalStrokeDasharray ?? edge.style?.strokeDasharray,
                    },
                };
            }));
        }
    }, [hiddenNodes, setEdges]);

    // Mettre à jour l'opacité des nœuds cachés sur le canvas
    useEffect(() => {
        setNodes(nds => nds.map(node => ({
            ...node,
            style: {
                ...node.style,
                opacity: hiddenNodes.has(node.id) ? 0.3 : 1,
                transition: 'opacity 0.2s ease',
            },
        })));
    }, [hiddenNodes, setNodes]);



    // Trier les liens par dangerosité (du plus dangereux au moins dangereux)
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
        const visibleNodes = nodes.filter(n => !hiddenNodes.has(n.id) && n.data.type !== 'group');

        // Si pas de nœuds visibles ou pas d'edges, pas de schéma proposé
        if (visibleNodes.length === 0 || edges.length === 0) {
            setProposedNodes([]);
            setProposedEdges([]);
            return;
        }

        // Modifications optionnelles si elles existent
        const changes = analysisResult?.schemaComparison?.proposedChanges || [];

        // Pour le split canvas, on utilise les mêmes positions (pas d'offset)
        // Les nœuds sont dans un ReactFlow séparé donc pas besoin de conteneur parent
        let proposedNodesList = visibleNodes.map(n => ({
            ...n,
            id: `proposed-${n.id}`,
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
    }, [analysisResult, nodes.length, hiddenNodes, edgeLinkMap, setProposedNodes, setProposedEdges]);

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

    // Synchroniser les nœuds avec les sélections externes (de CrossDataAnalyzer)
    useEffect(() => {
        if (!selectedPathologyIds && !selectedSymptomIds && !selectedTreatmentIds && !selectedMedicationIds) {
            return; // Pas de sélections externes
        }

        console.log('[RiskNetworkGraph] Synchronisation avec sélections externes:', {
            pathologies: selectedPathologyIds?.length || 0,
            symptoms: selectedSymptomIds?.length || 0,
            treatments: selectedTreatmentIds?.length || 0,
            medications: selectedMedicationIds?.length || 0
        });

        // Utiliser les données externes si disponibles, sinon les données locales
        const pathsToUse = externalPathologies || pathologies;
        const sympsToUse = externalSymptoms || symptoms;
        const treatsToUse = externalTreatments || treatments;
        const medsToUse = externalMedications || medications;

        const newNodes: Node[] = [];
        const positions = { x: 100, y: 100 };
        const gridStep = 200;
        let nodeIndex = 0;

        // Ajouter les pathologies sélectionnées
        selectedPathologyIds?.forEach(id => {
            const item = pathsToUse.find(p => p.id === id);
            if (item && !nodes.find(n => n.id === id)) {
                const colors = getPathologySeverityColor(item.severity);
                newNodes.push({
                    id: item.id,
                    position: { x: positions.x + (nodeIndex % 4) * gridStep, y: positions.y + Math.floor(nodeIndex / 4) * gridStep },
                    data: { label: item.name, type: 'pathology', status: 'neutral' },
                    style: {
                        background: colors.bg,
                        border: `2px solid ${colors.border}`,
                        borderRadius: '12px',
                        padding: '10px 16px',
                        fontSize: '13px',
                        fontWeight: '500',
                        color: colors.text,
                    },
                });
                nodeIndex++;
            }
        });

        // Ajouter les symptômes sélectionnés
        selectedSymptomIds?.forEach(id => {
            const item = sympsToUse.find(s => s.id === id);
            if (item && !nodes.find(n => n.id === id)) {
                const colors = getSymptomColor();
                newNodes.push({
                    id: item.id,
                    position: { x: positions.x + (nodeIndex % 4) * gridStep, y: positions.y + Math.floor(nodeIndex / 4) * gridStep },
                    data: { label: item.name, type: 'symptom', status: 'neutral' },
                    style: {
                        background: colors.bg,
                        border: `2px solid ${colors.border}`,
                        borderRadius: '12px',
                        padding: '10px 16px',
                        fontSize: '13px',
                        fontWeight: '500',
                        color: colors.text,
                    },
                });
                nodeIndex++;
            }
        });

        // Ajouter les traitements sélectionnés
        selectedTreatmentIds?.forEach(id => {
            const item = treatsToUse.find(t => t.id === id);
            if (item && !nodes.find(n => n.id === id)) {
                const colors = { bg: '#dcfce7', border: '#22c55e', text: '#15803d' };
                newNodes.push({
                    id: item.id,
                    position: { x: positions.x + (nodeIndex % 4) * gridStep, y: positions.y + Math.floor(nodeIndex / 4) * gridStep },
                    data: { label: item.name, type: 'treatment', status: 'neutral' },
                    style: {
                        background: colors.bg,
                        border: `2px solid ${colors.border}`,
                        borderRadius: '12px',
                        padding: '10px 16px',
                        fontSize: '13px',
                        fontWeight: '500',
                        color: colors.text,
                    },
                });
                nodeIndex++;
            }
        });

        // Ajouter les médicaments sélectionnés
        selectedMedicationIds?.forEach(id => {
            const item = medsToUse.find(m => m.id === id);
            if (item && !nodes.find(n => n.id === id)) {
                const colors = getMedicationColor();
                newNodes.push({
                    id: item.id,
                    position: { x: positions.x + (nodeIndex % 4) * gridStep, y: positions.y + Math.floor(nodeIndex / 4) * gridStep },
                    data: { label: item.name, type: 'medication', status: 'neutral' },
                    style: {
                        background: colors.bg,
                        border: `2px solid ${colors.border}`,
                        borderRadius: '12px',
                        padding: '10px 16px',
                        fontSize: '13px',
                        fontWeight: '500',
                        color: colors.text,
                    },
                });
                nodeIndex++;
            }
        });

        if (newNodes.length > 0) {
            setNodes(prev => [...prev, ...newNodes]);
            console.log('[RiskNetworkGraph] Nœuds ajoutés depuis sélections externes:', newNodes.length);
        }
    }, [selectedPathologyIds, selectedSymptomIds, selectedTreatmentIds, selectedMedicationIds,
        externalPathologies, externalSymptoms, externalTreatments, externalMedications,
        pathologies, symptoms, treatments, medications, setNodes, nodes]);

    // Synchroniser l'analyse depuis le parent
    useEffect(() => {
        if (analysisResultFromParent && analysisResultFromParent.causalLinks.length > 0) {
            console.log('[RiskNetworkGraph] Analyse reçue du parent:', analysisResultFromParent.causalLinks.length, 'liens');
            setAnalysisResult(analysisResultFromParent);
            // Déclencher l'affichage progressif des liens
            setDisplayedLinks([]);
            setIsLoadingLinks(true);

            analysisResultFromParent.causalLinks.forEach((link, index) => {
                setTimeout(() => {
                    setDisplayedLinks(prev => [...prev, link]);
                    if (index === analysisResultFromParent.causalLinks.length - 1) {
                        setIsLoadingLinks(false);
                    }
                }, index * 100);
            });
        }
    }, [analysisResultFromParent, setAnalysisResult, setDisplayedLinks, setIsLoadingLinks]);



    // Analyser les connexions via l'IA (uniquement les nœuds visibles)
    const analyzeConnections = useCallback(async (customIds?: {
        pathologyIds?: string[],
        symptomIds?: string[],
        treatmentIds?: string[],
        medicationIds?: string[]
    }) => {
        // Utiliser les nœuds visibles uniquement
        const nodesToAnalyze = nodes.filter(n => !hiddenNodes.has(n.id));

        if (nodesToAnalyze.length < 2 && !customIds) {
            console.log('[RiskNetworkGraph] Pas assez de nœuds visibles pour analyser');
            return;
        }

        setIsAnalyzing(true);
        setIsLoadingLinks(true);
        setDisplayedLinks([]); // Réinitialiser les liens affichés
        const newAlerts: AlertInfo[] = [];

        try {
            // Préparer les IDs par type (nœuds visibles uniquement)
            const pathologyIds = customIds?.pathologyIds || nodesToAnalyze.filter(n => n.data.type === 'pathology').map(n => n.id);
            const symptomIds = customIds?.symptomIds || nodesToAnalyze.filter(n => n.data.type === 'symptom').map(n => n.id);
            const treatmentIds = customIds?.treatmentIds || nodesToAnalyze.filter(n => n.data.type === 'treatment').map(n => n.id);
            const medicationIds = customIds?.medicationIds || nodesToAnalyze.filter(n => n.data.type === 'medication').map(n => n.id);

            console.log('[RiskNetworkGraph] Analyse avec IDs:', {
                total: pathologyIds.length + symptomIds.length + treatmentIds.length + medicationIds.length,
                isCustom: !!customIds,
                pathologyIds, symptomIds, treatmentIds, medicationIds
            });

            // Appeler l'API
            const { data, error } = await invokeAI('cross-data-analyzer', {
                pathologyIds, symptomIds, treatmentIds, medicationIds
            });

            if (data?.error) {
                toast.error(`Erreur d'analyse: ${data.error}`);
                setIsAnalyzing(false);
                setIsLoadingLinks(false);
                return;
            }

            if (error) {
                console.error('[RiskNetworkGraph] Erreur API:', error);
                throw error;
            }

            console.log('[RiskNetworkGraph] Réponse API:', data);

            // Extract the actual analysis object from the response
            const actualAnalysis = data?.analysis || data;
            setAnalysisResult(actualAnalysis);

            // Sync with parent if callback provided
            if (onAnalysisResultChange) {
                onAnalysisResultChange(actualAnalysis);
            }

            // Vérifier la structure des données
            const causalLinks = actualAnalysis?.causalLinks || [];
            console.log('[RiskNetworkGraph] Liens trouvés:', causalLinks.length);

            // Mettre à jour les edges et les nœuds selon les résultats
            const newEdges: Edge[] = [];
            const nodeUpdates: Record<string, { status: 'success' | 'danger' | 'warning' | 'neutral' }> = {};
            const newEdgeLinkMap: Record<string, CausalLink> = {};

            // Fonction pour trouver un nœud par son nom
            const findNodeByName = (name: string) => {
                const normalizedName = normalizeForComparison(name);
                return nodes.find(n => {
                    const nodeNameNorm = normalizeForComparison(n.data.label);
                    return nodeNameNorm.includes(normalizedName) ||
                        normalizedName.includes(nodeNameNorm) ||
                        nodeNameNorm === normalizedName;
                });
            };

            causalLinks.forEach((link: CausalLink) => {
                // Trouver les nœuds source et cible
                const sourceNode = findNodeByName(link.from);
                const targetNode = findNodeByName(link.to);

                if (sourceNode && targetNode && sourceNode.id !== targetNode.id) {
                    // Déterminer la couleur du lien selon le type de relation
                    let strokeColor = linkColors.blue; // Bleu par défaut (informatif)
                    let alertType: 'danger' | 'warning' | 'info' = 'info';

                    // Rouge: VRAI Danger (Interaction dangereuse ou toxicité critique)
                    if (link.dangerLevel === 'critical' || link.dangerLevel === 'high') {
                        strokeColor = linkColors.red;
                        alertType = 'danger';
                    }
                    // Orange: Contre-indication "Non indiqué" (mais pas forcément mortel)
                    else if (link.isAppropriate === false) {
                        strokeColor = linkColors.orange;
                        alertType = 'warning'; // Change from danger to warning
                    }
                    // Jaune/Orange: Risque d'interaction modéré
                    else if (link.dangerLevel === 'moderate' || (link.effectType === 'adverse' && link.isAppropriate !== true)) {
                        strokeColor = linkColors.orange;
                        alertType = 'warning';
                    }
                    // Jaune: Effets secondaires bénins ou interaction bénigne, symptôme normal
                    else if (link.dangerLevel === 'low' || link.effectType === 'both' || link.symptomFrequency === 'possible' || link.symptomFrequency === 'rare') {
                        strokeColor = linkColors.yellow;
                    }
                    // Vert: Adapté ou lien normal (traitement approprié, symptôme principal/fréquent)
                    else if (link.isAppropriate === true || link.effectType === 'therapeutic' || link.symptomFrequency === 'principal' || link.symptomFrequency === 'frequent') {
                        strokeColor = linkColors.green;
                    }

                    const isDanger = alertType === 'danger';
                    const isWarning = alertType === 'warning';

                    // Créer un ID unique pour l'edge
                    const edgeId = `${sourceNode.id}-${targetNode.id}-${Date.now()}-${Math.random()}`;

                    // Stocker le lien dans la map
                    newEdgeLinkMap[edgeId] = link;

                    // Créer l'edge avec les data du lien
                    newEdges.push({
                        id: edgeId,
                        source: sourceNode.id,
                        target: targetNode.id,
                        type: 'smoothstep',
                        animated: isDanger,
                        style: {
                            stroke: strokeColor,
                            strokeWidth: isDanger ? 3 : 2,
                            cursor: 'pointer',
                        },
                        markerEnd: {
                            type: MarkerType.ArrowClosed,
                            color: strokeColor,
                        },
                        label: link.symptomFrequency || link.relationship?.substring(0, 25) || '...',
                        labelStyle: { fontSize: 10, fill: strokeColor, cursor: 'pointer' },
                        labelBgStyle: { fill: 'white', fillOpacity: 0.9, cursor: 'pointer' },
                        data: { link }, // Stocker le lien complet dans data
                    });

                    // Mettre à jour le statut des nœuds et ajouter des alertes
                    if (isDanger) {
                        nodeUpdates[sourceNode.id] = { status: 'danger' };
                        nodeUpdates[targetNode.id] = { status: 'danger' };

                        newAlerts.push({
                            title: `🔴 DANGER: ${link.from} → ${link.to}`,
                            type: 'danger',
                            description: link.evidence || link.relationship || 'Interaction dangereuse détectée',
                            links: [link],
                        });
                    } else if (isWarning) {
                        if (nodeUpdates[sourceNode.id]?.status !== 'danger') {
                            nodeUpdates[sourceNode.id] = { status: 'warning' };
                        }
                        if (nodeUpdates[targetNode.id]?.status !== 'danger') {
                            nodeUpdates[targetNode.id] = { status: 'warning' };
                        }

                        newAlerts.push({
                            title: `🟠 Risque: ${link.from} → ${link.to}`,
                            type: 'warning',
                            description: link.evidence || link.relationship || "Risque d'interaction détecté",
                            links: [link],
                        });
                    } else if (strokeColor === linkColors.green) {
                        if (!nodeUpdates[sourceNode.id]) {
                            nodeUpdates[sourceNode.id] = { status: 'success' };
                        }
                        if (!nodeUpdates[targetNode.id]) {
                            nodeUpdates[targetNode.id] = { status: 'success' };
                        }
                    }
                }
            });

            // Mettre à jour les edges et la map des liens
            // IMPORTANT: On conserve les liens structurels (intra-groupe) qui ne sont pas des liens de causalité
            setEdges(prevEdges => {
                const structuralEdges = prevEdges.filter(e => e.data?.isStructural);
                return [...structuralEdges, ...newEdges];
            });
            setEdgeLinkMap(newEdgeLinkMap);

            // Mettre à jour les styles des nœuds
            setNodes(nds => nds.map(node => {
                const update = nodeUpdates[node.id];
                if (update) {
                    let borderColor = node.style?.borderColor || '#9ca3af';
                    let bgColor = node.style?.background || '#f3f4f6';

                    if (update.status === 'danger') {
                        borderColor = linkColors.red;
                        bgColor = '#fef2f2';
                    } else if (update.status === 'warning') {
                        borderColor = linkColors.orange;
                        bgColor = '#fff7ed';
                    } else if (update.status === 'success') {
                        borderColor = linkColors.green;
                        bgColor = '#f0fdf4';
                    }

                    return {
                        ...node,
                        style: {
                            ...node.style,
                            border: `3px solid ${borderColor}`,
                            background: bgColor,
                            boxShadow: update.status === 'danger'
                                ? '0 0 15px rgba(239, 68, 68, 0.5)'
                                : update.status === 'success'
                                    ? '0 0 10px rgba(34, 197, 94, 0.3)'
                                    : 'none',
                        },
                    };
                }
                return node;
            }));

            // Afficher les alertes
            setAlerts(newAlerts);
            if (newAlerts.length > 0) {
                setCurrentAlert(newAlerts[0]);
                setShowAlertDialog(true);
            }

            // Afficher les liens progressivement
            const allLinks = causalLinks as CausalLink[];
            for (let i = 0; i < allLinks.length; i++) {
                await new Promise(resolve => setTimeout(resolve, 150));
                setDisplayedLinks(prev => [...prev, allLinks[i]]);
            }

        } catch (error) {
            console.error('[RiskNetworkGraph] Erreur d\'analyse:', error);
        } finally {
            setIsAnalyzing(false);
            setIsLoadingLinks(false);
        }
    }, [nodes, setNodes, setEdges, hiddenNodes, onAnalysisResultChange, normalizeForComparison]);

    // Analyser les connexions entre groupes
    const analyzeGroupConnections = useCallback(async () => {
        if (groups.length < 2) {
            // Fallback to normal analysis if less than 2 groups
            analyzeConnections();
            return;
        }

        // Collecter tous les IDs de tous les groupes pour analyser leurs interactions
        const allPathologyIds: string[] = [];
        const allSymptomIds: string[] = [];
        const allTreatmentIds: string[] = [];
        const allMedicationIds: string[] = [];

        groups.forEach(group => {
            group.memberIds.forEach(memberId => {
                const node = nodes.find(n => n.id === memberId);
                if (!node) return;

                switch (node.data.type) {
                    case 'pathology':
                        if (!allPathologyIds.includes(memberId)) allPathologyIds.push(memberId);
                        break;
                    case 'symptom':
                        if (!allSymptomIds.includes(memberId)) allSymptomIds.push(memberId);
                        break;
                    case 'treatment':
                        if (!allTreatmentIds.includes(memberId)) allTreatmentIds.push(memberId);
                        break;
                    case 'medication':
                        if (!allMedicationIds.includes(memberId)) allMedicationIds.push(memberId);
                        break;
                }
            });
        });

        // Utiliser la même logique d'analyse mais restreinte aux éléments des groupes
        analyzeConnections({
            pathologyIds: allPathologyIds,
            symptomIds: allSymptomIds,
            treatmentIds: allTreatmentIds,
            medicationIds: allMedicationIds
        });
    }, [groups, nodes, analyzeConnections]);

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

    // Ajouter un nœud au graphique
    const addNode = useCallback((item: MedicalItem) => {
        // Vérifier si le nœud existe déjà
        if (nodes.find(n => n.id === item.id)) return;

        const colors = getItemColors(item);
        // Détection Danger / Toxicité
        const isToxic = ['methotrexate', 'chimio', 'chemo', 'opiac', 'opioid', 'immuno'].some(k =>
            item.name.toLowerCase().includes(k)
        );
        const isSevere = item.type === 'pathology' && (
            (item as Pathology).severity === 'high' ||
            (item as Pathology).severity === 'critical' ||
            ['cancer', 'tumeur', 'tumor', 'sida', 'hiv'].some(k => item.name.toLowerCase().includes(k))
        );

        // Style spécial pour Toxic / Severe
        const finalStyle = {
            background: isToxic ? '#ef4444' : colors.bg,
            border: isToxic ? '2px solid #b91c1c' : `2px solid ${colors.border}`,
            borderRadius: '8px',
            padding: '10px 15px',
            fontSize: '12px',
            fontWeight: 500,
            color: isToxic ? '#ffffff' : colors.text, // Texte blanc sur rouge
            minWidth: '120px',
            textAlign: 'center' as const,
        };

        // Label avec icône si sévère
        const labelText = isSevere ? `💀 ${item.name}` : item.name;

        const newNode: Node = {
            id: item.id,
            data: {
                label: labelText,
                type: item.type,
                severity: item.type === 'pathology' ? (item as Pathology).severity : undefined,
                isToxic,
                isSevere
            },
            position: {
                x: 250 + Math.random() * 300,
                y: 150 + Math.random() * 200
            },
            style: finalStyle,
        };

        setNodes(nds => [...nds, newNode]);

        // NE PAS lancer l'analyse automatiquement - l'utilisateur cliquera sur le bouton
        // if (nodes.length >= 1) {
        //     setTimeout(() => analyzeConnections(), 500);
        // }
    }, [nodes, setNodes, getItemColors]);

    // Supprimer un nœud
    const removeNode = useCallback((nodeId: string) => {
        setNodes(nds => nds.filter(n => n.id !== nodeId));
        setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
    }, [setNodes, setEdges]);

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
                data: { isGroupConnection: true }
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
            const center = { x: node.position.x + 75, y: node.position.y + 25 };
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

    const handleGroupAutoResize = useCallback((nds: Node[], changes: any[]) => {
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
    const onNodesChange = useCallback((changes: any[]) => {
        onNodesChangeOriginal(changes);
        setNodes(nds => handleGroupAutoResize(nds, changes));
    }, [onNodesChangeOriginal, handleGroupAutoResize, setNodes]);

    const onProposedNodesChange = useCallback((changes: any[]) => {
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
        if (selectedNodes.length < 2) return;

        // Récupérer les objets nœuds complets
        const nodesToGroup = nodes.filter(n => selectedNodes.includes(n.id) && !n.parentId);
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
                isGroup: true // Custom flag
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

        // --- NOUVEAU: Créer des liens structurels intra-groupe (Full Mesh) ---
        const structuralEdges: Edge[] = [];
        for (let i = 0; i < nodesToGroup.length; i++) {
            for (let j = i + 1; j < nodesToGroup.length; j++) {
                const source = nodesToGroup[i].id;
                const target = nodesToGroup[j].id;
                const edgeId = `structural-${source}-${target}`;

                // Vérifier si un lien existe déjà (même médical)
                const exists = edges.some(e =>
                    (e.source === source && e.target === target) ||
                    (e.source === target && e.target === source)
                );

                if (!exists) {
                    structuralEdges.push({
                        id: edgeId,
                        source,
                        target,
                        type: 'default', // Trait simple
                        style: { stroke: '#e2e8f0', strokeWidth: 1, strokeDasharray: '5,5' }, // Gris clair tireté
                        data: { isStructural: true },
                        animated: false,
                        selected: false,
                    });
                }
            }
        }
        setEdges(prev => [...prev, ...structuralEdges]);

    }, [selectedNodes, nodes, getNextGroupColor, edges, setEdges, setNodes]);

    // Ancien système (compatible pour l'instant) mais on privilégiera le nouveau
    const createGroupFromPathology = useCallback((pathologyId: string) => {
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
            data: { label: `Groupe ${pathologyNode.data.label}`, isGroup: true },
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


    // ========================================
    // AUTO-GROUPING BASED ON ANALYSIS RESULTS
    // ========================================

    // Types de source de symptôme
    type SymptomSource = 'pathology' | 'adverse' | 'both';

    // Couleurs pour les bordures de symptômes selon leur source
    const symptomSourceStyles = useMemo(() => ({
        pathology: { borderColor: '#3b82f6', borderStyle: 'solid' }, // Bleu - causé par pathologie
        adverse: { borderColor: '#f97316', borderStyle: 'dashed' }, // Orange tireté - effet secondaire
        both: { borderColor: '#8b5cf6', borderStyle: 'double' }, // Violet double - les deux
    }), []);

    // Fonction d'auto-génération de groupes basée sur l'analyse
    // Si pas de liens causaux disponibles, lance d'abord une analyse
    const autoGenerateGroups = useCallback(async () => {
        const causalLinks = analysisResult?.causalLinks || displayedLinks;

        // Si pas de liens, lancer une analyse d'abord
        if (!causalLinks || causalLinks.length === 0) {
            console.log('[AutoGroup] Aucun lien - lancement de l\'analyse automatique');
            await analyzeConnections();
            // Après l'analyse, récupérer les nouveaux liens
            // Note: on doit attendre que l'analyse soit terminée
            return; // Les liens seront disponibles via analysisResult après l'analyse
        }

        // Ne pas supprimer les groupes existants - les mettre à jour
        // Garder une map des groupes existants par pathologyId pour mise à jour
        const existingGroupsByPathology = new Map(
            groups.map(g => [g.pathologyId, g])
        );

        // Récupérer les pathologies présentes sur le canvas (visibles uniquement)
        const pathologyNodes = nodes.filter(n =>
            n.data.type === 'pathology' &&
            n.type !== 'group' &&
            !hiddenNodes.has(n.id)
        );
        if (pathologyNodes.length === 0) {
            console.log('[AutoGroup] Aucune pathologie visible sur le canvas');
            return;
        }

        console.log('[AutoGroup] Pathologies trouvées:', pathologyNodes.map(n => n.data.label));

        // Map pour suivre quels symptômes sont liés à quelles sources
        const symptomSources = new Map<string, SymptomSource>();
        // Map pour suivre les médicaments partagés entre pathologies
        const medicationToPathologies = new Map<string, string[]>();
        // Map de chaque pathologie vers ses nœuds liés
        const pathologyRelations = new Map<string, Set<string>>();

        // Initialiser les relations de pathologie
        pathologyNodes.forEach(pNode => {
            pathologyRelations.set(pNode.id, new Set([pNode.id]));
        });

        // Analyser les liens de causalité
        causalLinks.forEach(link => {
            // Normaliser les noms pour la comparaison
            const fromNorm = normalizeForComparison(link.from);
            const toNorm = normalizeForComparison(link.to);

            // Trouver les nœuds correspondants
            const fromNode = nodes.find(n =>
                normalizeForComparison(String(n.data.label)).includes(fromNorm) ||
                fromNorm.includes(normalizeForComparison(String(n.data.label)))
            );
            const toNode = nodes.find(n =>
                normalizeForComparison(String(n.data.label)).includes(toNorm) ||
                toNorm.includes(normalizeForComparison(String(n.data.label)))
            );

            if (!fromNode || !toNode) return;

            // 1. Médicament/Traitement → Pathologie (TRAITE)
            if ((link.fromType === 'medication' || link.fromType === 'treatment') &&
                link.toType === 'pathology' &&
                link.isAppropriate === true) {

                // Trouver la pathologie ciblée
                const pathologyNode = pathologyNodes.find(p =>
                    normalizeForComparison(String(p.data.label)).includes(toNorm) ||
                    toNorm.includes(normalizeForComparison(String(p.data.label)))
                );

                if (pathologyNode) {
                    pathologyRelations.get(pathologyNode.id)?.add(fromNode.id);

                    // Tracker les médicaments partagés
                    const existing = medicationToPathologies.get(fromNode.id) || [];
                    if (!existing.includes(pathologyNode.id)) {
                        existing.push(pathologyNode.id);
                        medicationToPathologies.set(fromNode.id, existing);
                    }

                    console.log(`[AutoGroup] ${fromNode.data.label} TRAITE ${pathologyNode.data.label}`);
                }
            }

            // 2. Pathologie → Symptôme (CAUSE)
            if (link.fromType === 'pathology' && link.toType === 'symptom' && link.symptomFrequency) {
                const pathologyNode = pathologyNodes.find(p =>
                    normalizeForComparison(String(p.data.label)).includes(fromNorm) ||
                    fromNorm.includes(normalizeForComparison(String(p.data.label)))
                );

                if (pathologyNode) {
                    pathologyRelations.get(pathologyNode.id)?.add(toNode.id);

                    // Marquer le symptôme comme causé par pathologie
                    const existing = symptomSources.get(toNode.id);
                    if (existing === 'adverse') {
                        symptomSources.set(toNode.id, 'both');
                    } else if (!existing) {
                        symptomSources.set(toNode.id, 'pathology');
                    }

                    console.log(`[AutoGroup] ${pathologyNode.data.label} CAUSE ${toNode.data.label} (${link.symptomFrequency})`);
                }
            }

            // 3. Médicament → Symptôme (EFFET SECONDAIRE)
            if ((link.fromType === 'medication' || link.fromType === 'treatment') &&
                link.toType === 'symptom' &&
                link.effectType === 'adverse') {

                // Marquer le symptôme comme effet secondaire
                const existing = symptomSources.get(toNode.id);
                if (existing === 'pathology') {
                    symptomSources.set(toNode.id, 'both');
                } else if (!existing) {
                    symptomSources.set(toNode.id, 'adverse');
                }

                // Trouver les pathologies liées à ce médicament
                const medPathologies = medicationToPathologies.get(fromNode.id) || [];
                medPathologies.forEach(pathId => {
                    pathologyRelations.get(pathId)?.add(toNode.id);
                });

                console.log(`[AutoGroup] ${fromNode.data.label} CAUSE (effet secondaire) ${toNode.data.label}`);
            }
        });

        // Appliquer les styles visuels aux symptômes selon leur source
        setNodes(nds => nds.map(n => {
            const source = symptomSources.get(n.id);
            if (source && n.data.type === 'symptom') {
                const style = symptomSourceStyles[source];
                return {
                    ...n,
                    data: { ...n.data, symptomSource: source },
                    style: {
                        ...n.style,
                        border: `3px ${style.borderStyle} ${style.borderColor}`,
                        boxShadow: source === 'adverse' ? '0 0 10px rgba(249, 115, 22, 0.4)' :
                            source === 'both' ? '0 0 10px rgba(139, 92, 246, 0.4)' :
                                '0 0 10px rgba(59, 130, 246, 0.3)',
                    },
                };
            }
            return n;
        }));

        // === PHASE 1: Collecter les données de tous les groupes ===
        interface GroupLayout {
            pathologyId: string;
            pathologyName: string;
            memberIdsArray: string[];
            nodesToGroup: Node[];
            width: number;
            height: number;
            gridPositions: Map<string, { x: number; y: number }>;
            existingGroupId?: string;
        }

        const groupLayouts: GroupLayout[] = [];
        const nodeWidth = 160;
        const nodeHeight = 60;
        const gapX = 20;
        const gapY = 20;
        const padding = 40;

        pathologyRelations.forEach((memberIds, pathologyId) => {
            if (memberIds.size < 2) return;

            const pathologyNode = pathologyNodes.find(p => p.id === pathologyId);
            if (!pathologyNode) return;

            const memberIdsArray = Array.from(memberIds).filter(id => !hiddenNodes.has(id));
            const existingGroup = existingGroupsByPathology.get(pathologyId);

            const nodesToGroup = nodes.filter(n =>
                memberIdsArray.includes(n.id) &&
                (!n.parentId || n.parentId === existingGroup?.id)
            );

            if (nodesToGroup.length < 2) return;

            // Calculer les dimensions en grille
            const cols = Math.ceil(Math.sqrt(nodesToGroup.length));
            const rows = Math.ceil(nodesToGroup.length / cols);
            const width = cols * (nodeWidth + gapX) - gapX + padding * 2;
            const height = rows * (nodeHeight + gapY) - gapY + padding * 2;

            // Calculer les positions en grille pour chaque nœud
            const gridPositions: Map<string, { x: number; y: number }> = new Map();
            nodesToGroup.forEach((node, index) => {
                const col = index % cols;
                const row = Math.floor(index / cols);
                gridPositions.set(node.id, {
                    x: padding + col * (nodeWidth + gapX),
                    y: padding + row * (nodeHeight + gapY),
                });
            });

            groupLayouts.push({
                pathologyId,
                pathologyName: String(pathologyNode.data.label),
                memberIdsArray,
                nodesToGroup,
                width,
                height,
                gridPositions,
                existingGroupId: existingGroup?.id,
            });
        });

        // === PHASE 2: Positionner les groupes sans chevauchement ===
        const groupGap = 50; // Espace entre les groupes
        let currentX = 50;
        let currentY = 50;
        let rowMaxHeight = 0;
        const maxCanvasWidth = 1200; // Largeur max avant wrap

        const groupPositions: Map<string, { x: number; y: number }> = new Map();

        groupLayouts.forEach((layout, idx) => {
            // Si le groupe dépasse la largeur max, passer à la ligne suivante
            if (currentX + layout.width > maxCanvasWidth && idx > 0) {
                currentX = 50;
                currentY += rowMaxHeight + groupGap;
                rowMaxHeight = 0;
            }

            groupPositions.set(layout.pathologyId, { x: currentX, y: currentY });

            // Avancer horizontalement
            currentX += layout.width + groupGap;
            rowMaxHeight = Math.max(rowMaxHeight, layout.height);
        });

        // === PHASE 3: Créer/mettre à jour les groupes et positionner les nœuds ===
        const newGroups: PathologyGroup[] = [];
        const updatedGroupIds: string[] = [];

        groupLayouts.forEach((layout, idx) => {
            const groupPos = groupPositions.get(layout.pathologyId)!;
            const color = groupColors[idx % groupColors.length];
            const groupId = layout.existingGroupId || `auto-group-${layout.pathologyId}-${Date.now()}`;

            if (layout.existingGroupId) {
                // Mettre à jour groupe existant
                updatedGroupIds.push(layout.existingGroupId);
                const existingGroup = existingGroupsByPathology.get(layout.pathologyId);
                if (existingGroup) {
                    existingGroup.memberIds = layout.memberIdsArray;
                    newGroups.push(existingGroup);
                }

                setNodes(nds => nds.map(n => {
                    if (n.id === layout.existingGroupId) {
                        return {
                            ...n,
                            position: groupPos,
                            style: { ...n.style, width: layout.width, height: layout.height },
                        };
                    }
                    const gridPos = layout.gridPositions.get(n.id);
                    if (gridPos && n.parentId === layout.existingGroupId) {
                        return { ...n, position: gridPos };
                    }
                    return n;
                }));
            } else {
                // Créer nouveau groupe
                const groupNode: Node = {
                    id: groupId,
                    type: 'default',
                    position: groupPos,
                    style: {
                        width: layout.width,
                        height: layout.height,
                        backgroundColor: `${color}15`,
                        border: `2px dashed ${color}`,
                        borderRadius: '16px',
                        zIndex: -1,
                        pointerEvents: 'all',
                    },
                    data: {
                        label: `📋 ${layout.pathologyName}`,
                        isGroup: true,
                        type: 'group',
                        pathologyId: layout.pathologyId,
                    },
                    draggable: true,
                };

                newGroups.push({
                    id: groupId,
                    name: `Groupe ${layout.pathologyName}`,
                    pathologyId: layout.pathologyId,
                    pathologyName: layout.pathologyName,
                    memberIds: layout.memberIdsArray,
                    color,
                });

                setNodes(nds => {
                    const newNodes = [groupNode, ...nds];
                    return newNodes.map(n => {
                        if (layout.memberIdsArray.includes(n.id) && !n.parentId && n.id !== groupId) {
                            const gridPos = layout.gridPositions.get(n.id);
                            return {
                                ...n,
                                parentId: groupId,
                                position: gridPos || { x: padding, y: padding },
                            };
                        }
                        return n;
                    });
                });
            }
        });

        // Fusionner: garder les groupes existants qui ne sont pas mis à jour + les nouveaux
        const finalGroups = [
            ...groups.filter(g => updatedGroupIds.includes(g.id) === false &&
                !newGroups.some(ng => ng.pathologyId === g.pathologyId)),
            ...newGroups,
        ];
        setGroups(finalGroups);

        // Gérer les médicaments partagés - ajouter des indicateurs visuels
        medicationToPathologies.forEach((pathologyIds, medId) => {
            if (pathologyIds.length > 1) {
                // Ce médicament traite plusieurs pathologies
                setNodes(nds => nds.map(n => {
                    if (n.id === medId) {
                        return {
                            ...n,
                            data: {
                                ...n.data,
                                isShared: true,
                                sharedPathologies: pathologyIds.length,
                            },
                            style: {
                                ...n.style,
                                boxShadow: '0 0 15px rgba(16, 185, 129, 0.6)',
                                border: '3px solid #10b981',
                            },
                        };
                    }
                    return n;
                }));
                console.log(`[AutoGroup] ${nodes.find(n => n.id === medId)?.data.label} est partagé entre ${pathologyIds.length} pathologies`);
            }
        });

        console.log(`[AutoGroup] ${newGroups.length} groupes créés automatiquement`);

    }, [analysisResult, displayedLinks, nodes, groups, hiddenNodes, normalizeForComparison, groupColors, setNodes, setGroups, analyzeConnections, symptomSourceStyles]);




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
    const getLinkDisplayColor = (link: CausalLink) => {
        if (link.dangerLevel === 'critical' || link.dangerLevel === 'high') return 'border-red-500 bg-red-50 dark:bg-red-900/20';
        if (link.dangerLevel === 'moderate' || link.isAppropriate === false) return 'border-orange-500 bg-orange-50 dark:bg-orange-900/20';
        if (link.dangerLevel === 'low' || link.symptomFrequency === 'possible' || link.symptomFrequency === 'rare') return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
        if (link.isAppropriate === true || link.symptomFrequency === 'principal' || link.symptomFrequency === 'frequent') return 'border-green-500 bg-green-50 dark:bg-green-900/20';
        return 'border-blue-500 bg-blue-50 dark:bg-blue-900/20';
    };

    return (
        <div className="flex flex-col gap-4">
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
                                                disabled={nodes.some(n => n.id === item.id)}
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
                                <p className="text-xs font-medium mb-2">Éléments ajoutés ({nodes.length})</p>
                                <div className="space-y-1 max-h-[150px] overflow-y-auto">
                                    {nodes.map(node => {
                                        // Ne pas afficher les nœuds de groupe dans cette liste
                                        if (node.type === 'group') return null;

                                        return (
                                            <div
                                                key={node.id}
                                                className={`flex items-center justify-between text-xs transition-opacity ${hiddenNodes.has(node.id) ? 'opacity-40' : ''}`}
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
                                                        title={hiddenNodes.has(node.id) ? "Montrer" : "Cacher"}
                                                    >
                                                        {hiddenNodes.has(node.id) ? (
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
                                disabled={nodes.length < 2 || isAnalyzing}
                            >
                                {isAnalyzing ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Analyse...
                                    </>
                                ) : (
                                    <>
                                        <Network className="h-4 w-4 mr-2" />
                                        {groups.length >= 2 ? 'Analyser inter-groupes' : 'Analyser les connexions'}
                                    </>
                                )}
                            </Button>

                            {/* Score en temps réel */}
                            {displayedLinks.length > 0 && (
                                <div className="mt-3 p-2 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-lg border">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-medium">Score actuel</span>
                                        <Badge className={`${liveScore >= 70 ? 'bg-green-500' : liveScore >= 40 ? 'bg-orange-500' : 'bg-red-500'}`}>
                                            {liveScore}/100
                                        </Badge>
                                    </div>
                                    <div className="flex gap-1 text-[10px]">
                                        <Badge variant="outline" className="text-red-500 border-red-300">🔴 {liveStats.redLinks}</Badge>
                                        <Badge variant="outline" className="text-orange-500 border-orange-300">🟠 {liveStats.orangeLinks}</Badge>
                                        <Badge variant="outline" className="text-green-500 border-green-300">🟢 {liveStats.greenLinks}</Badge>
                                    </div>
                                    <div className="text-[10px] text-gray-500 mt-1">
                                        B/R: {liveBenefitRiskRatio.toFixed(1)}
                                    </div>

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
                                            onClick={groupSelectedNodes}
                                            disabled={selectedNodes.length < 2}
                                            title="Grouper les nœuds sélectionnés"
                                        >
                                            <BoxSelect className="h-3 w-3 mr-1" />
                                            Manuel
                                        </Button>
                                        <Button
                                            variant="default"
                                            size="sm"
                                            className="h-6 text-xs bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                                            onClick={autoGenerateGroups}
                                            disabled={displayedLinks.length === 0 && !analysisResult}
                                            title="Créer automatiquement les groupes basés sur l'analyse"
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
                                        <Badge variant="outline" className="ml-2">{liveScore}/100</Badge>
                                    </div>
                                    <ReactFlow
                                        nodes={nodes.filter(n => !hiddenNodes.has(n.id))}
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
                                            {analysisResult?.schemaComparison?.proposedScore || '--'}/100
                                        </Badge>
                                    </div>
                                    <ReactFlow
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
                                nodes={nodes}
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

                                {/* Légende */}
                                <Panel position="top-right" className="bg-white/90 dark:bg-gray-900/90 p-3 rounded-lg shadow-lg">
                                    <div className="text-xs space-y-2">
                                        <p className="font-semibold mb-2">Types d'éléments</p>
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded" style={{ background: '#fef2f2', border: '2px solid #ef4444' }} />
                                            <span>Pathologie (sévère)</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded" style={{ background: '#dcfce7', border: '2px solid #22c55e' }} />
                                            <span>Pathologie (légère)</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded" style={{ background: '#dbeafe', border: '2px solid #3b82f6' }} />
                                            <span>Symptôme</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded" style={{ background: '#ffedd5', border: '2px solid #f97316' }} />
                                            <span>Médicament/Traitement</span>
                                        </div>

                                        <div className="border-t pt-2 mt-2">
                                            <p className="font-semibold mb-2">Types de liens</p>
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-1 rounded" style={{ background: linkColors.green }} />
                                                <span>Adapté / Normal</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-1 rounded" style={{ background: linkColors.yellow }} />
                                                <span>Effet bénin</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-1 rounded" style={{ background: linkColors.orange }} />
                                                <span>Risque d'interaction</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 h-1 rounded" style={{ background: linkColors.red }} />
                                                <span>⚠️ Danger</span>
                                            </div>
                                        </div>

                                        {/* Source des symptômes */}
                                        <div className="border-t pt-2 mt-2">
                                            <p className="font-semibold mb-2">Source symptôme</p>
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded" style={{ border: '3px solid #3b82f6', background: '#dbeafe' }} />
                                                <span>Causé par pathologie</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded" style={{ border: '3px dashed #f97316', background: '#ffedd5' }} />
                                                <span>Effet secondaire</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded" style={{ border: '3px double #8b5cf6', background: '#f3e8ff' }} />
                                                <span>Les deux</span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <div className="w-3 h-3 rounded" style={{ border: '3px solid #10b981', boxShadow: '0 0 5px rgba(16, 185, 129, 0.6)' }} />
                                                <span>Partagé (multi-patho)</span>
                                            </div>
                                        </div>
                                    </div>
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
                            Liens de causalité
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
                                                    {link.isAppropriate !== undefined && (
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
                                                        {link.isAppropriate !== undefined && (
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
                                                        {link.probability && (
                                                            <Badge variant="outline" className="text-xs">
                                                                {link.probability === 'high' ? 'Forte' :
                                                                    link.probability === 'medium' ? 'Moyenne' : 'Faible'}
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
                                {nodes.length - hiddenNodes.size} nœuds actifs
                            </Badge>
                            <Badge className={`ml-1 ${liveScore >= 70 ? 'bg-green-500' : liveScore >= 40 ? 'bg-orange-500' : 'bg-red-500'}`}>
                                Score: {liveScore}/100
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-4">
                        {/* Stats en temps réel */}
                        <div className="p-3 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-lg border">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium">État actuel des liens</span>
                                <span className="text-xs text-gray-500">B/R: {liveBenefitRiskRatio.toFixed(2)}</span>
                            </div>
                            <div className="flex gap-2 mt-2">
                                <Badge variant="outline" className="text-red-500 border-red-300">
                                    🔴 Dangers: {liveStats.redLinks}
                                </Badge>
                                <Badge variant="outline" className="text-orange-500 border-orange-300">
                                    🟠 Risques: {liveStats.orangeLinks}
                                </Badge>
                                <Badge variant="outline" className="text-green-500 border-green-300">
                                    🟢 Adaptés: {liveStats.greenLinks}
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

            {/* Panneau de Comparaison de Schéma - Affiche avec schemaComparison OU proposedNodes */}
            {(analysisResult?.schemaComparison || proposedNodes.length > 0) && (
                <Card className="mt-4 border-l-4 border-l-cyan-500">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Activity className="h-4 w-4 text-cyan-500" />
                            Comparaison Schéma Actuel vs Proposé
                            <Badge
                                variant="secondary"
                                className={`ml-2 ${(analysisResult?.schemaComparison?.improvementPercent || 0) > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}
                            >
                                {(analysisResult?.schemaComparison?.improvementPercent || 0) > 0 ? '+' : ''}{analysisResult?.schemaComparison?.improvementPercent || '--'}% amélioration
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-4">
                        {/* Scores comparatifs */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* Score Actuel */}
                            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                                <p className="text-xs font-medium text-gray-500 mb-1">Schéma Actuel</p>
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                                        {analysisResult?.schemaComparison?.currentScore ?? liveScore}
                                    </span>
                                    <span className="text-xs text-gray-500">/100</span>
                                </div>
                                <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gray-500 transition-all duration-500"
                                        style={{ width: `${analysisResult?.schemaComparison?.currentScore ?? liveScore}%` }}
                                    />
                                </div>
                            </div>

                            {/* Score Proposé */}
                            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                                <p className="text-xs font-medium text-green-600 mb-1">Schéma Proposé</p>
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl font-bold text-green-700 dark:text-green-400">
                                        {analysisResult?.schemaComparison?.proposedScore ?? Math.min(100, liveScore + 20)}
                                    </span>
                                    <span className="text-xs text-green-500">/100</span>
                                </div>
                                <div className="mt-2 h-2 bg-green-200 dark:bg-green-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-green-500 transition-all duration-500"
                                        style={{ width: `${analysisResult?.schemaComparison?.proposedScore ?? Math.min(100, liveScore + 20)}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Comparaison des liens */}
                        <div className="p-3 bg-white dark:bg-gray-900 rounded-lg border">
                            <p className="text-xs font-medium mb-3">Évolution des liens</p>
                            <div className="space-y-2">
                                {/* Rouge → Moins */}
                                <div className="flex items-center gap-2">
                                    <span className="text-xs w-20">🔴 Dangers</span>
                                    <div className="flex-1 flex items-center gap-2">
                                        <Badge variant="destructive" className="text-xs">{analysisResult?.schemaComparison?.currentStats?.redLinks ?? liveStats.redLinks}</Badge>
                                        <ArrowRight className="h-3 w-3 text-gray-400" />
                                        <Badge className="text-xs bg-green-500">{analysisResult?.schemaComparison?.proposedStats?.redLinks ?? 0}</Badge>
                                        <span className="text-xs text-green-600">
                                            (-{(analysisResult?.schemaComparison?.currentStats?.redLinks ?? liveStats.redLinks) - (analysisResult?.schemaComparison?.proposedStats?.redLinks ?? 0)})
                                        </span>
                                    </div>
                                </div>
                                {/* Orange → Moins */}
                                <div className="flex items-center gap-2">
                                    <span className="text-xs w-20">🟠 Risques</span>
                                    <div className="flex-1 flex items-center gap-2">
                                        <Badge className="text-xs bg-orange-500">{analysisResult?.schemaComparison?.currentStats?.orangeLinks ?? liveStats.orangeLinks}</Badge>
                                        <ArrowRight className="h-3 w-3 text-gray-400" />
                                        <Badge className="text-xs bg-yellow-500">{analysisResult?.schemaComparison?.proposedStats?.orangeLinks ?? 0}</Badge>
                                    </div>
                                </div>
                                {/* Vert → Plus */}
                                <div className="flex items-center gap-2">
                                    <span className="text-xs w-20">🟢 Adaptés</span>
                                    <div className="flex-1 flex items-center gap-2">
                                        <Badge className="text-xs bg-green-500">{analysisResult?.schemaComparison?.currentStats?.greenLinks ?? liveStats.greenLinks}</Badge>
                                        <ArrowRight className="h-3 w-3 text-gray-400" />
                                        <Badge className="text-xs bg-green-600">{analysisResult?.schemaComparison?.proposedStats?.greenLinks ?? (liveStats.greenLinks + liveStats.redLinks)}</Badge>
                                        <span className="text-xs text-green-600">
                                            (+{(analysisResult?.schemaComparison?.proposedStats?.greenLinks ?? (liveStats.greenLinks + liveStats.redLinks)) - (analysisResult?.schemaComparison?.currentStats?.greenLinks ?? liveStats.greenLinks)})
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Ratio Bénéfice/Risque */}
                        <div className="p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
                            <p className="text-xs font-medium text-cyan-700 dark:text-cyan-300 mb-2">
                                📊 Ratio Bénéfice/Risque
                            </p>
                            <div className="flex items-center gap-4">
                                <div className="text-center">
                                    <span className="text-lg font-bold text-gray-600">{(analysisResult?.schemaComparison?.benefitRiskRatio?.current ?? liveBenefitRiskRatio).toFixed(1)}</span>
                                    <p className="text-[10px] text-gray-500">Actuel</p>
                                </div>
                                <ArrowRight className="h-5 w-5 text-cyan-500" />
                                <div className="text-center">
                                    <span className="text-lg font-bold text-green-600">{(analysisResult?.schemaComparison?.benefitRiskRatio?.proposed ?? (liveBenefitRiskRatio * 2)).toFixed(1)}</span>
                                    <p className="text-[10px] text-green-500">Proposé</p>
                                </div>
                                <Badge className="ml-auto bg-green-100 text-green-700 border-green-300">
                                    ×{((analysisResult?.schemaComparison?.benefitRiskRatio?.proposed ?? (liveBenefitRiskRatio * 2)) / ((analysisResult?.schemaComparison?.benefitRiskRatio?.current ?? liveBenefitRiskRatio) || 1)).toFixed(1)} meilleur
                                </Badge>
                            </div>
                        </div>

                        {/* Modifications proposées */}
                        {(analysisResult?.schemaComparison?.proposedChanges?.length || 0) > 0 && (
                            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                                <p className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-2">
                                    🔄 Modifications proposées ({analysisResult?.schemaComparison?.proposedChanges?.length || 0})
                                </p>
                                <div className="space-y-2">
                                    {analysisResult?.schemaComparison?.proposedChanges?.map((change, idx) => (
                                        <div key={idx} className="p-2 bg-white dark:bg-gray-800 rounded border flex items-center justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Badge
                                                        variant="outline"
                                                        className={`text-[10px] ${change.action === 'replace' ? 'bg-blue-50 text-blue-700' :
                                                            change.action === 'remove' ? 'bg-red-50 text-red-700' :
                                                                'bg-green-50 text-green-700'
                                                            }`}
                                                    >
                                                        {change.action === 'replace' ? '↔️ Remplacer' :
                                                            change.action === 'remove' ? '❌ Retirer' : '➕ Ajouter'}
                                                    </Badge>
                                                    <span className="text-xs font-medium">{change.target}</span>
                                                    {change.replacement && (
                                                        <>
                                                            <ArrowRight className="h-3 w-3" />
                                                            <span className="text-xs font-medium text-green-600">{change.replacement}</span>
                                                        </>
                                                    )}
                                                </div>
                                                <p className="text-[10px] text-gray-500">{change.reason}</p>
                                            </div>
                                            <Badge className="bg-green-100 text-green-700 text-[10px]">
                                                +{change.improvementScore}%
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Synthèse clinique */}
                        {analysisResult?.schemaComparison?.clinicalSummary && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                    📋 Synthèse des modifications
                                </p>
                                <p className="text-sm text-gray-700 dark:text-gray-300">
                                    {analysisResult.schemaComparison.clinicalSummary}
                                </p>
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
                                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
                                <p>Aucune alerte détectée</p>
                                <p className="text-sm">Les connexions semblent sûres</p>
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
                            Détails du lien de causalité
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
                                {hoveredLink.isAppropriate !== undefined && (
                                    <div className="p-3 rounded-lg border">
                                        <p className="text-xs text-muted-foreground mb-1">
                                            {hoveredLink.fromType === 'pathology' && hoveredLink.toType === 'symptom' ? 'Cohérence' : 'Adéquation'}
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
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default RiskNetworkGraph;
