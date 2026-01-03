/**
 * LabResultsCard - Complete lab results management
 * Features: Results by category, abnormal highlighting, trends, add/edit
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { DocumentUploadDialog } from '@/components/patient/DocumentUploadDialog';
import {
    Plus, FlaskConical, Loader2, MoreVertical, Pencil, Trash2,
    TrendingUp, TrendingDown, Minus, AlertTriangle, Calendar, Upload
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface LabResult {
    id: string;
    patient_id: string;
    test_name: string;
    test_category: string;
    value: number;
    unit: string;
    reference_min?: number;
    reference_max?: number;
    test_date: string;
    notes?: string;
    is_abnormal?: boolean;
    interpretation?: string;
    laboratory?: string;
    ordering_physician?: string;
    created_at: string;
}

interface LabResultsCardProps {
    patientId: string;
}

const LAB_CATEGORIES = [
    { value: 'hematology', label: 'Hématologie' },
    { value: 'biochemistry', label: 'Biochimie' },
    { value: 'immunology', label: 'Immunologie' },
    { value: 'microbiology', label: 'Microbiologie' },
    { value: 'urology', label: 'Urologie' },
    { value: 'endocrinology', label: 'Endocrinologie' },
    { value: 'other', label: 'Autre' },
];

const LabResultsCard = ({ patientId }: LabResultsCardProps) => {
    const [results, setResults] = useState<LabResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [importDialogOpen, setImportDialogOpen] = useState(false);
    const [editing, setEditing] = useState<LabResult | null>(null);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('all');

    const [formData, setFormData] = useState({
        test_name: '',
        test_category: 'biochemistry',
        value: '',
        unit: '',
        reference_min: '',
        reference_max: '',
        test_date: new Date().toISOString().split('T')[0],
        notes: '',
        interpretation: '',
        laboratory: '',
        ordering_physician: ''
    });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('patient_lab_results')
                .select('*')
                .eq('patient_id', patientId)
                .order('test_date', { ascending: false });

            if (error) throw error;
            setResults((data as unknown as LabResult[]) || []);
        } catch (err) {
            console.error('Error fetching lab results:', err);
            toast.error('Erreur lors du chargement des résultats');
        } finally {
            setLoading(false);
        }
    }, [patientId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const openAddDialog = () => {
        setEditing(null);
        setFormData({
            test_name: '',
            test_category: 'biochemistry',
            value: '',
            unit: '',
            reference_min: '',
            reference_max: '',
            test_date: new Date().toISOString().split('T')[0],
            notes: '',
            interpretation: '',
            laboratory: '',
            ordering_physician: ''
        });
        setDialogOpen(true);
    };

    const openEditDialog = (result: LabResult) => {
        setEditing(result);
        setFormData({
            test_name: result.test_name,
            test_category: result.test_category,
            value: String(result.value),
            unit: result.unit,
            reference_min: result.reference_min ? String(result.reference_min) : '',
            reference_max: result.reference_max ? String(result.reference_max) : '',
            test_date: result.test_date,
            notes: result.notes || '',
            interpretation: result.interpretation || '',
            laboratory: result.laboratory || '',
            ordering_physician: result.ordering_physician || ''
        });
        setDialogOpen(true);
    };

    const handleSave = async () => {
        if (!formData.test_name || !formData.value) {
            toast.error('Veuillez remplir les champs obligatoires');
            return;
        }

        setSaving(true);
        try {
            const value = parseFloat(formData.value);
            const refMin = formData.reference_min ? parseFloat(formData.reference_min) : null;
            const refMax = formData.reference_max ? parseFloat(formData.reference_max) : null;

            const isAbnormal = (refMin !== null && value < refMin) || (refMax !== null && value > refMax);

            const payload = {
                patient_id: patientId,
                test_name: formData.test_name,
                test_category: formData.test_category,
                value,
                unit: formData.unit,
                reference_min: refMin,
                reference_max: refMax,
                test_date: formData.test_date,
                notes: formData.notes || null,
                is_abnormal: isAbnormal,
                interpretation: formData.interpretation || null,
                laboratory: formData.laboratory || null,
                ordering_physician: formData.ordering_physician || null
            };

            if (editing) {
                const { error } = await supabase
                    .from('patient_lab_results')
                    .update(payload)
                    .eq('id', editing.id);
                if (error) throw error;
                toast.success('Résultat mis à jour');
            } else {
                const { error } = await supabase
                    .from('patient_lab_results')
                    .insert([payload]);
                if (error) throw error;
                toast.success('Résultat ajouté');
            }

            setDialogOpen(false);
            fetchData();
        } catch (error: unknown) {
            const err = error as { message?: string };
            console.error('Error saving lab result:', err);
            toast.error('Erreur lors de l\'enregistrement: ' + (err.message || ''));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Supprimer ce résultat ?')) return;

        try {
            const { error } = await supabase
                .from('patient_lab_results')
                .delete()
                .eq('id', id);
            if (error) throw error;
            toast.success('Résultat supprimé');
            fetchData();
        } catch (err) {
            console.error('Error deleting lab result:', err);
            toast.error('Erreur lors de la suppression');
        }
    };

    const getTrendIcon = (result: LabResult) => {
        // Find previous result for same test
        const previousResults = results.filter(
            r => r.test_name === result.test_name &&
                new Date(r.test_date) < new Date(result.test_date)
        ).sort((a, b) => new Date(b.test_date).getTime() - new Date(a.test_date).getTime());

        if (previousResults.length === 0) return null;

        const previous = previousResults[0];
        if (result.value > previous.value) {
            return <TrendingUp className="h-4 w-4 text-red-500" />;
        } else if (result.value < previous.value) {
            return <TrendingDown className="h-4 w-4 text-green-500" />;
        }
        return <Minus className="h-4 w-4 text-slate-400" />;
    };

    const filteredResults = activeTab === 'all'
        ? results
        : activeTab === 'abnormal'
            ? results.filter(r => r.is_abnormal)
            : results.filter(r => r.test_category === activeTab);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{results.length} résultat(s)</span>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setImportDialogOpen(true)} className="gap-2">
                        <Upload className="h-3 w-3" />
                        Importer
                    </Button>
                    <Button size="sm" variant="outline" onClick={openAddDialog}>
                        <Plus className="h-3 w-3 mr-1" />Ajouter
                    </Button>
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid grid-cols-4 w-full">
                    <TabsTrigger value="all">Tous</TabsTrigger>
                    <TabsTrigger value="abnormal" className="text-red-600">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Anormaux
                    </TabsTrigger>
                    <TabsTrigger value="hematology">Hémato</TabsTrigger>
                    <TabsTrigger value="biochemistry">Biochimie</TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className="mt-4">
                    {filteredResults.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            Aucun résultat {activeTab !== 'all' && 'dans cette catégorie'}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filteredResults.map(result => (
                                <div
                                    key={result.id}
                                    className={`flex items-center justify-between p-3 rounded-lg border ${result.is_abnormal
                                        ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
                                        : 'bg-white dark:bg-slate-800'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <FlaskConical className={`h-5 w-5 ${result.is_abnormal ? 'text-red-500' : 'text-violet-500'}`} />
                                        <div>
                                            <div className="font-medium flex items-center gap-2">
                                                {result.test_name}
                                                {result.is_abnormal && (
                                                    <Badge variant="destructive" className="text-xs">Anormal</Badge>
                                                )}
                                            </div>
                                            <div className="text-sm text-muted-foreground flex items-center gap-2">
                                                <Calendar className="h-3 w-3" />
                                                {new Date(result.test_date).toLocaleDateString('fr-FR')}
                                                <Badge variant="outline" className="text-xs">
                                                    {LAB_CATEGORIES.find(c => c.value === result.test_category)?.label || result.test_category}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-right">
                                            <div className="font-bold flex items-center gap-1">
                                                {getTrendIcon(result)}
                                                {result.value} {result.unit}
                                            </div>
                                            {(result.reference_min || result.reference_max) && (
                                                <div className="text-xs text-muted-foreground">
                                                    Réf: {result.reference_min || '-'} - {result.reference_max || '-'} {result.unit}
                                                </div>
                                            )}
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <MoreVertical className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent>
                                                <DropdownMenuItem onClick={() => openEditDialog(result)}>
                                                    <Pencil className="h-4 w-4 mr-2" />Modifier
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleDelete(result.id)} className="text-red-600">
                                                    <Trash2 className="h-4 w-4 mr-2" />Supprimer
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Add/Edit Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editing ? 'Modifier le résultat' : 'Nouveau résultat'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <Label>Nom du test *</Label>
                                <Input
                                    value={formData.test_name}
                                    onChange={e => setFormData({ ...formData, test_name: e.target.value })}
                                    placeholder="Ex: Créatinine"
                                />
                            </div>
                            <div>
                                <Label>Catégorie</Label>
                                <Select
                                    value={formData.test_category}
                                    onValueChange={v => setFormData({ ...formData, test_category: v })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {LAB_CATEGORIES.map(cat => (
                                            <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Date</Label>
                                <Input
                                    type="date"
                                    value={formData.test_date}
                                    onChange={e => setFormData({ ...formData, test_date: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>Valeur *</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.value}
                                    onChange={e => setFormData({ ...formData, value: e.target.value })}
                                    placeholder="0.00"
                                />
                            </div>
                            <div>
                                <Label>Unité</Label>
                                <Input
                                    value={formData.unit}
                                    onChange={e => setFormData({ ...formData, unit: e.target.value })}
                                    placeholder="Ex: mg/dL"
                                />
                            </div>
                            <div>
                                <Label>Réf. min</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.reference_min}
                                    onChange={e => setFormData({ ...formData, reference_min: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>Réf. max</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    value={formData.reference_max}
                                    onChange={e => setFormData({ ...formData, reference_max: e.target.value })}
                                />
                            </div>
                            <div className="col-span-2">
                                <Label>Notes</Label>
                                <Input
                                    value={formData.notes}
                                    onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                    placeholder="Commentaires optionnels"
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {editing ? 'Mettre à jour' : 'Ajouter'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Import Dialog */}
            <DocumentUploadDialog
                open={importDialogOpen}
                onOpenChange={setImportDialogOpen}
                patientId={patientId}
                category="lab_results"
                onUploadComplete={() => {
                    toast.success('Document analysé, rechargement des résultats...');
                    fetchData();
                }}
            />
        </div>
    );
};

export default LabResultsCard;
