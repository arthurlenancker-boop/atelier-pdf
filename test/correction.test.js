// v0.1.29 : la correction d'un bloc reconnu — pose et relecture dans un vrai
// PDF. CI SEULEMENT : exige pdf-lib et mathjax-full (jamais installés
// localement).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { PDFDocument } = require('pdf-lib');

const { addCorrection } = require('../engine/correction.js');
const { createSession } = require('../engine/session.js');
const {
  PREFIXE_CORRECTION, extraireSourceCorrection, extraireTailleCorrection,
} = require('../engine/texte.js');
const { listAnnots } = require('../engine/reread.js');

const SOURCE_TEXTE = 'Il s\'agit de résoudre dans R';
const SOURCE_TEXTE2 = 'l\'équation ax\u00b2 + bx + c = 0.';
const SOURCE_AVEC_FORMULE = 'Pour tout $x \\ne 2$ : $\\frac{x^2+1}{x-2} = 3$ conclure.';

test('addCorrection : pose une correction de texte SANS formule (le cas ordinaire)', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const rect = [80, 700, 420, 722];
  const rep = await addCorrection(doc, page, { rect: rect.slice(), source: SOURCE_TEXTE, fontSize: 12 });
  assert.ok(rep.ref, 'une référence est retournée');
  assert.strictEqual(rep.rect[2], 420);
  assert.strictEqual(rep.rect[3], 722, 'le haut du rectangle reste fixé sur le sommet du bloc');
  assert.ok(rep.rect[1] <= 700, 'le bas ne remonte jamais');

  const annots = listAnnots(doc);
  assert.strictEqual(annots.length, 1);
  const a = annots[0];
  assert.strictEqual(a.subtype, 'Square');
  assert.strictEqual(a.subject, 'Correction', 'le /Subject distingue la correction à l\'écran');
  assert.ok((a.contents || '').startsWith(`${PREFIXE_CORRECTION} 12 : `), 'le marqueur (avec taille) voyage dans /Contents');
  assert.strictEqual(extraireSourceCorrection(a.contents), SOURCE_TEXTE, 'la source relue est EXACTEMENT la source saisie');
  assert.strictEqual(extraireTailleCorrection(a.contents), 12, 'la taille du corps voyage dans le marqueur');

  // Le masque blanc opaque : l'apparence enregistrée commence par le repeint
  // du rectangle en blanc, AVANT toute écriture de texte.
  const octets = Buffer.from(await doc.save());
  assert.ok(octets.includes('1 1 1 rg'), 'le masque blanc est écrit dans le fichier');
  assert.ok(/ re f/.test(octets.toString('latin1')), 'le rectangle du masque est rempli');
  assert.ok(!a.contents.includes('$'), 'la correction sans formule ne comporte pas de $');
});

test('addCorrection : les formules $...$ se composent comme dans une fiche mixte', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const rep = await addCorrection(doc, page, {
    rect: [100, 600, 360, 660],
    source: SOURCE_AVEC_FORMULE,
    fontSize: 11,
  });
  assert.ok(rep.ref, 'la correction avec formules est posée');
  assert.ok(rep.rect[3] - rep.rect[1] > 22, 'la fraction étend la hauteur du rectangle');
  const a = listAnnots(doc)[0];
  assert.strictEqual(extraireSourceCorrection(a.contents), SOURCE_AVEC_FORMULE,
    'la source (avec les $formules$) est relue EXACTEMENT');
});

test('addCorrection : une source vide est refusée sans rien écrire', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  await assert.rejects(() => addCorrection(doc, page, { rect: [10, 10, 60, 60], source: '   ', fontSize: 11 }));
  assert.strictEqual(listAnnots(doc).length, 0, 'aucune annotation n\'est posée');
});

test('la session attend la pose asynchrone et ne journalise que la réussite', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  const session = createSession(doc);
  const rep = await session.apply({
    kind: 'correction', pageIndex: 0,
    args: { rect: [100, 700, 300, 722], source: SOURCE_TEXTE2, fontSize: 10 },
  });
  assert.ok(rep.ref, 'la correction posée est désignée par sa référence');
  assert.strictEqual(session.edits().length, 1, 'une seule modification journalisée');
  assert.strictEqual(session.listAnnots().length, 1);
  await assert.rejects(() => session.apply({
    kind: 'correction', pageIndex: 0,
    args: { rect: [10, 10, 60, 60], source: '  ', fontSize: 10 },
  }));
  assert.strictEqual(session.edits().length, 1, 'un refus n\'entre pas au journal');
});

test('relecture du marqueur : taille décimale et l\'ancien format sans taille', () => {
  assert.strictEqual(extraireTailleCorrection('Correction OCR 12,5 : texte'), 12.5,
    'la virgule décimale est acceptée (clavier français)');
  assert.strictEqual(extraireTailleCorrection('Correction OCR : texte'), null,
    'sans taille embarquée, null (l\'écran retombe sur son estimation)');
  assert.strictEqual(extraireSourceCorrection('Correction OCR 12,5 : a $b$ c'), 'a $b$ c');
  assert.strictEqual(extraireSourceCorrection('Fiche mixte 11 : pas une correction'),
    '', 'le marqueur de fiche n\'est pas confondu avec celui de correction');
});
