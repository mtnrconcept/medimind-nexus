import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, User, FileText, CheckCircle, Clock, Lock, AlertTriangle, Shield } from 'lucide-react';
import AIAssistant from '@/components/patient/AIAssistant';
import SafetyAlertBanner from '@/components/patient/SafetyAlertBanner';
import DigitalTwin3DViewer from '@/components/patient/DigitalTwin3DViewer';
import PharmacologyMatrix from '@/components/patient/PharmacologyMatrix';
import VitalSignsPanel from '@/components/patient/VitalSignsPanel';
import AIPredictionsCard from '@/components/patient/AIPredictionsCard';
import ExtendedLabResults from '@/components/patient/ExtendedLabResults';
import MedicalHistory from '@/components/patient/MedicalHistory';
import { usePatientAlerts, parseExtendedLabResults, type ExtendedLabResults as ExtendedLabResultsType } from '@/hooks/usePatientAlerts';
import type { Json } from '@/integrations/supabase/types';

interface Patient {
  id: string;
  patient_id: string;
  age: number;
  gender: string;
  nationality: string;
  treatment: string;
  medical_notes_nlp: string;
  lab_results_json: ExtendedLabResultsType;
  outcome: string;
  height_cm: number;
  weight_kg: number;
  created_at: string;
  pathologies?: {
    id: string;
    name: string;
    icd_code: string;
    category: string;
  } | null;
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
    const timer = setTimeout(() => setDecrypting(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const fetchPatient = async () => {
      if (!id) return;

      const { data } = await supabase
        .from('patients')
        .select(`*, pathologies (id, name, icd_code, category)`)
        .eq('id', id)
        .maybeSingle();

      if (data) {
        setPatient({
          id: data.id,
          patient_id: data.patient_id,
          age: data.age,
          gender: data.gender,
          nationality: data.nationality,
          treatment: data.treatment || '',
          medical_notes_nlp: data.medical_notes_nlp || '',
          lab_results_json: parseExtendedLabResults(data.lab_results_json),
          outcome: data.outcome || '',
          height_cm: data.height_cm || 0,
          weight_kg: Number(data.weight_kg) || 0,
          created_at: data.created_at,
          pathologies: data.pathologies,
        });
      }
      setLoading(false);
    };
    fetchPatient();
  }, [id]);

  const alerts = usePatientAlerts(
    patient?.lab_results_json || { glucose_mg_dl: 0, blood_pressure_sys: 0, blood_pressure_dia: 0, temperature_c: 0 },
    patient?.treatment || '',
    patient?.medical_notes_nlp || '',
    patient?.pathologies?.name
  );

  const getOutcomeIcon = (outcome: string) => {
    switch (outcome) {
      case 'RESOLVED': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'ONGOING': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'SIDE_EFFECT': return <AlertTriangle className="h-4 w-4 text-destructive" />;
      default: return null;
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

  const criticalCount = alerts.filter(a => a.level === 'CRITICAL').length;
  const warningCount = alerts.filter(a => a.level === 'WARNING').length;

  if (decrypting) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="w-full max-w-md border-primary/20">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="p-4 rounded-full bg-primary/10 animate-pulse">
                  <Lock className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold">Décryptage des données...</h2>
                  <p className="text-muted-foreground mt-1">Vérification de la clé privée</p>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div className="bg-primary h-full animate-[loading_2s_ease-in-out_forwards]" style={{ width: '0%' }} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <style>{`@keyframes loading { 0% { width: 0%; } 100% { width: 100%; } }`}</style>
      </AppLayout>
    );
  }

  if (loading) {
    return <AppLayout><div className="text-center py-8 text-muted-foreground">Chargement...</div></AppLayout>;
  }

  if (!patient) {
    return (
      <AppLayout>
        <div className="text-center py-8">
          <p className="text-muted-foreground">Patient non trouvé</p>
          <Link to="/patients"><Button variant="outline" className="mt-4">Retour</Button></Link>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/patients">
              <Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold font-mono">Patient {patient.patient_id}</h1>
                <Badge variant="outline" className="flex items-center gap-1">
                  {getOutcomeIcon(patient.outcome)}
                  {getOutcomeLabel(patient.outcome)}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{patient.pathologies?.name || 'Non spécifié'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <Badge variant="destructive" className="animate-pulse">🔴 {criticalCount} Critique{criticalCount > 1 ? 's' : ''}</Badge>
            )}
            {warningCount > 0 && (
              <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/30">🟠 {warningCount} Attention</Badge>
            )}
            <Badge variant="secondary" className="flex items-center gap-1">
              <Shield className="h-3 w-3" /> Données chiffrées
            </Badge>
          </div>
        </div>

        {/* Safety Alert Banner */}
        <SafetyAlertBanner alerts={alerts} />

        {/* Main Grid Layout */}
        <div className="grid gap-4 lg:grid-cols-4">
          {/* Left Panel - Vitals & Labs */}
          <div className="space-y-4">
            <VitalSignsPanel 
              labResults={patient.lab_results_json} 
              age={patient.age} 
              height={patient.height_cm} 
              weight={patient.weight_kg} 
            />
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <User className="h-4 w-4" /> Démographie
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Âge:</span> {patient.age} ans</div>
                <div><span className="text-muted-foreground">Genre:</span> {patient.gender === 'M' ? 'H' : 'F'}</div>
                <div><span className="text-muted-foreground">Nation:</span> {nationalityFlags[patient.nationality]} {patient.nationality}</div>
                <div><span className="text-muted-foreground">Taille:</span> {patient.height_cm} cm</div>
              </CardContent>
            </Card>
            <ExtendedLabResults labResults={patient.lab_results_json} />
          </div>

          {/* Center Panel - Digital Twin + History */}
          <div className="lg:col-span-2 space-y-4">
            <DigitalTwin3DViewer alerts={alerts} pathologyName={patient.pathologies?.name} />
            <MedicalHistory age={patient.age} />
            <PharmacologyMatrix treatment={patient.treatment} alerts={alerts} />
          </div>

          {/* Right Panel - AI Predictions */}
          <div className="space-y-4">
            <AIPredictionsCard 
              alerts={alerts} 
              labResults={patient.lab_results_json} 
              pathologyName={patient.pathologies?.name}
              age={patient.age}
            />
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Notes Cliniques
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground italic line-clamp-6">{patient.medical_notes_nlp}</p>
              </CardContent>
            </Card>
          </div>

          {/* Far Right - AI Assistant */}
          <div>
            <AIAssistant patient={patient} />
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default PatientDetail;
