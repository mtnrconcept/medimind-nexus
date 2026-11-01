/** Pure, deterministic signal detection over SYNTHETIC fixtures. No live patient access. */
import {
  CLINICAL_SOURCES, CLOZAPINE, CRP, HS_TROPONIN_I, MYOCARDITIS,
  type SyntheticLab, type SyntheticPatient, type SyntheticStreamEvent,
} from './synthetic.ts';

export type PatientMicroAlert = {
  patientId: string;
  code: 'inflammatory_trajectory' | 'early_inflammatory_trend' | 'cardiac_biomarker' | 'monitoring_gap';
  level: 'watch' | 'urgent_review';
  firstObservedAt: string;
  label: string;
  explanation: string;
  evidence: string[];
  missing: string[];
  references: string[];
  isDiagnosis: false;
  humanReviewRequired: true;
};
export type ClinicalTwin = {
  id: string;
  pseudonym: string;
  similarity: number;
  sharedFeatures: string[];
  outcome: string;
};
export type CohortCluster = {
  id: string;
  medication: string;
  sharedMedicationCodes: string[];
  sharedIndication: string;
  patientCount: number;
  confirmedCases: number;
  syntheticIds: string[];
};
export type CohortAlert = {
  id: string;
  title: string;
  explanation: string;
  evidence: string[];
  exposedCases: number;
  exposedTotal: number;
  comparatorCases: number;
  comparatorTotal: number;
  supportedWindowDays: number;
  humanReviewRequired: true;
  isDiagnosis: false;
};
export type CohortAnalysis = {
  synthetic: true;
  cohortSize: number;
  exposed: number;
  comparators: number;
  confirmedExposedCases: number;
  confirmedComparatorCases: number;
  earlyWarningsBeforeDiagnosis: number;
  medianSimulatedLeadDays: number | null;
  warningsWithoutConfirmedOutcome: number;
  patientAlerts: PatientMicroAlert[];
  alerts: CohortAlert[];
  clusters: CohortCluster[];
  sources: string[];
  caveat: string;
};

const WINDOW_DAYS = 42;
const DAY_MS = 86_400_000;
const ALERT_REFS = [...CLINICAL_SOURCES];
const CAVEAT = 'Cohorte synthétique artificiellement enrichie en cas (non représentatif) : aucune incidence, efficacité, risque relatif, causalité ou performance clinique réels ne peuvent en être déduits.';

function validIsoDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00.000Z`)) &&
    new Date(`${date}T00:00:00.000Z`).toISOString().slice(0, 10) === date;
}
function dayDifference(start: string, date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / DAY_MS);
}
function exposureStart(patient: SyntheticPatient): string | null {
  const all = patient.medications.filter(m => m.code === CLOZAPINE && validIsoDate(m.startedAt));
  if (all.length === 0) return null;
  return all.sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0].startedAt;
}
function validLab(lab: SyntheticLab, code: string, expectedUnit: string): boolean {
  return lab.code === code && lab.unit === expectedUnit && validIsoDate(lab.observedAt) &&
    Number.isFinite(lab.value) && lab.value >= 0 && Number.isFinite(lab.upperReference) && lab.upperReference > 0;
}
function within(lab: SyntheticLab, start: string): boolean {
  const diff = dayDifference(start, lab.observedAt);
  return diff >= 0 && diff <= WINDOW_DAYS;
}
function labEvidence(lab: SyntheticLab): string {
  return `lab:${lab.id} · ${lab.observedAt} · ${lab.label}: ${lab.value} ${lab.unit} (LSN ${lab.upperReference} ${lab.unit})`;
}
function missingMarker(crp: SyntheticLab[], trop: SyntheticLab[]): string[] {
  return [...(crp.length ? [] : ['CRP']), ...(trop.length ? [] : ['troponin'])];
}

/** Signaux de REVUE, pas diagnostics; tient compte de l'ordre des observations et des unités. */
export function detectPatientSignals(patient: SyntheticPatient): PatientMicroAlert[] {
  if (patient.dataOrigin !== 'synthetic') throw new Error('Microsignal laboratory accepts synthetic records only');
  const start = exposureStart(patient);
  if (!start) return []; // Comparator diagnoses do not imply clozapine exposure.
  const crp = patient.labs.filter(l=>validLab(l,CRP,'mg/L') && within(l,start)).sort((a,b)=>a.observedAt.localeCompare(b.observedAt));
  const trop = patient.labs.filter(l=>validLab(l,HS_TROPONIN_I,'ng/L') && within(l,start)).sort((a,b)=>a.observedAt.localeCompare(b.observedAt));
  const missing=missingMarker(crp,trop);
  const out: PatientMicroAlert[] = [];
  const highCrp=crp.find(l=>l.value > 100);
  const highTrop=trop.find(l=>l.value > 2*l.upperReference);
  const mildCrp=crp.find(l=>l.value >= 50 && l.value <= 100);
  const mildTrop=trop.find(l=>l.value > l.upperReference && l.value <= 2*l.upperReference);
  const biomarker=([highCrp,highTrop].filter(Boolean) as SyntheticLab[]).sort((a,b)=>a.observedAt.localeCompare(b.observedAt))[0];
  if(biomarker){
    const evidence=[highCrp,highTrop].filter(Boolean).map(l=>labEvidence(l as SyntheticLab));
    out.push({patientId:patient.id,code:'cardiac_biomarker',level:'urgent_review',firstObservedAt:biomarker.observedAt,
      label:'Revue clinique rapide des biomarqueurs',
      explanation:'Seuil CRP >100 mg/L ou troponine >2× sa LSN après initiation de clozapine. Les biomarqueurs ne constituent pas à eux seuls un diagnostic de myocardite; rechercher les causes alternatives avec un clinicien.',
      evidence,missing,references:ALERT_REFS,isDiagnosis:false,humanReviewRequired:true});
  }
  // Non-specific signs precede diagnoses in the deliberately enriched cases.
  if(mildCrp||mildTrop){
    const first=([mildCrp,mildTrop].filter(Boolean) as SyntheticLab[]).sort((a,b)=>a.observedAt.localeCompare(b.observedAt))[0];
    out.push({patientId:patient.id,code:'inflammatory_trajectory',level:'watch',firstObservedAt:first.observedAt,
      label:'Tendance inflammatoire à vérifier',
      explanation:'CRP 50–100 mg/L et/ou élévation modérée de troponine pendant la fenêtre de surveillance; signe non spécifique. Vérifier le contexte infectieux et répéter les mesures suivant le protocole local.',
      evidence:[mildCrp,mildTrop].filter(Boolean).map(l=>labEvidence(l as SyntheticLab)),missing,references:ALERT_REFS,isDiagnosis:false,humanReviewRequired:true});
  }
  // A low-intensity signal must be longitudinal, not a single elevated CRP.
  // Fever/heart rate are non-specific: require a rising trajectory and a new
  // concurrent change in pulse; never label the pattern a myocarditis case.
  const baselineCrp = crp.find(l => dayDifference(start, l.observedAt) === 0);
  const baselineVital = patient.vitals.find(v => v.date === start);
  if (baselineCrp && baselineVital && baselineCrp.value < 15 &&
      !mildCrp && !mildTrop && !highCrp && !highTrop) {
    const concerning = crp.find((latest, index) => {
      if (index === 0 || latest.value < 15 || latest.value >= 50 || latest.value < baselineCrp.value * 3) return false;
      const previous = crp[index - 1];
      if (latest.value < previous.value * 1.5) return false;
      const vital = patient.vitals.find(v => v.date === latest.observedAt);
      return Boolean(vital && Number.isFinite(vital.heartRateBpm) && vital.heartRateBpm >= 110 &&
        vital.heartRateBpm >= baselineVital.heartRateBpm + 30);
    });
    if (concerning) {
      out.push({patientId:patient.id,code:'early_inflammatory_trend',level:'watch',firstObservedAt:concerning.observedAt,
        label:'Microsignal non spécifique : CRP montante et pouls accéléré',
        explanation:'Hausse répétée de CRP depuis la référence accompagnée d’une augmentation du pouls. Profil non spécifique pouvant notamment être infectieux; contrôle clinique et biologique, aucune prédiction diagnostique.',
        evidence:[labEvidence(baselineCrp),labEvidence(concerning),`signe:vital-${concerning.observedAt} · pouls en hausse de ≥30/min depuis le bilan initial`],
        missing,references:ALERT_REFS,isDiagnosis:false,humanReviewRequired:true});
    }
  }
  if(!crp.length||!trop.length){
    out.push({patientId:patient.id,code:'monitoring_gap',level:'watch',firstObservedAt:start,
      label:'Surveillance biologique incomplète',
      explanation:'Marqueur non mesuré ou unité/LSN incompatible : son état n’est pas connu et ne doit pas être interprété comme normal.',
      evidence:[],missing,references:ALERT_REFS,isDiagnosis:false,humanReviewRequired:true});
  }
  return out.sort((a,b)=>a.firstObservedAt.localeCompare(b.firstObservedAt)||a.code.localeCompare(b.code));
}

function indexDate(patient: SyntheticPatient): string | null {
  const dates=patient.medications.map(m=>m.startedAt).filter(validIsoDate).sort();
  // Require a relevant antipsychotic index, not a prior anxiolytic/diabetes prescription.
  const indexDrug=patient.medications.find(m => m.code === CLOZAPINE || m.code === 'ATC:N05AH03');
  return indexDrug?.startedAt || dates[0] || null;
}
function isConfirmedAfterIndex(patient: SyntheticPatient): boolean {
  const start=indexDate(patient);
  if(!start) return false;
  return patient.diagnoses.some(d => d.code===MYOCARDITIS && d.status==='confirmed' && d.validatedBy==='simulated_clinician'
    && validIsoDate(d.diagnosedAt) && dayDifference(start,d.diagnosedAt)>0 && dayDifference(start,d.diagnosedAt)<=WINDOW_DAYS);
}

export function buildCohortAnalysis(patients: SyntheticPatient[]): CohortAnalysis {
  if(patients.some(p=>p.dataOrigin!=='synthetic' || !/^SIM-P\d{3}$/.test(p.id) || p.provenance?.realPatientData!==false)||new Set(patients.map(p=>p.id)).size!==patients.length){
    throw new Error('Demo cohort requires unique synthetic patients');
  }
  const exposed=patients.filter(p=>exposureStart(p)!==null);
  const comparator=patients.filter(p=>exposureStart(p)===null);
  const exposedCases=exposed.filter(isConfirmedAfterIndex);
  const comparatorCases=comparator.filter(isConfirmedAfterIndex);
  const patientAlerts=patients.flatMap(detectPatientSignals);
  const leadDays=exposedCases.flatMap(p=>{
    const diagnosis=p.diagnoses.filter(d=>d.code===MYOCARDITIS && d.status==='confirmed')
      .sort((a,b)=>a.diagnosedAt.localeCompare(b.diagnosedAt))[0];
    const earliest=patientAlerts.filter(a=>a.patientId===p.id && a.firstObservedAt<diagnosis.diagnosedAt)
      .sort((a,b)=>a.firstObservedAt.localeCompare(b.firstObservedAt))[0];
    return earliest?[dayDifference(earliest.firstObservedAt,diagnosis.diagnosedAt)]:[];
  }).sort((a,b)=>a-b);
  const medianSimulatedLeadDays=leadDays.length===0 ? null :
    leadDays.length%2===0 ? (leadDays[leadDays.length/2-1]+leadDays[leadDays.length/2])/2 :
      leadDays[Math.floor(leadDays.length/2)];
  const warningsWithoutConfirmedOutcome=exposed.filter(p=>!isConfirmedAfterIndex(p) &&
    patientAlerts.some(a=>a.patientId===p.id)).length;

  const clusters: CohortCluster[]=[];
  for(const [medCode,medLabel] of [[CLOZAPINE,'Clozapine'],['ATC:N05AH03','Olanzapine']]){
    const members=patients.filter(p=>p.medications.some(m=>m.code===medCode) && p.diagnoses.some(d=>d.code==='ICD10:F20.9'));
    if(members.length<3)continue;
    clusters.push({id:`SIM-CLUSTER-${medCode.split(':')[1]}`, medication:medLabel,
      sharedMedicationCodes:[medCode],sharedIndication:'ICD10:F20.9',patientCount:members.length,
      confirmedCases:members.filter(isConfirmedAfterIndex).length,syntheticIds:members.map(p=>p.id)});
  }
  const alerts:CohortAlert[]=[];
  // For a deliberately enriched case/control SIMULATION this confirms only the detector's grouping rules.
  if(exposed.length>=10 && comparator.length>=10 && exposedCases.length>=3){
    alerts.push({id:'SIM-CLOZAPINE-MYOCARDITIS-EARLY',title:'Regroupement temporel clozapine / myocardite (simulation)',
      explanation:'Plusieurs diagnostics simulés suivent une initiation commune dans les 42 jours. Comparateur inclus, biais de sélection intentionnel : aucun risque réel, incidence, causalité ni p-valeur inférable.',
      evidence:[`Cas exposés validés fictivement : ${exposedCases.length}/${exposed.length}`, `Comparateurs fictifs : ${comparatorCases.length}/${comparator.length}`,'Fenêtre : 42 jours depuis l’initiation; diagnostic clinique simulé distinct d’une alerte biologique.'],
      exposedCases:exposedCases.length,exposedTotal:exposed.length,comparatorCases:comparatorCases.length,comparatorTotal:comparator.length,
      supportedWindowDays:WINDOW_DAYS,humanReviewRequired:true,isDiagnosis:false});
  }
  return {
    synthetic:true,cohortSize:patients.length,exposed:exposed.length,comparators:comparator.length,
    confirmedExposedCases:exposedCases.length,confirmedComparatorCases:comparatorCases.length,
    earlyWarningsBeforeDiagnosis:leadDays.length,medianSimulatedLeadDays,warningsWithoutConfirmedOutcome,
    patientAlerts, alerts, clusters,sources:ALERT_REFS,caveat:CAVEAT,
  };
}

/** Similarity is based on clinical *features* not country, name or personal identifiers. */
export function findClinicalTwins(patients:SyntheticPatient[],id:string):ClinicalTwin[] {
  const target=patients.find(p=>p.id===id);
  if(!target||target.dataOrigin!=='synthetic')return [];
  const a=new Set(target.medications.map(x=>x.code));
  const conditions=new Set(target.diagnoses.map(x=>x.code));
  const primary = target.medications.find(m=>m.code===CLOZAPINE||m.code==='ATC:N05AH03')?.code;
  return patients.filter(p=>p.id!==id && (!primary || p.medications.some(m=>m.code===primary))).map(p=>{
    const sharedMedication=p.medications.filter(m=>a.has(m.code)).map(m=>`traitement: ${m.name.toLowerCase()}`);
    const sharedConditions=p.diagnoses.filter(d=>conditions.has(d.code)).map(d=>`pathologie: ${d.code}`);
    const sharedFeatures=[...sharedMedication,...sharedConditions];
    const similarity=Math.round(100 * sharedFeatures.length / new Set([...a,...conditions,...p.medications.map(m=>m.code),...p.diagnoses.map(d=>d.code)]).size);
    return {id:p.id,pseudonym:p.pseudonym,similarity,sharedFeatures,outcome:p.diagnoses.some(d=>d.code===MYOCARDITIS && d.status==='confirmed')?'Myocardite simulée confirmée':'Aucune myocardite confirmée dans le scénario'};
  }).filter(t=>t.sharedFeatures.length>=2).sort((a,b)=>b.similarity-a.similarity||a.id.localeCompare(b.id));
}

/** An event changes only a synthetic record. Recalculation is performed by the caller. */
export function applySyntheticLabEvent(patients:SyntheticPatient[],event:SyntheticStreamEvent):SyntheticPatient[] {
  const {patientId,observation}=event;
  if(!/^SIM-P\d{3}$/.test(patientId))throw new Error('Only synthetic patient identifiers allowed');
  const p=patients.find(x=>x.id===patientId);
  if(!p||p.dataOrigin!=='synthetic')throw new Error('Synthetic patient not found');
  if(!validIsoDate(observation.observedAt)||!Number.isFinite(observation.value)||observation.value<0||
      !Number.isFinite(observation.upperReference)||observation.upperReference<=0||
      observation.source!=='simulated_lab' ||
      !([CRP,HS_TROPONIN_I].some(code=>validLab(observation,code,code===CRP?'mg/L':'ng/L')))){
    throw new Error('Invalid clinical observation');
  }
  if(p.labs.some(l=>l.id===observation.id))return patients;
  if(p.labs.length>=500)throw new Error('Synthetic record observation limit reached');
  return patients.map(x=>x.id!==patientId?x:{...x,
    labs:[...x.labs,observation].sort((a,b)=>a.observedAt.localeCompare(b.observedAt)||a.id.localeCompare(b.id)),
    timeline:[...x.timeline,{id:observation.id,date:observation.observedAt,kind:'lab' as const,text:`Nouvelle observation simulée : ${observation.label} ${observation.value} ${observation.unit}`}]
      .sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)),
  });
}
