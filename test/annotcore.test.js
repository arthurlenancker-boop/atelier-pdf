// Tâche 3 : briques communes d'annotation.
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { makeForm, addAnnot, hexWinAnsi, normalizeRect } = require('../engine/annotcore.js');
const { PDFName, PDFHexString, PDFRawStream, PDFDocument } = require('pdf-lib');

async function docAvecPage() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  return { doc, page };
}

test('hexWinAnsi encode un accent en un octet latin, pas en UTF-16', () => {
  const hex = hexWinAnsi('Bibliothèque');
  assert.ok(hex instanceof PDFHexString);
  // « è » = 0xE8 : chaque caractère s'encode sur un octet WinAnsi.
  assert.ok(hex.toString().includes('e8'), 'è doit donner un octet e8');
  const decode = hex.toString();
  assert.ok(decode.startsWith('<'), 'PDFHexString rendu <…>');
});

test('normalizeRect ordonne les rectangles inversés (vigilance n° 4)', () => {
  assert.deepStrictEqual(normalizeRect([200, 700, 100, 720]), [100, 700, 200, 720]);
  assert.deepStrictEqual(normalizeRect([10, 10, 100, 50]), [10, 10, 100, 50]);
});

test('makeForm produit un Form XObject avec BBox et flux', async () => {
  const { doc } = await docAvecPage();
  const form = makeForm(doc.context, {
    bbox: [0, 0, 100, 20],
    resources: { ProcSet: ['PDF'] },
    content: '0 0 100 20 re f',
  });
  assert.ok(form instanceof PDFRawStream);
  assert.strictEqual(form.dict.get(PDFName.of('Subtype')).toString(), '/Form');
  assert.ok(Buffer.from(form.getContents()).toString('latin1').includes('re f'));
});

test('addAnnot pose un dictionnaire complet et l\'inscrit dans /Annots', async () => {
  const { doc, page } = await docAvecPage();
  const ref = addAnnot(doc, page, {
    Type: 'Annot',
    Subtype: 'Text',
    Rect: [10, 10, 28, 28],
    Name: 'Comment',
    Contents: 'Vérifier le discriminant.',
  });
  const a = doc.context.lookup(ref);
  assert.strictEqual(a.get(PDFName.of('Subtype')).toString(), '/Text');
  // Ruling de la tâche 3 : Name (chaîne hors clés texte) devient un /Name, pas une chaîne.
  assert.strictEqual(a.get(PDFName.of('Name')).toString(), '/Comment');
  assert.ok(a.get(PDFName.of('Contents')) instanceof PDFHexString, 'Contents est une chaîne PDF');
  assert.ok(a.get(PDFName.of('P')), 'la page porteuse est désignée');
  assert.strictEqual(a.get(PDFName.of('F')).asNumber(), 4, 'drapeau impression');
  const annots = page.node.Annots();
  assert.strictEqual(annots.size(), 1);
});

test('addAnnot accepte les couleurs, bordures et apparence', async () => {
  const { doc, page } = await docAvecPage();
  const formRef = doc.context.register(makeForm(doc.context, {
    bbox: [0, 0, 10, 10], resources: {}, content: '0 0 10 10 re f',
  }));
  const ref = addAnnot(doc, page, {
    Type: 'Annot',
    Subtype: 'Square',
    Rect: [5, 5, 50, 40],
    C: [1, 0, 0],
    BS: { W: 2, S: 'S' },
    AP: { N: formRef },
  });
  const a = doc.context.lookup(ref);
  assert.strictEqual(a.get(PDFName.of('BS')).lookup(PDFName.of('S')).toString(), '/S');
  assert.ok(a.get(PDFName.of('AP')), 'apparence enregistrée');
  assert.strictEqual(page.node.Annots().size(), 1);
});
