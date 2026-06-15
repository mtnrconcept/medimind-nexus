/**
 * PatientClinicalDataEditor - Vitals and clinical measurements
 */
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Activity, Plus, Trash2, Loader2, Heart, Thermometer, Scale, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Props { patientId: string; }

const PatientClinicalDataEditor = ({ patientId }: Props) => {
    const [records, setRecords] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [form, setForm] = useState<any>({ recorded_at: new Date().toISOString().split('T')[0] });

    useEffect(() => { fetchData(); }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data } = await supabase.from('patient_clinical_data').select('*').eq('patient_id', patientId).order('recorded_at', { ascending: false }).limit(20);
        setRecords(data || []);
        setLoading(false);
    };

    const addRecord = async () => {
        const bmi = form.weight_kg && form.height_cm ? (form.weight_kg / ((form.height_cm / 100) ** 2)).toFixed(1) : null;
        await supabase.from('patient_clinical_data').insert({ ...form, patient_id: patientId, bmi: bmi ? parseFloat(bmi) : null });
        toast.success('Données enregistrées');
        setDialogOpen(false); setForm({ recorded_at: new Date().toISOString().split('T')[0] }); fetchData();
    };

    const deleteRecord = async (id: string) => {
        await supabase.from('patient_clinical_data').delete().eq('id', id);
        fetchData();
    };

    const getBPStatus = (sys: number, dia: number) => {
        if (sys >= 180 || dia >= 120) return { label: 'Critique', color: 'text-red-600' };
        if (sys >= 140 || dia >= 90) return { label: 'Élevée', color: 'text-orange-500' };
        if (sys >= 120 || dia >= 80) return { label: 'Limite', color: 'text-yellow-600' };
        return { label: 'Normale', color: 'text-green-500' };
    };

    if (loading) return <Card><CardContent className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></CardContent></Card>;

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2"><Activity className="h-5 w-5 text-primary" /> Données Cliniques</CardTitle>
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Nouvelle mesure</Button></DialogTrigger>
                        <DialogContent className="max-w-md">
                            <DialogHeader><DialogTitle>Enregistrer des constantes</DialogTitle></DialogHeader>
                            <ScrollArea className="max-h-[60vh]">
                                <div className="space-y-4 mt-4 pr-4">
                                    <div><Label>Date de mesure</Label><Input type="date" value={form.recorded_at} onChange={(e) => setForm((p: any) => ({ ...p, recorded_at: e.target.value }))} /></div>

                                    <div className="border rounded-lg p-3 space-y-3">
                                        <Label className="flex items-center gap-2"><Heart className="h-4 w-4 text-red-500" />Tension artérielle</Label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><Label className="text-xs">Systolique (mmHg)</Label><Input type="number" value={form.systolic_bp || ''} onChange={(e) => setForm((p: any) => ({ ...p, systolic_bp: parseInt(e.target.value) || null }))} placeholder="120" /></div>
                                            <div><Label className="text-xs">Diastolique (mmHg)</Label><Input type="number" value={form.diastolic_bp || ''} onChange={(e) => setForm((p: any) => ({ ...p, diastolic_bp: parseInt(e.target.value) || null }))} placeholder="80" /></div>
                                        </div>
                                        <div><Label className="text-xs">Fréquence cardiaque (bpm)</Label><Input type="number" value={form.heart_rate || ''} onChange={(e) => setForm((p: any) => ({ ...p, heart_rate: parseInt(e.target.value) || null }))} placeholder="72" /></div>
                                    </div>

                                    <div className="border rounded-lg p-3 space-y-3">
                                        <Label className="flex items-center gap-2"><Thermometer className="h-4 w-4 text-orange-500" />Autres constantes</Label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><Label className="text-xs">Température (°C)</Label><Input type="number" step="0.1" value={form.temperature || ''} onChange={(e) => setForm((p: any) => ({ ...p, temperature: parseFloat(e.target.value) || null }))} placeholder="36.8" /></div>
                                            <div><Label className="text-xs">SpO2 (%)</Label><Input type="number" value={form.oxygen_saturation || ''} onChange={(e) => setForm((p: any) => ({ ...p, oxygen_saturation: parseInt(e.target.value) || null }))} placeholder="98" /></div>
                                        </div>
                                        <div><Label className="text-xs">Fréq. respiratoire (/min)</Label><Input type="number" value={form.respiratory_rate || ''} onChange={(e) => setForm((p: any) => ({ ...p, respiratory_rate: parseInt(e.target.value) || null }))} placeholder="16" /></div>
                                    </div>

                                    <div className="border rounded-lg p-3 space-y-3">
                                        <Label className="flex items-center gap-2"><Scale className="h-4 w-4 text-blue-500" />Mesures anthropométriques</Label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><Label className="text-xs">Poids (kg)</Label><Input type="number" step="0.1" value={form.weight_kg || ''} onChange={(e) => setForm((p: any) => ({ ...p, weight_kg: parseFloat(e.target.value) || null }))} /></div>
                                            <div><Label className="text-xs">Taille (cm)</Label><Input type="number" value={form.height_cm || ''} onChange={(e) => setForm((p: any) => ({ ...p, height_cm: parseInt(e.target.value) || null }))} /></div>
                                        </div>
                                        <div><Label className="text-xs">Tour de taille (cm)</Label><Input type="number" value={form.waist_circumference_cm || ''} onChange={(e) => setForm((p: any) => ({ ...p, waist_circumference_cm: parseInt(e.target.value) || null }))} /></div>
                                    </div>

                                    <div className="border rounded-lg p-3 space-y-3">
                                        <Label>Douleur</Label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div><Label className="text-xs">Niveau (0-10)</Label><Input type="number" min="0" max="10" value={form.pain_level || ''} onChange={(e) => setForm((p: any) => ({ ...p, pain_level: parseInt(e.target.value) || null }))} /></div>
                                            <div><Label className="text-xs">Localisation</Label><Input value={form.pain_location || ''} onChange={(e) => setForm((p: any) => ({ ...p, pain_location: e.target.value }))} /></div>
                                        </div>
                                    </div>

                                    <div><Label>Notes</Label><Textarea value={form.notes || ''} onChange={(e) => setForm((p: any) => ({ ...p, notes: e.target.value }))} placeholder="Observations cliniques..." /></div>

                                    <Button onClick={addRecord} className="w-full">Enregistrer</Button>
                                </div>
                            </ScrollArea>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[300px]">
                    {records.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground"><Activity className="h-8 w-8 mx-auto mb-2 opacity-50" /><p>Aucune mesure enregistrée</p></div>
                    ) : (
                        <div className="space-y-2">
                            {records.map(r => (
                                <Collapsible key={r.id}>
                                    <div className="p-3 rounded-lg border">
                                        <CollapsibleTrigger className="flex justify-between items-center w-full text-left">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xs text-muted-foreground">{format(new Date(r.recorded_at), 'dd MMM yyyy', { locale: fr })}</span>
                                                {r.systolic_bp && r.diastolic_bp && (
                                                    <Badge variant="outline" className={`text-xs ${getBPStatus(r.systolic_bp, r.diastolic_bp).color}`}>
                                                        <Heart className="h-3 w-3 mr-1" />{r.systolic_bp}/{r.diastolic_bp}
                                                    </Badge>
                                                )}
                                                {r.heart_rate && <Badge variant="outline" className="text-xs">{r.heart_rate} bpm</Badge>}
                                                {r.temperature && <Badge variant="outline" className="text-xs"><Thermometer className="h-3 w-3 mr-1" />{r.temperature}°C</Badge>}
                                                {r.weight_kg && <Badge variant="outline" className="text-xs"><Scale className="h-3 w-3 mr-1" />{r.weight_kg} kg</Badge>}
                                            </div>
                                            <ChevronDown className="h-4 w-4" />
                                        </CollapsibleTrigger>
                                        <CollapsibleContent className="mt-2 pt-2 border-t">
                                            <div className="grid grid-cols-3 gap-2 text-xs">
                                                {r.oxygen_saturation && <div>SpO2: <strong>{r.oxygen_saturation}%</strong></div>}
                                                {r.respiratory_rate && <div>FR: <strong>{r.respiratory_rate}/min</strong></div>}
                                                {r.bmi && <div>IMC: <strong>{r.bmi}</strong></div>}
                                                {r.waist_circumference_cm && <div>Tour taille: <strong>{r.waist_circumference_cm} cm</strong></div>}
                                                {r.pain_level !== null && <div>Douleur: <strong>{r.pain_level}/10</strong></div>}
                                            </div>
                                            {r.notes && <p className="text-xs text-muted-foreground mt-2">{r.notes}</p>}
                                            <Button variant="ghost" size="sm" className="text-destructive mt-2" onClick={() => deleteRecord(r.id)}><Trash2 className="h-3 w-3 mr-1" />Supprimer</Button>
                                        </CollapsibleContent>
                                    </div>
                                </Collapsible>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    );
};

export default PatientClinicalDataEditor;
