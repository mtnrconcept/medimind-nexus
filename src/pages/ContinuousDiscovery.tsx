import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import {
    Brain, Zap, Network, AlertTriangle, CheckCircle2,
    XCircle, Clock, TrendingUp, Filter, RefreshCw, Loader2,
    Lightbulb, ChevronRight, Activity, Play, Square, Sparkles, Database, FlaskConical, Pause, Crosshair, History, Search, Pill, Beaker, Stethoscope, BookOpen
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import DiscoveryCard from '@/components/cde/DiscoveryCard';
import KnowledgeGraphView from '@/components/cde/KnowledgeGraphView';
import FocusedResearchPanel from '@/components/cde/FocusedResearchPanel';
import ResearchHistoryPanel from '@/components/cde/ResearchHistoryPanel';
import TreatmentTools from '@/components/cde/TreatmentTools';
import DiscoveryEnginePanel from '@/components/cde/DiscoveryEnginePanel';
import NeuralNetworkGraph from '@/components/cde/NeuralNetworkGraph';
import RadialRingsModal from '@/components/cde/RadialRingsModal';
import useMedicalStats from '@/hooks/useMedicalStats';

// Types
interface DiscoveryCardData {
    id: string;
    title: string;
    hypothesis: string;
    reasoning_chain: any[];
    novelty: string;
    evidence_level: string;
    severity_score: number;
    plausibility_score: number;
    status: string;
    sources: any[];
    recommended_actions: string[];
    created_at: string;
    reviewed_at: string | null;
    reviewed_by: string | null;
}

interface KGStats {
    total_nodes: number;
    total_edges: number;
    node_types: Record<string, number>;
    edge_types: Record<string, number>;
}

const ContinuousDiscovery = () => {
    const { t } = useAutoTranslation();
    const [searchParams] = useSearchParams();
    const urlTab = searchParams.get('tab');

    const [isLoading, setIsLoading] = useState(false);
    const [isSeedingKG, setIsSeedingKG] = useState(false);
    const [isEnriching, setIsEnriching] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [discoveries, setDiscoveries] = useState<DiscoveryCardData[]>([]);
    const [kgStats, setKgStats] = useState<KGStats | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [activeTab, setActiveTab] = useState(urlTab || 'analyze');
    const [analysisOutput, setAnalysisOutput] = useState<string>('');
    const abortControllerRef = useRef<AbortController | null>(null);
    const outputRef = useRef<HTMLDivElement>(null);


    // NEW: Medical Stats from APIs (OpenFDA, ICD-10, DrugBank)
    const { stats: medicalStats, loading: statsLoading } = useMedicalStats();

    // Systematic analysis state
    const [systematicRun, setSystematicRun] = useState<any>(null);
    const [isSystematicRunning, setIsSystematicRunning] = useState(false);
    const [systematicProgress, setSystematicProgress] = useState('');
    const [systematicDiscoveries, setSystematicDiscoveries] = useState<any[]>([]);
    // NEW: Research workflow details
    const [researchSteps, setResearchSteps] = useState<any[]>([]);
    const [currentPrompt, setCurrentPrompt] = useState('');
    const [currentAnalysis, setCurrentAnalysis] = useState<any[]>([]);
    const [showResearchDetails, setShowResearchDetails] = useState(true);
    // Radial rings state
    const [isRadialModalOpen, setIsRadialModalOpen] = useState(false);
    const [radialQueries, setRadialQueries] = useState<string[]>([]);
    const [radialQueryInput, setRadialQueryInput] = useState('');

    // Load discoveries and stats
    const loadData = async () => {
        setIsLoading(true);
        try {
            // Load discovery cards
            let query = supabase
                .from('discovery_cards')
                .select('*')
                .order('created_at', { ascending: false });

            if (statusFilter !== 'all') {
                query = query.eq('status', statusFilter);
            }

            const { data: cards, error: cardsError } = await query;
            if (cardsError) throw cardsError;
            setDiscoveries(cards || []);

            // Load KG stats
            const { data: nodes } = await supabase
                .from('cde_nodes')
                .select('node_type');

            const { data: edges } = await supabase
                .from('cde_edges')
                .select('relationship_type');

            if (nodes && edges) {
                const nodeTypes: Record<string, number> = {};
                nodes.forEach(n => {
                    nodeTypes[n.node_type] = (nodeTypes[n.node_type] || 0) + 1;
                });

                const edgeTypes: Record<string, number> = {};
                edges.forEach(e => {
                    edgeTypes[e.relationship_type] = (edgeTypes[e.relationship_type] || 0) + 1;
                });

                setKgStats({
                    total_nodes: nodes.length,
                    total_edges: edges.length,
                    node_types: nodeTypes,
                    edge_types: edgeTypes
                });
            }
        } catch (err) {
            console.error('Error loading CDE data:', err);
            toast.error(t('Erreur lors du chargement des données'));
        } finally {
            setIsLoading(false);
        }
    };

    // Seed Knowledge Graph
    const handleSeedKG = async () => {
        setIsSeedingKG(true);
        try {
            const { data, error } = await supabase.rpc('seed_cde_knowledge_graph');
            if (error) throw error;
            toast.success(`Knowledge Graph peuplé: ${data?.nodes_created || 0} nœuds, ${data?.edges_created || 0} arêtes`);
            await loadData();
        } catch (err: any) {
            console.error('Error seeding KG:', err);
            toast.error(err.message || t('Erreur lors du seeding du Knowledge Graph'));
        } finally {
            setIsSeedingKG(false);
        }
    };

    // Enrich medications with Firecrawl
    const handleEnrichMedications = async () => {
        setIsEnriching(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Vous devez être connecté');

            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/medical-scraper`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ action: 'enrich-medications', options: { limit: 20 } }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Erreur enrichissement');

            toast.success(`Médicaments enrichis: ${result.enrichedCount?.updated || 0} mis à jour`);
            await loadData(); // Reload to show updated stats
        } catch (err: any) {
            console.error('Error enriching medications:', err);
            toast.error(err.message || 'Erreur lors de l\'enrichissement');
        } finally {
            setIsEnriching(false);
        }
    };

    // Start AI Analysis with streaming
    const handleStartAnalysis = async () => {
        if (isAnalyzing) {
            // Stop analysis
            abortControllerRef.current?.abort();
            setIsAnalyzing(false);
            return;
        }

        setIsAnalyzing(true);
        setAnalysisOutput('');
        abortControllerRef.current = new AbortController();

        try {
            // Get the user's session token
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error('Vous devez être connecté');
            }

            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cde-analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({}),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                throw new Error(`Erreur: ${response.status}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) throw new Error('No reader available');

            let fullOutput = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices?.[0]?.delta?.content;
                            if (content) {
                                fullOutput += content;
                                setAnalysisOutput(fullOutput);
                                // Auto-scroll to bottom
                                if (outputRef.current) {
                                    outputRef.current.scrollTop = outputRef.current.scrollHeight;
                                }
                            }
                        } catch (e) {
                            // Ignore parse errors
                        }
                    }
                }
            }

            toast.success(t('Analyse terminée'));
        } catch (err: any) {
            if (err.name === 'AbortError') {
                toast.info(t('Analyse interrompue'));
            } else {
                console.error('Analysis error:', err);
                toast.error(err.message || t('Erreur lors de l\'analyse'));
            }
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Update card status
    const handleUpdateStatus = async (cardId: string, newStatus: string) => {
        try {
            const { error } = await supabase
                .from('discovery_cards')
                .update({
                    status: newStatus,
                    reviewed_at: new Date().toISOString()
                })
                .eq('id', cardId);

            if (error) throw error;
            toast.success(t('Statut mis à jour'));
            await loadData();
        } catch (err) {
            console.error('Error updating status:', err);
            toast.error(t('Erreur lors de la mise à jour'));
        }
    };

    useEffect(() => {
        loadData();
    }, [statusFilter]);

    const statusCounts = {
        raw_signal: discoveries.filter(d => d.status === 'raw_signal').length,
        plausible: discoveries.filter(d => d.status === 'plausible').length,
        corroborated: discoveries.filter(d => d.status === 'corroborated').length,
        confirmed: discoveries.filter(d => d.status === 'confirmed').length,
        refuted: discoveries.filter(d => d.status === 'refuted').length,
    };

    return (
        <AppLayout>
            {/* Background */}
            <div className="fixed inset-0 -z-10 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-violet-50 via-purple-50 to-indigo-50 dark:from-slate-900 dark:via-purple-950 dark:to-slate-900" />
                <div className="absolute top-0 left-0 w-full h-full opacity-30">
                    <div className="absolute top-20 left-10 w-72 h-72 bg-violet-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob" />
                    <div className="absolute bottom-20 right-10 w-72 h-72 bg-purple-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000" />
                </div>
            </div>

            <div className="space-y-4 sm:space-y-6 pb-8 sm:pb-12 px-2 sm:px-0">
                {/* Header */}
                <div className="relative overflow-hidden rounded-xl sm:rounded-2xl md:rounded-3xl bg-gradient-to-br from-violet-500/10 via-purple-500/10 to-indigo-500/10 backdrop-blur-xl border border-white/20 shadow-2xl">
                    <div className="absolute inset-0 bg-white/5" />
                    <div className="relative p-4 sm:p-6 md:p-8">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
                            <div className="flex items-center gap-2 sm:gap-3">
                                <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-violet-400 to-purple-600">
                                    <Brain className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6 text-white" />
                                </div>
                                <div>
                                    <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
                                        {t('Continuous Discovery Engine')}
                                    </h1>
                                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 hidden sm:block">
                                        {t('Analyse IA en continu avec Claude Opus 4.5')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-1 sm:gap-2">
                                <Button
                                    variant="outline"
                                    onClick={loadData}
                                    disabled={isLoading}
                                    className="gap-2"
                                >
                                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                                    {t('Actualiser')}
                                </Button>
                                <Button
                                    onClick={handleEnrichMedications}
                                    disabled={isEnriching}
                                    variant="outline"
                                    className="gap-2"
                                >
                                    {isEnriching ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Database className="h-4 w-4" />
                                    )}
                                    {t('Enrichir Médicaments')}
                                </Button>
                                <Button
                                    onClick={handleSeedKG}
                                    disabled={isSeedingKG}
                                    variant="outline"
                                    className="gap-2"
                                >
                                    {isSeedingKG ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Zap className="h-4 w-4" />
                                    )}
                                    {t('Peupler KG')}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Medical Stats Cards (API Integration) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4">
                    <Card className="bg-white/60 dark:bg-slate-800/60 backdrop-blur border-white/20">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900">
                                <AlertTriangle className="h-5 w-5 text-red-600" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">{t('Événements Indésirables')}</p>
                                <p className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-600 to-orange-600">
                                    {medicalStats ? (medicalStats.adverseEvents.count / 1000000).toFixed(1) + 'M' : '...'}
                                </p>
                                <p className="text-[10px] text-slate-400">OpenFDA</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-white/60 dark:bg-slate-800/60 backdrop-blur border-white/20">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                                <Pill className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">{t('Médicaments')}</p>
                                <p className="text-xl font-bold">
                                    {medicalStats ? (medicalStats.medications.count / 1000).toFixed(0) + 'K+' : '...'}
                                </p>
                                <p className="text-[10px] text-slate-400">FDA + DrugBank</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-white/60 dark:bg-slate-800/60 backdrop-blur border-white/20">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900">
                                <Stethoscope className="h-5 w-5 text-emerald-600" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">{t('Diagnostics (ICD-10)')}</p>
                                <p className="text-xl font-bold">
                                    {medicalStats ? (medicalStats.diagnoses.count / 1000).toFixed(1) + 'K' : '...'}
                                </p>
                                <p className="text-[10px] text-slate-400">CMS.gov</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-white/60 dark:bg-slate-800/60 backdrop-blur border-white/20">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900">
                                <Activity className="h-5 w-5 text-amber-600" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">{t('Interactions Connues')}</p>
                                <p className="text-xl font-bold">
                                    {medicalStats ? (medicalStats.interactions.count / 1000000).toFixed(1) + 'M+' : '...'}
                                </p>
                                <p className="text-[10px] text-slate-400">DrugBank 6.0</p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card className="bg-white/60 dark:bg-slate-800/60 backdrop-blur border-white/20">
                        <CardContent className="p-4 flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900">
                                <Database className="h-5 w-5 text-violet-600" />
                            </div>
                            <div>
                                <p className="text-xs text-slate-500">{t('Total Données')}</p>
                                <p className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-purple-600">
                                    ~{medicalStats ? (medicalStats.total / 1000000).toFixed(1) + 'M' : '...'}
                                </p>
                                <p className="text-[10px] text-slate-400">Multi-sources</p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3 sm:space-y-4">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-2 lg:gap-0">
                        <ScrollArea className="w-full lg:w-auto">
                            <TabsList className="bg-white/60 dark:bg-slate-800/60 backdrop-blur flex-wrap h-auto gap-1 p-1">
                                <TabsTrigger value="analyze" className="gap-2">
                                    <Sparkles className="h-4 w-4" />
                                    {t('Analyse IA Live')}
                                </TabsTrigger>
                                <TabsTrigger value="feed" className="gap-2">
                                    <Lightbulb className="h-4 w-4" />
                                    {t('Découvertes')}
                                </TabsTrigger>
                                <TabsTrigger value="graph" className="gap-2">
                                    <Network className="h-4 w-4" />
                                    {t('Knowledge Graph')}
                                </TabsTrigger>
                                <TabsTrigger value="systematic" className="gap-2">
                                    <FlaskConical className="h-4 w-4" />
                                    {t('Analyse Systématique')}
                                </TabsTrigger>
                                <TabsTrigger value="focused" className="gap-2">
                                    <Crosshair className="h-4 w-4" />
                                    {t('Recherche Ciblée')}
                                </TabsTrigger>
                                <TabsTrigger value="history" className="gap-2">
                                    <History className="h-4 w-4" />
                                    {t('Historique')}
                                </TabsTrigger>
                                <TabsTrigger value="tools" className="gap-2">
                                    <Stethoscope className="h-4 w-4" />
                                    {t('Outils Cliniques')}
                                </TabsTrigger>
                                <TabsTrigger value="discovery" className="gap-2 bg-gradient-to-r from-violet-500/10 to-purple-500/10">
                                    <Sparkles className="h-4 w-4" />
                                    {t('Moteur de Découverte')}
                                </TabsTrigger>
                                <TabsTrigger value="radial" className="gap-2 bg-gradient-to-r from-purple-500/10 to-pink-500/10">
                                    <Sparkles className="h-4 w-4" />
                                    {t('Radial 3D')}
                                </TabsTrigger>
                            </TabsList>
                        </ScrollArea>

                        {activeTab === 'feed' && (
                            <>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-[180px] bg-white/60 dark:bg-slate-800/60">
                                        <Filter className="h-4 w-4 mr-2" />
                                        <SelectValue placeholder={t('Filtrer par statut')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">{t('Tous les statuts')}</SelectItem>
                                        <SelectItem value="raw_signal">{t('Signal brut')}</SelectItem>
                                        <SelectItem value="plausible">{t('Plausible')}</SelectItem>
                                        <SelectItem value="corroborated">{t('Corroboré')}</SelectItem>
                                        <SelectItem value="confirmed">{t('Confirmé')}</SelectItem>
                                        <SelectItem value="refuted">{t('Réfuté')}</SelectItem>
                                    </SelectContent>
                                </Select>

                                {/* Type Filter */}
                                <Select value={typeFilter} onValueChange={setTypeFilter}>
                                    <SelectTrigger className="w-[180px] bg-white/60 dark:bg-slate-800/60">
                                        <Stethoscope className="h-4 w-4 mr-2" />
                                        <SelectValue placeholder={t('Type de cible')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">{t('Tous les types')}</SelectItem>
                                        <SelectItem value="pathology">
                                            <span className="flex items-center gap-2">
                                                <Stethoscope className="h-3 w-3" />
                                                {t('Pathologies')}
                                            </span>
                                        </SelectItem>
                                        <SelectItem value="medication">
                                            <span className="flex items-center gap-2">
                                                <Pill className="h-3 w-3" />
                                                {t('Médicaments')}
                                            </span>
                                        </SelectItem>
                                        <SelectItem value="substance">
                                            <span className="flex items-center gap-2">
                                                <Beaker className="h-3 w-3" />
                                                {t('Substances')}
                                            </span>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>

                                {/* Search Input */}
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder={t('Rechercher dans les découvertes...')}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="pl-9 w-[300px] bg-white/60 dark:bg-slate-800/60"
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* AI Analysis Tab */}
                    <TabsContent value="analyze" className="space-y-4">
                        <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border-white/30">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="flex items-center gap-2">
                                        <Sparkles className="h-5 w-5 text-violet-600" />
                                        {t('Analyse en continu avec Claude Opus 4.5')}
                                    </CardTitle>
                                    <Button
                                        onClick={handleStartAnalysis}
                                        className={`gap-2 ${isAnalyzing
                                            ? 'bg-red-500 hover:bg-red-600'
                                            : 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700'
                                            }`}
                                    >
                                        {isAnalyzing ? (
                                            <>
                                                <Square className="h-4 w-4" />
                                                {t('Arrêter')}
                                            </>
                                        ) : (
                                            <>
                                                <Play className="h-4 w-4" />
                                                {t('Lancer l\'analyse')}
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div
                                    ref={outputRef}
                                    className="h-[500px] overflow-y-auto rounded-lg bg-slate-900 p-4 font-mono text-sm text-slate-100"
                                >
                                    {analysisOutput ? (
                                        <div className="whitespace-pre-wrap">
                                            {analysisOutput}
                                            {isAnalyzing && (
                                                <span className="inline-block w-2 h-4 bg-violet-400 animate-pulse ml-1" />
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center h-full text-slate-500">
                                            <Brain className="h-16 w-16 mb-4 opacity-30" />
                                            <p className="text-center">
                                                {t('Cliquez sur "Lancer l\'analyse" pour démarrer')}
                                                <br />
                                                <span className="text-xs">
                                                    {t('L\'IA analysera le Knowledge Graph et génèrera des hypothèses en temps réel')}
                                                </span>
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Discoveries Tab */}
                    <TabsContent value="feed" className="space-y-4">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                            </div>
                        ) : discoveries.length === 0 ? (
                            <Card className="bg-white/60 dark:bg-slate-800/60 backdrop-blur border-white/20">
                                <CardContent className="p-12 text-center">
                                    <Lightbulb className="h-12 w-12 mx-auto text-slate-400 mb-4" />
                                    <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        {t('Aucune découverte pour le moment')}
                                    </h3>
                                    <p className="text-slate-500 mb-4">
                                        {t('Lancez une analyse IA pour générer des hypothèses.')}
                                    </p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="grid gap-4">
                                {discoveries
                                    .filter(card => {
                                        // Text search filter
                                        if (searchQuery) {
                                            const query = searchQuery.toLowerCase();
                                            const matchesTitle = card.title?.toLowerCase().includes(query);
                                            const matchesHypothesis = card.hypothesis?.toLowerCase().includes(query);
                                            const matchesSources = card.sources?.some((s: any) =>
                                                s.title?.toLowerCase().includes(query) ||
                                                s.target?.toLowerCase().includes(query)
                                            );
                                            if (!matchesTitle && !matchesHypothesis && !matchesSources) return false;
                                        }
                                        // Type filter (check sources for target type)
                                        if (typeFilter !== 'all') {
                                            const hasMatchingType = card.sources?.some((s: any) => {
                                                if (typeFilter === 'pathology') {
                                                    return s.type === 'pathology' ||
                                                        card.title?.toLowerCase().includes('syndrome') ||
                                                        card.title?.toLowerCase().includes('maladie') ||
                                                        card.title?.toLowerCase().includes('pathologi');
                                                }
                                                if (typeFilter === 'medication') {
                                                    return s.type === 'medication' ||
                                                        card.title?.toLowerCase().includes('médicament') ||
                                                        card.title?.toLowerCase().includes('traitement') ||
                                                        card.title?.toLowerCase().includes('protocole');
                                                }
                                                if (typeFilter === 'substance') {
                                                    return s.type === 'substance' ||
                                                        card.title?.toLowerCase().includes('molécule') ||
                                                        card.title?.toLowerCase().includes('ion') ||
                                                        card.title?.toLowerCase().includes('ase');
                                                }
                                                return true;
                                            });
                                            // Also check title if no sources match
                                            if (!hasMatchingType && card.sources?.length === 0) {
                                                if (typeFilter === 'pathology' && !(
                                                    card.title?.toLowerCase().includes('syndrome') ||
                                                    card.title?.toLowerCase().includes('maladie')
                                                )) return false;
                                            }
                                            if (!hasMatchingType && card.sources?.length > 0) return false;
                                        }
                                        return true;
                                    })
                                    .map((card) => (
                                        <DiscoveryCard
                                            key={card.id}
                                            data={card}
                                            onUpdateStatus={handleUpdateStatus}
                                        />
                                    ))}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="graph">
                        <NeuralNetworkGraph />
                    </TabsContent>

                    {/* Systematic Analysis Tab */}
                    <TabsContent value="systematic" className="space-y-4">
                        <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border-white/30">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="flex items-center gap-2">
                                        <FlaskConical className="h-5 w-5 text-violet-600" />
                                        {t('Analyse Combinatoire Systématique')}
                                    </CardTitle>
                                    <div className="flex gap-2">
                                        {!isSystematicRunning ? (
                                            <Button
                                                onClick={async () => {
                                                    setIsSystematicRunning(true);
                                                    setSystematicProgress('Démarrage...');
                                                    setSystematicDiscoveries([]);

                                                    try {
                                                        const { data: { session } } = await supabase.auth.getSession();
                                                        if (!session) throw new Error('Non connecté');

                                                        // Start the analysis
                                                        const startRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cde-systematic-analyze`, {
                                                            method: 'POST',
                                                            headers: {
                                                                'Content-Type': 'application/json',
                                                                'Authorization': `Bearer ${session.access_token}`,
                                                                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                                                            },
                                                            body: JSON.stringify({ action: 'start' }),
                                                        });
                                                        const startData = await startRes.json();
                                                        if (!startData.success) throw new Error(startData.error);

                                                        setSystematicRun(startData);
                                                        setSystematicProgress(`0/${startData.total_substances} substances (${startData.total_pairs} paires)`);

                                                        // Analyze each substance
                                                        for (let i = 0; i < startData.total_substances; i++) {
                                                            const analyzeRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cde-systematic-analyze`, {
                                                                method: 'POST',
                                                                headers: {
                                                                    'Content-Type': 'application/json',
                                                                    'Authorization': `Bearer ${session.access_token}`,
                                                                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                                                                },
                                                                body: JSON.stringify({ action: 'analyze', run_id: startData.run_id, substance_index: i }),
                                                            });
                                                            const analyzeData = await analyzeRes.json();

                                                            if (analyzeData.completed) {
                                                                setSystematicProgress('Analyse terminée !');
                                                                break;
                                                            }

                                                            // REAL-TIME LOGS - Afficher chaque étape immédiatement
                                                            const addLog = (step: string, detail: string, type: 'info' | 'query' | 'ai' | 'result' = 'info') => {
                                                                setResearchSteps(prev => [...prev, {
                                                                    timestamp: new Date().toLocaleTimeString(),
                                                                    step,
                                                                    detail,
                                                                    type
                                                                }]);
                                                            };

                                                            // Log: Substance en cours
                                                            addLog('🔬 Analyse', `Substance: ${analyzeData.substance_analyzed} (${analyzeData.entity_type})`, 'info');

                                                            // Log: Entités testées
                                                            if (analyzeData.entities_tested && analyzeData.entities_tested.length > 0) {
                                                                addLog('📊 Base de données', `Interrogation de ${analyzeData.entities_tested.length} entités: ${analyzeData.entities_tested.slice(0, 5).join(', ')}...`, 'query');
                                                            }

                                                            // Log: Prompt envoyé
                                                            if (analyzeData.prompt_used) {
                                                                addLog('🤖 Envoi à Claude', `Prompt de ${analyzeData.prompt_used.length} caractères envoyé au modèle IA`, 'ai');
                                                                setCurrentPrompt(analyzeData.prompt_used);
                                                            }

                                                            // Log: Résultats
                                                            if (analyzeData.full_analysis && analyzeData.full_analysis.length > 0) {
                                                                const discoveries = analyzeData.full_analysis.filter((a: any) => !a.documented && a.discovery_type !== 'aucun');
                                                                addLog('✨ Résultats', `${analyzeData.pairs_count} paires analysées, ${discoveries.length} nouvelles découvertes`, 'result');

                                                                // Log chaque découverte importante
                                                                discoveries.forEach((d: any) => {
                                                                    addLog(`⚡ Découverte`, `${d.entity_b}: ${d.discovery_type} (${d.severity}) - ${d.mechanism || d.reasoning || 'mécanisme à explorer'}`, 'result');
                                                                });

                                                                setCurrentAnalysis(analyzeData.full_analysis);
                                                            }

                                                            setSystematicProgress(`${i + 1}/${startData.total_substances}: ${analyzeData.substance_analyzed} (${analyzeData.discoveries_count} découvertes)`);

                                                            if (analyzeData.synthesis) {
                                                                setSystematicDiscoveries(prev => [...prev, {
                                                                    substance: analyzeData.substance_analyzed,
                                                                    discoveries: analyzeData.discoveries_count,
                                                                    synthesis: analyzeData.synthesis,
                                                                    research_steps: analyzeData.research_steps,
                                                                    full_analysis: analyzeData.full_analysis,
                                                                    entities_tested: analyzeData.entities_tested
                                                                }]);
                                                            }
                                                        }

                                                        toast.success('Analyse systématique terminée !');
                                                    } catch (err: any) {
                                                        toast.error(err.message);
                                                    } finally {
                                                        setIsSystematicRunning(false);
                                                    }
                                                }}
                                                className="gap-2 bg-gradient-to-r from-violet-500 to-purple-600"
                                            >
                                                <Play className="h-4 w-4" />
                                                {t('Démarrer l\'analyse')}
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="destructive"
                                                onClick={() => setIsSystematicRunning(false)}
                                                className="gap-2"
                                            >
                                                <Square className="h-4 w-4" />
                                                {t('Arrêter')}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-900 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium">{t('Progression')}</span>
                                        <span className="text-sm text-slate-500">{systematicProgress || 'Non démarré'}</span>
                                    </div>
                                    {isSystematicRunning && (
                                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                                            <div className="bg-gradient-to-r from-violet-500 to-purple-600 h-2 rounded-full animate-pulse" style={{ width: '100%' }} />
                                        </div>
                                    )}
                                </div>

                                {/* NEW: Research Workflow Details Panel */}
                                {(isSystematicRunning || researchSteps.length > 0) && (
                                    <div className="border border-violet-200 dark:border-violet-800 rounded-lg overflow-hidden">
                                        <button
                                            onClick={() => setShowResearchDetails(!showResearchDetails)}
                                            className="w-full p-3 bg-violet-50 dark:bg-violet-900/30 flex items-center justify-between hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors"
                                        >
                                            <span className="font-semibold flex items-center gap-2 text-violet-700 dark:text-violet-300">
                                                <Brain className="h-4 w-4" />
                                                🔬 Travail de Recherche du Modèle IA
                                            </span>
                                            <ChevronRight className={`h-4 w-4 transition-transform ${showResearchDetails ? 'rotate-90' : ''}`} />
                                        </button>

                                        {showResearchDetails && (
                                            <div className="p-4 space-y-4 bg-slate-900 max-h-[500px] overflow-hidden">
                                                {/* Console-style real-time logs */}
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <h4 className="text-sm font-semibold text-green-400 flex items-center gap-2">
                                                            <Activity className="h-4 w-4 animate-pulse" />
                                                            Console de Recherche IA - Temps Réel
                                                        </h4>
                                                        <Badge variant="outline" className="text-xs text-green-400 border-green-400">
                                                            {researchSteps.length} logs
                                                        </Badge>
                                                    </div>
                                                    <ScrollArea className="h-[350px] border border-slate-700 rounded bg-black/50 p-2 font-mono text-xs">
                                                        <div className="space-y-1">
                                                            {researchSteps.length === 0 && isSystematicRunning && (
                                                                <div className="text-yellow-400 animate-pulse">
                                                                    ⏳ En attente des premières données...
                                                                </div>
                                                            )}
                                                            {researchSteps.map((log, idx) => (
                                                                <div
                                                                    key={idx}
                                                                    className={`py-1 px-2 rounded ${log.type === 'query' ? 'bg-blue-900/30 text-blue-300' :
                                                                        log.type === 'ai' ? 'bg-purple-900/30 text-purple-300' :
                                                                            log.type === 'result' ? 'bg-green-900/30 text-green-300' :
                                                                                'bg-slate-800/50 text-slate-300'
                                                                        }`}
                                                                >
                                                                    <span className="text-slate-500">[{log.timestamp}]</span>{' '}
                                                                    <span className={`font-semibold ${log.type === 'query' ? 'text-blue-400' :
                                                                        log.type === 'ai' ? 'text-purple-400' :
                                                                            log.type === 'result' ? 'text-green-400' :
                                                                                'text-yellow-400'
                                                                        }`}>
                                                                        {log.step}
                                                                    </span>{' '}
                                                                    <span className="text-slate-200">{log.detail}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </ScrollArea>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {systematicDiscoveries.length > 0 && (
                                    <div className="space-y-3">
                                        <h3 className="font-semibold flex items-center gap-2">
                                            <Lightbulb className="h-4 w-4 text-amber-500" />
                                            {t('Découvertes par substance')}
                                        </h3>
                                        <ScrollArea className="h-[400px]">
                                            <div className="space-y-3">
                                                {systematicDiscoveries.map((item, idx) => (
                                                    <div key={idx} className="p-4 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="font-medium text-amber-800 dark:text-amber-200">{item.substance}</span>
                                                            <Badge variant="outline">{item.discoveries} découvertes</Badge>
                                                        </div>
                                                        <p className="text-sm text-slate-600 dark:text-slate-400">{item.synthesis}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </ScrollArea>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Focused Research Tab */}
                    <TabsContent value="focused">
                        <FocusedResearchPanel />
                    </TabsContent>

                    {/* Research History Tab */}
                    <TabsContent value="history">
                        <ResearchHistoryPanel />
                    </TabsContent>

                    {/* Treatment Tools Tab */}
                    <TabsContent value="tools">
                        <TreatmentTools />
                    </TabsContent>


                    {/* Discovery Engine Tab - Génération d'hypothèses thérapeutiques innovantes */}
                    <TabsContent value="discovery">
                        <DiscoveryEnginePanel />
                    </TabsContent>

                    {/* Radial Rings 3D Tab */}
                    <TabsContent value="radial" className="space-y-4">
                        <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border-white/30">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Sparkles className="h-5 w-5 text-purple-600" />
                                    {t('Radial Rings Discovery Engine')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="text-sm text-muted-foreground">
                                    {t('Visualisation 3D des connexions médicales en anneaux concentriques. Ajoutez plusieurs pathologies pour analyser les comorbidités.')}
                                </p>

                                {/* Added conditions chips */}
                                {radialQueries.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {radialQueries.map((query, idx) => (
                                            <div
                                                key={idx}
                                                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30"
                                            >
                                                <span className="text-sm font-medium text-purple-700 dark:text-purple-300">{query}</span>
                                                <button
                                                    onClick={() => setRadialQueries(prev => prev.filter((_, i) => i !== idx))}
                                                    className="ml-1 text-purple-500 hover:text-red-500 transition-colors"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Input + Add button */}
                                <div className="flex gap-2">
                                    <Input
                                        placeholder={radialQueries.length === 0
                                            ? t('Ex: Syndrome néphrotique pédiatrique')
                                            : t('Ajouter une comorbidité (ex: Varicelle)')}
                                        value={radialQueryInput}
                                        onChange={(e) => setRadialQueryInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && radialQueryInput.trim()) {
                                                setRadialQueries(prev => [...prev, radialQueryInput.trim()]);
                                                setRadialQueryInput('');
                                            }
                                        }}
                                        className="flex-1"
                                    />
                                    <Button
                                        onClick={() => {
                                            if (radialQueryInput.trim()) {
                                                setRadialQueries(prev => [...prev, radialQueryInput.trim()]);
                                                setRadialQueryInput('');
                                            }
                                        }}
                                        disabled={!radialQueryInput.trim()}
                                        variant="outline"
                                        className="gap-1"
                                    >
                                        + {t('Ajouter')}
                                    </Button>
                                    <Button
                                        onClick={() => setIsRadialModalOpen(true)}
                                        disabled={radialQueries.length === 0}
                                        className="gap-2 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
                                    >
                                        <Sparkles className="h-4 w-4" />
                                        {t('Lancer Radial 3D')}
                                    </Button>
                                </div>

                                {/* Comorbidity info */}
                                {radialQueries.length > 1 && (
                                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-sm">
                                        ⚠️ {t('Analyse de comorbidité')} : {radialQueries.length} {t('conditions')} — {t('Le graphe montrera les interactions et complications potentielles')}
                                    </div>
                                )}

                                <div className="grid grid-cols-5 gap-2 text-xs text-center">
                                    <div className="p-2 rounded bg-red-500/20 text-red-600">Ring 0: Pathologie(s)</div>
                                    <div className="p-2 rounded bg-green-500/20 text-green-600">Ring 1: Traitements</div>
                                    <div className="p-2 rounded bg-orange-500/20 text-orange-600">Ring 2: Effets</div>
                                    <div className="p-2 rounded bg-purple-500/20 text-purple-600">Ring 3: Étiologie</div>
                                    <div className="p-2 rounded bg-cyan-500/20 text-cyan-600">Ring 4: Frontières</div>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                {/* Radial Rings 3D Modal */}
                <RadialRingsModal
                    isOpen={isRadialModalOpen}
                    onClose={() => setIsRadialModalOpen(false)}
                    pathologies={radialQueries}
                    mode="ETIOLOGY"
                />
            </div>


            <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(20px, -50px) scale(1.1); }
          50% { transform: translate(-20px, 20px) scale(0.9); }
          75% { transform: translate(50px, 50px) scale(1.05); }
        }
        .animate-blob {
          animation: blob 20s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
      `}</style>
        </AppLayout >
    );
};

export default ContinuousDiscovery;
