// accrocher() par anneaux bornés à CFG.accesMaxM (décision D3 de la revue d'ingénierie).
// Lancer : node --test test/accrocher.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const C = require("../../coeur.js");

// Petit monde synthétique : grille de 60 × 60 cellules de 0,001°, mer à l'est de lon 0,035.
// Une route (classe 2) A–B au sud, une piste (classe 0) C–D au nord-ouest.
function monde() {
  const lon = Float64Array.from([0.030, 0.031, 0.010, 0.011]), lat = Float64Array.from([0.970, 0.970, 0.990, 0.990]);
  const g = { w: 0, n: 1, dlon: 0.001, dlat: 0.001, nx: 60, ny: 60 };
  const N = g.nx * g.ny, pro = { tout: new Int32Array(N), amenage: new Int32Array(N) };
  const dist = { tout: new Float32Array(N), amenage: new Float32Array(N) };
  const terre = new Uint8Array(N);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const k = j * g.nx + i, clon = (i + 0.5) * g.dlon, clat = 1 - (j + 0.5) * g.dlat;
    terre[k] = clon < 0.035 ? 1 : 0;
    // Comme tuiler.py : nœud le plus proche du centre pour chaque mode, aucun nœud en mer
    for (const [mode, noeuds] of [["tout", [0, 1, 2, 3]], ["amenage", [2, 3]]]) {
      let best = -1, dmin = Infinity;
      for (const v of noeuds) { const d = C.distanceM(clon, clat, lon[v], lat[v]); if (d < dmin) { dmin = d; best = v; } }
      pro[mode][k] = terre[k] ? best : -1; dist[mode][k] = dmin;
    }
  }
  return {
    n: 4, m: 2, lon, lat, a: Int32Array.from([0, 2]), b: Int32Array.from([1, 3]),
    lm: Float32Array.from([80, 80]), cls: Uint8Array.from([2, 0]), sens: new Uint8Array(2), vit: Uint8Array.from([20, 20]),
    nom: new Int32Array(2), noms: [""], grille: { ...g, dedans: terre, ile: terre, pro, dist },
  };
}

test("point sur la terre près de la route : nœud de la route, quelques mètres", () => {
  const P = monde(), G = C.construireGraphe(P, "tout");
  const r = C.accrocher(P, G, 0.0312, 0.9701);
  assert.equal(r.noeud, 1);
  assert.ok(r.distM < 30);
});

test("en mer à 1,4 km de la route : accroché en mode tout (≤ 2 km), aucune voie en mode pistes (> 800 m)", () => {
  const P = monde();
  const tout = C.accrocher(P, C.construireGraphe(P, "tout"), 0.044, 0.970);
  assert.equal(tout.noeud, 1);
  assert.ok(tout.distM > 1300 && tout.distM < 1500, `${tout.distM} m`);
  assert.equal(C.accrocher(P, C.construireGraphe(P, "amenage"), 0.044, 0.970), null);
});

test("en mer à plus de 2 km de tout : null, sans parcourir le graphe", () => {
  const P = monde();
  assert.equal(C.accrocher(P, C.construireGraphe(P, "tout"), 0.058, 0.970), null);
});

test("hors de la grille : null au lieu d'une erreur", () => {
  const P = monde();
  assert.equal(C.accrocher(P, C.construireGraphe(P, "tout"), 5, 5), null);
});

test("sur les tuiles réelles d'Oléron : même nœud (à une cellule près) qu'une recherche exhaustive", async () => {
  const dossier = path.join(__dirname, "fixtures", "oleron");
  const index = JSON.parse(fs.readFileSync(path.join(dossier, "tuiles.json"), "utf8"));
  const P = C.recollerTuiles(await Promise.all(index.tuiles.map(async ([tx, ty]) =>
    C.decoderTuile(await C.decompresserTuile(fs.readFileSync(path.join(dossier, `${tx}_${ty}.bin`)))))));
  for (const mode of ["tout", "amenage"]) {
    const G = C.construireGraphe(P, mode);
    let verifies = 0;
    for (let s = 0; s < 200; s++) {
      // Points pseudo-aléatoires reproductibles dans l'emprise des tuiles, terre comme mer
      const lon = P.grille.w + ((s * 7919) % 997) / 997 * P.grille.nx * P.grille.dlon;
      const lat = P.grille.n - ((s * 104729) % 991) / 991 * P.grille.ny * P.grille.dlat;
      let dExact = Infinity;
      for (let v = 0; v < P.n; v++) if (G.accrochable[v]) dExact = Math.min(dExact, C.distanceM(lon, lat, P.lon[v], P.lat[v]));
      const r = C.accrocher(P, G, lon, lat);
      if (dExact > C.CFG.accesMaxM[mode] + 150) { assert.equal(r, null, `${mode} ${lon},${lat}`); continue; }
      if (r === null) { assert.ok(dExact > C.CFG.accesMaxM[mode] - 150, `${mode} : null alors qu'une voie est à ${dExact} m`); continue; }
      // Chaque cellule ne connaît que le nœud le plus proche de son centre : écart toléré d'une cellule
      assert.ok(r.distM <= dExact + 150, `${mode} : ${r.distM} m contre ${dExact} m`);
      verifies++;
    }
    assert.ok(verifies > 20, `${mode} : ${verifies} points vérifiés`);
  }
});
