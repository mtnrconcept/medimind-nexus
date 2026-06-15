/**
 * PreventionCard - Preventive screenings and checkups management
 * Features: Screening types, schedules, reminders, results
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
import { Plus, Shield, Loader2, MoreVertical, Pencil, Trash2, Calendar, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format, isPast, differenceInMonths, addYears } from 'date-fns';
import { fr } from 'date-fns/locale';

interface PreventionCardProps {
    patientId: string;
}

interface Prevention {
    id: string;
    screening_type: string;
    last_screening_date: string;
    next_screening_date?: string;
    result?: string;
    is_normal: boolean;
    frequency_months: number;
    notes?: string;
}

const SCREENING_TYPES = [
    { value: 'mammography', label: 'Mammographie', frequency: 24, gender: 'F', ageMin: 50, ageMax: 74 },
    { value: 'pap_smear', label: 'Frottis cervical', frequency: 36, gender: 'F', ageMin: 25, ageMax: 65 },
    { value: 'colonoscopy', label: 'Coloscopie', frequency: 60, gender: 'all', ageMin: 50, ageMax: 74 },
    { value: 'colorectal_test', label: 'Test colorectal (FIT)', frequency: 24, gender: 'all', ageMin: 50, ageMax: 74 },
    { value: 'psa', label: 'PSA (prostate)', frequency: 12, gender: 'M', ageMin: 50, ageMax: 75 },
    { value: 'eye_exam', label: 'Examen ophtalmologique', frequency: 24, gender: 'all', ageMin: 40, ageMax: 100 },
    { value: 'hearing', label: 'Audiogramme', frequency: 60, gender: 'all', ageMin: 50, ageMax: 100 },
    { value: 'bone_density', label: 'Ostéodensitométrie', frequency: 24, gender: 'F', ageMin: 60, ageMax: 100 },
    { value: 'skin_check', label: 'Examen dermatologique', frequency: 12, gender: 'all', ageMin: 30, ageMax: 100 },
    { value: 'dental', label: 'Contrôle dentaire', frequency: 12, gender: 'all', ageMin: 0, ageMax: 100 },
    { value: 'cardiac_checkup', label: 'Bilan cardiaque', frequency: 24, gender: 'all', ageMin: 40, ageMax: 100 },
    { value: 'lipid_panel', label: 'Bilan lipidique', frequency: 12, gender: 'all', ageMin: 40, ageMax: 100 },
    { value: 'diabetes', label: 'Dépistage diabète', frequency: 36, gender: 'all', ageMin: 45, ageMax: 100 },
    { value: 'general_checkup', label: 'Bilan de santé général', frequency: 12, gender: 'all', ageMin: 18, ageMax: 100 },
];

const RESULTS = [
    { value: 'normal', label: 'Normal', color: 'bg-green-500/10 text-green-500' },
    { value: 'abnormal', label: 'Anormal', color: 'bg-red-500/10 text-red-500' },
    { value: 'follow_up', label: 'Surveillance', color: 'bg-yellow-500/10 text-yellow-500' },
    { value: 'pending', label: 'En attente', color: 'bg-blue-500/10 text-blue-500' },
];

const PreventionCard = ({ patientId }: PreventionCardProps) => {
    const [prevention, setPrevention] = useState<Prevention[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Prevention | null>(null);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        screening_type: 'general_checkup',
        last_screening_date: new Date().toISOString().split('T')[0],
        next_screening_date: '',
        result: 'normal',
        is_normal: true,
        frequency_months: 12,
        notes: '',
    });

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('patient_prevention')
            .select('*')
            .eq('patient_id', patientId)
            .order('next_screening_date', { ascending: true });
        setPrevention(data || []);
        setLoading(false);
    };

    const openAddDialog = () => {
        setEditing(null);
        const defaultType = SCREENING_TYPES[0];
        const nextDate = format(addYears(new Date(), defaultType.frequency / 12), 'yyyy-MM-dd');
        setFormData({
            screening_type: 'general_checkup',
            last_screening_date: new Date().toISOString().split('T')[0],
            next_screening_date: nextDate,
            result: 'normal',
            is_normal: true,
            frequency_months: 12,
            notes: '',
        });
        setDialogOpen(true);
    };

    const openEditDialog = (item: Prevention) => {
        setEditing(item);
        setFormData({
            screening_type: item.screening_type,
            last_screening_date: item.last_screening_date || '',
            next_screening_date: item.next_screening_date || '',
            result: item.result || 'normal',
            is_normal: item.is_normal,
            frequency_months: item.frequency_months || 12,
            notes: item.notes || '',
        });
        setDialogOpen(true);
    };

    const handleTypeChange = (type: string) => {
        const screening = SCREENING_TYPES.find(s => s.value === type);
        const freq = screening?.frequency || 12;
        const nextDate = format(addYears(new Date(formData.last_screening_date), freq / 12), 'yyyy-MM-dd');
        setFormData({ ...formData, screening_type: type, frequency_months: freq, next_screening_date: nextDate });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = { ...formData, is_normal: formData.result === 'normal' };
            if (editing) {
                await supabase.from('patient_prevention').update(payload).eq('id', editing.id);
                toast.success('Dépistage mis à jour');
            } else {
                await supabase.from('patient_prevention').insert({ ...payload, patient_id: patientId });
                toast.success('Dépistage ajouté');
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
            await supabase.from('patient_prevention').delete().eq('id', id);
            toast.success('Dépistage supprimé');
            fetchData();
        } catch (error) {
            toast.error('Erreur');
        }
    };

    const getStatus = (item: Prevention) => {
        if (!item.next_screening_date) return { label: 'Fait', color: 'bg-green-500/10 text-green-500' };
        const nextDate = new Date(item.next_screening_date);
        if (isPast(nextDate)) return { label: 'En retard', color: 'bg-red-500/10 text-red-500' };
        const monthsUntil = differenceInMonths(nextDate, new Date());
        if (monthsUntil <= 3) return { label: 'Bientôt', color: 'bg-orange-500/10 text-orange-500' };
        return { label: 'À jour', color: 'bg-green-500/10 text-green-500' };
    };

    const overdueCount = prevention.filter(p => p.next_screening_date && isPast(new Date(p.next_screening_date))).length;

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{prevention.length} dépistage(s)</span>
                <Button size="sm" variant="outline" onClick={openAddDialog}>
                    <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
            </div>

            {/* Overdue alert */}
            {overdueCount > 0 && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                    <div className="flex items-center gap-2 text-red-500 text-sm font-medium">
                        <AlertTriangle className="h-4 w-4" />
                        {overdueCount} dépistage(s) en retard
                    </div>
                </div>
            )}

            {prevention.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Aucun dépistage enregistré</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {prevention.map((item) => {
                        const status = getStatus(item);
                        return (
                            <div key={item.id} className={`p-3 rounded-lg border ${status.color.includes('red') ? 'bg-red-500/5 border-red-500/30' : 'bg-card'}`}>
                                <div className="flex items-start gap-3">
                                    <div className={`p-2 rounded-lg ${item.is_normal ? 'bg-lime-500/10 text-lime-500' : 'bg-red-500/10 text-red-500'}`}>
                                        {item.is_normal ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm">
                                            {SCREENING_TYPES.find(s => s.value === item.screening_type)?.label || item.screening_type}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                                            <Calendar className="h-3 w-3" />
                                            Dernier: {format(new Date(item.last_screening_date), 'dd/MM/yyyy', { locale: fr })}
                                        </div>
                                        {item.next_screening_date && (
                                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                                                <Clock className="h-3 w-3" />
                                                Prochain: {format(new Date(item.next_screening_date), 'dd/MM/yyyy', { locale: fr })}
                                            </div>
                                        )}
                                    </div>
                                    <Badge className={status.color}>{status.label}</Badge>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => openEditDialog(item)}>
                                                <Pencil className="h-4 w-4 mr-2" />Modifier
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(item.id)}>
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

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Modifier le dépistage' : 'Ajouter un dépistage'}</DialogTitle>
                        <DialogDescription>Renseignez les informations du dépistage</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Type de dépistage</Label>
                            <Select value={formData.screening_type} onValueChange={handleTypeChange}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {SCREENING_TYPES.map((s) => (
                                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Dernier dépistage</Label>
                                <Input type="date" value={formData.last_screening_date} onChange={(e) => setFormData({ ...formData, last_screening_date: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Prochain dépistage</Label>
                                <Input type="date" value={formData.next_screening_date} onChange={(e) => setFormData({ ...formData, next_screening_date: e.target.value })} />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Résultat</Label>
                            <Select value={formData.result} onValueChange={(v) => setFormData({ ...formData, result: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {RESULTS.map((r) => (
                                        <SelectItem key={r.value} value={r.value}>
                                            <Badge className={r.color}>{r.label}</Badge>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
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

export default PreventionCard;
