/**
 * DentalCard - Dental health tracking
 * Features: Dental procedures, checkups, treatments
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
import { Plus, Smile, Loader2, MoreVertical, Pencil, Trash2, Calendar, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format, isPast, differenceInMonths, addMonths } from 'date-fns';
import { fr } from 'date-fns/locale';

interface DentalCardProps {
    patientId: string;
}

interface DentalEntry {
    id: string;
    entry_date: string;
    entry_type: string;
    procedure?: string;
    tooth_numbers?: string;
    dentist_name?: string;
    facility?: string;
    next_appointment?: string;
    notes?: string;
}

const ENTRY_TYPES = [
    { value: 'checkup', label: 'Contrôle' },
    { value: 'cleaning', label: 'Détartrage' },
    { value: 'filling', label: 'Obturation (carie)' },
    { value: 'extraction', label: 'Extraction' },
    { value: 'root_canal', label: 'Dévitalisation' },
    { value: 'crown', label: 'Couronne' },
    { value: 'implant', label: 'Implant' },
    { value: 'bridge', label: 'Bridge' },
    { value: 'denture', label: 'Prothèse' },
    { value: 'orthodontics', label: 'Orthodontie' },
    { value: 'wisdom_teeth', label: 'Dents de sagesse' },
    { value: 'gum_treatment', label: 'Traitement gencives' },
    { value: 'whitening', label: 'Blanchiment' },
    { value: 'xray', label: 'Radiographie' },
];

const DentalCard = ({ patientId }: DentalCardProps) => {
    const [entries, setEntries] = useState<DentalEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<DentalEntry | null>(null);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        entry_date: new Date().toISOString().split('T')[0],
        entry_type: 'checkup',
        procedure: '',
        tooth_numbers: '',
        dentist_name: '',
        facility: '',
        next_appointment: '',
        notes: '',
    });

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('patient_dental')
            .select('*')
            .eq('patient_id', patientId)
            .order('entry_date', { ascending: false });
        setEntries(data || []);
        setLoading(false);
    };

    const openAddDialog = () => {
        setEditing(null);
        const nextAppt = format(addMonths(new Date(), 6), 'yyyy-MM-dd');
        setFormData({
            entry_date: new Date().toISOString().split('T')[0],
            entry_type: 'checkup',
            procedure: '',
            tooth_numbers: '',
            dentist_name: '',
            facility: '',
            next_appointment: nextAppt,
            notes: '',
        });
        setDialogOpen(true);
    };

    const openEditDialog = (item: DentalEntry) => {
        setEditing(item);
        setFormData({
            entry_date: item.entry_date || '',
            entry_type: item.entry_type,
            procedure: item.procedure || '',
            tooth_numbers: item.tooth_numbers || '',
            dentist_name: item.dentist_name || '',
            facility: item.facility || '',
            next_appointment: item.next_appointment || '',
            notes: item.notes || '',
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (editing) {
                await supabase.from('patient_dental').update(formData).eq('id', editing.id);
                toast.success('Entrée mise à jour');
            } else {
                await supabase.from('patient_dental').insert({ ...formData, patient_id: patientId });
                toast.success('Entrée ajoutée');
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
            await supabase.from('patient_dental').delete().eq('id', id);
            toast.success('Entrée supprimée');
            fetchData();
        } catch (error) {
            toast.error('Erreur');
        }
    };

    // Find last checkup and next appointment
    const lastCheckup = entries.find(e => e.entry_type === 'checkup');
    const upcomingAppts = entries.filter(e => e.next_appointment && !isPast(new Date(e.next_appointment)));
    const overdueAppts = entries.filter(e => e.next_appointment && isPast(new Date(e.next_appointment)));

    // Check if overdue for checkup (>12 months)
    const needsCheckup = !lastCheckup || differenceInMonths(new Date(), new Date(lastCheckup.entry_date)) > 12;

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{entries.length} entrée(s)</span>
                <Button size="sm" variant="outline" onClick={openAddDialog}>
                    <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
            </div>

            {/* Alerts */}
            {needsCheckup && (
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                    <div className="flex items-center gap-2 text-orange-500 text-sm font-medium">
                        <AlertTriangle className="h-4 w-4" />
                        Contrôle dentaire recommandé
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                        {lastCheckup
                            ? `Dernier contrôle il y a ${differenceInMonths(new Date(), new Date(lastCheckup.entry_date))} mois`
                            : 'Aucun contrôle enregistré'
                        }
                    </div>
                </div>
            )}

            {upcomingAppts.length > 0 && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                    <div className="flex items-center gap-2 text-blue-500 text-sm font-medium">
                        <Clock className="h-4 w-4" />
                        Prochain RDV
                    </div>
                    <div className="text-xs mt-1">
                        {format(new Date(upcomingAppts[0].next_appointment!), 'dd MMMM yyyy', { locale: fr })}
                    </div>
                </div>
            )}

            {entries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <Smile className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Aucun historique dentaire</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {entries.map((entry) => (
                        <div key={entry.id} className="p-3 rounded-lg border bg-card">
                            <div className="flex items-start gap-3">
                                <div className="p-2 rounded-lg bg-sky-500/10 text-sky-500">
                                    <Smile className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm">
                                        {ENTRY_TYPES.find(t => t.value === entry.entry_type)?.label || entry.entry_type}
                                    </div>
                                    {entry.tooth_numbers && (
                                        <div className="text-xs text-muted-foreground">Dents: {entry.tooth_numbers}</div>
                                    )}
                                    <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2">
                                        <Calendar className="h-3 w-3" />
                                        {format(new Date(entry.entry_date), 'dd/MM/yyyy', { locale: fr })}
                                        {entry.dentist_name && <span>• Dr {entry.dentist_name}</span>}
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
                        </div>
                    ))}
                </div>
            )}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Modifier' : 'Nouveau soin dentaire'}</DialogTitle>
                        <DialogDescription>Historique dentaire</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Type</Label>
                                <Select value={formData.entry_type} onValueChange={(v) => setFormData({ ...formData, entry_type: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {ENTRY_TYPES.map((t) => (
                                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Date</Label>
                                <Input type="date" value={formData.entry_date} onChange={(e) => setFormData({ ...formData, entry_date: e.target.value })} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>N° dent(s) concernée(s)</Label>
                            <Input placeholder="Ex: 16, 17, 26" value={formData.tooth_numbers} onChange={(e) => setFormData({ ...formData, tooth_numbers: e.target.value })} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Dentiste</Label>
                                <Input placeholder="Dr..." value={formData.dentist_name} onChange={(e) => setFormData({ ...formData, dentist_name: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Cabinet</Label>
                                <Input value={formData.facility} onChange={(e) => setFormData({ ...formData, facility: e.target.value })} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Prochain RDV</Label>
                            <Input type="date" value={formData.next_appointment} onChange={(e) => setFormData({ ...formData, next_appointment: e.target.value })} />
                        </div>

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

export default DentalCard;
