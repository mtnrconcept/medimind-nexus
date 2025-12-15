/**
 * MonitoringCard - Patient monitoring and tracking
 * Features: Vital signs, medication adherence, symptoms, lifestyle tracking
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Plus, LineChart, Loader2, MoreVertical, Pencil, Trash2, Smartphone, Monitor, Activity, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface MonitoringCardProps {
    patientId: string;
}

interface MonitoringEntry {
    id: string;
    monitoring_date: string;
    monitoring_type: string;
    value?: number;
    value_unit?: string;
    secondary_value?: number;
    secondary_unit?: string;
    is_within_target?: boolean;
    source: string;
    device_name?: string;
    notes?: string;
}

const MONITORING_TYPES = [
    { value: 'blood_pressure', label: 'Tension artérielle', unit: 'mmHg' },
    { value: 'blood_glucose', label: 'Glycémie', unit: 'mg/dL' },
    { value: 'weight', label: 'Poids', unit: 'kg' },
    { value: 'temperature', label: 'Température', unit: '°C' },
    { value: 'heart_rate', label: 'Fréquence cardiaque', unit: 'bpm' },
    { value: 'oxygen', label: 'Saturation O2', unit: '%' },
    { value: 'activity', label: 'Activité physique', unit: 'pas' },
    { value: 'sleep', label: 'Sommeil', unit: 'heures' },
    { value: 'custom', label: 'Autre', unit: '' },
];

const SOURCES = [
    { value: 'self_reported', label: 'Déclaré par patient', icon: Activity },
    { value: 'device', label: 'Dispositif médical', icon: Monitor },
    { value: 'wearable', label: 'Objet connecté', icon: Smartphone },
    { value: 'clinical', label: 'Mesure clinique', icon: Activity },
];

const MonitoringCard = ({ patientId }: MonitoringCardProps) => {
    const [entries, setEntries] = useState<MonitoringEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<MonitoringEntry | null>(null);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        monitoring_date: new Date().toISOString().split('T')[0] + 'T12:00',
        monitoring_type: 'blood_pressure',
        value: '',
        value_unit: 'mmHg',
        secondary_value: '',
        secondary_unit: '',
        source: 'self_reported',
        device_name: '',
        notes: '',
    });

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('patient_monitoring')
            .select('*')
            .eq('patient_id', patientId)
            .order('monitoring_date', { ascending: false });
        setEntries(data || []);
        setLoading(false);
    };

    const openAddDialog = () => {
        setEditing(null);
        setFormData({
            monitoring_date: new Date().toISOString().split('T')[0] + 'T12:00',
            monitoring_type: 'blood_pressure',
            value: '',
            value_unit: 'mmHg',
            secondary_value: '',
            secondary_unit: '',
            source: 'self_reported',
            device_name: '',
            notes: '',
        });
        setDialogOpen(true);
    };

    const openEditDialog = (item: MonitoringEntry) => {
        setEditing(item);
        setFormData({
            monitoring_date: item.monitoring_date?.slice(0, 16) || '',
            monitoring_type: item.monitoring_type,
            value: item.value?.toString() || '',
            value_unit: item.value_unit || '',
            secondary_value: item.secondary_value?.toString() || '',
            secondary_unit: item.secondary_unit || '',
            source: item.source || 'self_reported',
            device_name: item.device_name || '',
            notes: item.notes || '',
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                ...formData,
                patient_id: patientId,
                value: formData.value ? parseFloat(formData.value) : null,
                secondary_value: formData.secondary_value ? parseFloat(formData.secondary_value) : null,
            };

            if (editing) {
                await supabase.from('patient_monitoring').update(payload).eq('id', editing.id);
                toast.success('Mesure mise à jour');
            } else {
                await supabase.from('patient_monitoring').insert(payload);
                toast.success('Mesure ajoutée');
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
            await supabase.from('patient_monitoring').delete().eq('id', id);
            toast.success('Mesure supprimée');
            fetchData();
        } catch (error) {
            toast.error('Erreur');
        }
    };

    const handleTypeChange = (value: string) => {
        const typeConfig = MONITORING_TYPES.find(t => t.value === value);
        setFormData({
            ...formData,
            monitoring_type: value,
            value_unit: typeConfig?.unit || '',
        });
    };

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{entries.length} mesure(s)</span>
                <Button size="sm" variant="outline" onClick={openAddDialog}>
                    <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
            </div>

            {entries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <LineChart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Aucune donnée de suivi</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {entries.map((entry) => {
                        const typeConfig = MONITORING_TYPES.find(t => t.value === entry.monitoring_type);
                        const sourceConfig = SOURCES.find(s => s.value === entry.source);
                        const SourceIcon = sourceConfig?.icon || Activity;

                        return (
                            <div key={entry.id} className="p-3 rounded-lg border bg-card">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-500">
                                            <SourceIcon className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <div className="font-medium text-sm">
                                                {typeConfig?.label || entry.monitoring_type}
                                            </div>
                                            <div className="flex items-baseline gap-2 mt-1">
                                                <span className="text-lg font-bold">
                                                    {entry.value}
                                                    {entry.secondary_value && ` / ${entry.secondary_value}`}
                                                </span>
                                                <span className="text-xs text-muted-foreground">{entry.value_unit}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => openEditDialog(entry)}>
                                                <Pencil className="h-4 w-4 mr-2" />Modifier
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(entry.id)}>
                                                <Trash2 className="h-4 w-4 mr-2" />Supprimer
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                                <div className="mt-2 text-[10px] text-muted-foreground flex justify-between items-center">
                                    <span>
                                        {format(new Date(entry.monitoring_date), 'dd/MM/yyyy HH:mm', { locale: fr })}
                                    </span>
                                    {entry.device_name && (
                                        <Badge variant="outline" className="text-[10px] h-5">
                                            {entry.device_name}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Modifier' : 'Nouvelle mesure'}</DialogTitle>
                        <DialogDescription>Suivi et monitoring</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Type</Label>
                                <Select value={formData.monitoring_type} onValueChange={handleTypeChange}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {MONITORING_TYPES.map((t) => (
                                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Date et heure</Label>
                                <Input type="datetime-local" value={formData.monitoring_date} onChange={(e) => setFormData({ ...formData, monitoring_date: e.target.value })} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Valeur</Label>
                                <div className="flex gap-2">
                                    <Input type="number" step="0.01" value={formData.value} onChange={(e) => setFormData({ ...formData, value: e.target.value })} />
                                    <div className="flex items-center text-xs text-muted-foreground whitespace-nowrap">
                                        {formData.value_unit}
                                    </div>
                                </div>
                            </div>
                            {formData.monitoring_type === 'blood_pressure' && (
                                <div className="space-y-2">
                                    <Label>Diastolique</Label>
                                    <Input type="number" value={formData.secondary_value} onChange={(e) => setFormData({ ...formData, secondary_value: e.target.value })} />
                                </div>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label>Source</Label>
                            <Select value={formData.source} onValueChange={(v) => setFormData({ ...formData, source: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {SOURCES.map((s) => (
                                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {formData.source !== 'self_reported' && (
                            <div className="space-y-2">
                                <Label>Nom du dispositif</Label>
                                <Input placeholder="Ex: Apple Watch, Withings..." value={formData.device_name} onChange={(e) => setFormData({ ...formData, device_name: e.target.value })} />
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Notes</Label>
                            <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {editing ? 'Mettre à jour' : 'Ajouter'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default MonitoringCard;
