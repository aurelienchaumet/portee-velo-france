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
1. ~~`tuiles/fr/`~~ fait le 16/10/2026 par GitHub Actions (run 1, 10 min) : 17 + 25 km, 380 tuiles, 24 Mo,
   départ à l'hôtel de ville de La Rochelle ; Réunion re-tuilée, départ à l'hôtel de ville de Saint-Denis.
   Non-régression OSM seul d'Oléron : tous les écarts ≤ 1 point (`node test/non_regression.js ../tuiles/fr`).
   Pour re-tuiler : modifier `chaine/a_tuiler.json` et pousser (le bot pousse les tuiles sur la branche).
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

## Phase 2 (16/10/2026)

- Les 5 DROM tuilés sur Actions (marge 2 km) : 971 (90 tuiles, 2,2 Mo), 972 (36, 2,1 Mo), 973 (1 428 tuiles dont
  149 non vides, 7,5 Mo : forêt), 974, 976 (20, 0,9 Mo). Run de 3 min 30 pour les quatre.
- Départs : Les Abymes (971), Fort-de-France (972 : « ancienne mairie » écartée, `lieux.py`, relancé), Cayenne
  (973), Saint-Denis (974), Mamoudzou (976).
- `tuiler.py` : contour de repli (niveau 4 ou ref:INSEE, puis union des communes) ; arrêt si l'emprise sort
  de la grille (numéros de tuile négatifs). Pas eu besoin du repli : les 5 DROM ont leur relation de niveau 6.
- Page : sélecteur de territoire sous le titre (`?zone=`), contrôlé dans Chromium pour les 6 territoires.

Reste (phase 2) : rien de bloquant. À voir : en Guyane, la vue d'ensemble est très dézoomée (le littoral
seul est peuplé) ; habitants absents en Guadeloupe, Guyane et Mayotte (Filosofi) à dire sur la page quand
l'accessibilité arrivera (phase 6).

## Phase 3 (16/10/2026) : Cloudflare Workers

- `wrangler.jsonc` : Worker `portee-velo`, ressources statiques seules (`dist/`), sous-domaine workers.dev.
- `deploiement/construire.sh` : `dist/` = `index.html`, `coeur.js`, `LICENSE`, `_headers`, `tuiles/<zone>/`
  (2 019 fichiers, 40 Mo ; vérifie ≤ 20 000 fichiers et ≤ 25 Mio par fichier). Les anciennes tuiles à la
  racine de `tuiles/` et `france.html` restent sur GitHub Pages (phase 4).
- `deploiement/_headers` : CORS et cache d'une heure sur `/tuiles/*`.
- `index.html` : `<meta name="donnees">` = base d'URL des données (vide = même site).
- `.github/workflows/deployer.yml` : push sur `france-entiere` touchant le site, à la main, ou appelé par
  `tuiler.yml` après le commit des tuiles. Sans secrets Cloudflare : s'arrête sans erreur.
- Contrôlé dans le conteneur : `wrangler deploy --dry-run`, `wrangler dev` (page, tuiles, CORS, 404 hors site),
  page du 17 et de la Martinique servie par wrangler dans Chromium.

**À faire par Aurélien** (une fois) :
1. Créer un compte Cloudflare (gratuit, sans carte) ; dans Workers & Pages, choisir le sous-domaine
   `<nom>.workers.dev`.
2. Jeton d'API : My Profile → API Tokens → Create Token → modèle « Edit Cloudflare Workers ».
3. Dans GitHub, Settings → Secrets and variables → Actions : `CLOUDFLARE_API_TOKEN` (le jeton) et
   `CLOUDFLARE_ACCOUNT_ID` (identifiant du compte, colonne de droite de la page d'accueil Workers).
4. Lancer le déploiement : Actions → Déploiement → Run workflow n'apparaît qu'une fois le workflow sur `main` ;
   d'ici là, tout push qui touche le site le déclenche. Le site sera sur `https://portee-velo.<nom>.workers.dev`.

Plus tard : déployer depuis `main` plutôt que `france-entiere` (après fusion), et décider du sort de GitHub Pages.

Phases suivantes : voir la spec (§7).
