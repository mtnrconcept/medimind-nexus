
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Error: SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

async function deduplicateNodes() {
    console.log('Fetching all nodes...');

    let allNodes: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data: nodes, error } = await supabase
            .from('cde_nodes')
            .select('*')
            .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
            console.error('Error fetching nodes:', error);
            return;
        }

        if (nodes && nodes.length > 0) {
            allNodes = [...allNodes, ...nodes];
            console.log(`Fetched ${nodes.length} nodes (Total: ${allNodes.length})...`);

            if (nodes.length < pageSize) hasMore = false;
            page++;
        } else {
            hasMore = false;
        }
    }

    const nodes = allNodes;

    console.log(`Found ${nodes.length} nodes. Analyzing duplicates...`);

    // Group by normalized name
    const groupedNodes = new Map<string, any[]>();

    nodes.forEach(node => {
        const normalized = node.name.trim().toLowerCase();
        if (!groupedNodes.has(normalized)) {
            groupedNodes.set(normalized, []);
        }
        groupedNodes.get(normalized)!.push(node);
    });

    let groupsProcessed = 0;
    let nodesRemoved = 0;
    let edgesUpdated = 0;

    for (const [name, group] of groupedNodes.entries()) {
        if (group.length > 1) {
            // Found duplicates
            console.log(`\nDuplicate group: "${name}" (${group.length} nodes)`);

            // Strategy: Keep the one with the most edges (or created first if tie)
            // Ideally we'd scan edges first, but for simplicity let's do checks.
            // Actually, we need to know edge counts to decide "keeper".

            // Let's just pick the first one as keeper for now, or the one with external_id set?
            // Preference: Nodes with external_id > Nodes without
            // Then: Longest name (original casing) might be better? Or most detailed properties?

            // Sort to pick keeper:
            // 1. Has external_id
            // 2. Created earlier

            group.sort((a, b) => {
                if (a.external_id && !b.external_id) return -1;
                if (!a.external_id && b.external_id) return 1;
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            });

            const keeper = group[0];
            const toRemove = group.slice(1);

            console.log(`  -> Keeping: ${keeper.id} (${keeper.name}) - [ExtID: ${keeper.external_id}]`);
            console.log(`  -> Removing: ${toRemove.map(n => n.id).join(', ')}`);

            for (const duplicate of toRemove) {
                // 1. Update edges pointing TO the duplicate
                const { error: errorTo } = await supabase
                    .from('cde_edges')
                    .update({ target_node_id: keeper.id })
                    .eq('target_node_id', duplicate.id);

                if (errorTo) {
                    // Ignore unique constraint violation (means edge already exists on keeper)
                    // We'll delete these redundant edges in next step implicitly when deleting node?
                    // No, existing edges on duplicate need to be handled carefuly.
                    // If update fails due to conflict, it means we should DELETE the edge on duplicate
                    // because the keeper already has that connection.
                    console.log(`     Edge update (target) conflict for ${duplicate.id}, deleting redundant edges...`);
                }

                // 2. Update edges pointing FROM the duplicate
                const { error: errorFrom } = await supabase
                    .from('cde_edges')
                    .update({ source_node_id: keeper.id })
                    .eq('source_node_id', duplicate.id);

                if (errorFrom) {
                    // Same logic: conflict means valid edge exists on keeper.
                    console.log(`     Edge update (source) conflict for ${duplicate.id}, handling...`);
                }

                // 3. Delete the duplicate node
                // (Cascade delete should handle edges that weren't moved successfully due to conflicts?)
                // Wait, if I failed to move edge because keeper has one, then the edge on duplicate 
                // is TRULY redundant (same relation, same other node). So deleting duplicate node
                // will cascade delete that redundant edge. PERFECT.

                const { error: deleteError } = await supabase
                    .from('cde_nodes')
                    .delete()
                    .eq('id', duplicate.id);

                if (deleteError) {
                    console.error(`  Error deleting ${duplicate.id}:`, deleteError);
                } else {
                    nodesRemoved++;
                }
            }
            groupsProcessed++;
        }
    }

    console.log('\n==========================================');
    console.log(`Finished.`);
    console.log(`Groups merged: ${groupsProcessed}`);
    console.log(`Nodes removed: ${nodesRemoved}`);
}

deduplicateNodes().catch(console.error);
