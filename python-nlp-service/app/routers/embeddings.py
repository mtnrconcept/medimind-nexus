"""
Embeddings Router
Generates vector embeddings using sentence-transformers
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from sentence_transformers import SentenceTransformer
import numpy as np

router = APIRouter()

# Load model on startup (lightweight model for speed)
model = None

def get_model():
    global model
    if model is None:
        print("📦 Loading sentence-transformers model...")
        model = SentenceTransformer('all-MiniLM-L6-v2')
        print("✅ Embeddings model loaded")
    return model

class TextsInput(BaseModel):
    texts: List[str]
    
class EmbeddingResponse(BaseModel):
    embeddings: List[List[float]]
    dimension: int

class SimilarityInput(BaseModel):
    query: str
    candidates: List[str]
    top_k: int = 5

class SimilarityResult(BaseModel):
    text: str
    score: float
    index: int

class SimilarityResponse(BaseModel):
    results: List[SimilarityResult]

@router.post("/", response_model=EmbeddingResponse)
async def create_embeddings(input: TextsInput):
    """
    Generate embeddings for a list of texts.
    Returns 384-dimensional vectors (MiniLM).
    """
    if not input.texts:
        raise HTTPException(status_code=400, detail="No texts provided")
    
    model = get_model()
    
    # Generate embeddings
    embeddings = model.encode(input.texts, convert_to_numpy=True)
    
    # Convert to list for JSON serialization
    embeddings_list = embeddings.tolist()
    
    return EmbeddingResponse(
        embeddings=embeddings_list,
        dimension=len(embeddings_list[0]) if embeddings_list else 0
    )

@router.post("/similarity", response_model=SimilarityResponse)
async def compute_similarity(input: SimilarityInput):
    """
    Find most similar texts to a query.
    Useful for semantic search.
    """
    if not input.candidates:
        raise HTTPException(status_code=400, detail="No candidates provided")
    
    model = get_model()
    
    # Encode query and candidates
    query_embedding = model.encode([input.query], convert_to_numpy=True)[0]
    candidate_embeddings = model.encode(input.candidates, convert_to_numpy=True)
    
    # Compute cosine similarity
    similarities = np.dot(candidate_embeddings, query_embedding) / (
        np.linalg.norm(candidate_embeddings, axis=1) * np.linalg.norm(query_embedding)
    )
    
    # Get top-k results
    top_indices = np.argsort(similarities)[::-1][:input.top_k]
    
    results = [
        SimilarityResult(
            text=input.candidates[idx],
            score=float(similarities[idx]),
            index=int(idx)
        )
        for idx in top_indices
    ]
    
    return SimilarityResponse(results=results)

@router.post("/batch-similarity")
async def batch_similarity(queries: List[str], candidates: List[str], top_k: int = 3):
    """
    Compute similarity for multiple queries at once.
    """
    model = get_model()
    
    query_embeddings = model.encode(queries, convert_to_numpy=True)
    candidate_embeddings = model.encode(candidates, convert_to_numpy=True)
    
    # Compute all similarities
    similarities = np.dot(query_embeddings, candidate_embeddings.T)
    
    results = []
    for i, query in enumerate(queries):
        top_indices = np.argsort(similarities[i])[::-1][:top_k]
        results.append({
            "query": query,
            "matches": [
                {"text": candidates[idx], "score": float(similarities[i][idx])}
                for idx in top_indices
            ]
        })
    
    return results
