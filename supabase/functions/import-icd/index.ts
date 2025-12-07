import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Categories mapping based on ICD-10 chapters
const getCategoryFromCode = (code: string): { category: string; specialty: string } => {
  const firstChar = code.charAt(0);
  const num = parseInt(code.substring(1, 3)) || 0;
  
  const mapping: Record<string, { category: string; specialty: string }> = {
    'A': { category: 'Infectieuse', specialty: 'Infectiologie' },
    'B': { category: 'Infectieuse', specialty: 'Infectiologie' },
    'C': { category: 'Oncologique', specialty: 'Oncologie' },
    'D': num < 50 ? { category: 'Oncologique', specialty: 'Oncologie' } : { category: 'Hématologique', specialty: 'Hématologie' },
    'E': { category: 'Métabolique', specialty: 'Endocrinologie' },
    'F': { category: 'Psychiatrique', specialty: 'Psychiatrie' },
    'G': { category: 'Neurologique', specialty: 'Neurologie' },
    'H': num < 60 ? { category: 'Ophtalmologique', specialty: 'Ophtalmologie' } : { category: 'ORL', specialty: 'ORL' },
    'I': { category: 'Cardiovasculaire', specialty: 'Cardiologie' },
    'J': { category: 'Respiratoire', specialty: 'Pneumologie' },
    'K': { category: 'Digestive', specialty: 'Gastro-entérologie' },
    'L': { category: 'Dermatologique', specialty: 'Dermatologie' },
    'M': { category: 'Rhumatologique', specialty: 'Rhumatologie' },
    'N': { category: 'Urologique', specialty: 'Urologie' },
    'O': { category: 'Obstétrique', specialty: 'Gynécologie-Obstétrique' },
    'P': { category: 'Néonatale', specialty: 'Néonatologie' },
    'Q': { category: 'Congénitale', specialty: 'Pédiatrie' },
    'R': { category: 'Symptômes', specialty: 'Médecine générale' },
    'S': { category: 'Traumatique', specialty: 'Traumatologie' },
    'T': { category: 'Traumatique', specialty: 'Traumatologie' },
    'U': { category: 'Spéciale', specialty: 'Médecine générale' },
    'V': { category: 'Causes externes', specialty: 'Médecine générale' },
    'W': { category: 'Causes externes', specialty: 'Médecine générale' },
    'X': { category: 'Causes externes', specialty: 'Médecine générale' },
    'Y': { category: 'Causes externes', specialty: 'Médecine générale' },
    'Z': { category: 'Facteurs de santé', specialty: 'Médecine générale' },
  };
  
  return mapping[firstChar] || { category: 'Autre', specialty: 'Médecine générale' };
};

// Estimate severity based on disease description keywords
const getSeverity = (name: string): string => {
  const lowerName = name.toLowerCase();
  
  if (lowerName.includes('malignant') || lowerName.includes('cancer') || 
      lowerName.includes('carcinoma') || lowerName.includes('sepsis') ||
      lowerName.includes('failure') || lowerName.includes('shock') ||
      lowerName.includes('infarction') || lowerName.includes('hemorrhage')) {
    return 'critical';
  }
  
  if (lowerName.includes('chronic') || lowerName.includes('severe') ||
      lowerName.includes('insufficiency') || lowerName.includes('disease')) {
    return 'severe';
  }
  
  if (lowerName.includes('acute') || lowerName.includes('infection') ||
      lowerName.includes('disorder') || lowerName.includes('syndrome')) {
    return 'moderate';
  }
  
  return 'mild';
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { limit = 500, offset = 0, clearExisting = false } = await req.json();
    
    console.log(`Fetching ICD-10 data from GitHub... (limit: ${limit}, offset: ${offset})`);
    
    // Fetch ICD-10 data from public GitHub repository
    const icdResponse = await fetch(
      'https://raw.githubusercontent.com/fendis0709/icd-10/master/master_icd_x.json'
    );
    
    if (!icdResponse.ok) {
      throw new Error('Failed to fetch ICD-10 data from GitHub');
    }
    
    const icdData: Array<{
      kode_icd: string;
      nama_icd: string;
      nama_icd_indo: string;
    }> = await icdResponse.json();
    
    console.log(`Fetched ${icdData.length} ICD-10 codes`);
    
    // Clear existing data if requested
    if (clearExisting && offset === 0) {
      console.log('Clearing existing pathologies...');
      // First delete related data
      await supabase.from('pathology_symptoms').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('treatments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('medical_sources').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('pathologies').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      console.log('Existing data cleared');
    }
    
    // Process ICD codes in batches
    const batch = icdData.slice(offset, offset + limit);
    const pathologies = batch.map(item => {
      const { category, specialty } = getCategoryFromCode(item.kode_icd);
      const severity = getSeverity(item.nama_icd);
      
      return {
        name: item.nama_icd.trim(),
        icd_code: item.kode_icd,
        description: item.nama_icd.trim(),
        category,
        specialty,
        severity,
        synonyms: item.nama_icd_indo ? [item.nama_icd_indo.trim()] : null,
      };
    });
    
    console.log(`Inserting ${pathologies.length} pathologies...`);
    
    // Insert in smaller chunks to avoid timeouts
    const chunkSize = 100;
    let insertedCount = 0;
    
    for (let i = 0; i < pathologies.length; i += chunkSize) {
      const chunk = pathologies.slice(i, i + chunkSize);
      const { error } = await supabase.from('pathologies').upsert(chunk, {
        onConflict: 'icd_code',
        ignoreDuplicates: false
      });
      
      if (error) {
        console.error(`Error inserting chunk ${i / chunkSize}:`, error);
        // Continue with next chunk even if one fails
      } else {
        insertedCount += chunk.length;
      }
    }
    
    const hasMore = offset + limit < icdData.length;
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `Imported ${insertedCount} pathologies from ICD-10`,
        totalInDataset: icdData.length,
        imported: insertedCount,
        offset: offset,
        limit: limit,
        hasMore,
        nextOffset: hasMore ? offset + limit : null,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Import error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
