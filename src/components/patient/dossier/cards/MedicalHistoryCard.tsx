/**
 * MedicalHistoryCard - Complete personal medical history
 * Features: Categories (diseases, surgeries, hospitalizations), timeline, severity
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Plus, Hospital, Loader2, MoreVertical, Pencil, Trash2, Stethoscope, Scissors, BedDouble, Upload, Search, Globe } from 'lucide-react';
import { DocumentUploadDialog } from '@/components/patient/DocumentUploadDialog';
import { SearchableSelect, SelectOption } from '@/components/ui/searchable-select';

interface MedicalHistoryCardProps {
    patientId: string;
}

interface MedicalHistory {
    id: string;
    category: string;
    title: string;
    start_date?: string;
    end_date?: string;
    severity?: string;
    description?: string;
    notes?: string;
    is_ongoing: boolean;
}

interface NCBIConcept {
    id: string;
    name: string;
    description?: string;
    source?: string;
    type?: string;
}

const CONDITION_TYPES = [
    { value: 'disease', label: 'Maladie', icon: Stethoscope },
    { value: 'surgery', label: 'Chirurgie', icon: Scissors },
    { value: 'hospitalization', label: 'Hospitalisation', icon: BedDouble },
    { value: 'other', label: 'Autre', icon: Hospital },
];

const SEVERITY_OPTIONS = [
    { value: 'mild', label: 'Léger', color: 'bg-green-100 text-green-700' },
    { value: 'moderate', label: 'Modéré', color: 'bg-yellow-100 text-yellow-700' },
    { value: 'severe', label: 'Sévère', color: 'bg-orange-100 text-orange-700' },
    { value: 'critical', label: 'Critique', color: 'bg-red-100 text-red-700' },
];

const MedicalHistoryCard = ({ patientId }: MedicalHistoryCardProps) => {
    // 1. State declarations
    const [history, setHistory] = useState<MedicalHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [editing, setEditing] = useState<MedicalHistory | null>(null);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('all');

    const [formData, setFormData] = useState({
        category: 'disease',
        title: '',
        start_date: '',
        end_date: '',
        severity: 'moderate',
        description: '',
        notes: '',
        is_ongoing: false,
    });

    const [pathologyOptions, setPathologyOptions] = useState<SelectOption[]>([]);
    const [pathologiesLoading, setPathologiesLoading] = useState(false);
    const [treatmentOptions, setTreatmentOptions] = useState<SelectOption[]>([]);
    const [treatmentsLoading, setTreatmentsLoading] = useState(false);
    const [customConditionName, setCustomConditionName] = useState('');
    const [customTreatmentName, setCustomTreatmentName] = useState('');

    // 2. Callback definitions (must be before useEffect or any other usage)
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await supabase
                .from('patient_medical_history')
                .select('*')
                .eq('patient_id', patientId)
                .order('start_date', { ascending: false });
            setHistory((data as any) || []);
        } catch (err) {
            console.error('Error fetching medical history:', err);
        } finally {
            setLoading(false);
        }
    }, [patientId]);

    const fetchInitialOptions = useCallback(async () => {
        setPathologiesLoading(true);
        setTreatmentsLoading(true);
        try {
            const { data: pathologies } = await supabase.from('pathologies').select('id, name').limit(100);
            if (pathologies) {
                setPathologyOptions([
                    ...pathologies.map(p => ({ value: p.id, label: p.name, category: 'Base de données' })),
                    { value: '__custom__', label: 'Autre condition...', category: 'Autre' }
                ]);
            }

            const { data: meds } = await supabase.from('medications').select('id, name').limit(100);
            if (meds) {
                setTreatmentOptions([
                    ...meds.map(m => ({ value: m.id, label: m.name, category: 'Base de données' })),
                    { value: '__custom__', label: 'Autre traitement...', category: 'Autre' }
                ]);
            }
        } catch (error) {
            console.error('Error fetching initial options:', error);
        } finally {
            setPathologiesLoading(false);
            setTreatmentsLoading(false);
        }
    }, []);

    const handlePathologySearch = useCallback(async (query: string) => {
        if (query.length < 3) return;
        try {
            const { data } = await supabase.functions.invoke('search-medical-concepts', {
                body: { query, type: 'pathology' }
            });
            if (data?.concepts) {
                const newOptions: SelectOption[] = data.concepts.map((c: NCBIConcept) => ({
                    value: `ext-${c.id}`,
                    label: c.name,
                    description: c.description,
                    category: 'NCBI'
                }));
                setPathologyOptions(prev => {
                    const existingLabels = new Set(prev.map(p => p.label.toLowerCase()));
                    const filtered = newOptions.filter(o => !existingLabels.has(o.label.toLowerCase()));
                    return [...prev, ...filtered];
                });
            }
        } catch (err) {
            console.error('Pathology search error:', err);
        }
    }, []);

    const handleTreatmentSearch = useCallback(async (query: string) => {
        if (query.length < 3) return;
        try {
            const { data } = await supabase.functions.invoke('search-medical-concepts', {
                body: { query, type: 'medication' }
            });
            if (data?.concepts) {
                const newOptions: SelectOption[] = data.concepts.map((c: NCBIConcept) => ({
                    value: `ext-${c.id}`,
                    label: c.name,
                    description: c.description,
                    category: 'NCBI'
                }));
                setTreatmentOptions(prev => {
                    const existingLabels = new Set(prev.map(p => p.label.toLowerCase()));
                    const filtered = newOptions.filter(o => !existingLabels.has(o.label.toLowerCase()));
                    return [...prev, ...filtered];
                });
            }
        } catch (err) {
            console.error('Treatment search error:', err);
        }
    }, []);

    // 3. Effects
    useEffect(() => {
        fetchData();
        fetchInitialOptions();
    }, [fetchData, fetchInitialOptions]);

    // 4. Action Handlers
    const openAddDialog = () => {
        setEditing(null);
        setFormData({
            category: 'disease',
            title: '',
            start_date: new Date().toISOString().split('T')[0],
            end_date: '',
            severity: 'moderate',
            description: '',
            notes: '',
            is_ongoing: false,
        });
        setCustomConditionName('');
        setCustomTreatmentName('');
        setDialogOpen(true);
    };

    const openEditDialog = (item: MedicalHistory) => {
        setEditing(item);
        setFormData({
            category: item.category || 'disease',
            title: item.title || '',
            start_date: item.start_date || '',
            end_date: item.end_date || '',
            severity: item.severity || 'moderate',
            description: item.description || '',
            notes: item.notes || '',
            is_ongoing: item.is_ongoing || false,
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        let conditionName = formData.title;
        let treatmentName = formData.description;

        if (conditionName === '__custom__') {
            if (!customConditionName.trim()) {
                toast.error('Veuillez entrer un nom pour la condition');
                return;
            }
            conditionName = customConditionName;
        } else if (conditionName.startsWith('ext-')) {
            const option = pathologyOptions.find(o => o.value === conditionName);
            if (option) conditionName = option.label;
        } else if (conditionName) {
            const option = pathologyOptions.find(o => o.value === conditionName);
            if (option) conditionName = option.label;
        }

        if (treatmentName === '__custom__') {
            treatmentName = customTreatmentName;
        } else if (treatmentName && treatmentName.startsWith('ext-')) {
            const option = treatmentOptions.find(o => o.value === treatmentName);
            if (option) treatmentName = option.label;
        } else if (treatmentName) {
            const option = treatmentOptions.find(o => o.value === treatmentName);
            if (option) treatmentName = option.label;
        }

        if (!conditionName || !conditionName.trim()) {
            toast.error('Veuillez entrer un nom de condition');
            return;
        }

        setSaving(true);
        try {
            // Build payload with proper null handling for dates
            const payload = {
                category: formData.category,
                title: conditionName.trim(),
                start_date: formData.start_date || null,
                end_date: formData.end_date || null,
                severity: formData.severity,
                description: treatmentName?.trim() || null,
                notes: formData.notes?.trim() || null,
                is_ongoing: formData.is_ongoing,
                patient_id: patientId
            };

            if (editing) {
                const { error } = await supabase.from('patient_medical_history').update(payload as any).eq('id', editing.id);
                if (error) throw error;
                toast.success('Antécédent mis à jour');
            } else {
                const { error } = await supabase.from('patient_medical_history').insert(payload as any);
                if (error) throw error;
                toast.success('Antécédent ajouté');
            }
            setDialogOpen(false);
            setCustomConditionName('');
            setCustomTreatmentName('');
            fetchData();
        } catch (error) {
            console.error('Save error:', error);
            toast.error('Erreur lors de la sauvegarde');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await supabase.from('patient_medical_history').delete().eq('id', id);
            toast.success('Antécédent supprimé');
            fetchData();
        } catch (error) {
            toast.error('Erreur');
        }
    };

    const filteredHistory = activeTab === 'all'
        ? history
        : history.filter(h => h.category === activeTab);

    const getTypeIcon = (type: string) => {
        const config = CONDITION_TYPES.find(t => t.value === type);
        const Icon = config?.icon || Hospital;
        return <Icon className="h-4 w-4" />;
    };

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{history.length} antécédent(s)</span>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setImportDialogOpen(true)} className="gap-2">
                        <Upload className="h-3 w-3" />
                        Importer
                    </Button>
                    <Button size="sm" variant="default" onClick={openAddDialog}>
                        <Plus className="h-3 w-3 mr-1" />Ajouter
                    </Button>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="h-8">
                    <TabsTrigger value="all" className="text-xs">Tous</TabsTrigger>
                    {CONDITION_TYPES.map(type => (
                        <TabsTrigger key={type.value} value={type.value} className="text-xs gap-1">
                            <type.icon className="h-3 w-3" />
                            {type.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </Tabs>

            <div className="space-y-2">
                {filteredHistory.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                        Aucun antécédent enregistré
                    </div>
                ) : (
                    filteredHistory.map((item) => (
                        <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600">
                                {getTypeIcon(item.category)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm">{item.title}</span>
                                    {item.is_ongoing && <Badge variant="outline" className="text-[10px]">Chronique</Badge>}
                                    {item.severity && (
                                        <Badge className={SEVERITY_OPTIONS.find(s => s.value === item.severity)?.color || ''}>
                                            {SEVERITY_OPTIONS.find(s => s.value === item.severity)?.label}
                                        </Badge>
                                    )}
                                </div>
                                <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                    {item.start_date && (
                                        <span className="flex items-center gap-1">
                                            Diagnostic: {format(new Date(item.start_date), 'PPP', { locale: fr })}
                                        </span>
                                    )}
                                    {item.description && (
                                        <span className="flex items-center gap-1 italic">
                                            Traitement: {item.description}
                                        </span>
                                    )}
                                </div>
                                {item.notes && (
                                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{item.notes}</p>
                                )}
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => openEditDialog(item)}>
                                        <Pencil className="h-4 w-4 mr-2" /> Modifier
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(item.id)}>
                                        <Trash2 className="h-4 w-4 mr-2" /> Supprimer
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    ))
                )}
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Modifier l\'antécédent' : 'Ajouter un antécédent'}</DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-4 py-4">
                        <div className="space-y-2">
                            <Label>Type d'antécédent</Label>
                            <Select
                                value={formData.category}
                                onValueChange={(v) => setFormData({ ...formData, category: v })}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {CONDITION_TYPES.map(type => (
                                        <SelectItem key={type.value} value={type.value}>
                                            <div className="flex items-center gap-2">
                                                <type.icon className="h-4 w-4" />
                                                {type.label}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Nom de la condition / Pathologie</Label>
                            <SearchableSelect
                                options={pathologyOptions}
                                value={formData.title}
                                onValueChange={(v) => {
                                    setFormData({ ...formData, title: v });
                                    if (v !== '__custom__') setCustomConditionName('');
                                }}
                                onSearch={handlePathologySearch}
                                placeholder="Sélectionner ou rechercher..."
                                searchPlaceholder="Taper une maladie..."
                                loading={pathologiesLoading}
                                externalSearch={true}
                            />
                            {formData.title === '__custom__' && (
                                <Input
                                    className="mt-2"
                                    placeholder="Saisir la condition..."
                                    value={customConditionName}
                                    onChange={(e) => setCustomConditionName(e.target.value)}
                                />
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label>Date du diagnostic</Label>
                            <Input
                                type="date"
                                value={formData.start_date}
                                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>Gravité</Label>
                            <Select
                                value={formData.severity}
                                onValueChange={(v) => setFormData({ ...formData, severity: v })}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {SEVERITY_OPTIONS.map(opt => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Traitement prescrit</Label>
                            <SearchableSelect
                                options={treatmentOptions}
                                value={formData.description}
                                onValueChange={(v) => {
                                    setFormData({ ...formData, description: v });
                                    if (v !== '__custom__') setCustomTreatmentName('');
                                }}
                                onSearch={handleTreatmentSearch}
                                placeholder="Médicament ou intervention..."
                                searchPlaceholder="Rechercher un traitement..."
                                loading={treatmentsLoading}
                                externalSearch={true}
                            />
                            {formData.description === '__custom__' && (
                                <Input
                                    className="mt-2"
                                    placeholder="Saisir le traitement..."
                                    value={customTreatmentName}
                                    onChange={(e) => setCustomTreatmentName(e.target.value)}
                                />
                            )}
                        </div>

                        <div className="flex items-center space-x-2 pt-8">
                            <input
                                type="checkbox"
                                id="is_ongoing"
                                checked={formData.is_ongoing}
                                onChange={(e) => setFormData({ ...formData, is_ongoing: e.target.checked })}
                                className="rounded border-gray-300"
                            />
                            <Label htmlFor="is_ongoing">Affection chronique</Label>
                        </div>

                        <div className="col-span-2 space-y-2">
                            <Label>Notes complémentaires</Label>
                            <Textarea
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                placeholder="Détails, interventions, complications..."
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {editing ? 'Mettre à jour' : 'Enregistrer'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <DocumentUploadDialog
                open={importDialogOpen}
                onOpenChange={setImportDialogOpen}
                patientId={patientId}
                category="medical_history"
            />
        </div>
    );
};

export default MedicalHistoryCard;
