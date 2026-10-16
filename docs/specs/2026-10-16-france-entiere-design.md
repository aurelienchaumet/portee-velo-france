# À portée de vélo — France entière, métropole et DROM (spec, 16/10/2026)

Validée dans ses grandes lignes par Aurélien le 16/10/2026 : base = chaîne de `departement17/`, projection par
territoire, 5 DROM d'abord, hébergement hors GitHub Pages, OSM seul + BD TOPO pour les départementales.

## 1. Point de départ

| | Dépôt perso (ce dépôt, 85d829c) | `sit/.../departement17` + site sit-pmo (14/10) |
|---|---|---|
| Couverture | 96 chefs-lieux (fenêtres de 8 km) + bloc du 17 | 17 + 25 km (380 tuiles, 22 Mo) |
| Modèle | majorations ×1,5/×2/×3 (abandonnées) | temps réels, classes fines 0-7, confort bivarié |
| Fonctions | survol, itinéraire > 1 h, choroplèthe | + simulation de tronçons, maillons, croisements RD, services (BPE, Filosofi), onglets |
| Données | OSM seul | OSM + CCIO/CCBM (Marennes-Oléron) + RD du Département 17 |

On repart de `departement17/` et du site sit-pmo (`index.html`, `coeur.js`), pas de ce dépôt.

**Frontière sit / perso** : ce dépôt reste en OSM seul partout, y compris à Marennes-Oléron. On n'y met ni
le réseau CCIO/CCBM, ni la couche RD geosir du 17, ni les diagnostics Oléron / PMO / EPCI du 17, qui
appartiennent au SIT. Pour les RD, on utilise la BD TOPO partout, 17 compris.

## 2. Grille par territoire

Constat : la grille est déjà en degrés (`format_tuile.py` : `LON0, LAT0 = -5.5, 51.5`, `DLON = 0.00125`,
`DLAT = 0.0009`). Lambert 93 ne sert qu'aux calculs métriques (masque de terre, contours, RD, croisements).
On ne reprojette donc pas les tuiles : on paramètre la grille et la projection métrique par territoire.

| Territoire | Code | Origine NO (lon, lat) | DLON (≈ 100 m) | EPSG métrique |
|---|---|---|---|---|
| Métropole + Corse | `fr` | −5,5 ; 51,5 (inchangée) | 0,00125 | 2154 |
| Guadeloupe | `971` | −61,9 ; 16,6 | 0,00093 | 5490 (RGAF09 / UTM 20N) |
| Martinique | `972` | −61,3 ; 14,9 | 0,00093 | 5490 |
| Guyane | `973` | −54,7 ; 6,0 | 0,00091 | 2972 (RGFG95 / UTM 22N) |
| La Réunion | `974` | 55,1 ; −20,8 | 0,00096 | 2975 (RGR92 / UTM 40S) |
| Mayotte | `976` | 44,9 ; −12,5 | 0,00092 | 4471 (RGM04 / UTM 38S) |

- `DLAT = 0.0009` partout ; `DLON = 100 / (111 320 · cos φ_centre)`, arrondi. Les origines sont à vérifier
  sur les emprises Geofabrik au moment du tuilage.
- Une table unique `TERRITOIRES` dans `format_tuile.py`, recopiée dans `coeur.js` et vérifiée par un test
  (comme aujourd'hui pour `LON0` etc.).
- Tuiles : `tuiles/<code>/<tx>_<ty>.bin`, un `tuiles.json` et un `contour.json` par territoire. Pour la
  métropole, les numéros de tuile restent les mêmes, donc le 17 actuel reste valide.
- Format binaire : pas de nouvelle version. Le territoire est donné par le chemin, et l'en-tête PVT1 garde
  `tx, ty`.
- Page : `?territoire=971` etc. charge la grille correspondante. On passe de l'un à l'autre avec un sélecteur
  (encarts DROM sous la carte de France).

## 3. Données

| Besoin | Source | Couverture DROM |
|---|---|---|
| Voies, mairies, eau | PBF Geofabrik (22 anciennes régions + `guadeloupe`, `martinique`, `guyane`, `reunion`, `mayotte`) | oui |
| Terre | land-polygons-split-4326 (déjà en cache) | oui |
| Départementales | BD TOPO IGN, `troncon_de_route` (`cpx_classement_administratif = 'Départementale'`), par département | oui |
| Communes, EPCI | COG INSEE + contours (geo.api.gouv.fr ou ADMIN EXPRESS) | oui |
| Équipements | BPE 2025 (France entière) | oui, Mayotte compris |
| Habitants | Filosofi 2021 carroyé 200 m | métropole, Martinique, Réunion seulement : Guadeloupe, Guyane et Mayotte sans habitants (le dire sur la page) |

`marquer_rd.py` prend en entrée la BD TOPO à la place de geosir. On garde l'appariement : le milieu de l'arête
doit tomber à moins de `APPARIEMENT_M` d'un segment de RD.

## 4. Hébergement

Estimation : 22 Mo pour le 17 (≈ 7 000 km² + marge), donc ≈ 2 à 3 Go pour la France, au-dessus de la limite
d'un site GitHub Pages (1 Go).

**Choix** : Cloudflare R2, avec un seau public et la même arborescence `tuiles/<code>/…` (un fichier par tuile,
pas de PMTiles : le chargeur actuel fonctionne tel quel, seule la base d'URL change). Le site (HTML, JS,
`tuiles.json`) reste sur GitHub Pages. CORS ouvert en lecture pour `aurelienchaumet.github.io`. Envoi avec
`rclone sync` (en reprise). Gratuit jusqu'à 10 Go stockés, sortie de données gratuite. Il faut un compte
Cloudflare, qui demande un moyen de paiement même pour l'offre gratuite : c'est à Aurélien de le créer.

## 5. Où calculer

| Calcul | Durée estimée | Où |
|---|---|---|
| `extraire.py` des 5 PBF DROM | minutes | poste |
| Tuilage d'un DROM | minutes | poste |
| Tuilage métropole (≈ 6 000 tuiles) | plusieurs heures | serveur ou GitHub Actions |
| BD TOPO → RD, croisements | ~1 h | serveur ou Actions |
| Accessibilité (BPE + Filosofi) | < 40 min | GitHub Actions (déjà fait ainsi pour le 17) |

**À trancher** : c'est un projet perso, et le serveur de Marennes appartient au PETR. GitHub Actions est gratuit
sur un dépôt public, avec 16 Go de RAM et 6 h par tâche : le tuilage par région y tient (une tâche par région,
en matrice). Ma recommandation : Actions d'abord, le serveur seulement si Actions ne suffit pas.
Dans les deux cas, `tuiler.py` reprend où il s'était arrêté (`progression.json`), ce qui reste nécessaire.

## 6. Ce qui passe à l'échelle et ce qui ne passe pas

- **Tel quel** : survol, itinéraire, confort, simulation de tronçons, croisements (calculés par région),
  « Sans départementales ».
- **Maillons manquants** : plus de précalcul. On ne garde que les traits noirs calculés à la volée depuis le
  départ (c'est déjà le cas). La carte cumulée reste propre à Oléron et au SIT.
- **Services / diagnostics par EPCI** : environ 1 250 EPCI. On remet le précalcul à plus tard (phase 6) : le
  bloc « À portée » calculé dans la page suffit pour la v1.
- **Choroplèthe** : les 101 chefs-lieux, avec les 5 DROM en encarts.

## 7. Phases

0. **Transfert** : copier dans ce dépôt la chaîne `departement17/` (sans les fichiers propres au SIT) et la page
   du site sit-pmo, débarrassée de ce qui est propre au SIT. Ajouter `build_graph_velo.py` (`classer`), pour ne
   plus l'importer du dossier parent. Les tests passent. Le 17 est re-tuilé en OSM seul. Pas encore de push.
1. **Grille par territoire** : table `TERRITOIRES`, chemins `tuiles/<code>/`, test d'accord Python ↔ JS.
   Tuilage de la Réunion (la plus petite avec un relief marqué) et contrôle visuel.
2. **Les 5 DROM** : extraction, tuilage, contours, mairies, sélecteur dans la page.
3. **Hébergement R2** : base d'URL configurable, envoi des tuiles du 17 et des DROM, test depuis Pages.
4. **Métropole** : tuilage par région (Actions ou serveur), envoi sur R2, `tuiles.json` national,
   choroplèthe des 101 chefs-lieux.
5. **RD et croisements** : BD TOPO dans `marquer_rd.py` et `intersections.py`, partout.
6. **Plus tard** : accessibilité nationale (BPE + Filosofi), diagnostics par EPCI, COM (Saint-Pierre-et-Miquelon,
   Saint-Barthélemy, Saint-Martin), 35 000 communes (TODOS.md).

Chaque phase se termine par `node --test test/*.test.js` au vert et la non-régression OSM seul d'Oléron
(≤ 1 point).

## 8. Questions ouvertes

1. Calcul lourd : GitHub Actions (recommandé) ou serveur de Marennes ?
2. Compte Cloudflare R2 : Aurélien le crée (moyen de paiement demandé) ; sinon, plan B = un dépôt Pages par
   grande région (< 1 Go chacun), plus lourd à maintenir.
3. Le dossier `departement17/` reste-t-il le lieu de travail du 17 pour le SIT, ce dépôt ne recevant que des
   reports ? Ou ce dépôt devient-il la source et sit-pmo reprend `coeur.js` d'ici ? (TODOS.md « Réunifier »,
   dans l'autre sens.)
