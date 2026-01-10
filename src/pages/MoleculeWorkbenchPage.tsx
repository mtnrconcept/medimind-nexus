
import React from 'react';
import { MoleculeWorkbench } from '@/components/molecule/MoleculeWorkbench';
import { RDKitProvider } from '@/components/molecule/RDKitProvider';
import AppLayout from '@/components/layout/AppLayout';

export default function MoleculeWorkbenchPage() {
    return (
        <AppLayout>
            <div className="container mx-auto py-8">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-cyan-400">
                        DeepChem Hybrid Workbench
                    </h1>
                    <p className="text-slate-400 mt-2">
                        Génération de molécules via RDKit (WASM) et Hugging Face (AI).
                    </p>
                </div>

                <RDKitProvider>
                    <MoleculeWorkbench />
                </RDKitProvider>
            </div>
        </AppLayout>
    );
}
