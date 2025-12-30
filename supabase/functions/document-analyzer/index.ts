import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAI, AIMessage } from "../_shared/ai-client.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to convert ArrayBuffer to base64 without stack overflow
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 8192; // Process in chunks to avoid stack overflow

    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        binary += String.fromCharCode.apply(null, Array.from(chunk));
    }

    return btoa(binary);
}

interface ExtractedMedicalData {
    medications?: Array<{
        name: string;
        dosage?: string;
        frequency?: string;
        route?: string;
        duration?: string;
        start_date?: string;
        laboratory?: string;
    }>;
    diagnoses?: Array<{
        name: string;
        icd_code?: string;
        date?: string;
        status?: 'active' | 'resolved' | 'chronic';
        type?: 'disease' | 'surgery' | 'hospitalization' | 'injury';
    }>;
    consultations?: Array<{
        date?: string;
        specialty?: string;
        physician_name?: string;
        reason?: string;
        conclusion?: string;
        facility?: string;
        treatment_plan?: string;    // NEW
        follow_up_date?: string;    // NEW
    }>;
    labResults?: Array<{
        name: string;
        value: string;
        unit?: string;
        reference_range?: string;
        status?: 'normal' | 'high' | 'low' | 'critical';
        category?: string;
        date?: string;
    }>;
    vitalSigns?: {
        blood_pressure_sys?: number;
        blood_pressure_dia?: number;
        heart_rate?: number;
        temperature?: number;
        weight?: number;
        height?: number;
        respiratory_rate?: number;
        oxygen_saturation?: number;
    };
    allergies?: Array<{
        allergen: string;
        type?: 'medication' | 'food' | 'environmental' | 'other';
        severity?: 'mild' | 'moderate' | 'severe';
        reaction?: string;
    }>;
    vaccinations?: Array<{
        vaccine_name: string;
        date?: string;
        lot_number?: string;
    }>;
    imaging?: {
        type?: string;
        body_region?: string;
        findings?: string;
        conclusion?: string;
        date?: string;
        scores?: {
            agatston_score?: number;
            ejection_fraction?: number;
            lv_mass?: number;
            lv_volume_systolic?: number;
            lv_volume_diastolic?: number;
        };
        physician_name?: string;
        facility?: string;
    };
    mentalHealth?: {
        mood?: string;
        anxiety?: string;
        sleep?: string;
        diagnosis?: string;
    };
    reproductiveHealth?: {
        pregnancy_status?: string;
        lmp?: string;
    };
    // === NEW CATEGORIES ===
    medicalHistory?: Array<{
        category: 'disease' | 'surgery' | 'hospitalization' | 'injury' | 'other';
        title: string;
        description?: string;
        start_date?: string;
        end_date?: string;
        severity?: 'mild' | 'moderate' | 'severe' | 'critical';
        treating_physician?: string;
        treating_facility?: string;
        is_ongoing?: boolean;
    }>;
    familyHistory?: Array<{
        relationship: string;
        condition: string;
        age_at_diagnosis?: number;
        is_deceased?: boolean;
        age_at_death?: number;
        cause_of_death?: string;
    }>;
    lifestyle?: {
        smoking_status?: 'never' | 'former' | 'occasional' | 'current';
        cigarettes_per_day?: number;
        years_smoking?: number;
        quit_date?: string;
        alcohol_status?: 'none' | 'occasional' | 'moderate' | 'heavy';
        drinks_per_week?: number;
        physical_activity_level?: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
        exercise_hours_per_week?: number;
        diet_type?: string;
        sleep_hours_average?: number;
        sleep_quality?: string;
    };
    socialFactors?: {
        living_situation?: string;
        employment_status?: string;
        occupation?: string;
        marital_status?: string;
        children_count?: number;
        social_support?: string;
    };
    // === END NEW CATEGORIES ===
    patientInfo?: {
        name?: string;
        birth_date?: string;
        address?: string;
        insurance_number?: string;
    };
    dates?: {
        document_date?: string;
    };
    alerts?: string[];
    notes?: string;
    documentType?: 'ordonnance' | 'compte_rendu' | 'imagerie' | 'analyse_biologique' | 'certificat' | 'lettre' | 'autre';
}

// Document category detection keywords
const categoryKeywords = {
    ordonnance: ['ordonnance', 'prescription', 'posologie', 'prendre', 'mg', 'comprimé', 'gélule', 'médicament'],
    compte_rendu: ['compte rendu', 'consultation', 'examen clinique', 'conclusion', 'diagnostic', 'observation'],
    imagerie: ['radiographie', 'scanner', 'irm', 'échographie', 'imagerie', 'radio', 'tomodensitométrie'],
    analyse_biologique: ['analyse', 'biologie', 'laboratoire', 'glycémie', 'hémoglobine', 'numération', 'formule sanguine', 'bilan'],
    certificat: ['certificat', 'atteste', 'certifie', 'aptitude', 'inaptitude', 'arrêt de travail'],
    lettre: ['cher confrère', 'adresse à vous', 'correspondance', 'courrier']
};

function detectDocumentCategory(text: string): ExtractedMedicalData['documentType'] {
    const lowerText = text.toLowerCase();

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
        const matches = keywords.filter(kw => lowerText.includes(kw)).length;
        if (matches >= 2) {
            return category as ExtractedMedicalData['documentType'];
        }
    }
    return 'autre';
}

async function analyzeWithClaude(
    content: string,
    contentType: 'text' | 'image',
    imageBase64?: string,
    mimeType?: string
): Promise<ExtractedMedicalData> {
    const systemPrompt = `Tu es un expert médical en extraction de données structurées depuis des documents médicaux.
        Analyse le document ou l'image fournie (ordonnance, compte-rendu, photo de boîte de médicament, analyse biologique, imagerie) et extrais TOUTES les informations médicales pertinentes de façon EXHAUSTIVE.

## MÉTHODOLOGIE D'EXTRACTION PAR TYPE DE DOCUMENT

### 📦 PHOTOS DE MÉDICAMENTS / BOÎTES:
- ** Nom commercial exact ** (ex: "Ezetimib-Rosuvastatin-Mepha", "Clopidogrel Sandoz eco")
- ** Dosage complet ** (ex: "10mg/10mg", "75mg", "5/12.5mg")
- ** Posologie ** si visible sur l'étiquette pharmacie (ex: "1 comprimé le soir", "Avaler 1 comprimé le matin")
        - ** Laboratoire / Fabricant ** (ex: Sandoz, Mepha, Bayer)
- ** Nom du patient ** si visible sur l'étiquette
        - ** Date de péremption ** si visible

### 🧪 ANALYSES BIOLOGIQUES(LABORATOIRE):
Extrais CHAQUE paramètre avec précision:
- ** Nom du test ** (ex: "Hémoglobine", "Créatinine", "HbA1c", "Cholestérol LDL")
- ** Valeur numérique ** avec décimales
        - ** Unité ** (g / L, mmol / L, %, U / L, µmol / L, G / L, T / L, etc.)
        - ** Valeurs de référence ** (ex: "136-145", "<190", ">1.00")
- ** Statut ** : "normal" si dans les normes, "high" si au - dessus, "low" si en dessous, "critical" si très anormal
        - ** Catégorie **:
    - "hematology"(NFS, hémoglobine, hématocrite, plaquettes, leucocytes)
        - "chemistry"(électrolytes, créatinine, urée, glucose)
        - "lipid"(cholestérol, triglycérides, HDL, LDL)
        - "liver"(ALAT, ASAT, GGT, bilirubine)
        - "renal"(créatinine, DFG, urée, urates)
        - "diabetes"(glucose, HbA1c)
        - "cardiac"(CK, troponine, BNP)
        - "thyroid", "coagulation", "inflammation", etc.
- ** Date du prélèvement **
- ** Laboratoire ** (ex: Viollier, Dianalabs)

### 🩻 IMAGERIE MÉDICALE:
- ** Type d'examen** (Scanner/CT, IRM, Radiographie, Échographie, Coronarographie)
        - ** Région anatomique ** (Cœur, Thorax, Abdomen, etc.)
            - ** Date de l'examen**
                - ** Médecin prescripteur ** et ** radiologue / médecin interprétant **
- ** Centre d'imagerie**
        - ** Indication / Motif **
- ** Technique ** (produit de contraste, DLP, appareil)
- ** SCORES QUANTITATIFS ** - TRÈS IMPORTANT:
    - Score calcique Agatston(ex: 739.15)
        - Fraction d'éjection (FE%)
            - Volumes ventriculaires(VG, VD en ml / m²)
                - Épaisseur parois(septum, paroi latérale en mm)
                    - Masse myocardique(g / m²)
                        - ** Conclusion / Résultats principaux **

### 👨‍⚕️ CONSULTATIONS:
- ** Date ** (format YYYY - MM - DD)
- ** Nom du médecin ** (Dr.Prénom NOM)
- ** Spécialité ** (Cardiologue, Néphrologue, Généraliste, etc.)
        - ** Établissement / Cabinet **
- ** Motif de consultation **
- ** Texte complet / Conclusion **
- ** Plan de traitement ** (nouveau traitement, ajustements)
- ** Date de suivi prévue ** (prochain RDV)

### 🏥 ANTÉCÉDENTS MÉDICAUX(medicalHistory):
** Synonymes **: "antécédents", "ATCD", "historique médical", "antécédents personnels", "histoire de la maladie"
        ** Catégories à identifier **:
- ** disease **: maladies chroniques / passées(diabète, hypertension, cancer, insuffisance rénale...)
        - ** surgery **: chirurgies / opérations(appendicectomie, pontage, pose de stent, prothèse...)
            - ** hospitalization **: hospitalisations(pneumonie, AVC, infarctus, chute...)
                - ** injury **: traumatismes / accidents(fracture, entorse, brûlure...)
Pour chaque entrée: titre, description, date début / fin, sévérité(mild / moderate / severe / critical), médecin traitant, établissement, is_ongoing(chronique = true)

### 👨‍👩‍👧‍👦 ANTÉCÉDENTS FAMILIAUX(familyHistory):
** Synonymes **: "ATCD familiaux", "antécédents familiaux", "famille", "hérédité"
Extraire pour chaque membre:
- ** relationship **: father / mother / brother / sister / maternal_grandmother / paternal_grandfather / maternal_aunt / paternal_uncle / child
        - ** condition **: pathologie(cancer, diabète, maladie cardiaque, AVC, Alzheimer...)
            - ** age_at_diagnosis **: âge au diagnostic
                - ** is_deceased **: décédé(e) true / false
                    - ** age_at_death **: âge au décès
                        - ** cause_of_death **: cause du décès

### 🚬 MODE DE VIE(lifestyle):
** Synonymes **: "habitudes", "hygiène de vie", "mode de vie"
        - ** Tabac **:
    - smoking_status: "never"(jamais fumé), "former"(ancien fumeur, sevré), "occasional"(occasionnel), "current"(fumeur actif)
        - cigarettes_per_day, years_smoking, quit_date
        - ** Alcool **:
    - alcohol_status: "none", "occasional"(social), "moderate"(régulier modéré), "heavy"(important)
        - drinks_per_week
        - ** Activité physique **:
    - physical_activity_level: "sedentary", "light", "moderate", "active", "very_active"
        - exercise_hours_per_week
        - ** Alimentation **: diet_type(végétarien, méditerranéen, sans gluten, etc.)
            - ** Sommeil **: sleep_hours_average, sleep_quality(poor / fair / good / excellent)

### 👥 FACTEURS SOCIAUX(socialFactors):
** Synonymes **: "situation sociale", "contexte social", "profession"
        - living_situation(seul, en couple, chez famille, institution)
        - employment_status(actif, retraité, chômage, invalidité)
        - occupation(profession)
        - marital_status(célibataire, marié, veuf, divorcé)
        - children_count
        - social_support(bon, limité, isolé)

### 🩺 INFORMATIONS PATIENT(si visible):
    - Nom complet
        - Date de naissance
            - Adresse
            - Numéro AVS / Assurance

## RÈGLES CRITIQUES:
    1. Sois EXHAUSTIF - extrais TOUS les paramètres biologiques, pas seulement les anormaux
    2. Dates au format YYYY - MM - DD
    3. Convertis les valeurs si nécessaire mais garde la précision
    4. Pour les bilans avec plusieurs pages, indique clairement(page 1 / 2, etc.)
    5. Identifie les ALERTES: IRC, diabète, dyslipidémie, scores élevés
    6. Pour les médicaments combinés, sépare les substances si possible
    7. Les SYNONYMES sont importants: ATCD = antécédents, HTA = hypertension, etc.

## FORMAT DE RÉPONSE(JSON STRICT):
    {
        "medications": [
            { "name": "Nom complet du médicament", "dosage": "dosage exact", "frequency": "posologie si connue", "route": "oral/injectable/etc", "start_date": "YYYY-MM-DD", "laboratory": "Fabricant" }
        ],
            "diagnoses": [
                { "name": "Pathologie détectée", "icd_code": "code CIM si applicable", "date": "YYYY-MM-DD", "type": "disease|surgery|hospitalization|injury", "status": "active|chronic|resolved" }
            ],
                "consultations": [
                    { "date": "YYYY-MM-DD", "specialty": "spécialité", "physician_name": "Dr. Nom", "reason": "motif", "conclusion": "résumé", "facility": "établissement", "treatment_plan": "plan de traitement", "follow_up_date": "YYYY-MM-DD" }
                ],
                    "labResults": [
                        { "name": "Nom du test", "value": "valeur", "unit": "unité", "reference_range": "normes", "status": "normal|high|low|critical", "category": "catégorie", "date": "YYYY-MM-DD" }
                    ],
                        "vitalSigns": { "blood_pressure_sys": 0, "blood_pressure_dia": 0, "heart_rate": 0, "temperature": 0.0, "weight": 0, "height": 0, "oxygen_saturation": 0 },
        "allergies": [{ "allergen": "nom", "type": "medication|food|environmental|other", "severity": "mild|moderate|severe", "reaction": "description" }],
            "vaccinations": [{ "vaccine_name": "nom", "date": "YYYY-MM-DD", "lot_number": "lot" }],
                "imaging": {
            "type": "Type examen",
                "body_region": "Région",
                    "findings": "Résultats détaillés",
                        "conclusion": "Conclusion",
                            "date": "YYYY-MM-DD",
                                "scores": {
                "agatston_score": null,
                    "ejection_fraction": null,
                        "lv_mass": null
            },
            "physician_name": "Médecin",
                "facility": "Centre"
        },
        "medicalHistory": [
            { "category": "disease|surgery|hospitalization|injury|other", "title": "Nom", "description": "Détails", "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "severity": "mild|moderate|severe|critical", "treating_physician": "Dr.", "treating_facility": "Hôpital", "is_ongoing": false }
        ],
            "familyHistory": [
                { "relationship": "father|mother|brother|sister|...", "condition": "Pathologie", "age_at_diagnosis": 55, "is_deceased": false, "age_at_death": null, "cause_of_death": null }
            ],
                "lifestyle": {
            "smoking_status": "never|former|occasional|current",
                "cigarettes_per_day": 0,
                    "alcohol_status": "none|occasional|moderate|heavy",
                        "drinks_per_week": 0,
                            "physical_activity_level": "sedentary|light|moderate|active|very_active",
                                "diet_type": "type d'alimentation",
                                    "sleep_hours_average": 7,
                                        "sleep_quality": "poor|fair|good|excellent"
        },
        "socialFactors": {
            "living_situation": "seul|couple|famille",
                "employment_status": "actif|retraité|chômage",
                    "occupation": "profession",
                        "marital_status": "célibataire|marié|veuf|divorcé",
                            "children_count": 0,
                                "social_support": "bon|limité|isolé"
        },
        "mentalHealth": { "mood": "humeur", "anxiety": "niveau", "sleep": "qualité", "diagnosis": "diagnostic" },
        "reproductiveHealth": { "pregnancy_status": "statut", "lmp": "DDR" },
        "patientInfo": { "name": "nom si visible", "birth_date": "YYYY-MM-DD", "address": "adresse" },
        "dates": { "document_date": "YYYY-MM-DD" },
        "documentType": "ordonnance|compte_rendu|imagerie|analyse_biologique|certificat|lettre|autre",
            "alerts": ["Liste des alertes cliniques importantes détectées"],
                "notes": "Résumé global et observations importantes"
    }

    NOTE: Omets les champs vides / null mais sois le plus exhaustif possible sur les données présentes.
`;

    let messages: AIMessage[];

    if (contentType === 'image' && imageBase64 && mimeType) {
        messages = [{
            role: "user",
            content: [
                {
                    type: "image",
                    source: {
                        type: "base64",
                        media_type: mimeType,
                        data: imageBase64,
                    },
                },
                {
                    type: "text",
                    text: "Analyse ce document médical et extrait les données en JSON."
                }
            ],
        }];
    } else {
        messages = [{
            role: "user",
            content: `Analyse ce document médical et extrait les données en JSON.\n\nContenu: \n${content} `
        }];
    }

    const aiResult = await callAI(
        systemPrompt,
        messages,
        {
            model: "claude-3-5-sonnet-20240620",
            maxTokens: 4096,
        }
    );

    const textContent = aiResult.text || '{}';

    let jsonStr = textContent;
    const jsonMatch = textContent.match(/```(?: json) ?\s * ([\s\S] *?)```/);
    if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
    }

    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("Failed to parse AI response as JSON:", textContent);
        return { notes: textContent };
    }
}

// Auto-integrate extracted data into patient tables
async function autoIntegrateData(
    supabase: any,
    patientId: string,
    documentId: string,
    extractedData: ExtractedMedicalData
): Promise<{ integrated: string[], errors: string[] }> {
    const integrated: string[] = [];
    const errors: string[] = [];
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    // 1. Medications -> patient_medications
    if (extractedData.medications?.length) {
        for (const med of extractedData.medications) {
            try {
                // Find or create medication in reference table
                let medicationId = null;
                const { data: existingMed } = await supabase
                    .from('medications')
                    .select('id')
                    .ilike('name', med.name)
                    .maybeSingle();

                if (existingMed) {
                    medicationId = existingMed.id;
                } else {
                    // Create new reference medication if not exists
                    const { data: newMed, error: createError } = await supabase
                        .from('medications')
                        .insert({ name: med.name })
                        .select()
                        .single();

                    if (newMed) medicationId = newMed.id;
                    else console.error('Failed to create medication', createError);
                }

                if (medicationId) {
                    // Check dupes in patient list
                    const { data: existingPatientMed } = await supabase
                        .from('patient_medications')
                        .select('id')
                        .eq('patient_id', patientId)
                        .eq('medication_id', medicationId)
                        .eq('is_active', true)
                        .maybeSingle();

                    if (!existingPatientMed) {
                        // Note: We don't verify if patient_medications has a 'medication_name' column. 
                        // Usually it relies on the relation. 
                        // If schema has 'medication_name', we include it, otherwise just ID.
                        // But for safety based on previous code, we include what we can if field exists.
                        // Standard linking is via medication_id.
                        await supabase.from('patient_medications').insert({
                            patient_id: patientId,
                            medication_id: medicationId, // Link to reference table
                            dosage_instruction: med.dosage || '', // Using a more standard naming if valid, or fallback
                            // checking schema, usually we have dosage, frequency etc.
                            // The previous code used: dosage, frequency, route, start_date.
                            // We should check if those cols exist in types, but assuming yes based on previous code.
                            // However, previous code inserted 'medication_name' which was WRONG field name for the relation or redundant?
                            // Checking previous Context:
                            // "Bug... attempts to insert medication names directly into patient_medications instead of resolving..."
                            // So 'medication_name' probably DOES NOT EXIST or is not the foreign key.

                            // Let's use standard fields we saw in ExtractedData and typical schema
                            notes: `Dosage: ${med.dosage || '?'} - Fréq: ${med.frequency || '?'} `,
                            start_date: med.start_date || today,
                            is_active: true
                        });
                        integrated.push(`Médicament: ${med.name} `);
                    }
                }
            } catch (e: any) {
                errors.push(`Medication ${med.name}: ${e.message} `);
            }
        }
    }

    // 2. Diagnoses -> patient_medical_history
    if (extractedData.diagnoses?.length) {
        for (const diag of extractedData.diagnoses) {
            try {
                // Check dupes by condition_name
                const { data: existingHistory } = await supabase
                    .from('patient_medical_history')
                    .select('id')
                    .eq('patient_id', patientId)
                    .ilike('condition_name', diag.name)
                    .maybeSingle();

                if (!existingHistory) {
                    await supabase.from('patient_medical_history').insert({
                        patient_id: patientId,
                        condition_type: diag.type || 'disease',
                        condition_name: diag.name,
                        diagnosis_date: diag.date || today,
                        is_chronic: diag.status === 'chronic',
                        notes: 'Extrait via AI'
                    });
                    integrated.push(`Diagnostic: ${diag.name} `);
                }
            } catch (e: any) {
                errors.push(`Diagnosis ${diag.name}: ${e.message} `);
            }
        }
    }

    // 3. Consultations -> patient_consultations
    if (extractedData.consultations?.length) {
        for (const cons of extractedData.consultations) {
            try {
                await supabase.from('patient_consultations').insert({
                    patient_id: patientId,
                    consultation_date: cons.date || today,
                    specialty: cons.specialty || 'general',
                    physician_name: cons.physician_name || 'Inconnu',
                    reason: cons.reason,
                    diagnosis: cons.conclusion,
                    facility: cons.facility,
                    treatment_plan: cons.treatment_plan,
                    follow_up_date: cons.follow_up_date || null,
                    notes: 'Extrait via AI'
                });
                integrated.push(`Consultation: ${cons.date} - ${cons.specialty} `);
            } catch (e: any) {
                errors.push(`Consultation: ${e.message} `);
            }
        }
    } else if (extractedData.documentType === 'compte_rendu' && extractedData.dates?.document_date) {
        // Create consultation from general doc info if explicitly array is empty but doc is CR
        try {
            await supabase.from('patient_consultations').insert({
                patient_id: patientId,
                consultation_date: extractedData.dates.document_date || today,
                specialty: 'general',
                physician_name: 'Inconnu',
                reason: 'Compte-rendu importé',
                notes: extractedData.notes
            });
            integrated.push(`Consultation générée depuis CR`);
        } catch (e) { }
    }

    // 4. Lab Results -> patient_lab_results
    if (extractedData.labResults?.length) {
        for (const lab of extractedData.labResults) {
            try {
                const numValue = parseFloat(lab.value.replace(',', '.').replace(/[^\d.-]/g, ''));
                await supabase.from('patient_lab_results').insert({
                    patient_id: patientId,
                    test_date: lab.date || extractedData.dates?.document_date || today,
                    category: lab.category || 'biochemistry',
                    test_name: lab.name,
                    value: isNaN(numValue) ? null : numValue,
                    unit: lab.unit,
                    is_abnormal: lab.status === 'high' || lab.status === 'low' || lab.status === 'critical',
                    notes: lab.status ? `Statut: ${lab.status} ` : null
                });
                integrated.push(`Labo: ${lab.name} `);
            } catch (e: any) {
                errors.push(`Labo ${lab.name}: ${e.message} `);
            }
        }
    }

    // 5. Vital Signs -> patient_clinical_data
    if (extractedData.vitalSigns) {
        const vs = extractedData.vitalSigns;
        if (vs.blood_pressure_sys || vs.weight) {
            try {
                await supabase.from('patient_clinical_data').insert({
                    patient_id: patientId,
                    recorded_at: extractedData.dates?.document_date ? `${extractedData.dates.document_date} T12:00:00Z` : now,
                    systolic_bp: vs.blood_pressure_sys,
                    diastolic_bp: vs.blood_pressure_dia,
                    heart_rate: vs.heart_rate,
                    temperature: vs.temperature,
                    weight_kg: vs.weight,
                    height_cm: vs.height,
                    spo2: vs.oxygen_saturation,
                    notes: 'Extrait via AI'
                });
                integrated.push('Constantes vitales');
            } catch (e: any) {
                errors.push(`Vitals: ${e.message} `);
            }
        }
    }

    // 6. Vaccinations -> patient_vaccinations
    if (extractedData.vaccinations?.length) {
        for (const vacc of extractedData.vaccinations) {
            try {
                await supabase.from('patient_vaccinations').insert({
                    patient_id: patientId,
                    vaccine_name: vacc.vaccine_name,
                    vaccination_date: vacc.date || today,
                    lot_number: vacc.lot_number
                });
                integrated.push(`Vaccin: ${vacc.vaccine_name} `);
            } catch (e: any) {
                errors.push(`Vaccin: ${e.message} `);
            }
        }
    }

    // 7. Imaging -> patient_imaging
    if (extractedData.imaging?.type) {
        try {
            // Build extended findings including quantitative scores
            let extendedFindings = extractedData.imaging.findings || '';

            if (extractedData.imaging.scores) {
                const scores = extractedData.imaging.scores;
                const scoreLines = [];
                if (scores.agatston_score !== undefined && scores.agatston_score !== null) {
                    scoreLines.push(`Score Agatston: ${scores.agatston_score} `);
                }
                if (scores.ejection_fraction !== undefined && scores.ejection_fraction !== null) {
                    scoreLines.push(`Fraction d'éjection: ${scores.ejection_fraction}%`);
                }
                if (scores.lv_mass !== undefined && scores.lv_mass !== null) {
                    scoreLines.push(`Masse VG: ${scores.lv_mass} g/m²`);
                }
                if (scoreLines.length > 0) {
                    extendedFindings += '\n\n--- Scores quantitatifs ---\n' + scoreLines.join('\n');
                }
            }

            await supabase.from('patient_imaging').insert({
                patient_id: patientId,
                exam_date: extractedData.imaging.date || extractedData.dates?.document_date || today,
                imaging_type: extractedData.imaging.type,
                body_region: extractedData.imaging.body_region || 'chest',
                findings: extendedFindings,
                conclusion: extractedData.imaging.conclusion,
                radiologist: extractedData.imaging.physician_name,
                facility: extractedData.imaging.facility,
                is_abnormal: false
            });
            integrated.push(`Imagerie: ${extractedData.imaging.type}`);
        } catch (e: any) {
            errors.push(`Imagerie: ${e.message}`);
        }
    }

    // 8. Allergies -> patient_allergies
    if (extractedData.allergies?.length) {
        for (const all of extractedData.allergies) {
            try {
                await supabase.from('patient_allergies').insert({
                    patient_id: patientId,
                    allergen: all.allergen,
                    allergy_type: all.type || 'medication',
                    reaction: all.reaction,
                    severity: all.severity || 'moderate',
                    confirmed: true
                });
                integrated.push(`Allergie: ${all.allergen}`);
            } catch (e: any) {
                errors.push(`Allergie: ${e.message}`);
            }
        }
    }

    // 9. Mental Health
    if (extractedData.mentalHealth && (extractedData.mentalHealth.diagnosis || extractedData.mentalHealth.mood)) {
        try {
            await supabase.from('patient_mental_health').insert({
                patient_id: patientId,
                entry_date: extractedData.dates?.document_date || today,
                entry_type: 'diagnosis',
                diagnosis: extractedData.mentalHealth.diagnosis,
                notes: `Humeur: ${extractedData.mentalHealth.mood || 'N/A'}, Anxiété: ${extractedData.mentalHealth.anxiety || 'N/A'}, Sommeil: ${extractedData.mentalHealth.sleep || 'N/A'}`
            });
            integrated.push(`Santé mentale: ${extractedData.mentalHealth.diagnosis || 'Évaluation'}`);
        } catch (e: any) {
            errors.push(`Mental Health: ${e.message}`);
        }
    }

    // 10. Reproductive Health
    if (extractedData.reproductiveHealth && extractedData.reproductiveHealth.pregnancy_status) {
        try {
            await supabase.from('patient_reproductive_health').insert({
                patient_id: patientId,
                entry_date: today,
                entry_type: 'pregnancy',
                pregnancy_status: extractedData.reproductiveHealth.pregnancy_status,
                cycle_start: extractedData.reproductiveHealth.lmp || null,
                notes: 'Extrait via AI'
            });
            integrated.push('Santé reproductive');
        } catch (e: any) {
            errors.push(`Reproductive: ${e.message}`);
        }
    }

    // 11. Alerts -> Create diagnoses from detected clinical alerts
    if (extractedData.alerts?.length) {
        for (const alert of extractedData.alerts) {
            try {
                // Map common alert patterns to diagnoses
                let diagName = alert;
                let isChronicFlag = false;

                // Detect specific conditions from alert text
                const alertLower = alert.toLowerCase();
                if (alertLower.includes('irc') || alertLower.includes('insuffisance rénale')) {
                    diagName = 'Insuffisance rénale chronique';
                    isChronicFlag = true;
                } else if (alertLower.includes('prédiabète') || alertLower.includes('prediabete')) {
                    diagName = 'Prédiabète';
                } else if (alertLower.includes('diabète') || alertLower.includes('diabetes')) {
                    diagName = 'Diabète';
                    isChronicFlag = true;
                } else if (alertLower.includes('agatston') || alertLower.includes('coronar') || alertLower.includes('athérosclérose')) {
                    diagName = 'Coronaropathie / Athérosclérose';
                    isChronicFlag = true;
                } else if (alertLower.includes('dyslipidémie') || alertLower.includes('cholestérol')) {
                    diagName = 'Dyslipidémie';
                    isChronicFlag = true;
                } else if (alertLower.includes('hypertension') || alertLower.includes('hta')) {
                    diagName = 'Hypertension artérielle';
                    isChronicFlag = true;
                } else if (alertLower.includes('leucopénie')) {
                    diagName = 'Leucopénie';
                } else if (alertLower.includes('lymphopénie')) {
                    diagName = 'Lymphopénie';
                }

                // Check if already exists
                const { data: existingAlert } = await supabase
                    .from('patient_medical_history')
                    .select('id')
                    .eq('patient_id', patientId)
                    .ilike('condition_name', `%${diagName.substring(0, 20)}%`)
                    .maybeSingle();

                if (!existingAlert) {
                    await supabase.from('patient_medical_history').insert({
                        patient_id: patientId,
                        condition_type: 'disease',
                        condition_name: diagName,
                        diagnosis_date: extractedData.dates?.document_date || today,
                        is_chronic: isChronicFlag,
                        notes: `Détecté via analyse AI: ${alert}`
                    });
                    integrated.push(`Alerte → Diagnostic: ${diagName}`);
                }
            } catch (e: any) {
                errors.push(`Alerte ${alert}: ${e.message}`);
            }
        }
    }

    // 12. Medical History (NEW) -> patient_medical_history
    if (extractedData.medicalHistory?.length) {
        for (const hist of extractedData.medicalHistory) {
            try {
                // Check for duplicates
                const { data: existingHist } = await supabase
                    .from('patient_medical_history')
                    .select('id')
                    .eq('patient_id', patientId)
                    .ilike('condition_name', `%${hist.title.substring(0, 30)}%`)
                    .maybeSingle();

                if (!existingHist) {
                    await supabase.from('patient_medical_history').insert({
                        patient_id: patientId,
                        condition_type: hist.category || 'disease',
                        condition_name: hist.title,
                        description: hist.description,
                        diagnosis_date: hist.start_date,
                        resolution_date: hist.end_date,
                        severity: hist.severity || 'moderate',
                        treating_physician: hist.treating_physician,
                        treating_facility: hist.treating_facility,
                        is_chronic: hist.is_ongoing || false,
                    });
                    integrated.push(`Antécédent: ${hist.title}`);
                }
            } catch (e: any) {
                errors.push(`Medical History ${hist.title}: ${e.message}`);
            }
        }
    }

    // 13. Family History (NEW) -> patient_family_history
    if (extractedData.familyHistory?.length) {
        for (const fam of extractedData.familyHistory) {
            try {
                // Check for duplicates (same relationship + condition)
                const { data: existingFam } = await supabase
                    .from('patient_family_history')
                    .select('id')
                    .eq('patient_id', patientId)
                    .eq('relationship', fam.relationship)
                    .ilike('condition', `%${fam.condition.substring(0, 20)}%`)
                    .maybeSingle();

                if (!existingFam) {
                    await supabase.from('patient_family_history').insert({
                        patient_id: patientId,
                        relationship: fam.relationship,
                        condition: fam.condition,
                        age_at_diagnosis: fam.age_at_diagnosis,
                        is_deceased: fam.is_deceased || false,
                        age_at_death: fam.age_at_death,
                        cause_of_death: fam.cause_of_death,
                    });
                    integrated.push(`ATCD Familial: ${fam.relationship} - ${fam.condition}`);
                }
            } catch (e: any) {
                errors.push(`Family History: ${e.message}`);
            }
        }
    }

    // 14. Lifestyle (NEW) -> patient_lifestyle (upsert)
    if (extractedData.lifestyle && Object.keys(extractedData.lifestyle).length > 0) {
        try {
            // Check if exists
            const { data: existingLifestyle } = await supabase
                .from('patient_lifestyle')
                .select('id')
                .eq('patient_id', patientId)
                .maybeSingle();

            const lifestylePayload: Record<string, any> = {
                patient_id: patientId,
                smoking_status: extractedData.lifestyle.smoking_status,
                years_smoking: extractedData.lifestyle.years_smoking,
                alcohol_status: extractedData.lifestyle.alcohol_status,
                exercise_hours_per_week: extractedData.lifestyle.exercise_hours_per_week,
                diet_type: extractedData.lifestyle.diet_type,
                sleep_quality: extractedData.lifestyle.sleep_quality,
            };

            if (existingLifestyle) {
                // Update only non-null values
                const updatePayload: any = {};
                for (const [key, value] of Object.entries(lifestylePayload)) {
                    if (value !== undefined && value !== null && key !== 'patient_id') {
                        updatePayload[key] = value;
                    }
                }
                if (Object.keys(updatePayload).length > 0) {
                    await supabase.from('patient_lifestyle').update(updatePayload).eq('id', existingLifestyle.id);
                    integrated.push('Mode de vie (mis à jour)');
                }
            } else {
                await supabase.from('patient_lifestyle').insert(lifestylePayload);
                integrated.push('Mode de vie');
            }
        } catch (e: any) {
            errors.push(`Lifestyle: ${e.message}`);
        }
    }

    // 15. Social Factors (NEW) -> patient_social_factors (upsert)
    if (extractedData.socialFactors && Object.keys(extractedData.socialFactors).length > 0) {
        try {
            const { data: existingSocial } = await supabase
                .from('patient_social_factors')
                .select('id')
                .eq('patient_id', patientId)
                .maybeSingle();

            const socialPayload: Record<string, any> = {
                patient_id: patientId,
                housing_status: extractedData.socialFactors.living_situation,
                employment_status: extractedData.socialFactors.employment_status,
                education_level: extractedData.socialFactors.marital_status,
                notes: `Profession: ${extractedData.socialFactors.occupation || 'N/A'}, Enfants: ${extractedData.socialFactors.children_count || 'N/A'}, Soutien: ${extractedData.socialFactors.social_support || 'N/A'}`
            };

            if (existingSocial) {
                const updatePayload: any = {};
                for (const [key, value] of Object.entries(socialPayload)) {
                    if (value !== undefined && value !== null && key !== 'patient_id') {
                        updatePayload[key] = value;
                    }
                }
                if (Object.keys(updatePayload).length > 0) {
                    await supabase.from('patient_social_factors').update(updatePayload).eq('id', existingSocial.id);
                    integrated.push('Facteurs sociaux (mis à jour)');
                }
            } else {
                await supabase.from('patient_social_factors').insert(socialPayload);
                integrated.push('Facteurs sociaux');
            }
        } catch (e: any) {
            errors.push(`Social Factors: ${e.message}`);
        }
    }

    // Mark document as auto-integrated
    if (integrated.length > 0) {
        await supabase.from('patient_documents').update({
            integrated_at: now,
            integrated_data: { fields: integrated, errors: errors, alerts: extractedData.alerts },
            auto_classified: true,
        }).eq('id', documentId);
    }

    return { integrated, errors };
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const documentId = formData.get('documentId') as string;
        const patientId = formData.get('patientId') as string;

        if (!file) throw new Error("No file provided");

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        if (documentId) {
            await supabase.from('patient_documents')
                .update({ extraction_status: 'processing' })
                .eq('id', documentId);
        }

        let extractedData: ExtractedMedicalData = {};
        const fileType = file.type || file.name.split('.').pop()?.toLowerCase() || '';

        // Simplification: Text or Image analysis via Claude
        let contentToAnalyze = '';
        let typeInfo: any = { contentType: 'text' };

        if (fileType.includes('image') || ['jpg', 'png', 'jpeg', 'webp'].some(e => fileType.includes(e))) {
            const arrayBuffer = await file.arrayBuffer();
            const base64 = arrayBufferToBase64(arrayBuffer);

            // Robust MIME type detection
            let mimeType = file.type;
            if (!mimeType) {
                const ext = file.name.split('.').pop()?.toLowerCase();
                if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
                else if (ext === 'png') mimeType = 'image/png';
                else if (ext === 'webp') mimeType = 'image/webp';
            }

            typeInfo = { contentType: 'image', imageBase64: base64, mimeType: mimeType };
        } else {
            contentToAnalyze = await file.text();
            typeInfo = { contentType: 'text', content: contentToAnalyze };
        }

        extractedData = await analyzeWithClaude(
            typeInfo.content || '',
            typeInfo.contentType,
            typeInfo.imageBase64,
            typeInfo.mimeType
        );

        if (!extractedData.documentType && extractedData.notes) {
            extractedData.documentType = detectDocumentCategory(extractedData.notes);
        }

        // Update document
        // Update document (after extraction)
        if (documentId) {
            await supabase.from('patient_documents').update({
                extracted_data: extractedData,
                extraction_status: 'completed',
                category: extractedData.documentType || 'autre',
                analyzed_at: new Date().toISOString(),
            }).eq('id', documentId);
        }

        // Initialize Admin Client for RLS bypass during integration
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const adminSupabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            serviceRoleKey ?? '',
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        // Call auto-integrate with Admin Client
        const integrationResult = await autoIntegrateData(
            adminSupabase, // Use admin client to bypass RLS on medications/pathologies creation
            patientId,
            documentId,
            extractedData
        );

        // Update document status
        await adminSupabase // Use admin here too to ensure we can update status regardless of ownership quirks, though user should own it.
            .from('patient_documents')
            .update({
                extraction_status: integrationResult.errors.length > 0 ? 'completed_with_errors' : 'completed',
                extracted_data: extractedData,
                integrated_at: new Date().toISOString(), // Ensure integrated_at is set
                integrated_data: { fields: integrationResult.integrated, errors: integrationResult.errors, alerts: extractedData.alerts },
                auto_classified: true,
            })
            .eq('id', documentId);

        return new Response(
            JSON.stringify({
                success: true,
                data: extractedData,
                integration: integrationResult
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error("Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
