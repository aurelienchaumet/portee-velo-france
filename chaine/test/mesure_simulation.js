// Mesures pour la PR de simulation : coût de P′ + G′ et d'une image de survol, sans / avec tronçons (fixture Oléron).
// Lancer : node test/mesure_simulation.js
const fs = require("fs");
const path = require("path");
const C = require("../../coeur.js");

(async () => {
  const dossier = path.join(__dirname, "fixtures", "oleron");
  const index = JSON.parse(fs.readFileSync(path.join(dossier, "tuiles.json"), "utf8"));
  const P = C.recollerTuiles(await Promise.all(index.tuiles.map(async ([tx, ty]) =>
    C.decoderTuile(await C.decompresserTuile(fs.readFileSync(path.join(dossier, `${tx}_${ty}.bin`)))))));
  P.grille.pro.confort = P.grille.pro.tout; P.grille.dist.confort = P.grille.dist.tout;
  const [lon, lat] = [-1.3063, 45.9443];
  // k tronçons de 2 km (20 sommets) en étoile autour du départ
  const scenario = k => Array.from({ length: k }, (_, i) => Array.from({ length: 20 }, (_, j) => {
    const a = (i / k) * 2 * Math.PI, r = 0.0011 * (j + 1);
    return [lon + r * Math.cos(a) * 1.44, lat + r * Math.sin(a)];
  }));
  const ms = f => { const t = performance.now(); const r = f(); return [performance.now() - t, r]; };
  const image = (Q, G) => {
    const acc = C.accrocher(Q, G.tout, lon, lat);
    const res = C.dijkstra(G.tout, acc.noeud, C.accesSecondes(acc.distM), 3600);
    C.tempsGrille(Q, G.tout, res);
    C.minutesTranquilles(Q, G.confort, lon, lat, 5400);
  };
  console.log(`fenêtre : ${P.n} nœuds, ${P.m} arêtes`);
  const G = { tout: C.construireGraphe(P, "tout"), confort: C.construireGraphe(P, "confort") };
  image(P, G);                                     // chauffe du moteur JS
  const [t0] = ms(() => image(P, G));
  console.log(`image sans tronçon (temps + confort) : ${t0.toFixed(0)} ms`);
  for (const k of [1, 10]) {
    const [tp, { P: Q }] = ms(() => C.ajouterTroncons(P, scenario(k)));
    const [tg, Gq] = ms(() => ({ tout: C.construireGraphe(Q, "tout"), confort: C.construireGraphe(Q, "confort") }));
    const [ti] = ms(() => { image(P, G); image(Q, Gq); });
    console.log(`${k} tronçon(s) : P′ ${tp.toFixed(0)} ms, graphes ${tg.toFixed(0)} ms, image avant + après ${ti.toFixed(0)} ms`);
  }
})();
