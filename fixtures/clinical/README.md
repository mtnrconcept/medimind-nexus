# Jeu de cas médicaux synthétiques — **aucune donnée clinique réelle**

Ce dossier est la génération déterministe de **50 parcours fictifs** pour tester le laboratoire de microsignaux de MediCore. Chaque `SIM-Pxxx.json` est un dossier autonome; `microsignals-cohort-50.json` est le manifeste agrégé correspondant. Les prénoms et noms sont fictifs; toute ressemblance avec une personne est fortuite. Ne jamais importer ces fichiers dans la table `patients`.

`npm run generate:microsignals-demo` régénère exactement les fichiers. `npm test` vérifie l'identité, le contenu de chaque fichier, l'ordre temporel, le statut fictif, les signaux, les comparateurs et l'absence d'écriture dans les dossiers réels.

## Cohorte scénarisée (NON représentative)

- 26 patients commencent une clozapine simulée et 24 une olanzapine simulée (indication similaire).
- 5 diagnostics fictifs de myocardite apparaissent dans les 42 jours suivant le début de la clozapine; 1 cas comparateur avec étiologie virale est simulé.
- 2 autres cas simulent une infection intercurrente avec une CRP élevée mais une troponine sans élévation spécifique.
- Les 50 parcours comprennent dates de naissance fictives, cadre social, habitudes, allergies (inconnues, donc pas « absence d'allergie »), vaccinations, antécédents familiaux, traitements et indication, diagnostics datés, **30 résultats biologiques au minimum**, constantes (pouls, tension, température, saturation), consultations, ECG et chronologie d'événements.
- Six observations nouvelles sont disponibles pour simuler l'arrivée de résultats et leur réanalyse immédiate.

**Ces chiffres sont configurés pour faire fonctionner les tests.** Une proportion artificielle de 5/26 n'est ni une incidence ni une estimation de risque, encore moins la preuve d'un lien causal chez un patient réel. Les résultats des simulations ne sont pas validés comme recommandations ou diagnostics. Les alertes doivent être évaluées par un clinicien.

## Fondements scientifiques *du scénario*, pas des données

- Ronaldson et al., *A new monitoring protocol for clozapine-induced myocarditis*, 2011. PMID:21524186, DOI:10.3109/00048674.2011.572852, https://pubmed.ncbi.nlm.nih.gov/21524186/ . Fenêtre d'apparition décrite et proposition de suivi CRP/troponine.
- Étude du registre électronique, 2022, PMID:35048875, https://pubmed.ncbi.nlm.nih.gov/35048875/ . Fenêtre critique d'environ 42 jours et faible spécificité d'une tachycardie isolée.
- Consensus multidisciplinaire, 2025, PMID:40452212, https://pubmed.ncbi.nlm.nih.gov/40452212/ . Surveillance initiale et valeur des tendances.
- LOINC 1988-5 : CRP, https://loinc.org/1988-5/ ; LOINC 89579-7 : troponine I ultrasensible, https://loinc.org/89579-7/ . Les seuils de troponine dépendent des méthodes analytiques; **14 ng/L est une LSN fictive de démonstration et n'est pas transférable à tous les laboratoires**.
- Analyse des biais en pharmacovigilance, PMID:40993470, https://pubmed.ncbi.nlm.nih.gov/40993470/ . Une disproportionalité ne démontre pas la causalité; a fortiori dans un jeu artificiellement enrichi.

## Fonctionnement et isolation

La page `/research/microsignals` est protégée par le rôle `admin`. Elle charge uniquement ces fixtures versionnées depuis le bundle statique du frontend. Le moteur de signaux est une fonction déterministe pure; le flux démo conserve ses observations dans l'état du navigateur et recalcule les regroupements à chaque événement. **Il n'effectue aucune requête à Supabase, n'accède à aucun dossier réel et ne tourne pas en arrière-plan**. Pour un déploiement sur des données de soin réelles, il faut une architecture serveur distincte avec base légale, consentement/autorisation, séparation des finalités, contrôle d'accès, audit, groupes suffisamment grands et validation clinique prospective. Ce branchement **n'est pas fait**.
