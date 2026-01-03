/**
 * MedicationsCard - Complete medications management
 * Features: Active/Past tabs, Add/Edit/Delete, context menus, dosage, frequency
 * Updated: Connected to 'medications' database with SearchableSelect
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect, SelectOption } from '@/components/ui/searchable-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// ... rest of imports
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Pill, Loader2, MoreVertical, Pencil, Trash2, Clock, Calendar, AlertCircle, CheckCircle, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { DocumentUploadDialog } from '@/components/patient/DocumentUploadDialog';
import { useWindowManager } from '@/contexts/WindowManagerContext';
import AppWindow from '../AppWindow';

interface MedicationsCardProps {
    patientId: string;
}

interface Medication {
    id: string;
    medication_id: string;
    medication_name?: string; // Derived from join
    dosage: string | null;
    frequency: string | null;
    start_date: string | null;
    end_date?: string | null;
    prescribing_doctor?: string | null;
    notes?: string | null;
    is_active: boolean;
    medications?: { name: string }; // Join result
}

const FREQUENCIES = [
    { value: 'once_daily', label: '1x/jour' },
    { value: 'twice_daily', label: '2x/jour' },
    { value: 'three_daily', label: '3x/jour' },
    { value: 'four_daily', label: '4x/jour' },
    { value: 'every_8h', label: 'Toutes les 8h' },
    { value: 'every_12h', label: 'Toutes les 12h' },
    { value: 'as_needed', label: 'Si besoin' },
    { value: 'weekly', label: '1x/semaine' },
    { value: 'monthly', label: '1x/mois' },
];

const ROUTES = [
    { value: 'oral', label: 'Oral' },
    { value: 'sublingual', label: 'Sublingual' },
    { value: 'iv', label: 'Intraveineux' },
    { value: 'im', label: 'Intramusculaire' },
    { value: 'sc', label: 'Sous-cutané' },
    { value: 'topical', label: 'Cutané' },
    { value: 'inhaled', label: 'Inhalé' },
    { value: 'rectal', label: 'Rectal' },
    { value: 'ophthalmic', label: 'Ophtalmique' },
];



const MedicationsCard = ({ patientId }: MedicationsCardProps) => {
    const { maxZIndex } = useWindowManager();
    const [medications, setMedications] = useState<Medication[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingMed, setEditingMed] = useState<Medication | null>(null);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('active');
    const [importDialogOpen, setImportDialogOpen] = useState(false);

    // Database medications for autocomplete
    const [medicationOptions, setMedicationOptions] = useState<SelectOption[]>([]);
    const [medicationsLoading, setMedicationsLoading] = useState(false);

    const [customMedName, setCustomMedName] = useState('');

    const [formData, setFormData] = useState({
        medication_name: '',
        dosage: '',
        frequency: 'once_daily',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        prescribing_doctor: '',
        notes: '',
        is_active: true,
    });

    const fetchMedicationList = useCallback(async () => {
        setMedicationsLoading(true);
        try {
            const { data } = await supabase
                .from('medications')
                .select('id, name, dosage_forms, composition')
                .limit(2000); // Reasonable limit for client-side search

            if (data) {
                const options: SelectOption[] = data.map(m => ({
                    value: m.id, // Use ID as value
                    label: m.name,
                    description: m.composition || undefined,
                    category: 'Base de données'
                }));
                // Add custom option
                options.push({
                    value: '__custom__',
                    label: 'Autre médicament...',
                    description: 'Saisir manuellement',
                    category: 'Autre'
                });
                setMedicationOptions(options);
            }
        } catch (error) {
            console.error('Error fetching medications:', error);
            // Fallback options if DB fails
            setMedicationOptions([
                { value: '__custom__', label: 'Autre médicament...', category: 'Autre' }
            ]);
        } finally {
            setMedicationsLoading(false);
        }
    }, []);

    const handleMedicationSearch = useCallback(async (query: string) => {
        if (query.length < 3) return;

        try {
            // 1. Search Local DB
            const localPromise = supabase
                .from('medications')
                .select('id, name, composition')
                .ilike('name', `%${query}%`)
                .limit(20);

            // 2. Search External (Edge Function)
            const externalPromise = supabase.functions.invoke('search-medical-concepts', {
                body: { query, type: 'medication' }
            });

            const [localRes, externalRes] = await Promise.all([localPromise, externalPromise]);

            let newOptions: SelectOption[] = [];

            // Process Local Results
            if (localRes.data) {
                newOptions = localRes.data.map(m => ({
                    value: m.id,
                    label: m.name,
                    description: m.composition || undefined,
                    category: 'Base de données'
                }));
            }

            // Process External Results
            const extData = externalRes.data;
            if (extData?.concepts) {
                const globalOptions: SelectOption[] = extData.concepts.map((item: any) => ({
                    value: item.id || `glb-${Math.random().toString(36).substr(2, 9)}`,
                    label: item.name,
                    description: item.source === 'ncbi_pccompound' ? 'NCBI Global' : item.description,
                    category: 'Monde'
                }));
                newOptions = [...newOptions, ...globalOptions];
            }

            // Merge with existing options avoiding duplicates
            setMedicationOptions(prev => {
                const existingValues = new Set(prev.map(p => p.value));
                const existingLabels = new Set(prev.map(p => p.label.toLowerCase()));

                const filteredNew = newOptions.filter(o =>
                    !existingValues.has(o.value) &&
                    !existingLabels.has(o.label.toLowerCase())
                );
                return [...prev, ...filteredNew];
            });

        } catch (err) {
            console.error('Medication search error:', err);
        }
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('patient_medications')
            .select('*, medications(name)')
            .eq('patient_id', patientId)
            .order('start_date', { ascending: false });

        if (error) {
            console.error('Error fetching patient medications:', error);
            toast.error('Erreur chargement traitements');
        } else {
            // Map the joined name to flat property for easier display
            const mappedData = data?.map((d: unknown) => {
                const item = d as { medications?: { name: string } };
                return {
                    ...(d as object),
                    medication_name: item.medications?.name || 'Inconnu'
                };
            }) || [];
            setMedications((mappedData as unknown as Medication[]) || []);
        }
        setLoading(false);
    }, [patientId]);

    useEffect(() => {
        fetchData();
        // fetchMedicationList(); // Disabled to prevent mock data clutter
    }, [fetchData]);

    const activeMeds = medications.filter(m => m.is_active);
    const pastMeds = medications.filter(m => !m.is_active);

    const openAddDialog = () => {
        setEditingMed(null);
        setFormData({
            medication_name: '',
            dosage: '',
            frequency: 'once_daily',
            start_date: new Date().toISOString().split('T')[0],
            end_date: '',
            prescribing_doctor: '',
            notes: '',
            is_active: true,
        });
        setDialogOpen(true);
    };

    const openEditDialog = (med: Medication) => {
        setEditingMed(med);

        // Check if medication is in loaded options, if not trigger custom/manual mode logic
        // or strictly rely on ID if we believe options cover it. 
        // For safety, if ID matches an option, use it. Else use custom mode to show name.
        const isKnownOption = medicationOptions.some(o => o.value === med.medication_id);

        setFormData({
            medication_name: isKnownOption ? med.medication_id : '__custom__',
            dosage: med.dosage || '',
            frequency: med.frequency || 'once_daily',
            start_date: med.start_date || '',
            end_date: med.end_date || '',
            prescribing_doctor: med.prescribing_doctor || '',
            notes: med.notes || '',
            is_active: med.is_active,
        });

        if (!isKnownOption) {
            setCustomMedName(med.medication_name || '');
        } else {
            setCustomMedName('');
        }

        setDialogOpen(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            let medId = formData.medication_name;
            let finalMedName = '';

            // 1. Handle Custom Entry
            if (medId === '__custom__') {
                if (!customMedName.trim()) {
                    toast.error('Veuillez saisir le nom du médicament');
                    setSaving(false);
                    return;
                }
                finalMedName = customMedName.trim();

                // Find or Create Custom Medication
                const { data: existing } = await supabase
                    .from('medications')
                    .select('id')
                    .ilike('name', finalMedName)
                    .maybeSingle();

                if (existing) {
                    medId = existing.id;
                } else {
                    const { data: newMed, error: createError } = await supabase
                        .from('medications')
                        .insert({ name: finalMedName, origin: 'custom' })
                        .select('id')
                        .single();
                    if (createError) throw createError;
                    medId = newMed.id;
                }
            }
            // 2. Handle Selection (Global or Local)
            else {
                const selectedOption = medicationOptions.find(o => o.value === medId);

                if (selectedOption && selectedOption.category === 'Monde') {
                    // Import Global Option -> Local DB
                    // Check if exists by name first to avoid duplicates
                    const { data: existing } = await supabase
                        .from('medications')
                        .select('id')
                        .ilike('name', selectedOption.label)
                        .maybeSingle();

                    if (existing) {
                        medId = existing.id;
                    } else {
                        const { data: newMed, error: createError } = await supabase
                            .from('medications')
                            .insert({
                                name: selectedOption.label,
                                composition: selectedOption.description,
                                origin: 'external_search'
                            })
                            .select('id')
                            .single();
                        if (createError) throw createError;
                        medId = newMed.id;
                    }
                }
            }

            // Prepare payload
            const payload = {
                patient_id: patientId,
                medication_id: medId,
                dosage: formData.dosage || null,
                frequency: formData.frequency || null,
                start_date: formData.start_date || null,
                end_date: formData.end_date || null,
                prescribed_by: formData.prescribing_doctor || null,
                notes: formData.notes || null,
                is_active: formData.is_active
            };

            if (editingMed) {
                await supabase
                    .from('patient_medications')
                    .update(payload)
                    .eq('id', editingMed.id);
                toast.success('Traitement mis à jour');
            } else {
                await supabase
                    .from('patient_medications')
                    .insert(payload);
                toast.success('Traitement ajouté');
            }
            setDialogOpen(false);
            setCustomMedName(''); // Reset
            fetchData();
        } catch (error: unknown) {
            const err = error as { message?: string };
            console.error('Save error:', err);
            toast.error('Erreur lors de la sauvegarde: ' + (err.message || 'Unknown'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await supabase.from('patient_medications').delete().eq('id', id);
            toast.success('Traitement supprimé');
            fetchData();
        } catch (error) {
            toast.error('Erreur');
        }
    };

    const toggleActive = async (med: Medication) => {
        try {
            await supabase
                .from('patient_medications')
                .update({
                    is_active: !med.is_active,
                    end_date: !med.is_active ? null : new Date().toISOString().split('T')[0]
                })
                .eq('id', med.id);
            toast.success(med.is_active ? 'Traitement arrêté' : 'Traitement repris');
            fetchData();
        } catch (error) {
            toast.error('Erreur');
        }
    };

    const renderMedicationItem = (med: Medication) => (
        <div
            key={med.id}
            className={`p-3 rounded-lg border ${med.is_active ? 'bg-green-500/5 border-green-500/20' : 'bg-muted/50 border-border/50 opacity-70'}`}
        >
            <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${med.is_active ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}`}>
                    <Pill className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{med.medication_name}</div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-2 mt-1">
                        {med.dosage && <span>{med.dosage}</span>}
                        {med.frequency && (
                            <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {FREQUENCIES.find(f => f.value === med.frequency)?.label || med.frequency}
                            </span>
                        )}
                    </div>
                    {med.start_date && (
                        <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Depuis {format(new Date(med.start_date), 'dd/MM/yyyy', { locale: fr })}
                            {med.end_date && ` - jusqu'au ${format(new Date(med.end_date), 'dd/MM/yyyy', { locale: fr })}`}
                        </div>
                    )}
                </div>
                <Badge variant={med.is_active ? 'default' : 'secondary'} className="text-[10px]">
                    {med.is_active ? 'Actif' : 'Terminé'}
                </Badge>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(med)}>
                            <Pencil className="h-4 w-4 mr-2" />Modifier
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleActive(med)}>
                            {med.is_active ? (
                                <><AlertCircle className="h-4 w-4 mr-2" />Arrêter</>
                            ) : (
                                <><CheckCircle className="h-4 w-4 mr-2" />Reprendre</>
                            )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(med.id)}>
                            <Trash2 className="h-4 w-4 mr-2" />Supprimer
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{activeMeds.length} traitement(s) actif(s)</span>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setImportDialogOpen(true)} className="gap-2">
                        <Upload className="h-3 w-3" />
                        Importer
                    </Button>
                    <Button size="sm" variant="outline" onClick={openAddDialog}>
                        <Plus className="h-3 w-3 mr-1" />Ajouter
                    </Button>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="active">Actifs ({activeMeds.length})</TabsTrigger>
                    <TabsTrigger value="past">Historique ({pastMeds.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="active" className="space-y-2 mt-4">
                    {activeMeds.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground">
                            <Pill className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Aucun traitement actif</p>
                        </div>
                    ) : (
                        activeMeds.map(renderMedicationItem)
                    )}
                </TabsContent>
                <TabsContent value="past" className="space-y-2 mt-4">
                    {pastMeds.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground">
                            <p>Aucun traitement passé</p>
                        </div>
                    ) : (
                        pastMeds.map(renderMedicationItem)
                    )}
                </TabsContent>
            </Tabs>

            {dialogOpen && (
                <AppWindow
                    id={`med-form-${patientId}`}
                    title={editingMed ? 'Modifier le traitement' : 'Ajouter un traitement'}
                    onClose={() => setDialogOpen(false)}
                    zIndex={maxZIndex + 10}
                    defaultSize={{ width: 500, height: 650 }}
                >
                    <div className="space-y-6">
                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <Label>Médicament *</Label>
                                <SearchableSelect
                                    options={medicationOptions}
                                    value={formData.medication_name}
                                    onValueChange={(value) => {
                                        setFormData({ ...formData, medication_name: value });
                                        if (value !== '__custom__') setCustomMedName('');
                                    }}
                                    onSearch={handleMedicationSearch}
                                    placeholder="Rechercher un médicament..."
                                    searchPlaceholder="Tapez min. 3 lettres pour chercher..."
                                    loading={medicationsLoading}
                                />
                                {formData.medication_name === '__custom__' && (
                                    <Input
                                        placeholder="Nom du médicament..."
                                        className="mt-2"
                                        value={customMedName}
                                        onChange={(e) => setCustomMedName(e.target.value)}
                                        autoFocus
                                    />
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Posologie</Label>
                                    <Input
                                        placeholder="ex: 1 comprimé"
                                        value={formData.dosage}
                                        onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Fréquence</Label>
                                    <Select value={formData.frequency} onValueChange={(v) => setFormData({ ...formData, frequency: v })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {FREQUENCIES.map((f) => (
                                                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Date de début</Label>
                                    <Input
                                        type="date"
                                        value={formData.start_date}
                                        onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Date de fin (optionnel)</Label>
                                    <Input
                                        type="date"
                                        value={formData.end_date}
                                        onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Médecin prescripteur</Label>
                                <Input
                                    placeholder="Dr..."
                                    value={formData.prescribing_doctor}
                                    onChange={(e) => setFormData({ ...formData, prescribing_doctor: e.target.value })}
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="is_active"
                                    checked={formData.is_active}
                                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: !!checked })}
                                />
                                <Label htmlFor="is_active">Traitement actif</Label>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t border-border/10">
                            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
                            <Button onClick={handleSave} disabled={saving}>
                                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {editingMed ? 'Mettre à jour' : 'Ajouter'}
                            </Button>
                        </div>
                    </div>
                </AppWindow>
            )}

            <DocumentUploadDialog
                open={importDialogOpen}
                onOpenChange={setImportDialogOpen}
                patientId={patientId}
                category="medications"
                onUploadComplete={() => {
                    toast.success('Document analysé, rechargement des traitements...');
                    fetchData();
                }}
            />
        </div>
    );
};

export default MedicationsCard;
