// Tâche 1 : fumée — les deux briques externes se chargent bien.
'use strict';

const test = require('node:test');
const assert = require('node:assert');

test('pdf-lib se charge et crée une page A4', async () => {
  const { PDFDocument } = require('pdf-lib');
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  assert.strictEqual(doc.getPageCount(), 1);
  assert.strictEqual(page.getWidth(), 595.28);
  assert.strictEqual(page.getHeight(), 841.89);
});

test('mathjax-full se charge en sortie SVG sur liteAdaptor', () => {
  const { mathjax } = require('mathjax-full/js/mathjax.js');
  const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
  const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
  const { TeX } = require('mathjax-full/js/input/tex.js');
  const { SVG } = require('mathjax-full/js/output/svg.js');
  require('mathjax-full/js/input/tex/base/BaseConfiguration.js');
  require('mathjax-full/js/input/tex/ams/AmsConfiguration.js');

  const adaptateur = liteAdaptor({ fontCache: 'local' });
  RegisterHTMLHandler(adaptateur);
  const doc = mathjax.document('', {
    InputJax: new TeX({ packages: ['base', 'ams'] }),
    OutputJax: new SVG({ fontCache: 'local' }),
  });
  const noeud = doc.convert('x^2');
  const svg = (noeud.children || []).find((n) => n.kind === 'svg');
  assert.ok(svg, 'le conteneur doit porter un <svg>');
  assert.ok(svg.attributes.viewBox, 'le <svg> doit avoir un viewBox');
});
