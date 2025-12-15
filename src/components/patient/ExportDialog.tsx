/**
 * ExportDialog - PDF Export Configuration Dialog
 * 
 * Allows users to:
 * - Select sections to include in the export
 * - Choose date range
 * - Configure language and format
 * - Toggle confidential data inclusion
 */

import { useState } from 'react';
import {
    Download,
    FileText,
    Settings,
    Calendar,
    Loader2,
    Shield,
    CheckSquare,
    Square,
    Globe
} from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PDFExportService, type PatientExportData, type ExportOptions } from '@/lib/PDFExportService';

// ============================================
// TYPES
// ============================================

interface ExportDialogProps {
    patientData: PatientExportData;
    trigger?: React.ReactNode;
    onExportComplete?: () => void;
}

interface SectionOption {
    key: keyof ExportOptions['sections'];
    label: string;
    description: string;
    defaultChecked: boolean;
    requiresConfidential?: boolean;
}

// ============================================
// CONSTANTS
// ============================================

const SECTION_OPTIONS: SectionOption[] = [
    {
        key: 'summary',
        label: 'Résumé patient',
        description: 'Informations générales et pathologies',
        defaultChecked: true,
    },
    {
        key: 'demographics',
        label: 'Données démographiques',
        description: 'Âge, genre, taille, poids, IMC',
        defaultChecked: true,
    },
    {
        key: 'vitals',
        label: 'Signes vitaux',
        description: 'Tension, température, SpO2',
        defaultChecked: true,
    },
    {
        key: 'labResults',
        label: 'Résultats de laboratoire',
        description: 'Analyses biologiques et biochimiques',
        defaultChecked: true,
    },
    {
        key: 'alerts',
        label: 'Alertes actives',
        description: 'Alertes critiques et avertissements',
        defaultChecked: true,
    },
    {
        key: 'recommendations',
        label: 'Recommandations IA',
        description: 'Suggestions validées par les cliniciens',
        defaultChecked: true,
    },
    {
        key: 'treatment',
        label: 'Traitement en cours',
        description: 'Médicaments et posologies',
        defaultChecked: true,
    },
    {
        key: 'notes',
        label: 'Notes médicales',
        description: 'Notes cliniques détaillées',
        defaultChecked: false,
        requiresConfidential: true,
    },
];

// ============================================
// MAIN COMPONENT
// ============================================

const ExportDialog = ({
    patientData,
    trigger,
    onExportComplete
}: ExportDialogProps) => {
    const [open, setOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Export options state
    const [sections, setSections] = useState<ExportOptions['sections']>(
        SECTION_OPTIONS.reduce((acc, opt) => ({
            ...acc,
            [opt.key]: opt.defaultChecked
        }), {} as ExportOptions['sections'])
    );
    const [includeConfidential, setIncludeConfidential] = useState(false);
    const [language, setLanguage] = useState<'fr' | 'en'>('fr');
    const [format, setFormat] = useState<'A4' | 'Letter'>('A4');

    // Toggle section
    const toggleSection = (key: keyof ExportOptions['sections']) => {
        setSections(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    // Select all / none
    const selectAll = () => {
        const newSections = { ...sections };
        SECTION_OPTIONS.forEach(opt => {
            if (!opt.requiresConfidential || includeConfidential) {
                newSections[opt.key] = true;
            }
        });
        setSections(newSections);
    };

    const selectNone = () => {
        const newSections = { ...sections };
        Object.keys(newSections).forEach(key => {
            newSections[key as keyof typeof newSections] = false;
        });
        setSections(newSections);
    };

    // Count selected sections
    const selectedCount = Object.values(sections).filter(Boolean).length;

    // Handle export
    const handleExport = async () => {
        setIsExporting(true);

        try {
            const options: ExportOptions = {
                sections,
                includeConfidential,
                language,
                format,
            };

            await PDFExportService.downloadReport(
                patientData,
                options,
                `rapport-${patientData.patient.patientId}-${new Date().toISOString().split('T')[0]}.pdf`
            );

            toast.success('Rapport PDF généré avec succès');
            onExportComplete?.();
            setOpen(false);
        } catch (error) {
            console.error('Export error:', error);
            toast.error('Erreur lors de la génération du PDF');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Exporter PDF
                    </Button>
                )}
            </DialogTrigger>

            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-primary" />
                        Exporter le rapport patient
                    </DialogTitle>
                    <DialogDescription>
                        Configurez les sections à inclure dans le rapport PDF.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Sections selection */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-sm font-medium">Sections à inclure</Label>
                            <div className="flex gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs"
                                    onClick={selectAll}
                                >
                                    Tout
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs"
                                    onClick={selectNone}
                                >
                                    Aucun
                                </Button>
                            </div>
                        </div>

                        <div className="grid gap-2 max-h-[240px] overflow-y-auto pr-2">
                            {SECTION_OPTIONS.map(option => {
                                const isDisabled = option.requiresConfidential && !includeConfidential;
                                const isChecked = sections[option.key];

                                return (
                                    <div
                                        key={option.key}
                                        className={cn(
                                            "flex items-start gap-3 p-2 rounded-lg border cursor-pointer transition-colors",
                                            isDisabled ? "opacity-50 cursor-not-allowed bg-muted/30" :
                                                isChecked ? "bg-primary/5 border-primary/30" : "hover:bg-muted/50"
                                        )}
                                        onClick={() => !isDisabled && toggleSection(option.key)}
                                    >
                                        <Checkbox
                                            checked={isChecked}
                                            disabled={isDisabled}
                                            className="mt-0.5"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium">{option.label}</span>
                                                {option.requiresConfidential && (
                                                    <Shield className="h-3 w-3 text-orange-500" />
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {option.description}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <p className="text-xs text-muted-foreground">
                            {selectedCount} section{selectedCount > 1 ? 's' : ''} sélectionnée{selectedCount > 1 ? 's' : ''}
                        </p>
                    </div>

                    <Separator />

                    {/* Confidential data toggle */}
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label className="text-sm flex items-center gap-2">
                                <Shield className="h-4 w-4 text-orange-500" />
                                Données confidentielles
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                Inclure les notes médicales détaillées
                            </p>
                        </div>
                        <Switch
                            checked={includeConfidential}
                            onCheckedChange={setIncludeConfidential}
                        />
                    </div>

                    <Separator />

                    {/* Format options */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-sm flex items-center gap-2">
                                <Globe className="h-4 w-4" />
                                Langue
                            </Label>
                            <Select value={language} onValueChange={(v) => setLanguage(v as 'fr' | 'en')}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="fr">🇫🇷 Français</SelectItem>
                                    <SelectItem value="en">🇬🇧 English</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm flex items-center gap-2">
                                <Settings className="h-4 w-4" />
                                Format
                            </Label>
                            <Select value={format} onValueChange={(v) => setFormat(v as 'A4' | 'Letter')}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="A4">A4</SelectItem>
                                    <SelectItem value="Letter">Letter (US)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => setOpen(false)}
                        disabled={isExporting}
                    >
                        Annuler
                    </Button>
                    <Button
                        onClick={handleExport}
                        disabled={isExporting || selectedCount === 0}
                    >
                        {isExporting ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Génération...
                            </>
                        ) : (
                            <>
                                <Download className="h-4 w-4 mr-2" />
                                Télécharger PDF
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default ExportDialog;
