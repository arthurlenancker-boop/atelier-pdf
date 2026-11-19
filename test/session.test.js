'use strict';

// Tâche 9 : moteur de session — réceptacle pur des demandes d'édition du processus de rendu.

const test = require('node:test');
const assert = require('node:assert');

const { createSession } = require('../engine/session.js');
const { openPdf, savePdf } = require('../engine/pdfio.js');
const { PDFDocument } = require('pdf-lib');

async function creerDocumentNeuf() {
  const doc = await openPdf(await savePdf(await PDFDocument.create()));
  return doc;
}

test('la session applique les six sortes d\'édition et liste six annotations', async () => {
  const doc = await creerDocumentNeuf();
  const session = createSession(doc);

  session.apply({
    kind: 'highlight',
    pageIndex: 0,
    args: { rect: [98, 698, 202, 722], quadPoints: [[100, 720, 200, 720, 100, 700, 200, 700]], contents: 'Termes à retenir' },
  });
  session.apply({ kind: 'square', pageIndex: 0, args: { rect: [60, 600, 200, 640] } });
  session.apply({ kind: 'ink', pageIndex: 0, args: { points: [[60, 500], [100, 520], [140, 480]] } });
  session.apply({ kind: 'textNote', pageIndex: 0, args: { rect: [400, 750, 418, 768], contents: 'Vérifier le discriminant.' } });
  session.apply({ kind: 'freeText', pageIndex: 0, args: { rect: [60, 300, 340, 325], text: 'Méthode : identifier a, b, c.' } });
  session.apply({ kind: 'equation', pageIndex: 0, args: { latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', x: 300, y: 200 } });

  const annots = session.listAnnots();
  assert.strictEqual(annots.length, 6, `6 annotations attendues, obtenu ${annots.length}`);
  assert.deepStrictEqual(annots.map((a) => a.subtype).sort(),
    ['FreeText', 'Highlight', 'Ink', 'Square', 'Square', 'Text']);

  // L'ordre des modifications est conservé pour l'état « modifié ».
  const journal = session.edits();
  assert.strictEqual(journal.length, 6);
  assert.deepStrictEqual(journal.map((e) => e.kind),
    ['highlight', 'square', 'ink', 'textNote', 'freeText', 'equation']);
});

test('la session survit à un cycle enregistrer puis rouvrir', async () => {
  const doc = await creerDocumentNeuf();
  const session = createSession(doc);
  session.apply({ kind: 'square', pageIndex: 0, args: { rect: [10, 10, 100, 60] } });
  session.apply({ kind: 'equation', pageIndex: 0, args: { latex: 'E = mc^2', x: 200, y: 400 } });

  const octets = await savePdf(doc);
  const relu = await openPdf(octets);
  const sessionRelue = createSession(relu);
  const annots = sessionRelue.listAnnots();
  assert.strictEqual(annots.length, 2, `2 annotations attendues après relecture, obtenu ${annots.length}`);
  assert.ok(annots.every((a) => a.hasAP), 'chaque annotation relue garde son apparence');
});

test('une sorte d\'édition inconnue est refusée avec un message explicite', async () => {
  const doc = await creerDocumentNeuf();
  const session = createSession(doc);
  assert.throws(
    () => session.apply({ kind: 'tampon rouge', args: {} }),
    (err) => err instanceof Error && /tampon rouge/.test(err.message),
  );
  assert.strictEqual(session.edits().length, 0, 'aucune modification enregistrée');
});

test('la session supprime une annotation précise, à la demande et via apply', async () => {
  const doc = await creerDocumentNeuf();
  const session = createSession(doc);
  session.apply({ kind: 'square', pageIndex: 0, args: { rect: [10, 10, 100, 60] } });
  session.apply({ kind: 'square', pageIndex: 0, args: { rect: [10, 100, 100, 160] } });
  const annots = session.listAnnots();
  assert.strictEqual(annots.length, 2);

  // Suppression directe par référence issue de listAnnots.
  session.remove(0, annots[0].ref);
  assert.strictEqual(session.listAnnots().length, 1);

  // Puis via une commande d'édition (le canal IPC).
  const restante = session.listAnnots()[0];
  session.apply({ kind: 'remove', pageIndex: 0, args: { ref: restante.ref } });
  assert.strictEqual(session.listAnnots().length, 0);

  // La suppression persiste après enregistrer puis rouvrir.
  const relu = await openPdf(await savePdf(doc));
  assert.strictEqual(createSession(relu).listAnnots().length, 0);
});

test('la session refuse une suppression introuvable sans rien casser', async () => {
  const doc = await creerDocumentNeuf();
  const session = createSession(doc);
  session.apply({ kind: 'square', pageIndex: 0, args: { rect: [10, 10, 100, 60] } });
  const refInconnu = doc.context.nextRef();
  assert.throws(
    () => session.remove(0, refInconnu),
    (err) => err instanceof Error && /introuvable|aucune annotation/i.test(err.message),
  );
  assert.strictEqual(session.listAnnots().length, 1, 'l\'annotation existante est intacte');
});

test('la suppression accepte une référence sérialisée venue du rendu (IPC)', async () => {
  const doc = await creerDocumentNeuf();
  const session = createSession(doc);
  session.apply({ kind: 'square', pageIndex: 0, args: { rect: [10, 10, 100, 60] } });
  const [annot] = session.listAnnots();
  const serialisee = { objectNumber: annot.ref.objectNumber, generationNumber: annot.ref.generationNumber };
  session.apply({ kind: 'remove', pageIndex: 0, args: { ref: serialisee } });
  assert.strictEqual(session.listAnnots().length, 0);
});
