// voieAuClic : « aménager une voie en un clic » (12/10/2026).
// Lancer : node --test test/voie.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../../coeur.js");

// Route est-ouest 0-1-2-3-4 (nœuds tous les 0,001°) ; carrefour en 3 (rue 3-5 vers le nord) ; piste 1-6 qui ne coupe
// pas la route ; une piste 7-8 loin de tout.
function monde() {
  const lon = Float64Array.from([0, 0.001, 0.002, 0.003, 0.004, 0.003, 0.001, 0.05, 0.051]);
  const lat = Float64Array.from([1, 1, 1, 1, 1, 1.001, 1.001, 1, 1]);
  const a = Int32Array.from([0, 1, 2, 3, 3, 1, 7]), b = Int32Array.from([1, 2, 3, 4, 5, 6, 8]);
  const cls = Uint8Array.from([7, 7, 7, 7, 2, 0, 0]);
  return { n: 9, m: 7, lon, lat, a, b, cls };
}

test("le clic suit la route jusqu'au carrefour, la piste ne coupe pas", () => {
  const t = C.voieAuClic(monde(), 0.0015, 1.00005, 30);
  assert.deepEqual(t.map(([x]) => x), [0, 0.001, 0.002, 0.003]);
});
test("de l'autre côté du carrefour : un seul segment", () => {
  assert.deepEqual(C.voieAuClic(monde(), 0.0035, 1, 30).map(([x]) => x), [0.003, 0.004]);
});
test("une piste n'est pas proposée, rien à moins de maxM : null", () => {
  assert.equal(C.voieAuClic(monde(), 0.0505, 1, 30), null);
  assert.equal(C.voieAuClic(monde(), 0.002, 1.01, 30), null);
});

test("voies : découpage aux carrefours, pistes hors voies", () => {
  const P = monde(), { voie, liste } = C.voies(P);
  assert.equal(voie[0], voie[1]); assert.equal(voie[1], voie[2]);       // 0-1-2-3 : une voie (la piste en 1 ne coupe pas)
  assert.notEqual(voie[3], voie[2]); assert.notEqual(voie[4], voie[3]); // 3-4 et 3-5 : chacune la sienne
  assert.equal(voie[5], -1); assert.equal(voie[6], -1);                  // pistes
  const l = liste[voie[0]];
  assert.deepEqual(l[0] === 0 ? l : [...l].reverse(), [0, 1, 2, 3]);
  assert.equal(liste.length, 3);
});
