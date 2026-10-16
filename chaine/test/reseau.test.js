// lignesReseau : arêtes d'une classe regroupées en lignes continues (une ligne par enchaînement de nœuds de degré 2)
const test = require("node:test");
const assert = require("node:assert");
const C = require("../../coeur.js");

// Piste 0-1-2-3 avec une branche 2-4, une boucle fermée 5-6-7-5, et une route (classe 2) 3-8 ignorée
const P = {
  n: 9, m: 8,
  a: Int32Array.from([0, 1, 2, 2, 5, 6, 7, 3]), b: Int32Array.from([1, 2, 3, 4, 6, 7, 5, 8]),
  cls: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 2]),
  lat: Float64Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8]), lon: new Float64Array(9),
};

test("chaîne coupée au carrefour, boucle gardée, autre classe ignorée", () => {
  const lignes = C.lignesReseau(P, 0);
  // 0-1-2 (s'arrête au carrefour 2, degré 3), 2-3, 2-4, et la boucle 5-6-7-5
  assert.strictEqual(lignes.length, 4);
  const points = lignes.reduce((s, l) => s + l.length - 1, 0);
  assert.strictEqual(points, 7, "chaque arête de classe 0 tracée une seule fois");
  assert.ok(lignes.some(l => l.length === 3 && l[0][0] === 0 && l[2][0] === 2), "0-1-2 en une seule ligne");
  assert.ok(lignes.some(l => l.length === 4 && l[0][0] === l[3][0]), "boucle fermée en une ligne");
  assert.deepStrictEqual(C.lignesReseau(P, 1), [], "aucune bande");
});
