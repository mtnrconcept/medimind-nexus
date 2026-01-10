
import React, { useState } from 'react';
import { supabase } from '@/integrations/supabase/client'; // Adjust path if needed
import { MoleculeViewer } from './MoleculeViewer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Zap, Beaker, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export function MoleculeWorkbench() {
    const [inputPrompt, setInputPrompt] = useState('');
    const [generatedSmiles, setGeneratedSmiles] = useState<string>('');
    const [isGenerating, setIsGenerating] = useState(false);

    // Example inputs
    const examples = [
        "OC1=CC=C(C=C1)O", // Hydroquinone
        "CC(=O)OC1=CC=CC=C1C(=O)O", // Aspirin
        "CN1C=NC2=C1C(=O)N(C(=O)N2C)C" // Caffeine
    ];

    const handleGenerate = async () => {
        if (!inputPrompt) return;
        setIsGenerating(true);
        setGeneratedSmiles('');

        try {
            // Call Supabase Edge Function which calls Hugging Face
            // We'll use a specific function or the generic 'graph-chat' if appropriate, 
            // but for direct model access, we might need a dedicated 'molecule-gen' function 
            // or use the existing 'focused-research' with a specific model parameter.

            // Since we don't have a dedicated 'molecule-gen' function yet, 
            // let's assume we invoke a new 'generate-molecule' function 
            // OR repurpose an existing one. For now, let's try to invoke 'generate-molecule'.

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

    return (
        <Card className="w-full max-w-4xl mx-auto shadow-xl bg-slate-950 border-slate-800">
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                        <Beaker className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                        <CardTitle className="text-white">Molecule Workbench</CardTitle>
                        <CardDescription className="text-slate-400">
                            Générateur de molécules expérimental via NovoMolGen & DeepChem features
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-6">
                {/* Input Section */}
                <div className="space-y-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="Description ou séquence de départ (ex: C1=CC...)"
                            value={inputPrompt}
                            onChange={(e) => setInputPrompt(e.target.value)}
                            className="bg-slate-900 border-slate-700 text-white font-mono"
                        />
                        <Button
                            onClick={handleGenerate}
                            disabled={isGenerating || !inputPrompt}
                            className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white"
                        >
                            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                            Générer
                        </Button>
                    </div>

                    {/* Quick Examples */}
                    <div className="flex gap-2 text-xs text-slate-500">
                        <span>Exemples:</span>
                        {examples.map((ex, i) => (
                            <button
                                key={i}
                                onClick={() => setInputPrompt(ex)}
                                className="hover:text-purple-400 transition-colors font-mono"
                            >
                                {ex.slice(0, 15)}...
                            </button>
                        ))}
                    </div>
                </div>

                {/* Visualization Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                    {/* 2D Viewer */}
                    <div className="flex flex-col items-center justify-center p-6 bg-slate-900/50 rounded-xl border border-slate-800 min-h-[350px]">
                        {generatedSmiles || inputPrompt ? (
                            <div className="space-y-4 text-center">
                                <MoleculeViewer
                                    smiles={generatedSmiles || inputPrompt}
                                    width={350}
                                    height={300}
                                />
                                <p className="text-xs text-slate-500 font-mono mt-2">
                                    {generatedSmiles ? "Résultat généré" : "Prévisualisation input"}
                                </p>
                            </div>
                        ) : (
                            <div className="text-center text-slate-600">
                                <Beaker className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p>En attente d'une molécule...</p>
                            </div>
                        )}
                    </div>

                    {/* Analysis Panel (Placeholder for ChemBERTa props) */}
                    <div className="p-6 bg-slate-900/50 rounded-xl border border-slate-800">
                        <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                            <RefreshCw className="w-4 h-4 text-cyan-400" />
                            Propriétés Moléculaires
                        </h3>

                        {generatedSmiles ? (
                            <div className="space-y-3">
                                <div className="flex justify-between p-3 bg-slate-950 rounded border border-slate-800">
                                    <span className="text-slate-400">Poids Moléculaire</span>
                                    <span className="text-white font-mono">Calcul en cours...</span>
                                </div>
                                <div className="flex justify-between p-3 bg-slate-950 rounded border border-slate-800">
                                    <span className="text-slate-400">LogP</span>
                                    <span className="text-white font-mono">Calcul en cours...</span>
                                </div>
                                <div className="flex justify-between p-3 bg-slate-950 rounded border border-slate-800">
                                    <span className="text-slate-400">H-Bond Donors</span>
                                    <span className="text-white font-mono">Calcul en cours...</span>
                                </div>
                                <div className="mt-4 p-3 bg-blue-900/20 border border-blue-900/50 rounded text-xs text-blue-300">
                                    L'analyse ChemBERTa sera intégrée ici pour prédire la toxicité et la solubilité.
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center h-full text-slate-600 text-sm italic">
                                Générez une molécule pour voir ses propriétés
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
