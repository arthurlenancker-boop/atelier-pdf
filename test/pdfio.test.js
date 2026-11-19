// Tâche 2 : ouvertures, enregistrements, copies horodatées.
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { openPdf, savePdf, timestampedPath, PdfioError } = require('../engine/pdfio.js');
const { PDFDocument } = require('pdf-lib');

test('openPdf ouvre un PDF valide et savePdf l\'enregistre', async () => {
  const fabrique = await PDFDocument.create();
  fabrique.addPage([595.28, 841.89]);
  const octets = await savePdf(fabrique);

  const relu = await openPdf(octets); // un Uint8Array, comme à la lecture disque
  assert.strictEqual(relu.getPageCount(), 1);

  const encoreOctets = await savePdf(relu);
  assert.ok(encoreOctets.byteLength > 500, 'le PDF réenregistré a un contenu');
});

test('openPdf refuse un fichier corrompu avec une erreur française et sa cause', async () => {
  const poussiere = Buffer.from('ceci n\'est pas un pdf du tout');
  await assert.rejects(
    () => openPdf(poussiere),
    (err) => {
      assert.ok(err instanceof PdfioError, `PdfioError attendu, obtenu ${err.constructor.name}`);
      assert.match(err.message, /pas pu être lu comme un PDF/);
      assert.ok(err.cause, 'la cause d\'origine est conservée');
      return true;
    },
  );
});

test('timestampedPath produit <dossier>/<base>-AAAA-MM-JJ-HHmmss.pdf', () => {
  const chemin = timestampedPath('C:\\Users\\Arthur\\Documents', 'cours-essai',
    new Date('2026-11-19T14:32:10'));
  assert.strictEqual(chemin,
    'C:\\Users\\Arthur\\Documents\\cours-essai-2026-11-19-143210.pdf');
  // Sans date explicite : l\'horodatage est celui de l\'instant.
  assert.ok(/cours-\d{4}-\d{2}-\d{2}-\d{6}\.pdf$/.test(timestampedPath('/tmp', 'cours')));
});
