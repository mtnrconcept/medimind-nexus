import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import PageHeading from '@/components/layout/PageHeading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import CrossDataAnalyzer from '@/components/patient/CrossDataAnalyzer';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import { Sparkles, Search, Brain, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CrossDataAnalysis = () => {
    const { t } = useAutoTranslation();
    const [patientId, setPatientId] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [patientData, setPatientData] = useState<any>(null);

    const handleAnalyze = async () => {
        if (!patientId.trim()) {
            toast.error(t('Veuillez entrer un ID patient'));
            return;
        }

        setIsLoading(true);

        try {
            // Rechercher le patient par patient_id avec toutes les relations
            const { data: patient, error } = await supabase
                .from('patients')
                .select(`
                    *,
                    pathologies (id, name, category, specialty, severity)
                `)
                .eq('patient_id', patientId.trim())
                .maybeSingle();

            if (error) {
                console.error('Erreur recherche patient:', error);
                toast.error('Erreur lors de la recherche du patient');
                return;
            }

            if (!patient) {
                toast.error('Patient non trouvé');
                return;
            }

            // Essayer de récupérer les données des tables de liaison (si elles existent)
            let patientPathologies = [];
            let patientMedications = [];
            let patientSymptoms = [];
            let patientTreatments = [];

            try {
                // Récupérer les pathologies liées
                const { data: ppData } = await supabase
                    .from('patient_pathologies')
                    .select('*, pathologies(*)')
                    .eq('patient_id', patient.id);
                if (ppData) patientPathologies = ppData;

                // Récupérer les médicaments liés
                const { data: pmData } = await supabase
                    .from('patient_medications')
                    .select('*, medications(*)')
                    .eq('patient_id', patient.id);
                if (pmData) patientMedications = pmData;

                // Récupérer les symptômes liés
                const { data: psData } = await supabase
                    .from('patient_symptoms')
                    .select('*, symptoms(*)')
                    .eq('patient_id', patient.id);
                if (psData) patientSymptoms = psData;

                // Récupérer les traitements liés
                const { data: ptData } = await supabase
                    .from('patient_treatments')
                    .select('*, treatments(*)')
                    .eq('patient_id', patient.id);
                if (ptData) patientTreatments = ptData;

                console.log('📊 Données liaison récupérées:', {
                    pathologies: patientPathologies.length,
                    medications: patientMedications.length,
                    symptoms: patientSymptoms.length,
                    treatments: patientTreatments.length
                });
            } catch (linkErr) {
                console.log('⚠️ Tables de liaison non disponibles, utilisation des données classiques');
            }

            // Construire l'objet patient enrichi
            const enrichedPatient = {
                ...patient,
                // Données des tables de liaison (si disponibles)
                linked_pathologies: patientPathologies,
                linked_medications: patientMedications,
                linked_symptoms: patientSymptoms,
                linked_treatments: patientTreatments
            };

            setPatientData(enrichedPatient);

            const linkedCount = patientPathologies.length + patientMedications.length +
                patientSymptoms.length + patientTreatments.length;

            if (linkedCount > 0) {
                toast.success(`Patient ${patient.patient_id} chargé avec ${linkedCount} données liées`);
            } else {
                toast.success(`Patient ${patient.patient_id} chargé avec succès`);
            }

        } catch (err) {
            console.error('Erreur:', err);
            toast.error('Une erreur est survenue');
        } finally {
            setIsLoading(false);
        }
    };


    return (
        <AppLayout>
            <div className="clinical-page">
                <PageHeading
                    eyebrow="Aide à la décision"
                    title="Analyses croisées"
                    description="Chargez un dossier autorisé pour examiner les informations cliniques associées et effectuer une analyse comparative."
                />
                <Card>
                    <CardHeader className="border-b border-border/70 px-6 py-5">
                        <CardTitle className="flex items-center gap-2 text-base font-bold">
                            <Search className="h-5 w-5 text-primary" /> Sélectionner un dossier
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">La recherche respecte les accès de votre compte.</p>
                    </CardHeader>
                    <CardContent className="p-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                            <div className="min-w-0 flex-1 space-y-2">
                                <Label htmlFor="patientId">Identifiant patient</Label>
                                <Input
                                    id="patientId"
                                    placeholder="Ex. PAT-001"
                                    value={patientId}
                                    onChange={event => setPatientId(event.target.value)}
                                    onKeyDown={event => { if (event.key === 'Enter' && !isLoading) void handleAnalyze(); }}
                                    className="h-11"
                                    disabled={isLoading}
                                />
                            </div>
                            <Button onClick={handleAnalyze} disabled={isLoading || !patientId.trim()} className="h-11 shrink-0 gap-2">
                                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                {isLoading ? 'Chargement…' : 'Analyser ce dossier'}
                            </Button>
                        </div>
                        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                            {patientData
                                ? `Dossier ${patientData.patient_id} chargé : vous pouvez examiner ses données ci-dessous.`
                                : 'Après sélection, les diagnostics, symptômes, traitements et médicaments connus du patient seront proposés à l’analyse.'}
                        </p>
                    </CardContent>
                </Card>

                {/* Cross Data Analyzer Component - Always Visible */}
                <CrossDataAnalyzer patientData={patientData} />
            </div>

        </AppLayout>
    );
};

export default CrossDataAnalysis;
