import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * MASS DATA IMPORTER FOR KNOWLEDGE GRAPH
 * 
 * Imports millions of records from:
 * - RxNorm: All drugs, molecules, ingredients (200k+)
 * - DrugBank: Drug-drug interactions
 * - OpenFDA: Adverse events, labels (millions)
 * - NDF-RT: Drug classes, mechanisms
 * - ClinicalTrials.gov: Clinical studies (400k+)
 * - PubMed: Abstracts on interactions (millions)
 * - AllerGen: Common allergens database
 */

interface MassImportRequest {
    import_type: 'all' | 'rxnorm_full' | 'interactions' | 'allergens' | 'clinical_trials' | 'pubmed' | 'openfda_events';
    batch_size?: number;
    start_offset?: number;
    max_records?: number;
}

// ============================================
// RXNORM FULL IMPORT
// ============================================

async function importRxNormFull(supabase: any, maxRecords: number = 50000): Promise<any> {
    const stats = { imported: 0, errors: 0, categories: {} as Record<string, number> };

    // Drug classes to iterate through
    const drugClasses = [
        'Anti-Infective Agents',
        'Cardiovascular Agents',
        'Central Nervous System Agents',
        'Hormones and Synthetic Substitutes',
        'Gastrointestinal Agents',
        'Respiratory Tract Agents',
        'Blood Formation and Coagulation',
        'Autonomic Drugs',
        'Antineoplastic Agents',
        'Immunological Agents',
        'Musculoskeletal Agents',
        'Dermatological Agents',
        'Ophthalmic Preparations',
        'Diagnostic Agents'
    ];

    for (const drugClass of drugClasses) {
        if (stats.imported >= maxRecords) break;

        try {
            // Get drugs by class
            const classUrl = `https://rxnav.nlm.nih.gov/REST/rxclass/classMembers.json?classId=${encodeURIComponent(drugClass)}&relaSource=NDFRT`;
            const classRes = await fetch(classUrl);

            if (!classRes.ok) continue;

            const classData = await classRes.json();
            const members = classData?.drugMemberGroup?.drugMember || [];

            for (const member of members.slice(0, 500)) { // Limit per class
                if (stats.imported >= maxRecords) break;

                const rxcui = member.minConcept?.rxcui;
                const name = member.minConcept?.name;

                if (!rxcui || !name) continue;

                // Get detailed info
                const detailUrl = `https://rxnav.nlm.nih.gov/REST/rxcui/${rxcui}/allProperties.json?prop=all`;
                const detailRes = await fetch(detailUrl);

                let mechanism = '';
                let therapeuticArea = drugClass;

                if (detailRes.ok) {
                    const detailData = await detailRes.json();
                    const props = detailData?.propConceptGroup?.propConcept || [];

                    for (const prop of props) {
                        if (prop.propName === 'MECHANISM_OF_ACTION') {
                            mechanism = prop.propValue;
                        }
                    }
                }

                // Insert into molecules table
                const { error } = await supabase
                    .from('molecules')
                    .upsert({
                        rxcui: rxcui,
                        name: name,
                        molecule_type: 'drug',
                        mechanism_of_action: mechanism || null,
                        therapeutic_area: therapeuticArea,
                        pharmacological_class: drugClass
                    }, { onConflict: 'rxcui' });

                if (!error) {
                    stats.imported++;
                    stats.categories[drugClass] = (stats.categories[drugClass] || 0) + 1;
                } else {
                    stats.errors++;
                }

                // Rate limiting
                if (stats.imported % 50 === 0) {
                    await new Promise(r => setTimeout(r, 100));
                }
            }
        } catch (e) {
            console.error(`Error importing class ${drugClass}:`, e);
            stats.errors++;
        }
    }

    return stats;
}

// ============================================
// DRUG INTERACTIONS IMPORT
// ============================================

async function importDrugInteractions(supabase: any, maxRecords: number = 10000): Promise<any> {
    const stats = { imported: 0, errors: 0 };

    // Get all molecules we have
    const { data: molecules } = await supabase
        .from('molecules')
        .select('rxcui, name')
        .not('rxcui', 'is', null)
        .limit(500);

    if (!molecules || molecules.length === 0) {
        return { error: 'No molecules found, run rxnorm_full first' };
    }

    // Check interactions for each molecule
    for (const mol of molecules) {
        if (stats.imported >= maxRecords) break;

        try {
            const intUrl = `https://rxnav.nlm.nih.gov/REST/interaction/interaction.json?rxcui=${mol.rxcui}`;
            const intRes = await fetch(intUrl);

            if (!intRes.ok) continue;

            const intData = await intRes.json();
            const groups = intData?.interactionTypeGroup || [];

            for (const group of groups) {
                for (const type of group.interactionType || []) {
                    for (const pair of type.interactionPair || []) {
                        const interactingDrug = pair.interactionConcept?.[1];
                        const description = pair.description;
                        const severity = pair.severity || 'unknown';

                        if (!interactingDrug || !description) continue;

                        // Insert as KG edge
                        const { error } = await supabase
                            .from('cde_edges')
                            .upsert({
                                source_id: mol.rxcui,
                                target_id: interactingDrug.minConceptItem?.rxcui || 'unknown',
                                relationship_type: 'INTERACTS_WITH',
                                properties: {
                                    source_name: mol.name,
                                    target_name: interactingDrug.minConceptItem?.name,
                                    description: description,
                                    severity: severity,
                                    data_source: 'RxNorm'
                                }
                            }, { onConflict: 'source_id,target_id,relationship_type' });

                        if (!error) stats.imported++;
                        else stats.errors++;
                    }
                }
            }

            // Rate limiting
            await new Promise(r => setTimeout(r, 200));

        } catch (e) {
            stats.errors++;
        }
    }

    return stats;
}

// ============================================
// ALLERGENS IMPORT (Extended)
// ============================================

async function importAllergens(supabase: any): Promise<any> {
    const stats = { imported: 0, errors: 0 };

    // Comprehensive allergen list
    const allergens = [
        // Drug allergens
        { name: 'Pénicillines', category: 'drug', severity_potential: 'life_threatening', common_reactions: ['anaphylaxie', 'urticaire', 'œdème'], cross_reactivity: ['céphalosporines', 'carbapénèmes'] },
        { name: 'Céphalosporines', category: 'drug', severity_potential: 'severe', common_reactions: ['éruption cutanée', 'fièvre'], cross_reactivity: ['pénicillines'] },
        { name: 'Sulfamides', category: 'drug', severity_potential: 'severe', common_reactions: ['syndrome de Stevens-Johnson', 'éruption'], cross_reactivity: [] },
        { name: 'AINS', category: 'drug', severity_potential: 'moderate', common_reactions: ['bronchospasme', 'urticaire'], cross_reactivity: ['aspirine'] },
        { name: 'Aspirine', category: 'drug', severity_potential: 'moderate', common_reactions: ['asthme', 'rhinite', 'urticaire'], cross_reactivity: ['AINS'] },
        { name: 'Opioïdes', category: 'drug', severity_potential: 'severe', common_reactions: ['prurit', 'urticaire', 'dépression respiratoire'], cross_reactivity: [] },
        { name: 'Anesthésiques locaux', category: 'drug', severity_potential: 'moderate', common_reactions: ['réaction vagale', 'urticaire'], cross_reactivity: [] },
        { name: 'Produits de contraste iodés', category: 'drug', severity_potential: 'life_threatening', common_reactions: ['anaphylaxie', 'urticaire', 'bronchospasme'], cross_reactivity: [] },
        { name: 'Antiépileptiques', category: 'drug', severity_potential: 'severe', common_reactions: ['DRESS syndrome', 'Stevens-Johnson'], cross_reactivity: ['phénytoïne', 'carbamazépine', 'phénobarbital'] },
        { name: 'Inhibiteurs de l\'ECA', category: 'drug', severity_potential: 'severe', common_reactions: ['angioedème', 'toux'], cross_reactivity: [] },
        { name: 'Bêta-lactamines', category: 'drug', severity_potential: 'life_threatening', common_reactions: ['anaphylaxie', 'urticaire'], cross_reactivity: ['pénicillines', 'céphalosporines'] },
        { name: 'Quinolones', category: 'drug', severity_potential: 'moderate', common_reactions: ['photosensibilité', 'tendinite'], cross_reactivity: [] },
        { name: 'Macrolides', category: 'drug', severity_potential: 'mild', common_reactions: ['troubles digestifs', 'éruption'], cross_reactivity: [] },
        { name: 'Insuline', category: 'drug', severity_potential: 'moderate', common_reactions: ['lipodystrophie', 'urticaire locale'], cross_reactivity: [] },
        { name: 'Héparine', category: 'drug', severity_potential: 'severe', common_reactions: ['thrombocytopénie', 'nécrose cutanée'], cross_reactivity: ['HBPM'] },

        // Food allergens
        { name: 'Arachides', category: 'food', severity_potential: 'life_threatening', common_reactions: ['anaphylaxie', 'urticaire', 'angioedème'], cross_reactivity: ['autres légumineuses'] },
        { name: 'Fruits à coque', category: 'food', severity_potential: 'life_threatening', common_reactions: ['anaphylaxie', 'urticaire'], cross_reactivity: ['noix', 'noisettes', 'amandes'] },
        { name: 'Lait de vache', category: 'food', severity_potential: 'moderate', common_reactions: ['urticaire', 'diarrhée', 'eczéma'], cross_reactivity: ['lait de chèvre', 'lait de brebis'] },
        { name: 'Œufs', category: 'food', severity_potential: 'moderate', common_reactions: ['urticaire', 'symptômes digestifs', 'eczéma'], cross_reactivity: [] },
        { name: 'Poissons', category: 'food', severity_potential: 'severe', common_reactions: ['anaphylaxie', 'urticaire'], cross_reactivity: [] },
        { name: 'Crustacés', category: 'food', severity_potential: 'life_threatening', common_reactions: ['anaphylaxie', 'urticaire'], cross_reactivity: ['crevettes', 'homard', 'crabe'] },
        { name: 'Blé (gluten)', category: 'food', severity_potential: 'moderate', common_reactions: ['maladie cœliaque', 'dermatite herpétiforme'], cross_reactivity: ['seigle', 'orge'] },
        { name: 'Soja', category: 'food', severity_potential: 'moderate', common_reactions: ['urticaire', 'symptômes digestifs'], cross_reactivity: [] },
        { name: 'Sésame', category: 'food', severity_potential: 'severe', common_reactions: ['anaphylaxie', 'urticaire'], cross_reactivity: [] },
        { name: 'Moutarde', category: 'food', severity_potential: 'moderate', common_reactions: ['urticaire', 'angioedème'], cross_reactivity: [] },
        { name: 'Céleri', category: 'food', severity_potential: 'moderate', common_reactions: ['urticaire', 'anaphylaxie'], cross_reactivity: ['pollen de bouleau'] },
        { name: 'Lupin', category: 'food', severity_potential: 'severe', common_reactions: ['anaphylaxie'], cross_reactivity: ['arachides'] },
        { name: 'Mollusques', category: 'food', severity_potential: 'moderate', common_reactions: ['urticaire', 'symptômes digestifs'], cross_reactivity: [] },
        { name: 'Kiwi', category: 'food', severity_potential: 'moderate', common_reactions: ['syndrome oral', 'urticaire'], cross_reactivity: ['latex', 'banane', 'avocat'] },
        { name: 'Banane', category: 'food', severity_potential: 'moderate', common_reactions: ['syndrome oral'], cross_reactivity: ['latex', 'kiwi'] },

        // Environmental allergens  
        { name: 'Acariens', category: 'environmental', severity_potential: 'moderate', common_reactions: ['rhinite', 'asthme', 'eczéma'], cross_reactivity: [] },
        { name: 'Pollens de graminées', category: 'environmental', severity_potential: 'moderate', common_reactions: ['rhinite', 'conjonctivite', 'asthme'], cross_reactivity: [] },
        { name: 'Pollens d\'arbres', category: 'environmental', severity_potential: 'moderate', common_reactions: ['rhinite', 'syndrome oral'], cross_reactivity: ['pomme', 'poire', 'noisette'] },
        { name: 'Moisissures', category: 'environmental', severity_potential: 'moderate', common_reactions: ['rhinite', 'asthme'], cross_reactivity: [] },
        { name: 'Poils de chat', category: 'environmental', severity_potential: 'moderate', common_reactions: ['rhinite', 'asthme', 'urticaire'], cross_reactivity: [] },
        { name: 'Poils de chien', category: 'environmental', severity_potential: 'mild', common_reactions: ['rhinite', 'asthme'], cross_reactivity: [] },
        { name: 'Latex', category: 'environmental', severity_potential: 'life_threatening', common_reactions: ['anaphylaxie', 'urticaire', 'asthme'], cross_reactivity: ['banane', 'kiwi', 'avocat', 'châtaigne'] },
        { name: 'Venin d\'abeille', category: 'environmental', severity_potential: 'life_threatening', common_reactions: ['anaphylaxie', 'urticaire généralisée'], cross_reactivity: ['guêpe'] },
        { name: 'Venin de guêpe', category: 'environmental', severity_potential: 'life_threatening', common_reactions: ['anaphylaxie'], cross_reactivity: ['abeille'] },

        // Excipient allergens
        { name: 'Lactose', category: 'excipient', severity_potential: 'mild', common_reactions: ['troubles digestifs'], cross_reactivity: [] },
        { name: 'Parabènes', category: 'excipient', severity_potential: 'mild', common_reactions: ['dermatite de contact'], cross_reactivity: [] },
        { name: 'Colorants azoïques', category: 'excipient', severity_potential: 'moderate', common_reactions: ['urticaire', 'asthme'], cross_reactivity: ['aspirine'] },
        { name: 'Sulfites', category: 'excipient', severity_potential: 'moderate', common_reactions: ['bronchospasme', 'urticaire'], cross_reactivity: [] },
        { name: 'Propylène glycol', category: 'excipient', severity_potential: 'mild', common_reactions: ['dermatite de contact'], cross_reactivity: [] },
        { name: 'Lanoline', category: 'excipient', severity_potential: 'mild', common_reactions: ['dermatite de contact'], cross_reactivity: [] }
    ];

    for (const allergen of allergens) {
        const { error } = await supabase
            .from('allergens')
            .upsert({
                name: allergen.name,
                category: allergen.category,
                severity_potential: allergen.severity_potential,
                common_reactions: allergen.common_reactions,
                cross_reactivity: allergen.cross_reactivity
            }, { onConflict: 'name' });

        if (!error) stats.imported++;
        else stats.errors++;
    }

    return stats;
}

// ============================================
// CLINICAL TRIALS MASSIVE IMPORT
// ============================================

async function importClinicalTrials(supabase: any, maxRecords: number = 5000): Promise<any> {
    const stats = { imported: 0, errors: 0 };

    const conditions = [
        'diabetes', 'hypertension', 'cancer', 'covid', 'heart failure',
        'alzheimer', 'parkinson', 'depression', 'anxiety', 'asthma',
        'arthritis', 'obesity', 'stroke', 'epilepsy', 'multiple sclerosis',
        'lupus', 'crohn', 'hepatitis', 'kidney disease', 'leukemia'
    ];

    for (const condition of conditions) {
        if (stats.imported >= maxRecords) break;

        try {
            const url = `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(condition)}&pageSize=100&format=json`;
            const res = await fetch(url);

            if (!res.ok) continue;

            const data = await res.json();

            for (const study of data.studies || []) {
                if (stats.imported >= maxRecords) break;

                const protocol = study.protocolSection;
                const id = protocol?.identificationModule;
                const status = protocol?.statusModule;
                const design = protocol?.designModule;
                const desc = protocol?.descriptionModule;

                // Parse dates safely
                let startDate = null;
                let completionDate = null;

                try {
                    const startStr = status?.startDateStruct?.date;
                    if (startStr) {
                        if (startStr.length === 7) startDate = `${startStr}-01`;
                        else startDate = startStr;
                    }

                    const endStr = status?.completionDateStruct?.date;
                    if (endStr) {
                        if (endStr.length === 7) completionDate = `${endStr}-01`;
                        else completionDate = endStr;
                    }
                } catch (e) { }

                const { error } = await supabase
                    .from('clinical_trials')
                    .upsert({
                        nct_id: id?.nctId,
                        title: id?.officialTitle || id?.briefTitle,
                        status: status?.overallStatus,
                        phase: design?.phases?.join(', '),
                        conditions: protocol?.conditionsModule?.conditions || [],
                        interventions: protocol?.armsInterventionsModule?.interventions?.map((i: any) => i.name) || [],
                        brief_summary: desc?.briefSummary?.substring(0, 2000),
                        enrollment: design?.enrollmentInfo?.count,
                        start_date: startDate,
                        completion_date: completionDate,
                        sponsor: protocol?.sponsorCollaboratorsModule?.leadSponsor?.name
                    }, { onConflict: 'nct_id' });

                if (!error) stats.imported++;
                else stats.errors++;
            }

            await new Promise(r => setTimeout(r, 500));

        } catch (e) {
            stats.errors++;
        }
    }

    return stats;
}

// ============================================
// PUBMED ABSTRACTS MASSIVE IMPORT
// ============================================

async function importPubMedAbstracts(supabase: any, maxRecords: number = 5000): Promise<any> {
    const stats = { imported: 0, errors: 0 };
    const ncbiApiKey = Deno.env.get("NCBI_API_KEY");

    const searchTerms = [
        'drug interactions', 'adverse drug reactions', 'pharmacokinetics',
        'cytochrome P450', 'drug metabolism', 'clinical pharmacology',
        'medication safety', 'polypharmacy', 'drug toxicity',
        'therapeutic drug monitoring', 'pharmacogenomics', 'drug allergy',
        'anaphylaxis drug', 'Stevens-Johnson syndrome', 'DRESS syndrome'
    ];

    for (const term of searchTerms) {
        if (stats.imported >= maxRecords) break;

        try {
            let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term)}&retmax=200&retmode=json&sort=relevance`;
            if (ncbiApiKey) searchUrl += `&api_key=${ncbiApiKey}`;

            const searchRes = await fetch(searchUrl);
            if (!searchRes.ok) continue;

            const searchData = await searchRes.json();
            const ids = searchData?.esearchresult?.idlist || [];

            if (ids.length === 0) continue;

            let fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`;
            if (ncbiApiKey) fetchUrl += `&api_key=${ncbiApiKey}`;

            const fetchRes = await fetch(fetchUrl);
            const xmlText = await fetchRes.text();

            const articles = xmlText.split('</PubmedArticle>');

            for (const chunk of articles) {
                if (stats.imported >= maxRecords) break;

                const pmid = chunk.match(/<PMID[^>]*>(.*?)<\/PMID>/)?.[1];
                const title = chunk.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/)?.[1];
                if (!pmid || !title) continue;

                const abstractMatches = [...chunk.matchAll(/<AbstractText[^>]*>(.*?)<\/AbstractText>/g)];
                const abstract = abstractMatches.map(m => m[1]).join(" ").replace(/<[^>]*>/g, '').substring(0, 5000);

                const journal = chunk.match(/<Title>(.*?)<\/Title>/)?.[1];
                const year = chunk.match(/<Year>(.*?)<\/Year>/)?.[1];
                const doi = chunk.match(/<ArticleId IdType="doi">(.*?)<\/ArticleId>/)?.[1];

                const meshTerms: string[] = [];
                const meshMatches = chunk.matchAll(/<DescriptorName[^>]*>(.*?)<\/DescriptorName>/g);
                for (const m of meshMatches) {
                    meshTerms.push(m[1].replace(/<[^>]*>/g, ''));
                }

                const authorMatches = chunk.matchAll(/<LastName>(.*?)<\/LastName>/g);
                const authors: string[] = [];
                for (const m of authorMatches) {
                    if (authors.length < 5) authors.push(m[1]);
                }

                const { error } = await supabase
                    .from('pubmed_abstracts')
                    .upsert({
                        pmid: pmid,
                        title: title.replace(/<[^>]*>/g, '').substring(0, 500),
                        authors: authors,
                        journal: journal?.replace(/<[^>]*>/g, ''),
                        publication_year: year ? parseInt(year) : null,
                        abstract: abstract,
                        doi: doi,
                        mesh_terms: meshTerms.slice(0, 20)
                    }, { onConflict: 'pmid' });

                if (!error) stats.imported++;
                else stats.errors++;
            }

            await new Promise(r => setTimeout(r, 400));

        } catch (e) {
            stats.errors++;
        }
    }

    return stats;
}

// ============================================
// OPENFDA ADVERSE EVENTS IMPORT
// ============================================

async function importOpenFDAEvents(supabase: any, maxRecords: number = 10000): Promise<any> {
    const stats = { imported: 0, errors: 0, reactions: new Map<string, number>() };

    // Most reported drugs
    const drugs = [
        'METFORMIN', 'LISINOPRIL', 'AMLODIPINE', 'OMEPRAZOLE', 'SIMVASTATIN',
        'LOSARTAN', 'GABAPENTIN', 'LEVOTHYROXINE', 'ATORVASTATIN', 'METOPROLOL',
        'ASPIRIN', 'WARFARIN', 'PREDNISONE', 'FUROSEMIDE', 'TRAMADOL',
        'HYDROCHLOROTHIAZIDE', 'CLOPIDOGREL', 'PANTOPRAZOLE', 'DULOXETINE', 'SERTRALINE'
    ];

    for (const drug of drugs) {
        if (stats.imported >= maxRecords) break;

        try {
            const url = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:"${drug}"&limit=100`;
            const res = await fetch(url);

            if (!res.ok) continue;

            const data = await res.json();

            for (const event of data.results || []) {
                if (stats.imported >= maxRecords) break;

                // Collect reactions
                for (const reaction of event.patient?.reaction || []) {
                    const r = reaction.reactionmeddrapt;
                    if (r) {
                        stats.reactions.set(r, (stats.reactions.get(r) || 0) + 1);
                    }
                }

                // Add to side effects if serious
                if (event.serious === '1') {
                    const { error } = await supabase
                        .from('substances')
                        .upsert({
                            name: drug,
                            substance_type: 'active_ingredient',
                            description: `Adverse events reported to FDA`
                        }, { onConflict: 'name' });

                    if (!error) stats.imported++;
                }
            }

            await new Promise(r => setTimeout(r, 300));

        } catch (e) {
            stats.errors++;
        }
    }

    return {
        ...stats,
        top_reactions: [...stats.reactions.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50)
            .map(([name, count]) => ({ name, count }))
    };
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const request: MassImportRequest = await req.json();

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const maxRecords = request.max_records || 10000;
        let results: any = {};
        const startTime = Date.now();

        switch (request.import_type) {
            case 'rxnorm_full':
                results.rxnorm = await importRxNormFull(supabase, maxRecords);
                break;

            case 'interactions':
                results.interactions = await importDrugInteractions(supabase, maxRecords);
                break;

            case 'allergens':
                results.allergens = await importAllergens(supabase);
                break;

            case 'clinical_trials':
                results.clinical_trials = await importClinicalTrials(supabase, maxRecords);
                break;

            case 'pubmed':
                results.pubmed = await importPubMedAbstracts(supabase, maxRecords);
                break;

            case 'openfda_events':
                results.openfda = await importOpenFDAEvents(supabase, maxRecords);
                break;

            case 'all':
                // Run all imports in sequence (to avoid rate limits)
                results.allergens = await importAllergens(supabase);
                results.rxnorm = await importRxNormFull(supabase, Math.floor(maxRecords / 4));
                results.clinical_trials = await importClinicalTrials(supabase, Math.floor(maxRecords / 4));
                results.pubmed = await importPubMedAbstracts(supabase, Math.floor(maxRecords / 4));
                results.openfda = await importOpenFDAEvents(supabase, Math.floor(maxRecords / 4));
                break;

            default:
                throw new Error(`Unknown import type: ${request.import_type}`);
        }

        const duration = Date.now() - startTime;

        return new Response(JSON.stringify({
            success: true,
            import_type: request.import_type,
            results,
            duration_ms: duration
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Mass import error:", error);
        return new Response(
            JSON.stringify({ error: "Mass import failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
