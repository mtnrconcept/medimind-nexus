import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
    Crosshair, BookOpen, Radio, Play, Square, Loader2, Brain,
    AlertTriangle, Lightbulb, FileText, Shield, Activity,
    Clock, Beaker, TrendingUp, ChevronDown, ChevronUp,
    ExternalLink, CheckCircle2, XCircle, AlertCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAutoTranslation } from '@/contexts/TranslationContext';

interface ResearchStep {
    id: number;
    status: 'pending' | 'running' | 'completed' | 'error';
    details?: string;
    source?: string;
}

interface Discovery {
    claim: string;
    evidence_level: string;
    clinical_validity: string;
    confidence_score: number;
    sources?: any[];
    safety_flags?: string[];
}

interface Hypothesis {
    id: string;
    title: string;
    statement: string;
    novelty_score: number;
    plausibility_score: number;
    clinical_potential?: string;
}

interface BreakingNews {
    date: string;
    headline: string;
    summary: string;
    significance: string;
    source: string;
}

interface SafetyAlert {
    date: string;
    drug: string;
    alert_type: string;
    description: string;
    severity: string;
}

type ResearchMode = 'targeted' | 'systematic' | 'live';

const AdvancedResearchPanel = () => {
    const { t } = useAutoTranslation();

    // Mode selection
    const [mode, setMode] = useState<ResearchMode>('targeted');

    // Query input
    const [query, setQuery] = useState('');
    const [timeRange, setTimeRange] = useState([6]); // months for live mode
    const [includeSafety, setIncludeSafety] = useState(true);

    // Research state
    const [isResearching, setIsResearching] = useState(false);
    const [steps, setSteps] = useState<ResearchStep[]>([]);
    const [rawOutput, setRawOutput] = useState('');
    const [discoveries, setDiscoveries] = useState<Discovery[]>([]);
    const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
    const [breakingNews, setBreakingNews] = useState<BreakingNews[]>([]);
    const [safetyAlerts, setSafetyAlerts] = useState<SafetyAlert[]>([]);
    const [sources, setSources] = useState<{ type: string, count: number }[]>([]);

    const [showRawOutput, setShowRawOutput] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const outputRef = useRef<HTMLDivElement>(null);

    const modeConfig = {
        targeted: {
            icon: Crosshair,
            title: 'Recherche Ciblée',
            description: 'Question précise, réponse sourcée',
            color: 'text-violet-500',
            bgColor: 'bg-violet-500/10',
            borderColor: 'border-violet-500/30',
            endpoint: 'targeted-research',
            placeholder: 'Ex: Quelles sont les interactions entre ciclosporine et curcumine chez l\'enfant avec syndrome néphrotique ?'
        },
        systematic: {
            icon: BookOpen,
            title: 'Recherche Systématique',
            description: 'Revue méthodique GRADE complète',
            color: 'text-blue-500',
            bgColor: 'bg-blue-500/10',
            borderColor: 'border-blue-500/30',
            endpoint: 'systematic-research',
            placeholder: 'Ex: Syndrome néphrotique idiopathique - thérapies innovantes et repositionnement médicamenteux'
        },
        live: {
            icon: Radio,
            title: 'Recherche Live',
            description: 'Veille scientifique temps réel',
            color: 'text-red-500',
            bgColor: 'bg-red-500/10',
            borderColor: 'border-red-500/30',
            endpoint: 'live-research',
            placeholder: 'Ex: empagliflozine syndrome néphrotique - dernières publications et essais cliniques'
        }
    };

    const currentMode = modeConfig[mode];
    const ModeIcon = currentMode.icon;

    const handleStartResearch = async () => {
        if (!query.trim()) {
            toast.error(t('Veuillez entrer une question ou un sujet de recherche'));
            return;
        }

        if (isResearching) {
            abortControllerRef.current?.abort();
            setIsResearching(false);
            return;
        }

        setIsResearching(true);
        setSteps([]);
        setRawOutput('');
        setDiscoveries([]);
        setHypotheses([]);
        setBreakingNews([]);
        setSafetyAlerts([]);
        setSources([]);
        abortControllerRef.current = new AbortController();

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error('Vous devez être connecté');
            }

            const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${currentMode.endpoint}`;

            const body: any = mode === 'targeted'
                ? { query: query.trim() }
                : mode === 'systematic'
                    ? { topic: query.trim() }
                    : { topic: query.trim(), time_range: timeRange[0], include_safety: includeSafety };

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                },
                body: JSON.stringify(body),
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

                            // Handle step updates
                            if (parsed.type === 'step_update') {
                                setSteps(prev => {
                                    const existing = prev.find(s => s.id === parsed.step.id);
                                    if (existing) {
                                        return prev.map(s => s.id === parsed.step.id
                                            ? { ...s, ...parsed.step }
                                            : s
                                        );
                                    }
                                    return [...prev, parsed.step];
                                });
                            }

                            // Handle text
                            if (parsed.type === 'text' && parsed.content) {
                                fullOutput += parsed.content;
                                setRawOutput(fullOutput);
                                if (outputRef.current) {
                                    outputRef.current.scrollTop = outputRef.current.scrollHeight;
                                }
                            }

                            // Handle discoveries (targeted mode)
                            if (parsed.type === 'discovery' && parsed.discovery) {
                                setDiscoveries(prev => [...prev, parsed.discovery]);
                            }

                            // Handle hypotheses (systematic mode)
                            if (parsed.type === 'hypothesis' && parsed.hypothesis) {
                                setHypotheses(prev => [...prev, parsed.hypothesis]);
                            }

                            // Handle breaking news (live mode)
                            if (parsed.type === 'breaking_news' && parsed.breaking_news) {
                                setBreakingNews(prev => [...prev, parsed.breaking_news]);
                            }

                            // Handle safety alerts (live mode)
                            if (parsed.type === 'safety_alert' && parsed.safety_alert) {
                                setSafetyAlerts(prev => [...prev, parsed.safety_alert]);
                            }

                            // Handle sources summary
                            if (parsed.type === 'sources' && parsed.sources) {
                                setSources(parsed.sources);
                            }

                            // Handle warnings
                            if (parsed.type === 'warning' && parsed.warning) {
                                toast.warning(parsed.warning);
                            }

                        } catch {
                            // Ignore parse errors
                        }
                    }
                }
            }

            toast.success(t('Recherche terminée'));
        } catch (err: any) {
            if (err.name === 'AbortError') {
                toast.info(t('Recherche interrompue'));
            } else {
                console.error('Research error:', err);
                toast.error(err.message || t('Erreur lors de la recherche'));
            }
        } finally {
            setIsResearching(false);
        }
    };

    const getEvidenceBadge = (level: string) => {
        const badges: Record<string, { color: string; label: string }> = {
            'guideline': { color: 'bg-green-500/20 text-green-700', label: '📋 Guideline' },
            'meta_analysis': { color: 'bg-blue-500/20 text-blue-700', label: '📊 Méta-analyse' },
            'rct': { color: 'bg-cyan-500/20 text-cyan-700', label: '🔬 RCT' },
            'cohort': { color: 'bg-yellow-500/20 text-yellow-700', label: '👥 Cohorte' },
            'case_series': { color: 'bg-orange-500/20 text-orange-700', label: '📝 Cas' },
            'animal': { color: 'bg-purple-500/20 text-purple-700', label: '🐭 Animal' },
            'in_vitro': { color: 'bg-pink-500/20 text-pink-700', label: '🧫 In vitro' },
            'hypothesis': { color: 'bg-slate-500/20 text-slate-700', label: '💡 Hypothèse' },
        };
        const badge = badges[level] || { color: 'bg-slate-500/20', label: level };
        return <Badge className={badge.color}>{badge.label}</Badge>;
    };

    const getValidityIcon = (validity: string) => {
        switch (validity) {
            case 'validated': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case 'translational': return <AlertCircle className="h-4 w-4 text-yellow-500" />;
            case 'speculative': return <XCircle className="h-4 w-4 text-red-500" />;
            default: return null;
        }
    };

    return (
        <div className="space-y-6">
            {/* Mode Selector */}
            <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border-white/30">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                        <Brain className="h-5 w-5 text-violet-600" />
                        {t('Cerveau Médical IA - Recherche Avancée')}
                    </CardTitle>
                    <CardDescription>
                        {t('Sélectionnez un mode de recherche selon votre objectif')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs value={mode} onValueChange={(v) => setMode(v as ResearchMode)} className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="targeted" className="flex items-center gap-2">
                                <Crosshair className="h-4 w-4" />
                                <span className="hidden sm:inline">{t('Ciblée')}</span>
                            </TabsTrigger>
                            <TabsTrigger value="systematic" className="flex items-center gap-2">
                                <BookOpen className="h-4 w-4" />
                                <span className="hidden sm:inline">{t('Systématique')}</span>
                            </TabsTrigger>
                            <TabsTrigger value="live" className="flex items-center gap-2">
                                <Radio className="h-4 w-4" />
                                <span className="hidden sm:inline">{t('Live')}</span>
                            </TabsTrigger>
                        </TabsList>

                        <div className={`mt-4 p-4 rounded-lg border ${currentMode.bgColor} ${currentMode.borderColor}`}>
                            <div className="flex items-start gap-3">
                                <ModeIcon className={`h-6 w-6 ${currentMode.color} mt-0.5`} />
                                <div>
                                    <h3 className="font-medium">{currentMode.title}</h3>
                                    <p className="text-sm text-muted-foreground">{currentMode.description}</p>
                                </div>
                            </div>
                        </div>
                    </Tabs>
                </CardContent>
            </Card>

            {/* Query Input */}
            <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border-white/30">
                <CardContent className="pt-6 space-y-4">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">
                            {mode === 'targeted' ? t('Question de recherche') :
                                mode === 'systematic' ? t('Sujet de revue systématique') :
                                    t('Sujet de veille')}
                        </Label>
                        <Textarea
                            placeholder={currentMode.placeholder}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="min-h-[100px] resize-none"
                            rows={4}
                        />
                    </div>

                    {/* Live mode options */}
                    {mode === 'live' && (
                        <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                            <div className="space-y-2">
                                <Label className="text-sm flex items-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    {t('Fenêtre temporelle')}: {timeRange[0]} mois
                                </Label>
                                <Slider
                                    value={timeRange}
                                    onValueChange={setTimeRange}
                                    min={1}
                                    max={24}
                                    step={1}
                                    className="w-full"
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <Switch
                                    id="safety"
                                    checked={includeSafety}
                                    onCheckedChange={setIncludeSafety}
                                />
                                <Label htmlFor="safety" className="text-sm cursor-pointer flex items-center gap-2">
                                    <Shield className="h-4 w-4 text-red-500" />
                                    {t('Inclure signaux sécurité')}
                                </Label>
                            </div>
                        </div>
                    )}

                    {/* Launch Button */}
                    <Button
                        onClick={handleStartResearch}
                        disabled={!query.trim() && !isResearching}
                        className={`w-full gap-2 ${isResearching
                            ? 'bg-red-500 hover:bg-red-600'
                            : 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700'
                            }`}
                    >
                        {isResearching ? (
                            <>
                                <Square className="h-4 w-4" />
                                {t('Arrêter')}
                            </>
                        ) : (
                            <>
                                <Play className="h-4 w-4" />
                                {t('Lancer la recherche')}
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
                            {t('Progression')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {steps.map((step) => (
                                <div key={step.id} className="flex items-center gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50">
                                    {step.status === 'running' ? (
                                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                    ) : step.status === 'completed' ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    ) : step.status === 'error' ? (
                                        <XCircle className="h-4 w-4 text-red-500" />
                                    ) : (
                                        <div className="h-4 w-4 rounded-full border-2 border-slate-300" />
                                    )}
                                    <span className="text-sm flex-1">{step.details}</span>
                                    {step.source && (
                                        <Badge variant="outline" className="text-xs">{step.source}</Badge>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Discoveries (Targeted Mode) */}
            {discoveries.length > 0 && (
                <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border-white/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Lightbulb className="h-5 w-5 text-amber-500" />
                            {t('Évidences identifiées')} ({discoveries.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {discoveries.map((d, i) => (
                            <div key={i} className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg border space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-medium">{d.claim}</p>
                                    <div className="flex items-center gap-2">
                                        {getValidityIcon(d.clinical_validity)}
                                        {getEvidenceBadge(d.evidence_level)}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span>Confiance: {Math.round((d.confidence_score || 0) * 100)}%</span>
                                    {d.safety_flags && d.safety_flags.length > 0 && (
                                        <Badge variant="destructive" className="text-xs">
                                            <AlertTriangle className="h-3 w-3 mr-1" />
                                            {d.safety_flags.length} alerte(s)
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Hypotheses (Systematic Mode) */}
            {hypotheses.length > 0 && (
                <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border-white/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Beaker className="h-5 w-5 text-cyan-500" />
                            {t('Hypothèses générées')} ({hypotheses.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {hypotheses.map((h, i) => (
                            <div key={i} className="p-4 bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                    <h4 className="font-medium text-cyan-700 dark:text-cyan-300">{h.title}</h4>
                                    {h.clinical_potential && (
                                        <Badge variant="outline" className="text-xs">{h.clinical_potential}</Badge>
                                    )}
                                </div>
                                <p className="text-sm">{h.statement}</p>
                                <div className="flex items-center gap-4 text-xs">
                                    <span className="flex items-center gap-1">
                                        <TrendingUp className="h-3 w-3 text-green-500" />
                                        Nouveauté: {h.novelty_score}/100
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <CheckCircle2 className="h-3 w-3 text-blue-500" />
                                        Plausibilité: {h.plausibility_score}/100
                                    </span>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Breaking News (Live Mode) */}
            {breakingNews.length > 0 && (
                <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border-white/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Radio className="h-5 w-5 text-red-500 animate-pulse" />
                            {t('Actualités majeures')} ({breakingNews.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {breakingNews.map((news, i) => (
                            <div key={i} className="p-4 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 rounded-lg border border-red-200 dark:border-red-800 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                    <h4 className="font-medium">{news.headline}</h4>
                                    <Badge
                                        variant={news.significance === 'High' ? 'destructive' : 'secondary'}
                                        className="text-xs"
                                    >
                                        {news.significance}
                                    </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">{news.summary}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" />
                                    {news.date}
                                    {news.source && (
                                        <a href={news.source.startsWith('http') ? news.source : `https://pubmed.ncbi.nlm.nih.gov/${news.source.replace('PMID:', '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 text-blue-500 hover:underline">
                                            <ExternalLink className="h-3 w-3" />
                                            Source
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Safety Alerts (Live Mode) */}
            {safetyAlerts.length > 0 && (
                <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border-red-300 dark:border-red-800">
                    <CardHeader className="bg-red-50 dark:bg-red-900/20">
                        <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                            <AlertTriangle className="h-5 w-5" />
                            {t('Alertes de sécurité')} ({safetyAlerts.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-4">
                        {safetyAlerts.map((alert, i) => (
                            <div key={i} className="p-4 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-800 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                    <h4 className="font-medium text-red-700 dark:text-red-300">
                                        {alert.drug} - {alert.alert_type}
                                    </h4>
                                    <Badge variant="destructive" className="text-xs">{alert.severity}</Badge>
                                </div>
                                <p className="text-sm">{alert.description}</p>
                                <div className="text-xs text-muted-foreground">{alert.date}</div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Raw Output (collapsible) */}
            {rawOutput && (
                <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border-white/30">
                    <CardHeader
                        className="cursor-pointer"
                        onClick={() => setShowRawOutput(!showRawOutput)}
                    >
                        <CardTitle className="flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <FileText className="h-5 w-5 text-slate-500" />
                                {t('Analyse complète')}
                            </span>
                            {showRawOutput ? (
                                <ChevronUp className="h-4 w-4" />
                            ) : (
                                <ChevronDown className="h-4 w-4" />
                            )}
                        </CardTitle>
                    </CardHeader>
                    {showRawOutput && (
                        <CardContent>
                            <ScrollArea className="h-[400px]">
                                <div
                                    ref={outputRef}
                                    className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap font-mono text-xs"
                                >
                                    {rawOutput}
                                    {isResearching && (
                                        <span className="inline-block w-2 h-4 bg-violet-400 animate-pulse ml-1" />
                                    )}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    )}
                </Card>
            )}

            {/* Sources Summary */}
            {sources.length > 0 && (
                <Card className="bg-slate-50 dark:bg-slate-900/50">
                    <CardContent className="py-4">
                        <div className="flex flex-wrap gap-3 justify-center">
                            {sources.map((s, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                    {s.type}: {s.count}
                                </Badge>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Disclaimer */}
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800 dark:text-amber-200">
                        <p className="font-medium mb-1">{t('⚠️ Avertissement médical')}</p>
                        <p>
                            {t('Cette analyse est générée par IA à des fins de recherche uniquement. Elle ne remplace pas le jugement clinique d\'un professionnel de santé qualifié. Toute décision thérapeutique doit être validée par un médecin.')}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdvancedResearchPanel;
