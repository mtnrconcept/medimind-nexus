import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import FirecrawlApp from "https://esm.sh/@mendable/firecrawl-js@1.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper pour attendre avec retry sur 429
async function scrapeWithRateLimitRetry(firecrawl: any, url: string, maxRetries = 3): Promise<any> {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await firecrawl.scrapeUrl(url, {
        formats: ['markdown'],
        onlyMainContent: true,
      });
      return result;
    } catch (err: any) {
      lastError = err;
      const errorMessage = err?.message || String(err);
      
      // Détecter les erreurs 429 (rate limit)
      if (errorMessage.includes('429') || errorMessage.includes('rate limit') || errorMessage.includes('Too Many')) {
        const waitTime = 10000 * attempt; // 10s, 20s, 30s
        console.log(`Rate limit (429) détecté, attente ${waitTime/1000}s avant retry ${attempt}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // Autres erreurs réseau - retry avec backoff
      if (errorMessage.includes('Network') || errorMessage.includes('fetch')) {
        const waitTime = 5000 * attempt;
        console.log(`Erreur réseau, attente ${waitTime/1000}s avant retry ${attempt}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // Erreur non-recoverable
      throw err;
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!firecrawlApiKey) {
      throw new Error('FIRECRAWL_API_KEY non configurée');
    }

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY non configurée');
    }

    const supabase = createClient(supabaseUrl!, supabaseServiceKey!);
    const firecrawl = new FirecrawlApp({ apiKey: firecrawlApiKey });

    const { action, url, urls, options } = await req.json();
    console.log(`Action: ${action}, URL: ${url}`);

    // Action: Map - Découvrir toutes les URLs d'un site
    if (action === 'map') {
      console.log('Mapping du site:', url);
      
      try {
        const mapResult = await firecrawl.mapUrl(url, {
          limit: options?.limit || 100,
        });

        if (!mapResult.success) {
          throw new Error('Échec du mapping du site');
        }

        // Filtrer les URLs pertinentes (pages de pathologies ET traitements)
        const relevantUrls = (mapResult.links || []).filter((link: string) => {
          const lowerLink = link.toLowerCase();
          // Exclure les pages non pertinentes
          if (lowerLink.includes('/videos/') || 
              lowerLink.includes('/news/') || 
              lowerLink.includes('/recipes/') ||
              lowerLink.includes('/lifestyle/')) {
            return false;
          }
          return (
            lowerLink.includes('patholog') ||
            lowerLink.includes('disease') ||
            lowerLink.includes('disorder') ||
            lowerLink.includes('syndrome') ||
            lowerLink.includes('maladie') ||
            lowerLink.includes('trouble') ||
            lowerLink.includes('infection') ||
            lowerLink.includes('symptom') ||
            lowerLink.includes('treatment') ||
            lowerLink.includes('traitement') ||
            lowerLink.includes('diagnosis') ||
            lowerLink.includes('diagnostic') ||
            lowerLink.includes('medication') ||
            lowerLink.includes('therapy') ||
            lowerLink.includes('/topics/') ||
            lowerLink.includes('/conditions/') ||
            lowerLink.includes('/health-topics/')
          );
        });

        return new Response(JSON.stringify({
          success: true,
          totalUrls: mapResult.links?.length || 0,
          relevantUrls: relevantUrls.length,
          urls: relevantUrls.slice(0, options?.limit || 100)
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        const errorMessage = err?.message || String(err);
        // Retourner 429 spécifiquement pour le rate limiting
        if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Rate limit atteint - veuillez patienter',
            rateLimited: true
          }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw err;
      }
    }

    // Action: Map Compendium - Découvrir les URLs de médicaments sur Compendium.ch
    if (action === 'map-compendium') {
      console.log('Mapping Compendium.ch');
      
      try {
        const mapResult = await firecrawl.mapUrl(url || 'https://compendium.ch/fr/product', {
          limit: options?.limit || 500,
        });

        if (!mapResult.success) {
          throw new Error('Échec du mapping Compendium');
        }

        // Filtrer les URLs de produits/médicaments
        const medicationUrls = (mapResult.links || []).filter((link: string) => {
          const lowerLink = link.toLowerCase();
          return (
            lowerLink.includes('/product/') ||
            lowerLink.includes('/mpro/') ||
            lowerLink.includes('/monographie/')
          );
        });

        console.log(`Compendium: ${medicationUrls.length} URLs de médicaments trouvées`);

        return new Response(JSON.stringify({
          success: true,
          totalUrls: mapResult.links?.length || 0,
          medicationUrls: medicationUrls.length,
          urls: medicationUrls.slice(0, options?.limit || 500)
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (err: any) {
        const errorMessage = err?.message || String(err);
        if (errorMessage.includes('429') || errorMessage.includes('rate limit') || errorMessage.includes('402')) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Rate limit ou crédits insuffisants - vérifiez votre quota Firecrawl',
            rateLimited: true
          }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw err;
      }
    }

    // Action: Scrape medication - Scraper une page de médicament Compendium
    if (action === 'scrape-medication') {
      console.log('Scraping médicament:', url);

      let scrapeResult;
      try {
        scrapeResult = await scrapeWithRateLimitRetry(firecrawl, url);
      } catch (err: any) {
        const errorMessage = err?.message || String(err);
        if (errorMessage.includes('429') || errorMessage.includes('rate limit') || errorMessage.includes('402')) {
          console.log('Rate limit/402 pour:', url);
          return new Response(JSON.stringify({
            success: false,
            error: 'Rate limit ou crédits Firecrawl insuffisants',
            rateLimited: true
          }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw err;
      }

      if (!scrapeResult.success) {
        throw new Error('Échec du scraping du médicament');
      }

      const markdown = scrapeResult.markdown || '';
      console.log('Contenu médicament extrait, longueur:', markdown.length);

      // Extraction des données via Lovable AI
      const extractionPrompt = `Tu es un expert en pharmacologie. Analyse ce contenu markdown d'une page de médicament Compendium.ch et extrais TOUTES les informations au format JSON strict.

INSTRUCTIONS CRITIQUES:
- Réponds UNIQUEMENT avec le JSON, sans texte avant ou après
- Si une information n'est pas disponible, utilise null ou un tableau vide []
- Assure-toi que le JSON est valide
- Pour les fréquences d'effets secondaires, utilise: "very_common" (>10%), "common" (1-10%), "uncommon" (0.1-1%), "rare" (0.01-0.1%), "very_rare" (<0.01%)
- Pour la sévérité, utilise: "mild", "moderate", "severe"
- Pour le type d'interaction, utilise: "potentiation", "antagonism", "increased_toxicity", "decreased_efficacy"
- Pour la sévérité d'interaction, utilise: "minor", "moderate", "major", "contraindicated"

Format attendu:
{
  "medication": {
    "name": "Nom commercial du médicament",
    "atc_code": "Code ATC (ex: N02BE01)",
    "substance": "Substance(s) active(s)",
    "description": "Description/indications du médicament",
    "dosage_forms": ["comprimé", "sirop", "injection"],
    "indications": "Indications thérapeutiques complètes",
    "posology": "Posologie recommandée"
  },
  "side_effects": [
    {
      "name": "Nom de l'effet secondaire",
      "frequency": "very_common ou common ou uncommon ou rare ou very_rare",
      "body_system": "Système affecté (digestif, nerveux, cardiovasculaire, etc.)",
      "description": "Description de l'effet",
      "severity": "mild ou moderate ou severe"
    }
  ],
  "interactions": [
    {
      "interacting_drug": "Nom du médicament/substance interagissant",
      "interaction_type": "potentiation ou antagonism ou increased_toxicity ou decreased_efficacy",
      "severity": "minor ou moderate ou major ou contraindicated",
      "description": "Description de l'interaction",
      "recommendation": "Recommandation clinique"
    }
  ],
  "contraindications": [
    {
      "condition": "Condition contre-indiquée",
      "severity": "relative ou absolute",
      "description": "Description de la contre-indication"
    }
  ]
}

Contenu à analyser:
${markdown.substring(0, 20000)}`;

      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'Tu es un expert pharmacologue qui extrait des données structurées de notices de médicaments. Tu réponds uniquement en JSON valide.' },
            { role: 'user', content: extractionPrompt }
          ],
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('Erreur AI:', errorText);
        throw new Error(`Erreur de l'API AI: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const aiContent = aiData.choices?.[0]?.message?.content || '';
      
      // Parser le JSON de la réponse
      let extractedData;
      try {
        let cleanedContent = aiContent.trim();
        if (cleanedContent.startsWith('```json')) {
          cleanedContent = cleanedContent.slice(7);
        }
        if (cleanedContent.startsWith('```')) {
          cleanedContent = cleanedContent.slice(3);
        }
        if (cleanedContent.endsWith('```')) {
          cleanedContent = cleanedContent.slice(0, -3);
        }
        extractedData = JSON.parse(cleanedContent.trim());
      } catch (parseError) {
        console.error('Erreur de parsing JSON:', parseError, 'Contenu:', aiContent);
        throw new Error('Impossible de parser les données du médicament');
      }

      const stats = {
        medicationsAdded: 0,
        sideEffectsAdded: 0,
        interactionsAdded: 0,
        contraindicationsAdded: 0
      };

      // Insérer le médicament
      if (extractedData.medication?.name) {
        const { data: existingMed } = await supabase
          .from('medications')
          .select('id')
          .ilike('name', extractedData.medication.name)
          .maybeSingle();

        let medicationId;
        
        if (!existingMed) {
          const { data: newMed, error: medError } = await supabase
            .from('medications')
            .insert({
              name: extractedData.medication.name,
              atc_code: extractedData.medication.atc_code,
              substance: extractedData.medication.substance,
              description: extractedData.medication.description,
              dosage_forms: extractedData.medication.dosage_forms || [],
              indications: extractedData.medication.indications,
              posology: extractedData.medication.posology,
              source_url: url
            })
            .select('id')
            .single();

          if (medError) {
            console.error('Erreur insertion médicament:', medError);
          } else {
            medicationId = newMed?.id;
            stats.medicationsAdded = 1;
            console.log(`Médicament inséré: ${extractedData.medication.name}`);
          }
        } else {
          medicationId = existingMed.id;
          console.log(`Médicament existe déjà: ${extractedData.medication.name}`);
        }

        // Insérer les effets secondaires
        if (medicationId && extractedData.side_effects && Array.isArray(extractedData.side_effects)) {
          for (const effect of extractedData.side_effects) {
            if (!effect.name) continue;

            const { error: effectError } = await supabase
              .from('side_effects')
              .insert({
                medication_id: medicationId,
                name: effect.name,
                frequency: effect.frequency,
                body_system: effect.body_system,
                description: effect.description,
                severity: effect.severity
              });

            if (!effectError) {
              stats.sideEffectsAdded++;
            }
          }
        }

        // Insérer les interactions
        if (medicationId && extractedData.interactions && Array.isArray(extractedData.interactions)) {
          for (const interaction of extractedData.interactions) {
            if (!interaction.interacting_drug) continue;

            const { error: interactionError } = await supabase
              .from('drug_interactions')
              .insert({
                medication_id: medicationId,
                interacting_drug: interaction.interacting_drug,
                interaction_type: interaction.interaction_type,
                severity: interaction.severity,
                description: interaction.description,
                recommendation: interaction.recommendation
              });

            if (!interactionError) {
              stats.interactionsAdded++;
            }
          }
        }

        // Insérer les contre-indications
        if (medicationId && extractedData.contraindications && Array.isArray(extractedData.contraindications)) {
          for (const contra of extractedData.contraindications) {
            if (!contra.condition) continue;

            const { error: contraError } = await supabase
              .from('contraindications')
              .insert({
                medication_id: medicationId,
                condition: contra.condition,
                severity: contra.severity,
                description: contra.description
              });

            if (!contraError) {
              stats.contraindicationsAdded++;
            }
          }
        }
      }

      return new Response(JSON.stringify({
        success: true,
        url,
        extractedData,
        stats
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: Batch medications - Scraper plusieurs médicaments
    if (action === 'batch-medications') {
      const results = [];
      const batchUrls = urls || [];
      
      for (let i = 0; i < batchUrls.length; i++) {
        const currentUrl = batchUrls[i];
        console.log(`Batch medication ${i + 1}/${batchUrls.length}: ${currentUrl}`);
        
        try {
          const scrapeResult = await fetch(req.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': req.headers.get('Authorization') || ''
            },
            body: JSON.stringify({ action: 'scrape-medication', url: currentUrl, options })
          });
          
          const resultData = await scrapeResult.json();
          results.push({
            url: currentUrl,
            success: resultData.success,
            stats: resultData.stats
          });

          // Si rate limit, arrêter le batch
          if (resultData.rateLimited) {
            console.log('Rate limit atteint, arrêt du batch');
            break;
          }
        } catch (err: any) {
          console.error(`Erreur pour ${currentUrl}:`, err);
          results.push({
            url: currentUrl,
            success: false,
            error: err?.message || 'Erreur inconnue'
          });
        }

        // Pause pour éviter le rate limiting
        await new Promise(resolve => setTimeout(resolve, 8000));
      }

      const totalStats = results.reduce((acc, r) => {
        if (r.stats) {
          acc.medicationsAdded += r.stats.medicationsAdded || 0;
          acc.sideEffectsAdded += r.stats.sideEffectsAdded || 0;
          acc.interactionsAdded += r.stats.interactionsAdded || 0;
          acc.contraindicationsAdded += r.stats.contraindicationsAdded || 0;
        }
        return acc;
      }, { medicationsAdded: 0, sideEffectsAdded: 0, interactionsAdded: 0, contraindicationsAdded: 0 });

      return new Response(JSON.stringify({
        success: true,
        processed: results.length,
        results,
        totalStats
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: Scrape - Scraper une page et extraire les données (pathologies)
    if (action === 'scrape') {
      console.log('Scraping de la page:', url);

      let scrapeResult;
      try {
        scrapeResult = await scrapeWithRateLimitRetry(firecrawl, url);
      } catch (err: any) {
        const errorMessage = err?.message || String(err);
        // Retourner 429 spécifiquement pour le rate limiting
        if (errorMessage.includes('429') || errorMessage.includes('rate limit') || errorMessage.includes('Too Many')) {
          console.log('Rate limit final après retries pour:', url);
          return new Response(JSON.stringify({
            success: false,
            error: 'Rate limit Firecrawl - augmentez le délai entre requêtes',
            rateLimited: true
          }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw err;
      }

      if (!scrapeResult.success) {
        throw new Error('Échec du scraping de la page');
      }

      const markdown = scrapeResult.markdown || '';
      console.log('Contenu extrait, longueur:', markdown.length);

      // Extraction des données via Lovable AI
      const extractionPrompt = `Tu es un expert en extraction de données médicales. Analyse ce contenu markdown d'une page médicale et extrais TOUTES les informations disponibles au format JSON strict.

INSTRUCTIONS CRITIQUES:
- Réponds UNIQUEMENT avec le JSON, sans texte avant ou après
- Si une information n'est pas disponible, utilise null ou un tableau vide []
- Assure-toi que le JSON est valide
- Pour severity, utilise UNIQUEMENT: "mild", "moderate", "severe" ou "critical"
- IMPORTANT: Extrais TOUS les traitements mentionnés, même partiellement (médicaments, thérapies, chirurgies, conseils de style de vie, etc.)
- Les traitements incluent: médicaments, antibiotiques, analgésiques, chimiothérapie, radiothérapie, chirurgie, physiothérapie, psychothérapie, changements alimentaires, exercice, etc.

Format attendu:
{
  "pathology": {
    "name": "Nom de la pathologie en français (traduis si nécessaire)",
    "icd_code": "Code ICD-10 si mentionné ou null",
    "description": "Description complète de la pathologie (2-3 phrases)",
    "category": "Catégorie médicale (infectiologie, cardiologie, neurologie, etc.)",
    "specialty": "Spécialité médicale concernée",
    "severity": "mild ou moderate ou severe ou critical",
    "synonyms": ["autres noms de la pathologie"]
  },
  "symptoms": [
    {
      "name": "Nom du symptôme en français",
      "description": "Description du symptôme",
      "body_system": "Système corporel (respiratoire, cardiovasculaire, digestif, nerveux, etc.)",
      "is_primary": true,
      "frequency_percent": 80
    }
  ],
  "treatments": [
    {
      "name": "Nom du traitement/médicament en français",
      "type": "medication ou surgery ou therapy ou lifestyle ou other",
      "description": "Description du traitement et son utilisation",
      "contraindications": ["liste des contre-indications si mentionnées"]
    }
  ]
}

RAPPEL: Même si la page parle principalement de symptômes, extrais TOUS les traitements mentionnés!

Contenu à analyser:
${markdown.substring(0, 18000)}`;

      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'Tu es un expert médical qui extrait des données structurées de textes médicaux. Tu réponds uniquement en JSON valide.' },
            { role: 'user', content: extractionPrompt }
          ],
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('Erreur AI:', errorText);
        throw new Error(`Erreur de l'API AI: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const aiContent = aiData.choices?.[0]?.message?.content || '';
      
      // Parser le JSON de la réponse
      let extractedData;
      try {
        // Nettoyer la réponse (enlever les backticks markdown si présents)
        let cleanedContent = aiContent.trim();
        if (cleanedContent.startsWith('```json')) {
          cleanedContent = cleanedContent.slice(7);
        }
        if (cleanedContent.startsWith('```')) {
          cleanedContent = cleanedContent.slice(3);
        }
        if (cleanedContent.endsWith('```')) {
          cleanedContent = cleanedContent.slice(0, -3);
        }
        extractedData = JSON.parse(cleanedContent.trim());
      } catch (parseError) {
        console.error('Erreur de parsing JSON:', parseError, 'Contenu:', aiContent);
        throw new Error('Impossible de parser les données extraites');
      }

      // Insérer les données dans la base
      const stats = {
        pathologiesAdded: 0,
        symptomsAdded: 0,
        treatmentsAdded: 0,
        linksCreated: 0
      };

      // Insérer la pathologie
      if (extractedData.pathology?.name) {
        const { data: existingPathology } = await supabase
          .from('pathologies')
          .select('id')
          .ilike('name', extractedData.pathology.name)
          .maybeSingle();

        let pathologyId;
        
        if (!existingPathology) {
          // Valider la severity
          const validSeverities = ['mild', 'moderate', 'severe', 'critical'];
          let severity = extractedData.pathology.severity?.toLowerCase();
          if (!validSeverities.includes(severity)) {
            severity = 'moderate'; // Valeur par défaut
          }

          const { data: newPathology, error: pathError } = await supabase
            .from('pathologies')
            .insert({
              name: extractedData.pathology.name,
              icd_code: extractedData.pathology.icd_code,
              description: extractedData.pathology.description,
              category: extractedData.pathology.category,
              specialty: extractedData.pathology.specialty,
              severity: severity,
              synonyms: extractedData.pathology.synonyms || []
            })
            .select('id')
            .single();

          if (pathError) {
            console.error('Erreur insertion pathologie:', pathError);
          } else {
            pathologyId = newPathology?.id;
            stats.pathologiesAdded = 1;
          }
        } else {
          pathologyId = existingPathology.id;
        }

        // Insérer les symptômes
        if (extractedData.symptoms && Array.isArray(extractedData.symptoms)) {
          for (const symptom of extractedData.symptoms) {
            if (!symptom.name) continue;

            // Vérifier si le symptôme existe déjà
            const { data: existingSymptom } = await supabase
              .from('symptoms')
              .select('id')
              .ilike('name', symptom.name)
              .maybeSingle();

            let symptomId;

            if (!existingSymptom) {
              const { data: newSymptom, error: symError } = await supabase
                .from('symptoms')
                .insert({
                  name: symptom.name,
                  description: symptom.description,
                  body_system: symptom.body_system
                })
                .select('id')
                .single();

              if (!symError && newSymptom) {
                symptomId = newSymptom.id;
                stats.symptomsAdded++;
              }
            } else {
              symptomId = existingSymptom.id;
            }

            // Créer le lien pathologie-symptôme
            if (pathologyId && symptomId) {
              const { data: existingLink } = await supabase
                .from('pathology_symptoms')
                .select('id')
                .eq('pathology_id', pathologyId)
                .eq('symptom_id', symptomId)
                .maybeSingle();

              if (!existingLink) {
                const { error: linkError } = await supabase
                  .from('pathology_symptoms')
                  .insert({
                    pathology_id: pathologyId,
                    symptom_id: symptomId,
                    is_primary: symptom.is_primary || false,
                    frequency_percent: symptom.frequency_percent
                  });

                if (!linkError) {
                  stats.linksCreated++;
                }
              }
            }
          }
        }

        // Insérer les traitements
        console.log('Traitements extraits:', JSON.stringify(extractedData.treatments || []));
        console.log('PathologyId pour traitements:', pathologyId);
        
        if (extractedData.treatments && Array.isArray(extractedData.treatments) && pathologyId) {
          console.log(`Nombre de traitements à insérer: ${extractedData.treatments.length}`);
          
          for (const treatment of extractedData.treatments) {
            if (!treatment.name) {
              console.log('Traitement ignoré: pas de nom');
              continue;
            }

            console.log(`Traitement à insérer: ${treatment.name}`);

            const { data: existingTreatment } = await supabase
              .from('treatments')
              .select('id')
              .ilike('name', treatment.name)
              .eq('pathology_id', pathologyId)
              .maybeSingle();

            if (!existingTreatment) {
              // Mapper les types vers les valeurs valides de la contrainte
              const typeMapping: Record<string, string> = {
                'medicament': 'medication',
                'medication': 'medication',
                'chirurgie': 'surgery',
                'surgery': 'surgery',
                'cirugia': 'surgery',
                'therapie': 'therapy',
                'therapy': 'therapy',
                'lifestyle': 'lifestyle',
                'alimentacion': 'lifestyle',
                'autre': 'other',
                'other': 'other'
              };
              const validType = typeMapping[treatment.type?.toLowerCase()] || 'other';
              
              const { data: insertedTreatment, error: treatError } = await supabase
                .from('treatments')
                .insert({
                  pathology_id: pathologyId,
                  name: treatment.name,
                  type: validType,
                  description: treatment.description,
                  contraindications: treatment.contraindications || []
                })
                .select('id')
                .single();

              if (treatError) {
                console.error('Erreur insertion traitement:', treatError);
              } else {
                console.log(`Traitement inséré: ${treatment.name}, ID: ${insertedTreatment?.id}`);
                stats.treatmentsAdded++;
              }
            } else {
              console.log(`Traitement existe déjà: ${treatment.name}`);
            }
          }
        } else {
          console.log('Aucun traitement à insérer - treatments:', !!extractedData.treatments, 'isArray:', Array.isArray(extractedData.treatments), 'pathologyId:', !!pathologyId);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        url,
        extractedData,
        stats
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: Batch scrape - Scraper plusieurs URLs
    if (action === 'batch') {
      const results = [];
      const batchUrls = urls || [];
      
      for (let i = 0; i < batchUrls.length; i++) {
        const currentUrl = batchUrls[i];
        console.log(`Batch scraping ${i + 1}/${batchUrls.length}: ${currentUrl}`);
        
        try {
          // Appel récursif pour scraper chaque URL
          const scrapeResult = await fetch(req.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': req.headers.get('Authorization') || ''
            },
            body: JSON.stringify({ action: 'scrape', url: currentUrl, options })
          });
          
          const resultData = await scrapeResult.json();
          results.push({
            url: currentUrl,
            success: resultData.success,
            stats: resultData.stats
          });
        } catch (err: any) {
          console.error(`Erreur pour ${currentUrl}:`, err);
          results.push({
            url: currentUrl,
            success: false,
            error: err?.message || 'Erreur inconnue'
          });
        }

        // Pause pour éviter le rate limiting
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      const totalStats = results.reduce((acc, r) => {
        if (r.stats) {
          acc.pathologiesAdded += r.stats.pathologiesAdded || 0;
          acc.symptomsAdded += r.stats.symptomsAdded || 0;
          acc.treatmentsAdded += r.stats.treatmentsAdded || 0;
          acc.linksCreated += r.stats.linksCreated || 0;
        }
        return acc;
      }, { pathologiesAdded: 0, symptomsAdded: 0, treatmentsAdded: 0, linksCreated: 0 });

      return new Response(JSON.stringify({
        success: true,
        processed: results.length,
        results,
        totalStats
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Action non reconnue: ${action}`);

  } catch (error: any) {
    console.error('Erreur medical-scraper:', error);
    const errorMessage = error?.message || 'Erreur inconnue';
    
    // Vérifier si c'est une erreur 429 ou 402
    if (errorMessage.includes('429') || errorMessage.includes('rate limit') || errorMessage.includes('402')) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Rate limit ou crédits insuffisants - veuillez patienter ou vérifier votre quota Firecrawl',
        rateLimited: true
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
