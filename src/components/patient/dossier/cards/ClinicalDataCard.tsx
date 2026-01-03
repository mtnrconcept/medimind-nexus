/**
 * ClinicalDataCard - Vital signs and clinical measurements
 * Features: BP, HR, SpO2, temperature, weight, height with trends
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
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
import { Plus, Heart, Loader2, MoreVertical, Pencil, Trash2, Thermometer, Weight, Ruler, Activity, Wind, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ClinicalDataCardProps {
    patientId: string;
}

interface ClinicalData {
    id: string;
    recorded_at: string;
    systolic_bp?: number;
    diastolic_bp?: number;
    heart_rate?: number;
    spo2?: number;
    temperature?: number;
    weight_kg?: number;
    height_cm?: number;
    respiratory_rate?: number;
    pain_level?: number;
    notes?: string;
}

const VITAL_RANGES = {
    systolic_bp: { min: 90, max: 140, unit: 'mmHg' },
    diastolic_bp: { min: 60, max: 90, unit: 'mmHg' },
    heart_rate: { min: 60, max: 100, unit: 'bpm' },
    spo2: { min: 95, max: 100, unit: '%' },
    temperature: { min: 36, max: 37.5, unit: '°C' },
    respiratory_rate: { min: 12, max: 20, unit: '/min' },
};

const ClinicalDataCard = ({ patientId }: ClinicalDataCardProps) => {
    const [data, setData] = useState<ClinicalData[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<ClinicalData | null>(null);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        recorded_at: new Date().toISOString().slice(0, 16),
        systolic_bp: undefined as number | undefined,
        diastolic_bp: undefined as number | undefined,
        heart_rate: undefined as number | undefined,
        spo2: undefined as number | undefined,
        temperature: undefined as number | undefined,
        weight_kg: undefined as number | undefined,
        height_cm: undefined as number | undefined,
        respiratory_rate: undefined as number | undefined,
        pain_level: undefined as number | undefined,
        notes: '',
    });

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data: result } = await supabase
            .from('patient_clinical_data')
            .select('*')
            .eq('patient_id', patientId)
            .order('recorded_at', { ascending: false })
            .limit(20);
        setData(result || []);
        setLoading(false);
    };

    const openAddDialog = () => {
        setEditing(null);
        setFormData({
            recorded_at: new Date().toISOString().slice(0, 16),
            systolic_bp: undefined,
            diastolic_bp: undefined,
            heart_rate: undefined,
            spo2: undefined,
            temperature: undefined,
            weight_kg: undefined,
            height_cm: undefined,
            respiratory_rate: undefined,
            pain_level: undefined,
            notes: '',
        });
        setDialogOpen(true);
    };

    const openEditDialog = (item: ClinicalData) => {
        setEditing(item);
        setFormData({
            recorded_at: item.recorded_at?.slice(0, 16) || '',
            systolic_bp: item.systolic_bp,
            diastolic_bp: item.diastolic_bp,
            heart_rate: item.heart_rate,
            spo2: item.spo2,
            temperature: item.temperature,
            weight_kg: item.weight_kg,
            height_cm: item.height_cm,
            respiratory_rate: item.respiratory_rate,
            pain_level: item.pain_level,
            notes: item.notes || '',
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = Object.fromEntries(Object.entries(formData).filter(([_, v]) => v !== undefined && v !== ''));
            if (editing) {
                await supabase.from('patient_clinical_data').update(payload).eq('id', editing.id);
                toast.success('Données mises à jour');
            } else {
                await supabase.from('patient_clinical_data').insert({ ...payload, patient_id: patientId });
                toast.success('Données ajoutées');
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
            await supabase.from('patient_clinical_data').delete().eq('id', id);
            toast.success('Données supprimées');
            fetchData();
        } catch (error) {
            toast.error('Erreur');
        }
    };

    const isAbnormal = (key: keyof typeof VITAL_RANGES, value?: number) => {
        if (value === undefined) return false;
        const range = VITAL_RANGES[key];
        return value < range.min || value > range.max;
    };

    const getTrend = (key: keyof ClinicalData) => {
        if (data.length < 2) return null;
        const current = data[0][key] as number | undefined;
        const previous = data[1][key] as number | undefined;
        if (current === undefined || previous === undefined) return null;
        if (current > previous) return 'up';
        if (current < previous) return 'down';
        return 'stable';
    };

    const latest = data[0];
    const bmi = latest?.weight_kg && latest?.height_cm
        ? (latest.weight_kg / ((latest.height_cm / 100) ** 2)).toFixed(1)
        : null;

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{data.length} mesure(s)</span>
                <Button size="sm" variant="outline" onClick={openAddDialog}>
                    <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
            </div>

            {/* Current vitals grid */}
            {latest ? (
                <div className="grid grid-cols-3 gap-2">
                    {latest.systolic_bp && latest.diastolic_bp && (
                        <Card className={isAbnormal('systolic_bp', latest.systolic_bp) ? 'border-red-500/30' : ''}>
                            <CardContent className="p-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <Activity className="h-3 w-3" />TA
                                </div>
                                <div className={`font-bold ${isAbnormal('systolic_bp', latest.systolic_bp) ? 'text-red-500' : ''}`}>
                                    {latest.systolic_bp}/{latest.diastolic_bp}
                                    <span className="text-xs font-normal ml-1">mmHg</span>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                    {latest.heart_rate && (
                        <Card className={isAbnormal('heart_rate', latest.heart_rate) ? 'border-red-500/30' : ''}>
                            <CardContent className="p-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <Heart className="h-3 w-3" />FC
                                </div>
                                <div className={`font-bold flex items-center gap-1 ${isAbnormal('heart_rate', latest.heart_rate) ? 'text-red-500' : ''}`}>
                                    {latest.heart_rate}
                                    <span className="text-xs font-normal">bpm</span>
                                    {getTrend('heart_rate') === 'up' && <TrendingUp className="h-3 w-3 text-red-500" />}
                                    {getTrend('heart_rate') === 'down' && <TrendingDown className="h-3 w-3 text-green-500" />}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                    {latest.spo2 && (
                        <Card className={isAbnormal('spo2', latest.spo2) ? 'border-red-500/30' : ''}>
                            <CardContent className="p-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <Wind className="h-3 w-3" />SpO2
                                </div>
                                <div className={`font-bold ${isAbnormal('spo2', latest.spo2) ? 'text-red-500' : ''}`}>
                                    {latest.spo2}%
                                </div>
                            </CardContent>
                        </Card>
                    )}
                    {latest.temperature && (
                        <Card className={isAbnormal('temperature', latest.temperature) ? 'border-red-500/30' : ''}>
                            <CardContent className="p-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <Thermometer className="h-3 w-3" />Temp
                                </div>
                                <div className={`font-bold ${isAbnormal('temperature', latest.temperature) ? 'text-red-500' : ''}`}>
                                    {latest.temperature}°C
                                </div>
                            </CardContent>
                        </Card>
                    )}
                    {latest.weight_kg && (
                        <Card>
                            <CardContent className="p-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <Weight className="h-3 w-3" />Poids
                                </div>
                                <div className="font-bold flex items-center gap-1">
                                    {latest.weight_kg}<span className="text-xs font-normal">kg</span>
                                    {getTrend('weight_kg') === 'up' && <TrendingUp className="h-3 w-3 text-orange-500" />}
                                    {getTrend('weight_kg') === 'down' && <TrendingDown className="h-3 w-3 text-green-500" />}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                    {bmi && (
                        <Card>
                            <CardContent className="p-3">
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                    <Ruler className="h-3 w-3" />IMC
                                </div>
                                <div className={`font-bold ${parseFloat(bmi) > 30 ? 'text-orange-500' : parseFloat(bmi) < 18.5 ? 'text-yellow-500' : ''}`}>
                                    {bmi}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            ) : (
                <div className="text-center py-8 text-muted-foreground">
                    <Heart className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Aucune donnée clinique</p>
                </div>
            )}

            {/* History */}
            {data.length > 1 && (
                <div className="space-y-2">
                    <div className="text-sm font-medium">Historique</div>
                    {data.slice(0, 5).map((item) => (
                        <div key={item.id} className="p-2 rounded-lg border bg-card text-xs flex items-center justify-between">
                            <span className="text-muted-foreground">
                                {format(new Date(item.recorded_at), 'dd/MM/yyyy HH:mm', { locale: fr })}
                            </span>
                            <div className="flex items-center gap-3">
                                {item.systolic_bp && <span>TA {item.systolic_bp}/{item.diastolic_bp}</span>}
                                {item.heart_rate && <span>FC {item.heart_rate}</span>}
                                {item.temperature && <span>{item.temperature}°C</span>}
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6">
                                        <MoreVertical className="h-3 w-3" />
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
                    ))}
                </div>
            )}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Modifier les données' : 'Nouvelle mesure'}</DialogTitle>
                        <DialogDescription>Renseignez les constantes vitales</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                        <div className="space-y-2">
                            <Label>Date/Heure</Label>
                            <Input type="datetime-local" value={formData.recorded_at} onChange={(e) => setFormData({ ...formData, recorded_at: e.target.value })} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>TA Systolique (mmHg)</Label>
                                <Input type="number" placeholder="120" value={formData.systolic_bp || ''} onChange={(e) => setFormData({ ...formData, systolic_bp: parseInt(e.target.value) || undefined })} />
                            </div>
                            <div className="space-y-2">
                                <Label>TA Diastolique (mmHg)</Label>
                                <Input type="number" placeholder="80" value={formData.diastolic_bp || ''} onChange={(e) => setFormData({ ...formData, diastolic_bp: parseInt(e.target.value) || undefined })} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Fréquence cardiaque (bpm)</Label>
                                <Input type="number" placeholder="70" value={formData.heart_rate || ''} onChange={(e) => setFormData({ ...formData, heart_rate: parseInt(e.target.value) || undefined })} />
                            </div>
                            <div className="space-y-2">
                                <Label>SpO2 (%)</Label>
                                <Input type="number" placeholder="98" value={formData.spo2 || ''} onChange={(e) => setFormData({ ...formData, spo2: parseInt(e.target.value) || undefined })} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Température (°C)</Label>
                                <Input type="number" step="0.1" placeholder="37.0" value={formData.temperature || ''} onChange={(e) => setFormData({ ...formData, temperature: parseFloat(e.target.value) || undefined })} />
                            </div>
                            <div className="space-y-2">
                                <Label>FR (/min)</Label>
                                <Input type="number" placeholder="16" value={formData.respiratory_rate || ''} onChange={(e) => setFormData({ ...formData, respiratory_rate: parseInt(e.target.value) || undefined })} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Poids (kg)</Label>
                                <Input type="number" step="0.1" placeholder="70" value={formData.weight_kg || ''} onChange={(e) => setFormData({ ...formData, weight_kg: parseFloat(e.target.value) || undefined })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Taille (cm)</Label>
                                <Input type="number" placeholder="170" value={formData.height_cm || ''} onChange={(e) => setFormData({ ...formData, height_cm: parseInt(e.target.value) || undefined })} />
                            </div>
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

export default ClinicalDataCard;
