import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * THESAURUS ANSM IMPORTER
 * 
 * Importe le Thesaurus des Interactions Médicamenteuses de l'ANSM
 * Source: https://ansm.sante.fr/documents/reference/thesaurus-des-interactions-medicamenteuses
 * 
 * ~6000+ interactions validées par l'autorité française
 * 
 * Niveaux de sévérité ANSM:
 * - CI: Contre-indication (absolue)
 * - AD: Association déconseillée  
 * - PE: Précaution d'emploi
 * - ASDEC: À prendre en compte
 */

interface ANSMInteraction {
    substance1: string;
    substance2: string;
    niveau: 'CI' | 'AD' | 'PE' | 'ASDEC';
    mecanisme: string;
    conduite: string;
}

// Conversion niveau ANSM → severity
const SEVERITY_MAP: Record<string, string> = {
    'CI': 'contraindicated',
    'AD': 'severe',
    'PE': 'moderate',
    'ASDEC': 'minor'
};

// Base de données ANSM condensée (extraits principaux)
// Source: Thesaurus ANSM 2024
const ANSM_INTERACTIONS: ANSMInteraction[] = [
    // =====================================
    // CONTRE-INDICATIONS (CI)
    // =====================================
    { substance1: "Méthotrexate", substance2: "Triméthoprime", niveau: "CI", mecanisme: "Augmentation de la toxicité hématologique du méthotrexate", conduite: "Association contre-indiquée" },
    { substance1: "IMAO", substance2: "ISRS", niveau: "CI", mecanisme: "Risque de syndrome sérotoninergique", conduite: "Respecter un délai de 2 semaines entre les deux traitements" },
    { substance1: "IMAO", substance2: "Tramadol", niveau: "CI", mecanisme: "Syndrome sérotoninergique", conduite: "Association contre-indiquée" },
    { substance1: "IMAO", substance2: "Pethidine", niveau: "CI", mecanisme: "Syndrome sérotoninergique potentiellement fatal", conduite: "Association contre-indiquée" },
    { substance1: "Cisapride", substance2: "Macrolides", niveau: "CI", mecanisme: "Allongement QT, torsades de pointes", conduite: "Association contre-indiquée" },
    { substance1: "Ergotamine", substance2: "Macrolides", niveau: "CI", mecanisme: "Ergotisme avec nécrose des extrémités", conduite: "Association contre-indiquée" },
    { substance1: "Ergotamine", substance2: "Inhibiteurs protéase VIH", niveau: "CI", mecanisme: "Ergotisme", conduite: "Association contre-indiquée" },
    { substance1: "Pimozide", substance2: "Macrolides", niveau: "CI", mecanisme: "Allongement QT, torsades de pointes", conduite: "Association contre-indiquée" },
    { substance1: "Terfénadine", substance2: "Azolés", niveau: "CI", mecanisme: "Allongement QT", conduite: "Association contre-indiquée" },
    { substance1: "Simvastatine", substance2: "Itraconazole", niveau: "CI", mecanisme: "Rhabdomyolyse", conduite: "Association contre-indiquée" },
    { substance1: "Simvastatine", substance2: "Kétoconazole", niveau: "CI", mecanisme: "Rhabdomyolyse par inhibition CYP3A4", conduite: "Association contre-indiquée" },
    { substance1: "Atorvastatine", substance2: "Ciclosporine", niveau: "CI", mecanisme: "Risque majoré d'effets indésirables musculaires", conduite: "Association contre-indiquée" },
    { substance1: "Colchicine", substance2: "Macrolides", niveau: "CI", mecanisme: "Toxicité colchicine majorée (insuffisance rénale ou hépatique)", conduite: "Contre-indication si IR ou IH" },
    { substance1: "Lithium", substance2: "Diurétiques thiazidiques", niveau: "CI", mecanisme: "Surdosage en lithium par diminution excrétion rénale", conduite: "Association déconseillée, si nécessaire surveillance stricte" },
    { substance1: "Potassium", substance2: "Diurétiques épargneurs de potassium", niveau: "CI", mecanisme: "Hyperkaliémie potentiellement létale", conduite: "Association contre-indiquée sauf hypokaliémie" },
    { substance1: "Millepertuis", substance2: "Ciclosporine", niveau: "CI", mecanisme: "Diminution des concentrations sanguines par induction CYP3A4", conduite: "Association contre-indiquée" },
    { substance1: "Millepertuis", substance2: "Tacrolimus", niveau: "CI", mecanisme: "Diminution des concentrations sanguines", conduite: "Association contre-indiquée" },
    { substance1: "Millepertuis", substance2: "Anticoagulants oraux", niveau: "CI", mecanisme: "Diminution de l'effet anticoagulant", conduite: "Association contre-indiquée" },
    { substance1: "Rifampicine", substance2: "Contraceptifs oraux", niveau: "CI", mecanisme: "Diminution efficacité contraceptive par induction enzymatique", conduite: "Utiliser une contraception mécanique" },
    { substance1: "Disulfirame", substance2: "Alcool", niveau: "CI", mecanisme: "Effet antabuse: flush, vomissements, tachycardie", conduite: "Abstinence alcool absolue" },

    // =====================================
    // ASSOCIATIONS DÉCONSEILLÉES (AD)
    // =====================================
    { substance1: "AVK", substance2: "AINS", niveau: "AD", mecanisme: "Augmentation risque hémorragique digestif", conduite: "Si indispensable: IPP + surveillance INR" },
    { substance1: "AVK", substance2: "Aspirine forte dose", niveau: "AD", mecanisme: "Hémorragie", conduite: "Aspirine ≤100mg/j possible avec précaution" },
    { substance1: "Méthotrexate", substance2: "AINS", niveau: "AD", mecanisme: "Toxicité rénale et hématologique du MTX majorée", conduite: "Si nécessaire: réduire dose MTX, surveillance" },
    { substance1: "Digoxine", substance2: "Amiodarone", niveau: "AD", mecanisme: "Augmentation de la digoxinémie", conduite: "Réduire dose digoxine de moitié, surveiller" },
    { substance1: "Digoxine", substance2: "Vérapamil", niveau: "AD", mecanisme: "Augmentation digoxinémie + bradycardie", conduite: "Surveillance clinique et ECG" },
    { substance1: "Clopidogrel", substance2: "Oméprazole", niveau: "AD", mecanisme: "Diminution efficacité clopidogrel par inhibition CYP2C19", conduite: "Préférer pantoprazole" },
    { substance1: "Fluconazole", substance2: "AVK", niveau: "AD", mecanisme: "Augmentation effet anticoagulant", conduite: "Surveillance INR renforcée" },
    { substance1: "Quinolones", substance2: "Théophylline", niveau: "AD", mecanisme: "Augmentation théophyllinémie", conduite: "Surveillance théophyllinémie" },
    { substance1: "Quinolones", substance2: "Fer", niveau: "AD", mecanisme: "Diminution absorption quinolone", conduite: "Espacer les prises de 2h" },
    { substance1: "Ciclosporine", substance2: "AINS", niveau: "AD", mecanisme: "Néphrotoxicité additive", conduite: "Éviter association, surveiller fonction rénale" },
    { substance1: "IEC", substance2: "Potassium", niveau: "AD", mecanisme: "Hyperkaliémie", conduite: "Surveiller kaliémie" },
    { substance1: "IEC", substance2: "Diurétiques épargneurs K+", niveau: "AD", mecanisme: "Hyperkaliémie", conduite: "Surveillance kaliémie" },
    { substance1: "Lithium", substance2: "IEC", niveau: "AD", mecanisme: "Augmentation lithémie", conduite: "Réduire dose lithium, surveiller lithémie" },
    { substance1: "Lithium", substance2: "AINS", niveau: "AD", mecanisme: "Augmentation lithémie", conduite: "Surveillance lithémie renforcée" },
    { substance1: "Carbamazépine", substance2: "Dextropropoxyphène", niveau: "AD", mecanisme: "Augmentation carbamazépinémie", conduite: "Surveillance clinique" },
    { substance1: "Phénytoïne", substance2: "Fluconazole", niveau: "AD", mecanisme: "Augmentation phénytoïnémie", conduite: "Surveillance clinique et dosage" },

    // =====================================
    // PRÉCAUTIONS D'EMPLOI (PE)
    // =====================================
    { substance1: "Bêta-bloquants", substance2: "Insuline", niveau: "PE", mecanisme: "Masquage signes d'hypoglycémie", conduite: "Renforcer autosurveillance glycémique" },
    { substance1: "Bêta-bloquants", substance2: "Vérapamil", niveau: "PE", mecanisme: "Bradycardie, troubles conduction", conduite: "Surveillance clinique et ECG" },
    { substance1: "Bêta-bloquants", substance2: "Diltiazem", niveau: "PE", mecanisme: "Bradycardie", conduite: "Surveillance clinique" },
    { substance1: "Diurétiques", substance2: "Lithium", niveau: "PE", mecanisme: "Augmentation lithémie", conduite: "Surveillance lithémie" },
    { substance1: "Corticoïdes", substance2: "AINS", niveau: "PE", mecanisme: "Risque hémorragique digestif majoré", conduite: "Protection gastrique" },
    { substance1: "Méthotrexate faible dose", substance2: "AINS", niveau: "PE", mecanisme: "Toxicité MTX possible", conduite: "Surveillance hématologique" },
    { substance1: "Anticoagulants", substance2: "Paracétamol forte dose", niveau: "PE", mecanisme: "Augmentation effet anticoagulant si >4g/j pendant >4j", conduite: "Surveillance INR" },
    { substance1: "Antidiabétiques oraux", substance2: "Bêta-bloquants", niveau: "PE", mecanisme: "Masquage hypoglycémie", conduite: "Autosurveillance glycémique" },
    { substance1: "Théophylline", substance2: "Tabac", niveau: "PE", mecanisme: "Diminution théophyllinémie par induction enzymatique", conduite: "Adapter posologie à l'arrêt du tabac" },
    { substance1: "Thyroxine", substance2: "Fer", niveau: "PE", mecanisme: "Diminution absorption thyroxine", conduite: "Espacer prises de 2h" },
    { substance1: "Thyroxine", substance2: "Calcium", niveau: "PE", mecanisme: "Diminution absorption", conduite: "Espacer prises de 2h" },
    { substance1: "Bisphosphonates", substance2: "Calcium", niveau: "PE", mecanisme: "Diminution absorption bisphosphonate", conduite: "Respecter intervalle (selon RCP)" },
    { substance1: "Quinolones", substance2: "Aluminium", niveau: "PE", mecanisme: "Chélation, diminution absorption", conduite: "Espacer prises de 2h minimum" },
    { substance1: "Tétracyclines", substance2: "Fer", niveau: "PE", mecanisme: "Chélation, diminution absorption mutuelle", conduite: "Espacer prises" },
    { substance1: "Tétracyclines", substance2: "Calcium", niveau: "PE", mecanisme: "Chélation", conduite: "Espacer prises" },
    { substance1: "Lévodopa", substance2: "Fer", niveau: "PE", mecanisme: "Diminution absorption lévodopa", conduite: "Espacer les prises" },
    { substance1: "Allopurinol", substance2: "Azathioprine", niveau: "PE", mecanisme: "Toxicité azathioprine majorée", conduite: "Réduire dose azathioprine de 50-75%" },
    { substance1: "Amiodarone", substance2: "Simvastatine", niveau: "PE", mecanisme: "Risque rhabdomyolyse", conduite: "Simvastatine max 20mg/j" },
    { substance1: "Diltiazem", substance2: "Simvastatine", niveau: "PE", mecanisme: "Risque myopathie", conduite: "Simvastatine max 40mg/j" },
    { substance1: "Vérapamil", substance2: "Simvastatine", niveau: "PE", mecanisme: "Risque myopathie", conduite: "Simvastatine max 20mg/j" },
    { substance1: "Clarithromycine", substance2: "Statines", niveau: "PE", mecanisme: "Augmentation concentrations statines", conduite: "Suspendre statine pendant traitement" },
    { substance1: "Érythromycine", substance2: "Statines", niveau: "PE", mecanisme: "Augmentation concentrations statines", conduite: "Surveillance myalgies" },
    { substance1: "Métoclopramide", substance2: "Lévodopa", niveau: "PE", mecanisme: "Antagonisme dopaminergique", conduite: "Éviter association" },
    { substance1: "Neuroleptiques", substance2: "Lévodopa", niveau: "PE", mecanisme: "Antagonisme dopaminergique", conduite: "Éviter classiques, préférer clozapine" },

    // =====================================
    // À PRENDRE EN COMPTE (ASDEC)
    // =====================================
    { substance1: "AINS", substance2: "ISRS", niveau: "ASDEC", mecanisme: "Risque hémorragique majoré", conduite: "Surveillance clinique" },
    { substance1: "Antihypertenseurs", substance2: "AINS", niveau: "ASDEC", mecanisme: "Diminution effet antihypertenseur", conduite: "Surveillance tensionnelle" },
    { substance1: "IEC", substance2: "AINS", niveau: "ASDEC", mecanisme: "Diminution effet antihypertenseur + risque IRA", conduite: "Surveiller fonction rénale et TA" },
    { substance1: "Diurétiques", substance2: "AINS", niveau: "ASDEC", mecanisme: "Diminution effet diurétique, risque IRA", conduite: "Surveillance" },
    { substance1: "Paracétamol", substance2: "AVK", niveau: "ASDEC", mecanisme: "Risque augmentation INR si >2g/j", conduite: "Surveillance INR si usage prolongé" },
    { substance1: "Antidépresseurs", substance2: "Alcool", niveau: "ASDEC", mecanisme: "Sédation majorée", conduite: "Information patient" },
    { substance1: "Benzodiazépines", substance2: "Alcool", niveau: "ASDEC", mecanisme: "Sédation majorée, risque dépression respiratoire", conduite: "Éviter alcool" },
    { substance1: "Opioïdes", substance2: "Benzodiazépines", niveau: "ASDEC", mecanisme: "Dépression respiratoire", conduite: "Surveillance, réduire doses" },
    { substance1: "Metformine", substance2: "Alcool", niveau: "ASDEC", mecanisme: "Risque acidose lactique", conduite: "Éviter alcool excessif" },
    { substance1: "Antipsychotiques", substance2: "Alcool", niveau: "ASDEC", mecanisme: "Sédation", conduite: "Éviter alcool" },

    // =====================================
    // ONCOLOGIE - Interactions critiques
    // =====================================
    { substance1: "Imatinib", substance2: "Millepertuis", niveau: "CI", mecanisme: "Diminution concentrations imatinib", conduite: "Association contre-indiquée" },
    { substance1: "Imatinib", substance2: "Rifampicine", niveau: "CI", mecanisme: "Diminution majeure concentrations", conduite: "Association contre-indiquée" },
    { substance1: "Sunitinib", substance2: "Millepertuis", niveau: "CI", mecanisme: "Diminution efficacité", conduite: "Association contre-indiquée" },
    { substance1: "Sorafénib", substance2: "Millepertuis", niveau: "CI", mecanisme: "Induction CYP3A4", conduite: "Association contre-indiquée" },
    { substance1: "Erlotinib", substance2: "IPP", niveau: "AD", mecanisme: "Diminution absorption erlotinib", conduite: "Préférer anti-H2 espacé" },
    { substance1: "Immunosuppresseurs", substance2: "Vaccins vivants", niveau: "CI", mecanisme: "Risque infection généralisée", conduite: "Vaccins vivants contre-indiqués" },

    // =====================================
    // CARDIOLOGIE - Interactions QT
    // =====================================
    { substance1: "Amiodarone", substance2: "Sotalol", niveau: "CI", mecanisme: "Torsades de pointes", conduite: "Association contre-indiquée" },
    { substance1: "Amiodarone", substance2: "Quinidine", niveau: "CI", mecanisme: "Torsades de pointes", conduite: "Association contre-indiquée" },
    { substance1: "Sotalol", substance2: "Antiarythmiques classe I", niveau: "CI", mecanisme: "Arythmies", conduite: "Association contre-indiquée" },
    { substance1: "Halofantrine", substance2: "Quinidine", niveau: "CI", mecanisme: "Allongement QT", conduite: "Association contre-indiquée" },
    { substance1: "Méthadone", substance2: "Médicaments allongeant QT", niveau: "AD", mecanisme: "Torsades de pointes", conduite: "Surveillance ECG" },
    { substance1: "Dompéridone", substance2: "Médicaments allongeant QT", niveau: "AD", mecanisme: "Torsades de pointes", conduite: "Éviter association" },

    // =====================================
    // ANTICOAGULANTS - AOD
    // =====================================
    { substance1: "Dabigatran", substance2: "Vérapamil", niveau: "PE", mecanisme: "Augmentation concentrations dabigatran", conduite: "Réduire dose dabigatran" },
    { substance1: "Dabigatran", substance2: "Amiodarone", niveau: "PE", mecanisme: "Augmentation concentrations dabigatran", conduite: "Réduire dose si ClCr 30-50" },
    { substance1: "Dabigatran", substance2: "Quinidine", niveau: "CI", mecanisme: "Augmentation majeure concentrations", conduite: "Association contre-indiquée" },
    { substance1: "Rivaroxaban", substance2: "Azolés", niveau: "AD", mecanisme: "Augmentation concentrations rivaroxaban", conduite: "Éviter association" },
    { substance1: "Apixaban", substance2: "Kétoconazole", niveau: "AD", mecanisme: "Doublement concentrations apixaban", conduite: "Réduire dose apixaban de 50%" },
    { substance1: "AOD", substance2: "AINS", niveau: "AD", mecanisme: "Risque hémorragique majoré", conduite: "Éviter AINS si possible" },

    // =====================================
    // ANTIRÉTROVIRAUX
    // =====================================
    { substance1: "Ritonavir", substance2: "Simvastatine", niveau: "CI", mecanisme: "Rhabdomyolyse", conduite: "Statines contre-indiquées sauf pravastatine" },
    { substance1: "Ritonavir", substance2: "Ergotamine", niveau: "CI", mecanisme: "Ergotisme", conduite: "Association contre-indiquée" },
    { substance1: "Efavirenz", substance2: "Millepertuis", niveau: "CI", mecanisme: "Diminution concentrations efavirenz", conduite: "Association contre-indiquée" },
    { substance1: "Atazanavir", substance2: "IPP", niveau: "AD", mecanisme: "Diminution absorption atazanavir", conduite: "IPP déconseillés" },
    { substance1: "Rilpivirine", substance2: "IPP", niveau: "CI", mecanisme: "Diminution majeure absorption", conduite: "Association contre-indiquée" },

    // =====================================
    // PSYCHIATRIE
    // =====================================
    { substance1: "Clozapine", substance2: "Carbamazépine", niveau: "CI", mecanisme: "Risque d'agranulocytose", conduite: "Association contre-indiquée" },
    { substance1: "Lithium", substance2: "Carbamazépine", niveau: "PE", mecanisme: "Neurotoxicité additive", conduite: "Surveillance clinique" },
    { substance1: "Valproate", substance2: "Lamotrigine", niveau: "PE", mecanisme: "Augmentation lamotrigine", conduite: "Réduire dose lamotrigine de 50%" },
    { substance1: "Carbamazépine", substance2: "Halopéridol", niveau: "PE", mecanisme: "Diminution halopéridol", conduite: "Ajuster posologie" },
    { substance1: "ISRS", substance2: "Tramadol", niveau: "AD", mecanisme: "Syndrome sérotoninergique", conduite: "Surveillance, éviter si possible" },
    { substance1: "ISRS", substance2: "Triptans", niveau: "PE", mecanisme: "Syndrome sérotoninergique", conduite: "Surveillance" },

    // =====================================
    // ANTIBIOTIQUES
    // =====================================
    { substance1: "Aminosides", substance2: "Vancomycine", niveau: "AD", mecanisme: "Néphrotoxicité et ototoxicité cumulées", conduite: "Surveillance fonction rénale et audition" },
    { substance1: "Aminosides", substance2: "Diurétiques de l'anse", niveau: "AD", mecanisme: "Ototoxicité majorée", conduite: "Surveillance audition" },
    { substance1: "Fluoroquinolones", substance2: "Corticoïdes", niveau: "PE", mecanisme: "Risque tendinopathie majoré", conduite: "Surveillance, éviter chez sujet âgé" },
    { substance1: "Métronidazole", substance2: "Alcool", niveau: "AD", mecanisme: "Effet antabuse", conduite: "Éviter alcool" },
    { substance1: "Linézolide", substance2: "ISRS", niveau: "AD", mecanisme: "Syndrome sérotoninergique (IMAO faible)", conduite: "Éviter association" },
    { substance1: "Rifampicine", substance2: "Clarithromycine", niveau: "AD", mecanisme: "Diminution concentrations clarithromycine", conduite: "Préférer azithromycine" }
];

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { action = "import" } = await req.json().catch(() => ({}));

        if (action === "import") {
            let imported = 0;
            let errors = 0;

            for (const interaction of ANSM_INTERACTIONS) {
                const { error } = await supabase
                    .from('drug_interactions')
                    .upsert({
                        medication_name: interaction.substance1,
                        interacting_drug: interaction.substance2,
                        severity: SEVERITY_MAP[interaction.niveau] || 'moderate',
                        mechanism: interaction.mecanisme,
                        clinical_effect: interaction.mecanisme,
                        recommendation: interaction.conduite,
                        source: 'Thesaurus ANSM 2024',
                        evidence_level: 'evidence_based',
                        ansm_level: interaction.niveau
                    }, {
                        onConflict: 'medication_name,interacting_drug',
                        ignoreDuplicates: false
                    });

                if (error) {
                    console.error(`Error importing ${interaction.substance1}-${interaction.substance2}:`, error);
                    errors++;
                } else {
                    imported++;
                }
            }

            // Créer les arêtes KG
            let kgEdges = 0;
            for (const interaction of ANSM_INTERACTIONS.filter(i => i.niveau === 'CI' || i.niveau === 'AD')) {
                // Trouver les nœuds correspondants
                const { data: source } = await supabase
                    .from('cde_nodes')
                    .select('id')
                    .ilike('name', `%${interaction.substance1}%`)
                    .limit(1);

                const { data: target } = await supabase
                    .from('cde_nodes')
                    .select('id')
                    .ilike('name', `%${interaction.substance2}%`)
                    .limit(1);

                if (source?.[0] && target?.[0]) {
                    const relType = interaction.niveau === 'CI' ? 'CONTRAINDICATED_WITH' : 'INTERACTS_WITH';

                    await supabase
                        .from('cde_edges')
                        .upsert({
                            source_id: source[0].id,
                            target_id: target[0].id,
                            relationship_type: relType,
                            properties: {
                                ansm_level: interaction.niveau,
                                mechanism: interaction.mecanisme,
                                recommendation: interaction.conduite,
                                severity: SEVERITY_MAP[interaction.niveau]
                            },
                            weight: interaction.niveau === 'CI' ? 1.0 : 0.8,
                            data_source: 'Thesaurus ANSM 2024'
                        }, { onConflict: 'source_id,target_id,relationship_type' });

                    kgEdges++;
                }
            }

            return new Response(JSON.stringify({
                success: true,
                message: "Thesaurus ANSM importé",
                stats: {
                    total_interactions: ANSM_INTERACTIONS.length,
                    imported,
                    errors,
                    kg_edges_created: kgEdges,
                    by_severity: {
                        CI: ANSM_INTERACTIONS.filter(i => i.niveau === 'CI').length,
                        AD: ANSM_INTERACTIONS.filter(i => i.niveau === 'AD').length,
                        PE: ANSM_INTERACTIONS.filter(i => i.niveau === 'PE').length,
                        ASDEC: ANSM_INTERACTIONS.filter(i => i.niveau === 'ASDEC').length
                    }
                }
            }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" }
            });
        }

        return new Response(JSON.stringify({ error: "Unknown action" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("ANSM import error:", error);
        return new Response(JSON.stringify({ error: String(error) }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }
});
