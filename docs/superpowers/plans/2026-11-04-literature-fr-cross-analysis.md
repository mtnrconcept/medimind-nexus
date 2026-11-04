# Medicore : recherche bilingue et analyses croisées fiables

**Objectif :** corriger les résultats vides montrés dans la vidéo et enrichir les ressources scientifiques consultables en français.
**Architecture :** conserver React/TypeScript, les jobs persistants Supabase et les identifiants cliniques. Normaliser uniquement les requêtes publiques ; ne jamais transformer une correspondance bibliographique en preuve clinique.
**Constat vérifié :** tâche du 4 novembre à 22:16 UTC : 15 cellules terminées, 0 lien, 0 référence, score calculé 100. Les trois anciennes requêtes testées renvoient 0 publication ; les requêtes normalisées retrouvent des publications.

## Ordre et fichiers
1. Tests de régression `tests/cross-research.test.ts` et `tests/cross-matrix.test.ts` : termes français, noms commerciaux, sources en panne, réponses malformées, aucune preuve/aucun score, conservation des cellules et de l'identité fournisseur.
2. `supabase/functions/_shared/medical-terminology.ts` (nouveau) : résolution bilingue réutilisable, maintien du texte original et des identifiants.
3. `supabase/functions/cross-data-analyzer/pubmed-research.ts` (nouveau), `index.ts`, `matrix-job.ts`, `analysis-utils.ts` : requêtes explicites portant sur les deux concepts, lecture bornée PubMed, repli Europe PMC, statuts de source et provenance, aucune relance opaque de génération payante.
4. `src/components/patient/CrossDataAnalyzer.tsx`, `RelationshipMatrix.tsx`, `RiskNetworkGraph.tsx` : afficher la couverture documentaire, les vraies requêtes et les limites ; supprimer la fausse évaluation 100/100 lorsque les preuves sont absentes, y compris les résultats historiques.
5. Enrichissement séparé : catalogue de littérature vérifiable et compétences de recherche exécutables, recherche bilingue indexée, traductions distinctes des originaux. Inspecter les schémas/RLS existants avant migration. N'importer que des notices réelles et du contenu dont la réutilisation est permise.
6. Vérifier tests, typechecks ciblés, lint, build, contrôles Edge, sources réelles et prévisualisations Vercel. Commit(s) ciblé(s), PR, pas de fusion sans demande.

## Risques et limites
- Une source en panne reste indisponible, jamais « aucune interaction ».
- Le contexte d'un médicament (notamment voie oculaire vs systémique) reste conservé même si les mots de recherche sont génériques.
- Aucun accès ou changement de dossier patient ; seules les métadonnées du job signalé ont été lues.
- Les documents importés ne constituent ni une recommandation thérapeutique ni une validation clinique.
- Les anciennes données et les cellules terminées restent intactes. Pas de migration destructive ni de changement des secrets.

## Retour arrière
Annuler les commits de cette branche et restaurer les versions précédentes des fonctions modifiées. Les ajouts bibliographiques/terminologiques sont identifiés par lot et ne remplacent pas les originaux.
