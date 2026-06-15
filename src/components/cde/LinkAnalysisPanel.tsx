import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
    Link2, Trash2, Loader2, Brain, ArrowRight, Sparkles,
    CheckCircle2, XCircle, Clock, Lightbulb, Search, FlaskConical,
    ChevronDown, ChevronUp, MessageSquare
} from 'lucide-react';

interface UserEdge {
    id: string;
    source_node_id: string;
    target_node_id: string;
    relationship_type: string;
    notes: string | null;
    is_analyzed: boolean;
    analysis_result: any;
    created_at: string;
    source_node?: { name: string; node_type: string };
    target_node?: { name: string; node_type: string };
}

interface ResearchLead {
    title: string;
    description: string;
    type: 'discovery' | 'validation' | 'warning' | 'suggestion';
    confidence: 'high' | 'medium' | 'low';
    relatedLinks: string[];
}

interface LinkAnalysisPanelProps {
    onAnalyze?: (edgeIds: string[]) => void;
    refreshTrigger?: number;
}

const LinkAnalysisPanel = ({ onAnalyze, refreshTrigger }: LinkAnalysisPanelProps) => {
    const { t } = useAutoTranslation();
    const [edges, setEdges] = useState<UserEdge[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [selectedEdges, setSelectedEdges] = useState<Set<string>>(new Set());

    // Deep analysis state
    const [isDeepAnalyzing, setIsDeepAnalyzing] = useState(false);
    const [analysisStream, setAnalysisStream] = useState<string>('');
    const [researchLeads, setResearchLeads] = useState<ResearchLead[]>([]);
    const [showResults, setShowResults] = useState(false);
    const streamRef = useRef<HTMLDivElement>(null);

    // Custom prompt and targeting state
    const [showPromptOptions, setShowPromptOptions] = useState(false);
    const [customPrompt, setCustomPrompt] = useState('');
    const [targetPathology, setTargetPathology] = useState('');
    const [targetMedication, setTargetMedication] = useState('');

    useEffect(() => {
        loadUserEdges();
    }, [refreshTrigger]);

    // Auto-scroll streaming output
    useEffect(() => {
        if (streamRef.current) {
            streamRef.current.scrollTop = streamRef.current.scrollHeight;
        }
    }, [analysisStream]);

    const loadUserEdges = async () => {
        setIsLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            // Get user edges with node details
            const { data, error } = await supabase
                .from('cde_user_edges')
                .select(`
                    *,
                    source_node:cde_nodes!source_node_id(name, node_type),
                    target_node:cde_nodes!target_node_id(name, node_type)
                `)
                .eq('user_id', session.user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setEdges(data || []);
        } catch (err) {
            console.error('Error loading user edges:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteEdge = async (edgeId: string) => {
        try {
            const { error } = await supabase
                .from('cde_user_edges')
                .delete()
                .eq('id', edgeId);

            if (error) throw error;
            setEdges(prev => prev.filter(e => e.id !== edgeId));
            toast.success(t('Lien supprimé'));
        } catch (err) {
            console.error('Error deleting edge:', err);
            toast.error(t('Erreur lors de la suppression'));
        }
    };

    const handleAnalyzeSelected = async () => {
        const edgesToAnalyze = selectedEdges.size > 0
            ? Array.from(selectedEdges)
            : edges.filter(e => !e.is_analyzed).map(e => e.id);

        if (edgesToAnalyze.length === 0) {
            toast.info(t('Aucun lien à analyser'));
            return;
        }

        setIsAnalyzing(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Non connecté');

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-user-links`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    },
                    body: JSON.stringify({ edgeIds: edgesToAnalyze }),
                }
            );

            if (!response.ok) throw new Error('Erreur d\'analyse');

            const result = await response.json();
            toast.success(t(`${result.analyzed || edgesToAnalyze.length} liens analysés`));
            loadUserEdges();
            setSelectedEdges(new Set());
        } catch (err: any) {
            console.error('Analysis error:', err);
            toast.error(err.message || t('Erreur lors de l\'analyse'));
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Deep analysis with streaming
    const handleDeepAnalysis = async () => {
        if (edges.length === 0) {
            toast.info(t('Créez des liens avant de lancer l\'analyse'));
            return;
        }

        setIsDeepAnalyzing(true);
        setAnalysisStream('');
        setResearchLeads([]);
        setShowResults(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Non connecté');

            const edgeIds = edges.map(e => e.id);

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-kg-links`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    },
                    body: JSON.stringify({
                        edgeIds,
                        customPrompt: customPrompt.trim() || undefined,
                        targetPathology: targetPathology.trim() || undefined,
                        targetMedication: targetMedication.trim() || undefined,
                    }),
                }
            );

            if (!response.ok) {
                throw new Error(`Erreur ${response.status}: ${await response.text()}`);
            }

            // Handle streaming response
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.slice(6).trim();
                            if (jsonStr === '[DONE]') continue;

                            try {
                                const data = JSON.parse(jsonStr);
                                if (data.choices?.[0]?.delta?.content) {
                                    setAnalysisStream(prev => prev + data.choices[0].delta.content);
                                }
                                if (data.researchLeads) {
                                    setResearchLeads(data.researchLeads);
                                }
                            } catch (e) {
                                // Ignore parsing errors
                            }
                        }
                    }
                }
            }

            toast.success(t('Analyse terminée'));
            loadUserEdges();
        } catch (err: any) {
            console.error('Deep analysis error:', err);
            toast.error(err.message || t('Erreur lors de l\'analyse'));
            setAnalysisStream(prev => prev + `\n\n❌ Erreur: ${err.message}`);
        } finally {
            setIsDeepAnalyzing(false);
        }
    };

    const toggleEdgeSelection = (edgeId: string) => {
        const newSelected = new Set(selectedEdges);
        if (newSelected.has(edgeId)) {
            newSelected.delete(edgeId);
        } else {
            newSelected.add(edgeId);
        }
        setSelectedEdges(newSelected);
    };

    const getRelationshipLabel = (type: string) => {
        const labels: Record<string, string> = {
            treats: 'traite',
            causes: 'cause',
            contraindicated: 'contre-indiqué',
            interacts_with: 'interagit avec',
            increases_risk: '↑ risque',
            decreases_risk: '↓ risque',
            has_symptom: 'symptôme',
            metabolized_by: 'métabolisé par',
            contains: 'contient',
            similar_to: 'similaire à',
            alternative_to: 'alternative à',
            potentiates: 'potentialise',
            inhibits: 'inhibe',
            induces: 'induit',
            associated_with: 'associé à',
        };
        return t(labels[type] || type);
    };

    const getLeadIcon = (type: ResearchLead['type']) => {
        switch (type) {
            case 'discovery': return <Lightbulb className="h-4 w-4 text-yellow-500" />;
            case 'validation': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case 'warning': return <XCircle className="h-4 w-4 text-red-500" />;
            case 'suggestion': return <Search className="h-4 w-4 text-blue-500" />;
        }
    };

    const unanalyzedCount = edges.filter(e => !e.is_analyzed).length;

    return (
        <Card className="h-full bg-white/50 dark:bg-slate-900/50">
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                        <Link2 className="h-4 w-4 text-violet-500" />
                        {t('Mes liens')}
                        <Badge variant="outline">{edges.length}</Badge>
                    </div>
                </CardTitle>

                {/* Prominent Deep Analysis Button */}
                <Button
                    onClick={handleDeepAnalysis}
                    disabled={isDeepAnalyzing || edges.length === 0}
                    className="w-full mt-2 gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                >
                    {isDeepAnalyzing ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {t('Analyse en cours...')}
                        </>
                    ) : (
                        <>
                            <FlaskConical className="h-4 w-4" />
                            {t('Analyser les liens')}
                            <Sparkles className="h-3 w-3" />
                        </>
                    )}
                </Button>

                {/* Quick analyze for individual links */}
                {unanalyzedCount > 0 && !isDeepAnalyzing && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={handleAnalyzeSelected}
                        disabled={isAnalyzing}
                        className="w-full mt-1 h-7 text-xs gap-1"
                    >
                        {isAnalyzing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                            <Brain className="h-3 w-3" />
                        )}
                        {t('Validation rapide')} ({selectedEdges.size || unanalyzedCount})
                    </Button>
                )}

                {/* Collapsible Prompt Options */}
                <Collapsible open={showPromptOptions} onOpenChange={setShowPromptOptions}>
                    <CollapsibleTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="w-full mt-2 h-7 text-xs gap-1 justify-between"
                        >
                            <div className="flex items-center gap-1">
                                <MessageSquare className="h-3 w-3" />
                                {t('Options de recherche')}
                            </div>
                            {showPromptOptions ? (
                                <ChevronUp className="h-3 w-3" />
                            ) : (
                                <ChevronDown className="h-3 w-3" />
                            )}
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-2">
                        {/* Target Pathology */}
                        <div>
                            <label className="text-[10px] text-slate-500 mb-1 block">
                                {t('Pathologie ciblée')}
                            </label>
                            <Input
                                placeholder={t('Ex: Syndrome néphrotique')}
                                value={targetPathology}
                                onChange={(e) => setTargetPathology(e.target.value)}
                                className="h-7 text-xs"
                            />
                        </div>

                        {/* Target Medication */}
                        <div>
                            <label className="text-[10px] text-slate-500 mb-1 block">
                                {t('Médicament ciblé')}
                            </label>
                            <Input
                                placeholder={t('Ex: Ciclosporine')}
                                value={targetMedication}
                                onChange={(e) => setTargetMedication(e.target.value)}
                                className="h-7 text-xs"
                            />
                        </div>

                        {/* Custom Prompt */}
                        <div>
                            <label className="text-[10px] text-slate-500 mb-1 block">
                                {t('Demande spécifique (prompt)')}
                            </label>
                            <Textarea
                                placeholder={t('Ex: Cherche des interactions avec les inhibiteurs de CYP3A4...')}
                                value={customPrompt}
                                onChange={(e) => setCustomPrompt(e.target.value)}
                                className="text-xs min-h-[60px] resize-none"
                                rows={3}
                            />
                        </div>
                    </CollapsibleContent>
                </Collapsible>
            </CardHeader>

            <CardContent className="p-2">
                {/* Streaming Analysis Results */}
                {showResults && (analysisStream || researchLeads.length > 0) && (
                    <div className="mb-3 p-3 rounded-lg bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border border-violet-200 dark:border-violet-800">
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="h-4 w-4 text-violet-600" />
                            <span className="font-medium text-sm text-violet-700 dark:text-violet-300">
                                {t('Pistes de recherche')}
                            </span>
                            <Button
                                size="sm"
                                variant="ghost"
                                className="ml-auto h-5 w-5 p-0"
                                onClick={() => setShowResults(false)}
                            >
                                <XCircle className="h-3 w-3" />
                            </Button>
                        </div>

                        {/* Research Leads Cards */}
                        {researchLeads.length > 0 && (
                            <div className="space-y-2 mb-2">
                                {researchLeads.map((lead, idx) => (
                                    <div
                                        key={idx}
                                        className="p-2 rounded bg-white/70 dark:bg-slate-800/70 border"
                                    >
                                        <div className="flex items-center gap-2">
                                            {getLeadIcon(lead.type)}
                                            <span className="font-medium text-xs">{lead.title}</span>
                                            <Badge
                                                variant="outline"
                                                className={`text-[10px] ${lead.confidence === 'high' ? 'text-green-600' :
                                                    lead.confidence === 'medium' ? 'text-yellow-600' :
                                                        'text-slate-600'
                                                    }`}
                                            >
                                                {lead.confidence}
                                            </Badge>
                                        </div>
                                        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                                            {lead.description}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Streaming Output */}
                        {analysisStream && (
                            <div
                                ref={streamRef}
                                className="max-h-32 overflow-y-auto text-[11px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap font-mono bg-white/50 dark:bg-slate-800/50 p-2 rounded"
                            >
                                {analysisStream}
                                {isDeepAnalyzing && <span className="animate-pulse">▊</span>}
                            </div>
                        )}
                    </div>
                )}

                <ScrollArea className="h-[200px]">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-20">
                            <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
                        </div>
                    ) : edges.length === 0 ? (
                        <div className="text-center text-sm text-slate-500 py-8">
                            <Link2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>{t('Aucun lien créé')}</p>
                            <p className="text-xs">{t('Tirez depuis un nœud vers un autre')}</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {edges.map(edge => (
                                <div
                                    key={edge.id}
                                    className={`p-2 rounded-lg border transition-all cursor-pointer ${selectedEdges.has(edge.id)
                                        ? 'bg-violet-50 dark:bg-violet-900/30 border-violet-300'
                                        : 'bg-white/50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                                        }`}
                                    onClick={() => toggleEdgeSelection(edge.id)}
                                >
                                    <div className="flex items-center gap-2 text-xs">
                                        <span className="font-medium truncate max-w-[80px]">
                                            {edge.source_node?.name || '?'}
                                        </span>
                                        <ArrowRight className="h-3 w-3 text-slate-400 flex-shrink-0" />
                                        <Badge variant="outline" className="text-[10px] px-1">
                                            {getRelationshipLabel(edge.relationship_type)}
                                        </Badge>
                                        <ArrowRight className="h-3 w-3 text-slate-400 flex-shrink-0" />
                                        <span className="font-medium truncate max-w-[80px]">
                                            {edge.target_node?.name || '?'}
                                        </span>

                                        <div className="ml-auto flex items-center gap-1">
                                            {edge.is_analyzed ? (
                                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                                            ) : (
                                                <Clock className="h-3 w-3 text-amber-500" />
                                            )}
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-5 w-5 p-0"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteEdge(edge.id);
                                                }}
                                            >
                                                <Trash2 className="h-3 w-3 text-red-400" />
                                            </Button>
                                        </div>
                                    </div>

                                    {edge.notes && (
                                        <p className="text-[10px] text-slate-500 mt-1 truncate">
                                            {edge.notes}
                                        </p>
                                    )}

                                    {edge.is_analyzed && edge.analysis_result && (
                                        <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded text-[10px]">
                                            <div className="flex items-center gap-1 text-green-700 dark:text-green-300">
                                                <Sparkles className="h-3 w-3" />
                                                <span className="font-medium">{t('Analyse IA')}</span>
                                            </div>
                                            <p className="text-slate-600 dark:text-slate-400 mt-1">
                                                {edge.analysis_result.summary || t('Relation validée')}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    );
};

export default LinkAnalysisPanel;
