# Laboratoire de microsignaux patients — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task, test-first.

**Goal:** Construire et valider une cohorte de 50 dossiers entièrement synthétiques et un moteur déterministe de détection longitudinal/inter-patients alimentant une interface de simulation continue.

**Architecture:** Fichier JSON synthétique versionné, moteur TypeScript pur (données normalisées et datées), page React en lecture locale restreinte aux admins. Aucune migration, donnée réelle ou déploiement clinique.

**Tech Stack:** Vite, React, TypeScript, Node test/tsx, GitHub CI, Supabase Auth pour la route.

**Spec:** docs/superpowers/specs/2026-11-01-patient-microsignal-laboratory-design.md

## Global Constraints
- Aucune écriture dans les tables patients réelles; aucun appel service-role.
- Toute association de dossiers est clairement synthétique, risque non validé; références cliniques lisibles.
- Contrôle d'accès admin pour la page; flux simulé et sans effet persistant sur les dossiers réels.
- Aucune prescription automatique. Aucune prétention à une découverte ou à une validation clinique.

## Review Focus
- Chronologie : diagnostic avant traitement, latence hors fenêtre.
- Valeurs manquantes/LSN/unité : ne pas inventer de normalité.
- Petits effectifs et biais de sélection : aucun « risque réel » calculé sur la cohorte enrichie.
- Exposition identique mais symptômes communs : ne pas générer de diagnostic.
- Contrôle d'accès en profondeur et aucune requête vers les données sensibles.

### Task 1: Générateur et données reproduisibles
- [ ] Tests échouant sur l'absence d'une cohorte de 50 cas uniques et complets.
- [ ] Générateur déterministe avec groupes exposés/comparateurs, cases/non-cases, événements datés, provenance synthétique, diagnostics différenciés.
- [ ] Générer puis vérifier les 50 fichiers/records du jeu de données sans noms ou vrais identifiants patients.
- [ ] Rejouer tests et vérifier le JSON avec un parseur.

### Task 2: Moteur longitudinal + transversal
- [ ] Tests RED pour fenêtre, biomarqueurs, absence de données, CRP seule, seuils, chronologie et effets de cohorte.
- [ ] Implémenter moteur pur: signaux patient, regroupements analogues, résultats de cohorte non inférentiels, provenance des règles.
- [ ] Simulateur événementiel red→green : recalcule sur ajout, ignore doublons et mauvais événements.

### Task 3: Interface laboratoire
- [ ] Route admin et menu Recherche seulement pour administrateur.
- [ ] Page exploitable : compteurs, signaux et limites, recherche dossiers, chronologie et jumeaux cliniques synthétiques, flux simulé, références.
- [ ] Lint/typecheck/build et vérification navigateur de l'aperçu GitHub/Vercel si disponible.

### Task 4: Défense en profondeur du détecteur patient existant
- [ ] Régression RED : l'ancien détecteur accepte des identifiants arbitraires et contourne RLS via `service_role`, et son schéma de labo est erroné.
- [ ] Authentifier les JWT et interroger les patients/données sous RLS réelle, sans clé service-role.
- [ ] Refuser les résultats de laboratoire avec unité ou date non canonique; ne jamais retourner les détails d'une erreur clinique.
- [ ] Vérifier les tests, lint et typecheck de la logique de validation.

### Task 5: Livraison
- [ ] Revue de sécurité / check git diff.
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` (+ typecheck full si pertinent), logs de preuve.
- [ ] Commit propre sur branche isolée; ouvrir PR dépendante de #23 ; ne pas merger.
- [ ] Fournir liste exhaustive des fichiers et limite explicite : pas de surveillance réelle automatisée sans gouvernance et consentement.

**Rollback:** revert de la PR : les 50 dossiers sont des fixtures du dépôt et ne touchent aucune table de production.
