# Reprise — France entière (état au 16/10/2026, branche `france-entiere`)

À lire en premier dans une session cloud (claude.ai/code). Spec : `docs/specs/2026-10-16-france-entiere-design.md`.
Réponses et commentaires en français, code commenté. Projet **perso** d'Aurélien : OSM seul + BD TOPO, jamais de
données des collectivités (CCIO, CCBM, geosir) ni de diagnostics du SIT.

## Règles

- Le dépôt SIT (sit-pmo/portee-velo + son sous-dossier `departement17/`) **fait foi** pour le code commun. Ce dépôt
  en est une copie avec la même disposition : racine = site (`index.html`, `coeur.js`, `build_graph_velo.py`),
  `chaine/` = `departement17/`. Écarts propres à ce dépôt : grille par territoire (ci-dessous). Ne pas reporter
  vers le SIT sans demander.
- Ne jamais pousser sur `main` sans accord : `main` publie le site (GitHub Pages).
- Hébergement visé : Cloudflare Workers en statique, offre gratuite **sans carte bancaire** (refus d'Aurélien).
- Calculs lourds : GitHub Actions (serveur de Marennes seulement en secours).
- Commits : seule la ligne `Co-Authored-By`, pas de lien de session.

## Fait

- Phase 0 : chaîne et page reprises du SIT, `node --test chaine/test/*.test.js` → 60 tests au vert
  (lancer depuis `chaine/` : `cd chaine && node --test test/*.test.js`).
- Phase 1 (en cours) :
  - `chaine/format_tuile.py` : table `TERRITOIRES` (fr, 971, 972, 973, 974, 976 : origine, DLON, EPSG) et `choisir()`.
  - `chaine/tuiler.py --grille <code>` : grille et projection métrique du territoire, `tuiles.json → grille.code`.
  - `coeur.js` : `definirGrille(g)` ; `index.html` : `?zone=974`, données lues dans `tuiles/<zone>/`.
  - La Réunion tuilée : `tuiles/974/` (49 tuiles, 624 389 nœuds, 3,5 Mo, 30 s), affichée et calculée correctement.

Commande utilisée (poste d'Aurélien) :
```
python -I -X utf8 extraire.py cache/regions/reunion.osm.pbf cache/regions/reunion.parquet --ram-go 0.8
python -I -X utf8 tuiler.py --grille 974 --parquet cache/regions/reunion.parquet --departement 974 --marge-km 2 --sortie ../tuiles/974
```
PBF : `https://download.geofabrik.de/europe/france/<reunion|guadeloupe|martinique|guyane|mayotte>-latest.osm.pbf`.
Dépendances Python : duckdb (+ extension spatial), quackosm, numpy, scipy, shapely ≥ 2, pyproj, pyogrio, psutil.
`chaine/cache/` doit contenir `land-polygons-split-4326.zip` (osmdata.openstreetmap.de, ~800 Mo) pour le masque terre.

## Reste à faire

Phase 1 :
1. `tuiles/fr/` : la métropole passe aussi dans un sous-dossier ; re-tuiler le 17 en OSM seul
   (`--grille fr --departement 17 --sortie ../tuiles/fr`, nécessite les GeoParquet Poitou-Charentes, Aquitaine,
   Pays de la Loire) — à faire sur GitHub Actions ou plus tard.
2. Textes de la page propres au 17 (« Charente-Maritime », départ par défaut, message `dansZone`) : les tirer de
   `contour.json` (nom) et d'une mairie OSM (départ).
3. `contour.json` de la Réunion : MultiPolygon de 6 parties dont 5 carrés de 4 points (relation OSM admin_level 6) :
   garder la plus grande partie, ou les parties de plus de X km².
4. Carré gris au nord-ouest de la Réunion (vers Saint-Paul) : vient du fond IGN (reste quand le calque de chaleur
   est masqué), pas des tuiles. À vérifier à un autre zoom ; sinon ignorer.
5. 404 attendus et sans effet : `tuiles/974/accessibilite.json`, `epci.json` (phase 6).

Phases suivantes : voir la spec (§7).
