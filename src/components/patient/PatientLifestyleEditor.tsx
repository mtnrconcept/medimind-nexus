/**
 * PatientLifestyleEditor - Lifestyle and risk factors
 */
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Cigarette, Wine, Dumbbell, Moon, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props { patientId: string; }

const PatientLifestyleEditor = ({ patientId }: Props) => {
    const [data, setData] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => { fetchData(); }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data: lifestyle } = await supabase.from('patient_lifestyle').select('*').eq('patient_id', patientId).maybeSingle();
        setData(lifestyle || { patient_id: patientId });
        setLoading(false);
    };

    const handleChange = (field: string, value: any) => {
        setData((p: any) => ({ ...p, [field]: value }));
        setHasChanges(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (data.id) {
                await supabase.from('patient_lifestyle').update(data).eq('id', data.id);
            } else {
                await supabase.from('patient_lifestyle').insert(data);
            }
            toast.success('Sauvegardé');
            setHasChanges(false);
            fetchData();
        } catch (e) { toast.error('Erreur'); }
        setSaving(false);
    };

    if (loading) return <Card><CardContent className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></CardContent></Card>;

    return (
        <Card>
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2"><Dumbbell className="h-5 w-5 text-primary" /> Mode de vie</CardTitle>
                    <Button size="sm" onClick={handleSave} disabled={saving || !hasChanges}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}Sauvegarder</Button>
                </div>
            </CardHeader>
            <CardContent>
                <Accordion type="multiple" defaultValue={['smoking', 'exercise']} className="space-y-2">
                    <AccordionItem value="smoking" className="border rounded-lg px-3">
                        <AccordionTrigger className="text-sm hover:no-underline"><div className="flex items-center gap-2"><Cigarette className="h-4 w-4 text-orange-500" />Tabac</div></AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-2">
                            <Select value={data.smoking_status || ''} onValueChange={(v) => handleChange('smoking_status', v)}>
                                <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="never">Jamais fumé</SelectItem>
                                    <SelectItem value="former">Ancien fumeur</SelectItem>
                                    <SelectItem value="current">Fumeur actuel</SelectItem>
                                    <SelectItem value="occasional">Occasionnel</SelectItem>
                                </SelectContent>
                            </Select>
                            {(data.smoking_status === 'current' || data.smoking_status === 'former') && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div><Label className="text-xs">Cigarettes/jour</Label><Input type="number" value={data.cigarettes_per_day || ''} onChange={(e) => handleChange('cigarettes_per_day', parseInt(e.target.value) || null)} /></div>
                                    <div><Label className="text-xs">Années de tabagisme</Label><Input type="number" value={data.smoking_years || ''} onChange={(e) => handleChange('smoking_years', parseInt(e.target.value) || null)} /></div>
                                </div>
                            )}
                            {data.smoking_status === 'former' && (
                                <div><Label className="text-xs">Date d'arrêt</Label><Input type="date" value={data.quit_date || ''} onChange={(e) => handleChange('quit_date', e.target.value)} /></div>
                            )}
                        </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="alcohol" className="border rounded-lg px-3">
                        <AccordionTrigger className="text-sm hover:no-underline"><div className="flex items-center gap-2"><Wine className="h-4 w-4 text-purple-500" />Alcool</div></AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-2">
                            <Select value={data.alcohol_status || ''} onValueChange={(v) => handleChange('alcohol_status', v)}>
                                <SelectTrigger><SelectValue placeholder="Consommation" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="never">Jamais</SelectItem>
                                    <SelectItem value="occasional">Occasionnel</SelectItem>
                                    <SelectItem value="moderate">Modéré</SelectItem>
                                    <SelectItem value="heavy">Important</SelectItem>
                                    <SelectItem value="former">Ancien buveur</SelectItem>
                                </SelectContent>
                            </Select>
                            {data.alcohol_status && data.alcohol_status !== 'never' && (
                                <div><Label className="text-xs">Verres/semaine</Label><Input type="number" value={data.drinks_per_week || ''} onChange={(e) => handleChange('drinks_per_week', parseInt(e.target.value) || null)} /></div>
                            )}
                        </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="exercise" className="border rounded-lg px-3">
                        <AccordionTrigger className="text-sm hover:no-underline"><div className="flex items-center gap-2"><Dumbbell className="h-4 w-4 text-green-500" />Activité physique</div></AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-2">
                            <Select value={data.physical_activity_level || ''} onValueChange={(v) => handleChange('physical_activity_level', v)}>
                                <SelectTrigger><SelectValue placeholder="Niveau" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="sedentary">Sédentaire</SelectItem>
                                    <SelectItem value="light">Léger</SelectItem>
                                    <SelectItem value="moderate">Modéré</SelectItem>
                                    <SelectItem value="active">Actif</SelectItem>
                                    <SelectItem value="very_active">Très actif</SelectItem>
                                </SelectContent>
                            </Select>
                            <div className="grid grid-cols-2 gap-3">
                                <div><Label className="text-xs">Type d'exercice</Label><Input value={data.exercise_type || ''} onChange={(e) => handleChange('exercise_type', e.target.value)} placeholder="Marche, natation..." /></div>
                                <div><Label className="text-xs">Fréquence</Label><Input value={data.exercise_frequency || ''} onChange={(e) => handleChange('exercise_frequency', e.target.value)} placeholder="3x/semaine" /></div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="sleep" className="border rounded-lg px-3">
                        <AccordionTrigger className="text-sm hover:no-underline"><div className="flex items-center gap-2"><Moon className="h-4 w-4 text-blue-500" />Sommeil</div></AccordionTrigger>
                        <AccordionContent className="space-y-3 pt-2">
                            <div className="grid grid-cols-2 gap-3">
                                <div><Label className="text-xs">Heures/nuit (moy.)</Label><Input type="number" step="0.5" value={data.sleep_hours_average || ''} onChange={(e) => handleChange('sleep_hours_average', parseFloat(e.target.value) || null)} /></div>
                                <div>
                                    <Label className="text-xs">Qualité</Label>
                                    <Select value={data.sleep_quality || ''} onValueChange={(v) => handleChange('sleep_quality', v)}>
                                        <SelectTrigger><SelectValue placeholder="Qualité" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="poor">Mauvaise</SelectItem>
                                            <SelectItem value="fair">Correcte</SelectItem>
                                            <SelectItem value="good">Bonne</SelectItem>
                                            <SelectItem value="excellent">Excellente</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </CardContent>
        </Card>
    );
};

export default PatientLifestyleEditor;
