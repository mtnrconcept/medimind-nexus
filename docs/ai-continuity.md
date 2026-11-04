# Continuité des traitements IA

## Comportement attendu

Le renouvellement de la session du même utilisateur conserve son identité React et son rôle déjà vérifié lorsqu'une nouvelle lecture échoue temporairement. Une révocation confirmée ou un changement de compte reste effectif. Le retour dans l'onglet et la reconnexion ne provoquent pas de rechargement automatique des requêtes de la page.

Les appels IA enregistrés dans `_shared/ai-tool-registry.ts` passent par `ai-tool-jobs`. Ce transport authentifie l'utilisateur, enregistre une tâche privée, répond immédiatement et consomme la réponse de l'outil côté serveur avec `EdgeRuntime.waitUntil`. Le navigateur ne porte plus la connexion OpenAI. Fermer une page ou interrompre son suivi local ne supprime pas le traitement serveur.

Les outils qui possèdent un traitement natif en arrière-plan conservent cette architecture. Le moniteur partagé récupère une réponse OpenAI par son identifiant et relaie son travail entre de courtes invocations serveur. La finalisation et l'enregistrement du résultat ne dépendent plus d'une requête de statut du navigateur. La génération d'hypothèses utilise le même mécanisme et projette sa progression vers son ancienne table pour compatibilité.

Le panneau **Activité IA**, placé en dehors des transitions de page, retrouve les tâches privées de l'utilisateur après remontage de l'interface. Il affiche d'abord les tâches encore actives, puis les vingt derniers traitements terminés. Les résultats et les événements de flux sont relus avec un curseur, sans concaténer deux fois le texte final. Un résultat tronqué ou un suivi interrompu n'est pas présenté comme une génération réussie.

Le système d'exploitation peut toujours suspendre ou supprimer une page en mémoire. Aucune application web ne peut garantir la conservation de son DOM après cette suppression. La garantie apportée ici porte sur le traitement et le résultat côté serveur, avec reprise du suivi dans l'application.

### Recherche systématique

La recherche systématique CDE enregistre son catalogue et son plan une seule fois, puis exécute les fenêtres côté serveur. Chaque fenêtre conserve les quatre successeurs au maximum que traitait déjà cet outil ; le total affiché correspond désormais à ce plan borné (470 paires au maximum pour 120 substances), sans élargissement aux 7 140 combinaisons possibles. Le lot en cours et sa réponse fournisseur restent identiques après une reprise.

La progression avance seulement après réception d'une réponse complète couvrant toutes les paires attendues et sauvegarde réussie. Une fenêtre terminée ouvre la fenêtre de surveillance suivante ; l'ensemble reste borné par l'expiration globale de vingt-quatre heures. Les anciennes actions publiques `analyze`, `pause` et `resume` ne peuvent pas contourner le bail de ce workflow.

### Import médical par lots

L'import administratif envoie un seul manifeste, limité aux 500 URL sélectionnées et aux trois modes existants. Un administrateur authentifié est requis. Le serveur conserve les lots de trois URL et les délais de 45, 25 ou 12 secondes choisis dans l'interface. Les enfants ont un identifiant déterministe et une prise d'exécution unique ; un accusé perdu ne relance pas un appel OpenAI ou Firecrawl.

**Masquer le suivi** détache seulement l'interface. **Arrêter l'import** enregistre une demande d'arrêt qui interdit toute nouvelle admission ; les opérations déjà acceptées peuvent terminer. L'arrêt reste disponible dans Activité IA après un retour dans l'application. Les réussites, erreurs et URL non lancées sont comptées séparément. Un lot avec des erreurs ou un arrêt conserve ses résultats sans être déclaré entièrement réussi.

La délégation serveur est limitée aux trois actions `scrape`, `scrape-medication` et `scrape-molecule`. Leur contenu est reconstruit depuis le manifeste privé autorisé ; un appel HTTP de worker ne peut pas fournir une autre URL ou un autre outil. Aucun JWT utilisateur n'est stocké pour faire tourner la file. Le rôle administrateur est revérifié avant les admissions.

## Budgets et limites

Les budgets sont des plafonds de sortie par appel, comprenant le raisonnement du modèle. Ils ne modifient ni le contexte maximal du modèle, ni les quotas du compte OpenAI.

| Réglage | Valeur |
| --- | --- |
| Sortie sans raisonnement, faible, ou non précisé | au moins 16 384 tokens |
| Raisonnement moyen ou élevé | au moins 32 768 tokens |
| Raisonnement `xhigh` ou `max` | au moins 65 536 tokens |
| Plafond de sortie partagé | 128 000 tokens |
| Appel OpenAI direct par défaut | 120 secondes, réponse complète comprise |
| Création d'une réponse OpenAI en arrière-plan | 45 secondes pour obtenir son identifiant |
| Lecture d'une réponse OpenAI existante | 30 secondes par GET |
| Fenêtre de surveillance d'une réponse native | 60 minutes, puis réponse conservée et suivi reprenable |
| Bail exclusif d'un worker natif | 8 minutes, sans deuxième finaliseur concurrent |
| Observation navigateur | 60 minutes de temps visible et connecté ; suspension et hors-ligne exclus |
| Travail du transport générique | 130 secondes au maximum, puis marge pour enregistrer l'interruption avant la limite du worker |
| Requête générique | 12 Mio au maximum |
| Réponse générique, avec encadrement SSE | 16 Mio au maximum |
| Événement SSE individuel en base | 4 Mio au maximum |

Un budget demandé plus élevé est conservé jusqu'au plafond partagé. Les appels directs explicitement plus courts restent possibles pour les nouveaux appelants ; les anciens plafonds de 45/60 secondes des outils concernés ont été relevés à 120 secondes.

Une nouvelle génération automatique est permise uniquement lorsqu'OpenAI confirme `incomplete` avec la raison `max_output_tokens` : doublement du budget, plafond de 128 000, au plus deux reprises. Une erreur GET relit le même identifiant. Une création POST dont l'accusé de réception est ambigu n'est jamais rejouée automatiquement.

Le projet Medicore est sur l'offre Supabase Free au moment de cette modification. Le plafond de durée d'un worker est de 150 secondes ; un timeout JavaScript ne permet pas de le dépasser. Les tâches natives longues utilisent donc des relais. Les autres outils conservent la durée bornée de leur invocation : le transport les protège de la fermeture du navigateur, mais ne transforme pas une fonction arbitraire en workflow illimité.

Références : [limites des Edge Functions](https://supabase.com/docs/guides/functions/limits), [réponses OpenAI en arrière-plan](https://developers.openai.com/api/docs/guides/background), [budget de raisonnement](https://developers.openai.com/api/docs/guides/reasoning).

## Isolation, concurrence et conservation

- Les tâches sont consultables uniquement après vérification du propriétaire. Le rôle service sert au stockage interne ; les outils génériques reçoivent le JWT de l'utilisateur, sans élévation de ses droits.
- Un identifiant UUID de soumission, l'empreinte du contenu et une prise de tâche atomique empêchent les doubles exécutions lors d'une reconnexion ou d'un accusé de réception perdu. Les octets et la frontière multipart d'un fichier sont identiques entre tentatives.
- Une déconnexion ou un changement de compte invalide les références locales et les réponses tardives du compte précédent. Le stockage local contient uniquement des références opaques ; aucun prompt, résultat, fichier ou JWT supplémentaire n'y est enregistré.
- `ai_tool_job_events` n'a aucun droit direct pour `anon` ou `authenticated`. Le service vérifie le propriétaire avant de servir les événements. La clé `(job_id, seq)` impose l'ordre et l'unicité ; la clé étrangère empêche les événements orphelins.
- Les listes de tâches lisent des métadonnées, sans charger les résultats médicaux complets. Le texte complet d'un flux n'est renvoyé que sur sa dernière page d'événements.
- Les enfants techniques des imports ne sont pas listés séparément : le résumé du lot reste visible. Les délais de reprise des baux utilisent de nouvelles invocations courtes, pour éviter de cumuler une longue attente avec le traitement précédent.
- Les tâches génériques sont accessibles pendant sept jours ; les tâches natives créées ici pendant vingt-quatre heures. `expires_at` borne l'accès et la reprise : cette modification n'ajoute aucune purge destructive des anciens résultats.
- Les quatre anciennes générations d'hypothèses sans propriétaire ni identifiant de réponse récupérable ne sont ni relancées, ni réécrites automatiquement.

## Déploiement coordonné

Cette PR ne modifie pas la production et ne doit pas être fusionnée automatiquement. Le frontend dépend de la nouvelle fonction et de la migration ; préparer leur mise en service avant de publier le frontend.

1. Vérifier les contrôles CI, notamment les assertions d'autorisation sur PostgreSQL 17 et le contrôle Deno des fonctions modifiées.
2. Appliquer `supabase/migrations/20261104132505_durable_ai_transport.sql` sur le projet `kparxcfspgoonqttduyk`, puis contrôler les droits/RLS et les journaux. La migration ajoute une table privée et un index ; elle ne supprime aucun résultat.
3. Déployer `ai-tool-jobs` avec `verify_jwt = true`.
4. Redéployer les trente-six fonctions ci-dessous : un import partagé est inclus dans chaque bundle déployé, donc déployer seulement la nouvelle fonction ne mettrait pas à jour les budgets et le client OpenAI des autres outils.
5. Publier le frontend du même commit, après validation de l'environnement de prévisualisation Vercel et un essai autorisé avec un compte de test.
6. Vérifier une tâche JSON, un flux, une analyse native, une hypothèse et un petit import de test : commencer, masquer l'onglet, revenir, puis retrouver un seul résultat. Vérifier séparément un changement de compte, une interruption réseau et l'arrêt explicite d'un lot. L'essai réel peut consommer des tokens/crédits ; les tests de cette PR n'appellent ni OpenAI ni Firecrawl.

Fonctions à redéployer avec le client partagé :

```text
adversarial-reviewer
ai-assistant
analyze-kg-links
analyze-user-links
causal-reasoning
cde-analyze
cde-systematic-analyze
continuous-discovery-pipeline
cross-data-analyzer
deep-research
deep-research-graph
detect-side-effects
discovery-engine
discovery-platform
discovery-search
document-analyzer
focused-research
generate-embeddings
generate-molecule
graph-chat
hypothesis-generator
hypothesis-processor
knowledge-extractor
lbd-contradiction-detector
lbd-expand-node
live-research
medical-scraper
neural-kg
pathology-analyzer
patient-health-synthesis
radial-rings-engine
scientific-analysis
symptom-questionnaire
systematic-research
targeted-research
validate-hypothesis
```

Les variables existantes `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `SUPABASE_ANON_KEY` restent nécessaires. Si `OPENAI_TIMEOUT_MS` impose encore un délai direct plus court, vérifier cette configuration au déploiement : les appels sans délai explicite respectent ce réglage jusqu'au plafond de 120 secondes. Aucun secret n'est créé ou modifié par cette PR. Les deux projets Vercel reliés au dépôt sont `medimind-nexus` et `medimind-nexus-9hei` ; vérifier celui utilisé pour la publication prévue.

Le workflow existant de migration ne déploie pas les Edge Functions. Il peut aussi ignorer le push des migrations si ses secrets GitHub manquent : un statut de workflow réussi ne suffit donc pas à prouver que le backend a été mis à jour.

## Vérification et retour arrière

Commandes de vérification principales :

```bash
npm test
npm run typecheck
npm run typecheck:microsignals
npm run typecheck:patient-matching
npm run typecheck:workspace
npx tsc -p tsconfig.ai-continuity.json --pretty false
npx tsc -p tsconfig.anatomical-twin.json --pretty false
npm run check:signal-edge
npm run lint
npm run build
node scripts/audit-production.mjs
```

Les tests couvrent les coupures et réponses tardives, les soumissions concurrentes, la conservation des flux partiels, la non-duplication après reprise, la séparation des comptes, les réponses OpenAI incomplètes, les baux de traitement et les autorisations SQL. Le contrôle Deno et les assertions PostgreSQL 17 sont exécutés par `.github/workflows/ci.yml`.

Pour revenir en arrière, publier le commit applicatif précédent et redéployer ses fonctions coordonnées. Conserver la table d'événements et les résultats des tâches : aucune suppression n'est nécessaire pour désactiver le transport. Les jobs déjà acceptés doivent être suivis jusqu'à leur fin ou explicitement examinés avant d'arrêter leur moniteur. Une éventuelle suppression ultérieure des structures doit faire l'objet d'une migration compensatrice séparée, après conservation des résultats utiles.
