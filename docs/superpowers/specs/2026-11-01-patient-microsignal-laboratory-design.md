# MediCore — laboratoire de microsignaux longitudinaux (cas clozapine/myocardite)

## Objectif
Démontrer la détection de signaux précoces et de regroupements temporels entre 50 dossiers patients **100 % synthétiques**. Les dossiers existants et les données de production ne sont ni lus, ni modifiés, ni mélangés. Ce laboratoire n'est pas un dispositif médical validé.

## Approches examinées
1. **Insertion de 50 cas fictifs dans `patients`** : rejetée, contamination irréversible des dossiers réels et faux risques cliniques.
2. **Analyse automatique de toute la base réelle via rôle service** : rejetée en l'absence de consentement explicite et de tests d'isolation multi-utilisateurs; risque de ré-identification et de conclusions fallacieuses.
3. **Jeu synthétique versionné + moteur déterministe et flux de modifications simulées dans une page admin** : retenue comme première tranche fonctionnelle et testable. Le moteur pur pourra être réutilisé plus tard dans un service serveur respectant les consentements et les contrôles d'accès.

## Référence clinique
Clozapine et myocardite dans les semaines suivant l'initiation. Ronaldson et al., 2011 (PMID 21524186, DOI 10.3109/00048674.2011.572852) rapporte un protocole de surveillance CRP/troponine et une fenêtre temporelle courante de 10 à 33 jours dans les dossiers analysés. Bellissima et al., 2022 (PMID 35048875) documente une fenêtre critique de 42 jours et la faible spécificité de la tachycardie isolée. Consensus multidisciplinaire 2025 (PMID 40452212) recommande de considérer les valeurs initiales et les tendances. Le protocole n'est pas uniforme et les seuils sont tributaires de l'essai analytique. Ces références servent à définir une **hypothèse de surveillance**, non à attribuer une causalité chez un patient.

## Données synthétiques
50 dossiers individualisés avec identifiant préfixé SIM, informations administratives fictives, contexte social, facteurs de risque, pathologies datées, traitements et doses simulés, symptômes, observations cliniques, allergies, antécédents familiaux, vaccinations, observations biologiques CRP et troponine avec unités et LSN, surveillance, examens cardiaques, consultations et événements de diagnostic confirmés ou non. Les groupes de traitement/diagnostic sont **artificiellement enrichis** en événements pour tester la détection : aucun taux de cohorte ne représente une incidence réelle. Dates cohérentes et valeurs déterministes reproductibles.

## Signalisation
- Biomarqueurs *absolus et relatifs à la limite supérieure normale du laboratoire* (LSN), valeurs successives et chronologie de début du traitement, contrôle de l'unité ; signes isolés inflammatoires non spécifiques classés « vigilance ».
- Retour « examen médical urgent » si alerte sur marqueurs suivant le protocole; **jamais** diagnostic autonome ni prescription/arrêt automatique.
- Analyse de cohorte (fenêtre 42 jours, statut d'exposition explicite, comparaison exposés/non exposés, temporel, groupes similaires), jamais conversion d'un groupe créé artificiellement en estimation de risque ni affirmation de causalité.
- Données absentes indiquées comme « indisponibles », non comme « négatives ».
- Recalcul sur chaque événement injecté dans un flux synthétique et journal des changements; aucun événement patient réel n'est lu pour le laboratoire.

## Sécurité et limites
- Route `/research/microsignals` accessible uniquement à l'administrateur déjà authentifié (le contrôle de route reste défense en profondeur, pas une autorisation serveur pour les données réelles).
- Aucune clé API, aucun appel IA, aucun patient réel; pas de collecte/stockage de PHI, pas de traces personnelles en réseau.
- Pas de service permanent sur les dossiers réels sans consentement, mandat clinique, agrégation protectrice, audit et validation réglementaire.
- Sources consultables dans l'interface. Ne pas utiliser les données de démonstration comme une preuve empirique.

## Non-objectifs
Ne pas déployer un outil de diagnostic actif ni scanner sans autorisation les dossiers de patients réels. Ne pas transformer des alertes biologiques en certitude clinique. Ne pas prédire les cancers pancréatiques du scénario fourni, faute de relation causale validée dans ce contexte.

## Réparation de sécurité d'un service réel existant
L'Edge Function `signal-detector` était fondée sur une clé `service_role` et lisait des colonnes inexistantes (`parameter_name`, `measured_at`) dans `patient_lab_results`. Cette évolution corrige ce service **séparément du laboratoire synthétique** : vérification JWT via Auth, lectures liées aux politiques RLS réelles, validation UUID/période, correspondance des unités exacte et `test_name` / `test_date`. Ne pas déclarer cette correction déployée tant qu'une Edge Function de production n'a pas été redéployée et testée avec deux utilisateurs réels distincts.
