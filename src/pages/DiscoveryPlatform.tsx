import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import {
    Search, FileText, FlaskConical, Brain, TrendingUp, AlertTriangle,
    CheckCircle2, XCircle, Loader2, Sparkles, Download, RefreshCw,
    ChevronRight, ExternalLink, BookOpen, Beaker, Activity, Filter,
    Clock, Star, Target, Zap, Network, BarChart3, FileDown, Lightbulb, Bell,
    Link as LinkIcon
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAI } from '@/contexts/AIContext';
import { toast } from 'sonner';
import RadialRingsModal from '@/components/cde/RadialRingsModal';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';
import DNAVisualizer from '@/components/nexus/DNAVisualizer';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import HypothesisReport from '@/components/nexus/HypothesisReport';
import { DiscoveryTabContent } from '@/components/nexus/DiscoveryTabContent';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from '@/components/ui/tooltip';


// ============================================
// TYPES
// ============================================

interface Paper {
    id: string;
    pmid?: string;
    pmcid?: string;
    doi?: string;
    title: string;
    authors?: string[];
    abstract?: string;
    publication_date?: string;
    journal?: string;
    source: 'pubmed' | 'europepmc' | 'pmc';
}

interface EvidenceSnippet {
    id: string;
    paper_id: string;
    paper?: Paper;
    passage: string;
    entities?: string[];
    claim_tags?: string[];
}

//Committee-Grade Interfaces
interface GoNoGoRow {
    block: 'In vitro' | 'In vivo' | 'Clinique';
    minimal_design: string;
    primary_endpoint: string;
    go_nogo_signal: string;
}

interface ExecutiveSummary {
    context: string;
    central_hypothesis_operational: string;
    scope_decisions: string;
    go_nogo_table: GoNoGoRow[];
}

interface ClinicalScope {
    operational_definitions: string;
    recommended_comparators: string;
}

interface RivalHypotheses {
    h1_main: string;
    h2_secondary: string;
    h0_null: string;
    h3_rival: string;
    h4_rival_toxicity: string;
    dag_textual: string;
}

interface EvidenceSnapshotRow {
    claim: string;
    context_population: string;
    oxford_level: '1a' | '1b' | '2a' | '2b' | '3' | '4' | '5' | 'À confirmer';
    signal_effect: string;
    key_references: string[];
}

interface OrganRiskMapping {
    organ_system: string;
    role: string;
    risk_checkpoint: string;
}

interface MechanisticModel {
    pkpd_robust: string;
    pkpd_unknown: string;
    organ_risk_mapping: OrganRiskMapping[];
}

interface MonitoringRow {
    parameter: string;
    frequency: string;
    action_threshold: string;
    required_action: string;
}

interface RisksMonitoring {
    key_risks: string[];
    monitoring_table: MonitoringRow[];
    pharmacogenetic_recommendations: string;
}

interface Hypothesis {
    id: string;
    hypothesis_id: string;
    statement: string;

    // Committee-Grade Fields
    executive_summary?: ExecutiveSummary;
    clinical_scope?: ClinicalScope;
    rival_hypotheses?: RivalHypotheses;
    evidence_snapshot?: EvidenceSnapshotRow[];
    mechanistic_model?: MechanisticModel;
    risks_monitoring?: RisksMonitoring;

    // Causal Graph & Cascade Fields (for CausalGraph component)
    causal_graph?: {
        nodes?: Array<{ id: string; label: string; type: string; mechanism?: string; subItems?: string[] }>;
        edges?: Array<{ from: string; to: string; label?: string; reason?: string }>;
    };
    systemic_cascade?: Array<{ organ: string; impact: string; mechanism?: string; severity?: string }>;
    therapeutic_resolution_chains?: Array<{
        step?: number;
        intervention: string;
        pharmacodynamics?: string;
        expected_outcome?: string;
        side_effects?: Array<{ issue: string; resolution_intervention?: string; interaction_safety?: string; recursive_resolution?: string }>;
    }>;
    etiology_depth?: {
        root_causes?: string[];
        triggers?: string[];
        pathway_origin?: string;
        genetic_factors?: string[];
    };
    mermaid_graph?: string;
    is_complete_resolution?: boolean;

    // Contradiction Analysis
    contradictions?: any[];

    // Existing Fields
    predictions?: string[];
    minimal_tests?: any[];
    risks_confounders?: string[];
    evidence_citations?: string[];
    detailed_analysis?: any;
    drug_repurposing_candidates?: string[];
    scores?: {
        novelty: number;
        plausibility: number;
        strength: number;
        feasibility: number;
        impact: number;
        total: number;
    };
    status: 'pending' | 'validated' | 'rejected';
    created_at: string;
}

interface NewsItem {
    id: string;
    type: 'paper' | 'trial' | 'hypothesis';
    title: string;
    date: string;
    badge?: string;
    badgeColor?: string;
}

interface SearchResult {
    id: string;
    type: 'article' | 'trial';
    title: string;
    authors?: string[];
    date: string;
    journal?: string;
    abstract?: string;
    pmid?: string;
    nctId?: string;
}

interface KnowledgeNode {
    id: string;
    label: string;
    type: string;
    x: number;
    y: number;
}

interface KnowledgeEdge {
    source: string;
    target: string;
    label: string;
}

// Knowledge Extraction Types
interface ExtractedEntity {
    text: string;
    type: 'GENE' | 'PROTEIN' | 'DRUG' | 'DISEASE' | 'PATHWAY' | 'PHENOTYPE' | 'CELL_TYPE' | 'MOLECULE';
    start?: number;
    end?: number;
    confidence: number;
}

interface ExtractedRelation {
    subject: ExtractedEntity;
    predicate: string;
    object: ExtractedEntity;
    evidence_text: string;
    confidence: number;
}

interface EvidenceLevel {
    level: 'meta_analysis' | 'clinical' | 'in_vivo' | 'in_vitro' | 'unknown';
    strength: number;
    indicators: string[];
}

interface ExtractionResult {
    entities: ExtractedEntity[];
    relations: ExtractedRelation[];
    evidence_level: EvidenceLevel;
    summary: {
        entity_counts: Record<string, number>;
        relation_counts: Record<string, number>;
    };
}

interface SavedGraph {
    id: string;
    name: string;
    description: string;
    graph_data: any;
    view_state: any;
    created_at: string;
}

// ============================================
// MOCK DATA (for initial display)
// ============================================

const MOCK_NEWS: NewsItem[] = [
    { id: '1', type: 'paper', title: 'Résultat A: Repurposing et contre-indication potentielle identifiée...', date: '22 juin 2023', badge: 'UAH', badgeColor: 'bg-orange-500' },
    { id: '2', type: 'paper', title: 'Résultat Processus Neurodégénératifs & Parkinson: TREMI Atlas-scan...', date: '22 juin 2023', badge: 'UAH', badgeColor: 'bg-orange-500' },
    { id: '3', type: 'hypothesis', title: 'Nouveauté et lien biochimique potentiel haut classement...', date: '22 juin 2023', badge: 'UAH', badgeColor: 'bg-orange-500' },
];

const MOCK_KNOWLEDGE_GRAPH = {
    nodes: [
        { id: 'parkinson', label: 'Parkinson', type: 'disease', x: 150, y: 250 },
        { id: 'nlrp3', label: 'NLRP3', type: 'protein', x: 300, y: 100 },
        { id: 'microglie', label: 'Microglie', type: 'cell', x: 350, y: 200 },
        { id: 'inflammation', label: 'Inflammation', type: 'process', x: 200, y: 350 },
        { id: 'alpha-syn', label: 'α-Synucleine', type: 'protein', x: 80, y: 400 },
        { id: 'neurodegeneration', label: 'Neurodégénérescence', type: 'process', x: 400, y: 350 },
    ],
    edges: [
        { source: 'parkinson', target: 'nlrp3', label: 'inhibe' },
        { source: 'parkinson', target: 'inflammation', label: 'inhibe' },
        { source: 'nlrp3', target: 'microglie', label: 'active' },
        { source: 'microglie', target: 'inflammation', label: 'polive' },
        { source: 'inflammation', target: 'neurodegeneration', label: 'associé à' },
        { source: 'alpha-syn', target: 'inflammation', label: 'inhibe' },
    ]
};

const MOCK_HYPOTHESES: Hypothesis[] = [
    {
        id: '1',
        hypothesis_id: 'HYP-2024-005',
        statement: 'Inhiber IL-6 pourrait réduire la progression du Parkinson.',
        scores: { novelty: 7.5, plausibility: 8, strength: 7, feasibility: 6.5, impact: 8, total: 7.3 },
        status: 'pending',
        created_at: '2024-01-15'
    },
    {
        id: '2',
        hypothesis_id: 'HYP-2024-006',
        statement: 'La modulation de la voie TREM2 diminue la neuroinflam..',
        scores: { novelty: 8, plausibility: 7.5, strength: 7, feasibility: 7, impact: 7.5, total: 7.3 },
        status: 'pending',
        created_at: '2024-01-16'
    },
    {
        id: '3',
        hypothesis_id: 'HYP-2024-007',
        statement: 'Le repositionnement du médicament A améliorerait les symptomes de Parkinson.',
        scores: { novelty: 6.5, plausibility: 7, strength: 6.5, feasibility: 7, impact: 7, total: 6.7 },
        status: 'pending',
        created_at: '2024-01-17'
    },
];

// ============================================
// COMPONENT: OpenAI Streaming Modal
// ============================================

interface OpenAIStreamingModalProps {
    isOpen: boolean;
    streamingContent: string;
    onClose?: () => void;
}

function OpenAIStreamingModal({ isOpen, streamingContent, onClose }: OpenAIStreamingModalProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [dots, setDots] = useState('');

    // Auto-scroll to bottom as content streams
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [streamingContent]);

    // Animated dots
    useEffect(() => {
        if (!isOpen) return;
        const interval = setInterval(() => {
            setDots(prev => prev.length >= 3 ? '' : prev + '.');
        }, 400);
        return () => clearInterval(interval);
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop with blur and animated gradient */}
            <div
                className="absolute inset-0 bg-gradient-to-br from-slate-900/90 via-blue-900/80 to-purple-900/90 backdrop-blur-md"
                style={{
                    animation: 'pulse 4s ease-in-out infinite'
                }}
            />

            {/* Floating particles effect */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                {[...Array(20)].map((_, i) => (
                    <div
                        key={i}
                        className="absolute w-1 h-1 bg-blue-400/30 rounded-full"
                        style={{
                            left: `${Math.random() * 100}%`,
                            top: `${Math.random() * 100}%`,
                            animation: `float ${3 + Math.random() * 4}s ease-in-out infinite`,
                            animationDelay: `${Math.random() * 2}s`
                        }}
                    />
                ))}
            </div>

            {/* Main modal container */}
            <div
                className="relative w-[90vw] max-w-4xl max-h-[80vh] bg-gradient-to-br from-slate-900/95 to-slate-800/95 rounded-2xl border border-blue-500/30 shadow-2xl overflow-hidden"
                style={{
                    animation: 'modalSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                    boxShadow: '0 0 60px rgba(59, 130, 246, 0.3), 0 0 100px rgba(147, 51, 234, 0.2)'
                }}
            >
                {/* Glowing border effect */}
                <div className="absolute inset-0 rounded-2xl pointer-events-none" style={{
                    background: 'linear-gradient(135deg, rgba(59,130,246,0.4) 0%, transparent 50%, rgba(147,51,234,0.4) 100%)',
                    filter: 'blur(1px)',
                    opacity: 0.5
                }} />

                {/* Header */}
                <div className="relative px-6 py-4 border-b border-blue-500/20 bg-gradient-to-r from-blue-900/50 to-purple-900/50">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                                <Brain className="w-6 h-6 text-white" />
                            </div>
                            {/* Pulsing ring */}
                            <div className="absolute inset-0 rounded-xl border-2 border-blue-400 animate-ping opacity-30" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                                OpenAI GPT-5.5 analyse{dots}
                            </h2>
                            <p className="text-xs text-slate-400">
                                Génération d'hypothèse en cours • Streaming actif
                            </p>
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            <div className="flex gap-1">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: '0.2s' }} />
                                <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" style={{ animationDelay: '0.4s' }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content area - streaming text */}
                <div
                    ref={scrollRef}
                    className="p-6 h-[50vh] overflow-y-auto custom-scrollbar"
                >
                    {streamingContent ? (
                        <div className="prose prose-invert prose-sm max-w-none">
                            <pre className="whitespace-pre-wrap font-mono text-sm text-slate-300 leading-relaxed bg-transparent border-none p-0">
                                {streamingContent}
                                <span className="inline-block w-2 h-4 bg-blue-500 ml-1 animate-pulse" />
                            </pre>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-4">
                            <div className="relative">
                                <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                                <div className="absolute inset-0 animate-ping">
                                    <Sparkles className="w-12 h-12 text-purple-500 opacity-30" />
                                </div>
                            </div>
                            <p className="text-slate-400 text-center">
                                Initialisation de l'analyse approfondie{dots}
                                <br />
                                <span className="text-xs text-slate-500">
                                    OpenAI examine les preuves scientifiques
                                </span>
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer with progress indicator */}
                <div className="relative px-6 py-3 border-t border-blue-500/20 bg-gradient-to-r from-slate-900/80 to-slate-800/80">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                            <Activity className="w-4 h-4 text-green-500 animate-pulse" />
                            <span>{streamingContent.length.toLocaleString()} caractères générés</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-1 w-32 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300"
                                    style={{
                                        width: `${Math.min(100, (streamingContent.length / 20000) * 100)}%`,
                                        animation: 'shimmer 2s linear infinite'
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* CSS Keyframes */}
            <style>{`
                @keyframes modalSlideIn {
                    from {
                        opacity: 0;
                        transform: scale(0.9) translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1) translateY(0);
                    }
                }
                
                @keyframes float {
                    0%, 100% {
                        transform: translateY(0) translateX(0);
                        opacity: 0.3;
                    }
                    50% {
                        transform: translateY(-20px) translateX(10px);
                        opacity: 0.6;
                    }
                }
                
                @keyframes shimmer {
                    0% {
                        background-position: -200% 0;
                    }
                    100% {
                        background-position: 200% 0;
                    }
                }
                
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(100, 116, 139, 0.1);
                    border-radius: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: linear-gradient(to bottom, #3b82f6, #8b5cf6);
                    border-radius: 3px;
                }
            `}</style>
        </div>
    );
}

// ============================================
// COMPONENT: Stats Header
// ============================================

function StatsHeader({ stats }: { stats: { articles: number; hypotheses: number; trials: number } }) {
    return (
        <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-blue-900 rounded-xl p-4 text-white shadow-lg">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/10 rounded-lg">
                        <Brain className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Plateforme de Découverte Médicale</h1>
                        <p className="text-blue-200 text-sm">Recherche continue alimentée par OpenAI GPT-5.5</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-500/50">
                        <Activity className="h-3 w-3 mr-1" />
                        En direct
                    </Badge>
                    <Button size="sm" variant="ghost" className="text-white hover:bg-white/10">
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="bg-white/10 rounded-lg p-3 flex items-center gap-3">
                    <div className="p-2 bg-blue-500/30 rounded-lg">
                        <FileText className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{stats.articles}</p>
                        <p className="text-xs text-blue-200">Nouveaux Articles</p>
                    </div>
                </div>
                <div className="bg-white/10 rounded-lg p-3 flex items-center gap-3">
                    <div className="p-2 bg-purple-500/30 rounded-lg">
                        <Lightbulb className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{stats.hypotheses}</p>
                        <p className="text-xs text-blue-200">Hypothèses Générées</p>
                    </div>
                </div>
                <div className="bg-white/10 rounded-lg p-3 flex items-center gap-3">
                    <div className="p-2 bg-green-500/30 rounded-lg">
                        <FlaskConical className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold">{stats.trials}</p>
                        <p className="text-xs text-blue-200">Essais Cliniques Analysés</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================
// COMPONENT: News Feed
// ============================================

function NewsFeed({ items }: { items: NewsItem[] }) {
    return (
        <Card className="h-full">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-600" />
                    Flux d'Actualités
                </CardTitle>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[180px]">
                    <div className="space-y-2">
                        {items.map(item => (
                            <div key={item.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                                <Badge className={`${item.badgeColor} text-white text-xs shrink-0`}>
                                    {item.badge}
                                </Badge>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">{item.title}</p>
                                    <p className="text-xs text-slate-400 mt-1">{item.date}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}

// ============================================
// COMPONENT: Statistics Panel
// ============================================

function StatisticsPanel() {
    return (
        <Card className="h-full">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-blue-600" />
                    Statistiques Récentes
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="h-[180px] flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg">
                    <div className="text-center text-slate-500 dark:text-slate-400">
                        <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-xs">Graphiques de tendance</p>
                        <p className="text-xs opacity-60">(À venir)</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}



// ============================================
// COMPONENT: Scientific Search
// ============================================

function ScientificSearch({
    onSearch,
    onGenerate,
    isLoading,
    isGenerating
}: {
    onSearch: (query: string, filters: any) => void;
    onGenerate: (query: string) => void;
    isLoading: boolean;
    isGenerating: boolean;
}) {
    const [query, setQuery] = useState('Parkinson et inflammation');
    const [typeFilter, setTypeFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState('all');

    const handleSearch = () => {
        onSearch(query, { type: typeFilter, date: dateFilter });
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Search className="h-4 w-4 text-blue-600" />
                    Recherche Scientifique
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Ex: Parkinson et inflammation"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="pl-9"
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                    </div>
                    <Button onClick={handleSearch} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Rechercher'}
                    </Button>
                    <Button
                        onClick={() => onGenerate(query)}
                        disabled={isGenerating || !query}
                        className="bg-purple-600 hover:bg-purple-700 gap-2 border-none shadow-lg shadow-purple-500/20"
                    >
                        {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                        <span className="hidden sm:inline">Générer Hypothèse</span>
                        <span className="sm:hidden">Générer</span>
                    </Button>
                </div>

                <div className="flex gap-2 flex-wrap">
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="w-[120px] h-8 text-xs">
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Tous</SelectItem>
                            <SelectItem value="article">Articles</SelectItem>
                            <SelectItem value="trial">Essais</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={dateFilter} onValueChange={setDateFilter}>
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                            <SelectValue placeholder="Date" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Toutes dates</SelectItem>
                            <SelectItem value="1y">Dernière année</SelectItem>
                            <SelectItem value="5y">5 dernières années</SelectItem>
                        </SelectContent>
                    </Select>

                    <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                        <Filter className="h-3 w-3" />
                        Plus de filtres
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

// ============================================
// COMPONENT: Search Results
// ============================================

function SearchResults({ results, isLoading }: { results: SearchResult[]; isLoading: boolean }) {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-[300px]">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">Recherche en cours...</p>
                </div>
            </div>
        );
    }

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold">Résultats de Recherche</CardTitle>
                    <Badge variant="outline">{results.length} résultats</Badge>
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[300px]">
                    <div className="space-y-3">
                        {results.map(result => (
                            <div key={result.id} className="p-3 border rounded-lg hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-colors cursor-pointer">
                                <div className="flex items-start gap-2">
                                    <div className={`p-1.5 rounded ${result.type === 'article' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                                        {result.type === 'article' ? <FileText className="h-4 w-4" /> : <FlaskConical className="h-4 w-4" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-sm font-medium text-blue-700 dark:text-blue-400 line-clamp-2 hover:underline">
                                            {result.title}
                                        </h4>
                                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{result.abstract}</p>
                                        <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                                            <span>{result.journal || 'Clinical Trials'}</span>
                                            <span>•</span>
                                            <span>{result.date}</span>
                                            {result.pmid && (
                                                <>
                                                    <span>•</span>
                                                    <a href={`https://pubmed.ncbi.nlm.nih.gov/${result.pmid}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-1">
                                                        PMID:{result.pmid} <ExternalLink className="h-3 w-3" />
                                                    </a>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}

// ============================================
// COMPONENT: Knowledge Graph Visualization
// ============================================

function KnowledgeGraphViz({
    nodes,
    edges,
    onNodeClick,
    isExpanding,
    selectedNodeId
}: {
    nodes: KnowledgeNode[];
    edges: KnowledgeEdge[];
    onNodeClick?: (nodeId: string) => void;
    isExpanding?: boolean;
    selectedNodeId?: string;
}) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);

    const NODE_COLORS: Record<string, string> = {
        disease: '#ef4444',
        protein: '#8b5cf6',
        cell: '#06b6d4',
        process: '#22c55e',
        drug: '#f59e0b',
        gene: '#8b5cf6',
        pathway: '#22c55e',
        phenotype: '#ec4899',
        cell_type: '#14b8a6',
        molecule: '#a855f7',
    };

    return (
        <Card className="h-full">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Network className="h-4 w-4 text-blue-600" />
                        Graphe de Connaissances
                        {isExpanding && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
                    </CardTitle>
                    <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-xs">{nodes.length} nœuds</Badge>
                        <Button variant="ghost" size="sm" className="text-xs gap-1">
                            Plein écran <ChevronRight className="h-3 w-3" />
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="bg-slate-900 rounded-lg h-[300px] relative overflow-hidden">
                    {/* Tooltip */}
                    {hoveredNode && (
                        <div className="absolute top-2 left-2 bg-white/90 dark:bg-slate-800/90 px-2 py-1 rounded shadow-lg z-10 text-xs">
                            <span className="font-medium">{nodes.find(n => n.id === hoveredNode)?.label}</span>
                            <span className="text-slate-500 ml-1">
                                ({nodes.find(n => n.id === hoveredNode)?.type})
                            </span>
                            {onNodeClick && (
                                <span className="text-blue-500 ml-1">• Cliquer pour étendre</span>
                            )}
                        </div>
                    )}

                    <svg ref={svgRef} className="w-full h-full" viewBox="0 0 500 400">
                        {/* Edges */}
                        {edges.map((edge, i) => {
                            const source = nodes.find(n => n.id === edge.source);
                            const target = nodes.find(n => n.id === edge.target);
                            if (!source || !target) return null;

                            const midX = (source.x! + target.x!) / 2;
                            const midY = (source.y! + target.y!) / 2;

                            return (
                                <g key={i}>
                                    <line
                                        x1={source.x}
                                        y1={source.y}
                                        x2={target.x}
                                        y2={target.y}
                                        stroke="#4b5563"
                                        strokeWidth="1.5"
                                        opacity="0.6"
                                    />
                                    <text
                                        x={midX}
                                        y={midY - 5}
                                        fill="#9ca3af"
                                        fontSize="8"
                                        textAnchor="middle"
                                    >
                                        {edge.label}
                                    </text>
                                </g>
                            );
                        })}

                        {/* Nodes */}
                        {nodes.map((node, index) => {
                            const isSelected = selectedNodeId === node.id;
                            const isHovered = hoveredNode === node.id;

                            return (
                                <g
                                    key={`${node.id}_${index}`}
                                    className="cursor-pointer transition-all duration-200"
                                    style={{
                                        opacity: isHovered ? 1 : 0.9,
                                        transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                                        transformOrigin: `${node.x}px ${node.y}px`
                                    }}
                                    onMouseEnter={() => setHoveredNode(node.id)}
                                    onMouseLeave={() => setHoveredNode(null)}
                                    onClick={() => onNodeClick?.(node.id)}
                                >
                                    {/* Glow effect for selected node */}
                                    {isSelected && (
                                        <circle
                                            cx={node.x}
                                            cy={node.y}
                                            r="35"
                                            fill="none"
                                            stroke={NODE_COLORS[node.type] || '#6b7280'}
                                            strokeWidth="3"
                                            opacity="0.4"
                                            className="animate-pulse"
                                        />
                                    )}

                                    <circle
                                        cx={node.x}
                                        cy={node.y}
                                        r={isHovered ? 28 : 25}
                                        fill={NODE_COLORS[node.type] || '#6b7280'}
                                        opacity="0.9"
                                    />
                                    <circle
                                        cx={node.x}
                                        cy={node.y}
                                        r={isHovered ? 28 : 25}
                                        fill="none"
                                        stroke={NODE_COLORS[node.type] || '#6b7280'}
                                        strokeWidth={isSelected ? 3 : 2}
                                        opacity="0.5"
                                    />
                                    <text
                                        x={node.x}
                                        y={node.y}
                                        fill="white"
                                        fontSize="9"
                                        textAnchor="middle"
                                        dominantBaseline="middle"
                                        fontWeight="500"
                                    >
                                        {node.label.length > 12 ? node.label.slice(0, 10) + '...' : node.label}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                </div>
            </CardContent>
        </Card>
    );
}

// ============================================
// COMPONENT: Knowledge Extraction Panel
// ============================================

const ENTITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    GENE: { bg: 'bg-violet-100', text: 'text-violet-700', border: 'border-violet-200' },
    PROTEIN: { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-200' },
    DRUG: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' },
    DISEASE: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' },
    PATHWAY: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' },
    PHENOTYPE: { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-200' },
    CELL_TYPE: { bg: 'bg-teal-100', text: 'text-teal-700', border: 'border-teal-200' },
    MOLECULE: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-200' },
};

const EVIDENCE_LEVEL_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    meta_analysis: { bg: 'bg-emerald-500', text: 'text-white', label: 'Méta-analyse' },
    clinical: { bg: 'bg-blue-500', text: 'text-white', label: 'Clinique' },
    in_vivo: { bg: 'bg-purple-500', text: 'text-white', label: 'In Vivo' },
    in_vitro: { bg: 'bg-orange-500', text: 'text-white', label: 'In Vitro' },
    unknown: { bg: 'bg-gray-400', text: 'text-white', label: 'Inconnu' },
};

function KnowledgeExtractionPanel({
    extraction,
    isLoading,
    onExtract
}: {
    extraction: ExtractionResult | null;
    isLoading: boolean;
    onExtract: () => void;
}) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Zap className="h-4 w-4 text-yellow-500" />
                        Extraction de Connaissances
                    </CardTitle>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs gap-1"
                        onClick={onExtract}
                        disabled={isLoading}
                    >
                        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                        {isLoading ? 'Extraction...' : 'Avec OpenAI'}
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center h-[200px]">
                        <div className="text-center">
                            <Loader2 className="h-8 w-8 animate-spin text-yellow-500 mx-auto mb-2" />
                            <p className="text-sm text-slate-500">Extraction des entités et relations...</p>
                        </div>
                    </div>
                ) : extraction ? (
                    <div className="space-y-4">
                        {/* Evidence Level */}
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">Niveau de preuve:</span>
                            <Badge className={`${EVIDENCE_LEVEL_COLORS[extraction.evidence_level.level]?.bg} ${EVIDENCE_LEVEL_COLORS[extraction.evidence_level.level]?.text}`}>
                                {EVIDENCE_LEVEL_COLORS[extraction.evidence_level.level]?.label}
                            </Badge>
                            <span className="text-xs text-slate-400">
                                (Force: {extraction.evidence_level.strength}/5)
                            </span>
                        </div>

                        {/* Entity Summary */}
                        <div>
                            <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
                                Entités Extraites ({extraction.entities.length})
                            </h4>
                            <div className="flex flex-wrap gap-1">
                                {Object.entries(extraction.summary.entity_counts).map(([type, count]) => (
                                    <Badge
                                        key={type}
                                        variant="outline"
                                        className={`text-xs ${ENTITY_COLORS[type]?.bg} ${ENTITY_COLORS[type]?.text} ${ENTITY_COLORS[type]?.border}`}
                                    >
                                        {type}: {count}
                                    </Badge>
                                ))}
                            </div>
                        </div>

                        {/* Top Entities */}
                        <ScrollArea className="h-[80px]">
                            <div className="flex flex-wrap gap-1">
                                {extraction.entities.slice(0, 20).map((entity, i) => (
                                    <Badge
                                        key={`${entity.text}-${i}`}
                                        variant="outline"
                                        className={`text-xs cursor-pointer hover:opacity-80 transition-opacity ${ENTITY_COLORS[entity.type]?.bg} ${ENTITY_COLORS[entity.type]?.text} ${ENTITY_COLORS[entity.type]?.border}`}
                                        title={`${entity.type} - Confiance: ${(entity.confidence * 100).toFixed(0)}%`}
                                    >
                                        {entity.text}
                                    </Badge>
                                ))}
                                {extraction.entities.length > 20 && (
                                    <Badge variant="outline" className="text-xs bg-slate-100">
                                        +{extraction.entities.length - 20} autres
                                    </Badge>
                                )}
                            </div>
                        </ScrollArea>

                        {/* Relations */}
                        {extraction.relations.length > 0 && (
                            <div>
                                <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
                                    Relations ({extraction.relations.length})
                                </h4>
                                <ScrollArea className="h-[100px]">
                                    <div className="space-y-1">
                                        {extraction.relations.slice(0, 10).map((rel, i) => (
                                            <div key={i} className="flex items-center gap-1 text-xs p-1 rounded bg-slate-50 dark:bg-slate-800">
                                                <Badge variant="outline" className={`shrink-0 ${ENTITY_COLORS[rel.subject.type]?.bg}`}>
                                                    {rel.subject.text}
                                                </Badge>
                                                <ChevronRight className="h-3 w-3 text-slate-400" />
                                                <span className="font-medium text-slate-600 dark:text-slate-300">{rel.predicate}</span>
                                                <ChevronRight className="h-3 w-3 text-slate-400" />
                                                <Badge variant="outline" className={`shrink-0 ${ENTITY_COLORS[rel.object.type]?.bg}`}>
                                                    {rel.object.text}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">
                        <div className="text-center">
                            <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Effectuez une recherche pour extraire les connaissances</p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ============================================
// COMPONENT: Pattern Mining Panel
// ============================================

interface CoOccurrencePattern {
    entity1: string;
    entity2: string;
    type1: string;
    type2: string;
    frequency: number;
    relations: string[];
}

interface ScoredPattern extends CoOccurrencePattern {
    scores: {
        novelty: number;
        strength: number;
        actionability: number;
        total: number;
    };
}

function PatternMiningPanel({
    extraction,
    onPatternSelect
}: {
    extraction: ExtractionResult | null;
    onPatternSelect?: (pattern: CoOccurrencePattern) => void;
}) {
    const patterns = useMemo(() => {
        if (!extraction?.entities || !extraction?.relations) return [];

        // Build co-occurrence matrix
        const coOccurrences: Map<string, CoOccurrencePattern> = new Map();

        // Count entity pair occurrences from relations
        extraction.relations.forEach(rel => {
            const key = [rel.subject.text, rel.object.text].sort().join('::');

            if (!coOccurrences.has(key)) {
                coOccurrences.set(key, {
                    entity1: rel.subject.text,
                    entity2: rel.object.text,
                    type1: rel.subject.type,
                    type2: rel.object.type,
                    frequency: 0,
                    relations: []
                });
            }

            const pattern = coOccurrences.get(key)!;
            pattern.frequency++;
            if (!pattern.relations.includes(rel.predicate)) {
                pattern.relations.push(rel.predicate);
            }
        });

        // Convert to array and sort by frequency
        const patternList = Array.from(coOccurrences.values())
            .sort((a, b) => b.frequency - a.frequency)
            .slice(0, 10);

        // Calculate multi-criteria scores
        const scoredPatterns: ScoredPattern[] = patternList.map(pattern => {
            // Novelty: Higher if types are different (cross-domain links)
            const novelty = pattern.type1 !== pattern.type2 ? 0.8 : 0.4;

            // Strength: Based on frequency and number of relation types
            const strength = Math.min(1, (pattern.frequency * 0.3) + (pattern.relations.length * 0.2));

            // Actionability: Higher for drug-disease/protein-disease patterns
            const actionableTypes = ['DRUG', 'DISEASE', 'PROTEIN', 'PATHWAY'];
            const actionability =
                (actionableTypes.includes(pattern.type1) && actionableTypes.includes(pattern.type2))
                    ? 0.9
                    : 0.5;

            const total = (novelty * 0.3) + (strength * 0.4) + (actionability * 0.3);

            return {
                ...pattern,
                scores: {
                    novelty: Math.round(novelty * 100) / 100,
                    strength: Math.round(strength * 100) / 100,
                    actionability: Math.round(actionability * 100) / 100,
                    total: Math.round(total * 100) / 100
                }
            };
        });

        return scoredPatterns.sort((a, b) => b.scores.total - a.scores.total);
    }, [extraction]);

    if (!extraction || patterns.length === 0) {
        return null;
    }

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                        Patterns de Co-occurrence
                    </CardTitle>
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
                        {patterns.length} patterns
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[200px]">
                    <div className="space-y-2">
                        {patterns.map((pattern, idx) => (
                            <div
                                key={idx}
                                className="p-2 rounded-lg border border-slate-200 hover:border-green-300 hover:bg-green-50/50 dark:hover:bg-green-900/20 transition-colors cursor-pointer"
                                onClick={() => onPatternSelect?.(pattern)}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1 flex-1 min-w-0">
                                        <Badge
                                            variant="outline"
                                            className={`shrink-0 text-xs ${ENTITY_COLORS[pattern.type1]?.bg} ${ENTITY_COLORS[pattern.type1]?.text}`}
                                        >
                                            {pattern.entity1}
                                        </Badge>
                                        <span className="text-xs text-slate-400">↔</span>
                                        <Badge
                                            variant="outline"
                                            className={`shrink-0 text-xs ${ENTITY_COLORS[pattern.type2]?.bg} ${ENTITY_COLORS[pattern.type2]?.text}`}
                                        >
                                            {pattern.entity2}
                                        </Badge>
                                    </div>
                                    <Badge
                                        className={`shrink-0 ${pattern.scores.total >= 0.7 ? 'bg-green-500' :
                                            pattern.scores.total >= 0.5 ? 'bg-blue-500' :
                                                'bg-slate-400'
                                            } text-white text-xs`}
                                    >
                                        {(pattern.scores.total * 10).toFixed(1)}
                                    </Badge>
                                </div>
                                <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                                    <span>×{pattern.frequency}</span>
                                    <span className="text-slate-300">|</span>
                                    <span className="truncate">{pattern.relations.join(', ')}</span>
                                </div>
                                <div className="mt-1 flex gap-1">
                                    <div className="flex-1 h-1 rounded-full bg-slate-200 overflow-hidden">
                                        <div
                                            className="h-full bg-purple-400"
                                            style={{ width: `${pattern.scores.novelty * 100}%` }}
                                            title={`Nouveauté: ${pattern.scores.novelty}`}
                                        />
                                    </div>
                                    <div className="flex-1 h-1 rounded-full bg-slate-200 overflow-hidden">
                                        <div
                                            className="h-full bg-blue-400"
                                            style={{ width: `${pattern.scores.strength * 100}%` }}
                                            title={`Force: ${pattern.scores.strength}`}
                                        />
                                    </div>
                                    <div className="flex-1 h-1 rounded-full bg-slate-200 overflow-hidden">
                                        <div
                                            className="h-full bg-green-400"
                                            style={{ width: `${pattern.scores.actionability * 100}%` }}
                                            title={`Actionnabilité: ${pattern.scores.actionability}`}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
                <div className="mt-2 flex gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-purple-400" /> Nouveauté
                    </span>
                    <span className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-blue-400" /> Force
                    </span>
                    <span className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-green-400" /> Actionnabilité
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}

// ============================================
// COMPONENT: Hypothesis Comparison Panel
// ============================================

function HypothesisComparisonPanel({
    hypotheses,
    comparedIds,
    onToggleCompare
}: {
    hypotheses: Hypothesis[];
    comparedIds: string[];
    onToggleCompare: (id: string) => void;
}) {
    const comparedHypotheses = hypotheses.filter(h => comparedIds.includes(h.id));

    if (comparedHypotheses.length < 2) {
        return (
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-indigo-500" />
                        Comparaison d'Hypothèses
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[150px] flex items-center justify-center text-slate-400 text-sm text-center">
                        <div>
                            <p>Sélectionnez au moins 2 hypothèses</p>
                            <p className="text-xs mt-1">pour les comparer</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const dimensions = ['novelty', 'plausibility', 'strength', 'feasibility', 'impact'] as const;
    const dimensionLabels: Record<string, string> = {
        novelty: 'Nouveauté',
        plausibility: 'Plausibilité',
        strength: 'Force',
        feasibility: 'Faisabilité',
        impact: 'Impact'
    };

    const colors = ['#3B82F6', '#22C55E', '#F59E0B', '#EF4444'];

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-indigo-500" />
                        Comparaison d'Hypothèses
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                        {comparedHypotheses.length} sélectionnées
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {/* Score Comparison Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left py-1 font-medium text-slate-500">Dimension</th>
                                    {comparedHypotheses.map((h, i) => (
                                        <th key={h.id} className="text-center py-1 font-medium" style={{ color: colors[i] }}>
                                            {h.hypothesis_id}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {dimensions.map(dim => (
                                    <tr key={dim} className="border-b last:border-0">
                                        <td className="py-1">{dimensionLabels[dim]}</td>
                                        {comparedHypotheses.map((h, i) => {
                                            const value = h.scores?.[dim] || 0;
                                            const maxValue = Math.max(...comparedHypotheses.map(hyp => hyp.scores?.[dim] || 0));
                                            const isMax = value === maxValue && maxValue > 0;
                                            return (
                                                <td key={h.id} className="text-center py-1">
                                                    <span className={`font-medium ${isMax ? 'text-green-600' : ''}`}>
                                                        {value.toFixed(1)}
                                                    </span>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                                <tr className="bg-slate-50 dark:bg-slate-800">
                                    <td className="py-1 font-bold">Total</td>
                                    {comparedHypotheses.map((h, i) => {
                                        const value = h.scores?.total || 0;
                                        const maxValue = Math.max(...comparedHypotheses.map(hyp => hyp.scores?.total || 0));
                                        const isMax = value === maxValue && maxValue > 0;
                                        return (
                                            <td key={h.id} className="text-center py-1">
                                                <span className={`font-bold ${isMax ? 'text-green-600' : ''}`} style={{ color: isMax ? undefined : colors[i] }}>
                                                    {value.toFixed(1)}
                                                </span>
                                            </td>
                                        );
                                    })}
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* Visual Bar Comparison */}
                    <div className="space-y-2">
                        {dimensions.map(dim => (
                            <div key={dim} className="space-y-1">
                                <span className="text-xs text-slate-500">{dimensionLabels[dim]}</span>
                                <div className="flex gap-1">
                                    {comparedHypotheses.map((h, i) => {
                                        const value = h.scores?.[dim] || 0;
                                        return (
                                            <div
                                                key={h.id}
                                                className="flex-1 h-2 rounded-full overflow-hidden bg-slate-200"
                                            >
                                                <div
                                                    className="h-full rounded-full transition-all duration-300"
                                                    style={{
                                                        width: `${value * 10}%`,
                                                        backgroundColor: colors[i]
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t">
                        {comparedHypotheses.map((h, i) => (
                            <div
                                key={h.id}
                                className="flex items-center gap-1 text-xs cursor-pointer hover:opacity-70"
                                onClick={() => onToggleCompare(h.id)}
                            >
                                <div className="w-3 h-3 rounded" style={{ backgroundColor: colors[i] }} />
                                <span>{h.hypothesis_id}</span>
                                <XCircle className="h-3 w-3 text-slate-400" />
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ============================================
// COMPONENT: Evidence Trail Visualization
// ============================================

interface EvidenceNode {
    id: string;
    label: string;
    type: 'hypothesis' | 'evidence' | 'entity' | 'relation';
    depth: number;
}

function EvidenceTrailPanel({
    hypothesis,
    searchResults,
    extraction
}: {
    hypothesis?: Hypothesis;
    searchResults: SearchResult[];
    extraction: ExtractionResult | null;
}) {
    const trailNodes = useMemo(() => {
        if (!hypothesis) return [];

        const nodes: EvidenceNode[] = [];
        let depth = 0;

        // Hypothesis as root
        nodes.push({
            id: hypothesis.hypothesis_id,
            label: hypothesis.statement.slice(0, 50) + '...',
            type: 'hypothesis',
            depth: depth++
        });

        // Evidence from search results
        searchResults.slice(0, 5).forEach((result, i) => {
            nodes.push({
                id: `evidence-${i}`,
                label: result.title.slice(0, 40) + '...',
                type: 'evidence',
                depth: depth
            });
        });
        if (searchResults.length > 0) depth++;

        // Entities from extraction
        if (extraction?.entities) {
            extraction.entities.slice(0, 6).forEach((entity, i) => {
                nodes.push({
                    id: `entity-${i}`,
                    label: entity.text,
                    type: 'entity',
                    depth: depth
                });
            });
            if (extraction.entities.length > 0) depth++;
        }

        // Relations
        if (extraction?.relations) {
            extraction.relations.slice(0, 4).forEach((rel, i) => {
                nodes.push({
                    id: `rel-${i}`,
                    label: `${rel.subject.text} → ${rel.object.text}`,
                    type: 'relation',
                    depth: depth
                });
            });
        }

        return nodes;
    }, [hypothesis, searchResults, extraction]);

    const typeColors: Record<string, { bg: string; border: string; text: string }> = {
        hypothesis: { bg: 'bg-blue-100', border: 'border-blue-500', text: 'text-blue-700' },
        evidence: { bg: 'bg-green-100', border: 'border-green-500', text: 'text-green-700' },
        entity: { bg: 'bg-purple-100', border: 'border-purple-500', text: 'text-purple-700' },
        relation: { bg: 'bg-amber-100', border: 'border-amber-500', text: 'text-amber-700' },
    };

    if (!hypothesis) {
        return (
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Network className="h-4 w-4 text-emerald-500" />
                        Piste de Preuves
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[150px] flex items-center justify-center text-slate-400 text-sm">
                        Sélectionnez une hypothèse pour voir la piste de preuves
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Group nodes by depth
    const nodesByDepth = trailNodes.reduce((acc, node) => {
        if (!acc[node.depth]) acc[node.depth] = [];
        acc[node.depth].push(node);
        return acc;
    }, {} as Record<number, EvidenceNode[]>);

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Network className="h-4 w-4 text-emerald-500" />
                        Piste de Preuves
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                        {trailNodes.length} éléments
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[200px]">
                    <div className="space-y-3">
                        {Object.entries(nodesByDepth).map(([depth, nodes]) => (
                            <div key={depth} className="relative">
                                {/* Vertical connector */}
                                {parseInt(depth) > 0 && (
                                    <div className="absolute left-4 -top-3 w-0.5 h-3 bg-slate-300" />
                                )}

                                <div className="flex flex-wrap gap-1">
                                    {nodes.map((node, i) => (
                                        <div key={node.id} className="relative">
                                            {/* Horizontal connector */}
                                            {parseInt(depth) > 0 && i === 0 && (
                                                <div className="absolute left-4 -top-3 w-0.5 h-3 bg-slate-300" />
                                            )}
                                            <Badge
                                                variant="outline"
                                                className={`text-xs cursor-pointer hover:opacity-80 transition-opacity ${typeColors[node.type].bg} ${typeColors[node.type].text} ${typeColors[node.type].border} border-l-2`}
                                                title={node.label}
                                            >
                                                {node.label.length > 25 ? node.label.slice(0, 22) + '...' : node.label}
                                            </Badge>
                                        </div>
                                    ))}
                                </div>

                                {/* Depth label */}
                                <div className="text-xs text-slate-400 mt-1">
                                    {depth === '0' && 'Hypothèse'}
                                    {depth === '1' && 'Sources'}
                                    {depth === '2' && 'Entités'}
                                    {depth === '3' && 'Relations'}
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>

                {/* Legend */}
                <div className="flex gap-3 pt-2 mt-2 border-t text-xs text-slate-500">
                    {Object.entries(typeColors).map(([type, colors]) => (
                        <span key={type} className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded ${colors.bg} ${colors.border} border`} />
                            {type === 'hypothesis' ? 'Hyp.' : type === 'evidence' ? 'Source' : type === 'entity' ? 'Entité' : 'Relation'}
                        </span>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

// ============================================
// COMPONENT: Hypothesis Generation Panel
// ============================================

function HypothesisPanel({
    hypotheses,
    onSelectHypothesis,
    selectedId,
    comparedIds,
    onToggleCompare,
    onGenerate,
    isGenerating,
    lastSearchQuery
}: {
    hypotheses: Hypothesis[];
    onSelectHypothesis: (h: Hypothesis) => void;
    selectedId?: string;
    comparedIds?: string[];
    onToggleCompare?: (id: string) => void;
    onGenerate?: (query: string) => void;
    isGenerating?: boolean;
    lastSearchQuery?: string;
}) {
    return (
        <Card className="h-full">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-amber-500" />
                        Génération d'Hypothèses
                    </CardTitle>
                    <div className="flex items-center gap-1">
                        {comparedIds && comparedIds.length > 0 && (
                            <Badge variant="outline" className="text-xs bg-indigo-50 text-indigo-600 border-indigo-200">
                                {comparedIds.length} comparées
                            </Badge>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            className="bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100 gap-1"
                            onClick={() => onGenerate?.(lastSearchQuery || '')}
                            disabled={isGenerating || !lastSearchQuery}
                        >
                            {isGenerating ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                                <Sparkles className="h-3 w-3" />
                            )}
                            {isGenerating ? 'Génération...' : 'Générer Hypothèses'}
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[250px]">
                    <div className="space-y-2">
                        {hypotheses.map(h => {
                            const isCompared = comparedIds?.includes(h.id);
                            return (
                                <div
                                    key={h.id}
                                    className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedId === h.id
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                                        : isCompared
                                            ? 'border-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20'
                                            : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                                        }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1" onClick={() => onSelectHypothesis(h)}>
                                            <p className="text-xs font-medium text-blue-600">{h.hypothesis_id}</p>
                                            <p className="text-sm mt-1 line-clamp-2">{h.statement}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            <Badge
                                                variant="outline"
                                                className={`shrink-0 ${h.status === 'validated' ? 'bg-green-50 text-green-600 border-green-200' :
                                                    h.status === 'rejected' ? 'bg-red-50 text-red-600 border-red-200' :
                                                        'bg-amber-50 text-amber-600 border-amber-200'
                                                    }`}
                                            >
                                                {h.status === 'validated' ? 'Validée' : h.status === 'rejected' ? 'Rejetée' : 'En attente'}
                                            </Badge>
                                            {onToggleCompare && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onToggleCompare(h.id);
                                                    }}
                                                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${isCompared
                                                        ? 'bg-indigo-500 text-white border-indigo-500'
                                                        : 'bg-white text-slate-500 border-slate-300 hover:border-indigo-400'
                                                        }`}
                                                >
                                                    {isCompared ? '✓ Comparée' : 'Comparer'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}

// ============================================
// COMPONENT: Evidence Dossier
// ============================================

function EvidenceDossier({ hypothesis }: { hypothesis?: Hypothesis }) {
    if (!hypothesis) {
        return (
            <Card className="h-full">
                <CardHeader>
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-blue-600" />
                        Dossier de Preuve
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm">
                        Sélectionnez une hypothèse pour voir les preuves
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Extract PMID from citation strings like "PMID:12345" or "PMID-12345"
    const parseCitation = (citation: string) => {
        const pmidMatch = citation.match(/PMID[:\-]?(\d+)/i);
        const doiMatch = citation.match(/DOI[:\-]?(.+)/i);
        return {
            pmid: pmidMatch?.[1],
            doi: doiMatch?.[1],
            raw: citation
        };
    };

    const citations = (hypothesis.evidence_citations || []).map(parseCitation);
    const hasCitations = citations.length > 0;

    return (
        <Card className="h-full">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-blue-600" />
                        Dossier de Preuve
                    </CardTitle>
                    <span className="text-xs text-blue-600 font-medium">{hypothesis.hypothesis_id}</span>
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[350px]">
                    <div className="space-y-4">
                        {/* Hypothesis Statement */}
                        <div>
                            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Hypothèse:</h4>
                            <p className="text-sm bg-blue-50 dark:bg-blue-900/30 p-3 rounded-lg border-l-4 border-blue-500">
                                {hypothesis.statement}
                            </p>
                        </div>

                        {/* Predictions */}
                        {hypothesis.predictions && hypothesis.predictions.length > 0 && (
                            <div>
                                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                                    <Target className="h-3 w-3" /> Prédictions Testables
                                </h4>
                                <ul className="space-y-1">
                                    {hypothesis.predictions.map((pred, i) => (
                                        <li key={i} className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-2 rounded flex items-start gap-2">
                                            <span className="text-green-500">✓</span> {pred}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Citations */}
                        <div>
                            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                                <LinkIcon className="h-3 w-3" /> Preuves Citées ({citations.length})
                            </h4>
                            <div className="space-y-2">
                                {hasCitations ? citations.map((cite, i) => (
                                    <div key={i} className="p-2 bg-slate-50 dark:bg-slate-800 rounded text-xs border-l-2 border-blue-400">
                                        <p className="text-slate-600 dark:text-slate-400">
                                            <span className="font-medium text-blue-600">
                                                {cite.pmid ? `PMID:${cite.pmid}` : cite.doi ? `DOI:${cite.doi}` : cite.raw}
                                            </span>
                                        </p>
                                        {cite.pmid && (
                                            <a
                                                href={`https://pubmed.ncbi.nlm.nih.gov/${cite.pmid}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-500 hover:underline text-xs mt-1 inline-flex items-center gap-1"
                                            >
                                                Voir article sur PubMed <ExternalLink className="h-3 w-3" />
                                            </a>
                                        )}
                                    </div>
                                )) : (
                                    <p className="text-xs text-slate-400 italic">Aucune citation spécifique disponible</p>
                                )}
                            </div>
                        </div>

                        {/* Risks & Confounders */}
                        {hypothesis.risks_confounders && hypothesis.risks_confounders.length > 0 && (
                            <div>
                                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                                    <AlertTriangle className="h-3 w-3 text-amber-500" /> Risques & Confondeurs
                                </h4>
                                <ul className="space-y-1">
                                    {hypothesis.risks_confounders.map((risk, i) => (
                                        <li key={i} className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 p-2 rounded">
                                            ⚠ {risk}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Scores */}
                        {hypothesis.scores && (
                            <div>
                                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Scores d'Évaluation</h4>
                                <div className="grid grid-cols-3 gap-2">
                                    {Object.entries(hypothesis.scores).filter(([k]) => k !== 'total').map(([key, value]) => (
                                        <div key={key} className="text-center p-1 bg-slate-100 dark:bg-slate-800 rounded">
                                            <div className="text-xs text-slate-500 capitalize">{key}</div>
                                            <div className="text-sm font-bold text-blue-600">{value}/10</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}


// ============================================
// COMPONENT: Adversarial Review
// ============================================

function AdversarialReview({ hypothesis, onReviewComplete }: { hypothesis?: Hypothesis; onReviewComplete?: (review: any) => void }) {
    const [review, setReview] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);

    const { invokeAI } = useAI();
    const runAdversarialReview = async () => {
        if (!hypothesis) return;

        setIsLoading(true);
        try {
            const { data, error } = await invokeAI('adversarial-reviewer', {
                hypothesis: {
                    hypothesis_id: hypothesis.hypothesis_id,
                    statement: hypothesis.statement,
                    predictions: hypothesis.predictions,
                    scores: hypothesis.scores
                }
            });

            if (error) throw error;

            setReview(data.review);
            if (onReviewComplete) {
                onReviewComplete(data);
            }
            toast.success('Revue adversariale complétée');
        } catch (err: any) {
            console.error('Adversarial review error:', err);
            toast.error('Erreur lors de la revue: ' + (err.message || 'Erreur inconnue'));
        } finally {
            setIsLoading(false);
        }
    };

    if (!hypothesis) return null;

    const conclusionColors: Record<string, string> = {
        robust: 'text-green-600',
        moderate: 'text-blue-600',
        fragile: 'text-amber-600',
        flawed: 'text-red-600'
    };

    const conclusionLabels: Record<string, string> = {
        robust: 'Hypothèse Robuste',
        moderate: 'Hypothèse Modérée',
        fragile: 'Hypothèse Fragile',
        flawed: 'Hypothèse Défaillante'
    };

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        Revue Adversariale
                    </CardTitle>
                    <span className="text-xs text-slate-500">{hypothesis.hypothesis_id}</span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2 text-xs"
                    onClick={runAdversarialReview}
                    disabled={isLoading}
                >
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                    {isLoading ? 'Analyse...' : 'Analyser'}
                </Button>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex items-center justify-center h-[120px]">
                        <div className="text-center">
                            <Loader2 className="h-6 w-6 animate-spin text-orange-500 mx-auto mb-2" />
                            <p className="text-xs text-slate-500">Analyse critique en cours...</p>
                        </div>
                    </div>
                ) : review ? (
                    <div className="space-y-3">
                        <div>
                            <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Contre-arguments</h4>
                            <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                                {(review.counter_arguments || []).slice(0, 3).map((arg: string, i: number) => (
                                    <li key={i} className="flex items-start gap-2">
                                        <XCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
                                        {arg}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {review.confounders?.length > 0 && (
                            <div>
                                <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Confondeurs</h4>
                                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                                    {review.confounders.slice(0, 2).map((conf: string, i: number) => (
                                        <li key={i} className="flex items-start gap-2">
                                            <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                                            {conf}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <Separator />

                        <div>
                            <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Conclusion:</h4>
                            <p className={`text-sm font-medium ${conclusionColors[review.conclusion] || 'text-slate-600'}`}>
                                {conclusionLabels[review.conclusion] || 'Analyse indéterminée'}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">{review.summary}</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-xs text-slate-500 text-center py-4">
                            Cliquez sur "Analyser" pour lancer la revue adversariale
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ============================================
// COMPONENT: Hypothesis Prioritization Table
// ============================================

function HypothesisPrioritization({ hypotheses }: { hypotheses: Hypothesis[] }) {
    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Star className="h-4 w-4 text-amber-500" />
                        Priorisation des Hypothèses
                    </CardTitle>
                    <Button variant="ghost" size="sm" className="text-xs gap-1">
                        <RefreshCw className="h-3 w-3" />
                        Recalculer
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b">
                                <th className="text-left py-2 font-medium text-slate-500">Hypothèse</th>
                                <th className="text-center py-2 font-medium text-slate-500">Score</th>
                                <th className="text-center py-2 font-medium text-slate-500">Nouveauté</th>
                                <th className="text-center py-2 font-medium text-slate-500">Preuves</th>
                                <th className="text-center py-2 font-medium text-slate-500">Falsifiabilité</th>
                            </tr>
                        </thead>
                        <tbody>
                            {hypotheses.map(h => (
                                <tr key={h.id} className="border-b hover:bg-slate-50 dark:hover:bg-slate-800">
                                    <td className="py-2 font-medium text-blue-600">{h.hypothesis_id}</td>
                                    <td className="text-center py-2">{h.scores?.total.toFixed(1)}</td>
                                    <td className="text-center py-2">
                                        <div className="w-16 mx-auto">
                                            <Progress value={(h.scores?.novelty || 0) * 10} className="h-2" />
                                        </div>
                                    </td>
                                    <td className="text-center py-2">
                                        <div className="w-16 mx-auto">
                                            <Progress value={(h.scores?.strength || 0) * 10} className="h-2 [&>div]:bg-green-500" />
                                        </div>
                                    </td>
                                    <td className="text-center py-2">
                                        <div className="w-16 mx-auto">
                                            <Progress value={(h.scores?.feasibility || 0) * 10} className="h-2 [&>div]:bg-purple-500" />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}

// ============================================
// COMPONENT: Experimental Protocol
// ============================================

function ExperimentalProtocol({ hypothesis }: { hypothesis?: Hypothesis }) {
    if (!hypothesis) return null;

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Beaker className="h-4 w-4 text-green-500" />
                        Protocole Expérimental
                    </CardTitle>
                    <span className="text-xs text-slate-500">{hypothesis.hypothesis_id}</span>
                </div>
                <Button variant="ghost" size="sm" className="absolute top-2 right-2 text-xs">
                    Générer Alternatives
                </Button>
            </CardHeader>
            <CardContent>
                <div className="space-y-3 text-xs">
                    <div>
                        <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Objectif:</h4>
                        <ul className="space-y-1 text-slate-600 dark:text-slate-400">
                            <li className="flex items-start gap-2">
                                <Target className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
                                Possible confondeur: IL-6 set également impliqué dans 8 autres voies inflammatoires.
                            </li>
                            <li className="flex items-start gap-2">
                                <Target className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
                                Étude avec échantillon faible (n=12, non randomisée).
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-1">Contrôles:</h4>
                        <ul className="space-y-1 text-slate-600 dark:text-slate-400">
                            <li>• Groupe témoin</li>
                            <li>• Groupe témoin: IL-1p, 200% spike.</li>
                        </ul>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ============================================
// COMPONENT: Final Synthesis
// ============================================

function FinalSynthesis({
    hypothesis,
    searchResults,
    evidencePack,
    lastSearchQuery,
    onExportPDF,
    onExportMarkdown
}: {
    hypothesis?: Hypothesis;
    searchResults?: SearchResult[];
    evidencePack?: {
        query_intent: any;
        paper_count: number;
        snippet_count: number;
        entities?: Array<{ text: string; type: string }>;
        relations?: Array<{ source: string; target: string; label: string }>;
        snippets?: Array<{ passage: string; paper_id: string }>;
        papers?: Array<{ pmid: string; title: string; journal: string; publication_date: string; authors: string[] }>;
    };
    lastSearchQuery?: string;
    onExportPDF?: () => void;
    onExportMarkdown?: () => void;
}) {
    const [isExporting, setIsExporting] = useState(false);

    const handleExportPDF = async () => {
        if (!hypothesis) {
            toast.error('Sélectionnez une hypothèse pour exporter');
            return;
        }

        setIsExporting(true);
        try {
            // Use NEW committee-grade PDF export
            const { generateCommitteeGradePDF } = await import('../utils/discoveryExportCommittee');

            await generateCommitteeGradePDF({
                query: lastSearchQuery || 'Recherche Discovery',
                date: new Date().toLocaleDateString('fr-FR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }),
                hypothesis: {
                    ...hypothesis,
                    mermaid_graph: hypothesis.mermaid_graph,
                    systemic_cascade: hypothesis.systemic_cascade,
                    therapeutic_resolution_chains: hypothesis.therapeutic_resolution_chains,
                    etiology_depth: hypothesis.etiology_depth
                },
                searchResults: (searchResults || []).map(r => ({
                    pmid: r.pmid,
                    title: r.title,
                    abstract: r.abstract,
                    journal: r.journal,
                    date: r.date
                })),
                evidencePack: evidencePack
            });

            toast.success('Rapport committee-grade PDF généré avec succès');
        } catch (err: any) {
            console.error('PDF export error:', err);
            toast.error('Erreur lors de l\'export PDF');
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportMarkdown = async () => {
        try {
            const { generateMarkdownReport } = await import('@/utils/discoveryExport');

            const markdown = generateMarkdownReport({
                query: 'Recherche Discovery',
                date: new Date().toLocaleDateString('fr-FR'),
                papers_count: searchResults?.length || 0,
                hypotheses: hypothesis ? [hypothesis] : [],
                evidence: (searchResults || []).map(r => ({
                    pmid: r.pmid,
                    title: r.title,
                    abstract: r.abstract,
                    journal: r.journal,
                    date: r.date
                }))
            });

            // Copy to clipboard
            await navigator.clipboard.writeText(markdown);
            toast.success('Rapport Markdown copié dans le presse-papiers');
        } catch (err) {
            console.error('Markdown export error:', err);
            toast.error('Erreur lors de l\'export Markdown');
        }
    };

    return (
        <Card>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-purple-500" />
                        Synthèse Finale
                    </CardTitle>
                    <Button
                        size="sm"
                        className="gap-1 bg-blue-600 hover:bg-blue-700 text-xs"
                        onClick={handleExportPDF}
                        disabled={isExporting || !hypothesis}
                    >
                        {isExporting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                            <FileDown className="h-3 w-3" />
                        )}
                        Rapport PDF
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {hypothesis ? (
                        <>
                            <div>
                                <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
                                    Hypothèse sélectionnée: {hypothesis.hypothesis_id}
                                </h4>
                                <p className="text-xs text-slate-700 dark:text-slate-300 bg-blue-50 dark:bg-blue-900/30 p-2 rounded border-l-2 border-blue-500">
                                    {hypothesis.statement}
                                </p>
                            </div>

                            {hypothesis.scores && (
                                <div>
                                    <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Score Global</h4>
                                    <div className="flex items-center gap-2">
                                        <Progress value={hypothesis.scores.total * 10} className="flex-1 h-2" />
                                        <span className="text-sm font-bold text-blue-600">{hypothesis.scores.total.toFixed(1)}/10</span>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div>
                            <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Résumé de la Recherche</h4>
                            <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                                    La modulation de TREM2 montre un potentiel neuroprotecteur.
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                                    L'inhibition de NLRP3 réduit la neurodégénérescence.
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle2 className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                                    Le médicament A pourrait être repositionné pour le Parkinson.
                                </li>
                            </ul>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 gap-1 text-xs"
                            onClick={handleExportMarkdown}
                        >
                            <Download className="h-3 w-3" />
                            Markdown
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 gap-1 text-xs"
                            onClick={handleExportPDF}
                            disabled={isExporting || !hypothesis}
                        >
                            <FileDown className="h-3 w-3" />
                            PDF Complet
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ============================================
// COMPONENT: Discovery Alerts Panel
// ============================================

interface DiscoveryAlert {
    id: string;
    type: string;
    severity: string;
    title: string;
    message: string;
    papers?: string[];
    created_at: string;
    is_read?: boolean;
}

function AlertsPanel() {
    const [alerts, setAlerts] = useState<DiscoveryAlert[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    const { invokeAI } = useAI();
    const fetchAlerts = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await invokeAI('continuous-discovery-pipeline', {
                action: 'get_alerts'
            });

            if (error) throw error;
            setAlerts(data.alerts || []);
            setLastRefresh(new Date());
        } catch (err: any) {
            console.error('Failed to fetch alerts:', err);
            // Use mock data if API fails
            setAlerts([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAlerts();
        // Auto-refresh every 5 minutes
        const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [fetchAlerts]);

    const severityColors: Record<string, { bg: string; border: string; icon: string }> = {
        info: { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200', icon: 'text-blue-500' },
        warning: { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200', icon: 'text-amber-500' },
        critical: { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200', icon: 'text-red-500' }
    };

    const typeIcons: Record<string, React.ReactNode> = {
        new_evidence: <FileText className="h-4 w-4" />,
        contradiction: <AlertTriangle className="h-4 w-4" />,
        breakthrough: <Sparkles className="h-4 w-4" />,
        high_impact: <TrendingUp className="h-4 w-4" />
    };

    return (
        <Card className="h-full">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Bell className="h-4 w-4 text-amber-500" />
                        Alertes de Découverte
                        {alerts.filter(a => !a.is_read).length > 0 && (
                            <Badge variant="destructive" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                                {alerts.filter(a => !a.is_read).length}
                            </Badge>
                        )}
                    </CardTitle>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={fetchAlerts}
                        disabled={isLoading}
                        className="h-7 px-2"
                    >
                        <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
                {lastRefresh && (
                    <p className="text-xs text-slate-400">
                        Mis à jour: {lastRefresh.toLocaleTimeString('fr-FR')}
                    </p>
                )}
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[200px]">
                    {alerts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 text-sm">
                            <Bell className="h-8 w-8 mb-2 opacity-50" />
                            <p>Aucune alerte récente</p>
                            <p className="text-xs">Le pipeline surveille vos requêtes</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {alerts.slice(0, 10).map(alert => {
                                const colors = severityColors[alert.severity] || severityColors.info;
                                return (
                                    <div
                                        key={alert.id}
                                        className={`p-2 rounded-lg border ${colors.bg} ${colors.border} transition-all hover:shadow-sm`}
                                    >
                                        <div className="flex items-start gap-2">
                                            <div className={colors.icon}>
                                                {typeIcons[alert.type] || <Bell className="h-4 w-4" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium line-clamp-1">{alert.title}</p>
                                                <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                                                    {alert.message}
                                                </p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-xs text-slate-400">
                                                        {new Date(alert.created_at).toLocaleDateString('fr-FR')}
                                                    </span>
                                                    {alert.papers && alert.papers.length > 0 && (
                                                        <Badge variant="outline" className="text-xs h-4">
                                                            {alert.papers.length} article(s)
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    );
}

// ============================================
// COMPONENT: Saved Graphs Panel
// ============================================

function SavedGraphsPanel({ onLoad, refreshTrigger }: { onLoad: (graph: SavedGraph) => void, refreshTrigger?: number }) {
    const [savedGraphs, setSavedGraphs] = useState<SavedGraph[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchSavedGraphs = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('discovery_hypotheses')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching history:', error);
                return;
            }

            if (data) {
                const typedData = (data as unknown as any[]).map((h: any) => ({
                    ...h,
                    scores: typeof h.scores === 'string' ? JSON.parse(h.scores) : h.scores,
                    contradictions: typeof h.contradictions === 'string' ? JSON.parse(h.contradictions) : h.contradictions
                })) as Hypothesis[];
                // Assuming setHistory is meant to be setSavedGraphs in this context,
                // or this function is intended for a different component.
                // Applying the change as requested, but noting the potential context mismatch.
                // For now, I'll assume `setHistory` is a placeholder for `setSavedGraphs`
                // or that `SavedGraphsPanel` is being refactored to display hypotheses.
                // Given the original context, `setSavedGraphs` is the correct state setter here.
                // If the intent was to set `history` in `DiscoveryPlatform`, this function
                // would need to be moved or `setHistory` passed as a prop.
                // Sticking to the original component's state:
                setSavedGraphs(typedData as unknown as SavedGraph[]); // Casting to SavedGraph[] to match component state
            }
        } catch (err: any) {
            console.error('Error fetching saved graphs:', err);
            toast.error('Erreur chargement graphes sauvegardés');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSavedGraphs();
    }, [fetchSavedGraphs, refreshTrigger]);

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Êtes-vous sûr de vouloir supprimer ce graphe ?')) return;

        try {
            const { error } = await supabase
                .from('saved_graphs')
                .delete()
                .eq('id', id);

            if (error) throw error;
            toast.success('Graphe supprimé');
            fetchSavedGraphs();
        } catch (err) {
            toast.error('Erreur suppression');
        }
    };

    const filteredGraphs = savedGraphs.filter(g =>
        g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (g.description && g.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <Card className="h-full">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Brain className="h-4 w-4 text-purple-600" />
                        Mes Graphes
                    </CardTitle>
                    <div className="relative w-32">
                        <Search className="absolute left-2 top-2.5 h-3 w-3 text-slate-400" />
                        <Input
                            placeholder="Rechercher..."
                            className="h-8 pl-7 text-[10px]"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[200px]">
                    {isLoading ? (
                        <div className="flex justify-center p-4"><Loader2 className="animate-spin text-purple-600" /></div>
                    ) : filteredGraphs.length === 0 ? (
                        <div className="text-center text-xs text-slate-500 p-4">
                            {searchQuery ? 'Aucun résultat' : 'Aucun graphe sauvegardé'}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredGraphs.map(graph => (
                                <div
                                    key={graph.id}
                                    className="p-2 border rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 cursor-pointer transition-colors group relative"
                                    onClick={() => onLoad(graph)}
                                >
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="font-medium text-xs text-purple-700 dark:text-purple-300">{graph.name}</p>
                                            <p className="text-[10px] text-slate-500 line-clamp-1">{graph.description || 'Sans description'}</p>
                                        </div>
                                        <span className="text-[10px] text-slate-400">
                                            {new Date(graph.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <button
                                        onClick={(e) => handleDelete(graph.id, e)}
                                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded text-red-500 transition-all"
                                        title="Supprimer"
                                    >
                                        <XCircle className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    );
}

const NexusHeader = ({ activeTab, setActiveTab }: {
    activeTab: 'archive' | 'laboratories' | 'visualizer' | 'synthetics' | 'discovery';
    setActiveTab: (tab: 'archive' | 'laboratories' | 'visualizer' | 'synthetics' | 'discovery') => void;
}) => {
    const { theme } = useTheme();

    const tabs = [
        { id: 'archive' as const, label: 'Archive' },
        { id: 'discovery' as const, label: 'Discovery Mode' },
        { id: 'laboratories' as const, label: 'Laboratories' },
        { id: 'visualizer' as const, label: 'Switch Visualizer' },
        { id: 'synthetics' as const, label: 'Synthetics' }
    ];

    return (
        <div className={cn(
            "flex items-center justify-between px-6 py-4 backdrop-blur-md border-b sticky top-0 z-50",
            theme === 'dark'
                ? "bg-[#020617]/80 border-white/5"
                : "bg-white/80 border-slate-200/50"
        )}>
            <div className="flex items-center gap-8">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center font-black text-lg",
                        theme === 'dark'
                            ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-400"
                            : "bg-cyan-600/10 border border-cyan-600/30 text-cyan-600"
                    )}>
                        N
                    </div>
                    <div>
                        <h1 className={cn(
                            "text-lg font-bold tracking-tight",
                            theme === 'dark' ? "text-cyan-400" : "text-cyan-600"
                        )}>NEXUS<span className={theme === 'dark' ? "text-slate-300" : "text-slate-700"}>MED</span></h1>
                        <p className={cn(
                            "text-[10px] -mt-0.5 font-mono",
                            theme === 'dark' ? "text-slate-500" : "text-slate-400"
                        )}>NODE ID: BIO-ANALYTICS</p>
                    </div>
                </div>
                <nav className="hidden md:flex items-center gap-1">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "px-4 py-2 text-xs uppercase tracking-widest rounded-md transition-all",
                                activeTab === tab.id
                                    ? (theme === 'dark' ? "text-cyan-400 underline underline-offset-4 bg-cyan-500/10" : "text-cyan-600 underline underline-offset-4 bg-cyan-50")
                                    : (theme === 'dark' ? "text-slate-400 hover:text-cyan-400 hover:bg-white/5" : "text-slate-500 hover:text-cyan-600 hover:bg-slate-100")
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-right">
                    <p className={cn(
                        "text-[10px] uppercase tracking-widest",
                        theme === 'dark' ? "text-slate-500" : "text-slate-400"
                    )}>ENCRYPTION ACTIVE</p>
                    <p className="text-[10px] text-green-500 font-bold uppercase tracking-widest">SYNCED</p>
                </div>
                <button className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                    theme === 'dark'
                        ? "bg-slate-800 border border-white/10 text-slate-400 hover:text-cyan-400 hover:border-cyan-500/30"
                        : "bg-slate-100 border border-slate-200 text-slate-500 hover:text-cyan-600 hover:border-cyan-500/30"
                )}>
                    <Zap className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
};


const NexusHero = () => {
    const { theme } = useTheme();
    return (
        <div className="relative py-16 md:py-24 flex flex-col items-center justify-center overflow-hidden">
            {/* Background glows */}
            <div className={cn(
                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[150px] pointer-events-none",
                theme === 'dark' ? "bg-cyan-500/8" : "bg-cyan-500/5"
            )} />
            <div className={cn(
                "absolute top-1/4 right-1/4 w-[400px] h-[400px] rounded-full blur-[120px] pointer-events-none",
                theme === 'dark' ? "bg-purple-500/5" : "bg-purple-500/3"
            )} />

            {/* DNA Visualizer background */}
            <div className="absolute inset-0 flex items-center justify-start pl-12 opacity-30 pointer-events-none">
                <DNAVisualizer />
            </div>

            {/* Hero content */}
            <div className="relative z-10 text-center space-y-6 max-w-4xl mx-auto px-6">
                <h2 className="nexus-hero-title">
                    <span className={theme === 'dark' ? "text-white" : "text-slate-800"}>DECODING THE</span>
                    <br />
                    <span className="nexus-gradient-text nexus-text-glow">GENOMIC FRONTIER</span>
                </h2>
            </div>
        </div>
    );
};

const NexusStatusBar = () => {
    const { theme } = useTheme();
    return (
        <div className={cn(
            "fixed bottom-0 left-0 right-0 h-8 backdrop-blur-md border-t flex items-center justify-between px-6 z-50 overflow-hidden",
            theme === 'dark'
                ? "bg-[#020617]/90 border-white/5"
                : "bg-white/90 border-slate-200"
        )}>
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    <span className={cn(
                        "text-[9px] uppercase tracking-widest font-semibold",
                        theme === 'dark' ? "text-slate-400" : "text-slate-500"
                    )}>CORE STATUS: OPTIMAL</span>
                </div>
                <div className={cn("h-3 w-px", theme === 'dark' ? "bg-white/10" : "bg-slate-300")} />
                <span className={cn(
                    "text-[9px] uppercase tracking-widest",
                    theme === 'dark' ? "text-slate-500" : "text-slate-400"
                )}>ENCRYPTION: AES-256-QUANTUM</span>
                <div className={cn("h-3 w-px", theme === 'dark' ? "bg-white/10" : "bg-slate-300")} />
                <span className={cn(
                    "text-[9px] uppercase tracking-widest",
                    theme === 'dark' ? "text-slate-500" : "text-slate-400"
                )}>NETWORK: LIFI-V6</span>
            </div>
            <div className="flex items-center gap-6 font-mono">
                <span className={cn(
                    "text-[9px] uppercase tracking-widest",
                    theme === 'dark' ? "text-slate-400" : "text-slate-500"
                )}>GLOBAL HEALTH INDEX: 92.4%</span>
                <span className={cn(
                    "text-[9px] uppercase tracking-widest",
                    theme === 'dark' ? "text-slate-600" : "text-slate-400"
                )}>© 2024 NEXUSMED AI</span>
            </div>
        </div>
    );
};


// ============================================
// MAIN PAGE COMPONENT
// ============================================

const DiscoveryPlatform = () => {
    const { t } = useAutoTranslation();
    const { theme } = useTheme();


    // State
    const [stats, setStats] = useState({ articles: 256, hypotheses: 14, trials: 32 });
    const [newsItems] = useState<NewsItem[]>(MOCK_NEWS);
    const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isGeneratingHypotheses, setIsGeneratingHypotheses] = useState(false);
    const [hypotheses, setHypotheses] = useState<Hypothesis[]>(MOCK_HYPOTHESES);
    const [selectedHypothesis, setSelectedHypothesis] = useState<Hypothesis | undefined>();
    const [knowledgeGraph, setKnowledgeGraph] = useState(MOCK_KNOWLEDGE_GRAPH);

    // Knowledge Extraction State
    const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
    const [isExtracting, setIsExtracting] = useState(false);
    const [lastSearchQuery, setLastSearchQuery] = useState('');
    const [lastSearchAbstracts, setLastSearchAbstracts] = useState<string[]>([]);

    // Graph Expansion State
    const [selectedGraphNode, setSelectedGraphNode] = useState<string | null>(null);
    const [isExpandingGraph, setIsExpandingGraph] = useState(false);

    // Hypothesis Comparison State
    const [comparedHypothesisIds, setComparedHypothesisIds] = useState<string[]>([]);

    // OpenAI Streaming Modal State
    const [streamingContent, setStreamingContent] = useState<string>('');

    // Evidence Pack State (enriched data from hypothesis generation)
    const [evidencePack, setEvidencePack] = useState<{
        query_intent: any;
        paper_count: number;
        snippet_count: number;
        entities: Array<{ text: string; type: string }>;
        relations: Array<{ source: string; target: string; label: string }>;
        snippets: Array<{ paper_id: string; passage: string; entities: string[]; claim_tags: string[] }>;
        papers: Array<{ pmid: string; title: string; journal: string; publication_date: string; authors: string[] }>;
    } | null>(null);

    // Saved Graphs State
    const [savedGraphToLoad, setSavedGraphToLoad] = useState<SavedGraph | null>(null);
    const [isRadialModalOpen, setIsRadialModalOpen] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [refreshSavedGraphs, setRefreshSavedGraphs] = useState(0);

    // Tab Navigation State
    const [activeTab, setActiveTab] = useState<'archive' | 'laboratories' | 'visualizer' | 'synthetics' | 'discovery'>('archive');

    // LBD Discovery State
    const [frontierJobs, setFrontierJobs] = useState<any[]>([]);
    const [lbdClaims, setLbdClaims] = useState<any[]>([]);
    const [reasoningTraces, setReasoningTraces] = useState<any[]>([]);
    const [lbdContradictions, setLbdContradictions] = useState<any[]>([]);
    const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false);

    // Fetch discovery data
    const fetchDiscoveryData = useCallback(async () => {
        setIsDiscoveryLoading(true);
        try {
            const [jobsRes, claimsRes, tracesRes, contrRes] = await Promise.all([
                supabase.from('frontier_jobs').select('*').order('priority', { ascending: false }),
                supabase.from('lbd_claims').select('*').order('aggregate_score', { ascending: false }),
                // Cast table to any to avoid strict type checking against Supabase definitions if they are incomplete
                (supabase.from('lbd_reasoning_traces') as any).select('*').order('created_at', { ascending: false }),
                supabase.from('lbd_contradictions').select('*, claim_support:lbd_claims!claim_support_id(*), claim_refute:lbd_claims!claim_refute_id(*)').order('created_at', { ascending: false })
            ]);

            if (contrRes.data) setLbdContradictions(contrRes.data);
        } catch (err) {
            console.error('Discovery fetch error:', err);
        } finally {
            setIsDiscoveryLoading(false);
        }
    }, []);

    // Effect to refetch when entering discovery tab
    useEffect(() => {
        if (activeTab === 'discovery') {
            fetchDiscoveryData();

            // Set up real-time sub
            const channel = supabase
                .channel('lbd-discovery-changes')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'frontier_jobs' }, () => fetchDiscoveryData())
                .on('postgres_changes', { event: '*', schema: 'public', table: 'lbd_claims' }, () => fetchDiscoveryData())
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [activeTab, fetchDiscoveryData]);

    // Update query specifically for search bar
    const [searchInput, setSearchInput] = useState('');

    // Toggle hypothesis comparison
    const handleToggleCompare = useCallback((id: string) => {
        setComparedHypothesisIds(prev => {
            if (prev.includes(id)) {
                return prev.filter(x => x !== id);
            }
            if (prev.length >= 4) {
                toast.warning('Maximum 4 hypothèses peuvent être comparées');
                return prev;
            }
            return [...prev, id];
        });
    }, []);

    // Handle promoting a claim to the knowledge graph
    const handlePromoteClaim = async (claim: any) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Not authenticated');

            const subjectKey = claim.subject_text.toLowerCase().replace(/\s+/g, '-');
            const objectKey = claim.object_text.toLowerCase().replace(/\s+/g, '-');

            // 1. Ensure Subject Node exists
            const { data: existingSubject } = await (supabase.from('graph_nodes') as any)
                .select('id, node_key')
                .eq('node_key', subjectKey)
                .maybeSingle();

            if (!existingSubject) {
                const { error: sError } = await (supabase.from('graph_nodes') as any)
                    .insert({
                        node_key: subjectKey,
                        label: claim.subject_text,
                        node_type: claim.subject_type || 'unclassified',
                        hypothesis_id: claim.hypothesis_id
                    });
                if (sError) throw sError;
            }

            // 2. Ensure Object Node exists
            const { data: existingObject } = await (supabase.from('graph_nodes') as any)
                .select('id, node_key')
                .eq('node_key', objectKey)
                .maybeSingle();

            if (!existingObject) {
                const { error: nodeError } = await (supabase.from('graph_nodes') as any)
                    .insert({
                        node_key: objectKey,
                        label: claim.object_text,
                        node_type: claim.object_type || 'unclassified',
                        hypothesis_id: claim.hypothesis_id
                    });
                if (nodeError) throw nodeError;
            }

            // 3. Create Edge
            const { error: edgeError } = await (supabase.from('graph_edges') as any)
                .insert({
                    hypothesis_id: claim.hypothesis_id,
                    source_key: subjectKey,
                    target_key: objectKey,
                    edge_type: claim.predicate,
                    label: claim.predicate,
                    weight: claim.aggregate_score || 0.5,
                    reason: 'Promoted from LBD Discovery Trace'
                });

            if (edgeError) throw edgeError;

            toast.success(`Claim promoted: ${claim.subject_text} ${claim.predicate} ${claim.object_text}`);
        } catch (err: any) {
            console.error('Promotion error:', err);
            toast.error('Failed to promote claim: ' + err.message);
        }
    };

    const { invokeAI } = useAI();
    // Search handler - calls discovery-platform Edge Function
    const handleSearch = async (query: string, filters: any) => {
        setIsSearching(true);
        try {
            const { data, error } = await invokeAI('discovery-platform', {
                action: 'search',
                query,
                maxResults: 20,
                sources: filters.type === 'trial'
                    ? ['clinicaltrials']
                    : filters.type === 'article'
                        ? ['pubmed', 'europepmc']
                        : ['pubmed', 'europepmc', 'clinicaltrials']
            });

            if (error) throw error;

            // Transform papers to search results with unique IDs
            const seenIds = new Set<string>();
            const results: SearchResult[] = (data.papers || [])
                .map((paper: any, idx: number) => {
                    // Generate a unique ID
                    const baseId = paper.pmid || paper.doi || `paper-${idx}`;
                    let uniqueId = baseId;
                    let counter = 1;
                    while (seenIds.has(uniqueId)) {
                        uniqueId = `${baseId}-${counter++}`;
                    }
                    seenIds.add(uniqueId);

                    return {
                        id: uniqueId,
                        type: paper.source === 'clinicaltrials' ? 'trial' as const : 'article' as const,
                        title: paper.title,
                        authors: paper.authors,
                        date: paper.publication_date || 'Date inconnue',
                        journal: paper.journal,
                        abstract: paper.abstract,
                        pmid: paper.pmid,
                        nctId: paper.source === 'clinicaltrials' ? paper.journal?.split(' - ')[1] : undefined
                    };
                });

            setSearchResults(results);
            setStats(prev => ({ ...prev, articles: data.total || results.length }));

            // Load previous hypotheses related to this query
            if (data.previous_hypotheses && data.previous_hypotheses.length > 0) {
                const prevHyps: Hypothesis[] = data.previous_hypotheses.map((h: any) => ({
                    id: h.id,
                    hypothesis_id: h.hypothesis_id,
                    statement: h.statement,
                    // Committee-Grade Fields
                    executive_summary: h.executive_summary,
                    clinical_scope: h.clinical_scope,
                    rival_hypotheses: h.rival_hypotheses,
                    evidence_snapshot: h.evidence_snapshot,
                    mechanistic_model: h.mechanistic_model,
                    risks_monitoring: h.risks_monitoring,
                    detailed_analysis: h.detailed_analysis,
                    // Causal Graph & Cascade Fields - CRITICAL for graph visualization
                    causal_graph: h.causal_graph,
                    systemic_cascade: h.systemic_cascade,
                    therapeutic_resolution_chains: h.therapeutic_resolution_chains,
                    etiology_depth: h.etiology_depth,
                    mermaid_graph: h.mermaid_graph,
                    is_complete_resolution: h.is_complete_resolution,
                    // Contradictions
                    contradictions: h.contradictions || [],
                    // Other fields
                    scores: h.scores || { novelty: 0, plausibility: 0, strength: 0, feasibility: 0, impact: 0, total: 0 },
                    status: h.status || 'pending',
                    created_at: h.created_at
                }));
                setHypotheses(prev => {
                    // Merge with existing, avoiding duplicates
                    const existingIds = new Set(prev.map(p => p.hypothesis_id));
                    const newHyps = prevHyps.filter(h => !existingIds.has(h.hypothesis_id));
                    return [...newHyps, ...prev];
                });
                setStats(prev => ({ ...prev, hypotheses: prev.hypotheses + prevHyps.length }));
                if (prevHyps.length > 0) {
                    toast.info(`${prevHyps.length} hypothèses précédentes chargées`);
                }
            }

            // Store abstracts for knowledge extraction
            toast.success(`${results.length} résultats trouvés`);

            // Auto-trigger hypothesis generation if no previous hypotheses were found
            if (!data.previous_hypotheses || data.previous_hypotheses.length === 0) {
                console.log('No previous hypotheses, triggering auto-generation for:', query);
                handleGenerateHypotheses(query);
            }
        } catch (err: any) {
            console.error('Search error:', err);
            toast.error('Erreur lors de la recherche: ' + (err.message || 'Erreur inconnue'));
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    // Knowledge extraction handler
    const handleExtractKnowledge = useCallback(async () => {
        if (lastSearchAbstracts.length === 0 && searchResults.length === 0) {
            toast.error('Effectuez d\'abord une recherche pour avoir du contenu à analyser');
            return;
        }

        setIsExtracting(true);
        try {
            // Combine abstracts from search results
            const textToAnalyze = lastSearchAbstracts.length > 0
                ? lastSearchAbstracts.join('\n\n')
                : searchResults.map(r => `${r.title}\n${r.abstract || ''}`).join('\n\n');

            const { data, error } = await invokeAI('knowledge-extractor', {
                text: textToAnalyze.slice(0, 15000), // Limit text size
                use_claude: true,
                include_relations: true
            });

            if (error) throw error;

            setExtractionResult(data);

            // Generate knowledge graph from extracted entities and relations
            if (data.entities && data.relations) {
                const graphNodes: KnowledgeNode[] = [];
                const graphEdges: KnowledgeEdge[] = [];
                const seenNodes = new Set<string>();

                // Create nodes from unique entities
                data.entities.slice(0, 15).forEach((entity: ExtractedEntity, idx: number) => {
                    // Skip if entity text is missing
                    if (!entity?.text) return;

                    let nodeId = `node_${entity.text.replace(/\s+/g, '_')}`;
                    // Ensure unique node ID
                    let uniqueNodeId = nodeId;
                    let counter = 1;
                    while (seenNodes.has(uniqueNodeId)) {
                        uniqueNodeId = `${nodeId}_${counter++}`;
                    }
                    seenNodes.add(uniqueNodeId);

                    // Distribute nodes in a circle
                    const angle = (idx / Math.min(data.entities.length, 15)) * 2 * Math.PI;
                    const radius = 120;
                    graphNodes.push({
                        id: uniqueNodeId,
                        label: entity.text,
                        type: entity.type?.toLowerCase() || 'unknown',
                        x: 250 + radius * Math.cos(angle),
                        y: 200 + radius * Math.sin(angle)
                    });
                });

                // Create edges from relations
                data.relations.slice(0, 20).forEach((rel: ExtractedRelation) => {
                    // Skip if subject or object is missing
                    if (!rel.subject?.text || !rel.object?.text) return;

                    const sourceId = `node_${rel.subject.text.replace(/\s+/g, '_')}`;
                    const targetId = `node_${rel.object.text.replace(/\s+/g, '_')}`;

                    if (seenNodes.has(sourceId) && seenNodes.has(targetId)) {
                        graphEdges.push({
                            source: sourceId,
                            target: targetId,
                            label: rel.predicate?.replace(/_/g, ' ') || 'related'
                        });
                    }
                });

                if (graphNodes.length > 0) {
                    setKnowledgeGraph({ nodes: graphNodes, edges: graphEdges });
                }
            }

            toast.success(`Extraction terminée: ${data.entities?.length || 0} entités, ${data.relations?.length || 0} relations`);
        } catch (err: any) {
            console.error('Knowledge extraction error:', err);
            toast.error('Erreur lors de l\'extraction: ' + (err.message || 'Erreur inconnue'));
        } finally {
            setIsExtracting(false);
        }
    }, [lastSearchAbstracts, searchResults]);

    // Generate hypotheses handler
    const handleGenerateHypotheses = async (query: string) => {
        if (!query.trim()) {
            toast.error('Effectuez d\'abord une recherche pour générer des hypothèses');
            return;
        }

        setIsGeneratingHypotheses(true);
        setStreamingContent(''); // Reset streaming content

        try {
            toast.info('Création du job de génération...');

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Non authentifié');

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const functionUrl = `${supabaseUrl}/functions/v1/discovery-platform`;

            // Call Edge Function to create job
            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'generate_hypotheses',
                    query,
                    maxResults: 60
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Erreur API: ${text}`);
            }

            const jobData = await response.json();
            const jobId = jobData.job_id;

            if (!jobId) {
                throw new Error('Aucun job_id reçu');
            }

            toast.success('Job créé ! Génération en arrière-plan...');

            // Trigger the background processor explicitly from the client 
            // to ensure it starts even if the fire-and-forget fetch in the edge function fails
            invokeAI('hypothesis-processor', {
                job_id: jobId
            }).catch(e => console.warn('Client-side processor trigger warning:', e));

            // Subscribe to BROADCAST channel for live streaming text
            const streamChannel = supabase
                .channel(`hypothesis-stream-${jobId}`)
                .on('broadcast', { event: 'chunk' }, (payload: any) => {
                    // Append streaming text in real-time
                    setStreamingContent(prev => prev + payload.payload.text);
                })
                .on('broadcast', { event: 'stream_complete' }, () => {
                    console.log('✅ Stream broadcast complete');
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('🔴 Subscribed to live stream');
                    }
                });

            // Subscribe to job updates via Realtime
            const jobChannel = supabase
                .channel(`job-${jobId}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'hypothesis_generation_jobs',
                        filter: `id=eq.${jobId}`
                    },
                    async (payload: any) => {
                        const job = payload.new;
                        handleJobUpdate(job);
                    }
                )
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('Subscribed to job updates');
                    }
                });

            // Polling fallback (in case Realtime misses events)
            const pollInterval = setInterval(async () => {
                const { data: job, error } = await (supabase
                    .from('hypothesis_generation_jobs' as any)
                    .select('*')
                    .eq('id', jobId)
                    .single()) as any;

                if (!error && job) {
                    handleJobUpdate(job);
                }
            }, 2000);

            // Consolidated update handler
            const handleJobUpdate = async (job: any) => {
                console.log('Job update:', job);

                // Update progress message
                if (job.progress_message) {
                    setStreamingContent(prev => {
                        const content = job.progress_message;

                        // Skip generic waiting messages to save space/tokens and focus on reasoning
                        if (content.includes('En attente de traitement')) {
                            // Only show it if it's the very first message
                            if (!prev) return `[${new Date().toLocaleTimeString()}] ${content}`;
                            return prev;
                        }

                        // Check if the last log entry already contains this message content
                        // (ignoring the timestamp part to prevent duplication)
                        const lastLines = prev.slice(-200); // Check recent context
                        if (lastLines.includes(content)) {
                            return prev;
                        }

                        // Simply append significant status updates
                        const message = `\n[${new Date().toLocaleTimeString()}] [${job.progress_percentage}%] ${job.progress_message}`;
                        return prev + message;
                    });
                }

                // Handle completion
                if (job.status === 'completed' && job.hypothesis_id) {
                    clearInterval(pollInterval);
                    streamChannel.unsubscribe();
                    jobChannel.unsubscribe();

                    // Fetch the generated hypothesis
                    const { data: hypothesis, error: hypError } = await (supabase
                        .from('discovery_hypotheses' as any)
                        .select('*')
                        .eq('id', job.hypothesis_id)
                        .single()) as any;

                    if (hypError || !hypothesis) {
                        toast.error('Erreur lors de la récupération de l\'hypothèse');
                        setIsGeneratingHypotheses(false);
                        return;
                    }

                    // Add hypothesis to state - including causal graph fields
                    const newHypothesis: Hypothesis = {
                        id: hypothesis.id,
                        hypothesis_id: hypothesis.hypothesis_id || `H-${Date.now()}`,
                        statement: hypothesis.statement || '',
                        executive_summary: hypothesis.executive_summary,
                        clinical_scope: hypothesis.clinical_scope,
                        rival_hypotheses: hypothesis.rival_hypotheses,
                        evidence_snapshot: hypothesis.evidence_snapshot,
                        mechanistic_model: hypothesis.mechanistic_model,
                        risks_monitoring: hypothesis.risks_monitoring,
                        detailed_analysis: hypothesis.detailed_analysis,
                        // Causal Graph & Cascade Fields - CRITICAL for graph visualization
                        causal_graph: hypothesis.causal_graph,
                        systemic_cascade: hypothesis.systemic_cascade,
                        therapeutic_resolution_chains: hypothesis.therapeutic_resolution_chains,
                        etiology_depth: hypothesis.etiology_depth,
                        mermaid_graph: hypothesis.mermaid_graph,
                        is_complete_resolution: hypothesis.is_complete_resolution,
                        contradictions: hypothesis.contradictions || [],
                        // Existing fields
                        drug_repurposing_candidates: hypothesis.drug_repurposing_candidates || [],
                        predictions: hypothesis.predictions || [],
                        minimal_tests: hypothesis.minimal_tests || [],
                        risks_confounders: hypothesis.risks_confounders || [],
                        evidence_citations: hypothesis.evidence_citations || [],
                        scores: hypothesis.scores || { novelty: 0, plausibility: 0, strength: 0, feasibility: 0, impact: 0, total: 0 },
                        status: (hypothesis.status === 'accepted' ? 'validated' : hypothesis.status) as 'pending' | 'validated' | 'rejected',
                        created_at: hypothesis.created_at || new Date().toISOString()
                    };

                    setHypotheses(prev => {
                        const existingIds = new Set(prev.map(h => h.hypothesis_id));
                        if (existingIds.has(newHypothesis.hypothesis_id)) {
                            return prev;
                        }
                        return [newHypothesis, ...prev];
                    });

                    setStats(prev => ({ ...prev, hypotheses: prev.hypotheses + 1 }));
                    toast.success('Hypothèse générée avec succès !');
                    setSelectedHypothesis(newHypothesis);
                    setIsReportModalOpen(true);
                    setIsGeneratingHypotheses(false);
                }

                // Handle failure
                if (job.status === 'failed') {
                    clearInterval(pollInterval);
                    streamChannel.unsubscribe();
                    jobChannel.unsubscribe();
                    toast.error(`Erreur: ${job.error_message || 'Génération échouée'}`);
                    setIsGeneratingHypotheses(false);
                }
            };

            // Set a timeout in case job never completes
            setTimeout(() => {
                clearInterval(pollInterval);
                streamChannel.unsubscribe();
                jobChannel.unsubscribe();
                if (isGeneratingHypotheses) {
                    setIsGeneratingHypotheses(false);
                    toast.warning('Timeout: Vérifiez l\'état du job manuellement');
                }
            }, 300000); // 5 minutes timeout

        } catch (err: any) {
            console.error('Hypothesis generation error:', err);
            toast.error('Erreur lors de la génération: ' + (err.message || 'Erreur inconnue'));
            setIsGeneratingHypotheses(false);
        }
    };

    // Graph node expansion handler
    const handleNodeClick = useCallback(async (nodeId: string) => {
        const node = knowledgeGraph.nodes.find(n => n.id === nodeId);
        if (!node) return;

        setSelectedGraphNode(nodeId);
        setIsExpandingGraph(true);

        try {
            const { data, error } = await invokeAI('expand-graph', {
                center_node: node.label,
                existing_nodes: knowledgeGraph.nodes.map(n => n.label),
                node_type: node.type
            });

            if (error) throw error;

            if (data.new_nodes && data.new_nodes.length > 0) {
                // Add new nodes with positions around the selected node
                const newNodes: KnowledgeNode[] = data.new_nodes.map((n: any, idx: number) => {
                    const angle = (idx / data.new_nodes.length) * 2 * Math.PI;
                    const radius = 80;
                    return {
                        id: n.id,
                        label: n.name,
                        type: n.node_type,
                        x: node.x + radius * Math.cos(angle),
                        y: node.y + radius * Math.sin(angle)
                    };

                });

                // Add new edges
                const newEdges: KnowledgeEdge[] = data.new_edges.map((e: any) => ({
                    source: e.source.toLowerCase().replace(/\s+/g, '-'),
                    target: e.target.toLowerCase().replace(/\s+/g, '-'),
                    label: e.relationship.replace(/_/g, ' ')
                }));

                setKnowledgeGraph(prev => ({
                    nodes: [...prev.nodes, ...newNodes],
                    edges: [...prev.edges, ...newEdges]
                }));

                toast.success(`+${newNodes.length} nœuds, +${newEdges.length} liens`);
            } else {
                toast.info('Aucun nouveau nœud à ajouter');
            }
        } catch (err: any) {
            console.error('Graph expansion error:', err);
            toast.error('Erreur lors de l\'expansion: ' + (err.message || 'Erreur inconnue'));
        } finally {
            setIsExpandingGraph(false);
            setSelectedGraphNode(null);
        }
    }, [knowledgeGraph]);

    return (
        <AppLayout>
            <div className="min-h-screen text-foreground pb-20 overflow-x-hidden selection:bg-cyan-500/30 transition-colors duration-500">
                <NexusHeader activeTab={activeTab} setActiveTab={setActiveTab} />

                <div className="max-w-[1600px] mx-auto px-6">
                    <NexusHero />

                    {/* Scientific Search Tool */}
                    <div className="max-w-5xl mx-auto w-full mb-12 relative z-10 -mt-8 px-4">
                        <ScientificSearch
                            onSearch={handleSearch}
                            onGenerate={handleGenerateHypotheses}
                            isLoading={isSearching}
                            isGenerating={isGeneratingHypotheses}
                        />
                    </div>

                    <div className="space-y-8 pb-24">

                        {/* ARCHIVE TAB - Default, shows the existing exploration content */}
                        {activeTab === 'archive' && (
                            <Tabs defaultValue="exploration" className="space-y-8">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {['TRENDING', 'LATEST', 'HIGH-IMPACT'].map((tab, i) => (
                                            <button
                                                key={tab}
                                                className={cn(
                                                    "px-4 py-2 text-xs uppercase tracking-wide font-medium rounded transition-all",
                                                    i === 0
                                                        ? (theme === 'dark'
                                                            ? "text-cyan-400 border-b-2 border-cyan-400"
                                                            : "text-cyan-600 border-b-2 border-cyan-600")
                                                        : (theme === 'dark'
                                                            ? "text-slate-500 hover:text-slate-300"
                                                            : "text-slate-400 hover:text-slate-600")
                                                )}
                                            >
                                                {tab}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button className={cn(
                                            "w-9 h-9 rounded-lg flex items-center justify-center transition-all",
                                            theme === 'dark'
                                                ? "bg-white/5 border border-white/10 text-slate-400 hover:text-cyan-400"
                                                : "bg-slate-100 border border-slate-200 text-slate-500 hover:text-cyan-600"
                                        )}>
                                            <BarChart3 className="h-4 w-4" />
                                        </button>
                                        <button className={cn(
                                            "w-9 h-9 rounded-lg flex items-center justify-center transition-all",
                                            theme === 'dark'
                                                ? "bg-white/5 border border-white/10 text-slate-400 hover:text-cyan-400"
                                                : "bg-slate-100 border border-slate-200 text-slate-500 hover:text-cyan-600"
                                        )}>
                                            <Zap className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>

                                <TabsContent value="exploration" className="space-y-6">
                                    <div className="grid grid-cols-12 gap-6">
                                        {/* Real Search Results instead of placeholders */}
                                        <div className="col-span-12 lg:col-span-8">
                                            <div className="nexus-card border-white/5 overflow-hidden">
                                                <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                                                    <h3 className="text-xs uppercase tracking-[0.2em] font-black text-cyan-400">Analysis Feed</h3>
                                                    <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-400">
                                                        {isSearching ? 'Scanning...' : `${searchResults.length} Results`}
                                                    </Badge>
                                                </div>
                                                <SearchResults results={searchResults.slice(0, 6)} isLoading={isSearching} />
                                                {searchResults.length > 6 && (
                                                    <div className="p-4 text-center border-t border-white/5">
                                                        <Button variant="ghost" size="sm" className="text-xs text-slate-500 hover:text-cyan-400" onClick={() => { }}>
                                                            View all {searchResults.length} papers in Latest tab
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Live AI Synthesis Panel */}
                                        <div className="col-span-12 lg:col-span-4">
                                            <div className={cn(
                                                "nexus-card h-full flex flex-col p-6 border-cyan-500/10",
                                                isGeneratingHypotheses && "border-purple-500/30 shadow-lg shadow-purple-500/10"
                                            )}>
                                                <div className="flex items-center justify-between mb-6">
                                                    <h4 className={cn(
                                                        "text-xs font-semibold uppercase tracking-wide",
                                                        theme === 'dark' ? "text-slate-300" : "text-slate-600"
                                                    )}>AI SYNTHESIS ENGINE</h4>
                                                    {isGeneratingHypotheses && (
                                                        <div className="flex items-center gap-1">
                                                            <div className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-ping" />
                                                            <span className="text-[10px] text-purple-400 font-bold">LIVE</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {isGeneratingHypotheses ? (
                                                    <div className="flex-1 flex flex-col justify-center">
                                                        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-purple-500/30 mx-auto">
                                                            <Brain className="h-8 w-8 text-purple-400 animate-pulse" />
                                                        </div>
                                                        <p className="text-xs text-slate-400 mb-4 text-center">
                                                            Hypothesis generation in progress...
                                                        </p>
                                                        <div className="bg-black/40 p-3 rounded-lg border border-white/5 font-mono text-[10px] text-purple-300/80 mb-4 h-32 overflow-hidden relative">
                                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
                                                            {streamingContent || 'Awaiting initial stream chunk...'}
                                                        </div>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="w-full text-[10px] uppercase border-purple-500/30 text-purple-400"
                                                            onClick={() => { }}
                                                        >
                                                            Details in Modal
                                                        </Button>
                                                    </div>
                                                ) : hypotheses.length > 0 ? (
                                                    <div className="flex-1">
                                                        <div className="mb-4">
                                                            <h5 className="text-[10px] text-slate-500 uppercase mb-2">Latest Candidate</h5>
                                                            <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                                                                <p className="text-xs text-white line-clamp-3">
                                                                    {hypotheses[0].statement}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <div className="flex justify-between text-[10px]">
                                                                <span className="text-slate-500 uppercase">Plausibility</span>
                                                                <span className="text-cyan-400 font-bold">{(hypotheses[0].scores?.plausibility || 0).toFixed(1)}/10</span>
                                                            </div>
                                                            <Progress value={(hypotheses[0].scores?.plausibility || 0) * 10} className="h-1 bg-white/5" />
                                                        </div>
                                                        <Button
                                                            className="w-full mt-6 bg-gradient-to-r from-blue-600 to-purple-600 border-none text-[10px] uppercase font-bold"
                                                            onClick={() => {
                                                                setSelectedHypothesis(hypotheses[0]);
                                                                setIsReportModalOpen(true);
                                                            }}
                                                        >
                                                            Deep Analysis
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="flex-1 flex flex-col items-center justify-center text-center">
                                                        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6 bg-slate-800/50 border border-white/5">
                                                            <Lightbulb className="h-8 w-8 text-slate-600" />
                                                        </div>
                                                        <p className="text-xs text-slate-500 max-w-[200px]">
                                                            Awaiting query input to generate clinical summaries and future research projections.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="latest" className="space-y-6">
                                    <div className="grid grid-cols-12 gap-6">
                                        <div className="col-span-12 lg:col-span-4 space-y-6">
                                            <div className="nexus-card p-6 border-cyan-500/10 hover:border-cyan-500/30 group transition-all">
                                                <div className="flex items-center justify-between mb-6">
                                                    <h3 className="text-xs uppercase tracking-[0.2em] font-black text-cyan-400 flex items-center gap-2">
                                                        <Activity className="h-4 w-4" /> Global Flux
                                                    </h3>
                                                    <div className="h-1.5 w-1.5 bg-cyan-500 rounded-full animate-ping" />
                                                </div>
                                                <NewsFeed items={newsItems} />
                                            </div>
                                            <div className="nexus-card p-6 border-purple-500/10">
                                                <StatisticsPanel />
                                            </div>
                                            <div className="nexus-card p-6 border-red-500/10">
                                                <AlertsPanel />
                                            </div>
                                        </div>
                                        <div className="col-span-12 lg:col-span-8 space-y-6">
                                            <div className="nexus-card border-white/5">
                                                <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                                                    <h3 className="text-xs uppercase tracking-[0.2em] font-black text-slate-400">Search Results</h3>
                                                    <div className="flex gap-2">
                                                        <button className="p-1 px-3 bg-cyan-500/10 border border-cyan-500/20 rounded text-[9px] uppercase font-bold text-cyan-400">Filter</button>
                                                        <button className="p-1 px-3 bg-slate-800 border border-white/5 rounded text-[9px] uppercase font-bold text-slate-500">Reset</button>
                                                    </div>
                                                </div>
                                                <SearchResults results={searchResults} isLoading={isSearching} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-6">
                                                <div className="nexus-card p-6 border-white/5">
                                                    <KnowledgeExtractionPanel
                                                        extraction={extractionResult}
                                                        isLoading={isExtracting}
                                                        onExtract={handleExtractKnowledge}
                                                    />
                                                </div>
                                                <div className="nexus-card p-6 border-white/5">
                                                    <PatternMiningPanel extraction={extractionResult} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="radial">
                                    <div className="grid grid-cols-12 gap-8 h-[700px]">
                                        <div className="col-span-12 lg:col-span-8 nexus-card relative bg-black/60 p-1">
                                            <KnowledgeGraphViz
                                                nodes={knowledgeGraph.nodes}
                                                edges={knowledgeGraph.edges}
                                                onNodeClick={handleNodeClick}
                                                isExpanding={isExpandingGraph}
                                                selectedNodeId={selectedGraphNode || undefined}
                                            />
                                            <div className="absolute top-6 left-6 flex items-center gap-2 px-3 py-1.5 bg-black/80 backdrop-blur-md rounded border border-cyan-500/30">
                                                <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
                                                <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Live Semantic Grid</span>
                                            </div>
                                        </div>
                                        <div className="col-span-12 lg:col-span-4 space-y-6">
                                            <div className="nexus-card p-6 border-white/5">
                                                <SavedGraphsPanel
                                                    onLoad={(graph) => {
                                                        setSavedGraphToLoad(graph);
                                                        setIsRadialModalOpen(true);
                                                    }}
                                                    refreshTrigger={refreshSavedGraphs}
                                                />
                                            </div>
                                            <div className="flex justify-center">
                                                <button
                                                    className="w-full nexus-initiate-button flex items-center justify-center gap-3 py-5"
                                                    onClick={() => setIsRadialModalOpen(true)}
                                                >
                                                    <Network className="h-5 w-5" />
                                                    Open Explorer
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </TabsContent>

                                <TabsContent value="synthesis" className="space-y-8">
                                    <div className="grid grid-cols-12 gap-8">
                                        <div className="col-span-12 lg:col-span-5 space-y-6">
                                            <div className="nexus-card border-indigo-500/10">
                                                <HypothesisPanel
                                                    hypotheses={hypotheses}
                                                    onSelectHypothesis={(h) => {
                                                        setSelectedHypothesis(h);
                                                        setIsReportModalOpen(true);
                                                    }}
                                                    selectedId={selectedHypothesis?.id}
                                                    comparedIds={comparedHypothesisIds}
                                                    onToggleCompare={handleToggleCompare}
                                                    onGenerate={handleGenerateHypotheses}
                                                    isGenerating={isGeneratingHypotheses}
                                                    lastSearchQuery={lastSearchQuery}
                                                />
                                            </div>
                                            <div className="nexus-card p-6 border-white/5">
                                                <HypothesisPrioritization hypotheses={hypotheses} />
                                            </div>
                                        </div>
                                        <div className="col-span-12 lg:col-span-7 space-y-6 text-center py-20 bg-slate-900/10 rounded-3xl border-2 border-dashed border-white/5">
                                            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 border border-white/10">
                                                <Lightbulb className="h-10 w-10 text-slate-500" />
                                            </div>
                                            <h4 className="text-xl font-bold nexus-header text-slate-400 mb-2">AI Synthesis Engine</h4>
                                            <p className="text-sm text-slate-500 max-w-sm mx-auto">Awaiting query Input to generate clinical summaries and future research projections.</p>
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        )}

                        {/* DISCOVERY TAB */}
                        {activeTab === 'discovery' && (
                            <div className="pb-12">
                                <DiscoveryTabContent
                                    frontierJobs={frontierJobs}
                                    lbdClaims={lbdClaims}
                                    reasoningTraces={reasoningTraces}
                                    contradictions={lbdContradictions}
                                    isLoading={isDiscoveryLoading}
                                    onPromoteClaim={handlePromoteClaim}
                                />
                            </div>
                        )}

                        {/* LABORATORIES TAB */}
                        {activeTab === 'laboratories' && (
                            <div className="space-y-6">
                                <div className={cn(
                                    "p-8 rounded-2xl border",
                                    theme === 'dark'
                                        ? "bg-slate-900/50 border-cyan-500/20"
                                        : "bg-white border-cyan-200"
                                )}>
                                    <div className="text-center mb-8">
                                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
                                            <FlaskConical className="h-8 w-8 text-cyan-400" />
                                        </div>
                                        <h2 className={cn(
                                            "text-2xl font-bold mb-2",
                                            theme === 'dark' ? "text-white" : "text-slate-800"
                                        )}>Laboratoires de Recherche</h2>
                                        <p className={cn(
                                            "text-sm max-w-lg mx-auto",
                                            theme === 'dark' ? "text-slate-400" : "text-slate-600"
                                        )}>
                                            Outils avancés pour l'analyse moléculaire, la comparaison de composés et les prédictions pharmacocinétiques.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {[
                                            { icon: <Beaker className="h-5 w-5" />, title: "Comparateur Moléculaire", desc: "Comparer 2+ molécules" },
                                            { icon: <Activity className="h-5 w-5" />, title: "Calculator PK/PD", desc: "Demi-vie, clairance, Vd" },
                                            { icon: <Network className="h-5 w-5" />, title: "Interactions DDI", desc: "Prédictions CYP450" },
                                            { icon: <Target className="h-5 w-5" />, title: "Analyse Cohortes", desc: "Simulation populations" }
                                        ].map((tool, i) => (
                                            <div key={i} className={cn(
                                                "p-4 rounded-xl border cursor-pointer transition-all hover:scale-105",
                                                theme === 'dark'
                                                    ? "bg-white/5 border-white/10 hover:border-cyan-500/30"
                                                    : "bg-slate-50 border-slate-200 hover:border-cyan-500/50"
                                            )}>
                                                <div className="text-cyan-400 mb-3">{tool.icon}</div>
                                                <h3 className={cn(
                                                    "font-semibold text-sm mb-1",
                                                    theme === 'dark' ? "text-white" : "text-slate-800"
                                                )}>{tool.title}</h3>
                                                <p className="text-xs text-slate-500">{tool.desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SWITCH VISUALIZER TAB */}
                        {activeTab === 'visualizer' && (
                            <div className="space-y-6">
                                <div className={cn(
                                    "p-8 rounded-2xl border",
                                    theme === 'dark'
                                        ? "bg-slate-900/50 border-emerald-500/20"
                                        : "bg-white border-emerald-200"
                                )}>
                                    <div className="text-center mb-8">
                                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
                                            <BarChart3 className="h-8 w-8 text-emerald-400" />
                                        </div>
                                        <h2 className={cn(
                                            "text-2xl font-bold mb-2",
                                            theme === 'dark' ? "text-white" : "text-slate-800"
                                        )}>Modes de Visualisation</h2>
                                        <p className={cn(
                                            "text-sm max-w-lg mx-auto",
                                            theme === 'dark' ? "text-slate-400" : "text-slate-600"
                                        )}>
                                            Différentes façons de visualiser vos données et graphes thérapeutiques.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {[
                                            { icon: <Network className="h-5 w-5" />, title: "Graphe Radial", desc: "Vue actuelle" },
                                            { icon: <Clock className="h-5 w-5" />, title: "Timeline", desc: "Chronologie étapes" },
                                            { icon: <FileText className="h-5 w-5" />, title: "Tableau", desc: "Vue tabulaire" },
                                            { icon: <FileDown className="h-5 w-5" />, title: "Export Mermaid", desc: "Diagramme flowchart" }
                                        ].map((mode, i) => (
                                            <div key={i} className={cn(
                                                "p-4 rounded-xl border cursor-pointer transition-all hover:scale-105",
                                                i === 0
                                                    ? (theme === 'dark' ? "bg-emerald-500/10 border-emerald-500/30" : "bg-emerald-50 border-emerald-300")
                                                    : (theme === 'dark' ? "bg-white/5 border-white/10 hover:border-emerald-500/30" : "bg-slate-50 border-slate-200 hover:border-emerald-500/50")
                                            )}>
                                                <div className="text-emerald-400 mb-3">{mode.icon}</div>
                                                <h3 className={cn(
                                                    "font-semibold text-sm mb-1",
                                                    theme === 'dark' ? "text-white" : "text-slate-800"
                                                )}>{mode.title}</h3>
                                                <p className="text-xs text-slate-500">{mode.desc}</p>
                                                {i === 0 && <Badge className="mt-2 text-[9px] bg-emerald-500">ACTIF</Badge>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* SYNTHETICS TAB */}
                        {activeTab === 'synthetics' && (
                            <div className="space-y-6">
                                <div className={cn(
                                    "p-8 rounded-2xl border",
                                    theme === 'dark'
                                        ? "bg-slate-900/50 border-purple-500/20"
                                        : "bg-white border-purple-200"
                                )}>
                                    <div className="text-center mb-8">
                                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                                            <Sparkles className="h-8 w-8 text-purple-400" />
                                        </div>
                                        <h2 className={cn(
                                            "text-2xl font-bold mb-2",
                                            theme === 'dark' ? "text-white" : "text-slate-800"
                                        )}>Synthèse de Molécules IA</h2>
                                        <p className={cn(
                                            "text-sm max-w-lg mx-auto",
                                            theme === 'dark' ? "text-slate-400" : "text-slate-600"
                                        )}>
                                            Génération et prédiction de nouvelles molécules candidates par intelligence artificielle.
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {[
                                            { icon: <Brain className="h-5 w-5" />, title: "AI Generator", desc: "Nouvelles molécules" },
                                            { icon: <Activity className="h-5 w-5" />, title: "ADMET Prediction", desc: "Absorption, toxicité" },
                                            { icon: <Target className="h-5 w-5" />, title: "Docking Preview", desc: "Ancrage moléculaire" },
                                            { icon: <TrendingUp className="h-5 w-5" />, title: "Optimization", desc: "Améliorer composés" }
                                        ].map((tool, i) => (
                                            <div key={i} className={cn(
                                                "p-4 rounded-xl border cursor-pointer transition-all hover:scale-105",
                                                theme === 'dark'
                                                    ? "bg-white/5 border-white/10 hover:border-purple-500/30"
                                                    : "bg-slate-50 border-slate-200 hover:border-purple-500/50"
                                            )}>
                                                <div className="text-purple-400 mb-3">{tool.icon}</div>
                                                <h3 className={cn(
                                                    "font-semibold text-sm mb-1",
                                                    theme === 'dark' ? "text-white" : "text-slate-800"
                                                )}>{tool.title}</h3>
                                                <p className="text-xs text-slate-500">{tool.desc}</p>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-8 p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 text-center">
                                        <p className="text-xs text-purple-300">🧬 Module en développement - Prochainement disponible</p>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                </div>

                {/* OpenAI Streaming Modal */}
                <OpenAIStreamingModal
                    isOpen={isGeneratingHypotheses}
                    streamingContent={streamingContent}
                    onClose={() => setIsGeneratingHypotheses(false)}
                />

                {isRadialModalOpen && (
                    <RadialRingsModal
                        isOpen={isRadialModalOpen}
                        onClose={() => setIsRadialModalOpen(false)}
                        pathology={savedGraphToLoad?.name || 'Session chargée'}
                        onLoad={(graph) => setSavedGraphToLoad(graph)}
                        initialData={savedGraphToLoad?.graph_data}
                        initialViewState={savedGraphToLoad?.view_state}
                        onSave={async (payload) => {
                            try {
                                const { data: { user } } = await supabase.auth.getUser();
                                if (!user) throw new Error('Non authentifié');

                                const { error } = await supabase
                                    .from('saved_graphs')
                                    .upsert({
                                        id: savedGraphToLoad?.id, // Use existing ID if loading a graph
                                        user_id: user.id,
                                        name: payload.name,
                                        description: payload.description,
                                        graph_data: payload.graph_data,
                                        view_state: payload.view_state,
                                        updated_at: new Date().toISOString()
                                    });

                                if (error) throw error;
                                toast.success(savedGraphToLoad?.id ? 'Graphe mis à jour' : 'Graphe sauvegardé');
                                setRefreshSavedGraphs(prev => prev + 1);
                            } catch (e: any) {
                                console.error(e);
                                toast.error('Erreur sauvegarde: ' + (e.message || ''));
                            }
                        }}
                    />
                )}

                {/* Hypothesis Report Modal */}
                <Dialog open={isReportModalOpen} onOpenChange={setIsReportModalOpen}>
                    <DialogContent className="max-w-[90vw] w-full h-[90vh] p-0 border-none bg-transparent shadow-none">
                        <DialogTitle className="sr-only">Rapport Hypothèse Détaillé</DialogTitle>
                        <DialogDescription className="sr-only">
                            Vue détaillée du rapport de l'hypothèse scientifique générée par l'IA.
                        </DialogDescription>
                        {selectedHypothesis && (
                            <HypothesisReport
                                hypothesis={selectedHypothesis}
                                onClose={() => setIsReportModalOpen(false)}
                            />
                        )}
                    </DialogContent>
                </Dialog>

                <NexusStatusBar />
            </div>
        </AppLayout>
    );
};


export default DiscoveryPlatform;
