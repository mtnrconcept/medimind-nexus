/**
 * VaccinationsCard - Complete vaccination management
 * Features: Vaccination schedule, reminders, add/edit, lot tracking
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Plus, Syringe, Loader2, MoreVertical, Pencil, Trash2, Calendar, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format, isPast, addMonths, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useWindowManager } from '@/contexts/WindowManagerContext';
import AppWindow from '../AppWindow';

interface VaccinationsCardProps {
    patientId: string;
}

interface Vaccination {
    id: string;
    vaccine_name: string;
    dose_number: number;
    vaccination_date: string;
    next_dose_date?: string;
    lot_number?: string;
    administered_by?: string;
    site?: string;
    notes?: string;
}

const VACCINES = [
    { name: 'COVID-19 (Pfizer)', doses: 3, interval: 6 },
    { name: 'COVID-19 (Moderna)', doses: 3, interval: 6 },
    { name: 'Grippe saisonnière', doses: 1, interval: 12 },
    { name: 'DTP (Diphtérie-Tétanos-Polio)', doses: 4, interval: 120 },
    { name: 'ROR (Rougeole-Oreillons-Rubéole)', doses: 2, interval: 0 },
    { name: 'Hépatite B', doses: 3, interval: 0 },
    { name: 'Hépatite A', doses: 2, interval: 0 },
    { name: 'Pneumocoque', doses: 1, interval: 60 },
    { name: 'Zona', doses: 2, interval: 0 },
    { name: 'Méningocoque C', doses: 1, interval: 0 },
    { name: 'HPV (Papillomavirus)', doses: 3, interval: 0 },
    { name: 'BCG (Tuberculose)', doses: 1, interval: 0 },
    { name: 'Fièvre jaune', doses: 1, interval: 120 },
    { name: 'Typhoïde', doses: 1, interval: 36 },
];

const INJECTION_SITES = [
    { value: 'deltoid_left', label: 'Deltoïde gauche' },
    { value: 'deltoid_right', label: 'Deltoïde droit' },
    { value: 'thigh_left', label: 'Cuisse gauche' },
    { value: 'thigh_right', label: 'Cuisse droite' },
    { value: 'gluteal', label: 'Fessier' },
];

const VaccinationsCard = ({ patientId }: VaccinationsCardProps) => {
    const { maxZIndex } = useWindowManager();
    const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingVacc, setEditingVacc] = useState<Vaccination | null>(null);
    const [saving, setSaving] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            const uniqueIds: string[] = [];
            const seen = new Set<string>();
            // Select only the latest dose (visible one) for each unique vaccine
            // Assuming vaccinations is sorted desc
            vaccinations.forEach(v => {
                if (!seen.has(v.vaccine_name)) {
                    seen.add(v.vaccine_name);
                    uniqueIds.push(v.id);
                }
            });
            setSelectedIds(uniqueIds);
        } else {
            setSelectedIds([]);
        }
    };

    const handleSelect = (id: string, checked: boolean) => {
        if (checked) setSelectedIds(prev => [...prev, id]);
        else setSelectedIds(prev => prev.filter(i => i !== id));
    };

    const handleBulkDelete = async () => {
        if (!selectedIds.length) return;
        if (!window.confirm(`Supprimer ${selectedIds.length} vaccinations ?`)) return;

        try {
            const { error } = await supabase.from('patient_vaccinations').delete().in('id', selectedIds);
            if (error) throw error;
            toast.success(`${selectedIds.length} vaccinations supprimées`);
            setSelectedIds([]);
            fetchData();
        } catch (err) {
            console.error(err);
            toast.error('Erreur lors de la suppression multiple');
        }
    };

    const [formData, setFormData] = useState({
        vaccine_name: '',
        dose_number: 1,
        vaccination_date: new Date().toISOString().split('T')[0],
        next_dose_date: '',
        lot_number: '',
        administered_by: '',
        site: 'deltoid_left',
        notes: '',
    });

    const fetchData = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase
            .from('patient_vaccinations')
            .select('*')
            .eq('patient_id', patientId)
            .order('vaccination_date', { ascending: false });
        setVaccinations(data || []);
        setLoading(false);
    }, [patientId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const openAddDialog = () => {
        setEditingVacc(null);
        setFormData({
            vaccine_name: '',
            dose_number: 1,
            vaccination_date: new Date().toISOString().split('T')[0],
            next_dose_date: '',
            lot_number: '',
            administered_by: '',
            site: 'deltoid_left',
            notes: '',
        });
        setDialogOpen(true);
    };

    const openEditDialog = (vacc: Vaccination) => {
        setEditingVacc(vacc);
        setFormData({
            vaccine_name: vacc.vaccine_name,
            dose_number: vacc.dose_number || 1,
            vaccination_date: vacc.vaccination_date || '',
            next_dose_date: vacc.next_dose_date || '',
            lot_number: vacc.lot_number || '',
            administered_by: vacc.administered_by || '',
            site: vacc.site || 'deltoid_left',
            notes: vacc.notes || '',
        });
        setDialogOpen(true);
    };

    const handleVaccineSelect = (name: string) => {
        const vaccine = VACCINES.find(v => v.name === name);
        const nextDose = vaccine?.interval
            ? format(addMonths(new Date(formData.vaccination_date), vaccine.interval), 'yyyy-MM-dd')
            : '';
        setFormData({ ...formData, vaccine_name: name, next_dose_date: nextDose });
    };

    const handleSave = async () => {
        if (!formData.vaccine_name.trim()) {
            toast.error('Veuillez sélectionner un vaccin');
            return;
        }

        setSaving(true);
        try {
            if (editingVacc) {
                await supabase.from('patient_vaccinations').update(formData).eq('id', editingVacc.id);
                toast.success('Vaccination mise à jour');
            } else {
                await supabase.from('patient_vaccinations').insert({ ...formData, patient_id: patientId });
                toast.success('Vaccination ajoutée');
            }
            setDialogOpen(false);
            fetchData();
        } catch (error) {
            toast.error('Erreur lors de la sauvegarde');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await supabase.from('patient_vaccinations').delete().eq('id', id);
            toast.success('Vaccination supprimée');
            fetchData();
        } catch (error) {
            toast.error('Erreur');
        }
    };

    const getStatusBadge = (vacc: Vaccination) => {
        if (!vacc.next_dose_date) {
            return <Badge variant="secondary" className="text-[10px]">Complet</Badge>;
        }
        const nextDate = new Date(vacc.next_dose_date);
        const daysUntil = differenceInDays(nextDate, new Date());

        if (isPast(nextDate)) {
            return <Badge variant="destructive" className="text-[10px]">En retard</Badge>;
        }
        if (daysUntil <= 30) {
            return <Badge className="bg-orange-500/10 text-orange-500 text-[10px]">Bientôt</Badge>;
        }
        return <Badge className="bg-green-500/10 text-green-500 text-[10px]">À jour</Badge>;
    };

    // Group by vaccine
    const vaccineGroups = vaccinations.reduce((acc, v) => {
        if (!acc[v.vaccine_name]) acc[v.vaccine_name] = [];
        acc[v.vaccine_name].push(v);
        return acc;
    }, {} as Record<string, Vaccination[]>);

    // Pending reminders
    const pendingReminders = vaccinations.filter(v =>
        v.next_dose_date && (isPast(new Date(v.next_dose_date)) || differenceInDays(new Date(v.next_dose_date), new Date()) <= 60)
    );

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{vaccinations.length} vaccination(s)</span>
                <Button size="sm" variant="outline" onClick={openAddDialog}>
                    <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
            </div>

            {/* Reminders */}
            {pendingReminders.length > 0 && (
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                    <div className="flex items-center gap-2 text-orange-500 text-sm font-medium mb-2">
                        <AlertTriangle className="h-4 w-4" />
                        Rappels ({pendingReminders.length})
                    </div>
                    <div className="space-y-1">
                        {pendingReminders.slice(0, 3).map(v => (
                            <div key={v.id} className="text-xs flex items-center justify-between">
                                <span>{v.vaccine_name} - Dose {(v.dose_number || 0) + 1}</span>
                                <span className={isPast(new Date(v.next_dose_date!)) ? 'text-red-500' : 'text-orange-500'}>
                                    {format(new Date(v.next_dose_date!), 'dd/MM/yyyy', { locale: fr })}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Vaccination list */}
            {vaccinations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <Syringe className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Aucune vaccination enregistrée</p>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="flex items-center space-x-2 mb-2 p-2 bg-muted/20 rounded-lg justify-between">
                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="select-all-vax"
                                // Crude approximation for isAllSelected: if selected count matches visible count (group count)
                                checked={Object.keys(vaccineGroups).length > 0 && selectedIds.length === Object.keys(vaccineGroups).length}
                                onCheckedChange={(c) => handleSelectAll(c as boolean)}
                            />
                            <Label htmlFor="select-all-vax" className="text-xs text-muted-foreground cursor-pointer">
                                Tout sélectionner
                            </Label>
                        </div>
                        {selectedIds.length > 0 && (
                            <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="h-7 text-xs">
                                <Trash2 className="h-3 w-3 mr-2" /> Supprimer ({selectedIds.length})
                            </Button>
                        )}
                    </div>

                    {Object.entries(vaccineGroups).map(([name, doses]) => {
                        const latestDose = doses[0];
                        return (
                            <div key={name} className="p-3 rounded-lg border bg-card">
                                <div className="flex items-start gap-3">
                                    <Checkbox
                                        className="mt-1"
                                        checked={selectedIds.includes(latestDose.id)}
                                        onCheckedChange={(c) => handleSelect(latestDose.id, c as boolean)}
                                    />
                                    <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500">
                                        <Syringe className="h-4 w-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm flex items-center gap-2">
                                            {name}
                                            {getStatusBadge(latestDose)}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                                            <span>Dose {latestDose.dose_number || 1}/{VACCINES.find(v => v.name === name)?.doses || '?'}</span>
                                            <span>•</span>
                                            <span className="flex items-center gap-1">
                                                <Calendar className="h-3 w-3" />
                                                {format(new Date(latestDose.vaccination_date), 'dd/MM/yyyy', { locale: fr })}
                                            </span>
                                        </div>
                                        {latestDose.next_dose_date && (
                                            <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                Prochaine dose: {format(new Date(latestDose.next_dose_date), 'dd/MM/yyyy', { locale: fr })}
                                            </div>
                                        )}
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => openEditDialog(latestDose)}>
                                                <Pencil className="h-4 w-4 mr-2" />Modifier
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => {
                                                setFormData({
                                                    ...formData,
                                                    vaccine_name: name,
                                                    dose_number: (latestDose.dose_number || 1) + 1,
                                                });
                                                setEditingVacc(null);
                                                setDialogOpen(true);
                                            }}>
                                                <Plus className="h-4 w-4 mr-2" />Ajouter dose
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(latestDose.id)}>
                                                <Trash2 className="h-4 w-4 mr-2" />Supprimer
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {dialogOpen && (
                <AppWindow
                    id={`vacc-form-${patientId}`}
                    title={editingVacc ? 'Modifier la vaccination' : 'Ajouter une vaccination'}
                    onClose={() => setDialogOpen(false)}
                    zIndex={maxZIndex + 10}
                    defaultSize={{ width: 500, height: 600 }}
                >
                    <div className="space-y-6">
                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <Label>Vaccin *</Label>
                                <Select value={formData.vaccine_name} onValueChange={handleVaccineSelect}>
                                    <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                                    <SelectContent>
                                        {VACCINES.map((v) => (
                                            <SelectItem key={v.name} value={v.name}>{v.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Dose n°</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        value={formData.dose_number}
                                        onChange={(e) => setFormData({ ...formData, dose_number: parseInt(e.target.value) || 1 })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Date d'administration *</Label>
                                    <Input
                                        type="date"
                                        value={formData.vaccination_date}
                                        onChange={(e) => setFormData({ ...formData, vaccination_date: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Prochaine dose prévue</Label>
                                <Input
                                    type="date"
                                    value={formData.next_dose_date}
                                    onChange={(e) => setFormData({ ...formData, next_dose_date: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>N° de lot</Label>
                                    <Input
                                        placeholder="ABC123..."
                                        value={formData.lot_number}
                                        onChange={(e) => setFormData({ ...formData, lot_number: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Site d'injection</Label>
                                    <Select value={formData.site} onValueChange={(v) => setFormData({ ...formData, site: v })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {INJECTION_SITES.map((s) => (
                                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Administré par</Label>
                                <Input
                                    placeholder="Dr / Infirmier..."
                                    value={formData.administered_by}
                                    onChange={(e) => setFormData({ ...formData, administered_by: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t border-border/10">
                            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
                            <Button onClick={handleSave} disabled={saving}>
                                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {editingVacc ? 'Mettre à jour' : 'Ajouter'}
                            </Button>
                        </div>
                    </div>
                </AppWindow>
            )}
        </div>
    );
};

export default VaccinationsCard;
