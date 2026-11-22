// v0.1.35 : sélection des surlignages d'une page (engine/surlignage.js).
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { SORTES_SURLIGNAGE, estSurlignage, selectionSurlignagesPage }
  = require('../engine/surlignage.js');

test('estSurlignage reconnaît les quatre formes, rien d\'autre', () => {
  assert.deepStrictEqual(SORTES_SURLIGNAGE,
    ['Highlight', 'Underline', 'Squiggly', 'StrikeOut']);
  for (const s of SORTES_SURLIGNAGE) {
    assert.strictEqual(estSurlignage({ subtype: s }), true, s);
  }
  for (const s of ['Square', 'Circle', 'Ink', 'Text', 'FreeText', 'Link', 'Widget', '']) {
    assert.strictEqual(estSurlignage({ subtype: s }), false, s);
  }
  assert.strictEqual(estSurlignage(null), false);
  assert.strictEqual(estSurlignage(undefined), false);
  assert.strictEqual(estSurlignage({}), false);
});

test('selectionSurlignagesPage filtre par page et par forme', () => {
  const annots = [
    { page: 0, subtype: 'Highlight', ref: { objectNumber: 1, generationNumber: 0 } },
    { page: 1, subtype: 'Highlight', ref: { objectNumber: 2, generationNumber: 0 } },
    { page: 1, subtype: 'StrikeOut', ref: { objectNumber: 3, generationNumber: 0 } },
    { page: 1, subtype: 'Square', ref: { objectNumber: 4, generationNumber: 0 } },
    { page: 2, subtype: 'Squiggly', ref: { objectNumber: 5, generationNumber: 0 } },
    { page: 3, subtype: 'Underline', ref: { objectNumber: 6, generationNumber: 0 } },
    { page: 1, subtype: '', ref: null },
  ];
  const page1 = selectionSurlignagesPage(annots, 1);
  assert.deepStrictEqual(page1.map((a) => a.ref.objectNumber), [2, 3]);
  assert.deepStrictEqual(
    selectionSurlignagesPage(annots, 0).map((a) => a.ref.objectNumber), [1]);
  assert.deepStrictEqual(
    selectionSurlignagesPage(annots, 2).map((a) => a.ref.objectNumber), [5]);
  assert.deepStrictEqual(selectionSurlignagesPage(annots, 9), [],
    'une page sans surlignage donne une liste vide');
});

test('selectionSurlignagesPage tolère un résumé absent ou vide', () => {
  assert.deepStrictEqual(selectionSurlignagesPage(null, 0), []);
  assert.deepStrictEqual(selectionSurlignagesPage(undefined, 0), []);
  assert.deepStrictEqual(selectionSurlignagesPage([], 0), []);
  assert.deepStrictEqual(selectionSurlignagesPage(annotsBrouilles(), 0), [],
    'des entrées sans page ni type ne lèvent jamais');
});

function annotsBrouilles() {
  return [null, {}, { subtype: 'Highlight' }, { page: 0 },
    { page: 0, subtype: 42 }, 'pas une annotation'];
}

test('selectionSurlignagesPage garde l\'ordre de lecture du résumé', () => {
  const annots = [
    { page: 0, subtype: 'Squiggly', ref: { objectNumber: 10 } },
    { page: 0, subtype: 'Highlight', ref: { objectNumber: 11 } },
    { page: 0, subtype: 'Underline', ref: { objectNumber: 12 } },
  ];
  assert.deepStrictEqual(
    selectionSurlignagesPage(annots, 0).map((a) => a.subtype),
    ['Squiggly', 'Highlight', 'Underline']);
});
