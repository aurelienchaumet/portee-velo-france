// tuiles-worker.js exécuté sous Node (contexte vm : importScripts, fetch et postMessage simulés), sur les tuiles réelles
// d'Oléron : la fenêtre envoyée (P, graphe « tout » et sa contraction, graphe « sans les routes ») est celle que la page
// calculait elle-même, et passe par structuredClone comme par postMessage.
// Lancer : node --test test/worker.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const C = require("../../coeur.js");

const RACINE = path.join(__dirname, "..", "..");
const DOSSIER = path.join(__dirname, "fixtures", "oleron");
const index = JSON.parse(fs.readFileSync(path.join(DOSSIER, "tuiles.json"), "utf8"));

function lancerWorker() {
  const recus = [];
  const ctx = {
    console, Blob, Response, DecompressionStream, setTimeout, clearTimeout, Promise,
    fetch: async url => {
      const f = path.join(DOSSIER, url.replace("fixtures://", ""));
      if (!fs.existsSync(f)) return { ok: false, status: 404 };
      return { ok: true, arrayBuffer: async () => { const b = fs.readFileSync(f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); } };
    },
    postMessage: (m, transfert) => {
      if (transfert) for (const t of transfert) assert.equal(Object.prototype.toString.call(t), "[object ArrayBuffer]");
      recus.push(structuredClone(m, { transfer: transfert || [] }));   // comme postMessage : copie, tableaux transférés
    },
  };
  ctx.self = ctx;
  ctx.importScripts = f => vm.runInContext(fs.readFileSync(path.join(RACINE, f), "utf8"), ctx, { filename: f });
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(RACINE, "tuiles-worker.js"), "utf8"), ctx, { filename: "tuiles-worker.js" });
  const envoyer = m => ctx.onmessage({ data: m });
  // Suites envoyées après la réponse (lignes, contraction, « sans les routes ») : on attend la dernière
  recus.attendre = async (f, ms = 20000) => { const t = Date.now(); while (!recus.some(f)) { if (Date.now() - t > ms) throw new Error("suite non reçue"); await new Promise(r => setTimeout(r, 10)); } };
  envoyer({ type: "init", index, grille: index.grille, rayon: 3, capacite: 80, dossier: "fixtures://" });
  return { recus, envoyer };
}

const memeTableau = (a, b, nom) => { assert.equal(a.length, b.length, nom); for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && !(Number.isNaN(a[i]) && Number.isNaN(b[i]))) assert.fail(`${nom}[${i}] : ${a[i]} ≠ ${b[i]}`); };

test("fenêtre du Worker = fenêtre calculée dans la page (P, graphe « tout », « sans les routes »)", async () => {
  const { recus, envoyer } = lancerWorker();
  await envoyer({ id: 1, type: "fenetre", lon: -1.3063, lat: 45.9443 });
  await recus.attendre(x => x.type === "amenage");
  const m = recus[0], ma = recus.find(x => x.type === "amenage");
  const sr = recus.find(x => x.type === "suite" && x.reseau), sc = recus.find(x => x.type === "suite" && x.rapide);
  assert.deepEqual(recus.map(x => x.type || "fenetre"), ["fenetre", "suite", "suite", "amenage"], "réponse puis suites, dans l'ordre");
  assert.equal(m.id, 1); assert.ok(m.P && m.G && !m.meme && !m.G.rapide);
  for (const x of [ma, sr, sc]) assert.equal(x.signature, m.signature);
  m.G.rapide = sc.rapide; m.reseau = sr.reseau;                // ce que fait ChargeurWorker à leur arrivée
  // Référence : ChargeurTuiles dans la page
  const ref = await new C.ChargeurTuiles({ index, rayon: 3, lire: (tx, ty) => fs.readFileSync(path.join(DOSSIER, `${tx}_${ty}.bin`)) }).fenetre(-1.3063, 45.9443);
  assert.deepEqual(m.centre, ref.centre);
  for (const k of ["lon", "lat", "a", "b", "lm", "cls", "sens", "vit", "rd", "nat"]) memeTableau(m.P[k], ref.P[k], `P.${k}`);
  for (const k of ["dedans", "ile"]) memeTableau(m.P.grille[k], ref.P.grille[k], `grille.${k}`);
  for (const mode of ["tout", "amenage"]) { memeTableau(m.P.grille.pro[mode], ref.P.grille.pro[mode], `pro.${mode}`); memeTableau(m.P.grille.dist[mode], ref.P.grille.dist[mode], `dist.${mode}`); }
  assert.equal(m.P.grille.dedans, m.P.grille.ile, "dedans et ile restent un seul tableau");
  const Gt = C.construireGraphe(ref.P, "tout"), Ga = C.construireGraphe(ref.P, "amenage");
  for (const k of ["off", "cible", "source", "poids", "arete", "actif", "accrochable"]) { memeTableau(m.G[k], Gt[k], `tout.${k}`); memeTableau(ma.G[k], Ga[k], `amenage.${k}`); }
  assert.ok(m.G.rapide && ma.G.rapide, "contractions faites par le Worker");
  assert.deepEqual(C.deballerLignes(m.reseau[0]), C.lignesReseau(ref.P, 0), "lignes des pistes");
  assert.deepEqual(C.deballerLignes(m.reseau[1]), C.lignesReseau(ref.P, 1), "lignes des bandes");
  // Calcul de la page avec ces graphes : mêmes temps que sans Worker
  const P = m.P;
  P.grille.pro.confort = P.grille.pro.tout; P.grille.dist.confort = P.grille.dist.tout;
  (P._contractions = []).push({ G: m.G, pro: P.grille.pro.tout });
  for (const [G, Gref] of [[m.G, Gt], [ma.G, Ga]]) {
    const acc = C.departs(P, G, -1.3063, 45.9443), accR = C.departs(ref.P, Gref, -1.3063, 45.9443);
    const a = C.tempsGrille(P, G, C.dijkstraRapide(G, P, C.sourcesDijkstra(acc), 0, 3600));
    const b = C.tempsGrille(ref.P, Gref, C.dijkstra(Gref, C.sourcesDijkstra(accR), 0, 3600));
    for (let k = 0; k < a.length; k++) assert.ok(Number.isNaN(b[k]) ? Number.isNaN(a[k]) : a[k] === b[k] || Math.abs(a[k] - b[k]) < 1e-6, `${G.mode} cellule ${k}`);
  }
  // « confort » reprend la contraction reçue
  const Gc = C.construireGraphe(P, "confort");
  assert.equal(C.graphRapide(Gc, P).cible, m.G.rapide.cible);
});

test("même fenêtre redemandée : réponse « meme » sans tableaux ; couloir : P sans graphe", async () => {
  const { recus, envoyer } = lancerWorker();
  await envoyer({ id: 1, type: "fenetre", lon: -1.3063, lat: 45.9443 });
  await recus.attendre(x => x.type === "amenage");
  await envoyer({ id: 2, type: "fenetre", lon: -1.3050, lat: 45.9450 });       // même tuile centrale
  const r2 = recus.find(m => m.id === 2);
  assert.ok(r2.meme && !r2.P, "réutilise la fenêtre précédente");
  await envoyer({ id: 3, type: "couloir", lon1: -1.40, lat1: 46.02, lon2: -1.20, lat2: 45.85, demiLargeurKm: 3 });
  const r3 = recus.find(m => m.id === 3);
  assert.ok(r3.P && !r3.G);
  const ref = await new C.ChargeurTuiles({ index, lire: (tx, ty) => fs.readFileSync(path.join(DOSSIER, `${tx}_${ty}.bin`)) }).couloir(-1.40, 46.02, -1.20, 45.85, 3);
  assert.equal(r3.P.n, ref.P.n);
  assert.equal(recus.filter(m => m.type === "amenage").length, 1, "pas de graphe « sans les routes » pour un couloir");
});

test("tuile illisible : fenêtre partielle, pas d'erreur", async () => {
  const { recus, envoyer } = lancerWorker();
  const idx = JSON.parse(JSON.stringify(index));
  idx.tuiles.push([idx.tuiles[0][0] - 1, idx.tuiles[0][1], 0, 1]);              // tuile listée mais absente du dossier
  envoyer({ type: "init", index: idx, grille: idx.grille, rayon: 3, capacite: 80, dossier: "fixtures://" });
  const [tx, ty] = [idx.tuiles[0][0] - 1, idx.tuiles[0][1]];
  const lon = idx.grille.lon0 + (tx + .5) * 100 * idx.grille.dlon, lat = idx.grille.lat0 - (ty + .5) * 100 * idx.grille.dlat;
  await envoyer({ id: 9, type: "fenetre", lon, lat });
  const r = recus.find(m => m.id === 9);
  assert.ok(r && !r.erreur, JSON.stringify(r && r.erreur));
  assert.ok(r.partielle && r.manquantes.includes(`${tx}_${ty}`));
});

test("nouvelle fenêtre pendant les suites : celles de la précédente sont abandonnées", async () => {
  const { recus, envoyer } = lancerWorker();
  await envoyer({ id: 1, type: "fenetre", lon: -1.3063, lat: 45.9443 });
  await envoyer({ id: 2, type: "fenetre", lon: -1.10, lat: 45.80 });          // autre fenêtre, avant toute suite
  await recus.attendre(x => x.type === "amenage");
  await new Promise(r => setTimeout(r, 300));
  const s1 = recus.find(x => x.id === 1).signature, s2 = recus.find(x => x.id === 2).signature;
  assert.notEqual(s1, s2);
  assert.equal(recus.filter(x => x.signature === s1 && x.type).length, 0, "aucune suite pour la fenêtre abandonnée");
  assert.equal(recus.filter(x => x.signature === s2 && x.type).length, 3);
});
