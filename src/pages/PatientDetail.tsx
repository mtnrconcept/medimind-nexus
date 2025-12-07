import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, User, Activity, FileText, AlertTriangle, CheckCircle, Clock, Lock } from 'lucide-react';
import LabResultsChart from '@/components/patient/LabResultsChart';
import AIInsightCard from '@/components/patient/AIInsightCard';
import AIAssistant from '@/components/patient/AIAssistant';

interface Patient {
  id: string;
  patient_id: string;
  age: number;
  gender: string;
  nationality: string;
  treatment: string;
  medical_notes_nlp: string;
  lab_results_json: {
    glucose_mg_dl: number;
    blood_pressure_sys: number;
    blood_pressure_dia: number;
    temperature_c: number;
  };
  outcome: string;
  height_cm: number;
  weight_kg: number;
  created_at: string;
  pathologies?: {
    id: string;
    name: string;
    icd_code: string;
    category: string;
  };
}

const nationalityFlags: Record<string, string> = {
  FR: '🇫🇷', JP: '🇯🇵', US: '🇺🇸', BR: '🇧🇷', DE: '🇩🇪',
  GB: '🇬🇧', IN: '🇮🇳', CA: '🇨🇦', AU: '🇦🇺', ES: '🇪🇸',
  IT: '🇮🇹', MX: '🇲🇽',
};

const PatientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [decrypting, setDecrypting] = useState(true);

  useEffect(() => {
    // Simulate decryption animation
    const timer = setTimeout(() => setDecrypting(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const fetchPatient = async () => {
      if (!id) return;

      const { data, error } = await supabase
        .from('patients')
        .select(`
          *,
          pathologies (id, name, icd_code, category)
        `)
        .eq('id', id)
        .single();

      if (data) {
        setPatient(data as Patient);
      }
      setLoading(false);
    };

    fetchPatient();
  }, [id]);

  const calculateBMI = (height: number, weight: number) => {
    if (!height || !weight) return null;
    const heightM = height / 100;
    return (weight / (heightM * heightM)).toFixed(1);
  };

  const getOutcomeIcon = (outcome: string) => {
    switch (outcome) {
      case 'RESOLVED':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'ONGOING':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'SIDE_EFFECT':
        return <AlertTriangle className="h-5 w-5 text-destructive" />;
      default:
        return null;
    }
  };

  const getOutcomeLabel = (outcome: string) => {
    switch (outcome) {
      case 'RESOLVED': return 'Résolu';
      case 'ONGOING': return 'En cours';
      case 'SIDE_EFFECT': return 'Effet secondaire';
      default: return outcome;
    }
  };

  if (decrypting) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="p-4 rounded-full bg-primary/10 animate-pulse">
                  <Lock className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Décryptage des données...</h2>
                  <p className="text-muted-foreground mt-1">
                    Vérification de la clé privée et déchiffrement du dossier patient
                  </p>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-primary h-full animate-[loading_2s_ease-in-out]" style={{
                    animation: 'loading 2s ease-in-out forwards',
                  }} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <style>{`
          @keyframes loading {
            0% { width: 0%; }
            100% { width: 100%; }
          }
        `}</style>
      </AppLayout>
    );
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="text-center py-8 text-muted-foreground">
          Chargement...
        </div>
      </AppLayout>
    );
  }

  if (!patient) {
    return (
      <AppLayout>
        <div className="text-center py-8">
          <p className="text-muted-foreground">Patient non trouvé</p>
          <Link to="/patients">
            <Button variant="outline" className="mt-4">Retour à la liste</Button>
          </Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to="/patients">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono">Patient {patient.patient_id}</h1>
              <Badge variant="outline" className="flex items-center gap-1">
                {getOutcomeIcon(patient.outcome)}
                {getOutcomeLabel(patient.outcome)}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {patient.pathologies?.name || 'Pathologie non spécifiée'}
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Demographics & Labs */}
          <div className="space-y-6">
            {/* Demographics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Données Démographiques
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Âge</p>
                    <p className="font-semibold">{patient.age} ans</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Genre</p>
                    <p className="font-semibold">{patient.gender === 'M' ? 'Homme' : 'Femme'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Nationalité</p>
                    <p className="font-semibold">
                      {nationalityFlags[patient.nationality]} {patient.nationality}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">IMC</p>
                    <p className="font-semibold">
                      {calculateBMI(patient.height_cm, patient.weight_kg) || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Taille</p>
                    <p className="font-semibold">{patient.height_cm || '-'} cm</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Poids</p>
                    <p className="font-semibold">{patient.weight_kg || '-'} kg</p>
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground">Traitement actuel</p>
                  <p className="font-semibold">{patient.treatment}</p>
                </div>
                {patient.pathologies && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm text-muted-foreground">Pathologie</p>
                      <Link to={`/pathologies/${patient.pathologies.id}`}>
                        <p className="font-semibold text-primary hover:underline">
                          {patient.pathologies.name}
                        </p>
                      </Link>
                      <p className="text-xs text-muted-foreground font-mono">
                        {patient.pathologies.icd_code} • {patient.pathologies.category}
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Lab Results */}
            <LabResultsChart labResults={patient.lab_results_json} />
          </div>

          {/* Center Column - Clinical Timeline & AI Insights */}
          <div className="space-y-6">
            {/* Clinical Notes */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Timeline Clinique
                </CardTitle>
                <CardDescription>Notes médicales du dossier</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <blockquote className="border-l-4 border-primary pl-4 italic text-muted-foreground">
                    {patient.medical_notes_nlp}
                  </blockquote>
                </div>
                <p className="text-xs text-muted-foreground mt-4">
                  Enregistré le {new Date(patient.created_at).toLocaleDateString('fr-FR')}
                </p>
              </CardContent>
            </Card>

            {/* AI Insights */}
            <AIInsightCard notes={patient.medical_notes_nlp} />
          </div>

          {/* Right Column - AI Assistant */}
          <div className="lg:col-span-1">
            <AIAssistant patient={patient} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default PatientDetail;
