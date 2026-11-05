# Recherche scientifique de MediCore

Le panneau **Recherche scientifique sourcée** se trouve dans `/discovery-platform`. Choisir une maladie, un gène ou un médicament. Les noms anglais et les identifiants des bases donnent accès à davantage de notices. N’envoyer que des termes scientifiques publics. La fonction vérifie la session Supabase et ne consulte aucun dossier patient.

## Ce que le moteur interroge

| Question ou identifiant | Sources interrogées selon le terme | Ce qu’apporte une notice |
| --- | --- | --- |
| Publication ou essai | PubMed, Europe PMC, ClinicalTrials.gov, Prognyx | Identifiants de publication ou de registre, type de document, interventions et critères prévus quand disponibles. Prognyx peut retrouver le même enregistrement ClinicalTrials.gov. |
| Maladie ou identifiant d’ontologie | Open Targets, EFO via OLS, GWAS Catalog | Choix du phénotype, cibles associées, études génétiques et composés reliés à des essais. Le score Open Targets mesure une association. |
| Gène humain | Ensembl, NCBI Gene, ClinVar, UniProt, AlphaFold DB, Human Protein Atlas, STRING, GWAS Catalog, CPIC / ClinPGx | Identité du gène, variants, protéine, modèles structuraux, expression, partenaires, associations et annotations pharmacogénétiques. |
| Médicament ou composé | ChEMBL, PubChem, CPIC / ClinPGx | Identité du composé et paires gène–médicament annotées. La classification d’une paire ne fournit pas de règle de prescription. |

Chaque réponse conserve la requête, l’heure UTC, la source, les identifiants, les liens d’origine et le statut de récupération. Les résultats sont un échantillon borné, jusqu’à 12 notices par source. Une recherche vide vaut uniquement pour la requête et la fenêtre de résultats utilisées. Une source en erreur est marquée indisponible. Les recherches indépendantes sont limitées à quatre en parallèle avec une échéance commune.

Le graphe radial affiche en plus le résultat de ses lectures locales et des recherches PubMed. Il interroge openFDA FAERS uniquement pour un médicament désigné explicitement. Les conclusions produites par le modèle sont étiquetées comme hypothèses. Les anciennes lignes du cache de graphes, alimenté par les clients, sont exclues de ce parcours. Les générations suivantes peuvent donc prendre plus de temps.

## Utiliser le carnet

1. Chercher une maladie et vérifier le libellé de l’entité avant de suivre une cible ou un composé.
2. Retenir les notices dans le carnet. Les publications partageant un PMID conservent leurs différentes provenances. L’essai et la publication qui en rend compte ont chacun leur identifiant.
3. Écrire une hypothèse réfutable et un critère qui permettrait de la remettre en cause. Attribuer soi-même aux références le rôle « à examiner », « appuie » ou « contredit ». Une fiche de registre décrit d’abord un protocole. Vérifier le dépôt des résultats, la population, le comparateur et la durée avant toute interprétation.
4. Exporter le carnet en JSON avant de quitter la page. Le carnet reste en mémoire, dans la limite de 20 références. Le serveur ne stocke ni les notes ni les recherches de ce panneau.

## Accès des plugins et ressources spécialisées

L’annuaire ouvre les interfaces officielles des autres bases pour poursuivre une recherche spécialisée, notamment sur les cohortes, la protéomique, les données unicellulaires et le métabolisme. Un lien de l’annuaire ne figure jamais comme source consultée du simple fait qu’il a été affiché. Les prépublications et les certificats d’analyse ont des usages distincts des essais cliniques.

Le chemin automatisé de MediCore utilise des API publiques et le serveur MCP public Prognyx. Les sessions privées des plugins ChatGPT ne sont pas transférées à l’application. La prédiction génomique Genomic Intelligence, les calculs Proto et les expériences de laboratoire Adaptyv ne sont pas déclenchés par le moteur. L’ancien accès REST eQTL Catalogue a été retiré par le fournisseur. L’annuaire renvoie au mode d’accès par fichiers.

## Vérifier et livrer

- Le parcours scientifique utilise les variables Supabase existantes. Les deux fonctions exigent une session utilisateur. Aucune migration n’est nécessaire.
- Pour la revue locale, exécuter les tests du dépôt, le contrôle `typecheck:workspace` et le build. La CI vérifie également les deux points d’entrée Edge avec Deno.
- Avant d’exposer le nouveau client dans un environnement, déployer les fonctions `scientific-evidence` et `deep-research-graph` **sur le projet Supabase de cet environnement** avec la vérification JWT activée. Vérifier le refus d’une requête anonyme, puis interroger une source avec une session de test. La CI de migrations ne déploie pas les fonctions.
- Un retour arrière restaure le client et la précédente version de `deep-research-graph`. Le nouveau point d’entrée de lecture peut être retiré après le retour arrière du client. Aucun changement de données n’est requis.


## Bibliothèque bilingue et analyse croisée (novembre 2026)

La page de découverte affiche une bibliothèque des **notices scientifiques** enregistrées, consultables par titre, revue et PMID. La recherche normalise les accents et résout les synonymes médicaux français/anglais connus sans modifier la donnée clinique d'origine. Les documents externes sont de simples références : leur présence ne valide ni diagnostic, ni causalité, ni sécurité thérapeutique. Les « compétences » proposées sont des fiches méthodologiques de recherche, et non des plugins installés ou des analyses exécutées.

Un corpus initial de 499 notices distinctes a été récupéré de l'API publique Europe PMC, limité aux identifiants PubMed valides et aux dates 2023–2026. Les originaux et leurs URLs PubMed sont conservés ; certaines traductions de titres sont automatiques, non validées et signalées. Si le fournisseur de traduction refuse une demande, le titre anglais reste affiché et interrogeable, sans inventer de traduction. Les sources sont attribuées à 21 domaines, avec des libellés thématiques français.

L'analyse croisée cherche désormais chaque paire de concepts dans PubMed puis Europe PMC en cas d'échec, et conserve les statuts « résultats », « aucun résultat pour la requête » ou « source indisponible ». Les références retrouvées sont visibles dans la matrice même sans lien causal confirmé. Les noms complets et voies d'administration d'origine ne sont jamais remplacés par les termes de recherche normalisés. Une matrice sans relation documentée n'affiche pas de score bénéfice/risque artificiel. Les résultats doivent être revus cliniquement.

**Déploiement :** appliquer la migration `20261104225342_searchable_french_literature.sql` au projet Medicore, déployer les fonctions `cross-data-analyzer` et `scientific-evidence` (JWT obligatoire), puis ajouter les notices sous rôle serveur avec conflit PMID ignoré. La migration ne modifie pas les dossiers patients. Vérifier les lectures authentifiées, le rejet anonyme et les URLs PubMed. Les anciens traitements IA restent consultables et doivent être relancés pour profiter du nouveau moteur.

## Analyse croisée OpenAI : analyse de chaque paire

Depuis cette évolution, la vue « Analyse croisée » lance systématiquement la matrice persistante côté serveur avec OpenAI, même si le mode local est sélectionné pour d'autres assistants. Les associations trouvées en base sont conservées comme contexte, **pas comme cellules déjà examinées**. Toutes les paires sélectionnées sont envoyées au modèle, y compris en l'absence de résultats PubMed/Europe PMC ou quand les services scientifiques sont indisponibles.

Chaque cellule reçoit une analyse française structurée du modèle : « référence citée à vérifier », « hypothèse non confirmée », ou « données insuffisantes ». Les résultats sont conservés progressivement et peuvent être repris. Une hypothèse ne crée pas de lien clinique confirmé : seules les relations proposées avec une référence réellement récupérée peuvent apparaître dans le graphe, et leur validité clinique reste à examiner. Aucune absence de source ne vaut absence de risque. Les scores ne sont jamais calculés à partir de simples hypothèses. La vue réseau utilise le même traitement OpenAI serveur ; les analyses sont consultables depuis la vue matrice et la section des résultats.

La modification ne requiert aucune migration de données. Déployer seulement la fonction Edge cross-data-analyzer (vérification JWT activée) après les tests. Les anciens résultats persistés ne sont pas rétroactivement classés comme analyses OpenAI ; relancer une nouvelle analyse pour bénéficier de cette méthode.

### Sécurité des relais de collecte

Pour respecter la limite Supabase de requêtes internes en cascade, le collecteur documentaire réserve au plus trois démarrages de scraper par période glissante de 60 secondes (au lieu de 30 secondes). Les tâches restent persistantes et les trois workers maximum peuvent traiter leur lot sans navigateur ouvert. Les accusés de réception perdus n’autorisent jamais un second lancement payant. Le ralentissement de l’admission est volontaire et ne modifie pas les traitements cliniques.
