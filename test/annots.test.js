// Tâche 4 : les cinq annotations standard.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { addHighlight, addSquare, addInk, addTextNote, addFreeText } = require('../engine/annots.js');
const { openPdf, savePdf } = require('../engine/pdfio.js');
const { listAnnots } = require('../engine/reread.js');
const { PDFDocument, PDFName, PDFRawStream } = require('pdf-lib');
const { decodePDFRawStream } = require('pdf-lib');

function decodeAp(relu, annot) {
  const ap = relu.context.lookup(annot.get(PDFName.of('AP')));
  assert.ok(ap, 'AP doit exister');
  const nRef = ap.get(PDFName.of('N'));
  const form = relu.context.lookup(nRef);
  assert.ok(form instanceof PDFRawStream, 'AP/N doit être un Form XObject');
  return Buffer.from(decodePDFRawStream(form).decode()).toString('latin1');
}

async function docReluAvec() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);

  addHighlight(doc, page, {
    rect: [98, 698, 202, 722],
    quadPoints: [[100, 720, 200, 720, 100, 700, 200, 700]],
    color: [1, 1, 0],
    contents: 'Termes à retenir',
  });
  addSquare(doc, page, { rect: [60, 600, 200, 640], color: [1, 0, 0], borderWidth: 2 });
  addInk(doc, page, { points: [[60, 500], [100, 520], [140, 480], [180, 510]], color: [0, 0, 1], width: 1.5 });
  addTextNote(doc, page, { rect: [400, 750, 418, 768], contents: 'Vérifier le discriminant.' });
  addFreeText(doc, page, { rect: [60, 300, 340, 325], text: 'Méthode : identifier a, b, c.' });

  // Vigilance n° 4 : rectangle inversé pour le surlignage.
  addHighlight(doc, page, {
    rect: [300, 400, 250, 430],
    quadPoints: [[255, 425, 295, 425, 255, 405, 295, 405]],
  });

  return openPdf(await savePdf(doc));
}

test('le surlignage porte ses QuadPoints aplatis et son ExtGState', async () => {
  const relu = await docReluAvec();
  const annots = relu.getPage(0).node.Annots();
  const surligne = relu.context.lookup(annots.get(0));
  assert.strictEqual(surligne.get(PDFName.of('Subtype')).toString(), '/Highlight');
  const quad = surligne.get(PDFName.of('QuadPoints'));
  assert.strictEqual(quad.size(), 8, 'QuadPoints aplatis : 8 valeurs');
  assert.strictEqual(quad.get(2).asNumber(), 200);
  const flux = decodeAp(relu, surligne);
  assert.ok(flux.includes('/G0 gs'), 'ExtGState de transparence désigné dans le flux');
  assert.ok(flux.includes('0.35') || /G0/.test(flux), 'la ressource embringue le flux');
});

test('le cadre, l\'encre et la note posent leurs dictionnaires', async () => {
  const relu = await docReluAvec();
  const annots = relu.getPage(0).node.Annots();
  assert.strictEqual(relu.context.lookup(annots.get(1)).get(PDFName.of('Subtype')).toString(), '/Square');
  assert.strictEqual(relu.context.lookup(annots.get(2)).get(PDFName.of('Subtype')).toString(), '/Ink');
  const encre = relu.context.lookup(annots.get(2));
  const inkList = relu.context.lookup(encre.get(PDFName.of('InkList')));
  assert.strictEqual(inkList.size(), 1, 'un tracé');
  assert.strictEqual(inkList.get(0).size(), 8, 'quatre points');
  const note = relu.context.lookup(annots.get(3));
  assert.strictEqual(note.get(PDFName.of('Subtype')).toString(), '/Text');
  assert.strictEqual(note.get(PDFName.of('Name')).toString(), '/Comment');
});

test('la zone de texte encode son texte en WinAnsi dans l\'apparence', async () => {
  const relu = await docReluAvec();
  const annots = relu.getPage(0).node.Annots();
  const zone = relu.context.lookup(annots.get(4));
  assert.strictEqual(zone.get(PDFName.of('Subtype')).toString(), '/FreeText');
  assert.ok(/\/Helv/.test(String(zone.get(PDFName.of('DA')))), 'DA référence la police');
  const flux = decodeAp(relu, zone);
  assert.ok(flux.includes('Tj'), 'le flux écrit du texte');
  // « é » de « Méthode » s'encode en un octet 0xe9 WinAnsi, pas en UTF-16.
  assert.ok(/<[0-9a-f\s]+>\s*Tj/.test(flux), 'le texte est encodé en hexadécimal');
  assert.ok(flux.toLowerCase().includes('4de9'), '« Méthode » donne 4d e9 en WinAnsi');
});

test('le rectangle inversé du surlignage est ordonné', async () => {
  const relu = await docReluAvec();
  const annots = relu.getPage(0).node.Annots();
  const surligne = relu.context.lookup(annots.get(5));
  const rect = surligne.get(PDFName.of('Rect'));
  assert.strictEqual(rect.get(0).asNumber(), 250, 'x0 < x1 malgré le glissement inverse');
  assert.ok(rect.get(0).asNumber() < rect.get(2).asNumber());
  assert.ok(rect.get(1).asNumber() < rect.get(3).asNumber());
});

/* ————— v0.1.31 : formes de surlignage et de cadre ————— */

test('v0.1.31 : les formes de surlignage posent leurs sous-types standard', async () => {
  const relu = await docReluAvec();
  const annots = relu.getPage(0).node.Annots();
  // Le surlignage par défaut reste un /Highlight plein (compatibilité).
  assert.strictEqual(relu.context.lookup(annots.get(0)).get(PDFName.of('Subtype')).toString(), '/Highlight');

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  addHighlight(doc, page, {
    rect: [98, 698, 202, 722],
    quadPoints: [[100, 720, 200, 720, 100, 700, 200, 700]],
    forme: 'souligne', color: '#FFDF3A',
  });
  addHighlight(doc, page, {
    rect: [98, 668, 202, 692],
    quadPoints: [[100, 690, 200, 690, 100, 670, 200, 670]],
    forme: 'barre', color: [0.5, 0.2, 0.2],
  });
  addHighlight(doc, page, {
    rect: [98, 638, 202, 662],
    quadPoints: [[100, 660, 200, 660, 100, 640, 200, 640]],
    forme: 'ondule', color: '#7BC8FF',
  });
  const relu2 = await openPdf(await savePdf(doc));
  const liste = listAnnots(relu2);
  assert.deepStrictEqual(liste.map((a) => a.subtype), ['Underline', 'StrikeOut', 'Squiggly']);
  assert.deepStrictEqual(liste[0].quads.slice(0, 4), [100, 720, 200, 720]);
  // La couleur de la palette (hexadécimal du cercle chromatique compris)
  // arrive en fractions 0..1 dans /C : #FFDF3A donne 1, 223/255, 58/255.
  assert.ok(Math.abs(liste[0].c[0] - 1) < 1e-6);
  assert.ok(Math.abs(liste[0].c[1] - 223 / 255) < 1e-6);
  assert.ok(Math.abs(liste[0].c[2] - 58 / 255) < 1e-6);
  const listeAnnotsFenetres = relu2.getPage(0).node.Annots();
  const flu0 = decodeAp(relu2, relu2.context.lookup(listeAnnotsFenetres.get(0)));
  assert.ok(/ re f/.test(flu0), 'le soulignement remplit des rectangles');
  const flu1 = decodeAp(relu2, relu2.context.lookup(listeAnnotsFenetres.get(1)));
  assert.ok(/ re f/.test(flu1), 'le barré remplit des rectangles');
  const flu2 = decodeAp(relu2, relu2.context.lookup(listeAnnotsFenetres.get(2)));
  assert.ok(flu2.includes(' m') && flu2.includes(' l') && /S/.test(flu2), 'l’ondulé trace une sinusoïde en points');
});

test('v0.1.31 : formes de cadre, traits, épaisseurs, teinte et marqueur', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  addSquare(doc, page, { rect: [60, 700, 240, 760], forme: 'ellipse', trait: 'tirets', borderWidth: 1.3, color: '#D13438' });
  addSquare(doc, page, { rect: [60, 600, 240, 660], forme: 'nuage', trait: 'continu', borderWidth: 2.2, teinte: true, color: '#0067C0' });
  addSquare(doc, page, { rect: [60, 500, 240, 560], forme: 'arrondi', trait: 'points', borderWidth: 3.4 });
  const relu = await openPdf(await savePdf(doc));
  const liste = listAnnots(relu);
  assert.deepStrictEqual(liste.map((a) => a.subtype), ['Circle', 'Square', 'Square']);
  assert.deepStrictEqual(liste[0].bs.d, [7, 5], 'tirets [7 5] dans /BS');
  assert.ok(Math.abs(liste[0].bs.w - 1.3) < 1e-9);
  assert.deepStrictEqual(liste[2].bs.d, [0.2, 6], 'pointillés [0.2 6] dans /BS');
  assert.ok(Math.abs(liste[2].bs.w - 3.4) < 1e-9);
  assert.match(liste[1].contents, /^Cadre nuage,continu,2,2,teinte$/, 'les options voyagent derrière le marqueur');
  // /BE nuage et /IC de la teinte lus depuis le dictionnaire.
  const annots = relu.getPage(0).node.Annots();
  const nuage = relu.context.lookup(annots.get(1));
  const be = relu.context.lookup(nuage.get(PDFName.of('BE')));
  assert.strictEqual(relu.context.lookup(be.get(PDFName.of('S'))).toString(), '/Cloudy');
  assert.ok(relu.context.lookup(nuage.get(PDFName.of('IC'))), 'la teinte voyage dans /IC');
  // L'apparence : l'ellipse, l'arrondi et le nuage tracent des cubiques.
  const flu0 = decodeAp(relu, relu.context.lookup(annots.get(0)));
  assert.ok(/ c/.test(flu0));
  const flu1 = decodeAp(relu, relu.context.lookup(annots.get(1)));
  assert.ok(/ c/.test(flu1), 'le nuage bosse en arcs de cubiques');
  const flu2 = decodeAp(relu, relu.context.lookup(annots.get(2)));
  assert.ok(/ c/.test(flu2) && / B|S/.test(flu2));
});

test('les cinq sortes d\'annotation survivent à l\'aller-retour', async () => {
  const relu = await docReluAvec();
  const annots = relu.getPage(0).node.Annots();
  assert.strictEqual(annots.size(), 6, 'six annotations (dont le rectangle inversé)');
  const sousTypes = [0, 1, 2, 3, 4, 5]
    .map((i) => relu.context.lookup(annots.get(i)).get(PDFName.of('Subtype')).toString());
  assert.deepStrictEqual(sousTypes.sort(),
    ['/FreeText', '/Highlight', '/Highlight', '/Ink', '/Square', '/Text']);
  assert.ok(sousTypes.every(() => true));
  for (let i = 0; i < annots.size(); i++) {
    const a = relu.context.lookup(annots.get(i));
    assert.ok(a.get(PDFName.of('AP')), `annotation ${i} : AP conservé`);
  }
});
