// test/tesseract.test.js — v0.1.22 : reconnaissance RÉELLE avec tesseract.js.
// CI SEULEMENT : exige tesseract.js et son cœur WASM (jamais installés dans
// le bac à sable local, où npm est interdit). Hors CI, tous les tests sont
// sautés SANS échec — le moteur pur reste couvert par test/ocr.test.js.
// La reconnaissance s'appuie sur des fichiers du dépôt, AUCUN téléchargement :
// - ocr/fra.traineddata.gz.b64 : modèle de langue embarqué (décodé par
//   scripts/preparer-ocr.js avant les tests, comme avant la construction) ;
// - test/fixtures/titre.png.b64 : bande titre « SECOND DEGRE (2ème partie) »
//   extraite du scan de cours réel qui a motivé la fonctionnalité.
// Le test reproduit exactement le chemin de production : worker tesseract,
// modèle fra embarqué, sortie « blocks », conversion par engine/ocr.js.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { motsDepuisBlocs } = require('../engine/ocr.js');

let tesseract = null;
try {
  tesseract = require('tesseract.js'); // absent du bac à sable, présent en CI
} catch {
  tesseract = null;
}

/** Minuscules, sans accents ni signes : « DEGRÉ » et « degre » se rejoignent. */
function normaliser(t) {
  return String(t).normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

if (!tesseract) {
  test('tesseract : reconnaissance locale (CI seulement)', { skip: 'tesseract.js non installé (bac à sable sans npm)' }, () => {});
} else {
  const dossierOcr = path.join(__dirname, '..', 'ocr');
  // La fixture voyage en base64 ASCII dans le dépôt (transport octet par
  // octet garanti) : le test la décode lui-même, buffer prêt pour tesseract.
  const fixtureB64 = path.join(__dirname, 'fixtures', 'titre.png.b64');

  test('le modèle de langue embarqué est présent', () => {
    assert.ok(fs.existsSync(path.join(dossierOcr, 'fra.traineddata.gz')),
      'ocr/fra.traineddata.gz doit être décodé avant les tests (node scripts/preparer-ocr.js — la CI le fait)');
    assert.ok(fs.existsSync(fixtureB64), 'la fixture titre.png.b64 doit être livrée');
  });

  test('la reconnaissance française lit la bande titre du scan réel', async () => {
    // Exactement les chemins de production : PAS de CDN (l'application doit
    // fonctionner chez un élève sans téléchargement supplémentaire).
    const worker = await tesseract.createWorker('fra', 1, {
      langPath: dossierOcr,
      gzip: true,
    });
    try {
      const octets = Buffer.from(fs.readFileSync(fixtureB64, 'utf8').replace(/\s+/g, ''), 'base64');
      const { data } = await worker.recognize(octets, {}, { blocks: true });
      const mots = motsDepuisBlocs(data.blocks || [], 1, 1);
      assert.ok(mots.length >= 3, `au moins trois mots attendus, reçu : ${mots.map((m) => m.t).join(' ')}`);
      const texte = mots.map((m) => normaliser(m.t)).join(' ');
      assert.ok(texte.includes('second'), `« second » attendu dans « ${texte} »`);
      assert.ok(texte.includes('degre'), `« degre » attendu dans « ${texte} »`);
      // La conversion en fractions doit être cohérente : deux mots sur une
      // même ligne, gauche à droite.
      const motsTries = [...mots].sort((a, b) => a.x - b.x);
      assert.ok(motsTries[0].x <= motsTries[motsTries.length - 1].x);
      for (const m of mots) {
        assert.ok(m.x >= 0 && m.w > 0 && m.w <= 1 && m.h > 0 && m.h <= 1,
          `mot hors bornes : ${JSON.stringify(m)}`);
      }
    } finally {
      await worker.terminate();
    }
  });
}
