"""Fixture du tuilage par bandes (phase 4) : un même réseau synthétique tuilé d'un bloc et par bandes de 2 lignes.

test/bandes.test.js vérifie qu'après recollage les deux donnent le même graphe (mêmes arêtes, aux coordonnées
près : la numérotation diffère). Pas de DuckDB : lire_voies() et le masque terre sont remplacés.

Réseau : quadrillage de rues toutes les 0,01° (sommets tous les 0,0025°), sur 3 × 7 tuiles de la grille
métropole, avec des sens uniques dans les deux sens de tracé (les arêtes retournées aux raccords doivent
garder le bon sens) et des classes et vitesses variées.

Usage (depuis chaine/) : python -I -X utf8 test/fabriquer_bandes.py
"""
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from pyproj import Transformer

ICI = Path(__file__).resolve().parent
sys.path[:0] = [str(ICI.parent), str(ICI.parent.parent)]
import tuiler  # noqa: E402

SORTIE = ICI / "fixtures" / "bandes"
TX, TY = range(40, 43), range(60, 67)          # 3 colonnes × 7 lignes de tuiles (vers 45,6° N, 0,5° E)


class MasqueToutTerre:
    def charger_eaux(self, *_):
        pass

    def cellules(self, clon, clat):
        return np.ones(len(clon), bool)


def voies_synthetiques():
    lt, ht = tuiler.DLON * tuiler.CELLULES_TUILE, tuiler.DLAT * tuiler.CELLULES_TUILE
    w, e = tuiler.LON0 + TX.start * lt, tuiler.LON0 + TX.stop * lt
    n, s = tuiler.LAT0 - TY.start * ht, tuiler.LAT0 - TY.stop * ht
    pas, sommet = 0.01, 0.0025
    xs = np.round(np.arange(w + 0.003, e, pas), 7)
    ys = np.round(np.arange(s + 0.003, n, pas), 7)
    voies, k = [], 0
    for x in xs:                                  # rues nord-sud, tracées du sud au nord
        y = np.round(np.arange(ys[0], ys[-1] + 1e-9, sommet), 7)
        voies.append((np.column_stack([np.full(len(y), x), y]), k % 4 + 1, 10 + k % 15, k % 3, -1))
        k += 1
    for y in ys:                                  # rues est-ouest, une sur deux tracée d'est en ouest
        x = np.round(np.arange(xs[0], xs[-1] + 1e-9, sommet), 7)
        if k % 2:
            x = x[::-1]
        voies.append((np.column_stack([x, np.full(len(x), y)]), k % 4 + 1, 10 + k % 15, k % 3, -1))
        k += 1
    return voies


def tuiler_dans(dossier, bande_lignes):
    if dossier.exists():
        shutil.rmtree(dossier)
    dossier.mkdir(parents=True)
    tuiles = {(x, y) for x in TX for y in TY}
    vers = Transformer.from_crs(4326, tuiler.EPSG, always_xy=True)
    base, index, connus, attente = 0, [], None, []
    for tg, halo, faits in tuiler.decouper_en_unites([tuiles], bande_lignes):
        lignes, nb, _, connus, attente = tuiler.traiter_groupe(
            None, None, tg, base, MasqueToutTerre(), vers, dossier, None, halo=halo, faits=faits,
            connus=connus if faits else None, attente=attente if faits else None)
        index += lignes
        base += nb
    grille = {"code": "fr", "lon0": tuiler.LON0, "lat0": tuiler.LAT0, "dlon": tuiler.DLON, "dlat": tuiler.DLAT,
              "cellulesTuile": tuiler.CELLULES_TUILE}
    (dossier / "tuiles.json").write_text(json.dumps({"version": 1, "grille": grille, "tuiles": index}), "utf-8")


if __name__ == "__main__":
    voies = voies_synthetiques()
    tuiler.lire_voies = lambda con, source, boites: voies
    tuiler_dans(SORTIE / "bloc", 0)
    tuiler_dans(SORTIE / "bandes", 2)
