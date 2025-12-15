/**
 * FamilyHistoryCard - Complete family medical history
 * Features: Family member relationship, conditions, age of onset
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
import { Plus, Users, Loader2, MoreVertical, Pencil, Trash2, Heart, Brain, Activity, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface FamilyHistoryCardProps {
    patientId: string;
}

interface FamilyHistory {
    id: string;
    relationship: string;
    condition: string;
    age_at_diagnosis?: number;
    is_deceased: boolean;
    age_at_death?: number;
    cause_of_death?: string;
    notes?: string;
}

const RELATIONSHIPS = [
    { value: 'mother', label: 'Mère' },
    { value: 'father', label: 'Père' },
    { value: 'maternal_grandmother', label: 'Grand-mère maternelle' },
    { value: 'maternal_grandfather', label: 'Grand-père maternel' },
    { value: 'paternal_grandmother', label: 'Grand-mère paternelle' },
    { value: 'paternal_grandfather', label: 'Grand-père paternel' },
    { value: 'sister', label: 'Sœur' },
    { value: 'brother', label: 'Frère' },
    { value: 'maternal_aunt', label: 'Tante maternelle' },
    { value: 'maternal_uncle', label: 'Oncle maternel' },
    { value: 'paternal_aunt', label: 'Tante paternelle' },
    { value: 'paternal_uncle', label: 'Oncle paternel' },
    { value: 'child', label: 'Enfant' },
];

const COMMON_FAMILY_CONDITIONS = [
    'Diabète type 2',
    'Hypertension artérielle',
    'Maladie coronarienne',
    'Infarctus du myocarde',
    'AVC',
    'Cancer du sein',
    'Cancer du côlon',
    'Cancer de la prostate',
    'Cancer du poumon',
    'Alzheimer',
    'Parkinson',
    'Dépression',
    'Trouble bipolaire',
    'Schizophrénie',
    'Asthme',
    'Arthrite rhumatoïde',
    'Ostéoporose',
    'Thyroïde',
    'Épilepsie',
    'Maladie rénale',
    'Glaucome',
    'Dégénérescence maculaire',
];

const RISK_CONDITIONS = ['Cancer', 'Maladie coronarienne', 'Infarctus', 'AVC', 'Diabète', 'Alzheimer'];

const FamilyHistoryCard = ({ patientId }: FamilyHistoryCardProps) => {
    const [history, setHistory] = useState<FamilyHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<FamilyHistory | null>(null);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        relationship: 'mother',
        condition: '',
        age_at_diagnosis: undefined as number | undefined,
        is_deceased: false,
        age_at_death: undefined as number | undefined,
        cause_of_death: '',
        notes: '',
    });

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('patient_family_history')
            .select('*')
            .eq('patient_id', patientId)
            .order('relationship');
        setHistory(data || []);
        setLoading(false);
    };

    const openAddDialog = () => {
        setEditing(null);
        setFormData({
            relationship: 'mother',
            condition: '',
            age_at_diagnosis: undefined,
            is_deceased: false,
            age_at_death: undefined,
            cause_of_death: '',
            notes: '',
        });
        setDialogOpen(true);
    };

    const openEditDialog = (item: FamilyHistory) => {
        setEditing(item);
        setFormData({
            relationship: item.relationship,
            condition: item.condition,
            age_at_diagnosis: item.age_at_diagnosis,
            is_deceased: item.is_deceased,
            age_at_death: item.age_at_death,
            cause_of_death: item.cause_of_death || '',
            notes: item.notes || '',
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        if (!formData.condition.trim()) {
            toast.error('Veuillez saisir une pathologie');
            return;
        }

        setSaving(true);
        try {
            if (editing) {
                await supabase.from('patient_family_history').update(formData).eq('id', editing.id);
                toast.success('Antécédent mis à jour');
            } else {
                await supabase.from('patient_family_history').insert({ ...formData, patient_id: patientId });
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
            await supabase.from('patient_family_history').delete().eq('id', id);
            toast.success('Antécédent supprimé');
            fetchData();
        } catch (error) {
            toast.error('Erreur');
        }
    };

    // Group by relationship
    const groupedHistory = history.reduce((acc, h) => {
        if (!acc[h.relationship]) acc[h.relationship] = [];
        acc[h.relationship].push(h);
        return acc;
    }, {} as Record<string, FamilyHistory[]>);

    // Risk factors
    const riskFactors = history.filter(h => RISK_CONDITIONS.some(rc => h.condition.toLowerCase().includes(rc.toLowerCase())));

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{history.length} antécédent(s)</span>
                <Button size="sm" variant="outline" onClick={openAddDialog}>
                    <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
            </div>

            {/* Risk factors highlight */}
            {riskFactors.length > 0 && (
                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                    <div className="flex items-center gap-2 text-orange-500 text-sm font-medium mb-2">
                        <AlertTriangle className="h-4 w-4" />
                        Facteurs de risque familiaux
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {riskFactors.map(rf => (
                            <Badge key={rf.id} variant="outline" className="text-[10px] bg-orange-500/5 text-orange-500 border-orange-500/30">
                                {rf.condition} ({RELATIONSHIPS.find(r => r.value === rf.relationship)?.label})
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            {/* Family history by member */}
            {history.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Aucun antécédent familial</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {Object.entries(groupedHistory).map(([relationship, conditions]) => (
                        <div key={relationship} className="p-3 rounded-lg border bg-card">
                            <div className="font-medium text-sm mb-2 flex items-center gap-2">
                                <Users className="h-4 w-4 text-purple-500" />
                                {RELATIONSHIPS.find(r => r.value === relationship)?.label || relationship}
                                {conditions.some(c => c.is_deceased) && (
                                    <Badge variant="secondary" className="text-[10px]">Décédé(e)</Badge>
                                )}
                            </div>
                            <div className="space-y-2">
                                {conditions.map(cond => (
                                    <div key={cond.id} className="flex items-center justify-between group">
                                        <div className="flex-1">
                                            <div className="text-sm flex items-center gap-2">
                                                <span className={RISK_CONDITIONS.some(rc => cond.condition.toLowerCase().includes(rc.toLowerCase())) ? 'text-orange-500 font-medium' : ''}>
                                                    {cond.condition}
                                                </span>
                                                {cond.age_at_diagnosis && (
                                                    <span className="text-[10px] text-muted-foreground">
                                                        (à {cond.age_at_diagnosis} ans)
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                                                    <MoreVertical className="h-3 w-3" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem onClick={() => openEditDialog(cond)}>
                                                    <Pencil className="h-4 w-4 mr-2" />Modifier
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(cond.id)}>
                                                    <Trash2 className="h-4 w-4 mr-2" />Supprimer
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Modifier l\'antécédent' : 'Ajouter un antécédent familial'}</DialogTitle>
                        <DialogDescription>Renseignez les informations du membre de la famille</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Membre de la famille *</Label>
                            <Select value={formData.relationship} onValueChange={(v) => setFormData({ ...formData, relationship: v })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {RELATIONSHIPS.map((r) => (
                                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Pathologie *</Label>
                            <Select value={formData.condition} onValueChange={(v) => setFormData({ ...formData, condition: v })}>
                                <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                                <SelectContent>
                                    {COMMON_FAMILY_CONDITIONS.map((c) => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                    <SelectItem value="__custom__">Autre...</SelectItem>
                                </SelectContent>
                            </Select>
                            {formData.condition === '__custom__' && (
                                <Input
                                    placeholder="Saisir la pathologie..."
                                    onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                                />
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label>Âge au diagnostic</Label>
                            <Input
                                type="number"
                                placeholder="Ex: 55"
                                value={formData.age_at_diagnosis || ''}
                                onChange={(e) => setFormData({ ...formData, age_at_diagnosis: parseInt(e.target.value) || undefined })}
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="is_deceased"
                                checked={formData.is_deceased}
                                onChange={(e) => setFormData({ ...formData, is_deceased: e.target.checked })}
                                className="rounded"
                            />
                            <Label htmlFor="is_deceased">Décédé(e)</Label>
                        </div>

                        {formData.is_deceased && (
                            <>
                                <div className="space-y-2">
                                    <Label>Âge au décès</Label>
                                    <Input
                                        type="number"
                                        value={formData.age_at_death || ''}
                                        onChange={(e) => setFormData({ ...formData, age_at_death: parseInt(e.target.value) || undefined })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Cause du décès</Label>
                                    <Input
                                        value={formData.cause_of_death}
                                        onChange={(e) => setFormData({ ...formData, cause_of_death: e.target.value })}
                                    />
                                </div>
                            </>
                        )}

                        <div className="space-y-2">
                            <Label>Notes</Label>
                            <Textarea
                                placeholder="Informations complémentaires..."
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                rows={2}
                            />
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

export default FamilyHistoryCard;
