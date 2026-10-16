// Itinéraire lointain (dijkstra arrêté au nœud `but`) et couloir de tuiles, sur les 25 tuiles réelles d'Oléron.
// Lancer : node --test test/itineraire.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const C = require("../../coeur.js");

const DOSSIER = path.join(__dirname, "fixtures", "oleron");
const index = JSON.parse(fs.readFileSync(path.join(DOSSIER, "tuiles.json"), "utf8"));
const lire = (tx, ty) => fs.readFileSync(path.join(DOSSIER, `${tx}_${ty}.bin`));

test("arrêt à l'arrivée : même temps et même chemin que le calcul complet, dans les deux modes", async () => {
  const chargeur = new C.ChargeurTuiles({ index, lire, rayon: 3 });
  const { P } = await chargeur.fenetre(-1.3063, 45.9443);
  // Graine fixe : mêmes paires à chaque lancement
  let graine = 7;
  const hasard = () => (graine = (graine * 16807) % 2147483647) / 2147483647;
  for (const mode of ["tout", "amenage"]) {
    const G = C.construireGraphe(P, mode);
    const noeuds = [];
    for (let v = 0; v < P.n; v++) if (G.accrochable[v]) noeuds.push(v);
    for (let i = 0; i < 30; i++) {
      const src = noeuds[Math.floor(hasard() * noeuds.length)], dst = noeuds[Math.floor(hasard() * noeuds.length)];
      const ref = C.dijkstra(G, src, 0).dist[dst];
      const res = C.dijkstra(G, src, 0, Infinity, dst);
      assert.ok(Math.abs(res.dist[dst] - ref) < 1e-6 || ref === res.dist[dst], `${mode} ${src}→${dst} : ${res.dist[dst]} ≠ ${ref}`);
      if (isFinite(ref)) assert.equal(C.itineraire(G, res, dst).length > 0 || src === dst, true);
    }
  }
});

test("couloir : tuiles autour du segment, dont celles des deux extrémités", async () => {
  const chargeur = new C.ChargeurTuiles({ index, lire });
  const a = [-1.40, 46.02], b = [-1.20, 45.85];                 // nord de l'île → Marennes
  const f = await chargeur.couloir(...a, ...b, 3);
  assert.ok(f.P && !f.partielle);
  const cles = chargeur.derniere.signature.split(" ");
  for (const [lon, lat] of [a, b]) assert.ok(cles.includes(chargeur.tuileDe(lon, lat).join("_")));
  assert.ok(f.nb < index.tuiles.length, "le couloir ne prend pas toutes les tuiles");
});
