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
1. `tuiles/fr/` : le 17 re-tuilé en OSM seul par GitHub Actions (`.github/workflows/tuiler.yml`, lancé par le
   push qui modifie `chaine/a_tuiler.json` ; les tuiles reviennent en commit du bot sur la branche). Vérifier le
   run, puis contrôle visuel de `index.html` (sans `?zone`) et non-régression OSM seul d'Oléron (≤ 1 point).
   Tant que `tuiles/fr/` manque, la page sans `?zone` affiche « Données indisponibles ».
2. Les anciennes tuiles à la racine de `tuiles/` (96 chefs-lieux, ancien format) ne servent plus qu'à
   `france.html` : à remplacer en phase 4.
3. Carré gris au nord-ouest de la Réunion (vers Saint-Paul) : vient du fond IGN, pas des tuiles. À revoir à
   un autre zoom ; sinon ignorer.
4. 404 attendus et sans effet : `tuiles/<zone>/accessibilite.json`, `epci.json` (phase 6).

Fait le 16/10/2026 (2e session) :
- `chaine/lieux.py` : contour nettoyé (parties < 0,05 km² retirées : plus de carrés de 4 points à la Réunion),
  formes du nom (« en … », « de … », « sur … », table `FORMES` pour le 17 et les DROM), départ par défaut =
  mairie de la commune la plus peuplée (tag `population`). Écrits dans `contour.json` par `tuiler.py
  --departement`. `choisir_mairie` déplacée de `chefs_lieux.py` vers `lieux.py`.
- `index.html` : plus de texte propre au 17 (titre, chapeau, consignes, messages, sources en OSM seul, RD =
  routes secondaires et tertiaires OSM en attendant la BD TOPO).
- `tuiles/974/contour.json` nettoyé à la main avec `lieux.py` (sans départ : il viendra du re-tuilage Actions).
- Départements métropolitains : `FORMES` à compléter en phase 4 (article et genre d'après le COG de l'INSEE).

Contrôle visuel depuis une session cloud : le CDN (Leaflet, d3) et le fond IGN y sont bloqués ; Playwright
avec `page.route` pour servir le site et des copies npm de Leaflet 1.9.4 et d3 7.9.0 suffit (carte sans fond).

Phases suivantes : voir la spec (§7).
