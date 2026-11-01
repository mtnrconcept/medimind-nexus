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
