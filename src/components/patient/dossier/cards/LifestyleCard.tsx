/**
 * LifestyleCard - Complete lifestyle factors management
 * Features: Smoking, alcohol, exercise, diet, sleep with detailed tracking
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Cigarette, Wine, Dumbbell, Apple, Moon, Coffee, Loader2, Save, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface LifestyleCardProps {
    patientId: string;
}

interface LifestyleData {
    id?: string;
    smoking_status: string;
    cigarettes_per_day?: number;
    years_smoking?: number;
    quit_date?: string;
    alcohol_status: string;
    drinks_per_week?: number;
    physical_activity_level: string;
    exercise_hours_per_week?: number;
    diet_type: string;
    sleep_hours_average: number;
    sleep_quality: string;
    // caffeine_consumption: string; // Not in DB
    // stress_level: string; // Not in DB
    notes?: string;
}

const SMOKING_STATUS = [
    { value: 'never', label: 'Jamais fumé', color: 'bg-green-500/10 text-green-500' },
    { value: 'former', label: 'Ancien fumeur', color: 'bg-yellow-500/10 text-yellow-500' },
    { value: 'occasional', label: 'Fumeur occasionnel', color: 'bg-orange-500/10 text-orange-500' },
    { value: 'current', label: 'Fumeur actif', color: 'bg-red-500/10 text-red-500' },
];

const ALCOHOL_CONSUMPTION = [
    { value: 'none', label: 'Aucune', color: 'bg-green-500/10 text-green-500' },
    { value: 'occasional', label: 'Occasionnelle', color: 'bg-yellow-500/10 text-yellow-500' },
    { value: 'moderate', label: 'Modérée', color: 'bg-orange-500/10 text-orange-500' },
    { value: 'heavy', label: 'Importante', color: 'bg-red-500/10 text-red-500' },
];

const PHYSICAL_ACTIVITY = [
    { value: 'sedentary', label: 'Sédentaire', color: 'bg-red-500/10 text-red-500' },
    { value: 'light', label: 'Légère', color: 'bg-orange-500/10 text-orange-500' },
    { value: 'moderate', label: 'Modérée', color: 'bg-yellow-500/10 text-yellow-500' },
    { value: 'active', label: 'Active', color: 'bg-green-500/10 text-green-500' },
    { value: 'very_active', label: 'Très active', color: 'bg-emerald-500/10 text-emerald-500' },
];

const DIET_TYPES = [
    { value: 'balanced', label: 'Équilibrée' },
    { value: 'vegetarian', label: 'Végétarienne' },
    { value: 'vegan', label: 'Végane' },
    { value: 'mediterranean', label: 'Méditerranéenne' },
    { value: 'low_carb', label: 'Pauvre en glucides' },
    { value: 'high_protein', label: 'Riche en protéines' },
    { value: 'gluten_free', label: 'Sans gluten' },
    { value: 'no_restriction', label: 'Sans restriction' },
];

const SLEEP_QUALITY = [
    { value: 'very_poor', label: 'Très mauvaise', color: 'bg-red-500/10 text-red-500' },
    { value: 'poor', label: 'Mauvaise', color: 'bg-orange-500/10 text-orange-500' },
    { value: 'fair', label: 'Moyenne', color: 'bg-yellow-500/10 text-yellow-500' },
    { value: 'good', label: 'Bonne', color: 'bg-green-500/10 text-green-500' },
    { value: 'excellent', label: 'Excellente', color: 'bg-emerald-500/10 text-emerald-500' },
];

const CAFFEINE_CONSUMPTION = [
    { value: 'none', label: 'Aucune' },
    { value: 'low', label: '1-2 tasses/jour' },
    { value: 'moderate', label: '3-4 tasses/jour' },
    { value: 'high', label: '5+ tasses/jour' },
];

const STRESS_LEVELS = [
    { value: 'low', label: 'Faible', color: 'bg-green-500/10 text-green-500' },
    { value: 'moderate', label: 'Modéré', color: 'bg-yellow-500/10 text-yellow-500' },
    { value: 'high', label: 'Élevé', color: 'bg-orange-500/10 text-orange-500' },
    { value: 'very_high', label: 'Très élevé', color: 'bg-red-500/10 text-red-500' },
];

const LifestyleCard = ({ patientId }: LifestyleCardProps) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [data, setData] = useState<LifestyleData>({
        smoking_status: 'never',
        alcohol_status: 'none',
        physical_activity_level: 'moderate',
        diet_type: 'balanced',
        sleep_hours_average: 7,
        sleep_quality: 'good',
        // caffeine_consumption: 'low',
        // stress_level: 'moderate',
    });

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data: result } = await supabase
            .from('patient_lifestyle')
            .select('*')
            .eq('patient_id', patientId)
            .maybeSingle();
        if (result) setData(result);
        setLoading(false);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = { ...data, patient_id: patientId };
            if (data.id) {
                await supabase.from('patient_lifestyle').update(payload).eq('id', data.id);
            } else {
                const { data: result } = await supabase.from('patient_lifestyle').insert(payload).select().single();
                if (result) setData(result);
            }
            setSaved(true);
            toast.success('Mode de vie mis à jour');
            setTimeout(() => setSaved(false), 2000);
        } catch (error) {
            toast.error('Erreur lors de la sauvegarde');
        } finally {
            setSaving(false);
        }
    };

    const updateField = (field: keyof LifestyleData, value: any) => {
        setData({ ...data, [field]: value });
        setSaved(false);
    };

    const getStatusColor = (options: { value: string; color?: string }[], value: string) => {
        return options.find(o => o.value === value)?.color || 'bg-muted';
    };

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : saved ? <CheckCircle className="h-4 w-4 mr-2 text-green-500" /> : <Save className="h-4 w-4 mr-2" />}
                    {saved ? 'Enregistré' : 'Sauvegarder'}
                </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {/* Smoking */}
                <Card className="col-span-2">
                    <CardContent className="p-3">
                        <div className="flex items-center gap-3 mb-3">
                            <div className={`p-2 rounded-lg ${getStatusColor(SMOKING_STATUS, data.smoking_status)}`}>
                                <Cigarette className="h-4 w-4" />
                            </div>
                            <div className="flex-1">
                                <Label className="text-sm font-medium">Tabac</Label>
                            </div>
                        </div>
                        <Select value={data.smoking_status} onValueChange={(v) => updateField('smoking_status', v)}>
                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {SMOKING_STATUS.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>
                                        <Badge className={s.color}>{s.label}</Badge>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {(data.smoking_status === 'current' || data.smoking_status === 'occasional') && (
                            <div className="mt-2">
                                <Label className="text-xs text-muted-foreground">Cigarettes/jour: {data.cigarettes_per_day || 0}</Label>
                                <Slider
                                    value={[data.cigarettes_per_day || 0]}
                                    onValueChange={([v]) => updateField('cigarettes_per_day', v)}
                                    max={40}
                                    step={1}
                                    className="mt-1"
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Alcohol */}
                <Card>
                    <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Wine className={`h-4 w-4 ${getStatusColor(ALCOHOL_CONSUMPTION, data.alcohol_status).replace('bg-', 'text-').replace('/10', '')}`} />
                            <Label className="text-xs font-medium">Alcool</Label>
                        </div>
                        <Select value={data.alcohol_status} onValueChange={(v) => updateField('alcohol_status', v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {ALCOHOL_CONSUMPTION.map((a) => (
                                    <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>

                {/* Physical Activity */}
                <Card>
                    <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Dumbbell className={`h-4 w-4 ${getStatusColor(PHYSICAL_ACTIVITY, data.physical_activity_level).replace('bg-', 'text-').replace('/10', '')}`} />
                            <Label className="text-xs font-medium">Activité physique</Label>
                        </div>
                        <Select value={data.physical_activity_level} onValueChange={(v) => updateField('physical_activity_level', v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {PHYSICAL_ACTIVITY.map((p) => (
                                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>

                {/* Diet */}
                <Card>
                    <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Apple className="h-4 w-4 text-green-500" />
                            <Label className="text-xs font-medium">Alimentation</Label>
                        </div>
                        <Select value={data.diet_type} onValueChange={(v) => updateField('diet_type', v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {DIET_TYPES.map((d) => (
                                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>

                {/* Sleep */}
                <Card>
                    <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Moon className="h-4 w-4 text-indigo-500" />
                            <Label className="text-xs font-medium">Sommeil</Label>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>Heures/nuit</span>
                                <span className="font-medium">{data.sleep_hours_average}h</span>
                            </div>
                            <Slider
                                value={[data.sleep_hours_average]}
                                onValueChange={([v]) => updateField('sleep_hours_average', v)}
                                min={3}
                                max={12}
                                step={0.5}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Sleep Quality */}
                <Card>
                    <CardContent className="p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Moon className={`h-4 w-4 ${getStatusColor(SLEEP_QUALITY, data.sleep_quality).replace('bg-', 'text-').replace('/10', '')}`} />
                            <Label className="text-xs font-medium">Qualité sommeil</Label>
                        </div>
                        <Select value={data.sleep_quality} onValueChange={(v) => updateField('sleep_quality', v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {SLEEP_QUALITY.map((s) => (
                                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </CardContent>
                </Card>

                {/* Caffeine & Stress removed as they are not in DB schema currently */}
            </div>
        </div>
    );
};

export default LifestyleCard;
