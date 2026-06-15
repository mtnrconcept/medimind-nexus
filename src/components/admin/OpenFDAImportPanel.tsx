import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
    Download,
    Loader2,
    Pill,
    Activity,
    AlertTriangle,
    CheckCircle2,
    Database,
} from "lucide-react";

interface ImportStats {
    medications: number;
    symptoms: number;
    sideEffects: number;
}

export function OpenFDAImportPanel() {
    const [importing, setImporting] = useState(false);
    const [importType, setImportType] = useState<string | null>(null);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [stats, setStats] = useState<ImportStats>({ medications: 0, symptoms: 0, sideEffects: 0 });
    const [lastImport, setLastImport] = useState<string | null>(null);

    const importDrugs = async () => {
        setImporting(true);
        setImportType('drugs');
        setProgress({ current: 0, total: 0 });

        try {
            let skip = 0;
            const limit = 100;
            let hasMore = true;
            let totalMeds = 0;
            let totalEffects = 0;

            while (hasMore && skip < 1000) { // Limit to 1000 for safety
                const { data, error } = await supabase.functions.invoke("import-openfda", {
                    body: { type: 'drugs', limit, skip },
                });

                if (error) throw new Error(error.message);
                if (!data.success) throw new Error(data.error || "Import failed");

                totalMeds += data.imported.medications || 0;
                totalEffects += data.imported.sideEffects || 0;
                hasMore = data.hasMore && skip + limit < 1000;
                skip += limit;

                setProgress({ current: skip, total: Math.min(data.total, 1000) });
            }

            setStats(prev => ({
                ...prev,
                medications: prev.medications + totalMeds,
                sideEffects: prev.sideEffects + totalEffects,
            }));

            toast.success(`Import terminé: ${totalMeds} médicaments, ${totalEffects} effets secondaires`);
            setLastImport(new Date().toLocaleString('fr-FR'));
        } catch (error) {
            console.error("Import error:", error);
            toast.error(`Erreur d'import: ${error instanceof Error ? error.message : "Erreur inconnue"}`);
        } finally {
            setImporting(false);
            setImportType(null);
        }
    };

    const importSymptoms = async () => {
        setImporting(true);
        setImportType('symptoms');

        try {
            const { data, error } = await supabase.functions.invoke("import-openfda", {
                body: { type: 'symptoms' },
            });

            if (error) throw new Error(error.message);
            if (!data.success) throw new Error(data.error || "Import failed");

            setStats(prev => ({
                ...prev,
                symptoms: prev.symptoms + data.imported,
            }));

            toast.success(`Import terminé: ${data.imported} symptômes`);
            setLastImport(new Date().toLocaleString('fr-FR'));
        } catch (error) {
            console.error("Import error:", error);
            toast.error(`Erreur d'import: ${error instanceof Error ? error.message : "Erreur inconnue"}`);
        } finally {
            setImporting(false);
            setImportType(null);
        }
    };

    const importAll = async () => {
        await importSymptoms();
        await importDrugs();
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-blue-500" />
                    Import OpenFDA & Données médicales
                </CardTitle>
                <CardDescription>
                    Importez automatiquement les données médicales depuis les APIs gratuites (OpenFDA, symptômes communs)
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Boutons d'import */}
                <div className="grid gap-3 md:grid-cols-3">
                    <Button
                        onClick={importSymptoms}
                        disabled={importing}
                        variant="outline"
                        className="h-auto py-4 flex-col gap-2"
                    >
                        {importing && importType === 'symptoms' ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Activity className="h-5 w-5 text-blue-500" />
                        )}
                        <span className="font-medium">Symptômes</span>
                        <span className="text-xs text-muted-foreground">40+ symptômes communs</span>
                    </Button>

                    <Button
                        onClick={importDrugs}
                        disabled={importing}
                        variant="outline"
                        className="h-auto py-4 flex-col gap-2"
                    >
                        {importing && importType === 'drugs' ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Pill className="h-5 w-5 text-orange-500" />
                        )}
                        <span className="font-medium">Médicaments FDA</span>
                        <span className="text-xs text-muted-foreground">~1000 médicaments US</span>
                    </Button>

                    <Button
                        onClick={importAll}
                        disabled={importing}
                        className="h-auto py-4 flex-col gap-2"
                    >
                        {importing ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Download className="h-5 w-5" />
                        )}
                        <span className="font-medium">Tout importer</span>
                        <span className="text-xs">Symptômes + Médicaments</span>
                    </Button>
                </div>

                {/* Barre de progression */}
                {importing && progress.total > 0 && (
                    <div className="space-y-2">
                        <Progress value={(progress.current / progress.total) * 100} />
                        <p className="text-sm text-muted-foreground text-center">
                            {progress.current.toLocaleString()} / {progress.total.toLocaleString()}
                        </p>
                    </div>
                )}

                {/* Statistiques d'import */}
                {(stats.medications > 0 || stats.symptoms > 0 || stats.sideEffects > 0) && (
                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                        <div className="flex items-center gap-2 mb-3">
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                            <span className="font-medium text-green-800 dark:text-green-300">
                                Données importées cette session
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {stats.symptoms > 0 && (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                    <Activity className="h-3 w-3 mr-1" />
                                    {stats.symptoms} symptômes
                                </Badge>
                            )}
                            {stats.medications > 0 && (
                                <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                    <Pill className="h-3 w-3 mr-1" />
                                    {stats.medications} médicaments
                                </Badge>
                            )}
                            {stats.sideEffects > 0 && (
                                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                                    <AlertTriangle className="h-3 w-3 mr-1" />
                                    {stats.sideEffects} effets secondaires
                                </Badge>
                            )}
                        </div>
                        {lastImport && (
                            <p className="text-xs text-muted-foreground mt-2">
                                Dernier import: {lastImport}
                            </p>
                        )}
                    </div>
                )}

                {/* Sources de données */}
                <div className="p-4 bg-muted/50 rounded-lg">
                    <h4 className="font-medium text-sm mb-2">Sources de données gratuites utilisées:</h4>
                    <ul className="text-xs text-muted-foreground space-y-1">
                        <li>• <strong>OpenFDA</strong> - Drug Labels API (médicaments, effets secondaires, interactions)</li>
                        <li>• <strong>ICD-10</strong> - Classification internationale des maladies (via import-icd)</li>
                        <li>• <strong>Symptômes communs</strong> - Liste prédéfinie de 40+ symptômes médicaux</li>
                        <li>• <strong>Swissmedic</strong> - Médicaments suisses (via import-swissmedic)</li>
                    </ul>
                </div>
            </CardContent>
        </Card>
    );
}

export default OpenFDAImportPanel;
