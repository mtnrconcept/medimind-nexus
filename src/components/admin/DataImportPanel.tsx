import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import {
    Upload,
    FileSpreadsheet,
    AlertTriangle,
    CheckCircle2,
    Loader2,
    Trash2,
    Database,
    Table2,
    ArrowRight,
    Stethoscope,
    Activity,
    Pill,
    Tablets,
    AlertCircle,
    Zap,
    FileText,
    X
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

// Types de données médicales supportés
type DataType = 'pathologies' | 'symptoms' | 'treatments' | 'medications' | 'side_effects' | 'interactions' | 'auto';

interface ColumnMapping {
    sourceColumn: string;
    targetField: string;
    detected: boolean;
}

interface ImportStats {
    total: number;
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
}

interface ParsedData {
    headers: string[];
    rows: Record<string, any>[];
    fileName: string;
    fileType: string;
}

// Schémas de mapping pour chaque type de données
const FIELD_SCHEMAS: Record<DataType, { required: string[]; optional: string[]; displayName: string }> = {
    pathologies: {
        required: ['name'],
        optional: ['category', 'specialty', 'severity', 'icd_code', 'description', 'synonyms'],
        displayName: 'Pathologies'
    },
    symptoms: {
        required: ['name'],
        optional: ['body_system', 'category', 'severity', 'description', 'synonyms'],
        displayName: 'Symptômes'
    },
    treatments: {
        required: ['name'],
        optional: ['type', 'description', 'contraindications', 'pathology_name'],
        displayName: 'Traitements'
    },
    medications: {
        required: ['name'],
        optional: ['substance', 'atc_code', 'description', 'indications', 'posology', 'category', 'synonyms'],
        displayName: 'Médicaments'
    },
    side_effects: {
        required: ['name', 'medication_name'],
        optional: ['severity', 'frequency', 'description'],
        displayName: 'Effets secondaires'
    },
    interactions: {
        required: ['medication1_name', 'medication2_name'],
        optional: ['severity', 'description', 'mechanism'],
        displayName: 'Interactions'
    },
    auto: {
        required: [],
        optional: [],
        displayName: 'Détection auto'
    }
};

// Mots-clés pour la détection automatique du type
const TYPE_KEYWORDS: Record<DataType, string[]> = {
    pathologies: ['pathologie', 'pathology', 'disease', 'maladie', 'icd', 'diagnostic', 'diagnosis'],
    symptoms: ['symptom', 'symptôme', 'signe', 'sign', 'body_system', 'système'],
    treatments: ['treatment', 'traitement', 'therapy', 'thérapie', 'procedure'],
    medications: ['medication', 'médicament', 'drug', 'atc', 'substance', 'posology', 'posologie', 'medicament'],
    side_effects: ['side_effect', 'effet_secondaire', 'adverse', 'indésirable', 'effet secondaire'],
    interactions: ['interaction', 'medication1', 'medication2', 'drug1', 'drug2'],
    auto: []
};

const DataImportPanel = () => {
    const [parsedData, setParsedData] = useState<ParsedData | null>(null);
    const [dataType, setDataType] = useState<DataType>('auto');
    const [detectedType, setDetectedType] = useState<DataType | null>(null);
    const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
    const [importing, setImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [importStats, setImportStats] = useState<ImportStats | null>(null);
    const [importLogs, setImportLogs] = useState<{ type: 'info' | 'success' | 'error' | 'warning'; message: string }[]>([]);
    const [isDragOver, setIsDragOver] = useState(false);

    // Parse le fichier uploadé
    const parseFile = useCallback(async (file: File) => {
        const fileName = file.name;
        const fileType = fileName.split('.').pop()?.toLowerCase() || '';

        try {
            let headers: string[] = [];
            let rows: Record<string, any>[] = [];

            if (fileType === 'csv') {
                // Parse CSV
                const text = await file.text();
                const lines = text.split('\n').filter(line => line.trim());
                if (lines.length === 0) throw new Error('Fichier vide');

                // Détection du séparateur (virgule ou point-virgule)
                const firstLine = lines[0];
                const separator = firstLine.includes(';') ? ';' : ',';

                headers = firstLine.split(separator).map(h => h.trim().replace(/^"|"$/g, ''));
                rows = lines.slice(1).map(line => {
                    const values = line.split(separator).map(v => v.trim().replace(/^"|"$/g, ''));
                    const row: Record<string, any> = {};
                    headers.forEach((h, i) => {
                        row[h] = values[i] || '';
                    });
                    return row;
                });
            } else if (['xls', 'xlsx'].includes(fileType)) {
                // Parse Excel
                const arrayBuffer = await file.arrayBuffer();
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { header: 1 });

                if (jsonData.length === 0) throw new Error('Fichier vide');

                headers = (jsonData[0] as string[]).map(h => String(h || '').trim());
                rows = jsonData.slice(1).map((row: any) => {
                    const obj: Record<string, any> = {};
                    headers.forEach((h, i) => {
                        obj[h] = row[i] !== undefined ? String(row[i]).trim() : '';
                    });
                    return obj;
                }).filter(row => Object.values(row).some(v => v !== ''));
            } else {
                throw new Error(`Format non supporté: ${fileType}`);
            }

            setParsedData({ headers, rows, fileName, fileType });
            detectDataType(headers);
            toast.success(`${fileName} chargé: ${rows.length} lignes, ${headers.length} colonnes`);

        } catch (err: any) {
            console.error('Erreur parsing:', err);
            toast.error(`Erreur: ${err.message}`);
        }
    }, []);

    // Détecte automatiquement le type de données
    const detectDataType = useCallback((headers: string[]) => {
        const headerLower = headers.map(h => h.toLowerCase());
        let bestMatch: DataType = 'pathologies';
        let bestScore = 0;

        (Object.keys(TYPE_KEYWORDS) as DataType[]).forEach(type => {
            if (type === 'auto') return;
            const keywords = TYPE_KEYWORDS[type];
            let score = 0;
            keywords.forEach(keyword => {
                if (headerLower.some(h => h.includes(keyword))) score++;
            });
            if (score > bestScore) {
                bestScore = score;
                bestMatch = type;
            }
        });

        setDetectedType(bestMatch);
        if (dataType === 'auto') {
            generateMappings(headers, bestMatch);
        }
    }, [dataType]);

    // Génère les mappings colonnes -> champs
    const generateMappings = useCallback((headers: string[], type: DataType) => {
        const schema = FIELD_SCHEMAS[type];
        const allFields = [...schema.required, ...schema.optional];

        const mappings: ColumnMapping[] = headers.map(header => {
            const headerLower = header.toLowerCase().replace(/[_\s-]/g, '');

            // Cherche une correspondance exacte ou partielle
            let matchedField = '';
            let detected = false;

            for (const field of allFields) {
                const fieldLower = field.toLowerCase().replace(/[_\s-]/g, '');
                if (headerLower === fieldLower || headerLower.includes(fieldLower) || fieldLower.includes(headerLower)) {
                    matchedField = field;
                    detected = true;
                    break;
                }
            }

            // Mappings spéciaux
            if (!matchedField) {
                if (headerLower.includes('nom') || headerLower === 'name' || headerLower === 'titre') {
                    matchedField = 'name';
                    detected = true;
                } else if (headerLower.includes('desc')) {
                    matchedField = 'description';
                    detected = true;
                } else if (headerLower.includes('categ') || headerLower.includes('class')) {
                    matchedField = 'category';
                    detected = true;
                }
            }

            return {
                sourceColumn: header,
                targetField: matchedField,
                detected
            };
        });

        setColumnMappings(mappings);
    }, []);

    // Met à jour un mapping
    const updateMapping = (sourceColumn: string, targetField: string) => {
        setColumnMappings(prev =>
            prev.map(m => m.sourceColumn === sourceColumn ? { ...m, targetField, detected: false } : m)
        );
    };

    // Effectue l'import
    const runImport = async () => {
        if (!parsedData) return;

        const effectiveType = dataType === 'auto' ? detectedType : dataType;
        if (!effectiveType || effectiveType === 'auto') {
            toast.error('Veuillez sélectionner un type de données');
            return;
        }

        // Vérifier les champs requis
        const schema = FIELD_SCHEMAS[effectiveType];
        const mappedFields = columnMappings.filter(m => m.targetField).map(m => m.targetField);
        const missingRequired = schema.required.filter(f => !mappedFields.includes(f));

        if (missingRequired.length > 0) {
            toast.error(`Champs requis manquants: ${missingRequired.join(', ')}`);
            return;
        }

        setImporting(true);
        setImportProgress(0);
        setImportStats(null);
        setImportLogs([{ type: 'info', message: `🚀 Import de ${parsedData.rows.length} ${FIELD_SCHEMAS[effectiveType].displayName}...` }]);

        const stats: ImportStats = { total: parsedData.rows.length, inserted: 0, updated: 0, skipped: 0, errors: 0 };
        const BATCH_SIZE = 50;

        try {
            // Préparer les données
            const preparedRows = parsedData.rows.map(row => {
                const prepared: Record<string, any> = {};
                columnMappings.forEach(mapping => {
                    if (mapping.targetField && row[mapping.sourceColumn]) {
                        let value = row[mapping.sourceColumn];
                        // Convertir les arrays (synonyms)
                        if (mapping.targetField === 'synonyms' && typeof value === 'string') {
                            value = value.split(/[,;]/).map((s: string) => s.trim()).filter((s: string) => s);
                        }
                        prepared[mapping.targetField] = value;
                    }
                });
                return prepared;
            }).filter(row => row.name); // Filtrer les lignes sans nom

            // Import par lots
            const chunks: Record<string, any>[][] = [];
            for (let i = 0; i < preparedRows.length; i += BATCH_SIZE) {
                chunks.push(preparedRows.slice(i, i + BATCH_SIZE));
            }

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];

                try {
                    if (effectiveType === 'side_effects') {
                        // Gestion spéciale des effets secondaires (liés aux médicaments)
                        for (const row of chunk) {
                            if (row.medication_name && row.name) {
                                // Trouver le médicament
                                const { data: med } = await supabase
                                    .from('medications')
                                    .select('id')
                                    .ilike('name', row.medication_name)
                                    .limit(1)
                                    .single();

                                if (med) {
                                    const { error } = await supabase
                                        .from('medication_side_effects')
                                        .upsert({
                                            medication_id: med.id,
                                            name: row.name,
                                            severity: row.severity || 'unknown',
                                            frequency: row.frequency,
                                            description: row.description
                                        }, { onConflict: 'medication_id,name' });

                                    if (error) stats.errors++;
                                    else stats.inserted++;
                                } else {
                                    stats.skipped++;
                                }
                            }
                        }
                    } else if (effectiveType === 'interactions') {
                        // Gestion spéciale des interactions
                        for (const row of chunk) {
                            if (row.medication1_name && row.medication2_name) {
                                const [{ data: med1 }, { data: med2 }] = await Promise.all([
                                    supabase.from('medications').select('id').ilike('name', row.medication1_name).limit(1).single(),
                                    supabase.from('medications').select('id').ilike('name', row.medication2_name).limit(1).single()
                                ]);

                                if (med1 && med2) {
                                    const { error } = await supabase
                                        .from('medication_interactions')
                                        .upsert({
                                            medication1_id: med1.id,
                                            medication2_id: med2.id,
                                            severity: row.severity || 'moderate',
                                            description: row.description,
                                            mechanism: row.mechanism
                                        }, { onConflict: 'medication1_id,medication2_id' });

                                    if (error) stats.errors++;
                                    else stats.inserted++;
                                } else {
                                    stats.skipped++;
                                }
                            }
                        }
                    } else if (effectiveType === 'treatments' && chunk.some(r => r.pathology_name)) {
                        // Traitements avec liaison pathologie
                        for (const row of chunk) {
                            let pathologyId = null;
                            if (row.pathology_name) {
                                const { data: path } = await supabase
                                    .from('pathologies')
                                    .select('id')
                                    .ilike('name', row.pathology_name)
                                    .limit(1)
                                    .single();
                                pathologyId = path?.id;
                            }

                            const insertData = { ...row, pathology_id: pathologyId };
                            delete insertData.pathology_name;

                            const { error } = await supabase
                                .from('treatments')
                                .upsert(insertData, { onConflict: 'name,pathology_id', ignoreDuplicates: true });

                            if (error) stats.errors++;
                            else stats.inserted++;
                        }
                    } else {
                        // Import standard (pathologies, symptoms, medications)
                        // Stratégie: vérifier l'existence puis insert ou update
                        for (const row of chunk) {
                            try {
                                // Vérifier si l'entrée existe déjà
                                const { data: existing } = await supabase
                                    .from(effectiveType)
                                    .select('id')
                                    .ilike('name', row.name)
                                    .limit(1)
                                    .maybeSingle();

                                if (existing) {
                                    // Mise à jour
                                    const { error } = await supabase
                                        .from(effectiveType)
                                        .update(row)
                                        .eq('id', existing.id);

                                    if (error) {
                                        stats.errors++;
                                    } else {
                                        stats.updated++;
                                    }
                                } else {
                                    // Insertion
                                    const { error } = await supabase
                                        .from(effectiveType)
                                        .insert(row);

                                    if (error) {
                                        stats.errors++;
                                    } else {
                                        stats.inserted++;
                                    }
                                }
                            } catch (rowErr: any) {
                                console.error('Erreur ligne:', rowErr);
                                stats.errors++;
                            }
                        }
                    }
                } catch (err: any) {
                    console.error('Erreur batch:', err);
                    stats.errors += chunk.length;
                    setImportLogs(prev => [...prev, { type: 'error', message: `❌ Lot ${i + 1}: ${err.message}` }]);
                }

                setImportProgress(Math.round(((i + 1) / chunks.length) * 100));
            }

            setImportStats(stats);
            setImportLogs(prev => [...prev, {
                type: 'success',
                message: `✅ Terminé! ${stats.inserted} insérés, ${stats.updated} mis à jour, ${stats.skipped} ignorés, ${stats.errors} erreurs`
            }]);

            if (stats.errors === 0) {
                toast.success(`Import réussi: ${stats.inserted} éléments ajoutés`);
            } else {
                toast.warning(`Import terminé avec ${stats.errors} erreurs`);
            }

        } catch (err: any) {
            console.error('Erreur import:', err);
            setImportLogs(prev => [...prev, { type: 'error', message: `❌ Erreur fatale: ${err.message}` }]);
            toast.error(`Erreur: ${err.message}`);
        } finally {
            setImporting(false);
        }
    };

    // Reset
    const resetImport = () => {
        setParsedData(null);
        setDataType('auto');
        setDetectedType(null);
        setColumnMappings([]);
        setImportStats(null);
        setImportLogs([]);
        setImportProgress(0);
    };

    // Drag & Drop handlers
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) parseFile(file);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) parseFile(file);
    };

    const getTypeIcon = (type: DataType) => {
        switch (type) {
            case 'pathologies': return <Stethoscope className="h-4 w-4" />;
            case 'symptoms': return <Activity className="h-4 w-4" />;
            case 'treatments': return <Pill className="h-4 w-4" />;
            case 'medications': return <Tablets className="h-4 w-4" />;
            case 'side_effects': return <AlertCircle className="h-4 w-4" />;
            case 'interactions': return <Zap className="h-4 w-4" />;
            default: return <Database className="h-4 w-4" />;
        }
    };

    const effectiveType = dataType === 'auto' ? detectedType : dataType;

    return (
        <Card className="border-primary/20">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-primary" />
                    Import de Données Médicales
                </CardTitle>
                <CardDescription>
                    Importez des fichiers CSV ou Excel pour alimenter la base de données
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {!parsedData ? (
                    /* Zone d'upload */
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`
              border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer
              ${isDragOver ? 'border-primary bg-primary/10 scale-[1.02]' : 'border-muted-foreground/30 hover:border-primary/50'}
            `}
                    >
                        <input
                            type="file"
                            accept=".csv,.xls,.xlsx"
                            onChange={handleFileSelect}
                            className="hidden"
                            id="file-upload"
                        />
                        <label htmlFor="file-upload" className="cursor-pointer">
                            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                            <p className="text-lg font-medium mb-2">
                                Glissez-déposez un fichier ou cliquez pour sélectionner
                            </p>
                            <p className="text-sm text-muted-foreground">
                                Formats supportés: CSV, XLS, XLSX
                            </p>
                            <div className="flex flex-wrap justify-center gap-2 mt-4">
                                <Badge variant="outline"><Stethoscope className="h-3 w-3 mr-1" /> Pathologies</Badge>
                                <Badge variant="outline"><Activity className="h-3 w-3 mr-1" /> Symptômes</Badge>
                                <Badge variant="outline"><Pill className="h-3 w-3 mr-1" /> Traitements</Badge>
                                <Badge variant="outline"><Tablets className="h-3 w-3 mr-1" /> Médicaments</Badge>
                                <Badge variant="outline"><AlertCircle className="h-3 w-3 mr-1" /> Effets sec.</Badge>
                                <Badge variant="outline"><Zap className="h-3 w-3 mr-1" /> Interactions</Badge>
                            </div>
                        </label>
                    </div>
                ) : (
                    /* Fichier chargé */
                    <div className="space-y-6">
                        {/* En-tête fichier */}
                        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-3">
                                <FileText className="h-8 w-8 text-primary" />
                                <div>
                                    <p className="font-medium">{parsedData.fileName}</p>
                                    <p className="text-sm text-muted-foreground">
                                        {parsedData.rows.length} lignes • {parsedData.headers.length} colonnes
                                    </p>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={resetImport}>
                                <X className="h-4 w-4 mr-1" /> Fermer
                            </Button>
                        </div>

                        <Tabs defaultValue="config" className="w-full">
                            <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="config">Configuration</TabsTrigger>
                                <TabsTrigger value="preview">Aperçu</TabsTrigger>
                                <TabsTrigger value="logs">Logs</TabsTrigger>
                            </TabsList>

                            <TabsContent value="config" className="space-y-4 pt-4">
                                {/* Sélection du type */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-sm font-medium mb-2 block">Type de données</label>
                                        <Select
                                            value={dataType}
                                            onValueChange={(v: DataType) => {
                                                setDataType(v);
                                                if (v !== 'auto' && parsedData) {
                                                    generateMappings(parsedData.headers, v);
                                                }
                                            }}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="auto">
                                                    <span className="flex items-center gap-2">
                                                        <Database className="h-4 w-4" /> Détection automatique
                                                    </span>
                                                </SelectItem>
                                                {(Object.keys(FIELD_SCHEMAS) as DataType[]).filter(t => t !== 'auto').map(type => (
                                                    <SelectItem key={type} value={type}>
                                                        <span className="flex items-center gap-2">
                                                            {getTypeIcon(type)} {FIELD_SCHEMAS[type].displayName}
                                                        </span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium mb-2 block">Type détecté</label>
                                        <div className="h-10 flex items-center px-3 bg-muted rounded-md">
                                            {detectedType && (
                                                <span className="flex items-center gap-2">
                                                    {getTypeIcon(detectedType)}
                                                    {FIELD_SCHEMAS[detectedType].displayName}
                                                    <Badge variant="secondary" className="ml-2">Auto</Badge>
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Mapping des colonnes */}
                                <div>
                                    <label className="text-sm font-medium mb-2 block">Mapping des colonnes</label>
                                    <ScrollArea className="h-[250px] border rounded-lg p-3">
                                        <div className="space-y-2">
                                            {columnMappings.map((mapping, idx) => (
                                                <div key={idx} className="flex items-center gap-3 p-2 rounded bg-muted/30">
                                                    <div className="flex-1 flex items-center gap-2">
                                                        <Table2 className="h-4 w-4 text-muted-foreground" />
                                                        <span className="text-sm font-mono truncate" title={mapping.sourceColumn}>
                                                            {mapping.sourceColumn}
                                                        </span>
                                                    </div>
                                                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                                    <Select
                                                        value={mapping.targetField || '_skip'}
                                                        onValueChange={(v) => updateMapping(mapping.sourceColumn, v === '_skip' ? '' : v)}
                                                    >
                                                        <SelectTrigger className="w-[180px]">
                                                            <SelectValue placeholder="Ignorer" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="_skip">
                                                                <span className="text-muted-foreground">— Ignorer —</span>
                                                            </SelectItem>
                                                            {effectiveType && effectiveType !== 'auto' && (
                                                                <>
                                                                    {FIELD_SCHEMAS[effectiveType].required.map(field => (
                                                                        <SelectItem key={field} value={field}>
                                                                            <span className="flex items-center gap-1">
                                                                                <span className="text-destructive">*</span> {field}
                                                                            </span>
                                                                        </SelectItem>
                                                                    ))}
                                                                    {FIELD_SCHEMAS[effectiveType].optional.map(field => (
                                                                        <SelectItem key={field} value={field}>{field}</SelectItem>
                                                                    ))}
                                                                </>
                                                            )}
                                                        </SelectContent>
                                                    </Select>
                                                    {mapping.detected && (
                                                        <Badge variant="outline" className="text-green-600">Auto</Badge>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </div>

                                {/* Bouton Import */}
                                <div className="flex items-center justify-between pt-4 border-t">
                                    <div className="text-sm text-muted-foreground">
                                        {columnMappings.filter(m => m.targetField).length} colonnes mappées
                                    </div>
                                    <Button
                                        onClick={runImport}
                                        disabled={importing || !effectiveType || effectiveType === 'auto'}
                                        className="bg-green-600 hover:bg-green-700"
                                    >
                                        {importing ? (
                                            <>
                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                Import en cours...
                                            </>
                                        ) : (
                                            <>
                                                <Database className="h-4 w-4 mr-2" />
                                                Importer {parsedData.rows.length} lignes
                                            </>
                                        )}
                                    </Button>
                                </div>

                                {importing && (
                                    <Progress value={importProgress} className="h-2" />
                                )}

                                {importStats && (
                                    <div className="flex gap-4 p-4 bg-muted/50 rounded-lg text-sm">
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                                            <span>{importStats.inserted} insérés</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                            <span>{importStats.skipped} ignorés</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <X className="h-4 w-4 text-red-500" />
                                            <span>{importStats.errors} erreurs</span>
                                        </div>
                                    </div>
                                )}
                            </TabsContent>

                            <TabsContent value="preview" className="pt-4">
                                <ScrollArea className="h-[350px] border rounded-lg">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted sticky top-0">
                                            <tr>
                                                {parsedData.headers.map((h, i) => (
                                                    <th key={i} className="px-3 py-2 text-left font-medium border-b truncate max-w-[150px]" title={h}>
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {parsedData.rows.slice(0, 50).map((row, i) => (
                                                <tr key={i} className="border-b hover:bg-muted/30">
                                                    {parsedData.headers.map((h, j) => (
                                                        <td key={j} className="px-3 py-2 truncate max-w-[150px]" title={row[h]}>
                                                            {row[h]}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {parsedData.rows.length > 50 && (
                                        <p className="p-3 text-center text-sm text-muted-foreground">
                                            ... et {parsedData.rows.length - 50} lignes supplémentaires
                                        </p>
                                    )}
                                </ScrollArea>
                            </TabsContent>

                            <TabsContent value="logs" className="pt-4">
                                <ScrollArea className="h-[350px] border rounded-lg p-3 bg-muted/20 font-mono text-sm">
                                    {importLogs.length === 0 ? (
                                        <p className="text-muted-foreground text-center py-8">
                                            Les logs d'import apparaîtront ici
                                        </p>
                                    ) : (
                                        <div className="space-y-1">
                                            {importLogs.map((log, i) => (
                                                <div
                                                    key={i}
                                                    className={`
                            ${log.type === 'error' ? 'text-destructive' : ''}
                            ${log.type === 'success' ? 'text-green-600 dark:text-green-400' : ''}
                            ${log.type === 'warning' ? 'text-yellow-600 dark:text-yellow-400' : ''}
                          `}
                                                >
                                                    {log.message}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </ScrollArea>
                            </TabsContent>
                        </Tabs>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

export default DataImportPanel;
