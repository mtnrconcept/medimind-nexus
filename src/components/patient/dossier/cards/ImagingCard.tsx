/**
 * ImagingCard - Medical imaging management
 * Features: Imaging types, dates, findings, reports
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
import { Plus, Image as ImageIcon, Loader2, MoreVertical, Pencil, Trash2, Calendar, FileText, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ImagingCardProps {
    patientId: string;
}

interface Imaging {
    id: string;
    imaging_type: string;
    body_region: string;
    exam_date: string;
    findings?: string;
    conclusion?: string;
    radiologist?: string;
    facility?: string;
    report_url?: string;
    is_abnormal: boolean;
}

const IMAGING_TYPES = [
    { value: 'xray', label: 'Radiographie' },
    { value: 'ultrasound', label: 'Échographie' },
    { value: 'ct', label: 'Scanner (TDM)' },
    { value: 'mri', label: 'IRM' },
    { value: 'mammography', label: 'Mammographie' },
    { value: 'dexa', label: 'Ostéodensitométrie' },
    { value: 'pet', label: 'TEP-Scan' },
    { value: 'angiography', label: 'Angiographie' },
    { value: 'endoscopy', label: 'Endoscopie' },
    { value: 'colonoscopy', label: 'Coloscopie' },
    { value: 'echocardiography', label: 'Échocardiographie' },
    { value: 'doppler', label: 'Écho-Doppler' },
];

const BODY_REGIONS = [
    { value: 'head', label: 'Tête / Crâne' },
    { value: 'brain', label: 'Cerveau' },
    { value: 'neck', label: 'Cou' },
    { value: 'chest', label: 'Thorax' },
    { value: 'heart', label: 'Cœur' },
    { value: 'abdomen', label: 'Abdomen' },
    { value: 'pelvis', label: 'Bassin' },
    { value: 'spine_cervical', label: 'Rachis cervical' },
    { value: 'spine_thoracic', label: 'Rachis thoracique' },
    { value: 'spine_lumbar', label: 'Rachis lombaire' },
    { value: 'shoulder', label: 'Épaule' },
    { value: 'elbow', label: 'Coude' },
    { value: 'wrist', label: 'Poignet / Main' },
    { value: 'hip', label: 'Hanche' },
    { value: 'knee', label: 'Genou' },
    { value: 'ankle', label: 'Cheville / Pied' },
    { value: 'whole_body', label: 'Corps entier' },
];

const ImagingCard = ({ patientId }: ImagingCardProps) => {
    const [imaging, setImaging] = useState<Imaging[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<Imaging | null>(null);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        imaging_type: 'xray',
        body_region: 'chest',
        exam_date: new Date().toISOString().split('T')[0],
        findings: '',
        conclusion: '',
        radiologist: '',
        facility: '',
        report_url: '',
        is_abnormal: false,
    });

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('patient_imaging')
            .select('*')
            .eq('patient_id', patientId)
            .order('exam_date', { ascending: false });
        setImaging(data || []);
        setLoading(false);
    };

    const openAddDialog = () => {
        setEditing(null);
        setFormData({
            imaging_type: 'xray',
            body_region: 'chest',
            exam_date: new Date().toISOString().split('T')[0],
            findings: '',
            conclusion: '',
            radiologist: '',
            facility: '',
            report_url: '',
            is_abnormal: false,
        });
        setDialogOpen(true);
    };

    const openEditDialog = (item: Imaging) => {
        setEditing(item);
        setFormData({
            imaging_type: item.imaging_type,
            body_region: item.body_region,
            exam_date: item.exam_date || '',
            findings: item.findings || '',
            conclusion: item.conclusion || '',
            radiologist: item.radiologist || '',
            facility: item.facility || '',
            report_url: item.report_url || '',
            is_abnormal: item.is_abnormal,
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (editing) {
                await supabase.from('patient_imaging').update(formData).eq('id', editing.id);
                toast.success('Examen mis à jour');
            } else {
                await supabase.from('patient_imaging').insert({ ...formData, patient_id: patientId });
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
            await supabase.from('patient_imaging').delete().eq('id', id);
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
                <span className="text-sm text-muted-foreground">{imaging.length} examen(s)</span>
                <Button size="sm" variant="outline" onClick={openAddDialog}>
                    <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
            </div>

            {imaging.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Aucune imagerie enregistrée</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {imaging.map((item) => (
                        <div
                            key={item.id}
                            className={`p-3 rounded-lg border ${item.is_abnormal ? 'bg-red-500/5 border-red-500/30' : 'bg-card'}`}
                        >
                            <div className="flex items-start gap-3">
                                <div className={`p-2 rounded-lg ${item.is_abnormal ? 'bg-red-500/10 text-red-500' : 'bg-indigo-500/10 text-indigo-500'}`}>
                                    <ImageIcon className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm flex items-center gap-2">
                                        {IMAGING_TYPES.find(t => t.value === item.imaging_type)?.label || item.imaging_type}
                                        {item.is_abnormal && <Badge variant="destructive" className="text-[10px]">Anormal</Badge>}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        {BODY_REGIONS.find(r => r.value === item.body_region)?.label || item.body_region}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2">
                                        <Calendar className="h-3 w-3" />
                                        {format(new Date(item.exam_date), 'dd/MM/yyyy', { locale: fr })}
                                        {item.facility && <span>• {item.facility}</span>}
                                    </div>
                                    {item.conclusion && (
                                        <div className="text-xs mt-2 p-2 bg-muted/50 rounded line-clamp-2">{item.conclusion}</div>
                                    )}
                                </div>
                                {item.report_url && (
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => window.open(item.report_url, '_blank')}>
                                        <ExternalLink className="h-4 w-4" />
                                    </Button>
                                )}
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
                    ))}
                </div>
            )}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Modifier l\'examen' : 'Ajouter un examen'}</DialogTitle>
                        <DialogDescription>Renseignez les informations de l'imagerie</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Type d'examen</Label>
                                <Select value={formData.imaging_type} onValueChange={(v) => setFormData({ ...formData, imaging_type: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {IMAGING_TYPES.map((t) => (
                                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Région</Label>
                                <Select value={formData.body_region} onValueChange={(v) => setFormData({ ...formData, body_region: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {BODY_REGIONS.map((r) => (
                                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Date de l'examen</Label>
                            <Input type="date" value={formData.exam_date} onChange={(e) => setFormData({ ...formData, exam_date: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                            <Label>Résultats / Findings</Label>
                            <Textarea value={formData.findings} onChange={(e) => setFormData({ ...formData, findings: e.target.value })} rows={3} />
                        </div>

                        <div className="space-y-2">
                            <Label>Conclusion</Label>
                            <Textarea value={formData.conclusion} onChange={(e) => setFormData({ ...formData, conclusion: e.target.value })} rows={2} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Radiologue</Label>
                                <Input value={formData.radiologist} onChange={(e) => setFormData({ ...formData, radiologist: e.target.value })} />
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

export default ImagingCard;
