"""
MediMind NLP Service - FastAPI Application
Biomedical entity extraction using scispaCy
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

# Global NLP model - will be None if spacy not available
nlp = None
SPACY_AVAILABLE = False

try:
    import spacy
    SPACY_AVAILABLE = True
except ImportError:
    print("⚠️ spaCy not available - using fallback mode")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load NLP model on startup"""
    global nlp
    if SPACY_AVAILABLE:
        print("🔬 Loading spaCy model...")
        import spacy
        try:
            nlp = spacy.load("en_core_sci_lg")
            print("✅ Loaded en_core_sci_lg (biomedical)")
        except OSError:
            try:
                nlp = spacy.load("en_core_web_sm")
                print("✅ Loaded en_core_web_sm (fallback)")
            except OSError:
                print("⚠️ No spacy model found, using regex fallback")
                nlp = None
    else:
        print("⚠️ spaCy not available, using regex fallback")
    yield
    print("👋 Shutting down NLP service")

app = FastAPI(
    title="MediMind NLP Service",
    description="Biomedical NLP extraction using scispaCy",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routers
from app.routers import extract, embeddings

app.include_router(extract.router, prefix="/extract", tags=["Extraction"])
app.include_router(embeddings.router, prefix="/embed", tags=["Embeddings"])

@app.get("/")
async def root():
    return {
        "service": "MediMind NLP",
        "status": "running",
        "model_loaded": nlp is not None
    }

@app.get("/health")
async def health():
    return {"status": "healthy", "nlp_ready": nlp is not None}
