# MediCore — revue du design, des parcours et de la fiabilité scientifique

## Verdict et périmètre

**État : NON VALIDÉ pour une affirmation « tous les outils fonctionnent » ou « niveau scientifique démontré ».**

Une revue de code, des lectures de métadonnées Supabase, une comparaison avec ClinicalTrials.gov et un audit réel sous Chromium ont été effectués. L'interface applicative n'a pas été refondue, aucun défaut applicatif n'a été corrigé dans ce lot, aucune migration ni publication en production n'a été réalisée. Ce livrable rassemble les preuves et le plan de correction ; ce n'est pas une validation clinique.

Les tests navigateur concernent les écrans publics et les barrières de navigation, pas les parcours métier après connexion. Aucune session de test dédiée n'était disponible. Les appels aux services Supabase et les requêtes autres que GET/HEAD ont été interceptés pour éviter de lire ou modifier des données de santé pendant les captures. Les tests navigateur n'ont collecté ni dossier patient ni jeton d'authentification. Les imports, suppressions, prescriptions, écritures de résultats et appels de modèles n'ont pas été déclenchés.

## Traçabilité

- Dépôt : `mtnrconcept/medimind-nexus`.
- Base applicative auditée : `017e25f0ce69cd03974c91417305f50b5b1fddfb`.
- Branche de livraison : `codex/design-scientific-audit-20260906`.
- Commit du workflow exécuté : `ba888391fbfdca28ddc4396eb8dfa32ee845693b`.
- Exécution : [GitHub Actions 33997259458](https://github.com/mtnrconcept/medimind-nexus/actions/runs/33997259458), du 5 septembre 2026, 22:55–22:58 UTC.
- Worktree du runner : branche isolée `audit/browser-science-33997259458`, état propre vérifié avant les tests ; `AGENTS.md` lu et état distant récupéré.
- Worktree local de revue : `codex/design-scientific-audit-local-20260906`, obtenu à partir des véritables objets Git exportés par le runner, sans reconstruction fictive du dépôt.
- Navigateur : Chromium `145.0.7632.6`, piloté par Playwright Python `1.58.0`.
- Résolutions : ordinateur `1440 × 1000`, mobile `390 × 844` ; locale `fr-CH`, mouvements réduits.
- Domaine testé : `https://medimind-nexus.vercel.app`.
- L'interrogation Vercel par le domaine canonique confirme `READY`, cible `production`, commit `017e25f0ce69cd03974c91417305f50b5b1fddfb`, déploiement `dpl_jReYi2Zd9b42q5bHxF6gRe2QB228`, projet `prj_KEzWqdIgi2l5bcaBztcU09yAKV7J`. Une première interrogation par un ancien identifiant renvoyait 404 ; elle n'a pas été utilisée comme preuve de déploiement.
- Projet Supabase interrogé : `kparxcfspgoonqttduyk`.

L'artefact original `medicore-browser-science-evidence`, ID `9978460182`, contient les JSON, les journaux et les 36 captures. Son SHA-256 a été vérifié après téléchargement : `5439127192be7c0a88d5596da1141454917528af88c73481d1ac4919babca417`.

## 1. Tests effectivement réalisés

### Qualité du dépôt

| Commande | Résultat constaté | Limite d'interprétation |
| --- | --- | --- |
| `npm ci` | Réussite, code 0 | N'atteste pas l'absence de vulnérabilités. |
| `npm test` | 11 tests réussis, aucun échec | Suite existante, non exhaustive. |
| `npm run typecheck` | Réussite | Périmètre limité aux trois modules cliniques et à leurs tests. |
| `npm run typecheck:full` | Échec, code 2 | 192 diagnostics TypeScript dans 43 fichiers. |
| `npm run lint` | Code 0, aucune erreur | 1 177 avertissements ; ce n'est pas un dépôt sans dette de lint. |
| `npm run build` | Réussite en 16,68 s | Avertissements de taille ; principal chunk vendor d'environ 3,71 Mo minifié, 1,30 Mo compressé. |
| `npm run clinical-brain:audit` | Réussite | Les contre-exemples ajoutés au workflow révèlent des cas non couverts. |
| `node scripts/audit-production.mjs` | Code 0 : aucune vulnérabilité critique | 20 vulnérabilités de production signalées, dont 15 hautes, 4 modérées et 1 faible. |

Sources : `quality-checks.json`, `tests.log`, `typecheck_full.log`, `lint.log`, `build.log`, `clinical_brain_existing.log`, `dependency_audit.log` dans l'artefact. Les 192 diagnostics ont été comptés sur les lignes de diagnostic, pas sur les 634 lignes du journal. Exemples de fichiers concernés : `src/pages/PopulateData.tsx`, `src/pages/DiscoveryPlatform.tsx`, `src/components/nexus/HypothesisReport.tsx`, `src/components/cde/SwitchCalculator.tsx` et `src/components/admin/DataImportPanel.tsx`.

Le workflow diagnostique s'est exécuté jusqu'au bout. Sa dernière étape est volontairement un refus de validation globale : elle affiche les échecs et les périmètres non testés puis retourne le code 1. La réussite technique des étapes qui collectent les résultats ne transforme pas leurs assertions échouées en réussites.

### Navigateur : 36 visites, pas 36 outils validés

Les 17 routes nommées du routeur et une route inexistante ont été ouvertes dans les deux résolutions. Les 36 visites ont rendu du contenu sans exception JavaScript `pageerror` observée ; aucun débordement horizontal de la page n'a été mesuré. Le contrôle combiné rendu/redirection/débordement est satisfait pour 34 visites et échoue pour les deux visites de `/admin`.

Les 12 routes enveloppées dans `ProtectedRoute` redirigent vers `/auth` sans session, dans les deux résolutions. Cette redirection correcte ne teste ni l'outil derrière cette barrière, ni les autorisations serveur. Le formulaire d'accueil affiche bien « Mot de passe incorrect » pour la valeur invalide utilisée dans le test.

| Routes | Observation navigateur | Exécution métier |
| --- | --- | --- |
| `/` | Rendu et retour d'erreur du formulaire vérifiés | Accès réel au dossier non testé. |
| `/auth` | Formulaire affiché | Connexion, inscription, récupération de compte non testées. |
| `/dashboard`, `/pathologies`, `/pathologies/:id`, `/search` | Redirection vers la connexion vérifiée | Consultation et recherche non testées après connexion. |
| `/patients`, `/patients/:id` | Redirection vérifiée ; identifiant de test fictif | Dossiers, pièces jointes, alertes et synthèse non testés. |
| `/cross-data-analysis`, `/continuous-discovery`, `/discovery-platform` | Redirection vérifiée | Analyse, sources, progression et résultats non testés. |
| `/tools/switch-calculator`, `/tools/molecule-workbench` | Redirection vérifiée | Calculs, génération moléculaire, export et interprétation non testés. |
| `/populate-data` | Redirection vérifiée | Aucun import ou peuplement exécuté. |
| `/admin` | **Échec : interface visible sans connexion** | Aucun bouton privilégié ou import activé. |
| `/smart/launch`, `/smart/callback` | Écrans publics/erreur affichés sans paramètres valides | Aucun échange OAuth/FHIR avec un dossier tiers testé. |
| Route inexistante | Écran 404 et lien de retour visibles | Comportement de secours uniquement. |

L'inventaire recense **65 fonctions Edge dans le dépôt**. C'est un inventaire de code, pas un décompte de fonctions exécutées ou validées en production. Le CSV livré `inventaire-fonctions.csv` marque explicitement chaque fonction comme non exécutée dans un parcours métier navigateur. `parcours-navigateur.csv` détaille les 36 visites.

Les captures et métriques ne constituent pas une certification d'accessibilité : le contraste, le lecteur d'écran, tous les parcours clavier, les menus ouverts, le thème sombre, Firefox, Safari et les performances des outils connectés restent à examiner. Les erreurs réseau ont été provoquées par interception ; elles ne doivent pas être attribuées à une panne réelle de Supabase. Les messages `console.error` ne sont pas couverts exhaustivement par le seul relevé `pageerror`.

## 2. Défauts de sécurité et d'intégrité à traiter en priorité

### P0 — administration sans garde

`src/App.tsx` rend `/admin` sans `ProtectedRoute`. Le contrôle du rôle administrateur dans `src/pages/Admin.tsx` est commenté. Les captures ordinateur et mobile confirment que le panneau et ses commandes sont visibles sans session. Cela démontre un défaut de contrôle de navigation, pas à lui seul la réussite d'une opération administrative côté serveur.

Correction attendue : authentification réelle, contrôle du rôle résolu avant affichage, refus serveur/RLS des opérations privilégiées et tests distincts visiteur, utilisateur non administrateur et administrateur. Masquer seulement le lien dans le menu serait insuffisant.

### P0 — intégrité des preuves non protégée contre l'écriture anonyme

Les lectures de `pg_policies`, des privilèges effectifs et des politiques restrictives montrent, pour les sept tables suivantes, une politique permissive `FOR ALL` visant `public`, avec `USING (true)` / `WITH CHECK (true)`, les privilèges `anon` INSERT/UPDATE/DELETE et aucune politique restrictive :

`discovery_api_cache`, `discovery_evidence_packs`, `discovery_evidence_snippets`, `discovery_hypotheses`, `discovery_kg_triples`, `discovery_papers`, `discovery_research_sessions`.

Il s'agit d'un risque concret d'altération du corpus et des résultats de recherche. Aucun essai d'écriture, de suppression ou d'exploitation n'a été effectué. Les 110 tables publiques ont RLS activée, mais ce seul indicateur ne prouve pas que les politiques protègent leurs lignes. Les privilèges et les politiques doivent être évalués ensemble, comme l'explique la [documentation Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).

Correction attendue : migration réversible après audit des appelants, droits minimaux, écriture serveur contrôlée, propriétaire explicite des espaces de recherche et tests d'autorisation sur des données fictives. Ne pas révoquer aveuglément des droits sans tester les parcours qui en dépendent.

### P1 — faux mécanisme d'authentification du portail patient

`src/components/patient/PatientLoginBlock.tsx` compare le code d'accès à une constante embarquée dans le navigateur puis interroge `patients`. Il ne crée pas de session Supabase Auth. Le code fixe n'est donc pas une authentification du personnel ou du patient. Les contrôles RLS peuvent bloquer l'accès aux données sans pour autant rendre ce formulaire fonctionnel.

Correction attendue : réutiliser le parcours Auth réel, puis appliquer les droits explicites de l'utilisateur sur le dossier. Ne pas désactiver RLS pour faire fonctionner le formulaire actuel.

### P1 — cycle de vie des analyses asynchrones incomplet

Les métadonnées relevées montrent 35 tâches sans `requested_by`, dont trois sans `expires_at`. Certains anciens jobs ou jobs serveur peuvent être sans utilisateur ; cela ne permet pas d'attribuer chaque ligne à une fuite. En revanche, la traçabilité du demandeur ne peut pas être démontrée sur ces lignes.

À `2026-09-05T23:06:36Z`, cinq tâches sont toujours `processing` alors que leur échéance est passée : trois `cross-data-analyzer` et deux `patient-health-synthesis`. Leur dernière mise à jour est au plus tard le 18 juin pour les premières et le 16 juin pour les secondes. Elles n'ont pas été relancées ni modifiées.

Correction attendue : demandeur lié à la session vérifiée, contrôle propriétaire + type de fonction + expiration à la lecture, progression bornée, transition explicite vers expiration/échec, nouvelle tentative idempotente et distinction entre traitement réellement actif et job abandonné.

## 3. Raisonnement scientifique : contre-exemples reproduits

Sept assertions ont été exécutées contre les fonctions pures réelles de `supabase/functions/_shared/clinical-brain.ts`. **Cinq échouent, deux passent.** Ces cas ont été choisis pour tester des défauts précis ; le ratio 5/7 n'est pas une estimation du taux d'erreur clinique du système ou du modèle.

| Cas | Attendu | Observé |
| --- | --- | --- |
| Texte neutre « Message de suivi administratif. » | Risque faible | `high` : recherche par sous-chaîne, dont `age` dans « Message ». |
| « Patient sous warfarin. » en texte libre | Reconnaissance d'un médicament présent dans le propre catalogue de risque du moteur | Indicateur `high_risk_medication` absent ; seule la liste structurée des médicaments est parcourue. |
| Contexte critique et tâche `known_interaction` | Route critique configurée | Route standard choisie avant l'examen de la branche complexe. |
| Contexte critique et tâche `official_label_summary` | Route critique configurée | Même erreur de priorité. |
| « Sources PubMed indisponibles, aucune preuve récupérée » | Aucune preuve externe disponible | `hasExternalEvidence = true`, sur présence de mots clés. |
| Médicament du catalogue dans la liste structurée | Indicateur de risque présent | Réussite. |
| Contexte critique avec tâche de polypharmacie | Route critique configurée | Réussite. |

Les noms de modèles utilisés pour tester les routes sont des valeurs fictives de configuration ; aucun fournisseur n'a été appelé. Ces résultats démontrent des défauts logiciels de classification et de routage. Ils ne mesurent pas la qualité des réponses générées, ne prouvent pas un modèle réellement moins performant et ne constituent pas un test de pratique médicale.

Pour une réponse scientifique défendable, le contrat à évaluer doit couvrir : sources récupérées et identifiables, adéquation entre affirmation et source, distinction observation/hypothèse/causalité, contradictions et données manquantes, fraîcheur du corpus, précision des dates, reproductibilité de la version/configuration, et limites d'application à un patient. Augmenter le paramètre de raisonnement sans vérifier ces dimensions ne suffit pas.

La campagne suivante doit utiliser des cas fictifs et des réponses de référence relues par des spécialistes. Elle devra mesurer séparément l'exactitude, les citations incorrectes ou inventées, les omissions critiques, la gestion des preuves indisponibles, les contradictions, les refus appropriés et la variabilité entre répétitions. Les seuils d'acceptation devront être définis avant la campagne ; aucun pourcentage de « confiance scientifique » ne doit être affiché sans méthode et calibration documentées.

## 4. ClinicalTrials.gov : fraîcheur et précision

La table `clinical_trials` contient 1 896 enregistrements. Le plus récent `fetched_at` relevé est `2025-12-17T09:22:34.840102Z`. Aucun enregistrement n'a `source_url` ou `raw_payload` renseigné dans les nouveaux champs. Une colonne nouvellement ajoutée n'est pas une preuve que l'historique a été resynchronisé. Le comptage nul de `has_posted_results = true` ne signifie pas que ces 1 896 études n'ont pas de résultats : les champs anciens sont inconnus/non renseignés.

Une comparaison a été effectuée via le connecteur officiel sur [NCT06071624](https://clinicaltrials.gov/study/NCT06071624). Le registre indique encore RECRUITING, une dernière mise à jour le 24 juin 2026, aucune donnée de résultats déposée pour cette étude, et une date de fin au format `2043-12`. La copie locale stocke `2043-12-01` sans métadonnée de précision renseignée. Le problème démontré est donc la perte de précision et l'absence de fraîcheur/provenance vérifiable, pas un changement de statut démontré pour cet échantillon.

Le mapper récent conserve une précision séparée et le payload brut pour les nouvelles synchronisations, mais cela ne prouve ni le remplissage des anciennes lignes ni l'affichage correct par chaque écran. Une normalisation technique au premier du mois doit être affichée comme un mois, pas comme une date clinique précise. La présence d'une étude dans le registre ne valide ni son efficacité ni la qualité de ses preuves ; le registre distingue protocole, résultats déposés et publications.

## 5. Revue du design

### Ce qui est observé

Les captures montrent une structure en cartes et un formulaire lisible, sans débordement horizontal de la page aux deux tailles testées. Cependant, la page d'accueil parle d'un « Portail Patient » tandis que le formulaire réserve l'accès au personnel médical. Aucun lien de connexion professionnel n'est présent dans l'accueil testé, alors qu'un autre formulaire Auth existe sur `/auth`.

L'identité visuelle varie entre « Médicore » sur l'accueil/connexion et « NEXUSMED » dans l'administration. Les titres très stylisés, les fonds lumineux et le pied de page technique prennent de la place sans préciser l'état réel des outils. Sur la capture ordinateur de l'administration, le titre principal est masqué par l'en-tête ; le pied de page mobile est très comprimé. L'absence de dépassement horizontal n'exclut pas ces problèmes visuels.

`src/components/layout/AppLayout.tsx` affiche en dur « Status: Optimal », « AES-256 », « v2.4.0 » et « Health Index: 98% ». Pendant l'interception des services, l'interface conserve l'état optimal et remplace les données indisponibles par des compteurs à zéro et « Aucun utilisateur ». Ce n'est pas un test de panne réelle du service : c'est un défaut d'information utilisateur reproduit dans une situation de service indisponible simulée. L'état inconnu/erreur ne doit pas être représenté comme zéro, ni comme un système opérationnel.

L'accueil promet des prédictions de risque à trois mois et une « confiance IA ». Aucune validation de cette promesse n'a été démontrée par cette campagne. Les badges « Sécurisé » et « IA Activée » sont également statiques.

### Direction de refonte proposée — non implémentée

Conserver les cartes et la distinction déjà présente Clinique / Recherche / Outils, mais unifier l'identité autour de MediCore. Clarifier le point d'entrée professionnel et, seulement s'il existe réellement, un parcours patient distinct. Réduire les éléments décoratifs dans les zones de lecture ; réserver la typographie de marque au logo, garder une typographie sobre pour les données, résultats et alertes.

Chaque outil devrait suivre la même progression visible : **Données sélectionnées → Sources disponibles → Analyse → Limites et validation humaine**. L'utilisateur doit voir ce qui a été analysé, ce qui n'a pas été vérifié, le statut de chaque source, la date de récupération et le lien qui étaye chaque conclusion importante. Les états « confirmé », « hypothèse », « contradictoire » et « données indisponibles » ne doivent pas dépendre uniquement d'une couleur.

Remplacer les indicateurs fixes par l'état réel des services avec date du contrôle, version issue du déploiement et périmètre exact de l'indicateur. En cas de panne : message explicite, absence de faux zéro, bouton réessayer et conservation des entrées. Pour un traitement long : progression réelle, délai annoncé seulement s'il est mesuré, annulation et état d'expiration explicite.

Les zones 3D, graphes et molécules doivent indiquer qu'une visualisation ou une hypothèse exploratoire n'est pas une preuve d'efficacité. Sur mobile, prioriser l'action principale, les alertes et les sources, éviter un pied de page fixe qui masque le contenu, et vérifier menus, focus et navigation tactile sur les écrans connectés.

## 6. Ordre de correction et contrôle de retour arrière

1. **Sécurité et intégrité.** Rétablir les contrôles d'accès de `/admin`, remplacer le faux code patient, protéger les sept tables de preuves et vérifier les permissions serveur des fonctions concernées. Commencer par des tests négatifs avec des identités fictives distinctes. Les fichiers existants directement concernés incluent `src/App.tsx`, `src/components/auth/ProtectedRoute.tsx`, `src/pages/Admin.tsx`, `src/components/patient/PatientLoginBlock.tsx` et `src/hooks/useAuth.tsx`. Toute nouvelle migration devra être conçue à partir du schéma vivant et testée, pas ajoutée à ce lot documentaire.
2. **Contrats scientifiques et tâches asynchrones.** Corriger les cinq contre-exemples dans le moteur partagé puis vérifier tous ses appelants ; traiter la propriété et l'expiration des jobs, l'isolation des caches et l'état des sources. Ne pas effacer les anciens résultats pour cacher les erreurs. Les chemins concernés comprennent `supabase/functions/_shared/clinical-brain.ts`, `_shared/ai-client.ts`, `cross-data-analyzer/index.ts` et `patient-health-synthesis/index.ts`.
3. **Données et typage.** Resynchroniser les essais avec provenance et précision, vérifier les consommateurs et résoudre les diagnostics TypeScript sur le schéma effectivement déployé. Contrôler les vulnérabilités hautes sans mise à jour globale aveugle ni suppression du seuil d'audit.
4. **Refonte de l'interface.** Valider la direction ci-dessus, puis modifier les composants communs et les écrans nécessaires avec tests visuels. `src/components/layout/AppLayout.tsx`, `src/pages/Index.tsx`, `src/pages/Auth.tsx` et les composants d'état des outils sont les points d'entrée identifiés ; aucun changement de ces fichiers n'est inclus ici.
5. **Recette métier et scientifique.** Dans un environnement de test avec patients fictifs, exécuter connexion/rôles, lecture/écriture autorisées, documents/export, interactions, synthèse, recherches et graphes, jobs longs, calculateurs, molécules, imports et FHIR. Conserver requête, résultat, sources, durée, version et verdict pour chaque cas ; comparer les réponses à des références indépendantes.

Le besoin non résolu est une session de test dédiée et un environnement contenant uniquement des données fictives, avec les rôles nécessaires et un budget d'appels de modèles explicitement encadré. Ne pas substituer une clé `service_role` à une session navigateur pour prétendre tester les autorisations utilisateur.

Pour ce lot, le retour arrière consiste à retirer les fichiers d'audit sur la branche dédiée ou à fermer la PR. Aucun retour arrière de base, aucune suppression clinique et aucune modification de `main` ne sont nécessaires. Pour les futurs correctifs, prévoir une migration compensatoire non destructive et un retour applicatif à un commit connu.

## Fichiers du lot

- `.github/workflows/medicore-browser-science-audit.yml`
- `docs/superpowers/plans/2026-09-06-design-science-audit.md`
- `docs/superpowers/reports/2026-09-06-design-science-audit.md`

Les fichiers CSV et les captures sont des exports de preuve, pas des modifications applicatives. Les fonctionnalités restent à corriger et les parcours connectés restent à valider. Aucune fusion dans `main` n'est incluse.
