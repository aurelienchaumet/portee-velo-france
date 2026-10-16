// Compare deux tuilages d'une même zone (phase 4 : d'un bloc et par bandes) : graphes recollés (arêtes repérées
// par leurs coordonnées) et minutes par cellule depuis quelques départs.
// Usage : node test/comparer_tuilages.js <dossier A> <dossier B> [lon,lat ...]
// Écrit un résumé (et l'ajoute à $GITHUB_STEP_SUMMARY s'il existe) ; code de sortie 1 si plus de 0,1 % des
// arêtes de A manquent dans B, ou si plus de 0,1 % des cellules atteintes changent de temps. Les arêtes en plus
// dans B sont seulement comptées : par bandes, les petits morceaux isolés qui touchent un raccord sont gardés
// (d'un bloc, seule la plus grande composante l'est).
const fs = require("fs");
const path = require("path");
const C = require("../../coeur.js");

async function charger(d) {
  const index = JSON.parse(fs.readFileSync(path.join(d, "tuiles.json"), "utf8"));
  C.definirGrille(index.grille);
  const tuiles = [];
  for (const [tx, ty] of index.tuiles)
    tuiles.push(C.decoderTuile(await C.decompresserTuile(fs.readFileSync(path.join(d, `${tx}_${ty}.bin`)))));
  return C.recollerTuiles(tuiles);
}

// Arêtes orientées de la plus petite extrémité à la plus grande (sens 1 ↔ 2 si retournée)
function aretes(P) {
  const cle = v => `${Math.round(P.lon[v] * 1e5)},${Math.round(P.lat[v] * 1e5)}`;
  const s = new Set();
  for (let e = 0; e < P.m; e++) {
    let [a, b, se] = [cle(P.a[e]), cle(P.b[e]), P.sens[e]];
    if (a > b) { [a, b] = [b, a]; se = se === 1 ? 2 : se === 2 ? 1 : se; }
    s.add(`${a}>${b}|${Math.round(P.lm[e] * 10)}|${P.cls[e]}|${se}|${P.vit[e]}`);
  }
  return s;
}

(async () => {
  const [dA, dB, ...pts] = process.argv.slice(2);
  const A = await charger(dA), B = await charger(dB);
  const lignes = [`Comparaison ${path.basename(dA)} / ${path.basename(dB)}`,
    `- nœuds : ${A.n} / ${B.n} ; arêtes : ${A.m} / ${B.m} ; arêtes sans nœud au recollage : ${A.ecartees} / ${B.ecartees}`];
  let echec = false;
  {
    const sA = aretes(A), sB = aretes(B);
    let seulA = 0, seulB = 0;
    for (const k of sA) if (!sB.has(k)) seulA++;
    for (const k of sB) if (!sA.has(k)) seulB++;
    lignes.push(`- arêtes seulement dans A : ${seulA}, seulement dans B : ${seulB}`);
    if (seulA / A.m > 0.001) echec = true;
  }
  const departs = pts.length ? pts.map(p => p.split(",").map(Number)) : [];
  for (const mode of ["tout", "amenage"]) {
    for (const d of departs) {
      const minutes = P => {
        const G = C.construireGraphe(P, mode), acc = C.accrocher(P, G, ...d);
        return acc ? C.tempsGrille(P, G, C.dijkstra(G, acc.noeud, C.accesSecondes(acc.distM), 3600)) : null;
      };
      const a = minutes(A), b = minutes(B);
      if (!a || !b) { lignes.push(`- ${mode} ${d} : départ non accroché (${!!a} / ${!!b})`); continue; }
      let atteintes = 0, ecarts = 0, maxEcart = 0;
      for (let k = 0; k < a.length; k++) {
        if (Number.isNaN(a[k]) && Number.isNaN(b[k])) continue;      // hors terre dans les deux (NaN ≠ NaN)
        if (a[k] > 60 && b[k] > 60) continue;
        atteintes++;
        if (a[k] !== b[k]) { ecarts++; maxEcart = Math.max(maxEcart, Math.abs(a[k] - b[k])); }
      }
      lignes.push(`- ${mode} depuis ${d} : ${ecarts} cellules différentes sur ${atteintes} (écart max ${maxEcart.toFixed(1)} min)`);
      if (atteintes && ecarts / atteintes > 0.001) echec = true;
    }
  }
  lignes.push(echec ? "**Écarts au-delà de 0,1 %**" : "Écarts sous 0,1 %");
  console.log(lignes.join("\n"));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lignes.join("\n") + "\n\n");
  process.exit(echec ? 1 : 0);
})();
