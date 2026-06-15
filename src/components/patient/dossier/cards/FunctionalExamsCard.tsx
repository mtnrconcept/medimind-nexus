/**
 * FunctionalExamsCard - Functional tests management
 * Features: ECG, EEG, spirometry, stress tests, etc.
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
import { Plus, Stethoscope, Loader2, MoreVertical, Pencil, Trash2, Calendar, Activity, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface FunctionalExamsCardProps {
    patientId: string;
}

interface FunctionalExam {
    id: string;
    exam_type: string;
    exam_date: string;
    findings?: string;
    conclusion?: string;
    is_abnormal: boolean;
    physician?: string;
    facility?: string;
    notes?: string;
}

const EXAM_TYPES = [
    { value: 'ecg', label: 'ECG (Électrocardiogramme)' },
    { value: 'ecg_holter', label: 'Holter ECG (24h)' },
    { value: 'mapa', label: 'MAPA (Holter tensionnel)' },
    { value: 'stress_test', label: 'Épreuve d\'effort' },
    { value: 'spirometry', label: 'Spirométrie' },
    { value: 'plethysmography', label: 'Pléthysmographie' },
    { value: 'polysomnography', label: 'Polysomnographie' },
    { value: 'eeg', label: 'EEG (Électroencéphalogramme)' },
    { value: 'emg', label: 'EMG (Électromyogramme)' },
    { value: 'evoked_potentials', label: 'Potentiels évoqués' },
    { value: 'audiometry', label: 'Audiométrie' },
    { value: 'vestibular', label: 'Bilan vestibulaire' },
    { value: 'urodynamic', label: 'Bilan urodynamique' },
    { value: 'optical_coherence', label: 'OCT (Tomographie optique)' },
    { value: 'visual_field', label: 'Champ visuel' },
];

const FunctionalExamsCard = ({ patientId }: FunctionalExamsCardProps) => {
    const [exams, setExams] = useState<FunctionalExam[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<FunctionalExam | null>(null);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        exam_type: 'ecg',
        exam_date: new Date().toISOString().split('T')[0],
        findings: '',
        conclusion: '',
        is_abnormal: false,
        physician: '',
        facility: '',
        notes: '',
    });

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('patient_functional_exams')
            .select('*')
            .eq('patient_id', patientId)
            .order('exam_date', { ascending: false });
        setExams(data || []);
        setLoading(false);
    };

    const openAddDialog = () => {
        setEditing(null);
        setFormData({
            exam_type: 'ecg',
            exam_date: new Date().toISOString().split('T')[0],
            findings: '',
            conclusion: '',
            is_abnormal: false,
            physician: '',
            facility: '',
            notes: '',
        });
        setDialogOpen(true);
    };

    const openEditDialog = (item: FunctionalExam) => {
        setEditing(item);
        setFormData({
            exam_type: item.exam_type,
            exam_date: item.exam_date || '',
            findings: item.findings || '',
            conclusion: item.conclusion || '',
            is_abnormal: item.is_abnormal,
            physician: item.physician || '',
            facility: item.facility || '',
            notes: item.notes || '',
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (editing) {
                await supabase.from('patient_functional_exams').update(formData).eq('id', editing.id);
                toast.success('Examen mis à jour');
            } else {
                await supabase.from('patient_functional_exams').insert({ ...formData, patient_id: patientId });
                toast.success('Examen ajouté');
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
            await supabase.from('patient_functional_exams').delete().eq('id', id);
            toast.success('Examen supprimé');
            fetchData();
        } catch (error) {
            toast.error('Erreur');
        }
    };

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{exams.length} examen(s)</span>
                <Button size="sm" variant="outline" onClick={openAddDialog}>
                    <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
            </div>

            {exams.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Aucun examen fonctionnel</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {exams.map((exam) => (
                        <div
                            key={exam.id}
                            className={`p-3 rounded-lg border ${exam.is_abnormal ? 'bg-red-500/5 border-red-500/30' : 'bg-card'}`}
                        >
                            <div className="flex items-start gap-3">
                                <div className={`p-2 rounded-lg ${exam.is_abnormal ? 'bg-red-500/10 text-red-500' : 'bg-teal-500/10 text-teal-500'}`}>
                                    <Activity className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm flex items-center gap-2">
                                        {EXAM_TYPES.find(t => t.value === exam.exam_type)?.label || exam.exam_type}
                                        {exam.is_abnormal && <Badge variant="destructive" className="text-[10px]">Anormal</Badge>}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                                        <Calendar className="h-3 w-3" />
                                        {format(new Date(exam.exam_date), 'dd/MM/yyyy', { locale: fr })}
                                        {exam.facility && <span>• {exam.facility}</span>}
                                    </div>
                                    {exam.conclusion && (
                                        <div className="text-xs mt-2 p-2 bg-muted/50 rounded line-clamp-2">{exam.conclusion}</div>
                                    )}
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => openEditDialog(exam)}>
                                            <Pencil className="h-4 w-4 mr-2" />Modifier
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(exam.id)}>
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
                        <DialogTitle>{editing ? 'Modifier l\'examen' : 'Ajouter un examen'}</DialogTitle>
                        <DialogDescription>Renseignez les informations de l'examen</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                        <div className="space-y-2">
                            <Label>Type d'examen</Label>
                            <Select value={formData.exam_type} onValueChange={(v) => setFormData({ ...formData, exam_type: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {EXAM_TYPES.map((t) => (
                                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Date</Label>
                            <Input type="date" value={formData.exam_date} onChange={(e) => setFormData({ ...formData, exam_date: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                            <Label>Résultats</Label>
                            <Textarea value={formData.findings} onChange={(e) => setFormData({ ...formData, findings: e.target.value })} rows={3} />
                        </div>

                        <div className="space-y-2">
                            <Label>Conclusion</Label>
                            <Textarea value={formData.conclusion} onChange={(e) => setFormData({ ...formData, conclusion: e.target.value })} rows={2} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Médecin</Label>
                                <Input value={formData.physician} onChange={(e) => setFormData({ ...formData, physician: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Établissement</Label>
                                <Input value={formData.facility} onChange={(e) => setFormData({ ...formData, facility: e.target.value })} />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <input type="checkbox" id="is_abnormal" checked={formData.is_abnormal} onChange={(e) => setFormData({ ...formData, is_abnormal: e.target.checked })} className="rounded" />
                            <Label htmlFor="is_abnormal">Résultat anormal</Label>
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

export default FunctionalExamsCard;
