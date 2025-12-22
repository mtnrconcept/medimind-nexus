"""
Entity and Relation Extraction Router
Uses scispaCy for biomedical NER
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import spacy

router = APIRouter()

# Pydantic models
class TextInput(BaseModel):
    text: str
    
class BatchTextInput(BaseModel):
    texts: List[str]

class Entity(BaseModel):
    text: str
    type: str
    start: int
    end: int
    confidence: float
    umls_cui: Optional[str] = None

class Relation(BaseModel):
    subject: str
    predicate: str
    object: str
    confidence: float
    evidence_text: str

class ExtractionResponse(BaseModel):
    entities: List[Entity]
    entity_count: int

class RelationResponse(BaseModel):
    relations: List[Relation]
    
class FullExtractionResponse(BaseModel):
    entities: List[Entity]
    relations: List[Relation]
    evidence_level: str
    summary: dict

# Entity type mapping for biomedical domain
ENTITY_TYPE_MAP = {
    "CHEMICAL": "DRUG",
    "DISEASE": "DISEASE", 
    "GENE_OR_GENE_PRODUCT": "GENE",
    "ORGANISM": "ORGANISM",
    "CELL_TYPE": "CELL_TYPE",
    "CELL_LINE": "CELL_LINE",
    "DNA": "GENE",
    "RNA": "GENE",
    "PROTEIN": "PROTEIN",
    "AMINO_ACID": "MOLECULE",
    "SIMPLE_CHEMICAL": "MOLECULE"
}

def get_nlp():
    """Get the global NLP model"""
    from app.main import nlp
    if nlp is None:
        raise HTTPException(status_code=503, detail="NLP model not loaded")
    return nlp

@router.post("/entities", response_model=ExtractionResponse)
async def extract_entities(input: TextInput):
    """
    Extract biomedical entities from text using scispaCy.
    Returns entities with types, positions, and confidence scores.
    """
    nlp = get_nlp()
    doc = nlp(input.text)
    
    entities = []
    for ent in doc.ents:
        entity_type = ENTITY_TYPE_MAP.get(ent.label_, ent.label_)
        
        # Get UMLS linking if available
        umls_cui = None
        confidence = 0.75  # Default confidence
        
        if hasattr(ent._, 'kb_ents') and ent._.kb_ents:
            umls_cui = ent._.kb_ents[0][0]
            confidence = min(ent._.kb_ents[0][1], 1.0)
        
        entities.append(Entity(
            text=ent.text,
            type=entity_type,
            start=ent.start_char,
            end=ent.end_char,
            confidence=confidence,
            umls_cui=umls_cui
        ))
    
    return ExtractionResponse(
        entities=entities,
        entity_count=len(entities)
    )

@router.post("/batch", response_model=List[ExtractionResponse])
async def extract_entities_batch(input: BatchTextInput):
    """
    Extract entities from multiple texts at once.
    More efficient for processing many abstracts.
    """
    nlp = get_nlp()
    results = []
    
    for doc in nlp.pipe(input.texts, batch_size=50):
        entities = []
        for ent in doc.ents:
            entity_type = ENTITY_TYPE_MAP.get(ent.label_, ent.label_)
            umls_cui = None
            confidence = 0.75
            
            if hasattr(ent._, 'kb_ents') and ent._.kb_ents:
                umls_cui = ent._.kb_ents[0][0]
                confidence = min(ent._.kb_ents[0][1], 1.0)
            
            entities.append(Entity(
                text=ent.text,
                type=entity_type,
                start=ent.start_char,
                end=ent.end_char,
                confidence=confidence,
                umls_cui=umls_cui
            ))
        
        results.append(ExtractionResponse(
            entities=entities,
            entity_count=len(entities)
        ))
    
    return results

@router.post("/relations", response_model=RelationResponse)
async def extract_relations(input: TextInput):
    """
    Extract relations between entities.
    Uses dependency parsing + heuristics for biomedical relations.
    """
    nlp = get_nlp()
    doc = nlp(input.text)
    
    relations = []
    entities = list(doc.ents)
    
    # Simple relation extraction based on sentence proximity
    for i, ent1 in enumerate(entities):
        for ent2 in entities[i+1:]:
            # Check if in same sentence
            sent1 = ent1.sent
            sent2 = ent2.sent
            
            if sent1 == sent2:
                # Look for relation indicators
                sent_text = sent1.text.lower()
                
                predicate = None
                confidence = 0.6
                
                # Relation patterns
                if any(w in sent_text for w in ['treat', 'therapy', 'therapeutic']):
                    if ent1.label_ in ['CHEMICAL'] and ent2.label_ in ['DISEASE']:
                        predicate = 'TREATS'
                        confidence = 0.8
                elif any(w in sent_text for w in ['inhibit', 'block', 'suppress']):
                    predicate = 'INHIBITS'
                    confidence = 0.75
                elif any(w in sent_text for w in ['activate', 'stimulate', 'induce']):
                    predicate = 'ACTIVATES'
                    confidence = 0.75
                elif any(w in sent_text for w in ['associate', 'correlate', 'link']):
                    predicate = 'ASSOCIATED_WITH'
                    confidence = 0.65
                elif any(w in sent_text for w in ['cause', 'lead to', 'result in']):
                    predicate = 'CAUSES'
                    confidence = 0.7
                elif any(w in sent_text for w in ['reduce', 'decrease', 'lower']):
                    predicate = 'REDUCES'
                    confidence = 0.75
                elif any(w in sent_text for w in ['increase', 'elevate', 'raise']):
                    predicate = 'INCREASES'
                    confidence = 0.75
                
                if predicate:
                    relations.append(Relation(
                        subject=ent1.text,
                        predicate=predicate,
                        object=ent2.text,
                        confidence=confidence,
                        evidence_text=sent1.text[:200]
                    ))
    
    return RelationResponse(relations=relations)

@router.post("/full", response_model=FullExtractionResponse)
async def extract_full(input: TextInput):
    """
    Full extraction: entities + relations + evidence level classification.
    Matches the current knowledge-extractor output format.
    """
    nlp = get_nlp()
    doc = nlp(input.text)
    
    # Extract entities
    entities = []
    for ent in doc.ents:
        entity_type = ENTITY_TYPE_MAP.get(ent.label_, ent.label_)
        umls_cui = None
        confidence = 0.75
        
        if hasattr(ent._, 'kb_ents') and ent._.kb_ents:
            umls_cui = ent._.kb_ents[0][0]
            confidence = min(ent._.kb_ents[0][1], 1.0)
        
        entities.append(Entity(
            text=ent.text,
            type=entity_type,
            start=ent.start_char,
            end=ent.end_char,
            confidence=confidence,
            umls_cui=umls_cui
        ))
    
    # Extract relations (simplified)
    relations = []
    ents = list(doc.ents)
    for i, ent1 in enumerate(ents):
        for ent2 in ents[i+1:]:
            if ent1.sent == ent2.sent:
                sent_text = ent1.sent.text.lower()
                for pattern, pred in [
                    (['treat', 'therapy'], 'TREATS'),
                    (['inhibit', 'block'], 'INHIBITS'),
                    (['activate', 'stimulate'], 'ACTIVATES'),
                    (['reduce', 'decrease'], 'REDUCES'),
                ]:
                    if any(w in sent_text for w in pattern):
                        relations.append(Relation(
                            subject=ent1.text,
                            predicate=pred,
                            object=ent2.text,
                            confidence=0.7,
                            evidence_text=ent1.sent.text[:150]
                        ))
                        break
    
    # Evidence level classification
    text_lower = input.text.lower()
    if any(w in text_lower for w in ['meta-analysis', 'systematic review', 'cochrane']):
        evidence_level = 'meta_analysis'
    elif any(w in text_lower for w in ['randomized', 'rct', 'clinical trial', 'double-blind']):
        evidence_level = 'clinical'
    elif any(w in text_lower for w in ['mouse', 'mice', 'rat', 'animal model', 'in vivo']):
        evidence_level = 'in_vivo'
    elif any(w in text_lower for w in ['cell line', 'in vitro', 'culture']):
        evidence_level = 'in_vitro'
    else:
        evidence_level = 'unknown'
    
    # Summary
    entity_counts = {}
    for e in entities:
        entity_counts[e.type] = entity_counts.get(e.type, 0) + 1
    
    relation_counts = {}
    for r in relations:
        relation_counts[r.predicate] = relation_counts.get(r.predicate, 0) + 1
    
    return FullExtractionResponse(
        entities=entities,
        relations=relations,
        evidence_level=evidence_level,
        summary={
            "entity_counts": entity_counts,
            "relation_counts": relation_counts,
            "total_entities": len(entities),
            "total_relations": len(relations)
        }
    )
