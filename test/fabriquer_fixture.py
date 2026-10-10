"""Fabrique la fixture du test aller-retour du format de tuile, à partir des données réelles
d'Oléron (OSM seul, ../data/portee_velo_osm.js du dépôt portee-velo), et mesure la taille
du format sur le jeu complet.

Écrit test/fixtures/tuile.bin (gzip) et test/fixtures/tuile.json (valeurs attendues après
décodage, arêtes dans l'ordre de l'encodeur). Lancer depuis france/ :
    .venv/Scripts/python.exe -I test/fabriquer_fixture.py
"""
import json
import sys
from pathlib import Path

ICI = Path(__file__).resolve().parent
sys.path.insert(0, str(ICI.parent))
from format_tuile import DIST_MAX, PAS_DIST_M, encoder_tuile  # noqa: E402

SOURCE = ICI.parent.parent / "data" / "portee_velo_osm.js"
BASE = 50_000_000            # identifiants globaux réalistes pour la France (plusieurs dizaines de millions)
N_NOEUDS = 3000              # sous-ensemble : fixture petite, mais avec des b hors tuile
FENETRE = 100                # 100 × 100 cellules, comme une vraie tuile


def charger_portee_velo():
    """Lit le fichier JS (window.PORTEE_VELO_OSM = {...};) comme du JSON."""
    texte = SOURCE.read_text("utf-8")
    return json.loads(texte[texte.index("{"): texte.rstrip().rstrip(";").rindex("}") + 1])


def main():
    D = charger_portee_velo()
    no, ar, g = D["noeuds"], D["aretes"], D["grille"]

    # --- 1. Fixture : 3 000 nœuds, leurs arêtes (b peut sortir de la tuile), une fenêtre de cellules
    aretes = [e for e in range(len(ar["a"])) if ar["a"][e] < N_NOEUDS]
    i0, j0 = g["nx"] // 2 - FENETRE // 2, g["ny"] // 2 - FENETRE // 2
    cell = [(j0 + j) * g["nx"] + (i0 + i) for j in range(FENETRE) for i in range(FENETRE)]
    glob = lambda v: -1 if v < 0 else BASE + v
    t = {
        "tx": -3, "ty": 7, "base": BASE,                                 # tx négatif : teste le zigzag de l'en-tête
        "lon": no["lon"][:N_NOEUDS], "lat": no["lat"][:N_NOEUDS],
        "a": [ar["a"][e] for e in aretes], "b": [BASE + ar["b"][e] for e in aretes],
        "l": [ar["l"][e] for e in aretes], "attr": [ar["attr"][e] for e in aretes],
        "ncx": FENETRE, "ncy": FENETRE,
        "terre": [g["dedans"][k] for k in cell],
        "pro_tout": [glob(g["pro_tout"][k]) for k in cell], "pro_amen": [glob(g["pro_amen"][k]) for k in cell],
        "dist_tout": [g["dist_tout"][k] for k in cell], "dist_amen": [g["dist_amen"][k] for k in cell],
    }
    # Cas limites ajoutés à la main : b dans une tuile précédente (écart négatif), distance hors plafond
    t["a"].append(0); t["b"].append(BASE - 123_456); t["l"].append(65535); t["attr"].append(255)
    t["dist_tout"][0] = 9999
    t["pro_tout"][1] = -1

    octets = encoder_tuile(t)
    fixtures = ICI / "fixtures"
    fixtures.mkdir(exist_ok=True)
    (fixtures / "tuile.bin").write_bytes(octets)
    # Valeurs attendues après décodage : arêtes dans l'ordre stable de l'encodeur, a en global, distances quantifiées
    ordre = sorted(range(len(t["a"])), key=lambda e: t["a"][e])
    q = lambda d: min(DIST_MAX, round(d / PAS_DIST_M)) * PAS_DIST_M
    attendu = {
        "tx": t["tx"], "ty": t["ty"], "base": BASE, "n": N_NOEUDS, "m": len(ordre),
        "lon": t["lon"], "lat": t["lat"],
        "a": [BASE + t["a"][e] for e in ordre], "b": [t["b"][e] for e in ordre],
        "l": [t["l"][e] for e in ordre], "attr": [t["attr"][e] for e in ordre],
        "ncx": FENETRE, "ncy": FENETRE, "terre": [1 if v else 0 for v in t["terre"]],
        "proTout": t["pro_tout"], "proAmen": t["pro_amen"],
        "distTout": [q(d) for d in t["dist_tout"]], "distAmen": [q(d) for d in t["dist_amen"]],
    }
    (fixtures / "tuile.json").write_text(json.dumps(attendu), "utf-8")
    print(f"fixture : {len(octets) / 1024:.0f} Ko, {N_NOEUDS} nœuds, {len(ordre)} arêtes")

    # --- 2. Mesure : tout le jeu d'Oléron encodé comme une seule « tuile »
    nc = g["nx"] * g["ny"]
    complet = {
        "tx": 0, "ty": 0, "base": BASE, "lon": no["lon"], "lat": no["lat"],
        "a": ar["a"], "b": [BASE + v for v in ar["b"]], "l": ar["l"], "attr": ar["attr"],
        "ncx": g["nx"], "ncy": g["ny"], "terre": g["dedans"],
        "pro_tout": [glob(v) for v in g["pro_tout"]], "pro_amen": [glob(v) for v in g["pro_amen"]],
        "dist_tout": g["dist_tout"], "dist_amen": g["dist_amen"],
    }
    assert len(complet["terre"]) == nc
    taille = len(encoder_tuile(complet))
    km2 = sum(g["dedans"]) / 100
    print(f"Oléron complet : {taille / 1024:.0f} Ko gzip pour {km2:.0f} km² calculés, "
          f"soit {taille / 1024 / km2 * 100:.0f} Ko / 100 km² (sonde naïve : 400, sonde delta : 150)")


if __name__ == "__main__":
    main()
