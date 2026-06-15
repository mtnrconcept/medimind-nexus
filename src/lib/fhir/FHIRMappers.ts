/**
 * FHIR Resource Mappers
 * 
 * Bidirectional mapping between MediMind Nexus internal format and FHIR R4 resources.
 * Supports:
 * - Patient
 * - Observation
 * - Condition
 * - MedicationRequest
 * - AllergyIntolerance
 */

import type { FHIRResource } from './FHIRClient';

// ============================================
// INTERNAL TYPES (MediMind Nexus format)
// ============================================

export interface InternalPatient {
    id: string;
    patientId: string;
    age: number;
    gender: 'M' | 'F';
    nationality?: string;
    heightCm?: number;
    weightKg?: number;
    birthDate?: Date;
    pathologies?: Array<{ name: string; icdCode?: string }>;
}

export interface InternalObservation {
    id: string;
    patientId: string;
    code: string;
    display: string;
    value: number;
    unit: string;
    effectiveDateTime: Date;
    status: 'final' | 'preliminary' | 'amended';
}

export interface InternalCondition {
    id: string;
    patientId: string;
    code: string;
    display: string;
    icdCode?: string;
    onsetDate?: Date;
    clinicalStatus: 'active' | 'recurrence' | 'relapse' | 'inactive' | 'remission' | 'resolved';
}

export interface InternalMedication {
    id: string;
    patientId: string;
    medicationName: string;
    dosage?: string;
    frequency?: string;
    startDate?: Date;
    endDate?: Date;
    status: 'active' | 'completed' | 'stopped' | 'on-hold';
}

export interface InternalAllergy {
    id: string;
    patientId: string;
    allergen: string;
    reaction?: string;
    severity?: 'mild' | 'moderate' | 'severe';
    status: 'active' | 'inactive' | 'resolved';
}

// ============================================
// FHIR RESOURCE TYPES (simplified R4)
// ============================================

export interface FHIRPatient extends FHIRResource {
    resourceType: 'Patient';
    identifier?: Array<{
        system?: string;
        value: string;
    }>;
    name?: Array<{
        family?: string;
        given?: string[];
        text?: string;
    }>;
    gender?: 'male' | 'female' | 'other' | 'unknown';
    birthDate?: string;
    extension?: Array<{
        url: string;
        valueQuantity?: {
            value: number;
            unit: string;
            system: string;
            code: string;
        };
    }>;
}

export interface FHIRObservation extends FHIRResource {
    resourceType: 'Observation';
    status: 'final' | 'preliminary' | 'amended' | 'corrected' | 'cancelled';
    code: {
        coding: Array<{
            system: string;
            code: string;
            display: string;
        }>;
        text?: string;
    };
    subject: {
        reference: string;
    };
    effectiveDateTime?: string;
    valueQuantity?: {
        value: number;
        unit: string;
        system?: string;
        code?: string;
    };
}

export interface FHIRCondition extends FHIRResource {
    resourceType: 'Condition';
    clinicalStatus: {
        coding: Array<{
            system: string;
            code: string;
        }>;
    };
    code: {
        coding: Array<{
            system: string;
            code: string;
            display: string;
        }>;
        text?: string;
    };
    subject: {
        reference: string;
    };
    onsetDateTime?: string;
}

export interface FHIRMedicationRequest extends FHIRResource {
    resourceType: 'MedicationRequest';
    status: 'active' | 'completed' | 'stopped' | 'on-hold' | 'cancelled';
    intent: 'order' | 'plan' | 'proposal';
    medicationCodeableConcept?: {
        coding?: Array<{
            system: string;
            code: string;
            display: string;
        }>;
        text: string;
    };
    subject: {
        reference: string;
    };
    dosageInstruction?: Array<{
        text?: string;
        timing?: {
            code?: {
                text: string;
            };
        };
    }>;
    authoredOn?: string;
}

export interface FHIRAllergyIntolerance extends FHIRResource {
    resourceType: 'AllergyIntolerance';
    clinicalStatus: {
        coding: Array<{
            system: string;
            code: string;
        }>;
    };
    code: {
        coding?: Array<{
            system: string;
            code: string;
            display: string;
        }>;
        text: string;
    };
    patient: {
        reference: string;
    };
    reaction?: Array<{
        manifestation: Array<{
            coding?: Array<{
                system: string;
                code: string;
                display: string;
            }>;
            text: string;
        }>;
        severity?: 'mild' | 'moderate' | 'severe';
    }>;
}

// ============================================
// CODING SYSTEMS
// ============================================

const LOINC_SYSTEM = 'http://loinc.org';
const SNOMED_SYSTEM = 'http://snomed.info/sct';
const ICD10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10';
const RXNORM_SYSTEM = 'http://www.nlm.nih.gov/research/umls/rxnorm';
const UCUM_SYSTEM = 'http://unitsofmeasure.org';
const CLINICAL_STATUS_SYSTEM = 'http://terminology.hl7.org/CodeSystem/condition-clinical';
const ALLERGY_STATUS_SYSTEM = 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical';

// LOINC codes for common observations
const OBSERVATION_CODES: Record<string, { system: string; code: string; display: string }> = {
    glucose_mg_dl: { system: LOINC_SYSTEM, code: '2345-7', display: 'Glucose [Mass/volume] in Serum or Plasma' },
    blood_pressure_sys: { system: LOINC_SYSTEM, code: '8480-6', display: 'Systolic blood pressure' },
    blood_pressure_dia: { system: LOINC_SYSTEM, code: '8462-4', display: 'Diastolic blood pressure' },
    temperature_c: { system: LOINC_SYSTEM, code: '8310-5', display: 'Body temperature' },
    hemoglobin_g_dl: { system: LOINC_SYSTEM, code: '718-7', display: 'Hemoglobin [Mass/volume] in Blood' },
    creatinine_mg_dl: { system: LOINC_SYSTEM, code: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma' },
    potassium_meq_l: { system: LOINC_SYSTEM, code: '2823-3', display: 'Potassium [Moles/volume] in Serum or Plasma' },
    spo2_percent: { system: LOINC_SYSTEM, code: '59408-5', display: 'Oxygen saturation in Arterial blood' },
    alt_u_l: { system: LOINC_SYSTEM, code: '1742-6', display: 'Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma' },
    crp_mg_l: { system: LOINC_SYSTEM, code: '1988-5', display: 'C reactive protein [Mass/volume] in Serum or Plasma' },
};

// ============================================
// MAPPERS: Internal -> FHIR
// ============================================

export function patientToFHIR(patient: InternalPatient): FHIRPatient {
    const extensions: FHIRPatient['extension'] = [];

    if (patient.heightCm) {
        extensions.push({
            url: 'http://hl7.org/fhir/StructureDefinition/patient-bodyHeight',
            valueQuantity: {
                value: patient.heightCm,
                unit: 'cm',
                system: UCUM_SYSTEM,
                code: 'cm',
            },
        });
    }

    if (patient.weightKg) {
        extensions.push({
            url: 'http://hl7.org/fhir/StructureDefinition/patient-bodyWeight',
            valueQuantity: {
                value: patient.weightKg,
                unit: 'kg',
                system: UCUM_SYSTEM,
                code: 'kg',
            },
        });
    }

    return {
        resourceType: 'Patient',
        id: patient.id,
        identifier: [
            {
                system: 'urn:medimind:patient-id',
                value: patient.patientId,
            },
        ],
        gender: patient.gender === 'M' ? 'male' : 'female',
        birthDate: patient.birthDate?.toISOString().split('T')[0],
        extension: extensions.length > 0 ? extensions : undefined,
    };
}

export function observationToFHIR(
    observation: InternalObservation,
    codeMapping?: { system: string; code: string; display: string }
): FHIRObservation {
    const coding = codeMapping || OBSERVATION_CODES[observation.code] || {
        system: LOINC_SYSTEM,
        code: observation.code,
        display: observation.display,
    };

    return {
        resourceType: 'Observation',
        id: observation.id,
        status: observation.status,
        code: {
            coding: [coding],
            text: observation.display,
        },
        subject: {
            reference: `Patient/${observation.patientId}`,
        },
        effectiveDateTime: observation.effectiveDateTime.toISOString(),
        valueQuantity: {
            value: observation.value,
            unit: observation.unit,
            system: UCUM_SYSTEM,
        },
    };
}

export function conditionToFHIR(condition: InternalCondition): FHIRCondition {
    const coding: FHIRCondition['code']['coding'] = [];

    if (condition.icdCode) {
        coding.push({
            system: ICD10_SYSTEM,
            code: condition.icdCode,
            display: condition.display,
        });
    }

    coding.push({
        system: SNOMED_SYSTEM,
        code: condition.code,
        display: condition.display,
    });

    return {
        resourceType: 'Condition',
        id: condition.id,
        clinicalStatus: {
            coding: [
                {
                    system: CLINICAL_STATUS_SYSTEM,
                    code: condition.clinicalStatus,
                },
            ],
        },
        code: {
            coding,
            text: condition.display,
        },
        subject: {
            reference: `Patient/${condition.patientId}`,
        },
        onsetDateTime: condition.onsetDate?.toISOString(),
    };
}

export function medicationToFHIR(medication: InternalMedication): FHIRMedicationRequest {
    return {
        resourceType: 'MedicationRequest',
        id: medication.id,
        status: medication.status,
        intent: 'order',
        medicationCodeableConcept: {
            text: medication.medicationName,
        },
        subject: {
            reference: `Patient/${medication.patientId}`,
        },
        dosageInstruction: medication.dosage || medication.frequency
            ? [
                {
                    text: [medication.dosage, medication.frequency].filter(Boolean).join(' - '),
                },
            ]
            : undefined,
        authoredOn: medication.startDate?.toISOString(),
    };
}

export function allergyToFHIR(allergy: InternalAllergy): FHIRAllergyIntolerance {
    return {
        resourceType: 'AllergyIntolerance',
        id: allergy.id,
        clinicalStatus: {
            coding: [
                {
                    system: ALLERGY_STATUS_SYSTEM,
                    code: allergy.status,
                },
            ],
        },
        code: {
            text: allergy.allergen,
        },
        patient: {
            reference: `Patient/${allergy.patientId}`,
        },
        reaction: allergy.reaction
            ? [
                {
                    manifestation: [{ text: allergy.reaction }],
                    severity: allergy.severity,
                },
            ]
            : undefined,
    };
}

// ============================================
// MAPPERS: FHIR -> Internal
// ============================================

export function fhirToPatient(fhirPatient: FHIRPatient): Partial<InternalPatient> {
    const heightExt = fhirPatient.extension?.find(
        e => e.url === 'http://hl7.org/fhir/StructureDefinition/patient-bodyHeight'
    );
    const weightExt = fhirPatient.extension?.find(
        e => e.url === 'http://hl7.org/fhir/StructureDefinition/patient-bodyWeight'
    );

    return {
        id: fhirPatient.id,
        patientId: fhirPatient.identifier?.[0]?.value,
        gender: fhirPatient.gender === 'male' ? 'M' : 'F',
        birthDate: fhirPatient.birthDate ? new Date(fhirPatient.birthDate) : undefined,
        heightCm: heightExt?.valueQuantity?.value,
        weightKg: weightExt?.valueQuantity?.value,
    };
}

export function fhirToObservation(fhirObs: FHIRObservation): InternalObservation {
    const coding = fhirObs.code.coding[0];

    return {
        id: fhirObs.id || crypto.randomUUID(),
        patientId: fhirObs.subject.reference.replace('Patient/', ''),
        code: coding.code,
        display: coding.display,
        value: fhirObs.valueQuantity?.value || 0,
        unit: fhirObs.valueQuantity?.unit || '',
        effectiveDateTime: fhirObs.effectiveDateTime
            ? new Date(fhirObs.effectiveDateTime)
            : new Date(),
        status: fhirObs.status as InternalObservation['status'],
    };
}

export function fhirToCondition(fhirCondition: FHIRCondition): InternalCondition {
    const icdCoding = fhirCondition.code.coding.find(c => c.system === ICD10_SYSTEM);
    const primaryCoding = fhirCondition.code.coding[0];

    return {
        id: fhirCondition.id || crypto.randomUUID(),
        patientId: fhirCondition.subject.reference.replace('Patient/', ''),
        code: primaryCoding.code,
        display: primaryCoding.display,
        icdCode: icdCoding?.code,
        onsetDate: fhirCondition.onsetDateTime
            ? new Date(fhirCondition.onsetDateTime)
            : undefined,
        clinicalStatus: fhirCondition.clinicalStatus.coding[0].code as InternalCondition['clinicalStatus'],
    };
}

// Export all mappers
export const FHIRMappers = {
    toFHIR: {
        patient: patientToFHIR,
        observation: observationToFHIR,
        condition: conditionToFHIR,
        medication: medicationToFHIR,
        allergy: allergyToFHIR,
    },
    fromFHIR: {
        patient: fhirToPatient,
        observation: fhirToObservation,
        condition: fhirToCondition,
    },
    codes: OBSERVATION_CODES,
};

export default FHIRMappers;
