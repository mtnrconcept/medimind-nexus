# Réparation de la sémantique clinique — 2026-11-05

Causes constatées : valeurs cliniques implicites ajoutées lors de la normalisation ; citations de co-utilisation/traitement adjuvant prises pour efficacité ou effet secondaire ; requêtes trop spécifiques ; scores non validés ; ancien résultat repris sans avertissement.

Plan : 1) reproduire les fausses classifications ; 2) retirer tous les défauts cliniques implicites ; 3) valider le type de relation et le passage source pour chaque lien ; 4) séparer les contextes de maladie/voie/forme et la preuve bibliographique ; 5) rendre la matrice, les anciens résultats et le graphe conservateurs ; 6) améliorer la recherche bilingue sans changer le diagnostic ; 7) tests, revue et déploiement réversible.

Aucune donnée patient ne sera supprimée. Les anciens résultats restent archivés mais doivent être réanalysés. Un indice bibliographique ne vaut ni recommandation thérapeutique ni validation clinique.

## Vérifications scientifiques pour les cas de régression

- ATC S01XA18 : ciclosporine ophtalmologique, distincte de L04AD01. Source : https://atcddd.fhi.no/atc_ddd_index/?code=S01XA18&showdescription=no
- La série de kératites post-varicelle (PMID 32118671) décrit des collyres complémentaires ; ce n’est pas une preuve d’efficacité antivirale générale. Source : https://pubmed.ncbi.nlm.nih.gov/32118671/
- Les recommandations CDC distinguent varicelle, complications, terrain immunodéprimé, corticoïdes systémiques et traitement antiviral. Source : https://www.cdc.gov/chickenpox/hcp/clinical-guidance/

Le contrôle automatique vérifie les citations et empêche certaines extrapolations manifestes. Il ne prouve pas l’exactitude clinique de l’interprétation du modèle. Les résultats nécessitent une revue professionnelle. Les tests utilisent des données synthétiques, sans dossier réel.

## Livraison et retour arrière

Aucune migration SQL ni écriture dans un dossier patient. Le moteur version 2 masque les classifications des versions antérieures dans sa réponse d’affichage ; les archives en base ne sont pas réécrites. Relancer une nouvelle analyse pour réinterpréter les six éléments. Déployer cross-data-analyzer, puis le frontend associé. Retour arrière via revert de la PR et restauration de la fonction Edge précédente ; ne pas restaurer les anciens badges affirmatifs pour une utilisation clinique.
