// v0.1.11 : la fiche « texte + formules » — pose et relecture dans un vrai PDF.
// CI SEULEMENT : exige pdf-lib et mathjax-full (jamais installés localement).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { PDFDocument } = require('pdf-lib');
const { PDFDocument: Doc } = require('pdf-lib');

const { addMixedFiche } = require('../engine/melange.js');
const { extraireSourceFiche, PREFIXE_FICHE_MIXTE } = require('../engine/texte.js');
const { listAnnots } = require('../engine/reread.js');

const SOURCE = 'Pour tout $x \\ne 2$, $\\frac{x^2+1}{x-2} = 3$ fin.';

test('addMixedFiche : pose une fiche mixte lisible et relisible', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const rep = addMixedFiche(doc, page, { rect: [100, 600, 360, 660], source: SOURCE, fontSize: 11 });
  assert.ok(rep.ref, 'une référence est retournée');
  assert.strictEqual(rep.rect[0], 100);
  assert.strictEqual(rep.rect[2], 360);
  assert.strictEqual(rep.rect[3], 660, 'le haut du rectangle reste fixe');
  assert.ok(rep.rect[1] <= 600, 'le bas ne remonte jamais');
  assert.ok(rep.rect[3] - rep.rect[1] > 22, 'la fraction étend la hauteur de la fiche');

  const annots = listAnnots(doc);
  assert.strictEqual(annots.length, 1);
  const a = annots[0];
  assert.strictEqual(a.subtype, 'Square');
  assert.ok((a.contents || '').startsWith(`${PREFIXE_FICHE_MIXTE} : `), 'le marqueur voyage dans /Contents');
  assert.strictEqual(extraireSourceFiche(a.contents), SOURCE, 'la source relue est EXACTEMENT la source saisie');
});

test('addMixedFiche : sans formule $...$, la pose est refusée sans rien écrire', async () => {
  const doc = await Doc.create();
  const page = doc.addPage([595, 842]);
  assert.throws(() => addMixedFiche(doc, page, { rect: [10, 10, 60, 60], source: 'texte ordinaire', fontSize: 11 }));
  assert.strictEqual(listAnnots(doc).length, 0);
});
