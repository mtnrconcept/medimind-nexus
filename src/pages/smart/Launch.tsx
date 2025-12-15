/**
 * SMART Launch Page
 * 
 * Entry point for SMART on FHIR EHR launch or standalone launch.
 * Handles the initial authorization redirect.
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Shield, ExternalLink } from 'lucide-react';
import { createSMARTClient } from '@/lib/smart/SMARTAuthClient';

// Default SMART configuration
const SMART_CONFIG = {
    clientId: import.meta.env.VITE_SMART_CLIENT_ID || 'medimind-nexus',
    redirectUri: `${window.location.origin}/smart/callback`,
    scope: 'launch patient/*.read user/*.read openid fhirUser',
};

const SMARTLaunch = () => {
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fhirServerUrl, setFhirServerUrl] = useState('');

    // Check for EHR launch parameters
    const iss = searchParams.get('iss');
    const launch = searchParams.get('launch');

    useEffect(() => {
        // If this is an EHR launch, start authorization immediately
        if (iss && launch) {
            handleEHRLaunch(iss, launch);
        }
    }, [iss, launch]);

    const handleEHRLaunch = async (issuer: string, launchToken: string) => {
        setLoading(true);
        setError(null);

        try {
            const client = createSMARTClient(SMART_CONFIG);
            await client.authorize(issuer, launchToken);
            // Note: This will redirect, so the rest won't execute
        } catch (err) {
            console.error('EHR Launch failed:', err);
            setError(err instanceof Error ? err.message : 'Erreur lors du lancement EHR');
            setLoading(false);
        }
    };

    const handleStandaloneLaunch = async () => {
        if (!fhirServerUrl.trim()) {
            setError('Veuillez entrer l\'URL du serveur FHIR');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const client = createSMARTClient(SMART_CONFIG);
            await client.authorize(fhirServerUrl.trim());
            // Note: This will redirect
        } catch (err) {
            console.error('Standalone launch failed:', err);
            setError(err instanceof Error ? err.message : 'Erreur lors du lancement standalone');
            setLoading(false);
        }
    };

    // EHR Launch - show loading state
    if (iss && launch) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Card className="w-[400px]">
                    <CardHeader className="text-center">
                        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <Shield className="h-6 w-6 text-primary" />
                        </div>
                        <CardTitle>Lancement SMART on FHIR</CardTitle>
                        <CardDescription>
                            Connexion au système EHR en cours...
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-center">
                        {loading && !error && (
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                <p className="text-sm text-muted-foreground">
                                    Redirection vers le serveur d'autorisation...
                                </p>
                            </div>
                        )}
                        {error && (
                            <div className="text-center">
                                <p className="text-sm text-destructive mb-4">{error}</p>
                                <Button onClick={() => window.location.reload()}>
                                    Réessayer
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Standalone Launch - show server input form
    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Shield className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                            <CardTitle>SMART on FHIR</CardTitle>
                            <CardDescription>Connecter à un serveur FHIR</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="fhir-url">URL du serveur FHIR</Label>
                        <Input
                            id="fhir-url"
                            placeholder="https://fhir.example.com/r4"
                            value={fhirServerUrl}
                            onChange={(e) => setFhirServerUrl(e.target.value)}
                            disabled={loading}
                        />
                        <p className="text-xs text-muted-foreground">
                            Entrez l'URL de base du serveur FHIR R4 compatible SMART on FHIR.
                        </p>
                    </div>

                    {error && (
                        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                            {error}
                        </div>
                    )}

                    <Button
                        className="w-full"
                        onClick={handleStandaloneLaunch}
                        disabled={loading || !fhirServerUrl.trim()}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Connexion...
                            </>
                        ) : (
                            <>
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Se connecter
                            </>
                        )}
                    </Button>

                    <div className="border-t pt-4">
                        <p className="text-xs text-muted-foreground text-center">
                            Serveurs de test compatibles :
                        </p>
                        <div className="flex flex-wrap gap-2 justify-center mt-2">
                            {[
                                { name: 'SMART Health IT', url: 'https://launch.smarthealthit.org/v/r4/fhir' },
                                { name: 'HAPI FHIR', url: 'https://hapi.fhir.org/baseR4' },
                            ].map((server) => (
                                <Button
                                    key={server.name}
                                    variant="outline"
                                    size="sm"
                                    className="text-xs"
                                    onClick={() => setFhirServerUrl(server.url)}
                                >
                                    {server.name}
                                </Button>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default SMARTLaunch;
