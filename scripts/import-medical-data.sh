#!/bin/bash
# Script d'import des données médicales
# Appelle l'Edge Function data-importer

SUPABASE_URL="https://kparxcfspgoonqttduyk.supabase.co"
FUNCTION_URL="$SUPABASE_URL/functions/v1/data-importer"

echo "=== Import des données médicales ==="
echo ""

# 1. Allergens (22 prédéfinis)
echo "1/6 - Import des allergènes..."
curl -s -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d '{"import_type": "allergens"}' | jq .summary

# 2. RxNorm drugs
echo ""
echo "2/6 - Import des molécules RxNorm..."
curl -s -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d '{"import_type": "rxnorm_drugs", "limit": 50}' | jq .summary

# 3. OpenFDA labels
echo ""
echo "3/6 - Import des labels FDA + excipients..."
curl -s -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d '{"import_type": "openfda_labels", "limit": 100}' | jq .summary

# 4. Clinical trials
echo ""
echo "4/6 - Import des essais cliniques..."
curl -s -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d '{"import_type": "clinicaltrials", "query": "nephrotic syndrome OR kidney disease", "limit": 50}' | jq .summary

# 5. MedlinePlus (foods + alternatives)
echo ""
echo "5/6 - Import MedlinePlus (aliments + alternatives)..."
curl -s -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d '{"import_type": "medlineplus"}' | jq .summary

# 6. PubMed abstracts
echo ""
echo "6/6 - Import PubMed abstracts..."
curl -s -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d '{"import_type": "pubmed", "query": "drug interactions systematic review", "limit": 50}' | jq .summary

echo ""
echo "=== Import terminé ==="
