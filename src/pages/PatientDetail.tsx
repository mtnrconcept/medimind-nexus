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
  lifestyle?: any;
  family_history?: any[];
  symptoms?: any[];
  prevention?: any[];
  imaging?: any[];
  monitoring?: any[];
  communications?: any[];
  dental?: any[];
  functional_exams?: any[];
  age_specific?: any[];
  social_factors?: any[];
  patient_pathologies?: any[];
}

const PatientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [decrypting, setDecrypting] = useState(true);
  const [aiSynthesis, setAiSynthesis] = useState<any>(null);
  const [fetchingSynthesis, setFetchingSynthesis] = useState(false);

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
          patient_lab_results(*),
          patient_lifestyle(*),
          patient_family_history(*),
          patient_symptoms(*),
          patient_prevention(*),
          patient_imaging(*),
          patient_monitoring(*),
          patient_communications(*),
          patient_dental(*),
          patient_functional_exams(*),
          patient_age_specific(*),
          patient_social_factors(*),
          patient_pathologies(*, pathologies(*))
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
          lifestyle: patientData.patient_lifestyle?.[0],
          family_history: patientData.patient_family_history,
          symptoms: patientData.patient_symptoms,
          prevention: patientData.patient_prevention,
          imaging: patientData.patient_imaging,
          monitoring: patientData.patient_monitoring,
          communications: patientData.patient_communications,
          dental: patientData.patient_dental,
          functional_exams: patientData.patient_functional_exams,
          age_specific: patientData.patient_age_specific,
          social_factors: patientData.patient_social_factors,
          patient_pathologies: patientData.patient_pathologies,
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

  const fetchAiSynthesis = async () => {
    if (!id || aiSynthesis) return;
    setFetchingSynthesis(true);
    try {
      const { data, error } = await supabase.functions.invoke('patient-health-synthesis', {
        body: { patient_id: id },
      });
      if (!error) {
        setAiSynthesis(data);
      }
    } catch (err) {
      console.error('Error fetching AI synthesis:', err);
    } finally {
      setFetchingSynthesis(false);
    }
  };

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
      <div className="min-h-screen flex flex-col px-2 sm:px-4 pb-20">
        {/* Header - Fixed Height */}
        <div className="shrink-0 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
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
                patient: {
                  id: patient.id,
                  patientId: patient.patient_id,
                  firstName: patient.first_name,
                  lastName: patient.last_name,
                  age: patient.age,
                  gender: patient.gender,
                  nationality: patient.nationality,
                  heightCm: patient.height_cm,
                  weightKg: patient.weight_kg,
                  dateOfBirth: patient.date_of_birth,
                  email: patient.email,
                  phone: patient.phone,
                  address: patient.address,
                  city: patient.city,
                  postalCode: patient.postal_code,
                },
                alerts: alerts.map(a => ({
                  level: a.level,
                  title: a.title,
                  description: `${a.organ ? `Organe: ${a.organ}\n` : ''}${a.description}. Analyse détaillée disponible dans le rapport IA.`,
                  action: a.action || 'Suivi clinique recommandé',
                })),
                pathologies: [
                  ...(patient.pathologies ? [{
                    name: patient.pathologies.name,
                    icdCode: patient.pathologies.icd_code,
                    category: patient.pathologies.category,
                    severity: 'Moyenne'
                  }] : []),
                  ...(patient.patient_pathologies?.map((pp: any) => ({
                    name: pp.pathologies?.name,
                    icdCode: pp.pathologies?.icd_code,
                    category: pp.pathologies?.category,
                    severity: pp.status
                  })) || [])
                ].filter(p => p.name),
                treatment: patient.treatment,
                medicalNotes: patient.medical_notes_nlp,
                medicalHistory: patient.medical_history?.map(h => ({
                  name: h.condition_name,
                  date: h.diagnosis_date,
                  status: h.is_chronic ? 'chronic' : 'active',
                  icdCode: h.icd_code,
                })),
                vaccines: patient.vaccinations?.map(v => ({
                  name: v.vaccine_name,
                  date: v.vaccination_date,
                  lot: v.lot_number,
                  booster: v.booster_info,
                })),
                lifestyle: patient.lifestyle ? {
                  smokingStatus: patient.lifestyle.smoking_status,
                  alcoholStatus: patient.lifestyle.alcohol_status,
                  physicalActivity: patient.lifestyle.physical_activity_level,
                  diet: patient.lifestyle.diet_type,
                  sleep: patient.lifestyle.sleep_quality,
                } : undefined,
                familyHistory: patient.family_history?.map(f => ({
                  relationship: f.relationship,
                  condition: f.condition,
                  ageAtDiagnosis: f.age_at_diagnosis,
                  isHereditary: f.is_hereditary,
                })),
                symptoms: patient.symptoms?.map(s => ({
                  name: s.symptom_name,
                  severity: s.severity,
                  onsetDate: s.onset_date,
                  isActive: s.is_active,
                })),
                prevention: patient.prevention?.map(p => ({
                  type: p.screening_type || p.screening_name,
                  date: p.last_screening_date || p.last_exam_date,
                  result: p.result,
                  nextDue: p.next_due_date,
                })),
                consultations: patient.consultations?.map(c => ({
                  date: c.consultation_date,
                  physician: c.physician_name,
                  reason: c.reason,
                  notes: c.notes,
                })),
                clinicalData: patient.clinical_data?.map(c => ({
                  date: c.recorded_at,
                  systolic: c.systolic_bp,
                  diastolic: c.diastolic_bp,
                  heartRate: c.heart_rate,
                  temp: c.temperature,
                  spo2: c.oxygen_saturation,
                  weight: c.weight_kg,
                })),
                imaging: patient.imaging?.map(i => ({
                  date: i.exam_date,
                  type: i.imaging_type,
                  bodyRegion: i.body_region || i.body_part,
                  findings: i.findings,
                  conclusion: i.conclusion,
                })),
                mentalHealth: patient.mental_health?.map(m => ({
                  date: m.entry_date,
                  condition: m.diagnosis,
                  status: m.severity,
                  notes: m.notes,
                })),
                reproductiveHealth: patient.reproductive_health?.map(r => ({
                  date: r.entry_date || r.recorded_at,
                  category: r.entry_type,
                  notes: r.notes,
                })),
                medications: patient.medications?.map(m => ({
                  name: m.drug_name,
                  dosage: m.dosage,
                  frequency: m.frequency,
                  startDate: m.start_date,
                  prescribedBy: m.prescribed_by,
                  notes: m.notes,
                })),
                allergies: patient.allergies?.map(a => ({
                  allergen: a.allergen,
                  type: a.allergy_type,
                  severity: a.severity,
                  reaction: a.reaction,
                })),
                functionalExams: (patient as any).functional_exams?.map((e: any) => ({
                  type: e.exam_type,
                  date: e.exam_date,
                  findings: e.findings,
                  physician: e.physician,
                })),
                dental: (patient as any).dental?.map((d: any) => ({
                  date: d.entry_date,
                  procedure: d.procedure,
                  dentist: d.dentist_name,
                  notes: d.notes,
                })),
                monitoring: (patient as any).monitoring?.map((m: any) => ({
                  type: m.monitoring_type,
                  value: `${m.value || ''} ${m.value_unit || ''}`.trim(),
                  date: m.monitoring_date,
                  status: m.is_within_target ? 'Normal' : 'À surveiller',
                })),
                communications: (patient as any).communications?.map((c: any) => ({
                  date: c.communication_date,
                  type: c.communication_type,
                  subject: c.subject,
                  content: c.content,
                })),
                ageSpecific: (patient as any).age_specific?.map((a: any) => ({
                  type: a.entry_type,
                  date: a.entry_date,
                  notes: a.notes,
                })),
                socialFactors: (patient as any).social_factors?.flatMap((s: any) => [
                  { category: 'Logement', description: `${s.housing_status || ''} ${s.housing_type ? `(${s.housing_type})` : ''} ${s.living_alone ? ' - Vit seul' : ''}`.trim() },
                  { category: 'Emploi', description: `${s.employment_status || ''} ${s.occupation ? `- ${s.occupation}` : ''}`.trim() },
                  { category: 'Éducation', description: s.education_level || '-' },
                  { category: 'Soutien', description: `${s.has_family_support ? 'Soutien familial' : 'Pas de soutien familial'} ${s.has_caregiver ? `(Aidant: ${s.caregiver_name || 'Présent'})` : ''}`.trim() },
                  { category: 'Mobilité', description: `${s.has_transportation ? 'Véhiculé' : 'Non véhiculé'} ${s.mobility_issues ? '- Troubles mobilité' : ''}`.trim() },
                  { category: 'Situation financière', description: s.financial_difficulties ? 'Difficultés signalées' : 'Stable' },
                  { category: 'Assurance', description: s.has_health_insurance ? 'Couverture santé active' : 'Pas de couverture santé' },
                  { category: 'Notes sociales', description: s.notes || '-' }
                ]).filter((item: any) => item.description && item.description !== '-'),
                aiSynthesis: aiSynthesis ? {
                  globalSynthesis: aiSynthesis.global_synthesis,
                  healthScore: aiSynthesis.health_score,
                  riskLevel: aiSynthesis.risk_level,
                  vigilancePoints: aiSynthesis.vigilance_points.map((p: any) => ({
                    category: p.category,
                    level: p.level,
                    title: p.title,
                    description: p.description,
                    actionNeeded: p.action_needed,
                  })),
                  weakSignals: aiSynthesis.weak_signals.map((s: any) => ({
                    indicator: s.indicator,
                    trend: s.trend,
                    observation: s.observation,
                    recommendation: s.recommendation,
                  })),
                  treatmentRecommendations: aiSynthesis.treatment_recommendations.map((r: any) => ({
                    category: r.category,
                    suggestedAction: r.suggested_action,
                    rationale: r.rationale,
                    priority: r.priority,
                  })),
                  lifestyleAdvice: aiSynthesis.lifestyle_advice.map((l: any) => ({
                    category: l.category,
                    advice: l.advice,
                    impact: l.impact,
                  })),
                  drugInteractions: aiSynthesis.drug_interactions.map((i: any) => ({
                    medications: i.medications,
                    interactionType: i.interaction_type,
                    severity: i.severity,
                    recommendation: i.recommendation,
                  })),
                } : undefined,
              }}
              onOpen={fetchAiSynthesis}
              isPreFetching={fetchingSynthesis}
            />

            <Badge variant="secondary" className="flex items-center gap-1 text-xs">
              <Shield className="h-3 w-3" />
              <span className="hidden sm:inline">Données chiffrées</span>
              <span className="sm:hidden">Chiffré</span>
            </Badge>
          </div>
        </div>

        {/* Safety Alerts - Fixed Height */}
        <div className="shrink-0 mb-4">
          <SafetyAlertBanner alerts={alerts} />
        </div>

        {/* Main Content - Flex-1 (Takes remaining space) */}
        <div className="flex-1 min-h-0">
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
      </div>
    </AppLayout>
  );
};

export default PatientDetail;
