// Maillons manquants (D4, 12/10/2026) : traitsNoirs, voies, masque, cumul.
// Lancer : node --test test/maillons.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const C = require("../../coeur.js");

// Monde jouet : 0 —(rue, cls 2)— 1 —(départementale, cls 3)— 3 —(cls 3)— 2, en ligne à la latitude 0,98 ; impasse
// 1 — 4 (cls 2) : le nœud 1 est un carrefour, la rue et la départementale sont deux voies distinctes.
// Grille 40 × 40 cellules de la grille France (0,00125° × 0,0009°) : colonnes 0-3 rattachées au nœud 0,
// les autres (1 440 cellules ≈ 14 km²) au nœud 2, à 2,9 km de là par la départementale.
function monde({ piste = false } = {}) {
  const lon = [0, 0.001, 0.027, 0.014, 0.001], lat = [0.98, 0.98, 0.98, 0.98, 0.981];
  const a = [0, 1, 3, 1], b = [1, 3, 2, 4], cls = [2, 3, 3, 2];
  if (piste) { a.push(1); b.push(2); cls.push(0); }           // piste parallèle à la départementale
  const m = a.length;
  const lm = Float32Array.from({ length: m }, (_, e) => C.distanceM(lon[a[e]], lat[a[e]], lon[b[e]], lat[b[e]]));
  const g = { w: 0, n: 1, dlon: 0.00125, dlat: 0.0009, nx: 40, ny: 40 };
  const N = g.nx * g.ny, pro = new Int32Array(N), dist = new Float32Array(N).fill(50);
  for (let k = 0; k < N; k++) pro[k] = k % g.nx < 4 ? 0 : 2;
  const terre = new Uint8Array(N).fill(1);
  return {
    n: 5, m, lon: Float64Array.from(lon), lat: Float64Array.from(lat), a: Int32Array.from(a), b: Int32Array.from(b),
    lm, cls: Uint8Array.from(cls), sens: new Uint8Array(m), vit: new Uint8Array(m).fill(20), nom: new Int32Array(m), noms: [""],
    grille: { ...g, dedans: terre, ile: terre, pro: { tout: pro, amenage: pro, confort: pro }, dist: { tout: dist, amenage: dist, confort: dist } },
  };
}
// Temps, temps tranquille et traits noirs depuis (lon, lat), comme la page
function traits(P, lon, lat) {
  const G = { tout: C.construireGraphe(P, "tout"), confort: C.construireGraphe(P, "confort") };
  const res = C.dijkstra(G.tout, C.sourcesDijkstra(C.departs(P, G.tout, lon, lat)), 0, 3600);
  const min = C.tempsGrille(P, G.tout, res), minConf = C.minutesTranquilles(P, G.confort, lon, lat, 5400);
  return { G, t: C.traitsNoirs(P, G.tout, res, min, minConf) };
}

test("traitsNoirs : la départementale vers la zone orange est un trait noir, la rue non", () => {
  const P = monde(), { G, t } = traits(P, 0.0006, 0.98);
  const aretes = t.map(x => G.tout.arete[x.arc]).sort();
  assert.deepEqual(aretes, [1, 2]);                              // les deux arcs de la départementale
  for (const x of t) assert.ok(Math.abs(x.charge - 1440 * C.CELLULE_KM2) < 0.5, `charge ${x.charge}`);
});

test("traitsNoirs : une piste parallèle supprime le trait noir", () => {
  const P = monde({ piste: true });
  assert.deepEqual(traits(P, 0.0006, 0.98).t, []);
});

// Non-régression : même résultat que le code de la page avant extraction (copié ici tel quel), fixture Oléron
async function fixtureOleron() {
  const dossier = path.join(__dirname, "fixtures", "oleron");
  const index = JSON.parse(fs.readFileSync(path.join(dossier, "tuiles.json"), "utf8"));
  const P = C.recollerTuiles(await Promise.all(index.tuiles.map(async ([tx, ty]) =>
    C.decoderTuile(await C.decompresserTuile(fs.readFileSync(path.join(dossier, `${tx}_${ty}.bin`)))))));
  P.grille.pro.confort = P.grille.pro.tout; P.grille.dist.confort = P.grille.dist.tout;
  return P;
}
function traitsPageAvant(P, G, res, min, minConf) {          // dessinerConfort au 12/10/2026, sans le dessin
  const pro = P.grille.pro.tout, charge = new Float32Array(P.n);
  for (let k = 0; k < min.length; k++) {
    const m = min[k];
    if (!(m <= 60)) continue;
    if (C.teinteConfort(m, minConf[k]) === 2) charge[pro[k]]++;
  }
  const ordre = [];
  for (let v = 0; v < P.n; v++) if (isFinite(res.dist[v])) ordre.push(v);
  ordre.sort((a, b) => res.dist[a] - res.dist[b]);
  for (let i = ordre.length - 1; i >= 0; i--) { const v = ordre[i], k = res.pred[v]; if (k >= 0) charge[G.source[k]] += charge[v]; }
  const out = [];
  for (const v of ordre) {
    const k = res.pred[v]; if (k < 0 || !C.expose(P.cls[G.arete[k]])) continue;
    if (charge[v] * 0.0097 >= 10) out.push(k);
  }
  return out;
}
test("traitsNoirs : mêmes arcs que la page d'avant, depuis Marennes et Saint-Pierre (fixture Oléron)", async () => {
  // Fixture OSM seul du 10/10 : seul Marennes y produit des traits noirs (382 arcs) ; Saint-Pierre vérifie le cas vide
  const P = await fixtureOleron();
  let total = 0;
  for (const [lon, lat] of [[-1.1060, 45.8226], [-1.3063, 45.9443]]) {
    const { G, t } = traits(P, lon, lat);
    const res = C.dijkstra(G.tout, C.sourcesDijkstra(C.departs(P, G.tout, lon, lat)), 0, 3600);
    const min = C.tempsGrille(P, G.tout, res), minConf = C.minutesTranquilles(P, G.confort, lon, lat, 5400);
    const attendu = traitsPageAvant(P, G.tout, res, min, minConf);
    total += attendu.length;
    assert.deepEqual(t.map(x => x.arc), attendu);
  }
  assert.ok(total > 0, "la référence doit contenir des traits noirs");
});

module.exports = { monde, traits, fixtureOleron };

test("masque : plages décodées et ramenées sur la fenêtre", () => {
  const gi = { lon0: 0, lat0: 1, dlon: 0.00125, dlat: 0.0009 };
  // masque 4 × 2 à partir de la cellule (2, 1) de la grille France : 0 0 1 1 / 1 0 0 0
  const z = C.decoderMasque({ i0: 2, j0: 1, nx: 4, ny: 2, total: 3, plages: [2, 3] }, gi);
  assert.deepEqual([...z.m], [0, 0, 1, 1, 1, 0, 0, 0]);
  assert.equal(z.total, 3);
  const g = { w: 0, n: 1, dlon: 0.00125, dlat: 0.0009, nx: 8, ny: 4 };
  C.appliquerMasque(g, z, gi);
  const un = []; g.dedans.forEach((x, k) => { if (x) un.push(k); });
  assert.deepEqual(un, [1 * 8 + 4, 1 * 8 + 5, 2 * 8 + 2]);
  assert.equal(g.ile, g.dedans);
});

test("cumulerMaillons : une voie comptée une fois par départ, départ représentatif, point hors grille ignoré", () => {
  const P = monde();
  const G = { tout: C.construireGraphe(P, "tout"), confort: C.construireGraphe(P, "confort") };
  const r = C.cumulerMaillons(P, G, [[0.0006, 0.98], [0.0009, 0.9805], [0.0006, 0.95]]);
  assert.equal(r.departs, 3); assert.equal(r.ignores, 1);       // (0,0006 ; 0,95) : hors de la grille
  const dep = r.voie[1];                                         // départementale 1-3-2 : une seule voie
  assert.equal(r.voie[2], dep);
  assert.equal(r.score[dep], 2);                                 // 2 départs, pas 4 arcs
  assert.equal(r.score[r.voie[0]], 0);                           // la rue n'est jamais un trait noir
  assert.ok(r.rep[dep] && r.repCharge[dep] > 10);
});

test("grilleDeparts : seulement les cellules dedans, au pas demandé", () => {
  const g = { w: 0, n: 1, dlon: 0.00125, dlat: 0.0009, nx: 40, ny: 40, dedans: new Uint8Array(1600) };
  for (let k = 0; k < 1600; k++) g.dedans[k] = k % 40 < 20 ? 1 : 0;   // moitié ouest seulement
  const pts = C.grilleDeparts(g, 500);
  assert.ok(pts.length > 0);
  for (const [lon, lat] of pts) {
    const i = Math.floor((lon - g.w) / g.dlon), j = Math.floor((g.n - lat) / g.dlat);
    assert.equal(g.dedans[j * g.nx + i], 1);
  }
  // Latitude ~0,98° : 20 × 40 cellules ≈ 2,78 × 4 km, au pas de 500 m 6 × 8 = 48 points
  assert.ok(pts.length >= 44 && pts.length <= 52, `${pts.length} points`);
});
