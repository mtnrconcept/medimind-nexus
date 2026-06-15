
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as XLSX from 'xlsx';

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
// We need the service role key to bypass RLS for bulk imports
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

const BATCH_SIZE = 100;

async function importMedications() {
    const filePath = path.resolve(process.cwd(), 'src/data/medications-export-2025-12-08_00-24-29.csv');
    console.log(`Reading medications from ${filePath}...`);

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }

    // Read file manually to handle potential encoding issues if any, but xlsx usually fine
    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // XLSX utils sheet_to_json handles CSV parsing
    // The CSV is semicolon delimited. XLSX *might* auto-detect, but we can check.
    // Actually, for CSVs, it's often safer to specify delimiter if parsing text, 
    // but let's try auto-detection first. 
    // If we read as buffer, XLSX determines format.

    const data = XLSX.utils.sheet_to_json(sheet);

    console.log(`Parsed ${data.length} medications.`);

    let batch = [];
    let processedCount = 0;

    for (const row of data) {
        const anyRow = row as any;

        // Parse JSON arrays
        let dosage_forms = null;
        try {
            if (anyRow.dosage_forms) {
                // Handle "[\"val\"]" vs array
                dosage_forms = JSON.parse(anyRow.dosage_forms);
            }
        } catch (e) {
            // console.warn('Failed to parse dosage_forms', anyRow.dosage_forms);
        }

        // Clean fields
        const medication = {
            id: anyRow.id,
            name: anyRow.name,
            atc_code: anyRow.atc_code,
            substance: anyRow.substance,
            description: anyRow.description,
            dosage_forms: dosage_forms,
            indications: anyRow.indications,
            posology: anyRow.posology,
            source_url: anyRow.source_url,
            // created_at: anyRow.created_at, // Let supabase handle or use provided
            // updated_at: anyRow.updated_at,
            manufacturer: anyRow.manufacturer,
            swissmedic_name: anyRow.swissmedic_name,
            pharmacode: anyRow.pharmacode,
            gtin: anyRow.gtin,
            dispensing_category: anyRow.dispensing_category,
            characteristics: anyRow.characteristics,
            composition: anyRow.composition,
            swissmedic_number: anyRow.swissmedic_number,
            authorization_type: anyRow.authorization_type,
            medication_category: anyRow.medication_category,
            first_authorization_date: anyRow.first_authorization_date ? new Date(anyRow.first_authorization_date).toISOString() : null,
            validity_duration: anyRow.validity_duration,
            genetically_produced: anyRow.genetically_produced === 'true' || anyRow.genetically_produced === true,
            narcotic_category: anyRow.narcotic_category,
            authorization_status: anyRow.authorization_status
        };

        batch.push(medication);

        if (batch.length >= BATCH_SIZE) {
            const { error } = await supabase.from('medications').upsert(batch);
            if (error) {
                console.error('Error inserting batch:', error);
            } else {
                processedCount += batch.length;
                process.stdout.write(`\rImported ${processedCount}/${data.length} medications...`);
            }
            batch = [];
        }
    }

    if (batch.length > 0) {
        const { error } = await supabase.from('medications').upsert(batch);
        if (error) {
            console.error('Error inserting final batch:', error);
        } else {
            processedCount += batch.length;
            console.log(`\rImported ${processedCount}/${data.length} medications.`);
        }
    }
}

async function importPathologies() {
    const filePath = path.resolve(process.cwd(), 'src/data/pathologies-export-2025-12-08_00-25-22.csv');
    console.log(`Reading pathologies from ${filePath}...`);

    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const data = XLSX.utils.sheet_to_json(sheet);

    console.log(`Parsed ${data.length} pathologies.`);

    let batch = [];
    let processedCount = 0;

    for (const row of data) {
        const anyRow = row as any;

        let synonyms = null;
        try {
            if (anyRow.synonyms) {
                synonyms = JSON.parse(anyRow.synonyms);
            }
        } catch (e) { }

        const pathology = {
            id: anyRow.id,
            name: anyRow.name,
            icd_code: anyRow.icd_code,
            synonyms: synonyms,
            description: anyRow.description,
            category: anyRow.category,
            specialty: anyRow.specialty,
            severity: anyRow.severity
            // created_at / updated_at handled by DB or ignored
        };

        batch.push(pathology);

        if (batch.length >= BATCH_SIZE) {
            const { error } = await supabase.from('pathologies').upsert(batch);
            if (error) {
                console.error('Error inserting batch:', error);
            } else {
                processedCount += batch.length;
                process.stdout.write(`\rImported ${processedCount}/${data.length} pathologies...`);
            }
            batch = [];
        }
    }

    if (batch.length > 0) {
        const { error } = await supabase.from('pathologies').upsert(batch);
        if (error) {
            console.error('Error inserting final batch:', error);
        } else {
            processedCount += batch.length;
            console.log(`\rImported ${processedCount}/${data.length} pathologies.`);
        }
    }
}

async function main() {
    console.log('Starting import...');
    await importMedications();
    await importPathologies();
    console.log('Done.');
}

main().catch(console.error);
