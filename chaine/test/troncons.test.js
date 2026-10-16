// ajouterTroncons : fenêtre augmentée des tronçons simulés (spec du 12/10/2026, section 1).
// Lancer : node --test test/troncons.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../../coeur.js");

const M_PAR_DEG = 6371008.8 * Math.PI / 180;     // mètres par degré de latitude (sphère de distanceM)

// Monde jouet : grille 60 × 60 cellules de 0,001° (lon 0..0,06, lat 0,94..1), tout en terre.
// Piste A : nœuds 0 (0,010 ; 0,970) – 1 (0,012 ; 0,970). Piste B : nœuds 2 (0,0156 ; 0,970) – 3 (0,0176 ; 0,970),
// à 400 m de A, sans lien. pro/dist comme tuiler.py : nœud le plus proche du centre de chaque cellule.
function monde() {
  const lon = Float64Array.from([0.010, 0.012, 0.0156, 0.0176]), lat = Float64Array.from([0.970, 0.970, 0.970, 0.970]);
  const g = { w: 0, n: 1, dlon: 0.001, dlat: 0.001, nx: 60, ny: 60 };
  const N = g.nx * g.ny, pro = { tout: new Int32Array(N), amenage: new Int32Array(N) };
  const dist = { tout: new Float32Array(N), amenage: new Float32Array(N) };
  const terre = new Uint8Array(N).fill(1);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const k = j * g.nx + i, clon = (i + 0.5) * g.dlon, clat = 1 - (j + 0.5) * g.dlat;
    let best = -1, dmin = Infinity;
    for (let v = 0; v < 4; v++) { const d = C.distanceM(clon, clat, lon[v], lat[v]); if (d < dmin) { dmin = d; best = v; } }
    for (const mode of ["tout", "amenage"]) { pro[mode][k] = best; dist[mode][k] = dmin; }
  }
  return {
    n: 4, m: 2, lon, lat, a: Int32Array.from([0, 2]), b: Int32Array.from([1, 3]),
    lm: Float32Array.from([222, 222]), cls: Uint8Array.from([0, 0]), sens: new Uint8Array(2), vit: Uint8Array.from([20, 20]),
    nom: new Int32Array(2), noms: [""], grille: { ...g, dedans: terre, ile: terre, pro, dist },
  };
}
const temps = (P, src) => C.dijkstra(C.construireGraphe(P, "tout"), src, 0).dist;

test("sans tronçon : rend la fenêtre elle-même (la carte sans scénario ne change pas)", () => {
  const P = monde();
  const r = C.ajouterTroncons(P, []);
  assert.equal(r.P, P);
  assert.deepEqual(r.nonRaccordes, []);
});

test("un tronçon de A à B relie les deux pistes ; P n'est pas modifié", () => {
  const P = monde(), proAvant = P.grille.pro.tout.slice();
  assert.equal(temps(P, 0)[2], Infinity);
  const { P: Q, nonRaccordes } = C.ajouterTroncons(P, [[[0.012, 0.970], [0.0156, 0.970]]]);
  const t = temps(Q, 0)[2];
  assert.ok(isFinite(t), "nœud 2 atteint");
  // 222 m de piste A + 400 m simulés, à 20 km/h
  assert.ok(Math.abs(t - (222 + 400) / (20 / 3.6)) < 2, `${t} s`);
  assert.deepEqual(nonRaccordes, []);
  assert.equal(P.n, 4); assert.equal(P.m, 2);
  assert.deepEqual(P.grille.pro.tout, proAvant);
  assert.equal(Q.grille.dedans, P.grille.dedans);
  assert.equal(Q.grille.ile, P.grille.ile);
});

test("arêtes simulées : classe 0, double sens, 20 km/h, nom « Piste (simulée) »", () => {
  const P = monde(), { P: Q } = C.ajouterTroncons(P, [[[0.012, 0.970], [0.0156, 0.970]]]);
  assert.ok(Q.m > P.m);
  for (let e = P.m; e < Q.m; e++) {
    assert.equal(Q.cls[e], 0); assert.equal(Q.sens[e], 0); assert.equal(Q.vit[e], 20);
    assert.equal(Q.noms[Q.nom[e]], "Piste (simulée)");
  }
});

test("segment de 350 m en site propre : découpé en 4 arêtes, 2 extrémités non raccordées", () => {
  const P = monde(), d = 350 / M_PAR_DEG;
  const t = [[0.040, 0.950], [0.040, 0.950 + d]];
  const { P: Q, nonRaccordes } = C.ajouterTroncons(P, [t]);
  assert.equal(Q.m - P.m, 4);
  assert.equal(Q.n - P.n, 5);
  assert.equal(nonRaccordes.length, 2);
});

test("cellules longeant un tronçon en site propre (raccordé à un bout) : rattachées aux nouveaux nœuds", () => {
  const P = monde(), d = 350 / M_PAR_DEG;
  const { P: Q } = C.ajouterTroncons(P, [[[0.0176, 0.970], [0.0176, 0.970 - d]]]);   // du nœud 3 vers le sud, en plein champ
  // Cellule dont le centre est au milieu du tronçon : i = 17 (lon 0,0175), lat ≈ 0,9684 → j = 31
  const k = 31 * 60 + 17;
  assert.ok(P.grille.pro.tout[k] < P.n);
  assert.ok(Q.grille.pro.tout[k] >= P.n, "nœud simulé");
  assert.ok(Q.grille.dist.tout[k] < 80, `${Q.grille.dist.tout[k]} m`);
  assert.ok(Q.grille.pro.amenage[k] >= P.n);
});

test("extrémité à 20 m d'un nœud : raccordée ; à 30 m : signalée non raccordée", () => {
  const P = monde();
  const proche = [[0.010, 0.970 + 20 / M_PAR_DEG], [0.010, 0.960]];
  const loin = [[0.010, 0.970 + 30 / M_PAR_DEG], [0.010, 0.960]];
  const r1 = C.ajouterTroncons(P, [proche]), r2 = C.ajouterTroncons(P, [loin]);
  assert.equal(r1.nonRaccordes.length, 1);                 // seule l'extrémité sud (0,960) est libre
  assert.ok(isFinite(temps(r1.P, 0)[P.n]), "premier sommet relié au nœud 0");
  assert.equal(r2.nonRaccordes.length, 2);
  assert.equal(temps(r2.P, 0)[P.n], Infinity);
});

test("tronçon qui sort de la grille : pas d'erreur, la partie dehors entre au graphe seulement", () => {
  const P = monde();
  const { P: Q } = C.ajouterTroncons(P, [[[0.0176, 0.970], [0.0176, 1.02]]]);   // nord de la grille (lat > 1)
  assert.ok(Q.n > P.n);
  assert.ok(isFinite(temps(Q, 3)[P.n + 1]), "dernier sommet (hors grille) atteint");
});

test("alias confort de la page conservé (pro.confort === pro.tout)", () => {
  const P = monde();
  P.grille.pro.confort = P.grille.pro.tout; P.grille.dist.confort = P.grille.dist.tout;
  const { P: Q } = C.ajouterTroncons(P, [[[0.012, 0.970], [0.0156, 0.970]]]);
  assert.equal(Q.grille.pro.confort, Q.grille.pro.tout);
  assert.equal(Q.grille.dist.confort, Q.grille.dist.tout);
});

const fs = require("fs");
const path = require("path");

async function fixtureOleron() {
  const dossier = path.join(__dirname, "fixtures", "oleron");
  const index = JSON.parse(fs.readFileSync(path.join(dossier, "tuiles.json"), "utf8"));
  return C.recollerTuiles(await Promise.all(index.tuiles.map(async ([tx, ty]) =>
    C.decoderTuile(await C.decompresserTuile(fs.readFileSync(path.join(dossier, `${tx}_${ty}.bin`)))))));
}

test("gainConfort / gainSurface sur un monde jouet : comptes attendus", () => {
  const P = monde(), N = 3600, aire = C.surfaceKm2(P, new Float32Array(N).fill(0), [1])[0] / N;
  const avant = { min: new Float32Array(N).fill(Infinity), minConf: new Float32Array(N).fill(Infinity) };
  const apres = { min: new Float32Array(N).fill(Infinity), minConf: new Float32Array(N).fill(Infinity) };
  avant.min[0] = 10; avant.minConf[0] = 20;  apres.min[0] = 10; apres.minConf[0] = 11;   // orange → bleu
  avant.min[1] = 10; avant.minConf[1] = 20;  apres.min[1] = 10; apres.minConf[1] = 14;   // orange → gris
  apres.min[2] = 30; apres.minConf[2] = 30;                                               // non atteint → bleu
  avant.min[3] = 10; avant.minConf[3] = 10;  apres.min[3] = 9;  apres.minConf[3] = 9;     // déjà bleu : rien
  const gc = C.gainConfort(P, avant, apres);
  assert.ok(Math.abs(gc.bleu - 2 * aire) < 1e-6, `${gc.bleu}`);
  assert.ok(Math.abs(gc.gris - aire) < 1e-6, `${gc.gris}`);
  const gs = C.gainSurface(P, avant.min, apres.min, [15, 45]);
  assert.ok(Math.abs(gs[0]) < 1e-9 && Math.abs(gs[1] - aire) < 1e-6, `${gs}`);
});

test("fenêtre réelle d'Oléron : une piste le long du maillon le plus chargé fait passer de la surface au bleu", async () => {
  const P = await fixtureOleron();
  P.grille.pro.confort = P.grille.pro.tout; P.grille.dist.confort = P.grille.dist.tout;   // comme la page
  const [lon, lat] = [-1.3063, 45.9443], lim = 3600;                 // mairie de Saint-Pierre-d'Oléron
  const calc = Q => {
    const G = C.construireGraphe(Q, "tout"), acc = C.accrocher(Q, G, lon, lat);
    const res = C.dijkstra(G, acc.noeud, C.accesSecondes(acc.distM), lim);
    return { G, res, min: C.tempsGrille(Q, G, res), minConf: C.minutesTranquilles(Q, C.construireGraphe(Q, "confort"), lon, lat, lim * 1.5) };
  };
  const av = calc(P);
  // Maillons comme dessinerConfort (index.html) : surface orange desservie, remontée des feuilles vers la racine
  const charge = new Float32Array(P.n), pro = P.grille.pro.tout;
  for (let k = 0; k < av.min.length; k++) if (av.min[k] <= 60 && C.teinteConfort(av.min[k], av.minConf[k]) === 2) charge[pro[k]]++;
  const ordre = [];
  for (let v = 0; v < P.n; v++) if (isFinite(av.res.dist[v])) ordre.push(v);
  ordre.sort((x, y) => av.res.dist[x] - av.res.dist[y]);
  for (let i = ordre.length - 1; i >= 0; i--) { const v = ordre[i], k = av.res.pred[v]; if (k >= 0) charge[av.G.source[k]] += charge[v]; }
  const exposeArc = v => av.res.pred[v] >= 0 && C.expose(P.cls[av.G.arete[av.res.pred[v]]]);
  let pire = -1;
  for (const v of ordre) if (exposeArc(v) && (pire < 0 || charge[v] > charge[pire])) pire = v;
  assert.ok(pire >= 0 && charge[pire] > 0, "aucun maillon manquant depuis Saint-Pierre");
  // Toute la portion de route exposée qui mène au maillon (remontée tant que l'arc est exposé)
  const chaine = [pire];
  for (let v = pire; exposeArc(v);) { v = av.G.source[av.res.pred[v]]; chaine.unshift(v); }
  const { P: Q } = C.ajouterTroncons(P, [chaine.map(u => [P.lon[u], P.lat[u]])]);
  const ap = calc(Q);
  const gc = C.gainConfort(P, av, ap);
  assert.ok(gc.bleu > 0, `aucun km² passé au bleu (${chaine.length} nœuds, charge ${charge[pire]} cellules)`);
  const gs = C.gainSurface(P, av.min, ap.min, [15, 30, 45]);
  assert.ok(gs.every(x => x >= -1e-6), `gain de surface négatif : ${gs}`);   // une piste ne ralentit jamais
});

// Une piste ajoutée ne doit jamais rallonger un temps : bug vu au navigateur le 12/10/2026 (tronçon tracé en plein
// champ sans raccord : gain de −0,1 pt, les cellules s'étant rattachées à des nœuds que rien ne relie au réseau)
const minutesDepuis = (Q, mode, src) => {
  const G = C.construireGraphe(Q, mode);
  return C.tempsGrille(Q, G, C.dijkstra(G, src, 0, 3600));
};
const jamaisPlusLent = (avant, apres) => {
  let pires = 0;
  for (let k = 0; k < avant.length; k++) if (apres[k] > avant[k] + 1e-6) pires++;
  return pires;
};

test("tronçon isolé (aucun raccord) : la grille ne bouge pas, aucun temps rallongé", () => {
  const P = monde(), d = 350 / M_PAR_DEG;
  const r = C.ajouterTroncons(P, [[[0.012, 0.970], [0.0156, 0.970]], [[0.014, 0.975], [0.014, 0.975 + d]]]);   // le 2e : à 500 m au nord, sans raccord
  const Q = r.P;
  assert.deepEqual(r.isoles, [1]);
  for (let k = 0; k < Q.grille.pro.tout.length; k++) assert.ok(Q.grille.pro.tout[k] === P.grille.pro.tout[k] || C.distanceM(Q.lon[Q.grille.pro.tout[k]], Q.lat[Q.grille.pro.tout[k]], 0.013, 0.970) < 1000, 'cellule reprise par le tronçon isolé');
  assert.equal(jamaisPlusLent(minutesDepuis(P, "tout", 0), minutesDepuis(Q, "tout", 0)), 0);
});

test("mode pistes : tronçon relié seulement à une route, aucun temps rallongé", () => {
  // Piste A (nœuds 0–1, comptée 1,2 km pour être un morceau accrochable) ; 2–3 devient une route
  const P = monde();
  P.lm[0] = 1200; P.cls[1] = 2;
  // Comme tuiler.py : en mode pistes, chaque cellule ne connaît que le nœud de piste le plus proche (0 ou 1)
  const g = P.grille;
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    const k = j * g.nx + i, clon = (i + 0.5) * g.dlon, clat = 1 - (j + 0.5) * g.dlat;
    const d0 = C.distanceM(clon, clat, P.lon[0], P.lat[0]), d1 = C.distanceM(clon, clat, P.lon[1], P.lat[1]);
    g.pro.amenage[k] = d0 <= d1 ? 0 : 1; g.dist.amenage[k] = Math.min(d0, d1);
  }
  const d = 500 / M_PAR_DEG;
  const { P: Q } = C.ajouterTroncons(P, [[[0.0176, 0.970], [0.0176 + d, 0.970]]]);   // part du nœud 3 (route) vers l'est
  assert.equal(jamaisPlusLent(minutesDepuis(P, "amenage", 0), minutesDepuis(Q, "amenage", 0)), 0);
});

// Relecture finale (12/10/2026) : le départ s'accrochait à la piste simulée la plus proche et perdait son accrochage
// d'avant ; une piste en U reliée loin du départ rallongeait alors des temps. On part ici d'un point, pas d'un nœud.
const minutesDepuisPoint = (Q, mode, lon, lat) => {
  const G = C.construireGraphe(Q, mode), d = C.departs(Q, G, lon, lat);
  return C.tempsGrille(Q, G, C.dijkstra(G, d.map(a => [a.noeud, C.accesSecondes(a.distM)]), 0, 3600));
};

test("départ plus proche de la piste simulée que de son nœud d'avant : aucun temps rallongé", () => {
  const P = monde(), d150 = 150 / M_PAR_DEG;
  // Départ à 167 m au sud du nœud 0 ; piste simulée en U depuis le nœud 3 (seul raccord), qui passe à ~33 m du départ
  const [lon, lat] = [0.010, 0.970 - d150];
  const u = [[0.0176, 0.970], [0.0176, lat + 0.0003], [0.0103, lat + 0.0003]];
  const { P: Q } = C.ajouterTroncons(P, [u]);
  assert.equal(jamaisPlusLent(minutesDepuisPoint(P, "tout", lon, lat), minutesDepuisPoint(Q, "tout", lon, lat)), 0);
});

test("departs : un seul départ sans scénario, deux quand la piste simulée est plus proche", () => {
  const P = monde(), G = C.construireGraphe(P, "tout");
  assert.equal(C.departs(P, G, 0.010, 0.9685).length, 1);
  const { P: Q } = C.ajouterTroncons(P, [[[0.0176, 0.970], [0.0176, 0.9688], [0.0103, 0.9688]]]);
  const d = C.departs(Q, C.construireGraphe(Q, "tout"), 0.010, 0.9685);
  assert.equal(d.length, 2);
  assert.ok(d.some(a => a.noeud === 0), "nœud d'avant gardé");
});

test("tronçon hors de la fenêtre chargée : ni « sans effet », ni extrémités libres, mais compté hors zone", () => {
  const P = monde();
  const r = C.ajouterTroncons(P, [[[0.20, 0.90], [0.21, 0.90]], [[0.012, 0.970], [0.0156, 0.970]]]);
  assert.deepEqual(r.isoles, []);
  assert.equal(r.nonRaccordes.length, 0);
  assert.deepEqual(r.horsZone, [0]);
});

test("croisement : un tronçon qui coupe une voie loin de ses sommets y est raccordé (12/10/2026)", () => {
  const P = monde();
  // Tronçon nord-sud qui coupe la piste A (0,010 → 0,012) en lon 0,011 ; sommets à plus d'1 km de tout nœud
  const r = C.ajouterTroncons(P, [[[0.011, 0.960], [0.011, 0.980]]]);
  assert.deepEqual(r.isoles, []);
  const d = temps(r.P, 0), fin = r.P.n - 1;            // dernier nœud ajouté = sommet nord du tronçon
  assert.ok(isFinite(d[fin]), "sommet nord joignable depuis la piste A par le croisement");
});

test("sommet posé sur une voie loin de ses nœuds : raccordé à cette voie (12/10/2026)", () => {
  const P = monde();
  // Départ au milieu de la piste A (111 m de ses deux nœuds), vers le nord, sans rien croiser
  const r = C.ajouterTroncons(P, [[[0.011, 0.970], [0.011, 0.975]]]);
  assert.deepEqual(r.isoles, []);
  assert.equal(r.nonRaccordes.length, 1, "seule l'extrémité nord reste libre");
  assert.ok(isFinite(temps(r.P, 0)[P.n]), "sommet sud joignable depuis le nœud 0");
});
