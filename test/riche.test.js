// v0.1.31 : la note riche « texte mis en forme + formules » — pose, relecture
// et redimensionnement dans un vrai PDF.
// CI SEULEMENT : exige pdf-lib et mathjax-full (jamais installés localement).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { PDFDocument, PDFName } = require('pdf-lib');

const { addNoteRiche } = require('../engine/riche.js');
const { redimensionnerAnnot } = require('../engine/bouger.js');
const {
  extraireSourceNoteRiche, extraireTailleNoteRiche, PREFIXE_NOTE_RICHE,
} = require('../engine/texte.js');

const SOURCE = '<div><b>Astuce :</b> <span style="color:#D13438">attention</span> '
  + 'si <u>AC</u> coupe <span style="color:#0067C0">$BC^2$</span> '
  + 'puis <span style="background-color:#FFDF3A">tout fond</span>.</div>';

/** Lecture directe d'une annotation posée (même miroir que bouger.test.js). */
function annotParRef(doc, ref) {
  const a = doc.context.lookup(ref);
  const lit = (cle) => doc.context.lookup(a.get(PDFName.of(cle)));
  const rect = [0, 1, 2, 3].map((i) => lit('Rect').get(i).asNumber());
  const ap = doc.context.lookup(a.get(PDFName.of('AP')));
  const form = doc.context.lookup(ap.get(PDFName.of('N')));
  const bbox = doc.context.lookup(form.dict.get(PDFName.of('BBox')));
  return {
    annot: a,
    rect,
    bbox: [0, 1, 2, 3].map((i) => bbox.get(i).asNumber()),
    flux: Buffer.from(form.contents).toString('latin1'),
    texte: () => lit('Contents').decodeText(),
    subtype: () => lit('Subtype').toString(),
    subject: () => (lit('Subject') ? lit('Subject').decodeText() : ''),
  };
}

test('addNoteRiche : gras, couleurs, soulignement et formule dans l’apparence', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const rep = await addNoteRiche(doc, page, {
    rect: [100, 700, 420, 760], source: SOURCE, fontSize: 11,
  });
  assert.ok(rep.ref, 'une référence est retournée');
  assert.deepStrictEqual(rep.rect[0], 100, 'rectangle réalisé : bord gauche fixé');

  const a = annotParRef(doc, rep.ref);
  assert.strictEqual(a.subtype(), '/FreeText');
  // Le marqueur embarque la taille, la source suit, fidèle au caractère près.
  assert.ok(a.texte().startsWith(`${PREFIXE_NOTE_RICHE} 11 : `),
    'le marqueur « Note riche 11 : » ouvre le contenu');
  assert.strictEqual(extraireSourceNoteRiche(a.texte()), SOURCE, 'source relue fidèlement');
  assert.strictEqual(extraireTailleNoteRiche(a.texte()), 11, 'taille relue');
  assert.strictEqual(a.subject(), 'Note', 'sujet « Note » par défaut');

  // Apparence : gras (F2), texte dessiné (Tj), formule posée (Do),
  // couleur du span (#D13438 -> 0.82 0.2 0.22), soulignement en rectangle.
  assert.ok(a.flux.includes('/F2 '), 'le gras embarque Helvetica-Bold (F2)');
  assert.ok(/Tj/.test(a.flux), 'le texte est dessiné');
  assert.ok(/ Do/.test(a.flux), 'la formule est posée par XObject');
  assert.ok(a.flux.includes('0.82 0.2 0.22 rg'), 'couleur du span #D13438');
  assert.ok(/ re f/.test(a.flux), 'le soulignement remplit un rectangle');
  assert.ok(a.flux.includes('/Gf gs'), 'les fonds colorés passent par /Gf');
});

test('addNoteRiche : listes, exposant et taille enregistrée', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const src = '<ul><li>plan <sup>2</sup></li><li>profil</li></ul>';
  const { ref } = await addNoteRiche(doc, page, {
    rect: [100, 600, 320, 700], source: src, fontSize: 14, sujet: 'Fiche',
  });
  const a = annotParRef(doc, ref);
  assert.ok(a.texte().startsWith(`${PREFIXE_NOTE_RICHE} 14 : `), 'taille 14 embarquée');
  assert.strictEqual(a.subject(), 'Fiche', 'le sujet suit (fiche glissée en zone)');
  // L'exposant : taille réduite (14 x 0.62 = 8.68) et puce• encodée CP1252 (0x95).
  assert.ok(a.flux.includes('/F1 8.68 Tf'), 'exposant à 62 % du corps');
  assert.ok(a.flux.includes('<95> Tj'), 'puce• translittérée en 0x95');
  assert.ok(a.bbox[3] >= a.rect[1], 'BBox couvre le rectangle posé');
});

test('addNoteRiche : source vide refusée', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  await assert.rejects(
    () => addNoteRiche(doc, page, { rect: [10, 10, 100, 50], source: '  ' }),
    /vide/, 'le refus est explicite');
});

test('redimensionnerAnnot : note riche reposée avec sa source et sa couleur', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const pose = await addNoteRiche(doc, page, {
    rect: [100, 600, 300, 640], source: 'Un <i>peu</i> de $x$ tout de même.', fontSize: 11,
  });
  const rep = await redimensionnerAnnot(doc, page, {
    ref: pose.ref, rect: [100, 550, 400, 650],
  });
  assert.notStrictEqual(rep.ref.objectNumber, pose.ref.objectNumber,
    'la note reposée est une NOUVELLE annotation');
  assert.strictEqual(rep.rect[0], 100, 'rectangle demandé respecté');
  const a = annotParRef(doc, rep.ref);
  assert.strictEqual(a.subtype(), '/FreeText');
  assert.ok(a.texte().includes(' tout de même.'), 'source conservée au reposage');
  assert.ok(/Tj/.test(a.flux), 'le texte est redessiné');
  assert.ok(/ Do/.test(a.flux), 'la formule est reposée');
  // L'ancienne annotation a quitté la page : une seule note riche demeure.
  let vues = 0;
  const annots = page.node.Annots();
  for (let i = 0; i < annots.size(); i += 1) {
    const d = doc.context.lookup(annots.get(i));
    const s = doc.context.lookup(d.get(PDFName.of('Subtype')));
    if (String(s) === '/FreeText') vues += 1;
  }
  assert.strictEqual(vues, 1, 'l’ancienne note a été retirée de la page');
});

/* v0.1.44 : les « données nécessaires » des équations à la frappe — la
 * COULEUR. La formule composée dans un run coloré est rendue DANS cette
 * couleur (l'XObject porte l'en-tête « r g b rg » du span) ; la fonte
 * des mathématiques reste TeX/MathJax (Cambria Math non embarquable,
 * consigné v0.1.27). Ici le run ne contient QUE la formule : l'opérateur
 * coloré ne peut venir que de l'équation. */
test("v0.1.44 : la formule d'un run coloré est écrite dans SA couleur", async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const pose = await addNoteRiche(doc, page, {
    rect: [100, 700, 400, 760],
    source: '<div>Le périmètre vaut <span style="color:#E13A6E">$2\\\\pi r$</span> et voilà.</div>',
    fontSize: 11,
    sujet: 'Note',
  });
  assert.ok(pose.ref, 'la note à formule colorée est posée');
  const octets = Buffer.from(await doc.save()).toString('latin1');
  assert.ok(octets.includes('0.88 0.23 0.43 rg'),
    'l\u2019XObject de la formule porte l\u2019encre du run (#E13A6E)');
  // Le texte hors run coloré reste l'encre grise du corps.
  assert.ok(octets.includes('0.08 0.09 0.1 rg'),
    'le texte ordinaire garde l\u2019encre grise');
});
