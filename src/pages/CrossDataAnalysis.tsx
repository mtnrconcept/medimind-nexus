import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import CrossDataAnalyzer from '@/components/patient/CrossDataAnalyzer';
import { useAutoTranslation } from '@/contexts/TranslationContext';
import { Sparkles, Search, Brain, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

const CrossDataAnalysis = () => {
    const { t } = useAutoTranslation();
    const { theme } = useTheme();
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
            {/* Parallax Background - Theme Aware */}
            <div className="fixed inset-0 -z-10 overflow-hidden">
                <div className={cn(
                    "absolute inset-0",
                    theme === 'dark'
                        ? "bg-gradient-to-br from-[#020617] via-[#0f172a] to-[#1e1b4b]"
                        : "bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-50"
                )} />
                <div className="absolute top-0 left-0 w-full h-full opacity-30">
                    <div className={cn(
                        "absolute top-20 left-10 w-72 h-72 rounded-full filter blur-3xl animate-blob",
                        theme === 'dark' ? "bg-cyan-500/20" : "bg-cyan-400 mix-blend-multiply opacity-20"
                    )} />
                    <div className={cn(
                        "absolute top-40 right-10 w-72 h-72 rounded-full filter blur-3xl animate-blob animation-delay-2000",
                        theme === 'dark' ? "bg-purple-500/20" : "bg-blue-400 mix-blend-multiply opacity-20"
                    )} />
                </div>
            </div>

            <div className="space-y-6 pb-12">
                {/* Header */}
                <div className={cn(
                    "relative overflow-hidden rounded-3xl backdrop-blur-xl border shadow-2xl",
                    theme === 'dark'
                        ? "bg-[#0f172a]/80 border-white/10"
                        : "bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-indigo-500/10 border-white/20"
                )}>
                    <div className={cn(
                        "absolute inset-0",
                        theme === 'dark' ? "bg-gradient-to-br from-cyan-500/5 to-purple-500/5" : "bg-white/5"
                    )} />
                    <div className="relative p-8">
                        <div className="flex items-center gap-3">
                            <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500">
                                <Brain className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <h1 className={cn(
                                    "text-3xl font-bold bg-clip-text text-transparent",
                                    theme === 'dark'
                                        ? "bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400"
                                        : "bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600"
                                )}>
                                    {t('Analyse IA Cross-Data')}
                                </h1>
                                <p className={cn(theme === 'dark' ? "text-slate-400" : "text-slate-600")}>
                                    {t('Comparaison avec 19,000+ références médicales mondiales')}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Search Section */}
                <Card className={cn(
                    "backdrop-blur-xl border shadow-xl",
                    theme === 'dark'
                        ? "bg-[#0f172a]/80 border-white/10"
                        : "bg-white/40 border-white/20"
                )}>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Search className="h-5 w-5 text-cyan-600" />
                            {t('Lancer une Analyse')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <Label htmlFor="patientId">{t('ID Patient')}</Label>
                                <Input
                                    id="patientId"
                                    placeholder={t('Entrez l\'ID du patient (ex: b0c4d6e7)')}
                                    value={patientId}
                                    onChange={(e) => setPatientId(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && handleAnalyze()}
                                    className="mt-1 bg-white/50 border-white/30"
                                    disabled={isLoading}
                                />
                            </div>
                            <div className="flex items-end">
                                <Button
                                    onClick={handleAnalyze}
                                    disabled={isLoading}
                                    className="gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white shadow-lg shadow-cyan-500/50"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            {t('Chargement...')}
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-4 w-4" />
                                            {t('Lancer l\'Analyse')}
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                        <p className="text-sm text-slate-600 mt-2">
                            {patientData
                                ? `${t('Patient chargé')} : ${patientData.patient_id} - ${patientData.age} ${t('ans')} - ${patientData.gender === 'M' ? t('Masculin') : t('Féminin')}`
                                : t("L'analyse pré-sélectionnera automatiquement les pathologies, symptômes, traitements et médicaments du patient")
                            }
                        </p>
                    </CardContent>
                </Card>

                {/* Cross Data Analyzer Component - Always Visible */}
                <CrossDataAnalyzer patientData={patientData} />
            </div>

            <style>{`
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(20px, -50px) scale(1.1); }
          50% { transform: translate(-20px, 20px) scale(0.9); }
          75% { transform: translate(50px, 50px) scale(1.05); }
        }
        .animate-blob {
          animation: blob 20s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
      `}</style>
        </AppLayout>
    );
};

export default CrossDataAnalysis;
