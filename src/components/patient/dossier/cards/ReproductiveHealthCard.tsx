/**
 * ReproductiveHealthCard - Reproductive health tracking
 * Features: Pregnancy, menstrual cycle, contraception, fertility
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
import { Plus, Baby, Loader2, MoreVertical, Pencil, Trash2, Calendar, Heart, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ReproductiveHealthCardProps {
    patientId: string;
}

interface ReproductiveEntry {
    id: string;
    entry_date: string;
    entry_type: string;
    // Pregnancy
    pregnancy_status?: string;
    due_date?: string;
    gestational_weeks?: number;
    pregnancy_outcome?: string;
    // Cycle
    cycle_start?: string;
    cycle_length?: number;
    flow_intensity?: string;
    // Contraception
    contraception_method?: string;
    start_date?: string;
    // General
    notes?: string;
}

const ENTRY_TYPES = [
    { value: 'pregnancy', label: 'Grossesse' },
    { value: 'cycle', label: 'Cycle menstruel' },
    { value: 'contraception', label: 'Contraception' },
    { value: 'fertility', label: 'Fertilité' },
    { value: 'menopause', label: 'Ménopause' },
    { value: 'screening', label: 'Dépistage gynéco' },
];

const PREGNANCY_STATUS = [
    { value: 'current', label: 'En cours' },
    { value: 'completed', label: 'Terminée' },
    { value: 'miscarriage', label: 'Fausse couche' },
    { value: 'ectopic', label: 'Extra-utérine' },
    { value: 'ivg', label: 'IVG' },
];

const CONTRACEPTION_METHODS = [
    { value: 'pill', label: 'Pilule' },
    { value: 'iud_copper', label: 'DIU cuivre' },
    { value: 'iud_hormonal', label: 'DIU hormonal' },
    { value: 'implant', label: 'Implant' },
    { value: 'patch', label: 'Patch' },
    { value: 'ring', label: 'Anneau' },
    { value: 'injection', label: 'Injection' },
    { value: 'condom', label: 'Préservatif' },
    { value: 'natural', label: 'Méthodes naturelles' },
    { value: 'sterilization', label: 'Stérilisation' },
    { value: 'none', label: 'Aucune' },
];

const FLOW_INTENSITY = [
    { value: 'light', label: 'Léger', color: 'bg-green-500/10 text-green-500' },
    { value: 'normal', label: 'Normal', color: 'bg-yellow-500/10 text-yellow-500' },
    { value: 'heavy', label: 'Abondant', color: 'bg-orange-500/10 text-orange-500' },
    { value: 'very_heavy', label: 'Très abondant', color: 'bg-red-500/10 text-red-500' },
];

const ReproductiveHealthCard = ({ patientId }: ReproductiveHealthCardProps) => {
    const [entries, setEntries] = useState<ReproductiveEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<ReproductiveEntry | null>(null);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('pregnancy');

    const [formData, setFormData] = useState({
        entry_date: new Date().toISOString().split('T')[0],
        entry_type: 'pregnancy',
        pregnancy_status: 'current',
        due_date: '',
        gestational_weeks: 0,
        pregnancy_outcome: '',
        cycle_start: '',
        cycle_length: 28,
        flow_intensity: 'normal',
        contraception_method: 'none',
        start_date: '',
        notes: '',
    });

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('patient_reproductive_health')
            .select('*')
            .eq('patient_id', patientId)
            .order('entry_date', { ascending: false });
        setEntries(data || []);
        setLoading(false);
    };

    const openAddDialog = (type: string = 'pregnancy') => {
        setEditing(null);
        setFormData({
            entry_date: new Date().toISOString().split('T')[0],
            entry_type: type,
            pregnancy_status: 'current',
            due_date: '',
            gestational_weeks: 0,
            pregnancy_outcome: '',
            cycle_start: '',
            cycle_length: 28,
            flow_intensity: 'normal',
            contraception_method: 'none',
            start_date: '',
            notes: '',
        });
        setDialogOpen(true);
    };

    const openEditDialog = (item: ReproductiveEntry) => {
        setEditing(item);
        setFormData({
            entry_date: item.entry_date || '',
            entry_type: item.entry_type,
            pregnancy_status: item.pregnancy_status || 'current',
            due_date: item.due_date || '',
            gestational_weeks: item.gestational_weeks || 0,
            pregnancy_outcome: item.pregnancy_outcome || '',
            cycle_start: item.cycle_start || '',
            cycle_length: item.cycle_length || 28,
            flow_intensity: item.flow_intensity || 'normal',
            contraception_method: item.contraception_method || 'none',
            start_date: item.start_date || '',
            notes: item.notes || '',
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (editing) {
                await supabase.from('patient_reproductive_health').update(formData).eq('id', editing.id);
                toast.success('Entrée mise à jour');
            } else {
                await supabase.from('patient_reproductive_health').insert({ ...formData, patient_id: patientId });
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
            await supabase.from('patient_reproductive_health').delete().eq('id', id);
            toast.success('Entrée supprimée');
            fetchData();
        } catch (error) {
            toast.error('Erreur');
        }
    };

    const pregnancyEntries = entries.filter(e => e.entry_type === 'pregnancy');
    const cycleEntries = entries.filter(e => e.entry_type === 'cycle');
    const contraceptionEntries = entries.filter(e => e.entry_type === 'contraception');

    const currentPregnancy = pregnancyEntries.find(p => p.pregnancy_status === 'current');
    const currentContraception = contraceptionEntries[0];

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{entries.length} entrée(s)</span>
                <Button size="sm" variant="outline" onClick={() => openAddDialog()}>
                    <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
            </div>

            {/* Current status */}
            {currentPregnancy && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
                    <div className="flex items-center gap-2 text-rose-500 text-sm font-medium">
                        <Baby className="h-4 w-4" />
                        Grossesse en cours
                    </div>
                    <div className="text-xs mt-1">
                        {currentPregnancy.gestational_weeks && <span>Semaine {currentPregnancy.gestational_weeks}</span>}
                        {currentPregnancy.due_date && <span> • DPA: {format(new Date(currentPregnancy.due_date), 'dd/MM/yyyy', { locale: fr })}</span>}
                    </div>
                </div>
            )}

            {currentContraception && currentContraception.contraception_method !== 'none' && (
                <div className="p-3 rounded-lg border bg-card">
                    <div className="text-sm font-medium">Contraception actuelle</div>
                    <div className="text-xs text-muted-foreground mt-1">
                        {CONTRACEPTION_METHODS.find(c => c.value === currentContraception.contraception_method)?.label}
                        {currentContraception.start_date && <span> • Depuis le {format(new Date(currentContraception.start_date), 'dd/MM/yyyy', { locale: fr })}</span>}
                    </div>
                </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3 h-8">
                    <TabsTrigger value="pregnancy" className="text-xs">Grossesses</TabsTrigger>
                    <TabsTrigger value="cycle" className="text-xs">Cycles</TabsTrigger>
                    <TabsTrigger value="contraception" className="text-xs">Contraception</TabsTrigger>
                </TabsList>

                <TabsContent value="pregnancy" className="mt-4">
                    {pregnancyEntries.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground">
                            <Baby className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Aucune grossesse enregistrée</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {pregnancyEntries.map((entry) => (
                                <div key={entry.id} className="p-3 rounded-lg border bg-card">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <Badge className={entry.pregnancy_status === 'current' ? 'bg-rose-500/10 text-rose-500' : 'bg-muted'}>
                                                {PREGNANCY_STATUS.find(s => s.value === entry.pregnancy_status)?.label}
                                            </Badge>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                                    <MoreVertical className="h-3 w-3" />
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
                                    <div className="text-xs text-muted-foreground mt-2">
                                        {entry.due_date && <span>DPA: {format(new Date(entry.due_date), 'dd/MM/yyyy', { locale: fr })}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="cycle" className="mt-4">
                    {cycleEntries.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground">
                            <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Aucun cycle enregistré</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {cycleEntries.slice(0, 6).map((entry) => (
                                <div key={entry.id} className="p-2 rounded-lg border bg-card flex items-center justify-between">
                                    <div className="text-xs">
                                        <span>{entry.cycle_start && format(new Date(entry.cycle_start), 'dd/MM/yyyy', { locale: fr })}</span>
                                        <span className="text-muted-foreground ml-2">• {entry.cycle_length} jours</span>
                                    </div>
                                    <Badge className={FLOW_INTENSITY.find(f => f.value === entry.flow_intensity)?.color || ''}>
                                        {FLOW_INTENSITY.find(f => f.value === entry.flow_intensity)?.label}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="contraception" className="mt-4">
                    {contraceptionEntries.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground">
                            <p>Aucune contraception enregistrée</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {contraceptionEntries.map((entry) => (
                                <div key={entry.id} className="p-3 rounded-lg border bg-card">
                                    <div className="font-medium text-sm">
                                        {CONTRACEPTION_METHODS.find(c => c.value === entry.contraception_method)?.label}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        {entry.start_date && <span>Depuis: {format(new Date(entry.start_date), 'dd/MM/yyyy', { locale: fr })}</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Modifier' : 'Nouvelle entrée'}</DialogTitle>
                        <DialogDescription>Santé reproductive</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
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

                        {formData.entry_type === 'pregnancy' && (
                            <>
                                <div className="space-y-2">
                                    <Label>Statut</Label>
                                    <Select value={formData.pregnancy_status} onValueChange={(v) => setFormData({ ...formData, pregnancy_status: v })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {PREGNANCY_STATUS.map((s) => (
                                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Date prévue</Label>
                                        <Input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Semaines</Label>
                                        <Input type="number" value={formData.gestational_weeks} onChange={(e) => setFormData({ ...formData, gestational_weeks: parseInt(e.target.value) || 0 })} />
                                    </div>
                                </div>
                            </>
                        )}

                        {formData.entry_type === 'cycle' && (
                            <>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Début cycle</Label>
                                        <Input type="date" value={formData.cycle_start} onChange={(e) => setFormData({ ...formData, cycle_start: e.target.value })} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Durée (jours)</Label>
                                        <Input type="number" value={formData.cycle_length} onChange={(e) => setFormData({ ...formData, cycle_length: parseInt(e.target.value) || 28 })} />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>Intensité</Label>
                                    <Select value={formData.flow_intensity} onValueChange={(v) => setFormData({ ...formData, flow_intensity: v })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {FLOW_INTENSITY.map((f) => (
                                                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </>
                        )}

                        {formData.entry_type === 'contraception' && (
                            <>
                                <div className="space-y-2">
                                    <Label>Méthode</Label>
                                    <Select value={formData.contraception_method} onValueChange={(v) => setFormData({ ...formData, contraception_method: v })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {CONTRACEPTION_METHODS.map((c) => (
                                                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Date début</Label>
                                    <Input type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} />
                                </div>
                            </>
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

export default ReproductiveHealthCard;
