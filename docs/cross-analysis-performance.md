# Accélération de l’analyse croisée — 6 novembre 2026

## Problème constaté

La fonction Supabase de production `cross-data-analyzer`, version 82, mise à jour le 5 novembre à 18:28 UTC, utilisait des lots d’une paire et une seule réponse OpenAI à la fois. Le regroupement de quatre paires présent dans `main` depuis la PR #46 n’avait pas été déployé sur Supabase. Même ce regroupement conservait une attente séquentielle entre les réponses.

Pour 27 concepts, la couverture exhaustive représente 351 paires et 702 directions. La latence d’une réponse était donc répétée jusqu’à 351 fois avant la préparation des options et la revue finale.

## Exécution livrée

Le coordinateur garde jusqu’à **huit réponses en arrière-plan**, contenant chacune jusqu’à **quatre paires**. Jusqu’à 32 paires peuvent ainsi être examinées simultanément. Les petites sélections d’au plus trois paires conservent leur traitement individuel. Le modèle reste `gpt-6-astra`, avec le routage de raisonnement clinique et les limites de génération existants.

Les créations sont envoyées successivement, uniquement le temps de recevoir et de sauvegarder leur identifiant. Les générations elles-mêmes s’exécutent simultanément. Les lectures de leur état sont parallèles ; les résultats terminés sont validés puis enregistrés indépendamment. Une réponse lente ne retarde pas la publication des autres. Les places libérées reçoivent les paires restantes.

| Étape | Condition de passage |
| --- | --- |
| Paires sélectionnées | Toutes les paires ont une cellule valide avec leurs deux directions. |
| Préparation des options | Une seule revue globale, après la couverture initiale complète. |
| Croisements des candidats | Même coordinateur parallèle ; couverture de toutes les paires impliquant les candidats. |
| Revue finale | Une seule revue globale, après la couverture des candidats. |

La recherche web native reste obligatoire pour chaque réponse de recherche. Chaque paire garde ses propres identifiants, directions, explications et références. Les références doivent appartenir aux sources réellement retournées pour son lot ; le registre d’un autre lot ne peut pas justifier une citation. Un lot partage une trace de recherche : le nombre de paires couvertes ne doit pas être présenté comme un nombre de recherches web individuelles.

## Résultats et limites de la mesure

Le test `tests/astra-pair-pool.test.ts` compare le même coordinateur avec 351 paires, une configuration séquentielle d’une paire et une configuration parallèle de huit lots de quatre. Son horloge et son fournisseur sont simulés ; chaque cellule reste validée par le véritable contrat de l’application.

| Scénario contrôlé | Réponses pour les paires | Durée simulée des paires | Rapport au séquentiel |
| --- | ---: | ---: | ---: |
| Séquentiel, une paire, réponse de 60 s | 351 | 21 060 s | 1× |
| Huit lots de quatre, réponse de 60 s | 88 | 660 s | 31,91× |
| Huit lots de quatre, réponse de 120 s | 88 | 1 320 s | 15,95× |

Ces durées ne sont **pas des mesures de la vitesse réelle d’OpenAI**. Elles vérifient le fonctionnement du coordinateur et illustrent sa sensibilité à la durée d’un lot. Les deux revues globales et les éventuels croisements des candidats s’ajoutent à ces durées. Le facteur réel de 20–30× demandé ne peut être garanti à partir de ce banc d’essai.

Un essai réel isolé a été lancé le 6 novembre à 10:23:32 UTC avec neuf concepts fictifs. Il a confirmé huit réponses simultanément enregistrées. Les huit réponses ont ensuite été interrompues par le fournisseur avec `credit_balance_exhausted` / `insufficient_quota`, sans génération facturée renseignée ni résultat clinique produit. Le crédit OpenAI doit être rétabli avant de mesurer le temps réel et de terminer une validation des lots auprès du modèle.

La fonction d’essai `cross-speed-eval-20261106` n’acceptait qu’une sélection fixe, protégée par la vérification JWT et un jeton de contrôle temporaire, avec expiration et un seul identifiant de tâche. Un appel sans jeton de contrôle a été refusé avec HTTP 403. Après le diagnostic, la fonction a été neutralisée en version 3 : gestionnaire HTTP 410, vérification JWT maintenue, aucun accès aux données ni appel au fournisseur. Aucun dossier patient n’a été utilisé ni modifié.

## Reprise, concurrence et erreurs

- Un seul coordinateur possède le bail d’écriture de la tâche. Les doublons de relais ne démarrent pas une seconde file.
- Un identifiant de réponse séquentielle déjà enregistré est consommé avec son lot d’origine avant de passer au mode parallèle.
- L’intention est sauvegardée avant chaque création, puis l’identifiant est enregistré avant la suivante. Une création non confirmée impose une reprise explicite et ne déclenche pas un deuxième POST payant automatique.
- Les identifiants et les paires réservées sont conservés dans le champ privé `_matrix_runtime.parallel`. Les projections publiques n’exposent que des compteurs d’exécution.
- Après une erreur ou une perte d’accusé de réception d’écriture, le coordinateur libère seulement son bail. Il relit ensuite l’état enregistré ; il ne réécrit jamais son ancienne copie sur des résultats potentiellement déjà sauvegardés.
- Les erreurs transitoires de lecture réessaient le même identifiant, avec temporisation et un maximum de huit échecs consécutifs. Les erreurs d’authentification préservent l’identifiant pour une reprise après correction.
- Un HTTP 429 de débit respecte `Retry-After`, réduit la concurrence et limite les tentatives de création à cinq reprises. Une erreur de crédit ou de facturation met la tâche en pause et explique la cause.
- Une limite de sortie autorise la reprise automatique déjà prévue avec un budget augmenté. Au-delà de cette tentative, une reprise explicite ne regénère que les paires concernées, individuellement. Les autres résultats et réponses restent conservés.
- Une réponse partielle valide conserve ses cellules ; seules les paires manquantes sont replanifiées.
- Les lectures et créations du coordinateur ont un délai HTTP de 12 s, les écritures de 8 s. Le coordinateur réserve du temps pour la sauvegarde et le relais. Les délais des autres appelants OpenAI restent inchangés.
- Le moniteur générique de tâches ne peut plus prendre la main sur une matrice Astra. Le panneau d’activité réveille son coordinateur dédié.

## Vérification

Les régressions couvrent les huit départs avant la première lecture, la complétion désordonnée, la sauvegarde immédiate des lots rapides, les conflits de relais, les écritures échouées et les accusés perdus, la migration d’une réponse historique, les erreurs HTTP 401/404/429, les crédits épuisés après acceptation, les reprises de budget, les cellules partielles, la confidentialité des identifiants et les barrières avant la revue finale. Les tests de propriétaire et d’accès au dossier restent actifs.

La fonction utilise la table privée `ai_analysis_jobs` existante. Aucun changement de schéma, de politique RLS ou de droits n’est nécessaire. La vérification Deno de l’entrée complète dépend de la CI GitHub, car l’accès local à `deno.land` est refusé dans cet environnement.

## Livraison et retour arrière

Déployer `cross-data-analyzer` avec tous ses imports, puis `ai-tool-jobs` pour le réveil du coordinateur dédié. Vérifier les versions et la conservation de `verify_jwt=true`. La fusion Git seule ne déploie pas ces Edge Functions.

Le retour arrière doit préserver la lecture du journal parallèle tant que des réponses sont en cours. Pour réduire la charge, abaisser temporairement la constante `AGENT_PARALLELISM` à 1 et redéployer cette version compatible : les identifiants enregistrés continuent à être récoltés, et les nouveaux départs sont sérialisés. Après achèvement ou pause contrôlée des tâches parallèles, un retour à la version antérieure est possible. Ne pas réinstaller directement le worker à identifiant unique sur des tâches parallèles actives, ni supprimer leurs résultats.

## Références techniques

- [OpenAI — réponses en arrière-plan](https://developers.openai.com/api/docs/guides/background)
- [OpenAI — limites de débit et temporisation](https://developers.openai.com/api/docs/guides/rate-limits)
- [Supabase — tâches en arrière-plan](https://supabase.com/docs/guides/functions/background-tasks)
- [Supabase — limites des fonctions](https://supabase.com/docs/guides/functions/limits)
