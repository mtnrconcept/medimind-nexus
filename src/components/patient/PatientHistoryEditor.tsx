/**
 * PatientHistoryEditor - Medical and family history
 */
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { History, Users, Plus, Trash2, Loader2, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Props { patientId: string; }

const CATEGORIES = [
    { value: 'chronic_disease', label: 'Maladie chronique' },
    { value: 'hospitalization', label: 'Hospitalisation' },
    { value: 'surgery', label: 'Chirurgie' },
    { value: 'trauma', label: 'Traumatisme' },
    { value: 'infection', label: 'Infection' },
];

const RELATIONS = [
    { value: 'mother', label: 'Mère' },
    { value: 'father', label: 'Père' },
    { value: 'sibling', label: 'Frère/Sœur' },
    { value: 'maternal_grandmother', label: 'Grand-mère maternelle' },
    { value: 'paternal_grandfather', label: 'Grand-père paternel' },
    { value: 'child', label: 'Enfant' },
];

const PatientHistoryEditor = ({ patientId }: Props) => {
    const [medHistory, setMedHistory] = useState<any[]>([]);
    const [famHistory, setFamHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [medOpen, setMedOpen] = useState(false);
    const [famOpen, setFamOpen] = useState(false);
    const [medForm, setMedForm] = useState<any>({});
    const [famForm, setFamForm] = useState<any>({});

    useEffect(() => { fetchData(); }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const [{ data: med }, { data: fam }] = await Promise.all([
            supabase.from('patient_medical_history').select('*').eq('patient_id', patientId),
            supabase.from('patient_family_history').select('*').eq('patient_id', patientId),
        ]);
        setMedHistory(med || []);
        setFamHistory(fam || []);
        setLoading(false);
    };

    const addMed = async () => {
        if (!medForm.title || !medForm.category) { toast.error('Requis'); return; }
        await supabase.from('patient_medical_history').insert({ ...medForm, patient_id: patientId });
        toast.success('Ajouté');
        setMedOpen(false); setMedForm({}); fetchData();
    };

    const addFam = async () => {
        if (!famForm.condition || !famForm.relationship) { toast.error('Requis'); return; }
        await supabase.from('patient_family_history').insert({ ...famForm, patient_id: patientId });
        toast.success('Ajouté');
        setFamOpen(false); setFamForm({}); fetchData();
    };

    const delMed = async (id: string) => { await supabase.from('patient_medical_history').delete().eq('id', id); fetchData(); };
    const delFam = async (id: string) => { await supabase.from('patient_family_history').delete().eq('id', id); fetchData(); };

    if (loading) return <Card><CardContent className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></CardContent></Card>;

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2"><History className="h-5 w-5 text-primary" /> Antécédents</CardTitle>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="personal">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="personal" className="text-xs"><Activity className="h-3 w-3 mr-1" />Personnels ({medHistory.length})</TabsTrigger>
                        <TabsTrigger value="family" className="text-xs"><Users className="h-3 w-3 mr-1" />Familiaux ({famHistory.length})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="personal" className="mt-4">
                        <div className="flex justify-end mb-3">
                            <Dialog open={medOpen} onOpenChange={setMedOpen}>
                                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Ajouter</Button></DialogTrigger>
                                <DialogContent>
                                    <DialogHeader><DialogTitle>Nouvel antécédent</DialogTitle></DialogHeader>
                                    <div className="space-y-3 mt-4">
                                        <Select value={medForm.category || ''} onValueChange={(v) => setMedForm((p: any) => ({ ...p, category: v }))}>
                                            <SelectTrigger><SelectValue placeholder="Catégorie *" /></SelectTrigger>
                                            <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <Input value={medForm.title || ''} onChange={(e) => setMedForm((p: any) => ({ ...p, title: e.target.value }))} placeholder="Titre *" />
                                        <Textarea value={medForm.description || ''} onChange={(e) => setMedForm((p: any) => ({ ...p, description: e.target.value }))} placeholder="Description" />
                                        <Input type="date" value={medForm.start_date || ''} onChange={(e) => setMedForm((p: any) => ({ ...p, start_date: e.target.value }))} />
                                        <div className="flex items-center gap-2"><Switch checked={medForm.is_ongoing || false} onCheckedChange={(v) => setMedForm((p: any) => ({ ...p, is_ongoing: v }))} /><Label>En cours</Label></div>
                                        <Button onClick={addMed} className="w-full">Ajouter</Button>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                        <ScrollArea className="h-[250px]">
                            {medHistory.length === 0 ? <p className="text-center text-muted-foreground py-8">Aucun antécédent</p> : (
                                <div className="space-y-2">
                                    {medHistory.map(item => (
                                        <div key={item.id} className="p-3 rounded-lg border flex justify-between items-start">
                                            <div>
                                                <div className="flex gap-2 items-center"><span className="font-medium text-sm">{item.title}</span><Badge variant="outline" className="text-[10px]">{CATEGORIES.find(c => c.value === item.category)?.label}</Badge>{item.is_ongoing && <Badge className="text-[10px] bg-orange-500">En cours</Badge>}</div>
                                                {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
                                                {item.start_date && <span className="text-[10px] text-muted-foreground">{format(new Date(item.start_date), 'dd/MM/yyyy')}</span>}
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => delMed(item.id)}><Trash2 className="h-3 w-3" /></Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </TabsContent>

                    <TabsContent value="family" className="mt-4">
                        <div className="flex justify-end mb-3">
                            <Dialog open={famOpen} onOpenChange={setFamOpen}>
                                <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Ajouter</Button></DialogTrigger>
                                <DialogContent>
                                    <DialogHeader><DialogTitle>Antécédent familial</DialogTitle></DialogHeader>
                                    <div className="space-y-3 mt-4">
                                        <Select value={famForm.relationship || ''} onValueChange={(v) => setFamForm((p: any) => ({ ...p, relationship: v }))}>
                                            <SelectTrigger><SelectValue placeholder="Lien *" /></SelectTrigger>
                                            <SelectContent>{RELATIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <Input value={famForm.condition || ''} onChange={(e) => setFamForm((p: any) => ({ ...p, condition: e.target.value }))} placeholder="Condition *" />
                                        <Input type="number" value={famForm.age_at_diagnosis || ''} onChange={(e) => setFamForm((p: any) => ({ ...p, age_at_diagnosis: parseInt(e.target.value) || null }))} placeholder="Âge au diagnostic" />
                                        <div className="flex items-center gap-2"><Switch checked={famForm.is_hereditary || false} onCheckedChange={(v) => setFamForm((p: any) => ({ ...p, is_hereditary: v }))} /><Label>Héréditaire</Label></div>
                                        <Button onClick={addFam} className="w-full">Ajouter</Button>
                                    </div>
                                </DialogContent>
                            </Dialog>
                        </div>
                        <ScrollArea className="h-[250px]">
                            {famHistory.length === 0 ? <p className="text-center text-muted-foreground py-8">Aucun antécédent familial</p> : (
                                <div className="space-y-2">
                                    {famHistory.map(item => (
                                        <div key={item.id} className="p-3 rounded-lg border flex justify-between items-start">
                                            <div>
                                                <div className="flex gap-2 items-center"><Badge variant="secondary" className="text-[10px]">{RELATIONS.find(r => r.value === item.relationship)?.label}</Badge><span className="font-medium text-sm">{item.condition}</span>{item.is_hereditary && <Badge className="text-[10px] bg-purple-500">Héréditaire</Badge>}</div>
                                                {item.age_at_diagnosis && <span className="text-[10px] text-muted-foreground">Diagnostiqué à {item.age_at_diagnosis} ans</span>}
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => delFam(item.id)}><Trash2 className="h-3 w-3" /></Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    );
};

export default PatientHistoryEditor;
