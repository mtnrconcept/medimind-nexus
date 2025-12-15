/**
 * SMART Callback Page
 * 
 * Handles the OAuth2 callback from the authorization server.
 * Exchanges the authorization code for access tokens.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, XCircle, Shield } from 'lucide-react';
import { createSMARTClient } from '@/lib/smart/SMARTAuthClient';
import { toast } from 'sonner';

const SMART_CONFIG = {
    clientId: import.meta.env.VITE_SMART_CLIENT_ID || 'medimind-nexus',
    redirectUri: `${window.location.origin}/smart/callback`,
    scope: 'launch patient/*.read user/*.read openid fhirUser',
};

type CallbackStatus = 'processing' | 'success' | 'error';

const SMARTCallback = () => {
    const navigate = useNavigate();
    const [status, setStatus] = useState<CallbackStatus>('processing');
    const [error, setError] = useState<string | null>(null);
    const [patientId, setPatientId] = useState<string | null>(null);

    useEffect(() => {
        handleCallback();
    }, []);

    const handleCallback = async () => {
        try {
            const client = createSMARTClient(SMART_CONFIG);
            const token = await client.handleCallback(window.location.href);

            // Get patient context if available
            if (token.patient) {
                setPatientId(token.patient);
            }

            setStatus('success');
            toast.success('Connexion SMART réussie');

            // Navigate to patient detail if we have context, otherwise to patients list
            setTimeout(() => {
                if (token.patient) {
                    // Note: We'd need to look up our internal patient ID from the FHIR patient ID
                    navigate('/patients');
                } else {
                    navigate('/patients');
                }
            }, 2000);

        } catch (err) {
            console.error('SMART callback error:', err);
            setError(err instanceof Error ? err.message : 'Erreur lors de l\'authentification');
            setStatus('error');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <Card className="w-[420px]">
                <CardHeader className="text-center">
                    <div className={`mx-auto mb-4 h-12 w-12 rounded-full flex items-center justify-center ${status === 'processing' ? 'bg-primary/10' :
                            status === 'success' ? 'bg-green-500/10' :
                                'bg-destructive/10'
                        }`}>
                        {status === 'processing' && (
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        )}
                        {status === 'success' && (
                            <CheckCircle className="h-6 w-6 text-green-500" />
                        )}
                        {status === 'error' && (
                            <XCircle className="h-6 w-6 text-destructive" />
                        )}
                    </div>
                    <CardTitle>
                        {status === 'processing' && 'Authentification en cours...'}
                        {status === 'success' && 'Connexion réussie !'}
                        {status === 'error' && 'Erreur d\'authentification'}
                    </CardTitle>
                    <CardDescription>
                        {status === 'processing' && 'Échange du code d\'autorisation...'}
                        {status === 'success' && (
                            patientId
                                ? `Patient chargé : ${patientId}`
                                : 'Redirection vers les patients...'
                        )}
                        {status === 'error' && 'Impossible de terminer l\'authentification SMART'}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {status === 'processing' && (
                        <div className="text-center text-sm text-muted-foreground">
                            <p>Veuillez patienter pendant que nous terminons</p>
                            <p>la connexion sécurisée avec le serveur FHIR.</p>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className="space-y-4">
                            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                                <div className="flex items-center gap-2 text-green-600">
                                    <Shield className="h-4 w-4" />
                                    <span className="text-sm font-medium">Connexion sécurisée établie</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Les données FHIR sont maintenant accessibles.
                                </p>
                            </div>

                            <div className="flex justify-center">
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-sm text-muted-foreground">
                                    Redirection automatique...
                                </span>
                            </div>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className="space-y-4">
                            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                                <p className="text-sm text-destructive">{error}</p>
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={() => navigate('/smart/launch')}
                                >
                                    Réessayer
                                </Button>
                                <Button
                                    className="flex-1"
                                    onClick={() => navigate('/patients')}
                                >
                                    Continuer sans FHIR
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

export default SMARTCallback;
