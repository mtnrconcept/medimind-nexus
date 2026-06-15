/**
 * FHIR Module Index
 * 
 * Exports all FHIR-related functionality
 */

// Client
export { FHIRClient, FHIRError, createFHIRClient } from './FHIRClient';
export type {
    FHIRResource,
    FHIRBundle,
    FHIRSearchParams,
    FHIRClientConfig,
    FHIROperationOutcome,
    FHIRResourceType,
} from './FHIRClient';

// Mappers
export { FHIRMappers } from './FHIRMappers';
export {
    patientToFHIR,
    observationToFHIR,
    conditionToFHIR,
    medicationToFHIR,
    allergyToFHIR,
    fhirToPatient,
    fhirToObservation,
    fhirToCondition,
} from './FHIRMappers';
export type {
    InternalPatient,
    InternalObservation,
    InternalCondition,
    InternalMedication,
    InternalAllergy,
    FHIRPatient,
    FHIRObservation,
    FHIRCondition,
    FHIRMedicationRequest,
    FHIRAllergyIntolerance,
} from './FHIRMappers';
