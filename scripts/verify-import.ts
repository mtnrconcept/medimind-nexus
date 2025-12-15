
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as XLSX from 'xlsx';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false }
});

async function checkCounts() {
    const { count: medCount, error: medError } = await supabase.from('medications').select('*', { count: 'exact', head: true });
    const { count: pathCount, error: pathError } = await supabase.from('pathologies').select('*', { count: 'exact', head: true });

    console.log('Medications in DB:', medCount, medError ? medError.message : '');
    console.log('Pathologies in DB:', pathCount, pathError ? pathError.message : '');
}

async function debugCsv() {
    const filePath = path.resolve(process.cwd(), 'src/data/medications-export-2025-12-08_00-24-29.csv');
    console.log('File size:', fs.statSync(filePath).size);

    // Read raw
    const raw = fs.readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n');
    console.log('Raw lines count:', lines.length);
    console.log('First line:', lines[0]);

    // XLSX parse
    const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);
    console.log('XLSX Parsed rows:', data.length);
    if (data.length > 0) {
        console.log('First row keys:', Object.keys(data[0] as any));
    }
}

async function main() {
    await checkCounts();
    await debugCsv();
}

main().catch(console.error);
