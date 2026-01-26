/**
 * AllergiesCard - Complete allergies and intolerances management
 * Features: Add/Edit/Delete, context menus, severity dropdown, type selection
 * Updated: Connected to medications database for drug allergies with SearchableSelect
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAI } from '@/contexts/AIContext';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Plus, AlertTriangle, Pill, Apple, Leaf, Hand, Loader2, MoreVertical, Pencil, Trash2, Check, Search, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { SearchableSelect, SelectOption } from '@/components/ui/searchable-select';
import { useWindowManager } from '@/contexts/WindowManagerContext';
import AppWindow from '../AppWindow';

interface AllergiesCardProps {
    patientId: string;
}

interface Allergy {
    id: string;
    allergen: string;
    allergy_type: string;
    severity: string;
    reaction?: string;
    onset_date?: string;
    confirmed: boolean;
}

interface NCBIConcept {
    id: string;
    name: string;
    description?: string;
}

const ALLERGY_TYPES = [
    { value: 'medication', label: 'Médicament', icon: Pill },
    { value: 'food', label: 'Alimentaire', icon: Apple },
    { value: 'environmental', label: 'Environnementale', icon: Leaf },
    { value: 'contact', label: 'Contact', icon: Hand },
    { value: 'other', label: 'Autre', icon: AlertTriangle },
];

const SEVERITY_OPTIONS = [
    { value: 'mild', label: 'Légère', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30' },
    { value: 'moderate', label: 'Modérée', color: 'bg-orange-500/10 text-orange-500 border-orange-500/30' },
    { value: 'severe', label: 'Sévère', color: 'bg-red-500/10 text-red-500 border-red-500/30' },
];

const COMMON_ALLERGENS = {
    medication: ['Pénicilline', 'Aspirine', 'Ibuprofène', 'Sulfamides', 'Codéine', 'Morphine', 'Latex', 'Produits de contraste iodés'],
    food: ['Arachides', 'Fruits à coque', 'Lait', 'Œufs', 'Blé/Gluten', 'Soja', 'Poisson', 'Crustacés', 'Sésame', 'Moutarde'],
    environmental: ['Pollen', 'Acariens', 'Poils de chat', 'Poils de chien', 'Moisissures', 'Poussière'],
    contact: ['Nickel', 'Latex', 'Parfums', 'Cosmétiques'],
    other: [],
};

const AllergiesCard = ({ patientId }: AllergiesCardProps) => {
    const { invokeAI } = useAI();
    const { maxZIndex } = useWindowManager();
    const [allergies, setAllergies] = useState<Allergy[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingAllergy, setEditingAllergy] = useState<Allergy | null>(null);
    const [saving, setSaving] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const handleSelectAll = (checked: boolean) => {
        if (checked) setSelectedIds(allergies.map(a => a.id));
        else setSelectedIds([]);
    };

    const handleSelect = (id: string, checked: boolean) => {
        if (checked) setSelectedIds(prev => [...prev, id]);
        else setSelectedIds(prev => prev.filter(i => i !== id));
    };

    const handleBulkDelete = async () => {
        if (!selectedIds.length) return;
        if (!window.confirm(`Supprimer ${selectedIds.length} allergies ?`)) return;

        try {
            const { error } = await supabase.from('patient_allergies').delete().in('id', selectedIds);
            if (error) throw error;
            toast.success(`${selectedIds.length} allergies supprimées`);
            setSelectedIds([]);
            fetchData();
        } catch (err) {
            console.error(err);
            toast.error('Erreur lors de la suppression multiple');
        }
    };

    // Form state
    const [formData, setFormData] = useState({
        allergen: '',
        allergy_type: 'medication',
        severity: 'moderate',
        reaction: '',
        onset_date: '',
        confirmed: true,
    });

    // Database options for medication allergens
    const [medicationOptions, setMedicationOptions] = useState<SelectOption[]>([]);
    const [medicationsLoading, setMedicationsLoading] = useState(false);
    const [customAllergen, setCustomAllergen] = useState('');

    // Callbacks for data fetching
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await supabase
                .from('patient_allergies')
                .select('*')
                .eq('patient_id', patientId)
                .order('created_at', { ascending: false });

            // Map DB columns to interface
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const mappedAllergies = (data || []).map((d: any) => ({
                ...d,
                allergy_type: d.allergen_type,
                confirmed: d.verified
            }));

            setAllergies(mappedAllergies as Allergy[]);
        } catch (err) {
            console.error('Error fetching allergies:', err);
        } finally {
            setLoading(false);
        }
    }, [patientId]);

    const fetchMedicationOptions = useCallback(async () => {
        setMedicationsLoading(true);
        try {
            // Fetch from medications table
            const { data: meds } = await supabase
                .from('medications')
                .select('id, name')
                .limit(100);

            const dbOptions: SelectOption[] = meds?.map(m => ({
                value: m.id,
                label: m.name,
                category: 'Base de données'
            })) || [];

            // Add common allergens from static list
            const commonOptions: SelectOption[] = COMMON_ALLERGENS.medication.map(a => ({
                value: `common-${a}`,
                label: a,
                category: 'Courants'
            }));

            // Custom option
            setMedicationOptions([
                ...commonOptions,
                ...dbOptions,
                { value: '__custom__', label: 'Autre allergène...', category: 'Autre' }
            ]);
        } catch (err) {
            console.error('Error fetching medications:', err);
        } finally {
            setMedicationsLoading(false);
        }
    }, []);

    const handleMedicationSearch = useCallback(async (query: string) => {
        if (query.length < 3) return;
        try {
            const { data } = await invokeAI('search-medical-concepts', {
                query, type: 'medication'
            });
            if (data?.concepts) {
                const newOptions: SelectOption[] = data.concepts.map((c: NCBIConcept) => ({
                    value: `ext-${c.id}`,
                    label: c.name,
                    description: c.description,
                    category: 'NCBI'
                }));
                setMedicationOptions(prev => {
                    const existingLabels = new Set(prev.map(p => p.label.toLowerCase()));
                    const filtered = newOptions.filter(o => !existingLabels.has(o.label.toLowerCase()));
                    return [...prev, ...filtered];
                });
            }
        } catch (err) {
            console.error('Medication search error:', err);
        }
    }, []);

    useEffect(() => {
        fetchData();
        fetchMedicationOptions();
    }, [fetchData, fetchMedicationOptions]);

    const openAddDialog = () => {
        setEditingAllergy(null);
        setFormData({
            allergen: '',
            allergy_type: 'medication',
            severity: 'moderate',
            reaction: '',
            onset_date: '',
            confirmed: true,
        });
        setCustomAllergen('');
        setDialogOpen(true);
    };

    const openEditDialog = (allergy: Allergy) => {
        setEditingAllergy(allergy);
        setFormData({
            allergen: allergy.allergen,
            allergy_type: allergy.allergy_type,
            severity: allergy.severity,
            reaction: allergy.reaction || '',
            onset_date: allergy.onset_date || '',
            confirmed: allergy.confirmed ?? true,
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        let allergenName = formData.allergen;

        // Handle custom allergen
        if (allergenName === '__custom__') {
            if (!customAllergen.trim()) {
                toast.error('Veuillez saisir un allergène');
                return;
            }
            allergenName = customAllergen;
        } else if (allergenName && (allergenName.startsWith('ext-') || allergenName.startsWith('common-'))) {
            // External or common options - get the label
            const option = medicationOptions.find(o => o.value === allergenName);
            if (option) allergenName = option.label;
        } else if (allergenName) {
            // It's a database ID, get the label
            const option = medicationOptions.find(o => o.value === allergenName);
            if (option) allergenName = option.label;
        }

        if (!allergenName || !allergenName.trim()) {
            toast.error('Veuillez saisir un allergène');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                patient_id: patientId,
                allergen: formData.allergen,
                allergen_type: formData.allergy_type,
                severity: formData.severity,
                reaction: formData.reaction,
                first_reaction_date: formData.onset_date || null,
                verified: formData.confirmed,
                notes: formData.notes
            };

            if (editingAllergy) {
                const { error } = await supabase
                    .from('patient_allergies')
                    .update(payload)
                    .eq('id', editingAllergy.id);
                if (error) throw error;
                toast.success('Allergie mise à jour');
            } else {
                const { error } = await supabase
                    .from('patient_allergies')
                    .insert(payload);
                if (error) throw error;
                toast.success('Allergie ajoutée');
            }
            setDialogOpen(false);
            setCustomAllergen('');
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
            await supabase.from('patient_allergies').delete().eq('id', id);
            toast.success('Allergie supprimée');
            fetchData();
        } catch (error) {
            toast.error('Erreur lors de la suppression');
        }
    };

    const toggleConfirmed = async (allergy: Allergy) => {
        try {
            await supabase
                .from('patient_allergies')
                .update({ confirmed: !allergy.confirmed })
                .eq('id', allergy.id);
            fetchData();
        } catch (error) {
            toast.error('Erreur');
        }
    };

    const getTypeIcon = (type: string) => {
        const config = ALLERGY_TYPES.find(t => t.value === type);
        if (config) {
            const Icon = config.icon;
            return <Icon className="h-4 w-4" />;
        }
        return <AlertTriangle className="h-4 w-4" />;
    };

    const getSeverityColor = (severity: string) => {
        return SEVERITY_OPTIONS.find(s => s.value === severity)?.color || 'bg-muted';
    };

    // Get options based on allergy type
    const getAllergenOptions = (): SelectOption[] => {
        if (formData.allergy_type === 'medication') {
            return medicationOptions;
        }
        // For other types, use static list
        const staticList = COMMON_ALLERGENS[formData.allergy_type as keyof typeof COMMON_ALLERGENS] || [];
        return [
            ...staticList.map(a => ({ value: a, label: a, category: 'Courants' })),
            { value: '__custom__', label: 'Autre (saisir)', category: 'Autre' }
        ];
    };

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{allergies.length} allergie(s)</span>
                <Button size="sm" variant="outline" onClick={openAddDialog}>
                    <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
            </div>

            {allergies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Aucune allergie connue</p>
                    <Button variant="link" size="sm" onClick={openAddDialog}>
                        Ajouter une allergie
                    </Button>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="flex items-center space-x-2 mb-2 p-2 bg-muted/20 rounded-lg justify-between">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="select-all-allergies"
                                checked={allergies.length > 0 && selectedIds.length === allergies.length}
                                onCheckedChange={(c) => handleSelectAll(c as boolean)}
                            />
                            <Label htmlFor="select-all-allergies" className="text-xs text-muted-foreground cursor-pointer">
                                Tout sélectionner
                            </Label>
                        </div>
                        {selectedIds.length > 0 && (
                            <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="h-7 text-xs">
                                <Trash2 className="h-3 w-3 mr-2" /> Supprimer ({selectedIds.length})
                            </Button>
                        )}
                    </div>

                    {allergies.map((allergy) => (
                        <div
                            key={allergy.id}
                            className={`p-3 rounded-lg border ${getSeverityColor(allergy.severity)} ${!allergy.confirmed ? 'opacity-60' : ''}`}
                        >
                            <div className="flex items-center gap-3">
                                <Checkbox
                                    checked={selectedIds.includes(allergy.id)}
                                    onCheckedChange={(c) => handleSelect(allergy.id, c as boolean)}
                                />
                                <div className="p-2 rounded-lg bg-background/50">
                                    {getTypeIcon(allergy.allergy_type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm flex items-center gap-2">
                                        {allergy.allergen}
                                        {!allergy.confirmed && (
                                            <Badge variant="outline" className="text-[10px]">Non confirmée</Badge>
                                        )}
                                    </div>
                                    {allergy.reaction && (
                                        <div className="text-xs text-muted-foreground mt-1 truncate">{allergy.reaction}</div>
                                    )}
                                </div>
                                <Badge variant="outline" className={getSeverityColor(allergy.severity)}>
                                    {SEVERITY_OPTIONS.find(s => s.value === allergy.severity)?.label || allergy.severity}
                                </Badge>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => openEditDialog(allergy)}>
                                            <Pencil className="h-4 w-4 mr-2" />Modifier
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => toggleConfirmed(allergy)}>
                                            <Check className="h-4 w-4 mr-2" />
                                            {allergy.confirmed ? 'Marquer non confirmée' : 'Confirmer'}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            className="text-destructive"
                                            onClick={() => handleDelete(allergy.id)}
                                        >
                                            <Trash2 className="h-4 w-4 mr-2" />Supprimer
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {dialogOpen && (
                <AppWindow
                    id={`allergy-form-${patientId}`}
                    title={editingAllergy ? 'Modifier l\'allergie' : 'Ajouter une allergie'}
                    onClose={() => setDialogOpen(false)}
                    zIndex={maxZIndex + 10}
                    defaultSize={{ width: 500, height: 600 }}
                >
                    <div className="space-y-6">
                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <Label>Type d'allergie</Label>
                                <Select
                                    value={formData.allergy_type}
                                    onValueChange={(value) => setFormData({ ...formData, allergy_type: value, allergen: '' })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {ALLERGY_TYPES.map((type) => (
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
                                <Label>Allergène</Label>
                                {formData.allergy_type === 'medication' ? (
                                    <>
                                        <SearchableSelect
                                            options={medicationOptions}
                                            value={formData.allergen}
                                            onValueChange={(v) => {
                                                setFormData({ ...formData, allergen: v });
                                                if (v !== '__custom__') setCustomAllergen('');
                                            }}
                                            onSearch={handleMedicationSearch}
                                            placeholder="Sélectionner ou rechercher..."
                                            searchPlaceholder="Taper un médicament..."
                                            loading={medicationsLoading}
                                            externalSearch={true}
                                        />
                                        {formData.allergen === '__custom__' && (
                                            <Input
                                                className="mt-2"
                                                placeholder="Saisir l'allergène..."
                                                value={customAllergen}
                                                onChange={(e) => setCustomAllergen(e.target.value)}
                                            />
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <Select
                                            value={formData.allergen}
                                            onValueChange={(value) => setFormData({ ...formData, allergen: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Sélectionner ou saisir..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {getAllergenOptions().map((a) => (
                                                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {formData.allergen === '__custom__' && (
                                            <Input
                                                className="mt-2"
                                                placeholder="Saisir l'allergène..."
                                                value={customAllergen}
                                                onChange={(e) => setCustomAllergen(e.target.value)}
                                            />
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label>Sévérité</Label>
                                <Select
                                    value={formData.severity}
                                    onValueChange={(value) => setFormData({ ...formData, severity: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {SEVERITY_OPTIONS.map((sev) => (
                                            <SelectItem key={sev.value} value={sev.value}>
                                                <Badge className={sev.color}>{sev.label}</Badge>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Réaction</Label>
                                <Textarea
                                    placeholder="Décrivez la réaction allergique..."
                                    value={formData.reaction}
                                    onChange={(e) => setFormData({ ...formData, reaction: e.target.value })}
                                    rows={2}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Date de découverte (optionnel)</Label>
                                <Input
                                    type="date"
                                    value={formData.onset_date}
                                    onChange={(e) => setFormData({ ...formData, onset_date: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t border-border/10">
                            <Button variant="outline" onClick={() => setDialogOpen(false)}>
                                Annuler
                            </Button>
                            <Button onClick={handleSave} disabled={saving}>
                                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {editingAllergy ? 'Mettre à jour' : 'Ajouter'}
                            </Button>
                        </div>
                    </div>
                </AppWindow>
            )}
        </div>
    );
};

export default AllergiesCard;
