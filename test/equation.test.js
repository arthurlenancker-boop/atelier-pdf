// Tâche 6 : l'annotation équation.
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { addEquation } = require('../engine/equation.js');
const { openPdf, savePdf } = require('../engine/pdfio.js');
const { listAnnots } = require('../engine/reread.js');
const { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } = require('pdf-lib');

test('addEquation pose un /Square invisible portant le rendu MathJax', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const { ref, rect } = addEquation(doc, page, {
    latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
    x: 100, y: 400, exPt: 4.5,
  });
  const a = doc.context.lookup(ref);
  assert.strictEqual(a.get(PDFName.of('Subtype')).toString(), '/Square');
  assert.strictEqual(a.get(PDFName.of('BS')).lookup(PDFName.of('W')).asNumber(), 0,
    'bordure invisible');
  const ap = doc.context.lookup(a.get(PDFName.of('AP')));
  const form = doc.context.lookup(ap.get(PDFName.of('N')));
  assert.ok(form instanceof PDFRawStream);
  const ops = Buffer.from(decodePDFRawStream(form).decode()).toString('latin1');
  assert.ok(/\bc\b/.test(ops), 'opérateurs vectoriels dans l\'apparence');
  assert.match(a.get(PDFName.of('Contents')).decodeText(), /Équation LaTeX/, 'le LaTeX voyage dans Contents');

  // Le rectangle colle aux dimensions rendues.
  const relu = await openPdf(await savePdf(doc));
  const annots = listAnnots(relu);
  assert.strictEqual(annots.length, 1);
  assert.ok(Math.abs(annots[0].rect[2] - annots[0].rect[0] - (rect[2] - rect[0])) < 0.01);
});

test('l\'équation posée se relit avec sa taille et son LaTeX', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  addEquation(doc, page, { latex: 'E = mc^2', x: 200, y: 300, exPt: 6 });
  const relu = await openPdf(await savePdf(doc));
  const [annot] = listAnnots(relu);
  assert.strictEqual(annot.subtype, 'Square');
  assert.ok(annot.hasAP);
  assert.match(annot.contents, /Équation LaTeX : E = mc\^2/);
  assert.ok(annot.rect[3] - annot.rect[1] > 8, 'hauteur en points');
});
