// v0.1.12 : déplacer et redimensionner — pose et relecture dans un vrai PDF.
// CI SEULEMENT : exige pdf-lib et mathjax-full (jamais installés localement).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { PDFDocument, PDFName, PDFString } = require('pdf-lib');

const { addHighlight, addSquare, addInk, addTextNote, addFreeText } = require('../engine/annots.js');
const { addEquation } = require('../engine/equation.js');
const { addMixedFiche } = require('../engine/melange.js');
const { deplacerAnnot, redimensionnerAnnot } = require('../engine/bouger.js');
const { addNoteRiche } = require('../engine/riche.js'); // v0.1.33
const { extraireSourceFiche, extraireTailleFiche } = require('../engine/texte.js');
const { createSession } = require('../engine/session.js');
const { listAnnots } = require('../engine/reread.js');

async function neuf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  return { doc, page };
}

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
    contenu: lit('Contents'),
    quads: () => {
      const q = lit('QuadPoints');
      const sortie = [];
      for (let i = 0; i < q.size(); i += 1) sortie.push(q.get(i).asNumber());
      return sortie;
    },
    inkList: () => {
      const listes = lit('InkList');
      const chemin = doc.context.lookup(listes.get(0));
      const sortie = [];
      for (let i = 0; i < chemin.size(); i += 1) sortie.push(chemin.get(i).asNumber());
      return sortie;
    },
    bbox: [0, 1, 2, 3].map((i) => doc.context.lookup(bbox.get(i)) && bbox.get(i).asNumber()),
    flux: Buffer.from(form.contents).toString('latin1'),
    texte: () => lit('Contents').decodeText(),
  };
}

test('deplacerAnnot : surlignage — Rect, QuadPoints et apparence suivent', async () => {
  const { doc, page } = await neuf();
  const ref = addHighlight(doc, page, {
    rect: [10, 700, 100, 720],
    quadPoints: [[10, 700, 100, 700, 10, 690, 100, 690]],
  });
  deplacerAnnot(doc, page, { ref, dx: 10, dy: -5 });
  const a = annotParRef(doc, ref);
  assert.deepStrictEqual(a.rect, [20, 695, 110, 715]);
  assert.deepStrictEqual(a.quads(), [20, 695, 110, 695, 20, 685, 110, 685]);
  assert.deepStrictEqual(a.bbox, [20, 695, 110, 715]);
  assert.ok(a.flux.includes('20 695 m'), 'le flux peint le quad déplacé');
});

test('deplacerAnnot : cadre, trait, note et fiche — flux translaté', async () => {
  const { doc, page } = await neuf();
  const refCadre = addSquare(doc, page, { rect: [50, 600, 150, 650] });
  const refTrait = addInk(doc, page, { points: [[100, 500], [130, 520], [160, 480]] });
  const refNote = addTextNote(doc, page, { rect: [300, 700, 318, 718], contents: 'Bonjour' });
  const refFiche = addFreeText(doc, page, { rect: [100, 400, 300, 430], text: 'Fiche texte' });

  deplacerAnnot(doc, page, { ref: refCadre, dx: 10, dy: -5 });
  const cadre = annotParRef(doc, refCadre);
  assert.deepStrictEqual(cadre.rect, [60, 595, 160, 645]);
  assert.ok(cadre.flux.includes('60 595 100 50 re S'), 'le rectangle du cadre est décalé');

  deplacerAnnot(doc, page, { ref: refTrait, dx: 5, dy: 5 });
  const trait = annotParRef(doc, refTrait);
  assert.deepStrictEqual(trait.rect, [105, 485, 165, 525]);
  assert.deepStrictEqual(trait.inkList(), [105, 505, 135, 525, 165, 485]);
  assert.ok(trait.flux.includes('105 505 m'));

  deplacerAnnot(doc, page, { ref: refNote, dx: 10, dy: -5 });
  const note = annotParRef(doc, refNote);
  assert.deepStrictEqual(note.rect, [310, 695, 328, 713]);
  assert.ok(note.flux.includes('310 695 18 18 re f'));

  deplacerAnnot(doc, page, { ref: refFiche, dx: 10, dy: 10 });
  const fiche = annotParRef(doc, refFiche);
  assert.deepStrictEqual(fiche.rect, [110, 410, 310, 440]);
  assert.ok(fiche.flux.includes('112 412 Td'), 'le texte du /FreeText est décalé');
  assert.strictEqual(fiche.texte(), 'Fiche texte');
});

test('deplacerAnnot : v0.1.31 — l’ellipse translate ses cubiques', async () => {
  const { doc, page } = await neuf();
  const ref = addSquare(doc, page, { rect: [50, 600, 150, 650], forme: 'ellipse', color: '#0067C0' });
  const avant = annotParRef(doc, ref);
  assert.ok(/ c/.test(avant.flux), 'l’ellipse trace des cubiques');
  deplacerAnnot(doc, page, { ref, dx: 10, dy: -5 });
  const apres = annotParRef(doc, ref);
  assert.deepStrictEqual(apres.rect, [60, 595, 160, 645]);
  // La première ligne cubique « x1 y1 x2 y2 x3 y3 c » (SEPT mots) décalée de (10, -5).
  const cubique = (flux) => flux.split('\n')
    .map((l) => l.trim())
    .find((l) => l.split(/\s+/).length === 7 && l.endsWith('c'));
  // v0.1.32 : `slice(0, 6)` AVANT `map(Number)` : la ligne trouvée porte
  // l'opcode « c » en septième mot, et `Number('c')` donne NaN, ce qui
  // faisait échouer l'assertion même moteur correct (piège de relance 1).
  const cAvant = cubique(avant.flux).split(/\s+/).slice(0, 6).map(Number);
  const cApres = cubique(apres.flux).split(/\s+/).slice(0, 6).map(Number);
  assert.ok(cAvant.every((v, k) => Math.abs((v + (k % 2 === 0 ? 10 : -5)) - cApres[k]) < 0.02),
    'chaque coordonnée de la cubique est translatée');
});

test('deplacerAnnot : équation — /Rect seul, apparence locale intacte', async () => {
  const { doc, page } = await neuf();
  const { ref } = addEquation(doc, page, { latex: 'x + 1', x: 100, y: 200, exPt: 4 });
  const avant = annotParRef(doc, ref);
  deplacerAnnot(doc, page, { ref, dx: 30, dy: 10 });
  const apres = annotParRef(doc, ref);
  assert.deepStrictEqual(apres.rect, [
    avant.rect[0] + 30, avant.rect[1] + 10, avant.rect[2] + 30, avant.rect[3] + 10,
  ]);
  assert.deepStrictEqual(apres.bbox, avant.bbox, 'BBox local inchangé');
  assert.strictEqual(apres.flux, avant.flux, 'flux local inchangé');
});

test('deplacerAnnot : fiche mixte — marqueur et formules préservés, AP translaté', async () => {
  const { doc, page } = await neuf();
  const { ref } = await addMixedFiche(doc, page, {
    rect: [100, 600, 360, 660], source: 'a $x$ b', fontSize: 11,
  });
  const avant = annotParRef(doc, ref);
  // Référence IPC sérialisée : {objectNumber, generationNumber}.
  const refSerie = { objectNumber: ref.objectNumber, generationNumber: ref.generationNumber };
  deplacerAnnot(doc, page, { ref: refSerie, dx: 20, dy: -10 });
  const apres = annotParRef(doc, ref);
  assert.deepStrictEqual(apres.rect, [
    avant.rect[0] + 20, avant.rect[1] - 10, avant.rect[2] + 20, avant.rect[3] - 10,
  ]);
  assert.deepStrictEqual(apres.bbox, [
    avant.bbox[0] + 20, avant.bbox[1] - 10, avant.bbox[2] + 20, avant.bbox[3] - 10,
  ]);
  assert.ok(apres.flux.includes(' cm'), 'les formules restent posées par translation');
  assert.strictEqual(apres.texte(), 'Fiche mixte 11 : a $x$ b', 'source intacte');
});

test('redimensionnerAnnot : cadre — reposé avec ses options derrière le marqueur', async () => {
  const { doc, page } = await neuf();
  const ref = addSquare(doc, page, { rect: [50, 600, 150, 650] });
  const rep = await redimensionnerAnnot(doc, page, { ref, rect: [50, 600, 220, 700] });
  // v0.1.31 : un cadre marqué se REPOSE (nouvelle annotation), l'ancien
  // quitte la page — le rectangle nu regexpénère toujours en « re S ».
  assert.notStrictEqual(rep.ref.objectNumber, ref.objectNumber,
    'le cadre redimensionné est une nouvelle annotation');
  assert.deepStrictEqual(rep.rect, [50, 600, 220, 700]);
  const a = annotParRef(doc, rep.ref);
  assert.deepStrictEqual(a.rect, [50, 600, 220, 700]);
  assert.ok(a.flux.includes('50 600 170 100 re S'));
  assert.deepStrictEqual(a.bbox, [50, 600, 220, 700]);
  assert.match(a.texte(), /^Cadre rect,continu,1,5$/,
    'les options de pose voyagent derrière le marqueur');
  assert.strictEqual(page.node.Annots().size(), 1, 'l’ancien cadre a été retiré de la page');
});

test('redimensionnerAnnot : cadre nuage teinté — la forme survit au reposage', async () => {
  const { doc, page } = await neuf();
  const ref = addSquare(doc, page, {
    rect: [50, 600, 150, 650], forme: 'nuage', trait: 'tirets',
    borderWidth: 2.2, teinte: true, color: '#0067C0',
  });
  const rep = await redimensionnerAnnot(doc, page, { ref, rect: [50, 600, 220, 700] });
  const a = annotParRef(doc, rep.ref);
  assert.match(a.texte(), /^Cadre nuage,tirets,2,2,teinte$/,
    'le marqueur conserve nuage, tirets, épaisseur et teinte');
  assert.ok(/ c/.test(a.flux), 'le nuage est retracé en cubiques');
  assert.ok(/G0 gs/.test(a.flux), 'la teinte est repeinte');
  const ic = doc.context.lookup(a.annot.get(PDFName.of('IC')));
  assert.ok(ic, 'le fond /IC est reposé');
});

test('redimensionnerAnnot : fiche /FreeText — texte et corps conservés', async () => {
  const { doc, page } = await neuf();
  const ref = addFreeText(doc, page, { rect: [100, 400, 300, 430], text: 'Une fiche', subject: 'Fiche' });
  const rep = await redimensionnerAnnot(doc, page, { ref, rect: [100, 380, 420, 430] });
  assert.deepStrictEqual(rep.rect, [100, 380, 420, 430]);
  const a = annotParRef(doc, ref);
  assert.strictEqual(a.texte(), 'Une fiche');
  assert.deepStrictEqual(a.bbox, [100, 380, 420, 430]);
  assert.ok(a.flux.includes('102 382 Td'));
});

test('redimensionnerAnnot : équation — /Rect seul, apparence locale intacte', async () => {
  const { doc, page } = await neuf();
  const { ref } = addEquation(doc, page, { latex: 'x + 1', x: 100, y: 200, exPt: 4 });
  const avant = annotParRef(doc, ref);
  const rep = await redimensionnerAnnot(doc, page, {
    ref, rect: [avant.rect[0], avant.rect[1], avant.rect[2] + 30, avant.rect[3] + 30],
  });
  assert.deepStrictEqual(rep.rect, [avant.rect[0], avant.rect[1], avant.rect[2] + 30, avant.rect[3] + 30]);
  const apres = annotParRef(doc, ref);
  assert.deepStrictEqual(apres.bbox, avant.bbox);
  assert.strictEqual(apres.flux, avant.flux);
});

test('redimensionnerAnnot : fiche mixte reposée, source et taille intactes', async () => {
  const { doc, page } = await neuf();
  const source = 'Large $\\frac{a}{b}$ fin';
  const { ref, rect } = await addMixedFiche(doc, page, {
    rect: [100, 600, 360, 660], source, fontSize: 11,
  });
  const rep = await redimensionnerAnnot(doc, page, { ref, rect: [100, 500, 460, 660] });
  assert.strictEqual(listAnnots(doc).length, 1, 'l\u2019ancienne fiche est retirée');
  const relu = listAnnots(doc)[0];
  assert.strictEqual(extraireSourceFiche(relu.contents), source, 'source relue identique');
  assert.strictEqual(extraireTailleFiche(relu.contents), 11, 'taille du corps conservée');
  assert.ok(rep.ref.objectNumber !== ref.objectNumber, 'posée comme une annotation neuve');
  assert.ok(relu.rect[2] - relu.rect[0] >= 360, 'la fiche élargie garde au moins la largeur');
  void rect;
});

test('redimensionnerAnnot : surlignage, trait et note refuse(nt)', async () => {
  const { doc, page } = await neuf();
  const refH = addHighlight(doc, page, { rect: [10, 700, 100, 720] });
  const refI = addInk(doc, page, { points: [[10, 10], [40, 40]] });
  const refN = addTextNote(doc, page, { rect: [300, 700, 318, 718], contents: 'x' });
  for (const ref of [refH, refI, refN]) {
    await assert.rejects(
      () => redimensionnerAnnot(doc, page, { ref, rect: [0, 0, 500, 500] }),
      /ne se redimensionne pas/,
    );
  }
  // L'absence de cible se rejette comme le reste (fonction asynchrone :
  // une promesse rejetée, jamais un lancer synchrone).
  await assert.rejects(
    () => redimensionnerAnnot(doc, page, { ref: null, rect: [0, 0, 10, 10] }),
    /Aucune annotation désignée/,
  );
});

test('session : deplacer et redimensionner passent par le journal', async () => {
  const { doc, page } = await neuf();
  const session = createSession(doc);
  session.apply({ kind: 'square', pageIndex: 0, args: { rect: [10, 10, 100, 60] } });
  const [annot] = session.listAnnots();

  const rep = session.apply({
    kind: 'deplacer', pageIndex: 0, args: { ref: annot.ref, dx: 5, dy: 5 },
  });
  assert.ok(rep.ref, 'déplacement confirmé par référence');
  assert.deepStrictEqual(session.listAnnots()[0].rect, [15, 15, 105, 65]);
  assert.strictEqual(session.edits().length, 2);

  await session.apply({
    kind: 'redimensionner', pageIndex: 0,
    args: { ref: annot.ref, rect: [15, 15, 205, 115] },
  });
  assert.deepStrictEqual(session.listAnnots()[0].rect, [15, 15, 205, 115]);
  assert.strictEqual(session.edits().length, 3, 'une seule entrée : la réussite seule est journalisée');

  assert.throws(() => session.apply({
    kind: 'deplacer', pageIndex: 0,
    args: { ref: { objectNumber: 99999, generationNumber: 0 }, dx: 1, dy: 1 },
  }), /introuvable/);
  assert.strictEqual(session.edits().length, 3, 'un échec n\u2019entre pas au journal');
  void page;
});

// v0.1.33 : repose sûre — un contenu corrompu ne doit JAMAIS faire perdre
// l'annotation : la source se valide avant le retrait, la note reste.
test('redimensionnerAnnot : v0.1.33 — source corrompue = refus sans perte', async () => {
  const { doc, page } = await neuf();
  const { ref } = await addNoteRiche(doc, page, {
    rect: [20, 600, 220, 700], source: 'Corps de la note',
  });
  const annots = page.node.Annots();
  const tailleAvant = annots.size();
  // Corruption : le marqueur « Note riche 11 : » est là mais la source
  // embarquée a disparu (le cas repoussant la pose après le retrait).
  doc.context.lookup(ref).set(
    PDFName.of('Contents'), PDFString.of('Note riche 11 :'),
  );
  await assert.rejects(
    () => redimensionnerAnnot(doc, page, {
      ref: { objectNumber: ref.objectNumber, generationNumber: ref.generationNumber },
      rect: [20, 620, 240, 720],
    }),
    /illisible/,
    'le geste refuse poliment, AVANT tout retrait',
  );
  assert.strictEqual(annots.size(), tailleAvant,
    '/Annots garde exactement la même taille : aucune perte');
  let presente = false;
  for (let k = 0; k < annots.size(); k += 1) {
    if (annots.get(k).objectNumber === ref.objectNumber) presente = true;
  }
  assert.ok(presente, 'la référence de la note est toujours dans /Annots');
});
