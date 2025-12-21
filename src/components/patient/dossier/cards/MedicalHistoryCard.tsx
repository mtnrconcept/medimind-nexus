/**
 * MedicalHistoryCard - Complete personal medical history
 * Features: Categories (diseases, surgeries, hospitalizations), timeline, severity
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Plus, Hospital, Loader2, MoreVertical, Pencil, Trash2, Stethoscope, Scissors, BedDouble, Upload } from 'lucide-react';
import { DocumentUploadDialog } from '@/components/patient/DocumentUploadDialog';

interface MedicalHistoryCardProps {
    patientId: string;
}

interface MedicalHistory {
    id: string;
    condition_type: string;
    condition_name: string;
    diagnosis_date?: string;
    resolution_date?: string;
    severity?: string;
    treatment?: string;
    notes?: string;
    is_chronic: boolean;
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
    const [history, setHistory] = useState<MedicalHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [editing, setEditing] = useState<MedicalHistory | null>(null);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('all');

    const [formData, setFormData] = useState({
        condition_type: 'disease',
        condition_name: '',
        diagnosis_date: '',
        resolution_date: '',
        severity: 'moderate',
        treatment: '',
        notes: '',
        is_chronic: false,
    });

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('patient_medical_history')
            .select('*')
            .eq('patient_id', patientId)
            .order('diagnosis_date', { ascending: false });
        setHistory(data || []);
        setLoading(false);
    };

    const openAddDialog = () => {
        setEditing(null);
        setFormData({
            condition_type: 'disease',
            condition_name: '',
            diagnosis_date: new Date().toISOString().split('T')[0],
            resolution_date: '',
            severity: 'moderate',
            treatment: '',
            notes: '',
            is_chronic: false,
        });
        setDialogOpen(true);
    };

    const openEditDialog = (item: MedicalHistory) => {
        setEditing(item);
        setFormData({
            condition_type: item.condition_type || 'disease',
            condition_name: item.condition_name || '',
            diagnosis_date: item.diagnosis_date || '',
            resolution_date: item.resolution_date || '',
            severity: item.severity || 'moderate',
            treatment: item.treatment || '',
            notes: item.notes || '',
            is_chronic: item.is_chronic || false,
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        if (!formData.condition_name.trim()) {
            toast.error('Veuillez entrer un nom de condition');
            return;
        }
        setSaving(true);
        try {
            if (editing) {
                await supabase.from('patient_medical_history').update(formData).eq('id', editing.id);
                toast.success('Antécédent mis à jour');
            } else {
                await supabase.from('patient_medical_history').insert({ ...formData, patient_id: patientId });
                toast.success('Antécédent ajouté');
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

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {filteredHistory.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                        Aucun antécédent enregistré
                    </div>
                ) : (
                    filteredHistory.map((item) => (
                        <div key={item.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
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
                                <div className="text-xs text-muted-foreground mt-1">
                                    {item.diagnosis_date && format(new Date(item.diagnosis_date), 'dd/MM/yyyy', { locale: fr })}
                                    {item.resolution_date && ` → ${format(new Date(item.resolution_date), 'dd/MM/yyyy', { locale: fr })}`}
                                </div>
                                {item.treatment && <div className="text-xs mt-1">💊 {item.treatment}</div>}
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                        <MoreVertical className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => openEditDialog(item)}>
                                        <Pencil className="h-3 w-3 mr-2" />Modifier
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleDelete(item.id)} className="text-red-600">
                                        <Trash2 className="h-3 w-3 mr-2" />Supprimer
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    ))
                )}
            </div>

            {/* Add/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Modifier' : 'Ajouter'} un antécédent</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Type</Label>
                                <Select value={formData.condition_type} onValueChange={(v) => setFormData({ ...formData, condition_type: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {CONDITION_TYPES.map(t => (
                                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Sévérité</Label>
                                <Select value={formData.severity} onValueChange={(v) => setFormData({ ...formData, severity: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {SEVERITY_OPTIONS.map(s => (
                                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div>
                            <Label>Nom de la condition</Label>
                            <Input
                                value={formData.condition_name}
                                onChange={(e) => setFormData({ ...formData, condition_name: e.target.value })}
                                placeholder="Ex: Diabète de type 2"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Date de diagnostic</Label>
                                <Input
                                    type="date"
                                    value={formData.diagnosis_date}
                                    onChange={(e) => setFormData({ ...formData, diagnosis_date: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>Date de résolution</Label>
                                <Input
                                    type="date"
                                    value={formData.resolution_date}
                                    onChange={(e) => setFormData({ ...formData, resolution_date: e.target.value })}
                                />
                            </div>
                        </div>
                        <div>
                            <Label>Traitement</Label>
                            <Input
                                value={formData.treatment}
                                onChange={(e) => setFormData({ ...formData, treatment: e.target.value })}
                                placeholder="Traitement suivi"
                            />
                        </div>
                        <div>
                            <Label>Notes</Label>
                            <Textarea
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                placeholder="Notes additionnelles..."
                                rows={2}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="is_chronic"
                                checked={formData.is_chronic}
                                onChange={(e) => setFormData({ ...formData, is_chronic: e.target.checked })}
                                className="rounded"
                            />
                            <Label htmlFor="is_chronic">Condition chronique</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            {editing ? 'Mettre à jour' : 'Ajouter'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <DocumentUploadDialog
                open={importDialogOpen}
                onOpenChange={setImportDialogOpen}
                patientId={patientId}
                onUploadComplete={() => {
                    toast.success('Document analysé, rechargement des antécédents...');
                    fetchData();
                }}
            />
        </div>
    );
};

export default MedicalHistoryCard;
