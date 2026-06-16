import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
    Brain, Play, Square, Loader2, Lightbulb,
    AlertTriangle, CheckCircle2, Target, Beaker,
    TrendingUp, FileText, ChevronDown, ChevronUp,
    Sparkles, Activity, Database, Globe, FlaskConical
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import ReactMarkdown from 'react-markdown';

interface ResearchStep {
    id: number;
    status: 'pending' | 'running' | 'completed' | 'error';
    details?: string;
}

interface Hypothesis {
    id: string;
    title: string;
    probability: number;
    classification: 'VALIDÉ' | 'PLAUSIBLE' | 'HYPOTHÈSE';
}

interface SourceStats {
    local: number;
    pubmed: number;
    trials: number;
    fda: number;
    total: number;
}

const DiscoveryEnginePanel = () => {
    const { t } = useAutoTranslation();

    // Input state
    const [pathology, setPathology] = useState('');
    const [researchGoal, setResearchGoal] = useState('');
    const [additionalContext, setAdditionalContext] = useState('');

    // Research state
    const [isResearching, setIsResearching] = useState(false);
    const [steps, setSteps] = useState<ResearchStep[]>([]);
    const [streamingText, setStreamingText] = useState('');
    const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
    const [sources, setSources] = useState<SourceStats | null>(null);

    const [showFullReport, setShowFullReport] = useState(true);
    const abortControllerRef = useRef<AbortController | null>(null);
    const textAreaRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when text updates
    useEffect(() => {
        if (textAreaRef.current && isResearching) {
            textAreaRef.current.scrollTop = textAreaRef.current.scrollHeight;
        }
    }, [streamingText, isResearching]);

    const handleStartDiscovery = async () => {
        if (!pathology.trim()) {
            toast.error(t('Veuillez entrer une pathologie à analyser'));
            return;
        }

        if (isResearching) {
            abortControllerRef.current?.abort();
            setIsResearching(false);
            return;
        }

        setIsResearching(true);
        setSteps([]);
        setStreamingText('');
        setHypotheses([]);
        setSources(null);
        abortControllerRef.current = new AbortController();

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error('Vous devez être connecté');
            }

            const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discovery-engine`;

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({
                    pathology: pathology.trim(),
                    research_goal: researchGoal.trim() || "Trouver une piste de traitement CURATIF innovante qui n'existe pas encore",
                    additional_context: additionalContext.trim()
                }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                throw new Error(`Erreur: ${response.status}`);
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) throw new Error('No reader available');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        try {
                            const parsed = JSON.parse(data);

                            // Handle step updates
                            if (parsed.type === 'step') {
                                setSteps(prev => {
                                    const existing = prev.find(s => s.id === parsed.id);
                                    if (existing) {
                                        return prev.map(s => s.id === parsed.id ? { ...s, ...parsed } : s);
                                    }
                                    return [...prev, parsed];
                                });
                            }

                            // Handle streaming text (live typing effect)
                            if (parsed.type === 'text' && parsed.content) {
                                setStreamingText(prev => prev + parsed.content);
                            }

                            // Handle hypothesis extraction
                            if (parsed.type === 'hypothesis') {
                                setHypotheses(prev => {
                                    // Avoid duplicates
                                    if (prev.find(h => h.id === parsed.id)) return prev;
                                    return [...prev, parsed];
                                });
                            }

                            // Handle source stats
                            if (parsed.type === 'sources') {
                                setSources(parsed);
                            }

                            // Handle completion
                            if (parsed.type === 'done') {
                                toast.success(t('Analyse de découverte terminée'));
                            }

                            if (parsed.type === 'error') {
                                throw new Error(parsed.message);
                            }

                        } catch (e) {
                            // Ignore parse errors for incomplete chunks
                        }
                    }
                }
            }

        } catch (err: any) {
            if (err.name === 'AbortError') {
                toast.info(t('Analyse interrompue'));
            } else {
                console.error('Discovery error:', err);
                toast.error(err.message || t('Erreur lors de l\'analyse'));
            }
        } finally {
            setIsResearching(false);
        }
    };

    const getClassificationBadge = (classification: string) => {
        switch (classification) {
            case 'VALIDÉ':
                return <Badge className="bg-green-500/20 text-green-700 border-green-500/30">✅ VALIDÉ</Badge>;
            case 'PLAUSIBLE':
                return <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/30">⚠️ PLAUSIBLE</Badge>;
            case 'HYPOTHÈSE':
            default:
                return <Badge className="bg-purple-500/20 text-purple-700 border-purple-500/30">💡 HYPOTHÈSE</Badge>;
        }
    };

    const getProbabilityColor = (prob: number) => {
        if (prob >= 65) return 'text-green-600';
        if (prob >= 45) return 'text-yellow-600';
        return 'text-red-600';
    };

    const getProbabilityEmoji = (prob: number) => {
        if (prob >= 65) return '🟢';
        if (prob >= 45) return '🟡';
        return '🔴';
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <Card className="bg-gradient-to-r from-violet-500/10 via-purple-500/10 to-indigo-500/10 backdrop-blur border-violet-300/30">
                <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                            <Sparkles className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent text-2xl font-bold">
                                {t('Moteur de Découverte IA')}
                            </span>
                            <p className="text-sm text-muted-foreground font-normal mt-1">
                                {t('Génération d\'hypothèses thérapeutiques innovantes avec OpenAI GPT-5.5')}
                            </p>
                            <div className="flex gap-2 mt-2">
                                <Badge variant="outline" className="text-xs">
                                    <Database className="h-3 w-3 mr-1" /> Supabase
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                    <Globe className="h-3 w-3 mr-1" /> PubMed
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                    <FlaskConical className="h-3 w-3 mr-1" /> ClinicalTrials.gov
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                    <AlertTriangle className="h-3 w-3 mr-1" /> OpenFDA
                                </Badge>
                            </div>
                        </div>
                    </CardTitle>
                </CardHeader>
            </Card>

            {/* Input Form */}
            <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border-white/30">
                <CardContent className="pt-6 space-y-4">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium flex items-center gap-2">
                            <Target className="h-4 w-4 text-violet-500" />
                            {t('Pathologie cible')} *
                        </Label>
                        <Textarea
                            placeholder="Ex: Syndrome Néphrotique Idiopathique, FSGS, Maladie de Crohn..."
                            value={pathology}
                            onChange={(e) => setPathology(e.target.value)}
                            className="min-h-[60px] resize-none"
                            rows={2}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm font-medium flex items-center gap-2">
                            <Lightbulb className="h-4 w-4 text-amber-500" />
                            {t('Objectif de recherche')}
                        </Label>
                        <Textarea
                            placeholder="Ex: Trouver une piste de traitement CURATIF innovante (non palliatif)"
                            value={researchGoal}
                            onChange={(e) => setResearchGoal(e.target.value)}
                            className="min-h-[60px] resize-none"
                            rows={2}
                        />
                        <p className="text-xs text-muted-foreground">
                            {t('Par défaut: Recherche de traitement curatif inexistant')}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm font-medium flex items-center gap-2">
                            <FileText className="h-4 w-4 text-blue-500" />
                            {t('Contexte additionnel (optionnel)')}
                        </Label>
                        <Textarea
                            placeholder="Ex: Patient pédiatrique, cortico-résistant, mutations génétiques connues..."
                            value={additionalContext}
                            onChange={(e) => setAdditionalContext(e.target.value)}
                            className="min-h-[60px] resize-none"
                            rows={2}
                        />
                    </div>

                    <Button
                        onClick={handleStartDiscovery}
                        disabled={!pathology.trim() && !isResearching}
                        className={`w-full gap-2 h-12 text-lg ${isResearching
                            ? 'bg-red-500 hover:bg-red-600'
                            : 'bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-600 hover:from-violet-600 hover:via-purple-600 hover:to-indigo-700'
                            }`}
                    >
                        {isResearching ? (
                            <>
                                <Square className="h-5 w-5" />
                                {t('Arrêter l\'analyse')}
                            </>
                        ) : (
                            <>
                                <Play className="h-5 w-5" />
                                {t('Lancer la découverte')}
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>

            {/* Progress Steps */}
            {steps.length > 0 && (
                <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border-white/30">
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-sm font-medium">
                            <Activity className="h-4 w-4" />
                            {t('Collecte des données')} ({steps.filter(s => s.status === 'completed').length}/{steps.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {steps.map((step) => (
                                <div key={step.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-sm">
                                    {step.status === 'running' ? (
                                        <Loader2 className="h-4 w-4 animate-spin text-violet-500 flex-shrink-0" />
                                    ) : step.status === 'completed' ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                                    ) : step.status === 'error' ? (
                                        <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                                    ) : (
                                        <div className="h-4 w-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
                                    )}
                                    <span className="truncate">{step.details}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Sources Summary */}
            {sources && (
                <Card className="bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700">
                    <CardContent className="py-3">
                        <div className="flex flex-wrap gap-3 justify-center">
                            <Badge variant="outline" className="text-xs px-3 py-1">
                                📁 Local: <strong className="ml-1">{sources.local}</strong>
                            </Badge>
                            <Badge variant="outline" className="text-xs px-3 py-1">
                                🔬 PubMed: <strong className="ml-1">{sources.pubmed}</strong>
                            </Badge>
                            <Badge variant="outline" className="text-xs px-3 py-1">
                                🧪 ClinicalTrials: <strong className="ml-1">{sources.trials}</strong>
                            </Badge>
                            <Badge variant="outline" className="text-xs px-3 py-1">
                                ⚠️ FDA: <strong className="ml-1">{sources.fda}</strong>
                            </Badge>
                            <Badge className="bg-violet-500/20 text-violet-700 text-xs px-3 py-1">
                                📊 Total: <strong className="ml-1">{sources.total} sources</strong>
                            </Badge>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Streaming Text Output - Live Generation */}
            {(streamingText || isResearching) && (
                <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border-white/30">
                    <CardHeader
                        className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors"
                        onClick={() => setShowFullReport(!showFullReport)}
                    >
                        <CardTitle className="flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <Brain className={`h-5 w-5 text-violet-600 ${isResearching ? 'animate-pulse' : ''}`} />
                                {t('Analyse en cours')}
                                {isResearching && (
                                    <span className="text-sm font-normal text-muted-foreground ml-2">
                                        ({streamingText.length.toLocaleString()} caractères)
                                    </span>
                                )}
                            </span>
                            <div className="flex items-center gap-2">
                                {isResearching && (
                                    <Badge className="bg-violet-500 animate-pulse">
                                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                        Génération...
                                    </Badge>
                                )}
                                {showFullReport ? (
                                    <ChevronUp className="h-5 w-5" />
                                ) : (
                                    <ChevronDown className="h-5 w-5" />
                                )}
                            </div>
                        </CardTitle>
                    </CardHeader>
                    {showFullReport && (
                        <CardContent>
                            <div
                                ref={textAreaRef}
                                className="h-[600px] overflow-y-auto pr-4 scroll-smooth"
                            >
                                <div className="prose prose-sm dark:prose-invert max-w-none">
                                    <ReactMarkdown
                                        components={{
                                            h1: ({ children }) => <h1 className="text-2xl font-bold mt-6 mb-4 text-violet-700 dark:text-violet-400 border-b border-violet-200 pb-2">{children}</h1>,
                                            h2: ({ children }) => <h2 className="text-xl font-bold mt-5 mb-3 text-purple-700 dark:text-purple-400">{children}</h2>,
                                            h3: ({ children }) => <h3 className="text-lg font-semibold mt-4 mb-2 text-indigo-700 dark:text-indigo-400">{children}</h3>,
                                            h4: ({ children }) => <h4 className="text-base font-medium mt-3 mb-2 text-slate-700 dark:text-slate-300">{children}</h4>,
                                            p: ({ children }) => <p className="my-2 text-slate-600 dark:text-slate-300 leading-relaxed">{children}</p>,
                                            ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
                                            ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
                                            li: ({ children }) => <li className="text-slate-600 dark:text-slate-300">{children}</li>,
                                            strong: ({ children }) => <strong className="font-bold text-slate-800 dark:text-slate-200">{children}</strong>,
                                            blockquote: ({ children }) => <blockquote className="border-l-4 border-amber-500 pl-4 my-4 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-r-lg italic">{children}</blockquote>,
                                            code: ({ children }) => <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-sm font-mono text-violet-600 dark:text-violet-400">{children}</code>,
                                            table: ({ children }) => <div className="overflow-x-auto my-4"><table className="min-w-full border-collapse border border-slate-300 dark:border-slate-600">{children}</table></div>,
                                            th: ({ children }) => <th className="border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-left font-semibold">{children}</th>,
                                            td: ({ children }) => <td className="border border-slate-300 dark:border-slate-600 px-3 py-2">{children}</td>,
                                            hr: () => <hr className="my-6 border-slate-300 dark:border-slate-600" />,
                                        }}
                                    >
                                        {streamingText}
                                    </ReactMarkdown>
                                    {/* Typing cursor */}
                                    {isResearching && (
                                        <span className="inline-block w-2 h-5 bg-violet-500 animate-pulse ml-1 align-middle" />
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    )}
                </Card>
            )}

            {/* Hypotheses Summary (shows after extraction) */}
            {hypotheses.length > 0 && (
                <Card className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                            <Beaker className="h-5 w-5" />
                            {t('Hypothèses identifiées')} ({hypotheses.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-3">
                            {hypotheses.map((h) => (
                                <div key={h.id} className="p-4 bg-white/80 dark:bg-slate-800/80 rounded-lg border shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Badge variant="outline" className="font-bold text-lg">
                                                    {h.id}
                                                </Badge>
                                                <h4 className="font-medium">{h.title}</h4>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                {getClassificationBadge(h.classification)}
                                                <div className={`flex items-center gap-1 font-bold ${getProbabilityColor(h.probability)}`}>
                                                    {getProbabilityEmoji(h.probability)}
                                                    <span>{h.probability}% de succès</span>
                                                </div>
                                            </div>
                                        </div>
                                        <TrendingUp className={`h-8 w-8 ${getProbabilityColor(h.probability)}`} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Disclaimer */}
            <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-red-800 dark:text-red-200">
                            <p className="font-bold mb-2">🚨 AVERTISSEMENT MÉDICAL CRITIQUE</p>
                            <p className="mb-2">
                                Cette analyse est générée par IA à des fins de <strong>RECHERCHE et EXPLORATION SCIENTIFIQUE UNIQUEMENT</strong>.
                            </p>
                            <p className="mb-2">
                                Elle <strong>NE REMPLACE EN AUCUN CAS</strong> le jugement clinique d'un spécialiste qualifié, une consultation médicale,
                                ou les protocoles thérapeutiques établis.
                            </p>
                            <p>
                                <strong>TOUTES les hypothèses sont EXPÉRIMENTALES, SPÉCULATIVES et NON APPROUVÉES.</strong>
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default DiscoveryEnginePanel;
