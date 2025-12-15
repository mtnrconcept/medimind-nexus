import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Pill,
    Stethoscope,
    TestTube,
    Activity,
    Calendar,
    User,
    FileText,
    CheckCircle,
    Loader2,
    ArrowRight,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Database, Json } from '@/integrations/supabase/types';

type PatientDocument = Database['public']['Tables']['patient_documents']['Row'];

interface ExtractedData {
    medications?: Array<{
        name: string;
        dosage?: string;
        frequency?: string;
        duration?: string;
    }>;
    diagnoses?: Array<{
        name: string;
        icd_code?: string;
        date?: string;
    }>;
    labResults?: Array<{
        name: string;
        value: string;
        unit?: string;
        reference_range?: string;
        status?: 'normal' | 'high' | 'low' | 'critical';
    }>;
    vitalSigns?: {
        blood_pressure_sys?: number;
        blood_pressure_dia?: number;
        heart_rate?: number;
        temperature?: number;
        weight?: number;
        height?: number;
    };
    dates?: {
        document_date?: string;
        consultation_date?: string;
        prescription_date?: string;
    };
    doctor?: {
        name?: string;
        specialty?: string;
        institution?: string;
    };
    notes?: string;
    documentType?: string;
}

interface ExtractedDataReviewProps {
    document: PatientDocument;
    patientId: string;
    onUpdate?: () => void;
}

export default function ExtractedDataReview({
    document,
    patientId,
    onUpdate,
}: ExtractedDataReviewProps) {
    const [integrating, setIntegrating] = useState(false);

    const extractedData = (document.extracted_data || {}) as ExtractedData;
    const hasData = Object.keys(extractedData).some(
        key => extractedData[key as keyof ExtractedData] &&
            (Array.isArray(extractedData[key as keyof ExtractedData])
                ? (extractedData[key as keyof ExtractedData] as unknown[]).length > 0
                : typeof extractedData[key as keyof ExtractedData] === 'object'
                    ? Object.keys(extractedData[key as keyof ExtractedData] as object).length > 0
                    : !!extractedData[key as keyof ExtractedData]
            )
    );

    const integrateToPatientRecord = async () => {
        setIntegrating(true);

        try {
            // Get current patient data
            const { data: patient, error: fetchError } = await supabase
                .from('patients')
                .select('*')
                .eq('id', patientId)
                .single();

            if (fetchError) throw fetchError;

            // Build update object
            const updates: Record<string, Json> = {};

            // Integrate vital signs
            if (extractedData.vitalSigns) {
                const currentLabResults = (patient.lab_results_json || {}) as Record<string, Json>;
                const vs = extractedData.vitalSigns;

                if (vs.blood_pressure_sys) currentLabResults.blood_pressure_sys = vs.blood_pressure_sys;
                if (vs.blood_pressure_dia) currentLabResults.blood_pressure_dia = vs.blood_pressure_dia;
                if (vs.heart_rate) currentLabResults.heart_rate = vs.heart_rate;
                if (vs.temperature) currentLabResults.temperature_c = vs.temperature;

                updates.lab_results_json = currentLabResults;

                if (vs.weight) updates.weight_kg = vs.weight;
                if (vs.height) updates.height_cm = vs.height;
            }

            // Integrate lab results to lab_results_json
            if (extractedData.labResults && extractedData.labResults.length > 0) {
                const currentLabResults = (updates.lab_results_json || patient.lab_results_json || {}) as Record<string, Json>;

                extractedData.labResults.forEach(result => {
                    const key = result.name.toLowerCase().replace(/\s+/g, '_');
                    currentLabResults[key] = {
                        value: result.value,
                        unit: result.unit,
                        reference: result.reference_range,
                        status: result.status,
                    };
                });

                updates.lab_results_json = currentLabResults;
            }

            // Integrate medications to treatment field
            if (extractedData.medications && extractedData.medications.length > 0) {
                const newMeds = extractedData.medications
                    .map(m => `${m.name}${m.dosage ? ` ${m.dosage}` : ''}${m.frequency ? ` - ${m.frequency}` : ''}`)
                    .join(', ');

                updates.treatment = patient.treatment
                    ? `${patient.treatment}, ${newMeds}`
                    : newMeds;
            }

            // Integrate diagnoses to medical notes
            if (extractedData.diagnoses && extractedData.diagnoses.length > 0) {
                const diagnosesStr = extractedData.diagnoses
                    .map(d => `${d.name}${d.icd_code ? ` (${d.icd_code})` : ''}${d.date ? ` - ${d.date}` : ''}`)
                    .join('; ');

                const newNotes = `[Diagnostics extraits: ${diagnosesStr}]`;
                updates.medical_notes_nlp = patient.medical_notes_nlp
                    ? `${patient.medical_notes_nlp}\n${newNotes}`
                    : newNotes;
            }

            // Append any notes
            if (extractedData.notes && extractedData.notes.length > 50) {
                const newNotes = `[Notes du document ${document.file_name}: ${extractedData.notes.substring(0, 500)}...]`;
                updates.medical_notes_nlp = (updates.medical_notes_nlp as string || patient.medical_notes_nlp || '') + `\n${newNotes}`;
            }

            // Apply updates if any
            if (Object.keys(updates).length > 0) {
                const { error: updateError } = await supabase
                    .from('patients')
                    .update(updates)
                    .eq('id', patientId);

                if (updateError) throw updateError;

                toast.success('Données intégrées au dossier patient');
                if (onUpdate) onUpdate();
            } else {
                toast.info('Aucune donnée à intégrer');
            }
        } catch (error) {
            console.error('Integration error:', error);
            toast.error('Erreur lors de l\'intégration');
        } finally {
            setIntegrating(false);
        }
    };

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'high': return 'text-red-500 bg-red-500/10';
            case 'low': return 'text-blue-500 bg-blue-500/10';
            case 'critical': return 'text-destructive bg-destructive/10';
            default: return 'text-green-500 bg-green-500/10';
        }
    };

    if (document.extraction_status === 'failed') {
        return (
            <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">L'extraction a échoué</p>
                {document.extraction_error && (
                    <p className="text-xs mt-2 text-destructive">{document.extraction_error}</p>
                )}
            </div>
        );
    }

    if (document.extraction_status !== 'completed' || !hasData) {
        return (
            <div className="text-center py-8 text-muted-foreground">
                {document.extraction_status === 'processing' ? (
                    <>
                        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
                        <p className="text-sm">Analyse en cours...</p>
                    </>
                ) : (
                    <p className="text-sm">Aucune donnée extraite</p>
                )}
            </div>
        );
    }

    return (
        <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 p-1">
                {/* Medications */}
                {extractedData.medications && extractedData.medications.length > 0 && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Pill className="h-4 w-4 text-blue-500" />
                                Médicaments ({extractedData.medications.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {extractedData.medications.map((med, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                                    <div>
                                        <p className="text-sm font-medium">{med.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {[med.dosage, med.frequency, med.duration].filter(Boolean).join(' • ')}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                {/* Diagnoses */}
                {extractedData.diagnoses && extractedData.diagnoses.length > 0 && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Stethoscope className="h-4 w-4 text-purple-500" />
                                Diagnostics ({extractedData.diagnoses.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {extractedData.diagnoses.map((diag, idx) => (
                                <div key={idx} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                                    <div>
                                        <p className="text-sm font-medium">{diag.name}</p>
                                        {diag.icd_code && (
                                            <Badge variant="outline" className="text-xs mt-1">
                                                {diag.icd_code}
                                            </Badge>
                                        )}
                                    </div>
                                    {diag.date && (
                                        <span className="text-xs text-muted-foreground">{diag.date}</span>
                                    )}
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                )}

                {/* Lab Results */}
                {extractedData.labResults && extractedData.labResults.length > 0 && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <TestTube className="h-4 w-4 text-green-500" />
                                Résultats d'analyses ({extractedData.labResults.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-2">
                                {extractedData.labResults.map((result, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center justify-between p-2 bg-muted/30 rounded"
                                    >
                                        <div>
                                            <p className="text-sm font-medium">{result.name}</p>
                                            {result.reference_range && (
                                                <p className="text-xs text-muted-foreground">
                                                    Réf: {result.reference_range}
                                                </p>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <Badge className={`${getStatusColor(result.status)}`}>
                                                {result.value} {result.unit}
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Vital Signs */}
                {extractedData.vitalSigns && Object.keys(extractedData.vitalSigns).length > 0 && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Activity className="h-4 w-4 text-red-500" />
                                Signes Vitaux
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                {extractedData.vitalSigns.blood_pressure_sys && (
                                    <div>
                                        <span className="text-muted-foreground">Tension: </span>
                                        <span className="font-medium">
                                            {extractedData.vitalSigns.blood_pressure_sys}/
                                            {extractedData.vitalSigns.blood_pressure_dia} mmHg
                                        </span>
                                    </div>
                                )}
                                {extractedData.vitalSigns.heart_rate && (
                                    <div>
                                        <span className="text-muted-foreground">FC: </span>
                                        <span className="font-medium">{extractedData.vitalSigns.heart_rate} bpm</span>
                                    </div>
                                )}
                                {extractedData.vitalSigns.temperature && (
                                    <div>
                                        <span className="text-muted-foreground">Temp: </span>
                                        <span className="font-medium">{extractedData.vitalSigns.temperature}°C</span>
                                    </div>
                                )}
                                {extractedData.vitalSigns.weight && (
                                    <div>
                                        <span className="text-muted-foreground">Poids: </span>
                                        <span className="font-medium">{extractedData.vitalSigns.weight} kg</span>
                                    </div>
                                )}
                                {extractedData.vitalSigns.height && (
                                    <div>
                                        <span className="text-muted-foreground">Taille: </span>
                                        <span className="font-medium">{extractedData.vitalSigns.height} cm</span>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Doctor / Dates */}
                <div className="grid grid-cols-2 gap-4">
                    {extractedData.doctor && Object.values(extractedData.doctor).some(Boolean) && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <User className="h-4 w-4" />
                                    Médecin
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm">
                                {extractedData.doctor.name && (
                                    <p className="font-medium">{extractedData.doctor.name}</p>
                                )}
                                {extractedData.doctor.specialty && (
                                    <p className="text-muted-foreground">{extractedData.doctor.specialty}</p>
                                )}
                                {extractedData.doctor.institution && (
                                    <p className="text-xs text-muted-foreground">{extractedData.doctor.institution}</p>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {extractedData.dates && Object.values(extractedData.dates).some(Boolean) && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <Calendar className="h-4 w-4" />
                                    Dates
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm space-y-1">
                                {extractedData.dates.document_date && (
                                    <p>Document: {extractedData.dates.document_date}</p>
                                )}
                                {extractedData.dates.consultation_date && (
                                    <p>Consultation: {extractedData.dates.consultation_date}</p>
                                )}
                                {extractedData.dates.prescription_date && (
                                    <p>Prescription: {extractedData.dates.prescription_date}</p>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Notes */}
                {extractedData.notes && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Notes
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                {extractedData.notes}
                            </p>
                        </CardContent>
                    </Card>
                )}

                <Separator />

                {/* Action Button */}
                <div className="flex justify-end">
                    <Button onClick={integrateToPatientRecord} disabled={integrating}>
                        {integrating ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Intégration...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Intégrer au dossier patient
                                <ArrowRight className="h-4 w-4 ml-2" />
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </ScrollArea>
    );
}
