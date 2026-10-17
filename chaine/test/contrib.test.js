// osm-contrib.js : lecture des tags (miroir de classer_fin, pour l'explication), choix de la voie OSM, liens.
// Lancer : node --test test/contrib.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../../osm-contrib.js");

// Cas fixés d'après classer_fin() (chaine/tuiler.py) : [tags, classe, vitesse, sens] ou [tags, null]
// (comparés à Python par test/contrib_classer.py)
const CAS = require("./fixtures/contrib_cas.json");

test("lireTags donne la même classe, la même vitesse et le même sens que classer_fin()", () => {
  for (const [tags, attendu] of CAS) {
    const r = C.lireTags(tags);
    if (attendu === null) assert.ok(r.ecartee, `écartée attendue : ${JSON.stringify(tags)}`);
    else assert.deepEqual([r.classe, r.vitesse, r.sens], attendu, JSON.stringify(tags));
  }
});

test("indices : surface absente, route sans aménagement, trottoir sans vélo, sens unique", () => {
  const tagsDe = t => C.lireTags(t).indices.map(i => i.tag);
  assert.ok(tagsDe({ highway: "cycleway" }).includes("surface"));
  assert.ok(!tagsDe({ highway: "cycleway", surface: "asphalt" }).includes("surface"));
  assert.ok(tagsDe({ highway: "secondary", surface: "asphalt" }).includes("cycleway"));
  assert.ok(!tagsDe({ highway: "secondary", surface: "asphalt", "cycleway:right": "lane" }).includes("cycleway"));
  assert.ok(tagsDe({ highway: "footway" }).includes("bicycle"));
  assert.ok(tagsDe({ highway: "residential", oneway: "yes", surface: "asphalt" }).includes("oneway:bicycle"));
  assert.ok(!tagsDe({ highway: "residential", oneway: "yes", "oneway:bicycle": "no", surface: "asphalt" }).includes("oneway:bicycle"));
});

test("choisirVoie : la voie qui porte l'arête, pas la rue qui la croise à une extrémité", () => {
  const route = { type: "way", id: 1, geometry: [{ lon: 0, lat: 45 }, { lon: 0.002, lat: 45 }] };
  const rue = { type: "way", id: 2, geometry: [{ lon: 0.002, lat: 44.999 }, { lon: 0.002, lat: 45.001 }] };
  assert.equal(C.choisirVoie([rue, route], [[0.001, 45], [0.002, 45]]).id, 1);
  assert.equal(C.choisirVoie([rue], [[0.0, 45], [0.0005, 45]]), null);   // trop loin
  assert.equal(C.choisirVoie([], [[0, 45], [0.001, 45]]), null);
});

test("liens iD, note et date des données", () => {
  assert.equal(C.lienId({ lat: 46.16, lon: -1.15, way: 42 }),
    "https://www.openstreetmap.org/edit?editor=id&way=42#map=19/46.160000/-1.150000&hashtags=porteevelo");
  assert.equal(C.lienNote(46.16, -1.15), "https://www.openstreetmap.org/note/new#map=19/46.160000/-1.150000");
  assert.ok(C.modifieeDepuis("2026-10-17T08:00:00Z", "2026-10-16 22:15"));
  assert.ok(!C.modifieeDepuis("2026-10-01T08:00:00Z", "2026-10-16 22:15"));
  assert.match(C.texteNote({ voie: { id: 7, tags: { name: "Rue Haute" } }, carte: "Route ou chemin partagé, 20 km/h" }), /Voie 7 \(Rue Haute\).*#porteevelo/);
});
