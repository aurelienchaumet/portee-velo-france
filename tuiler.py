"""Étape 2 de la chaîne France : GeoParquet OSM → tuiles de graphe vélo (format v1, format_tuile.py).

Reprend les règles de la carte Marennes-Oléron (classer() de ../build_graph_velo.py : classes,
vitesses, sens uniques) sans les cas propres à Oléron (pont, réseau des collectivités).

Étapes :
  1. tuiles à produire = toutes celles qui touchent une des emprises demandées ;
  2. voies cyclables lues dans le GeoParquet (DuckDB + extension spatial), classées ;
  3. nœuds = points de tracé identiques au 1e-7 degré près (les voies OSM qui se croisent partagent
     leurs nœuds ; un pont qui passe au-dessus n'en partage pas) ; segments de plus de 2 km découpés ;
  4. on ne garde que les arêtes dont les deux nœuds sont dans les tuiles, puis, par groupe de tuiles
     contiguës, la plus grande composante connexe (comme build_graph_velo.py, mais une par zone) ;
  5. numérotation globale : tuile par tuile, nœuds triés par carré de 1 km (ordre spatial → petits deltas) ;
  6. cellules de 100 m : terre = polygones terrestres OSM (osmdata.openstreetmap.de) moins natural=water
     de plus de 1 ha ; nœud le plus proche et distance pour chaque mode ;
  7. écriture des tuiles {tx}_{ty}.bin et de l'index tuiles.json.

Usage (depuis france/) :
  .venv/Scripts/python.exe -I -X utf8 tuiler.py --parquet cache/poitou-charentes-261008.parquet \\
      --emprise -1.45,45.75,-0.95,46.1 --sortie tuiles
"""
import argparse
import json
import math
import sys
import time
from datetime import datetime
from pathlib import Path

import duckdb
import numpy as np
import pyogrio
import shapely
from pyproj import Transformer
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

ICI = Path(__file__).resolve().parent
sys.path[:0] = [str(ICI), str(ICI.parent)]   # -I retire le dossier du script du chemin
from build_graph_velo import CLASSES_AMEN, classer  # noqa: E402  règles communes avec la carte Oléron
from format_tuile import CELLULES_TUILE, DLAT, DLON, LAT0, LON0, encoder_tuile  # noqa: E402

DOSSIER_EXT_DUCKDB = ICI / "cache" / "duckdb_ext"     # extensions DuckDB sur D:, pas dans ~/.duckdb (C:)
TERRE_ZIP = ICI / "cache" / "land-polygons-split-4326.zip"
TERRE_SHP = "/vsizip/{}/land-polygons-split-4326/land_polygons.shp"
SEGMENT_MAX_M = 2000           # au-delà, le segment est découpé (champ l en Uint16 dm, contre-sens à 5 km/h)
EAU_MIN_M2 = 10_000            # plans d'eau de plus de 1 ha retirés de la terre
CARRE_TRI_DEG = (0.0125, 0.009)  # carré de ~1 km pour l'ordre spatial des nœuds dans une tuile
M_PAR_DEG = 111_320


def connecter():
    """Connexion DuckDB avec l'extension spatial chargée depuis D:."""
    c = duckdb.connect(config={"extension_directory": str(DOSSIER_EXT_DUCKDB)})
    c.install_extension("spatial")
    c.load_extension("spatial")
    return c


def tuiles_des_emprises(emprises):
    """Ensemble des tuiles (tx, ty) qui touchent au moins une emprise (lon_min, lat_min, lon_max, lat_max)."""
    lt, ht = DLON * CELLULES_TUILE, DLAT * CELLULES_TUILE
    tuiles = set()
    for w, s, e, n in emprises:
        for tx in range(int((w - LON0) // lt), int((e - LON0) // lt) + 1):
            for ty in range(int((LAT0 - n) // ht), int((LAT0 - s) // ht) + 1):
                tuiles.add((tx, ty))
    return tuiles


def lire_voies(con, parquets, emprises):
    """Voies cyclables classées : liste de (coords lon/lat ndarray, classe, vitesse, sens)."""
    vues, voies, ecartees = set(), [], 0
    for parquet in parquets:
        for w, s, e, n in emprises:
            # Une requête par emprise : le PBF France ne tient pas en mémoire d'un coup
            res = con.execute(f"""
                SELECT feature_id, tags, ST_AsWKB(geometry)
                FROM read_parquet(?)
                WHERE tags['highway'] IS NOT NULL
                  AND ST_GeometryType(geometry) IN ('LINESTRING', 'POLYGON')
                  AND ST_Intersects(geometry, ST_MakeEnvelope(?, ?, ?, ?))
            """, [str(parquet), w - 0.01, s - 0.01, e + 0.01, n + 0.01]).fetchall()
            for fid, tags, wkb in res:
                if fid in vues:
                    continue
                vues.add(fid)
                r = classer(tags)
                if r is None:
                    ecartees += 1
                    continue
                g = shapely.from_wkb(bytes(wkb))
                if g.geom_type == "Polygon":       # voie fermée (boucle, rond-point) lue comme surface par QuackOSM
                    g = g.exterior
                voies.append((np.asarray(g.coords)[:, :2], *r))
    print(f"  {len(voies)} voies cyclables, {ecartees} écartées par classer()")
    return voies


def densifier(xy):
    """Ajoute des points intermédiaires dans les segments de plus de SEGMENT_MAX_M."""
    lon, lat = xy[:, 0], xy[:, 1]
    d = np.hypot(np.diff(lon) * np.cos(np.radians(lat[:-1])), np.diff(lat)) * M_PAR_DEG
    if (d <= SEGMENT_MAX_M).all():
        return xy
    morceaux = []
    for i, di in enumerate(d):
        k = max(1, math.ceil(di / SEGMENT_MAX_M))
        t = np.arange(k)[:, None] / k
        morceaux.append(xy[i] + t * (xy[i + 1] - xy[i]))
    morceaux.append(xy[-1:])
    return np.vstack(morceaux)


def construire_graphe(voies):
    """Nœuds (lon, lat en degrés) et arêtes (a, b, classe, vitesse, sens) à partir des tracés."""
    pts, ea, attrs = [], [], []
    debut = 0
    for xy, classe, vit, sens in voies:
        xy = densifier(xy)
        n = len(xy)
        pts.append(xy)
        ea.append(np.arange(debut, debut + n - 1))
        attrs.append(np.repeat([[classe, vit, sens]], n - 1, axis=0))
        debut += n
    pts = np.vstack(pts)
    # Clé de nœud : coordonnées entières au 1e-7 degré (précision native des PBF)
    cles = np.round(pts * 1e7).astype(np.int64)
    uniques, inverse = np.unique(cles, axis=0, return_inverse=True)
    inverse = inverse.ravel()
    i = np.concatenate(ea)
    a, b = inverse[i], inverse[i + 1]
    attr = np.vstack(attrs)
    garde = a != b                                  # points doublés dans un même tracé
    return uniques / 1e7, a[garde], b[garde], attr[garde]


def tuile_xy(lon, lat):
    """Tuile (tx, ty) de chaque point (tableaux)."""
    return (np.floor((lon - LON0) / (DLON * CELLULES_TUILE)).astype(np.int64),
            np.floor((LAT0 - lat) / (DLAT * CELLULES_TUILE)).astype(np.int64))


def groupes_de_tuiles(tuiles):
    """Groupes de tuiles contiguës (4-voisinage) : chaque zone demandée garde sa propre composante."""
    groupe, n = {}, 0
    for t0 in sorted(tuiles):
        if t0 in groupe:
            continue
        pile = [t0]
        groupe[t0] = n
        while pile:
            tx, ty = pile.pop()
            for v in ((tx + 1, ty), (tx - 1, ty), (tx, ty + 1), (tx, ty - 1)):
                if v in tuiles and v not in groupe:
                    groupe[v] = n
                    pile.append(v)
        n += 1
    return groupe


def garder_composantes(nb, a, b, groupe_noeud):
    """Masque des arêtes à garder : par groupe de tuiles, la plus grande composante connexe."""
    m = coo_matrix((np.ones(len(a)), (a, b)), shape=(nb, nb))
    _, comp = connected_components(m, directed=False)
    utilises = np.zeros(nb, bool)
    utilises[a] = utilises[b] = True
    garder_comp = set()
    for g in np.unique(groupe_noeud[utilises]):
        dans = utilises & (groupe_noeud == g)
        valeurs, effectifs = np.unique(comp[dans], return_counts=True)
        garder_comp.add(valeurs[np.argmax(effectifs)])
        print(f"  zone {g} : {len(valeurs)} composantes, la principale regroupe {effectifs.max() / effectifs.sum():.1%} des nœuds")
    ok = np.isin(comp, list(garder_comp))
    return ok[a] & ok[b]


class MasqueTerre:
    """Terre = polygones terrestres OSM moins plans d'eau de plus de 1 ha, lus UNE fois pour toute l'emprise.

    (Une lecture du shapefile zippé prend ~11 s : la refaire par tuile coûtait 5 min pour 25 tuiles.)
    """

    def __init__(self, con, parquets, emprise, vers_l93):
        w, s, e, n = emprise
        self.terre = pyogrio.read_dataframe(TERRE_SHP.format(TERRE_ZIP.as_posix()), bbox=(w, s, e, n)).geometry.values
        eaux = []
        for parquet in parquets:
            eaux += [shapely.from_wkb(bytes(r[0])) for r in con.execute("""
                SELECT ST_AsWKB(geometry) FROM read_parquet(?)
                WHERE tags['natural'] = 'water' AND ST_GeometryType(geometry) IN ('POLYGON', 'MULTIPOLYGON')
                  AND ST_Intersects(geometry, ST_MakeEnvelope(?, ?, ?, ?))""", [str(parquet), w, s, e, n]).fetchall()]
        aire = lambda g: shapely.transform(g, lambda c: np.column_stack(vers_l93.transform(c[:, 0], c[:, 1]))).area
        self.eaux = np.array([g for g in eaux if aire(g) > EAU_MIN_M2], dtype=object)
        self.arbre_terre = shapely.STRtree(self.terre)
        self.arbre_eaux = shapely.STRtree(self.eaux) if len(self.eaux) else None
        print(f"  masque terre : {len(self.terre)} polygones terrestres, {len(self.eaux)} plans d'eau > 1 ha")

    def cellules(self, clon, clat):
        """Booléen « sur la terre » pour chaque centre de cellule d'une tuile."""
        boite = shapely.box(clon.min(), clat.min(), clon.max(), clat.max())
        terre = self.terre[self.arbre_terre.query(boite)]
        if len(terre) == 0:
            return np.zeros(len(clon), bool)
        sol = shapely.union_all(terre)
        if self.arbre_eaux is not None:
            eaux = self.eaux[self.arbre_eaux.query(boite)]
            if len(eaux):
                sol = sol.difference(shapely.union_all(eaux))
        shapely.prepare(sol)
        return shapely.contains_xy(sol, clon, clat)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--parquet", action="append", required=True, help="GeoParquet produit par extraire.py (répétable)")
    ap.add_argument("--emprise", action="append", required=True, help="lon_min,lat_min,lon_max,lat_max (répétable)")
    ap.add_argument("--sortie", default="tuiles", help="dossier des tuiles")
    args = ap.parse_args()
    t0 = time.time()
    emprises = [tuple(float(v) for v in e.split(",")) for e in args.emprise]
    tuiles = tuiles_des_emprises(emprises)
    # Les voies sont lues sur toute l'étendue des tuiles (pas seulement l'emprise demandée) : sinon le
    # bord des tuiles reste sans réseau et ses cellules tombent « hors d'atteinte »
    lt, ht = DLON * CELLULES_TUILE, DLAT * CELLULES_TUILE
    emprises = [(LON0 + int((w - LON0) // lt) * lt, LAT0 - (int((LAT0 - s) // ht) + 1) * ht,
                 LON0 + (int((e - LON0) // lt) + 1) * lt, LAT0 - int((LAT0 - n) // ht) * ht)
                for w, s, e, n in emprises]
    groupe = groupes_de_tuiles(tuiles)
    print(f"{len(tuiles)} tuiles, {max(groupe.values()) + 1} zone(s)")
    con = connecter()
    vers_l93 = Transformer.from_crs(4326, 2154, always_xy=True)

    # 1-3. Voies, nœuds, arêtes
    voies = lire_voies(con, args.parquet, emprises)
    noeuds, a, b, attr = construire_graphe(voies)
    tx, ty = tuile_xy(noeuds[:, 0], noeuds[:, 1])
    dans = np.array([(x, y) in tuiles for x, y in zip(tx.tolist(), ty.tolist())])
    garde = dans[a] & dans[b]
    grp = np.array([groupe.get((x, y), -1) for x, y in zip(tx.tolist(), ty.tolist())])
    a, b, attr = a[garde], b[garde], attr[garde]
    garde = garder_composantes(len(noeuds), a, b, grp)
    a, b, attr = a[garde], b[garde], attr[garde]

    # 5. Numérotation globale : tuile par tuile (ordre ty, tx), puis carré de 1 km, puis longitude
    utilises = np.unique(np.concatenate([a, b]))
    ordre_tuile = {t: k for k, t in enumerate(sorted(tuiles, key=lambda t: (t[1], t[0])))}
    lon, lat = noeuds[utilises, 0], noeuds[utilises, 1]
    k_tuile = np.array([ordre_tuile[(x, y)] for x, y in zip(tx[utilises].tolist(), ty[utilises].tolist())])
    carre_y = np.floor((LAT0 - lat) / CARRE_TRI_DEG[1]).astype(np.int64)
    carre_x = np.floor((lon - LON0) / CARRE_TRI_DEG[0]).astype(np.int64)
    tri = np.lexsort((lon, carre_x, carre_y, k_tuile))
    gid = np.empty(len(noeuds), np.int64)
    gid[utilises[tri]] = np.arange(len(utilises))
    a, b = gid[a], gid[b]
    lon, lat, k_tuile = lon[tri], lat[tri], k_tuile[tri]
    longueur = np.hypot((lon[a] - lon[b]) * np.cos(np.radians(lat[a])), lat[a] - lat[b]) * M_PAR_DEG
    l_dm = np.maximum(1, np.round(longueur * 10)).astype(np.int64)
    classe, vit, sens = attr[:, 0], attr[:, 1], attr[:, 2]
    attr_code = classe | (sens << 3) | (vit << 5)
    print(f"Graphe : {len(lon)} nœuds, {len(a)} arêtes, {longueur.sum() / 1000:.0f} km")

    # 6. Cellules : arbres des nœuds par mode, en Lambert-93 (distances en mètres)
    x, y = vers_l93.transform(lon, lat)
    arbre_tout = cKDTree(np.column_stack([x, y]))
    amen = np.unique(np.concatenate([a[np.isin(classe, CLASSES_AMEN)], b[np.isin(classe, CLASSES_AMEN)]]))
    arbre_amen = cKDTree(np.column_stack([x[amen], y[amen]])) if len(amen) else None

    # 7. Écriture tuile par tuile
    sortie = Path(args.sortie)
    sortie.mkdir(parents=True, exist_ok=True)
    txs, tys = [t[0] for t in tuiles], [t[1] for t in tuiles]
    masque = MasqueTerre(con, args.parquet, (LON0 + min(txs) * lt, LAT0 - (max(tys) + 1) * ht,
                                             LON0 + (max(txs) + 1) * lt, LAT0 - min(tys) * ht), vers_l93)
    debut_tuile = np.searchsorted(k_tuile, np.arange(len(ordre_tuile) + 1))
    index, octets_total = [], 0
    for (tx0, ty0), k in sorted(ordre_tuile.items(), key=lambda kv: kv[1]):
        base, fin = int(debut_tuile[k]), int(debut_tuile[k + 1])
        possedees = (a >= base) & (a < fin)                   # arête rattachée à la tuile de son nœud a
        ii, jj = np.meshgrid(np.arange(CELLULES_TUILE), np.arange(CELLULES_TUILE))
        clon = (LON0 + (tx0 * CELLULES_TUILE + ii + 0.5) * DLON).ravel()
        clat = (LAT0 - (ty0 * CELLULES_TUILE + jj + 0.5) * DLAT).ravel()
        terre = masque.cellules(clon, clat)
        cx, cy = vers_l93.transform(clon, clat)
        d_tout, p_tout = arbre_tout.query(np.column_stack([cx, cy]))
        if arbre_amen is not None:
            d_amen, p_amen = arbre_amen.query(np.column_stack([cx, cy]))
            p_amen = amen[p_amen]
        else:
            d_amen, p_amen = np.full(len(cx), np.inf), np.full(len(cx), -1)
        # Cellules en mer : aucun nœud (allège la tuile ; tempsGrille les ignore de toute façon)
        p_tout = np.where(terre, p_tout, -1)
        p_amen = np.where(terre, p_amen, -1)
        t = {
            "tx": tx0, "ty": ty0, "base": base,
            "lon": np.round(lon[base:fin] * 1e5).astype(np.int64).tolist(),
            "lat": np.round(lat[base:fin] * 1e5).astype(np.int64).tolist(),
            "a": (a[possedees] - base).tolist(), "b": b[possedees].tolist(),
            "l": l_dm[possedees].tolist(), "attr": attr_code[possedees].tolist(),
            "ncx": CELLULES_TUILE, "ncy": CELLULES_TUILE, "terre": terre.astype(int).tolist(),
            "pro_tout": p_tout.tolist(), "pro_amen": p_amen.tolist(),
            "dist_tout": np.minimum(d_tout, 1e6).tolist(), "dist_amen": np.minimum(d_amen, 1e6).tolist(),
        }
        octets = encoder_tuile(t)
        (sortie / f"{tx0}_{ty0}.bin").write_bytes(octets)
        octets_total += len(octets)
        index.append([tx0, ty0, base, fin - base])
    (sortie / "tuiles.json").write_text(json.dumps({
        "version": 1, "genere": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "sources": [Path(p).name for p in args.parquet], "terre": TERRE_ZIP.name,
        "grille": {"lon0": LON0, "lat0": LAT0, "dlon": DLON, "dlat": DLAT, "cellulesTuile": CELLULES_TUILE},
        "tuiles": index,
    }, ensure_ascii=False), "utf-8")
    print(f"Écrit : {len(index)} tuiles, {octets_total / 1024 ** 2:.1f} Mo, "
          f"{octets_total / 1024 / len(index):.0f} Ko par tuile en moyenne, en {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
