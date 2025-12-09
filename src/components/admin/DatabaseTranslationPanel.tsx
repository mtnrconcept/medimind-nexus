import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Languages, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface TranslationStatus {
    table: string;
    label: string;
    progress: number;
    translated: number;
    total: number;
    status: 'idle' | 'running' | 'done' | 'error';
}

const TABLES_TO_TRANSLATE = [
    { table: 'pathologies', label: 'Pathologies' },
    { table: 'symptoms', label: 'Symptômes' },
    { table: 'treatments', label: 'Traitements' },
    { table: 'medications', label: 'Médicaments' },
    { table: 'side_effects', label: 'Effets secondaires' },
];

export function DatabaseTranslationPanel() {
    const [isTranslating, setIsTranslating] = useState(false);
    const [statuses, setStatuses] = useState<TranslationStatus[]>(
        TABLES_TO_TRANSLATE.map(t => ({
            ...t,
            progress: 0,
            translated: 0,
            total: 0,
            status: 'idle'
        }))
    );

    const updateStatus = (table: string, updates: Partial<TranslationStatus>) => {
        setStatuses(prev => prev.map(s =>
            s.table === table ? { ...s, ...updates } : s
        ));
    };

    const translateTable = async (table: string) => {
        updateStatus(table, { status: 'running', progress: 0 });

        let offset = 0;
        const batchSize = 50;
        let hasMore = true;
        let totalTranslated = 0;

        while (hasMore) {
            try {
                const { data, error } = await supabase.functions.invoke('translate-database', {
                    body: { table, batchSize, offset }
                });

                if (error) {
                    console.error(`Error translating ${table}:`, error);
                    updateStatus(table, { status: 'error' });
                    return;
                }

                totalTranslated += data.translated || 0;
                hasMore = data.hasMore;
                offset = data.nextOffset;

                updateStatus(table, {
                    progress: data.progress || 0,
                    translated: totalTranslated,
                    total: data.totalRecords || 0
                });

                // Pause pour éviter le rate limiting
                await new Promise(r => setTimeout(r, 200));

            } catch (err) {
                console.error(`Error translating ${table}:`, err);
                updateStatus(table, { status: 'error' });
                return;
            }
        }

        updateStatus(table, { status: 'done', progress: 100 });
    };

    const translateAll = async () => {
        setIsTranslating(true);

        // Reset all statuses
        setStatuses(prev => prev.map(s => ({ ...s, progress: 0, translated: 0, status: 'idle' })));

        for (const tableInfo of TABLES_TO_TRANSLATE) {
            await translateTable(tableInfo.table);
        }

        setIsTranslating(false);
        toast.success('Traduction des données terminée !');
    };

    const translateSingle = async (table: string) => {
        setIsTranslating(true);
        await translateTable(table);
        setIsTranslating(false);
    };

    const getStatusIcon = (status: TranslationStatus['status']) => {
        switch (status) {
            case 'running':
                return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
            case 'done':
                return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case 'error':
                return <AlertCircle className="h-4 w-4 text-destructive" />;
            default:
                return null;
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Languages className="h-5 w-5" />
                    Traduction des données en français
                </CardTitle>
                <CardDescription>
                    Traduire automatiquement tous les textes de la base de données vers le français.
                    Les données en anglais ou autres langues seront converties.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-2">
                    <Button
                        onClick={translateAll}
                        disabled={isTranslating}
                        className="gap-2"
                    >
                        {isTranslating ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Traduction en cours...
                            </>
                        ) : (
                            <>
                                <Languages className="h-4 w-4" />
                                Tout traduire en français
                            </>
                        )}
                    </Button>
                </div>

                <div className="space-y-3">
                    {statuses.map((status) => (
                        <div key={status.table} className="border rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    {getStatusIcon(status.status)}
                                    <span className="font-medium">{status.label}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    {status.status === 'done' && (
                                        <Badge variant="secondary" className="bg-green-500/20 text-green-700">
                                            {status.translated} traduits
                                        </Badge>
                                    )}
                                    {status.total > 0 && (
                                        <Badge variant="outline">{status.total} total</Badge>
                                    )}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => translateSingle(status.table)}
                                        disabled={isTranslating}
                                    >
                                        Traduire
                                    </Button>
                                </div>
                            </div>
                            {status.status === 'running' && (
                                <Progress value={status.progress} className="h-2" />
                            )}
                            {status.status === 'done' && (
                                <Progress value={100} className="h-2 bg-green-100 [&>div]:bg-green-500" />
                            )}
                        </div>
                    ))}
                </div>

                <p className="text-xs text-muted-foreground">
                    Note : La traduction utilise Google Translate. Les termes médicaux spécifiques peuvent nécessiter une vérification manuelle.
                </p>
            </CardContent>
        </Card>
    );
}

export default DatabaseTranslationPanel;
