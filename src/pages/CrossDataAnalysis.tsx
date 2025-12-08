import { useState } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import CrossDataAnalyzer from '@/components/patient/CrossDataAnalyzer';
import { Sparkles, Search, Brain, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CrossDataAnalysis = () => {
    const [patientId, setPatientId] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [patientData, setPatientData] = useState<any>(null);

    const handleAnalyze = async () => {
        if (!patientId.trim()) {
            toast.error('Veuillez entrer un ID patient');
            return;
        }

        setIsLoading(true);

        try {
            // Rechercher le patient par patient_id
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

            setPatientData(patient);
            toast.success(`Patient ${patient.patient_id} chargé avec succès`);

        } catch (err) {
            console.error('Erreur:', err);
            toast.error('Une erreur est survenue');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AppLayout>
            {/* Parallax Background */}
            <div className="fixed inset-0 -z-10 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-50 via-blue-50 to-indigo-50" />
                <div className="absolute top-0 left-0 w-full h-full opacity-30">
                    <div className="absolute top-20 left-10 w-72 h-72 bg-cyan-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob" />
                    <div className="absolute top-40 right-10 w-72 h-72 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000" />
                </div>
            </div>

            <div className="space-y-6 pb-12">
                {/* Header */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-indigo-500/10 backdrop-blur-xl border border-white/20 shadow-2xl">
                    <div className="absolute inset-0 bg-white/5" />
                    <div className="relative p-8">
                        <div className="flex items-center gap-3">
                            <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-500">
                                <Brain className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 bg-clip-text text-transparent">
                                    Analyse IA Cross-Data
                                </h1>
                                <p className="text-slate-600">
                                    Comparaison avec 19,000+ références médicales mondiales
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Search Section */}
                <Card className="bg-white/40 backdrop-blur-xl border-white/20 shadow-xl">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Search className="h-5 w-5 text-cyan-600" />
                            Lancer une Analyse
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <Label htmlFor="patientId">ID Patient</Label>
                                <Input
                                    id="patientId"
                                    placeholder="Entrez l'ID du patient (ex: b0c4d6e7)"
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
                                            Chargement...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-4 w-4" />
                                            Lancer l'Analyse
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                        <p className="text-sm text-slate-600 mt-2">
                            {patientData
                                ? `Patient chargé : ${patientData.patient_id} - ${patientData.age} ans - ${patientData.gender === 'M' ? 'Masculin' : 'Féminin'}`
                                : "L'analyse pré-sélectionnera automatiquement les pathologies, symptômes, traitements et médicaments du patient"
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
