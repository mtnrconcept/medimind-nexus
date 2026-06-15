/**
 * MentalHealthCard - Mental health tracking and management
 * Features: Mood tracking, diagnoses, therapy, medications
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
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
import { Plus, Brain, Loader2, MoreVertical, Pencil, Trash2, Calendar, Smile, Meh, Frown, ThumbsUp, ThumbsDown } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface MentalHealthCardProps {
    patientId: string;
}

interface MentalHealthEntry {
    id: string;
    entry_date: string;
    entry_type: string;
    mood_score?: number;
    anxiety_level?: number;
    sleep_quality?: number;
    diagnosis?: string;
    therapist_name?: string;
    therapy_type?: string;
    notes?: string;
}

const ENTRY_TYPES = [
    { value: 'mood_check', label: 'Suivi humeur' },
    { value: 'diagnosis', label: 'Diagnostic' },
    { value: 'therapy', label: 'Thérapie' },
    { value: 'crisis', label: 'Épisode de crise' },
    { value: 'follow_up', label: 'Suivi psychiatrique' },
];

const DIAGNOSES = [
    'Dépression',
    'Trouble anxieux généralisé',
    'Trouble panique',
    'TSPT (Stress post-traumatique)',
    'Trouble bipolaire',
    'TOC (Obsessionnel-compulsif)',
    'Trouble de la personnalité',
    'Schizophrénie',
    'TDAH',
    'Trouble du sommeil',
    'Trouble alimentaire',
    'Addiction',
    'Burn-out',
];

const THERAPY_TYPES = [
    { value: 'cbt', label: 'TCC (Thérapie cognitivo-comportementale)' },
    { value: 'psychoanalysis', label: 'Psychanalyse' },
    { value: 'emdr', label: 'EMDR' },
    { value: 'group', label: 'Thérapie de groupe' },
    { value: 'family', label: 'Thérapie familiale' },
    { value: 'medication', label: 'Traitement médicamenteux' },
    { value: 'mindfulness', label: 'Pleine conscience' },
    { value: 'art', label: 'Art-thérapie' },
];

const MentalHealthCard = ({ patientId }: MentalHealthCardProps) => {
    const [entries, setEntries] = useState<MentalHealthEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<MentalHealthEntry | null>(null);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('mood');

    const [formData, setFormData] = useState({
        entry_date: new Date().toISOString().split('T')[0],
        entry_type: 'mood_check',
        mood_score: 5,
        anxiety_level: 3,
        sleep_quality: 7,
        diagnosis: '',
        therapist_name: '',
        therapy_type: '',
        notes: '',
    });

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('patient_mental_health')
            .select('*')
            .eq('patient_id', patientId)
            .order('entry_date', { ascending: false });
        setEntries(data || []);
        setLoading(false);
    };

    const openAddDialog = (type: string = 'mood_check') => {
        setEditing(null);
        setFormData({
            entry_date: new Date().toISOString().split('T')[0],
            entry_type: type,
            mood_score: 5,
            anxiety_level: 3,
            sleep_quality: 7,
            diagnosis: '',
            therapist_name: '',
            therapy_type: '',
            notes: '',
        });
        setDialogOpen(true);
    };

    const openEditDialog = (item: MentalHealthEntry) => {
        setEditing(item);
        setFormData({
            entry_date: item.entry_date || '',
            entry_type: item.entry_type,
            mood_score: item.mood_score ?? 5,
            anxiety_level: item.anxiety_level ?? 3,
            sleep_quality: item.sleep_quality ?? 7,
            diagnosis: item.diagnosis || '',
            therapist_name: item.therapist_name || '',
            therapy_type: item.therapy_type || '',
            notes: item.notes || '',
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (editing) {
                await supabase.from('patient_mental_health').update(formData).eq('id', editing.id);
                toast.success('Entrée mise à jour');
            } else {
                await supabase.from('patient_mental_health').insert({ ...formData, patient_id: patientId });
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
            await supabase.from('patient_mental_health').delete().eq('id', id);
            toast.success('Entrée supprimée');
            fetchData();
        } catch (error) {
            toast.error('Erreur');
        }
    };

    const getMoodIcon = (score?: number) => {
        if (!score) return <Meh className="h-4 w-4" />;
        if (score >= 7) return <Smile className="h-4 w-4 text-green-500" />;
        if (score >= 4) return <Meh className="h-4 w-4 text-yellow-500" />;
        return <Frown className="h-4 w-4 text-red-500" />;
    };

    const moodEntries = entries.filter(e => e.entry_type === 'mood_check');
    const diagnosisEntries = entries.filter(e => e.entry_type === 'diagnosis');
    const therapyEntries = entries.filter(e => ['therapy', 'follow_up'].includes(e.entry_type));

    const latestMood = moodEntries[0];

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

            {/* Current mood summary */}
            {latestMood && (
                <div className="p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-3">
                        {getMoodIcon(latestMood.mood_score)}
                        <div className="flex-1">
                            <div className="text-sm font-medium">Dernière évaluation</div>
                            <div className="text-xs text-muted-foreground">
                                {format(new Date(latestMood.entry_date), 'dd/MM/yyyy', { locale: fr })}
                            </div>
                        </div>
                        <div className="flex gap-2 text-xs">
                            <Badge variant="outline">Humeur: {latestMood.mood_score}/10</Badge>
                            <Badge variant="outline">Anxiété: {latestMood.anxiety_level}/10</Badge>
                        </div>
                    </div>
                </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-3 h-8">
                    <TabsTrigger value="mood" className="text-xs">Humeur</TabsTrigger>
                    <TabsTrigger value="diagnosis" className="text-xs">Diagnostics</TabsTrigger>
                    <TabsTrigger value="therapy" className="text-xs">Thérapie</TabsTrigger>
                </TabsList>

                <TabsContent value="mood" className="mt-4">
                    {moodEntries.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground">
                            <Smile className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Aucun suivi d'humeur</p>
                            <Button variant="link" size="sm" onClick={() => openAddDialog('mood_check')}>
                                Ajouter un suivi
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {moodEntries.slice(0, 5).map((entry) => (
                                <div key={entry.id} className="p-2 rounded-lg border bg-card flex items-center gap-3">
                                    {getMoodIcon(entry.mood_score)}
                                    <div className="flex-1 text-xs">
                                        <span className="text-muted-foreground">
                                            {format(new Date(entry.entry_date), 'dd/MM/yyyy', { locale: fr })}
                                        </span>
                                    </div>
                                    <div className="flex gap-1 text-[10px]">
                                        <Badge variant="secondary">H:{entry.mood_score}</Badge>
                                        <Badge variant="secondary">A:{entry.anxiety_level}</Badge>
                                        <Badge variant="secondary">S:{entry.sleep_quality}</Badge>
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
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="diagnosis" className="mt-4">
                    {diagnosisEntries.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground">
                            <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Aucun diagnostic</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {diagnosisEntries.map((entry) => (
                                <div key={entry.id} className="p-3 rounded-lg border bg-card">
                                    <div className="font-medium text-sm">{entry.diagnosis}</div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        {format(new Date(entry.entry_date), 'dd/MM/yyyy', { locale: fr })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="therapy" className="mt-4">
                    {therapyEntries.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground">
                            <p>Aucun suivi thérapeutique</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {therapyEntries.map((entry) => (
                                <div key={entry.id} className="p-3 rounded-lg border bg-card">
                                    <div className="font-medium text-sm">
                                        {THERAPY_TYPES.find(t => t.value === entry.therapy_type)?.label || entry.therapy_type}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        {entry.therapist_name && <span>{entry.therapist_name} • </span>}
                                        {format(new Date(entry.entry_date), 'dd/MM/yyyy', { locale: fr })}
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
                        <DialogTitle>{editing ? 'Modifier l\'entrée' : 'Nouvelle entrée'}</DialogTitle>
                        <DialogDescription>Santé mentale et bien-être</DialogDescription>
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

                        {formData.entry_type === 'mood_check' && (
                            <>
                                <div className="space-y-2">
                                    <Label>Humeur (1-10): {formData.mood_score}</Label>
                                    <Slider value={[formData.mood_score]} onValueChange={([v]) => setFormData({ ...formData, mood_score: v })} max={10} min={1} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Anxiété (1-10): {formData.anxiety_level}</Label>
                                    <Slider value={[formData.anxiety_level]} onValueChange={([v]) => setFormData({ ...formData, anxiety_level: v })} max={10} min={1} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Qualité sommeil (1-10): {formData.sleep_quality}</Label>
                                    <Slider value={[formData.sleep_quality]} onValueChange={([v]) => setFormData({ ...formData, sleep_quality: v })} max={10} min={1} />
                                </div>
                            </>
                        )}

                        {formData.entry_type === 'diagnosis' && (
                            <div className="space-y-2">
                                <Label>Diagnostic</Label>
                                <Select value={formData.diagnosis} onValueChange={(v) => setFormData({ ...formData, diagnosis: v })}>
                                    <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                                    <SelectContent>
                                        {DIAGNOSES.map((d) => (
                                            <SelectItem key={d} value={d}>{d}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {['therapy', 'follow_up'].includes(formData.entry_type) && (
                            <>
                                <div className="space-y-2">
                                    <Label>Type de thérapie</Label>
                                    <Select value={formData.therapy_type} onValueChange={(v) => setFormData({ ...formData, therapy_type: v })}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {THERAPY_TYPES.map((t) => (
                                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Thérapeute</Label>
                                    <Input value={formData.therapist_name} onChange={(e) => setFormData({ ...formData, therapist_name: e.target.value })} />
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

export default MentalHealthCard;
