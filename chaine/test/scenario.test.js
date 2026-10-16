// Formats du scénario de tronçons simulés : Lambert 93 → WGS84, polyline encodée (lien t=), GeoJSON.
// Lancer : node --test test/scenario.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../../coeur.js");

// Projection directe Lambert 93 (IGN, notice ALG0003), écrite ici indépendamment de l'inverse testée
const L93 = { n: 0.7256077650, c: 11754255.426, xs: 700000, ys: 12655612.050, e: 0.0818191910428158, lon0: 3 };
function wgs84VersL93(lon, lat) {
  const RAD = Math.PI / 180, { n, c, xs, ys, e } = L93, phi = lat * RAD, s = Math.sin(phi);
  const L = Math.log(Math.tan(Math.PI / 4 + phi / 2) * ((1 - e * s) / (1 + e * s)) ** (e / 2));
  const R = c * Math.exp(-n * L), g = n * (lon - L93.lon0) * RAD;
  return [xs + R * Math.sin(g), ys - R * Math.cos(g)];
}

test("Lambert 93 : origine officielle (700 000, 6 600 000) = 3° E, 46,5° N", () => {
  const [lon, lat] = C.l93VersWgs84(700000, 6600000);
  assert.ok(Math.abs(lon - 3) < 1e-9, `${lon}`);
  assert.ok(Math.abs(lat - 46.5) < 1e-7, `${lat}`);
});

test("Lambert 93 : aller-retour à moins d'1 cm sur le 17 et aux bords de la France", () => {
  for (const [lon, lat] of [[-1.3063, 45.9443], [-1.1513, 46.1595], [-4.7, 48.4], [7.7, 48.6], [9.4, 42.0]]) {
    const [x, y] = wgs84VersL93(lon, lat), [lon2, lat2] = C.l93VersWgs84(x, y);
    assert.ok(C.distanceM(lon, lat, lon2, lat2) < 0.01, `${lon},${lat} → ${lon2},${lat2}`);
  }
});

test("polyline : aller-retour à 1e-5 près, plusieurs tronçons, coordonnées négatives", () => {
  const t = [[[-1.30631, 45.94432], [-1.30012, 45.95001], [-1.29, 45.951]], [[-1.15, 46.16], [-1.151, 46.159]]];
  const s = C.encoderTroncons(t);
  assert.match(s, /^[\x3f-\x7e]+(,[\x3f-\x7e]+)*$/);       // alphabet de l'algorithme + virgule séparatrice
  const r = C.decoderTroncons(s);
  assert.equal(r.length, 2);
  r.forEach((tr, i) => tr.forEach(([lon, lat], j) => {
    assert.ok(Math.abs(lon - t[i][j][0]) <= 0.5e-5 && Math.abs(lat - t[i][j][1]) <= 0.5e-5);
  }));
});

test("polyline : chaîne vide = aucun tronçon ; chaîne illisible ou tronquée = erreur", () => {
  assert.deepEqual(C.decoderTroncons(""), []);
  assert.equal(C.encoderTroncons([]), "");
  const s = C.encoderTroncons([[[-1.3, 45.9], [-1.2, 45.8]]]);
  assert.throws(() => C.decoderTroncons(s.slice(0, -1)));     // tronquée (copiée à moitié)
  assert.throws(() => C.decoderTroncons("a b"));               // espace : hors alphabet
  assert.throws(() => C.decoderTroncons(C.encoderTroncons([[[-1.3, 45.9]]])));  // un seul sommet
});

test("GeoJSON WGS84 : LineString, MultiLineString, autres géométries comptées comme ignorées", () => {
  const fc = { type: "FeatureCollection", features: [
    { type: "Feature", geometry: { type: "LineString", coordinates: [[-1.3, 45.9], [-1.29, 45.91]] } },
    { type: "Feature", geometry: { type: "MultiLineString", coordinates: [[[-1.2, 45.8], [-1.21, 45.81]], [[-1.1, 45.7], [-1.11, 45.71, 3.5]]] } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-1.3, 45.9] } },
    { type: "Feature", geometry: { type: "LineString", coordinates: [[-1.3, 45.9]] } },
    { type: "Feature", geometry: null },
  ] };
  const r = C.lireGeoJSON(fc);
  assert.equal(r.troncons.length, 3);
  assert.equal(r.ignores, 3);
  assert.deepEqual(r.troncons[2][1], [-1.11, 45.71]);           // altitude retirée
});

test("GeoJSON Lambert 93 sans champ crs (export QGIS) : détecté par l'ordre de grandeur", () => {
  const a = wgs84VersL93(-1.3063, 45.9443), b = wgs84VersL93(-1.30, 45.95);
  const r = C.lireGeoJSON({ type: "Feature", geometry: { type: "LineString", coordinates: [a, b] } });
  assert.equal(r.troncons.length, 1);
  assert.ok(C.distanceM(-1.3063, 45.9443, ...r.troncons[0][0]) < 0.01);
});

test("GeoJSON avec crs EPSG:2154 explicite", () => {
  const a = wgs84VersL93(-1.3063, 45.9443), b = wgs84VersL93(-1.30, 45.95);
  const r = C.lireGeoJSON({ type: "FeatureCollection", crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::2154" } },
    features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [a, b] } }] });
  assert.ok(C.distanceM(-1.30, 45.95, ...r.troncons[0][1]) < 0.01);
});

test("export GeoJSON : relu à l'identique, longueur en propriété", () => {
  const t = [[[-1.3, 45.9], [-1.3, 45.901]]];
  const fc = C.versGeoJSON(t);
  assert.equal(fc.type, "FeatureCollection");
  assert.deepEqual(C.lireGeoJSON(fc).troncons, t);
  assert.ok(Math.abs(fc.features[0].properties.longueur_m - 111) <= 1);
});

test("GeoJSON dans une autre projection (crs CC46, ou points hors de France) : refusé avec un message", () => {
  const ligne = c => ({ type: "Feature", geometry: { type: "LineString", coordinates: c } });
  assert.throws(() => C.lireGeoJSON({ type: "FeatureCollection", crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::3946" } },
    features: [ligne([[1380000, 5200000], [1380100, 5200100]])] }), /projection/);
  assert.throws(() => C.lireGeoJSON(ligne([[-140000, 5770000], [-140100, 5770100]])), /projection/);   // EPSG:3857 sans crs
  assert.equal(C.lireGeoJSON({ type: "FeatureCollection", crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
    features: [ligne([[-1.3, 45.9], [-1.29, 45.91]])] }).troncons.length, 1);
});
