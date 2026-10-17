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

## Mandat de nuit (16/10/2026, Aurélien)

Aller au bout du plan sans attendre son aval : phase 4 (îles, carte des chefs-lieux), phase 5 (BD TOPO, croisements),
puis phase 6 si possible. Mise en ligne au fil de l'eau (chaque étape vérifiée). Interdit sans accord explicite :
toucher à `main`, supprimer GitHub Pages, la release ou `france.html`. Choix de fond : option prudente, notée ici.

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

**En ligne le 16/10/2026** : https://portee-velo.aurelienchaumet17.workers.dev (premier déploiement par
`deployer.yml` lancé à la main, 2 017 fichiers envoyés). `workers.dev` est bloqué depuis les sessions cloud :
le contrôle visuel du site publié se fait depuis un navigateur.

Mise en place faite (pour mémoire) :
1. Créer un compte Cloudflare (gratuit, sans carte) ; dans Workers & Pages, choisir le sous-domaine
   `<nom>.workers.dev`.
2. Jeton d'API : My Profile → API Tokens → Create Token → modèle « Edit Cloudflare Workers ».
3. Dans GitHub, Settings → Secrets and variables → Actions : `CLOUDFLARE_API_TOKEN` (le jeton) et
   `CLOUDFLARE_ACCOUNT_ID` (identifiant du compte, colonne de droite de la page d'accueil Workers).
4. Lancer le déploiement : Actions → Déploiement → Run workflow n'apparaît qu'une fois le workflow sur `main` ;
   d'ici là, tout push qui touche le site le déclenche. Le site sera sur `https://portee-velo.<nom>.workers.dev`.

Plus tard : déployer depuis `main` plutôt que `france-entiere` (après fusion), et décider du sort de GitHub Pages.

## Phase 4 (16/10/2026) : métropole

- Essai Bretagne d'un bloc : 665 tuiles, 5,3 M nœuds, 2,65 Go de RAM, 3 min → la France d'un bloc demanderait
  ~50 Go (Actions : 16 Go). D'où le **tuilage par bandes** (`tuiler.py --bande-lignes N`, sans changer le format
  des tuiles ni la page) : chaque bande lit une ligne de tuiles de plus de chaque côté, possède les arêtes vers
  la bande précédente (retournées au besoin, sens 1 ↔ 2), retrouve ses nœuds par leurs coordonnées
  (`bord.pkl`, aussi pour la reprise) ; les cellules de sa dernière ligne attendent la bande suivante.
- Contrôles : `test/bandes.test.js` (réseau synthétique : même graphe, mêmes minutes) ; d'un bloc, tuiles
  identiques à l'octet près à la version d'avant ; Bretagne réelle bloc / bandes de 3
  (`test/comparer_tuilages.js`, job `comparer`) : 5 arêtes sur 5,5 M absentes, 29 774 en plus (petits morceaux
  isolés gardés près des raccords), 0 à 32 cellules différentes sur 58 000 à 90 000 ; 1,9 Go de RAM.
- `--contour ../tuiles/departements.json --marge-km 2` : 6 281 tuiles (3 groupes : continent, Corse, une île) ;
  `contour.json` national (France métropolitaine, `departs` = les 96 chefs-lieux).
- Choix d'Aurélien : tuiles de la métropole dans la **release GitHub `tuiles-fr`** (un tar, remplacé à chaque
  tuilage), pas dans git ; `deployer.yml` reprend les releases `tuiles-*`. Page : **départ tiré au sort** parmi
  les 96 chefs-lieux à chaque visite (sans lien), carte ouverte dessus au zoom 10.
- **Fait le 16/10 (run 38938958665)** : extraction des 22 régions 20 min, tuilage 22 min, 5,8 Go de RAM ;
  6 281 tuiles, 86 M nœuds, 540 Mo (88 Ko par tuile) ; release `tuiles-fr` ; déployé (2e essai : un 504 de l'API
  Cloudflare au premier, `deployer.yml` réessaie désormais 3 fois). Non-régression Oléron sur les tuiles
  nationales : identique au 17 seul (≤ 0,7 point). Contrôle dans Chromium : Paris, Marseille, tirage au sort.
- `tuiles/fr/` (17) retiré du dépôt : pour travailler en local, `curl -L -o tuiles-fr.tar
  https://github.com/aurelienchaumet/portee-velo-france/releases/download/tuiles-fr/tuiles-fr.tar` puis
  `tar -xf tuiles-fr.tar -C tuiles/fr`.
- Poids d'une fenêtre de 5 × 5 tuiles : Paris 8,1 Mo, Marseille 3,5 Mo, La Rochelle 1,7 Mo. **À mesurer sur
  téléphone à Paris** avant de décider d'alléger les tuiles (contraction des nœuds de degré 2).

- Îles sans pont (16/10 soir, signalé par Aurélien en Guadeloupe) : `tuiler.py` ne gardait que la plus grande
  composante → Marie-Galante, Les Saintes, La Désirade, Petite-Terre, Yeu, Belle-Île, Ouessant, Groix… sans
  calcul. Désormais : + toute composante de `ILE_MIN_M` (5 km) de voies ou plus. Tout re-tuilé (DROM + métropole).
- Fenêtre de **7 × 7 tuiles par défaut** (16/10, choix d'Aurélien après essai sur téléphone à Paris : plus
  fluide ; la zone d'une heure était coupée en 5 × 5 pendant le survol, fenêtre tolérée à ±1 tuile du départ).
  `?fenetre=5` garde l'ancienne.

- **Classement** (`classement.html`, fait la nuit du 16/10) : choroplèthe des 96 départements + 5 DROM en
  encarts, d'après `tuiles/classement.json` (`node chaine/scores.js tuiles`, lancé par `deployer.yml` sur les
  tuiles nationales). Départ des DROM = celui de `contour.json` (Guadeloupe : Les Abymes, commune la plus
  peuplée, et non Basse-Terre). `france.html` et les anciennes tuiles à la racine de `tuiles/` laissés en place
  (interdit d'y toucher sans accord).

Reste (phase 4) : contrôle visuel du site en ligne par Aurélien.

## Phase 5 (nuit du 16/10) : départementales et croisements

- **Bit RD réellement posé** : `marquer_rd.py` n'était jamais lancé, « Sans départementales » n'excluait rien.
  Désormais `tuiler.py` marque RD toute voie de classe 2 à 5 ou 7 dont la `ref` OSM commence par D/RD (`REF_RD`).
  Textes de la page : « numéro D… dans OpenStreetMap ». Option prudente : **BD TOPO pas encore branchée**
  (appariement IGN à faire ; la `ref` OSM couvre déjà l'essentiel du réseau départemental).
- **Croisements par blocs** : `chaine/croisements.py` (blocs de 4 × 4 tuiles + couronne d'une tuile), sortie
  `tuiles/<zone>/crx/index.json` + `crx/<bx>_<by>.json` ; même méthode que `intersections.py` (refactoré en
  fonctions). Sur la Réunion : identique au calcul d'un bloc (1 311 croisements). La page charge les blocs de sa
  fenêtre (`chargerCrx`, repli sur `intersections.json`).

## Phase 6 (nuit du 16/10) : équipements et habitants

- Sources sondées depuis Actions (`sonder.yml`) : BPE 2025 en parquet (insee.fr, fichier 8217525) et Filosofi
  2021 carroyé 200 m métropole en parquet (data.gouv.fr). DROM : **Filosofi 2019** pour la Martinique et la
  Réunion (zip Insee 7655475 → 7z → `carreaux_200m_mart.csv` / `_reun.csv`, carreaux en EPSG 5490 / 2975 :
  `traiter_filosofi` lit désormais le CRS dans l'identifiant ; écart au SIT à lui signaler). Guadeloupe, Guyane,
  Mayotte sans carroyage : la page dit « Pas de données d'habitants pour ce territoire ». Fait le 17/10 matin
  (Martinique 324 204 habitants, Réunion re-tuilée de même).
- `chaine/comptages_blocs.py` : `traiter_bpe` / `traiter_filosofi` de `comptages.py`, puis découpage par blocs
  de 4 × 4 tuiles → `tuiles/<zone>/acces/index.json` + `acces/<bx>_<by>.json` ; carreau Filosofi réparti sur
  4 × 4 sous-points (et non 10 × 10 : 230 M points en métropole). Page : `chargerAccesBlocs`, blocs de la fenêtre.
- Étape « Équipements et habitants » de `tuiler.yml` (`"acces": true`), `continue-on-error` comme les croisements.

**Fait (run 38965409395, 16/10 22 h 15 UTC, déployé)** : re-tuilage complet avec bit RD, croisements et services.
Métropole : croisements 296 605 (27 208 avec une RD) en 419 blocs, 16 min, 12 Mo ; services 2,7 M équipements,
62,6 M habitants (Filosofi : tous retrouvés sur les cellules), 437 blocs, 151 Mo, 1 min, 7,7 Go de RAM (BPE lue
en entier : 5,2 Go même pour un DROM). Plus gros bloc : Paris `acces/15_7.json`, 6 Mo (compressé par Cloudflare).
Contrôle local à Paris : Services → 1,16 M habitants à 15 min, 9 fonctions sur 9, pas d'erreur.

Lenteur signalée par Aurélien le 17/10 : la page faisait les comptages Services (3 Dijkstra de plus, ~0,8 s par
calcul à Paris en 7 × 7, contre ~0,25 s pour le calcul lui-même) à chaque calcul et dans tous les onglets, et lisait
les blocs `acces` au chargement ; la couche RD (désormais remplie) était refaite à chaque fenêtre même masquée.
Corrigé : comptages et pastilles seulement dans l'onglet Services (au survol, après 250 ms de pause), blocs lus à
la première ouverture de l'onglet, couche RD construite case cochée. Blocage par clic à Paris : ~7 s → ~4 s pour
4 clics (Chromium sans GPU de la session ; à confirmer sur téléphone).

BD TOPO pour les RD : **pas branchée (option prudente, à décider)**. Mesure du 17/10 sur les tuiles
nationales : 369 912 km d'arêtes marquées RD par la `ref` OSM, pour ~378 000 km de RD officielles (≈ 98 %).
L'appariement BD TOPO (téléchargement IGN par département, `marquer_rd.py`) apporterait peu pour un gros chantier.

Phases suivantes : voir la spec (§7) — diagnostics par EPCI et par commune.
