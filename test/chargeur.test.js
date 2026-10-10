// Chargeur de fenêtre (décisions D4 et D5 de la revue d'ingénierie). Lancer : node --test test/chargeur.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const C = require("../coeur.js");

const DOSSIER = path.join(__dirname, "fixtures", "oleron");
const INDEX = JSON.parse(fs.readFileSync(path.join(DOSSIER, "tuiles.json"), "utf8"));
const SAINT_PIERRE = [-1.3063, 45.9443];
const lireFichier = (tx, ty) => fs.readFileSync(path.join(DOSSIER, `${tx}_${ty}.bin`));

// Tuile factice décodée (sans nœud) pour les tests de cache sur une grande grille
const CC = C.GRILLE_FRANCE.cellulesTuile * C.GRILLE_FRANCE.cellulesTuile;
const factice = (tx, ty) => ({ tx, ty, base: 0, n: 0, m: 0, lon: [], lat: [], a: [], b: [], l: [], attr: [],
  ncx: 100, ncy: 100, terre: new Uint8Array(CC), proTout: new Int32Array(CC).fill(-1), proAmen: new Int32Array(CC).fill(-1),
  distTout: new Uint16Array(CC), distAmen: new Uint16Array(CC) });
const centreTuile = (tx, ty) => [C.GRILLE_FRANCE.lon0 + (tx + 0.5) * 100 * C.GRILLE_FRANCE.dlon,
                                 C.GRILLE_FRANCE.lat0 - (ty + 0.5) * 100 * C.GRILLE_FRANCE.dlat];

test("fenêtre 5 × 5 sur les vraies tuiles : graphe prêt pour le calcul, rien de partiel", async () => {
  const ch = new C.ChargeurTuiles({ index: INDEX, lire: lireFichier });
  const f = await ch.fenetre(...SAINT_PIERRE);
  assert.equal(f.partielle, false);
  assert.ok(f.P.n > 100000);
  const G = C.construireGraphe(f.P, "tout");
  const acc = C.accrocher(f.P, G, ...SAINT_PIERRE);
  const res = C.dijkstra(G, acc.noeud, C.accesSecondes(acc.distM), 3600);
  assert.ok(C.tempsGrille(f.P, G, res).some(m => m <= 15));
});

test("tuile absente de l'index : aucune requête, aucune attente", async () => {
  const demandes = [];
  const ch = new C.ChargeurTuiles({ index: { tuiles: [[10, 10]] }, lire: (tx, ty) => { demandes.push(`${tx}_${ty}`); return 0; },
                                    decoder: async () => factice(10, 10) });
  const f = await ch.fenetre(...centreTuile(10, 10));
  assert.deepEqual(demandes, ["10_10"]);
  assert.equal(f.partielle, false);
});

test("échec puis succès : un seul nouvel essai, fenêtre complète", async () => {
  let appels = 0;
  const ch = new C.ChargeurTuiles({ index: { tuiles: [[10, 10]] }, lire: () => { if (appels++ === 0) throw new Error("réseau"); return 0; },
                                    decoder: async () => factice(10, 10) });
  const f = await ch.fenetre(...centreTuile(10, 10));
  assert.equal(appels, 2);
  assert.equal(f.partielle, false);
});

test("deux échecs : tuile vide, fenêtre partielle, nouvel essai au changement de fenêtre suivant", async () => {
  let panne = true, appels = 0;
  const ch = new C.ChargeurTuiles({ index: { tuiles: [[10, 10], [11, 10]] },
    lire: (tx) => { appels++; if (panne && tx === 11) throw new Error("404"); return tx; },
    decoder: async tx => factice(tx, 10) });
  const f1 = await ch.fenetre(...centreTuile(10, 10));
  assert.equal(f1.partielle, true);
  assert.deepEqual(f1.manquantes, ["11_10"]);
  assert.equal(appels, 3);                                   // 10_10 une fois, 11_10 deux fois
  panne = false;
  const f2 = await ch.fenetre(...centreTuile(10, 10));
  assert.equal(f2.partielle, false, "la tuile en échec n'est pas gardée en cache : elle est retentée");
});

test("délai dépassé : compté comme un échec, pas d'attente infinie", async () => {
  const ch = new C.ChargeurTuiles({ index: { tuiles: [[10, 10]] }, lire: () => new Promise(() => {}), delaiMs: 20,
                                    decoder: async () => factice(10, 10) });
  const f = await ch.fenetre(...centreTuile(10, 10));
  assert.equal(f.partielle, true);
  assert.equal(f.P, null);
});

test("même fenêtre deux fois : aucune nouvelle lecture, même graphe recollé", async () => {
  const ch = new C.ChargeurTuiles({ index: INDEX, lire: lireFichier });
  const f1 = await ch.fenetre(...SAINT_PIERRE);
  const lectures = ch.lectures;
  const f2 = await ch.fenetre(SAINT_PIERRE[0] + 0.001, SAINT_PIERRE[1]);   // même tuile centrale
  assert.equal(ch.lectures, lectures);
  assert.equal(f2.P, f1.P);
});

test("demandes simultanées : chaque tuile lue une seule fois", async () => {
  const ch = new C.ChargeurTuiles({ index: INDEX, lire: lireFichier });
  await Promise.all([ch.fenetre(...SAINT_PIERRE), ch.fenetre(...SAINT_PIERRE)]);
  assert.equal(ch.lectures, ch.voisines(...ch.tuileDe(...SAINT_PIERRE), 2).length);   // tuiles de la fenêtre présentes dans l'index
});

test("cache LRU : jamais plus de 60 tuiles, la fenêtre courante toujours présente", async () => {
  const tuiles = [];
  for (let ty = 0; ty < 20; ty++) for (let tx = 0; tx < 20; tx++) tuiles.push([tx, ty]);
  const ch = new C.ChargeurTuiles({ index: { tuiles }, lire: (tx, ty) => [tx, ty], decoder: async ([tx, ty]) => factice(tx, ty) });
  for (let pas = 0; pas < 18; pas++) {                        // traversée en diagonale : ~200 tuiles vues
    const [lon, lat] = centreTuile(1 + pas, 1 + pas);
    await ch.fenetre(lon, lat);
    ch.precharger(lon, lat);
    await Promise.all([...ch.enCours.values()]);
    const f = await ch.fenetre(lon, lat);
    assert.ok(ch.cache.size <= 60, `${ch.cache.size} tuiles en cache`);
    for (const cle of ch.voisines(1 + pas, 1 + pas, 2)) assert.ok(ch.cache.has(cle), `fenêtre courante : ${cle}`);
    assert.equal(f.partielle, false);
  }
  assert.ok(ch.lectures > 60, `${ch.lectures} lectures`);
});
