// Test aller-retour du format de tuile v1 : format_tuile.py encode, coeur.js décode.
// Fixture : test/fabriquer_fixture.py (données réelles d'Oléron + cas limites). Lancer : node --test test/
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { decompresserTuile, decoderTuile } = require("../coeur.js");

const FIX = path.join(__dirname, "fixtures");

test("aller-retour : chaque champ décodé égale la valeur encodée", async () => {
  const octets = await decompresserTuile(fs.readFileSync(path.join(FIX, "tuile.bin")));
  const t = decoderTuile(octets);
  const attendu = JSON.parse(fs.readFileSync(path.join(FIX, "tuile.json"), "utf8"));
  for (const [cle, valeur] of Object.entries(attendu)) {
    const obtenu = ArrayBuffer.isView(t[cle]) ? Array.from(t[cle]) : t[cle];
    assert.deepEqual(obtenu, valeur, `champ ${cle}`);
  }
});

test("cas limites de la fixture : b hors tuile, plafonds, absence de nœud", async () => {
  const t = decoderTuile(await decompresserTuile(fs.readFileSync(path.join(FIX, "tuile.bin"))));
  assert.ok(Array.from(t.b).includes(t.base - 123456), "b dans une tuile précédente");
  assert.ok(Array.from(t.l).includes(65535), "longueur au plafond Uint16");
  assert.equal(t.distTout[0], 2550, "distance plafonnée à 255 pas de 10 m");
  assert.equal(t.proTout[1], -1, "cellule sans nœud");
  assert.equal(t.tx, -3);
});

test("rejette une tuile corrompue au lieu de renvoyer des valeurs fausses", async () => {
  const octets = await decompresserTuile(fs.readFileSync(path.join(FIX, "tuile.bin")));
  assert.throws(() => decoderTuile(octets.slice(0, octets.length - 10)), /tronquée|octets/);
  const faux = octets.slice(); faux[0] = 0;
  assert.throws(() => decoderTuile(faux), /PVT1/);
});
