/**
 * PatientMedicalDataEditor - Comprehensive medical data entry component
 * 
 * Allows editing of:
 * - Medications
 * - Pathologies  
 * - Allergies
 * - Vaccinations
 * - Symptoms
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect, SearchableMultiSelect, type SelectOption } from '@/components/ui/searchable-select';
import {
    Pill,
    Stethoscope,
    AlertTriangle,
    Syringe,
    Activity,
    Plus,
    Trash2,
    Edit,
    Loader2,
    Save,
    X
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

// =====================================================
// TYPES
// =====================================================

interface PatientMedicalDataEditorProps {
    patientId: string;
    onDataChange?: () => void;
}

interface PatientMedication {
    id: string;
    medication_id: string;
    medication?: { id: string; name: string; dosage_forms?: string[] };
    dosage: string | null;
    frequency: string | null;
    start_date: string | null;
    end_date: string | null;
    is_active: boolean;
    notes: string | null;
}

interface PatientPathology {
    id: string;
    pathology_id: string;
    pathology?: { id: string; name: string; icd_code: string | null };
    diagnosis_date: string | null;
    status: string;
    notes: string | null;
}

interface PatientAllergy {
    id: string;
    allergen: string;
    allergen_type: string | null;
    severity: string | null;
    reaction: string | null;
    notes: string | null;
}

interface PatientVaccination {
    id: string;
    vaccine_name: string;
    vaccine_type: string | null;
    vaccination_date: string;
    booster_date: string | null;
    notes: string | null;
}

interface PatientSymptom {
    id: string;
    symptom_id: string | null;
    symptom?: { id: string; name: string; body_system: string | null };
    symptom_name: string;
    severity: string | null;
    onset_date: string | null;
    is_active: boolean;
    notes: string | null;
}

// =====================================================
// COMMON VACCINES LIST
// =====================================================

const COMMON_VACCINES = [
    'COVID-19 (Pfizer-BioNTech)',
    'COVID-19 (Moderna)',
    'Grippe saisonnière',
    'Hépatite A',
    'Hépatite B',
    'Hépatite A+B (Twinrix)',
    'Tétanos',
    'Diphtérie-Tétanos-Coqueluche (DTPa)',
    'Poliomyélite',
    'Rougeole-Oreillons-Rubéole (ROR)',
    'Varicelle',
    'Zona (Shingrix)',
    'Pneumocoque (Prevenar 13)',
    'Pneumocoque (Pneumovax 23)',
    'Méningocoque ACWY',
    'Méningocoque B',
    'Papillomavirus (HPV)',
    'Fièvre jaune',
    'Encéphalite japonaise',
    'Rage',
    'Typhoïde',
    'BCG (Tuberculose)',
];

const ALLERGEN_TYPES = [
    { value: 'medication', label: 'Médicament' },
    { value: 'food', label: 'Alimentaire' },
    { value: 'environmental', label: 'Environnemental' },
    { value: 'insect', label: 'Insecte' },
    { value: 'latex', label: 'Latex' },
    { value: 'other', label: 'Autre' },
];

const SEVERITY_LEVELS = [
    { value: 'mild', label: 'Légère' },
    { value: 'moderate', label: 'Modérée' },
    { value: 'severe', label: 'Sévère' },
    { value: 'life_threatening', label: 'Vitale' },
];

const PATHOLOGY_STATUS = [
    { value: 'active', label: 'Active' },
    { value: 'chronic', label: 'Chronique' },
    { value: 'resolved', label: 'Résolue' },
    { value: 'in_remission', label: 'En rémission' },
];

// =====================================================
// MAIN COMPONENT
// =====================================================

const PatientMedicalDataEditor = ({
    patientId,
    onDataChange,
}: PatientMedicalDataEditorProps) => {
    const [activeTab, setActiveTab] = useState('medications');
    const [loading, setLoading] = useState(true);

    // Reference data from database
    const [medications, setMedications] = useState<SelectOption[]>([]);
    const [pathologies, setPathologies] = useState<SelectOption[]>([]);
    const [symptoms, setSymptoms] = useState<SelectOption[]>([]);

    // Patient data
    const [patientMedications, setPatientMedications] = useState<PatientMedication[]>([]);
    const [patientPathologies, setPatientPathologies] = useState<PatientPathology[]>([]);
    const [patientAllergies, setPatientAllergies] = useState<PatientAllergy[]>([]);
    const [patientVaccinations, setPatientVaccinations] = useState<PatientVaccination[]>([]);
    const [patientSymptoms, setPatientSymptoms] = useState<PatientSymptom[]>([]);

    // =====================================================
    // FETCH REFERENCE DATA
    // =====================================================

    useEffect(() => {
        const fetchReferenceData = async () => {
            try {
                // Fetch medications
                const { data: medsData } = await supabase
                    .from('medications')
                    .select('id, name, dosage_forms')
                    .order('name')
                    .limit(5000);

                if (medsData) {
                    setMedications(
                        medsData.map((m) => ({
                            value: m.id,
                            label: m.name,
                            description: m.dosage_forms?.join(', ') || undefined,
                        }))
                    );
                }

                // Fetch pathologies
                const { data: pathData } = await supabase
                    .from('pathologies')
                    .select('id, name, icd_code, category')
                    .order('name')
                    .limit(5000);

                if (pathData) {
                    setPathologies(
                        pathData.map((p) => ({
                            value: p.id,
                            label: p.name,
                            description: p.icd_code || undefined,
                            category: p.category || undefined,
                        }))
                    );
                }

                // Fetch symptoms
                const { data: sympData } = await supabase
                    .from('symptoms')
                    .select('id, name, body_system')
                    .order('name')
                    .limit(2000);

                if (sympData) {
                    setSymptoms(
                        sympData.map((s) => ({
                            value: s.id,
                            label: s.name,
                            category: s.body_system || undefined,
                        }))
                    );
                }
            } catch (error) {
                console.error('Error fetching reference data:', error);
            }
        };

        fetchReferenceData();
    }, []);

    // =====================================================
    // FETCH PATIENT DATA
    // =====================================================

    const fetchPatientData = useCallback(async () => {
        if (!patientId) return;
        setLoading(true);

        try {
            // Fetch patient medications
            const { data: medsData } = await supabase
                .from('patient_medications')
                .select('*, medications(id, name, dosage_forms)')
                .eq('patient_id', patientId);

            if (medsData) {
                setPatientMedications(
                    medsData.map((m) => ({
                        ...m,
                        medication: m.medications as { id: string; name: string; dosage_forms?: string[] },
                    }))
                );
            }

            // Fetch patient pathologies
            const { data: pathData } = await supabase
                .from('patient_pathologies')
                .select('*, pathologies(id, name, icd_code)')
                .eq('patient_id', patientId);

            if (pathData) {
                setPatientPathologies(
                    pathData.map((p) => ({
                        ...p,
                        pathology: p.pathologies as { id: string; name: string; icd_code: string | null },
                    }))
                );
            }

            // Fetch patient allergies
            const { data: allergyData } = await supabase
                .from('patient_allergies')
                .select('*')
                .eq('patient_id', patientId);

            if (allergyData) {
                setPatientAllergies(allergyData);
            }

            // Fetch patient vaccinations
            const { data: vaccData } = await supabase
                .from('patient_vaccinations')
                .select('*')
                .eq('patient_id', patientId)
                .order('vaccination_date', { ascending: false });

            if (vaccData) {
                setPatientVaccinations(vaccData);
            }

            // Fetch patient symptoms
            const { data: sympData } = await supabase
                .from('patient_symptoms')
                .select('*, symptoms(id, name, body_system)')
                .eq('patient_id', patientId);

            if (sympData) {
                setPatientSymptoms(
                    sympData.map((s) => ({
                        ...s,
                        symptom: s.symptoms as { id: string; name: string; body_system: string | null } | undefined,
                    }))
                );
            }
        } catch (error) {
            console.error('Error fetching patient data:', error);
            toast.error('Erreur lors du chargement des données');
        } finally {
            setLoading(false);
        }
    }, [patientId]);

    useEffect(() => {
        fetchPatientData();
    }, [fetchPatientData]);

    // =====================================================
    // MEDICATION HANDLERS
    // =====================================================

    const [medicationDialogOpen, setMedicationDialogOpen] = useState(false);
    const [editingMedication, setEditingMedication] = useState<Partial<PatientMedication> | null>(null);

    const handleAddMedication = async () => {
        if (!editingMedication?.medication_id) {
            toast.error('Veuillez sélectionner un médicament');
            return;
        }

        try {
            const { error } = await supabase.from('patient_medications').insert({
                patient_id: patientId,
                medication_id: editingMedication.medication_id,
                dosage: editingMedication.dosage || null,
                frequency: editingMedication.frequency || null,
                start_date: editingMedication.start_date || null,
                is_active: true,
            });

            if (error) throw error;

            toast.success('Médicament ajouté');
            setMedicationDialogOpen(false);
            setEditingMedication(null);
            fetchPatientData();
            onDataChange?.();
        } catch (error) {
            console.error('Error adding medication:', error);
            toast.error('Erreur lors de l\'ajout');
        }
    };

    const handleDeleteMedication = async (id: string) => {
        try {
            const { error } = await supabase
                .from('patient_medications')
                .delete()
                .eq('id', id);

            if (error) throw error;

            toast.success('Médicament supprimé');
            fetchPatientData();
            onDataChange?.();
        } catch (error) {
            console.error('Error deleting medication:', error);
            toast.error('Erreur lors de la suppression');
        }
    };

    // =====================================================
    // PATHOLOGY HANDLERS
    // =====================================================

    const [pathologyDialogOpen, setPathologyDialogOpen] = useState(false);
    const [editingPathology, setEditingPathology] = useState<Partial<PatientPathology> | null>(null);

    const handleAddPathology = async () => {
        if (!editingPathology?.pathology_id) {
            toast.error('Veuillez sélectionner une pathologie');
            return;
        }

        try {
            const { error } = await supabase.from('patient_pathologies').insert({
                patient_id: patientId,
                pathology_id: editingPathology.pathology_id,
                diagnosis_date: editingPathology.diagnosis_date || null,
                status: editingPathology.status || 'active',
                notes: editingPathology.notes || null,
            });

            if (error) throw error;

            toast.success('Pathologie ajoutée');
            setPathologyDialogOpen(false);
            setEditingPathology(null);
            fetchPatientData();
            onDataChange?.();
        } catch (error) {
            console.error('Error adding pathology:', error);
            toast.error('Erreur lors de l\'ajout');
        }
    };

    const handleDeletePathology = async (id: string) => {
        try {
            const { error } = await supabase
                .from('patient_pathologies')
                .delete()
                .eq('id', id);

            if (error) throw error;

            toast.success('Pathologie supprimée');
            fetchPatientData();
            onDataChange?.();
        } catch (error) {
            console.error('Error deleting pathology:', error);
            toast.error('Erreur lors de la suppression');
        }
    };

    // =====================================================
    // ALLERGY HANDLERS
    // =====================================================

    const [allergyDialogOpen, setAllergyDialogOpen] = useState(false);
    const [editingAllergy, setEditingAllergy] = useState<Partial<PatientAllergy> | null>(null);

    const handleAddAllergy = async () => {
        if (!editingAllergy?.allergen) {
            toast.error('Veuillez entrer un allergène');
            return;
        }

        try {
            const { error } = await supabase.from('patient_allergies').insert({
                patient_id: patientId,
                allergen: editingAllergy.allergen,
                allergen_type: editingAllergy.allergen_type || null,
                severity: editingAllergy.severity || null,
                reaction: editingAllergy.reaction || null,
                notes: editingAllergy.notes || null,
            });

            if (error) throw error;

            toast.success('Allergie ajoutée');
            setAllergyDialogOpen(false);
            setEditingAllergy(null);
            fetchPatientData();
            onDataChange?.();
        } catch (error) {
            console.error('Error adding allergy:', error);
            toast.error('Erreur lors de l\'ajout');
        }
    };

    const handleDeleteAllergy = async (id: string) => {
        try {
            const { error } = await supabase
                .from('patient_allergies')
                .delete()
                .eq('id', id);

            if (error) throw error;

            toast.success('Allergie supprimée');
            fetchPatientData();
            onDataChange?.();
        } catch (error) {
            console.error('Error deleting allergy:', error);
            toast.error('Erreur lors de la suppression');
        }
    };

    // =====================================================
    // VACCINATION HANDLERS
    // =====================================================

    const [vaccinationDialogOpen, setVaccinationDialogOpen] = useState(false);
    const [editingVaccination, setEditingVaccination] = useState<Partial<PatientVaccination> | null>(null);

    const handleAddVaccination = async () => {
        if (!editingVaccination?.vaccine_name || !editingVaccination?.vaccination_date) {
            toast.error('Veuillez remplir les champs obligatoires');
            return;
        }

        try {
            const { error } = await supabase.from('patient_vaccinations').insert({
                patient_id: patientId,
                vaccine_name: editingVaccination.vaccine_name,
                vaccine_type: editingVaccination.vaccine_type || null,
                vaccination_date: editingVaccination.vaccination_date,
                booster_date: editingVaccination.booster_date || null,
                notes: editingVaccination.notes || null,
            });

            if (error) throw error;

            toast.success('Vaccination ajoutée');
            setVaccinationDialogOpen(false);
            setEditingVaccination(null);
            fetchPatientData();
            onDataChange?.();
        } catch (error) {
            console.error('Error adding vaccination:', error);
            toast.error('Erreur lors de l\'ajout');
        }
    };

    const handleDeleteVaccination = async (id: string) => {
        try {
            const { error } = await supabase
                .from('patient_vaccinations')
                .delete()
                .eq('id', id);

            if (error) throw error;

            toast.success('Vaccination supprimée');
            fetchPatientData();
            onDataChange?.();
        } catch (error) {
            console.error('Error deleting vaccination:', error);
            toast.error('Erreur lors de la suppression');
        }
    };

    // =====================================================
    // SYMPTOM HANDLERS
    // =====================================================

    const [symptomDialogOpen, setSymptomDialogOpen] = useState(false);
    const [editingSymptom, setEditingSymptom] = useState<Partial<PatientSymptom> | null>(null);

    const handleAddSymptom = async () => {
        const symptomName = editingSymptom?.symptom_name ||
            symptoms.find(s => s.value === editingSymptom?.symptom_id)?.label;

        if (!symptomName) {
            toast.error('Veuillez sélectionner ou entrer un symptôme');
            return;
        }

        try {
            const { error } = await supabase.from('patient_symptoms').insert({
                patient_id: patientId,
                symptom_id: editingSymptom?.symptom_id || null,
                symptom_name: symptomName,
                severity: editingSymptom?.severity || null,
                onset_date: editingSymptom?.onset_date || null,
                is_active: true,
                notes: editingSymptom?.notes || null,
            });

            if (error) throw error;

            toast.success('Symptôme ajouté');
            setSymptomDialogOpen(false);
            setEditingSymptom(null);
            fetchPatientData();
            onDataChange?.();
        } catch (error) {
            console.error('Error adding symptom:', error);
            toast.error('Erreur lors de l\'ajout');
        }
    };

    const handleDeleteSymptom = async (id: string) => {
        try {
            const { error } = await supabase
                .from('patient_symptoms')
                .delete()
                .eq('id', id);

            if (error) throw error;

            toast.success('Symptôme supprimé');
            fetchPatientData();
            onDataChange?.();
        } catch (error) {
            console.error('Error deleting symptom:', error);
            toast.error('Erreur lors de la suppression');
        }
    };

    // =====================================================
    // RENDER
    // =====================================================

    if (loading) {
        return (
            <Card>
                <CardContent className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                    <Edit className="h-5 w-5 text-primary" />
                    Données médicales
                </CardTitle>
            </CardHeader>
            <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid grid-cols-5 w-full">
                        <TabsTrigger value="medications" className="text-xs">
                            <Pill className="h-3 w-3 mr-1" />
                            Médicaments
                            {patientMedications.length > 0 && (
                                <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                                    {patientMedications.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="pathologies" className="text-xs">
                            <Stethoscope className="h-3 w-3 mr-1" />
                            Pathologies
                            {patientPathologies.length > 0 && (
                                <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                                    {patientPathologies.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="allergies" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Allergies
                            {patientAllergies.length > 0 && (
                                <Badge variant="destructive" className="ml-1 text-[10px] h-4 px-1">
                                    {patientAllergies.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="vaccinations" className="text-xs">
                            <Syringe className="h-3 w-3 mr-1" />
                            Vaccins
                            {patientVaccinations.length > 0 && (
                                <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                                    {patientVaccinations.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="symptoms" className="text-xs">
                            <Activity className="h-3 w-3 mr-1" />
                            Symptômes
                            {patientSymptoms.length > 0 && (
                                <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1">
                                    {patientSymptoms.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                    </TabsList>

                    {/* MEDICATIONS TAB */}
                    <TabsContent value="medications" className="mt-4">
                        <div className="flex justify-end mb-3">
                            <Dialog open={medicationDialogOpen} onOpenChange={setMedicationDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" onClick={() => setEditingMedication({})}>
                                        <Plus className="h-4 w-4 mr-1" /> Ajouter
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Ajouter un médicament</DialogTitle>
                                        <DialogDescription>
                                            Recherchez et sélectionnez un médicament dans la liste.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label>Médicament *</Label>
                                            <SearchableSelect
                                                options={medications}
                                                value={editingMedication?.medication_id || ''}
                                                onValueChange={(value) =>
                                                    setEditingMedication((prev) => ({ ...prev, medication_id: value }))
                                                }
                                                placeholder="Rechercher un médicament..."
                                                searchPlaceholder="Tapez le nom du médicament..."
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Dosage</Label>
                                                <Input
                                                    placeholder="ex: 500mg"
                                                    value={editingMedication?.dosage || ''}
                                                    onChange={(e) =>
                                                        setEditingMedication((prev) => ({ ...prev, dosage: e.target.value }))
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Fréquence</Label>
                                                <Input
                                                    placeholder="ex: 2x/jour"
                                                    value={editingMedication?.frequency || ''}
                                                    onChange={(e) =>
                                                        setEditingMedication((prev) => ({ ...prev, frequency: e.target.value }))
                                                    }
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Date de début</Label>
                                            <Input
                                                type="date"
                                                value={editingMedication?.start_date || ''}
                                                onChange={(e) =>
                                                    setEditingMedication((prev) => ({ ...prev, start_date: e.target.value }))
                                                }
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setMedicationDialogOpen(false)}>
                                            Annuler
                                        </Button>
                                        <Button onClick={handleAddMedication}>
                                            <Save className="h-4 w-4 mr-1" /> Enregistrer
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>

                        <ScrollArea className="h-[300px]">
                            {patientMedications.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">
                                    Aucun médicament enregistré
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {patientMedications.map((med) => (
                                        <div
                                            key={med.id}
                                            className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <Pill className="h-4 w-4 text-primary shrink-0" />
                                                    <span className="font-medium truncate">
                                                        {med.medication?.name || 'Médicament inconnu'}
                                                    </span>
                                                    {med.is_active && (
                                                        <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-500">
                                                            Actif
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    {med.dosage && <span>{med.dosage}</span>}
                                                    {med.dosage && med.frequency && <span> • </span>}
                                                    {med.frequency && <span>{med.frequency}</span>}
                                                    {med.start_date && (
                                                        <span> • Depuis {format(new Date(med.start_date), 'dd/MM/yyyy')}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="shrink-0 text-destructive hover:text-destructive"
                                                onClick={() => handleDeleteMedication(med.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </TabsContent>

                    {/* PATHOLOGIES TAB */}
                    <TabsContent value="pathologies" className="mt-4">
                        <div className="flex justify-end mb-3">
                            <Dialog open={pathologyDialogOpen} onOpenChange={setPathologyDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" onClick={() => setEditingPathology({})}>
                                        <Plus className="h-4 w-4 mr-1" /> Ajouter
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Ajouter une pathologie</DialogTitle>
                                        <DialogDescription>
                                            Recherchez et sélectionnez une pathologie dans la liste.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label>Pathologie *</Label>
                                            <SearchableSelect
                                                options={pathologies}
                                                value={editingPathology?.pathology_id || ''}
                                                onValueChange={(value) =>
                                                    setEditingPathology((prev) => ({ ...prev, pathology_id: value }))
                                                }
                                                placeholder="Rechercher une pathologie..."
                                                searchPlaceholder="Tapez le nom de la pathologie..."
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Date de diagnostic</Label>
                                                <Input
                                                    type="date"
                                                    value={editingPathology?.diagnosis_date || ''}
                                                    onChange={(e) =>
                                                        setEditingPathology((prev) => ({ ...prev, diagnosis_date: e.target.value }))
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Statut</Label>
                                                <Select
                                                    value={editingPathology?.status || 'active'}
                                                    onValueChange={(value) =>
                                                        setEditingPathology((prev) => ({ ...prev, status: value }))
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {PATHOLOGY_STATUS.map((s) => (
                                                            <SelectItem key={s.value} value={s.value}>
                                                                {s.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Notes</Label>
                                            <Textarea
                                                placeholder="Notes additionnelles..."
                                                value={editingPathology?.notes || ''}
                                                onChange={(e) =>
                                                    setEditingPathology((prev) => ({ ...prev, notes: e.target.value }))
                                                }
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setPathologyDialogOpen(false)}>
                                            Annuler
                                        </Button>
                                        <Button onClick={handleAddPathology}>
                                            <Save className="h-4 w-4 mr-1" /> Enregistrer
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>

                        <ScrollArea className="h-[300px]">
                            {patientPathologies.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">
                                    Aucune pathologie enregistrée
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {patientPathologies.map((path) => (
                                        <div
                                            key={path.id}
                                            className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <Stethoscope className="h-4 w-4 text-red-500 shrink-0" />
                                                    <span className="font-medium truncate">
                                                        {path.pathology?.name || 'Pathologie inconnue'}
                                                    </span>
                                                    <Badge
                                                        variant="outline"
                                                        className={`text-[10px] ${path.status === 'active'
                                                                ? 'bg-red-500/10 text-red-500'
                                                                : path.status === 'chronic'
                                                                    ? 'bg-orange-500/10 text-orange-500'
                                                                    : path.status === 'resolved'
                                                                        ? 'bg-green-500/10 text-green-500'
                                                                        : 'bg-blue-500/10 text-blue-500'
                                                            }`}
                                                    >
                                                        {PATHOLOGY_STATUS.find((s) => s.value === path.status)?.label || path.status}
                                                    </Badge>
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    {path.pathology?.icd_code && (
                                                        <span className="font-mono">{path.pathology.icd_code}</span>
                                                    )}
                                                    {path.diagnosis_date && (
                                                        <span> • Diagnostiqué le {format(new Date(path.diagnosis_date), 'dd/MM/yyyy')}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="shrink-0 text-destructive hover:text-destructive"
                                                onClick={() => handleDeletePathology(path.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </TabsContent>

                    {/* ALLERGIES TAB */}
                    <TabsContent value="allergies" className="mt-4">
                        <div className="flex justify-end mb-3">
                            <Dialog open={allergyDialogOpen} onOpenChange={setAllergyDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" onClick={() => setEditingAllergy({})}>
                                        <Plus className="h-4 w-4 mr-1" /> Ajouter
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Ajouter une allergie</DialogTitle>
                                        <DialogDescription>
                                            Entrez les détails de l'allergie du patient.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label>Allergène *</Label>
                                            <Input
                                                placeholder="ex: Pénicilline, Arachides..."
                                                value={editingAllergy?.allergen || ''}
                                                onChange={(e) =>
                                                    setEditingAllergy((prev) => ({ ...prev, allergen: e.target.value }))
                                                }
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Type</Label>
                                                <Select
                                                    value={editingAllergy?.allergen_type || ''}
                                                    onValueChange={(value) =>
                                                        setEditingAllergy((prev) => ({ ...prev, allergen_type: value }))
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Sélectionner..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {ALLERGEN_TYPES.map((t) => (
                                                            <SelectItem key={t.value} value={t.value}>
                                                                {t.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Sévérité</Label>
                                                <Select
                                                    value={editingAllergy?.severity || ''}
                                                    onValueChange={(value) =>
                                                        setEditingAllergy((prev) => ({ ...prev, severity: value }))
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Sélectionner..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {SEVERITY_LEVELS.map((s) => (
                                                            <SelectItem key={s.value} value={s.value}>
                                                                {s.label}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Réaction</Label>
                                            <Input
                                                placeholder="ex: Urticaire, Œdème de Quincke..."
                                                value={editingAllergy?.reaction || ''}
                                                onChange={(e) =>
                                                    setEditingAllergy((prev) => ({ ...prev, reaction: e.target.value }))
                                                }
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setAllergyDialogOpen(false)}>
                                            Annuler
                                        </Button>
                                        <Button onClick={handleAddAllergy}>
                                            <Save className="h-4 w-4 mr-1" /> Enregistrer
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>

                        <ScrollArea className="h-[300px]">
                            {patientAllergies.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">
                                    Aucune allergie enregistrée
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {patientAllergies.map((allergy) => (
                                        <div
                                            key={allergy.id}
                                            className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/20"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                                                    <span className="font-medium truncate">{allergy.allergen}</span>
                                                    {allergy.severity && (
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-[10px] ${allergy.severity === 'life_threatening'
                                                                    ? 'bg-red-500/20 text-red-500 border-red-500'
                                                                    : allergy.severity === 'severe'
                                                                        ? 'bg-orange-500/20 text-orange-500 border-orange-500'
                                                                        : allergy.severity === 'moderate'
                                                                            ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500'
                                                                            : 'bg-green-500/20 text-green-500 border-green-500'
                                                                }`}
                                                        >
                                                            {SEVERITY_LEVELS.find((s) => s.value === allergy.severity)?.label}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    {allergy.allergen_type && (
                                                        <span>{ALLERGEN_TYPES.find((t) => t.value === allergy.allergen_type)?.label}</span>
                                                    )}
                                                    {allergy.reaction && <span> • {allergy.reaction}</span>}
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="shrink-0 text-destructive hover:text-destructive"
                                                onClick={() => handleDeleteAllergy(allergy.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </TabsContent>

                    {/* VACCINATIONS TAB */}
                    <TabsContent value="vaccinations" className="mt-4">
                        <div className="flex justify-end mb-3">
                            <Dialog open={vaccinationDialogOpen} onOpenChange={setVaccinationDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" onClick={() => setEditingVaccination({})}>
                                        <Plus className="h-4 w-4 mr-1" /> Ajouter
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Ajouter une vaccination</DialogTitle>
                                        <DialogDescription>
                                            Entrez les détails de la vaccination.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label>Vaccin *</Label>
                                            <SearchableSelect
                                                options={COMMON_VACCINES.map((v) => ({ value: v, label: v }))}
                                                value={editingVaccination?.vaccine_name || ''}
                                                onValueChange={(value) =>
                                                    setEditingVaccination((prev) => ({ ...prev, vaccine_name: value }))
                                                }
                                                placeholder="Sélectionner un vaccin..."
                                                searchPlaceholder="Rechercher un vaccin..."
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Date de vaccination *</Label>
                                                <Input
                                                    type="date"
                                                    value={editingVaccination?.vaccination_date || ''}
                                                    onChange={(e) =>
                                                        setEditingVaccination((prev) => ({ ...prev, vaccination_date: e.target.value }))
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Date de rappel</Label>
                                                <Input
                                                    type="date"
                                                    value={editingVaccination?.booster_date || ''}
                                                    onChange={(e) =>
                                                        setEditingVaccination((prev) => ({ ...prev, booster_date: e.target.value }))
                                                    }
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Notes</Label>
                                            <Textarea
                                                placeholder="Notes additionnelles..."
                                                value={editingVaccination?.notes || ''}
                                                onChange={(e) =>
                                                    setEditingVaccination((prev) => ({ ...prev, notes: e.target.value }))
                                                }
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setVaccinationDialogOpen(false)}>
                                            Annuler
                                        </Button>
                                        <Button onClick={handleAddVaccination}>
                                            <Save className="h-4 w-4 mr-1" /> Enregistrer
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>

                        <ScrollArea className="h-[300px]">
                            {patientVaccinations.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">
                                    Aucune vaccination enregistrée
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {patientVaccinations.map((vacc) => (
                                        <div
                                            key={vacc.id}
                                            className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <Syringe className="h-4 w-4 text-primary shrink-0" />
                                                    <span className="font-medium truncate">{vacc.vaccine_name}</span>
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    <span>Vacciné le {format(new Date(vacc.vaccination_date), 'dd/MM/yyyy')}</span>
                                                    {vacc.booster_date && (
                                                        <span> • Rappel: {format(new Date(vacc.booster_date), 'dd/MM/yyyy')}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="shrink-0 text-destructive hover:text-destructive"
                                                onClick={() => handleDeleteVaccination(vacc.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </TabsContent>

                    {/* SYMPTOMS TAB */}
                    <TabsContent value="symptoms" className="mt-4">
                        <div className="flex justify-end mb-3">
                            <Dialog open={symptomDialogOpen} onOpenChange={setSymptomDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" onClick={() => setEditingSymptom({})}>
                                        <Plus className="h-4 w-4 mr-1" /> Ajouter
                                    </Button>
                                </DialogTrigger>
                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>Ajouter un symptôme</DialogTitle>
                                        <DialogDescription>
                                            Recherchez et sélectionnez un symptôme.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                            <Label>Symptôme *</Label>
                                            <SearchableSelect
                                                options={symptoms}
                                                value={editingSymptom?.symptom_id || ''}
                                                onValueChange={(value) => {
                                                    const symptom = symptoms.find((s) => s.value === value);
                                                    setEditingSymptom((prev) => ({
                                                        ...prev,
                                                        symptom_id: value,
                                                        symptom_name: symptom?.label || '',
                                                    }));
                                                }}
                                                placeholder="Rechercher un symptôme..."
                                                searchPlaceholder="Tapez le nom du symptôme..."
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>Sévérité</Label>
                                                <Select
                                                    value={editingSymptom?.severity || ''}
                                                    onValueChange={(value) =>
                                                        setEditingSymptom((prev) => ({ ...prev, severity: value }))
                                                    }
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Sélectionner..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="mild">Légère</SelectItem>
                                                        <SelectItem value="moderate">Modérée</SelectItem>
                                                        <SelectItem value="severe">Sévère</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>Date d'apparition</Label>
                                                <Input
                                                    type="date"
                                                    value={editingSymptom?.onset_date || ''}
                                                    onChange={(e) =>
                                                        setEditingSymptom((prev) => ({ ...prev, onset_date: e.target.value }))
                                                    }
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Notes</Label>
                                            <Textarea
                                                placeholder="Notes additionnelles..."
                                                value={editingSymptom?.notes || ''}
                                                onChange={(e) =>
                                                    setEditingSymptom((prev) => ({ ...prev, notes: e.target.value }))
                                                }
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setSymptomDialogOpen(false)}>
                                            Annuler
                                        </Button>
                                        <Button onClick={handleAddSymptom}>
                                            <Save className="h-4 w-4 mr-1" /> Enregistrer
                                        </Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>

                        <ScrollArea className="h-[300px]">
                            {patientSymptoms.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">
                                    Aucun symptôme enregistré
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {patientSymptoms.map((symp) => (
                                        <div
                                            key={symp.id}
                                            className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <Activity className="h-4 w-4 text-primary shrink-0" />
                                                    <span className="font-medium truncate">{symp.symptom_name}</span>
                                                    {symp.is_active && (
                                                        <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-500">
                                                            Actif
                                                        </Badge>
                                                    )}
                                                    {symp.severity && (
                                                        <Badge variant="secondary" className="text-[10px]">
                                                            {symp.severity === 'mild' ? 'Légère' : symp.severity === 'moderate' ? 'Modérée' : 'Sévère'}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted-foreground mt-1">
                                                    {symp.symptom?.body_system && (
                                                        <span>{symp.symptom.body_system}</span>
                                                    )}
                                                    {symp.onset_date && (
                                                        <span> • Depuis {format(new Date(symp.onset_date), 'dd/MM/yyyy')}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="shrink-0 text-destructive hover:text-destructive"
                                                onClick={() => handleDeleteSymptom(symp.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
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

export default PatientMedicalDataEditor;
