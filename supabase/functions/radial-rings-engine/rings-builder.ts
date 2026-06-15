// ============================================
// RADIAL RINGS ENGINE - RINGS BUILDER
// ============================================
// Construit les anneaux concentriques avec données multi-sources

import {
    RingNode, RingLevel, RingLane, EvidenceGrade,
    RadialRingsRequest, RING_LANE_CONFIG
} from './types.ts';

// ============================================
// API INTEGRATIONS (simplified imports)
// ============================================

interface DrugInfo {
    name: string;
    mechanism?: string;
    indications?: string;
    atc_code?: string;
}

interface SymptomInfo {
    name: string;
    description?: string;
    body_system?: string;
}

interface BiomarkerInfo {
    name: string;
    unit: string;
    reference_range?: { min: number; max: number };
    organ: string;
}

// ============================================
// RING 0: PATHOLOGY CENTER
// ============================================

export async function buildRing0(
    request: RadialRingsRequest,
    supabase: any
): Promise<RingNode[]> {
    const nodes: RingNode[] = [];

    // Main pathology node
    const { data: pathology } = await supabase
        .from('pathologies')
        .select('*')
        .or(`name.ilike.%${request.pathology}%,name_fr.ilike.%${request.pathology}%`)
        .limit(1)
        .single();

    nodes.push({
        id: `R0_${pathology?.id || 'main'}`,
        ring: 0,
        lane: 'pathology',
        name: pathology?.name || request.pathology,
        properties: {
            icd_code: pathology?.icd_code,
            description: pathology?.description,
            subtypes: request.subtypes || [],
            is_primary: true
        },
        proximity_score: 1.0,
        evidence_grade: 'A',
        translation_gap: false,
        sources: []
    });

    // Add subtypes as separate nodes if provided
    for (const subtype of (request.subtypes || [])) {
        nodes.push({
            id: `R0_subtype_${subtype}`,
            ring: 0,
            lane: 'pathology',
            name: subtype,
            properties: { parent: request.pathology },
            proximity_score: 0.95,
            evidence_grade: 'A',
            translation_gap: false,
            sources: []
        });
    }

    // =============================================
    // COMORBIDITIES: Add each as a Ring-0 node
    // =============================================
    const comorbidities = request.context?.comorbidities || [];
    for (const comorbidity of comorbidities) {
        // Try to find in database
        const { data: comorbData } = await supabase
            .from('pathologies')
            .select('*')
            .or(`name.ilike.%${comorbidity}%,name_fr.ilike.%${comorbidity}%`)
            .limit(1)
            .single();

        const nodeId = `R0_comorbidity_${(comorbData?.id || comorbidity).toString().replace(/\s+/g, '_')}`;

        // Only add if not duplicate of main pathology
        if (!nodes.some(n => n.name.toLowerCase() === (comorbData?.name || comorbidity).toLowerCase())) {
            nodes.push({
                id: nodeId,
                ring: 0,
                lane: 'pathology',
                name: comorbData?.name || comorbidity,
                properties: {
                    icd_code: comorbData?.icd_code,
                    description: comorbData?.description,
                    is_comorbidity: true
                },
                proximity_score: 0.95,
                evidence_grade: 'A',
                translation_gap: false,
                sources: []
            });
        }
    }

    console.log(`[RING 0] Built ${nodes.length} pathology nodes (main + ${comorbidities.length} comorbidities)`);
    return nodes;
}

// ============================================
// RING 1: TREATMENTS, SYMPTOMS, BIOMARKERS
// ============================================

export async function buildRing1(
    request: RadialRingsRequest,
    supabase: any
): Promise<RingNode[]> {
    const nodes: RingNode[] = [];
    const pathologyName = request.pathology;

    // 1A. DRUGS - Current treatments
    console.log('[RING 1] Fetching treatments...');

    // From context
    if (request.context?.current_treatments) {
        for (const drug of request.context.current_treatments) {
            nodes.push({
                id: `R1_drug_${drug.replace(/\s+/g, '_')}`,
                ring: 1,
                lane: 'drugs',
                name: drug,
                properties: { source: 'context' },
                proximity_score: 0.9,
                evidence_grade: 'A',
                translation_gap: false,
                sources: []
            });
        }
    }

    // From database
    const { data: treatments } = await supabase
        .from('treatments')
        .select('*, pathologies(name)')
        .ilike('pathologies.name', `%${pathologyName}%`)
        .limit(15);

    for (const t of (treatments || [])) {
        if (!nodes.some(n => n.name.toLowerCase() === t.name.toLowerCase())) {
            nodes.push({
                id: `R1_drug_${t.id}`,
                ring: 1,
                lane: 'drugs',
                name: t.name,
                properties: { type: t.type, description: t.description },
                proximity_score: 0.85,
                evidence_grade: 'B',
                translation_gap: false,
                sources: []
            });
        }
    }

    // 1B. SYMPTOMS
    console.log('[RING 1] Fetching symptoms...');
    const { data: symptoms } = await supabase
        .from('pathology_symptoms')
        .select('*, symptoms(name, description, body_system), pathologies(name)')
        .ilike('pathologies.name', `%${pathologyName}%`)
        .limit(20);

    for (const ps of (symptoms || [])) {
        if (ps.symptoms) {
            nodes.push({
                id: `R1_symptom_${ps.symptoms.id || ps.symptom_id}`,
                ring: 1,
                lane: 'symptoms',
                name: ps.symptoms.name,
                properties: {
                    body_system: ps.symptoms.body_system,
                    is_primary: ps.is_primary,
                    frequency: ps.frequency_percent
                },
                proximity_score: ps.is_primary ? 0.9 : 0.75,
                evidence_grade: 'A',
                translation_gap: false,
                sources: []
            });
        }
    }

    // 1C. BIOMARKERS
    console.log('[RING 1] Adding biomarkers...');
    const kidneyBiomarkers = [
        { name: 'Protéinurie', unit: 'g/24h', organ: 'rein' },
        { name: 'UPCR', unit: 'mg/mmol', organ: 'rein' },
        { name: 'Albuminémie', unit: 'g/L', organ: 'rein' },
        { name: 'Créatinine', unit: 'µmol/L', organ: 'rein' },
        { name: 'DFG', unit: 'mL/min', organ: 'rein' },
        { name: 'Cholestérol total', unit: 'mmol/L', organ: 'métabolisme' }
    ];

    for (const bm of kidneyBiomarkers) {
        nodes.push({
            id: `R1_biomarker_${bm.name.replace(/\s+/g, '_')}`,
            ring: 1,
            lane: 'biomarkers',
            name: bm.name,
            properties: { unit: bm.unit, organ: bm.organ },
            proximity_score: 0.85,
            evidence_grade: 'A',
            translation_gap: false,
            sources: []
        });
    }

    // Add lab results from context
    if (request.context?.lab_results) {
        for (const [param, value] of Object.entries(request.context.lab_results)) {
            if (!nodes.some(n => n.name.toLowerCase() === param.toLowerCase())) {
                nodes.push({
                    id: `R1_biomarker_${param.replace(/\s+/g, '_')}`,
                    ring: 1,
                    lane: 'biomarkers',
                    name: param,
                    properties: { value, source: 'context' },
                    proximity_score: 0.8,
                    evidence_grade: 'A',
                    translation_gap: false,
                    sources: []
                });
            }
        }
    }

    return nodes;
}

// ============================================
// RING 2: ADVERSE EVENTS, MECHANISMS, INTERACTIONS
// ============================================

export async function buildRing2(
    ring1Drugs: RingNode[],
    supabase: any
): Promise<RingNode[]> {
    const nodes: RingNode[] = [];

    console.log('[RING 2] Fetching adverse events, mechanisms, interactions...');

    for (const drugNode of ring1Drugs.filter(n => n.lane === 'drugs')) {
        const drugName = drugNode.name;

        // 2A. ADVERSE EVENTS (OpenFDA)
        try {
            const fdaUrl = `https://api.fda.gov/drug/event.json?search=patient.drug.medicinalproduct:"${encodeURIComponent(drugName)}"&count=patient.reaction.reactionmeddrapt.exact&limit=10`;
            const fdaRes = await fetch(fdaUrl);

            if (fdaRes.ok) {
                const fdaData = await fdaRes.json();
                for (const result of (fdaData.results || []).slice(0, 5)) {
                    const aeName = result.term;
                    const nodeId = `R2_ae_${drugName}_${aeName}`.replace(/\s+/g, '_').substring(0, 100);

                    if (!nodes.some(n => n.id === nodeId)) {
                        nodes.push({
                            id: nodeId,
                            ring: 2,
                            lane: 'adverse_events',
                            name: aeName,
                            properties: {
                                drug: drugName,
                                count: result.count,
                                source: 'OpenFDA FAERS'
                            },
                            proximity_score: Math.min(0.7 + (result.count / 10000), 0.9),
                            evidence_grade: 'B',
                            translation_gap: false,
                            sources: ['OpenFDA']
                        });
                    }
                }
            }
        } catch (e) {
            console.error(`FDA fetch error for ${drugName}:`, e);
        }

        // 2B. DRUG INTERACTIONS (local DB)
        const { data: interactions } = await supabase
            .from('drug_interactions')
            .select('*')
            .or(`interacting_drug.ilike.%${drugName}%`)
            .limit(10);

        for (const inter of (interactions || [])) {
            nodes.push({
                id: `R2_interaction_${inter.id}`,
                ring: 2,
                lane: 'interactions',
                name: `${drugName} ↔ ${inter.interacting_drug}`,
                properties: {
                    severity: inter.severity,
                    mechanism: inter.mechanism,
                    description: inter.description
                },
                proximity_score: inter.severity === 'major' ? 0.9 : 0.7,
                evidence_grade: 'B',
                translation_gap: false,
                sources: []
            });
        }

        // Rate limiting
        await new Promise(r => setTimeout(r, 100));
    }

    // 2C. MECHANISMS (from medications table)
    const { data: meds } = await supabase
        .from('medications')
        .select('id, name, mechanism')
        .in('name', ring1Drugs.filter(n => n.lane === 'drugs').map(n => n.name))
        .limit(20);

    for (const med of (meds || [])) {
        if (med.mechanism) {
            nodes.push({
                id: `R2_mechanism_${med.id}`,
                ring: 2,
                lane: 'mechanisms',
                name: `Mécanisme: ${med.name}`,
                properties: {
                    drug: med.name,
                    mechanism: med.mechanism
                },
                proximity_score: 0.75,
                evidence_grade: 'A',
                translation_gap: false,
                sources: []
            });
        }
    }

    return nodes;
}

// ============================================
// RING 3: TRIGGERS, GENETICS, EXPOSURES
// ============================================

export async function buildRing3(
    request: RadialRingsRequest,
    supabase: any
): Promise<RingNode[]> {
    const nodes: RingNode[] = [];

    console.log('[RING 3] Building etiology ring...');

    // 3A. KNOWN TRIGGERS
    const triggers = [
        { name: 'Infection virale ORL', evidence: 'A' },
        { name: 'Allergie/atopie', evidence: 'B' },
        { name: 'Vaccination récente', evidence: 'C' },
        { name: 'Stress physiologique', evidence: 'C' }
    ];

    for (const trigger of triggers) {
        nodes.push({
            id: `R3_trigger_${trigger.name.replace(/\s+/g, '_')}`,
            ring: 3,
            lane: 'triggers',
            name: trigger.name,
            properties: {},
            proximity_score: trigger.evidence === 'A' ? 0.7 : 0.5,
            evidence_grade: trigger.evidence as EvidenceGrade,
            translation_gap: false,
            sources: []
        });
    }

    // 3B. GENETIC FACTORS (for nephrotic syndrome)
    const genes = [
        { name: 'NPHS1', role: 'Nephrin - filtration barrier', evidence: 'A' as EvidenceGrade },
        { name: 'NPHS2', role: 'Podocin - podocyte structure', evidence: 'A' as EvidenceGrade },
        { name: 'WT1', role: 'Wilms tumor 1 - development', evidence: 'A' as EvidenceGrade },
        { name: 'PLCE1', role: 'Phospholipase C epsilon', evidence: 'B' as EvidenceGrade },
        { name: 'CD2AP', role: 'Cytoskeleton-slit diaphragm', evidence: 'B' as EvidenceGrade }
    ];

    for (const gene of genes) {
        nodes.push({
            id: `R3_gene_${gene.name}`,
            ring: 3,
            lane: 'genetics',
            name: gene.name,
            properties: { role: gene.role },
            proximity_score: gene.evidence === 'A' ? 0.65 : 0.5,
            evidence_grade: gene.evidence,
            translation_gap: false,
            sources: ['OMIM', 'KDIGO Guidelines']
        });
    }

    // 3C. PARENTAL EXPOSURES (from context)
    if (request.context?.exposures) {
        for (const exposure of request.context.exposures) {
            nodes.push({
                id: `R3_exposure_${exposure.name.replace(/\s+/g, '_')}`,
                ring: 3,
                lane: 'exposures',
                name: exposure.name,
                properties: {
                    agent: exposure.agent,
                    timing: exposure.timing,
                    person: exposure.person,
                    mechanism_candidates: [
                        'Sperm DNA methylation alteration',
                        'Histone modification',
                        'ncRNA expression changes',
                        'Germline epigenetic reprogramming'
                    ]
                },
                proximity_score: 0.3,  // Weak evidence initially
                evidence_grade: 'D',   // Preclinical only
                translation_gap: true, // No human proof
                sources: ['PMC5568460']
            });
        }
    }

    return nodes;
}

// ============================================
// RING 4: FRONTIER THERAPIES
// ============================================

export async function buildRing4(
    request: RadialRingsRequest
): Promise<RingNode[]> {
    const nodes: RingNode[] = [];

    console.log('[RING 4] Fetching frontier therapies...');

    try {
        // ClinicalTrials.gov - experimental therapies
        const ctUrl = `https://clinicaltrials.gov/api/v2/studies?query.cond=${encodeURIComponent(request.pathology)}&filter.overallStatus=RECRUITING,NOT_YET_RECRUITING&pageSize=10&format=json`;
        const ctRes = await fetch(ctUrl);

        if (ctRes.ok) {
            const ctData = await ctRes.json();
            for (const study of (ctData.studies || [])) {
                const p = study.protocolSection;
                const interventions = p?.armsInterventionsModule?.interventions || [];

                for (const interv of interventions.slice(0, 2)) {
                    nodes.push({
                        id: `R4_frontier_${p?.identificationModule?.nctId}_${interv.name}`.substring(0, 100),
                        ring: 4,
                        lane: 'frontiers',
                        name: interv.name,
                        properties: {
                            nct_id: p?.identificationModule?.nctId,
                            phase: p?.designModule?.phases?.join(', '),
                            status: p?.statusModule?.overallStatus,
                            type: interv.type
                        },
                        proximity_score: 0.3,
                        evidence_grade: 'D',
                        translation_gap: true,
                        sources: [p?.identificationModule?.nctId]
                    });
                }
            }
        }
    } catch (e) {
        console.error('ClinicalTrials fetch error:', e);
    }

    // Add RNA/gene therapy concepts
    const frontierConcepts = [
        { name: 'Antisense oligonucleotides targeting podocyte genes', type: 'RNA therapy' },
        { name: 'CRISPR correction of NPHS2 mutations', type: 'Gene editing' },
        { name: 'Podocyte-targeted nanoparticle delivery', type: 'Drug delivery' }
    ];

    for (const concept of frontierConcepts) {
        nodes.push({
            id: `R4_concept_${concept.name.replace(/\s+/g, '_').substring(0, 50)}`,
            ring: 4,
            lane: 'frontiers',
            name: concept.name,
            properties: { type: concept.type, speculative: true },
            proximity_score: 0.2,
            evidence_grade: 'D',
            translation_gap: true,
            sources: []
        });
    }

    return nodes;
}

// ============================================
// MAIN BUILD FUNCTION
// ============================================

export async function buildAllRings(
    request: RadialRingsRequest,
    supabase: any
): Promise<RingNode[]> {
    const allNodes: RingNode[] = [];

    // Build Ring 0 (Central node - pathology)
    const ring0 = await buildRing0(request, supabase);
    allNodes.push(...ring0);
    console.log(`[RINGS] Ring 0: ${ring0.length} nodes`);

    // Build Ring 1 (First circle - all related elements)
    const ring1 = await buildRing1Complete(request, supabase);
    allNodes.push(...ring1);
    console.log(`[RINGS] Ring 1: ${ring1.length} nodes`);

    // SIMPLIFIED: Only 2 rings (0 and 1)
    // Ring 2, 3, 4 are no longer generated
    // Dynamic navigation: clicking Ring 1 node re-centers the graph

    console.log(`[RINGS] Total: ${allNodes.length} nodes across 2 rings`);
    return allNodes;
}

// ============================================
// RING 1 COMPLETE: ALL ELEMENTS IN FIRST CIRCLE
// Symptoms, Treatments, Medications, Side Effects, Interactions
// ============================================

async function buildRing1Complete(
    request: RadialRingsRequest,
    supabase: any
): Promise<RingNode[]> {
    const nodes: RingNode[] = [];

    // Get ALL pathologies to process (main + comorbidities)
    const allPathologies = [request.pathology, ...(request.context?.comorbidities || [])];
    console.log(`[RING 1] Processing ${allPathologies.length} pathologies:`, allPathologies);

    // 1. TREATMENTS / MEDICATIONS
    console.log('[RING 1] Fetching treatments/medications...');

    // From context
    if (request.context?.current_treatments) {
        for (const drug of request.context.current_treatments) {
            nodes.push({
                id: `R1_drug_${drug.replace(/\s+/g, '_')}`,
                ring: 1,
                lane: 'drugs',
                name: drug,
                properties: { source: 'context' },
                proximity_score: 0.9,
                evidence_grade: 'A',
                translation_gap: false,
                sources: []
            });
        }
    }

    // From treatments table - for each pathology
    for (const pathologyName of allPathologies) {
        const { data: treatments } = await supabase
            .from('treatments')
            .select('*, pathologies(name)')
            .ilike('pathologies.name', `%${pathologyName}%`)
            .limit(15);

        for (const t of (treatments || [])) {
            if (!nodes.some(n => n.name.toLowerCase() === t.name.toLowerCase())) {
                nodes.push({
                    id: `R1_drug_${t.id}`,
                    ring: 1,
                    lane: 'drugs',
                    name: t.name,
                    properties: { type: t.type, description: t.description, linked_pathology: pathologyName },
                    proximity_score: 0.85,
                    evidence_grade: 'B',
                    translation_gap: false,
                    sources: []
                });
            }
        }
    }

    // From medications table
    const { data: meds } = await supabase
        .from('medications')
        .select('id, name, mechanism, atc_code')
        .limit(20);

    for (const med of (meds || []).slice(0, 10)) {
        if (!nodes.some(n => n.name.toLowerCase() === med.name.toLowerCase())) {
            nodes.push({
                id: `R1_med_${med.id}`,
                ring: 1,
                lane: 'drugs',
                name: med.name,
                properties: { mechanism: med.mechanism, atc_code: med.atc_code },
                proximity_score: 0.8,
                evidence_grade: 'B',
                translation_gap: false,
                sources: []
            });
        }
    }

    // 2. SYMPTOMS - for each pathology
    console.log('[RING 1] Fetching symptoms...');
    for (const pathologyName of allPathologies) {
        const { data: symptoms } = await supabase
            .from('pathology_symptoms')
            .select('*, symptoms(id, name, description, body_system), pathologies(name)')
            .ilike('pathologies.name', `%${pathologyName}%`)
            .limit(20);

        for (const ps of (symptoms || [])) {
            if (ps.symptoms && !nodes.some(n => n.id === `R1_symptom_${ps.symptoms.id || ps.symptom_id}`)) {
                nodes.push({
                    id: `R1_symptom_${ps.symptoms.id || ps.symptom_id}`,
                    ring: 1,
                    lane: 'symptoms',
                    name: ps.symptoms.name,
                    properties: {
                        body_system: ps.symptoms.body_system,
                        is_primary: ps.is_primary,
                        frequency: ps.frequency_percent,
                        linked_pathology: pathologyName
                    },
                    proximity_score: ps.is_primary ? 0.9 : 0.75,
                    evidence_grade: 'A',
                    translation_gap: false,
                    sources: []
                });
            }
        }
    }

    // 3. SIDE EFFECTS
    console.log('[RING 1] Fetching side effects...');
    const { data: sideEffects } = await supabase
        .from('side_effects')
        .select('id, name, severity, frequency')
        .limit(15);

    for (const se of (sideEffects || [])) {
        nodes.push({
            id: `R1_side_effect_${se.id}`,
            ring: 1,
            lane: 'adverse_events',
            name: se.name,
            properties: {
                severity: se.severity,
                frequency: se.frequency
            },
            proximity_score: se.severity === 'severe' ? 0.9 : 0.7,
            evidence_grade: 'B',
            translation_gap: false,
            sources: []
        });
    }

    // 4. DRUG INTERACTIONS
    console.log('[RING 1] Fetching interactions...');
    const drugNames = nodes.filter(n => n.lane === 'drugs').map(n => n.name);

    for (const drugName of drugNames.slice(0, 5)) { // Limit to avoid overload
        const { data: interactions } = await supabase
            .from('drug_interactions')
            .select('*')
            .or(`interacting_drug.ilike.%${drugName}%`)
            .limit(5);

        for (const inter of (interactions || [])) {
            const nodeId = `R1_interaction_${inter.id}`;
            if (!nodes.some(n => n.id === nodeId)) {
                nodes.push({
                    id: nodeId,
                    ring: 1,
                    lane: 'interactions',
                    name: `${drugName} ↔ ${inter.interacting_drug}`,
                    properties: {
                        severity: inter.severity,
                        mechanism: inter.mechanism,
                        description: inter.description
                    },
                    proximity_score: inter.severity === 'major' ? 0.9 : 0.7,
                    evidence_grade: 'B',
                    translation_gap: false,
                    sources: []
                });
            }
        }
    }

    // 5. BIOMARKERS (keep a few key ones)
    console.log('[RING 1] Adding key biomarkers...');
    const keyBiomarkers = [
        { name: 'Créatinine', unit: 'µmol/L', organ: 'rein' },
        { name: 'DFG', unit: 'mL/min', organ: 'rein' },
        { name: 'Glycémie', unit: 'mmol/L', organ: 'métabolisme' }
    ];

    for (const bm of keyBiomarkers) {
        nodes.push({
            id: `R1_biomarker_${bm.name.replace(/\s+/g, '_')}`,
            ring: 1,
            lane: 'biomarkers',
            name: bm.name,
            properties: { unit: bm.unit, organ: bm.organ },
            proximity_score: 0.8,
            evidence_grade: 'A',
            translation_gap: false,
            sources: []
        });
    }

    console.log(`[RING 1] Total: ${nodes.length} nodes in first circle`);
    return nodes;
}

