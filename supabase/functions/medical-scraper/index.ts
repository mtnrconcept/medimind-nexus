import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import FirecrawlApp from "https://esm.sh/@mendable/firecrawl-js@1.0.0";
import { callAI } from "../_shared/ai-client.ts";

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
        console.log(`Rate limit (429) détecté, attente ${waitTime / 1000}s avant retry ${attempt}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      // Erreurs 502/503/504 (timeout serveur, bad gateway) - retry avec backoff
      if (errorMessage.includes('502') || errorMessage.includes('503') || errorMessage.includes('504') ||
        errorMessage.includes('Bad Gateway') || errorMessage.includes('Service Unavailable') ||
        errorMessage.includes('Gateway Timeout')) {
        const waitTime = 8000 * attempt; // 8s, 16s, 24s
        console.log(`Erreur serveur (${errorMessage.includes('502') ? '502' : errorMessage.includes('503') ? '503' : '504'}), attente ${waitTime / 1000}s avant retry ${attempt}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      // Autres erreurs réseau - retry avec backoff
      if (errorMessage.includes('Network') || errorMessage.includes('fetch') || errorMessage.includes('timeout')) {
        const waitTime = 5000 * attempt;
        console.log(`Erreur réseau, attente ${waitTime / 1000}s avant retry ${attempt}/${maxRetries}`);
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!firecrawlApiKey) throw new Error('FIRECRAWL_API_KEY non configurée');

    // Helper pour appeler l'IA (callAI gère OpenAI)
    async function extractWithAI(markdown: string, type: 'medication' | 'pathology' | 'molecule'): Promise<any> {
      const systemPrompt = type === 'medication'
        ? "Tu es un expert pharmacologue suisse. Extrais les données structurées de cette notice de médicament (Compendium.ch) en JSON strict."
        : type === 'molecule'
          ? "Tu es un chimiste expert. Extrais les données structurées de cette molécule en JSON strict."
          : "Tu es un médecin expert. Extrais les données structurées de cette page médicale en JSON strict.";

      const schemaMedication = `{
        "medication": {
          "name": "string", "manufacturer": "string", "swissmedic_name": "string", "characteristics": "string",
          "atc_code": "string", "atc_description": "string", "composition": "string", "substance": "string",
          "indications": "string", "posology": "string", "dosage_forms": ["string"],
          "pharmacode": "string", "gtin": "string", "dispensing_category": "string (A/B/C/D/E)",
          "therapeutic_area": "string"
        },
        "side_effects": [{"name": "string", "frequency": "string", "severity": "string", "description": "string"}],
        "interactions": [{"interacting_drug": "string", "interaction_type": "string", "severity": "string", "description": "string"}],
        "contraindications": [{"condition": "string", "severity": "string", "description": "string"}]
      }`;

      const schemaMolecule = `{
        "molecule": {
          "name": "string", "iupac_name": "string", "chemical_formula": "string", "smiles": "string",
          "molecular_weight": number, "description": "string", "indications": "string", 
          "side_effects": "string", "contraindications": "string", "therapeutic_category": "string"
        }
      }`;

      const schemaPathology = `{
        "pathology": {
          "name": "string", "icd_code": "string", "description": "string", "category": "string",
          "specialty": "string", "severity": "mild/moderate/severe/critical", "synonyms": ["string"]
        },
        "symptoms": [{"name": "string", "description": "string", "body_system": "string", "is_primary": boolean, "frequency_percent": number}],
        "treatments": [{"name": "string", "type": "medication/surgery/therapy/lifestyle/other", "description": "string", "contraindications": ["string"]}]
      }`;

      const userPrompt = `Extrais TOUTES les informations disponibles au format JSON.
      
      Schéma attendu:
      ${type === 'medication' ? schemaMedication : type === 'molecule' ? schemaMolecule : schemaPathology}

      Contenu Markdown:
      ${markdown.substring(0, 50000)} (tronqué si trop long)`;

      const aiResponse = await callAI(
        systemPrompt,
        userPrompt,
        {
          model: "gpt-5.5", // Optimisé
          maxTokens: 4000,
          temperature: 0
        }
      );

      const content = aiResponse.text;

      // Extraction du JSON depuis la réponse
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(content);
    }

    // Fonction d'extraction par parsing du markdown (sans IA)
    const extractMedicationFromMarkdown = (markdown: string, sourceUrl: string) => {
      const lines = markdown.split('\n');
      const data: any = {
        medication: {
          name: null,
          manufacturer: null,
          swissmedic_name: null,
          characteristics: null,
          atc_code: null,
          atc_description: null,
          composition: null,
          substance: null,
          indications: null,
          posology: null,
          dosage_forms: [],
          pharmacode: null,
          gtin: null,
          dispensing_category: null,
          therapeutic_area: null,
          source_url: sourceUrl
        },
        side_effects: [],
        interactions: [],
        contraindications: []
      };

      // Extraire le nom du médicament (premier titre H1 ou H2)
      for (const line of lines) {
        if (line.startsWith('# ') || line.startsWith('## ')) {
          data.medication.name = line.replace(/^#+\s*/, '').trim();
          data.medication.swissmedic_name = data.medication.name; // Par défaut, même que le nom
          break;
        }
      }

      // Chercher des patterns spécifiques
      const fullText = markdown.toLowerCase();

      // Code ATC
      const atcMatch = markdown.match(/(?:ATC|code\s+ATC)[:\s]*([A-Z]\d{2}[A-Z]{2}\d{2}|\w{5,7})/i);
      if (atcMatch) data.medication.atc_code = atcMatch[1].toUpperCase();

      // Fabricant
      const fabMatch = markdown.match(/(?:Titulaire|Fabricant|Manufacturer|Zulassungsinhaberin)[:\s]*([^\n]+)/i);
      if (fabMatch) data.medication.manufacturer = fabMatch[1].trim();

      // Substance active
      const substanceMatch = markdown.match(/(?:Principe actif|Substance active|Wirkstoff|Active substance)[:\s]*([^\n]+)/i);
      if (substanceMatch) data.medication.substance = substanceMatch[1].trim();

      // Composition
      const compositionMatch = markdown.match(/(?:Composition|Zusammensetzung)[:\s]*([^\n]+(?:\n[^#\n]+)*)/i);
      if (compositionMatch) data.medication.composition = compositionMatch[1].trim().substring(0, 1000);

      // Indications
      const indicMatch = markdown.match(/(?:Indications?|Anwendungsgebiet)[:\s]*([^\n]+(?:\n[^#\n]+)*)/i);
      if (indicMatch) data.medication.indications = indicMatch[1].trim().substring(0, 2000);

      // Posologie
      const posologyMatch = markdown.match(/(?:Posologie|Dosierung|Dosage)[:\s]*([^\n]+(?:\n[^#\n]+)*)/i);
      if (posologyMatch) data.medication.posology = posologyMatch[1].trim().substring(0, 1000);

      // Pharmacode
      const pharmacodeMatch = markdown.match(/(?:Pharmacode)[:\s]*(\d+)/i);
      if (pharmacodeMatch) data.medication.pharmacode = pharmacodeMatch[1];

      // GTIN
      const gtinMatch = markdown.match(/(?:GTIN|EAN)[:\s]*(\d{13})/i);
      if (gtinMatch) data.medication.gtin = gtinMatch[1];

      // Catégorie de remise
      const catMatch = markdown.match(/(?:Catégorie|Abgabekategorie)[:\s]*([A-E])/i);
      if (catMatch) data.medication.dispensing_category = catMatch[1].toUpperCase();

      // Contre-indications
      const contraMatch = markdown.match(/(?:Contre-indications?|Contraindications?|Gegenanzeigen)[:\s]*([^\n]+(?:\n[^#\n]+)*)/i);
      if (contraMatch) {
        const contraText = contraMatch[1].trim();
        const items = contraText.split(/[,;•\-\n]/).filter(s => s.trim().length > 3);
        data.contraindications = items.slice(0, 10).map(item => ({
          condition: item.trim().substring(0, 200),
          severity: 'absolute',
          description: item.trim()
        }));
      }

      // Effets secondaires
      const sideEffectsSection = markdown.match(/(?:Effets\s+(?:indésirables|secondaires)|Side\s+effects?|Nebenwirkungen)[:\s]*([^#]+?)(?=##|$)/i);
      if (sideEffectsSection) {
        const seText = sideEffectsSection[1];
        const seItems = seText.split(/[•\-\n]/).filter(s => s.trim().length > 3);
        data.side_effects = seItems.slice(0, 20).map(item => ({
          name: item.trim().substring(0, 100),
          frequency: 'common',
          severity: 'mild',
          description: item.trim().substring(0, 200)
        }));
      }

      return data;
    };

    // Fonction d'extraction pour les pathologies (améliorée pour Mayo Clinic etc.)
    const extractPathologyFromMarkdown = (markdown: string, sourceUrl: string) => {
      const lines = markdown.split('\n');
      const data: any = {
        pathology: {
          name: null,
          icd_code: null,
          description: null,
          category: 'Other',
          specialty: 'Médecine générale',
          severity: 'moderate',
          synonyms: [],
          source_url: sourceUrl
        },
        symptoms: [],
        treatments: []
      };

      // Chercher le nom de la pathologie (ignorer "On this page", "Overview", etc.)
      const skipTitles = ['on this page', 'overview', 'table of contents', 'contents', 'menu'];

      // D'abord essayer de trouver le nom après "## Overview"
      const overviewMatch = markdown.match(/##\s*Overview\s*\n+([^\n]+)/i);
      if (overviewMatch) {
        // Prendre la première phrase significative après Overview
        const firstSentence = overviewMatch[1].match(/^([^.]+)\./);
        if (firstSentence) {
          // Extraire le nom de la condition (première partie avant "is a condition" etc.)
          const nameMatch = firstSentence[1].match(/^(.+?)\s*(?:is|are|can be|involves|refers)/i);
          if (nameMatch) {
            data.pathology.name = nameMatch[1].replace(/\([^)]+\)/g, '').trim();
          }
        }
      }

      // Sinon chercher le premier titre pertinent
      if (!data.pathology.name) {
        for (const line of lines) {
          if (line.startsWith('# ') || line.startsWith('## ')) {
            const title = line.replace(/^#+\s*/, '').trim().toLowerCase();
            if (!skipTitles.includes(title)) {
              data.pathology.name = line.replace(/^#+\s*/, '').trim();
              break;
            }
          }
        }
      }

      // Chercher dans l'URL pour le nom si pas trouvé
      if (!data.pathology.name) {
        const urlMatch = sourceUrl.match(/diseases-conditions\/([^\/]+)/);
        if (urlMatch) {
          data.pathology.name = urlMatch[1].replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }
      }

      // Description - chercher le premier paragraphe après Overview
      const descMatch = markdown.match(/##\s*Overview\s*\n+([^\n]+(?:\n[^#\n]+)*)/i);
      if (descMatch) {
        data.pathology.description = descMatch[1].replace(/!\[.*?\]\(.*?\)/g, '').trim().substring(0, 1500);
      } else {
        // Fallback: premier paragraphe significatif
        for (const line of lines) {
          if (!line.startsWith('#') && !line.startsWith('-') && !line.startsWith('*') && line.trim().length > 80) {
            data.pathology.description = line.trim().substring(0, 1500);
            break;
          }
        }
      }

      // Symptômes - section ## Symptoms
      const symptomsSection = markdown.match(/##\s*Symptoms?\s*\n([\s\S]*?)(?=##|$)/i);
      if (symptomsSection) {
        const symText = symptomsSection[1];
        // Extraire les items en **bold** ou avec tirets
        const boldItems = symText.match(/\*\*([^*]+)\*\*/g) || [];
        const dashItems = symText.match(/^-\s+(.+)/gm) || [];

        const allSymptoms = new Set<string>();

        boldItems.forEach(item => {
          const clean = item.replace(/\*\*/g, '').trim();
          if (clean.length > 3 && clean.length < 100) {
            allSymptoms.add(clean);
          }
        });

        dashItems.forEach(item => {
          const clean = item.replace(/^-\s+/, '').replace(/\*\*/g, '').trim().substring(0, 100);
          if (clean.length > 3) {
            allSymptoms.add(clean);
          }
        });

        data.symptoms = Array.from(allSymptoms).slice(0, 15).map(name => ({
          name: name.substring(0, 100),
          description: name,
          body_system: 'Général'
        }));
      }

      // Traitements - chercher dans tout le contenu les mentions de traitements
      const treatmentPatterns = [
        /(?:treatment|traitement)s?\s+(?:include|incluent|such as|comme)\s+([^.]+)/gi,
        /(?:ice and rest|rest and ice|medications?|surgery|therapy|therapies|exercise|insoles)/gi,
        /##\s*Treatment\s*\n([\s\S]*?)(?=##|$)/i
      ];

      const treatments = new Set<string>();

      // Chercher les mentions de traitements dans le texte
      const treatmentKeywords = markdown.match(/(?:ice|rest|medications?|surgery|therapy|exercise|insoles|arch supports|physical therapy|massage|stretching)/gi);
      if (treatmentKeywords) {
        treatmentKeywords.forEach(t => treatments.add(t.toLowerCase()));
      }

      // Section Treatment explicite
      const treatSection = markdown.match(/##\s*Treatment\s*\n([\s\S]*?)(?=##|$)/i);
      if (treatSection) {
        const treatItems = treatSection[1].match(/\*\*([^*]+)\*\*/g) || [];
        treatItems.forEach(item => {
          treatments.add(item.replace(/\*\*/g, '').trim());
        });
      }

      data.treatments = Array.from(treatments).slice(0, 10).map(name => ({
        name: name.substring(0, 100),
        type: name.match(/surgery|chirurgie/i) ? 'surgery' :
          name.match(/therapy|exercise/i) ? 'therapy' :
            name.match(/medication|drug/i) ? 'medication' : 'lifestyle',
        description: `Traitement: ${name}`
      }));

      // Déterminer la catégorie et spécialité selon l'URL ou le contenu
      if (sourceUrl.includes('foot') || sourceUrl.includes('metatars')) {
        data.pathology.specialty = 'Orthopédie';
        data.pathology.category = 'Musculosquelettique';
      } else if (sourceUrl.includes('heart') || sourceUrl.includes('cardio')) {
        data.pathology.specialty = 'Cardiologie';
        data.pathology.category = 'Cardiovasculaire';
      } else if (sourceUrl.includes('lung') || sourceUrl.includes('respiratory')) {
        data.pathology.specialty = 'Pneumologie';
        data.pathology.category = 'Respiratoire';
      }

      return data;
    };

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
            lowerLink.includes('molecule') ||
            lowerLink.includes('medicament') ||
            lowerLink.includes('sommaire') ||
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

      // Extraction des données par l'IA
      const extractedData = await extractWithAI(markdown, 'medication');
      console.log('Données extraites:', extractedData.medication?.name);

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
          const med = extractedData.medication;
          const { data: newMed, error: medError } = await supabase
            .from('medications')
            .insert({
              name: med.name,
              manufacturer: med.manufacturer,
              swissmedic_name: med.swissmedic_name,
              characteristics: med.characteristics,
              atc_code: med.atc_code,
              composition: med.composition,
              substance: med.substance,
              description: med.atc_description || med.characteristics,
              dosage_forms: med.dosage_forms || [],
              indications: med.indications,
              posology: med.posology,
              pharmacode: med.pharmacode,
              gtin: med.gtin,
              dispensing_category: med.dispensing_category,
              source_url: url,
              category: med.therapeutic_area || null, // Nouvelle colonne uniformisée
              synonyms: null, // Nouvelle colonne uniformisée
              updated_at: new Date().toISOString()
            })
            .select('id')
            .single();

          if (medError) {
            console.error('Erreur insertion médicament:', medError);
          } else {
            medicationId = newMed?.id;
            stats.medicationsAdded = 1;
            console.log(`Médicament inséré: ${med.name} (ATC: ${med.atc_code}, Pharmacode: ${med.pharmacode})`);
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
    // Action: Scrape molecule - Scraper une page de molécule Creapharma
    if (action === 'scrape-molecule') {
      console.log('Scraping molécule:', url);

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
        throw new Error('Échec du scraping de la molécule');
      }

      const markdown = scrapeResult.markdown || '';
      console.log('Contenu molécule extrait, longueur:', markdown.length);

      // Extraction des données par l'IA
      const extractedData = await extractWithAI(markdown, 'molecule');
      console.log('Données extraites:', extractedData.molecule?.name);

      const stats = {
        moleculesAdded: 0,
        moleculesUpdated: 0
      };

      // Insérer la molécule dans substances
      if (extractedData.molecule?.name) {
        const mol = extractedData.molecule;
        const normalizedName = mol.name.trim().toLowerCase();

        const { data: existingMol } = await supabase
          .from('substances')
          .select('id, properties')
          .eq('name_normalized', normalizedName)
          .maybeSingle();

        if (!existingMol) {
          const { error: insertError } = await supabase
            .from('substances')
            .insert({
              name: mol.name,
              source: 'creapharma',
              properties: {
                iupacName: mol.iupac_name,
                formula: mol.chemical_formula,
                smiles: mol.smiles,
                molecularWeight: mol.molecular_weight,
                description: mol.description,
                indications: mol.indications,
                sideEffects: mol.side_effects,
                contraindications: mol.contraindications,
                therapeuticCategory: mol.therapeutic_category,
                sourceUrl: url
              }
            });

          if (insertError) {
            console.error('Erreur insertion molécule:', insertError);
          } else {
            stats.moleculesAdded = 1;
            console.log(`Molécule insérée: ${mol.name}`);
          }
        } else {
          // Update existing with new fields if missing
          const updatedProperties = {
            ...existingMol.properties,
            iupacName: mol.iupac_name || existingMol.properties?.iupacName,
            formula: mol.chemical_formula || existingMol.properties?.formula,
            smiles: mol.smiles || existingMol.properties?.smiles,
            molecularWeight: mol.molecular_weight || existingMol.properties?.molecularWeight,
            description: mol.description || existingMol.properties?.description,
            indications: mol.indications || existingMol.properties?.indications,
            sideEffects: mol.side_effects || existingMol.properties?.sideEffects,
            contraindications: mol.contraindications || existingMol.properties?.contraindications,
            therapeuticCategory: mol.therapeutic_category || existingMol.properties?.therapeuticCategory,
            sourceUrl: url
          };

          const { error: updateError } = await supabase
            .from('substances')
            .update({ properties: updatedProperties })
            .eq('id', existingMol.id);

          if (updateError) {
            console.error('Erreur mise à jour molécule:', updateError);
          } else {
            stats.moleculesUpdated = 1;
            console.log(`Molécule mise à jour: ${mol.name}`);
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

    // Action: Batch molecules - Scraper plusieurs molécules
    if (action === 'batch-molecules') {
      const results = [];
      const batchUrls = urls || [];

      for (let i = 0; i < batchUrls.length; i++) {
        const currentUrl = batchUrls[i];
        console.log(`Batch molecule ${i + 1}/${batchUrls.length}: ${currentUrl}`);

        try {
          const scrapeResult = await fetch(req.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': req.headers.get('Authorization') || ''
            },
            body: JSON.stringify({ action: 'scrape-molecule', url: currentUrl, options })
          });

          const resultData = await scrapeResult.json();
          results.push({
            url: currentUrl,
            success: resultData.success,
            stats: resultData.stats
          });

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
          acc.moleculesAdded += r.stats.moleculesAdded || 0;
          acc.moleculesUpdated += r.stats.moleculesUpdated || 0;
        }
        return acc;
      }, { moleculesAdded: 0, moleculesUpdated: 0 });

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

      // Extraction des données par l'IA
      const extractedData = await extractWithAI(markdown, 'pathology');
      console.log('Données extraites:', extractedData.pathology?.name);

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
              synonyms: extractedData.pathology.synonyms || [],
              updated_at: new Date().toISOString()
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
                  body_system: symptom.body_system,
                  category: symptom.body_system, // Uniformisation: category = body_system
                  severity: symptom.severity || null,
                  synonyms: null
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
                  contraindications: treatment.contraindications || [],
                  severity: null, // Sera renseigné selon la situation clinique
                  updated_at: new Date().toISOString()
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

    // Action: Enrich medications - Scrape Compendium to update substance/composition for existing medications
    if (action === 'enrich-medications') {
      console.log('Enrichissement des médicaments avec données Compendium');

      // Get medications without substance data
      const { data: medsToEnrich, error: fetchError } = await supabase
        .from('medications')
        .select('id, name, substance, composition, atc_code')
        .or('substance.is.null,substance.eq.')
        .limit(options?.limit || 20);

      if (fetchError) throw fetchError;

      console.log(`${medsToEnrich?.length || 0} médicaments à enrichir`);

      const results: any[] = [];
      const enrichedCount = { updated: 0, failed: 0, skipped: 0 };

      for (const med of medsToEnrich || []) {
        console.log(`Enrichissement: ${med.name}`);

        try {
          // Search for medication on Compendium.ch
          const searchUrl = `https://compendium.ch/fr/search?q=${encodeURIComponent(med.name)}`;

          const searchResult = await scrapeWithRateLimitRetry(firecrawl, searchUrl);
          if (!searchResult.success) {
            console.log(`Pas de résultat pour ${med.name}`);
            enrichedCount.skipped++;
            continue;
          }

          // Try to find a product link in the search results
          const markdown = searchResult.markdown || '';
          const productMatch = markdown.match(/\[([^\]]+)\]\((https:\/\/compendium\.ch\/fr\/product\/[^\)]+)\)/);

          if (!productMatch) {
            console.log(`Pas de lien produit trouvé pour ${med.name}`);
            enrichedCount.skipped++;
            continue;
          }

          const productUrl = productMatch[2];
          console.log(`Scraping produit: ${productUrl}`);

          // Scrape the product page
          const productResult = await scrapeWithRateLimitRetry(firecrawl, productUrl);
          if (!productResult.success) {
            enrichedCount.failed++;
            continue;
          }

          const productMarkdown = productResult.markdown || '';

          // Extract substance and composition using regex (fast, no API call)
          let substance = null;
          let composition = null;
          let atcCode = null;

          const substanceMatch = productMarkdown.match(/(?:Principe actif|Substance active|Wirkstoff)[:\s]*([^\n]+)/i);
          if (substanceMatch) substance = substanceMatch[1].trim().substring(0, 200);

          const compositionMatch = productMarkdown.match(/(?:Composition|Zusammensetzung)[:\s]*([^\n]+(?:\n[^#\n]+)*)/i);
          if (compositionMatch) composition = compositionMatch[1].trim().substring(0, 1000);

          const atcMatch = productMarkdown.match(/(?:ATC|code\s+ATC)[:\s]*([A-Z]\d{2}[A-Z]{2}\d{2})/i);
          if (atcMatch) atcCode = atcMatch[1].toUpperCase();

          if (substance || composition || atcCode) {
            // Update medication
            const updateData: any = {};
            if (substance) updateData.substance = substance;
            if (composition) updateData.composition = composition;
            if (atcCode && !med.atc_code) updateData.atc_code = atcCode;
            updateData.source_url = productUrl;
            updateData.updated_at = new Date().toISOString();

            const { error: updateError } = await supabase
              .from('medications')
              .update(updateData)
              .eq('id', med.id);

            if (!updateError) {
              enrichedCount.updated++;
              results.push({
                id: med.id,
                name: med.name,
                substance,
                atcCode,
                success: true
              });
              console.log(`✓ ${med.name} enrichi: ${substance}`);
            } else {
              enrichedCount.failed++;
              console.error(`Erreur update ${med.name}:`, updateError);
            }
          } else {
            enrichedCount.skipped++;
            console.log(`Pas de données extraites pour ${med.name}`);
          }

          // Pause to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 5000));

        } catch (err: any) {
          console.error(`Erreur pour ${med.name}:`, err?.message);
          enrichedCount.failed++;

          if (err?.message?.includes('429') || err?.message?.includes('rate limit')) {
            console.log('Rate limit atteint, arrêt');
            break;
          }
        }
      }

      return new Response(JSON.stringify({
        success: true,
        totalToEnrich: medsToEnrich?.length || 0,
        enrichedCount,
        results
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Action: Scrape equivalence tables - Extract drug equivalence data from ClinCalc, PsychiatrieNet, etc.
    if (action === 'scrape-equivalence') {
      console.log('Scraping equivalence table:', url);

      const category = options?.category || 'benzodiazepine'; // benzodiazepine, antipsychotic, opioid

      let scrapeResult;
      try {
        scrapeResult = await scrapeWithRateLimitRetry(firecrawl, url);
      } catch (err: any) {
        const errorMessage = err?.message || String(err);
        if (errorMessage.includes('429') || errorMessage.includes('rate limit') || errorMessage.includes('402')) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Rate limit Firecrawl',
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
      console.log('Contenu extraction équivalence, longueur:', markdown.length);

      // Extract equivalence data using AI with fallback (OpenAI -> Gemini)
      const equivalencePrompt = `Tu es un pharmacologue expert. Extrais les données d'équivalence de cette page.

Catégorie: ${category}

Schéma JSON strict attendu:
{
  "reference_drug": "string (médicament de référence, ex: diazepam pour benzos, chlorpromazine pour AP)",
  "reference_dose": number (dose de référence en mg),
  "equivalences": [
    {
      "drug_name": "string",
      "equivalent_dose": number,
      "unit": "mg",
      "half_life_hours": number ou null,
      "half_life_range": "string (ex: '6-12')",
      "onset": "rapid|intermediate|slow",
      "duration": "short|intermediate|long",
      "active_metabolites": boolean,
      "notes": "string"
    }
  ]
}

Contenu Markdown:
${markdown.substring(0, 40000)}`;

      // Use callAI which handles OpenAI automatically
      const aiResponse = await callAI(
        'Tu es un pharmacologue expert en équivalences médicamenteuses.',
        equivalencePrompt,
        {
          model: "gpt-5.5",
          maxTokens: 4000,
          temperature: 0
        }
      );

      const content = aiResponse.text;
      console.log(`[scrape-equivalence] AI response from ${aiResponse.provider} (${aiResponse.model})`);

      // Parse JSON from OpenAI response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      let extractedData;
      try {
        extractedData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(content);
      } catch (e) {
        console.error('Failed to parse equivalence JSON:', content);
        throw new Error('Failed to parse OpenAI response');
      }

      console.log('Equivalences extracted:', extractedData.equivalences?.length || 0);

      // Insert into drug_equivalences table
      const stats = { added: 0, updated: 0, errors: 0 };

      if (extractedData.equivalences && Array.isArray(extractedData.equivalences)) {
        for (const eq of extractedData.equivalences) {
          try {
            const payload = {
              category,
              drug_name: eq.drug_name,
              equivalent_dose: eq.equivalent_dose,
              unit: eq.unit || 'mg',
              reference_drug: extractedData.reference_drug || (category === 'benzodiazepine' ? 'diazepam' : 'chlorpromazine'),
              reference_dose: extractedData.reference_dose || (category === 'benzodiazepine' ? 10 : 100),
              half_life_hours: eq.half_life_hours,
              half_life_range: eq.half_life_range,
              onset: eq.onset,
              duration: eq.duration,
              active_metabolites: eq.active_metabolites || false,
              notes: eq.notes,
              source_url: url,
              updated_at: new Date().toISOString()
            };

            const { error } = await supabase
              .from('drug_equivalences')
              .upsert(payload, { onConflict: 'category,drug_name' });

            if (error) {
              console.error('Error inserting equivalence:', error);
              stats.errors++;
            } else {
              stats.added++;
            }
          } catch (e: any) {
            console.error('Error processing equivalence:', e);
            stats.errors++;
          }
        }
      }

      return new Response(JSON.stringify({
        success: true,
        url,
        category,
        extractedData,
        stats
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
