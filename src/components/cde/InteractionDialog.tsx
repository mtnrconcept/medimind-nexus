
import { useEffect, useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ShieldCheck, Search, Loader2, Globe } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import { toast } from 'sonner';

interface InteractionDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    node: { id: string; name: string; node_type: string } | null;
}

interface Interaction {
    id: string;
    interacting_drug: string;
    description: string | null;
    severity: string | null;
    recommendation: string | null;
}

interface Medication {
    id: string;
    name: string;
    substance: string | null;
}

export function InteractionDialog({ open, onOpenChange, node }: InteractionDialogProps) {
    const { t } = useAutoTranslation();
    const [interactions, setInteractions] = useState<Interaction[]>([]);
    const [safeMeds, setSafeMeds] = useState<Medication[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (open && node) {
            fetchData();
        } else {
            // Reset state on close
            setInteractions([]);
            setSafeMeds([]);
            setSearchQuery('');
        }
    }, [open, node]);

    const fetchData = async () => {
        if (!node) return;
        setIsLoading(true);

        try {
            // 1. Find relevant medication IDs (interactions table is linked to medication_id)
            // match by name or substance
            const { data: medIds, error: medError } = await supabase
                .from('medications')
                .select('id, name')
                .or(`name.ilike.%${node.name}%,substance.ilike.%${node.name}%`);

            if (medError) throw medError;

            const targetIds = medIds?.map(m => m.id) || [];

            // 2. Fetch Interactions
            let interactionsData: Interaction[] = [];
            if (targetIds.length > 0) {
                const { data: ints, error: intError } = await supabase
                    .from('drug_interactions')
                    .select('id, interacting_drug, description, severity, recommendation')
                    .in('medication_id', targetIds);

                if (intError) throw intError;
                interactionsData = ints || [];
            } else {
                // Fallback: search by interacting_drug name if node itself is the interactor
                const { data: intsReverse } = await supabase
                    .from('drug_interactions')
                    .select('id, interacting_drug, description, severity, recommendation')
                    .ilike('interacting_drug', `%${node.name}%`);

                if (intsReverse) {
                    interactionsData = [...interactionsData, ...intsReverse];
                }
            }

            setInteractions(interactionsData);

            // 3. Fetch Safe Medications (Optimization: fetch top 100, analyze safety locally)
            // We fetch a batch of medications and filter out those that appear in the interactions list
            const interactedNames = new Set(interactionsData.map(i => i.interacting_drug.toLowerCase()));

            const { data: allMeds, error: safeError } = await supabase
                .from('medications')
                .select('id, name, substance')
                .limit(100)
                .order('name');

            if (safeError) throw safeError;

            // Filter out interactions
            const safe = (allMeds || []).filter(m =>
                !interactedNames.has(m.name.toLowerCase()) &&
                (!m.substance || !interactedNames.has(m.substance.toLowerCase())) &&
                m.name.toLowerCase() !== node.name.toLowerCase() // exclude self
            );

            setSafeMeds(safe);

        } catch (error) {
            console.error('Error fetching interactions:', error);
            toast.error("Erreur lors du chargement des interactions");
        } finally {
            setIsLoading(false);
        }
    };

    const handleGlobalSearch = async () => {
        if (!node) return;
        setIsLoading(true);
        toast.info("Recherche dans la base mondiale DrugBank...");

        try {
            const response = await supabase.functions.invoke('focused-research', {
                body: {
                    query: `Find known drug interactions for ${node.name}. 
                           Return a JSON array with fields: interacting_drug, severity (high/moderate/low), description, recommendation.
                           Focus on clinically significant interactions. Limit to 10.`,
                    context: {
                        node: node.name,
                        type: node.node_type
                    }
                }
            });

            if (response.error) throw response.error;

            const aiResponse = response.data?.analysis || response.data?.response || '';

            // Try to extract JSON from the response
            try {
                // Find JSON array in the text
                const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    const mappedInteractions: Interaction[] = parsed.map((item: any, i: number) => ({
                        id: `global-${i}`,
                        interacting_drug: item.interacting_drug,
                        description: item.description,
                        severity: item.severity,
                        recommendation: item.recommendation
                    }));
                    setInteractions(mappedInteractions);
                    toast.success(`${mappedInteractions.length} interactions trouvées via l'API Globale`);
                } else {
                    throw new Error("Format de réponse invalide");
                }
            } catch (e) {
                console.error("Failed to parse AI response", e);
                toast.warning("L'analyse a retourné des données non structurées. Veuillez réessayer.");
            }

        } catch (error) {
            console.error('Error fetching global interactions:', error);
            toast.error("Erreur lors de la recherche globale");
        } finally {
            setIsLoading(false);
        }
    };

    const filteredSafeMeds = safeMeds.filter(m =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.substance && m.substance.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[800px] h-[80vh] flex flex-col gap-0 p-0 bg-secondary/10 backdrop-blur-xl border-border/40">
                <DialogHeader className="px-6 py-4 border-b border-border/10 bg-background/60">
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        Analyse des Interactions: <span className="text-primary">{node?.name}</span>
                        {node?.node_type && <Badge variant="outline">{node.node_type}</Badge>}
                    </DialogTitle>
                    <DialogDescription>
                        Explorez les interactions connues et identifiez les combinaisons sûres potentielles.
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="interactions" className="flex-1 flex flex-col min-h-0">
                    <div className="px-6 pt-2 border-b border-border/10 bg-background/40">
                        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
                            <TabsTrigger value="interactions" className="flex gap-2">
                                <AlertTriangle className="h-4 w-4 text-orange-400" />
                                Interactions Détectées
                                <Badge variant="secondary" className="ml-1 text-xs">{interactions.length}</Badge>
                            </TabsTrigger>
                            <TabsTrigger value="safe" className="flex gap-2">
                                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                                Combinaisons Sûres
                                <Badge variant="secondary" className="ml-1 text-xs bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20">{safeMeds.length}+</Badge>
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="interactions" className="flex-1 min-h-0 p-0 m-0 relative">
                        {isLoading ? (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : interactions.length === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground p-4 text-center">
                                <ShieldCheck className="h-12 w-12 mb-2 text-emerald-500/50" />
                                <p className="mb-4">Aucune interaction détectée dans la base locale.</p>
                                <Button
                                    variant="outline"
                                    onClick={handleGlobalSearch}
                                    className="gap-2 border-primary/20 hover:bg-primary/10"
                                >
                                    <Globe className="h-4 w-4" />
                                    Rechercher dans la base mondiale (DrugBank + FDA)
                                </Button>
                            </div>
                        ) : (
                            <ScrollArea className="h-full">
                                <div className="p-6 grid gap-4 grid-cols-1 md:grid-cols-2">
                                    {interactions.map((interaction) => (
                                        <div key={interaction.id} className="p-4 rounded-lg border border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 transition-colors">
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className="font-semibold text-red-500 dark:text-red-400 flex items-center gap-2">
                                                    <AlertTriangle className="h-4 w-4" />
                                                    {interaction.interacting_drug}
                                                </h4>
                                                {interaction.severity && (
                                                    <Badge variant="destructive" className="bg-red-500/20 text-red-500 border-red-500/20 hover:bg-red-500/30">
                                                        {interaction.severity}
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-sm text-foreground/80 mb-2">{interaction.description}</p>
                                            {interaction.recommendation && (
                                                <div className="text-xs mt-2 p-2 bg-background/50 rounded border border-border/50">
                                                    <span className="font-semibold text-foreground/70">Conseil:</span> {interaction.recommendation}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        )}
                    </TabsContent>

                    <TabsContent value="safe" className="flex-1 min-h-0 p-0 m-0 flex flex-col">
                        <div className="p-4 border-b border-border/10">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="search"
                                    placeholder="Rechercher une molécule ou un médicament sûr..."
                                    className="pl-9"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        {isLoading ? (
                            <div className="flex-1 flex items-center justify-center">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : (
                            <ScrollArea className="flex-1">
                                <div className="p-6 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                                    {filteredSafeMeds.map((med) => (
                                        <div key={med.id} className="group p-3 rounded-lg border border-emerald-500/10 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all cursor-default">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                                <h4 className="font-medium truncate" title={med.name}>{med.name}</h4>
                                            </div>
                                            {med.substance && (
                                                <p className="text-xs text-emerald-500/70 pl-4 truncate">{med.substance}</p>
                                            )}
                                        </div>
                                    ))}
                                    {filteredSafeMeds.length === 0 && (
                                        <div className="col-span-full py-8 text-center text-muted-foreground">
                                            Aucun résultat trouvé pour "{searchQuery}"
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        )}
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
