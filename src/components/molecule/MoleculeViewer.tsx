
import React, { useEffect, useRef, useState } from 'react';
import { useRDKit } from './RDKitProvider';

interface MoleculeViewerProps {
    smiles: string;
    width?: number;
    height?: number;
    showBondIndices?: boolean;
}

export function MoleculeViewer({ smiles, width = 400, height = 300, showBondIndices = false }: MoleculeViewerProps) {
    const { rdkit, isLoading, error } = useRDKit();
    const canvasRef = useRef<HTMLDivElement>(null);
    const [renderError, setRenderError] = useState<string | null>(null);

    useEffect(() => {
        if (!rdkit || isLoading || !canvasRef.current || !smiles) return;

        let mol: any = null;
        try {
            mol = rdkit.get_mol(smiles);
            if (!mol) {
                setRenderError('Invalid SMILES');
                return;
            }

            const svg = mol.get_svg(width, height);
            canvasRef.current.innerHTML = svg;
            setRenderError(null);
        } catch (e) {
            console.error('Failed to render molecule:', e);
            setRenderError('Failed to render molecule');
        } finally {
            if (mol) mol.delete();
        }
    }, [rdkit, isLoading, smiles, width, height]);

    if (isLoading) return <div className="animate-pulse bg-gray-200 rounded" style={{ width, height }} />;
    if (error) return <div className="text-red-500 text-sm">RDKit Error</div>;

    return (
        <div className="relative border border-gray-200 rounded p-2 bg-white inline-block">
            {renderError ? (
                <div className="flex items-center justify-center text-red-500 font-medium" style={{ width, height }}>
                    {renderError}
                </div>
            ) : (
                <div ref={canvasRef} style={{ width, height }} />
            )}
            <div className="absolute bottom-1 right-2 text-xs text-gray-400 font-mono">
                {smiles}
            </div>
        </div>
    );
}
