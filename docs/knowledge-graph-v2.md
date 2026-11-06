# Graphe de connaissances 3D — modèle sémantique v2

## Comportement

Le radial utilise désormais une scène Three.js organisée en constellations sémantiques. La vue de secours SVG conserve le même graphe, les mêmes filtres et les mêmes détails. L’interface est dynamique : aucun catalogue néphrotique ni relation médicale de démonstration n’est embarqué dans les composants de production.

Les étiquettes principales évitent les recouvrements dans la vue d’ensemble ; la vue 3D ajuste leur visibilité au cadrage. Un nœud reste toujours consultable par sélection et par recherche, même lorsque son étiquette est masquée.

La couleur représente une famille de concepts. Le type biologique ou clinique d’une entité reste indépendant de son rôle visuel : un médicament impliqué dans une interaction reste un médicament. La nature et la direction des relations, leurs preuves et leur distance au centre sont des dimensions séparées.

Familles : anatomie, causes et pathologies, manifestations, traitements, génétique, molécules et immunité, complications, examens et suivi, interactions, recherche et associations, mécanismes, vie quotidienne.

Qualifications : `established`, `association`, `research`, `unverified`. Un poids de proximité ou une ancienne note A/B/C n’attribue jamais une qualification. Sans référence exploitable, le lien reste à vérifier. Une URL retrouvée atteste sa provenance ; elle ne garantit pas à elle seule la validité de la relation scientifique.

## Répartition des responsabilités

| Module | Responsabilité |
| --- | --- |
| `src/components/cde/RadialRingsModal.tsx` | Adaptation des trois points d’entrée existants, dialogue accessible, sauvegarde et chargement privés. |
| `src/components/cde/knowledge-graph/KnowledgeGraphExplorer.tsx` | Recherche, filtres, sélection, chemins, détails et commandes accessibles. Aucun accès réseau. |
| `src/components/cde/knowledge-graph/KnowledgeGraphScene.tsx` | Rendu 3D et secours 2D, zoom, rotation, déplacement et sélection. |
| `src/components/cde/knowledge-graph/useKnowledgeGraphSession.ts` | Génération, enrichissement, observation durable, résultats partiels, reprise et invalidation des réponses périmées. |
| `src/lib/knowledgeGraph/model.ts` | Normalisation, identités, preuves, diagnostics, filtres et parcours de la topologie réelle. |
| `src/lib/knowledgeGraph/layout.ts` | Positions et courbes ; ne crée aucune relation scientifique. |
| `src/lib/knowledgeGraph/researchStream.ts` | Décodage SSE/JSON, assemblage des pages et préservation des métadonnées. |
| `supabase/functions/deep-research-graph/contract.ts` | Validation structurelle des concepts et relations, contrôle de provenance des références et qualification prudente des liens. |
| `supabase/functions/deep-research-graph/handler.ts` | Recherche générale bornée et progression ; réponse JSON ou SSE compatible. |
| `supabase/functions/deep-research-graph/sources.ts` | Notices/résumés PubMed, signalements OpenFDA et états explicites des sources. |

## Invariants

- Le graphe décrit des connaissances générales. Il ne transforme aucun concept en diagnostic, médicament prescrit ou symptôme présent chez un patient.
- Les gènes, variantes, protéines et molécules conservent des genres distincts. Dans le normaliseur frontend, deux noms identiques ne suffisent pas à fusionner deux IDs sans identité canonique commune.
- La fusion canonique frontend exige un identifiant compatible avec le genre. Un ID stable peut être enrichi d’une identité canonique ; deux identités incompatibles restent séparées et signalées.
- Pour les nouveaux concepts générés, le serveur construit une identité applicative `local:<genre>:<nom normalisé>` et regroupe les occurrences de cette même identité. Lorsqu’un concept déjà enregistré devient centre d’une expansion, son identifiant canonique existant est conservé ; la clé locale de rapprochement reste interne. La clé `local:*` n’est pas un identifiant d’ontologie. La génération serveur n’a pas de type dédié aux formulations pharmaceutiques : leur séparation dépend des libellés et identités qui les distinguent.
- Les relations de sens différent, les types différents, les contextes et observations contradictoires sont conservés. La déduplication ne réduit pas une paire de concepts à une seule arête arbitraire.
- La portée d’une relation conserve sa population, son type de preuve, ses limites, sa polarité et ses références.
- Pour les nouvelles pages, le serveur rétrograde les liens dont les seules sources sont des notices bibliographiques ou des signalements FAERS ; ces éléments ne démontrent pas une causalité. Un type d’étude déclaré préclinique reçoit `research` lorsqu’une source au contenu exploitable existe. Les études des anciennes sauvegardes ne sont pas réévaluées à la lecture.
- Les références bibliographiques des anciennes sauvegardes migrent vers les métadonnées des concepts. Cette migration ne fabrique pas de chemin clinique entre eux.
- Le chemin affiché est un chemin de connexion, éventuellement parcouru à rebours d’une flèche ; ce parcours ne constitue pas une inférence causale. Les flèches d’origine restent conservées.
- Les arêtes sans extrémité valide sont diagnostiquées. Une arête reçue avant son nœud reste en attente dans l’assembleur de flux.
- Lire un nœud, un chemin ou une référence ne lance aucune requête IA. Les boutons d’exploration et d’analyse sont les actions explicites d’enrichissement.

## Protocole et limites de couverture

La route `deep-research-graph` conserve `nodes`, `edges`, `source_statuses` et les réponses JSON/SSE. Le schéma ajoute `schema_version: 2`, `knowledge_scope: general`, `research_status`, `limitations` et `exploration`.

Le flux émet les centres, les phases `progress`, les états `sources`, les nœuds validés, les arêtes et l’événement `complete`. Les sources et phases sont disponibles pendant l’analyse. Les nouveaux concepts scientifiques sont émis après validation de leur page complète, afin de ne pas publier de fragments de résultats médicaux.

Une page est bornée à 150 nœuds retournés, centres inclus, et une profondeur maximale de 4 liens depuis ses centres ou les concepts existants servant d’ancrage. Le graphe accumule les pages lors des explorations successives ; cette borne ne limite donc pas sa taille totale ni sa distance cumulée au premier centre. Les états `truncated` et `exhaustive: false` évitent de présenter une page finie comme une liste exhaustive de toute la littérature. Les concepts partagés conservent `parent_pathologies` ; cette appartenance ne crée pas de lien scientifique.

Le mode Cloud utilise le transport durable existant (`ai-tool-jobs`). Détacher l’observation à la fermeture du composant n’annule pas une tâche serveur acceptée. La reprise conserve les résultats partiels et utilise de nouveaux espaces d’identifiants pour les nouvelles tentatives. Les références du mode local restent non vérifiées, puisque ce modèle ne consulte pas les sources publiques.

## Sauvegardes et compatibilité

Les sauvegardes utilisent toujours `saved_graphs.graph_data` et `view_state`. Les filtres, le centre, le mode de rendu et les métadonnées de recherche sont enregistrés. Les anciennes structures `knowledge_graph`, `nodes/edges` et les noms de champs d’arêtes API/DB sont pris en charge. Les coordonnées manuelles des anciennes dispositions ne remplacent pas la nouvelle disposition sémantique.

Un changement de sujet réinitialise l’identité du document : il ne réutilise pas l’ID du graphe précédemment chargé. Les anciennes réponses réseau ne peuvent pas remplacer le nouveau sujet. La lecture et la sauvegarde restent limitées à l’utilisateur authentifié, avec les politiques RLS déjà présentes.

## Vérification reproductible

```bash
node --import tsx --test --test-concurrency=1 tests/*.test.ts
node node_modules/typescript/bin/tsc -p tsconfig.knowledge-graph.json --pretty false
node node_modules/eslint/bin/eslint.js src/components/cde/knowledge-graph src/lib/knowledgeGraph
npm run build
```

La suite `tests/knowledge-graph-model.test.ts` couvre les identités, les preuves, les contradictions et la topologie ; `tests/knowledge-graph-stream.test.ts` couvre les flux fragmentés, les erreurs, les annulations et la reprise ; `tests/knowledge-graph-research.test.ts` couvre le contrat serveur et la provenance.

Le workflow `knowledge-graph-browser.yml` exécute Chromium avec une fixture synthétique de 50 nœuds et une variante de 230 nœuds. Il bloque les requêtes externes, n’utilise aucun dossier patient et ne sollicite aucun modèle. Il teste les contrôles, les sources, le mobile, le secours WebGL et les états de l’interface. Les captures et le rapport sont publiés dans l’artefact de CI `knowledge-graph-browser`.

Le contrôle TypeScript intégral du projet comporte des erreurs historiques hors de ce périmètre ; le contrôle ciblé du graphe inclut la modale, le hook, les flux, le modèle et les fixtures. Les contrôles CI existants restent applicables.

## Livraison et retour arrière

Aucune migration SQL n’est nécessaire. Lors d’une livraison de production autorisée, déployer la fonction `deep-research-graph` avec ses modules partagés, puis le frontend. Vérifier les statuts des sources et une recherche réelle dans l’environnement autorisé ; les tests de cette refonte utilisent des services simulés et ne valident pas une génération IA réelle.

Le retour arrière consiste à rétablir les versions précédentes de la fonction et du frontend. Les champs historiques des sauvegardes sont conservés. Aucune suppression de données cliniques ou de sauvegardes n’est requise.

## Fichiers de cette refonte

- `.github/workflows/knowledge-graph-browser.yml`
- `docs/knowledge-graph-v2.md`
- `scripts/check-knowledge-graph-browser.mjs`
- `src/components/cde/AdvancedResearchPanel.tsx`
- `src/components/cde/RadialRingsModal.tsx`
- `src/components/cde/knowledge-graph/KnowledgeGraphExplorer.tsx`
- `src/components/cde/knowledge-graph/KnowledgeGraphScene.tsx`
- `src/components/cde/knowledge-graph/knowledge-graph.css`
- `src/components/cde/knowledge-graph/useKnowledgeGraphSession.ts`
- `src/components/patient/RelationshipMatrix.tsx`
- `src/contexts/AIContext.tsx`
- `src/lib/knowledgeGraph/layout.ts`
- `src/lib/knowledgeGraph/model.ts`
- `src/lib/knowledgeGraph/researchStream.ts`
- `src/pages/ContinuousDiscovery.tsx`
- `src/pages/DiscoveryPlatform.tsx`
- `src/types/graph.ts`
- `src/utils/graphUtils.ts`
- `supabase/functions/_shared/bounded-json.ts`
- `supabase/functions/deep-research-graph/contract.ts`
- `supabase/functions/deep-research-graph/handler.ts`
- `supabase/functions/deep-research-graph/sources.ts`
- `tests/browser/knowledge-graph-fixture.ts`
- `tests/browser/knowledge-graph.html`
- `tests/browser/knowledge-graph.tsx`
- `tests/deep-research-sources.test.ts`
- `tests/knowledge-graph-model.test.ts`
- `tests/knowledge-graph-research.test.ts`
- `tests/knowledge-graph-stream.test.ts`
- `tsconfig.knowledge-graph.json`
