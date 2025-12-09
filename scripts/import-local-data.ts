/**
 * Script d'import des données médicales locales vers Supabase
 * Usage: npm run import:data
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';

// Charger les variables d'environnement
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ Variables requises dans .env');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const DATA_DIR = path.join(__dirname, '../src/data');

// Parse CSV avec gestion des guillemets et point-virgules
function parseCSV(filePath: string): Record<string, any>[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    // Parser la première ligne pour les headers
    const headerLine = lines[0];
    const headers = parseCSVLine(headerLine);

    return lines.slice(1).map(line => {
        const values = parseCSVLine(line);
        const row: Record<string, any> = {};

        headers.forEach((h, i) => {
            let value = values[i] || '';
            // Parser les arrays JSON
            if (value.startsWith('[') && value.endsWith(']')) {
                try {
                    row[h] = JSON.parse(value.replace(/""/g, '"'));
                } catch {
                    row[h] = value;
                }
            } else if (value === '' || value === 'null') {
                row[h] = null;
            } else {
                row[h] = value;
            }
        });
        return row;
    }).filter(row => Object.values(row).some(v => v !== null && v !== ''));
}

// Parse une ligne CSV en tenant compte des guillemets
function parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++; // Skip next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ';' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current.trim());
    return values;
}

// Import générique
async function importTable(
    tableName: string,
    filePrefix: string,
    mapRow: (row: any) => any | null,
    displayName: string
): Promise<{ inserted: number; errors: number; skipped: number }> {
    const files = fs.readdirSync(DATA_DIR).filter(f =>
        f.startsWith(filePrefix) && f.endsWith('.csv')
    );

    if (files.length === 0) {
        console.log(`⚠️ Aucun fichier ${filePrefix} trouvé`);
        return { inserted: 0, errors: 0, skipped: 0 };
    }

    const csvPath = path.join(DATA_DIR, files[0]);
    console.log(`📥 Import ${displayName} depuis ${files[0]}...`);

    const rows = parseCSV(csvPath);
    console.log(`   ${rows.length} lignes trouvées`);

    let inserted = 0, errors = 0, skipped = 0;
    const BATCH_SIZE = 50;

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
            .map(mapRow)
            .filter((row): row is Record<string, any> => row !== null && row.id);

        if (batch.length === 0) {
            skipped += BATCH_SIZE;
            continue;
        }

        // Essayer l'upsert batch d'abord
        const { error } = await supabase
            .from(tableName)
            .upsert(batch, { onConflict: 'id', ignoreDuplicates: true });

        if (error) {
            // Si erreur de contrainte unique, insérer ligne par ligne
            if (error.message.includes('unique') || error.message.includes('duplicate')) {
                for (const row of batch) {
                    const { error: rowError } = await supabase
                        .from(tableName)
                        .upsert(row, { onConflict: 'id', ignoreDuplicates: true });

                    if (rowError) {
                        if (rowError.message.includes('unique') || rowError.message.includes('duplicate')) {
                            skipped++;
                        } else {
                            errors++;
                        }
                    } else {
                        inserted++;
                    }
                }
            } else {
                errors += batch.length;
            }
        } else {
            inserted += batch.length;
        }

        process.stdout.write(`\r   Progression: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} (${inserted} OK, ${skipped} skip, ${errors} err)`);
    }

    console.log(`\n   ✅ ${displayName}: ${inserted} importés, ${skipped} ignorés (doublons), ${errors} erreurs`);
    return { inserted, errors, skipped };
}

// Validation UUID
function isValidUUID(str: string): boolean {
    if (!str) return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}

async function main(): Promise<void> {
    console.log('🚀 Import des données médicales locales vers Supabase\n');
    console.log(`📁 Dossier source: ${DATA_DIR}`);
    console.log(`🔗 Supabase URL: ${SUPABASE_URL}\n`);

    const startTime = Date.now();
    const results: Record<string, { inserted: number; errors: number }> = {};

    // 1. Pathologies - table parent
    results.pathologies = await importTable('pathologies', 'pathologies-export', (row) => {
        if (!isValidUUID(row.id)) return null;
        return {
            id: row.id,
            name: row.name,
            icd_code: row.icd_code,
            synonyms: Array.isArray(row.synonyms) ? row.synonyms : null,
            description: row.description,
            category: row.category,
            specialty: row.specialty,
            severity: row.severity,
            created_at: row.created_at,
            updated_at: row.updated_at
        };
    }, 'Pathologies');

    // 2. Médicaments - table parent
    results.medications = await importTable('medications', 'medications-export', (row) => {
        if (!isValidUUID(row.id)) return null;
        return {
            id: row.id,
            name: row.name,
            atc_code: row.atc_code || null,
            substance: row.substance || null,
            description: row.description || null,
            dosage_forms: Array.isArray(row.dosage_forms) ? row.dosage_forms : null,
            indications: row.indications || null,
            posology: row.posology || null,
            source_url: row.source_url || null,
            manufacturer: row.manufacturer || null,
            swissmedic_name: row.swissmedic_name || null,
            pharmacode: row.pharmacode || null,
            gtin: row.gtin || null,
            dispensing_category: row.dispensing_category || null,
            characteristics: row.characteristics || null,
            composition: row.composition || null,
            created_at: row.created_at,
            updated_at: row.updated_at || row.created_at
        };
    }, 'Médicaments');

    // 3. Traitements - lié aux pathologies
    results.treatments = await importTable('treatments', 'treatments-export', (row) => {
        if (!isValidUUID(row.id)) return null;
        // Vérifier que pathology_id est un UUID valide
        const pathologyId = isValidUUID(row.pathology_id) ? row.pathology_id : null;
        return {
            id: row.id,
            pathology_id: pathologyId,
            name: row.name,
            type: row.type || null,
            description: row.description || null,
            contraindications: Array.isArray(row.contraindications) ? row.contraindications : null,
            created_at: row.created_at
        };
    }, 'Traitements');

    // 4. Effets secondaires - lié aux médicaments
    results.side_effects = await importTable('side_effects', 'side_effects-export', (row) => {
        if (!isValidUUID(row.id) || !isValidUUID(row.medication_id)) return null;
        return {
            id: row.id,
            medication_id: row.medication_id,
            name: row.name,
            frequency: row.frequency || null,
            body_system: row.body_system || null,
            description: row.description || null,
            severity: row.severity || null,
            created_at: row.created_at
        };
    }, 'Effets secondaires');

    // 5. Interactions - lié aux médicaments
    results.drug_interactions = await importTable('drug_interactions', 'drug_interactions-export', (row) => {
        if (!isValidUUID(row.id) || !isValidUUID(row.medication_id)) return null;
        return {
            id: row.id,
            medication_id: row.medication_id,
            interacting_drug: row.interacting_drug,
            interaction_type: row.interaction_type || null,
            severity: row.severity || null,
            description: row.description || null,
            recommendation: row.recommendation || null,
            created_at: row.created_at
        };
    }, 'Interactions');

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n📊 Résumé:');
    let totalInserted = 0, totalErrors = 0;
    for (const [table, stats] of Object.entries(results)) {
        console.log(`   ${table}: ${stats.inserted} ✅ / ${stats.errors} ❌`);
        totalInserted += stats.inserted;
        totalErrors += stats.errors;
    }
    console.log(`\n✨ Import terminé en ${duration}s - Total: ${totalInserted} insérés, ${totalErrors} erreurs`);
}

main().catch(console.error);
