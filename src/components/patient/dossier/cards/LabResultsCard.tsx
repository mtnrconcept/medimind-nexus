/**
 * LabResultsCard - Complete lab results management
 * Features: Results by category, abnormal highlighting, trends, add/edit
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Plus, FlaskConical, Loader2, MoreVertical, Pencil, Trash2, TrendingUp, TrendingDown, Minus, AlertTriangle, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface LabResultsCardProps {
    patientId: string;
}

interface LabResult {
    id: string;
    test_name: string;
    category: string;
    value: number;
    unit: string;
    reference_min?: number;
    reference_max?: number;
    test_date: string;
    interpretation?: string;
    is_abnormal: boolean;
    notes?: string;
}

const CATEGORIES = [
    { value: 'hematology', label: 'Hématologie' },
    { value: 'biochemistry', label: 'Biochimie' },
    { value: 'lipids', label: 'Bilan lipidique' },
    { value: 'liver', label: 'Bilan hépatique' },
    { value: 'kidney', label: 'Bilan rénal' },
    { value: 'thyroid', label: 'Thyroïde' },
    { value: 'diabetes', label: 'Glycémie/Diabète' },
    { value: 'inflammation', label: 'Inflammation' },
    { value: 'coagulation', label: 'Coagulation' },
    { value: 'vitamins', label: 'Vitamines/Minéraux' },
    { value: 'other', label: 'Autre' },
];

const COMMON_TESTS = {
    hematology: [
        { name: 'Hémoglobine', unit: 'g/dL', min: 12, max: 17 },
        { name: 'Hématocrite', unit: '%', min: 37, max: 52 },
        { name: 'Globules rouges', unit: 'M/µL', min: 4.2, max: 5.9 },
        { name: 'Globules blancs', unit: 'G/L', min: 4, max: 10 },
        { name: 'Plaquettes', unit: 'G/L', min: 150, max: 400 },
        { name: 'VGM', unit: 'fL', min: 80, max: 100 },
    ],
    biochemistry: [
        { name: 'Glucose à jeun', unit: 'g/L', min: 0.7, max: 1.1 },
        { name: 'Sodium', unit: 'mmol/L', min: 136, max: 145 },
        { name: 'Potassium', unit: 'mmol/L', min: 3.5, max: 5 },
        { name: 'Calcium', unit: 'mg/L', min: 85, max: 102 },
    ],
    lipids: [
        { name: 'Cholestérol total', unit: 'g/L', min: 0, max: 2 },
        { name: 'LDL Cholestérol', unit: 'g/L', min: 0, max: 1.3 },
        { name: 'HDL Cholestérol', unit: 'g/L', min: 0.4, max: 1.5 },
        { name: 'Triglycérides', unit: 'g/L', min: 0, max: 1.5 },
    ],
    liver: [
        { name: 'ASAT (TGO)', unit: 'UI/L', min: 0, max: 35 },
        { name: 'ALAT (TGP)', unit: 'UI/L', min: 0, max: 45 },
        { name: 'GGT', unit: 'UI/L', min: 0, max: 55 },
        { name: 'Bilirubine totale', unit: 'mg/L', min: 0, max: 12 },
    ],
    kidney: [
        { name: 'Créatinine', unit: 'mg/L', min: 6, max: 12 },
        { name: 'Urée', unit: 'g/L', min: 0.15, max: 0.45 },
        { name: 'DFG', unit: 'mL/min', min: 90, max: 120 },
    ],
    thyroid: [
        { name: 'TSH', unit: 'mUI/L', min: 0.4, max: 4 },
        { name: 'T4 libre', unit: 'pmol/L', min: 9, max: 19 },
        { name: 'T3 libre', unit: 'pmol/L', min: 2.5, max: 5.5 },
    ],
    diabetes: [
        { name: 'HbA1c', unit: '%', min: 4, max: 6 },
        { name: 'Glycémie à jeun', unit: 'g/L', min: 0.7, max: 1.1 },
    ],
    inflammation: [
        { name: 'CRP', unit: 'mg/L', min: 0, max: 5 },
        { name: 'VS', unit: 'mm/h', min: 0, max: 20 },
    ],
    coagulation: [
        { name: 'TP (Taux prothrombine)', unit: '%', min: 70, max: 100 },
        { name: 'INR', unit: '', min: 0.8, max: 1.2 },
        { name: 'TCA', unit: 's', min: 25, max: 40 },
    ],
    vitamins: [
        { name: 'Vitamine D', unit: 'ng/mL', min: 30, max: 100 },
        { name: 'Vitamine B12', unit: 'pg/mL', min: 200, max: 900 },
        { name: 'Ferritine', unit: 'ng/mL', min: 20, max: 250 },
        { name: 'Fer sérique', unit: 'µg/dL', min: 60, max: 170 },
    ],
    other: [],
};

const LabResultsCard = ({ patientId }: LabResultsCardProps) => {
    const [results, setResults] = useState<LabResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<LabResult | null>(null);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('all');

    const [formData, setFormData] = useState({
        test_name: '',
        category: 'hematology',
        value: 0,
        unit: '',
        reference_min: 0,
        reference_max: 0,
        test_date: new Date().toISOString().split('T')[0],
        interpretation: '',
        is_abnormal: false,
        notes: '',
    });

    useEffect(() => {
        fetchData();
    }, [patientId]);

    const fetchData = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('patient_lab_results')
            .select('*')
            .eq('patient_id', patientId)
            .order('test_date', { ascending: false });
        setResults(data || []);
        setLoading(false);
    };

    const openAddDialog = () => {
        setEditing(null);
        setFormData({
            test_name: '',
            category: 'hematology',
            value: 0,
            unit: '',
            reference_min: 0,
            reference_max: 0,
            test_date: new Date().toISOString().split('T')[0],
            interpretation: '',
            is_abnormal: false,
            notes: '',
        });
        setDialogOpen(true);
    };

    const openEditDialog = (result: LabResult) => {
        setEditing(result);
        setFormData({
            test_name: result.test_name,
            category: result.category,
            value: result.value,
            unit: result.unit,
            reference_min: result.reference_min || 0,
            reference_max: result.reference_max || 0,
            test_date: result.test_date || '',
            interpretation: result.interpretation || '',
            is_abnormal: result.is_abnormal,
            notes: result.notes || '',
        });
        setDialogOpen(true);
    };

    const handleTestSelect = (name: string) => {
        const tests = COMMON_TESTS[formData.category as keyof typeof COMMON_TESTS] || [];
        const test = tests.find(t => t.name === name);
        if (test) {
            setFormData({
                ...formData,
                test_name: name,
                unit: test.unit,
                reference_min: test.min,
                reference_max: test.max,
            });
        } else {
            setFormData({ ...formData, test_name: name });
        }
    };

    const checkAbnormal = (value: number, min?: number, max?: number) => {
        if (min !== undefined && value < min) return true;
        if (max !== undefined && value > max) return true;
        return false;
    };

    const handleSave = async () => {
        if (!formData.test_name.trim()) {
            toast.error('Veuillez sélectionner un test');
            return;
        }

        const isAbnormal = checkAbnormal(formData.value, formData.reference_min, formData.reference_max);
        const payload = { ...formData, is_abnormal: isAbnormal };

        setSaving(true);
        try {
            if (editing) {
                await supabase.from('patient_lab_results').update(payload).eq('id', editing.id);
                toast.success('Résultat mis à jour');
            } else {
                await supabase.from('patient_lab_results').insert({ ...payload, patient_id: patientId });
                toast.success('Résultat ajouté');
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
            await supabase.from('patient_lab_results').delete().eq('id', id);
            toast.success('Résultat supprimé');
            fetchData();
        } catch (error) {
            toast.error('Erreur');
        }
    };

    const getTrend = (result: LabResult) => {
        const previousResults = results.filter(r => r.test_name === result.test_name && r.id !== result.id);
        if (previousResults.length === 0) return null;
        const previous = previousResults[0];
        if (result.value > previous.value) return 'up';
        if (result.value < previous.value) return 'down';
        return 'stable';
    };

    const abnormalResults = results.filter(r => r.is_abnormal);
    const filteredResults = activeTab === 'all' ? results : activeTab === 'abnormal' ? abnormalResults : results.filter(r => r.category === activeTab);

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{results.length} résultat(s)</span>
                <Button size="sm" variant="outline" onClick={openAddDialog}>
                    <Plus className="h-3 w-3 mr-1" />Ajouter
                </Button>
            </div>

            {/* Abnormal highlight */}
            {abnormalResults.length > 0 && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                    <div className="flex items-center gap-2 text-red-500 text-sm font-medium mb-2">
                        <AlertTriangle className="h-4 w-4" />
                        {abnormalResults.length} valeur(s) anormale(s)
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {abnormalResults.slice(0, 5).map(r => (
                            <Badge key={r.id} variant="outline" className="text-[10px] bg-red-500/5 text-red-500 border-red-500/30">
                                {r.test_name}
                            </Badge>
                        ))}
                    </div>
                </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4 h-8">
                    <TabsTrigger value="all" className="text-xs">Tous</TabsTrigger>
                    <TabsTrigger value="abnormal" className="text-xs">Anormaux</TabsTrigger>
                    <TabsTrigger value="hematology" className="text-xs">Hémato</TabsTrigger>
                    <TabsTrigger value="biochemistry" className="text-xs">Biochimie</TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className="mt-4">
                    {filteredResults.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Aucun résultat</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredResults.map((result) => {
                                const trend = getTrend(result);
                                return (
                                    <div
                                        key={result.id}
                                        className={`p-3 rounded-lg border ${result.is_abnormal ? 'bg-red-500/5 border-red-500/30' : 'bg-card'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg ${result.is_abnormal ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                                <FlaskConical className="h-4 w-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm flex items-center gap-2">
                                                    {result.test_name}
                                                    {result.is_abnormal && <AlertTriangle className="h-3 w-3 text-red-500" />}
                                                </div>
                                                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {format(new Date(result.test_date), 'dd/MM/yyyy', { locale: fr })}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className={`font-bold text-lg ${result.is_abnormal ? 'text-red-500' : 'text-foreground'}`}>
                                                    {result.value}
                                                    <span className="text-xs text-muted-foreground ml-1">{result.unit}</span>
                                                </div>
                                                <div className="text-[10px] text-muted-foreground">
                                                    Réf: {result.reference_min} - {result.reference_max}
                                                </div>
                                            </div>
                                            {trend && (
                                                <div className={`p-1 rounded ${trend === 'up' ? 'bg-red-500/10 text-red-500' : trend === 'down' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'}`}>
                                                    {trend === 'up' ? <TrendingUp className="h-4 w-4" /> : trend === 'down' ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                                                </div>
                                            )}
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <MoreVertical className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => openEditDialog(result)}>
                                                        <Pencil className="h-4 w-4 mr-2" />Modifier
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(result.id)}>
                                                        <Trash2 className="h-4 w-4 mr-2" />Supprimer
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Add/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Modifier le résultat' : 'Ajouter un résultat'}</DialogTitle>
                        <DialogDescription>Renseignez les informations du test</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Catégorie</Label>
                            <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v, test_name: '' })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {CATEGORIES.map((c) => (
                                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Test *</Label>
                            <Select value={formData.test_name} onValueChange={handleTestSelect}>
                                <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                                <SelectContent>
                                    {(COMMON_TESTS[formData.category as keyof typeof COMMON_TESTS] || []).map((t) => (
                                        <SelectItem key={t.name} value={t.name}>{t.name}</SelectItem>
                                    ))}
                                    <SelectItem value="__custom__">Autre test...</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Valeur *</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.value}
                                    onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Unité</Label>
                                <Input value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Date</Label>
                                <Input
                                    type="date"
                                    value={formData.test_date}
                                    onChange={(e) => setFormData({ ...formData, test_date: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Réf. min</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.reference_min}
                                    onChange={(e) => setFormData({ ...formData, reference_min: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Réf. max</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.reference_max}
                                    onChange={(e) => setFormData({ ...formData, reference_max: parseFloat(e.target.value) || 0 })}
                                />
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

export default LabResultsCard;
