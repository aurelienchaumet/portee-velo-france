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

// Lecture des voies (20/10/2026) : API d'OSM d'abord, Overpass en secours
const reponse = (status, corps) => ({ ok: status >= 200 && status < 300, status, json: async () => corps });
const MAP_JSON = { elements: [
  { type: "node", id: 1, lat: 45, lon: 0 }, { type: "node", id: 2, lat: 45, lon: 0.002 },
  { type: "node", id: 3, lat: 45.001, lon: 0.001 },
  { type: "way", id: 10, nodes: [1, 2], tags: { highway: "cycleway", surface: "asphalt" }, timestamp: "2026-10-18T10:00:00Z", version: 4 },
  { type: "way", id: 11, nodes: [2, 3], tags: { building: "yes" } },          // pas une voie : ignorée
  { type: "way", id: 12, nodes: [3, 99], tags: { highway: "service" } },      // nœud hors réponse : géométrie partielle
] };
const EXT = [[0.0005, 45], [0.0015, 45]];

test("voiesDeLApi : voies highway au format d'Overpass, géométrie reconstruite", () => {
  const v = C.voiesDeLApi(MAP_JSON);
  assert.deepEqual(v.map(x => x.id), [10, 12]);
  assert.deepEqual(v[0].geometry, [{ lat: 45, lon: 0 }, { lat: 45, lon: 0.002 }]);
  assert.equal(v[0].timestamp, "2026-10-18T10:00:00Z");
  assert.equal(v[1].geometry.length, 1);
  assert.equal(C.choisirVoie(v, EXT).id, 10);
  assert.deepEqual(C.voiesDeLApi({}), []);
});

test("boiteAutour : englobe les extrémités avec ~25 m de marge", () => {
  const [o, s, e, n] = C.boiteAutour(EXT).split(",").map(Number);
  assert.ok(o < 0.0005 && e > 0.0015 && s < 45 && n > 45);
  assert.ok(Math.abs((n - 45) * 111195 - 25) < 0.5);
  assert.ok(C.urlApi(EXT).startsWith("https://api.openstreetmap.org/api/0.6/map.json?bbox="));
});

test("lireVoies : API d'OSM d'abord, Overpass seulement si elle échoue", async () => {
  const appels = [];
  const ok = await C.lireVoies(EXT, null, async url => { appels.push(url); return reponse(200, MAP_JSON); });
  assert.equal(ok.source, "api");
  assert.equal(appels.length, 1);
  assert.equal(ok.elements[0].id, 10);

  const vus = [];
  const secours = await C.lireVoies(EXT, null, async url => {
    vus.push(url);
    if (url.startsWith(C.API_OSM)) return reponse(503, {});
    if (url === C.OVERPASS[0]) throw new Error("réseau");
    return reponse(200, { elements: [{ type: "way", id: 5, geometry: [] }] });
  });
  assert.equal(secours.source, "overpass");
  assert.deepEqual(vus, [vus[0], C.OVERPASS[0], C.OVERPASS[1]]);
  assert.equal(secours.elements[0].id, 5);
});

test("lireVoies : tout échoue → erreur, avec « trop de demandes » si un service l'a dit", async () => {
  await assert.rejects(C.lireVoies(EXT, null, async url => reponse(url.startsWith(C.API_OSM) ? 509 : 504, {})), e => e.tropDeDemandes === true);
  await assert.rejects(C.lireVoies(EXT, null, async () => reponse(504, {})), e => e.tropDeDemandes === false);
});

test("lireVoies : un abandon de la page s'arrête aussitôt", async () => {
  const ctrl = new AbortController();
  const p = C.lireVoies(EXT, ctrl.signal, (url, { signal }) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(Object.assign(new Error("abort"), { name: "AbortError" })))));
  ctrl.abort();
  await assert.rejects(p, e => e.name === "AbortError");
});
