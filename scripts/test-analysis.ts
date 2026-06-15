
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('Missing Supabase URL or Anon Key. URL:', SUPABASE_URL, 'KEY:', !!SUPABASE_ANON_KEY);
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testAnalysis() {
    console.log('Testing document analysis...');

    // Create a dummy file
    const dummyContent = `
    Ordonnance du Dr. Test
    Date: 2025-12-14
    Patient: Jean Dupont
    
    1. Candesartan 8mg
       1 comprimé le matin
       
    2. Doliprane 1000mg
       Si douleur, max 3x/jour
       
    Diagnostic:
    - Hypertension artérielle
    - Botulisme
    `;

    const filePath = path.resolve('temp_test_doc.txt');
    fs.writeFileSync(filePath, dummyContent);
    const file = fs.openAsBlob(filePath); // Node 18+ or standard blob?
    // In node, might need FormData from 'form-data' or native fetch with FormData (Node 18+)

    const formData = new FormData();
    formData.append('file', new Blob([dummyContent], { type: 'text/plain' }), 'ordonnance_test.txt');
    // We need a valid patientId for integration to happen
    // Let's look for a patient or create one?
    // For test, we can try to fetch one.

    // Note: To bypass Auth in Edge Function call via anon key, checking if user token checks are enforced.
    // The deployed function uses `serve` and checks RLS usually via context, but our code allows anon?
    // Line 6 of index.ts: CORS allowed. 
    // Line 123 `analyzeWithClaude` uses `CLAUDE_API_KEY`.
    // The function doesn't seem to enforce `Authorization` header check for user presence explicitly for *analysis*, 
    // BUT `autoIntegrateData` uses `patientId`.
    // If we pass `patientId`, it attempts to insert into tables.
    // We need a patient ID.

    // Let's get a random patient
    // Note: The script is running with Service Role Key ideally if we want full access, but here using Anon + maybe Service role for DB lookup
}

// Rewriting to use correct fetch and setup
// We'll use the deployed function URL
async function run() {
    const dummyContent = `
    Ordonnance du Dr. Test
    Date: 2025-12-14
    Patient: Integration Test
    
    1. Candesartan 8mg
       1 comprimé le matin po
    
    Diagnostic:
    - Botulism
    `;

    const blob = new Blob([dummyContent], { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', blob, 'test_ordonnance.txt');

    // Use a placeholder patient ID or fetch one
    // Assuming valid UUID
    const patientId = '00000000-0000-0000-0000-000000000000'; // Likely invalid, will fail FK
    // We should get a real one.

    // Let's look for one
    const serviceClient = createClient(SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: patients } = await serviceClient.from('patients').select('id').limit(1);
    const realPatientId = patients && patients.length > 0 ? patients[0].id : null;

    if (!realPatientId) {
        console.error('No patients found to test with.');
        return;
    }
    console.log('Using patient:', realPatientId);

    formData.append('patientId', realPatientId);
    // documentId is optional but useful for 'patient_documents' update
    // We can create a dummy document record first? 
    // function code (line 509): if documentId, updates status.
    // if not, just analyzes.
    // But autoIntegrateData checks `if (patientId && documentId)`.
    // So we MUST have a documentId to trigger autoIntegrateData in the current code (line 564).

    // Create a dummy document
    const { data: doc, error: docError } = await serviceClient.from('patient_documents').insert({
        patient_id: realPatientId,
        file_name: 'Test Analysis Document',
        file_path: 'test/dummy.txt',
        file_type: 'text/plain',
        file_size: dummyContent.length,
        extraction_status: 'pending'
    }).select().single();

    if (docError) {
        console.error('Failed to create doc record', docError);
        return;
    }
    console.log('Created document:', doc.id);

    formData.append('documentId', doc.id);

    const functionUrl = `${SUPABASE_URL}/functions/v1/document-analyzer`;
    console.log('Calling:', functionUrl);

    const res = await fetch(functionUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            // Using service role to bypass any potential issues
        },
        body: formData
    });

    if (!res.ok) {
        console.error('Function failed:', res.status, await res.text());
        return;
    }

    const json = await res.json();
    console.log('Result:', JSON.stringify(json, null, 2));

    // Clean up
    // await serviceClient.from('patient_documents').delete().eq('id', doc.id);
    // Don't delete, we want to inspect database
}

run().catch(console.error);
