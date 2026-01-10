
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

// Type definition for the RDKit module
// Note: This is an approximation as official types are sometimes sparse
interface RDKitModule {
    get_mol: (smiles: string) => any;
    version: () => string;
    // Add other methods as needed
}

interface RDKitContextType {
    rdkit: RDKitModule | null;
    isLoading: boolean;
    error: Error | null;
}

const RDKitContext = createContext<RDKitContextType>({
    rdkit: null,
    isLoading: true,
    error: null,
});

export const useRDKit = () => useContext(RDKitContext);

interface RDKitProviderProps {
    children: ReactNode;
}

export function RDKitProvider({ children }: RDKitProviderProps) {
    const [rdkit, setRdkit] = useState<RDKitModule | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const loadRDKit = async () => {
            try {
                const rdkitLoader = await import('@rdkit/rdkit');

                // @ts-ignore - Bypass TS check for RDKit loader signature
                const module = await (rdkitLoader.default || rdkitLoader)({
                    locateFile: (path: string, prefix: string) => {
                        // Force the loading of WASM from the public directory
                        if (path.endsWith('.wasm')) {
                            return '/RDKit_minimal.wasm';
                        }
                        return prefix + path;
                    }
                });
                setRdkit(module);
            } catch (err) {
                console.error('Failed to load RDKit:', err);
                setError(err instanceof Error ? err : new Error('Failed to load RDKit'));
            } finally {
                setIsLoading(false);
            }
        };

        loadRDKit();
    }, []);

    return (
        <RDKitContext.Provider value={{ rdkit, isLoading, error }}>
            {children}
        </RDKitContext.Provider>
    );
}
