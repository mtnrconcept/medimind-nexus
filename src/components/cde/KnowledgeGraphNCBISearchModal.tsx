
import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, Plus, Globe, Check, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface KnowledgeGraphNCBISearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    onNodeAdded: () => void;
}

type NodeType = 'pathology' | 'medication' | 'symptom' | 'treatment';

interface NCBIConcept {
    id: string;
    name: string;
    type: string;
    source: string;
    description?: string;
}

export default function KnowledgeGraphNCBISearchModal({ isOpen, onClose, onNodeAdded }: KnowledgeGraphNCBISearchModalProps) {
    const [query, setQuery] = useState('');
    const [nodeType, setNodeType] = useState<NodeType>('pathology');
    const [results, setResults] = useState<NCBIConcept[]>([]);
    const [loading, setLoading] = useState(false);
    const [adding, setAdding] = useState<string | null>(null); // ID of node being added

    const handleSearch = async () => {
        if (!query || query.length < 3) {
            toast.error("Veuillez saisir au moins 3 caractères");
            return;
        }

        setLoading(true);
        setResults([]);
        try {
            const { data, error } = await supabase.functions.invoke('search-medical-concepts', {
                body: { query, type: nodeType }
            });

            if (error) throw error;
            if (data?.concepts) {
                setResults(data.concepts);
            }
        } catch (error) {
            console.error("Search error:", error);
            toast.error("Erreur lors de la recherche NCBI");
        } finally {
            setLoading(false);
        }
    };

    const handleAddNode = async (concept: NCBIConcept) => {
        setAdding(concept.id);
        try {
            // Check if node exists
            const { data: existing } = await supabase
                .from('cde_nodes')
                .select('id')
                .eq('external_id', concept.id)
                .maybeSingle();

            if (existing) {
                toast.info(`Le nœud "${concept.name}" existe déjà`);
                setAdding(null);
                return;
            }

            // Insert new node
            const { error } = await supabase.from('cde_nodes').insert({
                name: concept.name,
                node_type: nodeType, // Use the selected type for consistency
                external_id: concept.id,
                properties: {
                    description: concept.description || "Importé depuis NCBI",
                    source: concept.source,
                    imported_at: new Date().toISOString()
                }
            });

            if (error) throw error;

            toast.success(`Nœud "${concept.name}" ajouté avec succès`);
            onNodeAdded(); // Trigger graph refresh
        } catch (error) {
            console.error("Add node error:", error);
            toast.error("Erreur lors de l'ajout du nœud");
        } finally {
            setAdding(null);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[600px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Globe className="h-5 w-5 text-blue-500" />
                        Explorer le Savoir Médical (NCBI)
                    </DialogTitle>
                    <DialogDescription>
                        Recherchez des concepts médicaux dans les bases de données mondiales (MedGen, PubChem, MeSH) et ajoutez-les au graphe.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex gap-2 my-4">
                    <Select value={nodeType} onValueChange={(v) => setNodeType(v as NodeType)}>
                        <SelectTrigger className="w-[140px]">
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="pathology">Pathologie</SelectItem>
                            <SelectItem value="medication">Médicament</SelectItem>
                            <SelectItem value="symptom">Symptôme</SelectItem>
                            <SelectItem value="treatment">Traitement</SelectItem>
                        </SelectContent>
                    </Select>
                    <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Rechercher (ex: Aspirin, Diabetes...)"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            className="pl-9"
                        />
                    </div>
                    <Button onClick={handleSearch} disabled={loading || !query}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Rechercher"}
                    </Button>
                </div>

                <ScrollArea className="h-[300px] border rounded-md p-4 bg-slate-50 dark:bg-slate-800/50">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                            <p>Interrogation des bases NCBI...</p>
                        </div>
                    ) : results.length > 0 ? (
                        <div className="space-y-3">
                            {results.map((concept) => (
                                <div key={concept.id} className="flex items-start justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border shadow-sm hover:border-blue-500/50 transition-colors">
                                    <div className="flex-1 mr-4">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-medium text-sm">{concept.name}</h4>
                                            <Badge variant="secondary" className="text-[10px] h-5">{concept.source}</Badge>
                                        </div>
                                        {concept.description && typeof concept.description === 'string' && (
                                            <p className="text-xs text-slate-500 line-clamp-2" title={concept.description}>
                                                {concept.description}
                                            </p>
                                        )}
                                        <div className="text-[10px] text-slate-400 mt-1">ID: {concept.id}</div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 w-8 p-0 border-dashed border-blue-500/50 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                        onClick={() => handleAddNode(concept)}
                                        disabled={adding === concept.id}
                                        title="Ajouter au graphe"
                                    >
                                        {adding === concept.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Plus className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
                            <Search className="h-8 w-8 opacity-20" />
                            <p className="text-sm">Aucun résultat. Essayez une autre recherche.</p>
                        </div>
                    )}
                </ScrollArea>

                <DialogFooter className="text-xs text-slate-400 sm:justify-between">
                    <div className="flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Données fournies par National Center for Biotechnology Information
                    </div>
                    <Button variant="ghost" size="sm" onClick={onClose}>Fermer</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
