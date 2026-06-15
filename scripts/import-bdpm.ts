
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
});

// Paths to BDPM files
const DATA_DIR = path.join(process.cwd(), 'src', 'components', 'cde', 'data');
const FILE_CIS = path.join(DATA_DIR, 'CIS_bdpm.txt');
const FILE_COMPO = path.join(DATA_DIR, 'CIS_COMPO_bdpm.txt');
const FILE_CIP = path.join(DATA_DIR, 'CIS_CIP_bdpm.txt');

async function importBDPM() {
    console.log('Starting BDPM import...');

    if (!fs.existsSync(FILE_CIS) || !fs.existsSync(FILE_COMPO)) {
        console.error(`Files not found in ${DATA_DIR}`);
        return;
    }

    // Helper to read ISO-8859-1 file
    const readFile = (filePath: string) => {
        const buffer = fs.readFileSync(filePath);
        const content = iconv.decode(buffer, 'win1252'); // BDPM usually uses CP1252/Windows-1252
        return content.split('\n');
    };

    console.log('Reading files...');
    const cisLines = readFile(FILE_CIS);
    const compoLines = readFile(FILE_COMPO);

    // 1. Process Composition to map CIS -> Substances
    console.log(`Processing ${compoLines.length} composition lines...`);
    const cisToSubstances = new Map<string, string>();

    for (const line of compoLines) {
        if (!line.trim()) continue;
        const cols = line.split('\t');
        // Format: 0:CIS, 1:Type, 2:CodeSubst, 3:NameSubst, 4:Dosage, 5:Unit...
        if (cols.length < 4) continue;

        const cis = cols[0].trim();
        const substName = cols[3].trim();
        const dosage = cols[4]?.trim() || '';
        const unit = cols[5]?.trim() || '';
        const fullSubst = `${substName} ${dosage}${unit}`.trim();

        if (cisToSubstances.has(cis)) {
            cisToSubstances.set(cis, cisToSubstances.get(cis) + ' + ' + fullSubst);
        } else {
            cisToSubstances.set(cis, fullSubst);
        }
    }

    // 2. Process CIS Medications
    console.log(`Processing ${cisLines.length} medication lines...`);
    const medications = [];
    const seenCis = new Set<string>();

    for (const line of cisLines) {
        if (!line.trim()) continue;
        const cols = line.split('\t');
        // Format: 0:CIS, 1:Label, 2:Form, 3:Route, 4:Status, 5:Proc, 6:MktStatus, 7:Date, 8:?, 9:Holder, 10:Surv
        if (cols.length < 10) continue;

        const cis = cols[0].trim();
        if (seenCis.has(cis)) continue; // Should be unique in CIS_bdpm
        seenCis.add(cis);

        const name = cols[1].trim();
        const form = cols[2].trim();
        const type = cols[4].trim(); // Authorization status
        const holder = cols[9].trim();

        medications.push({
            name: name,
            pharmacode: cis, // Using valid pharmacode column for CIS
            dosage_forms: [form], // Array
            manufacturer: holder,
            substance: cisToSubstances.get(cis) || null,
            // authorization_status is the correct column
            authorization_status: type,
            source_url: `https://base-donnees-publique.medicaments.gouv.fr/affichageDoc.php?specid=${cis}&typedoc=R`,
            description: `Imported from BDPM. Route: ${cols[3].trim()}`,
            medication_category: 'human_drug'
        });
    }

    // 3. Upsert to DB
    const BATCH_SIZE = 500;
    console.log(`Preparing to upsert ${medications.length} medications...`);

    // We try to upsert by 'pharmacode' (CIS) if unique constraint exists, else 'name'.
    // Existing assumption: 'name' might not be unique (same drug, diff packaging? No, CIS is per specialty (form+dose), CIP is packaging)
    // medications table unique key? Let's assume unique constraint on 'name' or 'pharmacode' might be missing.
    // We'll perform Select-Then-Insert strategy as safest.

    // Fetch existing by pharmacode
    async function fetchAllPharmacodes() {
        let codes = new Set<string>();
        let page = 0;
        while (true) {
            const { data, error } = await supabase.from('medications').select('pharmacode').range(page * 1000, (page + 1) * 1000 - 1);
            if (!data || data.length === 0) break;
            data.forEach(d => { if (d.pharmacode) codes.add(d.pharmacode); });
            if (data.length < 1000) break;
            page++;
        }
        return codes;
    }

    const existingCodes = await fetchAllPharmacodes();
    // Also fetch existing names to avoid unique name constraint errors
    const existingNames = new Set<string>();
    {
        let page = 0;
        while (true) {
            const { data } = await supabase.from('medications').select('name').range(page * 1000, (page + 1) * 1000 - 1);
            if (!data || data.length === 0) break;
            data.forEach(d => existingNames.add(d.name.toLowerCase().trim()));
            if (data.length < 1000) break;
            page++;
        }
    }

    // Filter by Pharmacode AND Name
    const newMedsRaw = medications.filter(m => !existingCodes.has(m.pharmacode));
    const newMedsValid = newMedsRaw.filter(m => !existingNames.has(m.name.toLowerCase().trim()));

    console.log(`Found ${newMedsValid.length} new medications (by CIS and Name) to insert.`);

    // Local deduplication by Name
    const uniqueMedNames = new Set<string>();
    const medsToInsert: any[] = [];

    for (const m of newMedsValid) {
        const normName = m.name.toLowerCase().trim();
        if (!uniqueMedNames.has(normName)) {
            uniqueMedNames.add(normName);
            medsToInsert.push(m);
        }
    }

    console.log(`Deduplicated to ${medsToInsert.length} unique medications to insert.`);

    // Batch Insert
    for (let i = 0; i < medsToInsert.length; i += BATCH_SIZE) {
        const batch = medsToInsert.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('medications').insert(batch);
        if (error) {
            console.error('Error inserting batch:', error);
        } else {
            // process.stdout.write('.');
        }
    }
    console.log(`Successfully attempted to insert ${medsToInsert.length} new medications into 'medications' table.`);

    // 4. Create Nodes in CDE
    console.log('\nSyncing CDE Nodes...');

    // Fetch existing medication nodes to avoid duplicates
    async function fetchAllNodes() {
        let nodesMap = new Set<string>();
        let page = 0;
        const PAGE_SIZE = 1000;
        while (true) {
            const { data, error } = await supabase
                .from('cde_nodes')
                .select('name')
                .eq('node_type', 'medication')
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

            if (!data || data.length === 0) break;
            data.forEach(n => nodesMap.add(n.name.toLowerCase().trim()));
            if (data.length < PAGE_SIZE) break;
            page++;
        }
        return nodesMap;
    }

    const existingNodeNames = await fetchAllNodes();
    // Filter to only those whose names are NOT in existingNodeNames
    // We start from 'medsToInsert' which are the ones we just inserted (or tried to)
    const validNewMedsForNodes = medsToInsert.filter(m => !existingNodeNames.has(m.name.toLowerCase().trim()));

    console.log(`Found ${validNewMedsForNodes.length} candidates for new nodes.`);

    // Deduplicate by Name locally (keep first occurrence)
    const uniqueNodeNamesLocal = new Set<string>();
    const nodesToInsert: any[] = [];

    for (const m of validNewMedsForNodes) {
        const normalizedName = m.name.toLowerCase().trim();
        if (!uniqueNodeNamesLocal.has(normalizedName)) {
            uniqueNodeNamesLocal.add(normalizedName);
            nodesToInsert.push({
                name: m.name,
                node_type: 'medication', // Keeping 'medication' type
                properties: { cis: m.pharmacode, manufacturer: m.manufacturer }
            });
        }
    }

    console.log(`Deduplicated to ${nodesToInsert.length} unique nodes to insert.`);

    for (let i = 0; i < nodesToInsert.length; i += BATCH_SIZE) {
        const batch = nodesToInsert.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('cde_nodes').insert(batch);
        if (error) {
            console.error('Error inserting nodes:', error);
        }
    }

    console.log('\nImport Finished!');
}

importBDPM().catch(console.error);
