# MediCore — interface clinique unifiée

## Problème constaté (audit du dépôt, 1 novembre 2026)

Les 19 routes utilisent un en-tête fixe surchargé de menus déroulants. Le tableau de bord montre quatre indicateurs dont trois valeurs codées en dur, mêle neuf outils dans une grille de même priorité, et applique des animations qui perturbent la lecture. L'interface mélange plusieurs marques (NEXUSMED, MediMind et Médicore) et les polices décoratives nuisent à la lisibilité. Le menu « Système » laisse apparaître les accès administratifs à des utilisateurs non administrateurs. Le dossier patient affiche une fausse animation de « déchiffrement » de 1,5 seconde.

## Destination

Une interface en français, conçue pour la lecture clinique : **un menu latéral stable sur desktop, un tiroir sur mobile, une barre supérieure discrète**, des titres explicites et une typographie lisible. Les routes existantes restent accessibles; les principaux parcours sont mis en avant : Accueil, Patients, Pathologies, Analyses, Recherche. Les fonctionnalités de laboratoire et les outils avancés sont rangés dans des groupes secondaires pour réduire la charge cognitive; l'administration est visible uniquement pour les admins.

### Règles de design

- Teal profond pour l'action, fond ardoise très clair, cartes blanches, faible profondeur, contraste WCAG AA visé, états de focus visibles; thème sombre pris en charge.
- Pas de fond parallax, glow, curseur animé ou barre de statut « optimal » non mesurée.
- Un seul titre H1 par écran, résumé concis et action primaire claire. Navigation accessible au clavier et adaptée au mobile.
- Les indicateurs du tableau de bord sont chargés depuis Supabase avec RLS, aucune donnée fictive présentée comme réelle. Afficher une erreur ou « — » si indisponible.
- Les outils de recherche et les fonctions médicales spécialisées conservent leur logique; ils héritent de la nouvelle navigation, des tokens et des composants de base.
- Les dossiers patients affichent les données réelles selon les droits existants; aucun changement RLS, migration, requête privilégiée ni exposition de données sur la page d'accueil.

## Parcours cibles

1. Médecin → tableau de bord → « Ouvrir les dossiers » → recherche patient → fiche → comparaison de pathologie.
2. Chercheur → navigation « Analyses » → analyse croisée; outils spécifiques accessibles dans « Recherche & outils ».
3. Administrateur → menu « Administration » et « Import des données » affichés seulement à l'administrateur.
4. Mobile → menu accessible en une action, navigation active identifiable, aucune dépendance au survol.
5. Authentification → page d'entrée unique lisible, sans promesse clinique ou de sécurité non vérifiée.

## Contraintes et limites

- Un redesign visuel ne prouve ni l'exactitude médicale, ni la conformité réglementaire. Les outils d'aide à la décision doivent le rappeler.
- Les pages avancées les plus riches (visualisation 3D, Discovery Platform) conservent leur propre contenu et interactions complexes mais utilisent désormais la même structure de navigation, palette et styles de composants; refonte de leur logique hors périmètre.
- Le menu et l'ordre des liens ne modifient pas les droits d'accès. La route d'importation est déjà une fonctionnalité administrative sensible : son accès sera renforcé par `ProtectedRoute requiredRole="admin"` pour refléter sa place dans la navigation.
- Aucune migration ou modification des données patient.
