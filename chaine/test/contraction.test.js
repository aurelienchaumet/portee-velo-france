// Graphe contracté (dijkstraRapide) : mêmes temps que dijkstra() sur le graphe complet, pour chaque nœud et chaque
// cellule, dans tous les modes, avec et sans borne, et chemins valides. Tuiles réelles d'Oléron.
// Lancer : node --test test/contraction.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const C = require("../../coeur.js");

const DOSSIER = path.join(__dirname, "fixtures", "oleron");
const index = JSON.parse(fs.readFileSync(path.join(DOSSIER, "tuiles.json"), "utf8"));
const lire = (tx, ty) => fs.readFileSync(path.join(DOSSIER, `${tx}_${ty}.bin`));

let graine = 11;
const hasard = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
const proche = (a, b) => a === b || Math.abs(a - b) < 1e-6;

async function fenetre() {
  const chargeur = new C.ChargeurTuiles({ index, lire, rayon: 3 });
  const { P } = await chargeur.fenetre(-1.3063, 45.9443);
  P.grille.pro.confort = P.grille.pro.tout; P.grille.dist.confort = P.grille.dist.tout;   // comme la page
  return P;
}

// Chemin du résultat redéplié : chaque arc de pred entre bien dans son nœud, et les temps s'additionnent
function verifierChemins(G, res, nb) {
  const atteints = [];
  for (let v = 0; v < G.n; v++) if (isFinite(res.dist[v]) && res.pred[v] >= 0) atteints.push(v);
  for (let i = 0; i < nb && atteints.length; i++) {
    const v = atteints[Math.floor(hasard() * atteints.length)], k = res.pred[v];
    assert.equal(G.cible[k], v, "pred entre dans son nœud");
    assert.ok(proche(res.dist[G.source[k]] + G.poids[k], res.dist[v]), "temps du prédécesseur + arc = temps du nœud");
    assert.ok(C.itineraire(G, res, v).length > 0);
  }
}

test("contraction : moins de nœuds dans le calcul, aucun nœud cité par la grille retiré", async () => {
  const P = await fenetre();
  for (const mode of ["tout", "amenage", "sansdep", "confort"]) {
    const G = C.construireGraphe(P, mode), R = C.graphRapide(G, P);
    let retires = 0, actifs = 0;
    for (let v = 0; v < P.n; v++) { retires += R.trace[v]; actifs += G.actif[v]; }
    assert.ok(retires > 0.3 * actifs, `${mode} : ${retires} nœuds retirés sur ${actifs} actifs`);
    for (const v of P.grille.pro[mode]) if (v >= 0) assert.equal(R.trace[v], 0, `${mode} : nœud ${v} de la grille retiré`);
  }
});

test("dijkstraRapide = dijkstra : temps de tous les nœuds et de toutes les cellules, 4 modes, bornes 30 et 60 min", async () => {
  const P = await fenetre();
  for (const mode of ["tout", "amenage", "sansdep", "confort"]) {
    const G = C.construireGraphe(P, mode);
    const noeuds = [];
    for (let v = 0; v < P.n; v++) if (G.accrochable[v] && !C.graphRapide(G, P).trace[v]) noeuds.push(v);
    for (let i = 0; i < 6; i++) {
      const src = noeuds[Math.floor(hasard() * noeuds.length)], limite = i % 2 ? 1800 : 3600, t0 = 37.5;
      const ref = C.dijkstra(G, [[src, t0]], 0, limite), res = C.dijkstraRapide(G, P, [[src, t0]], 0, limite);
      // Survol : temps des cellules lus avant tout redépliage (distGardes)
      const avantDepli = C.tempsGrille(P, G, C.dijkstraRapide(G, P, [[src, t0]], 0, limite)), refG = C.tempsGrille(P, G, ref);
      for (let k = 0; k < refG.length; k++) assert.ok(Number.isNaN(refG[k]) ? Number.isNaN(avantDepli[k]) : proche(refG[k], avantDepli[k]), `${mode} cellule ${k} (non redéplié)`);
      for (let v = 0; v < P.n; v++) assert.ok(proche(res.dist[v], ref.dist[v]), `${mode} nœud ${v} : ${res.dist[v]} ≠ ${ref.dist[v]}`);
      const a = C.tempsGrille(P, G, ref), b = C.tempsGrille(P, G, res);
      for (let k = 0; k < a.length; k++) assert.ok(Number.isNaN(a[k]) ? Number.isNaN(b[k]) : proche(a[k], b[k]), `${mode} cellule ${k}`);
      verifierChemins(G, res, 200);
    }
  }
});

test("trajet tranquille : mêmes minutes, poids du graphe complet et du graphe contracté rendus intacts", async () => {
  const P = await fenetre();
  const Gc = C.construireGraphe(P, "confort");
  // Référence : graphe dont la « contraction » garde tous les nœuds, donc le calcul d'origine
  const Gref = C.construireGraphe(P, "confort");
  Gref.rapide = C.contracter(Gref, new Uint8Array(P.n).fill(1));
  assert.equal(Gref.rapide.trace.reduce((s, x) => s + x, 0), 0);
  const avant = Float32Array.from(Gc.poids), poidsC = Float64Array.from(C.graphRapide(Gc, P).poids);
  for (const [lon, lat] of [[-1.3063, 45.9443], [-1.2, 45.88], [-1.37, 45.99], [-1.25, 45.93]]) {
    const rapide = C.minutesTranquilles(P, Gc, lon, lat, 5400), ref = C.minutesTranquilles(P, Gref, lon, lat, 5400);
    let comptees = 0;
    for (let k = 0; k < ref.length; k++) {
      assert.ok(Number.isNaN(ref[k]) ? Number.isNaN(rapide[k]) : proche(ref[k], rapide[k]), `cellule ${k} : ${rapide[k]} ≠ ${ref[k]}`);
      if (ref[k] < Infinity) comptees++;
    }
    assert.ok(comptees > 1000, "le calcul atteint bien des cellules");
    assert.deepEqual(Gc.poids, avant, "poids d'origine restaurés");
    const R = C.graphRapide(Gc, P);
    for (let j = 0; j < R.nArcs; j++) assert.ok(proche(poidsC[j], R.poids[j]), `arc contracté ${j}`);
  }
});

test("source sur un point de tracé : repli sur le calcul complet", async () => {
  const P = await fenetre();
  const G = C.construireGraphe(P, "tout"), R = C.graphRapide(G, P);
  let v = 0; while (!R.trace[v]) v++;
  const ref = C.dijkstra(G, v, 0, 3600), res = C.dijkstraRapide(G, P, v, 0, 3600);
  for (let u = 0; u < P.n; u++) assert.ok(proche(res.dist[u], ref.dist[u]));
});

test("« confort » reprend la contraction de « tout » : mêmes poids qu'une contraction refaite", async () => {
  const P = await fenetre();
  const Gt = C.construireGraphe(P, "tout"), Gc = C.construireGraphe(P, "confort");
  const Rt = C.graphRapide(Gt, P), Rc = C.graphRapide(Gc, P);
  assert.equal(Rc.cible, Rt.cible, "structure partagée");
  const Rref = C.contracter(Gc, new Uint8Array(P.n).map((_, v) => (Rt.trace[v] ? 0 : 1)));
  assert.deepEqual(Rc.poids, Rref.poids);
  assert.notDeepEqual(Rc.poids, Rt.poids, "poids propres au confort");
});

test("tampons réutilisés : un résultat gardé reste juste après d'autres calculs sur le même graphe", async () => {
  const P = await fenetre();
  const G = C.construireGraphe(P, "tout"), R = C.graphRapide(G, P);
  const noeuds = [];
  for (let v = 0; v < P.n; v++) if (G.accrochable[v] && !R.trace[v]) noeuds.push(v);
  const [a, b, c] = [noeuds[10], noeuds[Math.floor(noeuds.length / 2)], noeuds[noeuds.length - 10]];
  const refA = C.dijkstra(G, a, 0, 3600), refB = C.dijkstra(G, b, 0, 3600);
  const resA = C.dijkstraRapide(G, P, a, 0, 3600);           // non redéplié, dans les tampons
  const resB = C.dijkstraRapide(G, P, b, 0, 3600);
  const resBdepl = resB.dist;                                // redéplié (copie hors tampons)
  C.dijkstraRapide(G, P, c, 0, 3600);                        // écrase les tampons
  for (let v = 0; v < P.n; v++) {
    assert.ok(proche(resA.dist[v], refA.dist[v]), `A nœud ${v}`);
    assert.ok(proche(resBdepl[v], refB.dist[v]), `B nœud ${v}`);
  }
  assert.ok(C.itineraire(G, resA, noeuds[200]).length > 0 || !isFinite(refA.dist[noeuds[200]]));
});
