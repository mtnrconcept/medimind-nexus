/**
 * PatientPreventionEditor - Screening and prevention tracking
 */
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Shield, Plus, Trash2, Loader2, Calendar, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Props { patientId: string; }

const SCREENINGS = [
    { value: 'colorectal_cancer', label: 'Cancer colorectal', freq: '2 ans (50-74 ans)' },
    { value: 'breast_cancer', label: 'Cancer du sein', freq: '2 ans (50-74 ans)' },
    { value: 'cervical_cancer', label: 'Cancer du col', freq: '3 ans (25-65 ans)' },
    { value: 'prostate_cancer', label: 'Cancer prostate', freq: 'Annuel (>50 ans)' },
    { value: 'diabetes', label: 'Diabète', freq: '3 ans (>45 ans)' },
    { value: 'cardiovascular', label: 'Risque cardiovasculaire', freq: '5 ans' },
    { value: 'osteoporosis', label: 'Ostéoporose', freq: 'Selon risque' },
    { value: 'hepatitis', label: 'Hépatites', freq: 'Selon exposition' },
    { value: 'hiv', label: 'VIH', freq: 'Selon risque' },
    { value: 'vision', label: 'Vision', freq: '2 ans (>40 ans)' },
    { value: 'hearing', label: 'Audition', freq: '5 ans (>50 ans)' },
    { value: 'dental', label: 'Dentaire', freq: 'Annuel' },
];

const PatientPreventionEditor = ({ patientId }: Props) => {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [form, setForm] = useState<any>({});

    useEffect(() => { fetchData(); }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data } = await supabase.from('patient_prevention').select('*').eq('patient_id', patientId).order('next_due_date');
        setItems(data || []);
        setLoading(false);
    };

    const addItem = async () => {
        if (!form.screening_type) { toast.error('Type de dépistage requis'); return; }
        await supabase.from('patient_prevention').insert({ ...form, patient_id: patientId });
        toast.success('Dépistage ajouté');
        setDialogOpen(false); setForm({}); fetchData();
    };

    const deleteItem = async (id: string) => {
        await supabase.from('patient_prevention').delete().eq('id', id);
        fetchData();
    };

    const getStatus = (item: any) => {
        if (!item.next_due_date) return { label: 'Non planifié', color: 'bg-gray-500', icon: Clock };
        const days = differenceInDays(new Date(item.next_due_date), new Date());
        if (days < 0) return { label: 'En retard', color: 'bg-red-500', icon: AlertTriangle };
        if (days < 30) return { label: 'Bientôt', color: 'bg-orange-500', icon: Clock };
        return { label: 'À jour', color: 'bg-green-500', icon: CheckCircle };
    };

    const getLabel = (type: string) => SCREENINGS.find(s => s.value === type)?.label || type;

    if (loading) return <Card><CardContent className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></CardContent></Card>;

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> Prévention & Dépistages</CardTitle>
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Ajouter</Button></DialogTrigger>
                        <DialogContent>
                            <DialogHeader><DialogTitle>Nouveau dépistage</DialogTitle></DialogHeader>
                            <div className="space-y-3 mt-4">
                                <div>
                                    <Label>Type de dépistage *</Label>
                                    <Select value={form.screening_type || ''} onValueChange={(v) => setForm((p: any) => ({ ...p, screening_type: v }))}>
                                        <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                                        <SelectContent>
                                            {SCREENINGS.map(s => (
                                                <SelectItem key={s.value} value={s.value}>
                                                    <div className="flex justify-between w-full"><span>{s.label}</span><span className="text-muted-foreground text-xs ml-2">{s.freq}</span></div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><Label className="text-xs">Dernier dépistage</Label><Input type="date" value={form.last_screening_date || ''} onChange={(e) => setForm((p: any) => ({ ...p, last_screening_date: e.target.value }))} /></div>
                                    <div><Label className="text-xs">Prochain dépistage</Label><Input type="date" value={form.next_due_date || ''} onChange={(e) => setForm((p: any) => ({ ...p, next_due_date: e.target.value }))} /></div>
                                </div>
                                <div>
                                    <Label className="text-xs">Résultat</Label>
                                    <Select value={form.result_status || ''} onValueChange={(v) => setForm((p: any) => ({ ...p, result_status: v }))}>
                                        <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="normal">Normal</SelectItem>
                                            <SelectItem value="abnormal">Anormal</SelectItem>
                                            <SelectItem value="inconclusive">Non concluant</SelectItem>
                                            <SelectItem value="pending">En attente</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch checked={form.follow_up_needed || false} onCheckedChange={(v) => setForm((p: any) => ({ ...p, follow_up_needed: v }))} />
                                    <Label>Suivi nécessaire</Label>
                                </div>
                                <Button onClick={addItem} className="w-full">Ajouter</Button>
                            </div>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[300px]">
                    {items.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground"><Shield className="h-8 w-8 mx-auto mb-2 opacity-50" /><p>Aucun dépistage enregistré</p></div>
                    ) : (
                        <div className="space-y-2">
                            {items.map(item => {
                                const status = getStatus(item);
                                const StatusIcon = status.icon;
                                return (
                                    <div key={item.id} className="p-3 rounded-lg border flex justify-between items-start">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-medium text-sm">{getLabel(item.screening_type)}</span>
                                                <Badge className={`text-[10px] ${status.color}`}><StatusIcon className="h-3 w-3 mr-1" />{status.label}</Badge>
                                                {item.follow_up_needed && <Badge variant="outline" className="text-[10px] text-orange-500">Suivi requis</Badge>}
                                            </div>
                                            <div className="flex gap-3 text-[10px] text-muted-foreground">
                                                {item.last_screening_date && <span><Calendar className="h-3 w-3 inline mr-1" />Dernier: {format(new Date(item.last_screening_date), 'dd MMM yyyy', { locale: fr })}</span>}
                                                {item.next_due_date && <span>• Prochain: {format(new Date(item.next_due_date), 'dd MMM yyyy', { locale: fr })}</span>}
                                                {item.result_status && <span>• {item.result_status === 'normal' ? '✓ Normal' : item.result_status === 'abnormal' ? '⚠ Anormal' : item.result_status}</span>}
                                            </div>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteItem(item.id)}><Trash2 className="h-3 w-3" /></Button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    );
};

export default PatientPreventionEditor;
