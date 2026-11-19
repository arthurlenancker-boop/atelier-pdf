// Tâche 11 : scénario aller-retour complet, de l'ouverture à la copie horodatée.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { openPdf, savePdf, timestampedPath } = require('../engine/pdfio.js');
const { listAnnots } = require('../engine/reread.js');
const { createSession } = require('../engine/session.js');
const { deviceToPdf } = require('../engine/coords.js');
const { PDFDocument, degrees } = require('pdf-lib');

function dossiersLibres() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'atelier-roundtrip-'));
}

test('aller-retour : annoter deux pages (dont une tournée), sauvegarder, relire', async () => {
  // 1. Un document source de deux pages, la seconde tournée de 90°.
  const source = await PDFDocument.create();
  source.addPage([595.28, 841.89]);
  const p2 = source.addPage([595.28, 841.89]);
  p2.setRotation(degrees(90));
  const tmp = dossiersLibres();
  const sourcePath = path.join(tmp, 'source.pdf');
  fs.writeFileSync(sourcePath, Buffer.from(await source.save()));

  // 2. Ouverture et annotation via la session (flux du produit réel).
  //    Page 1 recto, page 2 tournée de 90°.
  const doc = await openPdf(fs.readFileSync(sourcePath));
  const s = createSession(doc);

  s.apply({ kind: 'highlight', pageIndex: 0, args: {
    rect: [58, 712, 486, 730],
    quadPoints: [[60, 728, 484, 728, 60, 714, 484, 714]],
  } });
  s.apply({ kind: 'square', pageIndex: 0, args: { rect: [52, 620, 300, 690] } });
  s.apply({ kind: 'ink', pageIndex: 0, args: {
    points: [[80, 600], [120, 560], [160, 590]],
  } });
  s.apply({ kind: 'textNote', pageIndex: 0, args: {
    rect: [500, 770, 518, 788],
    contents: 'Relire le paragraphe 2.',
  } });
  s.apply({ kind: 'freeText', pageIndex: 0, args: {
    rect: [58, 500, 258, 530],
    contents: 'Méthode : substitution.',
  } });
  s.apply({ kind: 'equation', pageIndex: 1, args: {
    latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
    x: 100, y: 400,
  } });

  // Un clic écran sur la page tournée doit retomber au bon endroit (rot 90) :
  // la page tournée affiche la hauteur du document comme largeur du canvas.
  const cible = deviceToPdf(118, 20, { scale: 1, rotation: 90, pageW: 595.28, pageH: 841.89 });
  assert.ok(Math.abs(cible.x - 20) < 0.01, `cible.x = ${cible.x}, 20 attendu`);
  assert.ok(Math.abs(cible.y - 118) < 0.01, `cible.y = ${cible.y}, 118 attendu`);

  assert.strictEqual(s.edits().length, 6, 'six modifications journalisées');
  assert.strictEqual(s.listAnnots().length, 6, 'six annotations en place');

  // 3. Sauvegarde en copie horodatée (jamais d'écrasement du fichier source).
  const now = new Date(2026, 10, 19, 14, 30, 7);
  const outPath = timestampedPath(tmp, 'source', now);
  assert.ok(outPath.endsWith(`${path.sep}source-2026-11-19-143007.pdf`),
    `chemin horodaté : ${outPath}`);
  fs.writeFileSync(outPath, Buffer.from(await savePdf(doc)));
  assert.ok(fs.existsSync(outPath), 'la copie horodatée existe');
  assert.ok(fs.readFileSync(sourcePath).length > 0, 'le fichier source est intact');

  // 4. Relecture : la copie porte les six annotations, aux coordonnées attendues.
  const annots = listAnnots(await openPdf(fs.readFileSync(outPath)));
  assert.strictEqual(annots.length, 6);
  assert.deepStrictEqual(
    annots.map((a) => a.subtype).sort(),
    ['FreeText', 'Highlight', 'Ink', 'Square', 'Square', 'Text'],
  );
  const equation = annots.find((a) => (a.contents || '').includes('Équation LaTeX'));
  assert.strictEqual(equation.page, 1, 'l\'équation est sur la page tournée');
  assert.ok(equation.hasAP, 'l\'équation porte son apparence vectorielle');
  const surlignage = annots.find((a) => a.subtype === 'Highlight');
  // Le rectangle du surlignage est posé en points PDF : son centre correspond au
  // texte visé, 272 points (marge rect 58..486).
  const centreX = (surlignage.rect[0] + surlignage.rect[2]) / 2;
  assert.ok(Math.abs(centreX - 272) < 1, `centre x : ${centreX}`);

  // 5. Nettoyage.
  fs.rmSync(tmp, { recursive: true, force: true });
});
