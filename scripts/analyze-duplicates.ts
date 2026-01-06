
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Error: SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

async function analyzeDuplicates() {
    console.log('Analyzing duplicates for "Lipodystrophie", "IRIS", "Insuffisance rénale"...');

    const searchTerms = ['Lipodystrophie', 'IRIS'];

    for (const term of searchTerms) {
        const { data: nodes, error } = await supabase
            .from('cde_nodes')
            .select('*')
            .ilike('name', `%${term}%`);

        if (error) {
            console.error(`Error fetching ${term}:`, error);
            continue;
        }

        console.log(`\nFound ${nodes.length} nodes matching "${term}":`);
        nodes.forEach(n => {
            // Visualize hidden chars
            const hex = n.name.split('').map((c: string) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
            console.log(`- ID: ${n.id}`);
            console.log(`  Name: "${n.name}"`);
            console.log(`  Hex:  ${hex}`);
            console.log(`  Type: ${n.node_type}`);
            console.log(`  ExtID: ${n.external_id}`);
            console.log(`  Created: ${n.created_at}`);
        });
    }
}

analyzeDuplicates().catch(console.error);
