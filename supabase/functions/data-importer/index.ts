import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * DATA IMPORTER
 * 
 * Fetches and imports medical data from external APIs:
 * 1. RxNorm - Molecules, drug classes
 * 2. OpenFDA - Drug labels, adverse events, recalls
 * 3. ClinicalTrials.gov - Active trials
 * 4. MedlinePlus - Alternative treatments, foods
 * 5. NCBI/PubMed - Literature (with abstracts)
 * 
 * Can be called with different import_type to import specific data.
 */

interface ImportRequest {
    import_type: 'rxnorm_drugs' | 'rxnorm_classes' | 'openfda_labels' | 'clinicaltrials' | 'medlineplus' | 'pubmed' | 'allergens' | 'foods' | 'all';
    query?: string;
    limit?: number;
    offset?: number;
}

interface ImportResult {
    import_type: string;
    imported_count: number;
    skipped_count: number;
    error_count: number;
    errors: string[];
    duration_ms: number;
}

// ============================================
// RXNORM IMPORTERS
// ============================================

async function importRxNormDrugs(supabase: any, limit: number = 100): Promise<ImportResult> {
    const start = Date.now();
    const result: ImportResult = {
        import_type: 'rxnorm_drugs',
        imported_count: 0,
        skipped_count: 0,
        error_count: 0,
        errors: [],
        duration_ms: 0
    };

    try {
        // Get list of drug classes first
        const classUrl = `https://rxnav.nlm.nih.gov/REST/rxclass/allClasses.json?classTypes=ATC1-4`;
        const classRes = await fetch(classUrl);

        if (!classRes.ok) {
            result.errors.push(`RxClass API failed: ${classRes.status}`);
            return result;
        }

        const classData = await classRes.json();
        const classes = classData?.rxclassMinConceptList?.rxclassMinConcept || [];

        // Get drugs for top classes
        for (const rxClass of classes.slice(0, Math.min(limit, 20))) {
            try {
                const drugsUrl = `https://rxnav.nlm.nih.gov/REST/rxclass/classMembers.json?classId=${encodeURIComponent(rxClass.classId)}&relaSource=ATC`;
                const drugsRes = await fetch(drugsUrl);

                if (!drugsRes.ok) continue;

                const drugsData = await drugsRes.json();
                const members = drugsData?.drugMemberGroup?.drugMember || [];

                for (const drug of members.slice(0, 10)) {
                    const concept = drug.minConcept;
                    if (!concept?.rxcui) continue;

                    // Insert molecule
                    const { error } = await supabase
                        .from('molecules')
                        .upsert({
                            rxcui: concept.rxcui,
                            name: concept.name,
                            molecule_type: 'small_molecule',
                            pharmacological_class: [rxClass.className],
                            source: 'rxnorm'
                        }, { onConflict: 'rxcui' });

                    if (error) {
                        result.skipped_count++;
                    } else {
                        result.imported_count++;
                    }
                }
            } catch (e) {
                result.error_count++;
                result.errors.push(`Class ${rxClass.classId}: ${e}`);
            }
        }
    } catch (e) {
        result.errors.push(`RxNorm import failed: ${e}`);
    }

    result.duration_ms = Date.now() - start;
    return result;
}

// ============================================
// OPENFDA DRUG LABELS IMPORTER
// ============================================

async function importOpenFDALabels(supabase: any, limit: number = 100): Promise<ImportResult> {
    const start = Date.now();
    const result: ImportResult = {
        import_type: 'openfda_labels',
        imported_count: 0,
        skipped_count: 0,
        error_count: 0,
        errors: [],
        duration_ms: 0
    };

    try {
        // Fetch drug labels
        const url = `https://api.fda.gov/drug/label.json?limit=${limit}`;
        const res = await fetch(url);

        if (!res.ok) {
            result.errors.push(`OpenFDA API failed: ${res.status}`);
            return result;
        }

        const data = await res.json();

        for (const label of data.results || []) {
            try {
                const openfda = label.openfda || {};
                const brandName = openfda.brand_name?.[0];
                const genericName = openfda.generic_name?.[0];
                const rxcui = openfda.rxcui?.[0];
                const unii = openfda.unii?.[0];

                if (!genericName && !brandName) continue;

                // Insert/update molecule
                if (genericName) {
                    const { error: molError } = await supabase
                        .from('molecules')
                        .upsert({
                            name: genericName,
                            rxcui: rxcui || null,
                            unii: unii || null,
                            mechanism_of_action: label.mechanism_of_action?.[0]?.substring(0, 2000),
                            therapeutic_areas: openfda.pharm_class_epc || [],
                            source: 'openfda'
                        }, { onConflict: 'rxcui', ignoreDuplicates: true });

                    if (!molError) result.imported_count++;
                }

                // Insert active ingredients as substances
                const activeIngredients = label.active_ingredient || [];
                for (const ingredient of activeIngredients) {
                    const { error } = await supabase
                        .from('substances')
                        .insert({
                            name: ingredient.substring(0, 255),
                            substance_type: 'active_ingredient',
                            source: 'openfda'
                        }).select().single();

                    if (!error) result.imported_count++;
                }

                // Insert inactive ingredients (excipients)
                const inactiveIngredients = label.inactive_ingredient || [];
                for (const ingredient of inactiveIngredients) {
                    // Check for known allergens
                    const lowerIngredient = ingredient.toLowerCase();
                    const isAllergen = lowerIngredient.includes('lactose') ||
                        lowerIngredient.includes('gluten') ||
                        lowerIngredient.includes('peanut') ||
                        lowerIngredient.includes('soy') ||
                        lowerIngredient.includes('tartrazine');

                    const { error } = await supabase
                        .from('substances')
                        .insert({
                            name: ingredient.substring(0, 255),
                            substance_type: 'excipient',
                            is_allergen: isAllergen,
                            common_allergen_type: isAllergen ?
                                (lowerIngredient.includes('lactose') ? 'lactose' :
                                    lowerIngredient.includes('gluten') ? 'gluten' : 'other') : null,
                            source: 'openfda'
                        }).select().single();

                    if (!error) result.imported_count++;
                }

            } catch (e) {
                result.error_count++;
            }
        }
    } catch (e) {
        result.errors.push(`OpenFDA import failed: ${e}`);
    }

    result.duration_ms = Date.now() - start;
    return result;
}

// ============================================
// CLINICAL TRIALS IMPORTER
// ============================================

async function importClinicalTrials(supabase: any, query: string = 'cancer OR diabetes', limit: number = 50): Promise<ImportResult> {
    const start = Date.now();
    const result: ImportResult = {
        import_type: 'clinicaltrials',
        imported_count: 0,
        skipped_count: 0,
        error_count: 0,
        errors: [],
        duration_ms: 0
    };

    try {
        const url = `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(query)}&pageSize=${limit}&format=json`;
        const res = await fetch(url);

        if (!res.ok) {
            result.errors.push(`ClinicalTrials API failed: ${res.status}`);
            return result;
        }

        const data = await res.json();

        for (const study of data.studies || []) {
            try {
                const protocol = study.protocolSection;
                const id = protocol?.identificationModule;
                const status = protocol?.statusModule;
                const design = protocol?.designModule;
                const sponsor = protocol?.sponsorCollaboratorsModule;
                const eligibility = protocol?.eligibilityModule;
                const locations = protocol?.contactsLocationsModule;
                const arms = protocol?.armsInterventionsModule;

                const { error } = await supabase
                    .from('clinical_trials')
                    .upsert({
                        nct_id: id?.nctId,
                        title: id?.officialTitle || id?.briefTitle,
                        brief_summary: protocol?.descriptionModule?.briefSummary?.substring(0, 2000),
                        status: status?.overallStatus,
                        phase: design?.phases?.join(', '),
                        conditions: protocol?.conditionsModule?.conditions || [],
                        interventions: arms?.interventions || [],
                        enrollment: design?.enrollmentInfo?.count,
                        start_date: status?.startDateStruct?.date,
                        completion_date: status?.completionDateStruct?.date,
                        sponsor: sponsor?.leadSponsor?.name,
                        min_age: eligibility?.minimumAge,
                        max_age: eligibility?.maximumAge,
                        gender: eligibility?.sex,
                        locations: locations?.locations?.slice(0, 10) || [],
                        last_updated: study.lastUpdateSubmitDate
                    }, { onConflict: 'nct_id' });

                if (error) {
                    result.error_count++;
                    result.errors.push(`NCT ${id?.nctId}: ${error.message}`);
                } else {
                    result.imported_count++;
                }
            } catch (e) {
                result.error_count++;
            }
        }
    } catch (e) {
        result.errors.push(`ClinicalTrials import failed: ${e}`);
    }

    result.duration_ms = Date.now() - start;
    return result;
}

// ============================================
// MEDLINEPLUS IMPORTER (Foods & Alternatives)
// ============================================

async function importMedlinePlus(supabase: any, category: 'foods' | 'alternatives' = 'foods'): Promise<ImportResult> {
    const start = Date.now();
    const result: ImportResult = {
        import_type: `medlineplus_${category}`,
        imported_count: 0,
        skipped_count: 0,
        error_count: 0,
        errors: [],
        duration_ms: 0
    };

    try {
        // Use MedlinePlus Connect for health topics
        const topics = category === 'foods'
            ? ['food drug interactions', 'grapefruit', 'vitamin k', 'tyramine', 'caffeine']
            : ['herbal medicine', 'acupuncture', 'supplements', 'homeopathy', 'traditional medicine'];

        for (const topic of topics) {
            const url = `https://wsearch.nlm.nih.gov/ws/query?db=healthTopics&term=${encodeURIComponent(topic)}&retmax=10`;
            const res = await fetch(url);

            if (!res.ok) continue;

            const xmlText = await res.text();
            const documents = xmlText.split('</document>');

            for (const doc of documents) {
                const title = doc.match(/<content name="title">(.*?)<\/content>/)?.[1]?.replace(/<[^>]*>/g, '');
                const snippet = doc.match(/<content name="snippet">(.*?)<\/content>/)?.[1]?.replace(/<[^>]*>/g, '');

                if (!title) continue;

                if (category === 'foods') {
                    const { error } = await supabase
                        .from('foods')
                        .insert({
                            name: title.substring(0, 255),
                            clinical_considerations: snippet?.substring(0, 1000),
                            source: 'medlineplus'
                        }).select().single();

                    if (!error) result.imported_count++;
                } else {
                    const { error } = await supabase
                        .from('alternative_treatments')
                        .insert({
                            name: title.substring(0, 255),
                            treatment_type: 'herbal',
                            evidence_level: 'limited',
                            source: 'medlineplus'
                        }).select().single();

                    if (!error) result.imported_count++;
                }
            }
        }
    } catch (e) {
        result.errors.push(`MedlinePlus import failed: ${e}`);
    }

    result.duration_ms = Date.now() - start;
    return result;
}

// ============================================
// ALLERGENS IMPORTER
// ============================================

async function importAllergens(supabase: any): Promise<ImportResult> {
    const start = Date.now();
    const result: ImportResult = {
        import_type: 'allergens',
        imported_count: 0,
        skipped_count: 0,
        error_count: 0,
        errors: [],
        duration_ms: 0
    };

    // Known common allergens
    const allergens = [
        // Drug allergens
        { name: 'Pénicilline', category: 'drug', cross: ['Amoxicilline', 'Ampicilline'], severity: 'anaphylaxis', reactions: ['Urticaire', 'Anaphylaxie', 'Éruption cutanée'] },
        { name: 'Sulfamides', category: 'drug', cross: ['Sulfaméthoxazole'], severity: 'severe', reactions: ['Stevens-Johnson', 'Éruption cutanée'] },
        { name: 'AINS', category: 'drug', cross: ['Ibuprofène', 'Aspirine', 'Naproxène'], severity: 'moderate', reactions: ['Asthme', 'Urticaire'] },
        { name: 'Aspirine', category: 'drug', cross: ['AINS'], severity: 'moderate', reactions: ['Bronchospasme', 'Urticaire', 'Angiœdème'] },
        { name: 'Iode (produits de contraste)', category: 'drug', cross: [], severity: 'anaphylaxis', reactions: ['Anaphylaxie', 'Urticaire', 'Bronchospasme'] },
        { name: 'Anesthésiques locaux', category: 'drug', cross: ['Lidocaïne', 'Bupivacaïne'], severity: 'moderate', reactions: ['Réaction cutanée', 'Syncope'] },

        // Food allergens
        { name: 'Arachide', category: 'food', cross: ['Autres noix'], severity: 'anaphylaxis', reactions: ['Anaphylaxie', 'Urticaire', 'Angiœdème'] },
        { name: 'Fruits à coque', category: 'food', cross: ['Noix', 'Amandes', 'Noisettes'], severity: 'anaphylaxis', reactions: ['Anaphylaxie', 'Urticaire'] },
        { name: 'Lait de vache', category: 'food', cross: ['Lactose', 'Caséine'], severity: 'moderate', reactions: ['Diarrhée', 'Urticaire', 'Eczéma'] },
        { name: 'Œufs', category: 'food', cross: [], severity: 'moderate', reactions: ['Urticaire', 'Angiœdème', 'Symptômes digestifs'] },
        { name: 'Blé (gluten)', category: 'food', cross: ['Seigle', 'Orge'], severity: 'moderate', reactions: ['Maladie cœliaque', 'Urticaire'] },
        { name: 'Poisson', category: 'food', cross: ['Crustacés'], severity: 'anaphylaxis', reactions: ['Anaphylaxie', 'Urticaire'] },
        { name: 'Crustacés', category: 'food', cross: ['Crevettes', 'Homard', 'Crabe'], severity: 'anaphylaxis', reactions: ['Anaphylaxie', 'Urticaire'] },
        { name: 'Soja', category: 'food', cross: [], severity: 'moderate', reactions: ['Urticaire', 'Symptômes digestifs'] },
        { name: 'Sésame', category: 'food', cross: [], severity: 'severe', reactions: ['Anaphylaxie', 'Urticaire'] },

        // Excipient allergens
        { name: 'Lactose', category: 'excipient', cross: ['Lait'], severity: 'mild', reactions: ['Troubles digestifs'] },
        { name: 'Tartrazine (E102)', category: 'excipient', cross: ['Colorants azoïques'], severity: 'mild', reactions: ['Urticaire', 'Asthme'] },
        { name: 'Parabènes', category: 'excipient', cross: [], severity: 'mild', reactions: ['Dermatite de contact'] },
        { name: 'Sulfites', category: 'excipient', cross: [], severity: 'moderate', reactions: ['Bronchospasme', 'Urticaire'] },

        // Environmental
        { name: 'Latex', category: 'latex', cross: ['Banane', 'Avocat', 'Kiwi'], severity: 'anaphylaxis', reactions: ['Urticaire', 'Anaphylaxie'] },
        { name: 'Venin d\'abeille', category: 'insect', cross: ['Guêpe'], severity: 'anaphylaxis', reactions: ['Anaphylaxie', 'Œdème local'] },
        { name: 'Venin de guêpe', category: 'insect', cross: ['Abeille'], severity: 'anaphylaxis', reactions: ['Anaphylaxie', 'Œdème local'] }
    ];

    for (const allergen of allergens) {
        try {
            const { error } = await supabase
                .from('allergens')
                .insert({
                    name: allergen.name,
                    allergen_category: allergen.category,
                    cross_reactive_with: allergen.cross,
                    common_reactions: allergen.reactions,
                    severity_potential: allergen.severity,
                    source: 'manual'
                });

            if (error) {
                result.skipped_count++;
            } else {
                result.imported_count++;
            }
        } catch (e) {
            result.error_count++;
        }
    }

    result.duration_ms = Date.now() - start;
    return result;
}

// ============================================
// PUBMED IMPORTER
// ============================================

async function importPubMed(supabase: any, query: string, limit: number = 50): Promise<ImportResult> {
    const start = Date.now();
    const result: ImportResult = {
        import_type: 'pubmed',
        imported_count: 0,
        skipped_count: 0,
        error_count: 0,
        errors: [],
        duration_ms: 0
    };

    try {
        const ncbiApiKey = Deno.env.get("NCBI_API_KEY");
        let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${limit}&retmode=json&sort=relevance`;
        if (ncbiApiKey) searchUrl += `&api_key=${ncbiApiKey}`;

        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) {
            result.errors.push(`PubMed search failed: ${searchRes.status}`);
            return result;
        }

        const searchData = await searchRes.json();
        const ids = searchData?.esearchresult?.idlist || [];

        if (ids.length === 0) return result;

        let fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`;
        if (ncbiApiKey) fetchUrl += `&api_key=${ncbiApiKey}`;

        const fetchRes = await fetch(fetchUrl);
        const xmlText = await fetchRes.text();

        const articles = xmlText.split('</PubmedArticle>');

        for (const chunk of articles) {
            const pmid = chunk.match(/<PMID[^>]*>(.*?)<\/PMID>/)?.[1];
            const title = chunk.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/)?.[1];
            if (!pmid || !title) continue;

            const abstractMatches = [...chunk.matchAll(/<AbstractText[^>]*>(.*?)<\/AbstractText>/g)];
            const abstract = abstractMatches.map(m => m[1]).join(" ").substring(0, 4000);
            const journal = chunk.match(/<Title>(.*?)<\/Title>/)?.[1];
            const year = chunk.match(/<Year>(.*?)<\/Year>/)?.[1];
            const doi = chunk.match(/<ELocationID EIdType="doi"[^>]*>(.*?)<\/ELocationID>/)?.[1];
            const pmcid = chunk.match(/<ArticleId IdType="pmc">(.*?)<\/ArticleId>/)?.[1];
            const meshMatches = [...chunk.matchAll(/<DescriptorName[^>]*>(.*?)<\/DescriptorName>/g)];
            const mesh_terms = meshMatches.map(m => m[1]).slice(0, 20);
            const authorMatches = [...chunk.matchAll(/<LastName>(.*?)<\/LastName>.*?<Initials>(.*?)<\/Initials>/gs)];
            const authors = authorMatches.slice(0, 10).map(m => `${m[1]} ${m[2]}`).join(", ");

            const { error } = await supabase
                .from('pubmed_abstracts')
                .upsert({
                    pmid,
                    title: title.replace(/<[^>]*>/g, '').substring(0, 500),
                    authors,
                    journal,
                    publication_year: year ? parseInt(year) : null,
                    abstract,
                    doi,
                    pmc_id: pmcid,
                    mesh_terms,
                    search_queries: [query]
                }, { onConflict: 'pmid' });

            if (error) {
                result.error_count++;
            } else {
                result.imported_count++;
            }
        }
    } catch (e) {
        result.errors.push(`PubMed import failed: ${e}`);
    }

    result.duration_ms = Date.now() - start;
    return result;
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const request: ImportRequest = await req.json();

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const limit = request.limit || 100;
        const query = request.query || '';
        const results: ImportResult[] = [];

        switch (request.import_type) {
            case 'rxnorm_drugs':
                results.push(await importRxNormDrugs(supabase, limit));
                break;

            case 'openfda_labels':
                results.push(await importOpenFDALabels(supabase, limit));
                break;

            case 'clinicaltrials':
                results.push(await importClinicalTrials(supabase, query || 'cancer OR diabetes OR kidney', limit));
                break;

            case 'medlineplus':
                results.push(await importMedlinePlus(supabase, 'foods'));
                results.push(await importMedlinePlus(supabase, 'alternatives'));
                break;

            case 'allergens':
                results.push(await importAllergens(supabase));
                break;

            case 'pubmed':
                results.push(await importPubMed(supabase, query || 'drug interactions systematic review', limit));
                break;

            case 'all':
                results.push(await importAllergens(supabase));
                results.push(await importRxNormDrugs(supabase, 50));
                results.push(await importOpenFDALabels(supabase, 50));
                results.push(await importClinicalTrials(supabase, 'kidney OR liver OR heart', 30));
                results.push(await importMedlinePlus(supabase, 'foods'));
                results.push(await importMedlinePlus(supabase, 'alternatives'));
                results.push(await importPubMed(supabase, 'drug interactions', 30));
                break;

            default:
                return new Response(
                    JSON.stringify({ error: `Unknown import_type: ${request.import_type}` }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
        }

        const totalImported = results.reduce((sum, r) => sum + r.imported_count, 0);
        const totalErrors = results.reduce((sum, r) => sum + r.error_count, 0);
        const totalDuration = results.reduce((sum, r) => sum + r.duration_ms, 0);

        return new Response(JSON.stringify({
            success: true,
            import_type: request.import_type,
            results,
            summary: {
                total_imported: totalImported,
                total_errors: totalErrors,
                total_duration_ms: totalDuration
            }
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error("Data import error:", error);
        return new Response(
            JSON.stringify({ error: "Data import failed", details: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
