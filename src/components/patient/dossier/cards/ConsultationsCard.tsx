/**
 * ConsultationsCard - Medical consultations and appointments
 * Features: Consultation history, specialties, notes, follow-ups
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
import { Plus, CalendarDays, Loader2, MoreVertical, Pencil, Trash2, Calendar, Clock, User, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { format, isPast, isFuture } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ConsultationsCardProps {
    patientId: string;
}

interface Consultation {
    id: string;
    consultation_date: string;
    specialty: string;
    physician_name: string;
    facility?: string;
    reason: string;
    diagnosis?: string;
    treatment_plan?: string;
    follow_up_date?: string;
    notes?: string;
}

const SPECIALTIES = [
    { value: 'general', label: 'Médecine générale' },
    { value: 'cardiology', label: 'Cardiologie' },
    { value: 'pulmonology', label: 'Pneumologie' },
    { value: 'gastroenterology', label: 'Gastro-entérologie' },
    { value: 'neurology', label: 'Neurologie' },
    { value: 'psychiatry', label: 'Psychiatrie' },
    { value: 'dermatology', label: 'Dermatologie' },
    { value: 'rheumatology', label: 'Rhumatologie' },
    { value: 'endocrinology', label: 'Endocrinologie' },
    { value: 'nephrology', label: 'Néphrologie' },
    { value: 'urology', label: 'Urologie' },
    { value: 'gynecology', label: 'Gynécologie' },
    { value: 'ophthalmology', label: 'Ophtalmologie' },
    { value: 'ent', label: 'ORL' },
    { value: 'orthopedics', label: 'Orthopédie' },
    { value: 'oncology', label: 'Oncologie' },
    { value: 'hematology', label: 'Hématologie' },
    { value: 'infectious', label: 'Infectiologie' },
    { value: 'emergency', label: 'Urgences' },
];

const ConsultationsCard = ({ patientId }: ConsultationsCardProps) => {
    const [consultations, setConsultations] = useState<Consultation[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Consultation | null>(null);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        consultation_date: new Date().toISOString().split('T')[0],
        specialty: 'general',
        physician_name: '',
        facility: '',
        reason: '',
        diagnosis: '',
        treatment_plan: '',
        follow_up_date: '',
        notes: '',
    });

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('patient_consultations')
            .select('*')
            .eq('patient_id', patientId)
            .order('consultation_date', { ascending: false });
        setConsultations(data || []);
        setLoading(false);
    };

    const openAddDialog = () => {
        setEditing(null);
        setFormData({
            consultation_date: new Date().toISOString().split('T')[0],
            specialty: 'general',
            physician_name: '',
            facility: '',
            reason: '',
            diagnosis: '',
            treatment_plan: '',
            follow_up_date: '',
            notes: '',
        });
        setDialogOpen(true);
    };

    const openEditDialog = (item: Consultation) => {
        setEditing(item);
        setFormData({
            consultation_date: item.consultation_date?.split('T')[0] || '',
            specialty: item.specialty,
            physician_name: item.physician_name || '',
            facility: item.facility || '',
            reason: item.reason || '',
            diagnosis: item.diagnosis || '',
            treatment_plan: item.treatment_plan || '',
            follow_up_date: item.follow_up_date || '',
            notes: item.notes || '',
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        if (!formData.physician_name.trim()) {
            toast.error('Veuillez saisir le nom du médecin');
            return;
        }

        setSaving(true);
        try {
            if (editing) {
                await supabase.from('patient_consultations').update(formData).eq('id', editing.id);
                toast.success('Consultation mise à jour');
            } else {
                await supabase.from('patient_consultations').insert({ ...formData, patient_id: patientId });
                toast.success('Consultation ajoutée');
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
            await supabase.from('patient_consultations').delete().eq('id', id);
            toast.success('Consultation supprimée');
            fetchData();
        } catch (error) {
            toast.error('Erreur');
        }
    };

    const upcomingFollowUps = consultations.filter(c => c.follow_up_date && isFuture(new Date(c.follow_up_date)));

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{consultations.length} consultation(s)</span>
                <Button size="sm" variant="outline" onClick={openAddDialog}>
                    <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
            </div>

            {/* Upcoming follow-ups */}
            {upcomingFollowUps.length > 0 && (
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                    <div className="flex items-center gap-2 text-blue-500 text-sm font-medium mb-2">
                        <Clock className="h-4 w-4" />
                        Suivis à venir ({upcomingFollowUps.length})
                    </div>
                    <div className="space-y-1">
                        {upcomingFollowUps.slice(0, 3).map(c => (
                            <div key={c.id} className="text-xs flex items-center justify-between">
                                <span>{SPECIALTIES.find(s => s.value === c.specialty)?.label}</span>
                                <span>{format(new Date(c.follow_up_date!), 'dd/MM/yyyy', { locale: fr })}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {consultations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Aucune consultation enregistrée</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {consultations.map((consult) => (
                        <div key={consult.id} className="p-3 rounded-lg border bg-card">
                            <div className="flex items-start gap-3">
                                <div className="p-2 rounded-lg bg-violet-500/10 text-violet-500">
                                    <CalendarDays className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm flex items-center gap-2">
                                        {SPECIALTIES.find(s => s.value === consult.specialty)?.label || consult.specialty}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                                        <User className="h-3 w-3" />
                                        {consult.physician_name}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                                        <Calendar className="h-3 w-3" />
                                        {format(new Date(consult.consultation_date), 'dd/MM/yyyy', { locale: fr })}
                                        {consult.facility && (
                                            <>
                                                <MapPin className="h-3 w-3 ml-2" />
                                                {consult.facility}
                                            </>
                                        )}
                                    </div>
                                    {consult.reason && (
                                        <div className="text-xs mt-2"><span className="text-muted-foreground">Motif:</span> {consult.reason}</div>
                                    )}
                                    {consult.diagnosis && (
                                        <div className="text-xs mt-1 p-2 bg-muted/50 rounded">{consult.diagnosis}</div>
                                    )}
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => openEditDialog(consult)}>
                                            <Pencil className="h-4 w-4 mr-2" />Modifier
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(consult.id)}>
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
                        <DialogTitle>{editing ? 'Modifier la consultation' : 'Ajouter une consultation'}</DialogTitle>
                        <DialogDescription>Renseignez les informations de la consultation</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Date</Label>
                                <Input type="date" value={formData.consultation_date} onChange={(e) => setFormData({ ...formData, consultation_date: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Spécialité</Label>
                                <Select value={formData.specialty} onValueChange={(v) => setFormData({ ...formData, specialty: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {SPECIALTIES.map((s) => (
                                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Médecin *</Label>
                            <Input placeholder="Dr..." value={formData.physician_name} onChange={(e) => setFormData({ ...formData, physician_name: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                            <Label>Établissement</Label>
                            <Input value={formData.facility} onChange={(e) => setFormData({ ...formData, facility: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                            <Label>Motif</Label>
                            <Input value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                            <Label>Diagnostic / Conclusion</Label>
                            <Textarea value={formData.diagnosis} onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })} rows={2} />
                        </div>

                        <div className="space-y-2">
                            <Label>Plan de traitement</Label>
                            <Textarea value={formData.treatment_plan} onChange={(e) => setFormData({ ...formData, treatment_plan: e.target.value })} rows={2} />
                        </div>

                        <div className="space-y-2">
                            <Label>Suivi prévu le</Label>
                            <Input type="date" value={formData.follow_up_date} onChange={(e) => setFormData({ ...formData, follow_up_date: e.target.value })} />
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

export default ConsultationsCard;
