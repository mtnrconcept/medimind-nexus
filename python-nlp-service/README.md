# MediMind NLP Service

Python FastAPI microservice for biomedical NLP using scispaCy and
server-side OpenAI clinical synthesis.

## Features

- **Entity Extraction**: Biomedical NER with UMLS linking
- **Relation Extraction**: Drug-disease-gene relations
- **Embeddings**: Sentence-transformers for semantic search
- **Deep Research**: PubMed retrieval plus OpenAI clinical analysis using
  `OPENAI_API_KEY`

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Service info |
| GET | `/health` | Health check |
| POST | `/extract/entities` | Extract entities from text |
| POST | `/extract/relations` | Extract relations |
| POST | `/extract/full` | Full extraction (entities + relations + evidence level) |
| POST | `/extract/batch` | Batch entity extraction |
| POST | `/embed` | Generate embeddings |
| POST | `/embed/similarity` | Find similar texts |

## Local Development

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Install dependencies
pip install -r requirements.txt

# Download spaCy model
python -m spacy download en_core_sci_lg

# Run server
uvicorn app.main:app --reload --port 8000
```

Required AI environment variables:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.5
OPENAI_SIMPLE_MODEL=gpt-5.4-mini
OPENAI_CRITICAL_MODEL=gpt-5.5
```

The OpenAI key must stay server-side. Browser prototypes must not read or embed
`OPENAI_API_KEY`.

## Docker

```bash
docker build -t medimind-nlp .
docker run -p 8000:8000 medimind-nlp
```

## Deploy to Railway

```bash
railway login
railway init
railway up
```

## API Usage

```python
import httpx

# Extract entities
response = httpx.post("http://localhost:8000/extract/entities", json={
    "text": "Metformin reduces HbA1c in Type 2 Diabetes"
})
print(response.json())

# Get embeddings
response = httpx.post("http://localhost:8000/embed", json={
    "texts": ["Parkinson disease treatment", "Alzheimer therapy"]
})
print(response.json())
```
