import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import {
    Crosshair, Search, Play, Square, Loader2, Brain, Sparkles,
    AlertTriangle, Lightbulb, Baby, ChevronDown, Check, Pill, Stethoscope
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import ResearchJourneyStep, { ResearchStep } from './ResearchJourneyStep';
import DiscoveryCard from './DiscoveryCard';

interface TargetOption {
    id: string;
    name: string;
    type: 'pathology' | 'medication' | 'substance';
    icdCode?: string;
    atcCode?: string;
}

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

const FocusedResearchPanel = () => {
    const { t } = useAutoTranslation();

    // Target selection state
    const [targetType, setTargetType] = useState<'pathology' | 'medication'>('pathology');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTarget, setSelectedTarget] = useState<TargetOption | null>(null);
    const [options, setOptions] = useState<TargetOption[]>([]);
    const [isLoadingOptions, setIsLoadingOptions] = useState(false);
    const [comboboxOpen, setComboboxOpen] = useState(false);
    const [customPrompt, setCustomPrompt] = useState('');

    // Research state
    const [isResearching, setIsResearching] = useState(false);
    const [journeySteps, setJourneySteps] = useState<ResearchStep[]>([]);
    const [discoveries, setDiscoveries] = useState<DiscoveryCardData[]>([]);
    const [simpleExplanation, setSimpleExplanation] = useState<string>('');
    const [rawOutput, setRawOutput] = useState<string>('');
    const abortControllerRef = useRef<AbortController | null>(null);
    const outputRef = useRef<HTMLDivElement>(null);

    // Load options based on search query and type
    useEffect(() => {
        const loadOptions = async () => {
            if (searchQuery.length < 2) {
                setOptions([]);
                return;
            }

            setIsLoadingOptions(true);
            try {
                let results: TargetOption[] = [];

                if (targetType === 'pathology') {
                    const { data, error } = await supabase
                        .from('pathologies')
                        .select('id, name, icd_code')
                        .ilike('name', `%${searchQuery}%`)
                        .limit(20);

                    if (!error && data) {
                        results = data.map(p => ({
                            id: p.id,
                            name: p.name,
                            type: 'pathology' as const,
                            icdCode: p.icd_code
                        }));
                    }
                } else {
                    // Search in cde_nodes for substances first
                    const { data: substanceData, error: substanceError } = await supabase
                        .from('cde_nodes')
                        .select('id, name, properties')
                        .eq('node_type', 'substance')
                        .ilike('name', `%${searchQuery}%`)
                        .limit(15);

                    if (!substanceError && substanceData) {
                        results = substanceData.map(s => ({
                            id: s.id,
                            name: s.name,
                            type: 'substance' as const,
                            atcCode: (s.properties as any)?.atc_prefix
                        }));
                    }

                    // Also search medications table
                    const { data: medData, error: medError } = await supabase
                        .from('medications')
                        .select('id, name, atc_code')
                        .ilike('name', `%${searchQuery}%`)
                        .limit(10);

                    if (!medError && medData) {
                        results = [
                            ...results,
                            ...medData.map(m => ({
                                id: m.id,
                                name: m.name,
                                type: 'medication' as const,
                                atcCode: m.atc_code
                            }))
                        ];
                    }
                }

                setOptions(results);
            } catch (err) {
                console.error('Error loading options:', err);
            } finally {
                setIsLoadingOptions(false);
            }
        };

        const debounce = setTimeout(loadOptions, 300);
        return () => clearTimeout(debounce);
    }, [searchQuery, targetType]);

    // Start focused research
    const handleStartResearch = async () => {
        if (!selectedTarget) {
            toast.error(t('Veuillez sélectionner une cible de recherche'));
            return;
        }

        if (isResearching) {
            // Stop research
            abortControllerRef.current?.abort();
            setIsResearching(false);
            return;
        }

        setIsResearching(true);
        setJourneySteps([]);
        setDiscoveries([]);
        setSimpleExplanation('');
        setRawOutput('');
        abortControllerRef.current = new AbortController();

        // Initialize journey steps
        const initialSteps: ResearchStep[] = [
            { id: 1, title: t('Exploration du Knowledge Graph'), description: t('Analyse des nœuds et arêtes liés à la cible'), status: 'pending' },
            { id: 2, title: t('Recherche PubMed'), description: t('Recherche d\'articles scientifiques récents'), status: 'pending' },
            { id: 3, title: t('Analyse IA approfondie'), description: t('Génération d\'hypothèses par Claude'), status: 'pending' },
            { id: 4, title: t('Synthèse et découvertes'), description: t('Compilation des résultats'), status: 'pending' },
            { id: 5, title: t('Explication simplifiée'), description: t('Génération de l\'explication pour enfant'), status: 'pending' },
        ];
        setJourneySteps(initialSteps);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error('Vous devez être connecté');
            }

            // Update step 1 to running
            setJourneySteps(steps => steps.map(s =>
                s.id === 1 ? { ...s, status: 'running' as const, timestamp: new Date() } : s
            ));

            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/focused-research`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({
                    targetType: selectedTarget.type,
                    targetId: selectedTarget.id,
                    targetName: selectedTarget.name,
                    customPrompt: customPrompt.trim() || undefined,
                }),
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
                                setJourneySteps(steps => steps.map(s =>
                                    s.id === parsed.step.id
                                        ? {
                                            ...s,
                                            status: parsed.step.status,
                                            details: parsed.step.details,
                                            timestamp: new Date()
                                        }
                                        : s
                                ));
                            }

                            // Handle streaming text
                            if (parsed.type === 'text' && parsed.content) {
                                fullOutput += parsed.content;
                                setRawOutput(fullOutput);
                                if (outputRef.current) {
                                    outputRef.current.scrollTop = outputRef.current.scrollHeight;
                                }
                            }

                            // Handle discovery
                            if (parsed.type === 'discovery' && parsed.discovery) {
                                setDiscoveries(prev => [...prev, parsed.discovery]);
                            }

                            // Handle simple explanation
                            if (parsed.type === 'simple_explanation' && parsed.content) {
                                setSimpleExplanation(parsed.content);
                            }

                        } catch (e) {
                            // Ignore parse errors for partial JSON
                        }
                    }
                }
            }

            // Mark all steps as completed
            setJourneySteps(steps => steps.map(s =>
                s.status !== 'error' ? { ...s, status: 'completed' as const } : s
            ));

            toast.success(t('Recherche ciblée terminée'));
        } catch (err: any) {
            if (err.name === 'AbortError') {
                toast.info(t('Recherche interrompue'));
            } else {
                console.error('Focused research error:', err);
                toast.error(err.message || t('Erreur lors de la recherche'));
            }
        } finally {
            setIsResearching(false);
        }
    };

    const handleUpdateStatus = async (cardId: string, newStatus: string) => {
        // Update local state
        setDiscoveries(prev => prev.map(d =>
            d.id === cardId ? { ...d, status: newStatus, reviewed_at: new Date().toISOString() } : d
        ));
    };

    return (
        <div className="space-y-6">
            {/* Target Selection Card */}
            <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border-white/30">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Crosshair className="h-5 w-5 text-violet-600" />
                        {t('Sélection de la cible de recherche')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Type selector */}
                    <div className="space-y-3">
                        <Label className="text-sm font-medium">{t('Type de cible')}</Label>
                        <RadioGroup
                            value={targetType}
                            onValueChange={(v) => {
                                setTargetType(v as 'pathology' | 'medication');
                                setSelectedTarget(null);
                                setSearchQuery('');
                            }}
                            className="flex gap-4"
                        >
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="pathology" id="pathology" />
                                <Label htmlFor="pathology" className="flex items-center gap-2 cursor-pointer">
                                    <Stethoscope className="h-4 w-4 text-blue-500" />
                                    {t('Pathologie')}
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="medication" id="medication" />
                                <Label htmlFor="medication" className="flex items-center gap-2 cursor-pointer">
                                    <Pill className="h-4 w-4 text-green-500" />
                                    {t('Médicament / Substance')}
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>

                    {/* Search combobox */}
                    <div className="space-y-3">
                        <Label className="text-sm font-medium">{t('Rechercher')}</Label>
                        <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    aria-expanded={comboboxOpen}
                                    className="w-full justify-between"
                                >
                                    {selectedTarget ? (
                                        <span className="flex items-center gap-2">
                                            {selectedTarget.type === 'pathology' ? (
                                                <Stethoscope className="h-4 w-4 text-blue-500" />
                                            ) : (
                                                <Pill className="h-4 w-4 text-green-500" />
                                            )}
                                            {selectedTarget.name}
                                            {(selectedTarget.icdCode || selectedTarget.atcCode) && (
                                                <Badge variant="outline" className="ml-2 text-xs">
                                                    {selectedTarget.icdCode || selectedTarget.atcCode}
                                                </Badge>
                                            )}
                                        </span>
                                    ) : (
                                        <span className="text-muted-foreground">
                                            {t('Tapez pour rechercher...')}
                                        </span>
                                    )}
                                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-full p-0" align="start">
                                <Command>
                                    <CommandInput
                                        placeholder={targetType === 'pathology' ? t('Rechercher une pathologie...') : t('Rechercher un médicament...')}
                                        value={searchQuery}
                                        onValueChange={setSearchQuery}
                                    />
                                    <CommandList>
                                        <CommandEmpty>
                                            {isLoadingOptions ? (
                                                <div className="flex items-center justify-center py-4">
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                </div>
                                            ) : searchQuery.length < 2 ? (
                                                t('Tapez au moins 2 caractères...')
                                            ) : (
                                                t('Aucun résultat trouvé')
                                            )}
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {options.map((option) => (
                                                <CommandItem
                                                    key={option.id}
                                                    value={option.name}
                                                    onSelect={() => {
                                                        setSelectedTarget(option);
                                                        setComboboxOpen(false);
                                                    }}
                                                >
                                                    <Check
                                                        className={`mr-2 h-4 w-4 ${selectedTarget?.id === option.id ? 'opacity-100' : 'opacity-0'}`}
                                                    />
                                                    <div className="flex items-center gap-2">
                                                        {option.type === 'pathology' ? (
                                                            <Stethoscope className="h-4 w-4 text-blue-500" />
                                                        ) : option.type === 'substance' ? (
                                                            <Brain className="h-4 w-4 text-violet-500" />
                                                        ) : (
                                                            <Pill className="h-4 w-4 text-green-500" />
                                                        )}
                                                        <span>{option.name}</span>
                                                        {(option.icdCode || option.atcCode) && (
                                                            <Badge variant="outline" className="text-xs">
                                                                {option.icdCode || option.atcCode}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Custom Prompt Input */}
                    <div className="space-y-3">
                        <Label className="text-sm font-medium flex items-center gap-2">
                            <Brain className="h-4 w-4 text-violet-500" />
                            {t('Demande spécifique (optionnel)')}
                        </Label>
                        <Textarea
                            placeholder={t('Ex: Cherche des interactions avec les inhibiteurs de CYP3A4, identifie les contre-indications chez l\'enfant, explore les nouvelles thérapies...')}
                            value={customPrompt}
                            onChange={(e) => setCustomPrompt(e.target.value)}
                            className="min-h-[80px] resize-none text-sm"
                            rows={3}
                        />
                        <p className="text-xs text-slate-500">
                            {t('Orientez la recherche avec une question précise. Le modèle Claude Opus 4.5 analysera selon vos critères.')}
                        </p>
                    </div>

                    {/* Launch button */}
                    <Button
                        onClick={handleStartResearch}
                        disabled={!selectedTarget && !isResearching}
                        className={`w-full gap-2 ${isResearching
                            ? 'bg-red-500 hover:bg-red-600'
                            : 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700'
                            }`}
                    >
                        {isResearching ? (
                            <>
                                <Square className="h-4 w-4" />
                                {t('Arrêter la recherche')}
                            </>
                        ) : (
                            <>
                                <Play className="h-4 w-4" />
                                {t('Lancer la Recherche Ciblée')}
                            </>
                        )}
                    </Button>
                </CardContent>
            </Card>

            {/* Research Journey */}
            {journeySteps.length > 0 && (
                <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border-white/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-amber-500" />
                            {t('Cheminement de la recherche')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {journeySteps.map((step, index) => (
                                <ResearchJourneyStep
                                    key={step.id}
                                    step={step}
                                    isLast={index === journeySteps.length - 1}
                                />
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Raw Analysis Output */}
            {rawOutput && (
                <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border-white/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Brain className="h-5 w-5 text-violet-600" />
                            {t('Analyse détaillée')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ScrollArea className="h-[300px]">
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
                </Card>
            )}

            {/* Discoveries */}
            {discoveries.length > 0 && (
                <Card className="bg-white/70 dark:bg-slate-800/70 backdrop-blur border-white/30">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Lightbulb className="h-5 w-5 text-amber-500" />
                            {t('Découvertes')} ({discoveries.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {discoveries.map((discovery) => (
                            <DiscoveryCard
                                key={discovery.id}
                                data={discovery}
                                onUpdateStatus={handleUpdateStatus}
                            />
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Simple Explanation for Children */}
            {simpleExplanation && (
                <Card className="bg-gradient-to-br from-pink-50 via-purple-50 to-indigo-50 dark:from-pink-900/20 dark:via-purple-900/20 dark:to-indigo-900/20 border-purple-200 dark:border-purple-800">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Baby className="h-5 w-5 text-pink-500" />
                            {t('Explication pour un enfant de 10 ans')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="p-6 bg-white/60 dark:bg-slate-800/60 rounded-xl border border-purple-200/50 dark:border-purple-700/50">
                            <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                                {simpleExplanation}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
};

export default FocusedResearchPanel;
