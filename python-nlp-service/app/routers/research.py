"""
Deep Research Router
Performs advanced medical research using PubMed and AI analysis.
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import os
from Bio import Entrez
import json
from ..services.ai_client import call_ai

router = APIRouter()

# Configure Entrez
Entrez.email = "medimind-nexus@example.com"  # Should be configurable

class WebSource(BaseModel):
    title: str
    url: str
    snippet: Optional[str] = None
    journal: Optional[str] = None
    year: Optional[str] = None

class PathologyMatch(BaseModel):
    name: str
    icdCode: Optional[str] = None
    confidence: str = Field(..., description="'high' | 'medium' | 'low'")
    matchedSymptoms: List[str]
    description: str
    severity: Optional[str] = None
    treatmentSuggestions: Optional[List[str]] = None
    sources: List[WebSource] = []
    isInDatabase: bool = False
    databaseId: Optional[str] = None

class DeepResearchResult(BaseModel):
    pathologies: List[PathologyMatch]
    summary: str
    differentialDiagnosis: str
    redFlags: List[str]
    recommendedTests: List[str]
    webSourcesCount: int

class ResearchInput(BaseModel):
    symptomNames: List[str]
    symptomIds: Optional[List[str]] = None

async def search_pubmed(query: str, max_results: int = 5) -> List[WebSource]:
    """Search PubMed using BioPython"""
    try:
        api_key = os.getenv("NCBI_API_KEY")
        if api_key:
            Entrez.api_key = api_key

        # Search
        handle = Entrez.esearch(db="pubmed", term=query, retmax=max_results, sort="relevance")
        record = Entrez.read(handle)
        handle.close()
        
        id_list = record["IdList"]
        if not id_list:
            return []

        # Fetch details
        handle = Entrez.efetch(db="pubmed", id=id_list, retmode="xml")
        articles = Entrez.read(handle)
        handle.close()

        sources = []
        if 'PubmedArticle' in articles:
            for article in articles['PubmedArticle']:
                try:
                    medline_citation = article['MedlineCitation']
                    article_data = medline_citation['Article']
                    
                    pmid = str(medline_citation['PMID'])
                    title = article_data.get('ArticleTitle', 'No Title')
                    
                    abstract_list = article_data.get('Abstract', {}).get('AbstractText', [])
                    abstract = " ".join(abstract_list) if abstract_list else "No abstract available."
                    
                    journal = article_data.get('Journal', {}).get('Title', '')
                    year = article_data.get('Journal', {}).get('JournalIssue', {}).get('PubDate', {}).get('Year', '')
                    
                    sources.append(WebSource(
                        title=title,
                        url=f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/",
                        snippet=f"[{year} - {journal}] {abstract}"[:500] + "...",
                        journal=journal,
                        year=year
                    ))
                except Exception as e:
                    print(f"Error parsing article: {e}")
                    continue
                    
        return sources

    except Exception as e:
        print(f"PubMed search error: {e}")
        return []

@router.post("/deep", response_model=Dict[str, Any])
async def perform_deep_research(input: ResearchInput):
    """
    Perform deep research on symptoms.
    1. Search PubMed
    2. Analyze with OpenAI through the shared clinical route
    3. Return structured differential diagnosis
    """
    try:
        if not input.symptomNames:
            raise HTTPException(status_code=400, detail="No symptoms provided")

        # 1. PubMed Search
        symptom_query = " AND ".join(input.symptomNames)
        pubmed_query = f"{symptom_query} diagnosis differential"
        print(f"Searching PubMed: {pubmed_query}")
        
        sources = await search_pubmed(pubmed_query, max_results=10)
        
        # Additional search if needed
        if len(input.symptomNames) >= 2:
            combined_query = f"{' '.join(input.symptomNames[:3])} syndrome disease"
            additional_sources = await search_pubmed(combined_query, max_results=5)
            # Remove duplicates based on URL
            existing_urls = {s.url for s in sources}
            for s in additional_sources:
                if s.url not in existing_urls:
                    sources.append(s)
        
        # Format sources for Context
        web_context = "\n".join([f"- \"{s.title}\" ({s.url})\n  Snippet: {s.snippet}" for s in sources])
        
        # 2. AI analysis through OpenAI with clinical routing and safety contract
        system_prompt = """You are a medical expert specializing in differential diagnosis. Perform "Deep Research" analyzing the provided symptoms to identify ALL possible pathologies.
        
IMPORTANT: Answer ONLY in FRENCH.

You must:
1. Analyze the symptoms
2. Identify all possible pathologies (common and rare)
3. Rank by probability/relevance
4. Identify red flags
5. Suggest further tests

Answer ONLY in valid JSON with this exact structure:
{
  "pathologies": [
    {
      "name": "Pathology Name",
      "icdCode": "ICD-10/11 Code",
      "confidence": "high" | "medium" | "low",
      "matchedSymptoms": ["symptom1", "symptom2"],
      "description": "Short description",
      "severity": "mild" | "moderate" | "severe" | "critical",
      "treatmentSuggestions": ["treatment1"],
      "sources": [{"title": "title", "url": "url"}]
    }
  ],
  "summary": "Analysis summary in 2-3 sentences",
  "differentialDiagnosis": "Explanation of differential diagnosis",
  "redFlags": ["red flag 1"],
  "recommendedTests": ["test 1"]
}
"""

        user_prompt = f"""Perform Deep Research for these symptoms:

## REPORTED SYMPTOMS
{chr(10).join([f'- {s}' for s in input.symptomNames])}

## SCIENTIFIC SOURCES (PubMed)
{web_context or 'No specific sources found.'}

Analyze these symptoms and identify pathologies. Include:
1. Common medical conditions matching these symptoms
2. Rare but important pathologies not to miss
3. Rank by probability

Reply in JSON only.
"""

        print("Calling OpenAI clinical route...")
        ai_response = await call_ai(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            model=os.getenv("OPENAI_MODEL", "gpt-5.5"),
            max_tokens=4096,
            temperature=0.3
        )
        
        content = ai_response.text
        print(f"AI Response received from {ai_response.provider} ({ai_response.model})")
        
        # Parse JSON
        try:
            # Try to find JSON block if wrapped in text
            json_start = content.find('{')
            json_end = content.rfind('}') + 1
            if json_start >= 0 and json_end > json_start:
                json_str = content[json_start:json_end]
                result_data = json.loads(json_str)
            else:
                result_data = json.loads(content)
                
            # Add stats
            result_data["webSourcesCount"] = len(sources)
            
            return {
                "result": result_data,
                "context": {
                    "symptomsAnalyzed": len(input.symptomNames),
                    "pubmedSources": len(sources)
                }
            }
            
        except json.JSONDecodeError as e:
            print(f"JSON Parse Error: {e}")
            print(f"Content received: {content[:500]}...")
            raise HTTPException(status_code=500, detail="Failed to parse AI response")

    except Exception as e:
        print(f"Deep Research Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
