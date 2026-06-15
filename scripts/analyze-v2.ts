
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

async function analyzeV2() {
    console.log('Analyzing "Lipodystrophie" and "IRIS" across tables...');
    const terms = ['Lipodystrophie', 'IRIS'];

    // Tables to check
    const tables = ['cde_nodes', 'pathologies', 'medications', 'side_effects', 'symptoms'];

    for (const term of terms) {
        console.log(`\n=== Analyzing term: "${term}" ===`);

        for (const table of tables) {
            // Check if table exists/is accessible by trying a limit 1 query first? No, just try select
            try {
                // Determine column name (name is common, but some might be different)
                const col = 'name';

                const { data, error } = await supabase
                    .from(table)
                    .select('*')
                    .ilike(col, `%${term}%`);

                if (error) {
                    // Table might not have 'name' column or not exist in public schema the way we expect
                    // console.log(`  [${table}] Skipped or error: ${error.message}`);
                    continue;
                }

                if (data && data.length > 0) {
                    console.log(`  Table [${table}]: Found ${data.length} matches`);
                    data.forEach(row => {
                        const name = row[col] || row['term'] || '???';
                        const hex = name.split('').map((c: string) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
                        const exactMatch = name === term ? ' (EXACT)' : '';
                        console.log(`    - ID: ${row.id} | Name: "${name}"${exactMatch} | Hex: [${hex}]`);
                    });
                } else {
                    console.log(`  Table [${table}]: No matches`);
                }
            } catch (err) {
                // ignore
            }
        }
    }
}

analyzeV2();
