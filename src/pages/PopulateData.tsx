
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { fakerFR as faker } from '@faker-js/faker';

// Helper to generate random int
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
// Helper to pick random array element
function randomPick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}
// Helper to generate random date in past
const randomDatePast = (years = 5) => new Date(Date.now() - Math.random() * years * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
// Helper to generate random date in future
const randomDateFuture = (days = 30) => new Date(Date.now() + Math.random() * days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
// Helper to maybe return null (to simulate realistic sparse data, though user wants "filled")
// User said "fill all sections", so I will avoid nulls where possible to make it "filled".

const PopulateData = () => {
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [progress, setProgress] = useState(0);

    const addLog = (msg: string) => {
        setLogs(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`]);
        console.log(msg);
    };

    const runPopulation = async () => {
        setLoading(true);
        setLogs([]);
        setProgress(0);

        try {
            addLog("Démarrage du peuplement des données...");

            // 1. Fetch medications for FKs
            const { data: medications } = await supabase.from('medications').select('id').limit(10);
            const medicationIds = medications?.map(m => m.id) || [];
            if (medicationIds.length === 0) addLog("⚠️ Aucune médication trouvée. Les données de médication seront ignorées ou nécessiteront des médicaments.");

            // 2. Fetch all patients
            const { data: patients, error: patientError } = await supabase.from('patients').select('id, first_name, last_name, gender');
            if (patientError) throw patientError;
            if (!patients || patients.length === 0) {
                addLog("❌ Aucun patient trouvé.");
                setLoading(false);
                return;
            }

            addLog(`Found ${patients.length} patients. Processing...`);

            let completed = 0;

            for (const p of patients) {
                const pid = p.id;
                addLog(`Traitement patient: ${p.first_name} ${p.last_name} (${pid})`);

                // --- 1. Medications ---
                if (medicationIds.length > 0) {
                    // Check if exists
                    const { count } = await supabase.from('patient_medications').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                    if (count === 0) {
                        const medsToInsert = Array.from({ length: randomInt(1, 4) }).map(() => ({
                            patient_id: pid,
                            medication_id: randomPick(medicationIds),
                            dosage: `${randomInt(10, 500)}mg`,
                            frequency: randomPick(['1x/jour', '2x/jour', '3x/jour', 'Au besoin']),
                            start_date: randomDatePast(1),
                            is_active: Math.random() > 0.3,
                            prescribed_by: `Dr. ${faker.person.lastName()}`,
                            notes: 'Traitement standard'
                        }));
                        await supabase.from('patient_medications').insert(medsToInsert);
                        addLog(`  + Ajouté ${medsToInsert.length} médications`);
                    }
                }

                // --- 2. Medical History ---
                const { count: mhCount } = await supabase.from('patient_medical_history').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                if (mhCount === 0) {
                    const items = Array.from({ length: randomInt(2, 5) }).map(() => ({
                        patient_id: pid,
                        condition_name: randomPick(['Hypertension', 'Diabète Type 2', 'Asthme', 'Migraine', 'Arthrite', 'Gastrite']),
                        condition_type: 'disease',
                        diagnosis_date: randomDatePast(10),
                        severity: randomPick(['mild', 'moderate', 'severe']),
                        is_chronic: Math.random() > 0.5,
                        treatment: 'Suivi régulier',
                        notes: faker.lorem.sentence()
                    }));
                    await supabase.from('patient_medical_history').insert(items);
                    addLog(`  + Ajouté ${items.length} antécédents médicaux`);
                }

                // --- 3. Family History ---
                const { count: fhCount } = await supabase.from('patient_family_history').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                if (fhCount === 0) {
                    const items = [{
                        patient_id: pid,
                        relationship: 'father',
                        condition: 'Hypertension',
                        age_at_diagnosis: 55,
                        is_hereditary: true
                    }, {
                        patient_id: pid,
                        relationship: 'mother',
                        condition: 'Diabète',
                        age_at_diagnosis: 60,
                        is_hereditary: true
                    }];
                    await supabase.from('patient_family_history').insert(items);
                    addLog(`  + Ajouté ${items.length} antécédents familiaux`);
                }

                // --- 4. Allergies ---
                const { count: alCount } = await supabase.from('patient_allergies').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                if (alCount === 0) {
                    const items = [{
                        patient_id: pid,
                        allergen: randomPick(['Pénicilline', 'Arachides', 'Pollen', 'Latex']),
                        allergy_type: 'medication',
                        severity: 'moderate',
                        reaction: 'Rash cutané',
                        onset_date: randomDatePast(5),
                        confirmed: true
                    }];
                    await supabase.from('patient_allergies').insert(items);
                    addLog(`  + Ajouté ${items.length} allergies`);
                }

                // --- 5. Vaccinations ---
                const { count: vacCount } = await supabase.from('patient_vaccinations').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                if (vacCount === 0) {
                    const items = Array.from({ length: 3 }).map(() => ({
                        patient_id: pid,
                        vaccine_name: randomPick(['Grippe', 'Tétanos', 'Covid-19', 'Hépatite B']),
                        vaccination_date: randomDatePast(2),
                        dose_number: 1,
                        administered_by: 'Centre de vaccination',
                    }));
                    await supabase.from('patient_vaccinations').insert(items);
                    addLog(`  + Ajouté ${items.length} vaccinations`);
                }

                // --- 6. Lifestyle ---
                const { count: lsCount } = await supabase.from('patient_lifestyle').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                if (lsCount === 0) {
                    await supabase.from('patient_lifestyle').insert({
                        patient_id: pid,
                        smoking_status: randomPick(['never', 'former', 'current']),
                        alcohol_status: 'occasional',
                        physical_activity_level: 'moderate',
                        diet_type: 'omnivores',
                        sleep_hours_average: 7.5,
                        sleep_quality: 'good'
                    });
                    addLog(`  + Ajouté Lifestyle`);
                }

                // --- 7. Lab Results ---
                const { count: labCount } = await supabase.from('patient_lab_results').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                if (labCount === 0) {
                    const items = [
                        { test_name: 'Hémoglobine', value: 14.5, unit: 'g/dL', category: 'hematology', reference_min: 13, reference_max: 17 },
                        { test_name: 'Cholestérol Total', value: 190, unit: 'mg/dL', category: 'biochemistry', reference_min: 100, reference_max: 200 },
                        { test_name: 'Glycémie à jeun', value: 95, unit: 'mg/dL', category: 'biochemistry', reference_min: 70, reference_max: 100 },
                    ].map(i => ({
                        patient_id: pid,
                        ...i,
                        test_date: randomDatePast(1)
                    }));
                    await supabase.from('patient_lab_results').insert(items);
                    addLog(`  + Ajouté ${items.length} résultats labo`);
                }

                // --- 8. Imaging ---
                const { count: imgCount } = await supabase.from('patient_imaging').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                if (imgCount === 0) {
                    await supabase.from('patient_imaging').insert({
                        patient_id: pid,
                        exam_date: randomDatePast(1),
                        imaging_type: 'X-Ray',
                        body_region: 'Chest',
                        findings: 'Normal chest X-ray. No acute abnormalities.',
                        conclusion: 'Normal study.',
                        radiologist: `Dr. ${faker.person.lastName()}`,
                        facility: 'Hôpital Central'
                    });
                    addLog(`  + Ajouté Imagerie`);
                }

                // --- 9. Consultations ---
                const { count: consCount } = await supabase.from('patient_consultations').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                if (consCount === 0) {
                    await supabase.from('patient_consultations').insert([{
                        patient_id: pid,
                        consultation_date: randomDatePast(1),
                        specialty: 'Généraliste',
                        physician_name: `Dr. ${faker.person.lastName()}`,
                        reason: 'Check-up annuel',
                        diagnosis: 'Bonne santé générale',
                        treatment_plan: 'Continuer le mode de vie sain'
                    }, {
                        patient_id: pid,
                        consultation_date: randomDatePast(3),
                        specialty: 'Cardiologie',
                        physician_name: `Dr. ${faker.person.lastName()}`,
                        reason: 'Palpitations',
                        diagnosis: 'Arythmie bénigne',
                        treatment_plan: 'Surveillance'
                    }]);
                    addLog(`  + Ajouté 2 Consultations`);
                }

                // --- 10. Prevention ---
                const { count: prevCount } = await supabase.from('patient_prevention').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                if (prevCount === 0) {
                    await supabase.from('patient_prevention').insert({
                        patient_id: pid,
                        screening_type: 'Coloscopie',
                        last_screening_date: randomDatePast(5),
                        next_screening_date: randomDateFuture(300),
                        result: 'Normal',
                        is_normal: true
                    });
                    addLog(`  + Ajouté Prévention`);
                }

                // --- 11. Mental Health ---
                const { count: mentalCount } = await supabase.from('patient_mental_health').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                if (mentalCount === 0) {
                    await supabase.from('patient_mental_health').insert({
                        patient_id: pid,
                        entry_date: randomDatePast(1),
                        mood_score: 8,
                        anxiety_level: 2,
                        sleep_quality: 7,
                        energy_level: 7,
                        notes: 'Bon état mental'
                    });
                    addLog(`  + Ajouté Santé Mentale`);
                }

                // --- 12. Reproductive Health (if female) ---
                if (p.gender === 'female') {
                    const { count: reproCount } = await supabase.from('patient_reproductive_health').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                    if (reproCount === 0) {
                        await supabase.from('patient_reproductive_health').insert({
                            patient_id: pid,
                            entry_date: randomDatePast(0.1),
                            entry_type: 'cycle',
                            cycle_start: randomDatePast(0.1),
                            cycle_length: 28,
                            flow_intensity: 'moderate'
                        });
                        addLog(`  + Ajouté Santé Reproductive`);
                    }
                }

                // --- 13. Functional Exams ---
                const { count: funcCount } = await supabase.from('patient_functional_exams').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                if (funcCount === 0) {
                    await supabase.from('patient_functional_exams').insert({
                        patient_id: pid,
                        exam_type: 'ECG',
                        exam_date: randomDatePast(1),
                        findings: 'Sinus rhythm',
                        is_abnormal: false,
                        physician: `Dr. ${faker.person.lastName()}`
                    });
                    addLog(`  + Ajouté Examens Fonctionnels`);
                }

                // --- 14. Age Specific ---
                const { count: ageCount } = await supabase.from('patient_age_specific').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                if (ageCount === 0) {
                    await supabase.from('patient_age_specific').insert({
                        patient_id: pid,
                        entry_type: 'general_assessment',
                        activity_level: 'active', // Note: schema says int fields mainly but checking types.ts usually safer. using loose generic here if possible, but schema in sql says columns.
                        // SQL: height_percentile, weight_percentile...
                        // I'll stick to safe fields
                        cognitive_score: 28,
                        fall_risk_score: 0
                    });
                    addLog(`  + Ajouté Age Specific`);
                }

                // --- 15. Social Factors ---
                const { count: socCount } = await supabase.from('patient_social_factors').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                if (socCount === 0) {
                    await supabase.from('patient_social_factors').insert({
                        patient_id: pid,
                        housing_status: 'stable',
                        living_alone: false,
                        employment_status: 'employed',
                        has_family_support: true,
                        financial_difficulties: false
                    });
                    addLog(`  + Ajouté Facteurs Sociaux`);
                }

                // --- 16. Dental ---
                const { count: dentCount } = await supabase.from('patient_dental').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                if (dentCount === 0) {
                    await supabase.from('patient_dental').insert({
                        patient_id: pid,
                        entry_type: 'checkup',
                        procedure: 'Nettoyage',
                        dentist_name: `Dr. ${faker.person.lastName()}`,
                        cost: 120.00,
                        next_appointment: randomDateFuture(180)
                    });
                    addLog(`  + Ajouté Dentaire`);
                }

                // --- 17. Clinical Data ---
                const { count: cliCount } = await supabase.from('patient_clinical_data').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                if (cliCount === 0) {
                    await supabase.from('patient_clinical_data').insert([{
                        patient_id: pid,
                        systolic_bp: 120,
                        diastolic_bp: 80,
                        heart_rate: 72,
                        temperature: 36.6,
                        weight_kg: 70 + randomInt(-5, 5),
                        height_cm: 175,
                        recorded_at: new Date().toISOString()
                    }]);
                    addLog(`  + Ajouté Données Cliniques`);
                }

                // --- 18. Communications ---
                const { count: commCount } = await supabase.from('patient_communications').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                if (commCount === 0) {
                    await supabase.from('patient_communications').insert({
                        patient_id: pid,
                        communication_type: 'email_in',
                        sender: p.email || 'patient@example.com',
                        subject: 'Demande de RDV',
                        content: 'Bonjour, je souhaite prendre rendez-vous.',
                        status: 'pending'
                    });
                    addLog(`  + Ajouté Communications`);
                }

                // --- 19. Monitoring ---
                const { count: monCount } = await supabase.from('patient_monitoring').select('*', { count: 'exact', head: true }).eq('patient_id', pid);
                if (monCount === 0) {
                    await supabase.from('patient_monitoring').insert({
                        patient_id: pid,
                        monitoring_type: 'blood_pressure',
                        value: 125,
                        value_unit: 'mmHg',
                        secondary_value: 82,
                        secondary_unit: 'mmHg',
                        is_within_target: true
                    });
                    addLog(`  + Ajouté Monitoring`);
                }

                completed++;
                setProgress(Math.round((completed / patients.length) * 100));
            }

            addLog("✅ Terminé avec succès !");

        } catch (err: any) {
            console.error(err);
            addLog(`❌ Erreur: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AppLayout>
            <div className="container mx-auto p-4 max-w-3xl">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-2xl">Peuplement des Données Patients</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-muted-foreground">
                            Cet outil va parcourir tous les patients existants et remplir les rubriques vides avec des données fictives réalistes.
                            (Médications, Antécédents, Allergies, Labo, etc.)
                        </p>

                        <div className="flex gap-4">
                            <Button onClick={runPopulation} disabled={loading} size="lg">
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle className="mr-2 h-4 w-4" />}
                                Lancer le peuplement
                            </Button>
                        </div>

                        {loading && (
                            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                <div
                                    className="bg-primary h-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        )}

                        <div className="bg-slate-950 text-green-400 p-4 rounded-md font-mono text-xs h-96 overflow-y-auto">
                            {logs.length === 0 ? <span className="text-slate-500">En attente...</span> : logs.map((log, i) => (
                                <div key={i}>{log}</div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
};

export default PopulateData;
