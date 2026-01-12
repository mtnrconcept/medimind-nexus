
import React, { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MoleculeViewer } from './MoleculeViewer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Loader2, Zap, Beaker, RefreshCw, Search, List,
    Info, InfoIcon, ShoppingCart, Trash2, Plus,
    ChevronRight, BookOpen, Layers, History
} from 'lucide-react';
import { toast } from 'sonner';
import { MOLECULE_CATALOG, MoleculeData } from '@/data/moleculeCatalog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Dialog, DialogContent, DialogDescription,
    DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";

export function MoleculeWorkbench() {
    const [inputPrompt, setInputPrompt] = useState('');
    const [generatedSmiles, setGeneratedSmiles] = useState<string>('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedMolecules, setSelectedMolecules] = useState<MoleculeData[]>([]);
    const [currentViewMolecule, setCurrentViewMolecule] = useState<MoleculeData | null>(null);

    // Filter catalog based on search
    const filteredCatalog = useMemo(() => {
        return MOLECULE_CATALOG.filter(m =>
            m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.formula.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.smiles.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.category.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [searchQuery]);

    const handleGenerate = async () => {
        if (!inputPrompt) return;
        setIsGenerating(true);
        setGeneratedSmiles('');

        try {
            const { data, error } = await supabase.functions.invoke('generate-molecule', {
                body: { prompt: inputPrompt }
            });

            if (error) throw error;

            if (data?.smiles) {
                setGeneratedSmiles(data.smiles);
                toast.success("Molécule générée !");
            } else {
                toast.error("Aucune molécule valide générée.");
            }

        } catch (err) {
            console.error("Generation error:", err);
            toast.error("Erreur lors de la génération.");
        } finally {
            setIsGenerating(false);
        }
    };

    const addToSelection = (mol: MoleculeData) => {
        if (selectedMolecules.find(m => m.id === mol.id)) {
            toast.info(`${mol.name} est déjà dans votre sélection.`);
            return;
        }
        setSelectedMolecules([...selectedMolecules, mol]);
        toast.success(`${mol.name} ajouté à la sélection.`);
    };

    const removeFromSelection = (id: string) => {
        setSelectedMolecules(selectedMolecules.filter(m => m.id !== id));
    };

    const handleCombine = () => {
        if (selectedMolecules.length < 2) {
            toast.warning("Sélectionnez au moins 2 molécules pour combiner.");
            return;
        }
        // Simulated synergy analysis
        toast.success("Analyse de synergie lancée pour : " + selectedMolecules.map(m => m.name).join(', '));
    };

    return (
        <Card className="w-full max-w-6xl mx-auto shadow-2xl bg-slate-950 border-slate-800 overflow-hidden">
            <CardHeader className="border-b border-slate-900 bg-slate-950/50">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg shadow-lg shadow-purple-500/20">
                            <Beaker className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <CardTitle className="text-2xl text-white font-bold tracking-tight">Molecule Workbench v2.0</CardTitle>
                            <CardDescription className="text-slate-400">
                                Atelier avancé de conception et d'analyse moléculaire
                            </CardDescription>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="border-slate-800 text-slate-300 hover:bg-slate-900">
                                    <BookOpen className="w-4 h-4 mr-2" />
                                    Guide d'utilisation
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="bg-slate-950 border-slate-800 text-white max-w-3xl max-h-[80vh] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                                        Guide de l'Atelier Moléculaire v2.0
                                    </DialogTitle>
                                    <DialogDescription className="text-slate-400">
                                        Exploration, Conception et Analyse Médicinale
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-6 text-sm text-slate-300 leading-relaxed py-4">
                                    <section className="space-y-2">
                                        <h4 className="text-purple-400 font-bold flex items-center gap-2 text-base">
                                            <Search className="w-4 h-4" /> 1. Catalogue & Recherche
                                        </h4>
                                        <p>Utilisez le panneau latéral gauche pour explorer notre base de données de molécules de référence. Vous pouvez filtrer dynamiquement par :</p>
                                        <ul className="list-disc pl-5 space-y-1 text-slate-400">
                                            <li><span className="text-slate-200">Nom usuel</span> (ex: "Aspirine")</li>
                                            <li><span className="text-slate-200">Formule brute</span> (ex: "C8H10N4O2")</li>
                                            <li><span className="text-slate-200">Catégorie</span> (ex: "Antibiotique")</li>
                                        </ul>
                                    </section>

                                    <section className="space-y-2">
                                        <h4 className="text-blue-400 font-bold flex items-center gap-2 text-base">
                                            <Zap className="w-4 h-4" /> 2. Génération par IA (NovoMolGen)
                                        </h4>
                                        <p>L'IA peut concevoir des molécules basées sur vos descriptions fonctionnelles. </p>
                                        <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg space-y-2">
                                            <p className="font-semibold text-blue-300">Exemple de prompt :</p>
                                            <p className="italic text-slate-400">"Concevoir un inhibiteur de kinase sélectif avec un noyau indole et un groupement sulfonamide pour améliorer la solubilité."</p>
                                            <p className="font-semibold text-blue-300">Résultat attendu :</p>
                                            <p className="text-slate-300">L'IA générera une structure SMILES valide intégrant ces caractéristiques structurelles, prête pour une analyse de docking virtuelle.</p>
                                        </div>
                                    </section>

                                    <section className="space-y-2">
                                        <h4 className="text-green-400 font-bold flex items-center gap-2 text-base">
                                            <Layers className="w-4 h-4" /> 3. Combinaisons & Synergies
                                        </h4>
                                        <p>Analysez comment différentes molécules interagissent entre elles en les ajoutant à votre panier de sélection.</p>
                                        <div className="bg-green-500/10 border border-green-500/20 p-3 rounded-lg space-y-2">
                                            <p className="font-semibold text-green-300">Exemple de combinaison :</p>
                                            <p className="text-slate-300 hover:text-white transition-colors cursor-default">
                                                <span className="font-bold">Aspirine</span> (Anti-inflammatoire) + <span className="font-bold">Caféine</span> (Adjuvant)
                                            </p>
                                            <p className="font-semibold text-green-300">Résultat attendu :</p>
                                            <p className="text-slate-300 italic">"Augmentation de l'effet antalgique, accélération de l'absorption gastrique de l'aspirine. Vigilance sur la tolérance gastrique."</p>
                                        </div>
                                    </section>

                                    <section className="space-y-2">
                                        <h4 className="text-cyan-400 font-bold flex items-center gap-2 text-base">
                                            <InfoIcon className="w-4 h-4" /> 4. Analyse des Propriétés
                                        </h4>
                                        <p>Visualisez instantanément la structure 2D et les constantes physico-chimiques essentielles (Poids mol., logP, etc.) pour évaluer le profil ADME de vos composés.</p>
                                    </section>
                                </div>
                            </DialogContent>
                        </Dialog>
                        <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20 px-3 py-1">
                            Alpha 2.0
                        </Badge>
                    </div>
                </div>
            </CardHeader>

            <Tabs defaultValue="catalog" className="w-full">
                <div className="bg-slate-900/30 border-b border-slate-900 px-6">
                    <TabsList className="bg-transparent border-none">
                        <TabsTrigger value="catalog" className="data-[state=active]:bg-slate-800 data-[state=active]:text-white">
                            <List className="w-4 h-4 mr-2" />
                            Catalogue
                        </TabsTrigger>
                        <TabsTrigger value="generation" className="data-[state=active]:bg-slate-800 data-[state=active]:text-white">
                            <Zap className="w-4 h-4 mr-2" />
                            Génération
                        </TabsTrigger>
                        <TabsTrigger value="combine" className="data-[state=active]:bg-slate-800 data-[state=active]:text-white relative">
                            <Layers className="w-4 h-4 mr-2" />
                            Combinaison
                            {selectedMolecules.length > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-purple-600 text-[10px] font-bold">
                                    {selectedMolecules.length}
                                </span>
                            )}
                        </TabsTrigger>
                    </TabsList>
                </div>

                <CardContent className="p-0">
                    <div className="grid grid-cols-1 md:grid-cols-12 min-h-[600px]">

                        {/* Left Sidebar: Catalog / Search */}
                        <div className="md:col-span-4 lg:col-span-3 border-r border-slate-900 bg-slate-950 p-4 space-y-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                                <Input
                                    placeholder="Rechercher..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 bg-slate-900 border-slate-800 text-white"
                                />
                            </div>

                            <ScrollArea className="h-[500px] pr-2">
                                <div className="space-y-2">
                                    {filteredCatalog.map((mol) => (
                                        <div
                                            key={mol.id}
                                            className="group relative p-3 bg-slate-900/40 border border-slate-800/50 rounded-lg hover:border-purple-500/50 hover:bg-slate-900/80 transition-all cursor-pointer"
                                            onClick={() => setCurrentViewMolecule(mol)}
                                        >
                                            <div className="flex justify-between items-start mb-1">
                                                <h4 className="text-sm font-semibold text-slate-200">{mol.name}</h4>
                                                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-slate-800 text-slate-400">
                                                    {mol.category}
                                                </Badge>
                                            </div>
                                            <p className="text-[10px] text-slate-500 font-mono truncate">{mol.formula}</p>

                                            <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-7 w-7 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/10"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setCurrentViewMolecule(mol);
                                                    }}
                                                >
                                                    <Info className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-7 w-7 text-green-400 hover:text-green-300 hover:bg-green-400/10"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        addToSelection(mol);
                                                    }}
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                    {filteredCatalog.length === 0 && (
                                        <div className="text-center py-10 text-slate-600 text-sm italic">
                                            Aucun résultat trouvé
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>
                        </div>

                        {/* Right Content Area */}
                        <div className="md:col-span-8 lg:col-span-9 bg-slate-900/10 p-6">

                            <TabsContent value="catalog" className="mt-0 h-full">
                                {currentViewMolecule ? (
                                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h2 className="text-3xl font-bold text-white mb-1">{currentViewMolecule.name}</h2>
                                                <p className="text-purple-400 font-mono text-sm">{currentViewMolecule.formula} • {currentViewMolecule.iupacName}</p>
                                            </div>
                                            <Button
                                                onClick={() => addToSelection(currentViewMolecule)}
                                                className="bg-purple-600 hover:bg-purple-500"
                                            >
                                                <Plus className="w-4 h-4 mr-2" />
                                                Ajouter à la sélection
                                            </Button>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                            <div className="bg-white/5 rounded-2xl border border-white/10 p-6 flex flex-col items-center justify-center min-h-[400px]">
                                                <MoleculeViewer
                                                    smiles={currentViewMolecule.smiles}
                                                    width={360}
                                                    height={360}
                                                />
                                            </div>
                                            <div className="space-y-6">
                                                <div className="p-5 bg-slate-900/50 rounded-xl border border-slate-800">
                                                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                                                        <InfoIcon className="w-4 h-4 text-cyan-400" />
                                                        Description & Usage
                                                    </h3>
                                                    <p className="text-slate-300 text-sm leading-relaxed">
                                                        {currentViewMolecule.description}
                                                    </p>
                                                    <div className="mt-4 flex flex-wrap gap-2">
                                                        <Badge variant="outline" className="border-blue-500/30 text-blue-400 bg-blue-500/5 px-2.5 py-1">
                                                            Domaine: {currentViewMolecule.therapeuticArea}
                                                        </Badge>
                                                        <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 bg-cyan-500/5 px-2.5 py-1">
                                                            Poids: {currentViewMolecule.molecularWeight} g/mol
                                                        </Badge>
                                                    </div>
                                                </div>

                                                <div className="p-5 bg-slate-900/50 rounded-xl border border-slate-800">
                                                    <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                                                        <RefreshCw className="w-4 h-4 text-cyan-400" />
                                                        Propriétés RDKit
                                                    </h3>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="p-3 bg-slate-950 rounded border border-slate-800">
                                                            <span className="text-[10px] uppercase tracking-wider text-slate-500">LogP</span>
                                                            <p className="text-white font-mono">Calculé via RDkit...</p>
                                                        </div>
                                                        <div className="p-3 bg-slate-950 rounded border border-slate-800">
                                                            <span className="text-[10px] uppercase tracking-wider text-slate-500">TPSA</span>
                                                            <p className="text-white font-mono">En attente...</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-[500px] text-slate-500 border-2 border-dashed border-slate-800 rounded-2xl">
                                        <Beaker className="w-16 h-16 mb-4 opacity-10" />
                                        <p className="text-lg">Sélectionnez une molécule dans le catalogue</p>
                                        <p className="text-sm">pour voir sa fiche détaillée</p>
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="generation" className="mt-0">
                                <div className="space-y-6">
                                    <Card className="bg-slate-900 border-slate-800">
                                        <CardContent className="p-6">
                                            <div className="flex gap-2">
                                                <Input
                                                    placeholder="Description (ex: inhibiteur de kinase avec cycle indole...)"
                                                    value={inputPrompt}
                                                    onChange={(e) => setInputPrompt(e.target.value)}
                                                    className="bg-slate-950 border-slate-700 text-white"
                                                />
                                                <Button
                                                    onClick={handleGenerate}
                                                    disabled={isGenerating || !inputPrompt}
                                                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500"
                                                >
                                                    {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                                                    Générer
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    {generatedSmiles && (
                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4">
                                            <div className="bg-white/5 rounded-2xl border border-white/10 p-6 flex flex-col items-center">
                                                <MoleculeViewer smiles={generatedSmiles} width={300} height={300} />
                                                <p className="mt-4 text-xs font-mono text-slate-400 break-all">{generatedSmiles}</p>
                                            </div>
                                            <div className="p-5 bg-slate-900/50 rounded-xl border border-slate-800 flex items-center justify-center text-slate-500 italic text-sm">
                                                Analyse ChemBERTa en cours de préparation...
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </TabsContent>

                            <TabsContent value="combine" className="mt-0 space-y-6">
                                <div className="flex justify-between items-center bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                                    <div className="flex items-center gap-3">
                                        <ShoppingCart className="w-5 h-5 text-purple-400" />
                                        <span className="text-white font-medium">{selectedMolecules.length} Molécule(s) sélectionnée(s)</span>
                                    </div>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => setSelectedMolecules([])}
                                        disabled={selectedMolecules.length === 0}
                                        className="bg-red-900/20 text-red-500 hover:bg-red-900/40 border-red-900/50"
                                    >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Vider
                                    </Button>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {selectedMolecules.map(m => (
                                        <div key={m.id} className="p-3 bg-slate-900 rounded-lg border border-slate-800 relative group animate-in zoom-in-95 duration-200">
                                            <button
                                                onClick={() => removeFromSelection(m.id)}
                                                className="absolute -top-2 -right-2 bg-slate-950 border border-slate-800 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-400"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                            <p className="text-xs font-semibold text-slate-200 truncate">{m.name}</p>
                                            <div className="mt-2 flex justify-center bg-white/5 rounded-md p-1 h-32">
                                                <MoleculeViewer smiles={m.smiles} width={120} height={120} />
                                            </div>
                                        </div>
                                    ))}
                                    {selectedMolecules.length === 0 && (
                                        <div className="col-span-full py-20 text-center text-slate-600 border-2 border-dashed border-slate-800 rounded-xl">
                                            Aucune molécule sélectionnée
                                        </div>
                                    )}
                                </div>

                                {selectedMolecules.length >= 2 && (
                                    <div className="flex flex-col items-center gap-6 py-8 border-t border-slate-800">
                                        <Button
                                            size="lg"
                                            onClick={handleCombine}
                                            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 shadow-xl shadow-purple-900/20 px-8"
                                        >
                                            <Layers className="w-5 h-5 mr-3" />
                                            Voir le résultat de la combinaison (Simulation)
                                        </Button>
                                        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="p-4 bg-purple-900/10 border border-purple-900/30 rounded-xl">
                                                <h4 className="text-purple-400 text-sm font-bold mb-2 flex items-center gap-2">
                                                    <Zap className="w-4 h-4" /> Synergies Attendues
                                                </h4>
                                                <ul className="text-xs text-slate-400 space-y-1 list-disc pl-4">
                                                    <li>Analyse de compatibilité pharmacodynamique</li>
                                                    <li>Interaction des groupes fonctionnels</li>
                                                    <li>Estimation de la biodisponibilité du complexe</li>
                                                </ul>
                                            </div>
                                            <div className="p-4 bg-blue-900/10 border border-blue-900/30 rounded-xl">
                                                <h4 className="text-blue-400 text-sm font-bold mb-2 flex items-center gap-2">
                                                    <Zap className="w-4 h-4" /> Risques d'Interactions
                                                </h4>
                                                <ul className="text-xs text-slate-400 space-y-1 list-disc pl-4">
                                                    <li>Stabilité chimique du mélange</li>
                                                    <li>Toxicité cumulée potentielle</li>
                                                    <li>Métabolisme hépatique compétitif</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </TabsContent>
                        </div>
                    </div>
                </CardContent>
            </Tabs>
        </Card>
    );
}
