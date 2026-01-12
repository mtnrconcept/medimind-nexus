
import FirecrawlApp from '@mendable/firecrawl-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config();

const API_KEY = process.env.FIRECRAWL_API_KEY || process.env.VITE_FIRECRAWL_API_KEY;
const BASE_URL = 'https://www.creapharma.ch/medicaments-en-suisse/molecules-en-suisse';

if (!API_KEY) {
    console.error('Error: FIRECRAWL_API_KEY or VITE_FIRECRAWL_API_KEY not found in environment');
    process.exit(1);
}

const app = new FirecrawlApp({ apiKey: API_KEY });

async function scrapeMolecules() {
    console.log('Mapping Creapharma molecule URLs...');

    // 1. Map the URLs to find all molecule pages
    const mapResult = await app.mapUrl(BASE_URL, {
        search: 'medicaments-sommaire', // Creapharma molecule pages often use this path
    });

    if (!mapResult.success) {
        console.error('Failed to map URLs:', mapResult.error);
        return;
    }

    const urls = mapResult.links.filter((link: string) =>
        link.includes('/medicaments-sommaire/') ||
        link.endsWith('.htm') && !link.includes('/medicaments-en-suisse/')
    );

    console.log(`Found ${urls.length} potential molecule URLs.`);

    const results = [];
    const outputPath = path.join(process.cwd(), 'data', 'scraped-molecules.json');

    if (!fs.existsSync(path.join(process.cwd(), 'data'))) {
        fs.mkdirSync(path.join(process.cwd(), 'data'));
    }

    // 2. Scrape and extract data from each URL
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        console.log(`[${i + 1}/${urls.length}] Extracting data from: ${url}`);

        try {
            const extractResult = await app.scrapeUrl(url, {
                formats: ['json'],
                jsonOptions: {
                    schema: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            description: { type: "string" },
                            indications: { type: "string" },
                            side_effects: { type: "string" },
                            contraindications: { type: "string" },
                            dosage: { type: "string" },
                            iupac_name: { type: "string" },
                            chemical_formula: { type: "string" },
                            smiles: { type: "string" },
                            molecular_weight: { type: "number" },
                            therapeutic_category: { type: "string" }
                        },
                        required: ["name", "description"]
                    }
                }
            });

            if (extractResult.success) {
                results.push({
                    url,
                    data: extractResult.json
                });
                console.log(`Successfully extracted: ${extractResult.json.name}`);
            } else {
                console.error(`Failed to extract from ${url}:`, extractResult.error);
            }
        } catch (error) {
            console.error(`Error extracting from ${url}:`, error);
        }

        // Save progressively
        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

        // Add a delay to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`Scraping complete. Results saved to ${outputPath}`);
}

scrapeMolecules().catch(console.error);
