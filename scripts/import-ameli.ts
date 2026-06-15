
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL; // Try both
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY; // Need service role for bulk ops

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing Supabase credentials under VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const AMELI_API_URL = 'https://data.ameli.fr/api/explore/v2.1/catalog/datasets/comorbidites/exports/json';

async function fetchAmeliData() {
    console.log('Fetching data from Ameli...');
    try {
        const response = await fetch(AMELI_API_URL);
        if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
        const data = await response.json();
        console.log(`Fetched ${data.length} records.`);
        return data;
    } catch (error) {
        console.error('Error fetching Ameli data:', error);
        return [];
    }
}

async function importData() {
    const records = await fetchAmeliData();
    if (records.length === 0) return;

    console.log('Processing data...');

    const uniquePathologies = new Map<string, any>(); // key: name (lowercase) -> { name, level }
    const relationships: { source: string, target: string, weight: number }[] = [];

    // 1. Extract Unique Pathologies and Relationships
    for (const record of records) {
        // Main Pathology
        const p3 = record.patho_niv3;
        const p2 = record.patho_niv2;
        const p1 = record.patho_niv1;

        // Prefer level 3 (most specific), then 2, then 1
        let mainName = p3 || p2 || p1;
        if (mainName) {
            mainName = mainName.trim();
            if (!uniquePathologies.has(mainName.toLowerCase())) {
                uniquePathologies.set(mainName.toLowerCase(), { name: mainName, type: 'pathology' });
            }
        }

        // Comorbidity
        let comorbName = record.libelle_comorbidite || record.patho_niv3_comorb || record.patho_niv2_comorb || record.patho_niv1_comorb;
        if (comorbName) {
            comorbName = comorbName.trim();

            // Clean up: Ameli sometimes has "Pas de comorbidité" or similar? Check data quality.
            if (comorbName.toLowerCase() !== 'pas de comorbidité' && comorbName.toLowerCase() !== 'aucune') {
                if (!uniquePathologies.has(comorbName.toLowerCase())) {
                    uniquePathologies.set(comorbName.toLowerCase(), { name: comorbName, type: 'pathology' });
                }

                if (mainName && comorbName && mainName !== comorbName) {
                    relationships.push({
                        source: mainName,
                        target: comorbName,
                        weight: record.proportion_comorb || 0
                    });
                }
            }
        }
    }

    console.log(`Found ${uniquePathologies.size} unique pathologies.`);
    console.log(`Found ${relationships.length} comorbidity relationships.`);

    // 2. Clear Tables (Optional - Requested "Refaire nos tables")
    // Use with CAUTION. Assuming user wants a clean slate for these specific tables?
    // Let's NOT truncate entire tables as that breaks foreign keys.
    // Instead we will UPSERT.

    // 3. Upsert Pathologies into 'pathologies' table AND 'cde_nodes' (for graph)
    // We strictly need them in 'pathologies' for the app logic, but 'cde_nodes' for the graph.
    // Let's put them in 'pathologies' first.

    const pathologyList = Array.from(uniquePathologies.values());

    const BATCH_SIZE = 100;

    // Helper to fetch all records
    async function fetchAll(table: string, select = 'id, name', filter: any = {}) {
        let allData: any[] = [];
        let page = 0;
        const PAGE_SIZE = 1000;

        while (true) {
            let query = supabase.from(table).select(select).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
            if (filter.node_type) query = query.eq('node_type', filter.node_type);

            const { data, error } = await query;
            if (error) {
                console.error(`Error fetching ${table}:`, error);
                break;
            }
            if (!data || data.length === 0) break;

            allData = [...allData, ...data];
            if (data.length < PAGE_SIZE) break;
            page++;
        }
        return allData;
    }

    // 3. Process Pathologies (Select + Insert)
    console.log(`Processing ${pathologyList.length} pathologies...`);

    // Fetch all existing pathologies
    const nameToIdMap = new Map<string, string>();
    const existingPathologies = await fetchAll('pathologies');

    if (existingPathologies) {
        existingPathologies.forEach(p => nameToIdMap.set(p.name.toLowerCase().trim(), p.id));
    }

    const newPathologies = pathologyList.filter(p => !nameToIdMap.has(p.name.toLowerCase().trim()));

    if (newPathologies.length > 0) {
        console.log(`Inserting ${newPathologies.length} new pathologies...`);
        for (let i = 0; i < newPathologies.length; i += BATCH_SIZE) {
            const batch = newPathologies.slice(i, i + BATCH_SIZE);
            const { data, error } = await supabase
                .from('pathologies')
                .insert(
                    batch.map(p => ({
                        name: p.name,
                        description: 'Source: Ameli Open Data'
                    }))
                )
                .select('id, name');

            if (error) {
                console.error('Error inserting pathologies:', error);
            } else if (data) {
                data.forEach(d => nameToIdMap.set(d.name.toLowerCase().trim(), d.id));
            }
        }
    } else {
        console.log('No new pathologies to insert.');
    }

    // 4. Sync Knowledge Graph Nodes (Select + Insert)
    console.log('Syncing Knowledge Graph Nodes...');
    const nodeNameToId = new Map<string, string>();

    // Fetch all existing nodes
    const existingNodes = await fetchAll('cde_nodes', 'id, name', { node_type: 'pathology' });

    if (existingNodes) {
        existingNodes.forEach(n => nodeNameToId.set(n.name.toLowerCase().trim(), n.id));
    }

    const newNodes = pathologyList.filter(p => !nodeNameToId.has(p.name.toLowerCase().trim()));

    if (newNodes.length > 0) {
        console.log(`Inserting ${newNodes.length} new nodes...`);
        for (let i = 0; i < newNodes.length; i += BATCH_SIZE) {
            const batch = newNodes.slice(i, i + BATCH_SIZE);
            const { data, error } = await supabase
                .from('cde_nodes')
                .insert(
                    batch.map(p => ({
                        name: p.name,
                        node_type: 'pathology',
                        properties: { source: 'ameli' }
                    }))
                )
                .select('id, name');

            if (error) {
                console.error("Error inserting nodes:", error);
            } else if (data) {
                data.forEach(n => nodeNameToId.set(n.name.toLowerCase().trim(), n.id));
            }
        }
    }

    // 5. Create Edges
    // Now we have IDs for 'pathologies' (nameToIdMap) and 'cde_nodes' (nodeNameToId).
    // The relationships map names. We want to insert into 'cde_edges' so we use nodeNameToId.

    const edgesToInsert: any[] = [];
    const seenEdges = new Set<string>();

    relationships.forEach(rel => {
        const sourceId = nodeNameToId.get(rel.source.toLowerCase());
        const targetId = nodeNameToId.get(rel.target.toLowerCase());

        if (sourceId && targetId && sourceId !== targetId) {
            const edgeKey = `${sourceId}-${targetId}`;
            if (!seenEdges.has(edgeKey)) {
                edgesToInsert.push({
                    source_node_id: sourceId,
                    target_node_id: targetId,
                    relationship_type: 'COMORBIDITY',
                    confidence_score: rel.weight > 0 ? rel.weight / 100 : 0.5,
                    provenance: 'ameli_open_data',
                    context: { weight: rel.weight }
                });
                seenEdges.add(edgeKey);
            }
        }
    });

    console.log(`Preparing to insert ${edgesToInsert.length} edges...`);

    // Check existing edges to avoid duplicates if possible?
    // Hard to check 40k edges efficiently without unique constraint or specific query.
    // We will just INSERT. If duplicates exist, we might get duplicates in DB.
    // Ideally we fetch existing edges and filter.

    // Fetch existing comorbidity edges
    console.log('Fetching existing edges to dedup...');
    const { data: existingEdges } = await supabase
        .from('cde_edges')
        .select('source_node_id, target_node_id')
        .eq('relationship_type', 'COMORBIDITY');

    const existingEdgeSet = new Set<string>();
    if (existingEdges) {
        existingEdges.forEach(e => existingEdgeSet.add(`${e.source_node_id}-${e.target_node_id}`));
    }

    const uniqueNewEdges = edgesToInsert.filter(e => !existingEdgeSet.has(`${e.source_node_id}-${e.target_node_id}`));
    console.log(`Filtered down to ${uniqueNewEdges.length} new edges.`);

    // Batch insert edges
    for (let i = 0; i < uniqueNewEdges.length; i += BATCH_SIZE) {
        const batch = uniqueNewEdges.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
            .from('cde_edges')
            .insert(batch);

        if (error) console.error('Error inserting edges batch:', error);
    }

    console.log('Import completed!');
}


importData().catch(console.error);
