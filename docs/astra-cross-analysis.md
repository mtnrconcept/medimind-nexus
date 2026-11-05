# Analyse croisée par agent GPT-6 Astra

## État et périmètre

Cette note décrit l’implémentation sur la branche `codex/medicore-astra-cross-agent-20261105`, proposée dans la [PR #38](https://github.com/mtnrconcept/medimind-nexus/pull/38) et non fusionnée en production. Elle ne constitue pas un compte rendu d’essai clinique ni une validation des conclusions du modèle.

Le mode Astra examine les pathologies, symptômes, traitements et médicaments sélectionnés, recherche des sources médicales publiques et prépare, lorsque les éléments le permettent, des options thérapeutiques conditionnelles. Il ne modifie aucun traitement dans le dossier et ne produit pas d’ordonnance. La sélection de concepts ne fournit pas un dossier clinique complet : âge, doses, allergies, biologie et chronologie peuvent manquer.

## Architecture

| Couche | Fichiers principaux | Responsabilité |
| --- | --- | --- |
| Contrat clinique | [agent-contract.ts](../supabase/functions/cross-data-analyzer/agent-contract.ts) | Modèle, domaines autorisés, schémas JSON stricts, consignes, validation des directions, sources et propositions. |
| Orchestration | [agent-orchestrator.ts](../supabase/functions/cross-data-analyzer/agent-orchestrator.ts) | Énumération des paires, étapes, alternatives, couverture et revue finale. |
| Fournisseur | [openai-web-search.ts](../supabase/functions/_shared/openai-web-search.ts), [ai-client.ts](../supabase/functions/_shared/ai-client.ts) | Responses API en arrière-plan, recherche native et extraction des traces du fournisseur. |
| Exécution durable | [matrix-job.ts](../supabase/functions/cross-data-analyzer/matrix-job.ts), [index.ts](../supabase/functions/cross-data-analyzer/index.ts) | Authentification, sélection figée, sauvegarde, relais du worker et reprise. |
| Interface | [useCrossMatrix.ts](../src/hooks/useCrossMatrix.ts), [AgentCrossAnalysisPanel.tsx](../src/components/patient/AgentCrossAnalysisPanel.tsx) | Observation du travail, progression, sources et propositions à valider. |
| Graphe | [crossGraphGroups.ts](../src/components/patient/crossGraphGroups.ts), [RiskNetworkGraph.tsx](../src/components/patient/RiskNetworkGraph.tsx) | Groupes par pathologie et instances visuelles partageant une identité clinique. |

Le modèle est fixé à **`gpt-6-astra`** avec `forceModel: true`. Le worker vérifie également l’identité du modèle retourné, en acceptant son identifiant daté éventuel. Une indisponibilité ne déclenche pas une substitution silencieuse par un autre modèle. L’accès effectif a été confirmé par des appels réels le 5 novembre 2026, avec recherche native, dans une fonction isolée ne contenant que des sélections fictives.

## Couverture et étapes

Pour `N` concepts distincts, l’agent construit les **`N × (N − 1) / 2` paires non ordonnées**. Chaque paire exige deux évaluations distinctes, `A → B` et `B → A`, avec explication, limites et références. Une réponse dont les directions sont absentes, répétées ou étrangères à la paire ne valide pas cette cellule.

Le lot contient une seule paire : **chaque paire possède sa propre réponse Responses et au moins une exécution native `web_search` terminée**. Une recherche commune à plusieurs paires n’est pas comptabilisée comme plusieurs recherches individuelles. Des paires différentes peuvent néanmoins consulter les mêmes sources.

| Étape | Travail et condition de passage |
| --- | --- |
| `pairs` | Toutes les paires initiales sont recherchées et examinées dans les deux sens. Les liens préexistants en base ne remplacent pas cet examen. |
| `plan` | Recherche spécialisée complémentaire et synthèse de toute la sélection : risques cumulés, données manquantes, au plus deux options et quatre nouveaux candidats. |
| `candidate_pairs` | Chaque candidat est croisé avec chaque concept sélectionné et avec tous les autres candidats. |
| `final` | Revue des résultats initiaux et des candidats, des alertes et des sources conservées ; aucune nouvelle recherche ni nouvelle alternative structurée à introduire. |
| `completed` | Revue IA terminée. Les propositions restent soumises à validation médicale. |

Avec `K` nouveaux candidats, la seconde matrice contient **`K × N + K × (K − 1) / 2`** paires. Les variantes de nom normalisées utilisent la même identité. Dans la revue finale, les changements structurés sont limités aux concepts sélectionnés ou aux candidats déjà examinés ; un remplacement n’est accepté que sous l’action prévue pour remplacer. Une cible structurée de surveillance ne peut pas introduire discrètement une nouvelle molécule. La revue finale peut retirer toutes les options.

Le serveur refuse une étape incohérente ou une finalisation avant la couverture requise. La synthèse reçoit toutes les paires, tous les liens retenus et les alertes cumulées ; seuls certains textes sont raccourcis. Cette exhaustivité concerne les paires. Les effets impliquant trois éléments ou davantage sont soumis à la revue globale, sans prétendre énumérer toutes les combinaisons possibles.

## Sources, interprétation et incertitudes

La recherche native est restreinte aux domaines définis dans `MEDICAL_WEB_DOMAINS` : notamment Swissmedic, SwissmedicInfo, Compendium, EMA, FDA/DailyMed, PubMed/PMC, HAS/ANSM, NICE, OMS et organismes de recommandations spécialisées. Cette liste limite les sites consultables ; elle ne garantit ni leur disponibilité ni la qualité de chaque publication.

Une référence est retenue seulement si son URL HTTPS autorisée apparaît dans les sources ou citations natives retournées par le fournisseur. Le JSON généré ne peut pas, à lui seul, déclarer une URL comme vérifiée. Les liens portent `evidenceOrigin: "openai_web_search"` et `citationVerification: "provider_trace"`.

**Cette vérification établit la provenance de l’URL dans la trace du fournisseur. Elle ne constitue pas une vérification indépendante du contenu de la page ou d’une citation verbatim.** Aucun passage n’est marqué comme extrait indépendamment contrôlé. Les liens cliquables permettent au lecteur de consulter les références ; leur adéquation clinique reste à apprécier.

Les relations distinguent indication, soulagement symptomatique, effet indésirable, contre-indication, aggravation de maladie, interaction, manifestation, cascade de symptômes, facteur de risque, usage complémentaire, coadministration et association. L’effet d’une interaction peut augmenter ou diminuer un effet, augmenter la toxicité, être mixte ou rester inconnu. Le contexte distingue notamment maladie, voie d’administration, population et chronologie. Un symptôme antérieur à l’exposition ne conserve pas une attribution causale affirmative au traitement. Une intervention non médicamenteuse peut avoir une indication directe sans voie d’administration applicable.

Une recherche effectuée peut aboutir à une hypothèse ou à des éléments insuffisants. L’absence de source exploitable, une source indisponible et l’absence de lien établi ne prouvent pas l’absence de risque. Une affirmation sans référence traçable est rétrogradée ; une réponse sans recherche native n’est pas acceptée pour les étapes qui l’exigent. Une paire contenant une indication sourcée et un risque non traçable conserve l’indication, mais reste explicitement partielle et incertaine. Une direction citée sans aucun lien structuré retenu ne peut pas valider silencieusement une cellule vide. Les limites et incertitudes doivent rester visibles même après la fin du travail.

## Proposition thérapeutique et affichage

Le plan expose un résumé, les risques globaux, les données manquantes et, pour chaque option, justification, bénéfices attendus, risques résiduels, surveillance, vérifications et sources. Les actions sont des **changements à discuter**, sans posologie ni prescription automatique. Une option dont une étape manque de source est rejetée entièrement : supprimer un retrait indispensable en conservant un remplacement et ses bénéfices rendrait le scénario incohérent. Les statuts possibles sont `review_required`, `insufficient_context` et `no_change_supported` ; aucun changement n’est imposé pour remplir le panneau.

Le panneau conserve le badge **« Provisoire »** tant que la revue n’est pas terminée ou qu’un compteur requis est incomplet : paires initiales examinées, paires avec recherche web et croisements des candidats. Un état serveur `completed` avec des compteurs incomplets affiche **« Couverture incomplète »**. Une fois ces conditions remplies, les options portent **« À valider »**, jamais « optimal » ou « prescrit ».

La barre mesure uniquement la couverture des paires initiales : elle peut atteindre 100 % pendant l’examen des alternatives ou la revue finale. Le libellé d’étape et le compteur des alternatives précisent le travail restant. « Paires incertaines » concerne la sélection initiale ; une revue terminée peut conserver des incertitudes. Aucun pourcentage de progression n’est un score de bénéfice ou de sécurité clinique.

## Groupes du graphe et identité

Chaque pathologie sélectionnée reçoit un groupe. Les associations reposent sur des relations explicites réexaminées : indication directe pour un médicament ou traitement, manifestation directe pour un symptôme. Un usage complémentaire conserve son libellé distinct. Un symptôme relié par effet indésirable direct rejoint les groupes du médicament concerné sans devenir, par cette seule disposition, un symptôme causé par la maladie. Les éléments non attribués restent visibles.

Un médicament lié à deux pathologies apparaît dans les deux groupes. Chaque copie possède un identifiant visuel propre, mais conserve le même **`canonicalId`** et l’identifiant d’origine **`entityId`**. Sélection, réanalyse et comptages utilisent l’entité canonique : la duplication graphique ne crée ni traitement supplémentaire ni paire supplémentaire. Les identités des liens préservent aussi leurs différents mécanismes sans multiplier les alertes à cause des copies.

La sélection enregistrée est restaurée une fois par travail, avec ses concepts externes et ses noms figés. Les actualisations ultérieures ne remplacent pas un brouillon modifié. Le graphe d’une nouvelle sélection masque les anciens liens et la couverture antérieure jusqu’à réanalyse. Un changement de patient ou de moteur efface immédiatement l’ancien travail et ignore les réponses tardives de l’ancien périmètre.

## Persistance et reprise

Les actions publiques authentifiées sont `agent.start`, `agent.latest` et `agent.resume`. `agent.work` est réservé au relais serveur avec la clé de service. Les accès sont filtrés par propriétaire, mode d’analyse et périmètre ; un dossier patient doit être accessible à l’utilisateur. La sélection interne est reconstruite côté serveur et figée pour le travail lancé.

L’état est conservé dans la table existante **`ai_analysis_jobs`**, sous le mode **`astra_cross_matrix`** : sélection, cellules validées, étape, candidats, plan, sources, identifiant Responses et informations de reprise. **Aucune nouvelle migration SQL n’est nécessaire pour ce changement.**

Chaque génération utilise Responses en arrière-plan avec stockage. Le worker persiste son identifiant puis relit la même réponse ; des réservations atomiques et des baux limitent les relais concurrents. Fermer la page interrompt son observation, pas le travail serveur. Après une coupure, l’interface retrouve le travail enregistré.

Une création dont l’accusé de réception est perdu n’est pas répétée automatiquement au risque de payer deux générations. Les lectures transitoirement interrompues réutilisent l’identifiant existant. Une réponse terminale invalide, un mauvais modèle, un contrat clinique incomplet ou une réponse introuvable portent un indicateur explicite de régénération : l’identifiant est conservé pour diagnostic et remplacé seulement à la reprise explicite. Les erreurs d’authentification conservent l’identifiant pour pouvoir relire la même réponse après correction. Un échec de sauvegarde ne fait pas avancer l’étape et ne régénère pas une réponse déjà valide.

Les cellules validées survivent aux échecs. Le watchdog de 60 minutes s’applique à une étape sans progrès et est réinitialisé après chaque étape validée. Une analyse longue qui progresse n’est donc pas arrêtée simplement après une heure au total.

## Bornes opérationnelles

| Limite | Comportement |
| --- | --- |
| Sélection | Entre 2 et 50 éléments soumis, avec au moins deux concepts distincts après normalisation. |
| Alternatives | Au plus 4 nouveaux candidats et 2 options ; au plus 8 changements par option. |
| Recherches natives | Une réponse distincte par paire ; budget maximal de 16 appels d’outil par réponse de paire, 20 pour le plan. |
| Taille d’entrée | Garde de 350 000 caractères JSON avant les étapes avec recherche, 1 800 000 pour la revue finale. Ce sont des bornes en caractères, pas un comptage exact de tokens. |
| Dépassement | Interruption explicite demandant une sélection plus ciblée ; aucune paire écartée silencieusement pour faire tenir la synthèse. |

À 50 concepts, 1 225 paires initiales sont à traiter. Quatre candidats ajoutent 206 paires, puis les étapes de plan et de revue finale. Durée et coût augmentent donc fortement avec la sélection ; la limite autorisée ne garantit pas qu’une synthèse très dense restera sous la garde de taille. La couverture technique ne garantit pas l’exactitude médicale des textes libres.

## Déploiement et retour arrière

1. Vérifier les tests ciblés, le typage, le lint, le build et les contrôles Edge pertinents. Vérifier l’accès réel à Astra, la recherche native, les deux directions, la reprise et les permissions sur un environnement de validation.
2. **Déployer d’abord `cross-data-analyzer` et ses dépendances serveur prenant en charge `agent.*`.** Confirmer `start/latest/resume` et le relais interne avant de publier le frontend qui appelle ces actions.
3. Déployer ensuite le frontend et contrôler le panneau, les groupes automatiques et les copies d’un médicament partagé. Le hook utilise Astra par défaut et continue à proposer le mode interne `literature` pour les appels `matrix.*`.
4. Consigner les résultats réels, la référence Git et les déploiements vérifiés avant la fusion et la livraison en production.

Les anciennes actions **`matrix.*`** et le mode **`progressive_matrix`** sont préservés. En cas de retour arrière, revenir au frontend précédent ou révoquer les changements de la branche par un revert. Conserver, lorsque possible, le backend compatible pour permettre la fin ou la reprise des travaux déjà lancés ; ne revenir au backend précédent qu’après examen des travaux en cours. Aucun rollback ne doit supprimer les données cliniques ou la table des travaux.

### Vérifications à consigner

Les régressions ciblées se lancent avec :

```bash
node --import tsx --test \
  tests/openai-web-search.test.ts \
  tests/astra-cross-agent.test.ts \
  tests/astra-pair-schema.test.ts \
  tests/astra-cross-safety.test.ts \
  tests/astra-cross-worker.test.ts \
  tests/cross-graph-groups.test.ts \
  tests/cross-graph-integration.test.ts \
  tests/agent-cross-analysis-panel.test.ts
```

### Contrôles locaux exécutés le 5 novembre 2026

| Vérification | Résultat |
| --- | --- |
| `node --import tsx --test --test-concurrency=1 tests/*.test.ts` | 444 tests réussis, aucun échec. |
| Régressions agent, schéma par paire, sécurité et transport après correction | 50 tests réussis ; les 20 tests du worker ont également réussi après l’ajustement du message de reprise. |
| Suite complète après correctifs, dans GitHub Actions | 448 tests réussis, aucun échec, aucun test ignoré. |
| `npm run typecheck` | Réussi. |
| `tsc -p tsconfig.scientific-library.json --pretty false` | Réussi. |
| `tsc -p tsconfig.ai-continuity.json --pretty false` | Réussi. |
| `npm run lint` | Aucune erreur ; avertissements préexistants du dépôt conservés. |
| `npm run build` | Build de production réussi ; avertissements existants de taille des bundles. |
| Bundle Supabase de validation | Quatre versions de la fonction isolée compilées et déployées avec succès. Le schéma par paire a été accepté par l’API réelle. |

Le contrôle Deno local complet de l’entrée de production est bloqué par l’accès réseau à `deno.land`. Le contrôle correspondant a réussi dans la [CI GitHub après correctifs](https://github.com/mtnrconcept/medimind-nexus/actions/runs/41979967240), ainsi que les 448 tests, les sept contrôles TypeScript, le lint, le build, l’audit des dépendances et les tests PostgreSQL 17 d’autorisation et de provenance. Les tests d’intégration exécutent les composants et leurs hooks avec des dépendances simulées ; ils ne remplacent pas une vérification visuelle dans une session authentifiée du navigateur.

### Limite de vérification de l’aperçu

Le 5 novembre 2026 à 06:04 UTC, la création d’un aperçu Vercel de la branche de test a été refusée : HTTP 402, `api-deployments-free-per-day`, plus de 100 déploiements dans la journée, délai annoncé de 24 heures. Aucun aperçu de cette branche n’a donc été publié. Aucun paramètre de facturation n’a été modifié. La production reste sur le commit `a93abcd04b1fc966cf87add0375b5785159aa397` à cette vérification. La validation visuelle authentifiée et le contrôle d’un déploiement Vercel de cette nouvelle interface restent à effectuer avant une livraison en production.

### Essais réels sur sélections fictives

Les essais ont utilisé une fonction temporaire isolée et le modèle `gpt-6-astra` retourné par OpenAI. Ils ne contiennent ni dossier patient ni données personnelles. Chaque relation conservée possède une URL issue de la trace native de recherche. Ces essais vérifient l’exécution, la provenance et la structure des résultats ; leur petit nombre ne mesure pas l’exactitude médicale générale du système.

| Sélection fictive | Résultat constaté |
| --- | --- |
| Hypertension + migraine + asthme + propranolol oral | Travail `f1ca9933-554d-41c4-9b5e-6711c3e8e9f5` terminé à 06:22:39 UTC : 6/6 paires initiales, 4/4 croisements du candidat, 20 directions, 44 sources conservées. Une option conditionnelle de remplacement est retenue après revue finale. |
| Propranolol oral + salbutamol inhalé | Travail `aa4e9410-477d-4880-9e99-2e92be061e32` terminé à 05:44 UTC : paire examinée dans les deux sens, interactions contextuelles de diminution d’effet et d’augmentation de toxicité, six sources conservées. La synthèse distingue interaction documentée et absence de preuve d’un événement individuel. Sonde limitée à la paire, sans optimisation demandée. |
| Propranolol oral + bronchospasme | Travail `0ab2e924-a91e-4585-b03b-68bedd32160c` terminé à 05:43 UTC : effet indésirable direct documenté médicament → symptôme, association dans le sens inverse, deux sources conservées. Aucune imputabilité individuelle affirmée sans exposition ni chronologie. Sonde limitée à la paire, sans optimisation demandée. |

Le scénario principal, travail `f1ca9933-554d-41c4-9b5e-6711c3e8e9f5`, réunit hypertension artérielle, migraine, asthme bronchique et propranolol oral. Ses six paires initiales puis les quatre croisements du candidat proposé par l’agent ont été examinés : vingt directions et dix recherches enregistrées. Deux évaluations du candidat restent contextuelles ; l’examen de toutes les paires n’établit pas sa sécurité clinique. Sur les relations initiales, le helper de production du graphe a réussi dix assertions : exactement deux instances de propranolol, dans les groupes hypertension et migraine ; aucune instance comme traitement de l’asthme ; lien respiratoire à danger élevé conservé, y compris après masquage du premier groupe ; quatre éléments canoniques et six paires inchangés malgré cinq nœuds cliniques visuels. Le résultat encode ce lien de risque comme `adverse_effect`, ce qui ne doit pas être confondu avec le nom d’un autre type structuré.

La revue finale conserve un scénario **à discuter avec le prescripteur**, de remplacement du propranolol oral par le candésartan cilexétil oral, accompagné de quatre actions de surveillance. Elle écarte l’association durable et ne valide aucun chevauchement de transition. Elle distingue l’indication antihypertensive documentée, les résultats publiés pour la prévention de migraine épisodique adulte, les limites respiratoires et le statut réglementaire local à vérifier. Les données manquantes, les risques résiduels et la validation du prescripteur restent obligatoires ; aucune nouvelle posologie ni modification autonome n’est proposée. Il s’agit du résultat d’un scénario fictif, pas d’une recommandation pour une personne réelle.

L’audit final confirme que les treize URL structurées distinctes de cette option appartiennent au registre des sources, que les 23 liens et dix évaluations portent leur provenance native, et qu’aucun nouveau traitement structuré non examiné n’a été introduit. Le rendu du composant `AgentCrossAnalysisPanel` sur le résultat réel affiche **« Revue IA terminée »** et **« À valider »**, sans couverture incomplète ni état provisoire. Cet audit de rendu utilise des dépendances simulées et ne remplace pas l’essai visuel authentifié restant.

L’exécution réelle a aussi révélé et permis de corriger deux défauts d’intégration : une indication pouvait perdre son lien graphique lorsque sa direction et son lien citaient deux URL natives différentes ; une réponse sur une paire de médicaments pouvait inclure des liens vers les pathologies du contexte. Les sources de chaque direction et de chaque lien sont désormais validées indépendamment, et le schéma de génération borne les identifiants à la paire en cours. Le validateur continue de refuser les relations hors périmètre. Les cellules déjà valides sont conservées lors de la reprise.

La fonction temporaire `cross-astra-eval-20261105` a été neutralisée en version 5 après ces essais : vérification JWT réactivée et gestionnaire réduit à une réponse HTTP 410, sans appel OpenAI ni accès aux travaux. Une tentative avec l’ancien jeton de contrôle a obtenu HTTP 401. Les résultats enregistrés n’ont pas été supprimés. La fonction de production `cross-data-analyzer` n’a pas été remplacée par le runner de test.

Une alerte GitGuardian sur le premier commit correspondait au prédicat rejetant les identifiants intégrés aux URL, sans valeur de mot de passe ni secret. Ce prédicat a été clarifié, avec maintien des tests de rejet des URL authentifiées, des ports non autorisés et des domaines trompeurs. Aucune exclusion du scanner ni modification de sa politique n’a été ajoutée.

### Fichiers concernés

| Couche | Fichiers |
| --- | --- |
| Interface et sélection | `src/components/patient/CrossDataAnalyzer.tsx`, `src/components/patient/AgentCrossAnalysisPanel.tsx`, `src/hooks/useCrossMatrix.ts` |
| Graphe | `src/components/patient/RiskNetworkGraph.tsx`, `src/components/patient/crossGraphGroups.ts` |
| Transport OpenAI | `supabase/functions/_shared/ai-client.ts`, `supabase/functions/_shared/openai-web-search.ts` |
| Agent et orchestration | `supabase/functions/cross-data-analyzer/agent-contract.ts`, `supabase/functions/cross-data-analyzer/agent-orchestrator.ts`, `supabase/functions/cross-data-analyzer/matrix-job.ts` |
| Contrat et routage | `supabase/functions/cross-data-analyzer/analysis-utils.ts`, `supabase/functions/cross-data-analyzer/relation-contract.ts`, `supabase/functions/cross-data-analyzer/index.ts` |
| Tests agent/transport | `tests/astra-cross-agent.test.ts`, `tests/astra-cross-safety.test.ts`, `tests/astra-cross-worker.test.ts`, `tests/astra-pair-schema.test.ts`, `tests/openai-web-search.test.ts` |
| Tests interface/clinique | `tests/agent-cross-analysis-panel.test.ts`, `tests/clinical-relation-specific-effects.test.ts`, `tests/cross-graph-groups.test.ts`, `tests/cross-graph-integration.test.ts`, `tests/cross-matrix-observation.test.ts` |
| Documentation | `docs/astra-cross-analysis.md` |
