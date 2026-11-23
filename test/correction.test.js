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
  extraireFamilleCorrection, extraireGrasCorrection,
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
  assert.ok((a.contents || '').startsWith(`${PREFIXE_CORRECTION} 12 sans : `), 'le marqueur (taille + famille par défaut) voyage dans /Contents');
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

test('relecture du marqueur : famille et gras (v0.1.38), anciens formats relus', () => {
  assert.strictEqual(extraireFamilleCorrection('Correction OCR 12 serif gras : Un titre'), 'serif');
  assert.strictEqual(extraireGrasCorrection('Correction OCR 12 serif gras : Un titre'), true);
  assert.strictEqual(extraireFamilleCorrection('Correction OCR 12 sans : du texte courant'), 'sans');
  assert.strictEqual(extraireGrasCorrection('Correction OCR 12 sans : du texte courant'), false);
  // Anciens marqueurs (v0.1.29 à v0.1.37) : sans famille ni gras.
  assert.strictEqual(extraireFamilleCorrection('Correction OCR 11 : ancien'), null,
    'l\'ancien marqueur ne porte pas de famille (le rendu repliera sur sans)');
  assert.strictEqual(extraireGrasCorrection('Correction OCR 11 : ancien'), false);
  assert.strictEqual(extraireSourceCorrection('Correction OCR 12 serif gras : a $b$ c'), 'a $b$ c',
    'la source reste lue derrière les nouveaux termes du marqueur');
});

test('addCorrection : la correction SERIF prend la police Times du document (v0.1.38)', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const rep = await addCorrection(doc, page, {
    rect: [80, 700, 420, 722],
    source: 'Un titre en empattements',
    fontSize: 14,
    famille: 'serif',
    gras: true,
  });
  assert.ok(rep.ref, 'la correction serif est posée');
  const a = listAnnots(doc)[0];
  assert.ok((a.contents || '').startsWith(`${PREFIXE_CORRECTION} 14 serif gras : `),
    'la famille et le gras voyagent dans le marqueur');
  assert.strictEqual(extraireFamilleCorrection(a.contents), 'serif');
  assert.strictEqual(extraireGrasCorrection(a.contents), true);
  const octets = Buffer.from(await doc.save()).toString('latin1');
  assert.ok(octets.includes('/F1 14 Tf'), 'l\'apparence écrit à la taille du texte remplacé');
  // La police de la ressource est la RÉFÉRENCE de la police embarquée (elle
  // n\'entre au contexte qu\'à l\'enregistrement) : résolue, c\'est bien
  // /Times-Bold — le fichier porte Times, pas Helvetica.
  const { PDFName: PN } = require('pdf-lib');
  const ctx = doc.context;
  const annot = ctx.lookup(rep.ref);
  const ap = ctx.lookup(annot.get(PN.of('AP')));
  const forme = ctx.lookup(ap.get(PN.of('N')));
  const res = ctx.lookup(forme.dict.get(PN.of('Resources')));
  const fRef = res.get(PN.of('Font')).get(PN.of('F1'));
  const fDict = ctx.lookup(fRef);
  assert.strictEqual(String(ctx.lookup(fDict.get(PN.of('BaseFont')))), '/Times-Bold',
    'la ressource /F1 désigne la police Times grasse');
});

test('addCorrection : sans famille passée, le marqueur dit « sans » (Helvetica)', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  await addCorrection(doc, page, { rect: [80, 700, 420, 722], source: 'Texte sans empattements', fontSize: 11 });
  const a = listAnnots(doc)[0];
  assert.ok((a.contents || '').startsWith(`${PREFIXE_CORRECTION} 11 sans : `),
    'sans famille passée, le marqueur dit « sans » (Helvetica)');
});

test('addCorrection : une formule NON rendable ne fait plus échouer la pose (v0.1.38)', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const source = 'Résous $\\MacroInconnuePourPersonne{x}{y}$ puis conclus.';
  const rep = await addCorrection(doc, page, { rect: [80, 600, 420, 640], source, fontSize: 11 });
  assert.ok(rep.ref, 'la correction est posée malgré la formule non rendable');
  const a = listAnnots(doc)[0];
  assert.strictEqual(extraireSourceCorrection(a.contents), source,
    'la source (formule blessée comprise) est relue exactement');
  const octets = Buffer.from(await doc.save()).toString('latin1');
  assert.ok(octets.includes('1 1 1 rg'), 'le masque blanc est écrit');
  assert.ok(/\/F1 11 Tf/.test(octets), 'le texte de repli s\'écrit avec la police du bloc');
});

test('addCorrection : le redimensionnement REPOSE la correction dans sa famille (v0.1.38)', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const { redimensionnerAnnot } = require('../engine/bouger.js');
  const rep = await addCorrection(doc, page, {
    rect: [80, 700, 420, 722], source: 'Titre serif', fontSize: 14, famille: 'serif', gras: true,
  });
  const repose = await redimensionnerAnnot(doc, page, { ref: rep.ref, rect: [80, 700, 460, 722] });
  const a = listAnnots(doc)[0];
  assert.ok((a.contents || '').startsWith(`${PREFIXE_CORRECTION} 14 serif gras : `),
    'la correction reposée garde SA famille et SON gras');
  assert.strictEqual(Math.round(repose.rect[2]), 460, 'le rectangle visé est tenu');
});
