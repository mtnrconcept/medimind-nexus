import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SwissmedicRow {
  'Zulassungsnummer'?: string;
  'Sequenz'?: string;
  'Bezeichnung des Arzneimittels'?: string;
  'Zulassungsinhaberin'?: string;
  'Heilmittelcode'?: string;
  'IT-Nummer'?: string;
  'ATC-Code'?: string;
  'Wirkstoff(e)'?: string;
  'Zusammensetzung'?: string;
  'Anwendungsgebiet Arzneimittel'?: string;
  'Abgabekategorie Arzneimittel'?: string;
  'Erstzulassungsdatum'?: string;
  'Zulassungsdatum Sequenz'?: string;
  'Gültigkeitsdauer der Zulassung'?: string;
  'Wirkstoffe gentechnisch hergestellt'?: string;
  'Kategorie bei Betäubungsmitteln'?: string;
  'Zulassungsstatus'?: string;
  'Zulassungsart'?: string;
  'Packungscode'?: string;
  'Packungsgrösse'?: string;
  'Einheit'?: string;
  'Abgabekategorie Packung'?: string;
  'Widerrufsdatum Packung'?: string;
  'Einzeldosis'?: string;
  'Applikationsweg'?: string;
  'Kurzbezeichnung Darreichungsform'?: string;
  'Flagge Immunologika'?: string;
  'Betriebsart'?: string;
  'GLN'?: string;
  [key: string]: string | undefined;
}

interface MedicationInsert {
  swissmedic_number: string;
  name: string;
  manufacturer: string | null;
  medication_category: string | null;
  atc_code: string | null;
  substance: string | null;
  composition: string | null;
  indications: string | null;
  dispensing_category: string | null;
  first_authorization_date: string | null;
  validity_duration: string | null;
  genetically_produced: boolean;
  narcotic_category: string | null;
  authorization_status: string | null;
  authorization_type: string | null;
  dosage_forms: string[] | null;
}

function parseDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  
  // Try different date formats
  // Format: DD.MM.YYYY
  const dotMatch = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dotMatch) {
    const [, day, month, year] = dotMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Format: YYYY-MM-DD
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return dateStr;
  }
  
  // Excel serial date (number)
  const numValue = parseFloat(dateStr);
  if (!isNaN(numValue) && numValue > 10000 && numValue < 100000) {
    // Excel epoch is 1900-01-01, but Excel incorrectly assumes 1900 is a leap year
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + numValue * 24 * 60 * 60 * 1000);
    return date.toISOString().split('T')[0];
  }
  
  return null;
}

function mapRowToMedication(row: SwissmedicRow): MedicationInsert | null {
  const swissmedicNumber = row['Zulassungsnummer']?.toString().trim();
  const name = row['Bezeichnung des Arzneimittels']?.toString().trim();
  
  if (!swissmedicNumber || !name) {
    return null;
  }
  
  const dosageForm = row['Kurzbezeichnung Darreichungsform']?.toString().trim();
  
  return {
    swissmedic_number: swissmedicNumber,
    name: name,
    manufacturer: row['Zulassungsinhaberin']?.toString().trim() || null,
    medication_category: row['Heilmittelcode']?.toString().trim() || null,
    atc_code: row['ATC-Code']?.toString().trim() || null,
    substance: row['Wirkstoff(e)']?.toString().trim() || null,
    composition: row['Zusammensetzung']?.toString().trim() || null,
    indications: row['Anwendungsgebiet Arzneimittel']?.toString().trim() || null,
    dispensing_category: row['Abgabekategorie Arzneimittel']?.toString().trim() || null,
    first_authorization_date: parseDate(row['Erstzulassungsdatum']),
    validity_duration: row['Gültigkeitsdauer der Zulassung']?.toString().trim() || null,
    genetically_produced: row['Wirkstoffe gentechnisch hergestellt']?.toString().toLowerCase() === 'ja',
    narcotic_category: row['Kategorie bei Betäubungsmitteln']?.toString().trim() || null,
    authorization_status: row['Zulassungsstatus']?.toString().trim() || null,
    authorization_type: row['Zulassungsart']?.toString().trim() || null,
    dosage_forms: dosageForm ? [dosageForm] : null,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: jsonData } = await req.json();
    
    if (!jsonData || !Array.isArray(jsonData)) {
      throw new Error('Données invalides - un tableau JSON est attendu');
    }

    console.log(`Début de l'import de ${jsonData.length} lignes`);
    
    // Log first row to see actual column names
    if (jsonData.length > 0) {
      const firstRow = jsonData[0];
      console.log('Colonnes disponibles:', Object.keys(firstRow));
      console.log('Première ligne (échantillon):', JSON.stringify(firstRow).slice(0, 500));
    }

    const BATCH_SIZE = 100;
    let processed = 0;
    let inserted = 0;
    let updated = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    // Group by swissmedic_number to avoid duplicates
    const medicationMap = new Map<string, MedicationInsert>();
    
    for (const row of jsonData) {
      const medication = mapRowToMedication(row as SwissmedicRow);
      if (medication) {
        // If same medication number exists, merge dosage forms
        const existing = medicationMap.get(medication.swissmedic_number);
        if (existing) {
          const existingForms = existing.dosage_forms || [];
          const newForms = medication.dosage_forms || [];
          const allForms = [...new Set([...existingForms, ...newForms])];
          existing.dosage_forms = allForms.length > 0 ? allForms : null;
        } else {
          medicationMap.set(medication.swissmedic_number, medication);
        }
      }
    }

    const medications = Array.from(medicationMap.values());
    console.log(`${medications.length} médicaments uniques à importer`);

    // Process in batches
    for (let i = 0; i < medications.length; i += BATCH_SIZE) {
      const batch = medications.slice(i, i + BATCH_SIZE);
      
      const { data, error } = await supabase
        .from('medications')
        .upsert(batch, { 
          onConflict: 'swissmedic_number',
          ignoreDuplicates: false 
        })
        .select('id');
      
      if (error) {
        console.error(`Erreur batch ${i}-${i + BATCH_SIZE}:`, error);
        errors += batch.length;
        errorMessages.push(`Batch ${Math.floor(i/BATCH_SIZE) + 1}: ${error.message}`);
      } else {
        processed += batch.length;
        // On considère tous comme insérés/mis à jour (upsert ne distingue pas)
        inserted += data?.length || 0;
      }
      
      // Log progress
      if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= medications.length) {
        console.log(`Progression: ${Math.min(i + BATCH_SIZE, medications.length)}/${medications.length}`);
      }
    }

    console.log(`Import terminé: ${inserted} traités, ${errors} erreurs`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          total: jsonData.length,
          uniqueMedications: medications.length,
          processed,
          inserted,
          updated,
          errors,
          errorMessages: errorMessages.slice(0, 10) // Limit error messages
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Erreur import Swissmedic:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
