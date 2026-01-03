/**
 * MedicalHistoryCard - Complete personal medical history
 * Features: Categories (diseases, surgeries, hospitalizations), timeline, severity
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Plus, Hospital, Loader2, MoreVertical, Pencil, Trash2, Stethoscope, Scissors, BedDouble, Upload } from 'lucide-react';
import { DocumentUploadDialog } from '@/components/patient/DocumentUploadDialog';
import { SearchableSelect, SelectOption } from '@/components/ui/searchable-select';
import { useWindowManager } from '@/contexts/WindowManagerContext';
import AppWindow from '../AppWindow';

interface MedicalHistoryCardProps {
    patientId: string;
}

interface MedicalHistory {
    id: string;
    condition_type: string; // was category
    condition_name: string; // was title
    diagnosis_date?: string; // was start_date
    treatment?: string; // was description of treatment
    severity?: string;
    notes?: string;
    is_chronic: boolean; // was is_ongoing
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
    const { maxZIndex } = useWindowManager();
    // 1. State declarations
    const [history, setHistory] = useState<MedicalHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [editing, setEditing] = useState<MedicalHistory | null>(null);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('all');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const handleSelectAll = (checked: boolean) => {
        if (checked) setSelectedIds(filteredHistory.map(h => h.id));
        else setSelectedIds([]);
    };

    const handleSelect = (id: string, checked: boolean) => {
        if (checked) setSelectedIds(prev => [...prev, id]);
        else setSelectedIds(prev => prev.filter(i => i !== id));
    };

    const handleBulkDelete = async () => {
        if (!selectedIds.length) return;
        if (!window.confirm(`Supprimer ${selectedIds.length} antécédents ?`)) return;

        try {
            const { error } = await supabase.from('patient_medical_history').delete().in('id', selectedIds);
            if (error) throw error;
            toast.success(`${selectedIds.length} antécédents supprimés`);
            setSelectedIds([]);
            fetchData();
        } catch (err) {
            console.error(err);
            toast.error('Erreur lors de la suppression multiple');
        }
    };

    // Reset selection when changing tabs to avoid deleting hidden items
    useEffect(() => {
        setSelectedIds([]);
    }, [activeTab]);

    const [formData, setFormData] = useState({
        condition_type: 'disease',
        condition_name: '',
        diagnosis_date: '',
        severity: 'moderate',
        treatment: '',
        notes: '',
        is_chronic: false,
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
                .order('created_at', { ascending: false });
            setHistory((data as unknown as MedicalHistory[]) || []);
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
            // 1. Search Local DB
            const localPromise = supabase
                .from('pathologies')
                .select('id, name')
                .ilike('name', `%${query}%`)
                .limit(20);

            // 2. Search External
            const externalPromise = supabase.functions.invoke('search-medical-concepts', {
                body: { query, type: 'pathology' }
            });

            const [localRes, externalRes] = await Promise.all([localPromise, externalPromise]);

            let newOptions: SelectOption[] = [];

            // Process Local
            if (localRes.data) {
                newOptions = localRes.data.map(p => ({
                    value: p.id,
                    label: p.name,
                    category: 'Base de données'
                }));
            }

            // Process External
            const extData = externalRes.data;
            if (extData?.concepts) {
                const globalOptions: SelectOption[] = extData.concepts.map((c: NCBIConcept) => ({
                    value: `ext-${c.id}`,
                    label: c.name,
                    description: c.description,
                    category: 'NCBI'
                }));
                newOptions = [...newOptions, ...globalOptions];
            }

            // Merge
            setPathologyOptions(prev => {
                const existingLabels = new Set(prev.map(p => p.label.toLowerCase()));
                const filtered = newOptions.filter(o => !existingLabels.has(o.label.toLowerCase()));
                return [...prev, ...filtered];
            });

        } catch (err) {
            console.error('Pathology search error:', err);
        }
    }, []);

    const handleTreatmentSearch = useCallback(async (query: string) => {
        if (query.length < 3) return;
        try {
            // 1. Search Local DB
            const localPromise = supabase
                .from('medications')
                .select('id, name')
                .ilike('name', `%${query}%`)
                .limit(20);

            // 2. Search External
            const externalPromise = supabase.functions.invoke('search-medical-concepts', {
                body: { query, type: 'medication' }
            });

            const [localRes, externalRes] = await Promise.all([localPromise, externalPromise]);

            let newOptions: SelectOption[] = [];

            // Process Local
            if (localRes.data) {
                newOptions = localRes.data.map(m => ({
                    value: m.id,
                    label: m.name,
                    category: 'Base de données'
                }));
            }

            // Process External
            const extData = externalRes.data;
            if (extData?.concepts) {
                const globalOptions: SelectOption[] = extData.concepts.map((c: NCBIConcept) => ({
                    value: `ext-${c.id}`, // Maintain consistent ID format for external
                    label: c.name,
                    description: c.description,
                    category: 'NCBI'
                }));
                newOptions = [...newOptions, ...globalOptions];
            }

            // Merge
            setTreatmentOptions(prev => {
                const existingLabels = new Set(prev.map(p => p.label.toLowerCase()));
                const filtered = newOptions.filter(o => !existingLabels.has(o.label.toLowerCase()));
                return [...prev, ...filtered];
            });

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
            condition_type: 'disease',
            condition_name: '',
            diagnosis_date: new Date().toISOString().split('T')[0],
            severity: 'moderate',
            treatment: '',
            notes: '',
            is_chronic: false,
        });
        setCustomConditionName('');
        setCustomTreatmentName('');
        setDialogOpen(true);
    };

    const openEditDialog = (item: MedicalHistory) => {
        setEditing(item);
        setFormData({
            condition_type: item.condition_type || 'disease',
            condition_name: item.condition_name || '',
            diagnosis_date: item.diagnosis_date || '',
            severity: item.severity || 'moderate',
            treatment: item.treatment || '',
            notes: item.notes || '',
            is_chronic: item.is_chronic || false,
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        let conditionName = formData.condition_name;
        let treatmentName = formData.treatment;

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
                condition_type: formData.condition_type,
                condition_name: conditionName.trim(),
                diagnosis_date: formData.diagnosis_date || null,
                severity: formData.severity,
                treatment: treatmentName?.trim() || null,
                notes: formData.notes?.trim() || null,
                is_chronic: formData.is_chronic,
                patient_id: patientId
            };

            if (editing) {
                const { error } = await supabase.from('patient_medical_history').update(payload).eq('id', editing.id);
                if (error) throw error;
                toast.success('Antécédent mis à jour');
            } else {
                const { error } = await supabase.from('patient_medical_history').insert(payload);
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
        : history.filter(h => h.condition_type === activeTab);

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
                    <div className="space-y-2">
                        <div className="flex items-center space-x-2 mb-2 p-2 bg-muted/20 rounded-lg justify-between">
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="select-all-history"
                                    checked={filteredHistory.length > 0 && selectedIds.length === filteredHistory.length}
                                    onCheckedChange={(c) => handleSelectAll(c as boolean)}
                                />
                                <Label htmlFor="select-all-history" className="text-xs text-muted-foreground cursor-pointer">
                                    Tout sélectionner
                                </Label>
                            </div>
                            {selectedIds.length > 0 && (
                                <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="h-7 text-xs">
                                    <Trash2 className="h-3 w-3 mr-2" /> Supprimer ({selectedIds.length})
                                </Button>
                            )}
                        </div>

                        {
                            filteredHistory.map((item) => (
                                <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                                    <Checkbox
                                        className="mt-1"
                                        checked={selectedIds.includes(item.id)}
                                        onCheckedChange={(c) => handleSelect(item.id, c as boolean)}
                                    />
                                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600">
                                        {getTypeIcon(item.condition_type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm">{item.condition_name}</span>
                                            {item.is_chronic && <Badge variant="outline" className="text-[10px]">Chronique</Badge>}
                                            {item.severity && (
                                                <Badge className={SEVERITY_OPTIONS.find(s => s.value === item.severity)?.color || ''}>
                                                    {SEVERITY_OPTIONS.find(s => s.value === item.severity)?.label}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                            {item.diagnosis_date && (
                                                <span className="flex items-center gap-1">
                                                    Diagnostic: {format(new Date(item.diagnosis_date), 'PPP', { locale: fr })}
                                                </span>
                                            )}
                                            {item.treatment && (
                                                <span className="flex items-center gap-1 italic">
                                                    Traitement: {item.treatment}
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
                        }
                    </div>
                )}
            </div>

            {dialogOpen && (
                <AppWindow
                    id={`medical-history-form-${patientId}`}
                    title={editing ? 'Modifier l\'antécédent' : 'Ajouter un antécédent'}
                    onClose={() => setDialogOpen(false)}
                    zIndex={maxZIndex + 100}
                    onFocus={() => { }}
                    defaultSize={{ width: 600, height: 650 }}
                >
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4 py-4">
                            <div className="space-y-2">
                                <Label>Type d'antécédent</Label>
                                <Select
                                    value={formData.condition_type}
                                    onValueChange={(v) => setFormData({ ...formData, condition_type: v })}
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
                                    value={formData.condition_name}
                                    onValueChange={(v) => {
                                        setFormData({ ...formData, condition_name: v });
                                        if (v !== '__custom__') setCustomConditionName('');
                                    }}
                                    onSearch={handlePathologySearch}
                                    placeholder="Sélectionner ou rechercher..."
                                    searchPlaceholder="Taper une maladie..."
                                    loading={pathologiesLoading}
                                    externalSearch={true}
                                />
                                {formData.condition_name === '__custom__' && (
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
                                    value={formData.diagnosis_date}
                                    onChange={(e) => setFormData({ ...formData, diagnosis_date: e.target.value })}
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
                                    value={formData.treatment}
                                    onValueChange={(v) => {
                                        setFormData({ ...formData, treatment: v });
                                        if (v !== '__custom__') setCustomTreatmentName('');
                                    }}
                                    onSearch={handleTreatmentSearch}
                                    placeholder="Médicament ou intervention..."
                                    searchPlaceholder="Rechercher un traitement..."
                                    loading={treatmentsLoading}
                                    externalSearch={true}
                                />
                                {formData.treatment === '__custom__' && (
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
                                    id="is_chronic"
                                    checked={formData.is_chronic}
                                    onChange={(e) => setFormData({ ...formData, is_chronic: e.target.checked })}
                                    className="rounded border-gray-300"
                                />
                                <Label htmlFor="is_chronic">Affection chronique</Label>
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
                        <div className="flex justify-end gap-2 pt-4 border-t border-border/10">
                            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
                            <Button onClick={handleSave} disabled={saving}>
                                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {editing ? 'Mettre à jour' : 'Enregistrer'}
                            </Button>
                        </div>
                    </div>
                </AppWindow>
            )}

            <DocumentUploadDialog
                open={importDialogOpen}
                onOpenChange={setImportDialogOpen}
                patientId={patientId}
                category="medical_history"
            />
        </div >
    );
};

export default MedicalHistoryCard;
