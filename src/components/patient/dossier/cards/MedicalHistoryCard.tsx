/**
 * MedicalHistoryCard - Complete personal medical history
 * Features: Categories (diseases, surgeries, hospitalizations), timeline, severity
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Plus, Hospital, Loader2, MoreVertical, Pencil, Trash2, Calendar, Stethoscope, Scissors, BedDouble, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface MedicalHistoryCardProps {
    patientId: string;
}

interface MedicalHistory {
    id: string;
    category: string;
    title: string;
    description?: string;
    start_date?: string;
    end_date?: string;
    severity?: string;
    treating_physician?: string;
    treating_facility?: string;
    is_ongoing: boolean;
    notes?: string;
}

const CATEGORIES = [
    { value: 'disease', label: 'Maladie', icon: Activity },
    { value: 'surgery', label: 'Chirurgie', icon: Scissors },
    { value: 'hospitalization', label: 'Hospitalisation', icon: BedDouble },
    { value: 'injury', label: 'Traumatisme', icon: Hospital },
    { value: 'other', label: 'Autre', icon: Stethoscope },
];

const SEVERITIES = [
    { value: 'mild', label: 'Bénin', color: 'bg-green-500/10 text-green-500' },
    { value: 'moderate', label: 'Modéré', color: 'bg-yellow-500/10 text-yellow-500' },
    { value: 'severe', label: 'Sévère', color: 'bg-orange-500/10 text-orange-500' },
    { value: 'critical', label: 'Critique', color: 'bg-red-500/10 text-red-500' },
];

const COMMON_CONDITIONS = {
    disease: ['Diabète type 2', 'Hypertension artérielle', 'Asthme', 'BPCO', 'Insuffisance cardiaque', 'Insuffisance rénale', 'Hypothyroïdie', 'Hyperthyroïdie', 'Dépression', 'Anxiété', 'Arthrose', 'Polyarthrite rhumatoïde', 'Cancer', 'AVC', 'Infarctus du myocarde', 'Fibrillation auriculaire', 'Épilepsie', 'Maladie de Parkinson', 'Alzheimer'],
    surgery: ['Appendicectomie', 'Cholécystectomie', 'Césarienne', 'Prothèse de hanche', 'Prothèse de genou', 'Pontage coronarien', 'Hernie inguinale', 'Amygdalectomie', 'Cataracte', 'Hystérectomie'],
    hospitalization: ['Pneumonie', 'Insuffisance cardiaque aiguë', 'AVC', 'Infarctus', 'Chirurgie programmée', 'Accident de la route', 'Chute', 'Infection urinaire', 'Déshydratation'],
    injury: ['Fracture', 'Entorse', 'Luxation', 'Commotion cérébrale', 'Brûlure', 'Coupure'],
    other: [],
};

const MedicalHistoryCard = ({ patientId }: MedicalHistoryCardProps) => {
    const [history, setHistory] = useState<MedicalHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<MedicalHistory | null>(null);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('all');

    const [formData, setFormData] = useState({
        category: 'disease',
        title: '',
        description: '',
        start_date: '',
        end_date: '',
        severity: 'moderate',
        treating_physician: '',
        treating_facility: '',
        is_ongoing: false,
        notes: '',
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
            .order('start_date', { ascending: false });
        setHistory(data || []);
        setLoading(false);
    };

    const openAddDialog = (category?: string) => {
        setEditing(null);
        setFormData({
            category: category || 'disease',
            title: '',
            description: '',
            start_date: '',
            end_date: '',
            severity: 'moderate',
            treating_physician: '',
            treating_facility: '',
            is_ongoing: false,
            notes: '',
        });
        setDialogOpen(true);
    };

    const openEditDialog = (item: MedicalHistory) => {
        setEditing(item);
        setFormData({
            category: item.category,
            title: item.title,
            description: item.description || '',
            start_date: item.start_date || '',
            end_date: item.end_date || '',
            severity: item.severity || 'moderate',
            treating_physician: item.treating_physician || '',
            treating_facility: item.treating_facility || '',
            is_ongoing: item.is_ongoing,
            notes: item.notes || '',
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        if (!formData.title.trim()) {
            toast.error('Veuillez saisir un titre');
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

    const getCategoryIcon = (category: string) => {
        const cat = CATEGORIES.find(c => c.value === category);
        if (cat) {
            const Icon = cat.icon;
            return <Icon className="h-4 w-4" />;
        }
        return <Hospital className="h-4 w-4" />;
    };

    const getSeverityColor = (severity?: string) => {
        return SEVERITIES.find(s => s.value === severity)?.color || 'bg-muted';
    };

    const filteredHistory = activeTab === 'all'
        ? history
        : history.filter(h => h.category === activeTab);

    const chronicConditions = history.filter(h => h.is_ongoing);

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{history.length} antécédent(s)</span>
                <Button size="sm" variant="outline" onClick={() => openAddDialog()}>
                    <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
            </div>

            {/* Chronic conditions highlight */}
            {chronicConditions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {chronicConditions.map(c => (
                        <Badge key={c.id} variant="secondary" className="text-[10px]">
                            {c.title}
                        </Badge>
                    ))}
                </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4 h-8">
                    <TabsTrigger value="all" className="text-xs">Tous</TabsTrigger>
                    <TabsTrigger value="disease" className="text-xs">Maladies</TabsTrigger>
                    <TabsTrigger value="surgery" className="text-xs">Chirurgies</TabsTrigger>
                    <TabsTrigger value="hospitalization" className="text-xs">Hospi.</TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className="mt-4">
                    {filteredHistory.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Hospital className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Aucun antécédent</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredHistory.map((item) => (
                                <div key={item.id} className="p-3 rounded-lg border bg-card">
                                    <div className="flex items-start gap-3">
                                        <div className={`p-2 rounded-lg ${getSeverityColor(item.severity)}`}>
                                            {getCategoryIcon(item.category)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm flex items-center gap-2">
                                                {item.title}
                                                {item.is_ongoing && (
                                                    <Badge className="bg-blue-500/10 text-blue-500 text-[10px]">Chronique</Badge>
                                                )}
                                            </div>
                                            {item.description && (
                                                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</div>
                                            )}
                                            <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-2">
                                                {item.start_date && (
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        {format(new Date(item.start_date), 'dd/MM/yyyy', { locale: fr })}
                                                    </span>
                                                )}
                                                {item.treating_facility && <span>• {item.treating_facility}</span>}
                                            </div>
                                        </div>
                                        {item.severity && (
                                            <Badge className={`${getSeverityColor(item.severity)} text-[10px]`}>
                                                {SEVERITIES.find(s => s.value === item.severity)?.label}
                                            </Badge>
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
                </TabsContent>
            </Tabs>

            {/* Add/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Modifier l\'antécédent' : 'Ajouter un antécédent'}</DialogTitle>
                        <DialogDescription>Renseignez les informations médicales</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                        <div className="space-y-2">
                            <Label>Catégorie</Label>
                            <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v, title: '' })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {CATEGORIES.map((c) => (
                                        <SelectItem key={c.value} value={c.value}>
                                            <div className="flex items-center gap-2">
                                                <c.icon className="h-4 w-4" />{c.label}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Diagnostic / Titre *</Label>
                            <Select value={formData.title} onValueChange={(v) => setFormData({ ...formData, title: v })}>
                                <SelectTrigger><SelectValue placeholder="Sélectionner ou saisir..." /></SelectTrigger>
                                <SelectContent>
                                    {(COMMON_CONDITIONS[formData.category as keyof typeof COMMON_CONDITIONS] || []).map((c) => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                    <SelectItem value="__custom__">Autre...</SelectItem>
                                </SelectContent>
                            </Select>
                            {formData.title === '__custom__' && (
                                <Input
                                    placeholder="Saisir le diagnostic..."
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                />
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                                placeholder="Détails supplémentaires..."
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                rows={2}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Date de diagnostic</Label>
                                <Input
                                    type="date"
                                    value={formData.start_date}
                                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Date de résolution</Label>
                                <Input
                                    type="date"
                                    value={formData.end_date}
                                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Sévérité</Label>
                            <Select value={formData.severity} onValueChange={(v) => setFormData({ ...formData, severity: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {SEVERITIES.map((s) => (
                                        <SelectItem key={s.value} value={s.value}>
                                            <Badge className={s.color}>{s.label}</Badge>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Médecin</Label>
                                <Input
                                    placeholder="Dr..."
                                    value={formData.treating_physician}
                                    onChange={(e) => setFormData({ ...formData, treating_physician: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Établissement</Label>
                                <Input
                                    placeholder="Hôpital..."
                                    value={formData.treating_facility}
                                    onChange={(e) => setFormData({ ...formData, treating_facility: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="is_ongoing"
                                checked={formData.is_ongoing}
                                onChange={(e) => setFormData({ ...formData, is_ongoing: e.target.checked })}
                                className="rounded"
                            />
                            <Label htmlFor="is_ongoing">Pathologie chronique</Label>
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

export default MedicalHistoryCard;
