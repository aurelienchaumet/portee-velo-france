# TODO — À portée de vélo, France

## Réunifier coeur.js
- **What** : faire charger à la carte Marennes-Oléron (dépôt sit-pmo/portee-velo) le `coeur.js` de ce dépôt, ou publier `coeur.js` une seule fois, puis supprimer la copie.
- **Why** : un seul modèle de calcul ; sinon une pénalité ou un correctif changé d'un côté donne des temps différents pour la même route.
- **Pros** : plus de divergence silencieuse. **Cons** : la carte Oléron dépend alors de ce dépôt.
- **Context** : copie créée le 2026-10-10 depuis portee-velo (commit 1d4a854), identique à ce jour. Ajouts prévus ici : décodage delta, recollage de tuiles, Dijkstra borné, accrochage par anneaux, chargeur LRU.
- **Depends on** : version France stable.

## Étendre aux 35 000 communes
- **What** : score de chaque commune (km² terrestres atteints en 15 min depuis la mairie), médiane par département, couche « écart pistes / toutes voies ».
- **Why** : classement plus juste que le seul chef-lieu, et vraie carte « où le vélo dépend de la route ».
- **Pros** : même chaîne, seulement plus de départs. **Cons** : PBF France entier, tuiles nationales.
- **Context** : idée du second avis de /office-hours (10/10/2026), écartée pour la v1 (chef-lieu seul).
- **Depends on** : v1 en ligne, passage de l'hébergement à PMTiles ou Cloudflare R2.

## Rédiger la méthodologie dans le README (à la fin du codage)
- **What** : README public avec la méthodologie complète et des schémas de l'ensemble du fonctionnement (chaîne PBF → GeoParquet → graphe → tuiles → navigateur ; format de tuile ; recollage de fenêtre ; Dijkstra borné ; scores des 96 chefs-lieux ; limites connues).
- **Why** : demande d'Aurélien (10/10/2026) ; le dépôt est public et le README est la porte d'entrée.
- **Context** : schémas en ASCII ou Mermaid (rendu natif par GitHub). Reprendre les diagrammes du design et de la revue d'ingénierie, mis à jour avec ce qui a réellement été codé.
- **Depends on** : fin des tâches T1 à T9.

## Vérifier la fluidité du survol (Aurélien, plus tard)
- **What** : retester le survol après le passage au canvas direct (commit ac562f0) ; si c'est encore lent, dire si c'est en continu, par à-coups en changeant de zone, ou à l'arrêt de la souris.
- **Why** : retour du 10/10/2026 « ça fonctionne mais c'est un poil lent à l'affichage ».
- **Context** : leviers suivants selon le cas : limiter grille/surfaces à la zone atteignable en 60 min ; précharger plus tôt ; isolignes plus légères.
