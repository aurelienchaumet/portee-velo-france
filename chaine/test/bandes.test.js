// Tuilage par bandes (phase 4) : le même réseau synthétique tuilé d'un bloc et par bandes de 2 lignes
// (test/fixtures/bandes, produites par test/fabriquer_bandes.py) doit donner, recollé, le même graphe et les
// mêmes temps de trajet. Lancer : node --test test/bandes.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const C = require("../../coeur.js");

const DOSSIER = path.join(__dirname, "fixtures", "bandes");

async function charger(nom) {
  const d = path.join(DOSSIER, nom);
  const index = JSON.parse(fs.readFileSync(path.join(d, "tuiles.json"), "utf8"));
  C.definirGrille(index.grille);
  const tuiles = await Promise.all(index.tuiles.map(async ([tx, ty]) =>
    C.decoderTuile(await C.decompresserTuile(fs.readFileSync(path.join(d, `${tx}_${ty}.bin`))))));
  return C.recollerTuiles(tuiles);
}

// Arêtes repérées par les coordonnées de leurs extrémités (la numérotation diffère d'un tuilage à l'autre),
// orientées de la plus petite à la plus grande : une arête retournée au raccord garde son sens (1 ↔ 2)
function aretes(P) {
  const cle = v => `${Math.round(P.lon[v] * 1e5)},${Math.round(P.lat[v] * 1e5)}`;
  const liste = [];
  for (let e = 0; e < P.m; e++) {
    let [a, b, s] = [cle(P.a[e]), cle(P.b[e]), P.sens[e]];
    if (a > b) { [a, b] = [b, a]; s = s === 1 ? 2 : s === 2 ? 1 : s; }
    liste.push(`${a}>${b}|${Math.round(P.lm[e] * 10)}|${P.cls[e]}|${s}|${P.vit[e]}|${P.rd[e]}|${P.nat[e]}`);
  }
  return liste.sort();
}

test("bandes : même graphe recollé qu'un tuilage d'un bloc", async () => {
  const bloc = await charger("bloc"), bandes = await charger("bandes");
  assert.equal(bandes.ecartees, 0, "aucune arête sans nœud au raccord");
  assert.equal(bandes.n, bloc.n);
  assert.equal(bandes.m, bloc.m);
  assert.deepEqual(aretes(bandes), aretes(bloc));
  // Départementales (bit 15, tuiler.py) : présentes et lues par recollerTuiles dans P.rd
  const nRd = P => P.rd.reduce((n, v) => n + v, 0);
  assert.ok(nRd(bloc) > 100, `${nRd(bloc)} arêtes départementales`);
  assert.equal(nRd(bandes), nRd(bloc));
  // Nationales (bit 14, 17/10/2026) : lues dans P.nat, sans toucher aux vitesses ni aux départementales
  const nNat = P => P.nat.reduce((n, v) => n + v, 0);
  assert.ok(nNat(bloc) > 100, `${nNat(bloc)} arêtes nationales`);
  assert.equal(nNat(bandes), nNat(bloc));
  assert.equal(bloc.nat.reduce((n, v, e) => n + (v && bloc.rd[e] ? 1 : 0), 0), 0, "une arête n'est pas les deux");
  assert.ok(Math.max(...bloc.vit) <= 24, "vitesses intactes malgré le bit 14");
});

test("bandes : mêmes minutes par cellule depuis un départ à cheval sur un raccord", async () => {
  const bloc = await charger("bloc"), bandes = await charger("bandes");
  // Départ sur la limite entre les lignes de tuiles 61 et 62 (bandes 60-61 et 62-63)
  const g = C.GRILLE_FRANCE, depart = [g.lon0 + 41.5 * g.dlon * 100, g.lat0 - 62 * g.dlat * 100 + 0.0004];
  const minutes = P => {
    const G = C.construireGraphe(P, "tout"), acc = C.accrocher(P, G, ...depart);
    return C.tempsGrille(P, G, C.dijkstra(G, acc.noeud, C.accesSecondes(acc.distM), 3600));
  };
  const a = minutes(bloc), b = minutes(bandes);
  assert.equal(a.length, b.length);
  let atteintes = 0, ecarts = 0;
  for (let k = 0; k < a.length; k++) {
    if (a[k] <= 60 || b[k] <= 60) atteintes++;
    if (a[k] !== b[k]) ecarts++;
  }
  assert.ok(atteintes > 50000, `${atteintes} cellules atteintes`);
  assert.equal(ecarts, 0, `${ecarts} cellules différentes sur ${atteintes}`);
});

test("sans départementales et nationales : les nationales ne sont plus empruntées", async () => {
  const P = await charger("bloc");
  const gardees = (mode, f) => {
    const G = C.construireGraphe(P, mode), vues = new Set();
    for (let k = 0; k < G.arete.length; k++) if (f(G.arete[k])) vues.add(G.arete[k]);
    return vues.size;
  };
  const nat = e => P.nat[e] === 1, nNat = P.nat.reduce((n, v) => n + v, 0);
  assert.equal(gardees("tout", nat), nNat, "avec les routes : toutes les nationales");
  const reste = gardees("sansdep", nat);
  assert.ok(reste <= nNat * 0.05, `${reste} arêtes nationales gardées sur ${nNat} (traversées seulement)`);
});
