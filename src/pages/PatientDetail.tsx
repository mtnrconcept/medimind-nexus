import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import AppLayout from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Lock, Shield, Loader2 } from 'lucide-react';
import AIAssistant from '@/components/patient/AIAssistant';
import SafetyAlertBanner from '@/components/patient/SafetyAlertBanner';
import ExportDialog from '@/components/patient/ExportDialog';
import { PatientDossierLayout } from '@/components/patient/dossier';
import { usePatientAlerts, parseExtendedLabResults, type ExtendedLabResults as ExtendedLabResultsType } from '@/hooks/usePatientAlerts';

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
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  pathologies?: {
    id: string;
    name: string;
    icd_code: string;
    category: string;
  } | null;
  // New comprehensive fields
  medications?: any[];
  vaccinations?: any[];
  allergies?: any[];
  medical_history?: any[];
  consultations?: any[];
  mental_health?: any[];
  reproductive_health?: any[];
  clinical_data?: any[];
  lab_results_data?: any[];
}

const PatientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [decrypting, setDecrypting] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setDecrypting(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const fetchPatient = async () => {
      if (!id) return;

      const { data } = await supabase
        .from('patients')
        .select(`
          *,
          pathologies (id, name, icd_code, category),
          patient_medications(*),
          patient_vaccinations(*),
          patient_allergies(*),
          patient_medical_history(*),
          patient_consultations(*),
          patient_mental_health(*),
          patient_reproductive_health(*),
          patient_clinical_data(*),
          patient_lab_results(*)
        `)
        .eq('id', id)
        .maybeSingle();

      if (data) {
        const patientData = data as any;
        setPatient({
          id: patientData.id,
          patient_id: patientData.patient_id,
          age: patientData.age,
          gender: patientData.gender,
          nationality: patientData.nationality,
          treatment: patientData.treatment || '',
          medical_notes_nlp: patientData.medical_notes_nlp || '',
          lab_results_json: parseExtendedLabResults(patientData.lab_results_json),
          outcome: patientData.outcome || '',
          height_cm: patientData.height_cm || 0,
          weight_kg: Number(patientData.weight_kg) || 0,
          created_at: patientData.created_at,
          first_name: patientData.first_name || undefined,
          last_name: patientData.last_name || undefined,
          date_of_birth: patientData.date_of_birth || undefined,
          email: patientData.email || undefined,
          phone: patientData.phone || undefined,
          address: patientData.address || undefined,
          city: patientData.city || undefined,
          postal_code: patientData.postal_code || undefined,
          pathologies: patientData.pathologies,
          medications: patientData.patient_medications,
          vaccinations: patientData.patient_vaccinations,
          allergies: patientData.patient_allergies,
          medical_history: patientData.patient_medical_history,
          consultations: patientData.patient_consultations,
          mental_health: patientData.patient_mental_health,
          reproductive_health: patientData.patient_reproductive_health,
          clinical_data: patientData.patient_clinical_data,
          lab_results_data: patientData.patient_lab_results,
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
    patient?.pathologies?.name,
    patient?.medical_history || []
  );

  if (loading || !patient) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  // Decryption animation
  if (decrypting) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
          <Lock className="h-12 w-12 text-primary animate-pulse" />
          <div className="text-lg font-medium">Déchiffrement des données patient...</div>
          <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary animate-[loading_1.5s_ease-in-out]" style={{ width: '100%' }} />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-3 sm:space-y-4 px-2 sm:px-0 pb-20 lg:pb-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <Link to="/patients">
              <Button variant="outline" size="sm" className="touch-manipulation">
                <ArrowLeft className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Retour</span>
              </Button>
            </Link>
            <div>
              <h1 className="text-base sm:text-lg md:text-xl font-bold truncate max-w-[200px] sm:max-w-none">
                {patient.first_name && patient.last_name
                  ? `${patient.first_name} ${patient.last_name}`
                  : `Patient ${patient.patient_id}`
                }
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate max-w-[200px] sm:max-w-none">
                {patient.pathologies?.name || 'Pathologie non spécifiée'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 w-full sm:w-auto justify-end">
            <ExportDialog
              patientData={{
                patient,
                alerts: alerts.map(a => ({
                  type: a.level,
                  message: a.message,
                  zone: a.zone || 'other',
                })),
                treatment: patient.treatment,
                medicalNotes: patient.medical_notes_nlp,
              }}
            />
            <Badge variant="secondary" className="flex items-center gap-1 text-xs">
              <Shield className="h-3 w-3" />
              <span className="hidden sm:inline">Données chiffrées</span>
              <span className="sm:hidden">Chiffré</span>
            </Badge>
          </div>
        </div>

        {/* Safety Alerts */}
        <SafetyAlertBanner alerts={alerts} />

        {/* Main Content - Dossier Layout with integrated AI */}
        <PatientDossierLayout
          patientId={patient.id}
          patient={{
            id: patient.id,
            first_name: patient.first_name || 'Patient',
            last_name: patient.last_name || patient.patient_id,
            date_of_birth: patient.date_of_birth || '',
            gender: patient.gender,
            email: patient.email,
            phone: patient.phone,
            address: patient.address,
            city: patient.city,
            postal_code: patient.postal_code,
            pathologies: patient.pathologies,
            age: patient.age,
            height_cm: patient.height_cm,
            weight_kg: patient.weight_kg,
            treatment: patient.treatment,
            medical_notes_nlp: patient.medical_notes_nlp,
            // Pass all real database relations to the layout for the AI Assistant
            medications: patient.medications,
            vaccinations: patient.vaccinations,
            allergies: patient.allergies,
            medical_history: patient.medical_history,
            consultations: patient.consultations,
            mental_health: patient.mental_health,
            reproductive_health: patient.reproductive_health,
            clinical_data: patient.clinical_data,
            lab_results_data: patient.lab_results_data,
            lab_results_json: patient.lab_results_json,
          }}
          alerts={alerts}
        />
      </div>
    </AppLayout>
  );
};

export default PatientDetail;
