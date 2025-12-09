/**
 * Script d'import des médicaments EMA vers Supabase
 * MediMind Nexus
 * 
 * Usage: npx ts-node scripts/import-medications.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Configuration Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kparxcfspgoonqttduyk.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseServiceKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY non défini');
    console.log('Usage: SUPABASE_SERVICE_ROLE_KEY=your_key npx ts-node scripts/import-medications.ts');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface EMAMedication {
    medicine_name?: string;
    active_substance?: string;
    therapeutic_area?: string;
    inn?: string;
    atc_code?: string;
    product_number?: string;
    authorisation_status?: string;
    marketing_authorisation_holder?: string;
    first_published?: string;
    revision_date?: string;
    url?: string;
}

async function importFromJSON() {
    console.log('🔄 Chargement du fichier JSON des médicaments EMA...');

    const jsonPath = path.join(__dirname, '../src/data/medicines_output_epar_document_translations_en.json');

    if (!fs.existsSync(jsonPath)) {
        console.error('❌ Fichier non trouvé:', jsonPath);
        return;
    }

    const rawData = fs.readFileSync(jsonPath, 'utf-8');
    const medications: EMAMedication[] = JSON.parse(rawData);

    console.log(`📊 ${medications.length} médicaments trouvés dans le fichier`);

    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    // Traiter par lots de 100
    const batchSize = 100;
    const batches = Math.ceil(medications.length / batchSize);

    for (let i = 0; i < batches; i++) {
        const batch = medications.slice(i * batchSize, (i + 1) * batchSize);

        const toInsert = batch
            .filter(med => med.medicine_name)
            .map(med => ({
                name: med.medicine_name!,
                substance: med.active_substance || med.inn,
                atc_code: med.atc_code,
                description: med.therapeutic_area,
                manufacturer: med.marketing_authorisation_holder,
                authorization_status: med.authorisation_status,
                first_authorization_date: med.first_published,
                source_url: med.url,
                indications: med.therapeutic_area,
            }));

        if (toInsert.length > 0) {
            const { error, count } = await supabase
                .from('medications')
                .upsert(toInsert, {
                    onConflict: 'name',
                    ignoreDuplicates: true
                });

            if (error) {
                console.error(`❌ Erreur batch ${i + 1}:`, error.message);
                errors += toInsert.length;
            } else {
                inserted += toInsert.length;
            }
        }

        // Afficher la progression
        if ((i + 1) % 10 === 0 || i === batches - 1) {
            console.log(`📦 Progression: ${i + 1}/${batches} lots (${inserted} insérés, ${errors} erreurs)`);
        }
    }

    console.log('\n✅ Import terminé!');
    console.log(`📊 Résumé: ${inserted} médicaments importés, ${errors} erreurs`);
}

async function countMedications() {
    const { count, error } = await supabase
        .from('medications')
        .select('*', { count: 'exact', head: true });

    if (error) {
        console.error('Erreur:', error);
        return 0;
    }

    return count || 0;
}

async function main() {
    console.log('🏥 Import des médicaments EMA vers Supabase');
    console.log('==========================================\n');

    const beforeCount = await countMedications();
    console.log(`📊 Médicaments avant import: ${beforeCount}`);

    await importFromJSON();

    const afterCount = await countMedications();
    console.log(`📊 Médicaments après import: ${afterCount}`);
    console.log(`📈 Nouveaux médicaments: ${afterCount - beforeCount}`);
}

main().catch(console.error);
