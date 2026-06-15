import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PubMedArticle {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  pubDate: string;
  abstract: string;
  url: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, maxResults = 10 } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Query parameter is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 1: Search for article IDs
    let searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json&sort=relevance`;
    const searchApiKey = Deno.env.get("NCBI_API_KEY");
    if (searchApiKey) {
      searchUrl += `&api_key=${searchApiKey}`;
    }

    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    const ids = searchData?.esearchresult?.idlist || [];

    if (ids.length === 0) {
      return new Response(
        JSON.stringify({ articles: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Fetch article details using efetch (XML) for full abstracts
    let fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml`;

    // Add API Key if available (though explicit check usually better, here we assume public or inject if env exists)
    // Actually, let's try to get it from env if possible, but Deno.env might not be fully typed here without declaration.
    // Just in case, checking env.
    const apiKey = Deno.env.get("NCBI_API_KEY");
    if (apiKey) {
      fetchUrl += `&api_key=${apiKey}`;
    }

    const fetchResponse = await fetch(fetchUrl);
    const xmlText = await fetchResponse.text();

    const articles: PubMedArticle[] = [];

    // Simple XML split
    const xmlArticles = xmlText.split('</PubmedArticle>');

    for (const articleXml of xmlArticles) {
      if (!articleXml.includes('<PubmedArticle>')) continue;

      const idMatch = articleXml.match(/<PMID[^>]*>(.*?)<\/PMID>/);
      const id = idMatch ? idMatch[1] : '';
      if (!id) continue;

      const titleMatch = articleXml.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/);
      const title = titleMatch ? titleMatch[1] : "Sans titre";

      const abstractMatches = [...articleXml.matchAll(/<AbstractText[^>]*>(.*?)<\/AbstractText>/g)];
      const abstract = abstractMatches.map(m => m[1]).join(" ");

      const journalMatch = articleXml.match(/<Title>(.*?)<\/Title>/);
      const journal = journalMatch ? journalMatch[1] : "";

      const yearMatch = articleXml.match(/<Year>(.*?)<\/Year>/);
      const year = yearMatch ? yearMatch[1] : "";

      const authorMatches = [...articleXml.matchAll(/<LastName>(.*?)<\/LastName>.*?<Initials>(.*?)<\/Initials>/gs)];
      const authors = authorMatches.map(m => `${m[1]} ${m[2]}`);

      articles.push({
        pmid: id,
        title: title,
        authors: authors,
        journal: journal,
        pubDate: year,
        abstract: abstract || "Résumé non disponible.",
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      });
    }

    return new Response(
      JSON.stringify({ articles }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("PubMed API error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch from PubMed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
