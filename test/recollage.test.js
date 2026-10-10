// Recollage des tuiles et Dijkstra borné, sur les 25 tuiles réelles d'Oléron (test/fixtures/oleron,
// produites par tuiler.py --controle). Lancer : node --test test/recollage.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const C = require("../coeur.js");

const DOSSIER = path.join(__dirname, "fixtures", "oleron");
const SAINT_PIERRE = [-1.3063, 45.9443];          // départ par défaut de la carte Oléron

let cache = null;
async function chargerTout() {
  if (cache) return cache;
  const index = JSON.parse(fs.readFileSync(path.join(DOSSIER, "tuiles.json"), "utf8"));
  cache = await Promise.all(index.tuiles.map(async ([tx, ty]) =>
    C.decoderTuile(await C.decompresserTuile(fs.readFileSync(path.join(DOSSIER, `${tx}_${ty}.bin`))))));
  return cache;
}

// Empreinte calculée comme ecrire_controle() de tuiler.py (identifiants globaux, l en dm, attr recomposé)
function empreinte(P) {
  const lignes = [];
  for (let e = 0; e < P.m; e++) {
    const attr = P.cls[e] | (P.sens[e] << 3) | (P.vit[e] << 5);
    lignes.push(`${P.global[P.a[e]]},${P.global[P.b[e]]},${Math.round(P.lm[e] * 10)},${attr}`);
  }
  lignes.sort();
  return crypto.createHash("sha256").update(lignes.join("\n")).digest("hex");
}

test("recollage sans perte : toutes les tuiles redonnent le graphe d'avant découpage", async () => {
  const P = C.recollerTuiles(await chargerTout());
  const ref = JSON.parse(fs.readFileSync(path.join(DOSSIER, "controle.json"), "utf8"));
  assert.equal(P.n, ref.noeuds);
  assert.equal(P.m, ref.aretes);
  assert.equal(P.ecartees, 0);
  assert.equal(empreinte(P), ref.empreinte);
});

test("l'ordre de chargement des tuiles ne change rien", async () => {
  const tuiles = await chargerTout();
  const melange = [...tuiles].reverse();
  assert.equal(empreinte(C.recollerTuiles(melange)), empreinte(C.recollerTuiles(tuiles)));
});

// Calcule les minutes par cellule depuis un point, avec une borne en secondes
// depart (facultatif) : identifiant global du nœud de départ, pour partir du même nœud dans deux graphes
function minutes(P, mode, lonlat, limite, depart) {
  const G = C.construireGraphe(P, mode);
  let acc = C.accrocher(P, G, ...lonlat);
  if (depart !== undefined) {
    const v = P.idGlobal(depart);
    acc = { noeud: v, distM: C.distanceM(lonlat[0], lonlat[1], P.lon[v], P.lat[v]) };
  }
  const res = C.dijkstra(G, acc.noeud, C.accesSecondes(acc.distM), limite);
  return { G, res, min: C.tempsGrille(P, G, res) };
}

test("fenêtre 3 × 3 = graphe complet sous 30 min (invariant de marge : 30 min à 20 km/h = 10 km)", async () => {
  const tuiles = await chargerTout();
  const [tx0, ty0] = [Math.floor((SAINT_PIERRE[0] - C.GRILLE_FRANCE.lon0) / (C.GRILLE_FRANCE.dlon * 100)),
                      Math.floor((C.GRILLE_FRANCE.lat0 - SAINT_PIERRE[1]) / (C.GRILLE_FRANCE.dlat * 100))];
  const fenetre = tuiles.filter(t => Math.abs(t.tx - tx0) <= 1 && Math.abs(t.ty - ty0) <= 1);
  assert.equal(fenetre.length, 9);
  const PF = C.recollerTuiles(tuiles), PW = C.recollerTuiles(fenetre);
  assert.ok(PW.ecartees > 0, "des arêtes sortent bien de la fenêtre");
  for (const mode of ["tout", "amenage"]) {
    // Même nœud de départ dans les deux graphes : en mode pistes, la taille des morceaux (accrochage) se
    // compte dans la fenêtre chargée et peut différer ; on teste ici le recollage et le Dijkstra.
    const F = minutes(PF, mode, SAINT_PIERRE, 1800);
    const W = minutes(PW, mode, SAINT_PIERRE, 1800, PF.global[C.accrocher(PF, F.G, ...SAINT_PIERRE).noeud]);
    // Nœuds : même temps, identifiés par leur numéro global
    const tempsF = new Map();
    for (let v = 0; v < PF.n; v++) if (isFinite(F.res.dist[v])) tempsF.set(PF.global[v], F.res.dist[v]);
    let communs = 0;
    for (let v = 0; v < PW.n; v++) {
      if (!isFinite(W.res.dist[v])) continue;
      assert.equal(W.res.dist[v], tempsF.get(PW.global[v]), `${mode} : nœud ${PW.global[v]}`);
      communs++;
    }
    assert.equal(communs, tempsF.size, `${mode} : mêmes nœuds atteints`);
    // Cellules : mêmes minutes là où la fenêtre recouvre la grille complète
    const ox = (PW.grille.w - PF.grille.w) / C.GRILLE_FRANCE.dlon, oy = (PF.grille.n - PW.grille.n) / C.GRILLE_FRANCE.dlat;
    let cellules = 0;
    for (let j = 0; j < PW.grille.ny; j++) for (let i = 0; i < PW.grille.nx; i++) {
      const w = W.min[j * PW.grille.nx + i], f = F.min[(j + Math.round(oy)) * PF.grille.nx + i + Math.round(ox)];
      if (w <= 30 || f <= 30) { assert.equal(w, f, `${mode} : cellule ${i},${j}`); cellules++; }
    }
    // Mode pistes : depuis Saint-Pierre, la piste OSM la plus proche est un tronçon isolé (peu de cellules)
    assert.ok(cellules > (mode === "tout" ? 1000 : 0), `${mode} : ${cellules} cellules comparées`);
  }
});

test("Dijkstra borné : temps identiques sous la borne, rien au-delà", async () => {
  const P = C.recollerTuiles(await chargerTout());
  const G = C.construireGraphe(P, "tout");
  const acc = C.accrocher(P, G, ...SAINT_PIERRE);
  const libre = C.dijkstra(G, acc.noeud, 0), borne = C.dijkstra(G, acc.noeud, 0, 3600);
  let sous = 0;
  for (let v = 0; v < P.n; v++) {
    if (libre.dist[v] <= 3600) { assert.equal(borne.dist[v], libre.dist[v]); sous++; }
    else assert.equal(borne.dist[v], Infinity);
  }
  assert.ok(sous > 10000 && sous < P.n, `${sous} nœuds sous 60 min sur ${P.n}`);
});

test("surface atteinte en km² : aire de la grille à cos φ près, croissante avec le seuil", async () => {
  const P = C.recollerTuiles(await chargerTout());
  const g = P.grille, N = g.nx * g.ny;
  const tout = C.surfaceKm2(P, new Float32Array(N).fill(0), [0])[0];        // toutes les cellules de terre « atteintes »
  let terre = 0; for (let k = 0; k < N; k++) terre += g.ile[k];
  const aireMoy = tout / terre;                                             // ≈ 0,0111 km × 0,1 km × cos(46°)
  assert.ok(Math.abs(aireMoy - 0.1001 * 0.0967) < 0.0005, `aire moyenne ${aireMoy}`);
  const { min } = minutes(P, "tout", SAINT_PIERRE, 3600);
  const [s15, s30, s45] = C.surfaceKm2(P, min, [15, 30, 45]);
  assert.ok(s15 > 0 && s15 < s30 && s30 < s45, `${s15} < ${s30} < ${s45}`);
});
