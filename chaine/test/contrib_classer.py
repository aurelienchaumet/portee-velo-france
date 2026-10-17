"""Écrit test/fixtures/contrib_cas.json : classe, vitesse et sens de classer_fin() (tuiler.py) pour des tags types.

contrib.test.js vérifie que lireTags() d'osm-contrib.js (texte d'aide de la page) donne la même chose.
Lancer depuis chaine/ : python -I -X utf8 test/contrib_classer.py
"""
import json
import sys
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path[:0] = [str(ICI.parent), str(ICI.parent.parent)]
from build_graph_velo import classer  # noqa: E402

# classer_fin() sans importer tuiler.py (duckdb, shapely…) : même code, recopié et comparé ci-dessous
SOURCE = (ICI.parent / "tuiler.py").read_text(encoding="utf-8")
espace = {"classer": classer}
for bloc in ("CLASSE_FINE = ", "VELO_OK_TRUNK = ", "def classer_fin"):
    debut = SOURCE.index(bloc)
    fin = SOURCE.index("\n\n", debut)
    exec(SOURCE[debut:fin], espace)
classer_fin = espace["classer_fin"]

TAGS = [
    {"highway": "cycleway"}, {"highway": "cycleway", "surface": "compacted"}, {"highway": "cycleway", "oneway": "yes"},
    {"highway": "path", "bicycle": "designated", "surface": "fine_gravel"}, {"highway": "path"}, {"highway": "path", "bicycle": "designated"},
    {"highway": "footway"}, {"highway": "footway", "bicycle": "yes"}, {"highway": "pedestrian", "bicycle": "designated"},
    {"highway": "track", "tracktype": "grade3"}, {"highway": "track"}, {"highway": "bridleway"},
    {"highway": "residential"}, {"highway": "residential", "oneway": "yes"}, {"highway": "residential", "oneway": "yes", "oneway:bicycle": "no"},
    {"highway": "residential", "oneway": "-1"}, {"highway": "residential", "oneway": "yes", "cycleway": "opposite_lane"},
    {"highway": "living_street"}, {"highway": "service"}, {"highway": "service", "service": "parking_aisle"},
    {"highway": "unclassified", "surface": "sett"}, {"highway": "tertiary", "cycleway:right": "lane"},
    {"highway": "secondary"}, {"highway": "secondary", "cycleway:both": "track"}, {"highway": "primary", "junction": "roundabout"},
    {"highway": "primary", "bicycle": "no"}, {"highway": "trunk"}, {"highway": "trunk", "bicycle": "yes"}, {"highway": "motorway"},
    {"highway": "residential", "access": "private"}, {"highway": "residential", "access": "private", "bicycle": "yes"},
    {"highway": "residential", "bicycle_road": "yes"}, {"highway": "residential", "area": "yes"}, {"highway": "steps"},
    {"highway": "residential", "surface": "sand"}, {"highway": "path", "bicycle": "dismount"},
]

cas = []
for t in TAGS:
    r = classer_fin(t)
    cas.append([t, list(r) if r else None])
sortie = ICI / "fixtures" / "contrib_cas.json"
sortie.write_text(json.dumps(cas, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
print(f"{len(cas)} cas écrits dans {sortie}")
