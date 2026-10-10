// Scores des 96 départements : surface de terre (km²) atteinte à vélo en 15 min depuis la mairie du
// chef-lieu, en mode « pistes + routes » et « pistes et bandes ». Même code que la page (coeur.js), mêmes
// tuiles : le survol arrêté sur une mairie affiche exactement ces chiffres (critère de cohérence du design).
//
// Usage (depuis france/, après chefs_lieux.py et tuiler.py) : node scores.js  → tuiles/france.json
const fs = require("fs");
const path = require("path");
const C = require("./coeur.js");

const DOSSIER = path.join(__dirname, "tuiles");
const MINUTES = 15;
// Fenêtre 3 × 3 tuiles : 15 min à 20 km/h = 5 km (+ 2 km d'accès au plus), sous la marge garantie de 10 km
const RAYON_TUILES = 1;

async function main() {
  const index = JSON.parse(fs.readFileSync(path.join(DOSSIER, "tuiles.json"), "utf8"));
  const chefs = JSON.parse(fs.readFileSync(path.join(__dirname, "chefs_lieux.json"), "utf8"));
  const chargeur = new C.ChargeurTuiles({ index, rayon: RAYON_TUILES, capacite: 20,
    lire: (tx, ty) => fs.readFileSync(path.join(DOSSIER, `${tx}_${ty}.bin`)) });
  const departements = [];
  for (const c of chefs) {
    const f = await chargeur.fenetre(c.lon, c.lat);
    const ligne = { dep: c.dep, departement: c.departement, commune: c.commune, lon: c.lon, lat: c.lat, choix: c.choix };
    for (const mode of ["tout", "amenage"]) {
      const G = C.construireGraphe(f.P, mode);
      const acc = C.accrocher(f.P, G, c.lon, c.lat);
      if (!acc) { ligne[mode] = { km2: 0, accesM: null }; continue; }   // aucune voie du mode à portée d'accès
      const res = C.dijkstra(G, acc.noeud, C.accesSecondes(acc.distM), MINUTES * 60);
      const [km2] = C.surfaceKm2(f.P, C.tempsGrille(f.P, G, res), [MINUTES]);
      ligne[mode] = { km2: Math.round(km2 * 10) / 10, accesM: Math.round(acc.distM) };
    }
    if (f.partielle) ligne.partielle = f.manquantes;
    departements.push(ligne);
    console.log(`${c.dep.padStart(3)} ${c.commune.padEnd(26)} ${String(ligne.tout.km2).padStart(6)} km² | pistes ${String(ligne.amenage.km2).padStart(5)} km²`);
  }
  const sortie = { minutes: MINUTES, genere: new Date().toISOString().slice(0, 16), tuiles: index.genere, sources: index.sources, departements };
  fs.writeFileSync(path.join(DOSSIER, "france.json"), JSON.stringify(sortie));
  const tri = [...departements].sort((a, b) => b.tout.km2 - a.tout.km2);
  console.log(`\nÉcrit : tuiles/france.json (${departements.length} départements)`);
  console.log("Tête :", tri.slice(0, 5).map(d => `${d.commune} ${d.tout.km2}`).join(", "));
  console.log("Queue :", tri.slice(-5).map(d => `${d.commune} ${d.tout.km2}`).join(", "));
}

main();
