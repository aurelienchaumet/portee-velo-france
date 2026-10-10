"""Mairies des chefs-lieux des 96 départements métropolitains → chefs_lieux.json (points de départ des scores).

Chef-lieu : Code officiel géographique de l'INSEE (cache/v_departement.csv, colonne CHEFLIEU, millésime 2025).
Mairie : objet OSM amenity=townhall situé dans la commune (boundary=administrative, admin_level=8,
ref:INSEE = code du chef-lieu). Choix, dans l'ordre : townhall:type=city, puis nom contenant « mairie »
ou « hôtel de ville », puis le plus grand bâtiment. À défaut de mairie : point intérieur de la commune,
signalé « à vérifier ».

Usage (depuis france/) : .venv/Scripts/python.exe -I -X utf8 chefs_lieux.py
"""
import csv
import json
import re
import sys
from pathlib import Path

import shapely

ICI = Path(__file__).resolve().parent
sys.path[:0] = [str(ICI)]
from tuiler import connecter  # noqa: E402  (extension spatial sur D:)

COG = ICI / "cache" / "v_departement.csv"
PARQUETS = str(ICI / "cache" / "regions" / "*.parquet")
SORTIE = ICI / "chefs_lieux.json"


def choisir_mairie(candidats):
    """candidats : liste de (tags, géométrie). Renvoie (géométrie, raison).

    Dans les grandes villes il y a plusieurs mairies (arrondissements, annexes, quartiers) : on veut la
    mairie centrale. Ordre : nom « hôtel de ville », townhall:type=city, nom « mairie » sans mention
    d'annexe / arrondissement / quartier / secteur, puis le plus grand bâtiment.
    """
    def rang(c):
        tags, g = c
        nom = (tags.get("name") or "").lower()
        secondaire = bool(re.search(r"annexe|antenne|direction|arrondissement|quartier|secteur|\d+(e|er|ème)|délégu", nom))
        # Le nom passe avant townhall:type=city, parfois posé sur des mairies de quartier (Nantes Chantenay)
        return (bool(re.search(r"h[ôo]tel[ -]de[ -]ville", nom)) and not secondaire,
                tags.get("townhall:type") == "city" and not secondaire,
                bool(re.search(r"mairie", nom)) and not secondaire,
                not secondaire,
                g.area)
    meilleur = max(candidats, key=rang)
    r = rang(meilleur)
    raison = ("hôtel de ville" if r[0] else "townhall:type=city" if r[1] else "mairie" if r[2]
              else "plus grand (aucun nom clair)")
    return meilleur[1], f"{raison} : {meilleur[0].get('name', 'sans nom')}"


def main():
    con = connecter()
    deps = [l for l in csv.DictReader(open(COG, encoding="utf-8")) if len(l["DEP"]) == 2]   # métropole : 01..95, 2A, 2B
    codes = [d["CHEFLIEU"] for d in deps]
    # Deux lectures seulement des 2,2 Go : toutes les communes chefs-lieux, puis toutes les mairies de France
    communes = {r[0]: (r[1], shapely.from_wkb(bytes(r[2]))) for r in con.execute(f"""
        SELECT tags['ref:INSEE'], tags['name'], ST_AsWKB(geometry) FROM read_parquet('{PARQUETS}')
        WHERE tags['boundary'] = 'administrative' AND tags['admin_level'] = '8'
          AND list_contains(?, tags['ref:INSEE']) AND ST_GeometryType(geometry) IN ('POLYGON', 'MULTIPOLYGON')""",
        [codes]).fetchall()}
    mairies = [(t, shapely.from_wkb(bytes(b))) for t, b in con.execute(f"""
        SELECT tags, ST_AsWKB(geometry) FROM read_parquet('{PARQUETS}') WHERE tags['amenity'] = 'townhall'""").fetchall()]
    arbre = shapely.STRtree([g.centroid for _, g in mairies])
    resultat = []
    for d in deps:
        code = d["CHEFLIEU"]
        if code not in communes:
            print(f"✖ {d['DEP']} : commune {code} introuvable dans OSM")
            continue
        nom, poly = communes[code]
        candidats = [mairies[i] for i in arbre.query(poly, predicate="contains")]
        if candidats:
            g, raison = choisir_mairie(candidats)
            pt = g.centroid
        else:
            pt, raison = poly.representative_point(), "à vérifier : aucune mairie OSM, point intérieur de la commune"
        resultat.append({"dep": d["DEP"], "departement": d["LIBELLE"], "code": code, "commune": nom,
                         "lon": round(pt.x, 6), "lat": round(pt.y, 6), "choix": raison, "candidats": len(candidats)})
        print(f"{d['DEP']:>3} {nom:<26} {len(candidats):>2} → {raison}")
    SORTIE.write_text(json.dumps(resultat, ensure_ascii=False, indent=1), "utf-8")
    print(f"Écrit : {SORTIE.name}, {len(resultat)} chefs-lieux sur {len(deps)} départements")


if __name__ == "__main__":
    main()
