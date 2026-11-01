/**
 * Every identity, value, consultation and outcome in this module is fabricated.
 * The source references justify the clinical *scenario*, not the observations.
 * Never insert these fixtures in the production patient tables.
 */
export const SYNTHETIC_STUDY_ID = 'SIM-CLOZAPINE-MYOCARDITIS-2026' as const;
export const CLINICAL_SOURCES = [
  'PMID:21524186', // Ronaldson 2011 myocarditis monitoring
  'PMID:35048875', // electronic register, 42-day window
  'PMID:40452212', // consensus on screening and monitoring
] as const;

export const CRP = 'LOINC:1988-5';
export const HS_TROPONIN_I = 'LOINC:89579-7';
export const CLOZAPINE = 'ATC:N05AH02';
export const MYOCARDITIS = 'ICD10:I40.9';

export type SyntheticLab = {
  id: string;
  code: string;
  label: string;
  observedAt: string;
  value: number;
  unit: string;
  upperReference: number;
  source: 'simulated_lab';
  assay: string;
};
export type SyntheticDiagnosis = {
  code: string;
  label: string;
  diagnosedAt: string;
  status: 'confirmed' | 'suspected';
  validatedBy: 'simulated_clinician' | 'none';
};
export type SyntheticMedication = {
  code: string;
  name: string;
  dose: string;
  frequency: string;
  startedAt: string;
  endedAt: string | null;
  indication: string;
  adherence: 'documented' | 'unknown';
};
export type SyntheticVital = {
  date: string;
  heartRateBpm: number;
  temperatureC: number;
  systolicBp: number;
  diastolicBp: number;
  oxygenSaturationPct: number;
};
export type SyntheticEncounter = {
  date: string;
  specialty: string;
  type: string;
  findings: string[];
  assessment: string;
  plan: string;
};
export type SyntheticTimelineEvent = {
  id: string;
  date: string;
  kind: 'medication' | 'lab' | 'diagnosis' | 'visit' | 'symptom';
  text: string;
};
export type SyntheticPatient = {
  id: string;
  dataOrigin: 'synthetic';
  studyId: typeof SYNTHETIC_STUDY_ID;
  pseudonym: string;
  demographics: {
    dateOfBirth: string;
    ageAtIndex: number;
    sex: 'F' | 'M';
    nationality: string;
    heightCm: number;
    weightKg: number;
    site: string;
  };
  socioEconomic: { occupationCategory: string; livingSituation: string; accessToCare: string };
  lifestyle: { smoker: boolean; alcohol: string; activity: string; sleepHours: number };
  familyHistory: { relation: string; condition: string; onsetAge: number | null }[];
  allergies: { substance: string; status: 'known' | 'unknown'; reaction: string | null }[];
  vaccinations: { vaccine: string; administeredAt: string; status: 'recorded' | 'unknown' }[];
  diagnoses: SyntheticDiagnosis[];
  medications: SyntheticMedication[];
  labs: SyntheticLab[];
  vitals: SyntheticVital[];
  ecgs: { date: string; finding: string; status: 'baseline' | 'followup' }[];
  encounters: SyntheticEncounter[];
  timeline: SyntheticTimelineEvent[];
  provenance: {
    generatedBy: string;
    generatorVersion: '1.0';
    references: string[];
    realPatientData: false;
    samplingMethod: 'deliberately_enriched_case_control';
    clinicalClaimsValidated: false;
  };
};
export type SyntheticStreamEvent = { patientId: string; observation: SyntheticLab };

const FIRST_NAMES = [
  'Alix', 'Camille', 'Sacha', 'Noémie', 'Maël', 'Inès', 'Louis', 'Éloïse', 'Jules', 'Léna',
  'Armand', 'Aya', 'Émile', 'Mila', 'Robin', 'Zoé', 'Basile', 'Nina', 'Hugo', 'Clara',
  'Léo', 'Maya', 'Éden', 'Sara', 'Adam', 'Lina', 'Lucie', 'Alex', 'Yanis', 'Emma',
  'Nora', 'Elio', 'Naël', 'Lola', 'Luca', 'Aline', 'Ilan', 'Jade', 'Noé', 'Elsa',
  'Théo', 'Romy', 'Elina', 'Hana', 'Malo', 'Anouk', 'Lou', 'Yara', 'Liam', 'Ella',
];
const FAMILY_NAMES = [
  'Morel', 'Girard', 'Bernard', 'Meier', 'Dubois', 'Müller', 'Roux', 'Leclerc', 'Rossi', 'Martin',
  'Steiner', 'Berger', 'Schmitt', 'Ferrari', 'André', 'Meyer', 'Perrin', 'Fischer', 'Lemoine', 'Bieri',
  'Brun', 'Weber', 'Marchand', 'Keller', 'Petit', 'Besson', 'Lambert', 'Vogel', 'Bauer', 'Benoît',
  'Richard', 'Schneider', 'Bouchard', 'Sutter', 'Garnier', 'Moreau', 'Pauli', 'Bourgeois', 'Noël', 'Gauthier',
  'Simon', 'Picard', 'Frey', 'Laurent', 'Schaller', 'Dumont', 'Caron', 'Aubert', 'Colin', 'Fournier',
];
const COUNTRIES = ['CH', 'FR', 'BE', 'DE', 'IT'];
const HOSPITALS = ['Centre simulé Genève', 'Centre simulé Lyon', 'Centre simulé Lausanne'];
const DAY_MS = 86_400_000;

export function addDays(iso: string, offset: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid date');
  return new Date(date.getTime() + offset * DAY_MS).toISOString().slice(0, 10);
}

function lab(id: string, date: string, code: string, value: number): SyntheticLab {
  const specs: Record<string, [string, string, number, string]> = {
    [CRP]: ['Protéine C-réactive', 'mg/L', 5, 'CRP quantitative sérum'],
    [HS_TROPONIN_I]: ['Troponine cardiaque I ultrasensible', 'ng/L', 14, 'hs-cTnI méthode simulée; LSN hypothétique locale'],
    'LOINC:751-8': ['Neutrophiles', 'G/L', 7.5, 'Numération neutrophiles simulée'],
    'LOINC:2160-0': ['Créatinine', 'µmol/L', 105, 'Biochimie simulée'],
    'LOINC:1742-6': ['ALAT', 'U/L', 45, 'Biochimie simulée'],
  };
  const spec = specs[code];
  if (!spec) throw new Error(`Unknown lab code ${code}`);
  return { id, code, label: spec[0], observedAt: date, value, unit: spec[1], upperReference: spec[2], assay: spec[3], source: 'simulated_lab' };
}

/** 26 clozapine exposures, 24 comparator starts; five and one confirmed myocarditis cases respectively. */
export function generateSyntheticCohort(): SyntheticPatient[] {
  return Array.from({ length: 50 }, (_, i): SyntheticPatient => {
    const id = `SIM-P${String(i + 1).padStart(3, '0')}`;
    const indexDate = addDays('2025-09-01', (i % 10) * 7 + Math.floor(i / 10) * 13);
    const exposed = i < 26;
    const confirmedMyocarditis = new Set([2, 6, 11, 15, 22, 28]).has(i);
    const confirmedAfterExposure = exposed && confirmedMyocarditis;
    const infection = i === 8 || i === 37;
    const onsetDay = 22 + (i % 4);
    const primary = exposed ? CLOZAPINE : 'ATC:N05AH03';
    const meds: SyntheticMedication[] = [
      {
        code: primary,
        name: exposed ? 'Clozapine' : 'Olanzapine',
        dose: exposed ? `${50 + 25 * (i % 3)} mg/j (montée progressive simulée)` : `${10 + (i % 3) * 5} mg/j`,
        frequency: 'quotidienne', startedAt: indexDate, endedAt: null,
        indication: 'Schizophrénie résistante documentée', adherence: 'documented',
      },
      {
        code: i % 3 === 0 ? 'ATC:N03AG01' : 'ATC:N05BA01',
        name: i % 3 === 0 ? 'Valproate' : 'Diazépam',
        dose: i % 3 === 0 ? '500 mg/j (simulation)' : '2 mg si besoin (simulation)',
        frequency: i % 3 === 0 ? 'quotidienne' : 'au besoin',
        startedAt: addDays(indexDate, -70), endedAt: null,
        indication: i % 3 === 0 ? 'Trouble affectif associé' : 'Anxiété', adherence: 'unknown',
      },
    ];
    if (i % 5 === 0) meds.push({
      code: 'ATC:A10BA02', name: 'Metformine', dose: '500 mg/j (simulation)', frequency: 'quotidienne',
      startedAt: addDays(indexDate, -200), endedAt: null, indication: 'Diabète de type 2', adherence: 'documented',
    });
    const diagnoses: SyntheticDiagnosis[] = [
      { code: 'ICD10:F20.9', label: 'Schizophrénie résistante', diagnosedAt: addDays(indexDate, -730), status: 'confirmed', validatedBy: 'simulated_clinician' },
      ...(i % 5 === 0 ? [{ code: 'ICD10:E11.9', label: 'Diabète de type 2', diagnosedAt: addDays(indexDate, -440), status: 'confirmed' as const, validatedBy: 'simulated_clinician' as const }] : []),
      ...(confirmedMyocarditis ? [{ code: MYOCARDITIS, label: i === 28 ? 'Myocardite virale simulée' : 'Myocardite suspectée associée à la clozapine, confirmée à l’issue du bilan simulé', diagnosedAt: addDays(indexDate, onsetDay + 3), status: 'confirmed' as const, validatedBy: 'simulated_clinician' as const }] : []),
      ...(infection ? [{ code: 'ICD10:J06.9', label: 'Infection respiratoire intercurrente', diagnosedAt: addDays(indexDate, 20), status: 'confirmed' as const, validatedBy: 'simulated_clinician' as const }] : []),
    ];
    const labs: SyntheticLab[] = [];
    const points = [0, 7, 14, 21, 28, 42];
    for (const day of points) {
      const date = addDays(indexDate, day);
      const caseInflammation = confirmedMyocarditis && day >= 14 && day <= 28;
      const caseTroponin = confirmedMyocarditis && day >= 21 && day <= 28;
      const infectiousCRP = infection && day === 21;
      const crp = caseInflammation ? (day === 14 ? 62 + i % 4 : day === 21 ? 119 + i % 4 : 37) : infectiousCRP ? 69 : 2 + (i % 6);
      const troponin = caseTroponin ? 36 + (i % 5) * 3 : 3 + (i % 6);
      labs.push(lab(`${id}-crp-${day}`, date, CRP, crp));
      labs.push(lab(`${id}-tni-${day}`, date, HS_TROPONIN_I, troponin));
      labs.push(lab(`${id}-neu-${day}`, date, 'LOINC:751-8', 3.1 + (i % 7) * 0.2));
      labs.push(lab(`${id}-cre-${day}`, date, 'LOINC:2160-0', 71 + (i % 9) * 2));
      labs.push(lab(`${id}-alt-${day}`, date, 'LOINC:1742-6', 20 + (i % 9)));
    }
    const vitals: SyntheticVital[] = points.map(day => ({
      date: addDays(indexDate, day), heartRateBpm: confirmedMyocarditis && day >= 14 && day <= 28 ? 120 + i % 7 : infection && day === 21 ? 108 : 68 + i % 15,
      temperatureC: confirmedMyocarditis && day === 21 ? 38.2 : infection && day === 21 ? 38.4 : 36.6 + (i % 4) * 0.1,
      systolicBp: 116 + (i % 8) * 2, diastolicBp: 72 + (i % 5), oxygenSaturationPct: confirmedMyocarditis && day === 21 ? 95 : 98,
    }));
    const encounters: SyntheticEncounter[] = [0, 14, 28, 42].map(day => ({
      date: addDays(indexDate, day), specialty: 'Psychiatrie / médecine interne (simulation)', type: day === 0 ? 'Bilan initial' : `Suivi J${day}`,
      findings: confirmedMyocarditis && day === 28 ? ['Syndrome inflammatoire', 'Symptômes cardio-respiratoires', 'Bilan cardiologique simulé'] : infection && day === 28 ? ['Infection intercurrente', 'Troponine dans la plage de référence simulée'] : ['Suivi clinique', 'Examen standardisé simulé'],
      assessment: confirmedMyocarditis && day === 28 ? 'Myocardite confirmée dans ce scénario fictif; ne préjuge pas du diagnostic réel.' : day === 0 ? 'Bilan initial et surveillance protocolisée.' : 'Surveillance clinique sans conclusion causale.',
      plan: 'Suivi par professionnel de santé (scénario de démonstration).',
    }));
    const ecgs = [
      { date: addDays(indexDate, 0), finding: 'ECG de référence simulé, sans anomalie spécifique', status: 'baseline' as const },
      { date: addDays(indexDate, 28), finding: confirmedMyocarditis ? 'Modifications non spécifiques ST-T; confirmation médicale simulée avec biologie' : 'Pas de modification significative simulée', status: 'followup' as const },
    ];
    const timeline: SyntheticTimelineEvent[] = [
      ...meds.map((m, n) => ({ id: `${id}-med-${n}`, date: m.startedAt, kind: 'medication' as const, text: `${m.name} (${m.dose})` })),
      ...diagnoses.map((d, n) => ({ id: `${id}-dx-${n}`, date: d.diagnosedAt, kind: 'diagnosis' as const, text: `${d.label} — ${d.status}` })),
      ...encounters.map((e, n) => ({ id: `${id}-enc-${n}`, date: e.date, kind: 'visit' as const, text: e.type })),
      ...labs.filter(l => l.code === CRP || l.code === HS_TROPONIN_I).map(l => ({ id: l.id, date: l.observedAt, kind: 'lab' as const, text: `${l.label} : ${l.value} ${l.unit}` })),
      ...(confirmedMyocarditis ? [{ id: `${id}-sym-1`, date: addDays(indexDate, 17), kind: 'symptom' as const, text: 'Fatigue, tachycardie et syndrome pseudo-grippal simulés' }] : []),
    ].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
    const dateOfBirth = `${1968 + (i % 36)}-${String(1 + (i%12)).padStart(2,'0')}-${String(2+(i%25)).padStart(2,'0')}`;
    const ageAtIndex = Number(indexDate.slice(0,4))-Number(dateOfBirth.slice(0,4)) - (indexDate.slice(5)<dateOfBirth.slice(5)?1:0);
    return {
      id, dataOrigin:'synthetic', studyId:SYNTHETIC_STUDY_ID,
      pseudonym:`${FIRST_NAMES[i]} ${FAMILY_NAMES[i]} · fictif`,
      demographics:{ dateOfBirth, ageAtIndex, sex:i%2===0?'F':'M', nationality:COUNTRIES[i%COUNTRIES.length], heightCm:155+(i%34),weightKg:55+(i%39),site:HOSPITALS[i%3]},
      socioEconomic:{ occupationCategory:i%3===0?'Sans activité professionnelle':i%3===1?'Employé (fictif)':'Formation (fictive)', livingSituation:i%4===0?'Avec proches':'Autonome', accessToCare:'Suivi ambulatoire simulé' },
      lifestyle:{ smoker:i%4===0, alcohol:i%5===0?'Aucune consommation déclarée (simulation)':'Données non confirmées',activity:i%3===0?'Marche occasionnelle':'Activité légère',sleepHours:6+(i%3)},
      familyHistory:[{relation:'parent au 1er degré', condition:i%3===0?'Diabète de type 2':'Hypertension artérielle', onsetAge:50+i%12}],
      allergies:[{substance:'Non renseigné',status:'unknown',reaction:null}],
      vaccinations:[{vaccine:'Grippe saisonnière',administeredAt:'2024-10-05',status:i%3===0?'recorded':'unknown'}],
      diagnoses,medications:meds,labs,vitals,ecgs,encounters,timeline,
      provenance:{generatedBy:'MediCore deterministic demo generator',generatorVersion:'1.0',references:[...CLINICAL_SOURCES],realPatientData:false,samplingMethod:'deliberately_enriched_case_control',clinicalClaimsValidated:false},
    };
  });
}

/** A staged, entirely fictitious incoming result for streaming UI testing. */
export function syntheticStreamEvents(): SyntheticStreamEvent[] {
  const cases=generateSyntheticCohort();
  return [
    [9, HS_TROPONIN_I, 38], [9,CRP,73],
    [13,CRP,55], [18,HS_TROPONIN_I,34], [24,CRP,64], [24,HS_TROPONIN_I,41],
  ].map(([index,code,value],n) => {
    const patient=cases[index as number];
    const indexDate=patient.medications.find(m=>m.code===CLOZAPINE)!.startedAt;
    return {
      patientId: patient.id,
      observation: lab(`${patient.id}-stream-${n}`,addDays(indexDate,25+n%2),code as string,value as number),
    };
  });
}
