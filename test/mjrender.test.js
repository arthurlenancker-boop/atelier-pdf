// Tâche 5 : rendu LaTeX -> opérateurs PDF.
'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { mjRender, MjrenderError } = require('../engine/mjrender.js');

test('la formule quadratique se rend aux dimensions du prototype', () => {
  const r = mjRender('x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}', 4.5);
  assert.ok(r.widthPt > 40 && r.widthPt < 120, `largeur en points plausible : ${r.widthPt}`);
  assert.ok(r.heightPt > 10 && r.heightPt < 30, `hauteur en points plausible : ${r.heightPt}`);
  assert.ok(r.depthPt > 0, 'la racine descend sous la ligne de base');
  assert.ok(/\bc\b/.test(r.ops), 'le rendu emploie des courbes');
  assert.ok(r.ops.startsWith('0 0 0 rg'), 'noir par défaut');

  // Tous les points restent dans [0..widthPt] x [0..heightPt] (arrondi près).
  const marge = 0.05;
  for (const ligne of r.ops.split('\n').slice(1)) {
    const t = ligne.trim().split(/\s+/);
    for (const v of t.slice(0, -1)) {
      const n = Number(v);
      if (Number.isFinite(n)) {
        assert.ok(n >= -marge && n <= Math.max(r.widthPt, r.heightPt) + marge,
          `point hors cadre : ${v}`);
      }
    }
  }
});

test('vecteurs, intégrale et matrice se rendent', () => {
  const r = mjRender('\\vec{v} + \\int_{0}^{1} x\\,dx + \\matrix{a & b \\\\ c & d}', 4.5);
  assert.ok(r.ops.length > 400, 'nombreux opérateurs');
  // \vec+\int seul fait ~49pt ; la matrice doit l'élargir au-delà (mesuré : 80pt).
  assert.ok(r.widthPt > 60, `largeur composite : ${r.widthPt}`);
  const suite = mjRender('S_n = \\sum_{k=1}^{n} k + \\prod_{i=1}^{n} i', 4.5);
  assert.ok(suite.ops.length > 200, 'grands opérateurs rendus');
});

test('un LaTeX invalide lève une erreur explicite, pas un rendu silencieux', () => {
  // MathJax ne lève pas : il rend une erreur rouge avec data-mjx-error.
  assert.throws(
    () => mjRender('\\cetteCommandeNExistePasDuTout', 4.5),
    (err) => {
      assert.ok(err instanceof MjrenderError);
      assert.match(err.message, /mise en forme/);
      return true;
    },
  );
});

test('la couleur personnalisée ouvre le flux', () => {
  const r = mjRender('E = mc^2', 4.5, { rgb: [1, 0, 0] });
  assert.ok(r.ops.startsWith('1 0 0 rg'), 'rouge en tête de flux');
  const b = mjRender('a_2', 9);
  assert.ok(b.widthPt > r.widthPt / 2, 'la taille suit exPt');
});
