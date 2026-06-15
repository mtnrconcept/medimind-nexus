/**
 * AgeSpecificCard - Pediatric and Geriatric specific tracking
 * Features: Growth charts, development milestones, geriatric assessments
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
import { Plus, UserCircle, Loader2, MoreVertical, Pencil, Trash2, Baby, School, Activity, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface AgeSpecificCardProps {
    patientId: string;
}

interface AgeSpecificEntry {
    id: string;
    entry_date: string;
    entry_type: string;
    // Pediatric
    height_percentile?: number;
    weight_percentile?: number;
    head_circumference_cm?: number;
    school_performance?: string;
    // Geriatric
    fall_risk_score?: number;
    cognitive_score?: number;
    cognitive_test_type?: string;
    frailty_index?: number;
    polypharmacy_risk?: string;
    notes?: string;
}

const ENTRY_TYPES = [
    { value: 'growth', label: 'Croissance (Pédiatrie)', category: 'pediatric' },
    { value: 'development', label: 'Développement', category: 'pediatric' },
    { value: 'school_health', label: 'Santé scolaire', category: 'pediatric' },
    { value: 'fall_risk', label: 'Risque de chute', category: 'geriatric' },
    { value: 'cognitive', label: 'Cognitif (MMS/MoCA)', category: 'geriatric' },
    { value: 'frailty', label: 'Fragilité', category: 'geriatric' },
];

const POLYPHARMACY_RISK = [
    { value: 'low', label: 'Faible', color: 'bg-green-500/10 text-green-500' },
    { value: 'moderate', label: 'Modéré', color: 'bg-yellow-500/10 text-yellow-500' },
    { value: 'high', label: 'Élevé', color: 'bg-red-500/10 text-red-500' },
];

const AgeSpecificCard = ({ patientId }: AgeSpecificCardProps) => {
    const [entries, setEntries] = useState<AgeSpecificEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<AgeSpecificEntry | null>(null);
    const [saving, setSaving] = useState(false);
    const [activeMode, setActiveMode] = useState<'pediatric' | 'geriatric'>('pediatric');

    // Simple heuristic to determine default mode based on entries or patient age (if available)
    // For now defaulting to pediatric unless geriatric entries exist
    useEffect(() => {
        if (entries.some(e => ['fall_risk', 'cognitive', 'frailty'].includes(e.entry_type))) {
            setActiveMode('geriatric');
        }
    }, [entries]);

    const [formData, setFormData] = useState({
        entry_date: new Date().toISOString().split('T')[0],
        entry_type: 'growth',
        height_percentile: 50,
        weight_percentile: 50,
        head_circumference_cm: 0,
        school_performance: '',
        fall_risk_score: 0,
        cognitive_score: 30,
        cognitive_test_type: 'MMS',
        frailty_index: 0,
        polypharmacy_risk: 'low',
        notes: '',
    });

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('patient_age_specific')
            .select('*')
            .eq('patient_id', patientId)
            .order('entry_date', { ascending: false });
        setEntries(data || []);
        setLoading(false);
    };

    const openAddDialog = () => {
        setEditing(null);
        setFormData({
            entry_date: new Date().toISOString().split('T')[0],
            entry_type: activeMode === 'pediatric' ? 'growth' : 'fall_risk',
            height_percentile: 50,
            weight_percentile: 50,
            head_circumference_cm: 0,
            school_performance: '',
            fall_risk_score: 0,
            cognitive_score: 30,
            cognitive_test_type: 'MMS',
            frailty_index: 0,
            polypharmacy_risk: 'low',
            notes: '',
        });
        setDialogOpen(true);
    };

    const openEditDialog = (item: AgeSpecificEntry) => {
        setEditing(item);
        setFormData({
            entry_date: item.entry_date || '',
            entry_type: item.entry_type,
            height_percentile: item.height_percentile || 50,
            weight_percentile: item.weight_percentile || 50,
            head_circumference_cm: item.head_circumference_cm || 0,
            school_performance: item.school_performance || '',
            fall_risk_score: item.fall_risk_score || 0,
            cognitive_score: item.cognitive_score || 30,
            cognitive_test_type: item.cognitive_test_type || 'MMS',
            frailty_index: item.frailty_index || 0,
            polypharmacy_risk: item.polypharmacy_risk || 'low',
            notes: item.notes || '',
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (editing) {
                await supabase.from('patient_age_specific').update(formData).eq('id', editing.id);
                toast.success('Entrée mise à jour');
            } else {
                await supabase.from('patient_age_specific').insert({ ...formData, patient_id: patientId });
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
            await supabase.from('patient_age_specific').delete().eq('id', id);
            toast.success('Entrée supprimée');
            fetchData();
        } catch (error) {
            toast.error('Erreur');
        }
    };

    const filteredEntries = entries.filter(e => {
        if (activeMode === 'pediatric') {
            return ['growth', 'development', 'school_health'].includes(e.entry_type);
        }
        return ['fall_risk', 'cognitive', 'frailty'].includes(e.entry_type);
    });

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <Tabs value={activeMode} onValueChange={(v: any) => setActiveMode(v)} className="w-[200px]">
                    <TabsList className="grid w-full grid-cols-2 h-8">
                        <TabsTrigger value="pediatric" className="text-xs">Pédiatrie</TabsTrigger>
                        <TabsTrigger value="geriatric" className="text-xs">Gériatrie</TabsTrigger>
                    </TabsList>
                </Tabs>
                <Button size="sm" variant="outline" onClick={openAddDialog}>
                    <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
            </div>

            {filteredEntries.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                    {activeMode === 'pediatric' ? (
                        <Baby className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    ) : (
                        <UserCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    )}
                    <p>Aucune donnée {activeMode === 'pediatric' ? 'pédiatrique' : 'gériatrique'}</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {filteredEntries.map((entry) => (
                        <div key={entry.id} className="p-3 rounded-lg border bg-card">
                            <div className="flex items-start justify-between">
                                <div>
                                    <div className="font-medium text-sm">
                                        {ENTRY_TYPES.find(t => t.value === entry.entry_type)?.label || entry.entry_type}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        {format(new Date(entry.entry_date), 'dd/MM/yyyy', { locale: fr })}
                                    </div>

                                    <div className="mt-2 text-xs grid gap-1">
                                        {entry.entry_type === 'growth' && (
                                            <>
                                                <div>Taille: <Badge variant="secondary">P{entry.height_percentile}</Badge></div>
                                                <div>Poids: <Badge variant="secondary">P{entry.weight_percentile}</Badge></div>
                                            </>
                                        )}
                                        {entry.entry_type === 'cognitive' && (
                                            <div>Score {entry.cognitive_test_type}: <span className="font-medium">{entry.cognitive_score}/30</span></div>
                                        )}
                                        {entry.entry_type === 'fall_risk' && (
                                            <div className="flex items-center gap-2">
                                                Risque de chute:
                                                {entry.fall_risk_score && entry.fall_risk_score > 5 ? (
                                                    <Badge variant="destructive">Élevé</Badge>
                                                ) : (
                                                    <Badge variant="outline">Faible</Badge>
                                                )}
                                            </div>
                                        )}
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
                        <DialogTitle>{editing ? 'Modifier' : 'Nouvelle entrée'}</DialogTitle>
                        <DialogDescription>Suivi spécifique âge</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Type</Label>
                                <Select value={formData.entry_type} onValueChange={(v) => setFormData({ ...formData, entry_type: v })}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {ENTRY_TYPES.filter(t => t.category === activeMode).map((t) => (
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

                        {activeMode === 'pediatric' && formData.entry_type === 'growth' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Percentile Taille</Label>
                                    <Input type="number" value={formData.height_percentile} onChange={(e) => setFormData({ ...formData, height_percentile: parseInt(e.target.value) })} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Percentile Poids</Label>
                                    <Input type="number" value={formData.weight_percentile} onChange={(e) => setFormData({ ...formData, weight_percentile: parseInt(e.target.value) })} />
                                </div>
                            </div>
                        )}

                        {activeMode === 'geriatric' && formData.entry_type === 'cognitive' && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Test</Label>
                                    <Select value={formData.cognitive_test_type} onValueChange={(v) => setFormData({ ...formData, cognitive_test_type: v })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="MMS">MMS (Folstein)</SelectItem>
                                            <SelectItem value="MoCA">MoCA</SelectItem>
                                            <SelectItem value="Dubois">5 mots Dubois</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Score</Label>
                                    <Input type="number" value={formData.cognitive_score} onChange={(e) => setFormData({ ...formData, cognitive_score: parseInt(e.target.value) })} />
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label>Notes</Label>
                            <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={3} />
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

export default AgeSpecificCard;
