// Tâche 7 : relecture des annotations.
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { listAnnots } = require('../engine/reread.js');
const { openPdf, savePdf } = require('../engine/pdfio.js');
const { addHighlight, addSquare, addInk, addTextNote, addFreeText } = require('../engine/annots.js');
const { addEquation } = require('../engine/equation.js');
const { PDFDocument, PDFName } = require('pdf-lib');

async function docAnnoteDeuxPages() {
  const doc = await PDFDocument.create();
  const p1 = doc.addPage([595.28, 841.89]);
  const p2 = doc.addPage([595.28, 841.89]);

  addHighlight(doc, p1, { rect: [58, 712, 486, 730], quadPoints: [[60, 728, 484, 728, 60, 714, 484, 714]] });
  addSquare(doc, p1, { rect: [52, 620, 300, 690] });
  addTextNote(doc, p1, { rect: [500, 770, 518, 788], contents: 'Relire le paragraphe 2.' });
  addEquation(doc, p2, { latex: '\\Delta = b^2 - 4ac', x: 100, y: 500 });
  return openPdf(await savePdf(doc));
}

test('listAnnots décrit chaque annotation : page, sous-type, rect, AP, contenu', async () => {
  const relu = await docAnnoteDeuxPages();
  const annots = listAnnots(relu);
  assert.strictEqual(annots.length, 4);
  assert.ok(annots.every((a) => Number.isFinite(a.rect[0]) && a.rect.length === 4));
  const parPage = annots.filter((a) => a.page === 0);
  assert.deepStrictEqual(parPage.map((a) => a.subtype).sort(), ['Highlight', 'Square', 'Text']);
  const note = annots.find((a) => a.subtype === 'Text');
  assert.match(note.contents, /Relire le paragraphe 2\./);
  assert.ok(annots.every((a) => a.hasAP), 'nos annotations portent toutes une apparence');
});

test('une annotation sans /AP (annotation d\'autre logiciel) est tolérée (vigilance n° 5)', async () => {
  const relu = await docAnnoteDeuxPages();
  // Simule une annotation étrangère incomplète : sous-type inconnu, pas d'AP.
  const page = relu.getPage(0);
  const brut = relu.context.obj({
    Type: 'Annot',
    Subtype: 'Stamp',
    Rect: [10, 10, 60, 60],
  });
  const ref = relu.context.register(brut);
  const annots = page.node.Annots();
  annots.push(ref);

  const liste = listAnnots(relu); // ne doit rien lever
  assert.strictEqual(liste.length, 5);
  const etrangere = liste.find((a) => a.subtype === 'Stamp');
  assert.ok(etrangere);
  assert.strictEqual(etrangere.hasAP, false);
  assert.deepStrictEqual(etrangere.rect, [10, 10, 60, 60]);
});

test('le document multi-page est parcouru entièrement', async () => {
  const relu = await docAnnoteDeuxPages();
  const annots = listAnnots(relu);
  assert.ok(annots.some((a) => a.page === 0), 'page 1 parcourue');
  assert.ok(annots.some((a) => a.page === 1), 'page 2 parcourue');
  // Deux /Square existent (le cadre de la page 1 et l'équation) : on distingue
  // l'équation par son Contents, pas par son sous-type.
  const equation = annots.find((a) => (a.contents || '').includes('Équation LaTeX'));
  assert.ok(equation, 'l\'équation est trouvée');
  assert.strictEqual(equation.page, 1);
  assert.match(equation.contents, /b\^2 - 4ac/);
});
