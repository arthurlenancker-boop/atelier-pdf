// test/ocr-math.test.js — fonctions PURES du moteur OCR (21 nov. 2026).
// Testable en LOCAL, sans node_modules : aplatissement des blocs tesseract.js,
// nettoyage WinAnsi, mathématique de pose (taille, ligne de base).
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { versWinAnsi, lignesOCR, calculerLigne } = require('../engine/ocr.js');

test('lignesOCR : aplatit blocks → lignes de mots, défensivement', () => {
  const blocks = [
    {
      paragraphs: [
        {
          lines: [
            {
              bbox: { x0: 10, y0: 20, x1: 400, y1: 50 },
              words: [
                { text: 'Le ', bbox: { x0: 10, y0: 20, x1: 80, y1: 50 } },
                { text: 'développement', bbox: { x0: 90, y0: 20, x1: 400, y1: 50 } },
                { text: '   ', bbox: { x0: 410, y0: 20, x1: 420, y1: 50 } }, // écarté : blanc
              ],
            },
          ],
        },
        { lines: [{}] }, // ligne sans mot : ignorée sans exception
      ],
    },
    { paragraphs: [] },
    null,
  ];
  const lignes = lignesOCR(blocks);
  assert.strictEqual(lignes.length, 1);
  assert.strictEqual(lignes[0].mots.length, 2);
  assert.strictEqual(lignes[0].mots[1].texte, 'développement');
  assert.deepStrictEqual(lignes[0].bbox, { x0: 10, y0: 20, x1: 400, y1: 50 });
  assert.deepStrictEqual(lignesOCR(null), []);
  assert.deepStrictEqual(lignesOCR([{ paragraphs: [{ lines: [] }] }]), []);
});

test('lignesOCR : bbox de ligne reconstruite quand absente', () => {
  const blocks = [{
    paragraphs: [{
      lines: [{
        words: [
          { text: 'a', bbox: { x0: 5, y0: 100, x1: 15, y1: 120 } },
          { text: 'b', bbox: { x0: 20, y0: 105, x1: 30, y1: 125 } },
        ],
      }],
    }],
  }];
  const [ligne] = lignesOCR(blocks);
  assert.deepStrictEqual(ligne.bbox, { x0: 5, y0: 100, x1: 30, y1: 125 });
});

test('versWinAnsi : garde les accents français, écarte l\'inutile', () => {
  assert.strictEqual(versWinAnsi('déjà l\u2019été'), "déjà l'été");
  assert.strictEqual(versWinAnsi('cœur € imprimé'), 'cœur € imprimé');
  assert.strictEqual(versWinAnsi('a\u0000b\u007Fc'), 'abc');
  assert.strictEqual(versWinAnsi('x\uFB01ns'), 'xfins');
  assert.strictEqual(versWinAnsi('∑ calculus'), ' calculus'); // ∑ : hors WinAnsi, écarté
  assert.strictEqual(versWinAnsi('Sławomir Žižek'), 'Sawomir Žižek'); // Ž/ž WinAnsi gardés
});

test('calculerLigne : taille et ligne de base cohérentes en points', () => {
  // A4 300 dpi : 2480 × 3508 px → échelles 595.28/2480 et 841.89/3508.
  const echY = 841.89 / 3508;
  const hPt = 841.89;
  // Ligne de texte 14 pt : encre d'environ 13.2 pt, bas d'encre à y1.
  const encrePx = 13.2 / echY; // ≈ 55 px
  // Ligne dont le bas (baseline + descente) est à 144.9 pt du haut :
  // 700 pt de ligne de base pytest. baseline visée ≈ 698.
  const y1Px = 144.9 / echY;
  const { taille, yBase } = calculerLigne({ x0: 0, y0: y1Px - encrePx, x1: 500, y1: y1Px }, echY, hPt);
  assert.ok(Math.abs(taille - 13.9) < 0.6, `taille proche de 14 (reçue ${taille.toFixed(2)})`);
  assert.ok(yBase > 694 && yBase < 703, `ligne de base proche de 698 (reçue ${yBase.toFixed(1)})`);
  // Bornes : encre minuscule → taille écrêtée à 4 ; encre énorme → 42.
  assert.strictEqual(calculerLigne({ x0: 0, y0: 0, x1: 1, y1: 1 }, echY, hPt).taille, 4);
  assert.strictEqual(calculerLigne({ x0: 0, y0: 0, x1: 1, y1: 4000 }, echY, hPt).taille, 42);
});
