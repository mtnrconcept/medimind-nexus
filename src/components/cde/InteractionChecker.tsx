import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertCircle, Plus, X, Activity, ShieldCheck, ShieldAlert, Loader2, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import { useAI } from '@/contexts/AIContext';
import { toast } from 'sonner';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Interaction {
    id: string;
    medication_id: string;
    interacting_drug: string;
    severity: string;
    description: string;
    recommendation: string;
    medication_name?: string; // joined
}

const InteractionChecker = () => {
    const { invokeAI } = useAI();
    const { t } = useAutoTranslation();
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    // State definitions restored
    const [availableDrugs, setAvailableDrugs] = useState<{ id: string, name: string }[]>([]);
    const [selectedDrugs, setSelectedDrugs] = useState<{ id: string, name: string }[]>([]);
    const [interactions, setInteractions] = useState<Interaction[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        // Initial load of some common drugs or just empty
        // loadDrugs(); // Optional: load top 20 or wait for search
    }, []);

    // New: Global Search
    const searchGlobalDrugs = async (query: string) => {
        setIsSearching(true);
        try {
            // Local search first (optional, or mix)
            // For now, let's rely on the edge function which can search local + external if configured, 
            // or just external. The edge function "search-medical-concepts" searches NCBI/PubMed/MedGen.

            const { data, error } = await invokeAI('search-medical-concepts', {
                query, type: 'medication'
            });

            if (error) throw error;

            if (data?.results) {
                // Map results to our format
                const mapped = data.results.map((r: any) => ({
                    id: r.id || `glb-${Math.random().toString(36).substr(2, 9)}`,
                    name: r.name,
                    source: r.source
                }));
                setAvailableDrugs(mapped);
            }
        } catch (e) {
            console.error("Global search error:", e);
            toast.error("Erreur recherche globale");
        } finally {
            setIsSearching(false);
        }
    };

    const handleAddDrug = (drug: { id: string, name: string }) => {
        if (!selectedDrugs.find(d => d.name.toLowerCase() === drug.name.toLowerCase())) {
            const newSelection = [...selectedDrugs, drug];
            setSelectedDrugs(newSelection);
            analyzeInteractions(newSelection);
        }
        setOpen(false);
        setSearchQuery(""); // Reset search
    };

    const handleRemoveDrug = (drugId: string) => {
        const newSelection = selectedDrugs.filter(d => d.id !== drugId);
        setSelectedDrugs(newSelection);
        analyzeInteractions(newSelection);
    };

    const analyzeInteractions = async (drugs: { id: string, name: string }[]) => {
        if (drugs.length < 2) {
            setInteractions([]);
            return;
        }

        setIsAnalyzing(true);
        setInteractions([]); // Clear previous

        try {
            const drugNames = drugs.map(d => d.name);
            let interactionsFound: Interaction[] = [];

            // 1. Local Check (Mocked for now as per previous logic, or real DB query)
            // Since we upgraded to real edge functions, let's prioritize the AI/Global check 
            // if we are meant to be a "Global Tool".
            // However, to save tokens/time, checking a local list is better if available.
            // ... [Keep existing local logic or simplify] ... 

            // For this task, we want robust global check. 
            // Let's use the 'focused-research' function to ask the AI specifically about these drugs.

            const aiQuery = `Analyze potential drug interactions between: ${drugNames.join(', ')}. 
                            Return a JSON array of objects with fields: 
                            - medication_name (one of the drugs)
                            - interacting_drug (the other drug)
                            - severity (High, Moderate, Low)
                            - description (brief clinical explanation)
                            - recommendation (what to do).
                            Only report established interactions. If none, return empty array.`;

            const { data, error } = await invokeAI('focused-research', {
                query: aiQuery,
                context: {
                    type: 'interaction_check',
                    drugs: drugNames
                }
            });

            if (error) throw error;

            const aiResponse = data?.analysis || data?.response || '';

            // Parse JSON from AI response
            try {
                // Find JSON array in the text
                const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    interactionsFound = parsed.map((item: any, i: number) => ({
                        id: `ai-${i}`,
                        medication_id: item.medication_name, // temporary placeholder
                        medication_name: item.medication_name,
                        interacting_drug: item.interacting_drug,
                        severity: item.severity,
                        description: item.description,
                        recommendation: item.recommendation
                    }));
                }
            } catch (e) {
                console.warn("Could not parse AI interactions", e);
            }

            setInteractions(interactionsFound);

        } catch (err) {
            console.error('Analysis failed', err);
            toast.error("Erreur lors de l'analyse des interactions");
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Severity color helper
    const getSeverityColor = (severity: string) => {
        switch (severity?.toLowerCase()) {
            case 'high':
            case 'severe':
            case 'major':
                return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800';
            case 'moderate':
                return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800';
            default:
                return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
        }
    };

    return (
        <div className="grid md:grid-cols-3 gap-6 h-full">
            {/* Selection Panel */}
            <Card className="md:col-span-1 bg-white/50 dark:bg-slate-900/50 flex flex-col">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Activity className="h-5 w-5 text-violet-500" />
                        {t('Sélection Substances')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col space-y-4">
                    <Popover open={open} onOpenChange={setOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" aria-expanded={open} className="justify-between w-full">
                                {t('Ajouter une substance...')}
                                <Plus className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="p-0 w-[300px]">
                            <Command shouldFilter={false}>
                                <CommandInput
                                    placeholder="Rechercher (ex: Aspirine)..."
                                    value={searchQuery}
                                    onValueChange={(val) => {
                                        setSearchQuery(val);
                                        // Debounce logic handles the actual fetch in useEffect/hook or direct call here
                                        if (val.length >= 2) searchGlobalDrugs(val);
                                    }}
                                />
                                {isSearching ? (
                                    <div className="py-6 text-center text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                                        Recherche globale...
                                    </div>
                                ) : (
                                    <CommandGroup className="max-h-64 overflow-auto">
                                        {availableDrugs.map((drug) => (
                                            <CommandItem
                                                key={drug.id}
                                                value={drug.name}
                                                onSelect={() => handleAddDrug(drug)}
                                            >
                                                {drug.name}
                                                {drug.id.startsWith('glb-') && (
                                                    <Globe className="ml-2 h-3 w-3 text-blue-500" />
                                                )}
                                            </CommandItem>
                                        ))}
                                        {availableDrugs.length === 0 && searchQuery.length < 2 && (
                                            <div className="py-6 text-center text-sm text-muted-foreground">
                                                Tapez au moins 2 caractères
                                            </div>
                                        )}
                                        {availableDrugs.length === 0 && searchQuery.length >= 2 && (
                                            <div className="py-6 text-center text-sm text-muted-foreground">
                                                Aucun résultat trouvé
                                            </div>
                                        )}
                                    </CommandGroup>
                                )}
                            </Command>
                        </PopoverContent>
                    </Popover>

                    <div className="flex-1">
                        <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-2 space-y-2 min-h-[200px]">
                            {selectedDrugs.length === 0 && (
                                <div className="text-center text-slate-400 text-sm py-8">
                                    {t('Aucune substance sélectionnée')}
                                </div>
                            )}
                            {selectedDrugs.map(drug => (
                                <div key={drug.id} className="flex items-center justify-between p-2 bg-white dark:bg-slate-700 rounded shadow-sm border border-slate-200 dark:border-slate-600">
                                    <span className="font-medium text-sm">{drug.name}</span>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-red-500" onClick={() => handleRemoveDrug(drug.id)}>
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Results Panel */}
            <Card className="md:col-span-2 bg-white/50 dark:bg-slate-900/50 flex flex-col">
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-violet-500" />
                        {t('Analyse des Interactions')}
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex-1">
                    {selectedDrugs.length < 2 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                            <Activity className="h-16 w-16 mb-4" />
                            <p>{t('Sélectionnez au moins 2 substances pour analyser les interactions')}</p>
                        </div>
                    ) : interactions.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-green-600 bg-green-50 dark:bg-green-900/10 rounded-xl border border-green-100 dark:border-green-900/30">
                            <ShieldCheck className="h-16 w-16 mb-4" />
                            <h3 className="text-lg font-bold">{t('Aucune interaction connue détectée')}</h3>
                            <p className="text-sm opacity-80 mt-2 max-w-sm text-center">
                                {t('Sur la base des données disponibles. Une vigilance clinique reste nécessaire.')}
                            </p>
                        </div>
                    ) : (
                        <ScrollArea className="h-[500px] pr-4">
                            <div className="space-y-4">
                                {interactions.map((interaction, idx) => (
                                    <div key={idx} className={`p-4 rounded-lg border flex gap-4 ${getSeverityColor(interaction.severity)}`}>
                                        <ShieldAlert className="h-6 w-6 shrink-0 mt-0.5" />
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <h4 className="font-bold text-base">
                                                    {interaction.medication_name} + {interaction.interacting_drug}
                                                </h4>
                                                <Badge variant="outline" className="uppercase text-[10px] bg-white/20 border-current">
                                                    {interaction.severity || 'Attention'}
                                                </Badge>
                                            </div>
                                            <p className="text-sm font-medium mb-2 opacity-90">
                                                {interaction.description}
                                            </p>
                                            {interaction.recommendation && (
                                                <div className="text-sm bg-white/30 p-2 rounded mt-2">
                                                    <strong>{t('Recommandation')}:</strong> {interaction.recommendation}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default InteractionChecker;
