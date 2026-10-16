// Non-régression (tâche T9) : la nouvelle chaîne (PBF → GeoParquet → tuiles → coeur.js France) doit donner
// la même couverture que la carte Marennes-Oléron « OSM seul » (Overpass → build_graph_velo.py → coeur.js),
// à 1 point près, depuis Saint-Pierre-d'Oléron et Marennes, à 15 / 30 / 45 min, dans les deux modes.
//
// Couverture = part des cellules du territoire (CdC Île d'Oléron + CC Bassin de Marennes) atteintes.
// Ancienne chaîne : cellules `ile` de sa propre grille. Nouvelle : cellules de la grille France dont le centre
// est dans le contour du territoire (fourni par le fichier ancien) ET sur la terre.
//
// Usage (depuis france/, après tuiler.py --emprise=-1.6,45.55,-0.75,46.15 --sortie cache/tuiles_nr) :
//   node test/non_regression.js [dossier_tuiles] [collectivites]
// Avec « collectivites » : référence = carte en ligne au 08/10/2026 (réseau CCIO + CCBM, test/ancien/portee_velo.js),
// à comparer aux tuiles produites avec tuiler.py --reseau. Seules les tuiles autour du territoire sont chargées
// (les 380 tuiles du 17 saturent la mémoire du poste).
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const nouveau = require("../../coeur.js");
// Même modèle que l'ancienne carte : on compare les chaînes de données, pas les majorations sur route (temps réels
// depuis le 11/10/2026) ni les liaisons entre pistes (12/10/2026)
nouveau.CFG.penalites.tout = [1, 1.1, 1.5, 2, 3, 1.5, 1.5, 1.5];
nouveau.CFG.liaisonMaxM = 0;

const DOSSIER = process.argv[2] || path.join(__dirname, "..", "cache", "tuiles_nr");
const COLLECTIVITES = process.argv[3] === "collectivites";
const ANCIEN_JS = path.join(__dirname, "ancien", COLLECTIVITES ? "portee_velo.js" : "portee_velo_osm.js");   // cartes du 08/10/2026, figées
const ANCIENNE_VAR = COLLECTIVITES ? "PORTEE_VELO" : "PORTEE_VELO_OSM";
const ANCIEN_COEUR = path.join(__dirname, "ancien", "coeur.js");          // coeur.js de cette carte, figé
const DEPARTS = { "Saint-Pierre": [-1.3063, 45.9443], "Marennes": [-1.1060, 45.8226] };
const SEUILS = [15, 30, 45];
const TOLERANCE_PT = 1;

// Ancien coeur.js chargé à part (mêmes noms de fonctions que le nouveau)
function chargerAncien() {
  const ctx = { module: { exports: {} }, Math, Float64Array, Float32Array, Int32Array, Uint8Array, Uint32Array };
  vm.runInNewContext(fs.readFileSync(ANCIEN_COEUR, "utf8"), ctx);
  const C = ctx.module.exports;
  const win = {};
  vm.runInNewContext(fs.readFileSync(ANCIEN_JS, "utf8"), { window: win });
  return { C, D: win[ANCIENNE_VAR] };
}

// Point dans un MultiPolygon GeoJSON (règle pair-impair, trous compris)
function dansMultiPolygone(mp, lon, lat) {
  let dedans = false;
  for (const poly of mp.coordinates) for (const anneau of poly) {
    for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
      const [xi, yi] = anneau[i], [xj, yj] = anneau[j];
      if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) dedans = !dedans;
    }
  }
  return dedans;
}

function couvertureDepuis(C, P, mode, lonlat) {
  const G = C.construireGraphe(P, mode);
  const acc = C.accrocher(P, G, ...lonlat);
  if (!acc) return SEUILS.map(() => 0);
  const res = C.dijkstra(G, acc.noeud, C.accesSecondes(acc.distM));
  return C.couverture(P, C.tempsGrille(P, G, res), SEUILS);
}

async function main() {
  const { C: A, D } = chargerAncien();
  const PA = A.preparer(D);

  const index = JSON.parse(fs.readFileSync(path.join(DOSSIER, "tuiles.json"), "utf8"));
  // Tuiles qui recoupent l'emprise du contour (+ 0,3°)
  let [w, s, e, n] = [180, 90, -180, -90];
  for (const poly of D.contour.coordinates) for (const anneau of poly) for (const [x, y] of anneau) {
    w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
  }
  const gr = index.grille, lt = gr.dlon * gr.cellulesTuile, ht = gr.dlat * gr.cellulesTuile;
  const utile = ([tx, ty]) => gr.lon0 + (tx + 1) * lt > w - 0.3 && gr.lon0 + tx * lt < e + 0.3
    && gr.lat0 - ty * ht > s - 0.3 && gr.lat0 - (ty + 1) * ht < n + 0.3;
  const tuiles = await Promise.all(index.tuiles.filter(utile).map(async ([tx, ty]) =>
    nouveau.decoderTuile(await nouveau.decompresserTuile(fs.readFileSync(path.join(DOSSIER, `${tx}_${ty}.bin`))))));
  const PN = nouveau.recollerTuiles(tuiles);
  // Cellules comptées : centre dans le territoire et sur la terre
  const g = PN.grille, ile = new Uint8Array(g.nx * g.ny);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const k = j * g.nx + i;
    ile[k] = g.dedans[k] && dansMultiPolygone(D.contour, g.w + (i + 0.5) * g.dlon, g.n - (j + 0.5) * g.dlat) ? 1 : 0;
  }
  g.ile = ile;
  console.log(`Ancienne chaîne : ${PA.n} nœuds (Overpass ${D.meta.osm}) ; nouvelle : ${PN.n} nœuds (${index.sources.join(", ")})`);
  console.log(`Cellules du territoire : ancienne ${PA.grille.ile.reduce((s, x) => s + x, 0)}, nouvelle ${ile.reduce((s, x) => s + x, 0)} (terre seule)`);

  let echecs = 0;
  for (const [nom, lonlat] of Object.entries(DEPARTS)) for (const mode of ["tout", "amenage"]) {
    const ca = couvertureDepuis(A, PA, mode, lonlat), cn = couvertureDepuis(nouveau, PN, mode, lonlat);
    const ligne = SEUILS.map((s, i) => {
      const ecart = (cn[i] - ca[i]) * 100, ok = Math.abs(ecart) <= TOLERANCE_PT;
      if (!ok) echecs++;
      return `${s} min ${(ca[i] * 100).toFixed(1)} → ${(cn[i] * 100).toFixed(1)} % (${ecart >= 0 ? "+" : ""}${ecart.toFixed(1)})${ok ? "" : " ✖"}`;
    }).join(" | ");
    console.log(`${nom.padEnd(12)} ${mode.padEnd(8)} ${ligne}`);
  }
  console.log(echecs ? `✖ ${echecs} écart(s) de plus de ${TOLERANCE_PT} point` : `✔ tous les écarts ≤ ${TOLERANCE_PT} point`);
  process.exitCode = echecs ? 1 : 0;
}

main();
